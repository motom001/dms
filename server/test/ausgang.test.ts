/**
 * Wege nach draußen (#723): Recht E (Exportieren) gilt auch fürs Herunterladen; eine gemeinsame Prüfstelle für
 * Herunterladen, E-Mail (eine und mehrere Mappen), Export und WebDAV-Laufwerk; E-Mail auf einem Weg (Pflicht-Stempel
 * auch auf dem PDF „Angaben“, gleiche Wahl der Fassung, gleiche Größenprüfung).
 */
import assert from 'node:assert/strict';
import { wieImModus } from './hilfen';
import type { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { mitnehmbar, pruefeAlle, verboten } from '../src/ausgang';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { pdfAus } from '../src/pdf';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Webdav } from '../src/webdav';

const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));
const hex = (t: string) => Buffer.from(t, 'latin1').toString('hex').toUpperCase();
const alsPuffer = async (x: Buffer | Readable) => (Buffer.isBuffer(x) ? x : Buffer.concat(await x.toArray() as Buffer[]));

/** Text aller Inhaltsströme der ersten Seite (Stempel stehen als Hex-Text darin). */
async function seitentext(pdf: Buffer): Promise<string> {
  const doc = await PDFDocument.load(pdf);
  const inhalt = doc.getPages()[0].node.get(PDFName.of('Contents'));
  const refs = inhalt && 'asArray' in (inhalt as object) ? (inhalt as unknown as { asArray(): unknown[] }).asArray() : [inhalt];
  return refs.map((r) => {
    const s = doc.context.lookup(r as never);
    if (s instanceof PDFRawStream) { try { return Buffer.from(decodePDFRawStream(s).decode()).toString('latin1'); } catch { return Buffer.from(inflateSync(s.contents)).toString('latin1'); } }
    return '';
  }).join('');
}

async function aufbau() {
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const lena = (await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const vertrag = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }],
    register: [{ key: 'daten', name: 'Daten', art: 'felder' }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente', versionierung: true }] } as never);
  const v1 = await d.legeMappeAn({ typId: vertrag.id, werte: { nr: 'V-1' } }, lena.id);
  const pdf = (await d.ladeHoch(v1.id, { register: 'dokumente', name: 'Vertrag.pdf' }, pdfAus([{ text: 'Seite aus dem Vertrag' }]), lena.id)).dokument;
  const txt = (await d.ladeHoch(v1.id, { register: 'dokumente', name: 'notiz.txt' }, Buffer.from('nur genannt'), lena.id)).dokument;
  // Zweite Version des PDFs (#194): ältere Versionen sind ein eigener Weg zum Herunterladen.
  await d.ersetzeDokument(pdf.id, { name: 'Vertrag.pdf' }, pdfAus([{ text: 'Zweite Fassung' }]), lena.id);
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const tabelle = routen(d, konten, { apiSchluessel: schluessel });
  const rufe = async (b: { id: string }, m: string, pf: string, x: Partial<Anfrage> = {}) => {
    const r = tabelle.find((t) => t.methode === m && t.pfad === pf);
    assert.ok(r, `${m} ${pf}`);
    return r.handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: wieImModus(await ich(b.id)) });
  };
  /** Recht E an allen Ansichten mit Verträgen für Lena entziehen (Lesen bleibt). */
  const ohneE = async () => {
    for (const s of (await d.listeSichten()).filter((x) => x.typen.includes(vertrag.id))) {
      await d.aendereSicht(s.id, { ...s, berechtigungen: { grund: { R: true, C: true, E: true }, regeln: [{ id: 'e', name: 'kein Export', wenn: [{ art: 'benutzer', benutzer: [lena.id] }], dann: { E: 'entziehen' }, stopp: false }] } });
    }
  };
  const sichtId = (await d.listeSichten()).find((s) => s.typen.includes(vertrag.id))!.id;
  return { d, konten, admin, lena, vertrag, v1, pdf, txt, rufe, ohneE, einstellungen, schluessel, sichtId };
}

describe('Prüfstelle (#723): die Regel', () => {
  const r = (lesbar: string[], e: string[]) => ({ lesbar: async (ids: string[]) => new Set(ids.filter((x) => lesbar.includes(x))), exportierbar: async (ids: string[]) => new Set(ids.filter((x) => e.includes(x))) });
  it('mitnehmen nur mit Lesen und Exportrecht', async () => {
    assert.deepEqual([...await mitnehmbar(r(['a', 'b'], ['b', 'c']), ['a', 'b', 'c'])], ['b']);
    assert.deepEqual([...await mitnehmbar(r([], []), [])], []);
  });
  it('alle oder keine: 404 für eine nicht lesbare Mappe, sonst 403 mit Zahl und Ids', async () => {
    await assert.rejects(pruefeAlle(r([], []), 'herunterladen', ['a']), status(404));
    await assert.rejects(pruefeAlle(r(['a'], []), 'herunterladen', ['a']), status(403, /Exportrecht \(E\)/));
    await assert.rejects(pruefeAlle(r(['a', 'b'], ['a']), 'email', ['a', 'b']), (e) => status(403, /^Eine Mappe darfst du nicht versenden/)(e) && JSON.stringify((e as Fachfehler).details).includes('"b"'));
    await assert.rejects(pruefeAlle(r(['a', 'b', 'c'], ['a']), 'email', ['a', 'b', 'c']), status(403, /^2 Mappen darfst du nicht versenden/));
    await pruefeAlle(r(['a'], ['a']), 'webdav', ['a']);
    assert.match(verboten('export', [], 3).message, /keine dieser Mappen/);
  });
});

describe('Herunterladen braucht E (#723)', () => {
  it('ohne E: alle Wege zum Abspeichern 403, Ansehen im Browser (inline) weiter mit R', async () => {
    const { lena, pdf, txt, rufe, ohneE, v1 } = await aufbau();
    const p = { params: { id: pdf.id } };
    // Mit E geht alles.
    assert.ok(await rufe(lena, 'GET', '/api/dokumente/:id/inhalt', { ...p, query: { herunterladen: '1' } }));
    await ohneE();
    // Dokument: ?herunterladen, Stempel- und Verkleinern-Parameter, Fassung (Archivfassung), POST herunterladen.
    for (const query of [{ herunterladen: '1' }, { stempel: 'KOPIE' }, { verkleinern: 'standard' }, { fassung: 'archiv' }]) {
      await assert.rejects(rufe(lena, 'GET', '/api/dokumente/:id/inhalt', { ...p, query }), status(403, /Exportrecht/), JSON.stringify(query));
    }
    await assert.rejects(rufe(lena, 'POST', '/api/dokumente/:id/herunterladen', { ...p, body: {} }), status(403));
    // Ältere Version.
    await assert.rejects(rufe(lena, 'GET', '/api/dokumente/:id/versionen/:nummer/inhalt', { params: { id: pdf.id, nummer: '1' }, query: { herunterladen: '1' } }), status(403));
    // Umgewandelte Fassung und Archivfassung (#577, #631): Prüfung vor dem Nachschlagen (sonst 404).
    await assert.rejects(rufe(lena, 'GET', '/api/dokumente/:id/fassung', { ...p, query: { herunterladen: '1' } }), status(403));
    await assert.rejects(rufe(lena, 'GET', '/api/dokumente/:id/archivfassung', { ...p, query: { herunterladen: '1' } }), status(403));
    // Seitenbild zum Abspeichern (Rohbild für Pakete).
    await assert.rejects(rufe(lena, 'GET', '/api/dokumente/:id/seiten/:nr/scan', { params: { id: pdf.id, nr: '1' } }), status(403));
    // Dateien, die der Browser nicht anzeigen kann, kommen nur zum Abspeichern.
    await assert.rejects(rufe(lena, 'GET', '/api/dokumente/:id/inhalt', { params: { id: txt.id } }), status(403));
    // Ansehen (inline) geht weiter – Dokument und Version.
    const an = await rufe(lena, 'GET', '/api/dokumente/:id/inhalt', p) as { datei: { anzeigen: boolean } };
    assert.equal(an.datei.anzeigen, true);
    const alt = await rufe(lena, 'GET', '/api/dokumente/:id/versionen/:nummer/inhalt', { params: { id: pdf.id, nummer: '1' } }) as { datei: { anzeigen: boolean } };
    assert.equal(alt.datei.anzeigen, true);
    // Die Mappe sagt der Oberfläche, dass nichts hinausdarf (Knopf „Herunterladen“ mit „Warum nicht?“).
    const m = await rufe(lena, 'GET', '/api/mappen/:id', { params: { id: v1.id } }) as { body: { exportierbar: boolean } };
    assert.equal(m.body.exportierbar, false);
  });

  it('API (v1 und API-Schlüssel eines Menschen): Abruf ist Mitnehmen, ohne E 403; Administratoren dürfen alles', async () => {
    const { admin, lena, pdf, rufe, ohneE } = await aufbau();
    await ohneE();
    const mitSchluessel = { params: { id: pdf.id }, apiSchluessel: { id: 'k', name: 'Skript', recht: 'lesen' } } as unknown as Partial<Anfrage>;
    await assert.rejects(rufe(lena, 'GET', '/api/dokumente/:id/inhalt', mitSchluessel), status(403));
    await assert.rejects(rufe(lena, 'GET', '/api/dokumente/:id/archivfassung', mitSchluessel), status(403));
    // Seitenbilder über den API-Schlüssel sind Herausgeben (#799): ebenfalls Exportrecht; in der Oberfläche weiter mit R.
    for (const pfad of ['/api/dokumente/:id/seiten/:nr/bild', '/api/dokumente/:id/schwaerzen/seiten/:nr', '/api/dokumente/:id/vorschau']) {
      await assert.rejects(rufe(lena, 'GET', pfad, { ...mitSchluessel, params: { id: pdf.id, nr: '1' } }), status(403), pfad);
    }
    assert.ok(await rufe(lena, 'GET', '/api/dokumente/:id/schwaerzen/seiten/:nr', { params: { id: pdf.id, nr: '1' } }));
    const r = await rufe(admin, 'GET', '/api/dokumente/:id/inhalt', { params: { id: pdf.id }, query: { herunterladen: '1' } }) as { datei: { anzeigen: boolean } };
    assert.equal(r.datei.anzeigen, false);
  });

  it('ohne Leserecht weiterhin 404 (nicht 403)', async () => {
    const { d, konten, admin, pdf, rufe, vertrag } = await aufbau();
    const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, admin.id)).benutzer;
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    await d.aendereTyp(vertrag.id, { ...vertrag, berechtigungen: { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [{ id: 'x', name: 'nicht Jonas', wenn: [{ art: 'benutzer', benutzer: [jonas.id] }], dann: { R: 'entziehen' }, stopp: false }] } } as never);
    await assert.rejects(rufe(jonas, 'GET', '/api/dokumente/:id/inhalt', { params: { id: pdf.id }, query: { herunterladen: '1' } }), status(404));
  });
});

describe('Eine Prüfstelle für alle Ausgänge (#723)', () => {
  it('Herunterladen, E-Mail (eine, mehrere), Export und WebDAV fragen dieselbe Stelle – und sperren ohne E', async () => {
    const x = await aufbau();
    const wege: string[] = [];
    const pruefe = x.d.pruefeAusgang.bind(x.d);
    const mit = x.d.mitnehmbar.bind(x.d);
    x.d.pruefeAusgang = async (ich, z, ausgang, ids) => { wege.push(ausgang); return pruefe(ich, z, ausgang, ids); };
    x.d.mitnehmbar = async (ich, z, ids) => { wege.push('mitnehmbar'); return mit(ich, z, ids); };
    await x.ohneE();
    // Herunterladen
    await assert.rejects(x.rufe(x.lena, 'GET', '/api/dokumente/:id/inhalt', { params: { id: x.pdf.id }, query: { herunterladen: '1' } }), status(403));
    assert.ok(wege.includes('herunterladen'));
    // E-Mail einer Mappe (vor der Frage nach dem Mailserver: 403 statt 409)
    await assert.rejects(x.rufe(x.lena, 'POST', '/api/mappen/:id/email', { params: { id: x.v1.id }, body: { an: 'steuer@example.org', betreff: 'x' } }), status(403, /nicht versenden/));
    assert.ok(wege.filter((w) => w === 'email').length === 1);
    // E-Mail mehrerer Mappen
    await assert.rejects(x.rufe(x.lena, 'POST', '/api/mappen/email', { body: { ids: [x.v1.id], an: 'steuer@example.org', betreff: 'x' } }), status(403, /nicht versenden/));
    assert.ok(wege.filter((w) => w === 'email').length === 2);
    // Export ohne Ansicht (Regel A) über die Prüfstelle; aus einer Ansicht ohne E mit eigener Meldung.
    await assert.rejects(x.rufe(x.lena, 'POST', '/api/export', { body: { sicht: 'suche', link: `typ=${x.vertrag.id}`, format: 'csv' } }), status(403, /keine dieser Mappen/));
    assert.ok(wege.includes('mitnehmbar'));
    await assert.rejects(x.rufe(x.lena, 'POST', '/api/export', { body: { sicht: x.sichtId, format: 'csv' } }), status(403, /Aus dieser Ansicht/));
    // WebDAV-Laufwerk
    const wd = new Webdav({ dienst: x.d, konten: x.konten, schluessel: x.schluessel, einstellungen: speicherEinstellungen() });
    await wd.speichere({ aktiv: true }, 'admin');
    const key = (await x.schluessel.lege(x.lena, { name: 'Laufwerk', recht: 'lesen' })).schluessel;
    const auth = `Basic ${Buffer.from(`lena@example.org:${key}`).toString('base64')}`;
    const vor = wege.filter((w) => w === 'mitnehmbar').length;
    const pfad = `/webdav/Ablage/Vertrag/V-1/Dokumente/Vertrag.pdf`.split('/').map(encodeURIComponent).join('/');
    const r = await wd.anfrage({ methode: 'GET', url: pfad, ip: '10.0.0.9', kopf: (n) => (n === 'authorization' ? auth : undefined) });
    assert.equal(r.status, 403);
    assert.ok(wege.filter((w) => w === 'mitnehmbar').length > vor, 'Laufwerk fragt die Prüfstelle');
  });

  it('mit E gehen alle Wege (E-Mail ohne Mailserver bis 409)', async () => {
    const x = await aufbau();
    assert.ok(await x.rufe(x.lena, 'POST', '/api/dokumente/:id/herunterladen', { params: { id: x.pdf.id }, body: {} }));
    await assert.rejects(x.rufe(x.lena, 'POST', '/api/mappen/:id/email', { params: { id: x.v1.id }, body: { an: 'steuer@example.org', betreff: 'x' } }), status(409));
    await assert.rejects(x.rufe(x.lena, 'POST', '/api/mappen/email', { body: { ids: [x.v1.id], an: 'steuer@example.org', betreff: 'x' } }), status(409));
    assert.ok(await x.rufe(x.lena, 'POST', '/api/export', { body: { sicht: x.sichtId, format: 'csv' } }));
  });
});

describe('E-Mail auf einem Weg (#723, Sicherheit aus #683)', () => {
  const mailer = () => {
    const mails: Array<{ anhaenge: Array<{ name: string; mime: string; inhalt: Buffer | Readable }> }> = [];
    return { mails, m: { async sende(_a: string, _b: string, _t: string, o?: { anhaenge?: Array<{ name: string; mime: string; inhalt: Buffer | Readable }> }) { mails.push({ anhaenge: o?.anhaenge ?? [] }); } } };
  };
  it('Pflicht-Stempel gilt auch für das PDF „Angaben“ – bei mehreren und bei einer Mappe; in der Post liegt die gestempelte Fassung', async () => {
    const { d, lena, vertrag, v1, pdf } = await aufbau();
    await d.aendereTyp(vertrag.id, { ...vertrag, stempel: { modus: 'pflicht', vorlage: 'entwurf' } } as never);
    const z = await d.zugriff(lena);
    const ich = { id: lena.id, name: 'Lena', email: 'lena@example.org', rolle: 'mitglied' };
    const { mails, m } = mailer();
    await d.versendeMappen({ ids: [v1.id], an: 'steuer@example.org', betreff: 'Belege', dokumente: [pdf.id] }, ich, z, m as never);
    const angaben = mails[0].anhaenge.find((a) => a.name === 'V-1.pdf')!;
    assert.ok(angaben, 'Angaben-PDF ist dabei');
    assert.ok((await seitentext(await alsPuffer(angaben.inhalt))).includes(hex('ENTWURF')), 'Angaben gestempelt');
    assert.ok((await seitentext(await alsPuffer(mails[0].anhaenge.find((a) => a.name === 'Vertrag.pdf')!.inhalt))).includes(hex('ENTWURF')));
    // Eine Mappe: dieselben Regeln, das Angaben-PDF auf Wunsch.
    await d.versendeMappe(v1.id, { an: 'steuer@example.org', betreff: 'Eine', dokumente: [pdf.id], angaben: true }, ich, m as never, z);
    assert.deepEqual(mails[1].anhaenge.map((a) => a.name), ['V-1.pdf', 'Vertrag.pdf']);
    assert.ok((await seitentext(await alsPuffer(mails[1].anhaenge[0].inhalt))).includes(hex('ENTWURF')));
    // In der Post liegt, was verschickt wurde: das gestempelte Angaben-PDF.
    const post = await d.postTyp();
    const posts = (await d.seite({ id: lena.id, rolle: 'mitglied' }, { sicht: `typ:${post.id}` })).mappen;
    const doks = (await d.laufwerkMappe(posts[0].id, z)).dokumente;
    const kopie = doks.find((x) => x.name === 'V-1.pdf')!;
    assert.ok((await seitentext(await alsPuffer((await d.dokumentInhalt(kopie.id)).inhalt))).includes(hex('ENTWURF')));
  });

  it('gleiche Prüfung und Wahl der Fassung bei einer und mehreren Mappen', async () => {
    const { d, lena, v1, pdf } = await aufbau();
    const z = await d.zugriff(lena);
    const ich = { id: lena.id, name: 'Lena', email: 'lena@example.org', rolle: 'mitglied' };
    const { m } = mailer();
    await assert.rejects(d.versendeMappe(v1.id, { an: 'a@example.org', betreff: 'x', fassungen: { [pdf.id]: 'kopie' } }, ich, m as never, z), status(422, /kennt nur/));
    await assert.rejects(d.versendeMappen({ ids: [v1.id], an: 'a@example.org', betreff: 'x', fassungen: { [pdf.id]: 'kopie' } }, ich, z, m as never), status(422, /kennt nur/));
    // Für alle „archiv“: ohne Archivfassung geht das Original, ohne Rückfrage – bei einer wie bei mehreren Mappen.
    const { mails, m: m2 } = mailer();
    await d.versendeMappen({ ids: [v1.id], an: 'a@example.org', betreff: 'x', angaben: false, dokumente: [pdf.id], fassung: 'archiv' }, ich, z, m2 as never);
    await d.versendeMappe(v1.id, { an: 'a@example.org', betreff: 'x', dokumente: [pdf.id], fassung: 'archiv' }, ich, m2 as never, z);
    assert.deepEqual(mails.map((x) => x.anhaenge.map((a) => a.name)), [['Vertrag.pdf'], ['Vertrag.pdf']]);
    // Je Dokument ausdrücklich „archiv“ (neu auch bei mehreren Mappen): gibt es keine, sagt Ablago es (404).
    await assert.rejects(d.versendeMappen({ ids: [v1.id], an: 'a@example.org', betreff: 'x', dokumente: [pdf.id], fassungen: { [pdf.id]: 'archiv' } }, ich, z, m2 as never), status(404));
    await assert.rejects(d.versendeMappe(v1.id, { an: 'a@example.org', betreff: 'x', dokumente: [pdf.id], fassungen: { [pdf.id]: 'archiv' } }, ich, m2 as never, z), status(404));
  });
});
