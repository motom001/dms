/**
 * Graustufenbilder (PGM „P5“, 8 Bit) für die Texterkennung.
 *
 * graubild(): eine PDF-Seite als Graustufenbild – Eingabe für die Texterkennung in einem Paket (#338).
 * PGM ist so einfach, dass ein Paket es ohne Bildbibliothek lesen kann (Kopf „P5 Breite Höhe 255“, dann Bytes).
 * Gerastert wird mit pdftoppm (im Image für die Texterkennung ohnehin vorhanden).
 *
 * lesePgm()/dreheGraubild()/schreibePgm(): ein Graustufenbild drehen (#395) – für gescannte PDF-Seiten.
 * pdftoppm -gray liefert dieses Format; tesseract liest es direkt. So braucht das Image kein
 * zusätzliches Bildwerkzeug, um eine auf dem Kopf stehende oder quer liegende Seite aufzurichten.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Fachfehler } from './fehler';

export const DPI_MIN = 72;
export const DPI_MAX = 400;
/** Höchstens so viele Bildpunkte (≈ A3 bei 400 dpi); bei größeren Seiten bitte mit weniger dpi anfragen. */
export const PUNKTE_MAX = 6000 * 6000;
const ZEIT_MS = 60_000;

export async function graubild(pdf: Buffer, nr: number, dpi: number): Promise<Buffer> {
  if (!Number.isInteger(nr) || nr < 1) throw new Fachfehler(422, 'Seite: eine ganze Zahl ab 1.');
  if (!Number.isInteger(dpi) || dpi < DPI_MIN || dpi > DPI_MAX) throw new Fachfehler(422, `dpi: zwischen ${DPI_MIN} und ${DPI_MAX}.`);
  const dir = await mkdtemp(join(tmpdir(), 'dms-scan-'));
  try {
    await writeFile(join(dir, 'q.pdf'), pdf);
    await new Promise<void>((ok, fehler) => {
      execFile('pdftoppm', ['-gray', '-r', String(dpi), '-f', String(nr), '-l', String(nr), '-singlefile', join(dir, 'q.pdf'), join(dir, 's')],
        { timeout: ZEIT_MS, maxBuffer: 1 << 20 }, (e, _o, err) => {
          if (!e) return ok();
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') return fehler(new Fachfehler(503, 'pdftoppm fehlt – Seiten lassen sich hier nicht rastern.'));
          fehler(/Wrong page range|first page/i.test(String(err)) ? new Fachfehler(404, `Seite ${nr} gibt es in diesem PDF nicht.`) : new Fachfehler(422, `Die Seite lässt sich nicht rastern: ${String(err).trim().slice(0, 200) || e.message}`));
        });
    });
    const bild = await readFile(join(dir, 's.pgm')).catch(() => { throw new Fachfehler(404, `Seite ${nr} gibt es in diesem PDF nicht.`); });
    if (bild.length > PUNKTE_MAX + 64) throw new Fachfehler(422, `Die Seite ist bei ${dpi} dpi zu groß – bitte mit weniger dpi anfragen.`);
    return bild;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export interface Graubild { breite: number; hoehe: number; pixel: Buffer }

/** PGM (P5, höchstens 255) lesen; null bei einem anderen Format. */
export function lesePgm(b: Buffer): Graubild | null {
  // Kopf: „P5“, Breite, Höhe, Höchstwert – durch Leerraum getrennt, Kommentare mit #, danach genau ein Leerzeichen.
  let i = 0;
  const feld = (): string | null => {
    for (;;) {
      while (i < b.length && /\s/.test(String.fromCharCode(b[i]))) i++;
      if (b[i] !== 0x23) break;
      while (i < b.length && b[i] !== 0x0a) i++;
    }
    const start = i;
    while (i < b.length && !/\s/.test(String.fromCharCode(b[i]))) i++;
    return i > start ? b.toString('latin1', start, i) : null;
  };
  if (feld() !== 'P5') return null;
  const breite = Number(feld()), hoehe = Number(feld()), hoechst = Number(feld());
  if (!(breite > 0) || !(hoehe > 0) || !(hoechst > 0 && hoechst < 256)) return null;
  i++;
  if (b.length - i < breite * hoehe) return null;
  return { breite, hoehe, pixel: b.subarray(i, i + breite * hoehe) };
}

export const schreibePgm = (g: Graubild) => Buffer.concat([Buffer.from(`P5\n${g.breite} ${g.hoehe}\n255\n`, 'latin1'), g.pixel]);

/** Im Uhrzeigersinn um 90, 180 oder 270 Grad drehen (wie „Rotate:“ bei tesseract --psm 0). */
export function dreheGraubild(g: Graubild, grad: number): Graubild {
  const { breite: w, hoehe: h, pixel: p } = g;
  const n = Buffer.allocUnsafe(w * h);
  if (grad === 180) {
    for (let k = 0, m = w * h - 1; k < w * h; k++, m--) n[k] = p[m];
    return { breite: w, hoehe: h, pixel: n };
  }
  if (grad === 90) {
    // Neu: Breite h, Höhe w; neu(x, y) = alt(y, h-1-x).
    for (let y = 0; y < w; y++) for (let x = 0; x < h; x++) n[y * h + x] = p[(h - 1 - x) * w + y];
    return { breite: h, hoehe: w, pixel: n };
  }
  if (grad === 270) {
    // neu(x, y) = alt(w-1-y, x).
    for (let y = 0; y < w; y++) for (let x = 0; x < h; x++) n[y * h + x] = p[x * w + (w - 1 - y)];
    return { breite: h, hoehe: w, pixel: n };
  }
  return g;
}
