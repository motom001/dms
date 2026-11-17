/**
 * Liste der Werkbank-Seiten (#1281): Jede Seite der Liste (shared/src/werkbankansicht.ts) hat eine Komponente in der
 * Tabelle web/src/werkbank/rahmen/seiten.ts, und die Tabelle kennt keine Seite außerhalb der Liste. Texte, Handbuch und
 * Routen prüft server/test/werkbank-liste.test.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';

const g = globalThis as Record<string, unknown>;
const speicher = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
};
g.location = new URL('http://127.0.0.1/werkbank');
g.localStorage = speicher();
g.sessionStorage = speicher();
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.dispatchEvent = () => true;
g.window = globalThis;
g.document = {
  title: '',
  querySelector: () => null,
  documentElement: { lang: 'de', dataset: {}, style: { setProperty() {} } },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ style: {} }),
};
g.React = React;
const { SEITEN, seiteVon } = await import('../src/werkbank/rahmen/seiten');
const { BEREICHE } = await import('../../shared/src/werkbankansicht');

describe('Werkbank: Seiten aus der Liste (#1281)', () => {
  it('jede Seite der Liste hat eine Komponente, keine Komponente ohne Eintrag', () => {
    const liste = ['uebersicht', ...BEREICHE.map((b) => b.pfad)].sort();
    assert.deepEqual(Object.keys(SEITEN).sort(), liste);
    for (const p of liste) assert.equal(typeof SEITEN[p as keyof typeof SEITEN], 'function', p);
  });

  it('Unbekanntes, „Werkbank anpassen“ und Namen von Object haben keine Seite', () => {
    for (const p of ['gibtesnicht', 'ansicht', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])
      assert.equal(seiteVon(p), undefined, p);
    assert.equal(seiteVon('typen'), SEITEN.typen);
  });
});
