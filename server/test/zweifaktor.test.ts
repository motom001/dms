/** Zwei-Faktor-Anmeldung (#242): TOTP, Einrichten, Wiederverwendung, Wiederherstellungscodes, Pflicht, Anmeldung. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Dienst } from '../src/dienst';
import { speicherDateien } from '../src/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { pflichtZuruecknehmen, pruefeZugang, routen, type Anfrage, type Route } from '../src/routen';
import { ausBase32, base32, totp, Zweifaktor } from '../src/zweifaktor';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
// Ohne Tresor: „verschlüsseln“ als erkennbares Präfix.
const ver = (k: string) => `v:${k}`;
const ent = (w: string) => (w.startsWith('v:') ? w.slice(2) : null);
const codeZu = (geheimnis: string, ms: number) => totp(ausBase32(geheimnis), Math.floor(ms / 30_000));

describe('Zwei-Faktor-Anmeldung (#242)', () => {
  it('erzeugt die Codes aus RFC 6238 (SHA-1)', () => {
    const k = Buffer.from('12345678901234567890');
    assert.equal(totp(k, Math.floor(59 / 30)), '287082');
    assert.equal(totp(k, Math.floor(1111111109 / 30)), '081804');
    assert.equal(totp(k, Math.floor(1234567890 / 30)), '005924');
    assert.equal(totp(k, Math.floor(20000000000 / 30)), '353130');
    assert.equal(base32(k), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.deepEqual(ausBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq'), k);
  });

  it('richtet ein, prüft ±1 Zeitschritt und lässt keinen Code zweimal zu', async () => {
    let t = 1_700_000_000_000;
    const speicher = speicherEinstellungen();
    const z = new Zweifaktor(speicher, ver, ent, () => t);
    const { geheimnis, uri } = z.beginne({ id: 'u1', email: 'a@x.de' }, 'Mein DMS');
    assert.match(uri, /^otpauth:\/\/totp\/Mein%20DMS%3Aa%40x\.de\?secret=[A-Z2-7]+&issuer=Mein%20DMS/);
    await assert.rejects(z.bestaetige('u1', '000000', 'a'), status(422));
    const codes = await z.bestaetige('u1', codeZu(geheimnis, t), 'a');
    assert.equal(codes.length, 10);
    assert.equal(await z.aktiv('u1'), true);
    // Geheimnis verschlüsselt gespeichert, Codes nur als Prüfwert.
    const roh = JSON.stringify(await speicher.lies('zweifaktor_u1'));
    assert.ok(roh.includes('"v:'));
    assert.ok(!roh.includes(codes[0]));
    // Derselbe Code wie bei der Einrichtung gilt nicht noch einmal.
    assert.equal(await z.pruefe('u1', codeZu(geheimnis, t)), null);
    t += 30_000;
    assert.equal(await z.pruefe('u1', codeZu(geheimnis, t - 30_000)), null, 'älterer Schritt nach Benutzung nicht mehr');
    assert.equal(await z.pruefe('u1', codeZu(geheimnis, t + 30_000)), 'totp', 'ein Schritt Vorlauf');
    assert.equal(await z.pruefe('u1', codeZu(geheimnis, t + 30_000)), null, 'nicht zweimal');
    t += 5 * 30_000;
    assert.equal(await z.pruefe('u1', codeZu(geheimnis, t - 30_000)), 'totp', 'ein Schritt Nachlauf');
    assert.equal(await z.pruefe('u1', codeZu(geheimnis, t + 90_000)), null, 'zu weit voraus');
  });

  it('Wiederherstellungscodes gelten je einmal; neue ersetzen alte; Entwurf verfällt', async () => {
    let t = 1_700_000_000_000;
    const z = new Zweifaktor(speicherEinstellungen(), ver, ent, () => t);
    const { geheimnis } = z.beginne({ id: 'u1', email: 'a@x.de' });
    const codes = await z.bestaetige('u1', codeZu(geheimnis, t), 'a');
    assert.equal(await z.pruefe('u1', codes[3].toLowerCase().replace(/-/g, '')), 'wiederherstellung', 'Groß/klein und Striche egal');
    assert.equal(await z.pruefe('u1', codes[3]), null);
    assert.equal((await z.status('u1')).codesUebrig, 9);
    const neu = await z.neueCodes('u1', 'a');
    assert.equal(await z.pruefe('u1', codes[0]), null);
    assert.equal(await z.pruefe('u1', neu[0]), 'wiederherstellung');
    assert.equal(await z.entferne('u1', 'admin'), true);
    assert.equal(await z.aktiv('u1'), false);
    z.beginne({ id: 'u2', email: 'b@x.de' });
    t += 11 * 60_000;
    await assert.rejects(z.bestaetige('u2', '123456', 'b'), status(409));
  });

  it('Pflicht je Rolle', async () => {
    const z = new Zweifaktor(speicherEinstellungen(), ver, ent);
    assert.equal(await z.fehlt({ id: 'a', rolle: 'admin' }), false);
    await z.setzePflicht({ admin: true }, 'test');
    assert.deepEqual(await z.pflicht(), { admin: true, mitglied: false });
    assert.equal(await z.fehlt({ id: 'a', rolle: 'admin' }), true);
    assert.equal(await z.fehlt({ id: 'm', rolle: 'mitglied' }), false);
  });

  it('Pflicht gilt erst für Sitzungen ab dem Einschalten (#416)', async () => {
    let t = 1_700_000_000_000;
    const speicher = speicherEinstellungen();
    const z = new Zweifaktor(speicher, ver, ent, () => t);
    const vorher = new Date(t - 1000), nachher = new Date(t + 1000);
    await z.setzePflicht({ admin: true }, 'test');
    const a = { id: 'a', rolle: 'admin' as const };
    assert.equal(await z.lage(a, vorher), 'ausstehend', 'laufende Sitzung arbeitet weiter');
    assert.equal(await z.lage(a, nachher), 'fehlt', 'neue Sitzung: erst einrichten');
    assert.equal(await z.fehlt(a), true, 'ohne Sitzungsbeginn streng');
    assert.equal(await z.lage({ id: 'm', rolle: 'mitglied' }, vorher), 'ok');
    // Erneutes Speichern ohne Änderung verschiebt den Zeitpunkt nicht.
    t += 60_000;
    await z.setzePflicht({ admin: true, mitglied: false }, 'test');
    assert.equal(await z.lage(a, nachher), 'fehlt');
    // Aus und wieder an: neuer Zeitpunkt.
    await z.setzePflicht({ admin: false }, 'test');
    assert.equal(await z.lage(a, nachher), 'ok');
    await z.setzePflicht({ admin: true }, 'test');
    assert.equal(await z.lage(a, nachher), 'ausstehend');
    // Vor 0.91.1 eingeschaltet (ohne Zeitpunkt): gilt für alle Sitzungen.
    await speicher.schreibe('zweifaktor_pflicht_seit', null);
    assert.equal(await z.lage(a, vorher), 'fehlt');
    // Mit eingerichteter Zwei-Faktor-Anmeldung nie.
    const { geheimnis } = z.beginne({ id: 'a', email: 'a@x.de' });
    await z.bestaetige('a', codeZu(geheimnis, t), 'a');
    assert.equal(await z.lage(a, nachher), 'ok');
  });

  it('Pflicht ohne eigenes Zwei-Faktor einschalten: laufende Sitzung arbeitet weiter, Ausschalten geht immer (#416)', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    const z = new Zweifaktor(speicherEinstellungen(), ver, ent);
    konten.verbindeZweifaktor(z);
    await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
    const warte = () => new Promise((r) => setTimeout(r, 5));
    const anmelden = async () => {
      const r = await konten.anmelden({ email: 'anna@example.org', passwort: 'ein-langes-passwort' }, '1.1.1.1', '');
      assert.ok('schluessel' in r && r.schluessel, 'ohne eigenes Zwei-Faktor reicht das Passwort');
      return r.schluessel;
    };
    const alle = routen(d, konten);
    const route = (m: Route['methode'], p: string) => alle.find((x) => x.methode === m && x.pfad === p)!;
    const typen = route('GET', '/api/typen'), pflichtLesen = route('GET', '/api/werkbank/zweifaktor'), pflichtSetzen = route('PUT', '/api/werkbank/zweifaktor');
    const status = route('GET', '/api/konto/status');
    const koepfe = (n: string) => (n === 'x-dms' ? '1' : undefined);
    const frage = async (r: Route, sitzung: string, body: unknown = {}) => {
      const a: Anfrage = { body, params: {}, query: {}, ip: '1.1.1.1', sitzung };
      await pruefeZugang(r, a, koepfe, konten);
      return a;
    };
    const statusVon = async (sitzung: string) => {
      const a = await frage(status, sitzung);
      return ((await status.handler(a)) as { body: { zweifaktor: { aktiv: boolean; fehlt: boolean; ausstehend: boolean } } }).body.zweifaktor;
    };

    const laufend = await anmelden();
    await warte();
    // Einschalten in der laufenden Sitzung (wie über die Werkbank).
    await pflichtSetzen.handler(await frage(pflichtSetzen, laufend, { admin: true }));
    assert.deepEqual(await z.pflicht(), { admin: true, mitglied: false });
    // Laufende Sitzung: weiterarbeiten, mit Hinweis.
    await frage(typen, laufend);
    assert.deepEqual(await statusVon(laufend), { aktiv: false, fehlt: false, ausstehend: true });
    await frage(pflichtSetzen, laufend, { mitglied: true });

    // Nächste Anmeldung: erst einrichten.
    await warte();
    const neu = await anmelden();
    assert.deepEqual(await statusVon(neu), { aktiv: false, fehlt: true, ausstehend: false });
    await assert.rejects(frage(typen, neu), (e: unknown) => e instanceof Fachfehler && e.status === 403 && /Zwei-Faktor/.test(e.message));
    await frage(route('GET', '/api/konto/zweifaktor'), neu);
    // Die Pflicht selbst: lesen und ausschalten immer, einschalten nicht.
    await frage(pflichtLesen, neu);
    await assert.rejects(frage(pflichtSetzen, neu, { mitglied: true }), (e: unknown) => e instanceof Fachfehler && e.status === 403);
    await assert.rejects(frage(pflichtSetzen, neu, { admin: false, mitglied: true }), (e: unknown) => e instanceof Fachfehler && e.status === 403);
    await pflichtSetzen.handler(await frage(pflichtSetzen, neu, { admin: false }));
    assert.deepEqual(await z.pflicht(), { admin: false, mitglied: false });
    await frage(typen, neu);
    assert.deepEqual(await statusVon(neu), { aktiv: false, fehlt: false, ausstehend: false });
  });

  it('pflichtZuruecknehmen: nur für Administratoren, nur lesen oder ausschalten (#416)', () => {
    const admin = { rolle: 'admin' } as Anfrage['benutzer'], mitglied = { rolle: 'mitglied' } as Anfrage['benutzer'];
    const r = (methode: Route['methode'], pfad = '/api/werkbank/zweifaktor') => ({ methode, pfad });
    assert.equal(pflichtZuruecknehmen(r('GET'), { body: undefined, benutzer: admin }), true);
    assert.equal(pflichtZuruecknehmen(r('PUT'), { body: { admin: false }, benutzer: admin }), true);
    assert.equal(pflichtZuruecknehmen(r('PUT'), { body: { admin: false, mitglied: false }, benutzer: admin }), true);
    assert.equal(pflichtZuruecknehmen(r('PUT'), { body: { admin: true }, benutzer: admin }), false);
    assert.equal(pflichtZuruecknehmen(r('PUT'), { body: { admin: 'false' }, benutzer: admin }), false);
    assert.equal(pflichtZuruecknehmen(r('PUT'), { body: null, benutzer: admin }), false);
    assert.equal(pflichtZuruecknehmen(r('GET'), { body: undefined, benutzer: mitglied }), false);
    assert.equal(pflichtZuruecknehmen(r('GET', '/api/werkbank/anmeldeschutz'), { body: undefined, benutzer: admin }), false);
  });

  it('Anmeldung: Passwort, dann Code; falsche Codes; Passwort-Link verlangt den Code ebenfalls', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
    const z = new Zweifaktor(speicherEinstellungen(), ver, ent);
    konten.verbindeZweifaktor(z);
    const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
    // Ohne Zwei-Faktor: wie bisher.
    const ohne = await konten.anmelden({ email: 'anna@example.org', passwort: 'ein-langes-passwort' }, '1.1.1.1', '');
    assert.ok('schluessel' in ohne && ohne.schluessel);

    const { geheimnis } = z.beginne(anna);
    const codes = await z.bestaetige(anna.id, codeZu(geheimnis, Date.now()), 'anna');
    const r = await konten.anmelden({ email: 'anna@example.org', passwort: 'ein-langes-passwort' }, '1.1.1.1', '');
    assert.ok('zweiterSchritt' in r && r.zweiterSchritt);
    assert.ok(!('schluessel' in r));
    const kennung = r.zweiterSchritt;
    await assert.rejects(konten.anmeldenMitCode({ kennung, code: codes[0] }, '2.2.2.2'), status(401), 'andere IP');
    await assert.rejects(konten.anmeldenMitCode({ kennung, code: '000000' }, '1.1.1.1'), status(401));
    const ok = await konten.anmeldenMitCode({ kennung, code: codes[0] }, '1.1.1.1');
    assert.equal(ok.benutzer.id, anna.id);
    assert.equal(ok.wiederherstellung, true);
    assert.ok(ok.schluessel);
    await assert.rejects(konten.anmeldenMitCode({ kennung, code: codes[1] }, '1.1.1.1'), status(401), 'Kennung verbraucht');

    // Fünf falsche Codes: Kennung verfällt.
    const r2 = await konten.anmelden({ email: 'anna@example.org', passwort: 'ein-langes-passwort' }, '1.1.1.1', '');
    const k2 = (r2 as { zweiterSchritt: string }).zweiterSchritt;
    for (let i = 0; i < 4; i++) await assert.rejects(konten.anmeldenMitCode({ kennung: k2, code: '111111' }, '1.1.1.1'), status(401));
    await assert.rejects(konten.anmeldenMitCode({ kennung: k2, code: '111111' }, '1.1.1.1'));
    await assert.rejects(konten.anmeldenMitCode({ kennung: k2, code: codes[2] }, '1.1.1.1'), status(401));

    // Passwort-Link: neues Passwort, aber keine Sitzung ohne Code.
    const link = await konten.neuerLink(anna.id);
    const schluessel = link.link!.split('/passwort/')[1];
    const p = await konten.passwortSetzen({ schluessel, passwort: 'noch-ein-langes-passwort' }, { ip: '3.3.3.3', geraet: '' });
    assert.ok('zweiterSchritt' in p && p.zweiterSchritt);
    assert.ok(!('schluessel' in p));
    const ok2 = await konten.anmeldenMitCode({ kennung: p.zweiterSchritt, code: codes[3] }, '3.3.3.3');
    assert.equal(ok2.benutzer.id, anna.id);
  });
});
