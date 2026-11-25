/**
 * Baustein Mehrfachauswahl, Lage der Vorschläge (#1670): Regel der Menüs im sichtbaren Teil der Spalte – unten, wenn dort
 * Platz ist, sonst oben; höchstens 280 px, nie über den sichtbaren Rand.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { vorschlagLage } from '../src/bausteine/mehrfachauswahl/lage';

const spalte = { top: 108, bottom: 900 };
const feld = (top: number) => ({ top, bottom: top + 36 });

describe('Mehrfachauswahl: Lage der Vorschläge (#1670)', () => {
  it('Verweisfeld unten in der Mappe: nach oben, höchstens 280 px', () => {
    assert.deepEqual(vorschlagLage(feld(820), spalte, 700), { oben: true, maxHoehe: 280 });
  });

  it('Feld oben: weiter nach unten, so hoch wie der Platz erlaubt', () => {
    assert.deepEqual(vorschlagLage(feld(150), spalte, 700), { oben: false, maxHoehe: 280 });
    assert.equal(vorschlagLage(feld(150), spalte, 120).oben, false);
  });

  it('gerechnet im sichtbaren Teil der Spalte: unter der Kopfzeile ist kein Platz', () => {
    // 200 px über dem Feld im Fenster, aber nur 92 px unter der Kopfzeile – unten ist mehr.
    const l = vorschlagLage(feld(200), { top: 108, bottom: 500 }, 700);
    assert.equal(l.oben, false);
    assert.equal(l.maxHoehe, 500 - 236 - 4 - 8);
  });

  it('am Handy mit wenig Platz: die größere Seite, Liste rollt in sich', () => {
    const l = vorschlagLage(feld(300), { top: 64, bottom: 500 }, 700);
    assert.equal(l.oben, true);
    assert.equal(l.maxHoehe, 300 - 64 - 4 - 8);
  });

  it('der Platz des Assistenten unten zählt nicht', () => {
    assert.equal(vorschlagLage(feld(500), spalte, 280).oben, false);
    assert.equal(vorschlagLage(feld(500), spalte, 280, 96).oben, true);
  });
});
