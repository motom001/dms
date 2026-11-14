// Tests für farben-pruefen.mjs (#966): node --test .github/werkzeuge/farben-pruefen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { farbenInCss, farbenInTs, pruefe, zuLangeCss } from './farben-pruefen.mjs';

const werte = (funde) => funde.map((f) => f.wert);

test('findet Hex, Farbfunktionen und benannte Farben in CSS-Werten', () => {
  const css = '.a { color: #fff; background: rgb(0 0 0 / .35); }\n.b { border: 1px solid White; box-shadow: 0 1px 2px hsla(0, 0%, 0%, .2); }';
  assert.deepEqual(werte(farbenInCss(css)), ['#fff', 'rgb(0 0 0 / .35)', 'White', 'hsla(0, 0%, 0%, .2)']);
  assert.deepEqual(farbenInCss(css).map((f) => f.zeile), [1, 1, 2, 2]);
});

test('Tokens, Schlüsselwörter, Eigenschaftsnamen und Selektoren sind keine festen Farben', () => {
  const css = [
    '.a:hover { color: var(--tinte); background: transparent; border-color: currentColor; }',
    '.b { white-space: nowrap; fill: inherit; outline: none; }',
    '#kopf { background: color-mix(in srgb, var(--akzent) 12%, transparent); }',
    '/* Ablago-Blau #1F4E79 steht nur im Kommentar */',
    '.c { background: url("data:image/svg+xml,%3Csvg fill=\'white\'%3E"); }',
    '.d { grid-template-areas: "red"; }',
  ].join('\n');
  assert.deepEqual(farbenInCss(css), []);
});

test('Ausnahme mit Begründung in der Zeile', () => {
  assert.deepEqual(farbenInCss('.p { color: #000; } /* farbe-erlaubt: Druck */'), []);
  assert.equal(farbenInCss('.p { color: #000; } /* farbe-erlaubt: */').length, 1, 'ohne Grund zählt die Ausnahme nicht');
});

test('Farben in TypeScript nur als ganze Zeichenkette', () => {
  const ts = "const a = '#1F4E79';\n<rect fill=\"#fff\" />\nconst b = `rgb(0 0 0)`;\nconst c = 'Fehler #12 in Zeile';\nconst d = '#fff'; // farbe-erlaubt: Beispielbeleg";
  assert.deepEqual(werte(farbenInTs(ts)), ['#1F4E79', '#fff', 'rgb(0 0 0)']);
});

test('prüft einen Ordner und lässt Ausnahmedateien aus', () => {
  const dir = mkdtempSync(join(tmpdir(), 'farben-'));
  mkdirSync(join(dir, 'unter'));
  writeFileSync(join(dir, 'tokens.css'), ':root { --a: #fff; }');
  writeFileSync(join(dir, 'styles.css'), '.a { color: var(--a); }\n.b { color: #123456; }');
  writeFileSync(join(dir, 'unter', 'X.tsx'), "export const x = <b style={{ color: '#abc' }} />;");
  const funde = pruefe(dir, { [relative(process.cwd(), join(dir, 'tokens.css'))]: 'Tokens' });
  assert.deepEqual(funde.map((f) => [f.datei.split('/').pop(), f.zeile, f.wert]).sort(), [['X.tsx', 1, '#abc'], ['styles.css', 2, '#123456']]);
});

test('der Bestand in web/src ist frei von festen Farben', () => {
  assert.deepEqual(pruefe(), []);
});

test('CSS-Dateien über der Zeilengrenze werden gemeldet (#1234)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zeilen-'));
  writeFileSync(join(dir, 'kurz.css'), '.a { color: var(--a); }\n'.repeat(3));
  writeFileSync(join(dir, 'lang.css'), '.a { color: var(--a); }\n'.repeat(6));
  // Leerzeilen und Kommentare zählen nicht mit.
  writeFileSync(join(dir, 'erklaert.css'), `/* Erklärung\n   über zwei Zeilen */\n\n${'.a { color: var(--a); }\n'.repeat(5)}`);
  assert.deepEqual(zuLangeCss(dir, 5).map((f) => [f.datei.split('/').pop(), f.zeilen]), [['lang.css', 6]]);
});

test('der Bestand in web/src hält die Zeilengrenze je CSS-Datei ein', () => {
  assert.deepEqual(zuLangeCss(), []);
});
