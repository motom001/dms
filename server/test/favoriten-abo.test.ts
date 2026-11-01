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
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: anna } = await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
  const { benutzer: ben } = await konten.legeBenutzerAn({ email: 'ben@example.org', name: 'Ben', rolle: 'mitglied' });
  const { benutzer: carl } = await konten.legeBenutzerAn({ email: 'carl@example.org', name: 'Carl', rolle: 'mitglied' });
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const t = await d.legeTypAn({ name: 'Vorgang', felder: [{ key: 'nr', label: 'Nummer', typ: 'text' }] });
  const B = { id: ben.id, rolle: 'mitglied' };
  const geaendert = async () => (await d.meineAufgaben(B)).filter((a) => a.art === 'aenderung');
  const hervorgehoben = async () => ((await d.seite(B, { sicht: t.id })) as { geaendert: string[] }).geaendert;
  return { d, konten, anna, ben, carl, t, A: { id: anna.id, rolle: 'admin' }, B, C: { id: carl.id, rolle: 'mitglied' }, geaendert, hervorgehoben };
}

describe('Favorit = Abo (#422)', () => {
  it('eine Benachrichtigung je Favorit, die hochzählt, bis die Mappe geöffnet wurde', async () => {
    const { d, anna, carl, t, B, geaendert } = await aufbau();
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, anna.id);
    await d.setzeFavorit(B, m.id, true);
    await kurz();
    await d.aendereMappe(m.id, { werte: { nr: '2' } }, anna.id);
    let n = await geaendert();
    assert.equal(n.length, 1);
    assert.equal(n[0].mappeId, m.id);
    assert.match(n[0].text, /^Eine Änderung von Anna seit \d\d\.\d\d\.$/);
    await kurz();
    await d.aendereMappe(m.id, { werte: { nr: '3' } }, anna.id);
    await kurz();
    await d.legeNotizAn(m.id, 'Hallo', carl.id);
    n = await geaendert();
    assert.equal(n.length, 1, 'gebündelt');
    assert.match(n[0].text, /^3 Änderungen von Anna und Carl seit/);
    // Eigene Änderungen benachrichtigen nie und zählen nicht.
    await kurz();
    await d.aendereMappe(m.id, { werte: { nr: '4' } }, B.id);
    assert.match((await geaendert())[0].text, /^3 Änderungen/);
    // Öffnen = gesehen: erledigt; die nächste Änderung bringt eine neue.
    await d.gesehen(B, m.id);
    assert.equal((await geaendert()).length, 0);
    await kurz();
    await d.aendereMappe(m.id, { werte: { nr: '5' } }, carl.id);
    n = await geaendert();
    assert.equal(n.length, 1);
    assert.match(n[0].text, /^Eine Änderung von Carl/);
    // „Erledigt“ an der Benachrichtigung steht nicht in der Historie und löst bei anderen nichts aus.
    const vorher = (await d.historie(m.id)).length;
    await d.erledigeAufgabe(n[0].id, B);
    assert.equal((await d.historie(m.id)).length, vorher);
    assert.equal((await geaendert()).length, 0);
  });

  it('Schalter je Favorit und im Profil; ohne Favorit keine Benachrichtigung', async () => {
    const { d, konten, anna, ben, t, B, geaendert } = await aufbau();
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, anna.id);
    const eigene = await d.legeMappeAn({ typId: t.id, werte: { nr: 'eigen' } }, ben.id);
    await kurz();
    await d.aendereMappe(eigene.id, { werte: { nr: 'eigen 2' } }, anna.id);
    assert.equal((await geaendert()).length, 0, 'selbst angelegt, aber kein Favorit: keine Benachrichtigung');
    await d.setzeFavorit(B, m.id, true);
    await d.setzeFavoritBenachrichtigen(B, m.id, false);
    await kurz();
    await d.aendereMappe(m.id, { werte: { nr: '2' } }, anna.id);
    assert.equal((await geaendert()).length, 0, 'Favorit stumm');
    await d.setzeFavoritBenachrichtigen(B, m.id, true);
    await konten.setzeEinstellung(ben, 'favoriten_benachrichtigen', false);
    await d.aendereMappe(m.id, { werte: { nr: '3' } }, anna.id);
    assert.equal((await geaendert()).length, 0, 'im Profil abgeschaltet');
    await konten.setzeEinstellung(ben, 'favoriten_benachrichtigen', null);
    await d.aendereMappe(m.id, { werte: { nr: '4' } }, anna.id);
    assert.equal((await geaendert()).length, 1);
    const s = (await d.seite(B, { sicht: 'favoriten' })) as { stumm: string[] };
    assert.deepEqual(s.stumm, []);
  });

  it('hebt geänderte Favoriten und eigene Mappen hervor, bis sie gesehen sind', async () => {
    const { d, konten, anna, ben, t, B, hervorgehoben } = await aufbau();
    const fav = await d.legeMappeAn({ typId: t.id, werte: { nr: 'fav' } }, anna.id);
    const eigene = await d.legeMappeAn({ typId: t.id, werte: { nr: 'eigen' } }, ben.id);
    const fremd = await d.legeMappeAn({ typId: t.id, werte: { nr: 'fremd' } }, anna.id);
    await d.aendereMappe(fav.id, { werte: { nr: 'fav 0' } }, anna.id);
    await kurz();
    await d.setzeFavorit(B, fav.id, true);
    assert.deepEqual(await hervorgehoben(), [], 'Änderungen vor dem Favorisieren zählen nicht');
    await kurz();
    for (const m of [fav, eigene, fremd]) await d.aendereMappe(m.id, { werte: { nr: `${m.werte.nr} 1` } }, anna.id);
    assert.deepEqual(new Set(await hervorgehoben()), new Set([fav.id, eigene.id]), 'nur Favoriten und eigene');
    await d.gesehen(B, [fav.id]);
    assert.deepEqual(await hervorgehoben(), [eigene.id]);
    await kurz();
    await d.aendereMappe(eigene.id, { werte: { nr: 'eigen 2' } }, ben.id);
    await d.gesehen(B, [eigene.id]);
    assert.deepEqual(await hervorgehoben(), []);
    await kurz();
    await d.aendereMappe(fav.id, { werte: { nr: 'fav 2' } }, anna.id);
    await konten.setzeEinstellung(ben, 'geaenderte_hervorheben', false);
    assert.deepEqual(await hervorgehoben(), [], 'im Profil abgeschaltet');
  });

  it('#506: Freigabe für alle, je Rolle (Systemrolle oder fachliche Rolle) oder gar nicht; eigene Einstellung bleibt', async () => {
    const { d, konten, anna, ben, carl, t, B, C, geaendert } = await aufbau();
    const m = await d.legeMappeAn({ typId: t.id, werte: { nr: '1' } }, anna.id);
    await d.setzeFavorit(B, m.id, true);
    await d.setzeFavorit(C, m.id, true);
    const geaendertC = async () => (await d.meineAufgaben(C)).filter((a) => a.art === 'aenderung');
    const rollen = await d.listeRollen();
    const mitglied = rollen.find((r) => r.system && r.name === 'Mitglied')!;
    const admin = rollen.find((r) => r.system && r.name !== 'Mitglied')!;
    assert.ok(mitglied && admin, 'Systemrollen stehen in der Auswahl');
    // Standard: für alle, wie bisher.
    assert.deepEqual(await d.favoritenFreigabe(), { erlaubt: 'alle', rollen: [], vorgabe: true });
    assert.equal(await d.favoritenBenachrichtigungErlaubt(ben.id), true);
    // Gar nicht: niemand wird benachrichtigt, die persönliche Einstellung bleibt gespeichert.
    await konten.setzeEinstellung(ben, 'favoriten_benachrichtigen', null);
    await d.setzeFavoritenFreigabe({ erlaubt: 'aus', vorgabe: true }, 'anna@example.org');
    await kurz();
    await d.aendereMappe(m.id, { werte: { nr: '2' } }, anna.id);
    assert.equal((await geaendert()).length, 0);
    assert.equal(await d.favoritenBenachrichtigungErlaubt(ben.id), false);
    // Je Rolle – fachliche Rolle „Buchhaltung“ nur für Carl; Systemrolle Administrator.
    const rolle = await d.legeMappeAn({ typId: (await d.listeTypen()).find((x) => x.system === 'rolle')!.id, werte: { name: 'Buchhaltung' } }, anna.id);
    await d.setzeRollen(carl.id, [rolle.id], anna.id);
    await d.setzeFavoritenFreigabe({ erlaubt: 'rollen', rollen: [rolle.id, admin.id, 'gibt-es-nicht'], vorgabe: true }, 'anna@example.org');
    assert.deepEqual((await d.favoritenFreigabe()).rollen, [rolle.id, admin.id], 'unbekannte Rollen fallen weg');
    assert.equal(await d.favoritenBenachrichtigungErlaubt(carl.id), true);
    assert.equal(await d.favoritenBenachrichtigungErlaubt(anna.id), true, 'Administrator über die Systemrolle');
    assert.equal(await d.favoritenBenachrichtigungErlaubt(ben.id), false);
    await kurz();
    await d.aendereMappe(m.id, { werte: { nr: '3' } }, anna.id);
    assert.equal((await geaendertC()).length, 1);
    assert.equal((await geaendert()).length, 0);
    // Systemrolle Mitglied: Ben wieder dabei – seine gespeicherte Einstellung greift wieder.
    await d.setzeFavoritenFreigabe({ erlaubt: 'rollen', rollen: [mitglied.id], vorgabe: true }, 'anna@example.org');
    await kurz();
    await d.aendereMappe(m.id, { werte: { nr: '4' } }, anna.id);
    assert.equal((await geaendert()).length, 1);
    // Rollen ohne Auswahl: abgelehnt.
    await assert.rejects(() => d.setzeFavoritenFreigabe({ erlaubt: 'rollen', rollen: [] }, 'x'), /mindestens eine Rolle/);
  });

  it('#506: Vorgabe für neue Benutzer ändert keine bestehenden; „auf alle anwenden“ schon', async () => {
    const { d, konten, ben } = await aufbau();
    await konten.setzeEinstellung(ben, 'favoriten_benachrichtigen', null);
    await d.setzeFavoritenFreigabe({ erlaubt: 'alle', vorgabe: false }, 'anna@example.org');
    assert.equal((await konten.einstellungen(ben)).favoriten_benachrichtigen, undefined, 'bestehender Benutzer unverändert');
    const { benutzer: dora } = await konten.legeBenutzerAn({ email: 'dora@example.org', name: 'Dora', rolle: 'mitglied' });
    assert.equal((await konten.einstellungen(dora)).favoriten_benachrichtigen, false, 'neuer Benutzer bekommt die Vorgabe');
    assert.equal(await d.favoritenVorgabeAnwenden('anna@example.org'), 4);
    assert.equal((await konten.einstellungen(ben)).favoriten_benachrichtigen, false);
    await d.setzeFavoritenFreigabe({ erlaubt: 'alle', vorgabe: true }, 'anna@example.org');
    assert.equal(await d.favoritenVorgabeAnwenden('anna@example.org'), 4);
    assert.equal((await konten.einstellungen(ben)).favoriten_benachrichtigen, undefined);
    // Standard wird nicht gespeichert.
    assert.deepEqual(await d.favoritenFreigabe(), { erlaubt: 'alle', rollen: [], vorgabe: true });
  });
});
