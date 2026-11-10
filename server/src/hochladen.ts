import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { oeffneStrom, type Dateispeicher } from './dateispeicher';
import { Fachfehler } from './fehler';
import { t } from './sprache';
import { HOCHLADEN_STUECK, MB } from './grenzen';

/**
 * Hochladen als Strom (#746): Der Körper eines Uploads (bis 100 MB) geht Stück für Stück in eine temporäre Datei,
 * die Prüfsumme (SHA-256) entsteht beim Lesen. Vorher lag er ganz im Arbeitsspeicher, und die Prüfsumme hielt den
 * Faden danach in einem Zug fest. Abgelegt wird die Datei durch Umbenennen in den Dateispeicher.
 *
 * Die temporären Dateien liegen in `files/hochladen/` (außerhalb des Haushaltsordners, also nicht in der Sicherung,
 * aber auf demselben Laufwerk wie die Ablage), nur für den Dienstbenutzer lesbar (0600). Sie werden nach der Antwort
 * gelöscht, bei einem Abbruch sofort und beim Start, falls ein Absturz welche übrig ließ.
 */

/** Erste Bytes für die Erkennung des Dateityps (PDF, Bilder). */
const KOPF = 4096;

let einstellung: { ordner: string; vorher?: () => Promise<void> } = { ordner: join(tmpdir(), 'ablago-hochladen') };

/** Ordner für temporäre Uploads und Prüfung vor dem Schreiben (Speicherplatz, #116). */
export function richteHochladenEin(o: { ordner: string; vorher?: () => Promise<void> }) { einstellung = o; }
export const hochladeOrdner = () => einstellung.ordner;

/**
 * Übrig gebliebene temporäre Uploads (Absturz) löschen; liefert die Anzahl. `aelterAlsMs` (#745): Laufen noch andere
 * Prozesse, gehören frische Dateien vielleicht einem Upload, der gerade läuft – dann nur ältere.
 */
export async function raeumeHochladenAuf(ordner = einstellung.ordner, aelterAlsMs = 0): Promise<number> {
  let n = 0;
  for (const name of await readdir(ordner).catch(() => [] as string[])) {
    if (!name.endsWith('.tmp')) continue;
    if (aelterAlsMs > 0) {
      const s = await stat(join(ordner, name)).catch(() => null);
      if (!s || Date.now() - s.mtimeMs < aelterAlsMs) continue;
    }
    await rm(join(ordner, name), { force: true });
    n++;
  }
  return n;
}

/** Ein hochgeladener Körper als temporäre Datei. */
export class Hochgeladen {
  constructor(readonly pfad: string, readonly groesse: number, readonly sha256: string, readonly kopf: Buffer) {}
  /** Nur Dateien, die `nimmAuf` im Upload-Ordner angelegt hat (Name aus randomUUID) – nie ein anderer Pfad. */
  private sicher(): string {
    const ordner = resolve(einstellung.ordner);
    const p = resolve(this.pfad);
    if (!p.startsWith(ordner + sep) || !/^[0-9a-f-]{36}\.tmp$/.test(basename(p))) throw new Error('Unerwarteter Pfad für einen Upload');
    return p;
  }
  lies(): Promise<Buffer> { return readFile(this.sicher()); }
  /** Erst geöffnet, dann als Strom (#877): Fehlt die Datei, lehnt das Promise ab. */
  strom(): Promise<Readable> { return oeffneStrom(this.sicher()); }
  /** Löschen (auch, wenn sie schon in den Dateispeicher umbenannt wurde: dann gibt es nichts mehr zu tun). */
  async entferne() { await rm(this.sicher(), { force: true }); }
}

/**
 * Körper als Strom in eine temporäre Datei. `max`: Grenze in Bytes (413 schon nach Content-Length, sonst sobald sie
 * überschritten ist); bei jedem Fehler ist die Datei wieder weg.
 */
export async function nimmAuf(quelle: Readable, max: number, laenge?: number): Promise<Hochgeladen> {
  // Wie Fastify bei `bodyLimit`: zu groß → 413, ohne den Strom zu zerstören (sonst käme die Antwort nicht mehr an).
  if (laenge !== undefined && Number.isFinite(laenge) && laenge > max) throw zuGross(max);
  // Bis die Datei offen ist, nichts lesen – aber einen Abbruch in der Zwischenzeit nicht verpassen.
  let frueh: unknown = null;
  const merke = (e?: unknown) => { frueh ??= e ?? new Error('abgebrochen'); };
  quelle.pause();
  quelle.on('error', merke);
  try {
    if (einstellung.vorher) await einstellung.vorher();
    await mkdir(einstellung.ordner, { recursive: true, mode: 0o700 });
  } finally { quelle.off('error', merke); }
  if (frueh || (quelle.destroyed && !quelle.readableEnded)) throw new Fachfehler(400, t('meldungen.hochladen.die-datei-kam-nicht'));
  const pfad = join(einstellung.ordner, `${randomUUID()}.tmp`);
  const h = createHash('sha256');
  const kopf: Buffer[] = [];
  let n = 0, kopfLaenge = 0;
  const datei = createWriteStream(pfad, { flags: 'wx', mode: 0o600 });
  try {
    await new Promise<void>((fertig, fehler) => {
      let aus = false;
      const ende = (e?: unknown) => {
        if (aus) return;
        aus = true;
        quelle.off('data', beiDaten); quelle.off('end', beiEnde); quelle.off('error', beiFehler); quelle.off('close', beiAbbruch);
        if (e) { datei.destroy(); fehler(e); } else datei.end((x?: Error | null) => (x ? fehler(x) : fertig()));
      };
      const beiDaten = (stueck: Buffer) => {
        n += stueck.length;
        // Zu groß: nicht weiter speichern; der Rest des Körpers läuft ins Leere (wie bei Fastify), die 413 kommt an.
        if (n > max) { quelle.resume(); return ende(zuGross(max)); }
        h.update(stueck);
        if (kopfLaenge < KOPF) { const t = stueck.subarray(0, KOPF - kopfLaenge); kopf.push(Buffer.from(t)); kopfLaenge += t.length; }
        // Gegendruck: Das Netz liefert nicht schneller, als die Platte schreibt.
        if (!datei.write(stueck)) { quelle.pause(); datei.once('drain', () => quelle.resume()); }
      };
      const beiEnde = () => ende();
      const beiFehler = (e: unknown) => ende(e ?? new Error('abgebrochen'));
      // Verbindung zu, bevor der Körper vollständig war.
      const beiAbbruch = () => ende(new Error('abgebrochen'));
      datei.on('error', beiFehler);
      quelle.on('data', beiDaten); quelle.on('end', beiEnde); quelle.on('error', beiFehler); quelle.on('close', beiAbbruch);
      quelle.resume();
    });
  } catch (e) {
    await rm(pfad, { force: true });
    if (e instanceof Fachfehler) throw e;
    throw new Fachfehler(400, t('meldungen.hochladen.die-datei-kam-nicht'));
  }
  return new Hochgeladen(pfad, n, h.digest('hex'), Buffer.concat(kopf));
}

const zuGross = (max: number) => new Fachfehler(413, t('meldungen.hochladen.die-datei-ist-zu', { round: Math.round(max / MB) }));

/**
 * Inhalt beim Ablegen: ein Upload (temporäre Datei) oder ein Puffer (Postfach, Eingangsordner, PDF-Bearbeitung …).
 * Beides mit Größe, Kopf und Prüfsumme; abgelegt wird eine Datei durch Umbenennen, ein Puffer durch Schreiben.
 */
export class Eingang {
  private constructor(readonly groesse: number, readonly kopf: Buffer, private readonly sha: () => Promise<string>,
    private readonly datei: Hochgeladen | null, private readonly inhalt: Buffer | null) {}

  /** Aus einem Upload oder Puffer; null für alles andere (leerer Körper, JSON …). */
  static aus(x: unknown): Eingang | null {
    if (x instanceof Eingang) return x;
    if (x instanceof Hochgeladen) return new Eingang(x.groesse, x.kopf, async () => x.sha256, x, null);
    if (Buffer.isBuffer(x)) { let s: Promise<string> | null = null; return new Eingang(x.length, x.subarray(0, KOPF), () => (s ??= shaVon(x)), null, x); }
    return null;
  }

  sha256(): Promise<string> { return this.sha(); }
  /** Ganzer Inhalt – nur, wo er wirklich gebraucht wird (z. B. PDF verkleinern). */
  puffer(): Promise<Buffer> { return this.inhalt ? Promise.resolve(this.inhalt) : this.datei!.lies(); }
  /** In den Dateispeicher: eine Datei wird umbenannt (wenn der Speicher das kann), ein Puffer geschrieben. */
  async lege(speicher: Dateispeicher, sha256: string) {
    if (this.inhalt) return speicher.schreibe(sha256, this.inhalt);
    if (speicher.uebernimm) return speicher.uebernimm(sha256, this.datei!.pfad);
    await speicher.schreibe(sha256, await this.datei!.lies());
  }
}

/** SHA-256 eines Puffers in Stücken von 1 MB, dazwischen kurz frei für andere Anfragen (#746). */
export async function shaVon(b: Buffer): Promise<string> {
  const h = createHash('sha256');
  for (let i = 0; i < b.length; i += HOCHLADEN_STUECK) {
    h.update(b.subarray(i, i + HOCHLADEN_STUECK));
    if (i + HOCHLADEN_STUECK < b.length) await new Promise<void>((r) => setImmediate(r));
  }
  return h.digest('hex');
}
