/**
 * Baustein Bereiche (#1000): Sprungleiste ab drei Bereichen mit „Alle aufklappen / Alle zuklappen“, neu alles offen,
 * bestehend wie zuletzt auf diesem Gerät (sonst zu, mit `{ offen: true }` offen), Anker in der Adresse öffnet seinen Bereich, unter drei Bereichen
 * fest offen ohne Klappen; Fehler am Bereich und in der Leiste; `fehlerBereiche` liest `details.orte`.
 * Gezeichnet mit react-dom/server wie baustein-knopf.test.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement as h, type ReactElement } from 'react';
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
const lade = (pfad: string): Promise<any> => import(WEB + pfad); // eslint-disable-line @typescript-eslint/no-explicit-any -- Module der Oberfläche
const { Bereich, useBereiche, fehlerBereiche, liesOffen, merkeOffen } = await lade('bausteine/index.ts');

const zeichne = (e: ReactElement) => renderToStaticMarkup(e);
const VIER = [['grunddaten', 'Grunddaten'], ['verbindung', 'Verbindung'], ['abholen', 'Abholen'], ['stand', 'Stand']] as const;
const ZWEI = [['grunddaten', 'Grunddaten'], ['rechte', 'Rollen und Rechte']] as const;

/** Ein kleiner Editor: Leiste und Bereiche; `fehler` markiert einen Bereich. */
function Editor({ liste, id, fehler, offenStart }: { liste: ReadonlyArray<readonly [string, string]>; id: string | null; fehler?: string; offenStart?: boolean }) {
  const b = useBereiche(liste, 'test', id, { offen: offenStart });
  return h('div', null, b.leiste((k: string) => k === fehler, 'Bereiche des Tests'),
    ...liste.map(([k, name]) => h(Bereich, { key: k, id: k, titel: name, kurz: `kurz ${k}`, klappe: b.klappe(k, k === fehler) }, h('p', null, `inhalt ${k}`))));
}
const offen = (html: string, k: string) => new RegExp(`id="${k}-inhalt"[^>]*>`).exec(html)?.[0].includes('hidden') === false;

describe('Baustein Bereiche (#1000)', () => {
  it('neu: Sprungleiste mit allen Bereichen, alles offen, „Alle zuklappen“', () => {
    const html = zeichne(h(Editor, { liste: VIER, id: null }));
    assert.match(html, /<nav[^>]*aria-label="Bereiche des Tests"[^>]*data-sprungleiste=""/);
    for (const [k] of VIER) assert.ok(offen(html, k), k);
    assert.ok(html.includes('Alle zuklappen'));
    assert.match(html, /aria-expanded="true"[^>]*aria-controls="grunddaten-inhalt"/);
  });

  it('bestehend: ohne Gedächtnis zu (mit Kurzinfo), sonst wie zuletzt; der Anker öffnet seinen Bereich', () => {
    let html = zeichne(h(Editor, { liste: VIER, id: 'a' }));
    for (const [k] of VIER) assert.ok(!offen(html, k), k);
    assert.ok(html.includes('kurz stand') && html.includes('Alle aufklappen'));
    merkeOffen('test', 'b', ['verbindung']);
    assert.deepEqual(liesOffen('test', 'b'), ['verbindung']);
    html = zeichne(h(Editor, { liste: VIER, id: 'b' }));
    assert.ok(offen(html, 'verbindung') && !offen(html, 'grunddaten'));
    g.location = new URL('http://127.0.0.1/werkbank/postfaecher/c#stand');
    html = zeichne(h(Editor, { liste: VIER, id: 'c' }));
    assert.ok(offen(html, 'stand') && !offen(html, 'abholen'));
    g.location = new URL('http://127.0.0.1/');
  });

  it('Editoren ohne Speichern ({ offen: true }): offen, solange das Gerät nichts gemerkt hat', () => {
    let html = zeichne(h(Editor, { liste: VIER, id: 'o', offenStart: true }));
    for (const [k] of VIER) assert.ok(offen(html, k), k);
    merkeOffen('test', 'o', ['stand']);
    html = zeichne(h(Editor, { liste: VIER, id: 'o', offenStart: true }));
    assert.ok(offen(html, 'stand') && !offen(html, 'grunddaten'));
  });

  it('Mappentypen und Ansichten behalten ihren Speicherort', () => {
    merkeOffen('typ', 'x', ['felder']);
    assert.equal(localStorage.getItem('dms.typeditor.offen'), JSON.stringify({ x: ['felder'] }));
    merkeOffen('postfach', 'y', ['stand']);
    assert.ok(localStorage.getItem('dms.postfacheditor.offen'));
  });

  it('unter drei Bereichen: keine Leiste, fest offen, kein Klappknopf', () => {
    const html = zeichne(h(Editor, { liste: ZWEI, id: 'z' }));
    assert.ok(!html.includes('data-sprungleiste'));
    assert.ok(offen(html, 'grunddaten') && offen(html, 'rechte'));
    assert.ok(!html.includes('aria-expanded'));
  });

  it('Fehler: Bereich und Sprung markiert, „!“ mit Namen für Screenreader', () => {
    const html = zeichne(h(Editor, { liste: VIER, id: null, fehler: 'verbindung' }));
    assert.match(html, /title="Verbindung: Fehler"/);
    assert.ok(html.includes('aria-label="mit Fehler"'));
    assert.match(html, /<section[^>]*id="verbindung"/);
    assert.ok(/chip schlecht">Fehler</.test(html));
  });

  it('fehlerBereiche: nur bekannte Orte aus details.orte, sonst der Ersatz', () => {
    assert.deepEqual(fehlerBereiche({ details: { orte: ['abholen', 'gibtsnicht', 'grunddaten'] } }, VIER, ['verbindung']), ['grunddaten', 'abholen']);
    assert.deepEqual(fehlerBereiche(new Error('x'), VIER, ['verbindung']), ['verbindung']);
    assert.deepEqual(fehlerBereiche(null, VIER, []), []);
  });
});
