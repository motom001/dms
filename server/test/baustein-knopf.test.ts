/**
 * Baustein Knopf (#968): Arten mit Klassen und `data-knopf`, gesperrt mit sichtbarem Grund (`aria-disabled`,
 * `aria-describedby`), „läuft“ (`aria-busy`, Beschriftung bleibt der Name), Knopf nur mit Symbol (`aria-label`),
 * Ergebnisbereich mit `role="status"`; dazu `istKnopfErgebnis`, `fehlerText` und die Anlege-Knöpfe (#989).
 * Gezeichnet mit react-dom/server wie baustein-feld.test.ts.
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
const lade = (pfad: string): Promise<any> => import(WEB + pfad); // eslint-disable-line @typescript-eslint/no-explicit-any -- Module der Oberfläche, je Pfad ein anderes
const { Knopf, KnopfLink, knopfAussehen, istKnopfErgebnis, fehlerText, ErgebnisBlock, abfangen } = await lade('bausteine/index.ts');
const { Kopf } = await lade('werkbank/Kopf.tsx');

const zeichne = (e: ReactElement) => renderToStaticMarkup(e);
const KNOPF = /<button[^>]*>/;
/** Wert eines Attributs am ersten Element, das auf das Muster passt. */
function attr(html: string, element: RegExp, name: string): string | undefined {
  const tag = element.exec(html)?.[0];
  assert.ok(tag, `Element ${element} fehlt in ${html}`);
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}
const nichts = () => {};

describe('Baustein Knopf (#968)', () => {
  it('Arten: feste Klassen und data-knopf; Vorgabe ist „neben“, type="button"', () => {
    const erwartet = { anlegen: 'knopf gruen', haupt: 'knopf primaer', neben: 'knopf', gefahr: 'knopf gefahr', link: 'textknopf' } as const;
    for (const [art, klasse] of Object.entries(erwartet)) {
      const html = zeichne(h(Knopf, { art }, 'Los'));
      assert.equal(attr(html, KNOPF, 'data-knopf'), art);
      assert.ok(attr(html, KNOPF, 'class')?.startsWith(`${klasse} `), `${art}: ${attr(html, KNOPF, 'class')}`);
    }
    const html = zeichne(h(Knopf, { groesse: 'klein' }, 'Los'));
    assert.equal(attr(html, KNOPF, 'data-knopf'), 'neben');
    assert.equal(attr(html, KNOPF, 'type'), 'button');
    assert.match(attr(html, KNOPF, 'class') ?? '', /\bklein\b/);
  });

  it('ohne Handler kein Ergebnisbereich; mit Handler ein leerer Bereich mit role="status"', () => {
    assert.doesNotMatch(zeichne(h(Knopf, { type: 'submit' }, 'Speichern')), /role="status"/);
    const html = zeichne(h(Knopf, { onClick: nichts }, 'Jetzt prüfen'));
    assert.match(html, /<\/button><span id="[^"]+" role="status" aria-live="polite" class="ergebnis"><\/span>/);
    assert.equal(attr(html, KNOPF, 'aria-describedby'), undefined, 'Leeres Ergebnis beschreibt nichts');
  });

  it('gesperrt ohne Grund: disabled; mit Grund: erreichbar, aria-disabled und sichtbarer Grund über aria-describedby', () => {
    const ohne = zeichne(h(Knopf, { gesperrt: true }, 'Speichern'));
    assert.match(ohne, /<button[^>]*disabled=""/);
    assert.equal(attr(ohne, KNOPF, 'aria-disabled'), undefined);
    const mit = zeichne(h(Knopf, { gesperrt: 'Erst speichern, dann abrufen.' }, 'Jetzt abrufen'));
    assert.doesNotMatch(mit, /<button[^>]*disabled=""/);
    assert.equal(attr(mit, KNOPF, 'aria-disabled'), 'true');
    const grund = attr(mit, KNOPF, 'aria-describedby');
    assert.ok(grund);
    assert.match(mit, new RegExp(`<span id="${grund}" class="grund">Erst speichern, dann abrufen\\.</span>`));
    // false heißt: nicht gesperrt.
    assert.equal(attr(zeichne(h(Knopf, { gesperrt: false }, 'Los')), KNOPF, 'aria-disabled'), undefined);
  });

  it('läuft: aria-busy und aria-disabled, nicht disabled (Fokus bleibt); Beschriftung bleibt, „Läuft …“ nur zu sehen', () => {
    const html = zeichne(h(Knopf, { laeuft: true, gesperrt: true }, 'Jetzt prüfen'));
    assert.equal(attr(html, KNOPF, 'aria-busy'), 'true');
    assert.equal(attr(html, KNOPF, 'aria-disabled'), 'true');
    assert.doesNotMatch(html, /<button[^>]*disabled=""/);
    assert.match(html, /<span class="text">Jetzt prüfen<\/span>/);
    assert.match(html, /<span class="laeuft" aria-hidden="true"><span class="kreisel"><\/span><span class="laeufttext">Läuft …<\/span><\/span>/);
    assert.match(zeichne(h(Knopf, { laeuft: true, laeuftText: 'Prüft …' }, 'Jetzt prüfen')), />Prüft …</);
  });

  it('nur Symbol: aria-label und title', () => {
    const html = zeichne(h(Knopf, { nurSymbol: 'Neu laden' }, h('svg', { 'aria-hidden': 'true' })));
    assert.equal(attr(html, KNOPF, 'aria-label'), 'Neu laden');
    assert.equal(attr(html, KNOPF, 'title'), 'Neu laden');
  });

  it('Ergebnis von außen: im Bereich unter dem Knopf, verknüpft über aria-describedby', () => {
    const html = zeichne(h(Knopf, { ergebnis: { art: 'schlecht', text: 'Der Server antwortet nicht.' } }, 'Verbindung testen'));
    const id = attr(html, KNOPF, 'aria-describedby');
    assert.ok(id);
    assert.match(html, new RegExp(`<span id="${id}" role="status" aria-live="polite" data-ergebnis="schlecht" class="ergebnis schlecht">.*Der Server antwortet nicht\\.`));
  });

  it('KnopfLink und knopfAussehen: Anlege-Knopf mit data-knopf="anlegen" (#989)', () => {
    const html = zeichne(h(KnopfLink, { to: '/werkbank/benutzer/neu', art: 'anlegen', groesse: 'klein' }, '+ Neu'));
    assert.match(html, /^<a href="\/werkbank\/benutzer\/neu"[^>]*class="knopf gruen klein baustein"[^>]*data-knopf="anlegen"[^>]*>\+ Neu<\/a>$/);
    assert.deepEqual(knopfAussehen({ art: 'anlegen' }), { className: 'knopf gruen baustein', 'data-knopf': 'anlegen' });
  });

  it('istKnopfErgebnis und fehlerText', () => {
    assert.ok(istKnopfErgebnis({ art: 'gut', text: 'Geprüft.' }));
    assert.ok(!istKnopfErgebnis(true));
    assert.ok(!istKnopfErgebnis({ art: 'super', text: 'x' }));
    assert.equal(fehlerText(new Error('Kein Netz.')), 'Kein Netz.');
    assert.equal(fehlerText(undefined), 'Das hat nicht geklappt. Bitte noch einmal versuchen.');
  });

  it('ErgebnisBlock: steht immer im Dokument, mit aria-live', () => {
    assert.equal(zeichne(h(ErgebnisBlock, { anlass: null })), '<div aria-live="polite" class="block"></div>');
  });
});

describe('abfangen: asynchrone Handler ohne Knopf (#1011)', () => {
  it('gibt kein Promise zurück, ruft sofort auf und leitet einen Fehler an die Meldung der Stelle', async () => {
    const meldungen: string[] = [];
    let verhindert = false;
    const handler = abfangen(async (e: { preventDefault(): void }) => { e.preventDefault(); await Promise.resolve(); throw new Error('Kein Netz.'); }, (text: string) => meldungen.push(text));
    assert.equal(handler({ preventDefault: () => { verhindert = true; } }), undefined);
    assert.ok(verhindert, 'preventDefault läuft sofort, noch bevor das Promise fertig ist');
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(meldungen, ['Kein Netz.']);
  });

  it('auch ein Fehler vor dem ersten await und einer ohne Text landen in der Meldung; ohne Fehler keine', async () => {
    const meldungen: string[] = [];
    abfangen(() => { throw new Error('Sofort.'); }, (text: string) => meldungen.push(text))();
    abfangen(() => Promise.reject(new Error('')), (text: string) => meldungen.push(text))();
    abfangen(async () => 'gut', (text: string) => meldungen.push(text))();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(meldungen, ['Sofort.', 'Das hat nicht geklappt. Bitte noch einmal versuchen.']);
  });
});

describe('Kopf einer Werkbank-Seite: Hilfe hinter der Überschrift (#985)', () => {
  it('h1 und Abschnitts-h2 tragen das „?“ direkt hinter dem Titel, die Beschreibung bleibt ohne', () => {
    const seite = zeichne(h(Kopf, { titel: 'Eingangsordner', hilfe: 'werkbank.eingangsordner' }, h('p', { className: 'leise' }, 'Jede fertige Datei wird eine Post.')));
    assert.match(seite, /<h1>Eingangsordner <a class="hilfesymbol"[^>]*><span aria-hidden="true">\?<\/span><\/a><\/h1><p class="leise">Jede fertige Datei wird eine Post\.<\/p>/);
    const abschnitt = zeichne(h(Kopf, { titel: 'Wartungsmodus', abschnitt: true, id: 'wartungsmodus', hilfe: 'werkbank.wartungsmodus' }));
    assert.match(abschnitt, /<div class="teilkopf" id="wartungsmodus"><h2>Wartungsmodus <a class="hilfesymbol"/);
    assert.match(zeichne(h(Kopf, { titel: 'Region' })), /<h1>Region<\/h1>/, 'ohne hilfe kein „?“');
  });
});
