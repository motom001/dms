/** Favorit = Abo (#422): gebündelte Benachrichtigung „Geändert“ und Hervorhebung geänderter Mappen. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const kurz = () => new Promise((r) => setTimeout(r, 5));

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  // #678: Das Melden macht die Automatisierung „Favoriten-Änderungen melden“ – hier direkt als Abnehmer.
  d.ereignisse.abonniere('favoriten', async (e) => { if (e.art === 'favorit.geaendert') await d.ohneEmpfaenger.favoritenMelden(String(e.daten.mappe), String(e.daten.von)); });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben' });
  const { benutzer: carl } = await konten.legeBenutzerAn({ email: 'carl@example.org', name: 'Carl' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const t = await d.mappentypen.legeTypAn({ name: 'Vorgang', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }] });
  const B = { id: ben.id, rolle: 'mitglied' };
  const geaendert = async () => { await d.ereignisse.verteile(); return (await d.vertretung.meineAufgaben(B)).filter((a) => a.art === 'aenderung'); };
  const hervorgehoben = async () => ((await d.sichten.seite(B, { sicht: t.id })) as { geaendert: string[] }).geaendert;
  return { d, konten, anna, ben, carl, t, A: { id: anna.id, rolle: 'admin' }, B, C: { id: carl.id, rolle: 'mitglied' }, geaendert, hervorgehoben };
}

describe('Favorit = Abo (#422)', () => {
  it('eine Benachrichtigung je Favorit, die hochzählt, bis die Mappe geöffnet wurde', async () => {
    const { d, anna, carl, t, B, geaendert } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, anna.id);
    await d.mappen.setzeFavorit(B, m.id, true);
    await kurz();
    await d.mappen.aendereMappe(m.id, { werte: { nr: '2' } }, anna.id);
    let n = await geaendert();
    assert.equal(n.length, 1);
    assert.equal(n[0].mappeId, m.id);
    assert.match(n[0].text, /^Eine Änderung von Anna seit \d\d\.\d\d\.$/);
    await kurz();
    await d.mappen.aendereMappe(m.id, { werte: { nr: '3' } }, anna.id);
    await kurz();
    await d.mappenNotizen.legeNotizAn(m.id, 'Hallo', carl.id);
    n = await geaendert();
    assert.equal(n.length, 1, 'gebündelt');
    assert.match(n[0].text, /^3 Änderungen von Anna und Carl seit/);
    // Eigene Änderungen benachrichtigen nie und zählen nicht.
    await kurz();
    await d.mappen.aendereMappe(m.id, { werte: { nr: '4' } }, B.id);
    assert.match((await geaendert())[0].text, /^3 Änderungen/);
    // Öffnen = gesehen: erledigt; die nächste Änderung bringt eine neue.
    await d.mappen.gesehen(B, m.id);
    assert.equal((await geaendert()).length, 0);
    await kurz();
    await d.mappen.aendereMappe(m.id, { werte: { nr: '5' } }, carl.id);
    n = await geaendert();
    assert.equal(n.length, 1);
    assert.match(n[0].text, /^Eine Änderung von Carl/);
    // „Erledigt“ an der Benachrichtigung steht nicht in der Historie und löst bei anderen nichts aus.
    const vorher = (await d.mappenHistorie.historie(m.id)).length;
    await d.vertretung.erledigeAufgabe(n[0].id, B);
    assert.equal((await d.mappenHistorie.historie(m.id)).length, vorher);
    assert.equal((await geaendert()).length, 0);
  });

  it('Schalter je Favorit und im Profil; ohne Favorit keine Benachrichtigung', async () => {
    const { d, konten, anna, ben, t, B, geaendert } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, anna.id);
    const eigene = await d.mappen.legeMappeAn({ typId: t.id, werte: { nr: 'eigen' } }, ben.id);
    await kurz();
    await d.mappen.aendereMappe(eigene.id, { werte: { nr: 'eigen 2' } }, anna.id);
    assert.equal((await geaendert()).length, 0, 'selbst angelegt, aber kein Favorit: keine Benachrichtigung');
    await d.mappen.setzeFavorit(B, m.id, true);
    await d.mappen.setzeFavoritBenachrichtigen(B, m.id, false);
    await kurz();
    await d.mappen.aendereMappe(m.id, { werte: { nr: '2' } }, anna.id);
    assert.equal((await geaendert()).length, 0, 'Favorit stumm');
    await d.mappen.setzeFavoritBenachrichtigen(B, m.id, true);
    await konten.setzeEinstellung(ben, 'favoriten_benachrichtigen', false);
    await d.mappen.aendereMappe(m.id, { werte: { nr: '3' } }, anna.id);
    assert.equal((await geaendert()).length, 0, 'im Profil abgeschaltet');
    await konten.setzeEinstellung(ben, 'favoriten_benachrichtigen', null);
    await d.mappen.aendereMappe(m.id, { werte: { nr: '4' } }, anna.id);
    assert.equal((await geaendert()).length, 1);
    const s = (await d.sichten.seite(B, { sicht: 'favoriten' })) as { stumm: string[] };
    assert.deepEqual(s.stumm, []);
  });

  it('hebt geänderte Favoriten und eigene Mappen hervor, bis sie gesehen sind', async () => {
    const { d, konten, anna, ben, t, B, hervorgehoben } = await aufbau();
    const fav = await d.mappen.legeMappeAn({ typId: t.id, werte: { nr: 'fav' } }, anna.id);
    const eigene = await d.mappen.legeMappeAn({ typId: t.id, werte: { nr: 'eigen' } }, ben.id);
    const fremd = await d.mappen.legeMappeAn({ typId: t.id, werte: { nr: 'fremd' } }, anna.id);
    await d.mappen.aendereMappe(fav.id, { werte: { nr: 'fav 0' } }, anna.id);
    await kurz();
    await d.mappen.setzeFavorit(B, fav.id, true);
    assert.deepEqual(await hervorgehoben(), [], 'Änderungen vor dem Favorisieren zählen nicht');
    await kurz();
    for (const m of [fav, eigene, fremd]) await d.mappen.aendereMappe(m.id, { werte: { nr: `${m.werte.nr} 1` } }, anna.id);
    assert.deepEqual(new Set(await hervorgehoben()), new Set([fav.id, eigene.id]), 'nur Favoriten und eigene');
    await d.mappen.gesehen(B, [fav.id]);
    assert.deepEqual(await hervorgehoben(), [eigene.id]);
    await kurz();
    await d.mappen.aendereMappe(eigene.id, { werte: { nr: 'eigen 2' } }, ben.id);
    await d.mappen.gesehen(B, [eigene.id]);
    assert.deepEqual(await hervorgehoben(), []);
    await kurz();
    await d.mappen.aendereMappe(fav.id, { werte: { nr: 'fav 2' } }, anna.id);
    await konten.setzeEinstellung(ben, 'geaenderte_hervorheben', false);
    assert.deepEqual(await hervorgehoben(), [], 'im Profil abgeschaltet');
  });

  it('#506/#1001: Rollen und Vorgabe stehen in der Automatisierung; ohne sie bekommt niemand etwas', async () => {
    const { d, konten, anna, ben, carl, t, B, C, geaendert } = await aufbau();
    // Regeln wie aus den Automatisierungen „Favoriten-Änderungen melden“ (Motor: automatisierung.ts).
    let regeln: Array<{ rollen: string[]; vorgabe: boolean }> = [{ rollen: [], vorgabe: true }];
    d.favoritenRegeln = async () => regeln;
    d.ereignisse.abbestellen('favoriten');
    d.ereignisse.abonniere('favoriten', async (e) => { if (e.art === 'favorit.geaendert') for (const r of regeln) await d.ohneEmpfaenger.favoritenMelden(String(e.daten.mappe), String(e.daten.von), r.rollen); });
    const m = await d.mappen.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, anna.id);
    await d.mappen.setzeFavorit(B, m.id, true);
    await d.mappen.setzeFavorit(C, m.id, true);
    const geaendertC = async () => { await d.ereignisse.verteile(); return (await d.vertretung.meineAufgaben(C)).filter((a) => a.art === 'aenderung'); };
    const rollen = await d.postSystemmappen.listeRollen();
    const mitglied = rollen.find((r) => r.system && r.name === 'Mitglied')!;
    assert.ok(mitglied, 'die Systemrolle steht in der Auswahl');
    assert.equal(await d.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(ben.id), true);
    // Keine eingeschaltete Automatisierung: niemand, die persönliche Einstellung bleibt gespeichert.
    await konten.setzeEinstellung(ben, 'favoriten_benachrichtigen', null);
    regeln = [];
    await kurz();
    await d.mappen.aendereMappe(m.id, { werte: { nr: '2' } }, anna.id);
    assert.equal((await geaendert()).length, 0);
    assert.equal(await d.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(ben.id), false);
    // Nur Rolle „Buchhaltung“ – Carl.
    const rolle = await d.mappen.legeMappeAn({ typId: (await d.mappentypen.listeTypen()).find((x) => x.system === 'rolle')!.id, werte: { name: 'Buchhaltung' } }, anna.id);
    await d.postSystemmappen.setzeRollen(carl.id, [rolle.id], anna.id);
    regeln = [{ rollen: [rolle.id], vorgabe: true }];
    assert.equal(await d.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(carl.id), true);
    assert.equal(await d.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(anna.id), false, 'Verwalten ist keine Rolle (#818)');
    assert.equal(await d.ohneEmpfaenger.favoritenBenachrichtigungErlaubt(ben.id), false);
    await kurz();
    await d.mappen.aendereMappe(m.id, { werte: { nr: '3' } }, anna.id);
    assert.equal((await geaendertC()).length, 1);
    assert.equal((await geaendert()).length, 0);
    // Systemrolle Mitglied: Ben wieder dabei – seine gespeicherte Einstellung greift wieder.
    regeln = [{ rollen: [mitglied.id], vorgabe: true }];
    await kurz();
    await d.mappen.aendereMappe(m.id, { werte: { nr: '4' } }, anna.id);
    assert.equal((await geaendert()).length, 1);
  });

  it('#506/#1001: Vorgabe für neue Benutzer aus der Automatisierung ändert keine bestehenden', async () => {
    const { d, konten, ben } = await aufbau();
    await konten.setzeEinstellung(ben, 'favoriten_benachrichtigen', null);
    d.favoritenRegeln = async () => [{ rollen: [], vorgabe: false }];
    assert.equal((await konten.einstellungen(ben)).favoriten_benachrichtigen, undefined, 'bestehender Benutzer unverändert');
    const { benutzer: dora } = await konten.legeBenutzerAn({ email: 'dora@example.org', name: 'Dora' });
    assert.equal((await konten.einstellungen(dora)).favoriten_benachrichtigen, false, 'neuer Benutzer bekommt die Vorgabe');
    // Eine von zwei Automatisierungen mit Vorgabe an: an.
    d.favoritenRegeln = async () => [{ rollen: [], vorgabe: false }, { rollen: [], vorgabe: true }];
    const { benutzer: emil } = await konten.legeBenutzerAn({ email: 'emil@example.org', name: 'Emil' });
    assert.equal((await konten.einstellungen(emil)).favoriten_benachrichtigen, undefined);
  });
});
