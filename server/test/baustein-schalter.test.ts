/**
 * Baustein Schalter (#1188): `role="switch"` mit `aria-checked`, Name = Beschriftung (Zustand „An/Aus“ nur zu sehen),
 * Hinweis über `aria-describedby`, gesperrt; und dass die Werkbank Ein/Aus-Stellen als Schalter zeigt, nicht als Haken.
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
const { Schalter } = await import(WEB + 'bausteine/index.ts');
const nichts = () => {};

describe('Baustein Schalter (#1188)', () => {
  it('role="switch", aria-checked, Name aus der Beschriftung, Zustand als Wort nur zu sehen', () => {
    const an = renderToStaticMarkup(h(Schalter, { an: true, setze: nichts, beschriftung: 'WebDAV-Laufwerk' }));
    assert.match(an, /<button type="button" role="switch" aria-checked="true"/);
    assert.match(an, /<span class="beschriftung">WebDAV-Laufwerk<\/span><span class="zustand" aria-hidden="true">An<\/span>/);
    assert.match(an, /data-schalter="an"/);
    const aus = renderToStaticMarkup(h(Schalter, { an: false, setze: nichts, beschriftung: 'Eingangsordner' }));
    assert.match(aus, /aria-checked="false"/);
    assert.match(aus, />Aus<\/span>/);
  });

  it('Hinweis über aria-describedby; gesperrt ist disabled; Beschriftung nur für Screenreader', () => {
    const html = renderToStaticMarkup(h(Schalter, { an: false, setze: nichts, beschriftung: 'WebDAV-Laufwerk', hinweis: 'Aus: nicht gefunden.', gesperrt: true }));
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    assert.ok(id);
    assert.match(html, new RegExp(`<small id="${id}" class="hinweis">Aus: nicht gefunden\\.</small>`));
    assert.match(html, /disabled=""/);
    assert.match(renderToStaticMarkup(h(Schalter, { an: true, setze: nichts, beschriftung: 'Automatisierung an oder aus', beschriftungVerbergen: true })), /<span class="sr">Automatisierung an oder aus<\/span>/);
  });

  it('Ein/Aus-Stellen der Werkbank sind Schalter, keine Haken (#1188)', () => {
    const stellen: Array<[string, string]> = [
      ['werkbank/Webdav.tsx', 'webdav-aktiv'], ['werkbank/Eingangsordner.tsx', 'eingang-aktiv'], ['werkbank/Postfaecher.tsx', 'pf-aktiv'],
      ['werkbank/Sprachen.tsx', 'uebersetzen-an'], ['werkbank/Anmeldeschutz.tsx', 'oidc-aktiv'],
    ];
    for (const [datei, id] of stellen) {
      const q = readFileSync(new URL(datei, WEB), 'utf8');
      assert.match(q, new RegExp(`<Schalter id="${id}"`), `${datei}: ${id} als Schalter`);
      assert.doesNotMatch(q, new RegExp(`<input id="${id}" type="checkbox"`), `${datei}: ${id} nicht mehr als Haken`);
    }
    for (const datei of ['werkbank/MailVersand.tsx', 'werkbank/Sicherung.tsx', 'werkbank/Verkleinern.tsx', 'werkbank/Vollexport.tsx', 'werkbank/SucheEinstellungen.tsx', 'werkbank/Ansicht.tsx', 'werkbank/Automatisierungen.tsx', 'werkbank/Ablaufvorlagen.tsx']) {
      assert.match(readFileSync(new URL(datei, WEB), 'utf8'), /<Schalter /, datei);
    }
    // Keine doppelte Zustandsanzeige beim WebDAV-Laufwerk.
    assert.doesNotMatch(readFileSync(new URL('werkbank/Webdav.tsx', WEB), 'utf8'), /webdav\.zustand/);
  });
});
