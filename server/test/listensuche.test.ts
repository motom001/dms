/**
 * Suche in Listen (#978, #994): Logik in shared/src/listensuche.ts (Groß-/Kleinschreibung, Umlaut-Varianten, mehrere
 * Wörter, Fundstellen mit Ausschnitt, Varianten für #992, Paketfilter), der Baustein Suche (Suchfeld wie in der Ablage,
 * Suchfeld oben – Filter darunter – Trefferzahl, Fundstellen, „keine Treffer“) und worin die Werkbank-Listen suchen
 * (Mappentypen, Ansichten, Nummernkreise). Gezeichnet mit react-dom/server wie baustein-feld.test.ts; Beispiele erfunden.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ALLE_HERKUENFTE, ausschnitt, durchsuche, EIGENE, gefaltet, herkunftPasst, type Fundquelle } from '../../shared/src/listensuche';
import type { Feld, Mappentyp } from '../../shared/src/model';

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
const lade = (pfad: string): Promise<any> => import(WEB + pfad); // eslint-disable-line @typescript-eslint/no-explicit-any -- Module der Oberfläche, je Pfad ein anderes
const { Suchfeld, ListenSuche, Fundstellen, KeineTreffer, PaketFilter, FilterHaken, useListenSuche, Hervorgehoben } = await lade('bausteine/index.ts');
const { quellenTyp, quellenSicht, quellenKreis, paketVonTyp, paketVonSicht, paketVonKreis, paketWahl } = await lade('werkbank/listensuche.ts');
const zeichne = (e: ReactElement) => renderToStaticMarkup(e);
const nichts = () => {};

interface Eintrag { id: string; name: string; quellen: Fundquelle[] }
const e = (id: string, name: string, ...weitere: Array<[string, string]>): Eintrag => ({ id, name, quellen: [{ wo: '', text: name, titel: true }, ...weitere.map(([wo, text]) => ({ wo, text }))] });
const LISTE = [
  e('vertrag', 'Vertrag', ['Feld', 'Kündigen bis'], ['Feld „Kündigen bis“ · Hilfetext', 'Das Datum, bis zu dem du spätestens kündigen musst, damit sich der Vertrag nicht von selbst um ein weiteres Jahr verlängert.']),
  e('rechnung', 'Rechnung', ['Register', 'Zahlungen'], ['Paket', 'Haushalt']),
  e('strasse', 'Straßenverzeichnis'),
];
const ids = (x: Array<{ eintrag: Eintrag }>) => x.map((y) => y.eintrag.id);
const text = (teile: Array<{ text: string; treffer: boolean }>) => teile.map((x) => (x.treffer ? `[${x.text}]` : x.text)).join('');

describe('Suche in Listen: Logik (#978)', () => {
  it('ohne Suchwort alle in derselben Reihenfolge, ohne Fundstellen', () => {
    const r = durchsuche(LISTE, (x) => x.quellen, '   ');
    assert.deepEqual(ids(r), ['vertrag', 'rechnung', 'strasse']);
    assert.ok(r.every((x) => !x.funde.length && !x.titel));
  });

  it('ohne Groß-/Kleinschreibung, Akzente und mit Umlaut-Varianten (ü = u = ue, ß = ss)', () => {
    for (const wort of ['KÜNDIGEN', 'kundigen', 'kuendigen']) assert.deepEqual(ids(durchsuche(LISTE, (x) => x.quellen, wort)), ['vertrag'], wort);
    assert.deepEqual(ids(durchsuche(LISTE, (x) => x.quellen, 'strasse')), ['strasse']);
    assert.deepEqual(ids(durchsuche(LISTE, (x) => x.quellen, 'Straße')), ['strasse']);
    // Der Rückweg ins Original stimmt auch über ß und ue hinweg.
    const gf = gefaltet('Grüße Mueller');
    assert.equal(gf.s, 'grusse muller');
    assert.equal(gf.von.length, gf.s.length);
  });

  it('mehrere Wörter: jedes muss irgendwo im Eintrag stehen (auch in verschiedenen Quellen)', () => {
    assert.deepEqual(ids(durchsuche(LISTE, (x) => x.quellen, 'rechnung haushalt')), ['rechnung']);
    assert.deepEqual(ids(durchsuche(LISTE, (x) => x.quellen, 'rechnung kündigen')), []);
  });

  it('Treffer im Namen: hervorgehoben im Titel, nicht als eigene Fundstelle', () => {
    const [r] = durchsuche(LISTE, (x) => x.quellen, 'rech');
    assert.equal(text(r.titel!), '[Rech]nung');
    assert.deepEqual(r.funde, []);
  });

  it('Fundstellen: Bereich und Ausschnitt mit hervorgehobenem Suchwort, lange Texte gekürzt mit „…“', () => {
    const [r] = durchsuche(LISTE, (x) => x.quellen, 'kündigen');
    assert.equal(r.titel, undefined);
    assert.deepEqual(r.funde.map((f) => f.wo), ['Feld', 'Feld „Kündigen bis“ · Hilfetext']);
    assert.equal(text(r.funde[0].teile), '[Kündigen] bis');
    const hilfe = text(r.funde[1].teile);
    assert.match(hilfe, /^… .*spätestens \[kündigen\] musst.* …$/);
    assert.ok(hilfe.length < 110, hilfe);
  });

  it('Ausschnitt: kurze Texte ganz, Zeilenumbrüche als Leerzeichen', () => {
    assert.equal(text(ausschnitt('Zeile eins\nZeile zwei', [[6, 10]])), 'Zeile [eins] Zeile zwei');
  });

  it('Varianten je Suchwort (#992: gleichbedeutende Wörter) finden und markieren mit', () => {
    const varianten = (w: string) => (w.toLowerCase() === 'beleg' ? ['Rechnung'] : []);
    const [r] = durchsuche(LISTE, (x) => x.quellen, 'Beleg', { varianten });
    assert.equal(r.eintrag.id, 'rechnung');
    assert.equal(text(r.titel!), '[Rechnung]');
  });

  it('Herkunft: alle, nur eigene (ohne Paket) oder ein Paket', () => {
    assert.ok(herkunftPasst(ALLE_HERKUENFTE, 'haushalt') && herkunftPasst(ALLE_HERKUENFTE, null));
    assert.ok(herkunftPasst(EIGENE, null) && herkunftPasst(EIGENE, undefined) && !herkunftPasst(EIGENE, 'haushalt'));
    assert.ok(herkunftPasst('haushalt', 'haushalt') && !herkunftPasst('haushalt', null) && !herkunftPasst('haushalt', 'vertraege'));
  });
});

describe('Baustein Suche (#978, #994)', () => {
  it('Suchfeld wie in der Ablage: Klasse „suche“, Beschriftung für Screenreader, Platzhalter, Lupe; „×“ nur mit Inhalt', () => {
    const leer = zeichne(h(Suchfeld, { wert: '', setze: nichts, beschriftung: 'Mappentypen durchsuchen', platzhalter: 'Suchen in Name …' }));
    assert.match(leer, /^<div class="suche [^"]*"/);
    assert.match(leer, /<label[^>]*><span class="sr">Mappentypen durchsuchen<\/span><svg[^>]*aria-hidden="true"[^>]*>.*<input type="search" placeholder="Suchen in Name …" value=""\/><\/label>/);
    assert.doesNotMatch(leer, /<button/);
    const voll = zeichne(h(Suchfeld, { wert: 'kündigen', setze: nichts, beschriftung: 'Mappentypen durchsuchen' }));
    assert.match(voll, /<\/label><button[^>]*aria-label="Suche leeren"/, 'der Knopf steht außerhalb der Beschriftung – sie bleibt der Name des Felds');
  });

  it('Muster „Suchfeld oben, Filter darunter“: Suchregion, Filtergruppe, Trefferzahl mit aria-live', () => {
    const html = zeichne(h(ListenSuche, { wert: 'x', setze: nichts, beschriftung: 'Ansichten durchsuchen', treffer: 12, aktiv: true, anzahl: '30 Ansichten',
      filter: h(FilterHaken, { an: true, setze: nichts }, 'Nur offene zeigen') }));
    assert.match(html, /role="search" aria-label="Ansichten durchsuchen"/);
    const feld = html.indexOf('type="search"');
    const filter = html.indexOf('role="group" aria-label="Filter"');
    const zahl = html.indexOf('aria-live="polite">12 Treffer<');
    assert.ok(feld > 0 && feld < filter && filter < zahl, html);
    assert.match(html, /<input type="checkbox" checked=""\/><span>Nur offene zeigen<\/span>/);
    // Ohne Suche und Filter steht die Anzahl, solange noch geladen wird nichts.
    assert.match(zeichne(h(ListenSuche, { wert: '', setze: nichts, beschriftung: 'B', treffer: 30, aktiv: false, anzahl: '30 Ansichten' })), /aria-live="polite">30 Ansichten</);
    assert.match(zeichne(h(ListenSuche, { wert: '', setze: nichts, beschriftung: 'B', treffer: null, aktiv: true })), /aria-live="polite"><\/p>/);
    assert.match(zeichne(h(ListenSuche, { wert: '', setze: nichts, beschriftung: 'B', treffer: 1, aktiv: true })), />1 Treffer</);
  });

  it('Fundstellen: die ersten zwei, dann „+ n weitere“; Treffer als <mark>', () => {
    const fund = (wo: string) => ({ wo, titel: false, teile: [{ text: 'bis ', treffer: false }, { text: 'kündigen', treffer: true }] });
    const html = zeichne(h(Fundstellen, { funde: [fund('Feld'), fund('Beschreibung'), fund('Register'), fund('Paket'), fund('Trefferliste')] }));
    assert.equal((html.match(/<mark/g) ?? []).length, 2);
    assert.match(html, />Feld<\/span>: <span>bis <\/span><mark[^>]*>kündigen<\/mark>/);
    assert.doesNotMatch(html, /Register/);
    assert.match(html, />\+ 3 weitere</);
    assert.equal(zeichne(h(Fundstellen, { funde: [] })), '');
    assert.equal(zeichne(h(Hervorgehoben, { text: 'Vertrag' })), 'Vertrag');
  });

  it('Paketfilter: „Alle“, „Eigene (ohne Paket)“ und die Pakete der Liste; ohne Pakete kein Filter', () => {
    assert.equal(zeichne(h(PaketFilter, { wert: '', setze: nichts, pakete: [], eigene: true })), '');
    const html = zeichne(h(PaketFilter, { wert: 'haushalt', setze: nichts, pakete: [{ id: 'haushalt', name: 'Haushalt' }], eigene: true }));
    assert.match(html, /<label[^>]*><span>Paket<\/span><select>/);
    assert.match(html, /<option value="">Alle<\/option><option value="-">Eigene \(ohne Paket\)<\/option><option value="haushalt" selected="">Haushalt<\/option>/);
    assert.doesNotMatch(zeichne(h(PaketFilter, { wert: '', setze: nichts, pakete: [{ id: 'haushalt', name: 'Haushalt' }], eigene: false })), /Eigene/);
  });

  it('Keine Treffer: ruhiger Satz und Weg zurück als Knopf', () => {
    const html = zeichne(h(KeineTreffer, { zuruecksetzen: nichts }));
    assert.match(html, /Keine Treffer\./);
    assert.match(html, /<button[^>]*data-knopf="link"[^>]*>.*Suche und Filter zurücksetzen/);
  });

  it('useListenSuche: Anfangszustand – alle Einträge, Paket-Ids der Liste und ob es eigene gibt', () => {
    let z: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Zustand des Hooks aus der Oberfläche
    const Probe = () => { z = useListenSuche(LISTE, { quellen: (x: Eintrag) => x.quellen, herkunft: (x: Eintrag) => (x.id === 'rechnung' ? 'haushalt' : null) }); return null; };
    zeichne(h(Probe));
    assert.equal(z.treffer.length, 3);
    assert.equal(z.aktiv, false);
    assert.deepEqual(z.paketeDa, ['haushalt']);
    assert.equal(z.eigeneDa, true);
  });
});

describe('Worin die Werkbank-Listen suchen (#978)', () => {
  const feld = (key: string, label: string, hilfe = ''): Feld => ({ key, label, typ: 'text', ...(hilfe ? { hilfe } : {}) }) as Feld;
  const rechnung = { id: 't-rechnung', name: 'Rechnung', beschreibung: '', felder: [feld('nr', 'Rechnungsnummer')], register: [], erstellt: '', geaendert: '', titelVorlage: '' } as unknown as Mappentyp;
  const position = {
    id: 't-pos', name: 'Rechnungsposition', beschreibung: 'Eine Zeile der Rechnung', titelVorlage: '', erstellt: '', geaendert: '', paket: 'haushalt',
    felder: [feld('kuendigen', 'Kündigen bis', 'Bis wann du kündigen musst.'), { key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTypen: ['t-rechnung'] } as unknown as Feld],
    register: [{ key: 'zahlungen', name: 'Zahlungen', art: 'dokumente' }],
    trefferlisten: [{ key: 'standard', name: 'Übersicht', spalten: ['kuendigen'], standard: true }],
    teilVon: 'rechnung',
    berechtigungen: { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [{ id: 'r1', name: 'Nur Eltern', wenn: [{ art: 'benutzer', benutzer: ['u-lena'] }], dann: { R: 'entziehen' }, stopp: false }] },
  } as unknown as Mappentyp;
  const typen = [rechnung, position];
  const pakete = [{ id: 'haushalt', name: 'Haushalt', typen: { position: 't-pos' }, sichten: { offen: 's-1' } }];
  const person = (id: string) => (id === 'u-lena' ? 'Lena Beispiel' : '');
  const fundorte = (q: Fundquelle[], wort: string) => durchsuche([q], (x) => x, wort)[0]?.funde.map((f) => f.wo) ?? [];

  it('Mappentyp: Felder samt Hilfetext, Register, Trefferliste, Berechtigung (Regel und Benutzer), Paket, gehört zu', () => {
    const q = quellenTyp(position, { pakete, typen, person });
    assert.deepEqual(fundorte(q, 'kündigen'), ['Feld', 'Feld „Kündigen bis“ · Hilfetext']);
    assert.deepEqual(fundorte(q, 'zahlung'), ['Register']);
    assert.deepEqual(fundorte(q, 'übersicht'), ['Trefferliste']);
    assert.deepEqual(fundorte(q, 'eltern'), ['Berechtigung']);
    assert.deepEqual(fundorte(q, 'lena'), ['Berechtigung „Nur Eltern“ · Benutzer']);
    assert.deepEqual(fundorte(q, 'haushalt'), ['Paket']);
    // Teil (#1031): über den Namen des übergeordneten Typs zu finden.
    assert.ok(fundorte(q, 'rechnung').includes('Gehört zu'));
    assert.equal(paketVonTyp(position, pakete), 'haushalt');
    assert.equal(paketVonTyp(rechnung, pakete), null);
  });

  it('Systemtypen tragen ihr Kennzeichen und sind mit „System“ zu finden – ohne feste Liste', () => {
    const post = { ...rechnung, id: 't-post', name: 'Post', system: 'post' } as Mappentyp;
    assert.deepEqual(fundorte(quellenTyp(post, { pakete, typen, person }), 'system'), ['Kennzeichen']);
  });

  it('Ansicht: Mappentyp, Spalten, Bedingungen (Feldname), Paket', () => {
    const sicht = { id: 's-1', name: 'Offene Posten', beschreibung: '', elternId: null, position: 0, typen: ['t-pos'], bedingungen: [{ art: 'feld', feld: 'kuendigen', op: 'leer' }], trefferliste: 'standard', erstellt: '', geaendert: '' };
    const q = quellenSicht(sicht, { pakete, typen });
    assert.deepEqual(fundorte(q, 'rechnungsposition'), ['Mappentyp']);
    assert.deepEqual(fundorte(q, 'kündigen'), ['Spalte', 'Bedingung']);
    assert.deepEqual(fundorte(q, 'haushalt'), ['Paket']);
    assert.equal(paketVonSicht(sicht, pakete), 'haushalt');
  });

  it('Nummernkreis: Kennung, Muster, Mappentyp und Feld, Paket über den Mappentyp', () => {
    const k = { schluessel: 'rechnungen', name: 'Rechnungsnummern', muster: '{jjjj}-R{zaehler:5}', start: 1, staende: {}, zuletzt: [], naechste: '2026-R00001', naechsterZaehler: 1, zeitraum: '2026', neubeginn: 'jaehrlich', verwendet: [{ typId: 't-pos', typ: 'Rechnungsposition', feldKey: 'nr', feld: 'Positionsnummer' }] };
    const q = quellenKreis(k, { pakete, typen });
    assert.deepEqual(fundorte(q, 'zaehler'), ['Muster']);
    assert.deepEqual(fundorte(q, 'positionsnummer'), ['Feld in Rechnungsposition']);
    assert.equal(paketVonKreis(k, typen, pakete), 'haushalt');
    assert.equal(paketVonKreis({ verwendet: [] }, typen, pakete), null);
    assert.deepEqual(paketWahl(['haushalt', 'fremd'], pakete), [{ id: 'fremd', name: 'fremd' }, { id: 'haushalt', name: 'Haushalt' }]);
  });
});
