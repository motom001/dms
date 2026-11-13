/**
 * Baustein Speicherleiste (#370, aus Bausteinen seit #1210): Hauptknopf blau (Art Haupt), „Verwerfen“ als Knopf mit
 * Rand (Art Neben, ohne Symbol), beide ohne Änderung blass (`disabled`); links ein fester Platz für „… löschen“ als
 * Gefahr-Knopf in normaler Größe mit Rückfrage – gesperrt aus einem Grund gestrichelt mit Schloss und ⓘ.
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
const { Speicherleiste } = await import(WEB + 'bausteine/index.ts');
const alt = await import(WEB + 'Speicherleiste.tsx');
const ent = (neu: boolean, geaendert: boolean) => ({ neu, geaendert, verwerfen: async () => {}, tasten: () => {} });
const LOESCHEN = { text: 'Nummernkreis löschen', rueckfrage: { titel: 'Nummernkreis löschen?', ja: 'Löschen' }, onClick: () => {} };
const knoepfe = (html: string) => [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map((m) => ({ attr: m[1], text: (('>' + m[2] + '<').match(/>[^<]*</g) ?? []).map((t) => t.slice(1, -1)).join('') }));
const art = (k: { attr: string }) => /data-knopf="([^"]+)"/.exec(k.attr)?.[1];

describe('Baustein Speicherleiste (#1210)', () => {
  it('ohne Änderung: „… löschen“ links aktiv, Verwerfen (Neben) und Speichern (Haupt, blau) blass', () => {
    const html = renderToStaticMarkup(h(Speicherleiste, { ent: ent(false, false), gegenstand: 'Nummernkreis', loeschen: LOESCHEN }));
    const k = knoepfe(html);
    assert.deepEqual(k.map((x) => x.text), ['Nummernkreis löschen', 'Änderungen verwerfen', 'Nummernkreis speichern']);
    assert.deepEqual(k.map(art), ['gefahr', 'neben', 'haupt']);
    assert.match(k[0].attr, /aria-haspopup="dialog"/);
    assert.doesNotMatch(k[0].attr, /\bklein\b|disabled/, '„… löschen“ in normaler Größe, aktiv');
    assert.match(k[1].attr, /class="knopf baustein"/, 'Verwerfen ist ein Knopf mit Rand, kein Textlink');
    assert.match(k[1].attr, /disabled=""/);
    assert.match(k[2].attr, /class="knopf primaer baustein"/);
    assert.match(k[2].attr, /type="submit"[^>]*disabled=""|disabled=""[^>]*type="submit"/);
    assert.doesNotMatch(html, /textknopf|gruen|gefahr-rand/);
  });

  it('geändert: beide aktiv, Status „Ungespeicherte Änderungen“; Verwerfen ohne Symbol', () => {
    const html = renderToStaticMarkup(h(Speicherleiste, { ent: ent(false, true), gegenstand: 'Nummernkreis', speichern: () => {} }));
    const k = knoepfe(html);
    assert.deepEqual(k.map(art), ['neben', 'haupt']);
    assert.ok(k.every((x) => !/disabled/.test(x.attr)));
    assert.doesNotMatch(k[0].text, /svg/);
    assert.doesNotMatch(html.split('Änderungen verwerfen')[0].split('<button').pop() ?? '', /<svg/, 'kein Symbol an Verwerfen');
    assert.match(html, /role="status">Ungespeicherte Änderungen</);
  });

  it('sendet: Hauptknopf „läuft“ (aria-busy, nicht disabled), Beschriftung bleibt', () => {
    const html = renderToStaticMarkup(h(Speicherleiste, { ent: ent(false, true), gegenstand: 'Nummernkreis', sendet: true }));
    const haupt = knoepfe(html).find((x) => art(x) === 'haupt')!;
    assert.match(haupt.attr, /aria-busy="true"/);
    assert.doesNotMatch(haupt.attr, /disabled=""/);
    assert.match(html, /Nummernkreis speichern/);
  });

  it('„… löschen“ gesperrt aus einem Grund: gestrichelt mit Schloss und ⓘ, keine Rückfrage; neu ohne Löschen', () => {
    const html = renderToStaticMarkup(h(Speicherleiste, { ent: ent(false, false), gegenstand: 'Nummernkreis', loeschen: { ...LOESCHEN, gesperrt: 'Zwei Mappentypen verwenden ihn.' } }));
    const k = knoepfe(html);
    assert.match(k[0].attr, /aria-disabled="true"/);
    assert.doesNotMatch(k[0].attr, /aria-haspopup/);
    assert.match(k[1].attr, /class="warum"/);
    assert.match(html, /class="sr">Zwei Mappentypen verwenden ihn\.</);
    const neu = knoepfe(renderToStaticMarkup(h(Speicherleiste, { ent: ent(true, false), gegenstand: 'Nummernkreis', loeschen: undefined })));
    assert.deepEqual(neu.map((x) => x.text), ['Entwurf verwerfen', 'Nummernkreis anlegen']);
  });

  it('web/src/Speicherleiste.tsx leitet nur weiter (Bestand behält seinen Import)', () => {
    assert.equal(alt.Speicherleiste, Speicherleiste);
    assert.equal(typeof alt.useEntwurf, 'function');
  });
});
