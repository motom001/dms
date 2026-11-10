// Tests für fachordner-pruefen.mjs (#1072): node --test .github/werkzeuge/fachordner-pruefen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pruefe } from './fachordner-pruefen.mjs';

function wurzel(ordner) {
  const w = mkdtempSync(join(tmpdir(), 'fachordner-'));
  for (const [name, dateien] of Object.entries(ordner)) {
    mkdirSync(join(w, name));
    for (const d of dateien) writeFileSync(join(w, name, d), '');
  }
  writeFileSync(join(w, 'dienst.ts'), '');
  return w;
}

test('Fachordner mit Dienst, index.ts und README.md ist in Ordnung', () => {
  assert.deepEqual(pruefe(wurzel({ zugriff: ['zugriff.dienst.ts', 'index.ts', 'README.md'] })), []);
});

test('meldet fehlende index.ts und README.md je Ordner', () => {
  const w = wurzel({ suche: ['suche.dienst.ts', 'suche.routen.ts'], mappen: ['mappen.dienst.ts', 'index.ts'] });
  const funde = pruefe(w).map((f) => ({ ...f, ordner: relative(w, f.ordner) })).sort((a, b) => a.ordner.localeCompare(b.ordner));
  assert.deepEqual(funde, [{ ordner: 'mappen', fehlt: ['README.md'] }, { ordner: 'suche', fehlt: ['index.ts', 'README.md'] }]);
});

test('Ordner ohne Dienst (nur Routen, Abläufe, Technik) brauchen nichts', () => {
  assert.deepEqual(pruefe(wurzel({ post: ['post.routen.ts'], systemausstattung: ['systemausstattung.ablauf.ts'], pdf: ['laden.ts'] })), []);
});

test('der Bestand ist vollständig', () => {
  assert.deepEqual(pruefe(), []);
});
