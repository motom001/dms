/**
 * Baustein Reiter (#1210): Registerliste nach WAI-ARIA – `role="tablist"` mit Namen, je Reiter `role="tab"` mit
 * `aria-selected` und `aria-controls`, nur der aktive per Tab erreichbar; die Fläche `role="tabpanel"`, benannt nach dem
 * aktiven Reiter; ein aktives Aussehen; Fehler und Anzahl am Reiter.
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
const { Reiter, ReiterFlaeche, reiterId, flaecheId } = await import(WEB + 'bausteine/index.ts');
const nichts = () => {};
const WAHLEN = [{ wert: 'felder', text: 'Felder', fehler: 2 }, { wert: 'dokumente', text: 'Dokumente', anzahl: 3, anker: 'mappe.register:dokumente' }];

describe('Baustein Reiter (#1210)', () => {
  it('Registerliste: tablist mit Namen, je Reiter role="tab", aria-selected, aria-controls; nur der aktive mit tabindex 0', () => {
    const html = renderToStaticMarkup(h(Reiter, { id: 'm', wert: 'dokumente', setze: nichts, wahlen: WAHLEN, beschriftung: 'Register der Mappe' }));
    assert.match(html, /^<div role="tablist" aria-label="Register der Mappe" class="reihe">/);
    const tabs = [...html.matchAll(/<button([^>]*)>/g)].map((m) => m[1]);
    assert.equal(tabs.length, 2);
    assert.match(tabs[0], new RegExp(`id="${reiterId('m', 'felder')}"[^>]*role="tab" aria-selected="false" aria-controls="${flaecheId('m')}" tabindex="-1"`));
    assert.match(tabs[1], /aria-selected="true"[^>]*tabindex="0" data-anker="mappe.register:dokumente" class="reiter an"/);
    assert.match(html, /<span class="fehler" title="2 Fehler"><span aria-hidden="true">2<\/span><span class="sr">2 Fehler<\/span><\/span>/);
    assert.match(html, /<span class="anzahl">3<\/span>/);
  });

  it('Fläche: tabpanel, benannt nach dem aktiven Reiter (ohne eigenes tabindex)', () => {
    const html = renderToStaticMarkup(h(ReiterFlaeche, { id: 'm', wert: 'felder' }, 'Inhalt'));
    assert.equal(html, `<div role="tabpanel" id="${flaecheId('m')}" aria-labelledby="${reiterId('m', 'felder')}" class="flaeche">Inhalt</div>`);
  });
});
