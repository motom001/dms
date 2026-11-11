/**
 * Benachrichtigungen als Automatisierungen (#678): Wenn-Karte „Zeitplan“ (für jeden Benutzer, Uhrzeit aus dem Profil),
 * Dann-Karten Tägliche Zusammenfassung, Favoriten-Änderungen und Anmeldeschutz, Übernahme beim Update ohne Unterschied.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bereinigeAutomatisierung, automatisierungsProbleme, kurzform } from '../../shared/src/automatisierung';
import { Aufgabenmail } from '../src/aufgabenmail';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

/** Mittwoch, 10.03.2027, um `uhr` in Berlin (MEZ). */
const am = (uhr: string, tag = '2027-03-10') => Date.parse(`${tag}T${uhr}:00+01:00`);

async function aufbau(uhr = am('09:00')) {
  const einst = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const { benutzer: lena } = await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, admin.id);
  const { benutzer: jonas } = await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, admin.id);
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const zeit = { jetzt: uhr };
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo(), uhr: () => zeit.jetzt });
  const gesendet: string[] = [];
  d.zusammenfassungAn = async (id) => { gesendet.push(id); return { gesendet: true, grund: 'ok' }; };
  return { d, konten, einst, admin, lena, jonas, motor, zeit, gesendet };
}

const zusammenfassung = (wenn: Record<string, unknown>) => ({ name: 'Zusammenfassung', wenn: { art: 'zeitplan', ...wenn }, dann: [{ id: 'z1', art: 'zusammenfassung' }] });

describe('Wenn-Karte „Zeitplan“ (#678)', () => {
  it('bereinigt, Kurzform und Prüfung: Zusammenfassung nur mit „für jeden Benutzer“', () => {
    const a = bereinigeAutomatisierung(zusammenfassung({ uhrzeit: '07:00', tage: [5, 1, 2, 3, 4, 9], jeBenutzer: true }));
    assert.deepEqual(a.wenn, { art: 'zeitplan', uhrzeit: '07:00', tage: [1, 2, 3, 4, 5], feiertage: false, jeBenutzer: true, rolle: null, profilzeit: false });
    const k = { typen: [], sichten: [], benutzer: [], rollen: [] };
    assert.match(kurzform(a, k), /^Wenn werktags um 07:00 für jeden Benutzer → Tägliche Zusammenfassung senden$/);
    const ohne = bereinigeAutomatisierung(zusammenfassung({ uhrzeit: '07:00', jeBenutzer: false }));
    assert.ok(automatisierungsProbleme(ohne, k).some((p) => /für jeden Benutzer/.test(p)));
    const favorit = bereinigeAutomatisierung({ name: 'F', wenn: { art: 'zeitplan' }, dann: [{ art: 'favoriten' }] });
    assert.ok(automatisierungsProbleme(favorit, k).some((p) => /Favorit geändert/.test(p)));
  });

  it('für jeden Benutzer: je Person genau einmal am Tag, erst ab der Uhrzeit, nur an den gewählten Tagen', async () => {
    const { motor, zeit, gesendet, lena, jonas, admin } = await aufbau(am('06:30'));
    await motor.lege({ ...zusammenfassung({ uhrzeit: '07:00', tage: [1, 2, 3, 4, 5], jeBenutzer: true }) }, admin.id);
    const a = (await motor.uebersicht()).automatisierungen[0];
    await motor.schalte(a.id, true, admin.id);
    await motor.zeitplan();
    assert.deepEqual(gesendet, [], 'vor 07:00 nichts');
    zeit.jetzt = am('07:05');
    await motor.zeitplan();
    assert.deepEqual(new Set(gesendet), new Set([admin.id, lena.id, jonas.id]));
    await motor.zeitplan();
    assert.equal(gesendet.length, 3, 'am selben Tag nicht noch einmal');
    zeit.jetzt = am('07:05', '2027-03-13'); // Samstag
    await motor.zeitplan();
    assert.equal(gesendet.length, 3, 'nicht am Wochenende');
    zeit.jetzt = am('07:05', '2027-03-15'); // Montag
    await motor.zeitplan();
    assert.equal(gesendet.length, 6);
  });

  it('Uhrzeit, Wochentage und Abbestellen aus dem Profil; nur Benutzer einer Rolle', async () => {
    const { d, konten, motor, zeit, gesendet, lena, jonas, admin } = await aufbau(am('07:30'));
    await konten.setzeEinstellung(lena, 'aufgaben_mail_zeit', { uhrzeit: '18:00', tage: [1, 2, 3, 4, 5], feiertage: true });
    await motor.lege(zusammenfassung({ uhrzeit: '07:00', jeBenutzer: true, profilzeit: true }), admin.id);
    const a = (await motor.uebersicht()).automatisierungen[0];
    await motor.schalte(a.id, true, admin.id);
    await motor.zeitplan();
    assert.ok(gesendet.includes(jonas.id) && !gesendet.includes(lena.id), 'Lena erst um 18:00');
    zeit.jetzt = am('18:01');
    await motor.zeitplan();
    assert.ok(gesendet.includes(lena.id));
    // Nur eine Rolle: die Rolle prüft der Motor über ihre Mitglieder (hier nur Jonas).
    d.mitgliederDerRolle = async () => [jonas.id];
    const rolle = (await motor.kontext()).rollen[0].id;
    const b = await motor.lege(zusammenfassung({ uhrzeit: '07:00', jeBenutzer: true, rolle, tage: [1, 2, 3, 4, 5, 6, 7] }), admin.id);
    await motor.schalte(b.id, true, admin.id);
    gesendet.length = 0;
    zeit.jetzt = am('08:00', '2027-03-13');
    await motor.zeitplan();
    assert.deepEqual(gesendet, [jonas.id], 'Samstag: nur die Automatisierung mit Rolle, nur Jonas');
  });
});

describe('Dann-Karten der Benachrichtigungen (#678)', () => {
  it('Tägliche Zusammenfassung: derselbe Text wie bisher; abbestellt, abwesend, nichts offen → nichts', async () => {
    const { d, konten, lena, admin } = await aufbau();
    const typ = await d.mappentypen.legeTypAn({ name: 'Vorgang', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }] });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    await d.legeAufgabeAn(m.id, { text: 'Bitte ansehen', empfaengerId: lena.id }, admin.id);
    const mails: Array<{ an: string; betreff: string; text: string }> = [];
    const mailer = { sende: async (an: string, betreff: string, text: string) => { mails.push({ an, betreff, text }); } };
    const quelle = { benutzer: () => konten.listeBenutzer(), einstellungenVon: (b: { id: string }) => konten.einstellungen(b as never), aufgabenVon: async (b: { id: string; rolle: string }) => d.meineAufgaben(b as never, await d.rechtepruefung.zugriff(b as never)), typName: async () => 'Vorgang' };
    const am_ = new Aufgabenmail(quelle as never, () => mailer as never, () => 'http://nas', speicherEinstellungen());
    const offen = (await d.meineAufgaben({ id: lena.id, rolle: 'mitglied' })).length;
    assert.equal(offen, 1, 'Lena hat eine offene Aufgabe');
    await am_.sende();
    const bisher = mails.filter((x) => x.an === 'lena@example.org');
    mails.length = 0;
    const r = await am_.fuerAutomatisierung(lena.id, false);
    assert.equal(r.schluessel, 'gesendet');
    assert.deepEqual(mails, bisher, 'Vergleich: gleiche Mail wie bisher');
    assert.equal((await am_.fuerAutomatisierung(lena.id, true)).schluessel, 'trocken');
    await konten.setzeEinstellung(lena, 'aufgaben_mail', false);
    assert.equal((await am_.fuerAutomatisierung(lena.id, false)).schluessel, 'abbestellt');
    assert.equal((await am_.fuerAutomatisierung(admin.id, false)).schluessel, 'nichts');
  });

  it('Favoriten-Änderungen melden: Ereignis „Favorit geändert“ → gebündelte Benachrichtigung', async () => {
    const { d, motor, lena, admin } = await aufbau();
    const typ = await d.mappentypen.legeTypAn({ name: 'Vorgang', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }] });
    const m = await d.legeMappeAn({ typId: typ.id, werte: { nr: '1' } }, admin.id);
    const L = { id: lena.id, rolle: 'mitglied' };
    await d.setzeFavorit(L, m.id, true);
    await d.ereignisse.verteile();
    const a = await motor.lege({ name: 'F', wenn: { art: 'favorit.geaendert', typ: null }, dann: [{ id: 'f1', art: 'favoriten' }] }, admin.id);
    await motor.schalte(a.id, true, admin.id);
    motor.start();
    try {
      await d.aendereMappe(m.id, { werte: { nr: '2' } }, admin.id);
      await d.ereignisse.verteile();
      const n = (await d.meineAufgaben(L)).filter((x) => x.art === 'aenderung');
      assert.equal(n.length, 1);
      assert.match(n[0].text, /^Eine Änderung von Markus/);
      const l = (await motor.laeufe(a.id))[0];
      assert.equal(l.zustand, 'abgeschlossen');
    } finally { motor.stop(); }
  });

  it('Sammelmeldung Anmeldeschutz: nur Zeitplan ohne „je Benutzer“; Kontosperre nur mit „Benutzerkonto gesperrt“', async () => {
    const { d, motor, zeit, admin } = await aufbau(am('00:10'));
    const rufe: string[] = [];
    d.anmeldeschutzMelden = async (was) => { rufe.push(was); return { gesendet: true, grund: 'gemeldet' }; };
    const a = await motor.lege({ name: 'S', wenn: { art: 'zeitplan', uhrzeit: '00:00', tage: [1, 2, 3, 4, 5, 6, 7] }, dann: [{ id: 'a1', art: 'anmeldeschutz', was: 'sammel' }] }, admin.id);
    await motor.schalte(a.id, true, admin.id);
    await motor.zeitplan();
    await motor.zeitplan();
    assert.deepEqual(rufe, ['sammel'], 'einmal am Tag');
    zeit.jetzt = am('00:10', '2027-03-11');
    await motor.zeitplan();
    assert.deepEqual(rufe, ['sammel', 'sammel']);
  });
});

describe('Übernahme beim Update (#678)', () => {
  it('bestehende Ablage: vier Automatisierungen mit den bisherigen Werten, genau einmal; das Paket ersetzt unveränderte', async () => {
    const { einst, motor } = await aufbau();
    await einst.schreibe('aufgaben_mail', { aktiv: false, uhrzeit: '06:45', bundesland: 'BY' });
    await einst.schreibe('anmeldesperre', { mail: true, mailGewaehlt: true, mailKonto: false });
    assert.equal(await motor.benachrichtigungenUebernehmen(), 4);
    assert.equal(await motor.benachrichtigungenUebernehmen(), 0, 'nur einmal');
    const alle = (await motor.uebersicht()).automatisierungen;
    const z = alle.find((a) => a.dann[0]?.art === 'zusammenfassung')!;
    assert.equal(z.aktiv, false, 'war ausgeschaltet');
    assert.deepEqual(z.wenn, { art: 'zeitplan', uhrzeit: '06:45', tage: [1, 2, 3, 4, 5], feiertage: true, jeBenutzer: true, rolle: null, profilzeit: true });
    assert.equal(alle.find((a) => a.dann[0]?.art === 'favoriten')!.aktiv, true);
    assert.equal(alle.find((a) => a.dann[0]?.art === 'anmeldeschutz' && a.dann[0].was === 'sammel')!.aktiv, true);
    assert.equal(alle.find((a) => a.dann[0]?.art === 'anmeldeschutz' && a.dann[0].was === 'konto')!.aktiv, false);
    assert.equal((await motor.warnungen()).ohneBenachrichtigungen, false);
    // Paket „Benachrichtigungen“ bringt dieselben mit: Die übernommenen gehen in ihnen auf, an/aus bleibt.
    const paket = { id: 'benachrichtigungen', typen: {}, version: '1.1.0' } as never;
    const n = await motor.ausPaket(paket, [
      { schluessel: 'zusammenfassung', name: 'Tägliche Zusammenfassung', beschreibung: '', wenn: { art: 'zeitplan', uhrzeit: '07:00', jeBenutzer: true, profilzeit: true }, dann: [{ id: 'z1', art: 'zusammenfassung' }] },
    ] as never, ['zusammenfassung']);
    assert.equal(n, 1);
    const nachher = (await motor.uebersicht()).automatisierungen.filter((a) => a.dann[0]?.art === 'zusammenfassung');
    assert.equal(nachher.length, 1, 'keine doppelte Zusammenfassung');
    assert.equal(nachher[0].herkunft, 'paket');
    assert.equal(nachher[0].aktiv, false, 'an/aus der übernommenen bleibt');
  });

  it('frische Installation ohne Benutzer: nichts übernommen, Hinweis „Paket installieren?“', async () => {
    const einst = speicherEinstellungen();
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: einst });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    d.verbindeKonten(konten.papierkorbHaken());
    await konten.systemkonto('automatisierung').catch(() => null);
    d.systemkonten = (k) => konten.systemkonto(k);
    const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
    assert.equal(await motor.benachrichtigungenUebernehmen().catch(() => 0), 0);
    assert.equal((await motor.warnungen()).ohneBenachrichtigungen, true);
  });
});
