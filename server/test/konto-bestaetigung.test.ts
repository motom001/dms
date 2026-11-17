/**
 * Erneute Bestätigung am eigenen Konto (#1352, #1356): API-Schlüssel, Passkey hinzufügen, Zwei-Faktor einrichten und
 * Export mit Passwörtern nur mit frischer Anmeldung; Mail an die Person bei neuen Zugängen. Über HTTP wie im Betrieb.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { ausBase32, totp, Zweifaktor } from '../src/anmeldung/zweifaktor';
import { brauchtBestaetigung, type ApiSchluessel } from '../src/anmeldung/apischluessel';

const PW = 'ein-langes-passwort';
const MIN = 60_000;

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const mails: Array<{ an: string; betreff: string; text: string }> = [];
  const konten = new Konten(
    speicherKontoRepo(),
    { sende: async (an, betreff, text) => void mails.push({ an, betreff, text }) },
    'http://nas',
    d.systemtypen.benutzerspiegel(),
  );
  d.verbindeKonten(konten.papierkorbHaken());
  const zf = new Zweifaktor(
    speicherEinstellungen(),
    (k) => `v:${k}`,
    (w) => (w.startsWith('v:') ? w.slice(2) : null),
  );
  konten.verbindeZweifaktor(zf);
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  await konten.legeBenutzerAn({ email: 'markus@example.org', name: 'Markus' }, lena.id);
  await konten.setzePasswortDirekt('markus@example.org', PW);
  mails.length = 0;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await d.auskunftZustellen.setzePersoenlicherExport(true, 'test');
  const { baueApp } = await import('../src/http/http');
  const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/anmeldung/apischluessel');
  const app = await baueApp(d, konten, { apiSchluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()) });
  const a = await app.inject({
    method: 'POST',
    url: '/api/konto/anmelden',
    payload: { email: 'markus@example.org', passwort: PW },
    headers: { 'x-dms': '1' },
  });
  assert.equal(a.statusCode, 200, a.body);
  const cookie = ([] as string[]).concat(a.headers['set-cookie'] as string | string[])[0].split(';')[0];
  const rufe = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, ...(payload ? { payload } : {}), headers: { 'x-dms': '1', cookie } });
  const jetzt = { t: Date.now() };
  konten.uhr = () => jetzt.t;
  /** Anmeldung liegt mehr als 10 Minuten zurück. */
  const spaeter = () => (jetzt.t += 11 * MIN);
  const bestaetigen = async () => assert.equal((await rufe('POST', '/api/konto/verwaltung/bestaetigen', { passwort: PW })).statusCode, 200);
  const frischFehlt = (r: { statusCode: number; json(): { details?: { frisch?: boolean; handlung?: string } } }, handlung: string) => {
    assert.equal(r.statusCode, 403);
    assert.deepEqual(r.json().details, { frisch: true, handlung });
  };
  return { app, rufe, mails, spaeter, bestaetigen, frischFehlt };
}

describe('Erneute Bestätigung am eigenen Konto (#1352, #1356)', () => {
  const offen: Array<() => Promise<unknown>> = [];
  after(async () => {
    for (const f of offen) await f();
  });

  it('brauchtBestaetigung: neu außer „nur Zähler“, bestehend nur bei mehr Rechten', () => {
    const s = (x: Partial<ApiSchluessel>) => ({ recht: 'lesen', passwoerter: false, ablauf: null, ...x }) as ApiSchluessel;
    assert.equal(brauchtBestaetigung(null, s({ recht: 'zaehler' })), false);
    assert.equal(brauchtBestaetigung(null, s({ recht: 'lesen' })), true);
    assert.equal(brauchtBestaetigung(null, s({ recht: 'schreiben' })), true);
    const bis = '2099-01-01T00:00:00.000Z';
    const alt = s({ recht: 'lesen', ablauf: bis });
    assert.equal(brauchtBestaetigung(alt, s({ recht: 'lesen', ablauf: bis })), false, 'nur umbenannt');
    assert.equal(brauchtBestaetigung(alt, s({ recht: 'zaehler', ablauf: bis })), false, 'weniger Rechte');
    assert.equal(brauchtBestaetigung(alt, s({ recht: 'lesen', ablauf: '2098-01-01T00:00:00.000Z' })), false, 'früherer Ablauf');
    assert.equal(brauchtBestaetigung(alt, s({ recht: 'schreiben', ablauf: bis })), true, 'Recht erhöht');
    assert.equal(brauchtBestaetigung(alt, s({ recht: 'lesen', ablauf: bis, passwoerter: true })), true, 'Passwörter');
    assert.equal(brauchtBestaetigung(alt, s({ recht: 'lesen', ablauf: null })), true, 'Ablauf entfernt');
    assert.equal(brauchtBestaetigung(alt, s({ recht: 'lesen', ablauf: '2100-01-01T00:00:00.000Z' })), true, 'Ablauf später');
    assert.equal(brauchtBestaetigung(s({ recht: 'zaehler' }), s({ recht: 'lesen' })), true, 'von „nur Zähler“ auf lesen');
  });

  it('API-Schlüssel: „lesen“ nur frisch und mit Mail, „nur Zähler“ ohne; Erweitern nur frisch', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    x.spaeter();
    const zaehler = await x.rufe('POST', '/api/konto/api-schluessel', { name: 'Anzeige', recht: 'zaehler' });
    assert.equal(zaehler.statusCode, 201, 'nur Zähler: ohne Bestätigung');
    assert.equal(x.mails.length, 0, 'keine Mail für „nur Zähler“');
    x.frischFehlt(await x.rufe('POST', '/api/konto/api-schluessel', { name: 'Skript', recht: 'lesen' }), 'api-schluessel');
    await x.bestaetigen();
    const lesen = await x.rufe('POST', '/api/konto/api-schluessel', { name: 'Skript', recht: 'lesen', ablauf: '2099-01-01' });
    assert.equal(lesen.statusCode, 201, lesen.body);
    assert.equal(x.mails.length, 1);
    assert.equal(x.mails[0].an, 'markus@example.org');
    assert.match(x.mails[0].betreff, /Neuer Zugang/);
    assert.match(x.mails[0].text, /„Skript“ \(nur lesen\)/);
    const id = lesen.json().id as string;
    x.spaeter();
    const ablauf = lesen.json().ablauf as string;
    assert.equal((await x.rufe('PUT', `/api/konto/api-schluessel/${id}`, { name: 'Neu', recht: 'lesen', ablauf })).statusCode, 200);
    x.frischFehlt(await x.rufe('PUT', `/api/konto/api-schluessel/${id}`, { name: 'Neu', recht: 'schreiben', ablauf }), 'api-schluessel');
    x.frischFehlt(
      await x.rufe('PUT', `/api/konto/api-schluessel/${id}`, { name: 'Neu', recht: 'lesen', ablauf, passwoerter: true }),
      'api-schluessel',
    );
    x.frischFehlt(await x.rufe('PUT', `/api/konto/api-schluessel/${id}`, { name: 'Neu', recht: 'lesen', ablauf: null }), 'api-schluessel');
    // Mit „nur Zähler“ zeigt sich, dass nichts gespeichert wurde: Der Schlüssel heißt „Neu“ und darf weiter nur lesen.
    const liste = (await x.rufe('GET', '/api/konto/api-schluessel')).json() as ApiSchluessel[];
    assert.deepEqual(
      liste.map((s) => [s.name, s.recht, s.passwoerter, !!s.ablauf]),
      [
        ['Anzeige', 'zaehler', false, false],
        ['Neu', 'lesen', false, true],
      ],
    );
    await x.bestaetigen();
    assert.equal((await x.rufe('PUT', `/api/konto/api-schluessel/${id}`, { name: 'Neu', recht: 'schreiben', ablauf })).statusCode, 200);
    assert.equal(x.mails.length, 1, 'Erweitern schickt keine weitere Mail');
  });

  it('Zwei-Faktor einrichten (auch ersetzen) und Passkey hinzufügen nur frisch; neue App meldet eine Mail', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    x.spaeter();
    x.frischFehlt(await x.rufe('POST', '/api/konto/zweifaktor/beginnen'), 'zweifaktor-einrichten');
    x.frischFehlt(await x.rufe('POST', '/api/konto/passkeys/beginnen'), 'passkey-hinzufuegen');
    x.frischFehlt(await x.rufe('POST', '/api/konto/passkeys', { antwort: {}, name: 'Handy' }), 'passkey-hinzufuegen');
    await x.bestaetigen();
    const e = await x.rufe('POST', '/api/konto/zweifaktor/beginnen');
    assert.equal(e.statusCode, 200, e.body);
    const geheimnis = ausBase32((e.json().geheimnis as string).replace(/\s/g, ''));
    const code = totp(geheimnis, Math.floor(Date.now() / 30_000));
    const ok = await x.rufe('POST', '/api/konto/zweifaktor/bestaetigen', { code });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal(x.mails.length, 1);
    assert.match(x.mails[0].text, /Zwei-Faktor-Anmeldung/);
    // Eingerichtet hebt die frische Anmeldung auf (#819): Ersetzen verlangt sie erneut.
    x.frischFehlt(await x.rufe('POST', '/api/konto/zweifaktor/beginnen'), 'zweifaktor-einrichten');
  });

  it('Meine Daten exportieren: mit Passwörtern nur frisch, ohne Passwörter wie bisher', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    x.spaeter();
    x.frischFehlt(await x.rufe('POST', '/api/konto/export', { passwoerter: true, passwoerterBestaetigt: true }), 'export-passwoerter');
    const ohne = await x.rufe('POST', '/api/konto/export', { passwoerter: false });
    assert.notEqual(ohne.json().details?.frisch, true, ohne.body);
  });
});
