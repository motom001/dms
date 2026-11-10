/**
 * Historie „zugeordnet“ (#1010): Früher stand `case 'zugeordnet'` zweimal im selben `switch`; der zweite Zweig mit dem
 * Link zur abgetrennten Post (#936) wurde nie erreicht. Jetzt zeigt ein Eintrag den Link zur Mappe bzw. Post und – wenn
 * beim Auflösen ein Teil abgetrennt wurde – den Link zur neuen Post. Gezeichnet mit react-dom/server, ohne Browser.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { register } from 'node:module';

// `tokens.css?raw` (design.ts, #966) wie in Vite als Text laden.
register(new URL('./css-roh-lader.mjs', import.meta.url));

const g = globalThis as Record<string, unknown>;
const speicher = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};
g.location = new URL('http://127.0.0.1/');
g.localStorage = speicher();
g.sessionStorage = speicher();
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.window = globalThis;
g.document = { title: '', querySelector: () => null, documentElement: { lang: 'de', dataset: {}, style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {} }) };
g.React = React;
const WEB = new URL('../../web/src/', import.meta.url).href;
const { einzelheiten } = await import(WEB + 'ablage/Historie.tsx') as { einzelheiten: (e: unknown, emailTyp: string | undefined) => { hinweis: string; inhalt: ReactElement } | null };

const eintrag = (daten: Record<string, unknown>) => ({ id: 'h1', mappeId: 'm1', art: 'zugeordnet', zeit: '2026-11-10T06:00:00Z', benutzerId: 'u1', text: 'Aus Post angelegt', daten });
const links = (daten: Record<string, unknown>) => {
  const e = einzelheiten(eintrag(daten), 'posttyp');
  return e ? [...renderToStaticMarkup(e.inhalt).matchAll(/href="([^"]+)"/g)].map((m) => m[1]) : [];
};

describe('Historie: zugeordnet (#1010)', () => {
  it('Zielmappe einer zugeordneten Post', () => {
    assert.deepEqual(links({ ziel: 'z1', zielTyp: 'vertrag' }), ['/ablage/vertrag/z1']);
  });
  it('Post in der Zielmappe', () => {
    assert.deepEqual(links({ post: 'p1', postTyp: 'posttyp' }), ['/ablage/posttyp/p1']);
  });
  it('Aufgelöst mit abgetrenntem Teil: Link zur Post und zur abgetrennten Post', () => {
    assert.deepEqual(links({ post: 'p1', postTyp: 'posttyp', aufgeloest: true, abgetrennt: 'p2' }), ['/ablage/posttyp/p1', '/ablage/posttyp/p2']);
  });
  it('Abgetrennt ohne aufgeloest zählt nicht', () => {
    assert.deepEqual(links({ post: 'p1', postTyp: 'posttyp', abgetrennt: 'p2' }), ['/ablage/posttyp/p1']);
  });
  it('Ohne Ziel und ohne abgetrennten Teil keine Einzelheiten', () => {
    assert.equal(einzelheiten(eintrag({}), 'posttyp'), null);
  });
});
