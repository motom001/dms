/**
 * Baustein Umschalter (#1002): Segmentknopf als Gruppe von Optionsfeldern – `role="radiogroup"` mit Beschriftung, je
 * Wahl `role="radio"` mit `aria-checked`, nur die gewählte Wahl per Tab erreichbar; Pfeiltasten, Pos1 und Ende.
 * Gezeichnet mit react-dom/server wie baustein-knopf.test.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const g = globalThis as Record<string, unknown>;
const speicher = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};
g.location ??= new URL('http://127.0.0.1/');
g.localStorage ??= speicher();
g.sessionStorage ??= speicher();
g.addEventListener ??= () => {};
g.removeEventListener ??= () => {};
g.window ??= globalThis;
g.document ??= { title: '', querySelector: () => null, documentElement: { lang: 'de', dataset: {}, style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {} }) };
g.React = React;

const WEB = new URL('../../web/src/', import.meta.url).href;
const { Umschalter, zielDerTaste } = await import(WEB + 'bausteine/index.ts');
const nichts = () => {};
const WAHLEN = [{ wert: 'fragen', text: 'Fragen' }, { wert: 'suchen', text: 'Suchen' }];

describe('Baustein Umschalter (#1002)', () => {
  it('Optionsfelder: Gruppe mit Namen, je Wahl role="radio" und aria-checked; nur die gewählte mit tabindex 0', () => {
    const html = renderToStaticMarkup(h(Umschalter, { wert: 'suchen', setze: nichts, wahlen: WAHLEN, beschriftung: 'Fragen oder suchen', anker: 'startseite.feld-art' }));
    assert.match(html, /^<div role="radiogroup" aria-label="Fragen oder suchen" class="[^"]*" data-anker="startseite.feld-art">/);
    const knoepfe = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map((m) => ({ attr: m[1], text: m[2] }));
    assert.deepEqual(knoepfe.map((k) => k.text), ['Fragen', 'Suchen']);
    for (const k of knoepfe) {
      assert.match(k.attr, /type="button"/);
      assert.match(k.attr, /role="radio"/);
    }
    assert.match(knoepfe[0].attr, /aria-checked="false"[^>]*tabindex="-1"/i);
    assert.match(knoepfe[1].attr, /aria-checked="true"[^>]*tabindex="0"/i);
  });

  it('Pfeiltasten wählen die nächste bzw. vorige Wahl (am Ende wieder vorn), Pos1 und Ende die erste und letzte', () => {
    assert.equal(zielDerTaste('ArrowRight', 0, 2), 1);
    assert.equal(zielDerTaste('ArrowDown', 1, 2), 0);
    assert.equal(zielDerTaste('ArrowLeft', 0, 3), 2);
    assert.equal(zielDerTaste('ArrowUp', 2, 3), 1);
    assert.equal(zielDerTaste('Home', 2, 3), 0);
    assert.equal(zielDerTaste('End', 0, 3), 2);
    assert.equal(zielDerTaste('Enter', 0, 2), -1);
    assert.equal(zielDerTaste('a', 0, 2), -1);
    assert.equal(zielDerTaste('ArrowRight', 0, 0), -1);
  });
});
