/**
 * Archivfassung (PDF/A) für Pakete (#631): Recht `dms:archivfassung`, Ereignis erst nach feststehendem Volltext,
 * Wortpositionen, Annahme nur gültiger PDF/A ohne externe Inhalte, Hinweise (signiert, weggelassen, verschlüsselt,
 * schon PDF/A), Stand am Dokument und in der Werkbank, Weitergeben mit Wahl, Vollexport, Löschen.
 *
 * Ende zu Ende mit einem kleinen **Test-Paket** (hier in JavaScript statt WebAssembly): Es holt die offenen Ereignisse
 * aus dem Ausgangskorb, ruft die API v1 mit dem Schlüssel seines Dienstkontos (Recht aus dem Manifest), liest Datei
 * und Wortpositionen, baut mit pdf-lib ein PDF mit PDF/A-Kennung und legt es ab – wie der Paket-Läufer es täte.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import { inhaltsstrom } from './hilfen-schriften';
import { mailTyp, pdfaKennungAus, pruefeWoerter } from '../../shared/src/archivfassung';
import { HILFE } from '../../shared/src/hilfe';
import { liesBeschreibung } from '../../shared/src/paketeinstellungen';
import { setzeZeitzone, STANDARD_ZEITZONE } from '../../shared/src/region';
import { gleicheRechte, liesCode, rechtePunkte, type InstalliertesPaket } from '../../shared/src/pakete';
import { speicherApiSchluesselRepo, ApiSchluesselDienst } from '../src/apischluessel';
import { Archivfassung, ordnerArchiv, speicherArchiv } from '../src/archivfassung';
import { beendeArbeiter } from '../src/arbeit';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { schluesselRecht } from '../src/laeufer/verwaltung';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { Texterkennung, type Engine } from '../src/texterkennung';
import { vollexport } from '../src/vollexport';
import { setzePaketEinstellungen } from '../src/pakete/index';

after(() => beendeArbeiter());

const warte = async (bis: () => Promise<boolean>, ms = 20_000) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const TEXT = 'Stromrechnung der Stadtwerke Musterstadt für Januar, Kundennummer 4711';
const PDF = 'application/pdf';

/** PNG in Graustufen ohne Bildbibliothek. */
function png(b: number, h: number): Buffer {
  const crcTabelle = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (x: Buffer) => { let c = 0xffffffff; for (const y of x) c = crcTabelle[(c ^ y) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const stueck = (art: string, daten: Buffer) => {
    const kopf = Buffer.alloc(4); kopf.writeUInt32BE(daten.length);
    const typ = Buffer.from(art, 'latin1');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typ, daten])));
    return Buffer.concat([kopf, typ, daten, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(b, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const zeilen = Buffer.concat(Array.from({ length: h }, () => Buffer.from([0, ...Array.from({ length: b }, () => 200)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), stueck('IHDR', ihdr), stueck('IDAT', deflateSync(zeilen)), stueck('IEND', Buffer.alloc(0))]);
}

const XMP = (teil = '2', stufe = 'B') => `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" pdfaid:part="${teil}" pdfaid:conformance="${stufe}"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

/** Ein PDF mit Text (Textebene) und wahlweise PDF/A-Kennung, JavaScript, externem Verweis, Signatur, E-Rechnung. */
async function pdf(o: { text?: string; woerter?: Array<[string, number, number, number, number]>; pdfa?: { teil?: string; stufe?: string; gefiltert?: boolean }; js?: boolean; uri?: string; signiert?: boolean; erechnung?: boolean } = {}): Promise<Buffer> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const seite = doc.addPage([595, 842]);
  const schrift = await doc.embedFont(StandardFonts.Helvetica);
  if (o.text) seite.drawText(o.text, { x: 50, y: 780, size: 12, font: schrift });
  // Unsichtbare Textebene genau an den Wörtern (relativ, Ursprung oben links → pt, Ursprung unten links).
  for (const [t, x, y, , h] of o.woerter ?? []) seite.drawText(t, { x: x * 595, y: (1 - y - h) * 842, size: Math.max(4, h * 842), font: schrift, opacity: 0 });
  if (o.pdfa) {
    const strom = o.pdfa.gefiltert ? doc.context.flateStream(XMP(o.pdfa.teil, o.pdfa.stufe), { Type: 'Metadata', Subtype: 'XML' }) : doc.context.stream(XMP(o.pdfa.teil, o.pdfa.stufe), { Type: 'Metadata', Subtype: 'XML' });
    doc.catalog.set(PDFName.of('Metadata'), doc.context.register(strom));
  }
  if (o.js) doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ S: 'JavaScript', JS: PDFString.of('app.alert(1)') }));
  if (o.uri) seite.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 100, 100], A: { S: 'URI', URI: PDFString.of(o.uri) } })]));
  if (o.signiert) {
    const feld = doc.context.register(doc.context.obj({ FT: 'Sig', T: PDFString.of('Signatur'), V: { Type: 'Sig', ByteRange: [0, 0, 0, 0] } }));
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [feld], SigFlags: 3 }));
  }
  if (o.erechnung) {
    const datei = doc.context.register(doc.context.obj({ Type: 'Filespec', F: PDFString.of('factur-x.xml'), UF: PDFString.of('factur-x.xml') }));
    doc.catalog.set(PDFName.of('Names'), doc.context.obj({ EmbeddedFiles: { Names: [PDFString.of('factur-x.xml'), datei] } }));
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

const MANIFEST_CODE = {
  sprache: 'c', ereignisse: ['datei.archivfassung'],
  archivfassung: { typen: [PDF, 'image/jpeg', 'image/png', 'image/tiff'], auswahl: { pdf_text: 'pdf_text', pdf_scan: 'pdf_scan', bilder: 'bilder' } },
  rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:archivfassung'] },
  einstellungen: [{ abschnitt: 'PDF/A', felder: [
    { schluessel: 'pdf_text', name: 'PDFs mit Text', typ: 'janein', standard: true },
    { schluessel: 'pdf_scan', name: 'Gescannte PDFs', typ: 'janein', standard: true },
    { schluessel: 'bilder', name: 'Fotos und Bilder (.jpg, .jpeg, .png, .tif, .tiff)', typ: 'janein', standard: true },
  ] }],
};

const paket = (id: string, code: Record<string, unknown>, name: string): InstalliertesPaket => ({
  id, name, version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.149.0',
  herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
  typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: liesCode(code).code!, einstellungen: liesBeschreibung(code).beschreibung,
});
const pdfaPaket = () => paket('pdfa', MANIFEST_CODE, 'PDF/A');

async function aufbau(o: { mitPaket?: boolean; paket?: InstalliertesPaket } = {}) {
  const repo = speicherRepo();
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(repo, dateien, { einstellungen });
  const engine: Engine = async () => ({ text: TEXT, seiten: 1, info: 'Textebene des PDFs', ohneText: [] });
  const t = new Texterkennung(repo, dateien, einstellungen, engine, async () => ({ pdftotext: true, pdftoppm: true }));
  d.dokumente.verbindeTexterkennung(t);
  t.paket = () => d.volltexte.texterkennungPaket();
  t.volltextPaket = d.paketVolltext;
  t.nachher = (dok, e, k) => {
    // Wie ablago.ts: Ausgelassen geht an die Archivfassung (E-Mails ohne Volltext-Paket, #946).
    if (e.stand === 'ausgelassen') { void d.volltexte.volltextAusgelassen(dok.id); return; }
    if (e.stand !== 'fertig' && e.stand !== 'paket') return;
    void d.volltexte.volltextFertig({ dokument: dok.id, mappe: dok.mappeId }, { quelle: 'kern', text: k.text, mime: dok.mime, seiten: e.seiten ?? null, neu: k.neu });
  };
  const ablage = speicherArchiv();
  const a = new Archivfassung(d.dokumentArchiv.archivAnbindung(ablage));
  d.dokumentArchiv.verbindeArchivfassung(a);
  // Texterkennung als Paket: Bilder warten auf sie; sie schreibt den Volltext mit Wortpositionen.
  await d.kern.repo.speicherePaket(paket('texterkennung', { sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'schreiben', schnittstellen: ['dms:texterkennung'] } }, 'Texterkennung'));
  if (o.mitPaket !== false) await d.kern.repo.speicherePaket(o.paket ?? pdfaPaket());
  const typ = await d.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente', versionierung: true },
  ] });
  const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: 'R-1' } });
  const hoch = async (name: string, inhalt: Buffer, typAngabe = PDF) => {
    const id = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name, typ: typAngabe }, inhalt, null)).dokument.id;
    await warte(async () => !['wartet', 'laeuft'].includes((await repo.holeDokument(id))!.ocr!.stand));
    return id;
  };
  const offen = async () => (await repo.faelligeEreignisse(1000)).filter((e) => e.art === 'datei.archivfassung');
  const dok = async (id: string) => (await repo.holeDokument(id))!;
  // API wie der Paket-Läufer: Dienstkonto des Pakets mit seinem Schlüssel.
  const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', d.systemtypen.benutzerspiegel());
  const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
  const tabelle = routen(d, konten, { apiSchluessel: schluessel });
  const rufe = async (paketId: string, methode: string, pfad: string, params: Record<string, string>, body: unknown, query: Record<string, string> = {}) => {
    const konto = await konten.dienstkonto(paketId, paketId);
    d.kern.paketKonten.set(konto.id, paketId);
    const r = tabelle.find((y) => y.methode === methode && y.pfad === pfad)!;
    assert.ok(r, `${methode} ${pfad}`);
    const anfrage = { body, params, query, ip: '127.0.0.1' } as unknown as Anfrage;
    const key = await schluessel.fuerDienstkonto(konto, schluesselRecht((await d.kern.repo.listePakete()).find((y) => y.id === paketId)!.laeufer!));
    await pruefeZugang(r as Route, anfrage, (n) => (n === 'authorization' ? `Bearer ${key}` : undefined), konten, schluessel);
    return r.handler(anfrage);
  };
  /**
   * Das Test-Paket: arbeitet die offenen `datei.archivfassung` ab. `macher` baut das PDF/A aus Ereignis, Datei und
   * Wortpositionen (null: keins – mit Grund). Wie der Läufer: danach zugestellt und das Ergebnis an den Kern.
   */
  const laeufer = async (macher: (e: Record<string, unknown>, wp: { seiten: Array<{ woerter: Array<[string, number, number, number, number]> }> }, datei: Buffer) => Promise<Buffer | string> = async (_e, wp) => pdf({ pdfa: {}, woerter: wp.seiten.flatMap((s) => s.woerter) })) => {
    const erg: string[] = [];
    for (const e of await offen()) {
      const id = String(e.daten.dokument);
      const wp = (await rufe('pdfa', 'GET', '/api/v1/dokumente/:id/wortpositionen', { id }, undefined)).body as never;
      const quelle = e.daten.quelle === 'lesefassung' ? '/api/v1/dokumente/:id/fassung' : '/api/v1/dokumente/:id/inhalt';
      const datei = (await rufe('pdfa', 'GET', quelle, { id }, undefined)) as { datei?: { inhalt: Buffer } };
      const x = await macher(e.daten, wp, Buffer.isBuffer(datei.datei?.inhalt) ? datei.datei!.inhalt : Buffer.alloc(0));
      let text = typeof x === 'string' ? x : 'PDF/A-2b';
      if (Buffer.isBuffer(x)) {
        try { await rufe('pdfa', 'PUT', '/api/v1/dokumente/:id/archivfassung', { id }, x, { sha256: String(e.daten.sha256) }); } catch (f) { text = (f as Error).message; }
      }
      await repo.ereignisZugestellt(e.id);
      await d.volltexte.nachTexterkennungsEreignis('pdfa', e, { ok: true, text });
      erg.push(text);
    }
    return erg;
  };
  return { d, t, a, repo, m, hoch, offen, dok, rufe, laeufer, ablage, einstellungen, konten, tabelle };
}

describe('Archivfassung (#631): Manifest und Rechte', () => {
  it('code.archivfassung mit dms:archivfassung, Lesen und dem Ereignis; PDF, JPEG, PNG erlaubt; Vorschau nennt die Dateitypen', () => {
    const c = liesCode(MANIFEST_CODE);
    assert.deepEqual(c.fehler, []);
    assert.deepEqual(c.code!.archivfassung, { typen: [PDF, 'image/jpeg', 'image/png', 'image/tiff'], auswahl: { pdf_text: 'pdf_text', pdf_scan: 'pdf_scan', bilder: 'bilder' } });
    const f = (code: Record<string, unknown>) => liesCode({ ...MANIFEST_CODE, ...code }).fehler.join(' ');
    assert.match(f({ archivfassung: { typen: ['PDF'] } }), /kein Dateityp/);
    assert.match(f({ archivfassung: { typen: [] } }), /mindestens ein Dateityp/);
    assert.match(f({ archivfassung: { typen: [PDF], auswahl: { pdf_text: 'gibtsnicht' } } }), /auswahl.pdf_text: der Schlüssel einer Einstellung vom Typ janein/);
    assert.match(f({ archivfassung: { typen: [PDF], auswahl: { alles: 'pdf_text' } } }), /„alles“ gibt es nicht/);
    assert.match(f({ archivfassung: { typen: [PDF], nur_scans: 'pdf_text' } }), /„nur_scans“ gibt es nicht/);
    assert.deepEqual(liesCode({ ...MANIFEST_CODE, archivfassung: { typen: [PDF] } }).code!.archivfassung, { typen: [PDF] });
    assert.match(f({ archivfassung: { typen: [PDF], stufe: 'B' } }), /„stufe“ gibt es nicht/);
    assert.match(f({ rechte: { lesen: ['*'], schnittstellen: ['dms:archivfassung'] } }), /braucht auch code.rechte.dokumente: lesen/);
    assert.match(f({ ereignisse: [] }), /braucht das Ereignis datei.archivfassung/);
    assert.match(f({ rechte: { lesen: ['*'], dokumente: 'lesen' } }), /code.archivfassung: braucht code.rechte.schnittstellen/);
    assert.match(liesCode({ sprache: 'c', ereignisse: ['datei.archivfassung'], rechte: { dokumente: 'lesen' } }).fehler.join(' '), /datei.archivfassung gibt es nur mit/);
    const punkte = rechtePunkte(c.code!, (v) => v);
    const p = punkte.find((x) => x.text.includes('dms:archivfassung'))!;
    assert.match(p.text, /^Archivfassung \(PDF\/A\) ablegen – .*\(dms:archivfassung\): PDF, JPEG, PNG, TIFF$/);
    assert.ok(HILFE[p.hilfe], 'Handbuch-Stelle zum Recht');
    assert.ok(punkte.some((x) => x.unter?.some((u) => u.text.startsWith('Ein Dokument mit fertigem Volltext braucht seine Archivfassung') && HILFE[u.hilfe])), 'Ereignis mit Handbuch-Stelle');
    assert.equal(schluesselRecht(c.code!), 'schreiben');
    assert.equal(gleicheRechte(c.code!, liesCode({ ...MANIFEST_CODE, archivfassung: { typen: [PDF] } }).code!), false, 'andere Dateitypen: neu bestätigen');
  });

  it('PDF/A-Kennung aus XMP (Attribut, Element, anderes Präfix) und Wortpositionen prüfen', () => {
    assert.deepEqual(pdfaKennungAus(XMP('2', 'b')), { teil: 2, stufe: 'B' });
    assert.deepEqual(pdfaKennungAus('<r xmlns:id="http://www.aiim.org/pdfa/ns/id/"><id:part>3</id:part><id:conformance>U</id:conformance></r>'), { teil: 3, stufe: 'U' });
    assert.equal(pdfaKennungAus('<x pdfaid:part="2"/>'), null, 'ohne Namensraum keine Kennung');
    assert.deepEqual(pruefeWoerter([[['Rechnung', 0.1, 0.1, 0.2, 0.02]], null], 2), [[['Rechnung', 0.1, 0.1, 0.2, 0.02]], null]);
    assert.throws(() => pruefeWoerter([[['x', 0.9, 0.1, 0.2, 0.02]]], 1), /außerhalb der Seite/);
    assert.throws(() => pruefeWoerter([[]], 2), /1 Seiten, der Text hat 2/);
  });
});

describe('Archivfassung (#631): Ablauf Ende zu Ende mit dem Test-Paket', () => {
  it('Scan (PNG): Ereignis erst nach dem Volltext der Texterkennung, mit Wortpositionen; PDF/A angenommen, Stand, Historie, ansehen', async () => {
    const x = await aufbau();
    const id = await x.hoch('scan.png', png(40, 20), 'image/png');
    assert.equal((await x.dok(id)).ocr?.stand, 'paket', 'wartet auf die Texterkennung');
    assert.deepEqual(await x.offen(), [], 'kein Ereignis vor dem Volltext');
    // Die Texterkennung schreibt den Volltext mit Wortpositionen.
    const woerter: Array<[string, number, number, number, number]> = [['Stromrechnung', 0.1, 0.1, 0.3, 0.05], ['Januar', 0.45, 0.1, 0.2, 0.05]];
    await x.d.volltexte.schreibeVolltext(id, { text: 'Stromrechnung Januar', woerter: [woerter] }, { id: 'konto', herkunft: 'Texterkennung 2.2.0', paket: true });
    await warte(async () => (await x.offen()).length === 1);
    const [e] = await x.offen();
    const dok = await x.dok(id);
    assert.equal(e.paketId, 'pdfa');
    assert.deepEqual({ ...e.daten }, { dokument: id, mappe: x.m.id, name: 'scan.png', mime: 'image/png', groesse: dok.groesse, sha256: dok.sha256, quelle: 'original', seiten: 1, textebene: 'keine', wortpositionen: true, sprache: dok.sprache ?? null, signiert: false, erechnung: false, formular: false, extern: false, zeitzone: 'Europe/Berlin', neu: true });
    // Wortpositionen über das Recht (Lesen), ohne weiteres Recht; Bildmaße in Bildpunkten.
    const wp = (await x.rufe('pdfa', 'GET', '/api/v1/dokumente/:id/wortpositionen', { id }, undefined)).body as { vollstaendig: boolean; seiten: Array<{ quelle: string; breite: number; woerter: unknown[] }> };
    assert.equal(wp.vollstaendig, true);
    assert.deepEqual(wp.seiten.map((s) => [s.quelle, s.breite, s.woerter.length]), [['texterkennung', 40, 2]]);
    assert.equal(((await x.d.mappen.holeMappe(x.m.id)).dokumente.find((y) => y.id === id))!.archivfassung?.stand, 'wartet', 'am Dokument: wird erstellt');
    assert.deepEqual(await x.laeufer(), ['PDF/A-2b']);
    const s = ((await x.d.mappen.holeMappe(x.m.id)).dokumente.find((y) => y.id === id))!.archivfassung!;
    assert.equal(s.stand, 'fertig');
    assert.deepEqual(s.fassung?.pdfa, { teil: 2, stufe: 'B' });
    assert.equal(s.fassung?.paket.id, 'pdfa');
    const f = await x.d.dokumentArchiv.archivfassungVon(id);
    assert.equal(f.inhalt.subarray(0, 5).toString(), '%PDF-');
    assert.deepEqual(await x.repo.holeDokument(id).then((y) => y!.sha256), dok.sha256, 'das Original bleibt unverändert');
    const h = await x.d.mappenHistorie.historie(x.m.id);
    assert.ok(h.some((y) => y.art === 'archivfassung' && /PNG → PDF\/A-2b \(PDF\/A 1\.0\.0\)/.test(String(y.daten?.text))), JSON.stringify(h.map((y) => y.art)));
  });

  it('PDF mit Text: alle PDFs (Vorgabe), Wortpositionen aus der Textebene; „PDFs mit Text“ abgewählt lässt sie aus; Original schon PDF/A: keine zweite Datei', async () => {
    const x = await aufbau();
    const a = await x.hoch('rechnung.pdf', await pdf({ text: TEXT }));
    await warte(async () => (await x.offen()).length === 1);
    const [e] = await x.offen();
    assert.equal(e.daten.textebene, 'voll');
    assert.equal(e.daten.wortpositionen, true);
    const wp = (await x.rufe('pdfa', 'GET', '/api/v1/dokumente/:id/wortpositionen', { id: a }, undefined)).body as { seiten: Array<{ quelle: string; breite: number; woerter: Array<[string]> }> };
    assert.equal(wp.seiten[0].quelle, 'textebene');
    assert.equal(wp.seiten[0].breite, 595);
    assert.equal(wp.seiten[0].woerter[0][0], 'Stromrechnung');
    assert.deepEqual(await x.laeufer(), ['PDF/A-2b']);
    // „PDFs mit Text“ abgewählt: ein weiteres PDF mit Text bekommt keine – ruhig „ausgelassen – laut Einstellung“.
    await setzePaketEinstellungen(x.d.kern, 'pdfa', { werte: { pdf_text: false } });
    const b = await x.hoch('kontoauszug.pdf', await pdf({ text: `${TEXT} Kontoauszug` }));
    await warte(async () => (await x.a.stand(await x.dok(b)))?.stand === 'ausgelassen');
    assert.deepEqual(await x.offen(), []);
    assert.match(String((await x.a.stand(await x.dok(b)))!.info), /laut Einstellung bekommen PDFs mit Text keine Archivfassung/);
    // Wieder angekreuzt: der Bestand mit Text kommt dazu (wie nach dem Speichern der Einstellung).
    await setzePaketEinstellungen(x.d.kern, 'pdfa', { werte: { pdf_text: true } });
    assert.equal(await x.d.dokumentArchiv.archivPaketDa([PDF]), 1);
    // Schon gültiges PDF/A: gilt selbst als Archivfassung, kein Ereignis, keine zweite Datei.
    await x.laeufer();
    const c = await x.hoch('schon-pdfa.pdf', await pdf({ text: `${TEXT} schon archivfest`, pdfa: {} }));
    await warte(async () => (await x.a.stand(await x.dok(c)))?.stand === 'fertig');
    const s = (await x.a.stand(await x.dok(c)))!;
    assert.equal(s.fassung?.imOriginal, true);
    assert.deepEqual(await x.offen(), []);
    assert.equal(x.ablage.fassungen.get((await x.dok(c)).sha256)!.inhalt.length, 0, 'kein eigener Inhalt');
    assert.deepEqual((await x.d.dokumentArchiv.archivfassungVon(c)).inhalt, (await x.d.dokumente.dokumentInhalt(c).then(async (r) => Buffer.isBuffer(r.inhalt) ? r.inhalt : Buffer.concat(await (r.inhalt as NodeJS.ReadableStream & { toArray(): Promise<Buffer[]> }).toArray()))));
  });

  it('Auswahl (#660): „Fotos und Bilder“ und „Gescannte PDFs“ abgewählt lassen diese aus, nachträglich angekreuzt werden sie nachgeholt', async () => {
    const x = await aufbau();
    await setzePaketEinstellungen(x.d.kern, 'pdfa', { werte: { bilder: false, pdf_scan: false } });
    const woerter: Array<[string, number, number, number, number]> = [['Stromrechnung', 0.1, 0.1, 0.3, 0.05]];
    const bild = await x.hoch('foto.png', png(40, 20), 'image/png');
    await x.d.volltexte.schreibeVolltext(bild, { text: 'Stromrechnung', woerter: [woerter] }, { id: 'konto', herkunft: 'Texterkennung 2.2.0', paket: true });
    const scan = await x.hoch('scan.pdf', await pdf());
    await x.d.volltexte.schreibeVolltext(scan, { text: 'Stromrechnung', woerter: [woerter] }, { id: 'konto', herkunft: 'Texterkennung 2.2.0', paket: true });
    await warte(async () => (await x.a.stand(await x.dok(bild)))?.stand === 'ausgelassen' && (await x.a.stand(await x.dok(scan)))?.stand === 'ausgelassen');
    assert.deepEqual(await x.offen(), []);
    assert.match(String((await x.a.stand(await x.dok(bild)))!.info), /Fotos und Bilder/);
    assert.match(String((await x.a.stand(await x.dok(scan)))!.info), /gescannte PDFs/);
    // Ein PDF mit Text bekommt weiter eine (pdf_text an).
    await x.hoch('rechnung.pdf', await pdf({ text: TEXT }));
    await warte(async () => (await x.offen()).length === 1);
    assert.equal((await x.offen())[0].daten.textebene, 'voll');
    await x.laeufer();
    // Bilder wieder angekreuzt: das Foto wird nachgeholt, der Scan bleibt ausgelassen.
    await setzePaketEinstellungen(x.d.kern, 'pdfa', { werte: { bilder: true, pdf_scan: false } });
    assert.equal(await x.d.dokumentArchiv.archivPaketDa(['image/png', PDF]), 1);
    const [e] = await x.offen();
    assert.equal(e.daten.mime, 'image/png');
    assert.equal((await x.a.stand(await x.dok(scan)))?.stand, 'ausgelassen');
  });

  it('nimmt nur gültige PDF/A: ohne Kennung, komprimierte Metadaten, falsche Stufe, kein PDF, mit JavaScript oder externem Verweis abgelehnt – Grund am Dokument und in der Werkbank', async () => {
    const x = await aufbau();
    const id = await x.hoch('brief.pdf', await pdf({ text: TEXT }));
    await warte(async () => (await x.offen()).length === 1);
    const [e] = await x.offen();
    const put = (b: Buffer, sha = String(e.daten.sha256)) => x.rufe('pdfa', 'PUT', '/api/v1/dokumente/:id/archivfassung', { id }, b, { sha256: sha });
    const fehler = async (b: Buffer, status: number, muster: RegExp, sha?: string) => assert.rejects(put(b, sha), (f: { status?: number; message: string }) => { assert.equal(f.status, status, f.message); assert.match(f.message, muster); return true; });
    await fehler(await pdf({ text: TEXT }), 422, /XMP-Metadaten mit der PDF\/A-Kennung/);
    await fehler(await pdf({ pdfa: { gefiltert: true } }), 422, /komprimiert/);
    await fehler(await pdf({ pdfa: { teil: '2', stufe: 'X' } }), 422, /Konformitätsstufe „X“ gibt es für PDF\/A-2 nicht/);
    await fehler(await pdf({ pdfa: { teil: '7' } }), 422, /PDF\/A-Teil „7“/);
    await fehler(png(4, 4), 415, /PDF \(PDF\/A\)/);
    await fehler(await pdf({ pdfa: {}, js: true }), 422, /JavaScript/);
    await fehler(await pdf({ pdfa: {}, uri: 'https://zaehlpixel.example.org/p.gif' }), 422, /Aktionen, die etwas starten|externen Inhalt/);
    await fehler(await pdf({ pdfa: {} }), 409, /andere Datei/, 'a'.repeat(64));
    // Ein Paket ohne das Recht: 403.
    await x.d.kern.repo.speicherePaket(paket('fremd', { sprache: 'c', ereignisse: [], rechte: { lesen: ['*'], dokumente: 'lesen' } }, 'Fremd'));
    await assert.rejects(x.rufe('fremd', 'PUT', '/api/v1/dokumente/:id/archivfassung', { id }, await pdf({ pdfa: {} }), { sha256: String(e.daten.sha256) }), (f: { status?: number }) => f.status === 403);
    // Der Grund der letzten Ablehnung steht am Dokument und in der Werkbank – auch nach dem Ergebnis des Pakets.
    await x.repo.ereignisZugestellt(e.id);
    await x.d.volltexte.nachTexterkennungsEreignis('pdfa', e, { ok: true, text: 'abgelehnt' });
    const s = (await x.a.stand(await x.dok(id)))!;
    assert.equal(s.stand, 'fehler');
    assert.match(s.info ?? '', /^Archivfassung von Paket PDF\/A abgelehnt: .*Aktionen|externen/);
    const w = (await x.d.dokumentArchiv.archivStand())!;
    assert.equal(w.zaehler.fehler, 1);
    assert.deepEqual(w.liste.map((y) => [y.dokument, y.stand]), [[id, 'fehler']]);
  });

  it('nie nachladen: Original mit JavaScript und externem Verweis → Ereignis mit extern, Archivfassung ohne – Hinweis am Dokument; signiert und E-Rechnung gekennzeichnet', async () => {
    const x = await aufbau();
    const id = await x.hoch('newsletter.pdf', await pdf({ text: TEXT, js: true, uri: 'https://zaehlpixel.example.org/p.gif', signiert: true, erechnung: true }));
    await warte(async () => (await x.offen()).length === 1);
    const [e] = await x.offen();
    assert.equal(e.daten.extern, true);
    assert.equal(e.daten.signiert, true);
    assert.equal(e.daten.erechnung, true);
    assert.equal(e.daten.formular, true);
    assert.deepEqual(await x.laeufer(), ['PDF/A-2b']);
    const f = (await x.a.stand(await x.dok(id)))!.fassung!;
    assert.equal(f.weggelassen, true);
    assert.equal(f.signiert, true);
    assert.equal(f.erechnung, true);
    // Weitergeben mit Wahl: Archivfassung ausdrücklich gewählt; mehrere Dokumente mit „archiv“: E-Rechnung bleibt Original.
    const ich = { id: null, name: 'Markus' };
    const ar = await x.d.ausgang.dokumentFuerAusgabe(id, { fassung: 'archiv', ich });
    assert.equal(ar.name, 'newsletter (PDF-A).pdf');
    const or = await x.d.ausgang.dokumentFuerAusgabe(id, { ich });
    assert.equal(or.name, 'newsletter.pdf');
    await assert.rejects(x.d.ausgang.dokumentFuerAusgabe(id, { fassung: 'kopie', ich }), /kennt nur/);
  });

  it('#715: E-Mail mehrerer Mappen und ZIP-Export nehmen mit fassung „archiv“ die Archivfassung, ohne Fassung das Original', async () => {
    const x = await aufbau();
    const mit = await x.hoch('rechnung.pdf', await pdf({ text: TEXT }));
    await warte(async () => (await x.offen()).length === 1);
    await x.laeufer();
    const ohne = await x.hoch('notiz.pdf', await pdf({ text: `${TEXT} zwei` }));
    await warte(async () => (await x.offen()).length === 1);
    await x.laeufer(async () => 'kein PDF/A heute');
    assert.equal((await x.a.stand(await x.dok(mit)))?.stand, 'fertig');
    assert.notEqual((await x.a.stand(await x.dok(ohne)))?.stand, 'fertig');
    const ich = { id: '00000000-0000-4000-8000-000000000001', name: 'Markus', email: 'markus@example.org', rolle: 'admin' };
    const z = await x.d.rechtepruefung.zugriff({ id: ich.id, rolle: 'admin' });
    const mails: Array<{ anhaenge: Array<{ name: string; mime: string }> }> = [];
    const mailer = { async sende(_an: string, _b: string, _t: string, o?: { anhaenge?: Array<{ name: string; mime: string }> }) { mails.push({ anhaenge: o?.anhaenge ?? [] }); } };
    await x.d.ausgangEmail.versendeMappen({ ids: [x.m.id], an: 'steuer@example.org', betreff: 'Belege', angaben: false, dokumente: 'alle', fassung: 'archiv' }, ich, z, mailer as never);
    assert.deepEqual(mails[0].anhaenge.map((y) => y.name).sort(), ['notiz.pdf', 'rechnung (PDF-A).pdf']);
    await x.d.ausgangEmail.versendeMappen({ ids: [x.m.id], an: 'steuer@example.org', betreff: 'Belege', angaben: false, dokumente: 'alle' }, ich, z, mailer as never);
    assert.deepEqual(mails[1].anhaenge.map((y) => y.name).sort(), ['notiz.pdf', 'rechnung.pdf'], 'ohne Angabe: Original');
    await assert.rejects(x.d.ausgangEmail.versendeMappen({ ids: [x.m.id], an: 'a@example.org', betreff: 'x', fassung: 'kopie' }, ich, z, mailer as never), /kennt nur/);
    const zip = async (fassung?: string) => {
      const r = await x.d.ausgangExport.exportiere(ich, { format: 'zip', ids: [x.m.id], ...(fassung ? { fassung } : {}) }, z);
      const teile: Buffer[] = []; for await (const c of r.inhalt as AsyncIterable<Buffer>) teile.push(Buffer.from(c));
      const b = Buffer.concat(teile); assert.equal(b.length, r.groesse); return b.toString('latin1');
    };
    const a = await zip('archiv');
    assert.ok(a.includes('rechnung (PDF-A).pdf') && a.includes('notiz.pdf') && !a.includes('/rechnung.pdf'));
    const o = await zip();
    assert.ok(o.includes('/rechnung.pdf') && !o.includes('(PDF-A)'));
  });

  it('verschlüsselt: keine Archivfassung, Grund am Dokument; neue Version: die alte Archivfassung gilt nicht mehr, neues Ereignis; neu erzeugen; Löschen nimmt sie mit', async (t) => {
    const x = await aufbau();
    const id = await x.hoch('vertrag.pdf', await pdf({ text: TEXT }));
    await warte(async () => (await x.offen()).length === 1);
    await x.laeufer();
    const alt = await x.dok(id);
    assert.equal((await x.a.stand(alt))?.stand, 'fertig');
    // Neue Version: anderes Original → keine (veraltete) Archivfassung, bis das Paket neu erzeugt hat.
    await x.d.dokumentVersionen.ersetzeDokument(id, { name: 'vertrag.pdf', typ: PDF }, await pdf({ text: `${TEXT} Nachtrag` }), null);
    await warte(async () => (await x.offen()).length === 1);
    const neu = await x.dok(id);
    assert.notEqual(neu.sha256, alt.sha256);
    assert.equal((await x.a.stand(neu))?.stand, 'wartet');
    await assert.rejects(x.d.dokumentArchiv.archivfassungVon(id), /keine Archivfassung/);
    await x.laeufer();
    // Volltext neu erzeugen: Ereignis mit neu, auch wenn es schon eine gibt.
    await x.d.volltexte.texterkennungErneut(id);
    // Erst die Texterkennung (neu): Solange sie dran ist, steht der Volltext nicht fest – kein Ereignis.
    await warte(async () => (await x.dok(id)).ocr?.stand === 'paket');
    assert.deepEqual(await x.offen(), []);
    const vf = (await x.repo.faelligeEreignisse(1000)).filter((e) => e.art === 'volltext.fertig' && e.paketId === 'texterkennung' && e.daten.dokument === id).at(-1)!;
    assert.equal(vf.daten.neu, true);
    await x.d.volltexte.nachTexterkennungsEreignis('texterkennung', vf, { ok: true, text: 'Text aus dem PDF bleibt' });
    await warte(async () => (await x.offen()).some((e) => e.daten.neu === true));
    await x.laeufer();
    // Bestand nach der Installation (hier: Paket neu): alle fertigen ohne Archivfassung.
    const y = await aufbau({ mitPaket: false });
    const b1 = await y.hoch('a.pdf', await pdf({ text: TEXT }));
    await y.hoch('b.pdf', await pdf({ text: `${TEXT} zwei` }));
    await new Promise((r) => setTimeout(r, 200));
    await y.d.kern.repo.speicherePaket(pdfaPaket());
    assert.equal(await y.d.dokumentArchiv.archivPaketDa([PDF]), 2);
    assert.equal((await y.offen()).length, 2);
    // Löschen: Archivfassung, Stand und Wortpositionen mit weg.
    await y.laeufer();
    const sha = (await y.dok(b1)).sha256;
    assert.ok(y.ablage.fassungen.has(sha));
    await y.d.dokumente.loescheDokument(b1);
    await warte(async () => !y.ablage.fassungen.has(sha), 5000).catch(() => {});
    // Papierkorb an (Vorgabe?) – dann bleibt sie bis zum endgültigen Löschen; ohne Papierkorb ist sie weg.
    if (y.ablage.fassungen.has(sha)) assert.ok(await y.repo.dateiBenutzt(sha), 'nur, solange die Datei noch gebraucht wird (Papierkorb)');
    // Verschlüsselt (qpdf, sofern da): keine Archivfassung, Grund am Dokument.
    let qpdf = true;
    try { execFileSync('qpdf', ['--version']); } catch { qpdf = false; }
    if (!qpdf) { t.diagnostic('qpdf fehlt – verschlüsseltes PDF nicht geprüft'); return; }
    const dir = await mkdtemp(join(tmpdir(), 'dms-archiv-test-'));
    try {
      const ein = join(dir, 'ein.pdf'); const aus = join(dir, 'aus.pdf');
      await (await import('node:fs/promises')).writeFile(ein, await pdf({ text: `${TEXT} geheim` }));
      execFileSync('qpdf', ['--encrypt', '', 'besitzer', '256', '--', ein, aus]);
      const z = await x.hoch('geheim.pdf', await readFile(aus));
      await warte(async () => (await x.a.stand(await x.dok(z)))?.stand === 'ausgelassen');
      assert.match((await x.a.stand(await x.dok(z)))!.info ?? '', /verschlüsselt/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('Vollexport: Archivfassung als <Datei>.pdfa.pdf und Spalte archivfassung; Auskunft ohne', async () => {
    const x = await aufbau();
    const id = await x.hoch('rechnung.pdf', await pdf({ text: TEXT }));
    await warte(async () => (await x.offen()).length === 1);
    await x.laeufer();
    const ziel = await mkdtemp(join(tmpdir(), 'dms-archiv-export-'));
    try {
      const ex = await vollexport(x.d.vollexport.vollexportQuelle({ mandant: 'Test', version: '0', benutzer: async () => ({ benutzer: [], vertretungen: [] }), designs: async () => [], protokoll: () => [] }), ziel, {});
      const rel = ex.pfade.dokumente.get(id)!;
      const a = await readFile(join(ex.ordner, ...`${rel}.pdfa.pdf`.split('/')));
      assert.deepEqual(a, (await x.d.dokumentArchiv.archivfassungVon(id)).inhalt);
      const csv = await readFile(join(ex.ordner, 'daten', 'dokumente.csv'), 'utf8');
      // Anlagen (#998): zwei Spalten dahinter.
      assert.ok(csv.split('\r\n')[0].endsWith(',pfad,fassung,archivfassung,anlage_zu,anlage_nr'));
      assert.ok(csv.includes(`${rel}.pdfa.pdf`));
    } finally { await rm(ziel, { recursive: true, force: true }); }
  });
});

describe('Archivfassung (#631): Ablage im Haushaltsordner', () => {
  it('Archivfassung, Stand und Wortpositionen (gzip) als Dateien; Löschen nimmt alles mit', async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-archiv-ablage-'));
    try {
      const ab = ordnerArchiv(join(wurzel, 'h', 'archivfassungen'), join(wurzel, 'h', 'wortpositionen'));
      const sha = 'ab'.repeat(32);
      const info = { mime: 'application/pdf' as const, groesse: 3, sha256: 'x', seiten: 1, pdfa: { teil: 2, stufe: 'B' }, paket: { id: 'pdfa', name: 'PDF/A', version: '1.0.0' }, erstellt: '' };
      await ab.schreibe(sha, info, Buffer.from('pdf'));
      await ab.setzeStand(sha, { stand: 'wartet', info: null, paket: null, zeit: 'z' });
      await ab.setzeWoerter(sha, { seiten: [[['Wort', 0, 0, 0.1, 0.1]]], von: 'T', erstellt: '' });
      assert.deepEqual((await ab.lies(sha))!.inhalt.toString(), 'pdf');
      assert.equal((await ab.staende()).length, 1);
      assert.equal((await ab.woerter(sha))!.seiten[0]![0][0], 'Wort');
      assert.deepEqual(await ab.belegung(), { anzahl: 1, bytes: 3 });
      await ab.loesche(sha);
      assert.equal(await ab.info(sha), null);
      assert.equal(await ab.woerter(sha), null);
      assert.deepEqual(await ab.staende(), []);
    } finally { await rm(wurzel, { recursive: true, force: true }); }
  });
});

describe('Archivfassung (#799): bleibt unverändert, Herausgeben mit API-Schlüssel stempelt die Kopie', () => {
  /** Inhalt aller Inhaltsströme einer Seite als Text (Stempel steht als Hex darin). */
  const seitentext = async (b: Buffer, i = 0) => { const s = await inhaltsstrom(b, i); return `${s.roh}\n${s.text}`; };


  it('Paket bekommt die Archivfassung unverändert; Mensch mit API-Schlüssel und Pflicht-Stempel eine gestempelte Kopie ohne Deckblatt; Seitenbilder ebenso', async () => {
    const x = await aufbau();
    const id = await x.hoch('rechnung.pdf', await pdf({ text: TEXT }));
    await warte(async () => (await x.offen()).length === 1);
    assert.deepEqual(await x.laeufer(), ['PDF/A-2b']);
    const gespeichert = Buffer.from((await x.d.dokumentArchiv.archivfassungVon(id)).inhalt);
    const seiten = (await PDFDocument.load(gespeichert)).getPageCount();
    // Pflicht-Stempel am Mappentyp.
    const typ = (await x.d.mappentypen.listeTypen()).find((y) => y.name === 'Rechnung')!;
    await x.d.mappentypen.aendereTyp(typ.id, { ...typ, stempel: { modus: 'pflicht', vorlage: 'entwurf' } } as never);
    // Paket (Dienstkonto): unverändert, ohne Stempel.
    const paketAbruf = await x.rufe('pdfa', 'GET', '/api/v1/dokumente/:id/archivfassung', { id }, undefined) as { datei: { inhalt: Buffer; koepfe?: Record<string, string> } };
    assert.ok(paketAbruf.datei.inhalt.equals(gespeichert), 'Paket: Archivfassung wie gespeichert');
    assert.equal(paketAbruf.datei.koepfe?.['x-dms-stempel'], undefined);
    // Mensch mit API-Schlüssel (Administrator, also mit Exportrecht): gestempelte Kopie.
    const { benutzer: markus } = await x.konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
    await x.d.postSystemmappen.gleicheBenutzerAb(await x.konten.listeBenutzer());
    const mensch = async (pfad: string, params: Record<string, string>, query: Record<string, string> = {}) => {
      const r = x.tabelle.find((y) => y.methode === 'GET' && y.pfad === pfad)!;
      return r.handler({ body: undefined, params, query, ip: '1', benutzer: markus, apiSchluessel: { id: 'k', name: 'Skript', recht: 'lesen' } } as unknown as Anfrage) as Promise<{ datei: { inhalt: Buffer; name: string; koepfe?: Record<string, string> } }>;
    };
    const k = await mensch('/api/dokumente/:id/archivfassung', { id });
    assert.equal(k.datei.koepfe?.['x-dms-stempel'], '1');
    assert.equal(k.datei.name, 'rechnung (PDF-A).pdf');
    assert.equal((await PDFDocument.load(k.datei.inhalt)).getPageCount(), seiten, 'kein eigenes Deckblatt');
    assert.ok((await seitentext(k.datei.inhalt)).includes('ENTWURF'), 'Stempel auf der Seite des Dokuments');
    assert.ok((await x.d.dokumentArchiv.archivfassungVon(id)).inhalt.equals(gespeichert), 'gespeicherte Archivfassung unverändert');
    const h = (await x.d.mappenHistorie.historie(x.m.id)).filter((e) => e.art === 'weitergegeben');
    assert.ok(h.some((e) => /über die API \(Archivfassung\)/.test(String(e.daten.text))), 'Historie vermerkt die Weitergabe');
    // Seitenbilder: aus der gestempelten Kopie (Graustufen); die Oberfläche bekommt sie wie abgelegt.
    const ui = await x.d.pdfBearbeiten.seiteAlsGraubild(id, 1, 72);
    const api = (await mensch('/api/dokumente/:id/seiten/:nr/scan', { id, nr: '1' }, { dpi: '72' })).datei.inhalt;
    assert.equal(api.length, ui.length, 'gleiche Größe');
    assert.ok(!api.equals(ui), 'mit Stempel');
    assert.ok((await x.d.pdfBearbeiten.seiteAlsGraubild(id, 1, 72)).equals(ui), 'ohne API-Schlüssel wie abgelegt');
    // Das Seitenbild der Seitenansicht ebenso.
    const bildApi = (await mensch('/api/dokumente/:id/seiten/:nr/bild', { id, nr: '1' })).datei.inhalt;
    const bildUi = (await x.d.pdfBearbeiten.pdfSeitenbild(id, 1))!;
    assert.ok(!bildApi.equals(bildUi));
    // Ohne Pflicht: die Archivfassung, wie sie ist.
    await x.d.mappentypen.aendereTyp(typ.id, { ...typ, stempel: null } as never);
    const ohne = await mensch('/api/dokumente/:id/archivfassung', { id });
    assert.ok(ohne.datei.inhalt.equals(gespeichert));
  });
});

/* ---------- E-Mails (#946) ---------- */

const EML = 'message/rfc822';
const MSG = 'application/vnd.ms-outlook';
const OCTET = 'application/octet-stream';
/** Eine einfache Mail (nur reservierte Domains, Persona-Namen). */
const mail = (betreff = 'Auftragsbestätigung') => Buffer.from([
  'From: Stadtwerke Musterstadt <kundenservice@example.org>', 'To: Markus <markus@example.com>', 'Date: Fri, 06 Nov 2026 09:15:00 +0100',
  `Subject: ${betreff}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', 'Guten Tag Markus,', '', 'wir bestätigen Ihren Auftrag.', '',
].join('\r\n'));
/** Paket PDF/A mit E-Mails (wie dms-registry #143): Typen und Einstellung „E-Mails (.eml, .msg)“. */
const MANIFEST_MAIL = {
  ...MANIFEST_CODE,
  archivfassung: { typen: [PDF, 'image/jpeg', 'image/png', EML, MSG, OCTET], auswahl: { pdf_text: 'pdf_text', pdf_scan: 'pdf_scan', bilder: 'bilder', emails: 'emails' } },
  einstellungen: [{ abschnitt: 'PDF/A', felder: [
    ...MANIFEST_CODE.einstellungen[0].felder,
    { schluessel: 'emails', name: 'E-Mails (.eml, .msg)', typ: 'janein', standard: true },
  ] }],
};
const mailPaket = () => paket('pdfa', MANIFEST_MAIL, 'PDF/A');
/** Paket Office und E-Mail: liefert den Volltext von Mails (#614). */
const officePaket = () => paket('office_email', { sprache: 'c', ereignisse: ['datei.volltext'], volltext: [EML, MSG], rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:volltext'] } }, 'Office und E-Mail');

describe('Archivfassung für E-Mails (#946)', () => {
  it('Art emails: message/rfc822, Outlook und octet-stream nur mit Endung .eml/.msg; Auswahl emails im Manifest', async () => {
    assert.equal(mailTyp(EML), EML);
    assert.equal(mailTyp('Message/RFC822', 'x.pdf'), EML);
    assert.equal(mailTyp(MSG), MSG);
    assert.equal(mailTyp(OCTET, 'Kündigung.EML'), EML);
    assert.equal(mailTyp(OCTET, 'bestaetigung.msg'), MSG);
    assert.equal(mailTyp(OCTET, 'daten.bin'), null);
    assert.equal(mailTyp(OCTET), null);
    assert.equal(mailTyp(PDF, 'falsch.eml'), null, 'nur octet-stream nach der Endung');
    // Manifest: emails ist eine Art wie die übrigen (#660) – an eine Ja/Nein-Einstellung gehängt.
    const c = liesCode(MANIFEST_MAIL);
    assert.deepEqual(c.fehler, []);
    assert.equal(c.code!.archivfassung!.auswahl!.emails, 'emails');
    assert.match(liesCode({ ...MANIFEST_MAIL, archivfassung: { typen: [EML], auswahl: { mails: 'emails' } } }).fehler.join(' '), /„mails“ gibt es nicht \(nur pdf_text, pdf_scan, bilder, emails\)/);
    assert.match(liesCode({ ...MANIFEST_MAIL, archivfassung: { typen: [EML], auswahl: { emails: 'gibts-nicht' } } }).fehler.join(' '), /auswahl\.emails/);
    // Zuständig: octet-stream nur mit passender Endung – auch wenn das Paket octet-stream nennt; ohne octet-stream in
    // den Typen genügt message/rfc822 bzw. Outlook.
    const x = await aufbau({ paket: mailPaket() });
    assert.equal((await x.a.paketFuer(OCTET, undefined, 'mail.eml'))?.id, 'pdfa');
    assert.equal(await x.a.paketFuer(OCTET, undefined, 'daten.bin'), null);
    assert.equal(await x.a.paketFuer(OCTET), null);
    const ohneOctet = [{ id: 'p', name: 'P', version: '1', typen: [EML, MSG] }];
    assert.equal((await x.a.paketFuer(OCTET, ohneOctet, 'brief.msg'))?.id, 'p');
    assert.equal((await x.a.paketFuer(EML, ohneOctet))?.id, 'p');
  });

  it('ohne Volltext-Paket: Mails (.eml, .msg, octet-stream mit Endung) werden gemeldet – ohne Wortpositionen, mit Zeitzone; das PDF/A ohne Textebene wird angenommen und angezeigt', async () => {
    setzeZeitzone('Europe/Vienna');
    try {
      const x = await aufbau({ paket: mailPaket() });
      const eml = await x.hoch('Auftragsbestätigung.eml', mail(), EML);
      assert.equal((await x.dok(eml)).ocr?.stand, 'ausgelassen', 'kein Paket liefert den Volltext');
      await warte(async () => (await x.offen()).length === 1);
      const [e] = await x.offen();
      assert.equal(e.daten.mime, EML);
      assert.equal(e.daten.name, 'Auftragsbestätigung.eml');
      assert.equal(e.daten.quelle, 'original');
      assert.equal(e.daten.textebene, 'keine');
      assert.equal(e.daten.wortpositionen, true, 'Wortpositionen verlangt der Kern für Mails nicht');
      assert.equal(e.daten.seiten, null);
      assert.equal(e.daten.zeitzone, 'Europe/Vienna');
      assert.equal((await x.a.stand(await x.dok(eml)))?.stand, 'wartet');
      // Outlook und octet-stream mit Endung ebenso; octet-stream ohne passende Endung nie.
      await x.hoch('Kündigung.msg', mail('Kündigungsbestätigung'), MSG);
      await x.hoch('weitergeleitet.eml', mail('WG: Termin'), OCTET);
      const bin = await x.hoch('daten.bin', Buffer.from('nur Bytes, keine Mail'), OCTET);
      await warte(async () => (await x.offen()).length === 3);
      await new Promise((r) => setTimeout(r, 100));
      const offen = await x.offen();
      assert.deepEqual(offen.map((y) => y.daten.mime).sort(), [MSG, OCTET, EML].sort());
      assert.equal(offen.find((y) => y.daten.mime === OCTET)?.daten.name, 'weitergeleitet.eml');
      assert.equal(await x.a.stand(await x.dok(bin)), null);
      // Das Paket liest nur /inhalt und legt ein PDF/A ohne Textebene ab: Die Grob-Prüfung nimmt es an.
      const erg = await x.laeufer(async (daten, _wp, datei) => {
        assert.match(datei.toString('utf8'), /Subject: /, `Original von ${String(daten.name)}`);
        return pdf({ pdfa: {} });
      });
      assert.deepEqual(erg, ['PDF/A-2b', 'PDF/A-2b', 'PDF/A-2b']);
      const s = (await x.a.stand(await x.dok(eml)))!;
      assert.equal(s.stand, 'fertig');
      assert.equal(s.fassung?.pdfa.teil, 2);
      const v = await x.d.dokumentArchiv.archivfassungVon(eml);
      assert.equal(v.inhalt.subarray(0, 5).toString('latin1'), '%PDF-');
      assert.equal((await x.dok(eml)).anzeigbar, false, 'das Original zeigt der Browser nicht – „Original anzeigen“ lädt es herunter');
      // Ein PDF trägt die Zeitzone ebenso (alle Arten).
      await x.hoch('rechnung.pdf', await pdf({ text: TEXT }));
      await warte(async () => (await x.offen()).length === 1);
      assert.equal((await x.offen())[0].daten.zeitzone, 'Europe/Vienna');
    } finally { setzeZeitzone(STANDARD_ZEITZONE); }
  });

  it('mit Office und E-Mail: die Mail wartet wie bisher auf den Volltext und wird danach gemeldet', async () => {
    const x = await aufbau({ paket: mailPaket() });
    await x.d.kern.repo.speicherePaket(officePaket());
    const id = await x.hoch('Auftragsbestätigung.eml', mail(), EML);
    assert.equal((await x.dok(id)).ocr?.stand, 'paket');
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(await x.offen(), [], 'erst mit feststehendem Volltext');
    await x.d.volltexte.schreibeVolltext(id, { text: 'Guten Tag Markus, wir bestätigen Ihren Auftrag über die Lieferung.' }, { id: 'konto', herkunft: 'Office und E-Mail 1.1.0', paket: true, ausgelesen: true });
    await warte(async () => (await x.offen()).length === 1);
    const [e] = await x.offen();
    assert.equal(e.daten.mime, EML);
    assert.equal(e.daten.wortpositionen, true);
  });

  it('Auswahl emails aus: „ausgelassen – laut Einstellung“; später angekreuzt: Ablago holt die Mails nach', async () => {
    const x = await aufbau({ paket: mailPaket() });
    await setzePaketEinstellungen(x.d.kern, 'pdfa', { werte: { emails: false } });
    const eml = await x.hoch('Auftragsbestätigung.eml', mail(), EML);
    const oct = await x.hoch('Kündigung.eml', mail('Kündigungsbestätigung'), OCTET);
    await warte(async () => (await x.a.stand(await x.dok(eml)))?.stand === 'ausgelassen' && (await x.a.stand(await x.dok(oct)))?.stand === 'ausgelassen');
    assert.deepEqual(await x.offen(), []);
    assert.match(String((await x.a.stand(await x.dok(eml)))!.info), /laut Einstellung bekommen E-Mails keine Archivfassung/);
    // Bilder bleiben davon unberührt.
    const bild = await x.hoch('foto.png', png(40, 20), 'image/png');
    await x.d.volltexte.schreibeVolltext(bild, { text: 'Stromrechnung', woerter: [[['Stromrechnung', 0.1, 0.1, 0.3, 0.05]]] }, { id: 'konto', herkunft: 'Texterkennung 2.2.0', paket: true });
    await warte(async () => (await x.offen()).length === 1);
    assert.equal((await x.offen())[0].daten.mime, 'image/png');
    await x.laeufer();
    // Wieder angekreuzt: beide Mails kommen nach (auch die als octet-stream mit Endung).
    await setzePaketEinstellungen(x.d.kern, 'pdfa', { werte: { emails: true } });
    assert.equal(await x.d.dokumentArchiv.archivPaketDa(MANIFEST_MAIL.archivfassung.typen), 2);
    assert.deepEqual((await x.offen()).map((y) => y.daten.name).sort(), ['Auftragsbestätigung.eml', 'Kündigung.eml']);
  });
});
