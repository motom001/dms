import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { degrees, PDFDocument } from 'pdf-lib';
import { Fachfehler } from './fehler';

/**
 * PDF bearbeiten (#335): Seiten drehen, löschen, umsortieren, teilen, zusammenfügen.
 * Alles mit pdf-lib im Server – keine externen Dienste. Seiten werden kopiert, nicht neu gerendert:
 * Text, Bilder und Schriften bleiben, wie sie sind.
 */

/** Eine Seite im Ergebnis: Nummer im Original (ab 1) und zusätzliche Drehung im Uhrzeigersinn. */
export interface SeitenWahl { nr: number; drehung?: number }

const DREHUNGEN = [0, 90, 180, 270];

async function lade(inhalt: Buffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(inhalt, { updateMetadata: false });
  } catch (e) {
    const m = (e as Error).message;
    if (/encrypt/i.test(m)) throw new Fachfehler(422, 'Das PDF ist mit einem Passwort geschützt und lässt sich nicht bearbeiten.');
    throw new Fachfehler(422, 'Die Datei lässt sich nicht als PDF lesen.');
  }
}

/** Seitenzahl und aktuelle Drehung je Seite. */
export async function seitenInfo(inhalt: Buffer): Promise<{ anzahl: number; drehungen: number[] }> {
  const doc = await lade(inhalt);
  const seiten = doc.getPages();
  return { anzahl: seiten.length, drehungen: seiten.map((s) => ((s.getRotation().angle % 360) + 360) % 360) };
}

/** Eingabe prüfen: Seiten des Originals, Drehung in 90°-Schritten, Teile als Startpositionen. */
export function pruefeAuswahl(roh: unknown, anzahl: number): SeitenWahl[] {
  if (!Array.isArray(roh) || !roh.length) throw new Fachfehler(422, 'Mindestens eine Seite muss bleiben.');
  if (roh.length > 5000) throw new Fachfehler(422, 'Zu viele Seiten.');
  return roh.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const nr = Number(o.nr);
    if (!Number.isInteger(nr) || nr < 1 || nr > anzahl) throw new Fachfehler(422, `Seite ${i + 1}: Die Seite ${String(o.nr)} gibt es nicht (das PDF hat ${anzahl} Seiten).`);
    const drehung = o.drehung === undefined ? 0 : Number(o.drehung);
    if (!DREHUNGEN.includes(((drehung % 360) + 360) % 360)) throw new Fachfehler(422, 'Drehen geht nur in Schritten von 90 Grad.');
    return { nr, drehung: ((drehung % 360) + 360) % 360 };
  });
}

/** Teile: aufsteigende Startpositionen in der Seitenauswahl (die erste Seite beginnt immer einen Teil). */
export function pruefeTeile(roh: unknown, laenge: number): number[] {
  if (roh === undefined || roh === null) return [0];
  if (!Array.isArray(roh)) throw new Fachfehler(422, 'teile: eine Liste von Seitenpositionen.');
  const t = [...new Set([0, ...roh.map(Number)])].sort((a, b) => a - b);
  if (t.some((x) => !Number.isInteger(x) || x < 0 || x >= laenge)) throw new Fachfehler(422, 'teile: Jede Position muss eine Seite der Auswahl sein.');
  if (t.length > 200) throw new Fachfehler(422, 'Höchstens 200 Teile.');
  return t;
}

/** Neues PDF aus Seiten des Originals (Reihenfolge, Drehung, ohne die weggelassenen). */
export async function baue(inhalt: Buffer, seiten: SeitenWahl[]): Promise<Buffer> {
  const quelle = await lade(inhalt);
  const ziel = await PDFDocument.create();
  const kopien = await ziel.copyPages(quelle, seiten.map((s) => s.nr - 1));
  kopien.forEach((p, i) => {
    const d = seiten[i].drehung ?? 0;
    if (d) p.setRotation(degrees((((p.getRotation().angle + d) % 360) + 360) % 360));
    ziel.addPage(p);
  });
  return Buffer.from(await ziel.save());
}

/** In Teile zerlegen: je Teil ein PDF. */
export async function teile(inhalt: Buffer, seiten: SeitenWahl[], starts: number[]): Promise<Buffer[]> {
  const erg: Buffer[] = [];
  for (const [i, s] of starts.entries()) erg.push(await baue(inhalt, seiten.slice(s, starts[i + 1] ?? seiten.length)));
  return erg;
}

/** Mehrere PDFs hintereinander zu einem. */
export async function fuegeZusammen(inhalte: Buffer[]): Promise<Buffer> {
  const ziel = await PDFDocument.create();
  for (const b of inhalte) {
    const q = await lade(b);
    for (const p of await ziel.copyPages(q, q.getPageIndices())) ziel.addPage(p);
  }
  return Buffer.from(await ziel.save());
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
      while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value!);
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
    execFile(cmd, args, { timeout: ms, maxBuffer: 16 * 1024 * 1024 }, (e, _out, err) => {
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
