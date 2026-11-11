/**
 * Volltext aus Paketen (#614): Pakete mit `dms:volltext` liefern den Volltext für Dateitypen, die der Kern nicht selbst
 * liest (z. B. Word, E-Mails) – nur mit „Dokumente lesen“. Manifest, Ereignis bei Hochladen, neuer Version,
 * Installation und „Volltext neu erzeugen“, Stand und Meldung am Dokument, Rechte über die API, Grenze 5 Mio. Zeichen.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { HILFE } from '../../shared/src/hilfe';
import { gleicheRechte, liesCode, rechtePunkte, type InstalliertesPaket } from '../../shared/src/pakete';
import { INFO_VOLLTEXT_PAKET, VOLLTEXT_KOERPER_MAX, VOLLTEXT_ZEICHEN_MAX } from '../../shared/src/paketvolltext';
import { volltextHerkunft } from '../../shared/src/volltext';
import { speicherApiSchluesselRepo, ApiSchluesselDienst } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { schluesselRecht } from '../src/laeufer/verwaltung';
import { Texterkennung, type Engine } from '../src/texterkennung';
import { pdfMitText } from './hilfen';

const warte = async (bis: () => Promise<boolean>, ms = 20_000) => {
  const ende = Date.now() + ms;
  while (!(await bis())) {
    if (Date.now() > ende) throw new Error('Zeit abgelaufen');
    await new Promise((r) => setTimeout(r, 20));
  }
};

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EML = 'message/rfc822';
const DOCM = 'application/vnd.ms-word.document.macroenabled.12';
/** Kopf einer ZIP-Datei – mehr braucht der Kern nicht, er liest Word nie selbst. */
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('word/document.xml Angebot Küche', 'utf8')]);
const TEXT = 'Angebot für die neue Küche von Petra, Lieferung im März';

const MANIFEST_CODE = { sprache: 'c', ereignisse: ['datei.volltext'], volltext: [WORD, EML, 'text/plain', DOCM], rechte: { lesen: ['*'], dokumente: 'lesen', schnittstellen: ['dms:volltext'] } };

const paket = (id: string, code: Record<string, unknown>, name = 'Office und E-Mail'): InstalliertesPaket => ({
  id, name, version: '1.1.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, dms: '>=0.145.0',
  herkunft: { art: 'hochgeladen', von: null, am: '' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null,
  typen: {}, sichten: {}, abhaengigkeiten: {}, code: true, laeufer: liesCode(code).code!,
});
const office = () => paket('office_email', MANIFEST_CODE);

async function aufbau(o: { mitPaket?: boolean } = {}) {
  const repo = speicherRepo();
  const dateien = speicherDateien();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(repo, dateien, { einstellungen });
  const gelesen: string[] = [];
  const engine: Engine = async (_pfad, mime) => { gelesen.push(mime); return { text: TEXT, seiten: 1, info: 'Textebene des PDFs', ohneText: [] }; };
  const t = new Texterkennung(repo, dateien, einstellungen, engine, async () => ({ pdftotext: true, pdftoppm: true }));
  d.verbindeTexterkennung(t);
  t.paket = () => d.texterkennungPaket();
  t.volltextPaket = d.paketVolltext;
  t.nachher = (dok, e, k) => {
    if (e.stand !== 'fertig' && e.stand !== 'paket') return;
    void d.volltextFertig({ dokument: dok.id, mappe: dok.mappeId }, { quelle: 'kern', text: k.text, mime: dok.mime, seiten: e.seiten ?? null, neu: k.neu });
  };
  if (o.mitPaket !== false) await d.kern.repo.speicherePaket(office());
  // Ein Paket, das nur „Volltext fertig“ hört (z. B. für Vektoren).
  await d.kern.repo.speicherePaket(paket('hoerer', { sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'lesen' } }, 'Hörer'));
  const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [{ key: 'nr', label: 'Nr', typ: 'text', pflicht: true }], register: [
    { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr'] },
    { key: 'dokumente', name: 'Dokumente', art: 'dokumente', versionierung: true },
  ] });
  const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'V-1' } });
  const fertig = async (id: string) => warte(async () => !['wartet', 'laeuft'].includes((await repo.holeDokument(id))!.ocr!.stand));
  const hoch = async (name: string, inhalt: Buffer, typAngabe = WORD) => {
    const id = (await d.ladeHoch(m.id, { register: 'dokumente', name, typ: typAngabe }, inhalt, null)).dokument.id;
    await fertig(id);
    return id;
  };
  const ereignisse = async (art: string) => (await repo.faelligeEreignisse(1000)).filter((e) => e.art === art);
  const dok = async (id: string) => (await repo.holeDokument(id))!;
  /** So schreibt das Paket (Dienstkonto mit Paket-Kennung). */
  const schreibt = (id: string, text = TEXT) => d.schreibeVolltext(id, { text }, { id: 'konto', herkunft: 'Office und E-Mail 1.1.0', paket: true, ausgelesen: true });
  return { d, t, repo, m, hoch, fertig, ereignisse, dok, schreibt, gelesen };
}

describe('Volltext aus Paketen (#614): Manifest und Rechte', () => {
  it('code.volltext mit dms:volltext, Lesen und dem Ereignis; Fehler mit Grund; Vorschau nennt die Dateitypen', () => {
    const c = liesCode(MANIFEST_CODE);
    assert.deepEqual(c.fehler, []);
    assert.deepEqual(c.code!.volltext, [WORD, EML, 'text/plain', DOCM]);
    const f = (code: Record<string, unknown>) => liesCode({ ...MANIFEST_CODE, ...code }).fehler.join(' ');
    assert.match(f({ volltext: ['application/pdf'] }), /PDF \(application\/pdf\) liest Ablago selbst/);
    assert.match(f({ volltext: ['Word'] }), /kein Dateityp/);
    assert.match(f({ volltext: [] }), /dms:volltext braucht code.volltext/);
    assert.match(f({ rechte: { lesen: ['*'], schnittstellen: ['dms:volltext'] } }), /dms:volltext braucht auch code.rechte.dokumente: lesen/);
    assert.match(f({ ereignisse: [] }), /braucht das Ereignis datei.volltext/);
    assert.match(f({ rechte: { lesen: ['*'], dokumente: 'lesen' } }), /code.volltext: braucht code.rechte.schnittstellen/);
    assert.match(liesCode({ sprache: 'c', ereignisse: ['datei.volltext'], rechte: { dokumente: 'lesen' } }).fehler.join(' '), /datei.volltext gibt es nur mit/);
    assert.match(f({ volltext: Array.from({ length: 41 }, (_, i) => `application/x-${i}`) }), /höchstens 40 Dateitypen/);
    const punkte = rechtePunkte(c.code!, (v) => v);
    const p = punkte.find((x) => x.text.includes('dms:volltext'))!;
    assert.match(p.text, /^Volltext für Dateien liefern, .*nur ihren Volltext; Dokumente ändern, ersetzen oder löschen kann es nicht \(dms:volltext\): Word, E-Mail, Text$/);
    assert.ok(HILFE[p.hilfe], 'Handbuch-Stelle zum Recht');
    assert.ok(punkte.some((x) => x.unter?.some((u) => u.text.startsWith('Eine Datei braucht ihren Volltext') && HILFE[u.hilfe])), 'Ereignis mit Handbuch-Stelle');
    // Schlüssel „lesen und schreiben“ (PUT), andere Dateitypen heißt neu bestätigen.
    assert.equal(schluesselRecht(c.code!), 'schreiben');
    assert.equal(gleicheRechte(c.code!, liesCode(MANIFEST_CODE).code!), true);
    assert.equal(gleicheRechte(c.code!, liesCode({ ...MANIFEST_CODE, volltext: [WORD] }).code!), false);
  });
});

describe('Volltext aus Paketen (#614): Ablauf im Kern', () => {
  it('ohne Paket: ausgelassen mit Hinweis auf das Paket aus dem Katalog; kein Ereignis', async () => {
    const x = await aufbau({ mitPaket: false });
    const dok = await x.dok(await x.hoch('angebot.docx', DOCX));
    assert.equal(dok.ocr?.stand, 'ausgelassen');
    assert.equal(dok.ocr?.info, 'Word-Dateien bekommen Volltext mit dem Paket „Office und E-Mail“ (Werkbank → Pakete).');
    assert.deepEqual(await x.ereignisse('datei.volltext'), []);
    const stand = await x.d.umwandlungStand();
    assert.deepEqual(stand.typen.map((t) => [t.name, t.volltext, t.volltextKatalog?.id]), [['Word', null, 'office_email']]);
  });

  it('Hochladen: Ereignis an das zuständige Paket (einmal), „wartet auf Volltext“; das Paket schreibt → fertig, „Volltext fertig“ an die anderen', async () => {
    const x = await aufbau();
    const id = await x.hoch('angebot.docx', DOCX);
    let dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'paket');
    assert.equal(dok.ocr?.info, `${INFO_VOLLTEXT_PAKET} (Paket Office und E-Mail)`);
    assert.deepEqual(volltextHerkunft(dok.ocr), { art: 'volltext', paket: 'Office und E-Mail' });
    const ev = await x.ereignisse('datei.volltext');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].paketId, 'office_email');
    assert.deepEqual(ev[0].daten, { dokument: id, mappe: x.m.id, name: 'angebot.docx', mime: WORD, groesse: DOCX.length, sha256: dok.sha256 });
    assert.deepEqual(await x.ereignisse('volltext.fertig'), [], 'Volltext fertig erst, wenn das Paket schreibt');
    assert.deepEqual(x.gelesen, [], 'der Kern liest Word nicht');
    await x.schreibt(id);
    dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'fertig');
    assert.equal((await x.d.volltext(id)).text, TEXT);
    const vf = await x.ereignisse('volltext.fertig');
    assert.deepEqual(vf.map((e) => [e.paketId, e.daten.quelle, e.daten.mime]), [['hoerer', 'paket', WORD]]);
    // Werkbank: zuständiges Paket je Dateityp.
    const stand = await x.d.umwandlungStand();
    assert.deepEqual(stand.typen.map((t) => [t.name, t.volltext?.id]), [['Word', 'office_email']]);
    // Gleiche Datei noch einmal: Text übernommen, kein neues Ereignis.
    const zwei = await x.hoch('angebot-kopie.docx', DOCX);
    assert.equal((await x.dok(zwei)).ocr?.stand, 'fertig');
    assert.equal((await x.ereignisse('datei.volltext')).length, 1);
  });

  it('neue Version: eigenes Ereignis; „Volltext neu erzeugen“ (alle) fragt das Paket erneut, der Text bleibt so lange stehen', async () => {
    const x = await aufbau();
    const id = await x.hoch('angebot.docx', DOCX);
    await x.schreibt(id);
    // Neue Version: die neue Datei geht an das Paket.
    await x.d.ersetzeDokument(id, { name: 'angebot.docx', typ: WORD }, Buffer.concat([DOCX, Buffer.from(' Version 2')]), null);
    await x.fertig(id);
    let dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'paket');
    let ev = await x.ereignisse('datei.volltext');
    assert.equal(ev.length, 2);
    assert.equal(ev[1].daten.sha256, dok.sha256, 'mit dem Prüfwert der neuen Version');
    await x.schreibt(id, `${TEXT} – Version 2`);
    // „Volltext neu erzeugen“ für alle: Ereignis mit neu, Text bleibt bis dahin stehen.
    x.d.volltextNeu('alle', 'admin@example.org');
    await x.d.auftraege.warte();
    dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'paket');
    assert.equal((await x.d.volltext(id)).text, `${TEXT} – Version 2`, 'Text bleibt für die Suche stehen');
    ev = await x.ereignisse('datei.volltext');
    assert.equal(ev.length, 3);
    assert.equal(ev[2].daten.neu, true);
    // Am Dokument „Neu erzeugen“: ebenfalls mit neu – auch wenn noch eine Meldung unterwegs ist.
    await x.d.texterkennungErneut(id);
    await x.fertig(id);
    ev = await x.ereignisse('datei.volltext');
    assert.equal(ev.filter((e) => e.daten.neu).length >= 2, true);
    // Abbrechen verwirft das offene Ereignis; der Text bleibt.
    assert.deepEqual(await x.t.abbrechen([id], 'admin'), { abgebrochen: 1 });
    assert.deepEqual(await x.ereignisse('datei.volltext'), []);
    assert.equal((await x.d.volltext(id)).text, `${TEXT} – Version 2`);
  });

  it('Paket fertig ohne Volltext: Grund am Dokument; mit altem Text: fertig mit Grund; aufgegeben: Fehler', async () => {
    const x = await aufbau();
    const id = await x.hoch('geheim.docx', DOCX);
    const [e] = await x.ereignisse('datei.volltext');
    await x.d.nachTexterkennungsEreignis('office_email', e, { ok: true, text: 'Word lässt sich nicht lesen: mit einem Passwort verschlüsselt' });
    let dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'ausgelassen');
    assert.equal(dok.ocr?.info, 'Volltext durch Paket Office und E-Mail: Word lässt sich nicht lesen: mit einem Passwort verschlüsselt');
    // „Erneut versuchen“ meldet es wieder; gibt der Läufer auf: Fehler.
    await x.d.texterkennungErneut(id);
    await x.fertig(id);
    assert.equal((await x.dok(id)).ocr?.stand, 'paket');
    const e2 = (await x.ereignisse('datei.volltext')).at(-1)!;
    await x.d.nachTexterkennungsEreignis('office_email', e2, { ok: false, text: '', fehler: 'Zeitgrenze erreicht (120 s)', aufgegeben: true });
    dok = await x.dok(id);
    assert.equal(dok.ocr?.stand, 'fehler');
    assert.match(dok.ocr?.info ?? '', /Volltext durch Paket Office und E-Mail fehlgeschlagen: Zeitgrenze/);
    // Mit Text von vorher: fertig, der Text bleibt; ein Ergebnis nach dem Schreiben ändert nichts.
    const b = await x.hoch('brief.docx', Buffer.concat([DOCX, Buffer.from('b')]));
    await x.schreibt(b);
    await x.d.texterkennungErneut(b);
    await x.fertig(b);
    const e3 = (await x.ereignisse('datei.volltext')).at(-1)!;
    await x.d.nachTexterkennungsEreignis('office_email', e3, { ok: true, text: 'Word lässt sich nicht lesen: kaputt' });
    dok = await x.dok(b);
    assert.equal(dok.ocr?.stand, 'fertig');
    assert.match(dok.ocr?.info ?? '', /Paket Office und E-Mail: Word lässt sich nicht lesen/);
    assert.equal((await x.d.volltext(b)).text, TEXT);
    await x.schreibt(b);
    await x.d.nachTexterkennungsEreignis('office_email', e3, { ok: true, text: 'egal' });
    assert.equal((await x.dok(b)).ocr?.stand, 'fertig');
    assert.match((await x.dok(b)).ocr?.info ?? '', /^Volltext durch Paket Office und E-Mail 1\.1\.0/);
  });

  it('Paket installiert: vorhandene Dateien ohne Text gehen an das Paket, solche mit Text nicht; PDFs liest weiter der Kern', async () => {
    const x = await aufbau({ mitPaket: false });
    const a = await x.hoch('a.docx', DOCX);
    const b = await x.hoch('b.eml', Buffer.from('From: Lena\r\nSubject: Termin\r\n\r\nHallo', 'utf8'), EML);
    const c = await x.hoch('c.docx', Buffer.concat([DOCX, Buffer.from('c')]));
    await x.schreibt(c); // z. B. von einer früheren Version des Pakets mit Schreibrecht
    const pdf = await x.hoch('brief.pdf', pdfMitText([TEXT]), 'application/pdf');
    // Der Browser schickt den Typ mit Großbuchstaben, das Manifest nennt ihn klein.
    const makro = await x.hoch('makro.docm', Buffer.concat([DOCX, Buffer.from('m')]), 'application/vnd.ms-word.document.macroEnabled.12');
    assert.equal((await x.dok(a)).ocr?.stand, 'ausgelassen');
    await x.d.kern.repo.speicherePaket(office());
    assert.equal(await x.d.volltextPaketDa([WORD, EML, DOCM]), 3);
    await x.fertig(a); await x.fertig(b); await x.fertig(makro);
    assert.deepEqual((await x.ereignisse('datei.volltext')).map((e) => e.daten.dokument).sort(), [a, b, makro].sort());
    assert.equal((await x.dok(a)).ocr?.stand, 'paket');
    assert.equal((await x.dok(c)).ocr?.stand, 'fertig');
    assert.equal((await x.dok(pdf)).ocr?.stand, 'fertig');
    assert.equal(await x.d.volltextPaketDa(['application/x-unbekannt']), 0);
  });
});

describe('Volltext aus Paketen (#614): API für Pakete', () => {
  it('nur dms:volltext und Lesen: Volltext und Sprache für die eigenen Dateitypen; sonst 403; Dokumente ändern nie', async () => {
    const x = await aufbau();
    await x.d.kern.repo.speicherePaket(paket('nurlesen', { sprache: 'c', ereignisse: [], rechte: { lesen: ['*'], dokumente: 'lesen' } }, 'Nur lesen'));
    // Bestehende Pakete mit Schreibrecht (Texterkennung) bleiben, wie sie sind.
    await x.d.kern.repo.speicherePaket(paket('texterkennung', { sprache: 'c', ereignisse: ['volltext.fertig'], rechte: { lesen: ['*'], dokumente: 'schreiben', schnittstellen: ['dms:texterkennung'] } }, 'Texterkennung'));
    const konten = new Konten(speicherKontoRepo(), () => null, () => 'http://localhost', x.d.systemtypen.benutzerspiegel());
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const tabelle = routen(x.d, konten, { apiSchluessel: schluessel });
    const rufe = async (paketId: string, methode: string, pfad: string, params: Record<string, string>, body: unknown, query: Record<string, string> = {}) => {
      const konto = await konten.dienstkonto(paketId, paketId);
      x.d.kern.paketKonten.set(konto.id, paketId);
      const r = tabelle.find((y) => y.methode === methode && y.pfad === pfad)!;
      assert.ok(r, `${methode} ${pfad}`);
      const a = { body, params, query, ip: '127.0.0.1' } as unknown as Anfrage;
      const key = await schluessel.fuerDienstkonto(konto, schluesselRecht((await x.d.kern.repo.listePakete()).find((y) => y.id === paketId)!.laeufer!));
      await pruefeZugang(r as Route, a, (n) => (n === 'authorization' ? `Bearer ${key}` : undefined), konten, schluessel);
      return r.handler(a);
    };
    const word = await x.hoch('angebot.docx', DOCX);
    const pdf = await x.hoch('brief.pdf', pdfMitText([TEXT]), 'application/pdf');
    // Lesen und Volltext schreiben für Word.
    const inhalt = await rufe('office_email', 'GET', '/api/v1/dokumente/:id/inhalt', { id: word }, undefined);
    assert.ok(inhalt);
    const r = await rufe('office_email', 'PUT', '/api/v1/dokumente/:id/volltext', { id: word }, { text: TEXT });
    assert.equal((r.body as { ocr: { stand: string } }).ocr.stand, 'fertig');
    assert.match((r.body as { ocr: { info: string } }).ocr.info, /^Volltext durch Paket Office und E-Mail 1\.1\.0/);
    await rufe('office_email', 'PUT', '/api/v1/dokumente/:id/sprache', { id: word }, { sprache: 'deu' });
    // Nicht für PDFs (nicht zuständig) und nicht ohne dms:volltext.
    await assert.rejects(rufe('office_email', 'PUT', '/api/v1/dokumente/:id/volltext', { id: pdf }, { text: 'fremd' }), (e: { status?: number; message: string }) => e.status === 403 && /liefert dieses Paket keinen Volltext/.test(e.message));
    await assert.rejects(rufe('office_email', 'PUT', '/api/v1/dokumente/:id/sprache', { id: pdf }, { sprache: 'eng' }), (e: { status?: number }) => e.status === 403);
    await assert.rejects(rufe('nurlesen', 'PUT', '/api/v1/dokumente/:id/volltext', { id: word }, { text: 'x' }), (e: { status?: number }) => e.status === 403);
    // Dokumente ändern, ersetzen, löschen: nie.
    await assert.rejects(rufe('office_email', 'POST', '/api/v1/dokumente/:id/ersetzen', { id: word }, DOCX, { name: 'neu.docx' }), (e: { status?: number }) => e.status === 403);
    await assert.rejects(rufe('office_email', 'DELETE', '/api/v1/dokumente/:id', { id: word }, undefined), (e: { status?: number }) => e.status === 403);
    await assert.rejects(rufe('office_email', 'POST', '/api/v1/dokumente/:id/schwaerzen', { id: word }, {}), (e: { status?: number }) => e.status === 403);
    await assert.rejects(rufe('office_email', 'POST', '/api/v1/dokumente/:id/texterkennung', { id: word }, {}), (e: { status?: number }) => e.status === 403);
    assert.equal((await x.dok(word)).name, 'angebot.docx');
    assert.equal((await x.d.volltext(pdf)).text, TEXT);
    // Die Texterkennung (Schreibrecht) schreibt weiter für jedes Dokument.
    await rufe('texterkennung', 'PUT', '/api/v1/dokumente/:id/volltext', { id: pdf }, { text: `${TEXT} erkannt` });
    assert.equal((await x.d.volltext(pdf)).text, `${TEXT} erkannt`);
  });
});

describe('Volltext aus Paketen (#614): Grenze der Textmenge über HTTP', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let app: any; let cookie = ''; let id = ''; let x: Awaited<ReturnType<typeof aufbau>>;
  before(async () => {
    const { baueApp } = await import('../src/http');
    x = await aufbau({ mitPaket: false });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', x.d.systemtypen.benutzerspiegel());
    app = await baueApp(x.d, konten, {});
    const r = await app.inject({ method: 'POST', url: '/api/konto/einrichten', headers: { 'x-dms': '1' }, payload: { email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' } });
    assert.equal(r.statusCode, 201);
    cookie = String(r.headers['set-cookie']).split(';')[0];
    id = await x.hoch('lang.eml', Buffer.from('Subject: lang\r\n\r\nText', 'utf8'), EML);
  });
  after(async () => { await app?.close(); });

  it('5 Millionen Zeichen (über 2 MB) in einer Anfrage; mehr: 413 mit Grund', async () => {
    const text = 'ä'.repeat(VOLLTEXT_ZEICHEN_MAX);
    const koerper = JSON.stringify({ text });
    assert.ok(koerper.length > 2 * 1024 * 1024 && Buffer.byteLength(koerper) < VOLLTEXT_KOERPER_MAX);
    const r = await app.inject({ method: 'PUT', url: `/api/dokumente/${id}/volltext`, headers: { 'x-dms': '1', cookie, 'content-type': 'application/json' }, payload: koerper });
    assert.equal(r.statusCode, 200, r.body.slice(0, 300));
    assert.equal(((await x.d.volltext(id)).text ?? '').length, VOLLTEXT_ZEICHEN_MAX);
    const zuviel = await app.inject({ method: 'PUT', url: `/api/dokumente/${id}/volltext`, headers: { 'x-dms': '1', cookie, 'content-type': 'application/json' }, payload: JSON.stringify({ text: `${text}x` }) });
    assert.equal(zuviel.statusCode, 413);
    assert.match(zuviel.body, /höchstens 5000000 Zeichen/);
  });
});

describe('Herkunft „Volltext durch Paket“ (Frage 49)', () => {
  it('ausgelesener Text zählt als vom Paket, ein Grund ohne Text nicht', async () => {
    const { volltextHerkunft } = await import('../../shared/src/volltext');
    const { istPaketText } = await import('../../shared/src/pakete');
    assert.deepEqual(volltextHerkunft({ stand: 'fertig', info: 'Volltext durch Paket Office und E-Mail 1.1.0 · Sprache: deu (100 %)' } as never), { art: 'paket', ausgelesen: true, paket: 'Office und E-Mail 1.1.0' });
    assert.equal(volltextHerkunft({ stand: 'fertig', info: 'Volltext durch Paket Office und E-Mail: Word lässt sich nicht lesen' } as never), null);
    assert.deepEqual(volltextHerkunft({ stand: 'fertig', info: 'Texterkennung durch Paket Texterkennung 2.2.0' } as never), { art: 'paket', paket: 'Texterkennung 2.2.0' });
    assert.ok(istPaketText('Volltext durch Paket Office und E-Mail 1.1.0') && istPaketText('Texterkennung durch Paket X') && !istPaketText('Volltext über die API (x)'));
  });
});

describe('Paket entfernt (Frage 51)', () => {
  it('wartende Dokumente warten nicht mehr: ohne Text „kein Paket“, mit Text von vorher fertig', async () => {
    const x = await aufbau();
    const a = await x.hoch('angebot.docx', DOCX);
    assert.equal((await x.dok(a)).ocr?.stand, 'paket');
    const b = await x.hoch('brief.docx', Buffer.concat([DOCX, Buffer.from('b')]));
    await x.schreibt(b);
    await x.d.texterkennungErneut(b);
    await x.fertig(b);
    assert.equal((await x.dok(b)).ocr?.stand, 'paket');
    await x.d.kern.repo.loeschePaket('office_email');
    assert.equal(await x.d.paketWegFuerDateien(office(), [WORD]), 2);
    await x.fertig(a);
    const da = await x.dok(a);
    assert.equal(da.ocr?.stand, 'ausgelassen');
    assert.match(da.ocr?.info ?? '', /Office und E-Mail/);
    const db = await x.dok(b);
    assert.equal(db.ocr?.stand, 'fertig');
    assert.match(db.ocr?.info ?? '', /Text von vorher – das Paket Office und E-Mail ist entfernt/);
    assert.equal((await x.d.volltext(b)).text, TEXT);
    assert.equal(await x.d.paketWegFuerDateien(office(), [WORD]), 0, 'nichts wartet mehr');
  });
});
