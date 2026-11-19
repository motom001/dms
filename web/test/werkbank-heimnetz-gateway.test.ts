/**
 * Werkbank-Übersicht (#1355), gezeichnet mit react-dom/server, ohne Browser: Kommen Anfragen mit der Gateway-Adresse des
 * eigenen Netzes an (Heimnetz nicht bestimmbar), steht auf der Startseite der Werkbank genau ein gelber Hinweis mit der
 * Adresse, der Abhilfe und dem Weg zum Notfallzugang. Ohne solche Anfragen steht dort nichts.
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
  version: { version: '0.298.2', commit: null },
  bestand: null,
  ...x,
});
const gateway = (u: Record<string, unknown>) => (hinweiseAus(stand(u)) as H[]).filter((x) => x.schluessel === 'heimnetz.gateway');
const text = (x: H) => renderToStaticMarkup(h(DatenProvider, null, x.text));

describe('Werkbank-Übersicht: Heimnetz nicht bestimmbar (#1355)', () => {
  it('ein gelber Hinweis mit Adresse, Abhilfe und dem Weg zum Notfallzugang', () => {
    const w = gateway({ heimnetzGateway: { adresse: '172.17.0.1', zuletzt: '2026-11-19T10:00:00.000Z' } });
    assert.deepEqual(
      w.map((x) => [x.schluessel, x.art, x.ziel, x.knopf]),
      [['heimnetz.gateway', 'warn', '/werkbank/anmeldeschutz#notfallzugang', 'Zum Notfallzugang']],
    );
    const p = text(w[0]);
    assert.ok(p.includes('<strong>Ablago kann Heimnetz und Internet nicht unterscheiden.</strong>'), p);
    assert.ok(p.includes('172.17.0.1'), 'Adresse');
    assert.ok(p.includes('Userland-Proxy') && p.includes('X-Forwarded-For') && p.includes('macvlan'), 'Abhilfe');
  });

  it('ohne Anfragen vom Gateway (oder von einem älteren Server) kein Hinweis', () => {
    assert.deepEqual(gateway({ heimnetzGateway: null }), []);
    assert.deepEqual(gateway({}), []);
  });

  it('lässt sich zur Kenntnis nehmen wie andere gelbe Meldungen', () => {
    const u = stand({ heimnetzGateway: { adresse: '172.17.0.1', zuletzt: '2026-11-19T10:00:00.000Z' } });
    const akzeptiert = { 'heimnetz.gateway': { art: 'warn', von: 'lena@example.org', am: '2026-11-19T11:00:00.000Z', grund: 'bekannt' } };
    const geordnet = ordneMeldungen(hinweiseAus(u) as never, akzeptiert as never) as unknown as { offen: H[]; akzeptiert: H[] };
    assert.ok(!geordnet.offen.some((x) => x.schluessel === 'heimnetz.gateway'));
    assert.ok(geordnet.akzeptiert.some((x) => x.schluessel === 'heimnetz.gateway'));
  });
});
