#!/usr/bin/env node
/**
 * Schriften im Image (#1329): Findet poppler Ersatz für nicht eingebettete Standardschriften?
 *
 *   node schriften-pruefen.mjs [ordner]
 *
 * Schreibt ein kleines PDF von Hand (je eine Seite mit nicht eingebetteter Helvetica und Arial, erfundener Text),
 * rendert es mit pdftoppm als Graustufenbild und zählt die dunklen Bildpunkte je Seite. Ohne Ersatzschriften lässt
 * poppler den Text weg („Couldn't find a font for 'Helvetica'“) – die Seiten bleiben weiß, die Prüfung schlägt fehl.
 * Läuft im gebauten Image (Workflow „Prüfen und Image bauen“) und lokal; ohne Schriften nachstellen:
 *   FONTCONFIG_FILE=<Konfiguration mit leerem Schriftordner> node schriften-pruefen.mjs
 * Nur node und pdftoppm, keine Abhängigkeiten.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCHRIFTEN = ['Helvetica', 'Arial'];
/** So viele dunkle Bildpunkte muss jede Seite mindestens haben (zwei Zeilen Text bei 72 dpi: einige Tausend). */
const MINDESTENS = 500;

function probePdf() {
  const objekte = [];
  const seiten = [];
  SCHRIFTEN.forEach((s, i) => {
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
  const lage = [];
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

/** PGM (P5, 8 Bit): Bildpunkte dunkler als die Hälfte. */
function dunkle(pgm) {
  const kopf = pgm
    .subarray(0, 64)
    .toString('latin1')
    .match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  if (!kopf) throw new Error('kein PGM');
  const daten = pgm.subarray(kopf[0].length);
  let n = 0;
  for (const b of daten) if (b < 128) n++;
  return n;
}

const ordner = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'schriften-'));
let fehler = 0;
try {
  writeFileSync(join(ordner, 'probe.pdf'), probePdf());
  // pdftoppm endet auch ohne Schriften mit 0 – die Meldung steht nur auf stderr.
  const r = spawnSync('pdftoppm', ['-r', '72', '-gray', join(ordner, 'probe.pdf'), join(ordner, 's')], { encoding: 'utf8' });
  const stderr = `${r.stderr ?? ''}${r.error?.message ?? ''}`;
  if (r.status !== 0) {
    console.error(`::error::pdftoppm endete mit ${r.status}: ${stderr.trim()}`);
    fehler++;
  }
  if (/Couldn't find a font/i.test(stderr)) {
    console.error(`::error::poppler findet keine Ersatzschrift: ${stderr.trim().split('\n').join(' | ')}`);
    fehler++;
  }
  const bilder = readdirSync(ordner)
    .filter((n) => /^s-\d+\.pgm$/.test(n))
    .sort();
  if (bilder.length !== SCHRIFTEN.length) {
    console.error(`::error::${bilder.length} statt ${SCHRIFTEN.length} Seitenbilder`);
    fehler++;
  }
  bilder.forEach((n, i) => {
    const d = dunkle(readFileSync(join(ordner, n)));
    const ok = d >= MINDESTENS;
    console.log(
      `${SCHRIFTEN[i] ?? n}: ${d} dunkle Bildpunkte ${ok ? '– Text sichtbar' : `– zu wenig (mindestens ${MINDESTENS}), Text fehlt`}`,
    );
    if (!ok) fehler++;
  });
} finally {
  if (!process.argv[2]) rmSync(ordner, { recursive: true, force: true });
}
if (fehler) {
  console.error('::error::Nicht eingebettete Schriften erscheinen nicht – fehlen die Schriften im Image? (#1329)');
  process.exit(1);
}
console.log('Nicht eingebettete Helvetica und Arial: Text sichtbar.');
