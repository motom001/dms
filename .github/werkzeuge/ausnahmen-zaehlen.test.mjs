// Tests für ausnahmen-zaehlen.mjs (#899): node --test .github/werkzeuge/ausnahmen-zaehlen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jeRegel, neueRegeln, ohneRegeln, vergleiche, zaehleEslint } from './ausnahmen-zaehlen.mjs';

const vorher = { 'a.ts': { complexity: { count: 2 }, 'max-params': { count: 1 } }, 'b.ts': { complexity: { count: 1 } } };

test('zählt die Summe der Einträge über alle Dateien und Regeln', () => {
  assert.equal(zaehleEslint(vorher), 4);
  assert.equal(zaehleEslint({}), 0);
  assert.deepEqual(jeRegel(vorher), { complexity: 3, 'max-params': 1 });
});

test('umtragen ja: dieselbe Summe in anderen Dateien ist erlaubt', () => {
  const umgezogen = { 'neu/a.ts': { complexity: { count: 3 }, 'max-params': { count: 1 } } };
  assert.equal(vergleiche(zaehleEslint(vorher), zaehleEslint(umgezogen)).ok, true);
});

test('hinzufügen nein: mehr Einträge schlagen fehl, weniger sind gut', () => {
  assert.equal(vergleiche(4, 5).ok, false);
  assert.match(vergleiche(4, 5).text, /\+1/);
  assert.equal(vergleiche(4, 3).ok, true);
  assert.equal(vergleiche(4, 4).ok, true);
});

test('ohne Datei in der Basis gilt der jetzige Stand als Ausgangspunkt', () => {
  assert.equal(vergleiche(null, 99).ok, true);
});

test('neue Regel (#968): eingefrorener Bestand zählt nicht, wenn die Regel in eslint.config.js neu dazukommt', () => {
  const jetzt = { ...vorher, 'c.tsx': { 'ablago/bausteine': { count: 40 } } };
  const alt = "rules: { complexity: ['error', 20] }";
  const neu = `${alt}, rules: { 'ablago/bausteine': 'error' }`;
  assert.deepEqual(neueRegeln(vorher, jetzt, alt, neu), ['ablago/bausteine']);
  assert.equal(zaehleEslint(ohneRegeln(jetzt, ['ablago/bausteine'])), 4);
  // Ohne neue Nennung in der Konfiguration ist es keine neue Regel – dann zählt der Bestand mit und schlägt fehl.
  assert.deepEqual(neueRegeln(vorher, jetzt, neu, neu), []);
  assert.deepEqual(neueRegeln(vorher, jetzt, alt, alt), []);
  // Eine Regel mit Bestand in der Basis ist nie neu, auch wenn sie in der Konfiguration neu genannt wird.
  assert.deepEqual(neueRegeln(vorher, { 'a.ts': { complexity: { count: 9 } } }, '', "'complexity'"), []);
});
