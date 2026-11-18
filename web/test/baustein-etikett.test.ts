/**
 * Bausteine Etikett (#1289, Leitsatz 8: Rand heißt Knopf) und Aufklapper (#1270): Etiketten ohne Rand und ohne Klick,
 * gewählter Eintrag mit Knopf ✕ darin; Aufklapper mit Pfeil, aria-expanded und aria-controls. Keine globale .chip-Klasse.
 * Zahl (#1287, Leitsatz 9): Gelb nur für Warnungen, „wartet“ mit Text für Screenreader, die 0 als leise Menge.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement as h } from 'react';
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
g.location ??= new URL('http://127.0.0.1/');
g.localStorage ??= speicher();
g.sessionStorage ??= speicher();
g.addEventListener ??= () => {};
g.removeEventListener ??= () => {};
g.window ??= globalThis;
g.document ??= {
  title: '',
  querySelector: () => null,
  documentElement: { lang: 'de', dataset: {}, style: { setProperty() {} } },
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ style: {} }),
};
g.React = React;

const WEB = new URL('../../web/src/', import.meta.url).href;
const { Etikett, etikettArt, Aufklapper, Zahl } = await import(WEB + 'bausteine/index.ts');

const zeichne = (el: React.ReactElement) => renderToStaticMarkup(el);
const nichts = () => {};

describe('Baustein Etikett (#1289)', () => {
  it('Arten: Klasse der Art und data-etikett, Vorgabe leise, kein Knopf', () => {
    for (const art of ['leise', 'info', 'gut', 'warn', 'schlecht'] as const) {
      const html = zeichne(h(Etikett, { art }, 'Text'));
      assert.equal(html, `<span class="etikett ${art}" data-etikett="${art}">Text</span>`);
    }
    assert.equal(zeichne(h(Etikett, null, 'Text')), '<span class="etikett leise" data-etikett="leise">Text</span>');
    assert.doesNotMatch(zeichne(h(Etikett, { art: 'warn', punkt: true, klein: true }, 'x')), /<button|chip/);
    assert.match(zeichne(h(Etikett, { art: 'gut', punkt: true, klein: true }, 'x')), /class="etikett gut punkt klein"/);
  });

  it('gewählter Eintrag: nur der ✕ ist ein Knopf, mit Namen für Screenreader', () => {
    const html = zeichne(h(Etikett, { entfernen: nichts, entfernenText: 'Kfz entfernen' }, 'Kfz'));
    assert.match(html, /^<span class="etikett leise" data-etikett="leise"><span class="text">Kfz<\/span><button/);
    assert.match(html, /aria-label="Kfz entfernen"/);
    assert.match(html, /data-knopf="eigen"/);
  });

  it('etikettArt: Werte aus Tabellen, Unbekanntes und Leeres leise', () => {
    assert.equal(etikettArt('warn'), 'warn');
    assert.equal(etikettArt(''), 'leise');
    assert.equal(etikettArt(undefined), 'leise');
    assert.equal(etikettArt('stufe-error'), 'leise');
  });

  it('keine globale .chip-Klasse mehr in der Gestaltung (#1289)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const wurzel = new URL('../../web/src/', import.meta.url);
    const css = readdirSync(wurzel, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.css') && !d.name.endsWith('.module.css'))
      .map((d) => readFileSync(`${d.parentPath}/${d.name}`, 'utf8'))
      .join('\n');
    assert.doesNotMatch(css, /\.chip\b/);
  });
});

describe('Baustein Aufklapper (#1270)', () => {
  it('Kopf: Pfeil nach rechts, aria-expanded und aria-controls', () => {
    const html = zeichne(h(Aufklapper, { offen: false, umschalten: nichts, steuert: 'inhalt' }, 'Expertenmodus'));
    assert.match(html, /^<button[^>]*class="eigen baustein kopf"/);
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /aria-controls="inhalt"/);
    assert.match(html, /data-knopf="eigen"/);
  });

  it('Zeile, aufgeklappt', () => {
    const html = zeichne(h(Aufklapper, { form: 'zeile', offen: true, umschalten: nichts }, 'Zeile'));
    assert.match(html, /class="eigen baustein zeile"/);
    assert.match(html, /aria-expanded="true"/);
  });
});

describe('Baustein Zahl (#1287)', () => {
  it('Arten: Menge als Vorgabe, Warnung, wartet mit Text für Screenreader', () => {
    assert.equal(zeichne(h(Zahl, { wert: 14 })), '<span class="zahl menge" data-zahl="menge">14</span>');
    assert.match(zeichne(h(Zahl, { wert: '!', art: 'warnung' })), /class="zahl warnung" data-zahl="warnung">!</);
    const wartet = zeichne(h(Zahl, { wert: 2, art: 'wartet' }));
    assert.match(wartet, /data-zahl="wartet"><span aria-hidden="true">2<\/span><span class="sr">2 warten auf dich<\/span>/);
  });

  it('0 wartet nicht: leise Menge, ohne Zusatztext', () => {
    assert.equal(zeichne(h(Zahl, { wert: 0, art: 'wartet' })), '<span class="zahl menge" data-zahl="menge">0</span>');
  });

  it('keine gelbe Klasse .zaehler mehr in der Gestaltung', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const wurzel = new URL('../../web/src/', import.meta.url);
    const css = readdirSync(wurzel, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith('.css') && !d.name.endsWith('.module.css'))
      .map((d) => readFileSync(`${d.parentPath}/${d.name}`, 'utf8'))
      .join('\n');
    assert.doesNotMatch(css, /\.zaehler\b/);
  });
});
