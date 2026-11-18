// Tests für klassen-pruefen.mjs (#1270): node --test .github/werkzeuge/klassen-pruefen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { besitzer, klassenIn, pruefe, regeln, teile, woerterInTs } from './klassen-pruefen.mjs';

test('Regeln samt @media, Selektorlisten und Besitzer', () => {
  const r = regeln('/* x { } */\n.a, .b > .c { color: red; }\n@media (max-width: 600px) {\n  .a:hover { z-index: 3; }\n}\n@keyframes k { to { opacity: 1; } }');
  assert.deepEqual(
    r.map((x) => [x.selektor, x.kontext]),
    [
      ['.a, .b > .c', []],
      ['.a:hover', ['@media (max-width: 600px)']],
    ],
  );
  assert.deepEqual(teile(':is(.a, .b) .c, .d'), [':is(.a, .b) .c', '.d']);
  assert.equal(besitzer('.blatt .kachel'), 'blatt');
  assert.equal(besitzer('input[type="x"].y'), 'y');
  assert.equal(besitzer('table td'), null);
  assert.deepEqual(klassenIn('[data-x=".nein"].ja:not(.auch)'), ['ja', 'auch']);
});

test('Wörter aus Zeichenketten, auch in verschachtelten Vorlagen, und Vorsilben', () => {
  const { woerter, vorsilben } = woerterInTs(
    "const a = <div className={`zeile${x ? ' dk-handy' : ''} stufe-${s}`} />; // 'kommentar'\nconst b = 'ka-' + n;",
  );
  assert.ok(woerter.has('zeile') && woerter.has('dk-handy'));
  assert.ok(!woerter.has('kommentar'));
  assert.ok(vorsilben.has('stufe-') && vorsilben.has('ka-'));
});

test('findet doppelte, ungenutzte Klassen und freie z-index-Werte', () => {
  const wurzel = mkdtempSync(join(tmpdir(), 'klassen-'));
  mkdirSync(join(wurzel, 'a'));
  writeFileSync(join(wurzel, 'a', 'eins.css'), '.kachel { z-index: 30; }\n.tot { color: var(--x); }\n.blatt .kachel { z-index: var(--ebene-menue); }');
  writeFileSync(join(wurzel, 'zwei.css'), '.kachel:hover { z-index: calc(var(--ebene-blatt) + 1); }');
  writeFileSync(join(wurzel, 'x.module.css'), '.genutzt { } .ungenutzt { }');
  writeFileSync(join(wurzel, 'a', 'Seite.tsx'), "import s from '../x.module.css';\nexport const A = () => <p className={`kachel blatt ${s.genutzt}`} />;");
  const { doppelt, tot, zIndex } = pruefe(wurzel, {}, []);
  assert.deepEqual(
    doppelt.map((d) => d.klasse),
    ['kachel'],
  );
  assert.deepEqual(tot.map((t) => t.klasse).sort(), ['tot', 'ungenutzt']);
  assert.deepEqual(
    zIndex.map((z) => z.wert),
    ['30'],
  );
});
