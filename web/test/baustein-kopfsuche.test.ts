/**
 * Baustein Suche, Suchfeld in der Kopfzeile (#1218): Suchregion mit Namen, Taste „/“, Bereich als Chip mit „×“,
 * „Suchen in ▾“, Leeren nur mit Text. Dazu der gemeinsame Stand von Feld und Liste (web/src/ablage/kopfsuche.ts).
 * Gezeichnet mit react-dom/server wie baustein-umschalter.test.ts.
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
const { KopfSuche } = await import(WEB + 'bausteine/index.ts');
const { kopfsuche } = await import(WEB + 'ablage/kopfsuche.ts');
const nichts = () => {};
const GRUND = { setze: nichts, beschriftung: 'In deiner Ablage suchen', platzhalter: 'Suchen in deiner Ablage …' };

describe('Baustein KopfSuche (#1218)', () => {
  it('leer: Suchregion mit Namen, Lupe für das Handy, Hinweis „/“, kein Chip und kein Leeren', () => {
    const html = renderToStaticMarkup(h(KopfSuche, { ...GRUND, wert: '', anker: 'startseite.suche' }));
    assert.match(html, /^<div class="[^"]*" role="search" aria-label="In deiner Ablage suchen" data-anker="startseite.suche">/);
    assert.match(html, /<input [^>]*type="search"[^>]*placeholder="Suchen in deiner Ablage …"[^>]*aria-keyshortcuts="\/"/);
    assert.match(html, /<kbd [^>]*aria-hidden="true">\/<\/kbd>/);
    assert.match(html, /aria-label="Suchen"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-label="Suchen"/, 'Lupe (am Handy) mit Zustand');
    assert.doesNotMatch(html, /Bereich entfernen/);
    assert.doesNotMatch(html, /Suche leeren/);
  });

  it('in einer Ansicht: Chip mit „×“, „Suchen in ▾“ zu; mit Text das Leeren statt „/“', () => {
    const html = renderToStaticMarkup(h(KopfSuche, { ...GRUND, wert: 'Haus', bereich: { text: 'in: Verträge', weg: nichts }, suchenIn: { text: 'Suchen in', inhalt: 'x' }, tastenkuerzel: false }));
    assert.match(html, />in: Verträge<\/span>/);
    assert.match(html, /aria-label="Bereich entfernen, in allem suchen"/);
    assert.match(html, /aria-label="Suche leeren"/);
    assert.match(html, /<button aria-expanded="false" [^>]*suchenIn[^>]*><span class="stapel"><span class="text">Suchen in /);
    assert.doesNotMatch(html, /<kbd/);
    assert.doesNotMatch(html, /aria-keyshortcuts/);
  });
});

describe('Suchfeld oben und Liste teilen einen Stand (#1218)', () => {
  it('Liste meldet sich an: Text beginnt leer; Bereich weg: Text bleibt, Liste ungefiltert; Abmelden leert', () => {
    const jetzt = () => kopfsuche.jetzt();
    kopfsuche.setzeText('alt');
    kopfsuche.anmelden({ schluessel: 'vertraege?', name: 'Verträge' });
    assert.deepEqual(jetzt(), { text: '', bereich: { schluessel: 'vertraege?', name: 'Verträge' }, aufgehoben: null });
    kopfsuche.setzeText('Haus');
    // Gleiche Liste mit neuem Namen (nachgeladen): Text bleibt.
    kopfsuche.anmelden({ schluessel: 'vertraege?', name: 'Verträge (alle)' });
    assert.equal(jetzt().text, 'Haus');
    kopfsuche.bereichWeg();
    assert.deepEqual(jetzt(), { text: 'Haus', bereich: null, aufgehoben: 'vertraege?' });
    // Dieselbe Liste meldet sich erneut (z. B. neuer Name): Der weggenommene Bereich kommt nicht wieder.
    kopfsuche.anmelden({ schluessel: 'vertraege?', name: 'Verträge' });
    assert.equal(jetzt().bereich, null);
    kopfsuche.abmelden('vertraege?');
    assert.deepEqual(jetzt(), { text: '', bereich: null, aufgehoben: null });
    // Eine andere Liste: neuer Bereich, leeres Feld; Abmelden einer fremden Liste ändert nichts.
    kopfsuche.anmelden({ schluessel: 'eingang?', name: 'Zu erledigen' });
    kopfsuche.setzeText('x');
    kopfsuche.abmelden('vertraege?');
    assert.equal(jetzt().text, 'x');
    kopfsuche.abmelden('eingang?');
  });
});
