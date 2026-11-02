/**
 * „Aus Dokument ausfüllen“, Stufe 2 (#511): Erkennung per Paket mit dem Recht dms:erkennen – Wahl in der Werkbank
 * und am Mappentyp, Bestätigung des Datenabflusses, Schema ohne Passwortfelder und Verweise, Prüfung jeder
 * Antwort, Rückfall auf die eingebaute Erkennung und der echte Paket-Läufer. Namen und Texte sind erfunden.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { ERKENNEN_HINWEIS, liesAusDokument } from '../../shared/src/erkennung';
import { liesCode, rechtePunkte, type InstalliertesPaket } from '../../shared/src/pakete';
import { HILFE } from '../../shared/src/hilfe';
import { ApiSchluesselDienst, speicherApiSchluesselRepo } from '../src/apischluessel';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import type { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { Paketlaeufer } from '../src/laeufer/verwaltung';
import { liesPaket } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { routen } from '../src/routen';

const KARTE = `Musterbau GmbH
Jonas Beispiel
Bauleiter
Tel. 0351 7654321
jonas.beispiel@musterbau.example
Musterweg 12, 01234 Musterstadt`;

const paket = (id: string, netz: string[] = []): InstalliertesPaket => ({
  id, name: `Erkennung ${id}`, version: '1.0.0', beschreibung: '', lizenz: 'Apache-2.0', autor: { name: 'T', github: 't' }, herkunft: { art: 'hochgeladen', von: null, am: '' },
  installiert: '', installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {}, code: true,
  laeufer: { sprache: 'c', ereignisse: [], rechte: { lesen: [], schreiben: [], dokumente: 'keine', schnittstellen: ['dms:erkennen'] }, netz, modul: { sha256: 'x', groesse: 1 } },
});

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const register = [{ key: 'allgemein', name: 'Allgemein', art: 'felder' as const }, { key: 'dokumente', name: 'Dokumente', art: 'dokumente' as const }];
  const organisation = await d.legeTypAn({ name: 'Organisation', felder: [{ key: 'name', label: 'Name', typ: 'text', erkennung: {} }], register });
  const person = await d.legeTypAn({ name: 'Person', felder: [
    { key: 'vorname', label: 'Vorname', typ: 'text', erkennung: {} },
    { key: 'nachname', label: 'Nachname', typ: 'text', erkennung: {} },
    { key: 'funktion', label: 'Funktion', typ: 'text', erkennung: {} },
    { key: 'email', label: 'E-Mail', typ: 'text', erkennung: {} },
    { key: 'geburtstag', label: 'Geburtstag', typ: 'datum', erkennung: {} },
    { key: 'anrede', label: 'Anrede', typ: 'auswahl', optionen: ['Frau', 'Herr'], erkennung: {} },
    { key: 'organisation', label: 'Organisation', typ: 'referenz', zielTyp: organisation.id, erkennung: {} },
    { key: 'kennwort', label: 'Kennwort', typ: 'passwort' },
  ], register });
  const A = await d.zugriff({ id: lena.id, rolle: 'admin' });
  const eingaenge: Array<Record<string, unknown>> = [];
  let antwort: () => Promise<string> = async () => JSON.stringify({
    vorname: { wert: 'Jonas', sicherheit: 'hoch', fundstelle: 'Jonas Beispiel' },
    nachname: { wert: 'Beispiel', sicherheit: 'hoch' },
    funktion: 'Bauleiter',
    geburtstag: { wert: '31.02.2026' },                       // falsches Format → verworfen
    anrede: { wert: 'Divers' },                               // nicht in der Auswahl → verworfen
    unbekannt: { wert: 'x' },                                 // gibt es nicht → verworfen
    kennwort: { wert: 'geheim' },                             // Passwortfeld → verworfen
    organisation: { wert: '00000000-0000-4000-8000-00000000abcd' },  // Verweis vom Paket → nie
  });
  d.erkennung.anbieter = {
    pakete: () => [{ id: 'ki', name: 'Erkennung ki', netz: false }, { id: 'wolke', name: 'Erkennung wolke', netz: true }],
    erkenne: async (_p, e) => { eingaenge.push(e); return { text: await antwort(), ms: 3 }; },
  };
  await d.speicherePaket(paket('ki'));
  await d.speicherePaket(paket('wolke', ['https://anbieter.example/v1']));
  return { d, konten, A, person, organisation, eingaenge, setzeAntwort: (f: () => Promise<string>) => { antwort = f; } };
}

describe('Aus Dokument ausfüllen per Paket (#511)', () => {
  it('Recht dms:erkennen im Manifest und in der Rückfrage; Engine am Mappentyp wird gelesen', () => {
    const c = liesCode({ sprache: 'c', rechte: { schnittstellen: ['dms:erkennen'] } });
    assert.deepEqual(c.fehler, []);
    const p = rechtePunkte(c.code!, (v) => v).find((x) => x.text.includes('(dms:erkennen)'))!;
    assert.equal(p.hilfe, 'pakete.recht.erkennen');
    assert.ok(HILFE['pakete.recht.erkennen'] && HILFE['pakete.erkennung']);
    assert.deepEqual(liesAusDokument({ engine: 'ki', abfluss: true, beschriftung: ' Karte ' }), { beschriftung: 'Karte', engine: 'ki', abfluss: true });
    assert.deepEqual(liesAusDokument({ engine: 'eingebaut', abfluss: true }), { engine: 'eingebaut' });
    assert.equal(liesAusDokument({ engine: 'Böse Engine!' }), null);
  });

  it('Standard in der Werkbank: Paket erkennt, Schema ohne Passwort und Verweise, jede Antwort geprüft; Verweise wie bisher', async () => {
    const x = await aufbau();
    const ohne = await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A);
    assert.deepEqual(ohne.engine, { art: 'eingebaut' }, 'Standard: eingebaut');
    assert.equal(x.eingaenge.length, 0);
    await x.d.erkennung.setzeStandard({ paket: 'ki' });
    const r = await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A);
    assert.deepEqual(r.engine, { art: 'paket', id: 'ki', name: 'Erkennung ki' });
    assert.deepEqual(Object.fromEntries(Object.entries(r.vorschlaege).filter(([k]) => k !== 'organisation').map(([k, v]) => [k, v.wert])), { vorname: 'Jonas', nachname: 'Beispiel', funktion: 'Bauleiter' });
    assert.equal(r.vorschlaege.vorname.sicherheit, 'hoch');
    assert.equal(r.verworfen, 4, 'Datum, Auswahl, unbekanntes Feld, Passwort');
    assert.ok(!r.vorschlaege.organisation || r.vorschlaege.organisation.wert !== '00000000-0000-4000-8000-00000000abcd', 'keine Mappen-Id vom Paket');
    assert.equal(r.neu.organisation?.werte.name, 'Musterbau GmbH', 'Verweis: neu anlegen wie bei der eingebauten Erkennung');
    const e = x.eingaenge[0] as { schema: { properties: Record<string, unknown> }; text: string; hinweis: string; typ: string };
    assert.deepEqual(Object.keys(e.schema.properties).sort(), ['anrede', 'email', 'funktion', 'geburtstag', 'nachname', 'vorname']);
    assert.equal(e.text, KARTE); assert.equal(e.typ, 'Person'); assert.equal(e.hinweis, ERKENNEN_HINWEIS);
  });

  it('am Mappentyp überschreibbar; Paket mit Netz nur mit bestätigtem Datenabfluss (Werkbank und Mappentyp)', async () => {
    const x = await aufbau();
    await assert.rejects(x.d.erkennung.setzeStandard({ paket: 'wolke' }), (e: Fachfehler) => e.status === 409 && (e.details as { abfluss?: boolean }).abfluss === true);
    await assert.rejects(x.d.erkennung.setzeStandard({ paket: 'gibtsnicht' }), (e: Fachfehler) => e.status === 422);
    const s = await x.d.erkennung.setzeStandard({ paket: 'wolke', abfluss: true });
    assert.deepEqual(s.standard, { paket: 'wolke', abfluss: true });
    assert.deepEqual((await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A)).engine, { art: 'paket', id: 'wolke', name: 'Erkennung wolke' });
    // Am Typ: eingebaut – überschreibt den Standard.
    await x.d.aendereTyp(x.person.id, { ...x.person, ausDokument: { engine: 'eingebaut' } });
    assert.deepEqual((await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A)).engine, { art: 'eingebaut' });
    // Am Typ ein Paket mit Netz: nur mit Bestätigung.
    await assert.rejects(x.d.aendereTyp(x.person.id, { ...x.person, ausDokument: { engine: 'wolke' } }), (e: Fachfehler) => e.status === 409);
    await x.d.aendereTyp(x.person.id, { ...x.person, ausDokument: { engine: 'wolke', abfluss: true } });
    assert.deepEqual((await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A)).engine.art, 'paket');
    // Werkbank-Routen.
    const tabelle = routen(x.d, x.konten, {});
    const ich = (await x.konten.listeBenutzer())[0];
    const g = await tabelle.find((r) => r.methode === 'GET' && r.pfad === '/api/werkbank/erkennung')!.handler({ body: {}, params: {}, query: {}, ip: '1', benutzer: ich });
    assert.deepEqual((g.body as { pakete: Array<{ id: string; netz: boolean }> }).pakete.map((p) => [p.id, p.netz]), [['ki', false], ['wolke', true]]);
  });

  it('antwortet das Paket nicht oder unbrauchbar: eingebaute Erkennung mit Hinweis', async () => {
    const x = await aufbau();
    await x.d.erkennung.setzeStandard({ paket: 'ki' });
    x.setzeAntwort(async () => { throw new Error('Keine Antwort innerhalb von 60000 ms.'); });
    let r = await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A);
    assert.deepEqual(r.engine, { art: 'eingebaut' });
    assert.match(r.hinweis!, /„Erkennung ki“ hat nicht geantwortet \(Keine Antwort.*eingebaute Erkennung hat übernommen/);
    assert.equal(r.vorschlaege.email.wert, 'jonas.beispiel@musterbau.example');
    x.setzeAntwort(async () => 'Hier sind die Felder: keine Ahnung');
    r = await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A);
    assert.match(r.hinweis!, /kein JSON-Objekt/);
    // Antwort mit Text drumherum und unter „vorschlaege“ geht.
    x.setzeAntwort(async () => 'Ergebnis:\n```json\n{"vorschlaege":{"email":{"wert":"jonas.beispiel@musterbau.example","sicherheit":"hoch"}}}\n```');
    r = await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A);
    assert.deepEqual([r.engine.art, Object.keys(r.vorschlaege)], ['paket', ['email']]);
    // Paket läuft nicht (nicht geladen): eingebaut mit Hinweis.
    x.d.erkennung.anbieter = { pakete: () => [], erkenne: async () => { throw new Error('nie'); } };
    r = await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A);
    assert.match(r.hinweis!, /läuft gerade nicht/);
  });
});

/* ---------- Echter Paket-Läufer: Modul, das auf dms:erkennen mit festem JSON antwortet ---------- */

const u = (n: number): number[] => { const b: number[] = []; do { let x = n & 0x7f; n >>>= 7; if (n) x |= 0x80; b.push(x); } while (n); return b; };
const s = (n: number): number[] => { const b: number[] = []; for (;;) { const x = n & 0x7f; n >>= 7; if ((n === 0 && !(x & 0x40)) || (n === -1 && x & 0x40)) { b.push(x); return b; } b.push(x | 0x80); } };
const vec = (l: number[][]) => [...u(l.length), ...l.flat()];
const str = (t: string) => { const b = [...Buffer.from(t)]; return [...u(b.length), ...b]; };
const sek = (id: number, b: number[]) => [id, ...u(b.length), ...b];
function festesErgebnis(ergebnis: string): Buffer {
  const typen = [[0x60, 2, 0x7f, 0x7f, 1, 0x7f], [0x60, 1, 0x7f, 1, 0x7f]];
  const importe = [[...str('env'), ...str('memory'), 0x02, 0x00, ...u(1)], [...str('dms'), ...str('ergebnis'), 0x00, 0]];
  const koerper = (b: number[]) => { const k = [0x00, ...b, 0x0b]; return [...u(k.length), ...k]; };
  const code = [koerper([0x41, ...s(8192)]), koerper([0x41, 0]), koerper([0x41, ...s(1024), 0x41, ...s(Buffer.byteLength(ergebnis)), 0x10, 0, 0x1a, 0x41, 0])];
  return Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0, 0, 0, ...sek(1, vec(typen)), ...sek(2, vec(importe)), ...sek(3, vec([[1], [0], [0]])),
    ...sek(7, vec([[...str('dms_puffer'), 0x00, 1], [...str('dms_ereignis'), 0x00, 2], [...str('dms_aktion'), 0x00, 3]])),
    ...sek(10, vec(code)), ...sek(11, vec([[0x00, 0x41, ...s(1024), 0x0b, ...str(ergebnis)]]))]);
}

describe('Aus Dokument ausfüllen per Paket (#511): echter Paket-Läufer', () => {
  const laeufer: Paketlaeufer[] = [];
  after(async () => { for (const l of laeufer) await l.stop(); });
  it('ruft dms:erkennen im Läufer auf; ohne Inhalt in der Werkbank', async () => {
    const x = await aufbau();
    const wasm = festesErgebnis(JSON.stringify({ vorname: { wert: 'Jonas', sicherheit: 'hoch' }, funktion: { wert: 'Bauleiter' } }));
    const manifest = 'schema: 1\nid: erkenner\nname: Erkenner\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.125.0"\ninhalt: {}\ncode:\n  sprache: c\n  quelle: code/\n  rechte: { schnittstellen: ["dms:erkennen"] }\n';
    const p = liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['code/modul.wasm', wasm]]));
    await x.d.speicherePaketCode('erkenner', p.code!.dateien);
    await x.d.speicherePaket({ ...paket('erkenner'), name: 'Erkenner', laeufer: { ...p.code!.info, modul: { sha256: 'x', groesse: wasm.length } } });
    const l = new Paketlaeufer({ dienst: x.d, konten: x.konten, schluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()), api: async () => ({ status: 404, kopf: {}, body: Buffer.from('{}') }), einstellungen: async () => ({}), speicher: { lies: async () => ({}), schreibe: async () => {} }, grenzen: { sekunden: 5, speicherMB: 16 }, abrufMs: 100, nachlaufMs: 3_600_000 });
    laeufer.push(l);
    await l.start();
    for (let i = 0; i < 200 && !x.d.erkennung.anbieter!.pakete().some((y) => y.id === 'erkenner'); i++) await new Promise((r) => setTimeout(r, 50));
    await x.d.erkennung.setzeStandard({ paket: 'erkenner' });
    const r = await x.d.erkennung.fuerTyp(x.person.id, { text: KARTE }, x.A);
    assert.deepEqual(r.engine, { art: 'paket', id: 'erkenner', name: 'Erkenner' });
    assert.deepEqual(Object.fromEntries(Object.entries(r.vorschlaege).filter(([k]) => k !== 'organisation').map(([k, v]) => [k, v.wert])), { vorname: 'Jonas', funktion: 'Bauleiter' });
    const stand = (await l.uebersicht()).pakete.find((y) => y.id === 'erkenner')!;
    assert.equal(stand.letzte[0].art, 'Felder erkannt');
    assert.ok(!stand.letzte[0].text.includes('Jonas'), 'kein Inhalt in der Werkbank');
  });
});
