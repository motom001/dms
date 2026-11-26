/**
 * Wert neben der Bezeichnung eines Felds (#1693): „Fällig am“, „Netto“, „Kontoauszug 1/2021“. Texte erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feldWoerter, vorschlaegeAus } from '../src/erkennung';
import type { Feld } from '../src/model';

const f = (key: string, label: string, typ: Feld['typ'], erkennung: Feld['erkennung'] = {}): Feld => ({ key, label, typ, erkennung });

const RECHNUNG = {
  name: 'Rechnung',
  felder: [
    f('betrag', 'Betrag', 'betrag', { art: 'betrag' }),
    f('datum', 'Rechnungsdatum', 'datum', { art: 'datum' }),
    f('faellig_am', 'Fällig am', 'datum'),
    f('netto_gesamt', 'Netto gesamt', 'betrag'),
    f('ust_gesamt', 'Umsatzsteuer gesamt', 'betrag'),
    f('zahlungseingang_am', 'Zahlungseingang am', 'datum'),
  ],
};

const TEXT = `Beispiel Handwerk GmbH · Werkstraße 1 · 01067 Musterstadt
Musterstadt, 02.12.2026
Rechnung R-2026-0815
Nettobetrag 100,00 €
MwSt 19 % 19,00 €
Gesamtbetrag 119,00 €
Bitte zahlbar bis 16.12.2026 ohne Abzug.`;

describe('Wert neben der Bezeichnung (#1693)', () => {
  it('Wörter des Felds: ohne Füllwörter, mit gleichbedeutenden', () => {
    assert.deepEqual(feldWoerter({ key: 'faellig_am', label: 'Fällig am' }).includes('zahlbar'), true);
    assert.equal(feldWoerter({ key: 'netto_gesamt', label: 'Netto gesamt' }).includes('gesamt'), false);
    assert.deepEqual(feldWoerter({ key: 'summe', label: 'Summe' }), []);
  });

  it('Fälligkeit, Netto und Steuer aus ihrer Zeile; Briefdatum und Gesamtbetrag bleiben beim ersten Feld', () => {
    const v = vorschlaegeAus(RECHNUNG, TEXT);
    assert.equal(v.datum?.wert, '2026-12-02');
    assert.equal(v.faellig_am?.wert, '2026-12-16');
    assert.equal(v.faellig_am?.sicherheit, 'mittel');
    assert.deepEqual(v.betrag?.wert, { betrag: 119, waehrung: 'EUR' });
    assert.deepEqual(v.netto_gesamt?.wert, { betrag: 100, waehrung: 'EUR' });
    assert.deepEqual(v.ust_gesamt?.wert, { betrag: 19, waehrung: 'EUR' });
  });

  it('ohne eigene Bezeichnung im Text: kein Bruttobetrag für „Netto“, Briefdatum nur noch unsicher', () => {
    const v = vorschlaegeAus(RECHNUNG, 'Musterstadt, 02.12.2026\nRechnung\nGesamtbetrag 119,00 €');
    assert.equal(v.netto_gesamt, undefined);
    assert.equal(v.faellig_am?.wert, '2026-12-02');
    assert.equal(v.faellig_am?.sicherheit, 'niedrig');
    assert.equal(v.datum?.sicherheit === 'niedrig', false);
  });

  it('Feld „Nummer“: Nummer hinter dem Namen des Typs', () => {
    const typ = { name: 'Kontoauszug', felder: [f('nummer', 'Nummer', 'text', { art: 'nummer' })] };
    assert.equal(vorschlaegeAus(typ, '**Kontoauszug 1/2021 vom 01.01.2021 bis 31.01.2021**').nummer?.wert, '1/2021');
    assert.equal(vorschlaegeAus({ felder: typ.felder }, 'Kontoauszug 1/2021').nummer, undefined, 'ohne Namen wie bisher');
  });
});
