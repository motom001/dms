/**
 * Kontrast der Designs (#1210, Kriterium 7): Grün steht auch auf seiner zarten Fläche (Chip „gut“, Ergebnis am Knopf).
 * Vorher rechnete `palette()` Grün nur gegen `--flaeche` lesbar – dunkel stand der Chip „gut“ bei 3,8:1. Jetzt gilt
 * 4,5:1 (hoher Kontrast 7:1) gegen beide, für das Standard-Grün und für eigene Sekundärfarben.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

const g = globalThis as Record<string, unknown>;
g.location ??= new URL('http://127.0.0.1/');
// Über die Adresse geladen (nicht als Import): Die Typprüfung des Servers kennt die Typen des Browsers nicht.
const { palette, kontrast } = await import(new URL('../../web/src/design.ts', import.meta.url).href) as {
  palette(grundlage: 'hell' | 'dunkel' | 'kontrast', primaer: string, sekundaer: string): Record<string, string>;
  kontrast(a: string, b: string): number;
};

test('Grün lesbar auf Fläche und zarter Fläche – hell, dunkel, hoher Kontrast, auch mit eigener Sekundärfarbe', () => {
  for (const sekundaer of ['#2B7656', '#6CC39B', '#0B7285', '#9C36B5']) {
    for (const grundlage of ['hell', 'dunkel', 'kontrast'] as const) {
      const p = palette(grundlage, '#1F4E79', sekundaer);
      const ziel = grundlage === 'kontrast' ? 7 : 4.5;
      for (const hinter of ['flaeche', 'gruen-zart']) {
        const k = kontrast(p.gruen, p[hinter]);
        assert.ok(k >= ziel, `${grundlage}, ${sekundaer}: --gruen auf --${hinter} nur ${k.toFixed(2)}:1`);
      }
    }
  }
});

test('Ablago-Grün im Dunkeln wie in tokens.css, nicht grau aufgehellt', () => {
  assert.equal(palette('dunkel', '#1F4E79', '#2B7656').gruen.toUpperCase(), '#6CC39B');
  assert.equal(palette('hell', '#1F4E79', '#2B7656').gruen.toUpperCase(), '#2B7656');
});
