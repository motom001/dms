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
