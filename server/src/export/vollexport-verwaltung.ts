/** Vollexport (#1278 aus vollexport.ts): Verwaltung der Exporte – Liste, Prüfung, Dateien, Löschen, freier Platz. */
import { readdir, readFile, stat, rm, mkdir, statfs } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import { Transform } from 'node:stream';
import type { Eintrag } from './vollexport-formate';
import { heruntergeladen } from './vollexport-pruefsummen';
import { EXPORT_TAGE } from '../../../shared/src/auskunft';
import { Fachfehler } from '../grundlagen/fehler';
import { t } from '../sprache/sprache';

/* ---------- Verwaltung der Exporte ---------- */

/** `bis`: danach löscht Ablago den Export (#797), ebenso nach dem Herunterladen. */
export interface ExportStand {
  name: string;
  erstellt: string | null;
  bis: string;
  bytes: number;
  dateien: number;
  mappen: number | null;
  passwoerter: boolean;
  /** #1195: heruntergeladen und auf dem Server gelöscht – bis `bis` bleiben SHA256SUMS und die Prüfsumme der ZIP. */
  heruntergeladen?: { am: string; sha256: string; bytes: number };
}

const TAG_MS = 24 * 3600 * 1000;
/** Zeitpunkt aus dem Ordnernamen (dms-export-JJJJ-MM-TT-hh-mm-ss, UTC) – auch für Exporte ohne manifest.json. */
export function exportZeit(name: string): Date | null {
  const m = /^dms-export-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/.exec(name);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

/**
 * Bereitliegende Exporte, neueste zuerst. Wie bei der Auskunft (#396) räumt das Lesen auf: Was älter ist als
 * EXPORT_TAGE (#797), wird gelöscht. Maßgeblich ist `erstellt` aus manifest.json (oder dessen Zeitstempel, wenn
 * der später ist – so beim Umzug), sonst die Zeit im Namen – so bleibt ein Export, der gerade geschrieben wird
 * (noch ohne Manifest), stehen.
 */
export async function exporteIn(ziel: string, jetzt = new Date()): Promise<ExportStand[]> {
  let eintraege: string[];
  try {
    eintraege = await readdir(ziel);
  } catch {
    return [];
  }
  const erg: ExportStand[] = [];
  for (const n of eintraege
    .filter((x) => EXPORTNAME.test(x))
    .sort()
    .reverse()) {
    let m: { erstellt: string; dateien: Eintrag[]; anzahlen?: { mappen: number }; passwoerter?: boolean } | null = null;
    let geaendert = 0;
    try {
      const datei = join(ziel, n, 'manifest.json');
      m = JSON.parse(await readFile(datei, 'utf8'));
      // Beim Umzug aus dem Sicherungsordner (#797) frisch gestempelt: Die Frist beginnt dann erst dort.
      geaendert = (await stat(datei)).mtimeMs;
    } catch {
      /* läuft noch, unvollständig oder schon heruntergeladen */
    }
    // Heruntergeladen (#1195): Eintrag mit Prüfsumme der ZIP bleibt EXPORT_TAGE ab dem Herunterladen.
    const geladen = m ? null : await heruntergeladen(join(ziel, n));
    if (geladen) {
      const frist = new Date(Date.parse(geladen.am) + EXPORT_TAGE * TAG_MS);
      if (frist.getTime() <= jetzt.getTime()) {
        await loescheExport(join(ziel, n));
        continue;
      }
      erg.push({
        name: n,
        erstellt: geladen.erstellt,
        bis: frist.toISOString(),
        bytes: 0,
        dateien: geladen.dateien,
        mappen: geladen.mappen,
        passwoerter: false,
        heruntergeladen: { am: geladen.am, sha256: geladen.sha256, bytes: geladen.bytes },
      });
      continue;
    }
    const erstellt = (m?.erstellt ? new Date(m.erstellt) : null) ?? exportZeit(n);
    const ab = erstellt && geaendert > erstellt.getTime() ? new Date(geaendert) : erstellt;
    const bis = new Date((ab?.getTime() ?? jetzt.getTime()) + EXPORT_TAGE * TAG_MS);
    if (bis.getTime() <= jetzt.getTime()) {
      await loescheExport(join(ziel, n));
      continue;
    }
    erg.push(
      m
        ? {
            name: n,
            erstellt: m.erstellt,
            bis: bis.toISOString(),
            bytes: m.dateien.reduce((a, d) => a + d.bytes, 0),
            dateien: m.dateien.length + 1,
            mappen: m.anzahlen?.mappen ?? null,
            passwoerter: !!m.passwoerter,
          }
        : { name: n, erstellt: null, bis: bis.toISOString(), bytes: 0, dateien: 0, mappen: null, passwoerter: false },
    );
  }
  return erg;
}

const EXPORTNAME = /^dms-export-[\d-]+$/;
export function exportOrdner(ziel: string, name: string) {
  if (!EXPORTNAME.test(name)) throw new Fachfehler(404, t('meldungen.vollexport.diesen-export-gibt-es'));
  return join(ziel, name);
}

/** Export prüfen: jede Datei aus dem Manifest gegen Größe und SHA-256. */
export async function pruefeExport(ordner: string) {
  let m: { dateien: Eintrag[] };
  try {
    m = JSON.parse(await readFile(join(ordner, 'manifest.json'), 'utf8'));
  } catch {
    throw new Fachfehler(404, t('meldungen.vollexport.diesen-export-gibt-es-2'));
  }
  const fehlend: string[] = [],
    abweichend: string[] = [];
  for (const d of m.dateien) {
    const p = join(ordner, ...d.pfad.split('/'));
    try {
      const h = createHash('sha256');
      await pipeline(
        createReadStream(p),
        new Transform({
          transform(c: Buffer, _e, cb) {
            h.update(c);
            cb();
          },
        }),
      );
      if (h.digest('hex') !== d.sha256) abweichend.push(d.pfad);
    } catch {
      fehlend.push(d.pfad);
    }
  }
  return { ok: !fehlend.length && !abweichend.length, dateien: m.dateien.length, fehlend, abweichend };
}

/** Dateien eines Exports für den ZIP-Download (relativer Pfad, Größe). */
export async function exportDateien(ordner: string): Promise<Array<{ name: string; groesse: number; pfad: string }>> {
  const erg: Array<{ name: string; groesse: number; pfad: string }> = [];
  const lauf = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await lauf(p);
      else erg.push({ name: relative(ordner, p).split(sep).join('/'), groesse: (await stat(p)).size, pfad: p });
    }
  };
  await lauf(ordner);
  return erg;
}

export async function loescheExport(ordner: string) {
  await rm(ordner, { recursive: true, force: true });
}

/** Freier Platz am Ziel (Bytes) oder null. */
export async function freierPlatz(ziel: string): Promise<number | null> {
  try {
    await mkdir(ziel, { recursive: true });
    const s = await statfs(ziel);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}
