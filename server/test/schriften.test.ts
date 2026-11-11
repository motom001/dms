/**
 * Schriften der eigenen PDFs (#826): Noto Sans als Teilmenge statt der Standardschriften mit WinAnsi.
 *
 * Geprüft wird nicht nur der Text (pdftotext), sondern auch die **Anzeige**: Im Probelauf meldete pdftotext alles richtig,
 * obwohl mit der unaufbereiteten Schrift etwa 60 % der Zeichen unsichtbar waren. Darum rendert der Test jedes Zeichen der
 * Beispiele einzeln mit pdftoppm und erwartet Tinte in seinem Feld – in allen Schnitten und im zweiten PDF desselben
 * Arbeiters (die Schrift wird je Arbeiter nur einmal ausgewertet).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib';
import { beendeArbeiter } from '../src/arbeit';
import { analysiereSchwaerzen, aufkleberbogenPdf, briefPdf, mappenPdfZeichnen, schwaerze, stempelePdf, textdokumentPdf } from '../src/pdf';
import { ERSATZZEICHEN, fehlendeZeichen, pdfText, schriften, type Schnitt } from '../src/pdf/schrift';
import { protokoll } from '../src/protokoll';
import { NEUER_STEMPEL } from '../../shared/src/stempel';
import { BEISPIELE, beispielBrief, inhaltsstrom, NFD } from './hilfen-schriften';

after(() => beendeArbeiter());

const hatPoppler = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const ohnePoppler = !hatPoppler && 'ohne poppler (pdftoppm, pdftotext)';

function mitDatei<T>(pdf: Uint8Array, f: (pfad: string, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'schriften-'));
  try { writeFileSync(join(dir, 'a.pdf'), pdf); return f(join(dir, 'a.pdf'), dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** Text wie beim Kopieren, nach NFC (pdftotext gibt Akzente teils zerlegt aus). */
const pdftext = (pdf: Uint8Array, ...args: string[]) => mitDatei(pdf, (p) => execFileSync('pdftotext', [...args, p, '-'], { encoding: 'utf8' })).normalize('NFC');

/** Seite als Graustufenbild (PGM): Breite, Höhe, Bildpunkte. */
function graubild(pdf: Uint8Array, dpi: number): { b: number; h: number; px: Buffer } {
  return mitDatei(pdf, (p, dir) => {
    execFileSync('pdftoppm', ['-gray', '-r', String(dpi), '-f', '1', '-l', '1', p, join(dir, 'r')]);
    const roh = readFileSync(join(dir, 'r-1.pgm'));
    const kopf = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(roh.subarray(0, 40).toString('latin1'))!;
    return { b: Number(kopf[1]), h: Number(kopf[2]), px: roh.subarray(kopf[0].length) };
  });
}

/** Alle Zeichen der Beispiele (ohne Leerzeichen), einmal. */
const ZEICHEN = [...new Set([...Object.values(BEISPIELE).join(''), ...NFD.normalize('NFC'), ...'Kód: ŁÓDŹ-ŞİĞ-ЖЁ'])].filter((z) => z.trim());

const FELD = 24, SPALTEN = 20, RAND = 24, GROESSE = 16;
/** Jedes Zeichen in einem eigenen Feld, ein Schnitt je Seite. */
async function zeichenTafel(schnitt: Schnitt): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f = (await schriften(doc, [schnitt]))[schnitt];
  const zeilen = Math.ceil(ZEICHEN.length / SPALTEN);
  const seite = doc.addPage([2 * RAND + SPALTEN * FELD, 2 * RAND + zeilen * FELD]);
  ZEICHEN.forEach((z, i) => {
    const x = RAND + (i % SPALTEN) * FELD, y = seite.getHeight() - RAND - (Math.floor(i / SPALTEN) + 1) * FELD;
    seite.drawText(pdfText(z, f), { x: x + 4, y: y + 6, size: GROESSE, font: f, color: rgb(0, 0, 0) });
  });
  return doc.save();
}

describe('Schriften der eigenen PDFs (#826)', () => {
  it('Brief mit Türkisch, Polnisch, Tschechisch, Russisch, Griechisch, Vietnamesisch: Text auslesbar, kein „?“', { skip: ohnePoppler }, async () => {
    const r = await briefPdf(beispielBrief());
    assert.ok('pdf' in r);
    const text = pdftext(r.pdf, '-raw').replace(/\s+/g, ' ');
    for (const [sprache, zeile] of Object.entries(BEISPIELE)) assert.ok(text.includes(zeile), `${sprache}: ${zeile}`);
    assert.ok(text.includes('Kód: ŁÓDŹ-ŞİĞ-ЖЁ'), 'Code in Noto Sans Mono');
    assert.ok(!text.includes('?') && !text.includes(ERSATZZEICHEN), 'weder „?“ noch Ersatzzeichen');
  });

  it('ccmp aus: Kopieren von „Thị Liste office“ liefert genau diesen Text', { skip: ohnePoppler }, async () => {
    const pdf = await textdokumentPdf({ titel: 'ccmp', anweisungen: [{ art: 'text', text: 'Thị Liste office' }] });
    assert.equal(pdftext(pdf, '-raw').trim(), 'Thị Liste office');
  });

  it('NFD-Eingabe erscheint wie NFC – als zusammengesetzte Buchstaben', { skip: ohnePoppler }, async () => {
    const pdf = await textdokumentPdf({ titel: 'nfd', anweisungen: [{ art: 'text', text: NFD }] });
    const roh = mitDatei(pdf, (p) => execFileSync('pdftotext', ['-raw', p, '-'], { encoding: 'utf8' })).trim();
    assert.equal(roh, NFD.normalize('NFC'), 'schon im PDF zusammengesetzt, nicht erst beim Auslesen');
  });

  for (const schnitt of ['normal', 'fett', 'kursiv', 'fettKursiv', 'mono'] as const) {
    it(`Anzeige (${schnitt}): jedes Zeichen der Beispiele ist sichtbar und wieder auslesbar`, { skip: ohnePoppler }, async () => {
      await zeichenTafel(schnitt); // erstes PDF: Die Schrift ist danach im Arbeiter ausgewertet.
      const pdf = await zeichenTafel(schnitt);
      const dpi = 72;
      const bild = graubild(pdf, dpi);
      const leer: string[] = [];
      ZEICHEN.forEach((z, i) => {
        const x0 = RAND + (i % SPALTEN) * FELD, y0 = RAND + Math.floor(i / SPALTEN) * FELD;
        let tinte = 0;
        for (let y = y0 + 1; y < y0 + FELD - 1; y++) for (let x = x0 + 1; x < x0 + FELD - 1; x++) if (bild.px[y * bild.b + x] < 128) tinte++;
        if (tinte < 3) leer.push(z);
      });
      assert.deepEqual(leer, [], `ohne sichtbare Form: ${leer.join(' ')}`);
      const text = pdftext(pdf, '-raw').replace(/\s+/g, '');
      assert.equal(text, ZEICHEN.join(''), 'jedes Zeichen kommt beim Kopieren wieder heraus');
    });
  }

  it('Teilmenge: eingebettet, mit ToUnicode, Name mit Kürzel aus sechs Großbuchstaben, klein', async () => {
    const r = await briefPdf(beispielBrief());
    assert.ok('pdf' in r);
    const doc = await PDFDocument.load(r.pdf);
    const fonts = doc.getPage(0).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
    const namen: string[] = [];
    let bytes = 0;
    // pdf-lib legt bei jedem Wechsel der Schrift einen neuen Namen in den Ressourcen an – je Schrift zählt das Objekt.
    for (const ref of new Map(fonts.entries().map(([, r]) => [r.toString(), r])).values()) {
      const f = doc.context.lookup(ref, PDFDict);
      assert.equal(f.lookup(PDFName.of('Subtype'))?.toString(), '/Type0');
      assert.ok(f.lookup(PDFName.of('ToUnicode')) instanceof PDFRawStream, 'ToUnicode');
      const cid = doc.context.lookup(f.lookup(PDFName.of('DescendantFonts'), PDFArray).get(0), PDFDict);
      const datei = cid.lookup(PDFName.of('FontDescriptor'), PDFDict).lookup(PDFName.of('FontFile2'));
      assert.ok(datei instanceof PDFRawStream, 'Schrift eingebettet');
      bytes += datei.getContentsSize();
      namen.push(f.lookup(PDFName.of('BaseFont'))!.toString().slice(1));
    }
    assert.equal(namen.length, 5, namen.join(', '));
    for (const n of namen) assert.match(n, /^[A-Z]{6}\+NotoSans(Mono)?-(Regular|Bold|Italic|BoldItalic)$/);
    assert.ok(bytes < 120 * 1024, `Teilmengen zusammen ${bytes} Bytes – statt 1,4 MB für die vollen Schriften`);
  });

  it('fehlende Zeichen: sichtbares Ersatzzeichen statt „?“, unsichtbare Zeichen fallen weg', async () => {
    const doc = await PDFDocument.create();
    const { normal } = await schriften(doc, ['normal']);
    fehlendeZeichen();
    assert.equal(pdfText('Merhaba مر 中 ❤️\u200b!', normal), `Merhaba ${ERSATZZEICHEN}${ERSATZZEICHEN} ${ERSATZZEICHEN} ${ERSATZZEICHEN}\u200b!`);
    assert.deepEqual(fehlendeZeichen().sort(), ['م', 'ر', '中', '❤'].sort());
    assert.deepEqual(fehlendeZeichen(), [], 'je Auftrag einmal, danach leer');
    assert.equal(pdfText('a\tb\r\nc\u0007', normal), 'a    b\nc', 'Tabulator, Zeilenende, Steuerzeichen');
  });

  it('fehlende Zeichen: ein Hinweis im Protokoll je Auftrag', async () => {
    const seit = Math.max(0, ...protokoll.eintraege({}).map((e) => e.nr));
    const b = beispielBrief();
    b.bloecke = [{ art: 'absatz', laeufe: [{ text: 'Arabisch: مرحبا، Chinesisch: 你好' }] }];
    const r = await briefPdf(b);
    assert.ok('pdf' in r);
    await briefPdf(beispielBrief()); // ohne fehlende Zeichen: kein Hinweis
    const e = protokoll.eintraege({ seit, stufe: 'warn' }).filter((x) => x.modul === 'dokumente' && /Schrift/.test(x.text));
    assert.equal(e.length, 1, 'genau ein Hinweis');
    assert.equal(e[0].daten?.vorgang, 'briefPdf');
    assert.ok((e[0].daten?.zeichen as string[]).includes('U+4F60'), JSON.stringify(e[0].daten));
  });

  it('alle Erzeuger: Stempel, Textdokument, Export, Aufkleber und Textebene beim Schwärzen', { skip: ohnePoppler }, async () => {
    const zeile = `${BEISPIELE.tuerkisch} ${BEISPIELE.russisch}`;
    // Textdokument (Auskunft, Löschkonzept …) und darauf ein Stempel.
    const dok = await textdokumentPdf({ titel: zeile, anweisungen: [{ art: 'text', text: zeile }, { art: 'tabelle', kopf: ['Ad', 'Ώρα'], zeilen: [[BEISPIELE.polnisch, BEISPIELE.griechisch]], gewichte: [1, 1] }] });
    assert.ok(pdftext(dok, '-raw').replace(/\s+/g, ' ').includes(zeile), 'Textdokument');
    assert.equal((await PDFDocument.load(dok)).getTitle(), zeile, 'Titel in den Eigenschaften');
    const gestempelt = await stempelePdf({ name: 'a.pdf', mime: 'application/pdf', inhalt: dok, stempel: { ...NEUER_STEMPEL, text: 'x' }, text: `Kopie für ${BEISPIELE.tschechisch}` });
    assert.ok((await inhaltsstrom(gestempelt)).text.includes(`Kopie für ${BEISPIELE.tschechisch}`), 'Stempel');
    // Export mehrerer Mappen.
    const exp = await mappenPdfZeichnen({ titel: 'Export', uebersicht: { zeile: '1 Mappe', kopf: ['Titel'], zeilen: [[BEISPIELE.vietnamesisch]] }, mappen: [{ titel: BEISPIELE.griechisch, zeile: '', register: [{ name: null, felder: [['Mieter', BEISPIELE.tuerkisch]] }], dokumente: [] }] });
    const et = pdftext(exp, '-raw').replace(/\s+/g, ' ');
    for (const z of [BEISPIELE.vietnamesisch, BEISPIELE.griechisch, BEISPIELE.tuerkisch]) assert.ok(et.includes(z), `Export: ${z}`);
    // Aufkleber: die lesbare Nummer.
    const auf = await aufkleberbogenPdf({ etikett: { breite: 70, hoehe: 37, spalten: 3, zeilen: 8 }, start: 1, aufkleber: [{ nummer: 'ŞİĞ-0001', striche: [2, 1, 2, 2, 2, 2] }] });
    assert.ok(pdftext(auf, '-raw').includes('ŞİĞ-0001'), 'Aufkleber');
    // Schwärzen: Die neue, unsichtbare Textebene liefert beim Kopieren dieselben Buchstaben.
    const a = await analysiereSchwaerzen(dok, 'application/pdf');
    const s = await schwaerze(dok, 'application/pdf', a, []);
    const st = pdftext(s.inhalt, '-raw').replace(/\s+/g, ' ');
    for (const w of ['Şahin', 'Özdemir,', 'İstanbul,', 'ılık,', 'Съешь', 'французских', 'Zażółć', 'ψυχοφθόρα']) assert.ok(st.includes(w), `Textebene: ${w}`);
  });
});
