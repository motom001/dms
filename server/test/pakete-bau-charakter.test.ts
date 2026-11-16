/**
 * Charakterisierung von `baue` (#1278, Schritt 6a): Vor dem Zerlegen der langen Funktion hält dieser Test fest, was sie
 * heute zu einer Auswahl sagt und baut – Probleme, Hinweise, Fehlendes, Abhängigkeiten, Kennungen, Versionslage und
 * jede Datei des Pakets. Die Szenarien decken die Zweige ab, die die übrigen Tests nicht erreichen.
 *
 * Erwartung: `test/charakter/baue.json`. Neu schreiben nur, wenn sich das Verhalten bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/pakete-bau-charakter.test.ts` – dann den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Mappe, Mappentyp } from '../../shared/src/model';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import type { PaketEntwurf, PaketErstellenEingabe } from '../../shared/src/paketerstellung';
import type { Sicht } from '../../shared/src/sichten';
import { baue } from '../src/pakete/erstellung/index';

type Bau = ReturnType<typeof baue>;
type ErstellenDaten = Parameters<typeof baue>[1];

const DATEI = fileURLToPath(new URL('./charakter/baue.json', import.meta.url));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PDF = Buffer.from('%PDF-1.4\n% Beispiel\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

const U = {
  benutzer: id(1),
  ablageort: id(2),
  rolle: id(3),
  org: id(4),
  system: id(5),
  vertrag: id(10),
  zahlung: id(11),
  notiz: id(12),
  sammlung: id(13),
};
const S = { vertraege: id(20), teuer: id(21), unterPaket: id(22), unterFremd: id(23), offen: id(24), alle: id(25), ausPaket: id(26) };
const M = { v1: id(30), z1: id(31), sys: id(32), org1: id(33), n1: id(34), v2: id(35) };

const typ = (t: Partial<Mappentyp> & { id: string; name: string }): Mappentyp =>
  ({ felder: [], register: [], geaendert: '2026-01-01T00:00:00.000Z', ...t }) as unknown as Mappentyp;
const sicht = (s: Partial<Sicht> & { id: string; name: string }): Sicht =>
  ({ typen: [], bedingungen: [], elternId: null, position: 10, ...s }) as unknown as Sicht;
const mappe = (m: { id: string; typId: string; werte: Record<string, unknown>; systemKennung?: string }): Mappe => m as unknown as Mappe;

const basis: InstalliertesPaket = {
  id: 'basis',
  name: 'Basis',
  version: '1.6.0',
  typen: { organisation: U.org },
  sichten: { org: S.ausPaket, oben: S.vertraege + '-x' },
  installiert: '2025-01-01T00:00:00.000Z',
  aktualisiert: null,
} as unknown as InstalliertesPaket;

/**
 * Ein Typ mit (fast) allem, was ein Feld, ein Register und ein Typ können. `sauber`: ohne die Verweise, die den Export
 * verhindern (Systemtyp, nicht gewählter Typ) – dann entstehen die Dateien.
 */
function vertrag(sauber = false): Mappentyp {
  const t = typ({
    id: U.vertrag,
    name: 'Vertrag',
    schluessel: 'vertrag',
    beschreibung: 'Ein Vertrag',
    titelVorlage: '{nr}',
    beschriftungen: { en: { name: 'Contract' } },
    ausPost: true,
    erkennbarAn: 'Vertragsnummer',
    teilVon: 'gehoert',
    inSuche: false,
    berechtigungen: { lesen: [] },
    erstellenErlaubt: false,
    archiv: { jahre: 10, stichtag: 'gibtsnicht' },
    trefferlisten: [
      { key: 'standard', name: 'Standard', spalten: ['nr', 'partner'], standard: true },
      { key: 'zwei', name: 'Zwei', spalten: ['nr'] },
    ],
    felder: [
      { key: '_titel', label: 'Titel', typ: 'text', system: true },
      { key: 'nr', label: 'Nummer', typ: 'text', pflicht: true, maxLen: 40, standard: '{nummernkreis:vertrag}' },
      { key: 'kennung', label: 'Kennung', typ: 'text', erkennung: { art: 'iban' }, standard: 'fest' },
      {
        key: 'partner',
        label: 'Partner',
        typ: 'referenz',
        zielTypen: [U.org],
        verweisart: 'bezug',
        vorbelegen: [{ von: 'name', nach: 'nr' }],
      },
      {
        key: 'wer',
        label: 'Wer',
        typ: 'referenz',
        zielTypen: [U.benutzer, U.rolle],
        auswahlFilter: [{ feld: 'x', op: 'gleich', wert: id(99) }],
      },
      { key: 'ort', label: 'Ort', typ: 'referenz', zielTypen: [U.ablageort], standard: id(98) },
      { key: 'zahlung', label: 'Zahlung', typ: 'referenz', zielTypen: [U.zahlung, U.org], zielOptional: ['fahrzeuge:fahrzeug'] },
      {
        key: 'gehoert',
        label: 'Gehört zu',
        typ: 'referenz',
        zielTypen: [U.zahlung],
        auswahlFilter: [{ feld: 'x', op: 'gleich', wert: 1 }],
      },
      { key: 'text', label: 'Text', typ: 'text', verweisart: 'bezug', berechnetVon: 'anderes', format: 'gross' },
      { key: 'uebernommen', label: 'Übernommen', typ: 'text' },
      {
        key: 'kuendigung',
        label: 'Kündigung',
        typ: 'datum',
        min: '2020-01-01',
        frist: { vorlauf: 6, einheit: 'wochen', empfaengerFeld: 'wer', text: '', wiederholung: null },
        anzeigen: {
          modus: 'eine',
          bedingungen: [
            { art: 'verweistyp', feld: 'partner', typ: U.org },
            { art: 'verweistyp', feld: 'zahlung', typ: U.notiz },
            { art: 'feld', bedingung: { art: 'feld', feld: 'partner', op: 'zeigtAuf', wert: { art: 'fest', wert: [M.org1] } } },
            { art: 'feld', nicht: true, bedingung: { art: 'feld', feld: 'ort', op: 'zeigtAuf', wert: { art: 'fest', wert: [id(97)] } } },
            { art: 'feld', bedingung: { art: 'feld', feld: 'nr', op: 'gleich', wert: { art: 'fest', wert: 'A' } } },
            { art: 'eigeneOrganisation', feld: 'partner' },
          ],
        },
      },
      { key: 'kennwort', label: 'Kennwort', typ: 'passwort' },
      { key: 'betrag', label: 'Betrag', typ: 'betrag', waehrung: 'EUR', negativ: true },
      { key: 'zeit', label: 'Zeitraum', typ: 'zeitraum' },
      { key: 'anteil', label: 'Anteil', typ: 'prozent', merkmal: 'x' },
      { key: 'teile', label: 'Teile', typ: 'zusammengesetzt', teile: [] },
      {
        key: 'posten',
        label: 'Posten',
        typ: 'tabelle',
        quelle: { typId: U.zahlung, feldKey: 'vertrag', trefferliste: 'andere', neu: 'ja' },
      },
      { key: 'nichts', label: 'Ohne Quelle', typ: 'tabelle', quelle: { typId: U.system, feldKey: 'x' } },
      { key: 'land', label: 'Land', typ: 'text', landFeld: 'x', ausText: 'alt' },
    ],
    register: [
      {
        key: 'daten',
        name: 'Daten',
        art: 'felder',
        felder: ['nr', 'partner', '_titel', 'gibtsnicht'],
        abschnitte: [
          {
            vor: 'nr',
            titel: 'Kopf',
            eingeklappt: true,
            anzeigen: { modus: 'alle', bedingungen: [{ art: 'verweistyp', feld: 'partner', typ: U.org }] },
          },
          { vor: 'weg', titel: 'Weg' },
          { vor: 'partner', titel: '', beschriftungen: { en: 'Partner' } },
        ],
        volltext: false,
        ausgeblendet: true,
      },
      {
        key: 'zahlungen',
        name: 'Zahlungen',
        art: 'verknuepfungen',
        quellen: [
          { typId: U.zahlung, feldKey: 'vertrag' },
          { typId: U.org, feldKey: 'x' },
        ],
      },
      { key: 'verlauf', name: 'Verlauf', art: 'protokoll', zeigt: 'alles', versionierung: true, versionenBehalten: 3 },
      { key: 'dok', name: 'Dokumente', art: 'dokumente', volltext: true },
    ],
  } as unknown as Partial<Mappentyp> & { id: string; name: string });
  if (!sauber) return t;
  const felder = t.felder.filter((f) => f.key !== 'nichts');
  const k = felder.find((f) => f.key === 'kuendigung')!;
  return {
    ...t,
    felder: felder.map((f) =>
      f === k
        ? {
            ...k,
            anzeigen: {
              ...k.anzeigen!,
              bedingungen: k.anzeigen!.bedingungen.filter((b) => !(b.art === 'verweistyp' && b.typ === U.notiz)),
            },
          }
        : f,
    ),
  };
}

function daten(a: Partial<ErstellenDaten> = {}, sauber = false): ErstellenDaten {
  return {
    typen: [
      typ({ id: U.benutzer, name: 'Benutzer', system: 'benutzer' } as never),
      typ({ id: U.ablageort, name: 'Ablageort', system: 'ablageort' } as never),
      typ({ id: U.rolle, name: 'Rolle', system: 'rolle' } as never),
      typ({ id: U.org, name: 'Organisation', schluessel: 'basis:organisation', geaendert: '2026-02-01T00:00:00.000Z' } as never),
      typ({ id: U.system, name: 'Systemtyp', system: 'sonder' } as never),
      vertrag(sauber),
      typ({
        id: U.zahlung,
        name: 'Zahlung',
        schluessel: 'zahlung',
        trefferliste: ['datum'],
        felder: [
          { key: 'datum', label: 'Datum', typ: 'datum' },
          { key: 'vertrag', label: 'Vertrag', typ: 'referenz', zielTypen: [U.vertrag], mehrfach: true },
          { key: 'betrag', label: 'Betrag', typ: 'betrag', waehrung: 'CHF' },
        ],
        register: [{ key: 'daten', name: 'Daten', art: 'felder', felder: ['datum', 'vertrag', 'betrag'] }],
      } as never),
      typ({ id: U.notiz, name: 'Notiz', felder: [{ key: 'text', label: 'Text', typ: 'text' }] } as never),
      typ({ id: U.sammlung, name: 'Sammlung', schluessel: '', felder: [] } as never),
    ],
    sichten: [
      sicht({
        id: S.vertraege,
        name: 'Verträge',
        typen: [U.vertrag],
        symbol: 'signature',
        beschreibung: 'Alle',
        beschriftungen: { en: 'Contracts' },
      } as never),
      sicht({
        id: S.teuer,
        name: 'Teure',
        elternId: S.vertraege,
        typen: [U.vertrag, U.benutzer],
        trefferliste: 'zwei',
        berechtigungen: { lesen: [] },
        bedingungen: [
          { art: 'merkmal', merkmal: 'x' },
          { art: 'dokumente', register: 'dok', op: 'gleich', anzahl: 0 },
          { art: 'feld', feld: 'zahlung', op: 'zeigtAufTyp', wert: { art: 'fest', wert: [U.zahlung, id(96)] } },
          { art: 'feld', feld: 'zahlung', op: 'zeigtAufTyp', wert: { art: 'fest', wert: [] } },
          { art: 'feld', feld: 'betrag', op: 'zwischen', wert: { art: 'fest', wert: 1 }, bis: { art: 'fest', wert: 9 } },
          { art: 'feld', feld: 'kuendigung', op: 'kleiner', wert: { art: 'heute', versatz: 3, einheit: 'monate' } },
          { art: 'feld', feld: 'partner', op: 'zeigtAuf', wert: { art: 'fest', wert: M.org1 } },
          { art: 'feld', feld: 'nr', op: 'leer' },
        ],
      } as never),
      sicht({ id: S.unterPaket, name: 'Unter Paket', elternId: S.ausPaket, typen: [U.vertrag] } as never),
      sicht({ id: S.unterFremd, name: 'Unter Fremd', elternId: S.offen, typen: [U.vertrag] } as never),
      sicht({ id: S.offen, name: 'Nicht gewählt', typen: [U.notiz] } as never),
      sicht({ id: S.alle, name: 'Alles', typen: ['*', U.notiz, U.sammlung, U.org, U.rolle, U.ablageort] } as never),
      sicht({ id: S.ausPaket, name: 'Organisationen', typen: [U.org] } as never),
    ],
    pakete: [basis],
    dmsTypen: new Map([
      [U.benutzer, 'benutzer'],
      [U.ablageort, 'ablageort'],
      [U.rolle, 'rolle'],
    ]),
    mappen: [
      mappe({
        id: M.v1,
        typId: U.vertrag,
        werte: {
          nr: 'S-1',
          partner: M.org1,
          zahlung: [M.z1, M.org1],
          kennwort: 'geheim',
          betrag: { betrag: 89, waehrung: 'EUR' },
          text: `siehe ${M.org1}`,
          zeit: '',
          land: 'DE',
        },
      }),
      mappe({ id: M.z1, typId: U.zahlung, werte: { datum: '2026-01-31', vertrag: [M.v1, M.v2], betrag: { betrag: 5, waehrung: 'EUR' } } }),
      mappe({ id: M.v2, typId: U.vertrag, werte: { nr: 'S-2', betrag: { betrag: '7', waehrung: 'EUR' }, gehoert: M.z1 } }),
      mappe({ id: M.sys, typId: U.vertrag, werte: { nr: 'SYS' }, systemKennung: 'x' }),
      mappe({ id: M.org1, typId: U.org, werte: { name: 'Stadtwerke' } }),
    ],
    vorgaben: new Map([[M.org1, 'paket:basis:stadtwerke']]),
    dokumente: new Map([
      [
        M.v1,
        [
          { name: 'Vertrag Übersicht.pdf', registerKey: 'dok', erstellt: '2026-03-04T05:06:07.000Z', inhalt: PDF },
          { name: 'Vertrag Übersicht.PDF', registerKey: 'dok', erstellt: '2026-03-05T05:06:07.000Z', inhalt: PDF },
          { name: 'bild.pdf', registerKey: 'dok', erstellt: '2026-03-06T05:06:07.000Z', inhalt: PNG },
          { name: '...', registerKey: 'dok', erstellt: '2026-03-07T05:06:07.000Z', inhalt: PDF },
        ],
      ],
    ]),
    dokumenteAusgelassen: 2,
    wortlisten: [
      { id: 'w1', quelle: 'werkbank', woerter: ['Auto', 'PKW', 'auto'] },
      { id: 'w2', quelle: 'werkbank', woerter: ['nur'] },
      { id: 'w3', quelle: 'basis', woerter: ['Firma', 'Unternehmen'] },
      { id: 'w4', quelle: 'fremd', woerter: ['a', 'b'] },
    ] as never,
    dmsVersion: '0.290.13',
    entwurf: null,
    entwuerfe: [{ id: 'anderes', schluessel: { [U.notiz]: 'notizzettel' } } as unknown as PaketEntwurf],
    jetzt: new Date('2026-11-16T12:00:00.000Z'),
    ...a,
  };
}

const eingabe = (a: Partial<PaketErstellenEingabe> = {}): PaketErstellenEingabe => ({
  typen: [U.vertrag, U.zahlung],
  sichten: [S.vertraege, S.teuer, S.unterPaket, S.unterFremd, S.alle, S.ausPaket],
  beispiele: [],
  wortlisten: ['w1', 'w2', 'w3', 'w4'],
  id: 'familie_vertraege',
  name: 'Verträge der Familie',
  version: '1.0.0',
  beschreibung: 'Verträge mit Zahlungen und Kündigungsfristen, wie wir sie zu Hause pflegen.',
  autor: { name: 'Thomas Beispiel', github: '@motom001' },
  lizenz: 'MIT',
  dms: '>=0.290.0',
  aenderungen: '',
  vonHand: true,
  ...a,
});

const entwurf: PaketEntwurf = {
  ...eingabe({ typen: [U.vertrag, U.notiz], sichten: [S.vertraege, S.offen], version: '1.2.0', aenderungen: 'Erste Fassung\n- mit Liste' }),
  schluessel: { [U.vertrag]: 'vertrag_alt', [U.zahlung]: 'vertrag_alt', [S.vertraege]: 'vertrag_alt', [S.teuer]: 'teuer_alt' },
  verlauf: [
    { version: '1.1.0', datum: '2026-05-01', text: 'Zweite\n\n-' },
    { version: '2.0.0', datum: '2026-06-01', text: 'Später' },
  ],
  exportiert: '2026-07-01T00:00:00.000Z',
  von: null,
  felder: { [U.vertrag]: ['nr', 'weg'], [U.notiz]: ['text'] },
};

/** Was ein Szenario zeigt; Dateien als Text (Binäres als Base64). */
const SZENARIEN: Record<string, () => Bau> = {
  'alles gewählt, Dateien': () => baue(eingabe(), daten()),
  'mit Beispielen und Dokumenten': () =>
    baue(eingabe({ beispiele: [M.v1], beispielDokumente: true, typen: [U.vertrag, U.zahlung] }), daten({ dokumenteZuGross: 0 })),
  'Beispiele ohne Dokumente': () => baue(eingabe({ beispielDokumente: false }), daten()),
  'Update mit Entwurf, eigene Lizenz': () =>
    baue(
      eingabe({
        version: '1.3.0',
        vonHand: false,
        dms: '>=0.290.0',
        lizenzArt: 'eigen',
        lizenzName: 'Meine Lizenz',
        lizenzText: 'Darf jeder.\r\nAußer Bob.\r\n',
        aenderungen: 'Neu: Zahlungen\n-',
        autor: { name: 'Thomas Beispiel', github: '' },
      }),
      daten({ entwurf }),
    ),
  'keine Lizenz, zu alte Ablago-Version': () =>
    baue(eingabe({ lizenzArt: 'keine', dms: '>=0.86.0' }), daten({ dmsVersion: 'v0.290.13-test' })),
  'Probleme in den Angaben': () =>
    baue(
      eingabe({
        id: 'Basis!',
        name: 'x',
        version: '1.0',
        beschreibung: 'kurz',
        autor: { name: ' ', github: 'mit leer' },
        lizenz: 'Proprietär',
        dms: 'irgendwas',
        typen: [U.vertrag, id(90), U.org, U.benutzer, U.ablageort, U.system],
        sichten: [id(91), S.teuer],
        wortlisten: ['gibtsnicht'],
        automatisierungen: ['fehlt'],
      }),
      daten({ dokumenteZuGross: 10 }),
    ),
  'Id dms, eigene Lizenz ohne Text': () =>
    baue(
      eingabe({ id: 'dms', lizenzArt: 'eigen', lizenzName: 'L', lizenzText: '', dms: '' }),
      daten({ entwurf: { ...entwurf, version: '2.0.0' } }),
    ),
  'Id schon installiert, eigene Lizenz zu lang': () =>
    baue(
      eingabe({ id: 'basis', lizenzArt: 'eigen', lizenzName: 'Lang', lizenzText: 'x'.repeat(200_001), version: '1.2.0', vonHand: false }),
      daten({ entwurf }),
    ),
  'Version nicht aus der Auswahl': () =>
    baue(eingabe({ version: '1.5.0', vonHand: false, bekannteVersion: '1.2.0', dms: '>=0.290.0' }), daten()),
  'neues Paket mit freier Version': () => baue(eingabe({ version: '3.0.0', vonHand: false, dms: '>0.290.0' }), daten()),
  'Ablago-Version nicht wählbar': () => baue(eingabe({ vonHand: false, dms: '>=0.157.0' }), daten({ dmsVersion: '0.290.13' })),
  'leere Auswahl': () => baue(eingabe({ typen: [], sichten: [], wortlisten: [] }), daten()),
  'nur Ansichten': () => baue(eingabe({ typen: [], wortlisten: [], sichten: [S.alle, S.unterFremd] }), daten()),
  'nur Wortlisten': () =>
    baue(
      eingabe({ typen: [], sichten: [], wortlisten: Array.from({ length: 202 }, (_, i) => `x${i}`) }),
      daten({
        wortlisten: Array.from({ length: 202 }, (_, i) => ({ id: `x${i}`, quelle: 'werkbank', woerter: [`a${i}`, `b${i}`] })) as never,
      }),
    ),
  'sauber: freie Lizenz, Beispiele mit Dokumenten': () =>
    baue(eingabe({ beispielDokumente: true, sichten: [S.vertraege, S.alle, S.unterPaket] }), daten({ dokumenteAusgelassen: 0 }, true)),
  'sauber: eigene Lizenz, Update mit Entwurf': () =>
    baue(
      eingabe({
        version: '2.0.1',
        lizenzArt: 'eigen',
        lizenzName: 'Meine Lizenz',
        lizenzText: 'Darf jeder.\r\nAußer Bob.\r\n',
        aenderungen: '- Neu: Zahlungen\n-\nMehr',
        autor: { name: 'Thomas Beispiel', github: 'motom001' },
        sichten: [S.vertraege],
      }),
      daten({ entwurf, mappen: [] }, true),
    ),
  'sauber: keine Lizenz, Entwurf ohne Änderungstext': () =>
    baue(
      eingabe({ lizenzArt: 'keine', version: '1.2.1', vonHand: false, dms: '>=0.290.0', sichten: [] }),
      daten({ entwurf: { ...entwurf, aenderungen: '', felder: undefined } }, true),
    ),
  'sauber: gleiche Version wie Entwurf': () => baue(eingabe({ version: '1.2.0', vonHand: false, sichten: [] }), daten({ entwurf }, true)),
  'hochgeladene Version gibt es schon': () =>
    baue(eingabe({ version: '1.0.0', bekannteVersion: '1.0.0', sichten: [] }), daten({ entwurf: { ...entwurf, version: '0.9.0' } }, true)),
  'Typ verweist auf nicht gewählten': () => baue(eingabe({ typen: [U.zahlung, U.notiz], sichten: [S.unterFremd] }), daten()),
};

function bild(b: Bau) {
  return {
    ...b,
    dateien: b.dateien.map((d) => ({
      name: d.name,
      inhalt: /\.(yaml|md)$|LICENSE$/.test(d.name) ? d.daten.toString('utf8') : d.daten.toString('base64'),
    })),
  };
}

describe('baue: Charakterisierung (#1278)', () => {
  const ist = Object.fromEntries(Object.entries(SZENARIEN).map(([name, f]) => [name, JSON.parse(JSON.stringify(bild(f())))]));
  if (process.env.CHARAKTER_SCHREIBEN) {
    mkdirSync(dirname(DATEI), { recursive: true });
    writeFileSync(DATEI, `${JSON.stringify(ist, null, 2)}\n`);
  }
  const soll = existsSync(DATEI) ? (JSON.parse(readFileSync(DATEI, 'utf8')) as Record<string, unknown>) : {};
  it('alle Szenarien sind festgehalten', () => assert.deepEqual(Object.keys(soll).sort(), Object.keys(SZENARIEN).sort()));
  for (const name of Object.keys(SZENARIEN)) it(name, () => assert.deepEqual(ist[name], soll[name]));
});
