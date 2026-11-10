/**
 * Baustein Feld (#967): Der Rahmen verknüpft Beschriftung, Eingabe, Hinweis und Fehler – `id`/`htmlFor`,
 * `aria-describedby`, `aria-invalid`, Fehlerbereich mit `aria-live`, „(optional)“ und das Hilfesymbol außerhalb der
 * Beschriftung. Gezeichnet mit react-dom/server wie in einrichtung-ohne-konto.test.ts; dazu die umgestellte
 * `Eingabe` der Paket-Einstellungen.
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
const { Feld, HakenFeld, FeldGruppe } = await lade('bausteine/index.ts');
const { Eingabe } = await lade('werkbank/PaketEinstellungen.tsx');

const zeichne = (e: ReactElement) => renderToStaticMarkup(e);
/** Wert eines Attributs am ersten Element, das auf das Muster passt. */
function attr(html: string, element: RegExp, name: string): string | undefined {
  const tag = element.exec(html)?.[0];
  assert.ok(tag, `Element ${element} fehlt in ${html}`);
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}
const INPUT = /<input[^>]*>/;
const LABEL = /<label[^>]*>/;
const nichts = () => {};

describe('Baustein Feld (#967)', () => {
  it('Beschriftung zeigt auf die Eingabe (htmlFor = id), ohne Fehler kein aria-invalid', () => {
    const html = zeichne(h(Feld, { beschriftung: 'Name' }, h('input', { type: 'text' })));
    const id = attr(html, INPUT, 'id');
    assert.ok(id);
    assert.equal(attr(html, LABEL, 'for'), id);
    assert.equal(attr(html, INPUT, 'aria-invalid'), undefined);
    assert.equal(attr(html, INPUT, 'aria-describedby'), undefined, 'Ohne Hinweis und Fehler nichts zu beschreiben');
    // Der Fehlerbereich steht trotzdem da (leer), damit eine spätere Meldung angesagt wird.
    assert.match(html, /<p id="[^"]+-fehler"[^>]*aria-live="polite"[^>]*><\/p>/);
  });

  it('eigene id der Eingabe bleibt; Hinweis und Fehler hängen über aria-describedby an der Eingabe', () => {
    const html = zeichne(h(Feld, { beschriftung: 'Postleitzahl', hinweis: 'Fünf Ziffern', fehler: 'Bitte genau fünf Ziffern eingeben.' }, h('input', { id: 'plz', type: 'text', 'aria-describedby': 'extra' })));
    assert.equal(attr(html, INPUT, 'id'), 'plz');
    assert.equal(attr(html, LABEL, 'for'), 'plz');
    assert.equal(attr(html, INPUT, 'aria-invalid'), 'true');
    assert.equal(attr(html, INPUT, 'aria-describedby'), 'extra plz-fehler plz-hinweis');
    assert.match(html, /<div id="plz-hinweis"[^>]*><span>Fünf Ziffern<\/span><\/div>/);
    assert.match(html, /<p id="plz-fehler"[^>]*aria-live="polite"[^>]*>.*Bitte genau fünf Ziffern eingeben\.<\/p>/);
    // Kein role="alert": Bei mehreren Fehlern nach dem Speichern würde jeder einzeln dazwischenrufen.
    assert.doesNotMatch(html, /role="alert"/);
  });

  it('Reihenfolge: Beschriftung · Eingabe · Fehler · Hinweis – der Fehler direkt unter der Eingabe (Prüfung Qualität zu #967)', () => {
    for (const art of [Feld, HakenFeld]) {
      const html = zeichne(h(art, { beschriftung: 'E-Mail-Adresse', hinweis: 'An diese Adresse schickt Ablago Erinnerungen.', fehler: 'Bitte eine vollständige Adresse eingeben.' }, h('input', { id: 'mail', type: art === Feld ? 'email' : 'checkbox', readOnly: true })));
      const eingabe = html.indexOf('<input');
      const fehler = html.indexOf('id="mail-fehler"');
      const hinweis = html.indexOf('id="mail-hinweis"');
      assert.ok(eingabe >= 0 && eingabe < fehler && fehler < hinweis, `Eingabe vor Fehler vor Hinweis: ${html}`);
      assert.equal(attr(html, INPUT, 'aria-describedby'), 'mail-fehler mail-hinweis', 'vorgelesen wie sichtbar');
    }
    const gruppe = zeichne(h(FeldGruppe, { beschriftung: 'Wochentage', hinweis: 'An diesen Tagen.', fehler: 'Bitte einen Tag wählen.' }, h('span', null, 'Mo')));
    assert.ok(gruppe.search(/ id="[^"]+-fehler"/) < gruppe.search(/ id="[^"]+-hinweis"/), 'auch in der Gruppe');
  });

  it('id des Rahmens geht vor; als Funktion bekommt die Eingabe die Verknüpfung selbst', () => {
    let bekommen: Record<string, unknown> = {};
    const eingabe = (v: Record<string, unknown>) => { bekommen = v; return h('input', v); };
    const html = zeichne(h(Feld, { beschriftung: 'Betrag', id: 'betrag', hinweis: 'in Euro', children: eingabe }));
    assert.deepEqual(bekommen, { id: 'betrag', 'aria-describedby': 'betrag-hinweis' });
    assert.equal(attr(html, LABEL, 'for'), 'betrag');
  });

  it('„(optional)“ gehört zur Beschriftung, das Hilfesymbol steht daneben – nicht im Label', () => {
    const html = zeichne(h(Feld, { beschriftung: 'Telefon', optional: true, hilfe: 'einrichtung.konto' }, h('input', { type: 'tel' })));
    const label = /<label[^>]*>(.*?)<\/label>/.exec(html)?.[1] ?? '';
    assert.match(label, /Telefon<span[^>]*> \(optional\)<\/span>/);
    assert.doesNotMatch(label, /hilfesymbol/);
    assert.match(html, /<\/label><a class="hilfesymbol"/);
  });

  it('Haken: Kästchen vor der Beschriftung, Hinweis über aria-describedby', () => {
    const html = zeichne(h(HakenFeld, { beschriftung: 'Erinnerung per E-Mail', hinweis: 'Am Tag vor dem Termin.', fehler: 'Bitte bestätigen.' }, h('input', { id: 'erinnern', type: 'checkbox', readOnly: true })));
    assert.ok(html.indexOf('<input') < html.indexOf('<label'), 'Das Kästchen steht vor seiner Beschriftung');
    assert.equal(attr(html, LABEL, 'for'), 'erinnern');
    assert.equal(attr(html, INPUT, 'aria-describedby'), 'erinnern-fehler erinnern-hinweis');
    assert.equal(attr(html, INPUT, 'aria-invalid'), 'true');
  });

  it('Gruppe: role="group", benannt durch die Beschriftung, Hinweis an der Gruppe', () => {
    const html = zeichne(h(FeldGruppe, { beschriftung: 'Wochentage', hinweis: 'An diesen Tagen.' }, h('label', null, h('input', { type: 'checkbox', readOnly: true }), 'Montag')));
    const gruppe = /<div role="group"[^>]*>/.exec(html)?.[0] ?? '';
    const name = /aria-labelledby="([^"]+)"/.exec(gruppe)?.[1];
    assert.ok(name);
    assert.match(html, new RegExp(`<span id="${name}"[^>]*>Wochentage</span>`));
    assert.match(gruppe, /aria-describedby="[^"]+-hinweis"/);
  });
});

describe('Paket-Einstellungen mit dem Feldrahmen (#967)', () => {
  const auswahl = { typen: [], benutzer: [], rollen: [], sichten: [] };
  const feld = (f: Record<string, unknown>, wert: unknown, fehler?: string) =>
    zeichne(h(Eingabe, { f: { schluessel: 'x', name: 'Grenze', ...f }, wert, fehler, auswahl, id: 'pe-x', setze: nichts }));

  it('Text: Beschriftung, Hinweis und Fehler vom Server verknüpft; Pflicht ohne Sternchen (Muster A6)', () => {
    const html = feld({ typ: 'text', pflicht: true, hilfe: 'Steht über jeder Mappe.' }, '', 'Bitte ausfüllen.');
    assert.equal(attr(html, LABEL, 'for'), 'pe-x');
    assert.equal(attr(html, INPUT, 'id'), 'pe-x');
    assert.equal(attr(html, INPUT, 'aria-invalid'), 'true');
    assert.equal(attr(html, INPUT, 'aria-describedby'), 'pe-x-fehler pe-x-hinweis');
    assert.match(html, /<label[^>]*>Grenze<\/label>/, 'Pflicht ist der Normalfall: kein „*“, kein „(optional)“');
    assert.doesNotMatch(html, /\*/);
  });

  it('ohne pflicht: „(optional)“ hinter der Beschriftung, beim Haken nicht', () => {
    assert.match(feld({ typ: 'text' }, ''), /<label[^>]*>Grenze<span[^>]*> \(optional\)<\/span><\/label>/);
    assert.match(feld({ typ: 'mehrfachauswahl', optionen: ['Mo'] }, []), /Grenze<span[^>]*> \(optional\)<\/span>/);
    assert.doesNotMatch(feld({ typ: 'janein' }, false), /optional/);
  });

  it('Zahl außerhalb von min/max: die Meldung kommt über den Rahmen', () => {
    const html = feld({ typ: 'zahl', min: 0, max: 10 }, '12');
    assert.equal(attr(html, INPUT, 'aria-invalid'), 'true');
    assert.equal(attr(html, INPUT, 'aria-describedby'), 'pe-x-fehler');
    assert.match(html, /id="pe-x-fehler"[^>]*>.*Bitte eine Zahl zwischen 0 und 10/);
    assert.equal(attr(feld({ typ: 'zahl', min: 0, max: 10 }, '3'), INPUT, 'aria-invalid'), undefined);
  });

  it('Ja/Nein als Haken, Mehrfachauswahl als Gruppe', () => {
    const haken = feld({ typ: 'janein', hilfe: 'Schaltet es ein.' }, true);
    assert.equal(attr(haken, LABEL, 'for'), 'pe-x');
    assert.equal(attr(haken, INPUT, 'aria-describedby'), 'pe-x-hinweis');
    const gruppe = feld({ typ: 'mehrfachauswahl', optionen: ['Mo', 'Di'] }, ['Di']);
    assert.match(gruppe, /<div role="group" aria-labelledby="[^"]+"/);
  });
});
