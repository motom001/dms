/**
 * Werkbank-Übersicht (#1312), gezeichnet mit react-dom/server, ohne Browser: Fehlt ein eingebautes Werkzeug (#1189),
 * steht auf der Startseite der Werkbank je Werkzeug genau ein Hinweis mit Folge und Abhilfe, nach Schwere eingeordnet
 * (Poppler rot, sonst gelb), mit dem Weg zum Systemzustand („Erneut prüfen“). Ist alles da, steht dort nichts.
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
g.location = new URL('http://127.0.0.1/werkbank');
g.localStorage = speicher();
g.sessionStorage = speicher();
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.dispatchEvent = () => true;
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
const { DatenProvider } = await lade('daten.tsx');
const { hinweiseAus } = await lade('werkbank/Uebersicht.tsx');
const { UebersichtPanel } = await lade('werkbank/uebersicht/Uebersicht.tsx');
const { ordneMeldungen } = await import('../../shared/src/meldungen');

interface H {
  schluessel: string;
  art: string;
  ziel: string;
  knopf: string;
  text: React.ReactNode;
}
const stand = (x: Record<string, unknown>) => ({
  aufgaben: { offen: 0, ohneEmpfaenger: 0 },
  papierkorb: { anzahl: 0, aeltester: null, tage: 30 },
  fehlermeldungen: 0,
  texterkennung: null,
  version: { version: '0.290.4', commit: null },
  bestand: null,
  ...x,
});
const werkzeugHinweise = (u: Record<string, unknown>) =>
  (hinweiseAus(stand(u)) as H[]).filter((x) => x.schluessel.startsWith('werkzeug.') || x.schluessel === 'schriften.fehlen');
const text = (x: H) => renderToStaticMarkup(h(DatenProvider, null, x.text));

describe('Werkbank-Übersicht: fehlende eingebaute Werkzeuge (#1312)', () => {
  it('je fehlendem Werkzeug ein Hinweis mit Folge, Abhilfe und dem Weg zu „Erneut prüfen“', () => {
    const w = werkzeugHinweise({ werkzeugeFehlen: ['poppler', 'qpdf'] });
    assert.deepEqual(
      w.map((x) => [x.schluessel, x.art]),
      [
        ['werkzeug.fehlt:poppler', 'schlecht'],
        ['werkzeug.fehlt:qpdf', 'warn'],
      ],
    );
    const p = text(w[0]);
    assert.ok(p.includes('<strong>Ein Werkzeug zum Lesen von PDFs fehlt.</strong>'), p);
    assert.ok(p.includes('keinen Text aus PDFs lesen'), 'Folge');
    assert.ok(p.includes('Das offizielle Ablago-Image bringt es mit'), 'Abhilfe');
    assert.ok(w.every((x) => x.ziel === '/werkbank/systemzustand#werkzeuge' && x.knopf === 'Ansehen und erneut prüfen'));
  });

  it('nach Schwere eingeordnet: Poppler rot vor gelben Meldungen', () => {
    const u = stand({ werkzeugeFehlen: ['qpdf', 'poppler'], fehlermeldungen: 2 });
    const offen = ordneMeldungen(hinweiseAus(u) as H[] as never, {}).offen as unknown as H[];
    assert.equal(offen[0].schluessel, 'werkzeug.fehlt:poppler');
    assert.ok(offen.slice(1).every((x) => x.art !== 'schlecht'));
  });

  it('ist alles da, steht nichts; die Ersatzschriften stehen genau einmal (auch mit schriftenFehlen)', () => {
    assert.deepEqual(werkzeugHinweise({ werkzeugeFehlen: [], schriftenFehlen: false }), []);
    assert.deepEqual(werkzeugHinweise({}), []);
    const s = werkzeugHinweise({ werkzeugeFehlen: ['schriften'], schriftenFehlen: true });
    assert.deepEqual(
      s.map((x) => [x.schluessel, x.art]),
      [['schriften.fehlen', 'warn']],
    );
    assert.equal(werkzeugHinweise({ schriftenFehlen: true }).length, 1, 'älterer Server: nur schriftenFehlen');
  });

  it('auf der Übersicht steht der Hinweis genau einmal, mit Knopf zum Systemzustand', () => {
    const s = stand({ werkzeugeFehlen: ['poppler'], akzeptiert: {} });
    const geordnet = ordneMeldungen(hinweiseAus(s) as never, {});
    const u = {
      stand: s,
      geordnet,
      fehler: undefined,
      laden: async () => {},
      akzeptieren: async () => {},
      einblenden: async () => {},
      erledigen: async () => {},
    };
    const html = renderToStaticMarkup(h(DatenProvider, null, h(UebersichtPanel, { u })));
    assert.equal(html.split('Ein Werkzeug zum Lesen von PDFs fehlt.').length - 1, 1, html);
    assert.match(html, /href="\/werkbank\/systemzustand#werkzeuge"[^>]*>Ansehen und erneut prüfen</);
    const leer = stand({ werkzeugeFehlen: [] });
    const ohne = renderToStaticMarkup(
      h(DatenProvider, null, h(UebersichtPanel, { u: { ...u, stand: leer, geordnet: ordneMeldungen(hinweiseAus(leer) as never, {}) } })),
    );
    assert.ok(!ohne.includes('Werkzeug'), 'ohne fehlendes Werkzeug kein Hinweis');
  });
});
