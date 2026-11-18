/**
 * Feldart Tabelle (#1208, #1305): Der Hinweis „Du siehst 3 von 7 …“ nimmt das Wort immer aus der Beschriftung der
 * Tabelle in der gewählten Sprache – nie ein allgemeines „Einträge“, auch nicht als Rückfall. Die Schnittstelle liefert
 * nur die Zahl (`verborgen`). Gezeichnet mit react-dom/server, ohne Browser.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import React, { type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
g.location = new URL('http://127.0.0.1/');
g.localStorage = speicher();
g.sessionStorage = speicher();
g.addEventListener = () => {};
g.removeEventListener = () => {};
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
const SHARED = new URL('../../shared/src/', import.meta.url).href;
const { verborgenHinweis } = await import('../src/ablage/Tabellenfeld');
const { setzeSprache } = (await import(SHARED + 'sprache.ts')) as { setzeSprache: (s: string) => void };
const { registriereEnglisch } = (await import(SHARED + 'englisch.ts')) as { registriereEnglisch: () => void };
registriereEnglisch();
after(() => setzeSprache('de'));

/** Sichtbarer Text des Hinweises, ohne Markup und Symbol. */
const text = (x: ReactNode) =>
  renderToStaticMarkup(React.createElement(React.Fragment, null, x))
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();

const positionen = { label: 'Positionen', key: 'positionen', beschriftungen: { en: { label: 'Items' } } };

describe('Tabelle: Wort im Hinweis „Du siehst 3 von 5 …“ aus der Beschriftung (#1305)', () => {
  it('Deutsch: „Positionen“ mit 2 verborgenen von 5 Zeilen', () => {
    setzeSprache('de');
    assert.equal(
      text(verborgenHinweis({ gesamt: 3, verborgen: 2 }, positionen)),
      'Du siehst 3 von 5 Positionen. Die übrigen darfst du nicht sehen.',
    );
  });

  it('Englisch: die englische Beschriftung der Tabelle', () => {
    setzeSprache('en');
    assert.equal(
      text(verborgenHinweis({ gesamt: 3, verborgen: 2 }, positionen)),
      'You can see 3 of 5 Items. You don’t have permission to see the rest.',
    );
    // Ohne englische Beschriftung die Beschriftung der Ausgangssprache – kein allgemeines Wort.
    assert.match(text(verborgenHinweis({ gesamt: 3, verborgen: 2 }, { label: 'Positionen', key: 'positionen' })), / 5 Positionen\./);
  });

  it('nie ein allgemeines „Einträge“: ohne Beschriftung die Kennung des Felds; ohne verborgene Zeilen kein Hinweis', () => {
    setzeSprache('de');
    const ohne = text(verborgenHinweis({ gesamt: 1, verborgen: 6 }, { label: '', key: 'zahlungen' }));
    assert.equal(ohne, 'Du siehst 1 von 7 zahlungen. Die übrigen darfst du nicht sehen.');
    assert.doesNotMatch(ohne, /Einträge/);
    assert.equal(verborgenHinweis({ gesamt: 5, verborgen: 0 }, positionen), null);
  });
});
