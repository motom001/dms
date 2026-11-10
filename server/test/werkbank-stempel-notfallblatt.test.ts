/**
 * Werkbank (#990, #993), gezeichnet mit react-dom/server, ohne Browser:
 *   - Stempel: Vorlagen in der Mitte mit „+ Neu“ (grün), Klick führt auf /werkbank/stempel/:id, rechts die Vorlage
 *     mit Live-Vorschau und Speicherleiste (Gefahr-Link links).
 *   - Notfallblatt nur unter Verschlüsselung: Sicherung ohne eigenen Abschnitt, nur Hinweis und Link „Zum Notfallblatt“;
 *     auch die Übersicht führt mit diesem Hinweis zur Verschlüsselung.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { register } from 'node:module';

// `tokens.css?raw` (design.ts, #966) wie in Vite als Text laden.
register(new URL('./css-roh-lader.mjs', import.meta.url));

const g = globalThis as Record<string, unknown>;
const speicher = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};
g.location = new URL('http://127.0.0.1/werkbank/stempel');
g.localStorage = speicher();
g.sessionStorage = speicher();
g.addEventListener = () => {};
g.removeEventListener = () => {};
g.dispatchEvent = () => true;
g.window = globalThis;
g.document = { title: '', querySelector: () => null, documentElement: { lang: 'de', dataset: {}, style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {} }) };
g.React = React;
const WEB = new URL('../../web/src/', import.meta.url).href;
const lade = (pfad: string): Promise<any> => import(WEB + pfad); // eslint-disable-line @typescript-eslint/no-explicit-any -- Module der Oberfläche, je Pfad ein anderes
const { DatenProvider } = await lade('daten.tsx');
const { StempelListe, StempelEditor } = await lade('werkbank/Stempel.tsx');
const { SicherungPanel, sicherungsHinweise } = await lade('werkbank/Sicherung.tsx');
const { Notfallblatt } = await lade('werkbank/Verschluesselung.tsx');
const { hinweiseAus } = await lade('werkbank/Uebersicht.tsx');
const { STANDARD_VORLAGEN } = await import('../../shared/src/stempel');

const zeichne = (el: React.ReactElement) => renderToStaticMarkup(h(DatenProvider, null, el));
const stempelZ = (liste: unknown[] | null) => ({ liste, fehler: undefined, laden: async () => {}, setListe: () => {} });

describe('Werkbank → Stempel in der Dreiteilung (#990)', () => {
  const liste = STANDARD_VORLAGEN;
  it('Mitte: „+ Neu“ grün oben, je Vorlage Name, Text und Lage als Link auf die Vorlage', () => {
    const html = zeichne(h(StempelListe, { z: stempelZ(liste), offen: 'kopie' }));
    assert.match(html, /<a[^>]*href="\/werkbank\/stempel\/neu"[^>]*class="knopf gruen klein"[^>]*>\+ Neu<\/a>|<a[^>]*class="knopf gruen klein"[^>]*href="\/werkbank\/stempel\/neu"[^>]*>\+ Neu<\/a>/);
    for (const v of liste) assert.ok(html.includes(`href="/werkbank/stempel/${v.id}"`), v.id);
    assert.equal(html.match(/eintrag werk an/g)?.length, 1, 'nur die offene Vorlage ist markiert');
    assert.ok(html.includes('Kopie für {empfänger} – {datum}'), 'Text mit Platzhaltern');
    assert.ok(html.includes('Diagonal'), 'Lage ohne Klammerzusatz');
    assert.ok(!html.includes('aufklappliste'), 'keine Aufklappliste mehr');
  });

  it('Mitte: „neu“ steht als ungespeicherter Eintrag oben, ohne Vorlagen ein Hinweis', () => {
    assert.ok(zeichne(h(StempelListe, { z: stempelZ(liste), offen: 'neu' })).includes('noch nicht gespeichert'));
    assert.ok(zeichne(h(StempelListe, { z: stempelZ([]) })).includes('Noch keine Vorlage.'));
  });

  it('rechts: Vorlage mit Einstellungen, Vorschau, Speicherleiste und „Vorlage löschen“ links', () => {
    const html = zeichne(h(StempelEditor, { z: stempelZ(liste), id: 'kopie' }));
    assert.ok(html.includes(`<h1>${liste[0].name}</h1>`));
    assert.ok(html.includes('class="blatt stempeleditor"'));
    assert.ok(html.includes('id="stempel-text"') && html.includes('id="stempel-lage"'));
    assert.ok(html.includes('stempelvorschau'), 'Live-Vorschau (#799)');
    assert.ok(html.includes('speicherleiste'));
    assert.ok(html.includes('textknopf gefahr'), 'Löschen als Gefahr-Link links');
  });

  it('rechts: neue Vorlage ohne Löschen; unbekannte Vorlage mit Hinweis', () => {
    const neu = zeichne(h(StempelEditor, { z: stempelZ(liste), id: 'neu' }));
    assert.ok(neu.includes('<h1>Neue Vorlage</h1>'));
    assert.ok(!neu.includes('textknopf gefahr'));
    assert.ok(zeichne(h(StempelEditor, { z: stempelZ(liste), id: 'gibtsnicht' })).includes('Diese Vorlage gibt es nicht (mehr).'));
  });
});

const NB = { am: '2026-11-01T10:00:00Z', von: 'Lena Beispiel', fingerabdruck: 'AAAA-BBBB', aktuell: true, grund: null };
const zustand = (nb: Record<string, unknown>) => ({
  letzte: { name: 's1', ende: '2026-11-09T02:00:00Z', art: 'automatisch' }, fehler: null, zuAlt: false, planAktiv: true,
  notfallblatt: { ...NB, ...nb }, schluessel: true, fingerabdruck: 'AAAA-BBBB',
  ort: { ordner: '/data/sicherung', volume: true, gleichePlatte: false },
});
const stand = (nb: Record<string, unknown>) => ({
  lauf: null, liste: [], zustand: zustand(nb),
  plan: { aktiv: true, uhrzeit: '02:00', haeufigkeit: 'taeglich', wochentag: 1, aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 }, mindestFreiGB: 1, aktivSeit: null },
  speicher: { dateienBytes: 1, dateien: 1, datenbankBytes: 1, sicherungenBytes: 1, anzahl: 0, frei: 10 ** 10, gesamt: 10 ** 11, hochrechnung: { stueck: 1, bytes: 1 }, mindestBytes: 1, knapp: false },
});
const sicherung = (nb: Record<string, unknown>) => renderToStaticMarkup(h(SicherungPanel, { z: { stand: stand(nb), fehler: undefined, laden: async () => {}, setStand: () => {} } }));

describe('Notfallblatt nur unter Verschlüsselung (#993)', () => {
  it('Sicherung hat keinen Abschnitt „Notfallblatt“ und keinen Knopf zum Herunterladen', () => {
    const html = sicherung({});
    assert.ok(!html.includes('id="notfallblatt"'));
    assert.ok(!html.includes('/api/werkbank/notfallblatt'));
    // Die Zeile im Zustand bleibt – als Link zur Verschlüsselung.
    assert.match(html, /href="\/werkbank\/verschluesselung#notfallblatt"[^>]*>Notfallblatt heruntergeladen/);
    assert.ok(!html.includes('Zum Notfallblatt'), 'ohne Grund kein Hinweis');
  });

  for (const [fall, nb] of [['fehlt', { aktuell: false, am: null, grund: 'fehlt' }], ['veraltet', { aktuell: false, grund: 'schluessel' }], ['Notfallcode benutzt', { aktuell: false, grund: 'benutzt' }]] as const) {
    it(`Sicherung: Hinweis mit „Zum Notfallblatt“, wenn es ${fall}`, () => {
      const html = sicherung(nb);
      assert.match(html, /<a[^>]*href="\/werkbank\/verschluesselung#notfallblatt"[^>]*>Zum Notfallblatt<\/a>/);
      assert.ok(!html.includes('/api/werkbank/notfallblatt'), 'Herunterladen nur unter Verschlüsselung');
      const hinweis = sicherungsHinweise(zustand(nb)).find((x: { schluessel: string }) => x.schluessel === 'sicherung.notfallblatt');
      assert.equal(hinweis?.ziel, '/werkbank/verschluesselung#notfallblatt');
    });
  }

  it('Übersicht: der Hinweis führt zur Verschlüsselung, andere Sicherungshinweise zur Sicherung', () => {
    const u = { sicherung: { ...zustand({ aktuell: false, grund: 'benutzt' }), zuAlt: true }, aufgaben: { offen: 0, ohneEmpfaenger: 0 } };
    const hw = hinweiseAus(u) as Array<{ schluessel: string; ziel: string; knopf: string }>;
    const nb = hw.find((x) => x.schluessel === 'sicherung.notfallblatt')!;
    assert.equal(nb.ziel, '/werkbank/verschluesselung#notfallblatt');
    assert.equal(nb.knopf, 'Zum Notfallblatt');
    assert.equal(hw.find((x) => x.schluessel === 'sicherung.alt')?.ziel, '/werkbank/sicherung');
  });

  it('Verschlüsselung: Abschnitt mit Stand, Hinweis und Herunterladen', () => {
    const da = renderToStaticMarkup(h(Notfallblatt, { stand: NB, schluessel: true, geladen() {} }));
    assert.ok(da.includes('id="notfallblatt"'));
    assert.ok(da.includes('href="/api/werkbank/notfallblatt"'));
    assert.ok(da.includes('Lena Beispiel'));
    const benutzt = renderToStaticMarkup(h(Notfallblatt, { stand: { ...NB, aktuell: false, grund: 'benutzt' }, schluessel: true, geladen() {} }));
    assert.ok(benutzt.includes('Der Notfallcode auf dem Notfallblatt wurde benutzt.'));
    const fehlt = renderToStaticMarkup(h(Notfallblatt, { stand: { ...NB, am: null, von: null, aktuell: false, grund: 'fehlt' }, schluessel: true, geladen() {} }));
    assert.ok(fehlt.includes('Das Notfallblatt fehlt.'));
  });
});
