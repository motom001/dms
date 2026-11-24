/**
 * Dann-Karte „Feld in verknüpfter Mappe setzen“ (#1557): HU → Fahrzeug mit `nurWenn: spaeter`, mehrere verknüpfte
 * Mappen, leer, Historie der Zielmappe, fehlende Rechte (kein Fehler, vermerkt), Prüfung im Editor und im Paket.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { KatalogEreignis } from '../../shared/src/ereignisse';
import { automatisierungsProbleme, nurWennErfuellt, type DannKarte } from '../../shared/src/automatisierung';
import { Automatisierungen, speicherAutomatisierungRepo } from '../src/automatisierung';
import '../src/automatisierung/automatisierung-karten';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { speicherRepo } from '../src/repo/speicher';
import { Fachfehler } from '../src/grundlagen/fehler';
import { liesPaket } from '../src/pakete/verwaltung/index';

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  await konten.systemkonto('automatisierung');
  d.systemkonten = (k) => konten.systemkonto(k);
  const fahrzeug = await d.mappentypen.legeTypAn({
    name: 'Fahrzeug',
    felder: [
      { key: 'kennzeichen', label: 'Kennzeichen', typ: 'text', pflicht: true },
      { key: 'hu_faellig', label: 'HU fällig', typ: 'datum' },
      { key: 'notiz', label: 'Notiz', typ: 'text' },
    ],
    titelVorlage: '{kennzeichen}',
  });
  const hu = await d.mappentypen.legeTypAn({
    name: 'Hauptuntersuchung',
    felder: [
      { key: 'bericht', label: 'Prüfbericht-Nr.', typ: 'text', pflicht: true },
      { key: 'fahrzeug', label: 'Fahrzeug', typ: 'referenz', zielTyp: fahrzeug.id, mehrfach: true },
      { key: 'naechste_hu', label: 'Nächste HU', typ: 'datum' },
    ],
  });
  const motor = new Automatisierungen({ dienst: d, repo: speicherAutomatisierungRepo() });
  const ereignis = (art: string, daten: Record<string, unknown>): KatalogEreignis => ({
    id: crypto.randomUUID(),
    art: art as KatalogEreignis['art'],
    daten,
    ausloeser: { art: 'benutzer', id: admin.id, konto: admin.id },
    erstellt: new Date().toISOString(),
  });
  const huUebernehmen = (dann: Partial<Extract<DannKarte, { art: 'feld_verknuepft' }>> = {}) =>
    motor.lege(
      {
        name: 'Nächste HU ans Fahrzeug',
        aktiv: true,
        wenn: { art: 'mappe.angelegt', typ: hu.id },
        dann: [{ art: 'feld_verknuepft', ueber: 'fahrzeug', werte: { hu_faellig: '{naechste_hu}' }, nurWenn: 'spaeter', ...dann }],
      },
      admin.id,
    );
  const neueHu = async (werte: Record<string, unknown>) => {
    const m = await d.mappen.legeMappeAn({ typId: hu.id, werte: { bericht: 'P-1', ...werte } }, admin.id);
    return m;
  };
  return { d, admin, fahrzeug, hu, motor, ereignis, huUebernehmen, neueHu };
}

describe('Dann-Karte „Feld in verknüpfter Mappe setzen“ (#1557)', () => {
  it('HU → Fahrzeug: setzt das spätere Datum, ein alter Prüfbericht überschreibt es nicht; Historie am Fahrzeug', async () => {
    const { d, admin, fahrzeug, hu, motor, ereignis, huUebernehmen, neueHu } = await aufbau();
    const auto = await d.mappen.legeMappeAn(
      { typId: fahrzeug.id, werte: { kennzeichen: 'MU-ST 123', hu_faellig: '2027-05-01' } },
      admin.id,
    );
    const a = await huUebernehmen();
    const neu = await neueHu({ fahrzeug: [auto.id], naechste_hu: '2029-05-01' });
    const trocken = await motor.wiedergeben(a.id, neu.id, true);
    assert.match(trocken.schritte.at(-1)!.text!, /Würde in „MU-ST 123“ setzen: HU fällig = 01\.05\.2029/);
    assert.equal((await d.mappen.holeMappe(auto.id)).mappe.werte.hu_faellig, '2027-05-01', 'Trockenlauf ändert nichts');
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: neu.id, typ: hu.id }));
    assert.equal((await d.mappen.holeMappe(auto.id)).mappe.werte.hu_faellig, '2029-05-01');
    const h = (await d.mappenHistorie.historie(auto.id)).find((x) => x.art === 'geaendert');
    assert.equal((h?.daten as { automatisierung?: { name: string } }).automatisierung?.name, 'Nächste HU ans Fahrzeug');
    // Nachgetragener alter Prüfbericht: bleibt beim späteren Datum.
    const alt = await neueHu({ fahrzeug: [auto.id], naechste_hu: '2025-05-01' });
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: alt.id, typ: hu.id }));
    assert.equal((await d.mappen.holeMappe(auto.id)).mappe.werte.hu_faellig, '2029-05-01');
    const [l] = await motor.laeufe(a.id);
    assert.equal(l.zustand, 'abgeschlossen');
    assert.match(l.schritte.at(-1)!.text!, /Unverändert, weil die Bedingung nicht zutrifft: HU fällig/);
  });

  it('mehrfach: jede verknüpfte Mappe; „leer“ nur leere Ziele; Text mit Platzhaltern; leerer Verweis übersprungen', async () => {
    const { d, admin, fahrzeug, motor, ereignis, hu, huUebernehmen, neueHu } = await aufbau();
    const a1 = await d.mappen.legeMappeAn({ typId: fahrzeug.id, werte: { kennzeichen: 'A-1' } }, admin.id);
    const a2 = await d.mappen.legeMappeAn({ typId: fahrzeug.id, werte: { kennzeichen: 'A-2', hu_faellig: '2026-01-01' } }, admin.id);
    const a = await huUebernehmen({ nurWenn: 'leer', werte: { hu_faellig: '{naechste_hu}', notiz: 'HU laut {bericht}' } });
    const m = await neueHu({ fahrzeug: [a1.id, a2.id], naechste_hu: '2028-03-01' });
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: m.id, typ: hu.id }));
    const w1 = (await d.mappen.holeMappe(a1.id)).mappe.werte;
    const w2 = (await d.mappen.holeMappe(a2.id)).mappe.werte;
    assert.equal(w1.hu_faellig, '2028-03-01');
    assert.equal(w1.notiz, 'HU laut P-1');
    assert.equal(w2.hu_faellig, '2026-01-01', '„leer“: vorhandenes Datum bleibt');
    assert.equal(w2.notiz, 'HU laut P-1', 'leeres Feld wird gesetzt');
    const ohne = await neueHu({});
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: ohne.id, typ: hu.id }));
    const [l] = await motor.laeufe(a.id);
    assert.notEqual(l.zustand, 'fehlgeschlagen');
    assert.equal(l.schritte.at(-1)!.zustand, 'uebersprungen');
  });

  it('ohne Recht an der Zielmappe: nichts gesetzt, kein Fehler, der Lauf vermerkt es', async () => {
    const { d, admin, fahrzeug, hu, motor, ereignis, huUebernehmen, neueHu } = await aufbau();
    const rollen = await d.postSystemmappen.listeRollen(true);
    const rolle = (name: string) => rollen.find((r) => r.name === name)!.id;
    // Alle dürfen Fahrzeuge ändern – nur das Systemkonto „Automatisierung“ darf sie bloß lesen.
    await d.berechtigungen.setzeBerechtigungen(
      fahrzeug.id,
      {
        grund: { C: true, R: true, U: true, D: true, P: true },
        regeln: [
          {
            id: 'sk',
            name: 'Systemkonten nur lesen',
            wenn: [{ art: 'rolle', rollen: [rolle('Systemkonto')] }],
            dann: { U: 'entziehen' },
            stopp: false,
          },
        ],
      },
      true,
    );
    const auto = await d.mappen.legeMappeAn(
      { typId: fahrzeug.id, werte: { kennzeichen: 'MU-ST 123', hu_faellig: '2027-05-01' } },
      admin.id,
    );
    const a = await huUebernehmen();
    const m = await neueHu({ fahrzeug: [auto.id], naechste_hu: '2029-05-01' });
    await motor.ereignis(ereignis('mappe.angelegt', { mappe: m.id, typ: hu.id }));
    assert.equal((await d.mappen.holeMappe(auto.id)).mappe.werte.hu_faellig, '2027-05-01');
    const [l] = await motor.laeufe(a.id);
    assert.notEqual(l.zustand, 'fehlgeschlagen', JSON.stringify(l.schritte));
    const s = l.schritte.at(-1)!;
    assert.equal(s.zustand, 'uebersprungen');
    assert.match(s.text!, /1 verknüpfte Mappe nicht geändert: Die Automatisierung darf sie nicht ändern\./);
    assert.doesNotMatch(s.text!, /MU-ST/, 'kein Titel einer Mappe, die sie nicht ändern darf');
  });

  it('Prüfung im Editor: Verweisfeld, Zielfeld, Feldart und „nur, wenn später“', async () => {
    const { motor, hu } = await aufbau();
    const k = await motor.kontext();
    const probleme = (dann: Record<string, unknown>) =>
      automatisierungsProbleme(
        {
          name: 'x',
          beschreibung: '',
          reihenfolge: 0,
          wenn: { art: 'mappe.angelegt', typ: hu.id },
          und: { modus: 'alle', karten: [] },
          sonst: [],
          dann: [{ id: 'k1', art: 'feld_verknuepft', ueber: 'fahrzeug', werte: { hu_faellig: '{naechste_hu}' }, ...dann } as DannKarte],
        },
        k,
      );
    assert.deepEqual(probleme({}), []);
    assert.match(probleme({ ueber: 'bericht' }).join(), /kein Verweisfeld/);
    assert.match(probleme({ ueber: 'gibtsnicht' }).join(), /gibt es im Mappentyp „Hauptuntersuchung“ nicht/);
    assert.match(probleme({ werte: { gibtsnicht: 'x' } }).join(), /„gibtsnicht“ gibt es im Mappentyp „Fahrzeug“ nicht/);
    assert.match(probleme({ werte: { notiz: 'x' }, nurWenn: 'spaeter' }).join(), /nur bei Datum und Zahl/);
    assert.match(probleme({ werte: { hu_faellig: '{bericht}' } }).join(), /Feldarten sind verschieden/);
    assert.deepEqual(probleme({ werte: { notiz: '{naechste_hu}' } }), [], 'in ein Textfeld passt jeder Platzhalter');
  });

  it('nurWenn: immer, leer, später, früher für Datum und Zahl', () => {
    const datum = { typ: 'datum' as const };
    const zahl = { typ: 'zahl' as const };
    assert.equal(nurWennErfuellt(undefined, datum, '2027-01-01', '2026-01-01'), true);
    assert.equal(nurWennErfuellt('leer', datum, '2027-01-01', '2028-01-01'), false);
    assert.equal(nurWennErfuellt('leer', datum, null, '2028-01-01'), true);
    assert.equal(nurWennErfuellt('spaeter', datum, '2027-01-01', '2028-01-01'), true);
    assert.equal(nurWennErfuellt('spaeter', datum, '2027-01-01', '2026-01-01'), false);
    assert.equal(nurWennErfuellt('spaeter', datum, null, '2026-01-01'), true, 'leeres Ziel bekommt jeden Wert');
    assert.equal(nurWennErfuellt('spaeter', datum, '2027-01-01', null), false, 'ein leerer Wert ersetzt nichts');
    assert.equal(nurWennErfuellt('frueher', zahl, 10, 5), true);
    assert.equal(nurWennErfuellt('frueher', zahl, 10, 12), false);
    assert.equal(nurWennErfuellt('spaeter', zahl, 10, 12), true);
  });

  it('Paket: beim Lesen (pakete-pruefen) Verweisfeld, Zielfelder (berechnet) und nur_wenn geprüft', () => {
    const typen = `- schluessel: fahrzeug
  name: Fahrzeug
  felder:
    - { key: kennzeichen, label: Kennzeichen, typ: text }
    - { key: hu_faellig, label: HU fällig, typ: datum }
    - { key: km, label: km, typ: zahl, berechnet: true }
- schluessel: hu
  name: Hauptuntersuchung
  felder:
    - { key: fahrzeug, label: Fahrzeug, typ: referenz, ziel: fahrzeug }
    - { key: naechste_hu, label: Nächste HU, typ: datum }
`;
    const gruende = (karte: string, wenn = '{ art: mappe.angelegt, typ: hu }') => {
      const dateien = new Map([
        [
          'manifest.yaml',
          Buffer.from(
            'schema: 1\nid: fahrzeuge_test\nname: Fahrzeuge\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Markus, github: markus }\nlizenz: MIT\ndms: ">=0.300.0"\ninhalt: { mappentypen: mappentypen.yaml, automatisierungen: automatisierungen.yaml }\n',
          ),
        ],
        ['mappentypen.yaml', Buffer.from(typen)],
        [
          'automatisierungen.yaml',
          Buffer.from(`- schluessel: hu_ans_fahrzeug\n  name: HU ans Fahrzeug\n  wenn: ${wenn}\n  dann:\n    - ${karte}\n`),
        ],
      ]);
      try {
        liesPaket(dateien);
        return [];
      } catch (e) {
        // Nur die Gründe der Automatisierung (Register und Paket-Code sind hier nicht Thema).
        return ((e as Fachfehler).details as { gruende: string[] }).gruende.filter((g) => g.startsWith('automatisierungen['));
      }
    };
    const karte = (x = '') => `{ art: feld_verknuepft, ueber: fahrzeug, werte: { hu_faellig: "{naechste_hu}" }${x} }`;
    assert.deepEqual(gruende(karte(', nur_wenn: spaeter')), []);
    assert.match(gruende(karte(', nur_wenn: irgendwann')).join(), /nur_wenn „irgendwann“/);
    assert.match(gruende('{ art: feld_verknuepft, ueber: fahrzeug, werte: { km: 5 } }').join(), /„km“ setzt keine Automatisierung/);
    assert.match(
      gruende('{ art: feld_verknuepft, ueber: fahrzeug, werte: { gibtsnicht: 1 } }').join(),
      /„gibtsnicht“ gibt es im Mappentyp „Fahrzeug“ nicht/,
    );
    assert.match(gruende('{ art: feld_verknuepft, ueber: naechste_hu, werte: { hu_faellig: 1 } }').join(), /kein Verweisfeld/);
    assert.match(gruende(karte(), '{ art: mappe.angelegt }').join(), /braucht wenn\.typ/);
  });
});
