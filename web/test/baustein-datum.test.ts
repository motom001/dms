/**
 * Baustein Datum (#1496): Kalenderwoche nach ISO 8601, Tastatur im Kalender und das gezeichnete Feld – Datumsfeld des
 * Browsers zum Tippen, Knopf „Kalender öffnen“, Kalender mit einer Spalte „KW“ vor jeder Woche.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { kalenderwoche, tagNachTaste } from '../../shared/src/kalender';

const g = globalThis as Record<string, unknown>;
g.location = new URL('http://127.0.0.1/');
const leer = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, key: () => null, length: 0 };
g.localStorage = leer;
g.sessionStorage = leer;
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

const WEB = new URL('../../web/src/', import.meta.url).href;
const { DatumEingabe } = await import(WEB + 'bausteine/datum/Datum.tsx');

describe('Baustein Datum (#1496)', () => {
  it('Kalenderwoche nach ISO 8601, auch an der Jahresgrenze', () => {
    assert.equal(kalenderwoche('2026-12-11'), 50, 'Ende KW 50');
    assert.equal(kalenderwoche('2026-01-01'), 1, 'Donnerstag, 1. Januar 2026');
    assert.equal(kalenderwoche('2025-12-29'), 1, 'Montag vor Neujahr gehört zu KW 1 des neuen Jahres');
    assert.equal(kalenderwoche('2027-01-01'), 53, 'Freitag, 1. Januar 2027 gehört zu KW 53 von 2026');
    assert.equal(kalenderwoche('2027-01-04'), 1);
    assert.equal(kalenderwoche('2021-01-03'), 53, 'Sonntag, 3. Januar 2021');
  });

  it('Tastatur im Kalender: Pfeile, Pos1/Ende, Bild auf/ab', () => {
    assert.equal(tagNachTaste('ArrowRight', '2026-12-31'), '2027-01-01');
    assert.equal(tagNachTaste('ArrowUp', '2026-12-11'), '2026-12-04');
    assert.equal(tagNachTaste('Home', '2026-12-11'), '2026-12-07');
    assert.equal(tagNachTaste('End', '2026-12-11'), '2026-12-13');
    assert.equal(tagNachTaste('PageDown', '2026-01-31'), '2026-02-28');
    assert.equal(tagNachTaste('PageUp', '2026-12-11', true), '2025-12-11');
    assert.equal(tagNachTaste('a', '2026-12-11'), null);
  });

  it('Feld zum Tippen, Knopf zum Öffnen; geschlossen kein Kalender', () => {
    const html = renderToStaticMarkup(h(DatumEingabe, { id: 'f', wert: '2026-12-11', setze() {} }));
    assert.match(html, /<input id="f" type="date" value="2026-12-11"/);
    assert.match(html, /aria-label="Kalender öffnen"[^>]*aria-haspopup="dialog"|aria-haspopup="dialog"[^>]*aria-label="Kalender öffnen"/);
    assert.doesNotMatch(html, /role="dialog"/);
  });

  it('offen: vor jeder Woche die Kalenderwoche, der gewählte Tag markiert', () => {
    const html = renderToStaticMarkup(h(DatumEingabe, { wert: '2026-12-11', setze() {}, offenZeigen: true }));
    const kw = [...html.matchAll(/data-kw="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(kw, [49, 50, 51, 52, 53]);
    assert.match(html, />KW</);
    assert.match(html, /aria-selected="true"><button[^>]*data-tag="2026-12-11"/);
  });
});
