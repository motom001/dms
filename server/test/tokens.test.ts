/**
 * Farben aus Tokens (#966): Hell und dunkel stehen nur in web/src/tokens.css. Hier geprüft:
 * - jeder Token hat einen hellen Wert, der Dunkelblock führt keine neuen Namen ein,
 * - jede Variable, die die Oberfläche als Farbe benutzt, ist ein Token (oder kommt aus dem Design bzw. ist lokal),
 * - Schrift auf ihren Flächen erreicht hell und dunkel mindestens 4,5:1 (WCAG AA), so wie axe es prüft.
 * Feste Farben außerhalb von tokens.css verhindert .github/werkzeuge/farben-pruefen.mjs.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { tokenPaletten, variablen } from '../../web/src/tokens';

const WEB = join(import.meta.dirname, '../../web/src');
const roh = readFileSync(join(WEB, 'tokens.css'), 'utf8');
const { hell, dunkel } = tokenPaletten(roh);

/** Farbe als [r, g, b, a] – #RRGGBB oder rgb(r g b / a). */
function farbe(w: string): number[] {
  if (/^#[0-9a-f]{6}$/i.test(w)) return [1, 3, 5].map((i) => parseInt(w.slice(i, i + 2), 16)).concat(1);
  const m = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(w);
  if (!m) throw new Error(`Farbe nicht lesbar: ${w}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}
/** Halbtransparente Farbe auf einen deckenden Grund legen. */
const auf = (oben: number[], unten: number[]) => oben.slice(0, 3).map((v, i) => v * oben[3] + unten[i] * (1 - oben[3]));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('tokens.css: hell vollständig, dunkel nur mit bekannten Namen', () => {
  const nurDunkel = variablen(roh.replace(/\/\*[\s\S]*?\*\//g, '').split('@media (prefers-color-scheme: dark)')[1]);
  assert.deepEqual(Object.keys(nurDunkel).filter((k) => !(k in hell)), []);
  assert.ok(Object.keys(nurDunkel).length >= 20, 'Dunkelblock gefunden');
});

test('jede benutzte Farb-Variable ist ein Token, kommt aus dem Design oder ist lokal', () => {
  // Aus dem Design (design.ts, palette): abgeleitete Töne für eigene Primär-/Sekundärfarben.
  const ausDesign = new Set(['akzent-stark', 'gruen-tinte']);
  // Lokal gesetzt: Skala und Tiefe, Feldfarbe beim Übernehmen, Messpanel; Rückfall auf etwas anderes.
  const lokal = /^(skala|tiefe|ue-f|m-[\w-]+|text|auswahl)$/;
  const css = ['basis.css', 'styles.css'].map((d) => readFileSync(join(WEB, d), 'utf8')).join('\n');
  const fehlend = [...new Set([...css.matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]))]
    .filter((n) => !(n in hell) && !ausDesign.has(n) && !lokal.test(n));
  assert.deepEqual(fehlend, []);
});

test('Schrift auf Flächen: mindestens 4,5:1, hell und dunkel', () => {
  const paare: [string, string][] = [
    ['tinte', 'flaeche'], ['tinte', 'grund'], ['leise', 'flaeche'], ['leise', 'grund'], ['akzent', 'flaeche'],
    ['akzent-tinte', 'akzent'], ['schlecht', 'flaeche'], ['schlecht-tinte', 'schlecht'], ['warn', 'flaeche'],
    ['warn-tinte', 'warn'], ['warn', 'warn-tinte'], ['verwaltung-tinte', 'verwaltung'], ['verwaltung', 'verwaltung-tinte'],
    ['gruen', 'flaeche'], ['bildmarke-tinte', 'bildmarke'],
    // Status-Flächen mit ihrer Schrift (#1210): Chip „gut“, Ergebnis am Knopf, Hinweise; leise Schrift darauf.
    ['gruen', 'gruen-zart'], ['warn', 'warn-zart'], ['schlecht', 'schlecht-zart'], ['leise', 'warn-zart'], ['leise', 'senke'], ['schlecht', 'senke'],
    // Nummern auf den Markierungen beim Übernehmen (#1017).
    ...[1, 2, 3, 4, 5, 6].map((i): [string, string] => ['markierung-tinte', `markierung-${i}`]),
  ];
  for (const [name, p] of [['hell', hell], ['dunkel', dunkel]] as const) {
    for (const [schrift, flaeche] of paare) {
      // Halbtransparente Flächen (Bildmarke) liegen im ungünstigsten Fall auf weißem Papier.
      const grund = auf(farbe(p[flaeche]), farbe(p.papier));
      const k = kontrast(auf(farbe(p[schrift]), grund), grund);
      assert.ok(k >= 4.5, `${name}: --${schrift} auf --${flaeche} nur ${k.toFixed(2)}:1`);
    }
  }
});

/** Werte für hohen Kontrast aus design.ts (const KONTRAST) – als Text gelesen, das Modul braucht den Browser. */
function kontrastPalette() {
  const block = /const KONTRAST: Palette = \{([\s\S]*?)\};/.exec(readFileSync(join(WEB, 'design.ts'), 'utf8'))?.[1] ?? '';
  const p = Object.fromEntries([...block.matchAll(/'?([\w-]+)'?: '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
  assert.ok(Object.keys(p).length >= 8, 'KONTRAST in design.ts gefunden');
  return p;
}

test('Rand der Eingaben: mindestens 3:1 gegen Fläche und Senke, hell, dunkel und hoher Kontrast (#1026)', () => {
  const paletten = { hell, dunkel, kontrast: { ...hell, ...kontrastPalette() } };
  for (const [name, p] of Object.entries(paletten)) {
    for (const flaeche of ['flaeche', 'senke']) {
      const k = kontrast(farbe(p['rand-eingabe']), farbe(p[flaeche]));
      assert.ok(k >= 3, `${name}: --rand-eingabe auf --${flaeche} nur ${k.toFixed(2)}:1`);
    }
    // Hover (--leise, Feld.module.css) bleibt sichtbar stärker als der Ruhezustand.
    assert.ok(kontrast(farbe(p.leise), farbe(p.flaeche)) > kontrast(farbe(p['rand-eingabe']), farbe(p.flaeche)) * 1.5, `${name}: Hover nicht deutlich stärker als der Rand`);
  }
  // Trennlinien und Kartenränder bleiben, wie sie sind – es geht nur um Eingaben.
  assert.equal(hell['linie-stark'], '#C3CAD4');
  assert.equal(dunkel['linie-stark'], '#3A4452');
  // Eingaben nehmen den Rand aus dem Token.
  const basis = readFileSync(join(WEB, 'basis.css'), 'utf8');
  assert.match(basis, /^input, select, textarea \{[^}]*border: 1px solid var\(--rand-eingabe\)/m);
});
