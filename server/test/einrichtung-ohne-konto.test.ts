/**
 * Einrichtungsassistent ohne Konto (#881): Der Assistent steht vor dem `KontoProvider` (web/src/konto.tsx). Alles, was
 * er zeichnet – auch die Bausteine aus der Werkbank (Pakete mit Herkunft, Rechten und Einstellungen, E-Mail,
 * Zwei-Faktor) –, muss ohne Konto auskommen. Sonst wirft `useKonto()` („KontoProvider fehlt“) und die Seite bleibt
 * weiß. Gezeichnet wird hier mit react-dom/server, ohne Browser; die nötigsten Browser-Globals sind nachgebildet.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React, { createElement as h, createRef, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { register } from 'node:module';

// `tokens.css?raw` (design.ts, #966) wie in Vite als Text laden.
register(new URL('./css-roh-lader.mjs', import.meta.url));

// Browser-Globals, die die Module der Oberfläche schon beim Laden brauchen.
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
g.dispatchEvent = () => true;
g.window = globalThis;
g.document = { title: '', querySelector: () => null, documentElement: { lang: 'de', dataset: {}, style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ style: {} }) };

// Die Module der Oberfläche über einen berechneten Pfad laden: Der Server-Typcheck kennt weder JSX noch das DOM, die
// Oberfläche prüft ihr eigener Typcheck. tsx übersetzt JSX hier klassisch (React.createElement) – darum React global.
g.React = React;
const WEB = new URL('../../web/src/', import.meta.url).href;
const lade = (pfad: string): Promise<any> => import(WEB + pfad); // eslint-disable-line @typescript-eslint/no-explicit-any -- Module der Oberfläche, je Pfad ein anderes
const { Hilfe, useHandbuch } = await lade('Hilfe.tsx');
const { Sammelassistent } = await lade('assistent/Schritte.tsx');
const { setzeStand, leereSammlung } = await lade('assistent/stand.ts');
const { neuerLauf } = await lade('assistent/ausfuehren.ts');
const { Einrichtungsassistent } = await lade('einrichtung.tsx');
const { Fragen, PaketApiKontext } = await lade('werkbank/PaketAblauf.tsx');
const { SammeldateiAnsicht } = await lade('werkbank/PaketeDazuholen.tsx');
const { HerkunftZeile } = await lade('werkbank/Herkunft.tsx');
const { MailSammeln } = await lade('werkbank/MailVersand.tsx');
const { ZweifaktorEinrichten } = await lade('profil/Zweifaktor.tsx');
const { Fehlergrenze, FehlerAnzeige, fehlerAngaben } = await lade('Fehlergrenze.tsx');

/** Ausschnitte der Typen aus web/src/api.ts bzw. shared/src/pakete.ts – nur, was die Beispiele brauchen. */
type Pruefung = import('../../shared/src/pakete').HerkunftPruefung;
type Vorschau = Record<string, unknown>;

const zeichne = (e: ReactElement) => renderToStaticMarkup(e);
const nichts = () => {};
const leerePromise = () => new Promise<never>(() => {});
const ohneNetz = { stand: leerePromise, katalog: leerePromise, plan: leerePromise };

const herkunft: Pruefung = { art: 'unsigniert', offiziell: false, bestaetigen: true };
const vorschau = (o: Partial<Vorschau> = {}): Vorschau => ({
  paket: { id: 'haushalt', name: 'Haushalt', version: '1.0.0', beschreibung: 'Beispielpaket', lizenz: 'MIT', autor: { name: 'Lena', github: 'lena' }, dms: '>=0.1.0', abhaengigkeiten: {}, readme: null, changelog: null, quelle: null },
  dmsVersion: '0.209.0', dmsOk: true, installiert: null, update: false, herkunft: null, pruefung: herkunft, abhaengigkeiten: [], typen: [], sichten: [],
  beispiele: 2, probleme: [], hinweise: [], einstellungen: null, automatisierungen: [{ schluessel: 'erinnern', name: 'Erinnern', beschreibung: '', neu: true }],
  laeufer: { rechte: [{ text: 'Darf Dienst-Adressen aufrufen', hilfe: 'pakete.recht.adresse', unter: [{ text: 'example.org', hilfe: 'pakete.recht.adresse' }] }], bestaetigen: true },
  ...o,
});
const plan = {
  pakete: [{
    schluessel: 'haushalt', id: 'haushalt', name: 'Haushalt', version: '1.0.0', gewaehlt: true, fuer: [], ergaenzt: null, vorschau: vorschau(),
    einstellungen: [{ schluessel: 'dienst', name: 'Dienst-Adresse', typ: 'adresse', pflicht: true, beispiel: 'http://dienst.example.org' }, { schluessel: 'name', name: 'Name', typ: 'text', pflicht: true }],
  }],
  probleme: [], herkunft, herkunftBestaetigen: true, rechte: { bestaetigen: true, stand: 'x' },
  auswahl: { typen: [], benutzer: [], rollen: [], sichten: [] },
};

describe('Einrichtungsassistent ohne KontoProvider (#881)', () => {
  it('Hilfe und useHandbuch werfen nicht, sondern zeigen aufs aktuelle Handbuch', () => {
    const html = zeichne(h(Hilfe, { ort: 'werkbank.pakete.ablauf' }));
    assert.match(html, /class="hilfesymbol"/);
    assert.match(html, /href="\/hilfe\/admin\/[^"]*pakete\/#mehrere-pakete-in-einem-schritt-installieren"/);
    function Link() { return h('a', { href: (useHandbuch() as (x: string) => string)('benutzer') }, 'Handbuch'); }
    assert.match(zeichne(h(Link)), /href="\/hilfe\/benutzer\//);
  });

  for (const ansicht of ['ablage', 'konto', 'pakete', 'optional', 'zusammenfassung'] as const) {
    it(`Schritt „${ansicht}“ zeichnet ohne Konto`, () => {
      setzeStand((x: Record<string, unknown>) => ({ ...x, neu: true, spracheGewaehlt: true, lauf: null, aendern: null, sammlung: { ...leereSammlung(), ansicht, optional: { ...leereSammlung().optional, mail: { aktiv: true, host: 'mail.example.org', port: 587, verbindung: 'starttls', benutzer: 'lena', absender: 'ablago@example.org', selbstsigniert: false, mitPasswort: false } } } }));
      const html = zeichne(h(PaketApiKontext.Provider, { value: ohneNetz }, h(Sammelassistent, { zurWahl: nichts, abschliessen: async () => {} })));
      assert.ok(html.length > 200, html);
      if (ansicht === 'pakete') assert.match(html, /Pakete dazuholen/, 'Pakete: Schritt mit der Auswahl (Daten kommen erst aus dem Netz)');
    });
  }

  it('Einstieg, Fortschritt und Abschluss zeichnen ohne Konto', () => {
    setzeStand((x: Record<string, unknown>) => ({ ...x, neu: false, spracheGewaehlt: true, lauf: null, aendern: null }));
    assert.match(zeichne(h(Einrichtungsassistent, { status: { einrichtungNoetig: true, einrichtung: { phase: 'konto', code: false } }, fertig: async () => {} })), /wahlkarte/);
    for (const fertig of [false, true]) {
      setzeStand((x: Record<string, unknown>) => ({ ...x, neu: true, lauf: { ...neuerLauf(), fertig } }));
      const html = zeichne(h(Sammelassistent, { zurWahl: nichts, abschliessen: async () => {} }));
      assert.ok(html.length > 200, html);
    }
    setzeStand((x: Record<string, unknown>) => ({ ...x, neu: false, lauf: null }));
  });

  it('Pakete: Herkunft, Rechte (mit Hilfe) und Pflicht-Einstellungen zeichnen ohne Konto', () => {
    const html = zeichne(h(PaketApiKontext.Provider, { value: ohneNetz }, h(Fragen, { plan, eingabe: () => ({ pakete: ['haushalt'] }), zurueck: nichts, neuerPlan: nichts, fertig: nichts, sammeln: nichts })));
    assert.match(html, /class="herkunft klein warn"/, 'Herkunft');
    assert.ok((html.match(/class="hilfesymbol"/g) ?? []).length >= 3, 'Hilfe bei Herkunft und Rechten');
    assert.match(html, /Dienst-Adresse/, 'Einstellungen');
    assert.match(html, /pa-einstellungen/);
  });

  it('Pakete aus einer Sammeldatei: Herkunft und Auswahl zeichnen ohne Konto', () => {
    const sammeldatei = {
      datei: { sha256: 'ab'.repeat(32), groesse: 1000, erstellt: '2026-11-01T10:00:00Z', quelle: 'https://katalog.example.org', katalog: 'offiziell', dms: '0.209.0', pruefung: { art: 'projekt', offiziell: true, bestaetigen: false } as Pruefung, nichtImKatalog: [] },
      pakete: [{ upload: 'u1', id: 'haushalt', name: 'Haushalt', version: '1.0.0', gewaehlt: true, abhaengigkeiten: {}, katalog: 'gleich' as const, stand: 'neu' as const, installiert: null, vorschau: vorschau() }],
    };
    const html = zeichne(h(SammeldateiAnsicht, { s: sammeldatei, datei: 'pakete.zip', dms: '0.209.0', installiert: [], fertig: nichts, abbrechen: nichts }));
    assert.match(html, /class="herkunft klein gut"/);
    assert.match(html, /hilfesymbol/);
    assert.match(zeichne(h(HerkunftZeile, { p: herkunft })), /hilfesymbol/);
  });

  it('E-Mail und Zwei-Faktor zeichnen ohne Konto', () => {
    const mail = zeichne(h(MailSammeln, { wert: null, passwort: '', email: 'lena@example.org', ablage: 'Familie', griff: createRef() as never }));
    assert.match(mail, /<input/);
    const zf = zeichne(h(ZweifaktorEinrichten, { fertig: nichts, abbrechen: nichts }));
    assert.ok(zf.length > 50, zf);
  });
});

describe('Fehlergrenze (#881)', () => {
  it('fängt einen Fehler beim Zeichnen ab (Zustand) und zeigt Meldung, „Neu laden“ und „Fehler melden“', () => {
    assert.equal(Fehlergrenze.getDerivedStateFromError(new Error('KontoProvider fehlt')).fehler.message, 'KontoProvider fehlt');
    assert.equal(Fehlergrenze.getDerivedStateFromError('Text').fehler.message, 'Text');
    const html = zeichne(h(FehlerAnzeige, { fehler: new Error('KontoProvider fehlt') }));
    assert.match(html, /role="alert"/);
    assert.match(html, /Hier ist etwas schiefgegangen/);
    assert.match(html, />Neu laden</);
    assert.match(html, />Fehler melden</);
    assert.match(html, /KontoProvider fehlt/);
  });

  it('ohne Fehler zeichnet sie einfach den Inhalt', () => {
    assert.equal(zeichne(h(Fehlergrenze, null, h('p', null, 'Inhalt'))), '<p>Inhalt</p>');
  });

  it('die Angaben zum Kopieren enthalten Meldung, Seite und Browser', () => {
    const e = new Error('kaputt');
    const text = fehlerAngaben(e, '/einrichtung', 'Testbrowser');
    assert.match(text, /^Meldung: kaputt$/m);
    assert.match(text, /^Seite: \/einrichtung$/m);
    assert.match(text, /^Browser: Testbrowser$/m);
  });
});
