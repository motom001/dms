/**
 * Formularfelder (KW47): Beim Anlegen bekommen verborgene Felder keinen Wert (#1492), und ein leeres Betragsfeld zeigt
 * als Platzhalter „0,00“, auch mit „nur negativ“ (#1493). Gezeichnet mit react-dom/server wie in baustein-feld.test.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { type ReactElement } from 'react';
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
g.location = new URL('http://127.0.0.1/');
g.localStorage = speicher();
g.sessionStorage = speicher();
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
const lade = (pfad: string): Promise<any> => import(WEB + pfad); // eslint-disable-line @typescript-eslint/no-explicit-any -- Module der Oberfläche, je Pfad ein anderes
const { anzeigeImFormular, beimAnlegenVerborgen } = await lade('ablage/anzeige.ts');
const { ausgeblendeteFelder } = await import('../../shared/src/darstellung');
const { standardRoh } = await lade('werte.ts');
const { eingabe } = await lade('ablage/mappe-formular/eingaben.tsx');

/** Rechnung mit Abschnitt „Vermietung“, der nur bei Art „Miete“ zu sehen ist, und einem ausgeblendeten Feld. */
const rechnung = {
  id: 'r',
  name: 'Rechnung',
  felder: [
    { key: 'art', label: 'Art', typ: 'auswahl', optionen: ['Strom', 'Miete'] },
    { key: 'betrag', label: 'Betrag', typ: 'betrag' },
    { key: 'umlage', label: 'Umlagefähig', typ: 'janein', standard: true },
    { key: 'objekt', label: 'Objekt', typ: 'text', standard: 'Haus' },
    { key: 'alt', label: 'Alt', typ: 'text', standard: 'x', ausgeblendet: true },
    { key: 'notiz', label: 'Notiz', typ: 'text', standard: 'bleibt' },
  ],
  register: [
    {
      key: 'allgemein',
      name: 'Allgemein',
      art: 'felder',
      felder: ['art', 'betrag', 'umlage', 'objekt', 'alt', 'notiz'],
      abschnitte: [
        {
          vor: 'umlage',
          titel: 'Vermietung',
          anzeigen: {
            modus: 'alle',
            bedingungen: [{ art: 'feld', bedingung: { art: 'feld', feld: 'art', op: 'einerVon', wert: { art: 'fest', wert: ['Miete'] } } }],
          },
        },
        { vor: 'notiz', titel: 'Sonstiges' },
      ],
    },
  ],
};

describe('Anlegen ohne verborgene Werte (#1492)', () => {
  const verborgen = (roh: Record<string, unknown>, aufgedeckt: string[] = []) =>
    [
      ...beimAnlegenVerborgen(
        ausgeblendeteFelder(rechnung as never),
        anzeigeImFormular(rechnung as never, roh, { bekannt: {} }),
        new Set(aufgedeckt),
      ),
    ].sort();

  it('ausgeblendeter Abschnitt und ausgeblendetes Feld bekommen keinen Wert, auch keinen Vorgabewert', () => {
    const roh = { ...standardRoh(rechnung), art: 'Strom' };
    assert.equal(roh.umlage, true, 'Vorgabewert steht im Formular');
    assert.deepEqual(verborgen(roh), ['alt', 'objekt', 'umlage']);
  });

  it('sichtbarer Abschnitt: Werte gehen mit', () => {
    assert.deepEqual(verborgen({ ...standardRoh(rechnung), art: 'Miete' }), ['alt']);
  });

  it('aufgedeckter Abschnitt („anzeigen“): die Person sieht die Werte, sie gehen mit', () => {
    assert.deepEqual(verborgen({ ...standardRoh(rechnung), art: 'Strom' }, ['a:allgemein.umlage']), ['alt']);
  });
});

describe('Betragsfeld (#1493)', () => {
  const platzhalter = (negativ: boolean) => {
    const feld = { key: 'netto', label: 'Netto', typ: 'betrag', ...(negativ ? { negativ: true } : {}) };
    const { ctl } = eingabe(
      { feld, roh: { betrag: '', waehrung: 'EUR' }, setze() {}, bekannt: {}, merke() {}, neuesFormular() {} },
      { rahmen: { beschriftung: 'Netto' }, unter: null, id: 'feld-netto', typ: () => undefined },
    );
    const html = renderToStaticMarkup(ctl as ReactElement);
    return /placeholder="([^"]*)"/.exec(html)?.[1];
  };
  it('leer zeigt „0,00“, auch mit „nur negativ“', () => {
    assert.equal(platzhalter(false), '0,00');
    assert.equal(platzhalter(true), '0,00');
  });
});
