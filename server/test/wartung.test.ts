/** Wartungsmodus (#102): Stufen, Sitzungen, Anmeldung, API und Protokoll. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Wartung, WartungFehler } from '../src/wartung';

async function aufbau() {
  let jetzt = new Date('2026-10-29T10:00:00Z');
  const uhr = { stelle: (iso: string) => { jetzt = new Date(iso); } };
  const konten = new Konten(speicherKontoRepo(), null, 'http://dms');
  const admin = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const { benutzer: mitglied } = await konten.legeBenutzerAn({ email: 'mitglied@example.org', name: 'Mitglied', rolle: 'mitglied' });
  await konten.legeBenutzerAn({ email: 'admin2@example.org', name: 'Admin 2', rolle: 'admin' });
  // Mitglied hat ein Passwort und zwei Geräte.
  const repo = (konten as unknown as { repo: ReturnType<typeof speicherKontoRepo> }).repo;
  const { hashePasswort } = await import('../src/passwort');
  await repo.setzeHash(mitglied.id, await hashePasswort('noch-ein-langes-passwort'));
  const m1 = await konten.anmelden({ email: 'mitglied@example.org', passwort: 'noch-ein-langes-passwort' }, '1.1.1.1', 'Handy');
  await konten.anmelden({ email: 'mitglied@example.org', passwort: 'noch-ein-langes-passwort' }, '1.1.1.2', 'Laptop');
  const einstellungen = speicherEinstellungen();
  const wartung = new Wartung(einstellungen, konten, () => jetzt);
  await wartung.laden();
  const d = new Dienst(speicherRepo(), speicherDateien());
  const alle = routen(d, konten, { wartung });
  const route = (methode: string, pfad: string) => alle.find((r) => r.methode === methode && r.pfad === pfad)!;
  const adminSitzung = (await konten.anmeldungZu(admin.schluessel))!.sitzung;
  return { konten, admin, adminSitzung, mitglied, m1, wartung, einstellungen, uhr, route };
}
const anfrage = (x: Partial<Anfrage>): Anfrage => ({ body: {}, params: {}, query: {}, ip: '127.0.0.1', ...x });

describe('Wartungsmodus (#102)', () => {
  it('kündigt an, wird nach der Vorlaufzeit aktiv und beendet dann alle anderen Sitzungen', async () => {
    const { konten, admin, adminSitzung, m1, wartung, uhr } = await aufbau();
    assert.equal((await konten.alleSitzungen()).length, 3);
    const vorher = protokoll.letzteNr;
    await wartung.einschalten({ text: 'Wiederherstellung', ende: '2026-10-29T12:00:00Z' }, admin.benutzer, adminSitzung.id);
    assert.equal(wartung.stand.stufe, 'angekuendigt');
    assert.deepEqual(wartung.oeffentlich(), { stufe: 'angekuendigt', text: 'Wiederherstellung', ende: '2026-10-29T12:00:00.000Z', aktivAb: '2026-10-29T10:30:00.000Z', sekunden: 1800, ausloeser: null });
    assert.ok(await konten.anmeldungZu(m1.schluessel), 'angekündigt: Arbeiten und Speichern gehen weiter');
    wartung.pruefeAnfrage({ pfad: '/api/v1/mappen', zugang: 'angemeldet' }, { rolle: 'mitglied' });

    uhr.stelle('2026-10-29T10:29:00Z');
    await wartung.pruefe();
    assert.equal(wartung.oeffentlich().sekunden, 60);
    uhr.stelle('2026-10-29T10:30:00Z');
    await wartung.pruefe();
    assert.equal(wartung.stand.stufe, 'aktiv');
    assert.equal(await konten.anmeldungZu(m1.schluessel), undefined, 'Sitzungen der anderen sind beendet');
    assert.ok(await konten.anmeldungZu(admin.schluessel), 'die eigene bleibt');
    assert.deepEqual((await konten.alleSitzungen()).map((s) => s.email), ['admin@example.org']);
    const texte = protokoll.eintraege({ seit: vorher }).map((e) => e.text);
    assert.ok(texte.includes('Wartungsmodus angekündigt') && texte.some((t) => /aktiv: alle anderen Sitzungen beendet/.test(t)), texte.join(' | '));
  });

  it('weist in der aktiven Stufe API (503 mit Retry-After) und Nicht-Admins ab, Admins nicht', async () => {
    const { admin, adminSitzung, wartung } = await aufbau();
    await wartung.einschalten({ vorlauf: 0, ende: '2026-10-29T11:00:00Z' }, admin.benutzer, adminSitzung.id);
    assert.equal(wartung.stand.stufe, 'aktiv');
    assert.throws(() => wartung.pruefeAnfrage({ pfad: '/api/v1/mappen', zugang: 'angemeldet' }, { rolle: 'admin' }),
      (e: unknown) => e instanceof WartungFehler && e.status === 503 && e.retryAfter === 3600);
    assert.throws(() => wartung.pruefeAnfrage({ pfad: '/api/mappen', zugang: 'angemeldet' }, { rolle: 'mitglied' }), WartungFehler);
    wartung.pruefeAnfrage({ pfad: '/api/mappen', zugang: 'angemeldet' }, { rolle: 'admin' });
    wartung.pruefeAnfrage({ pfad: '/api/konto/status', zugang: 'offen' }, undefined);
    await wartung.ausschalten('admin@example.org');
    wartung.pruefeAnfrage({ pfad: '/api/v1/mappen', zugang: 'angemeldet' }, { rolle: 'mitglied' });
  });

  it('lässt ab der Ankündigung nur Administratoren anmelden', async () => {
    const { admin, adminSitzung, wartung, route, konten } = await aufbau();
    await wartung.einschalten({}, admin.benutzer, adminSitzung.id);
    const anmelden = route('POST', '/api/konto/anmelden');
    await assert.rejects(anmelden.handler(anfrage({ body: { email: 'mitglied@example.org', passwort: 'noch-ein-langes-passwort' } })),
      (e: unknown) => e instanceof WartungFehler && /gewartet/.test(e.message));
    assert.equal((await konten.alleSitzungen()).filter((s) => s.email === 'mitglied@example.org').length, 2, 'keine neue Sitzung übrig');
    const ok = await anmelden.handler(anfrage({ body: { email: 'admin@example.org', passwort: 'ein-langes-passwort' } }));
    assert.ok(ok.sitzungSetzen);
    const status = await route('GET', '/api/wartung').handler(anfrage({}));
    assert.equal((status.body as { stufe: string }).stufe, 'angekuendigt');
  });

  it('„Alle jetzt abmelden“ wirkt sofort; der Stand überdauert einen Neustart', async () => {
    const { admin, adminSitzung, wartung, einstellungen, konten, route } = await aufbau();
    await wartung.einschalten({ vorlauf: 30 }, admin.benutzer, adminSitzung.id);
    const r = await route('POST', '/api/werkbank/wartung/jetzt').handler(anfrage({ benutzer: admin.benutzer, sitzungsDaten: adminSitzung }));
    assert.equal((r.body as { stufe: string }).stufe, 'aktiv');
    assert.deepEqual((await konten.alleSitzungen()).map((s) => s.email), ['admin@example.org']);
    const neu = new Wartung(einstellungen, konten);
    await neu.laden();
    assert.equal(neu.stand.stufe, 'aktiv');
    const liste = await route('GET', '/api/werkbank/wartung').handler(anfrage({ benutzer: admin.benutzer, sitzungsDaten: adminSitzung }));
    assert.deepEqual((liste.body as { sitzungen: Array<{ aktuell: boolean }> }).sitzungen.map((s) => s.aktuell), [true]);
    let angestossen = false;
    neu.beimAusschalten(() => { angestossen = true; });
    await neu.ausschalten('admin@example.org');
    assert.ok(angestossen);
    assert.equal(await einstellungen.lies('wartung'), null);
  });

  it('Zeitschiene (#402): Beginn als Zeitpunkt statt Vorlaufzeit, geprüft gegen jetzt und Ende', async () => {
    const { admin, adminSitzung, wartung, uhr } = await aufbau();
    await assert.rejects(wartung.einschalten({ beginn: '2026-10-29T09:59:00Z' }, admin.benutzer, null), /Vergangenheit.*Jetzt sofort sperren/);
    await assert.rejects(wartung.einschalten({ beginn: '2026-10-30T10:01:00Z' }, admin.benutzer, null), /24 Stunden/);
    await assert.rejects(wartung.einschalten({ beginn: '2026-10-29T10:45:00Z', ende: '2026-10-29T10:45:00Z' }, admin.benutzer, null), /Ende muss nach dem Beginn/);
    await assert.rejects(wartung.einschalten({ beginn: 'bald' }, admin.benutzer, null), /kein gültiger Zeitpunkt/);
    assert.equal(wartung.stand.stufe, 'aus');
    await wartung.einschalten({ beginn: '2026-10-29T10:45:00Z', ende: '2026-10-29T11:45:00Z', vorlauf: 5 }, admin.benutzer, adminSitzung.id);
    assert.equal(wartung.stand.aktivAb, '2026-10-29T10:45:00.000Z', 'beginn gewinnt vor vorlauf');
    assert.equal(wartung.oeffentlich().sekunden, 45 * 60);
    uhr.stelle('2026-10-29T10:45:00Z');
    await wartung.pruefe();
    assert.equal(wartung.stand.stufe, 'aktiv');
    assert.ok(!wartung.stand.sofort);
  });

  it('„Jetzt sofort sperren“ (#402) wirkt wie Vorlaufzeit 0 und steht als „sofort gesperrt“ im Protokoll', async () => {
    const { admin, adminSitzung, wartung, konten, route } = await aufbau();
    const vorher = protokoll.letzteNr;
    const r = await route('POST', '/api/werkbank/wartung/ein').handler(anfrage({ benutzer: admin.benutzer, sitzungsDaten: adminSitzung, body: { text: 'Sicherheitsvorfall', ende: null, sofort: true, beginn: '2026-10-29T10:30:00Z' } }));
    assert.equal((r.body as { stufe: string }).stufe, 'aktiv');
    assert.equal(wartung.stand.sofort, true);
    assert.equal(wartung.stand.text, 'Sicherheitsvorfall');
    assert.deepEqual((await konten.alleSitzungen()).map((s) => s.email), ['admin@example.org']);
    const texte = protokoll.eintraege({ seit: vorher }).map((e) => e.text);
    assert.ok(texte.includes('Wartungsmodus sofort gesperrt'), texte.join(' | '));
    assert.ok(protokoll.eintraege({ seit: vorher }).some((e) => /aktiv/.test(e.text) && JSON.stringify(e).includes('sofort gesperrt')));
    await wartung.ausschalten('admin@example.org');
    await wartung.einschalten({ vorlauf: 0 }, admin.benutzer, adminSitzung.id);
    assert.ok(!wartung.stand.sofort, 'Vorlaufzeit 0 über die API bleibt „eingeschaltet“');
  });

  it('prüft Eingaben', async () => {
    const { admin, wartung } = await aufbau();
    await assert.rejects(wartung.einschalten({ vorlauf: -1 }, admin.benutzer, null), (e: unknown) => e instanceof Fachfehler && e.status === 422);
    await assert.rejects(wartung.einschalten({ ende: 'morgen' }, admin.benutzer, null), /Zeitpunkt/);
  });
});
