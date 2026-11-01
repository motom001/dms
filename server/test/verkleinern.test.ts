/**
 * PDF verkleinern (#393): Bilder herunterrechnen und neu komprimieren, Textebene bleibt.
 * Testdaten: ein selbst erzeugtes großes Bild-PDF (JPEG mit 400 dpi auf A4, unsichtbarer Text darüber).
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { fuerAusgabe, weitergabeWas } from '../src/ausgabe';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst, verkleinernEinstellungAus, VERKLEINERN_STANDARD } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Mailer, MailOptionen } from '../src/mail';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { analysiere, ergebnisText, jpegMasse, mb, operatoren, stufeAus, verkleinere } from '../src/verkleinern';
import { grossesJpeg, grossesPdf, TEXT, textPdf } from './hilfen-grossespdf';

const ich = { id: '00000000-0000-4000-8000-000000000001', name: 'Anna Beispiel', email: 'anna@example.org' };
const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));
const alsPuffer = async (x: Buffer | NodeJS.ReadableStream) => (Buffer.isBuffer(x) ? x : Buffer.concat(await (x as unknown as { toArray(): Promise<Buffer[]> }).toArray()));

/** Text mit pdftotext (poppler), wie ihn auch die Volltextsuche liest. */
async function pdftext(pdf: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dms-test-text-'));
  try {
    await writeFile(join(dir, 'a.pdf'), pdf);
    return await new Promise((ok, f) => execFile('pdftotext', ['-layout', join(dir, 'a.pdf'), '-'], (e, out) => (e ? f(e) : ok(out))));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

let gross: Buffer;
let jpeg: Buffer;
before(async () => {
  jpeg = await grossesJpeg(400);
  gross = await grossesPdf({ seiten: 2, jpeg });
});

describe('Bausteine (#393)', () => {
  it('Stufen aus Eingaben, Texte', () => {
    assert.equal(stufeAus(true), 'standard');
    assert.equal(stufeAus('druck'), 'druck');
    assert.equal(stufeAus(undefined), null);
    assert.equal(stufeAus(''), null);
    assert.throws(() => stufeAus('winzig'), status(422));
    assert.equal(mb(18.4 * 1024 * 1024), '18,4 MB');
    assert.equal(ergebnisText(18.4 * 1024 * 1024, 2.1 * 1024 * 1024), 'von 18,4 MB auf 2,1 MB (−89 %)');
    assert.deepEqual(verkleinernEinstellungAus(null), VERKLEINERN_STANDARD);
    assert.equal(VERKLEINERN_STANDARD.automatisch, false, 'automatisch ist Standard aus');
  });

  it('Inhaltsstrom: cm und Do werden erkannt, Zeichenketten und eingebettete Bilder übersprungen', () => {
    const ops: string[] = [];
    operatoren(Buffer.from('q 100 0 0 200 10 20 cm (Klammer \\) (x) cm Do) Tj /Im1 Do Q BI /W 2 /H 1 ID \x00Do\xff EI q /OC <</A 1>> BDC /Im#202 Do'), (op, a) => ops.push(op === 'BDC' ? op : `${op}:${a.join(',')}`));
    assert.deepEqual(ops, ['q:', 'cm:100,0,0,200,10,20', 'Tj:', 'Do:Im1', 'Q:', 'q:', 'BDC', 'Do:Im 2']);
  });

  it('JPEG-Maße aus dem Kopf', () => {
    assert.deepEqual(jpegMasse(jpeg), { breite: 3308, hoehe: 4678, komponenten: 3 });
  });
});

describe('Verkleinern (#393)', () => {
  it('Schätzung: Bild mit 400 dpi, alle Stufen lohnen sich', async () => {
    const a = await analysiere(gross);
    assert.equal(a.seiten, 2);
    assert.equal(a.bilder, 1, 'dasselbe Bild auf beiden Seiten zählt einmal');
    assert.equal(a.hoechsteDpi, 400);
    assert.ok(a.stufen.bildschirm.geschaetzt < a.stufen.standard.geschaetzt && a.stufen.standard.geschaetzt < a.stufen.druck.geschaetzt);
    assert.ok(a.stufen.standard.lohnt);
  });

  it('Größe sinkt deutlich, Seitenzahl gleich, Text extrahierbar, Bild in Ziel-Auflösung', async () => {
    const vorher = await pdftext(gross);
    assert.match(vorher, /Rechnung Nummer 4711/);
    for (const [stufe, px] of [['bildschirm', 827], ['standard', 1240], ['druck', 2481]] as const) {
      const r = await verkleinere(gross, stufe);
      assert.equal(r.lohnt, true, stufe);
      assert.ok(r.nachher < r.vorher * (stufe === 'druck' ? 0.7 : 0.25), `${stufe}: ${r.vorher} → ${r.nachher}`);
      assert.equal(r.inhalt.length, r.nachher);
      const doc = await PDFDocument.load(r.inhalt);
      assert.equal(doc.getPageCount(), 2);
      assert.equal(await pdftext(r.inhalt), vorher, `${stufe}: Text unverändert`);
      assert.equal(r.bilder, 1);
      // Bildbreite in Bildpunkten: A4-Breite (8,27 Zoll) × dpi.
      const j = r.inhalt.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      assert.ok(Math.abs(jpegMasse(r.inhalt.subarray(j))!.breite - px) <= 1, stufe);
    }
  });

  it('Graustufen-Scan: Farbraum passt zum neuen JPEG (eine oder drei Komponenten)', async () => {
    // Ein Graustufenbild (DeviceGray, Flate) wie aus einem Scanner, 300 dpi auf A4.
    const quelle = await PDFDocument.create();
    const [b, h] = [2480, 3508];
    const px = Buffer.alloc(b * h);
    let s = 1;
    for (let i = 0; i < px.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; px[i] = 200 + ((s >> 16) & 31) - ((i % b) < 400 ? 150 : 0); }
    const seite = quelle.addPage([595.28, 841.89]);
    const name = seite.node.newXObject('Im', quelle.context.register(quelle.context.flateStream(px, { Type: 'XObject', Subtype: 'Image', Width: b, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 8 })));
    seite.node.set(PDFName.of('Contents'), quelle.context.register(quelle.context.flateStream(`q 595.28 0 0 841.89 0 0 cm ${name.toString()} Do Q`)));
    const g = Buffer.from(await quelle.save());
    const r = await verkleinere(g, 'standard');
    assert.ok(r.lohnt && r.nachher < g.length / 2);
    const doc = await PDFDocument.load(r.inhalt);
    const bilder = doc.context.enumerateIndirectObjects().map(([, o]) => o).filter((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    assert.equal(bilder.length, 1);
    const k = jpegMasse(Buffer.from(bilder[0].getContents()))!.komponenten;
    assert.equal(bilder[0].dict.get(PDFName.of('ColorSpace')), PDFName.of(k === 1 ? 'DeviceGray' : 'DeviceRGB'));
  });

  it('weniger als 10 % Ersparnis → unverändert (Original zurück)', async () => {
    const t = await textPdf();
    const r = await verkleinere(t, 'bildschirm');
    assert.equal(r.lohnt, false);
    assert.ok(r.inhalt.equals(t));
    // Schon passend aufgelöste Bilder: Druck (300 dpi) rechnet ein 150-dpi-Bild nicht hoch und nicht neu.
    const mittel = await verkleinere(gross, 'standard');
    const nochmal = await verkleinere(mittel.inhalt, 'druck');
    assert.equal(nochmal.lohnt, false);
    assert.ok(nochmal.inhalt.equals(mittel.inhalt));
  });

  it('kein PDF / verschlüsselt → 422', async () => {
    await assert.rejects(verkleinere(Buffer.from('kein pdf')), status(422));
  });
});

async function aufbau(versionierung = true) {
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen });
  const t = await d.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente', versionierung },
  ] });
  const m = await d.legeMappeAn({ typId: t.id, werte: { name: 'Strom' } }, null);
  const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'scan.pdf', typ: 'application/pdf' }, gross, null);
  const mails: Array<{ an: string; o?: MailOptionen }> = [];
  const mailer: Mailer = { async sende(an, _b, _t, o) { mails.push({ an, o }); } };
  const ereignisse: string[] = [];
  const melde = d.melde.bind(d);
  d.melde = async (art, ...rest) => { ereignisse.push(art); return melde(art, ...rest); };
  return { d, t, m, dokument, mails, mailer, ereignisse };
}

describe('Am Dokument (#393)', () => {
  it('neue Version, Volltext bleibt, Historie, kein Ereignis dokument.hochgeladen', async () => {
    const { d, m, dokument, ereignisse } = await aufbau();
    await (d as unknown as { repo: { ocrSetze(id: string, e: object): Promise<void> } }).repo.ocrSetze(dokument.id, { stand: 'fertig', text: 'erkannter Text', seiten: 2, info: 'Texterkennung' });
    const v = await d.verkleinernVorschau(dokument.id);
    assert.equal(v.versioniert, true);
    assert.equal(v.groesse, gross.length);
    const r = await d.verkleinereDokument(dokument.id, { stufe: 'standard' }, ich.id);
    assert.equal(r.unveraendert, false);
    assert.match(r.meldung, /^Verkleinert von \d+,\d MB auf \d+ KB \(−\d+ %\)\.$/);
    assert.equal(r.dokument.version, 2);
    assert.equal(r.dokument.herkunft, 'bearbeitet');
    assert.ok(r.dokument.groesse < gross.length / 4);
    assert.equal(r.dokument.ocr?.stand, 'fertig', 'keine neue Texterkennung');
    assert.equal((await d.volltext(dokument.id)).text, 'erkannter Text');
    assert.equal((await d.versionen(dokument.id)).aeltere[0].groesse, gross.length, 'Original als Version 1');
    const h = (await d.historie(m.id)).find((x) => x.art === 'pdf_bearbeitet')!;
    assert.match(String(h.daten.text), /^verkleinert von .* MB auf .* KB \(−\d+ %\), Stufe Standard \(150 dpi\)$/);
    assert.deepEqual(ereignisse, [], 'eine neue Version löst kein dokument.hochgeladen aus');
    // Nochmal: lohnt nicht mehr → unverändert mit Meldung.
    const z = await d.verkleinereDokument(dokument.id, { stufe: 'standard' }, ich.id);
    assert.equal(z.unveraendert, true);
    assert.match(z.meldung, /bleibt unverändert/);
    assert.equal((await d.holeDokument(dokument.id)).version, 2);
  });

  it('ohne Versionierung: nur mit Bestätigung, das bisherige kommt in den Papierkorb', async () => {
    const { d, m, dokument } = await aufbau(false);
    await assert.rejects(d.verkleinereDokument(dokument.id, {}, ich.id), status(409, /Bitte bestätigen/));
    const r = await d.verkleinereDokument(dokument.id, { bestaetigt: true }, ich.id);
    assert.notEqual(r.dokument.id, dokument.id);
    assert.equal(r.dokument.name, 'scan.pdf');
    const liste = (await d.holeMappe(m.id)).dokumente;
    assert.equal(liste.length, 1);
    assert.ok(liste[0].groesse < gross.length / 4);
  });

  it('Sammelaktion: Liste nach Größe mit Schätzung, Hintergrundauftrag, ohne Original', async () => {
    const { d, m, dokument } = await aufbau();
    const klein = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'text.pdf', typ: 'application/pdf' }, await textPdf(), null)).dokument;
    const l = await d.grosseDokumente({ ab: 1 });
    assert.deepEqual(l.eintraege.map((x) => x.id), [dokument.id], 'nur große PDFs');
    assert.equal(l.eintraege[0].mappeTitel, 'Strom');
    assert.ok(l.eintraege[0].lohnt && l.geschaetzteErsparnis > gross.length / 2);
    assert.equal((await d.grosseDokumente({ ab: 0 })).eintraege.at(-1)!.id, klein.id, 'größte zuerst');
    const a = d.verkleinereViele({ ids: [dokument.id, klein.id], stufe: 'bildschirm', ohneOriginal: true }, { id: ich.id, email: ich.email });
    assert.equal(a.phasen[0].einheit, 'Dokumente');
    const fertig = (await d.auftraege.warte())!;
    assert.equal(fertig.status, 'fertig');
    const e = fertig.ergebnis as { verkleinert: number; unveraendert: number; vorher: number; nachher: number };
    assert.equal(e.verkleinert, 1); assert.equal(e.unveraendert, 1);
    const neu = await d.holeDokument(dokument.id);
    assert.equal(neu.version, 2);
    assert.equal((await d.versionen(dokument.id)).aeltere.length, 0, 'ohne Original: Version 1 ist weg');
  });

  it('automatisch verkleinern ab einer Größe (Standard aus)', async () => {
    const { d, m } = await aufbau();
    assert.equal((await d.verkleinernEinstellung()).automatisch, false);
    await assert.rejects(d.setzeVerkleinernEinstellung({ automatisch: true, abMb: 0, stufe: 'standard' }), status(422));
    await d.setzeVerkleinernEinstellung({ automatisch: true, abMb: 1, stufe: 'standard' });
    const r = await d.ladeHoch(m.id, { register: 'dokumente', name: 'neu.pdf', typ: 'application/pdf' }, gross, null);
    assert.ok(r.dokument.groesse < gross.length / 4);
    assert.ok('verkleinert' in r && r.verkleinert);
    const h = (await d.historie(m.id)).find((x) => x.art === 'dokument_hochgeladen' && x.daten.dokument === 'neu.pdf')!;
    assert.match(String(h.daten.verkleinert), /^automatisch von .* \(Standard\)$/);
    // Im DMS Bearbeitetes wird nicht automatisch verkleinert; kleine Dateien auch nicht.
    const b = await d.ladeHoch(m.id, { register: 'dokumente', name: 'b.pdf', typ: 'application/pdf', herkunft: 'bearbeitet' }, gross, null);
    assert.equal(b.dokument.groesse, gross.length);
  });
});

describe('Ausgabe „verkleinert“ (#393)', () => {
  it('fuerAusgabe: erst verkleinern, dann stempeln; Kopie, kein PDF bleibt', async () => {
    const r = await fuerAusgabe({ name: 'scan.pdf', mime: 'application/pdf', inhalt: gross }, { verkleinern: 'standard' }, { benutzer: 'A', mappe: 'M' });
    assert.ok(r.verkleinert && r.inhalt.length < gross.length / 4);
    const s = await fuerAusgabe({ name: 'scan.pdf', mime: 'application/pdf', inhalt: gross }, {
      verkleinern: 'standard', stempel: { stempel: { text: 'KOPIE', lage: 'kopf', deckkraft: 0.3, seiten: 'alle', seitenzahlen: false, archivnummer: false }, empfaenger: '', vorlage: null, pflicht: false },
    }, { benutzer: 'A', mappe: 'M' });
    assert.equal(s.gestempelt, true);
    assert.ok(s.inhalt.length < gross.length / 4, 'gestempelt bleibt es klein');
    assert.match(await pdftext(s.inhalt), /KOPIE/);
    assert.match(await pdftext(s.inhalt), /Rechnung Nummer 4711/);
    assert.equal(weitergabeWas([s]), `mit Stempel „KOPIE“, verkleinert (${mb(gross.length)} → ${mb(s.verkleinert!.nachher)})`);
    const txt = await fuerAusgabe({ name: 'a.txt', mime: 'text/plain', inhalt: Buffer.from('x') }, { verkleinern: 'standard' }, { benutzer: 'A', mappe: 'M' });
    assert.ok(txt.unveraendert && !txt.verkleinert);
  });

  it('Herunterladen, E-Mail und Export verkleinert – das gespeicherte Dokument bleibt unverändert', async () => {
    const { d, t, m, dokument, mails, mailer } = await aufbau();
    const r = await d.dokumentFuerAusgabe(dokument.id, { verkleinern: 'bildschirm', ich });
    assert.ok(r.verkleinert && r.groesse < gross.length / 4);
    assert.equal(r.gestempelt, false);
    assert.ok((await alsPuffer((await d.dokumentInhalt(dokument.id)).inhalt)).equals(gross), 'Original unverändert');
    assert.equal((await d.holeDokument(dokument.id)).version, 1);
    const h = (await d.historie(m.id)).find((x) => x.art === 'weitergegeben')!;
    assert.match(String(h.daten.text), /^verkleinert \(.* MB → .* KB\) \(heruntergeladen: scan\.pdf\)$/);

    await d.versendeMappe(m.id, { an: 'steuer@example.org', betreff: 'Scan', dokumente: [dokument.id], verkleinern: 'standard' }, ich, mailer);
    const anhang = mails[0].o!.anhaenge![0].inhalt as Buffer;
    assert.ok(anhang.length < gross.length / 4);
    assert.match(await pdftext(anhang), /Rechnung Nummer 4711/);
    assert.match(String((await d.historie(m.id)).find((x) => x.art === 'email')!.daten.text), /, verkleinert \(/);

    const z = await d.zugriff({ id: ich.id, rolle: 'admin' });
    const ex = await d.exportiere({ id: ich.id, rolle: 'admin', name: ich.name }, { format: 'zip', sicht: `typ:${t.id}`, ids: [m.id], verkleinern: 'standard' }, z);
    assert.ok(ex.groesse < gross.length / 2, 'ZIP mit verkleinertem PDF');
    assert.ok((await alsPuffer((await d.dokumentInhalt(dokument.id)).inhalt)).equals(gross), 'Original weiter unverändert');
    // Kein PDF und ohne Stempel: beim einzelnen Herunterladen 422.
    const { dokument: txt } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'a.txt', typ: 'text/plain' }, Buffer.from('hallo'), null);
    await assert.rejects(d.dokumentFuerAusgabe(txt.id, { verkleinern: 'standard', ich }), status(422, /kein PDF/));
  });
});

it('Testdaten enthalten den unsichtbaren Text', () => assert.ok(TEXT.length > 10));

/* Liste großer PDFs und Entfernen einer Version auch in PostgreSQL. */
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const offen: Array<{ end(): Promise<void> }> = [];
async function pgRepo(): Promise<Repo> {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const { verbinde, migriere } = await import('../src/db');
  const { pgRepo: repo } = await import('../src/repo-pg');
  const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: `dms_vk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  await legeDatenbankAn(a);
  const sql = verbinde(alsUrl(a));
  offen.push(sql);
  await migriere(sql, new URL('../migrations', import.meta.url).pathname, () => {});
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return repo(sql, HAUSHALT) as never;
}

describe('Große PDFs in PostgreSQL (#393)', { skip: process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  after(async () => { for (const s of offen.splice(0)) await s.end(); });
  it('grossePdfs nach Größe, Sammelaktion ohne Original entfernt die alte Version', async () => {
    const d = new Dienst(await pgRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const t = await d.legeTypAn({ name: 'Vertrag', felder: [{ key: 'name', label: 'Name', typ: 'text' }], register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente', versionierung: true },
    ] });
    const m = await d.legeMappeAn({ typId: t.id, werte: { name: 'Strom' } }, null);
    const g = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'scan.pdf' }, gross, null)).dokument;
    const k = (await d.ladeHoch(m.id, { register: 'dokumente', name: 'text.pdf' }, await textPdf(), null)).dokument;
    assert.deepEqual((await d.grosseDokumente({ ab: 0 })).eintraege.map((x) => x.id), [g.id, k.id]);
    d.verkleinereViele({ ids: [g.id], ohneOriginal: true }, { id: null, email: 'admin@example.org' });
    assert.equal((await d.auftraege.warte())!.status, 'fertig');
    const neu = await d.holeDokument(g.id);
    assert.equal(neu.version, 2);
    assert.ok(neu.groesse < gross.length / 4);
    assert.equal((await d.versionen(g.id)).aeltere.length, 0);
    assert.deepEqual((await d.grosseDokumente({ ab: 1 })).eintraege, []);
  });
});
