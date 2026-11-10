/**
 * Fehlende Dokumentdatei (#877): Fehlt eine Datei im Ablageordner (Volume vergessen, von Hand gelöscht, Platte
 * defekt), antwortet Ablago an jeder Lesestelle sauber (404 mit „Die Datei zu diesem Dokument fehlt“, ohne Prüfwert
 * und Pfad), meldet es einmal ins Protokoll und läuft weiter. Früher kam ENOENT als 'error'-Ereignis eines Stroms
 * ohne Empfänger und beendete den ganzen Prozess – dieser Test liefe dann gar nicht zu Ende.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { setTimeout as warte } from 'node:timers/promises';
import { beiFehlenderDatei, DateiFehlt, oeffneStrom, ordnerSpeicher, vergissFehlendeDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { pdfMitText } from './hilfen';
import { mitSprache } from '../src/sprache';

const echtesFastify = await import('fastify').then((m) => typeof m.default === 'function', () => false);
const HAUSHALT = '00000000-0000-4000-8000-000000000877';
const PW = 'ein-langes-passwort';
const PDF = (s: string) => pdfMitText([s]);
const MELDUNG = 'Die Datei zu diesem Dokument fehlt.';
const tmp = mkdtempSync(join(tmpdir(), 'dms-877-'));
after(() => { beiFehlenderDatei(null); rmSync(tmp, { recursive: true, force: true }); });

/** Keine Antwort verrät Prüfwert, Pfad oder Ablage. */
const ohneInnenleben = (text: string, sha: string) => {
  assert.ok(!text.includes(sha), `Prüfwert in der Antwort: ${text}`);
  assert.ok(!text.includes(sha.slice(0, 12)), `Teil des Prüfwerts in der Antwort: ${text}`);
  assert.ok(!text.includes(tmp) && !text.includes(HAUSHALT) && !text.includes('/files'), `Pfad in der Antwort: ${text}`);
};

describe('Dateispeicher: fehlende Datei (#877)', () => {
  it('lies: Ablehnung mit DateiFehlt (404) statt eines späteren error-Ereignisses; einmal gemeldet', async () => {
    const wurzel = join(tmp, 'speicher');
    const s = ordnerSpeicher(wurzel, HAUSHALT);
    const sha = 'ab'.repeat(32);
    const gemeldet: Array<{ sha256: string; pfad: string }> = [];
    beiFehlenderDatei((f) => gemeldet.push(f));
    vergissFehlendeDateien();
    try {
      const e = await s.lies(sha).then(() => null, (x: unknown) => x);
      assert.ok(e instanceof DateiFehlt && e instanceof Fachfehler, String(e));
      assert.equal(e.status, 404);
      assert.equal(e.message, MELDUNG);
      ohneInnenleben(e.message, sha);
      await assert.rejects(s.lies(sha), DateiFehlt);
      // Etwas Zeit: Ein Strom, der erst später scheitert, hätte den Prozess hier beendet.
      await warte(30);
      assert.equal(gemeldet.length, 1, 'je Datei einmal');
      assert.equal(gemeldet[0].sha256, sha);
      assert.ok(gemeldet[0].pfad.startsWith(join(wurzel, HAUSHALT, 'ab')), 'Pfad nur für das Protokoll');
      assert.equal(await s.vorhanden!(sha), false);
      await s.schreibe(sha, Buffer.from('x'));
      assert.equal(await s.vorhanden!(sha), true);
      const strom = await s.lies(sha);
      assert.ok(!Buffer.isBuffer(strom));
      assert.equal(Buffer.concat(await strom.toArray()).toString(), 'x');
    } finally { beiFehlenderDatei(null); }
  });

  it('oeffneStrom: fehlende Datei lehnt ab (ENOENT), ohne Absturz', async () => {
    await assert.rejects(oeffneStrom(join(tmp, 'gibt-es-nicht')), (e: NodeJS.ErrnoException) => e.code === 'ENOENT');
    await warte(30);
  });
});

describe('Fehlende Datei an allen Lesestellen (#877)', { skip: echtesFastify ? false : 'Fastify nicht installiert' }, () => {
  const wurzel = join(tmp, 'ablage');
  const speicher = ordnerSpeicher(wurzel, HAUSHALT);
  const pfad = (sha: string) => join(wurzel, HAUSHALT, sha.slice(0, 2), sha);
  let app: { inject(o: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }): Promise<{ statusCode: number; body: string; json(): any }>; close(): Promise<unknown> }; // eslint-disable-line @typescript-eslint/no-explicit-any -- json() liefert je Anfrage etwas anderes
  let d: Dienst;
  let cookie = '';
  let basic = '';
  let weg: { id: string; sha256: string; mappeId: string };
  let da: { id: string; sha256: string };
  const rufe = (method: string, url: string, payload?: unknown, kopf: Record<string, string> = {}) =>
    app.inject({ method, url, ...(payload === undefined ? {} : { payload }), headers: { 'x-dms': '1', cookie, ...kopf } });
  const fehlt = (r: { statusCode: number; body: string }, was: string) => {
    assert.equal(r.statusCode, 404, `${was}: ${r.statusCode} ${r.body}`);
    ohneInnenleben(r.body, weg.sha256);
  };

  before(async () => {
    const { baueApp } = await import('../src/http');
    const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
    const { Webdav } = await import('../src/webdav');
    d = new Dienst(speicherRepo(), speicher, { einstellungen: speicherEinstellungen() });
    beiFehlenderDatei((f) => { void d.merkeFehlendeDatei(f); });
    vergissFehlendeDateien();
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    d.verbindeKonten(konten.papierkorbHaken());
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
    await d.gleicheBenutzerAb(await konten.listeBenutzer());
    const typ = await d.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [
      { key: 'daten', name: 'Daten', art: 'felder' }, { key: 'belege', name: 'Belege', art: 'dokumente', versionierung: true },
    ] } as never);
    await d.legeSichtAn({ name: 'Verträge', typen: [typ.id] });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: 'V-1' } }, lena.id);
    weg = (await d.ladeHoch(m.id, { register: 'belege', name: 'Rechnung.pdf', typ: 'application/pdf' }, PDF('Rechnung von Jonas'), lena.id)).dokument;
    da = (await d.ladeHoch(m.id, { register: 'belege', name: 'Vertrag.pdf', typ: 'application/pdf' }, PDF('Vertrag mit Petra'), lena.id)).dokument;
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const k = (await schluessel.lege(lena, { name: 'Laufwerk', recht: 'lesen' })).schluessel;
    basic = `Basic ${Buffer.from(`lena@example.org:${k}`).toString('base64')}`;
    const wd = new Webdav({ dienst: d, konten, schluessel, einstellungen: speicherEinstellungen(), adresse: () => 'https://dms.example.org' });
    await wd.speichere({ aktiv: true }, 'lena@example.org');
    app = await baueApp(d, konten, { apiSchluessel: schluessel, webdav: wd }) as unknown as typeof app;
    const r = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email: 'lena@example.org', passwort: PW }, headers: { 'x-dms': '1' } });
    assert.equal(r.statusCode, 200, r.body);
    cookie = ([] as string[]).concat((r as unknown as { headers: Record<string, string | string[]> }).headers['set-cookie'])[0].split(';')[0];
    // Werkbank nur im Verwaltungsmodus (#819).
    assert.equal((await rufe('POST', '/api/konto/verwaltung', {})).statusCode, 200);
    // Datei weg wie ohne Volume – die Datenbank weiß noch von ihr.
    await rename(pfad(weg.sha256), join(tmp, 'beiseite'));
  });
  after(async () => { await app?.close(); });

  it('Inhalt: 404 mit verständlicher Meldung ohne Prüfwert und Pfad; der Server antwortet danach weiter', async () => {
    const marke = Math.max(0, ...protokoll.eintraege({}).map((e) => e.nr));
    const r = await rufe('GET', `/api/dokumente/${weg.id}/inhalt`);
    fehlt(r, 'Inhalt');
    assert.equal(r.json().fehler, MELDUNG);
    // Zweimal: wieder sauber, aber nur ein Eintrag im Protokoll – mit Prüfwert, Pfad und Mappe.
    fehlt(await rufe('GET', `/api/dokumente/${weg.id}/inhalt`), 'Inhalt nochmal');
    await warte(30);
    const neu = protokoll.eintraege({ seit: marke }).filter((e) => e.text === 'Datei eines Dokuments fehlt im Ablageordner');
    assert.equal(neu.length, 1, JSON.stringify(neu));
    assert.equal(neu[0].daten?.sha256, weg.sha256);
    assert.equal(neu[0].daten?.mappen, weg.mappeId);
    assert.ok(String(neu[0].daten?.pfad).startsWith(wurzel));
    // Der Prozess lebt: Das andere Dokument kommt ganz normal.
    const ok = await rufe('GET', `/api/dokumente/${da.id}/inhalt`);
    assert.equal(ok.statusCode, 200, ok.body);
    assert.match(ok.body, /^%PDF-/);
  });

  it('Englisch: dieselbe Meldung übersetzt, ebenfalls ohne Innenleben', () => {
    const e = mitSprache('en', () => new DateiFehlt(weg.sha256));
    assert.equal(e.message, 'The file for this document is missing.');
    ohneInnenleben(e.message, weg.sha256);
    assert.equal(mitSprache('en', () => new DateiFehlt(weg.sha256, 'Rechnung.pdf')).message, 'The file for the document “Rechnung.pdf” is missing.');
  });

  it('Version, Herunterladen mit Stempel, Seitenbild, Vorschau: kein Absturz, saubere Antwort', async () => {
    fehlt(await rufe('GET', `/api/dokumente/${weg.id}/versionen/1/inhalt`), 'Version');
    fehlt(await rufe('POST', `/api/dokumente/${weg.id}/herunterladen`, { stempel: { vorlage: 'kopie', empfaenger: 'Herr Özdemir' } }), 'Stempel');
    fehlt(await rufe('POST', `/api/dokumente/${weg.id}/herunterladen`, {}), 'Herunterladen');
    const seite = await rufe('GET', `/api/dokumente/${weg.id}/seiten/1/bild`);
    assert.ok(seite.statusCode === 404 || seite.statusCode === 422, `Seitenbild: ${seite.statusCode} ${seite.body}`);
    ohneInnenleben(seite.body, weg.sha256);
    const vorschau = await rufe('GET', `/api/dokumente/${weg.id}/vorschau`);
    assert.equal(vorschau.statusCode, 404);
    ohneInnenleben(vorschau.body, weg.sha256);
  });

  it('Export als ZIP: 404 vor dem Strom, mit dem Namen des Dokuments', async () => {
    const r = await rufe('POST', '/api/export', { format: 'zip', ids: [weg.mappeId] });
    fehlt(r, 'Export');
    assert.equal(r.json().fehler, 'Die Datei zum Dokument „Rechnung.pdf“ fehlt.');
  });

  it('WebDAV-GET: 404 mit Meldung, Ordner lassen sich weiter auflisten', async () => {
    const mappe = `/webdav/Ablage/${encodeURIComponent('Verträge')}/V-1`;
    const liste = await app.inject({ method: 'PROPFIND', url: `${mappe}/Belege/`, headers: { authorization: basic, depth: '1' } });
    assert.equal(liste.statusCode, 207, liste.body);
    const r = await app.inject({ method: 'GET', url: `${mappe}/Belege/Rechnung.pdf`, headers: { authorization: basic } });
    fehlt(r, 'WebDAV');
    assert.match(r.body, /Die Datei zu diesem Dokument fehlt/);
    const ok = await app.inject({ method: 'GET', url: `${mappe}/Belege/Vertrag.pdf`, headers: { authorization: basic } });
    assert.equal(ok.statusCode, 200);
  });

  it('Werkbank: Zahl der fehlenden Dateien in der Übersicht, „Dokumente ohne Datei“ für den Lasttest; wieder da → 0', async () => {
    await warte(30);
    assert.equal(await d.fehlendeDateien(), 1);
    const u = await rufe('GET', '/api/werkbank/uebersicht');
    assert.equal(u.statusCode, 200, u.body);
    assert.equal(u.json().dateienFehlen, 1);
    const f = await rufe('GET', '/api/werkbank/wartung/dateien/fehlend');
    assert.equal(f.statusCode, 200, f.body);
    assert.deepEqual(f.json(), { dateien: 2, fehlend: 1, dokumente: 1 });
    ohneInnenleben(f.body, weg.sha256);
    // Volume wieder eingebunden: Die Meldung verschwindet von selbst.
    await rename(join(tmp, 'beiseite'), pfad(weg.sha256));
    assert.equal(await d.fehlendeDateien(), 0);
    assert.equal((await rufe('GET', `/api/dokumente/${weg.id}/inhalt`)).statusCode, 200);
  });
});
