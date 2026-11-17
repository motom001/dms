/**
 * Charakterisierung von `vorschlaegeAus` (#1278, Schritt 6b-3): Vor dem Zerlegen hält dieser Test fest, welche
 * Vorschläge die Funktion für viele Mappentypen und Texte macht – Wert, Sicherheit, Fundstelle und Hinweis.
 * Erwartung: `charakter/vorschlaege.json` (siehe charakter.ts).
 */
import { describe, it } from 'node:test';
import { type Angaben, vorschlaegeAus } from '../src/erkennung';
import type { Feld, Mappentyp } from '../src/model';
import { wieFestgehalten } from './charakter';

type Typ = Pick<Mappentyp, 'felder'>;
const feld = (key: string, label: string, typ: Feld['typ'] = 'text', x: Partial<Feld> = {}): Feld => ({ key, label, typ, ...x });

const FIRMA: Typ = {
  felder: [
    feld('name', 'Firma'),
    feld('strasse', 'Straße'),
    feld('hausnummer', 'Hausnummer'),
    feld('plz', 'PLZ'),
    feld('ort', 'Ort'),
    feld('email', 'E-Mail'),
    feld('email2', 'Zweite E-Mail'),
    feld('web', 'Internetseite'),
    feld('iban', 'IBAN'),
    feld('ust', 'USt-IdNr'),
    feld('tel', 'Telefon'),
    feld('tel2', 'Telefon 2'),
    feld('mobil', 'Mobil'),
    feld('fax', 'Fax'),
    feld('kundennummer', 'Kundennummer'),
    feld('passwort', 'Passwort', 'passwort'),
    feld('versteckt', 'Telefon versteckt', 'text', { ausgeblendet: true }),
  ],
};
const MIT_ZAHLEN: Typ = {
  felder: [
    feld('plz', 'PLZ', 'zahl'),
    feld('rechnungsnr', 'Rechnungs-Nr.', 'zahl'),
    feld('betrag', 'Betrag', 'zahl', { erkennung: { art: 'betrag' } }),
    feld('strasse', 'Straße'),
    feld('ort', 'Ort'),
  ],
};
const PERSON: Typ = {
  felder: [
    feld('vorname', 'Vorname'),
    feld('nachname', 'Nachname'),
    feld('funktion', 'Funktion'),
    feld('name', 'Name'),
    feld('mail', 'E-Mail'),
  ],
};
const RECHNUNG: Typ = {
  felder: [
    feld('rechnungsnummer', 'Rechnungsnummer', 'text', { erkennung: {} }),
    feld('datum', 'Rechnungsdatum', 'datum', { erkennung: {} }),
    feld('betrag', 'Betrag', 'betrag', { erkennung: {}, negativ: true }),
    feld('netto', 'Netto', 'betrag', { erkennung: {} }),
    feld('steuer', 'Steuersatz', 'prozent', { erkennung: {} }),
    feld('frist', 'Kündigungsfrist', 'zeitraum', { erkennung: {} }),
    feld('art', 'Zahlungsart', 'auswahl', { erkennung: {}, optionen: ['Lastschrift', 'Überweisung', 'bar'] }),
    feld('arten', 'Zahlarten', 'auswahl', {
      erkennung: {},
      mehrfach: true,
      optionen: ['k', 'pp'],
      beschriftungen: { de: { optionen: { k: 'Kreditkarte', pp: 'PayPal' } } },
    }),
    feld('az', 'Aktenzeichen', 'text', { erkennung: { hinweis: 'Muster 100-####' } }),
    feld('code', 'Code', 'text', { erkennung: { hinweis: 'Muster: „AA-##“.' } }),
    feld('ohne', 'Ohne Treffer', 'text', { erkennung: { hinweis: 'Muster 999-#####', art: 'nummer' } }),
    feld('kein', 'Kein Muster', 'text', { erkennung: { hinweis: 'Muster ABC', art: 'name' } }),
    feld('ref', 'Vertrag', 'referenz', { erkennung: {} }),
    feld('nicht', 'Bemerkung', 'langtext'),
  ],
};
const GRENZEN: Typ = {
  felder: [
    feld('fax', 'Fax', 'text', { format: 'telefon' }),
    feld('web', 'Webseite', 'text', { format: 'internetseite' }),
    feld('betrag', 'Betrag', 'betrag', { min: 1000, negativ: true }),
    feld('ort', 'Ort', 'text', { maxLen: 3 }),
    feld('strasse', 'Straße'),
    feld('prozent', 'Rabatt', 'prozent'),
    feld('zeit', 'Laufzeit', 'zeitraum'),
  ],
};

const BRIEF = `Musterwerke GmbH · Hauptstraße 12 · 12345 Musterstadt
Telefon 030 1234567 · Fax 030 1234568 · Mobil 0171 2345678
Telefon 030 7654321
info@musterwerke.example.org · rechnung@musterwerke.example.org
www.musterwerke.example.org
IBAN DE89 3704 0044 0532 0130 00 · USt-IdNr. DE123456789

Erika Musterfrau
Beispielweg 3
54321 Beispielstadt

Rechnung
Rechnungsnummer: RE-2026-0042
Kundennummer: 4711
Rechnungsdatum: 15.03.2026
Aktenzeichen 100-2345, Code AB-12
Zahlungsart: Lastschrift; auch PayPal möglich.
Laufzeit 24 Monate
Kündigungsfrist:
3 Monate zum Monatsende
Steuersatz 19 %, Rabatt 7,5 %
Gesamtbetrag 1.234,56 EUR`;

const GUTSCHRIFT = `Musterwerke GmbH · Hauptstraße 12 · 12345 Musterstadt
Gutschrift
Rechnungsnummer: GS-1
Datum: 01.02.2026
Erstattung 49,90 EUR`;

const PERSONENBRIEF = `Max Mustermann
Leiter Einkauf
Beispiel AG
max.mustermann@example.org`;

const NUR_MAIL = `Bitte schreiben Sie an service@beispiel.example.org oder an privat@gmx.de.
Tel. 0221 998877`;

const OHNE = 'Hier steht nichts Brauchbares, nur 3 Wochen Urlaub und 120 % Einsatz und 7 Tage.';

const leer: Angaben = {
  emails: [],
  internet: [],
  ibans: [],
  ustids: [],
  telefon: [],
  mobil: [],
  fax: [],
  datum: null,
  betrag: null,
  nummern: [],
  briefkopf: null,
  person: null,
};
const fund = (wert: string, sicherheit: 'hoch' | 'mittel' | 'niedrig' = 'mittel') => ({ wert, sicherheit, fundstelle: `…${wert}…` });

const FAELLE: Array<[string, Typ, string, Angaben?]> = [
  ['firmaBrief', FIRMA, BRIEF],
  ['firmaGutschrift', FIRMA, GUTSCHRIFT],
  ['firmaNurMail', FIRMA, NUR_MAIL],
  ['firmaOhne', FIRMA, OHNE],
  ['zahlenBrief', MIT_ZAHLEN, BRIEF],
  ['zahlenGutschrift', MIT_ZAHLEN, GUTSCHRIFT],
  ['personBrief', PERSON, PERSONENBRIEF],
  ['personFirma', PERSON, BRIEF],
  ['rechnungBrief', RECHNUNG, BRIEF],
  ['rechnungGutschrift', RECHNUNG, GUTSCHRIFT],
  ['rechnungOhne', RECHNUNG, OHNE],
  ['rechnungLeer', RECHNUNG, ''],
  ['grenzenBrief', GRENZEN, BRIEF],
  ['grenzenGutschrift', GRENZEN, GUTSCHRIFT],
  ['grenzenOhne', GRENZEN, OHNE],
  ['leererTyp', { felder: [] }, BRIEF],
  [
    'angabenVonHand',
    FIRMA,
    'Text ohne Bezug',
    {
      ...leer,
      emails: [fund('a@x.example.org'), fund('b@y.example.org')],
      telefon: [fund('030 1'), fund('030 1'), fund('030 2')],
      mobil: [fund('030 1'), fund('0171 1')],
      fax: [fund('030 2')],
      nummern: [
        { ...fund('K-1'), label: 'Kunden-Nr.' },
        { ...fund('9'), label: '' },
      ],
      briefkopf: {
        name: 'Firma X',
        strasse: 'Weg',
        hausnummer: '1a',
        plz: '01234',
        ort: 'Ort',
        fundstelle: 'Firma X · Weg 1a',
        sicherheit: 'mittel',
      },
      person: { vorname: 'A', nachname: 'B', organisation: 'Org', funktion: 'Chef', fundstelle: 'A B', sicherheit: 'mittel' },
    } as Angaben,
  ],
  [
    'angabenOhneHausnummerFeld',
    {
      felder: [
        feld('strasse', 'Straße'),
        feld('plz', 'PLZ', 'zahl'),
        feld('name', 'Name'),
        feld('web', 'Website'),
        feld('nr', 'Kundennummer', 'zahl'),
      ],
    },
    'x',
    {
      ...leer,
      emails: [fund('a@firma.example.org')],
      nummern: [{ ...fund('ohne Ziffern'), label: 'Kundennummer' }],
      briefkopf: { name: undefined, strasse: 'Weg', hausnummer: '7', plz: '01234', fundstelle: 'Weg 7', sicherheit: 'mittel' },
      person: { organisation: 'Org GmbH', fundstelle: 'Org GmbH', sicherheit: 'mittel' },
      gutschrift: fund('Gutschrift'),
    } as unknown as Angaben,
  ],
  [
    'angabenNurPerson',
    { felder: [feld('name', 'Name'), feld('strasse', 'Straße'), feld('ort', 'Ort')] },
    'x',
    { ...leer, person: { organisation: 'Org GmbH', fundstelle: 'Org GmbH', sicherheit: 'mittel' } } as unknown as Angaben,
  ],
  [
    'angabenGutschrift',
    RECHNUNG,
    'x',
    {
      ...leer,
      betrag: { wert: { betrag: 12.5, waehrung: 'EUR' }, sicherheit: 'hoch', fundstelle: '12,50' },
      gutschrift: fund('Erstattung'),
    },
  ],
];

describe('vorschlaegeAus: Charakterisierung (#1278)', () => {
  it('schlägt vor wie festgehalten', () => {
    const ist: Record<string, unknown> = {};
    for (const [k, t, text, a] of FAELLE) ist[k] = a ? vorschlaegeAus(t, text, a) : vorschlaegeAus(t, text);
    wieFestgehalten('vorschlaege', ist);
  });
});
