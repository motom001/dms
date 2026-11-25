/**
 * Baustein Menü, Lage der offenen Liste (#1488): unten, wenn dort Platz ist – der Platz des Assistenten unten rechts zählt
 * nicht mit –, sonst oben; passt sie nirgends, auf der Seite mit mehr Platz und mit eigener Höchsthöhe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aufklapplage, legeFest } from '../src/bausteine/menue/lage';

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

  // #1556: Datumsfeld ganz rechts – der Kalender (linksbündig bevorzugt) ist breiter als der Platz bis zum Rand.
  it('Feld am rechten Rand: linksbündig passt nicht, also rechtsbündig mit dem Feld', () => {
    const feld = { top: 300, bottom: 336, left: 1150, right: 1340 };
    const l = aufklapplage(feld, 330, fenster, { links: true, breite: 320 });
    assert.equal(l.left, undefined);
    assert.equal(l.right, 1366 - 1340, 'rechte Kante des Kalenders an der rechten Kante des Felds');
  });

  it('Feld links: linksbündig, wenn der Kalender dort ganz ins Fenster passt', () => {
    const l = aufklapplage({ top: 300, bottom: 336, left: 240, right: 520 }, 330, fenster, { links: true, breite: 320 });
    assert.equal(l.left, 240);
    assert.equal(l.right, undefined);
  });

  it('passt an keiner Kante des Felds: 8 px Abstand zum Fensterrand', () => {
    const schmal = { breite: 400, hoehe: 800 };
    const l = aufklapplage({ top: 100, bottom: 136, left: 150, right: 250 }, 330, schmal, { links: true, breite: 320 });
    assert.equal(l.left, 400 - 8 - 320);
    assert.equal(l.right, undefined);
  });

  it('Menü rechtsbündig, links zu wenig Platz: linksbündig mit dem Knopf', () => {
    const l = aufklapplage({ top: 100, bottom: 128, left: 20, right: 48 }, 200, fenster, { breite: 240 });
    assert.equal(l.left, 20);
    assert.equal(l.right, undefined);
  });
});

/** Liste und Feld ohne Browser: `legeFest` misst die Liste bei 0/0 und das Feld, dann setzt es top/left/maxHeight. */
function attrappe(hoehe: number, breite: number, feld: { top: number; bottom: number; left: number; right: number }) {
  const liste = {
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({ top: 0, left: 0, height: hoehe, width: breite }),
  };
  return { liste: liste as unknown as HTMLElement, feld: { getBoundingClientRect: () => feld } as unknown as HTMLElement };
}

// #1670: Die Vorschläge der Mehrfachauswahl nutzen dieselbe Regel – mit höchstens 280 px Höhe.
describe('Mehrfachauswahl: Lage der Vorschläge (#1670)', () => {
  const g = globalThis as { innerWidth?: number; innerHeight?: number };
  g.innerWidth = 1366;
  g.innerHeight = 900;

  it('Verweisfeld am unteren Rand: nach oben, höchstens 280 px, ganz im Fenster', () => {
    const { liste, feld } = attrappe(700, 400, { top: 800, bottom: 836, left: 300, right: 700 });
    const l = legeFest(liste, feld, true, 280);
    assert.equal(l.oben, true);
    assert.equal(liste.style.maxHeight, '280px');
    assert.equal(liste.style.top, `${800 - 4 - 280}px`, 'Unterkante 4 px über dem Feld');
    assert.equal(liste.style.left, '300px');
    assert.equal(liste.dataset.oben, 'ja');
  });

  it('Feld oben: weiter nach unten; wenig Inhalt bleibt klein', () => {
    const { liste, feld } = attrappe(120, 400, { top: 100, bottom: 136, left: 300, right: 700 });
    const l = legeFest(liste, feld, true, 280);
    assert.equal(l.oben, false);
    assert.equal(liste.style.top, '140px');
    assert.equal(liste.style.maxHeight, '280px');
  });

  it('am Handy (wenig Platz oben wie unten): auf der größeren Seite, so hoch wie der Platz', () => {
    g.innerWidth = 390;
    g.innerHeight = 400;
    const { liste, feld } = attrappe(700, 358, { top: 200, bottom: 244, left: 16, right: 374 });
    const l = legeFest(liste, feld, true, 280);
    assert.equal(l.oben, true, 'oben ist mehr Platz');
    assert.equal(l.maxHoehe, 200 - 4 - 8);
    assert.equal(liste.style.top, '8px', 'nicht über den oberen Rand');
    g.innerWidth = 1366;
    g.innerHeight = 900;
  });

  it('ohne Höchstwert wie bisher (Menüs): die Liste darf den ganzen Platz nehmen', () => {
    const { liste, feld } = attrappe(700, 400, { top: 800, bottom: 836, left: 300, right: 700 });
    assert.equal(legeFest(liste, feld, true).maxHoehe, 800 - 4 - 8);
  });
});
