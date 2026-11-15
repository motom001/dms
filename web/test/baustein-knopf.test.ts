/**
 * Baustein Knopf (#968, #1210): Arten mit Klassen und `data-knopf` (Gefahr auf der Seite wie Neben, mit Symbol und
 * Rückfrage), gesperrt in zwei Formen (blass · gestrichelt mit Schloss, ⓘ und Erklärung, `aria-disabled`,
 * `aria-describedby`), „läuft“ (`aria-busy`, Beschriftung bleibt der Name), Knopf nur mit Symbol (`aria-label`),
 * Ergebnisbereich mit `role="status"`; dazu `istKnopfErgebnis`, `fehlerText`, die Anlege-Knöpfe (#989), der rot
 * gefüllte Bestätigungsknopf nur in der Rückfrage. Gezeichnet mit react-dom/server wie baustein-feld.test.ts.
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
const { Knopf, KnopfLink, knopfAussehen, istKnopfErgebnis, fehlerText, ErgebnisBlock, abfangen, sperreAus } = await lade('bausteine/index.ts');
const { BestaetigenKnopf } = await lade('bausteine/knopf/Knopf.tsx');
const { RueckfrageVorschau } = await lade('bausteine/rueckfrage/Rueckfrage.tsx');
const FRAGE = { titel: 'Notiz löschen?', text: 'Das lässt sich nicht rückgängig machen.', ja: 'Löschen' };
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
    const erwartet = { anlegen: 'knopf gruen', haupt: 'knopf primaer', neben: 'knopf', link: 'textknopf' } as const;
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

  it('Gefahr (#1210, Leitsatz 4 und 5): aussehen wie Neben, mit Symbol, öffnet die Rückfrage (aria-haspopup), nie submit', () => {
    const html = zeichne(h(Knopf, { art: 'gefahr', symbol: 'geloescht', rueckfrage: FRAGE, type: 'submit' }, 'Löschen'));
    assert.equal(attr(html, KNOPF, 'data-knopf'), 'gefahr');
    assert.equal(attr(html, KNOPF, 'class'), 'knopf baustein', 'auf der Seite nichts Rotes: keine Klasse gefahr');
    assert.equal(attr(html, KNOPF, 'aria-haspopup'), 'dialog');
    assert.equal(attr(html, KNOPF, 'type'), 'button', 'erst die Rückfrage, dann die Handlung');
    assert.match(html, /<span class="text"><svg class="sym"[^>]*>.*<\/svg>Löschen<\/span>/, 'Symbol vor der Beschriftung');
  });

  it('nichts zu tun (Leitsatz 6): gesperrt=true ist blass (disabled), ohne Erklärung, ohne ⓘ', () => {
    const ohne = zeichne(h(Knopf, { gesperrt: true }, 'Speichern'));
    assert.match(ohne, /<button[^>]*disabled=""/);
    assert.equal(attr(ohne, KNOPF, 'aria-disabled'), undefined);
    assert.doesNotMatch(ohne, /class="warum"|class="sr"|schloss/);
    // false, '' und null heißen: nicht gesperrt.
    for (const gesperrt of [false, '', null]) assert.equal(attr(zeichne(h(Knopf, { gesperrt }, 'Los')), KNOPF, 'aria-disabled'), undefined);
    assert.equal(sperreAus(true), null);
    assert.deepEqual(sperreAus('Grund.'), { grund: 'Grund.' });
  });

  it('gesperrt aus einem Grund (Leitsatz 6): gestrichelt mit Schloss, erreichbar, Grund am Knopf, ⓘ daneben; kein Satz in der Zeile', () => {
    const mit = zeichne(h(Knopf, { gesperrt: 'Erst speichern, dann abrufen.', onClick: nichts }, 'Jetzt abrufen'));
    assert.doesNotMatch(mit, /<button[^>]*disabled=""/);
    assert.equal(attr(mit, KNOPF, 'aria-disabled'), 'true');
    assert.match(attr(mit, KNOPF, 'class') ?? '', /\bgesperrt\b/);
    assert.equal(attr(mit, KNOPF, 'aria-expanded'), 'false');
    const knopfId = attr(mit, KNOPF, 'id');
    const grund = attr(mit, KNOPF, 'aria-describedby');
    assert.ok(knopfId && grund);
    // Grund für Screenreader am Knopf, sichtbar erst in der Erklärung (kein langer Satz in der Zeile).
    assert.match(mit, new RegExp(`<span id="${grund}" class="sr">Erst speichern, dann abrufen\\.</span>`));
    assert.match(mit, /<path d="M7 11V7a5 5 0 0 1 10 0v4"><\/path>/, 'Schloss im Knopf');
    const info = /<button type="button" class="warum"[^>]*>/.exec(mit)?.[0] ?? '';
    assert.match(info, new RegExp(`aria-labelledby="[^"]+ ${knopfId}"`), 'ⓘ heißt „Warum gesperrt? <Knopf>“');
    assert.match(mit, /hidden="">Warum gesperrt\?<\/span>/);
    assert.doesNotMatch(mit, /role="region"/, 'Erklärung erst auf Klick');
  });

  it('Erklärung am Knopf: Grund, betroffene Einträge, „und n weitere“, „Stattdessen“ mit Knöpfen; Gefahr gesperrt ohne Rückfrage', () => {
    const sperre = { grund: 'Zwei Verträge verweisen auf diese Mappe.', titel: 'Löschen geht nicht:', eintraege: ['Stromvertrag', 'Wasser'], weitere: 3, stattdessen: h(Knopf, { groesse: 'klein' }, 'Mit verknüpften Mappen löschen …') };
    const html = zeichne(h(Knopf, { art: 'gefahr', symbol: 'geloescht', rueckfrage: FRAGE, gesperrt: sperre, erklaerungOffen: true }, 'Mappe löschen'));
    assert.equal(attr(html, KNOPF, 'aria-expanded'), 'true');
    assert.equal(attr(html, KNOPF, 'aria-haspopup'), undefined, 'gesperrt öffnet keine Rückfrage');
    const region = attr(html, KNOPF, 'aria-controls');
    assert.match(html, new RegExp(`<div id="${region}" role="region"[^>]*><p><strong>Löschen geht nicht:</strong> Zwei Verträge verweisen auf diese Mappe\\.</p><ul><li>Stromvertrag</li><li>Wasser</li><li class="leise">und 3 weitere</li></ul>`));
    assert.match(html, /<p class="leise">Stattdessen:<\/p><div class="wegknoepfe"><button[^>]*data-knopf="neben"[^>]*>.*Mit verknüpften Mappen löschen …/);
    assert.doesNotMatch(html, /M3 6h18/, 'Schloss statt Papierkorb');
  });

  it('rot gefüllt nur in der Rückfrage (Leitsatz 5): Bestätigungsknopf „entscheidung“, „Abbrechen“ als Neben', () => {
    assert.match(zeichne(h(BestaetigenKnopf, { gefahr: true }, 'Löschen')), /^<button type="submit" class="knopf gefahr baustein" data-knopf="entscheidung">/);
    assert.match(zeichne(h(BestaetigenKnopf, {}, 'Weiter')), /^<button type="submit" class="knopf primaer baustein" data-knopf="haupt">/);
    const vorschau = zeichne(h(RueckfrageVorschau, { r: { ...FRAGE, gefahr: true } }));
    assert.match(vorschau, /class="rueckfrage gefahr vorschau"/);
    assert.match(vorschau, /<button[^>]*data-knopf="neben"[^>]*>.*Abbrechen.*<button type="submit" class="knopf gefahr baustein" data-knopf="entscheidung">/);
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
    assert.match(html, />\+ /, 'Anlegen beginnt mit „+“ (Leitsatz 2)');
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
