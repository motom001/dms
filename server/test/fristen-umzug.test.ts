/**
 * Erinnerungen am Feld → Automatisierungen (#712): Übernahme mit gleichem Verhalten (Vorlaufzeit, Empfänger, Text,
 * wiederkehrend), genau einmal; das Feld legt selbst keine Aufgaben mehr an; ein Datum im Vorlauf erinnert sofort
 * beim Speichern; erledigt sich bei geändertem Datum; keine doppelte Erinnerung.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

const heute = heuteIn();
/** Nur die Erinnerungen (Datum erreicht) – beim Umzug entsteht außerdem „Vertretung eingetragen“. */
const nurDatum = async (r: { liste(): Promise<Array<{ wenn: { art: string } }>> }) => (await r.liste()).filter((a) => a.wenn.art === 'datum') as never as Awaited<ReturnType<ReturnType<typeof speicherAutomatisierungRepo>['liste']>>;
const in_ = (tage: number) => verschiebe(heute, tage);

async function spaeter<T>(ms: number, f: () => Promise<T>): Promise<T> {
  const echt = Date.now;
  Date.now = () => echt() + ms;
  try { return await f(); } finally { Date.now = echt; }
}

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const neu = async (name: string) => (await konten.legeBenutzerAn({ email: `${name.toLowerCase()}@example.org`, name }, admin.id)).benutzer;
  const lena = await neu('Lena'); const jonas = await neu('Jonas');
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const benutzerTyp = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'kuendigung', label: 'Kündigung bis', typ: 'datum', frist: { vorlauf: 2, einheit: 'wochen', empfaengerFeld: 'verantwortlich', text: '{feld} {datum}', wiederholung: 12 } },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
  ] });
  const repo = speicherAutomatisierungRepo();
  const motor = new Automatisierungen({ dienst: d, repo });
  d.ereignisse.abonniere('automatisierungen', (e) => motor.ereignis(e));
  const verteile = () => spaeter(30_000, () => d.ereignisse.verteile());
  const fristen = async (id: string) => (await d.meineAufgaben({ id, rolle: 'mitglied' })).filter((a) => a.art === 'frist');
  return { d, konten, admin, lena, jonas, vertrag, repo, motor, verteile, fristen };
}

describe('Erinnerungen am Feld als Automatisierungen (#712)', () => {
  it('übernimmt jede Erinnerung genau einmal, eingeschaltet, mit Vorlaufzeit, Empfänger, Text und Wiederholung', async () => {
    const { vertrag, repo, motor } = await aufbau();
    assert.equal(await motor.fristenUebernehmen(), 2, 'Erinnerung und Vertretung');
    const [a] = await nurDatum(repo);
    assert.equal(a.aktiv, true);
    assert.equal(a.herkunft, 'eigen');
    assert.deepEqual(a.wenn, { art: 'datum', typ: vertrag.id, feld: 'kuendigung', vorlauf: 2, einheit: 'wochen', uhrzeit: '07:00', wiederholung: 12 });
    assert.deepEqual(a.dann[0], { id: 'f1', art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'feld', feld: 'verantwortlich', sonst: 'ersteller' }], text: 'Kündigung bis {datum}', faellig: null });
    assert.equal(await motor.fristenUebernehmen(), 0, 'nicht doppelt');
    await repo.loesche(a.id);
    assert.equal(await motor.fristenUebernehmen(), 0, 'gelöscht bleibt gelöscht');
    // Hinweis „umgezogen“ in der Werkbank, bis ein Admin ihn gelesen hat.
    assert.equal((await motor.warnungen()).umgezogen?.anzahl, 2);
    await motor.umzugGesehen();
    assert.equal((await motor.warnungen()).umgezogen, null);
  });

  it('nur einmal beim Update: eine später angelegte Frist legt keine Automatisierung an', async () => {
    const { d, repo, motor } = await aufbau();
    assert.equal(await motor.fristenUebernehmen(), 2);
    await d.mappentypen.legeTypAn({ name: 'Ausweis', felder: [{ key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'gueltig', label: 'Gültig bis', typ: 'datum', frist: { vorlauf: 90, einheit: 'tage', empfaengerFeld: null, text: '{feld} {datum}', wiederholung: null } }] });
    assert.equal(await motor.fristenUebernehmen(), 0);
    assert.equal((await nurDatum(repo)).length, 1);
  });

  it('frische Installation ohne Fristen: kein Hinweis', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
    assert.equal(await motor.fristenUebernehmen(), 0);
    assert.equal(await motor.umzug(), null);
  });

  it('Datum im Vorlauf: sofort eine Frist (an den Ersteller, wenn kein Verantwortlicher) – das Feld selbst legt keine an', async () => {
    const { d, lena, jonas, vertrag, motor, verteile, fristen } = await aufbau();
    // Ohne Automatisierung: das Feld erinnert nicht mehr selbst.
    const ohne = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Wasser', kuendigung: in_(10) } }, lena.id);
    assert.equal((await d.fristenLauf()).angelegt, 0);
    assert.equal((await fristen(lena.id)).length, 0);
    await d.loescheMappe(ohne.id, lena.id).catch(() => {});
    await motor.fristenUebernehmen();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendigung: in_(10) } }, lena.id);
    await verteile();
    let offen = await fristen(lena.id);
    assert.equal(offen.length, 1);
    assert.equal(offen[0].datum, in_(10));
    assert.match(offen[0].text, /^Kündigung bis \d\d\.\d\d\.\d{4}$/);
    // Noch einmal gespeichert: keine zweite.
    await d.mappen.aendereMappe(m.id, { werte: { name: 'Strom Haus' } }, lena.id);
    await verteile();
    assert.equal((await fristen(lena.id)).length, 1);
    // Datum verschoben: alte erledigt sich; neues Datum noch nicht im Vorlauf → nichts.
    await d.mappen.aendereMappe(m.id, { werte: { kuendigung: in_(60), verantwortlich: jonas.id } }, lena.id);
    await verteile();
    assert.equal((await fristen(lena.id)).length, 0);
    assert.equal((await fristen(jonas.id)).length, 0);
    // Wieder in den Vorlauf: an den Verantwortlichen.
    await d.mappen.aendereMappe(m.id, { werte: { kuendigung: in_(5) } }, lena.id);
    await verteile();
    offen = await fristen(jonas.id);
    assert.equal(offen.length, 1);
    assert.equal(offen[0].datum, in_(5));
  });

  it('vergangene Daten und Daten weit voraus erinnern beim Speichern nicht', async () => {
    const { d, lena, vertrag, motor, verteile, fristen } = await aufbau();
    await motor.fristenUebernehmen();
    await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Alt', kuendigung: in_(-3) } }, lena.id);
    await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Später', kuendigung: in_(40) } }, lena.id);
    await verteile();
    assert.equal((await fristen(lena.id)).length, 0);
  });

  it('mitgelieferte Automatisierung mit unbekanntem Mappentyp hält an, statt auf alle zu laufen (#1084, Sicherheit A)', async () => {
    const { vertrag, repo, motor } = await aufbau();
    const p = { id: 'vertraege', name: 'Verträge', typen: { vertrag: vertrag.id } } as never;
    const def = { schluessel: 'pruefen', name: 'Prüfen', beschreibung: '', wenn: { art: 'mappe.angelegt', typ: 'haus_garten:pflanze' }, dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Prüfen?' }] };
    await motor.ausPaket(p, [def], ['pruefen']);
    const a = (await repo.liste()).find((x) => x.paketId === 'vertraege')!;
    assert.equal(a.aktiv, false, 'auch angehakt nicht an');
    assert.equal(a.angehalten?.grund, 'fehlerhaft');
    assert.match(a.angehalten?.text ?? '', /haus_garten:pflanze/);
  });

  it('mitgelieferte Automatisierungen eines Pakets: aus, Typ aufgelöst, Update ersetzt nur Unverändertes', async () => {
    const { vertrag, repo, motor } = await aufbau();
    const p = { id: 'vertraege', name: 'Verträge', typen: { vertrag: vertrag.id } } as never;
    const def = { schluessel: 'kuendigen', name: 'Kündigung vorbereiten', beschreibung: '', wenn: { art: 'datum', typ: 'vertrag', feld: 'kuendigung', vorlauf: 3, einheit: 'monate' }, dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Kündigen?' }] };
    assert.equal(await motor.ausPaket(p, [def]), 1);
    let [a] = await nurDatum(repo);
    assert.equal(a.aktiv, false);
    assert.equal(a.herkunft, 'paket');
    assert.equal(a.paketId, 'vertraege');
    assert.equal((a.wenn as { typ: string }).typ, vertrag.id);
    // Mit eigener Automatisierung für das Feld entsteht beim Übernehmen keine zweite (nur die Vertretung).
    assert.equal(await motor.fristenUebernehmen(), 1);
    // Update mit neuem Namen ersetzt die unveränderte Fassung.
    await motor.ausPaket(p, [{ ...def, name: 'Kündigung rechtzeitig vorbereiten' }]);
    [a] = await nurDatum(repo);
    assert.equal(a.name, 'Kündigung rechtzeitig vorbereiten');
    // Von Hand geändert: bleibt beim nächsten Update.
    await motor.aendere(a.id, { ...a, name: 'Meine Kündigung' }, 'x');
    await motor.ausPaket(p, [def]);
    assert.equal((await nurDatum(repo))[0].name, 'Meine Kündigung');
    // Nicht mehr mitgeliefert: nur Unverändertes und Ausgeschaltetes fällt weg.
    await motor.ausPaket(p, []);
    assert.equal((await nurDatum(repo)).length, 1);
  });

  it('beim Installieren angehakte sind gleich eingeschaltet', async () => {
    const { vertrag, repo, motor } = await aufbau();
    const p = { id: 'vertraege', name: 'Verträge', typen: { vertrag: vertrag.id } } as never;
    const def = (schluessel: string) => ({ schluessel, name: schluessel, beschreibung: '', wenn: { art: 'mappe.angelegt', typ: 'vertrag' }, dann: [{ art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'ersteller' }], text: 'Neu' }] });
    assert.equal(await motor.ausPaket(p, [def('a'), def('b')], ['b']), 2);
    const an = (await repo.liste()).filter((a) => a.aktiv).map((a) => a.name);
    assert.deepEqual(an, ['b']);
  });

  it('mitgelieferte Erinnerung ersetzt die übernommene für dasselbe Feld – nie doppelt', async () => {
    const { vertrag, repo, motor } = await aufbau();
    assert.equal(await motor.fristenUebernehmen(), 2);
    const p = { id: 'vertraege', name: 'Verträge', typen: { vertrag: vertrag.id } } as never;
    const def = { schluessel: 'kuendigen', name: 'Kündigung vorbereiten', beschreibung: '', wenn: { art: 'datum', typ: 'vertrag', feld: 'kuendigung', vorlauf: 3, einheit: 'monate' }, dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Kündigen?' }] };
    await motor.ausPaket(p, [def]);
    const liste = await nurDatum(repo);
    assert.equal(liste.length, 1);
    assert.equal(liste[0].name, 'Kündigung vorbereiten');
    assert.equal(liste[0].aktiv, true, 'an/aus der übernommenen bleibt');
  });

  it('geänderte übernommene Erinnerung bleibt, die mitgelieferte entsteht nicht', async () => {
    const { vertrag, repo, motor } = await aufbau();
    await motor.fristenUebernehmen();
    const [alt] = await nurDatum(repo);
    await motor.aendere(alt.id, { ...alt, name: 'Meine Kündigung' }, 'x');
    const p = { id: 'vertraege', name: 'Verträge', typen: { vertrag: vertrag.id } } as never;
    await motor.ausPaket(p, [{ schluessel: 'kuendigen', name: 'Kündigung vorbereiten', beschreibung: '', wenn: { art: 'datum', typ: 'vertrag', feld: 'kuendigung', vorlauf: 3, einheit: 'monate' }, dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Kündigen?' }] }], ['kuendigen']);
    const liste = await nurDatum(repo);
    assert.deepEqual(liste.map((a) => a.name), ['Meine Kündigung']);
  });
});
