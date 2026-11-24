/**
 * Seitenzahl und Seitengrößen eines PDFs ohne die Wörter (#1445): `pdfinfo -box` liefert je Seite Beschnitt (CropBox)
 * und Drehung. Der Seitenbetrachter der Mappe braucht nur das – die Wortpositionen (pdftotext -bbox) kosten bei langen
 * Dokumenten auf dem Server Zeit und schicken Megabytes an Wörtern, die die Mappe nicht zeigt.
 *
 * Maße wie in den Wortpositionen: Beschnitt in Punkten, bei 90° bzw. 270° Drehung vertauscht (so, wie `pdftoppm
 * -cropbox` die Seite zeichnet).
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AUSGABE_KLEIN } from '../grundlagen/grenzen';
import { execFile, schreibeWerkzeugDatei, werkzeugOrdner } from '../prozesse/hintergrund';

/** Höchstens so viele Seiten bekommen Maße; die Anzahl stimmt trotzdem (aus „Pages:“). */
const SEITEN_MAX = 1000;

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

/** Ausgabe von `pdfinfo -box -f 1 -l N` lesen: je Seite Breite und Höhe (gedreht); Seiten ohne Angabe 1 × 1. */
export function liesSeitenGroessen(aus: string): Array<{ breite: number; hoehe: number }> | null {
  const anzahl = Number(/^Pages:\s+(\d+)/m.exec(aus)?.[1] ?? 0);
  if (!anzahl) return null;
  const kasten = new Map<number, [number, number]>();
  for (const m of aus.matchAll(/^Page\s+(\d+)\s+CropBox:\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/gm))
    kasten.set(Number(m[1]), [Math.abs(Number(m[4]) - Number(m[2])), Math.abs(Number(m[5]) - Number(m[3]))]);
  const drehung = new Map<number, number>();
  for (const m of aus.matchAll(/^Page\s+(\d+)\s+rot:\s+(-?\d+)/gm)) drehung.set(Number(m[1]), ((Number(m[2]) % 360) + 360) % 360);
  return Array.from({ length: anzahl }, (_, i) => {
    const k = kasten.get(i + 1);
    if (!k || !(k[0] > 0 && k[1] > 0)) return { breite: 1, hoehe: 1 };
    const quer = drehung.get(i + 1) === 90 || drehung.get(i + 1) === 270;
    return { breite: r5(quer ? k[1] : k[0]), hoehe: r5(quer ? k[0] : k[1]) };
  });
}

/** Seitengrößen eines PDFs; null, wenn poppler fehlt oder sich das PDF nicht lesen lässt (auch mit Passwort). */
export async function seitenGroessen(inhalt: Uint8Array): Promise<Array<{ breite: number; hoehe: number }> | null> {
  const dir = await werkzeugOrdner('dms-seitengroessen-');
  try {
    const ein = join(dir, 'ein.pdf');
    await schreibeWerkzeugDatei(ein, inhalt);
    const aus = await new Promise<string | null>((ok) => {
      execFile('pdfinfo', ['-box', '-f', '1', '-l', String(SEITEN_MAX), ein], { timeout: 60_000, maxBuffer: AUSGABE_KLEIN }, (e, o) =>
        ok(e ? null : String(o)),
      );
    });
    return aus === null ? null : liesSeitenGroessen(aus);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
