import { chmod, copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';

/**
 * Ablage der eigentlichen Dateien, adressiert über ihren SHA-256.
 * Dateien werden nie verändert, nur angelegt und (wenn kein Dokument
 * mehr darauf zeigt) gelöscht.
 */
export interface Dateispeicher {
  schreibe(sha256: string, inhalt: Buffer): Promise<void>;
  /**
   * Eine fertige Datei (Upload als Strom, #746) übernehmen: umbenennen statt neu schreiben. Die Datei ist danach weg
   * (übernommen oder, wenn der Inhalt schon da war, gelöscht). Fehlt die Methode, liest der Aufrufer die Datei und
   * schreibt sie.
   */
  uebernimm?(sha256: string, datei: string): Promise<void>;
  /** Fehlt die Datei, lehnt das Promise mit `DateiFehlt` ab (#877) – nie erst später als Ereignis am Strom. */
  lies(sha256: string): Promise<Readable | Buffer>;
  /** Liegt die Datei da? (#877: vor einem ZIP, dessen Kopf schon unterwegs wäre, und für die Werkbank.) */
  vorhanden?(sha256: string): Promise<boolean>;
  loesche(sha256: string): Promise<void>;
}

/**
 * Die Datei zu einem Dokument fehlt im Ablageordner (#877): Volume vergessen, Datei von Hand gelöscht, Platte defekt.
 * Nach außen nur ein Satz (404) – Prüfwert und Pfad stehen nur im Protokoll, nie in der Antwort.
 */
export class DateiFehlt extends Fachfehler {
  constructor(
    readonly sha256: string,
    name?: string,
  ) {
    super(404, name ? t('meldungen.dateispeicher.datei-fehlt-name', { name }) : t('meldungen.dateispeicher.datei-fehlt'));
  }
}

const log = protokoll.modul('dokumente');

/** Was beim ersten Fehlen einer Datei passiert (Protokoll mit Mappe, Hinweis in der Werkbank); setzt der Start. */
export type FehlendMelder = (f: { sha256: string; pfad: string; ablage: string }) => void;
let melder: FehlendMelder | null = null;
export function beiFehlenderDatei(f: FehlendMelder | null) {
  melder = f;
}
/** Je Prozess einmal je Datei melden – fragt jemand dieselbe Datei immer wieder ab, bleibt das Protokoll lesbar. */
const gemeldet = new Set<string>();
const GEMELDET_MAX = 10_000;
function meldeFehlend(sha256: string, pfad: string, ablage: string) {
  if (gemeldet.has(sha256)) return;
  if (gemeldet.size >= GEMELDET_MAX) gemeldet.clear();
  gemeldet.add(sha256);
  if (melder) {
    try {
      melder({ sha256, pfad, ablage });
      return;
    } catch {
      /* dann wenigstens die Zeile unten */
    }
  }
  log.error('Datei eines Dokuments fehlt im Ablageordner', { sha256, pfad, ablage });
}
/** Für Tests: wieder von vorn melden. */
export function vergissFehlendeDateien() {
  gemeldet.clear();
}

/**
 * Datei als Strom (#877): erst öffnen, dann lesen. Fehlt sie, lehnt das Promise ab (ENOENT) – mit `createReadStream`
 * kam das erst später als 'error'-Ereignis, und ohne Empfänger (der Aufrufer wartete noch auf die Datenbank) endete
 * der ganze Prozess. Der Strom hat außerdem immer einen Empfänger für Lesefehler: Wer ihn liest (for await,
 * pipeline, Fastify), bekommt den Fehler trotzdem; liest ihn niemand, steht er nur im Protokoll.
 */
export async function oeffneStrom(pfad: string, o: { start?: number; end?: number } = {}): Promise<Readable> {
  const h = await open(pfad, 'r');
  const s = h.createReadStream({ ...o, autoClose: true });
  s.on('error', (e) => log.warn('Datei: Lesefehler', { pfad, fehler: (e as Error).message }));
  return s;
}

const fehlt = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT';

const pruefeSha = (sha: string) => {
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error('Ungültiger Prüfwert');
  return sha;
};

/** Dateisystem: <wurzel>/<haushalt>/<ab>/<sha256> */
export function ordnerSpeicher(wurzel: string, haushaltId: string): Dateispeicher {
  const pfad = (sha: string) => join(wurzel, haushaltId, pruefeSha(sha).slice(0, 2), sha);
  return {
    async schreibe(sha, inhalt) {
      const ziel = pfad(sha);
      if (
        await stat(ziel).then(
          () => true,
          () => false,
        )
      )
        return; // gleicher Inhalt liegt schon da
      await mkdir(join(ziel, '..'), { recursive: true });
      const tmp = `${ziel}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, inhalt, { flag: 'wx' });
      await rename(tmp, ziel); // erst vollständig geschrieben, dann sichtbar
    },
    async uebernimm(sha, datei) {
      const ziel = pfad(sha);
      if (
        await stat(ziel).then(
          () => true,
          () => false,
        )
      ) {
        await rm(datei, { force: true });
        return;
      }
      await mkdir(join(ziel, '..'), { recursive: true });
      // Rechte wie bei writeFile (temporäre Uploads sind 0600).
      await chmod(datei, 0o644);
      try {
        await rename(datei, ziel);
      } catch (e) {
        // Anderes Laufwerk (eigenes Volume für files/hochladen): kopieren, dann wie oben erst vollständig sichtbar.
        if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
        const tmp = `${ziel}.${process.pid}.${Date.now()}.tmp`;
        await copyFile(datei, tmp);
        await rename(tmp, ziel);
        await rm(datei, { force: true });
      }
    },
    async lies(sha) {
      const p = pfad(sha);
      try {
        return await oeffneStrom(p);
      } catch (e) {
        if (!fehlt(e)) throw e;
        meldeFehlend(sha, p, haushaltId);
        throw new DateiFehlt(sha);
      }
    },
    async vorhanden(sha) {
      return stat(pfad(sha)).then(
        (x) => x.isFile(),
        () => false,
      );
    },
    async loesche(sha) {
      await rm(pfad(sha), { force: true });
    },
  };
}

export function speicherDateien(): Dateispeicher & { anzahl(): number } {
  const m = new Map<string, Buffer>();
  return {
    async schreibe(sha, inhalt) {
      m.set(pruefeSha(sha), Buffer.from(inhalt));
    },
    async uebernimm(sha, datei) {
      m.set(pruefeSha(sha), await readFile(datei));
      await rm(datei, { force: true });
    },
    async lies(sha) {
      const b = m.get(sha);
      if (!b) throw new DateiFehlt(sha);
      return b;
    },
    async vorhanden(sha) {
      return m.has(sha);
    },
    async loesche(sha) {
      m.delete(sha);
    },
    anzahl: () => m.size,
  };
}

/** Vor jedem Schreiben prüfen, z. B. ob noch genug Speicherplatz frei ist (#116). */
export function mitPruefung(s: Dateispeicher, vorher: () => Promise<void>): Dateispeicher {
  return {
    async schreibe(sha, inhalt) {
      await vorher();
      await s.schreibe(sha, inhalt);
    },
    ...(s.uebernimm
      ? {
          uebernimm: async (sha: string, datei: string) => {
            await vorher();
            await s.uebernimm!(sha, datei);
          },
        }
      : {}),
    lies: (sha) => s.lies(sha),
    ...(s.vorhanden ? { vorhanden: (sha: string) => s.vorhanden!(sha) } : {}),
    loesche: (sha) => s.loesche(sha),
  };
}
