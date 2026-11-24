/**
 * Werkbank-Übersicht (#1511), gezeichnet mit react-dom/server, ohne Browser: nach einer Neueinrichtung ohne Pakete genau
 * ein Paket-Hinweis „Empfohlene Pakete“ – je Paket eine Zeile mit „Installieren“, darunter „Alle Pakete ansehen“; kein
 * Umstiegs-Hinweis („wieder“), kein „Aus der Einrichtung übersprungen: Pakete“, kein Hinweis zu Benachrichtigungen.
 * Installierte verschwinden, sind alle da, verschwindet der Hinweis. Bei einem Update von früher bleibt der
 * Umstiegs-Hinweis zur Texterkennung, und sie steht nicht noch einmal in der Liste. Einheitliche Knöpfe: Handlung,
 * „Zur Kenntnis nehmen“ (bei reinen Hinweisen „Ausblenden“, #1587), „Nein, danke“ (bzw. „Gelesen“) – kein „Verstanden“.
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

interface H {
  schluessel: string;
  art: string;
  ziel: string;
  knopf: string;
  text: React.ReactNode;
  erledigen?: string;
  eigeneKnoepfe?: boolean;
}
const stand = (x: Record<string, unknown>) => ({
  aufgaben: { offen: 0, ohneEmpfaenger: 0 },
  papierkorb: { anzahl: 0, aeltester: null, tage: 30 },
  fehlermeldungen: 0,
  texterkennung: null,
  version: { version: '0.306.0', commit: null },
  bestand: null,
  mail: true,
  ...x,
});
/** Frisch eingerichtet, Pakete übersprungen, keine Automatisierung „Zusammenfassung“. */
const NEU = {
  umstieg: false,
  texterkennungPaket: false,
  empfohlenFehlt: ['texterkennung', 'benachrichtigungen'],
  einrichtung: { offen: false, erledigt: [], uebersprungen: ['pakete'] },
  automatisierungen: { angehalten: [], fehlgeschlagen: 0, ohneBenachrichtigungen: true, ohnePostFuerDich: true, aufrufe: [] },
};
const hinweise = (u: Record<string, unknown>) => hinweiseAus(stand(u)) as H[];
const text = (x: H) => renderToStaticMarkup(h(DatenProvider, null, x.text));
const paketHinweise = (l: H[]) => l.filter((x) => /Paket/.test(text(x)) || x.ziel.startsWith('/werkbank/pakete'));

describe('Werkbank-Übersicht: Empfohlene Pakete (#1511)', () => {
  it('Neueinrichtung ohne Pakete: genau ein Paket-Hinweis, je Paket eine Zeile mit „Installieren“', () => {
    const p = paketHinweise(hinweise(NEU));
    assert.deepEqual(
      p.map((x) => x.schluessel),
      ['pakete.empfohlen'],
    );
    const t = text(p[0]);
    assert.ok(t.includes('<strong>Empfohlene Pakete.</strong>'), t);
    assert.ok(t.includes('Texterkennung</strong> – damit Scans durchsuchbar werden.'), t);
    assert.ok(t.includes('Benachrichtigungen</strong> – tägliche Zusammenfassung, Post für dich.'), t);
    assert.ok(t.indexOf('Texterkennung') < t.indexOf('Benachrichtigungen'), 'feste Reihenfolge');
    assert.equal(t.match(/>Installieren</g)?.length, 2, 'derselbe Knopf je Zeile');
    assert.ok(t.includes('href="/werkbank/pakete?installieren=texterkennung"'), 'derselbe Ablauf wie „Installieren per Link“');
    assert.ok(t.includes('>Alle Pakete ansehen</a>'));
    assert.ok(!/wieder/.test(t), 'kein Umstieg nach einer Neueinrichtung');
    assert.equal(p[0].eigeneKnoepfe, true, 'kein zweiter Hauptknopf');
    assert.equal(p[0].art, 'info');
  });

  it('nach dem E-Mail-Versand; installierte verschwinden, alle installiert: kein Hinweis', () => {
    const l = hinweise({ ...NEU, mail: false, empfohlenFehlt: ['benachrichtigungen'] });
    const keys = l.map((x) => x.schluessel);
    assert.ok(keys.indexOf('mail') < keys.indexOf('pakete.empfohlen'));
    assert.ok(!text(l.find((x) => x.schluessel === 'pakete.empfohlen')!).includes('Texterkennung'));
    const alle = {
      ...NEU,
      empfohlenFehlt: [],
      texterkennungPaket: true,
      automatisierungen: { ...NEU.automatisierungen, ohneBenachrichtigungen: false, ohnePostFuerDich: false },
    };
    assert.deepEqual(paketHinweise(hinweise(alle)), []);
  });

  it('Warten Scans auf die Texterkennung, wird der Hinweis gelb und nennt sie', () => {
    const x = hinweise({ ...NEU, texterkennung: { keiner: 0, wartet: 0, laeuft: 0, fertig: 0, fehler: 0, ausgelassen: 0, paket: 3 } }).find(
      (y) => y.schluessel === 'pakete.empfohlen',
    )!;
    assert.equal(x.art, 'warn');
    assert.ok(text(x).includes('3 Dokumente warten darauf.'));
  });

  it('Update von einer älteren Version: Umstiegs-Hinweis zur Texterkennung, sie steht nicht doppelt in der Liste', () => {
    const l = paketHinweise(hinweise({ ...NEU, umstieg: true }));
    assert.deepEqual(
      l.map((x) => x.schluessel),
      ['pakete.empfohlen', 'texterkennung.paket'],
    );
    assert.ok(!text(l[0]).includes('Texterkennung'));
    assert.ok(text(l[1]).includes('wieder'));
  });

  it('Knöpfe einheitlich: nur Handlung, „Ausblenden“ (reine Hinweise, #1587), „Nein, danke“ bzw. „Gelesen“', () => {
    const l = hinweise({
      ...NEU,
      kiTypen: { pakete: [{ id: 'ki', name: 'KI' }] },
      darfNeu: true,
      zweitePerson: true,
      notfallcodeBenutzt: [{ id: 'n', benutzerId: 'b', name: 'Lena', am: '2026-11-20T08:00:00Z' }],
    });
    const erledigen = new Set(l.flatMap((x) => (x.erledigen ? [x.erledigen] : [])));
    assert.deepEqual([...erledigen].sort(), ['Ausblenden', 'Gelesen', 'Nein, danke']);
    assert.ok(!l.some((x) => x.knopf === 'Verstanden' || x.erledigen === 'Verstanden'));
    const darf = l.find((x) => x.schluessel === 'darf.neu')!;
    assert.ok(text(darf).includes('Neu: Was Ablago darf – bitte einmal ansehen.'));
  });
});

describe('Werkbank-Übersicht: angehaltene und beschädigte Pakete (#1563, #1551)', () => {
  it('angehalten: ein gelber Hinweis mit Grund in Worten, ohne Stufennummer; beschädigt: Weg zu den Lösungen', () => {
    const l = hinweise({
      ...NEU,
      angehalten: [{ id: 'dienst', name: 'Dienst', grund: '„Dienst“ nutzt Dienste im Netz – das habt ihr nicht erlaubt.' }],
      beschaedigt: [{ id: 'kontakte', name: 'Kontakte' }],
    });
    const a = l.find((x) => x.schluessel === 'pakete.angehalten')!;
    assert.equal(a.art, 'warn');
    assert.equal(a.ziel, '/werkbank/pakete/dienst');
    assert.ok(text(a).includes('nutzt Dienste im Netz – das habt ihr nicht erlaubt.'));
    assert.ok(!/Stufe|\d/.test(text(a).replace(/1 Paket/, '')), 'keine Stufennummern');
    const b = l.find((x) => x.schluessel === 'pakete.beschaedigt')!;
    assert.equal(b.knopf, 'Paket reparieren');
    assert.ok(text(b).includes('„Kontakte“'));
  });
});
