// Tests für knip-pruefen.mjs (#1286): node --test .github/werkzeuge/knip-pruefen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestandAus, funde, vergleiche, zaehleKnip } from './knip-pruefen.mjs';

const leer = {
  files: [],
  dependencies: [],
  devDependencies: [],
  unlisted: [],
  binaries: [],
  unresolved: [],
  exports: [],
  types: [],
  duplicates: [],
};
const issues = [
  {
    ...leer,
    file: 'shared/src/a.ts',
    exports: [
      { name: 'eins', line: 3 },
      { name: 'zwei', line: 9 },
    ],
    types: [{ name: 'Typ', line: 1 }],
  },
  {
    ...leer,
    file: 'server/src/grundlagen/grenzen.ts',
    duplicates: [
      [
        { name: 'KB', line: 19 },
        { name: 'KOERPER_SPIELRAUM', line: 30 },
      ],
    ],
  },
];

test('liest Exporte, Typen und doppelte Exporte als flache Liste', () => {
  const l = funde(issues);
  assert.equal(l.length, 4);
  assert.deepEqual(
    l.find((f) => f.art === 'duplicates'),
    { art: 'duplicates', datei: 'server/src/grundlagen/grenzen.ts', name: 'KB = KOERPER_SPIELRAUM', zeile: 19 },
  );
});

test('Bestand: Namen je Datei und Art, sortiert; Zählung über alles', () => {
  const b = bestandAus(funde(issues));
  assert.deepEqual(b['shared/src/a.ts'], { exports: ['eins', 'zwei'], types: ['Typ'] });
  assert.equal(zaehleKnip(b), 4);
});

test('nur neue Funde schlagen an; was im Bestand steht, nicht', () => {
  const b = bestandAus(funde(issues));
  const mehr = [{ ...issues[0], exports: [...issues[0].exports, { name: 'drei', line: 12 }] }, issues[1]];
  const { neu, weg } = vergleiche(funde(mehr), b);
  assert.deepEqual(
    neu.map((f) => f.name),
    ['drei'],
  );
  assert.equal(weg.length, 0);
});

test('ungenutzte Dateien und Abhängigkeiten haben keinen Bestand', () => {
  const streng = [
    { ...leer, file: 'web/src/alt.tsx', files: [{ name: 'web/src/alt.tsx' }] },
    { ...leer, file: 'package.json', devDependencies: [{ name: 'x', line: 4 }] },
  ];
  const l = funde(streng);
  assert.deepEqual(bestandAus(l), {});
  assert.equal(vergleiche(l, {}).neu.length, 2);
});

test('weggefallene Einträge werden gemeldet, nicht als Fehler', () => {
  const b = bestandAus(funde(issues));
  const { neu, weg } = vergleiche(funde([issues[1]]), b);
  assert.equal(neu.length, 0);
  assert.deepEqual(weg.map((f) => f.name).sort(), ['Typ', 'eins', 'zwei']);
});
