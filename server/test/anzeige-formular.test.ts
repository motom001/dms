/**
 * Anzeige-Bedingungen im Mappenformular (#1033), Oberfläche: Die Auswertung aus den rohen Eingaben reagiert sofort,
 * zählt die Werte für die ruhige Zeile und kommt zum selben Ergebnis wie der Server mit den gespeicherten Werten.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anzeigestand, pruefeMitAnzeige } from '../../shared/src/anzeige';
import type { Mappentyp } from '../../shared/src/model';
import { bereinigeTyp } from '../src/mappentypen';
import type { Anzeigestand } from '../../shared/src/anzeige';
import type { Merkmale } from '../../shared/src/merkmale';
import type { Werte } from '../../shared/src/model';

// Module der Oberfläche zur Laufzeit laden (wie die Tests der Bausteine): Der Typcheck des Servers kennt kein DOM.
const WEB = new URL('../../web/src/', import.meta.url).href;
type Roh = Record<string, unknown>;
const { anzahlWerte, anzeigeImFormular } = await import(`${WEB}ablage/anzeige.ts`) as {
  anzeigeImFormular(typ: Mappentyp, roh: Roh, k: { merkmale?: Merkmale; bekannt: Record<string, { typId: string }> }): Anzeigestand;
  anzahlWerte(typ: Mappentyp, keys: string[], roh: Roh): number;
};
const { rohAusWerten, standardRoh, werteAusRoh } = await import(`${WEB}werte.ts`) as {
  rohAusWerten(typ: Mappentyp, w: Werte): Roh; standardRoh(typ: Mappentyp): Roh; werteAusRoh(typ: Mappentyp, r: Roh): Werte;
};

const MIETE = { modus: 'alle', bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'art', op: 'einerVon', wert: { art: 'fest', wert: ['Miete'] } } }] };
const typ = { ...bereinigeTyp({
  name: 'Vertrag',
  felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true },
    { key: 'art', label: 'Vertragsart', typ: 'auswahl', optionen: ['Miete', 'Strom'] },
    { key: 'kaltmiete', label: 'Kaltmiete', typ: 'betrag', pflicht: true },
    { key: 'kaution', label: 'Kaution', typ: 'betrag' },
    { key: 'betrifft', label: 'betrifft', typ: 'referenz', zielTyp: '*', anzeigen: { modus: 'alle', bedingungen: [{ art: 'merkmal', merkmal: 'beruflich', nicht: true }] } },
    { key: 'notiz', label: 'Notiz', typ: 'langtext' },
  ],
  register: [{ key: 'vertrag', name: 'Vertrag', art: 'felder', felder: ['name', 'art', 'kaltmiete', 'kaution', 'betrifft', 'notiz'], abschnitte: [{ vor: 'kaltmiete', titel: 'Miete', anzeigen: MIETE }, { vor: 'notiz', titel: 'Weiteres' }] }],
}), id: 'vertrag', erstellt: '', geaendert: '' } as Mappentyp;

describe('Anzeige-Bedingungen im Formular (#1033)', () => {
  it('reagiert sofort: Art gewählt → Abschnitt erscheint; abgewählt → ausgeblendet, Werte gezählt', () => {
    let roh = standardRoh(typ);
    const k = { bekannt: {} };
    assert.deepEqual(anzeigeImFormular(typ, roh, k).abschnitte.map((a) => a.abschnitt.titel), ['Miete']);
    roh = { ...roh, art: 'Miete' };
    assert.deepEqual(anzeigeImFormular(typ, roh, k).abschnitte, [], 'Abschnitt Miete erscheint');
    roh = { ...roh, kaltmiete: { betrag: '950', waehrung: 'EUR' }, kaution: { betrag: '2850,00', waehrung: 'EUR' } };
    roh = { ...roh, art: 'Strom' };
    const s = anzeigeImFormular(typ, roh, k);
    assert.deepEqual(s.abschnitte[0].felder, ['kaltmiete', 'kaution', 'betrifft']);
    assert.equal(anzahlWerte(typ, s.abschnitte[0].felder, roh), 2, '„Abschnitt Miete ist ausgeblendet – 2 Werte bleiben gespeichert“');
    assert.ok(!s.verborgen.has('notiz'), 'der nächste Abschnitt erscheint wieder normal');
    // Ja/Nein zählt nur mit „ja“ – „nein“ ist die Vorgabe, kein eingetragener Wert.
    const mitJaNein = { ...typ, felder: [...typ.felder, { key: 'moebliert', label: 'Möbliert', typ: 'janein' as const }] };
    assert.equal(anzahlWerte(mitJaNein, ['moebliert'], { moebliert: false }), 0);
    assert.equal(anzahlWerte(mitJaNein, ['moebliert'], { moebliert: true }), 1);
    // Die Werte stehen weiter in der Eingabe – nichts wird geleert.
    assert.equal(werteAusRoh(typ, roh).kaltmiete !== null, true);
  });

  it('gleiche Auswertung wie der Server (gespeicherte Werte) – auch Pflicht und Merkmal', () => {
    const werte = { name: 'Wohnung', art: 'Miete', kaltmiete: null, kaution: { betrag: 2850, waehrung: 'EUR' }, betrifft: [], notiz: null };
    const roh = rohAusWerten(typ, werte);
    for (const merkmale of [{ beruflich: false }, { beruflich: true }]) {
      const web = anzeigeImFormular(typ, roh, { merkmale, bekannt: {} });
      const server = anzeigestand(typ, werte, { merkmale });
      assert.deepEqual([...web.verborgen].sort(), [...server.verborgen].sort());
    }
    const ctx = { typVon: () => undefined, doppelt: () => undefined };
    assert.deepEqual(Object.keys(pruefeMitAnzeige(typ, werteAusRoh(typ, roh), ctx).felder), ['kaltmiete']);
    assert.deepEqual(Object.keys(pruefeMitAnzeige(typ, werteAusRoh(typ, { ...roh, art: 'Strom' }), ctx).felder), []);
  });
});
