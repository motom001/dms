/**
 * Baustein PaketChip (#1192): Symbol und Paketname hinter dem Namen, Tooltip mit Version, Link zur Paketseite (in einer
 * Listenzeile ohne eigenen Link), „Ablago“ für Mitgeliefertes, nichts für Eigenes; die Werkbank-Listen nutzen ihn.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const { PaketChip } = await import(WEB + 'bausteine/index.ts');

describe('Baustein PaketChip (#1192)', () => {
  it('Paket: Link zur Paketseite mit Symbol, Name und Tooltip samt Version', () => {
    const html = renderToStaticMarkup(h(PaketChip, { paket: { id: 'basis', name: 'Basis', version: '1.4.0' } }));
    assert.match(html, /^<a href="\/werkbank\/pakete\/basis"[^>]*class="chip link"[^>]*title="aus dem Paket Basis, Version 1\.4\.0"/);
    assert.match(html, /<svg class="sym symbol"[^>]*>.*<\/svg><span>Basis<\/span><\/a>$/);
  });

  it('in einer Listenzeile ohne eigenen Link; ohne Version und ohne Namen die Kennung', () => {
    const html = renderToStaticMarkup(h(PaketChip, { paket: { id: 'fahrzeuge' }, inLink: true }));
    assert.match(html, /^<span class="chip" title="aus dem Paket fahrzeuge" data-paket="fahrzeuge">/);
    assert.doesNotMatch(html, /<a /);
  });

  it('„Ablago“ für Mitgeliefertes, nichts für Eigenes', () => {
    assert.equal(renderToStaticMarkup(h(PaketChip, { paket: 'ablago' })), '<span class="chip" title="von Ablago mitgeliefert" data-paket="ablago">Ablago</span>');
    assert.equal(renderToStaticMarkup(h(PaketChip, { paket: null })), '');
  });

  it('die Werkbank-Listen nutzen ihn, nirgends mehr „aus Paket“ ohne Namen (#1192)', () => {
    for (const datei of ['werkbank/Werkbank.tsx', 'werkbank/Sichten.tsx', 'werkbank/Nummernkreise.tsx', 'werkbank/Woerter.tsx', 'werkbank/Automatisierungen.tsx', 'werkbank/Ablaufvorlagen.tsx', 'werkbank/PaketErstellen.tsx']) {
      const q = readFileSync(new URL(datei, WEB), 'utf8');
      assert.match(q, /<PaketChip /, datei);
      assert.doesNotMatch(q, /herkunft\.paket|herkunft\.\$\{/, `${datei}: keine Herkunft ohne Namen`);
    }
    for (const sprache of ['de', 'en']) {
      const datei = JSON.parse(readFileSync(new URL(`../../shared/src/sprachen/${sprache}/automatisierung.json`, import.meta.url), 'utf8')) as Record<string, string>;
      assert.deepEqual(Object.keys(datei).filter((k) => k.includes('herkunft.paket')), [], sprache);
    }
  });
});
