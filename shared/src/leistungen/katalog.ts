/**
 * Leistungskatalog (#1569): Alles, was Dokumente verarbeitet, ist eine fest beschriebene Leistung
 * `<gegenstand>.<tätigkeit>[.<ziel>]@<hauptversion>`. Leistungen definiert nur der Kern; Anbieter (eingebaut oder
 * Paket) erbringen sie. Gruppen: `dokument.*` (Datei), `text.*`, `inhalt.*` (Deutung), `nachricht.*` (wirkt nach außen).
 *
 * Jede Leistung hat Ein- und Ausgabeschema mit Grenzen, erlaubte Ausgabeformate (Mime der Ergebnisdatei; leer = keine
 * Datei), Eingabe-Dateitypen, die Angabe `ergebnis`, eine Zeitgrenze und Testfälle (Pflicht für jeden Anbieter, auch
 * Ablago). Der Anzeigename (de/en) steht in den Sprachdateien unter `pakete.leistung.name.<name ohne Version>`, als
 * Tätigkeit in Verbform („Text lesen“). Eine neue Hauptversion ist ein neuer Eintrag; der alte bleibt.
 */
import { VOLLTEXT_ZEICHEN_MAX } from '../paketvolltext';
import type { Schema } from './schema';

/** Was das Ergebnis ist: genau berechnet, ein Vorschlag (Deutung), nur für Ablago selbst, oder es wirkt nach außen. */
type Ergebnisart = 'exakt' | 'vorschlag' | 'intern' | 'wirkung';
export type Leistungsgruppe = 'dokument' | 'text' | 'inhalt' | 'nachricht';

/** Ein Testfall: Eingabe (Dateien als `{ testdatei: '<name>' }`) und was am Ergebnis stimmen muss. */
interface Testfall {
  name: string;
  eingabe: Readonly<Record<string, unknown>>;
  erwartet: {
    /** Mime der Ergebnisdatei. */
    format?: string;
    /** Diese Werte der Ausgabe genau (Teilmenge). */
    daten?: Readonly<Record<string, unknown>>;
    /** Textfelder der Ausgabe enthalten diese Stellen (Groß- und Kleinschreibung egal). */
    enthaelt?: Readonly<Record<string, string>>;
  };
}

export interface Leistung {
  ergebnis: Ergebnisart;
  eingabe: Extract<Schema, { type: 'object' }>;
  ausgabe: Extract<Schema, { type: 'object' }>;
  /** Erlaubte Formate der Ergebnisdatei; leer = die Leistung liefert keine Datei. */
  formate: readonly string[];
  /** Dateitypen, die die Leistung als Eingabe annimmt (Mime, `typ/*` für eine Gruppe); leer = keine Datei. */
  dateitypen: readonly string[];
  /** Zeitgrenze je Auftrag in Sekunden. */
  zeitgrenzeS: number;
  testfaelle: readonly Testfall[];
  /**
   * Einschränkungen der Eingabe, die ein Anbieter melden darf (#1570): Er kann dann nur Eingaben, die sie erfüllen;
   * Ablago prüft das vor der Wahl. Die Bedeutung steht in {@link EINSCHRAENKUNGEN}.
   */
  einschraenkungen?: readonly Einschraenkung[];
}

/**
 * Einschränkungen der Eingabe (#1570), die ein Anbieter melden kann, wenn er nicht alles kann, was die Leistung
 * beschreibt – neben engeren `dateitypen`. Ablago prüft sie selbst (server/src/leistungen/eingebaut.ts) und wählt nur
 * Anbieter, deren Meldung die Eingabe erfüllt; sonst `leistung.kein-anbieter` mit Grund `eingabe`.
 */
export const EINSCHRAENKUNGEN = {
  /** Nur Dateien, die schon gültiges PDF/A sind (sie werden übernommen, nicht umgewandelt). */
  'bereits-pdfa': { dateitypen: ['application/pdf'] },
} as const;
export type Einschraenkung = keyof typeof EINSCHRAENKUNGEN;
/** Schlüssel der Beschreibung einer Einschränkung (Bereich `pakete`). */
export const einschraenkungSchluessel = (e: Einschraenkung) => `pakete.leistung.einschraenkung.${e}`;

/** Testdateien der Testfälle (shared/leistungen/testdateien/), mit Mime. */
export const TESTDATEIEN = {
  'brief.pdf': 'application/pdf',
  'zwei-seiten.pdf': 'application/pdf',
  'bild.png': 'image/png',
  'rechnung.xml': 'application/xml',
  'barcode.png': 'image/png',
  'vorlage.md': 'text/markdown',
} as const;
export type Testdatei = keyof typeof TESTDATEIEN;
const datei = (n: Testdatei) => ({ testdatei: n });

/* ---------- Bausteine der Schemas ---------- */

const PDF = 'application/pdf';
const text = (maxLength: number, mehr: { enum?: readonly string[]; pattern?: string; minLength?: number } = {}) =>
  ({ type: 'string', maxLength, ...mehr }) as const;
const zahl = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum }) as const;
const ganz = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum }) as const;
const liste = (items: Schema, maxItems: number, minItems?: number) =>
  ({ type: 'array', items, maxItems, ...(minItems !== undefined ? { minItems } : {}) }) as const;
const objekt = (properties: Record<string, Schema>, required: readonly string[] = []) =>
  ({ type: 'object', properties, required, additionalProperties: false }) as const;
const DOKUMENT: Schema = { type: 'string', maxLength: 36, format: 'dokument' };
const UUID: Schema = { type: 'string', maxLength: 36, format: 'uuid' };
const SPRACHE = text(8, { pattern: '^[a-z]{2,3}$' });
const SEITEN = ganz(1, 5000);
const BETRAG = zahl(-1e12, 1e12);
const NUR_DATEI = objekt({ datei: DOKUMENT }, ['datei']);
const NUR_SEITEN = objekt({ seiten: SEITEN }, ['seiten']);
const PARTEI = objekt({
  name: text(500),
  ustid: text(40),
  kennung: text(200),
  strasse: text(500),
  plz: text(20),
  ort: text(200),
  land: text(2),
  email: text(320),
  telefon: text(100),
});
const BILDER = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp'] as const;
const BUERO = [
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'message/rfc822',
] as const;

/* ---------- Der Katalog ---------- */

export const LEISTUNGSKATALOG = {
  'dokument.erstellen.aus-text@1': {
    ergebnis: 'exakt',
    eingabe: objekt({ text: text(512 * 1024, { minLength: 1 }), titel: text(200), sprache: SPRACHE }, ['text']),
    ausgabe: NUR_SEITEN,
    formate: [PDF],
    dateitypen: [],
    zeitgrenzeS: 30,
    testfaelle: [
      {
        name: 'kurzer-brief',
        eingabe: { text: 'Hallo Lena,\n\ndies ist ein Testfall von Ablago.', titel: 'Testfall' },
        erwartet: { format: PDF, daten: { seiten: 1 } },
      },
    ],
  },
  'dokument.erstellen.aus-vorlage@1': {
    ergebnis: 'exakt',
    // Die Werte liest der Kern mit den Rechten der Person, bevor er beauftragt; der Anbieter setzt nur (Text, kein Markdown).
    eingabe: objekt(
      {
        vorlage: DOKUMENT,
        werte: liste(objekt({ platzhalter: text(200), wert: text(10_000) }, ['platzhalter', 'wert']), 500),
        absender: liste(text(500), 12),
        anschrift: liste(text(500), 12),
        datum: text(100),
        sprache: SPRACHE,
      },
      ['vorlage'],
    ),
    ausgabe: objekt({ seiten: SEITEN, luecken: liste(text(200), 500) }, ['seiten']),
    formate: [PDF],
    dateitypen: ['text/markdown'],
    zeitgrenzeS: 30,
    testfaelle: [
      {
        name: 'mit-wert',
        eingabe: { vorlage: datei('vorlage.md'), werte: [{ platzhalter: 'vertragsnummer', wert: 'V-4711' }], datum: '24.11.2026' },
        erwartet: { format: PDF, daten: { seiten: 1 } },
      },
    ],
  },
  'dokument.umwandeln.pdf@1': {
    ergebnis: 'exakt',
    eingabe: NUR_DATEI,
    ausgabe: NUR_SEITEN,
    formate: [PDF],
    dateitypen: [...BILDER, ...BUERO],
    zeitgrenzeS: 120,
    testfaelle: [{ name: 'bild', eingabe: { datei: datei('bild.png') }, erwartet: { format: PDF, daten: { seiten: 1 } } }],
  },
  'dokument.umwandeln.pdfa@1': {
    ergebnis: 'exakt',
    eingabe: NUR_DATEI,
    ausgabe: objekt({ seiten: SEITEN, stufe: text(10, { enum: ['1b', '2b', '2u', '3b', '3u'] }) }, ['seiten']),
    formate: [PDF],
    dateitypen: [PDF, ...BILDER],
    zeitgrenzeS: 300,
    testfaelle: [{ name: 'pdf', eingabe: { datei: datei('brief.pdf') }, erwartet: { format: PDF, daten: { seiten: 1 } } }],
    einschraenkungen: ['bereits-pdfa'],
  },
  'dokument.bearbeiten.seiten@1': {
    ergebnis: 'exakt',
    eingabe: objekt({ datei: DOKUMENT, seiten: liste(objekt({ nr: SEITEN, drehung: ganz(0, 270) }, ['nr']), 5000, 1) }, [
      'datei',
      'seiten',
    ]),
    ausgabe: NUR_SEITEN,
    formate: [PDF],
    dateitypen: [PDF],
    zeitgrenzeS: 120,
    testfaelle: [
      {
        name: 'umdrehen',
        eingabe: { datei: datei('zwei-seiten.pdf'), seiten: [{ nr: 2 }, { nr: 1, drehung: 90 }] },
        erwartet: { format: PDF, daten: { seiten: 2 } },
      },
    ],
  },
  'dokument.bearbeiten.zusammenfuegen@1': {
    ergebnis: 'exakt',
    eingabe: objekt({ dateien: liste(DOKUMENT, 100, 2) }, ['dateien']),
    ausgabe: NUR_SEITEN,
    formate: [PDF],
    dateitypen: [PDF],
    zeitgrenzeS: 120,
    testfaelle: [
      {
        name: 'zwei-pdfs',
        eingabe: { dateien: [datei('brief.pdf'), datei('zwei-seiten.pdf')] },
        erwartet: { format: PDF, daten: { seiten: 3 } },
      },
    ],
  },
  'dokument.bearbeiten.verkleinern@1': {
    ergebnis: 'exakt',
    eingabe: objekt({ datei: DOKUMENT, stufe: text(20, { enum: ['bildschirm', 'standard', 'druck'] }) }, ['datei']),
    ausgabe: objekt({ vorher: ganz(0, 2 ** 40), nachher: ganz(0, 2 ** 40) }, ['vorher', 'nachher']),
    formate: [PDF],
    dateitypen: [PDF],
    zeitgrenzeS: 300,
    testfaelle: [{ name: 'pdf', eingabe: { datei: datei('brief.pdf'), stufe: 'standard' }, erwartet: { format: PDF } }],
  },
  'dokument.bearbeiten.schwaerzen@1': {
    ergebnis: 'exakt',
    eingabe: objekt(
      {
        datei: DOKUMENT,
        bereiche: liste(
          objekt({ seite: SEITEN, x: zahl(0, 1), y: zahl(0, 1), b: zahl(0, 1), h: zahl(0, 1) }, ['seite', 'x', 'y', 'b', 'h']),
          5000,
          1,
        ),
      },
      ['datei', 'bereiche'],
    ),
    ausgabe: NUR_SEITEN,
    // Ergebnis im Format der Eingabe: ein geschwärztes Foto bleibt ein Bild (#392).
    formate: [PDF, 'image/jpeg', 'image/png'],
    dateitypen: [PDF, 'image/jpeg', 'image/png'],
    zeitgrenzeS: 300,
    testfaelle: [
      {
        name: 'oben-links',
        eingabe: { datei: datei('brief.pdf'), bereiche: [{ seite: 1, x: 0, y: 0, b: 0.5, h: 0.2 }] },
        erwartet: { format: PDF, daten: { seiten: 1 } },
      },
    ],
  },
  'dokument.lesen.text@1': {
    ergebnis: 'exakt',
    eingabe: objekt({ datei: DOKUMENT, sprachen: liste(SPRACHE, 10) }, ['datei']),
    ausgabe: objekt({ text: text(VOLLTEXT_ZEICHEN_MAX), seiten: ganz(0, 5000), sprache: SPRACHE }, ['text']),
    formate: [],
    dateitypen: [PDF, ...BILDER],
    zeitgrenzeS: 600,
    testfaelle: [{ name: 'textebene', eingabe: { datei: datei('brief.pdf') }, erwartet: { enthaelt: { text: 'Testfall 4711' } } }],
  },
  'dokument.lesen.erechnung@1': {
    ergebnis: 'exakt',
    eingabe: NUR_DATEI,
    ausgabe: objekt(
      {
        syntax: text(3, { enum: ['ubl', 'cii'] }),
        gutschrift: { type: 'boolean' },
        nummer: text(200),
        datum: text(10),
        faellig: text(10),
        waehrung: text(3),
        netto: BETRAG,
        ust: BETRAG,
        brutto: BETRAG,
        zahlbetrag: BETRAG,
        verkaeufer: PARTEI,
        kaeufer: PARTEI,
        iban: text(34),
        /** Steueraufteilung je Satz (BG-23). */
        steuern: liste(objekt({ satz: zahl(0, 100), netto: BETRAG, ust: BETRAG, kategorie: text(10) }, ['satz']), 50),
        positionen: liste(
          objekt({
            nr: text(50),
            beschreibung: text(2000),
            menge: zahl(-1e9, 1e9),
            einheit: text(10),
            einzelpreis: BETRAG,
            gesamt: BETRAG,
            ustSatz: zahl(0, 100),
          }),
          500,
        ),
      },
      ['syntax', 'gutschrift', 'waehrung', 'steuern', 'positionen'],
    ),
    formate: [],
    dateitypen: [PDF, 'application/xml', 'text/xml'],
    zeitgrenzeS: 60,
    testfaelle: [
      {
        name: 'cii',
        eingabe: { datei: datei('rechnung.xml') },
        erwartet: { daten: { syntax: 'cii', nummer: 'R-2026-0815', waehrung: 'EUR', brutto: 261.8 } },
      },
    ],
  },
  'dokument.lesen.barcode@1': {
    ergebnis: 'exakt',
    eingabe: NUR_DATEI,
    ausgabe: objekt({ codes: liste(objekt({ art: text(40), inhalt: text(4000), seite: SEITEN }, ['art', 'inhalt']), 200) }, ['codes']),
    formate: [],
    dateitypen: [PDF, ...BILDER],
    zeitgrenzeS: 120,
    testfaelle: [
      { name: 'code39', eingabe: { datei: datei('barcode.png') }, erwartet: { enthaelt: { 'codes[0].inhalt': 'ABLAGO-4711' } } },
    ],
  },
  'inhalt.erkennen.felder@1': {
    ergebnis: 'vorschlag',
    eingabe: objekt(
      {
        text: text(VOLLTEXT_ZEICHEN_MAX, { minLength: 1 }),
        felder: liste(objekt({ key: text(100), name: text(200), art: text(40) }, ['key', 'name', 'art']), 200, 1),
      },
      ['text', 'felder'],
    ),
    ausgabe: objekt({ werte: liste(objekt({ key: text(100), wert: text(4000), sicherheit: zahl(0, 1) }, ['key', 'wert']), 200) }, [
      'werte',
    ]),
    formate: [],
    dateitypen: [],
    zeitgrenzeS: 120,
    testfaelle: [
      {
        name: 'rechnungsnummer',
        eingabe: { text: 'Rechnung Nr. R-2026-0815 vom 05.11.2026', felder: [{ key: 'nummer', name: 'Rechnungsnummer', art: 'text' }] },
        erwartet: {},
      },
    ],
  },
  'inhalt.erkennen.mappentyp@1': {
    ergebnis: 'vorschlag',
    eingabe: objekt(
      {
        text: text(VOLLTEXT_ZEICHEN_MAX, { minLength: 1 }),
        typen: liste(objekt({ id: text(100), name: text(200) }, ['id', 'name']), 500, 1),
      },
      ['text', 'typen'],
    ),
    ausgabe: objekt({ typ: text(100), sicherheit: zahl(0, 1) }),
    formate: [],
    dateitypen: [],
    zeitgrenzeS: 120,
    testfaelle: [
      {
        name: 'rechnung',
        eingabe: {
          text: 'Rechnung Nr. R-2026-0815, zahlbar bis 19.11.2026',
          typen: [
            { id: 'rechnung', name: 'Rechnung' },
            { id: 'vertrag', name: 'Vertrag' },
          ],
        },
        erwartet: {},
      },
    ],
  },
  'inhalt.beantworten.frage@1': {
    ergebnis: 'vorschlag',
    eingabe: objekt({ frage: text(2000, { minLength: 1 }), dokumente: liste(DOKUMENT, 50) }, ['frage']),
    ausgabe: objekt({ antwort: text(20_000), quellen: liste(UUID, 50) }, ['antwort']),
    formate: [],
    dateitypen: [PDF, ...BILDER],
    zeitgrenzeS: 300,
    testfaelle: [{ name: 'frage', eingabe: { frage: 'Welche Nummer hat die Rechnung?', dokumente: [datei('brief.pdf')] }, erwartet: {} }],
  },
  'text.uebersetzen@1': {
    ergebnis: 'vorschlag',
    eingabe: objekt({ text: text(200_000, { minLength: 1 }), nach: SPRACHE, von: SPRACHE }, ['text', 'nach']),
    ausgabe: objekt({ text: text(400_000), von: SPRACHE }, ['text']),
    formate: [],
    dateitypen: [],
    zeitgrenzeS: 300,
    testfaelle: [{ name: 'de-en', eingabe: { text: 'Guten Tag', nach: 'en', von: 'de' }, erwartet: {} }],
  },
  'text.vektor@1': {
    ergebnis: 'intern',
    eingabe: objekt({ text: text(32_000, { minLength: 1 }) }, ['text']),
    ausgabe: objekt({ vektor: liste(zahl(-1e6, 1e6), 8192, 1), modell: text(200) }, ['vektor', 'modell']),
    formate: [],
    dateitypen: [],
    zeitgrenzeS: 60,
    testfaelle: [{ name: 'satz', eingabe: { text: 'Rechnung über ein Hochbeet' }, erwartet: {} }],
  },
  'nachricht.senden.mail@1': {
    ergebnis: 'wirkung',
    eingabe: objekt(
      {
        an: liste(text(320, { pattern: '^[^@\\s]+@[^@\\s]+$' }), 50, 1),
        betreff: text(500),
        text: text(200_000),
        anhaenge: liste(DOKUMENT, 20),
      },
      ['an', 'betreff', 'text'],
    ),
    ausgabe: objekt({ kennung: text(1000) }),
    formate: [],
    dateitypen: ['*/*'],
    zeitgrenzeS: 120,
    testfaelle: [{ name: 'einfach', eingabe: { an: ['lena@example.org'], betreff: 'Testfall', text: 'Hallo Lena' }, erwartet: {} }],
  },
  'nachricht.aufrufen.url@1': {
    ergebnis: 'wirkung',
    eingabe: objekt(
      { url: text(2000, { pattern: '^https?://' }), methode: text(6, { enum: ['GET', 'POST', 'PUT'] }), daten: text(1024 * 1024) },
      ['url'],
    ),
    ausgabe: objekt({ status: ganz(100, 599) }, ['status']),
    formate: [],
    dateitypen: [],
    zeitgrenzeS: 60,
    testfaelle: [{ name: 'get', eingabe: { url: 'https://example.org/', methode: 'GET' }, erwartet: {} }],
  },
} as const satisfies Record<string, Leistung>;

export type Leistungsname = keyof typeof LEISTUNGSKATALOG;
export const LEISTUNGEN = Object.keys(LEISTUNGSKATALOG) as Leistungsname[];
export const istLeistung = (n: unknown): n is Leistungsname => typeof n === 'string' && Object.hasOwn(LEISTUNGSKATALOG, n);
export const leistung = (n: Leistungsname): Leistung => LEISTUNGSKATALOG[n];

/** Form des Namens: `gegenstand.taetigkeit[.ziel]@hauptversion`, Kleinbuchstaben und Bindestrich. */
export const NAME_MUSTER = /^(dokument|text|inhalt|nachricht)(\.[a-z][a-z-]*){1,2}@[1-9]\d*$/;
/** Teile des Namens: ohne Version (für Texte), Gruppe, Hauptversion. */
export function teileDesNamens(n: Leistungsname): { ohneVersion: string; gruppe: Leistungsgruppe; version: number } {
  const [ohneVersion, v] = n.split('@');
  return { ohneVersion, gruppe: ohneVersion.split('.')[0] as Leistungsgruppe, version: Number(v) };
}
/** Schlüssel des Anzeigenamens im Bereich `pakete` der Sprachdateien. */
export const anzeigeSchluessel = (n: Leistungsname) => `pakete.leistung.name.${teileDesNamens(n).ohneVersion}`;
