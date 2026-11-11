/**
 * Dann-Karten (#676): „Feld ändern“ (nur gewählte Felder, Platzhalter, heute+N, Prüfung wie im Formular, Historie
 * „durch Automatisierung“, keine Selbstauslösung über den Katalog) und „Aufgabe / Benachrichtigung“ (Person, Rolle,
 * Feld; Fälligkeit; Benachrichtigung gebündelt; ohne Leserecht trotzdem an der Mappe, #798), Beispiel aus dem
 * Handbuch „Vertrag – Kündbar bis in 7 Tagen → Aufgabe an Verantwortlich“.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { KatalogEreignis } from '../../shared/src/ereignisse';
import { heuteIn, verschiebe } from '../../shared/src/sichten';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung-karten';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

/** Uhr vorstellen (Bündelung im Ereigniskatalog), danach zurück. */
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
  const { benutzer: lena } = await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, admin.id);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const benutzerTyp = (await d.mappentypen.listeTypen()).find((t) => t.system === 'benutzer')!;
  const vertrag = await d.mappentypen.legeTypAn({ name: 'Vertrag', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'status', label: 'Status', typ: 'auswahl', optionen: ['offen', 'erledigt'] },
    { key: 'bemerkung', label: 'Bemerkung', typ: 'text' },
    { key: 'geprueft', label: 'Geprüft am', typ: 'datum' },
    { key: 'kuendbar_bis', label: 'Kündbar bis', typ: 'datum' },
    { key: 'verantwortlich', label: 'Verantwortlich', typ: 'referenz', zielTyp: benutzerTyp.id },
  ] });
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
  const ereignis = (art: string, daten: Record<string, unknown>): KatalogEreignis =>
    ({ id: crypto.randomUUID(), art: art as KatalogEreignis['art'], daten, ausloeser: { art: 'benutzer', id: admin.id, konto: admin.id }, erstellt: new Date().toISOString() });
  return { d, konten, admin, lena, vertrag, motor, ereignis };
}

describe('Dann-Karte „Feld ändern“ (#676)', () => {
  it('setzt nur die gewählten Felder mit Platzhaltern und heute; Historie „durch Automatisierung“; löst sich nicht selbst aus', async () => {
    const { d, admin, vertrag, motor, ereignis } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', status: 'offen', kuendbar_bis: '2031-09-30' } }, admin.id);
    const a = await motor.lege({ name: 'Erledigt', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id },
      dann: [{ art: 'feld', werte: { status: 'erledigt', bemerkung: 'Geprüft: {name} am {heute}', geprueft: 'heute+1' } }] }, admin.id);
    const trocken = await motor.wiedergeben(a.id, m.id, true);
    assert.match(trocken.schritte[2].text!, /^Würde setzen: Status = erledigt, Bemerkung = Geprüft: Strom am/);
    assert.equal((await d.mappen.holeMappe(m.id)).mappe.werte.status, 'offen', 'Trockenlauf ändert nichts');
    // Über den Katalog: Notiz → Lauf → Feld geändert → Ereignis der Automatisierung (löst sie nicht noch einmal aus).
    motor.start();
    try {
      await d.mappenNotizen.legeNotizAn(m.id, 'Anruf', admin.id);
      await spaeter(10_000, () => d.ereignisse.verteile());
      await spaeter(10_000, () => d.ereignisse.verteile());
    } finally { motor.stop(); }
    const neu = (await d.mappen.holeMappe(m.id)).mappe.werte;
    assert.equal(neu.status, 'erledigt');
    assert.equal(neu.geprueft, verschiebe(heuteIn(), 1));
    assert.match(String(neu.bemerkung), /^Geprüft: Strom am \d{2}\.\d{2}\.\d{4}$/);
    assert.equal(neu.kuendbar_bis, '2031-09-30', 'nicht gewählte Felder bleiben');
    const h = (await d.mappenHistorie.historie(m.id)).find((x) => x.art === 'geaendert');
    assert.equal((h?.daten as { automatisierung?: { name: string } }).automatisierung?.name, 'Erledigt');
    const laeufe = await motor.laeufe(a.id);
    assert.deepEqual(laeufe.filter((l) => !l.test).map((l) => l.zustand), ['abgeschlossen'], 'genau ein echter Lauf');
  });

  it('prüft wie im Formular: ungültiger Wert lässt den Lauf fehlschlagen (wiederholbar)', async () => {
    const { d, admin, vertrag, motor, ereignis } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    const a = await motor.lege({ name: 'Kaputt', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id }, dann: [{ art: 'feld', werte: { status: 'gibtsnicht' } }] }, admin.id);
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'fehlgeschlagen');
    assert.equal(l.schritte[2].zustand, 'fehler');
    await motor.aendere(a.id, { dann: [{ art: 'feld', werte: { status: 'erledigt' } }] }, admin.id);
    const w = await motor.wiederhole(l.id);
    assert.equal(w.zustand, 'abgeschlossen');
    assert.equal((await motor.laeufe(a.id)).find((x) => x.id === l.id)?.zustand, 'wiederholt');
  });
});

describe('Dann-Karte „Aufgabe / Benachrichtigung“ (#676)', () => {
  it('Handbuch-Beispiel: Kündbar bis in 7 Tagen → Aufgabe an Verantwortlich, mit Fälligkeit und Platzhaltern', async () => {
    const { d, admin, lena, vertrag, motor } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom', kuendbar_bis: verschiebe(heuteIn(), 7), verantwortlich: lena.id } }, admin.id);
    const a = await motor.lege({ name: 'Kündigung prüfen', aktiv: true, wenn: { art: 'datum', typ: vertrag.id, feld: 'kuendbar_bis', vorlauf: 7, einheit: 'tage', uhrzeit: '00:00' },
      und: { modus: 'alle', karten: [{ art: 'bedingung', bedingung: { art: 'feld', feld: 'verantwortlich', op: 'nichtLeer' } }] },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'feld', feld: 'verantwortlich' }], faellig: 3, text: 'Bitte {name} prüfen – kündbar bis {kuendbar_bis}.' }] }, admin.id);
    await motor.zeitplan();
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    const aufgaben = (await d.ohneLeserecht.alleAufgaben()).filter((x) => x.empfaengerId === lena.id && x.mappeId === m.id);
    assert.equal(aufgaben.length, 1);
    assert.match(aufgaben[0].text, /^Bitte Strom prüfen – kündbar bis \d{2}\.\d{2}\.\d{4}\.$/);
    // Seit #724: aus „Datum erreicht“ eine Frist zum Datum der Mappe (erledigt sich selbst, wenn es sich ändert).
    assert.equal(aufgaben[0].art, 'frist');
    assert.equal(aufgaben[0].datum, verschiebe(heuteIn(), 7));
  });

  it('Benachrichtigung an eine Rolle gebündelt; ohne Leserecht trotzdem an der Mappe (#798)', async () => {
    const { d, admin, lena, vertrag, motor, ereignis } = await aufbau();
    const m = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { name: 'Strom' } }, admin.id);
    const rollen = await d.postSystemmappen.listeRollen();
    const mitglied = rollen.find((r) => r.system && /Mitglied/.test(r.name))!;
    // Mitglieder dürfen Verträge nicht lesen.
    await d.berechtigungen.setzeBerechtigungen(vertrag.id, { regeln: [{ wer: { art: 'rolle', id: rollen.find((r) => /Administrator/.test(r.name))?.id ?? '' }, rechte: ['C', 'R', 'U', 'D'] }] }, true).catch(() => null);
    const a = await motor.lege({ name: 'Melden', aktiv: true, wenn: { art: 'mappe.notiz', typ: vertrag.id },
      dann: [{ art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'rolle', id: mitglied.id }, { art: 'person', id: lena.id }], text: 'Neue Notiz an {titel}' }] }, admin.id);
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    await motor.ereignis(ereignis('mappe.notiz', { mappe: m.id, typ: vertrag.id }));
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen', JSON.stringify(l.schritte));
    const fuerLena = (await d.ohneLeserecht.alleAufgaben()).filter((x) => x.empfaengerId === lena.id);
    assert.equal(fuerLena.length, 1, 'gebündelt, Rolle und Person sind dieselbe Lena');
    const lesbar = (await d.rechtepruefung.sichtbarFuer(lena.id, [m.id])).has(m.id);
    assert.equal(fuerLena[0].mappeId, m.id, 'seit #798 immer an der Mappe – ohne Leserecht nur mit Hinweis');
    if (!lesbar) assert.match(l.schritte[2].text!, /darf die Mappe nicht sehen/);
  });
});

describe('Keine Beispiel-Automatisierungen im Kern (#883)', () => {
  it('eine frische Ablage bekommt keine Automatisierungen von Ablago', async () => {
    const { motor } = await aufbau();
    await motor.zeitplan();
    assert.deepEqual(await motor.raeumeBeispieleAuf(), { entfernt: [], uebernommen: [] });
    assert.equal((await motor.uebersicht()).automatisierungen.length, 0);
  });

  it('Umzug: unverändert und nie eingeschaltet → entfernt; eingeschaltet oder geändert → eigene, löschbar', async () => {
    const { admin, vertrag, motor } = await aufbau();
    const karte = { wenn: { art: 'dokument.hochgeladen', typ: null }, dann: [{ art: 'aufgabe', als: 'benachrichtigung', empfaenger: [{ art: 'ersteller' }], text: 'Neu: {titel}' }] };
    const unveraendert = await motor.lege({ name: 'Beispiel: Kontosperre melden', ...karte }, null, 'dms');
    const eingeschaltet = await motor.lege({ name: 'Beispiel: Neue Dokumente melden', ...karte }, null, 'dms');
    await motor.schalte(eingeschaltet.id, true, admin.id);
    const geaendert = await motor.lege({ name: 'Beispiel: An die Kündigungsfrist erinnern', wenn: { art: 'datum', typ: vertrag.id, feld: 'kuendbar_bis', vorlauf: 30, einheit: 'tage', uhrzeit: '07:00' },
      dann: [{ art: 'aufgabe', als: 'aufgabe', empfaenger: [{ art: 'ersteller' }], text: 'Kündigen?' }] }, null, 'dms');
    await motor.aendere(geaendert.id, { ...geaendert, name: 'Kündigung prüfen' }, admin.id);
    // Ein- und wieder ausgeschaltet zählt als „eingeschaltet“.
    const einmalAn = await motor.lege({ name: 'Beispiel: einmal an', ...karte }, null, 'dms');
    await motor.schalte(einmalAn.id, true, admin.id);
    await motor.schalte(einmalAn.id, false, admin.id);
    const eigen = await motor.lege({ name: 'Eigene', ...karte }, admin.id);

    const erg = await motor.raeumeBeispieleAuf();
    assert.deepEqual(erg.entfernt, ['Beispiel: Kontosperre melden']);
    assert.deepEqual(erg.uebernommen.sort(), ['Beispiel: Neue Dokumente melden', 'Beispiel: einmal an', 'Kündigung prüfen'].sort());
    const liste = (await motor.uebersicht()).automatisierungen;
    assert.ok(!liste.some((a) => a.id === unveraendert.id), 'still entfernt');
    assert.ok(liste.every((a) => a.herkunft === 'eigen'), 'keine mehr „von Ablago“');
    assert.equal(liste.find((a) => a.id === eingeschaltet.id)!.aktiv, true, 'eingeschaltet bleibt an');
    assert.equal(liste.find((a) => a.id === geaendert.id)!.name, 'Kündigung prüfen');
    assert.ok(liste.some((a) => a.id === eigen.id));
    assert.deepEqual(await motor.raeumeBeispieleAuf(), { entfernt: [], uebernommen: [] }, 'nur einmal');
    await motor.loesche(geaendert.id);
    assert.ok(!(await motor.uebersicht()).automatisierungen.some((a) => a.id === geaendert.id), 'jetzt löschbar');
  });
});
