/**
 * Eine PDF-Seite als Graustufenbild (PGM, 8 Bit) – Eingabe für die Texterkennung in einem Paket (#338).
 * PGM ist so einfach, dass ein Paket es ohne Bildbibliothek lesen kann (Kopf „P5 Breite Höhe 255“, dann Bytes).
 * Gerastert wird mit pdftoppm (im Image für die Texterkennung ohnehin vorhanden).
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
