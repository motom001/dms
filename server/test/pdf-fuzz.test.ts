/**
 * Tests mit kaputten PDFs (#823, Teil 2): beschädigte und zufällig veränderte PDFs gehen in alle Lesestellen der
 * PDF-Stelle – über den Arbeiter-Pool wie im Betrieb. Erwartet wird: kein Absturz des Arbeiters, kein Hänger über die
 * Zeitgrenze und bei den Vorgängen für Menschen eine verständliche Meldung (Fachfehler 422).
 *
 * - **Korpus:** `test/pdf-korpus/*.pdf` (kleine, absichtlich kaputte Beispiele) und die Objektstrom-Bombe, die der
 *   Test selbst erzeugt (sie wäre als Datei unnötig groß).
 * - **Zufällig verändert:** Bytes kippen, abschneiden, Bereiche löschen oder doppeln, Zahlen in Querverweisen,
 *   Längen und Verweisen verfälschen, Ströme tauschen, Bruchstücke der PDF-Syntax einstreuen. Ein fester Startwert
 *   macht jeden Lauf wiederholbar; ein Fund nennt Startwert und Fall.
 * - **Umfang:** in der normalen CI `DMS_FUZZ_FAELLE` = 120 Fälle (Vorgabe), nach Zeitplan deutlich mehr
 *   (`.github/workflows/fuzz.yml`). `DMS_FUZZ_SEED` setzt den Startwert; mit `DMS_FUZZ_AUSGABE=<ordner>` landet ein
 *   gefundenes PDF dort (zum Nachstellen und als neues Beispiel für den Korpus).
 *
 * Ohne neue Abhängigkeit (#543): ein kleiner eigener Mutator statt fast-check oder Jazzer.js.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { after, before, describe, it } from 'node:test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beendeArbeiter, richteArbeiterEin } from '../src/arbeit';
import { ERSATZ_STEMPEL } from '../../shared/src/stempel';
import { analysiereVerkleinern, bereinigePdf, liesPdfA, seitenInfo, stempelePdf, textebeneWoerter } from '../src/pdf';
import { OBJEKTSTROM_MAX } from '../src/pdf/laden';
import { pdfMitText } from './hilfen';

const KORPUS = new URL('./pdf-korpus/', import.meta.url).pathname;
const FAELLE = Math.max(1, Number(process.env.DMS_FUZZ_FAELLE) || 120);
const SEED = Number(process.env.DMS_FUZZ_SEED) || 823;
/** Höchstens so lange darf ein Vorgang an einem kaputten PDF brauchen (weit unter der Zeitgrenze der Arbeiter). */
const FALL_MS = 30_000;

/** Kleiner Zufallsgenerator mit Startwert (mulberry32) – wiederholbar, ohne Abhängigkeit. */
function zufall(seed: number) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { r, n: (max: number) => Math.floor(r() * max), aus: <T>(l: readonly T[]) => l[Math.floor(r() * l.length)] };
}

/** Objektstrom, der sich über die Grenze von `ladePdf()` entpackt (#823, 0.164.2) – klein gepackt. */
function objektstromBombe(): Buffer {
  const strom = deflateSync(Buffer.alloc(OBJEKTSTROM_MAX + 1024 * 1024, 32), { level: 9 });
  const objs = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>'),
    Buffer.concat([
      Buffer.from(`<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${strom.length} >>\nstream\n`),
      strom,
      Buffer.from('\nendstream'),
    ]),
  ];
  const teile: Buffer[] = [Buffer.from('%PDF-1.7\n')];
  const offs: number[] = [];
  let n = teile[0].length;
  objs.forEach((o, i) => {
    offs.push(n);
    const t = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from('\nendobj\n')]);
    teile.push(t);
    n += t.length;
  });
  return Buffer.concat([
    ...teile,
    Buffer.from(
      `xref\n0 5\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${n}\n%%EOF\n`,
    ),
  ]);
}

const SYNTAX = [
  '<<',
  '>>',
  '[',
  ']',
  '/Kids',
  '/Pages',
  '/Type',
  ' 0 R',
  'obj',
  'endobj',
  'stream\n',
  'endstream',
  '/Length 9999999',
  '/Filter /FlateDecode',
  '/ObjStm',
  '/XRef',
  '/W [1 2 1]',
  'trailer',
  'startxref',
  '%%EOF',
  '-1',
  '1e308',
  '(',
  ')',
  '\\',
  '#',
  '/Encrypt 1 0 R',
];

/** Eine zufällige Veränderung eines PDFs. */
function veraendere(b: Buffer, z: ReturnType<typeof zufall>): Buffer {
  const x = Buffer.from(b);
  const art = z.n(8);
  const pos = z.n(Math.max(1, x.length));
  switch (art) {
    case 0: {
      for (let i = 0, k = 1 + z.n(20); i < k; i++) x[z.n(x.length)] = z.n(256);
      return x;
    } // Bytes kippen
    case 1:
      return x.subarray(0, pos); // abschneiden
    case 2:
      return Buffer.concat([x.subarray(0, pos), x.subarray(Math.min(x.length, pos + 1 + z.n(200)))]); // Bereich löschen
    case 3: {
      const l = 1 + z.n(400);
      return Buffer.concat([x.subarray(0, pos), x.subarray(pos, pos + l), x.subarray(pos)]);
    } // Bereich doppeln
    case 4: {
      // Zahlen verfälschen (Querverweise, Längen, Verweise)
      const text = x.toString('latin1');
      return Buffer.from(
        text.replace(/\d+/g, (m) => (z.r() < 0.15 ? String(z.aus([0, 1, -1, Number(m) * 7, Number(m) + 1, 2147483647, 99999999999])) : m)),
        'latin1',
      );
    }
    case 5: {
      // zwei Ströme tauschen
      const text = x.toString('latin1');
      const s = [...text.matchAll(/stream\r?\n([\s\S]*?)endstream/g)];
      if (s.length < 2) return Buffer.concat([x, Buffer.from(z.aus(SYNTAX), 'latin1')]);
      const [a, c] = [z.aus(s), z.aus(s)];
      return Buffer.from(text.replace(a[1], '\u0000').replace(c[1], a[1]).replace('\u0000', c[1]), 'latin1');
    }
    case 6:
      return Buffer.concat([
        x.subarray(0, pos),
        Buffer.from(Array.from({ length: 1 + z.n(6) }, () => z.aus(SYNTAX)).join(' '), 'latin1'),
        x.subarray(pos),
      ]); // Syntax einstreuen
    default: {
      const t = x.toString('latin1');
      const i = t.lastIndexOf('startxref');
      return i < 0 ? x : Buffer.from(`${t.slice(0, i)}startxref\n${z.n(x.length * 2)}\n%%EOF\n`, 'latin1');
    } // startxref verbiegen
  }
}

/** Ausgangs-PDFs: einfache Textseite, mehrseitig mit Objektströmen (pdf-lib), mit Bild – und der Korpus. */
async function ausgang(): Promise<Array<{ name: string; pdf: Buffer }>> {
  // Ohne Datum und Erzeuger: Sonst änderte sich das PDF mit jedem Lauf, und ein Fall ließe sich nicht wiederholen.
  const doc = await PDFDocument.create({ updateMetadata: false });
  const f = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) doc.addPage([300, 400]).drawText(`Seite ${i + 1} von Markus`, { x: 20, y: 300, font: f, size: 14 });
  const mehr = Buffer.from(await doc.save({ useObjectStreams: true }));
  const korpus = readdirSync(KORPUS)
    .filter((n) => n.endsWith('.pdf'))
    .sort()
    .map((n) => ({ name: `korpus/${n}`, pdf: readFileSync(join(KORPUS, n)) }));
  return [
    { name: 'text', pdf: pdfMitText(['Rechnung der Tischlerei Brandt', 'Betrag 120,00 EUR']) },
    { name: 'objektstroeme', pdf: mehr },
    ...korpus,
  ];
}

/** Ein Vorgang an einem kaputten PDF: Ergebnis oder Fehler – aber kein Absturz, kein Hänger. */
type Pruefung = { name: string; lauf: (pdf: Buffer) => Promise<unknown>; meldung: boolean };
const VORGAENGE: Pruefung[] = [
  { name: 'Seiten', lauf: (p) => seitenInfo(p), meldung: true },
  { name: 'Verkleinern (Schätzung)', lauf: (p) => analysiereVerkleinern(p), meldung: true },
  {
    name: 'Stempel',
    lauf: (p) =>
      stempelePdf({
        name: 'kaputt.pdf',
        mime: 'application/pdf',
        inhalt: p,
        stempel: { ...ERSATZ_STEMPEL, text: 'KOPIE', lage: 'diagonal', deckkraft: 0.3, seiten: 'alle' },
        text: 'KOPIE',
      }),
    meldung: true,
  },
  // Anzeige und Archivprüfung fangen Fehler selbst ab (nur Herunterladen bzw. „nicht lesbar“) – es zählt nur: kein Absturz.
  { name: 'Anzeige', lauf: (p) => bereinigePdf(p), meldung: false },
  { name: 'Archivprüfung', lauf: (p) => liesPdfA(p), meldung: false },
  { name: 'Textebene', lauf: (p) => textebeneWoerter(p), meldung: false },
];

async function pruefe(v: Pruefung, pdf: Buffer, wo: string) {
  try {
    await pruefeEinmal(v, pdf, wo);
  } catch (e) {
    // Fund festhalten: Mit DMS_FUZZ_AUSGABE liegt das PDF danach dort – als neues Beispiel für den Korpus.
    const aus = process.env.DMS_FUZZ_AUSGABE;
    if (aus) {
      mkdirSync(aus, { recursive: true });
      writeFileSync(join(aus, `fund-${wo.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`), pdf);
    }
    throw e;
  }
}

async function pruefeEinmal(v: Pruefung, pdf: Buffer, wo: string) {
  const start = Date.now();
  let fehler: (Error & { status?: number }) | null = null;
  // Nicht auf die Zeitgrenze des Arbeiters (10 Minuten) warten: Ein Hänger fällt nach FALL_MS auf.
  let uhr: NodeJS.Timeout | undefined;
  const zuLange = new Promise<'zu lange'>((ok) => {
    uhr = setTimeout(() => ok('zu lange'), FALL_MS);
  });
  try {
    const r = await Promise.race([v.lauf(pdf), zuLange]);
    assert.notEqual(r, 'zu lange', `${wo}, ${v.name}: über ${FALL_MS / 1000} s – hängt`);
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    fehler = e as Error & { status?: number };
  } finally {
    clearTimeout(uhr);
  }
  const ms = Date.now() - start;
  assert.ok(ms < FALL_MS, `${wo}, ${v.name}: ${ms} ms – zu lange`);
  if (!fehler) return;
  // 500 (Absturz), 504 (Zeitgrenze), 507 (Speicher): ein kaputtes PDF darf den Arbeiter nicht so treffen.
  assert.ok(![500, 504, 507].includes(fehler.status ?? 0), `${wo}, ${v.name}: Arbeiter getroffen (${fehler.status}) – ${fehler.message}`);
  assert.ok(fehler.message.trim().length > 0, `${wo}, ${v.name}: Fehler ohne Meldung`);
  if (v.meldung) assert.equal(fehler.status, 422, `${wo}, ${v.name}: keine verständliche Meldung – ${fehler.message}`);
}

describe('Tests mit kaputten PDFs (#823)', () => {
  before(() => {
    richteArbeiterEin({ DMS_ARBEITER: '2' });
  });
  after(async () => {
    await beendeArbeiter();
  });

  it('Korpus und Objektstrom-Bombe: alle Lesestellen enden sauber', async () => {
    const liste = [
      ...(await ausgang()).filter((x) => x.name.startsWith('korpus/')),
      { name: 'objektstrom-bombe', pdf: objektstromBombe() },
    ];
    assert.ok(liste.length >= 9, 'Korpus vorhanden');
    for (const x of liste) for (const v of VORGAENGE) await pruefe(v, x.pdf, x.name);
  });

  it(`zufällig veränderte PDFs (${FAELLE} Fälle, Startwert ${SEED}): kein Absturz, kein Hänger, verständliche Meldung`, async () => {
    const quellen = await ausgang();
    const z = zufall(SEED);
    for (let i = 0; i < FAELLE; i++) {
      const q = z.aus(quellen);
      let pdf = q.pdf;
      for (let k = 0, n = 1 + z.n(3); k < n; k++) pdf = veraendere(pdf, z);
      const v = VORGAENGE[i % VORGAENGE.length];
      await pruefe(v, pdf, `Fall ${i} (Startwert ${SEED}, aus ${q.name})`);
    }
  });
});
