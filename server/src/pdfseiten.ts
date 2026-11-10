import { execFile } from './hintergrund';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Fachfehler } from './fehler';
import type { SeitenWahl } from './pdf';
import { t } from './sprache';
import { anteilVon } from './zwischenspeicher';
import { AUSGABE_MITTEL } from './grenzen';

/**
 * PDF bearbeiten (#335): Seiten drehen, löschen, umsortieren, teilen, zusammenfügen – im Server, ohne
 * externe Dienste. Hier liegen die Prüfung der Eingaben und die Seitenbilder; die PDF-Vorgänge selbst
 * liegen in der PDF-Stelle (`pdf/seiten.ts`, #541).
 */
export { baueSeiten as baue, bildArt, bilderZuPdf, fuegeZusammen, seitenInfo, teileSeiten as teile, type SeitenWahl } from './pdf';

const DREHUNGEN = [0, 90, 180, 270];

/** Eingabe prüfen: Seiten des Originals, Drehung in 90°-Schritten, Teile als Startpositionen. */
export function pruefeAuswahl(roh: unknown, anzahl: number): SeitenWahl[] {
  if (!Array.isArray(roh) || !roh.length) throw new Fachfehler(422, t('meldungen.pdfseiten.mindestens-eine-seite-muss'));
  if (roh.length > 5000) throw new Fachfehler(422, t('meldungen.pdfseiten.zu-viele-seiten'));
  return roh.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const nr = Number(o.nr);
    if (!Number.isInteger(nr) || nr < 1 || nr > anzahl) throw new Fachfehler(422, t('meldungen.pdfseiten.seite-die-seite-gibt', { wert: i + 1, nr: String(o.nr), zahl: anzahl }));
    const drehung = o.drehung === undefined ? 0 : Number(o.drehung);
    if (!DREHUNGEN.includes(((drehung % 360) + 360) % 360)) throw new Fachfehler(422, t('meldungen.pdfseiten.drehen-geht-nur-in'));
    return { nr, drehung: ((drehung % 360) + 360) % 360 };
  });
}

/** Teile: aufsteigende Startpositionen in der Seitenauswahl (die erste Seite beginnt immer einen Teil). */
export function pruefeTeile(roh: unknown, laenge: number): number[] {
  if (roh === undefined || roh === null) return [0];
  if (!Array.isArray(roh)) throw new Fachfehler(422, t('meldungen.pdfseiten.teile-eine-liste-von'));
  const eintrag = [...new Set([0, ...roh.map(Number)])].sort((a, b) => a - b);
  if (eintrag.some((x) => !Number.isInteger(x) || x < 0 || x >= laenge)) throw new Fachfehler(422, t('meldungen.pdfseiten.teile-jede-position-muss'));
  if (eintrag.length > 200) throw new Fachfehler(422, t('meldungen.pdfseiten.hoechstens-200-teile'));
  return eintrag;
}

/** „Rechnung.pdf“ → „Rechnung (Teil 2).pdf“ */
export const teilName = (name: string, n: number) => {
  const punkt = name.lastIndexOf('.');
  return punkt > 0 ? `${name.slice(0, punkt)} (Teil ${n})${name.slice(punkt)}` : `${name} (Teil ${n})`;
};

/* ---------- Seitenbilder für die Seitenansicht ---------- */

/** Längste Seite der Seitenbilder in Pixeln (scharf bei 100 × 130 px auf hochauflösenden Bildschirmen). */
export const SEITENBILD_PX = 260;
/** Seitenbilder höchstens für so viele Seiten; danach zeigt die Oberfläche nur die Nummer. */
export const SEITENBILDER_MAX = 400;

/**
 * Alle Seitenbilder eines PDFs in einem Lauf von pdftoppm (eine große Datei wird nur einmal
 * geschrieben und gelesen) und für die letzten Dokumente im Arbeitsspeicher gehalten – die
 * Seitenansicht fragt Seite für Seite.
 */
export class Seitenbilder {
  private cache = new Map<string, Promise<Buffer[]>>();
  constructor(private max = 4, private erzeuge: (inhalt: Buffer) => Promise<Buffer[]> = popplerSeiten) {}

  async bild(sha: string, nr: number, inhalt: () => Promise<Buffer>): Promise<Buffer | null> {
    let p = this.cache.get(sha);
    if (!p) {
      p = inhalt().then((b) => this.erzeuge(b));
      this.cache.set(sha, p);
      p.catch(() => this.cache.delete(sha));
      // Mit mehreren Prozessen teilen sie sich die Dokumente (#874), jeder behält mindestens eins.
      while (this.cache.size > anteilVon(this.max)) this.cache.delete(this.cache.keys().next().value!);
    } else {
      // zuletzt benutzt ans Ende
      this.cache.delete(sha); this.cache.set(sha, p);
    }
    const bilder = await p;
    return bilder[nr - 1] ?? null;
  }
}

function starte(cmd: string, args: string[], ms: number): Promise<void> {
  return new Promise((ok, fehler) => {
    execFile(cmd, args, { timeout: ms, maxBuffer: AUSGABE_MITTEL }, (e, _out, err) => {
      if (!e) { ok(); return; }
      const f = e as NodeJS.ErrnoException & { killed?: boolean };
      fehler(new Error(f.code === 'ENOENT' ? `${cmd} ist nicht installiert.` : f.killed ? `${cmd} brauchte zu lange.` : String(err || f.message).trim().split('\n').slice(-2).join(' ')));
    });
  });
}

/** pdftoppm: Seiten 1…SEITENBILDER_MAX als JPEG. */
export async function popplerSeiten(inhalt: Buffer): Promise<Buffer[]> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-seiten-'));
  try {
    const pdf = join(dir, 'datei.pdf');
    await writeFile(pdf, inhalt);
    await starte('pdftoppm', ['-f', '1', '-l', String(SEITENBILDER_MAX), '-scale-to', String(SEITENBILD_PX), '-jpeg', '-jpegopt', 'quality=75', pdf, join(dir, 's')], 300_000);
    // pdftoppm nummeriert mit führenden Nullen je nach Seitenzahl (s-1.jpg, s-01.jpg …).
    const namen = (await readdir(dir)).filter((n) => /^s-\d+\.jpg$/.test(n)).sort((a, b) => Number(a.slice(2, -4)) - Number(b.slice(2, -4)));
    return await Promise.all(namen.map((n) => readFile(join(dir, n))));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
