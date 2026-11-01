/**
 * Schwärzen (#392): Stellen werden endgültig entfernt – nicht nur überdeckt. Geprüft wird mit pdftotext,
 * im Volltext, in der Suche und im PDF-Rohinhalt (auch entpackt mit qpdf --qdf), dazu Metadaten,
 * Anmerkungen und eingebettete Dateien.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { analysiere, exifAusrichtung, liesBbox, liesTsv, maleSchwarz, pnmKopf, schwaerze, textAus, verbleibende } from '../src/schwaerzen';
import {
  bereicheVon, findeBegriff, findeMuster, geschwaerztName, ibanGueltig, pruefeBegriffe, pruefeBereiche, steuerIdGueltig, stellenText, type SchwaerzSeite, type Wort,
} from '../../shared/src/schwaerzen';
import { pdfMitText } from './hilfen';

const ich = '00000000-0000-4000-8000-000000000001';
const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));
const lauf = (cmd: string, args: string[]) => new Promise<string>((ok, f) => execFile(cmd, args, { maxBuffer: 64 << 20, encoding: 'latin1' }, (e, out) => (e ? f(e) : ok(out))));

async function mitDatei<T>(inhalt: Buffer, f: (pfad: string, dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-test-schwarz-'));
  try { await writeFile(join(dir, 'a.pdf'), inhalt); return await f(join(dir, 'a.pdf'), dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const pdftext = (pdf: Buffer) => mitDatei(pdf, (p) => lauf('pdftotext', ['-enc', 'UTF-8', p, '-']));
/** Alle Objekte entpackt und ohne Objektströme (qpdf --qdf) – so steht jeder Text lesbar in der Datei. */
const qdf = (pdf: Buffer) => mitDatei(pdf, async (p, dir) => { await lauf('qpdf', ['--qdf', '--object-streams=disable', p, join(dir, 'q.pdf')]); return readFile(join(dir, 'q.pdf'), 'latin1'); });

const ZEILEN = ['Max Mustermann geb. 01.02.1980', 'IBAN DE89 3704 0044 0532 0130 00', 'Gehalt 4711 Euro brutto', 'Kontakt max@example.org'];
const GEHEIM = ['Mustermann', 'DE89', '3704 0044', '0532', '1980'];

/** Ein PDF wie aus dem Leben: Textebene, Titel/Autor/Schlagworte, XMP, eine Anmerkung und eine eingebettete Datei. */
async function pdfMitAllem(): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfMitText(ZEILEN, 14));
  doc.setTitle('Gehaltsnachweis Mustermann'); doc.setAuthor('Mustermann'); doc.setKeywords(['DE89370400440532013000']);
  const xmp = doc.context.stream('<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:creator>Mustermann</dc:creator></x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' });
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmp));
  const anm = doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30], Contents: PDFString.of('Notiz zu Mustermann') });
  doc.getPage(0).node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(anm)]));
  await doc.attach(Buffer.from('Mustermann IBAN DE89370400440532013000'), 'geheim.txt', { mimeType: 'text/plain' });
  doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert("Mustermann")') }));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('Bausteine (#392)', () => {
  it('IBAN und Steuer-Id mit Prüfziffer', () => {
    assert.ok(ibanGueltig('DE89 3704 0044 0532 0130 00'));
    assert.ok(!ibanGueltig('DE89 3704 0044 0532 0130 01'));
    assert.ok(steuerIdGueltig('86095742719'));
    assert.ok(!steuerIdGueltig('86095742718'));
    assert.ok(!steuerIdGueltig('06095742719'));
  });

  const seite = (text: string): SchwaerzSeite => ({
    breite: 600, hoehe: 800,
    woerter: text.split('\n').flatMap((z, zeile) => z.split(' ').map((w, i): Wort => [w, 0.05 + i * 0.1, 0.1 + zeile * 0.05, 0.08, 0.02])),
  });

  it('Suchbegriff: ohne Groß-/Kleinschreibung, über Wörter, auch ohne Leerzeichen', () => {
    const s = [seite('Herr Max MUSTERMANN, Musterstraße 1\nIBAN DE89370400440532013000 Max Mustermann'), seite('nichts hier')];
    assert.deepEqual(findeBegriff(s, 'mustermann').map((f) => [f.seite, f.woerter]), [[1, [2]], [1, [8]]]);
    assert.deepEqual(findeBegriff(s, 'Max  Mustermann').map((f) => f.woerter), [[1, 2], [7, 8]]);
    assert.deepEqual(findeBegriff(s, 'DE89 3704 0044').map((f) => f.woerter), [[6]], 'ohne Leerzeichen, ganzes Wort');
    assert.deepEqual(findeBegriff(s, '  '), []);
    const b = bereicheVon(s, findeBegriff(s, 'max mustermann'));
    assert.equal(b.length, 2, 'Wörter einer Zeile werden ein Kasten');
    assert.ok(b[0].x < 0.15 && b[0].x + b[0].b > 0.33, 'mit Rand');
    assert.equal(stellenText(b), '2 Stellen auf 1 Seite');
  });

  it('Vorschläge per Muster', () => {
    const s = [seite('Anna Beispiel geb. 03.04.1975 in Bonn\nIBAN DE89 3704 0044 0532 0130 00 Danke\nTelefon 0351 1234567 oder +49 (0) 30 123456\nE-Mail anna.b@example.org Steuer-Id 86 095 742 719\nRechnung vom 01.02.2024 Betrag 4711,00')];
    const f = findeMuster(s);
    const nach = (art: string) => f.filter((x) => x.art === art).map((x) => x.text);
    assert.deepEqual(nach('iban'), ['DE89 3704 0044 0532 0130 00'], 'die IBAN endet vor „Danke“');
    assert.deepEqual(nach('geburtsdatum'), ['03.04.1975'], 'nur mit „geb.“ davor');
    assert.deepEqual(nach('email'), ['anna.b@example.org']);
    assert.deepEqual(nach('steuerid'), ['86 095 742 719']);
    assert.deepEqual(nach('telefon'), ['0351 1234567', '+49 (0) 30 123456']);
    assert.deepEqual(findeMuster(s, ['email']).map((x) => x.art), ['email']);
  });

  it('Eingaben prüfen', () => {
    assert.deepEqual(pruefeBereiche([{ seite: 1, x: 0.1, y: 0.2, b: 0.3, h: 0.1 }], 2), [{ seite: 1, x: 0.1, y: 0.2, b: 0.3, h: 0.1 }]);
    assert.equal(pruefeBereiche([{ seite: 2, x: 0.9, y: 0.9, b: 0.5, h: 0.5 }], 2)[0].b, 0.1, 'auf die Seite begrenzt');
    assert.throws(() => pruefeBereiche([{ seite: 3, x: 0, y: 0, b: 1, h: 1 }], 2), /Seite 3 gibt es nicht/);
    assert.throws(() => pruefeBereiche([{ seite: 1, x: 'a', y: 0, b: 1, h: 1 }], 2), /Zahlen/);
    assert.throws(() => pruefeBereiche([{ seite: 1, x: 0, y: 0, b: 0, h: 1 }], 2), /größer 0/);
    assert.deepEqual(pruefeBegriffe([' Max ', 'Max', '']), ['Max']);
    assert.throws(() => pruefeBegriffe(['x'.repeat(201)]), /200 Zeichen/);
    assert.equal(geschwaerztName('Kontoauszug.pdf'), 'Kontoauszug (geschwärzt).pdf');
    assert.equal(geschwaerztName('ohne'), 'ohne (geschwärzt)');
  });

  it('pdftotext -bbox und tesseract-TSV lesen; gedrehte Seiten', () => {
    const html = '<doc><page width="595.000000" height="842.000000"><word xMin="59.5" yMin="84.2" xMax="119" yMax="168.4">A&amp;B</word></page>'
      + '<page width="595.000000" height="842.000000"><word xMin="84.2" yMin="59.5" xMax="168.4" yMax="119">quer</word></page></doc>';
    const s = liesBbox(html, [0, 90]);
    assert.deepEqual(s[0], { breite: 595, hoehe: 842, woerter: [['A&B', 0.1, 0.1, 0.1, 0.1]] });
    assert.deepEqual(s[1], { breite: 842, hoehe: 595, woerter: [['quer', 0.1, 0.1, 0.1, 0.1]] });
    const tsv = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t1000\t500\t-1\t\n5\t1\t1\t1\t1\t1\t100\t50\t200\t25\t96\tHallo\n';
    assert.deepEqual(liesTsv(tsv, 1000, 500), [['Hallo', 0.1, 0.1, 0.2, 0.05]]);
  });

  it('Bildpunkte schwarz füllen, Volltext aus den verbleibenden Wörtern', () => {
    const px = Buffer.concat([Buffer.from('P6\n4 2\n255\n', 'latin1'), Buffer.alloc(4 * 2 * 3, 200)]);
    const k = pnmKopf(px);
    assert.deepEqual({ ...k }, { breite: 4, hoehe: 2, kanaele: 3, start: 11 });
    maleSchwarz(px, k, [{ seite: 1, x: 0.25, y: 0.5, b: 0.3, h: 0.5 }]);
    const p = (x: number, y: number) => px[k.start + (y * 4 + x) * 3];
    assert.deepEqual([p(0, 1), p(1, 1), p(2, 1), p(3, 1), p(1, 0)], [200, 0, 0, 200, 200], 'nach außen gerundet');
    const s: SchwaerzSeite[] = [{ breite: 100, hoehe: 100, woerter: [['eins', 0.1, 0.1, 0.1, 0.05], ['zwei', 0.3, 0.1, 0.1, 0.05], ['drei', 0.1, 0.2, 0.1, 0.05]] }];
    const bleibt = verbleibende(s, [{ seite: 1, x: 0.35, y: 0.12, b: 0.01, h: 0.01 }]);
    assert.equal(textAus(bleibt), 'eins\ndrei');
  });

  it('EXIF-Ausrichtung', () => {
    const exif = (o: number) => {
      const tiff = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0, 0, 0]);
      const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0, tiff.length + 8]), Buffer.from('Exif\0\0', 'latin1'), tiff]);
      return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xda, 0, 2])]);
    };
    assert.equal(exifAusrichtung(exif(6)), 6);
    assert.equal(exifAusrichtung(exif(1)), 1);
    assert.equal(exifAusrichtung(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2])), 1);
  });
});

describe('Schwärzen: Restdaten im PDF (#392, Sicherheits-Review S1)', () => {
  it('Begriff, Muster und Bereich sind weder als Text noch im Rohinhalt noch in Metadaten zu finden', async () => {
    const pdf = await pdfMitAllem();
    // Vorher steht alles drin – sonst bewiese der Test nichts.
    const roh0 = await qdf(pdf);
    for (const g of ['Mustermann', 'DE89370400440532013000', 'Gehalt']) assert.ok(roh0.includes(g), g);
    const a = await analysiere(pdf, 'application/pdf');
    assert.equal(a.quelle, 'textebene');
    assert.equal(a.seiten.length, 1);
    const funde = [...findeBegriff(a.seiten, 'Mustermann'), ...findeMuster(a.seiten, ['iban', 'geburtsdatum'])];
    assert.equal(funde.length, 3);
    // Dazu ein von Hand aufgezogener Bereich über „4711“.
    const w = a.seiten[0].woerter.find((x) => x[0] === '4711')!;
    const bereiche = [...bereicheVon(a.seiten, funde), { seite: 1, x: w[1] - 0.005, y: w[2] - 0.003, b: w[3] + 0.01, h: w[4] + 0.006 }];
    const r = await schwaerze(pdf, 'application/pdf', a, bereiche);
    assert.equal(r.mime, 'application/pdf');
    assert.equal(r.seiten, 1);
    assert.equal(r.bereiche, 4);

    const text = await pdftext(r.inhalt);
    for (const g of [...GEHEIM, '4711']) assert.ok(!text.includes(g), `pdftotext: ${g}`);
    for (const bleibt of ['Max', 'IBAN', 'Gehalt', 'Euro', 'brutto', 'Kontakt', 'max@example.org']) assert.ok(text.includes(bleibt), `bleibt kopierbar: ${bleibt}`);
    assert.ok(r.text && !GEHEIM.some((g) => r.text!.includes(g)) && r.text.includes('Gehalt'));

    const roh = r.inhalt.toString('latin1');
    const entpackt = await qdf(r.inhalt);
    for (const g of ['Mustermann', 'DE89', '370400440532013000', '4711', 'geheim.txt', 'JavaScript', 'Annot', 'Metadata', 'EmbeddedFile', 'Gehaltsnachweis', 'Author', 'Keywords']) {
      assert.ok(!roh.includes(g) && !entpackt.includes(g), `Rohinhalt: ${g}`);
    }
    const neu = await PDFDocument.load(r.inhalt, { updateMetadata: false });
    assert.equal(neu.getTitle(), undefined);
    assert.equal(neu.getAuthor(), undefined);
    assert.equal(neu.getPageCount(), 1);
    const info = await mitDatei(r.inhalt, (p) => lauf('pdfinfo', [p]));
    assert.doesNotMatch(info, /Mustermann|Title:|Author:/);

    // Und die Seite ist an den Stellen wirklich schwarz (Bildpunkte gerendert).
    const px = await mitDatei(r.inhalt, async (p, dir) => { await lauf('pdftoppm', ['-r', '72', '-gray', p, join(dir, 's')]); return readFile(join(dir, 's-1.pgm')); });
    const k = pnmKopf(px);
    const mitte = (x: number, y: number) => px[k.start + Math.round(y * k.hoehe) * k.breite + Math.round(x * k.breite)];
    assert.ok(mitte(w[1] + w[3] / 2, w[2] + w[4] / 2) < 40, '„4711“ ist schwarz');
  });

  it('gedrehte Seiten, mehrere Seiten, nur betroffene Wörter fehlen', async () => {
    const a1 = await PDFDocument.load(pdfMitText(['Seite eins Geheimwort', 'bleibt stehen'], 14));
    const a2 = await PDFDocument.load(pdfMitText(['Quer Geheimwort hier'], 14, 90));
    const doc = await PDFDocument.create();
    for (const q of [a1, a2]) for (const p of await doc.copyPages(q, [0])) doc.addPage(p);
    const pdf = Buffer.from(await doc.save());
    const a = await analysiere(pdf, 'application/pdf');
    assert.deepEqual(a.seiten.map((s) => [s.breite, s.hoehe]), [[595, 842], [842, 595]]);
    const r = await schwaerze(pdf, 'application/pdf', a, bereicheVon(a.seiten, findeBegriff(a.seiten, 'geheimwort')));
    const text = await pdftext(r.inhalt);
    assert.ok(!/Geheimwort/i.test(text));
    for (const bleibt of ['eins', 'bleibt', 'stehen', 'Quer', 'hier']) assert.ok(text.includes(bleibt), bleibt);
    const neu = await PDFDocument.load(r.inhalt);
    assert.deepEqual(neu.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight()), p.getRotation().angle]), [[595, 842, 0], [842, 595, 0]], 'wie angezeigt, ohne /Rotate');
  });

  it('verschlüsselte oder kaputte PDFs: verständliche Meldung', async () => {
    await assert.rejects(analysiere(Buffer.from('%PDF-1.4 kaputt'), 'application/pdf'), status(422));
  });
});

/** Ein Bild mit Text (aus einem PDF gerendert) – für Bilder und Texterkennung. */
async function bildMitText(format: 'png' | 'jpeg'): Promise<Buffer> {
  return mitDatei(pdfMitText(['SECRET 4711 CODE', 'PUBLIC WORDS HERE'], 40), async (p, dir) => {
    await lauf('pdftoppm', ['-r', '100', `-${format}`, '-singlefile', p, join(dir, 'b')]);
    return readFile(join(dir, `b.${format === 'png' ? 'png' : 'jpg'}`));
  });
}
const hatTesseract = await lauf('tesseract', ['--version']).then(() => true, () => false);

describe('Bilder schwärzen (#392)', () => {
  it('PNG bleibt PNG, gleiche Größe, Bereich schwarz', async () => {
    const png = await bildMitText('png');
    const a = await analysiere(png, 'image/png');
    assert.equal(a.seiten.length, 1);
    assert.equal(a.quelle, 'keine', 'ohne Sprachen keine Texterkennung');
    const r = await schwaerze(png, 'image/png', a, [{ seite: 1, x: 0, y: 0, b: 0.5, h: 0.2 }]);
    assert.equal(r.mime, 'image/png');
    assert.equal(r.inhalt.subarray(1, 4).toString(), 'PNG');
    assert.equal(r.inhalt.readUInt32BE(16), png.readUInt32BE(16), 'Breite bleibt');
    assert.equal(r.inhalt.readUInt32BE(20), png.readUInt32BE(20), 'Höhe bleibt');
    assert.equal(r.text, null);
  });

  it('JPEG mit EXIF-Ausrichtung wird aufgerichtet, ohne EXIF gespeichert', async () => {
    const jpg = await bildMitText('jpeg');
    const tiff = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0]);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0, tiff.length + 8]), Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const gedreht = Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]);
    const a = await analysiere(gedreht, 'image/jpeg');
    assert.ok(a.seiten[0].breite > a.seiten[0].hoehe, 'quer wie angezeigt (das Bild selbst ist hochkant)');
    const r = await schwaerze(gedreht, 'image/jpeg', a, [{ seite: 1, x: 0, y: 0, b: 1, h: 0.1 }]);
    assert.equal(r.mime, 'image/jpeg');
    assert.equal(exifAusrichtung(r.inhalt), 1);
    assert.ok(!r.inhalt.includes(Buffer.from('Exif\0\0', 'latin1')));
  });

  it('Texterkennung findet Wörter im Bild; der Begriff fehlt danach im Volltext', { skip: hatTesseract ? false : 'tesseract fehlt' }, async () => {
    const png = await bildMitText('png');
    const a = await analysiere(png, 'image/png', { sprachen: 'eng' });
    assert.equal(a.quelle, 'texterkennung');
    const f = findeBegriff(a.seiten, '4711');
    assert.equal(f.length, 1);
    const r = await schwaerze(png, 'image/png', a, bereicheVon(a.seiten, f));
    assert.ok(r.text && /PUBLIC/.test(r.text) && !r.text.includes('4711'));
    // Gegenprobe: Die Texterkennung liest im Ergebnis „4711“ nicht mehr.
    const neu = await mitDatei(r.inhalt, async (_p, dir) => { await writeFile(join(dir, 'n.png'), r.inhalt); return lauf('tesseract', [join(dir, 'n.png'), 'stdout', '-l', 'eng']); });
    assert.ok(/PUBLIC/.test(neu) && !neu.includes('4711'), neu);
  });
});

async function aufbau(repo: Repo, versionierung = true) {
  const d = new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const t = await d.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente', versionierung },
  ] });
  const m = await d.legeMappeAn({ typId: t.id, werte: { name: 'Gehalt' } }, null);
  const pdf = await pdfMitAllem();
  const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'nachweis.pdf', typ: 'application/pdf' }, pdf, null);
  // Der Volltext des Originals (wie nach der Texterkennung).
  await (d as unknown as { repo: Repo }).repo.ocrSetze(dokument.id, { stand: 'fertig', text: ZEILEN.join('\n'), seiten: 1, info: 'Textebene des PDFs' });
  const ereignisse: string[] = [];
  const melde = d.melde.bind(d);
  d.melde = async (art, ...rest) => { ereignisse.push(art); return melde(art, ...rest); };
  return { d, t, m, dokument, pdf, ereignisse };
}

describe('Schwärzen am Dokument (#392)', () => {
  it('eigenes Dokument „… (geschwärzt)“, Original bleibt, Historie ohne Inhalt, Ereignis wie beim Hochladen', async () => {
    const { d, m, dokument, ereignisse } = await aufbau(speicherRepo());
    const v = await d.schwaerzenVorschau(dokument.id);
    assert.equal(v.kopieName, 'nachweis (geschwärzt).pdf');
    assert.equal(v.versioniert, true);
    assert.equal(v.seiten.length, 1);
    assert.ok(v.seiten[0].woerter.some((w) => w[0] === 'Mustermann'));
    const r = await d.schwaerzeDokument(dokument.id, { begriffe: ['mustermann', 'gibt es nicht'], muster: ['iban'] }, ich);
    assert.equal(r.ziel, 'kopie');
    assert.equal(r.dokument.name, 'nachweis (geschwärzt).pdf');
    assert.notEqual(r.dokument.id, dokument.id);
    assert.equal(r.dokument.herkunft, 'geschwaerzt');
    assert.deepEqual(r.begriffe, [{ gefunden: 1 }, { gefunden: 0 }]);
    assert.equal(r.stellen, 2);
    assert.match(r.meldung, /Original bleibt unverändert/);
    const vt = (await d.volltext(r.dokument.id)).text!;
    assert.ok(vt.includes('Gehalt 4711') && !vt.includes('Mustermann') && !vt.includes('DE89'), vt);
    assert.equal(r.dokument.ocr?.stand, 'fertig', 'keine neue Texterkennung nötig');
    const original = await d.holeDokument(dokument.id);
    assert.equal(original.sha256, dokument.sha256, 'Original unverändert');
    assert.equal(original.version ?? 1, 1);
    assert.ok(ereignisse.includes('dokument.hochgeladen'));
    const h = await d.historie(m.id);
    const e = h.find((x) => x.art === 'geschwaerzt')!;
    assert.match(String(e.daten.text), /^geschwärzte Fassung „nachweis \(geschwärzt\)\.pdf“ von „nachweis\.pdf“ erstellt \(2 Stellen auf 1 Seite\)$/);
    assert.equal(e.benutzerId, ich);
    assert.ok(!/mustermann|gibt es nicht|DE89/i.test(JSON.stringify(h)), 'keine Suchbegriffe und kein Inhalt in der Historie');
    // Ein zweites Mal: Zähler im Namen.
    const z = await d.schwaerzeDokument(dokument.id, { bereiche: [{ seite: 1, x: 0, y: 0, b: 0.5, h: 0.5 }] }, ich);
    assert.equal(z.dokument.name, 'nachweis (geschwärzt) (2).pdf');
  });

  it('als neue Version; ohne Versionierung nur als Kopie; Fehler', async () => {
    const { d, dokument } = await aufbau(speicherRepo());
    const r = await d.schwaerzeDokument(dokument.id, { begriffe: ['Mustermann'], ziel: 'version' }, ich);
    assert.equal(r.dokument.id, dokument.id);
    assert.equal(r.dokument.version, 2);
    assert.equal(r.dokument.herkunft, 'geschwaerzt');
    assert.ok(!(await d.volltext(dokument.id)).text!.includes('Mustermann'));
    assert.equal((await d.versionen(dokument.id)).aeltere[0].sha256, dokument.sha256, 'die ungeschwärzte bleibt als Version 1');
    await assert.rejects(d.schwaerzeDokument(dokument.id, { begriffe: ['Mondlandung'] }, ich), status(422, /Suchbegriff kommt im Text des Dokuments nicht vor/));
    await assert.rejects(d.schwaerzeDokument(dokument.id, {}, ich), status(422, /Bitte Bereiche/));
    await assert.rejects(d.schwaerzeDokument(dokument.id, { muster: ['postleitzahl'] }, ich), status(422, /muster/));
    await assert.rejects(d.schwaerzeDokument(dokument.id, { bereiche: [{ seite: 2, x: 0, y: 0, b: 1, h: 1 }] }, ich), status(422, /Seite 2 gibt es nicht/));
    await assert.rejects(d.schwaerzeDokument(dokument.id, { begriffe: ['x'], ziel: 'irgendwo' }, ich), status(422));

    const o = await aufbau(speicherRepo(), false);
    await assert.rejects(o.d.schwaerzeDokument(o.dokument.id, { begriffe: ['Mustermann'], ziel: 'version' }, ich), status(409, /nur ein eigenes Dokument/));
    const k = await o.d.schwaerzeDokument(o.dokument.id, { begriffe: ['Mustermann'] }, ich);
    assert.equal((await o.d.holeMappe(o.m.id)).dokumente.length, 2);
    assert.equal(k.dokument.name, 'nachweis (geschwärzt).pdf');
    const txt = (await o.d.ladeHoch(o.m.id, { register: 'dokumente', name: 'a.txt', typ: 'text/plain' }, Buffer.from('Mustermann'), null)).dokument;
    await assert.rejects(o.d.schwaerzenVorschau(txt.id), status(422, /PDFs und Bildern/));
    await assert.rejects(o.d.schwaerzeDokument(txt.id, { begriffe: ['Mustermann'] }, ich), status(422, /PDFs und Bildern/));
  });

  it('Seitenbild für den Dialog', async () => {
    const { d, dokument } = await aufbau(speicherRepo());
    const b = await d.schwaerzSeitenbild(dokument.id, 1);
    assert.ok(b && b[0] === 0xff && b[1] === 0xd8);
    assert.equal(await d.schwaerzSeitenbild(dokument.id, 0), null);
  });
});

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const offen: Array<{ end(): Promise<void> }> = [];
async function pgRepo(): Promise<Repo> {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo: repo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_sw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return repo(sql, HAUSHALT) as never;
}

describe('Suche nach dem Schwärzen in PostgreSQL (#392)', { skip: process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  after(async () => { for (const s of offen.splice(0)) await s.end(); });
  const admin = { id: ich, rolle: 'admin' };

  it('neue Version: die Suche findet den Begriff nicht mehr, den Rest schon', async () => {
    const { d, t, dokument } = await aufbau(await pgRepo());
    const suche = (q: string) => d.seite(admin, { sicht: `typ:${t.id}`, suche: q, volltext: 'true' });
    assert.equal((await suche('Mustermann')).gesamt, 1, 'vorher gefunden');
    await d.schwaerzeDokument(dokument.id, { begriffe: ['Mustermann'], muster: ['iban'], ziel: 'version' }, null);
    assert.equal((await suche('Mustermann')).gesamt, 0);
    assert.equal((await suche('DE89')).gesamt, 0);
    assert.equal((await suche('brutto')).gesamt, 1, 'der übrige Text bleibt durchsuchbar');
  });

  it('Kopie in einer Transaktion; ohne das Original findet die Suche nichts mehr', async () => {
    const { d, t, m, dokument } = await aufbau(await pgRepo(), false);
    const r = await d.schwaerzeDokument(dokument.id, { begriffe: ['Mustermann'] }, null);
    const suche = (q: string) => d.seite(admin, { sicht: `typ:${t.id}`, suche: q, volltext: 'true' });
    assert.ok(!(await d.volltext(r.dokument.id)).text!.includes('Mustermann'));
    await d.loescheDokument(dokument.id, null);
    assert.equal((await suche('Mustermann')).gesamt, 0);
    const s = await suche('brutto') as { gesamt: number; ausschnitte?: Record<string, { dokument: string }> };
    assert.equal(s.gesamt, 1);
    assert.equal(s.ausschnitte?.[m.id]?.dokument, 'nachweis (geschwärzt).pdf');
    assert.ok((await d.historie(m.id)).some((h) => h.art === 'geschwaerzt'));
  });
});
