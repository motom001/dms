/**
 * Baustein Menü, Lage der offenen Liste (#1488): unten, wenn dort Platz ist – der Platz des Assistenten unten rechts zählt
 * nicht mit –, sonst oben; passt sie nirgends, auf der Seite mit mehr Platz und mit eigener Höchsthöhe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aufklapplage } from '../src/bausteine/menue/lage';

const fenster = { breite: 1366, hoehe: 900 };
const knopf = (top: number, right = 1300) => ({ top, bottom: top + 28, left: right - 28, right });

describe('Menü: Lage der Liste (#1488)', () => {
  it('Platz unten: klappt nach unten, rechtsbündig mit dem Knopf', () => {
    const l = aufklapplage(knopf(100), 300, fenster, { frei: 96 });
    assert.equal(l.oben, false);
    assert.equal(l.top, 132);
    assert.equal(l.right, 66);
    assert.equal(l.maxHoehe, 900 - 128 - 4 - 8 - 96);
  });

  it('der Platz des Assistenten zählt nicht: knapp unten, aber im Bereich des Assistenten → nach oben', () => {
    const k = knopf(500);
    assert.equal(aufklapplage(k, 300, fenster).oben, false, 'ohne Assistent passt es nach unten');
    const l = aufklapplage(k, 300, fenster, { frei: 96 });
    assert.equal(l.oben, true);
    assert.equal(l.bottom, 900 - 500 + 4);
    assert.equal(l.maxHoehe, 500 - 4 - 8);
  });

  it('passt nirgends ganz: die größere Seite, die Liste rollt in sich', () => {
    const l = aufklapplage(knopf(300), 1200, fenster, { frei: 96 });
    assert.equal(l.oben, false, 'unten ist mehr Platz');
    assert.ok(l.maxHoehe < 1200);
  });

  it('linksbündig für Menüs links („+ Neu“)', () => {
    const l = aufklapplage({ top: 10, bottom: 40, left: 200, right: 280 }, 200, fenster, { links: true });
    assert.equal(l.left, 200);
    assert.equal(l.right, undefined);
  });
});
