/** Stempel und Wasserzeichen beim Weitergeben (#394). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { ersetzePlatzhalter, geltenderStempel, platzhalterIn, STANDARD_VORLAGEN, StempelFehler, wunschAus, type Stempel } from '../../shared/src/stempel';
import { bildAlsPdf, fuerAusgabe } from '../src/ausgabe';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import type { Mailer, MailOptionen } from '../src/mail';
import { speicherRepo } from '../src/repo-speicher';
import { crc32 } from '../src/zip';
import { pdfMitText } from './hilfen';

const ich = { id: '00000000-0000-4000-8000-000000000001', name: 'Anna Beispiel', email: 'anna@example.org' };
const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));
/** Text, wie pdf-lib ihn mit Standardschriften schreibt: WinAnsi als Hex. */
const hex = (t: string) => Buffer.from(t, 'latin1').toString('hex').toUpperCase();

/** Inhalt aller Inhaltsströme einer Seite, entpackt. */
async function seiteninhalt(pdf: Buffer, i = 0): Promise<{ text: string; stroeme: number }> {
  const doc = await PDFDocument.load(pdf);
  const p = doc.getPage(i);
  const c = p.node.Contents();
  const roh = p.node.get(PDFName.of('Contents'));
  const refs = c instanceof PDFArray ? c.asArray() : roh ? [roh] : [];
  let text = '';
  for (const r of refs) { const s = doc.context.lookup(r) as PDFRawStream; text += Buffer.from(decodePDFRawStream(s).decode()).toString('latin1'); }
  return { text, stroeme: refs.length };
}

async function pdfMitSeiten(n: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([595, 842]).drawText(`Seite ${i + 1}`, { x: 72, y: 700, size: 20 });
  return Buffer.from(await d.save());
}

/** Kleines PNG (RGB) ohne Bibliothek. */
function png(b: number, h: number): Buffer {
  const chunk = (typ: string, daten: Buffer) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(daten.length);
    const td = Buffer.concat([Buffer.from(typ, 'latin1'), daten]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const zeilen = Buffer.concat(Array.from({ length: h }, (_, y) => Buffer.concat([Buffer.from([0]), Buffer.alloc(b * 3, y % 2 ? 200 : 60)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(zeilen)), chunk('IEND', Buffer.alloc(0))]);
}

const S = (x: Partial<Stempel> = {}): Stempel => ({ text: 'ENTWURF', lage: 'diagonal', deckkraft: 0.3, seiten: 'alle', seitenzahlen: false, archivnummer: false, ...x });

describe('Platzhalter (#394)', () => {
  it('ersetzt {datum}, {empfänger}/{empfaenger}, {benutzer}, {mappe}; Unbekanntes bleibt', () => {
    const w = { datum: '01.11.2026', empfaenger: 'Hausverwaltung Müller', benutzer: 'Anna', mappe: 'Personalausweis' };
    assert.equal(ersetzePlatzhalter('Kopie für {empfänger} – {datum}', w), 'Kopie für Hausverwaltung Müller – 01.11.2026');
    assert.equal(ersetzePlatzhalter('{Empfaenger}/{benutzer}/{mappe}/{x}', w), 'Hausverwaltung Müller/Anna/Personalausweis/{x}');
    assert.equal(ersetzePlatzhalter('Nur für {empfänger}  ', { datum: '1.1.2026' }), 'Nur für');
    assert.match(ersetzePlatzhalter('{datum}', {}), /^\d{2}\.\d{2}\.\d{4}$/);
    assert.deepEqual(platzhalterIn('{datum} {empfänger} {EMPFAENGER} {foo}').sort(), ['datum', 'empfaenger']);
  });

  it('wählt den geltenden Stempel: Wunsch, Vorlage, Pflicht, Empfänger nötig', () => {
    const v = STANDARD_VORLAGEN;
    assert.equal(geltenderStempel(null, null, v), null);
    assert.equal(geltenderStempel(null, { modus: 'vorschlag', vorlage: 'entwurf' }, v), null);
    const k = geltenderStempel({ vorlage: 'kopie', empfaenger: 'Bank' }, null, v)!;
    assert.equal(k.stempel.text, 'Kopie für {empfänger} – {datum}');
    assert.equal(k.empfaenger, 'Bank');
    assert.equal(k.pflicht, false);
    assert.throws(() => geltenderStempel({ vorlage: 'kopie' }, null, v), StempelFehler);
    assert.throws(() => geltenderStempel({ vorlage: 'gibtsnicht' }, null, v), StempelFehler);
    // Eigene Angaben gehen der Vorlage vor.
    assert.equal(geltenderStempel({ vorlage: 'entwurf', lage: 'ecke', deckkraft: 2 }, null, v)!.stempel.lage, 'ecke');
    assert.equal(geltenderStempel({ vorlage: 'entwurf', deckkraft: 2 }, null, v)!.stempel.deckkraft, 1);
    // Pflicht: ohne Wunsch die Vorlage des Typs; mit Ersatz-Empfänger (E-Mail-Adressen).
    const p = geltenderStempel(null, { modus: 'pflicht', vorlage: 'entwurf' }, v)!;
    assert.equal(p.pflicht, true); assert.equal(p.stempel.text, 'ENTWURF');
    assert.throws(() => geltenderStempel(null, { modus: 'pflicht', vorlage: 'kopie' }, v), /verlangt/);
    assert.equal(geltenderStempel(null, { modus: 'pflicht', vorlage: 'kopie' }, v, 'a@example.org')!.empfaenger, 'a@example.org');
    assert.equal(geltenderStempel(null, { modus: 'pflicht', vorlage: null }, v)!.stempel.text, 'Kopie – {datum}');
    // Nur Seitenzahlen, ohne Text.
    const z = geltenderStempel({ seitenzahlen: true }, null, v)!;
    assert.equal(z.stempel.text, ''); assert.equal(z.stempel.seitenzahlen, true);
  });

  it('liest Wünsche aus Abfrageparametern (API v1)', () => {
    assert.equal(wunschAus({ herunterladen: '1' }), null);
    assert.deepEqual(wunschAus({ stempel: 'ENTWURF', lage: 'kopf', deckkraft: '0,5', seitenzahlen: '1' }), { text: 'ENTWURF', lage: 'kopf', deckkraft: '0,5', seitenzahlen: '1' });
    assert.deepEqual(wunschAus({ vorlage: 'kopie', empfaenger: ' Bank ' }), { vorlage: 'kopie', empfaenger: 'Bank' });
  });
});

describe('PDF mit Stempel (#394)', () => {
  it('Seitenzahl bleibt, Text steht im (einzigen) Inhaltsstrom, keine Anmerkung, Original unverändert', async () => {
    const original = await pdfMitSeiten(3);
    const kopie = Buffer.from(original);
    const plan = { stempel: S({ seitenzahlen: true, archivnummer: true }), empfaenger: '', pflicht: false, vorlage: null };
    const a = await fuerAusgabe({ name: 'a.pdf', mime: 'application/pdf', inhalt: original }, { stempel: plan }, { benutzer: 'Anna', mappe: 'M', archivnummer: 'A-000007' });
    assert.ok(original.equals(kopie), 'Original unverändert');
    assert.equal(a.mime, 'application/pdf'); assert.equal(a.name, 'a.pdf'); assert.equal(a.stempeltext, 'ENTWURF');
    const doc = await PDFDocument.load(a.inhalt);
    assert.equal(doc.getPageCount(), 3);
    for (let i = 0; i < 3; i++) {
      const s = await seiteninhalt(a.inhalt, i);
      assert.equal(s.stroeme, 1, 'ein zusammengeführter Inhaltsstrom');
      assert.ok(s.text.includes(hex('ENTWURF')), 'Stempeltext im Inhaltsstrom');
      assert.ok(s.text.includes(hex(`A-000007 · Seite ${i + 1} von 3`)), 'Fußzeile');
      assert.ok(s.text.includes('Seite') || s.text.includes(hex(`Seite ${i + 1}`)), 'Seiteninhalt bleibt');
      assert.equal(doc.getPage(i).node.Annots()?.size() ?? 0, 0, 'keine Anmerkungen');
    }
  });

  it('nur die erste Seite; ein vorhandenes Text-PDF behält seinen Text', async () => {
    const original = pdfMitText(['Mietvertrag', 'Zeile zwei']);
    const plan = { stempel: S({ seiten: 'erste', lage: 'kopf' }), empfaenger: '', pflicht: false, vorlage: null };
    const zwei = await PDFDocument.load(original); zwei.addPage();
    const a = await fuerAusgabe({ name: 'v.pdf', mime: 'application/pdf', inhalt: Buffer.from(await zwei.save()) }, { stempel: plan }, { benutzer: 'A', mappe: 'M' });
    const s1 = await seiteninhalt(a.inhalt, 0), s2 = await seiteninhalt(a.inhalt, 1);
    assert.ok(s1.text.includes('(Mietvertrag) Tj'));
    assert.ok(s1.text.includes(hex('ENTWURF')));
    assert.ok(!s2.text.includes(hex('ENTWURF')));
  });

  it('Bild → PDF mit Stempel; andere Dateien nur mit Fehler bei Pflicht oder streng', async () => {
    const b = png(40, 20);
    const plan = { stempel: S({ text: 'Kopie für {empfänger}' }), empfaenger: 'Bank', pflicht: false, vorlage: null };
    const a = await fuerAusgabe({ name: 'ausweis.png', mime: 'image/png', inhalt: b }, { stempel: plan }, { benutzer: 'A', mappe: 'M' });
    assert.equal(a.name, 'ausweis.pdf'); assert.equal(a.mime, 'application/pdf');
    assert.equal((await PDFDocument.load(a.inhalt)).getPageCount(), 1);
    assert.ok((await seiteninhalt(a.inhalt)).text.includes(hex('Kopie für Bank')));
    const quer = await bildAlsPdf(b, true);
    assert.ok(quer.getPage(0).getWidth() > quer.getPage(0).getHeight());
    const txt = { name: 'x.txt', mime: 'text/plain', inhalt: Buffer.from('hallo') };
    const frei = await fuerAusgabe(txt, { stempel: plan }, { benutzer: 'A', mappe: 'M' });
    assert.ok(frei.unveraendert); assert.equal(frei.inhalt.toString(), 'hallo');
    await assert.rejects(fuerAusgabe(txt, { stempel: plan }, { benutzer: 'A', mappe: 'M' }, true), status(422));
    await assert.rejects(fuerAusgabe(txt, { stempel: { ...plan, pflicht: true } }, { benutzer: 'A', mappe: 'M' }), status(422, /verlangt/));
  });
});

async function aufbau(stempel?: unknown) {
  const dateien = speicherDateien();
  const d = new Dienst(speicherRepo(), dateien, { einstellungen: speicherEinstellungen() });
  const t = await d.legeTypAn({ name: 'Ausweis', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['name'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente' },
  ], ...(stempel !== undefined ? { stempel } : {}) });
  const m = await d.legeMappeAn({ typId: t.id, werte: { name: 'Personalausweis' } }, null);
  const pdf = await pdfMitSeiten(2);
  const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'ausweis.pdf', typ: 'application/pdf' }, pdf, null);
  const mails: Array<{ an: string; o?: MailOptionen }> = [];
  const mailer: Mailer = { async sende(an, _b, _t, o) { mails.push({ an, o }); } };
  return { d, t, m, dokument, pdf, dateien, mails, mailer };
}
const alsPuffer = async (x: Buffer | NodeJS.ReadableStream) => (Buffer.isBuffer(x) ? x : Buffer.concat(await (x as unknown as { toArray(): Promise<Buffer[]> }).toArray()));

describe('Weitergeben mit Stempel im Dienst (#394)', () => {
  it('Herunterladen mit Stempel: Kopie gestempelt, Original unverändert, Historie vermerkt', async () => {
    const { d, m, dokument, pdf } = await aufbau();
    const r = await d.dokumentFuerAusgabe(dokument.id, { stempel: { vorlage: 'kopie', empfaenger: 'Hausverwaltung Müller' }, ich });
    assert.equal(r.gestempelt, true);
    const kopie = await alsPuffer(r.inhalt);
    assert.equal((await PDFDocument.load(kopie)).getPageCount(), 2);
    assert.ok((await seiteninhalt(kopie)).text.includes(hex('Kopie für Hausverwaltung Müller')));
    assert.ok((await alsPuffer((await d.dokumentInhalt(dokument.id)).inhalt)).equals(pdf), 'gespeichertes Original unverändert');
    const h = (await d.historie(m.id)).find((x) => x.art === 'weitergegeben')!;
    assert.match(String(h.daten.text), /^mit Stempel „Kopie für Hausverwaltung Müller – \d{2}\.\d{2}\.\d{4}“ an Hausverwaltung Müller \(heruntergeladen: ausweis\.pdf\)$/);
    assert.equal(h.daten.an, 'Hausverwaltung Müller');
    // Ohne Stempel: unverändert, keine Historie.
    const ohne = await d.dokumentFuerAusgabe(dokument.id, { stempel: {}, ich });
    assert.equal(ohne.gestempelt, false);
    assert.equal((await d.historie(m.id)).filter((x) => x.art === 'weitergegeben').length, 1);
  });

  it('Pflicht je Mappentyp erzwingt den Stempel – beim Herunterladen, beim Export und per E-Mail', async () => {
    const { d, t, m, dokument, mails, mailer } = await aufbau({ modus: 'pflicht', vorlage: 'entwurf' });
    assert.deepEqual((await d.typenFuer(await d.zugriff({ id: ich.id, rolle: 'admin' }))).find((x) => x.id === t.id)!.stempel, { modus: 'pflicht', vorlage: 'entwurf' });
    const r = await d.dokumentFuerAusgabe(dokument.id, { ich });
    assert.equal(r.gestempelt, true);
    assert.ok((await seiteninhalt(await alsPuffer(r.inhalt))).text.includes(hex('ENTWURF')));
    // Vorlage mit {empfänger}: ohne Empfänger 422; per E-Mail gelten die Adressen.
    await d.aendereTyp(t.id, { ...t, stempel: { modus: 'pflicht', vorlage: 'kopie' } });
    await assert.rejects(d.dokumentFuerAusgabe(dokument.id, { ich }), status(422, /Empfänger/));
    await d.versendeMappe(m.id, { an: 'bank@example.org', betreff: 'Ausweis', dokumente: [dokument.id] }, ich, mailer);
    const anhang = mails[0].o!.anhaenge![0];
    assert.ok((await seiteninhalt(anhang.inhalt as Buffer)).text.includes(hex('Kopie für bank@example.org')));
    const email = (await d.historie(m.id)).find((x) => x.art === 'email')!;
    assert.match(String(email.daten.text), /mit Stempel „Kopie für bank@example\.org – /);
    // Die Post enthält die gestempelte Kopie, nicht das Original.
    const post = await d.holeMappe(String(email.daten.email));
    assert.notEqual(post.dokumente[0].sha256, dokument.sha256);
    // Export als ZIP: Pflicht greift auch hier.
    const z = await d.zugriff({ id: ich.id, rolle: 'admin' });
    await assert.rejects(d.exportiere({ id: ich.id, rolle: 'admin', name: ich.name }, { format: 'zip', sicht: `typ:${t.id}`, ids: [m.id] }, z), status(422, /Empfänger/));
    await d.exportiere({ id: ich.id, rolle: 'admin', name: ich.name }, { format: 'zip', sicht: `typ:${t.id}`, ids: [m.id], stempel: { vorlage: 'kopie', empfaenger: 'Steuerbüro' } }, z);
    const h = (await d.historie(m.id)).filter((x) => x.art === 'weitergegeben');
    assert.match(String(h[0].daten.text), /an Steuerbüro \(als ZIP exportiert: ausweis\.pdf\)/);
    // Vorlage in Gebrauch lässt sich nicht löschen; unbekannte Vorlage am Typ wird abgelehnt.
    await assert.rejects(d.loescheStempelVorlage('kopie', 'admin'), status(409, /Ausweis/));
    await assert.rejects(d.aendereTyp(t.id, { ...t, stempel: { modus: 'pflicht', vorlage: 'weg' } }), status(422));
  });

  it('Vorlagen anlegen, ändern, prüfen und löschen', async () => {
    const { d } = await aufbau();
    assert.deepEqual((await d.stempelVorlagen()).map((v) => v.name), ['Kopie für …', 'Nur zur Vorlage bei …', 'Entwurf', 'Vertraulich']);
    const l = await d.speichereStempelVorlage(null, { name: 'Steuerberater', text: 'Für {empfänger} – {datum}', lage: 'fuss', deckkraft: 0.9 }, 'admin');
    const neu = l.find((v) => v.name === 'Steuerberater')!;
    assert.equal(neu.lage, 'fuss');
    await assert.rejects(d.speichereStempelVorlage(null, { name: 'entwurf', text: 'x' }, 'admin'), status(422, /Namen/));
    await assert.rejects(d.speichereStempelVorlage(null, { name: 'Y', text: '{unbekannt}' }, 'admin'), status(422, /Platzhalter/));
    await d.speichereStempelVorlage(neu.id, { text: 'Geändert' }, 'admin');
    assert.equal((await d.stempelVorlagen()).find((v) => v.id === neu.id)!.text, 'Geändert');
    assert.equal((await d.loescheStempelVorlage(neu.id, 'admin')).length, 4);
  });

  it('Bild herunterladen mit Stempel wird zum PDF', async () => {
    const { d, m } = await aufbau();
    const { dokument } = await d.ladeHoch(m.id, { register: 'dokumente', name: 'foto.png', typ: 'image/png' }, png(30, 50), null);
    const r = await d.dokumentFuerAusgabe(dokument.id, { stempel: { stempel: 'VERTRAULICH', lage: 'ecke' }, ich });
    assert.equal(r.name, 'foto.pdf'); assert.equal(r.mime, 'application/pdf');
    assert.ok((await seiteninhalt(await alsPuffer(r.inhalt))).text.includes(hex('VERTRAULICH')));
  });
});
