/**
 * Schriften zum Rendern (#1329): PDFs, die ihre Schriften nicht einbetten (oft die Standardschriften Helvetica, Times,
 * Courier und Arial), rendert poppler (`pdftoppm`) mit Ersatzschriften aus dem System. Fehlen die, lässt poppler den
 * Text weg („Couldn't find a font for 'Helvetica'“) – Seitenbilder, Vorschaubilder und die Archivfassung (PDF/A) wären
 * leer. Das Image bringt deshalb freie, metrisch passende Ersatzschriften mit (Liberation, DejaVu).
 *
 * - `pruefeSchriften()`: rendert ein kleines, hier erzeugtes PDF mit nicht eingebetteter Helvetica und Arial und
 *   sieht nach, ob poppler Ersatz fand – Teil der eingebauten Werkzeuge (#1189), Hinweis in der Werkbank.
 * - `merkeSchriftfehler()`: Meldet poppler beim Rendern „Couldn't find a font“, gilt das ebenso (bis „Erneut prüfen“).
 * - `nichtEingebettet()`: Hat ein PDF Schriften, die es nicht einbettet? (`pdffonts`) – für die einmalige Reparatur
 *   des Bestands nach dem Update (`DokumentArchivfassung.schriftNachlauf` in `dokumente/archivfassung.ts`).
 */
import { execFile } from './hintergrund';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { protokoll } from './protokoll';
import { AUSGABE_KLEIN } from './grenzen';

// Rendern von Seiten- und Vorschaubildern: im Protokoll beim Modul „vorschau“.
const log = protokoll.modul('vorschau');

/** So meldet poppler eine Schrift, für die es keinen Ersatz findet. */
const SCHRIFT_FEHLT = /Couldn't find a font/i;

/**
 * Kleines PDF mit nicht eingebetteten Standardschriften (eine Seite je Schrift, nur Text, erfundener Inhalt) – von Hand
 * geschrieben, damit die Prüfung keine Datei und keine Bibliothek braucht.
 */
export function probePdf(schriften: readonly string[] = ['Helvetica', 'Arial']): Buffer {
  const objekte: string[] = [];
  const seiten: number[] = [];
  // 1 Katalog, 2 Seitenbaum, danach je Schrift: Schrift, Inhalt, Seite.
  schriften.forEach((s, i) => {
    const f = 3 + i * 3;
    const text = `BT /F1 28 Tf 40 120 Td (Probe ${s} 0123 Ablago) Tj 0 -50 Td (Lena Jonas Markus Petra) Tj ET`;
    objekte[f] = `<< /Type /Font /Subtype /${s === 'Arial' ? 'TrueType' : 'Type1'} /BaseFont /${s} /Encoding /WinAnsiEncoding >>`;
    objekte[f + 1] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
    objekte[f + 2] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 200] /Resources << /Font << /F1 ${f} 0 R >> >> /Contents ${f + 1} 0 R >>`;
    seiten.push(f + 2);
  });
  objekte[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objekte[2] = `<< /Type /Pages /Kids [${seiten.map((n) => `${n} 0 R`).join(' ')}] /Count ${seiten.length} >>`;
  let pdf = '%PDF-1.3\n';
  const lage: number[] = [];
  for (let n = 1; n < objekte.length; n++) {
    lage[n] = pdf.length;
    pdf += `${n} 0 obj\n${objekte[n]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objekte.length}\n0000000000 65535 f \n${lage
    .slice(1)
    .map((l) => `${String(l).padStart(10, '0')} 00000 n \n`)
    .join('')}`;
  pdf += `trailer\n<< /Size ${objekte.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/** Beim Rendern gesehen: poppler fand für eine Schrift keinen Ersatz (bis zur nächsten Prüfung). */
let gesehen: string | null = null;

/** Ausgabe von poppler (stderr) nach „Couldn't find a font“ durchsehen; einmal ins Protokoll. Liefert, ob es vorkam. */
export function merkeSchriftfehler(stderr: unknown, wo: string): boolean {
  const text = String(stderr ?? '');
  if (!SCHRIFT_FEHLT.test(text)) return false;
  if (!gesehen)
    log.warn(
      'Für eine Schrift im PDF fehlt der Ersatz: Der Text fehlt in Seiten- und Vorschaubildern. Das offizielle Image bringt die Schriften mit.',
      {
        wo,
        meldung: text
          .split('\n')
          .find((z) => SCHRIFT_FEHLT.test(z))
          ?.trim()
          .slice(0, 200),
      },
    );
  gesehen = wo;
  return true;
}

/** Hat poppler beim Rendern seit der letzten Prüfung eine Schrift vermisst? */
export const schriftfehlerGesehen = () => gesehen !== null;

/**
 * Findet poppler Ersatz für nicht eingebettete Schriften? Rendert `probePdf()` klein; true = ja, false = poppler
 * vermisst eine Schrift, undefined = pdftoppm fehlt (das meldet schon die Prüfung der Werkzeuge). Setzt das beim
 * Rendern Gesehene zurück.
 */
export async function pruefeSchriften(): Promise<boolean | undefined> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-schriften-'));
  try {
    await writeFile(join(dir, 'probe.pdf'), probePdf());
    const stderr = await new Promise<string | null>((ok) => {
      execFile(
        'pdftoppm',
        ['-r', '20', '-gray', join(dir, 'probe.pdf'), join(dir, 's')],
        { timeout: 20_000, maxBuffer: AUSGABE_KLEIN },
        (e, _o, err) => {
          ok(e && (e as NodeJS.ErrnoException).code === 'ENOENT' ? null : String(err ?? ''));
        },
      );
    });
    if (stderr === null) return undefined;
    gesehen = null;
    return !SCHRIFT_FEHLT.test(stderr);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Schriften, die das PDF nicht einbettet (`pdffonts`, Spalte „emb“) – leer, wenn alle eingebettet sind; null, wenn
 * pdffonts fehlt oder das PDF nicht lesbar ist (z. B. mit Passwort geschützt).
 */
export async function nichtEingebettet(pdf: Buffer): Promise<string[] | null> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-pdffonts-'));
  try {
    await writeFile(join(dir, 'datei.pdf'), pdf);
    const aus = await new Promise<string | null>((ok) => {
      execFile('pdffonts', [join(dir, 'datei.pdf')], { timeout: 30_000, maxBuffer: AUSGABE_KLEIN }, (e, out) => ok(e ? null : String(out)));
    });
    return aus === null ? null : leseFontliste(aus);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Ausgabe von pdffonts: Spaltenbreiten aus der Strichzeile, „emb“ ist die vierte Spalte. Namen ohne Teilmengen-Präfix. */
export function leseFontliste(aus: string): string[] {
  const zeilen = aus.split('\n');
  const strich = zeilen.findIndex((z) => /^-+( -+)+\s*$/.test(z));
  if (strich < 0) return [];
  const spalten: Array<[number, number]> = [];
  for (const m of zeilen[strich].matchAll(/-+/g)) spalten.push([m.index, m.index + m[0].length]);
  if (spalten.length < 4) return [];
  const namen = new Set<string>();
  for (const z of zeilen.slice(strich + 1)) {
    if (!z.trim()) continue;
    const emb = z.slice(spalten[3][0], spalten[3][1]).trim();
    if (emb !== 'no') continue;
    namen.add(
      z
        .slice(spalten[0][0], spalten[0][1])
        .trim()
        .replace(/^[A-Z]{6}\+/, '') || '?',
    );
  }
  return [...namen];
}
