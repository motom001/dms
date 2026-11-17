/**
 * Charakterisierung von `liesBeschreibung` und `pruefeWerte` (#1278, Schritt 6b-3): Vor dem Zerlegen hält dieser Test
 * fest, was beide zu vielen gültigen und kaputten Beschreibungen bzw. Eingaben liefern – Beschreibung, Werte und Fehler
 * in Wortlaut und Reihenfolge. Erwartung: `charakter/paketeinstellungen.json` (siehe charakter.ts).
 */
import { describe, it } from 'node:test';
import { liesBeschreibung, pruefeWerte, type Verweisquelle } from '../src/paketeinstellungen';
import { wieFestgehalten } from './charakter';

const ab = (felder: unknown[], x: Record<string, unknown> = {}) => ({ abschnitt: 'Allgemein', felder, ...x });
const f = (schluessel: string, typ: string, x: Record<string, unknown> = {}) => ({ schluessel, typ, ...x });

const BESCHREIBUNGEN: Record<string, unknown> = {
  ohne: undefined,
  keinObjekt: 'x',
  ohneListen: { sprache: 'rust' },
  leer: { einstellungen: [] },
  nurAktionen: { aktionen: [{ schluessel: 'los', name: 'Los', hilfe: 'H', bestaetigen: true }, { schluessel: 'b' }] },
  aktionenFalsch: { aktionen: [{ schluessel: 'Los!' }, 'x', { schluessel: 'a' }, { schluessel: 'a', bestaetigen: 'ja' }] },
  aktionenKeineListe: { einstellungen: [], aktionen: 'x' },
  alleTypen: {
    einstellungen: [
      ab(
        [
          f('t', 'text', {
            name: 'Text',
            hilfe: 'Hilfe',
            pflicht: true,
            standard: 'x',
            laenge_min: 1,
            laenge_max: 20,
            muster: '[a-z]+',
            meldung: 'Nur klein',
          }),
          f('m', 'mehrzeilig', { laenge_max: 100 }),
          f('z', 'zahl', {
            min: 0,
            max: 10,
            schritt: 0.5,
            standard: 2,
            vorschlaege: [
              { wert: 2, name: ' zwei ' },
              { wert: 5, name: 'fünf' },
            ],
          }),
          f('j', 'janein', { standard: true }),
          f('d', 'datum'),
          f('a', 'auswahl', { optionen: ['eins', 2, null] }),
          f('ma', 'mehrfachauswahl', { optionen: ['a', 'b'] }),
          f('g', 'geheim'),
          f('mt', 'mappentyp', { standard: 'x', mehrfach: true, schliesst_aus: 'mt2' }),
          f('mt2', 'mappentyp', { mehrfach: true }),
          f('fe', 'feld', { mappentyp: 'akte' }),
          f('fo', 'feld'),
          f('be', 'benutzer'),
          f('ro', 'rolle', { mehrfach: true }),
          f('si', 'sicht'),
          f('ad', 'adresse', { beispiel: 'http://ollama:11434/v1' }),
          f('ki', 'ki_mappentypen'),
          f('fg', 'fragen_grenzen'),
          f('es', 'erkennung_standard'),
          f('mak', 'mappenaktionen'),
        ],
        { hilfe: 'Abschnittshilfe' },
      ),
      {
        liste: 'konten',
        name: 'Konten',
        eintrag: 'Konto',
        hilfe: 'H',
        sortierbar: true,
        felder: [f('name', 'text', { pflicht: true }), f('pw', 'geheim')],
      },
      { liste: 'leer', felder: [] },
    ],
    aktionen: [{ schluessel: 'pruefen', name: 'Prüfen' }],
  },
  feldFehler: {
    einstellungen: [
      ab([
        'kein feld',
        f('Gross', 'text'),
        f('unbekannt', 'farbe'),
        { typ: 'text' },
        f('aus', 'auswahl'),
        f('maus', 'mehrfachauswahl', { optionen: [] }),
        f('g', 'geheim', { standard: 'x' }),
        f('ad', 'adresse', { standard: 'http://x', beispiel: 'ftp://x' }),
        f('ad2', 'adresse', { beispiel: 5 }),
        f('s1', 'text', { schritt: 1 }),
        f('s2', 'zahl', { schritt: 0 }),
        f('s3', 'zahl', { schritt: '1' }),
        f('v1', 'text', { vorschlaege: [{ wert: 1, name: 'a' }] }),
        f('v2', 'zahl', { vorschlaege: [] }),
        f('v3', 'zahl', { vorschlaege: 'x' }),
        f('v4', 'zahl', {
          min: 0,
          max: 5,
          standard: 9,
          vorschlaege: [
            { wert: 1, name: '' },
            'x',
            { wert: Infinity, name: 'u' },
            { wert: '2', name: 'z' },
            { wert: 7, name: 'sieben' },
            { wert: -1, name: 'minus' },
          ],
        }),
        f('v5', 'zahl', { standard: 3, vorschlaege: [{ wert: 3, name: 'x'.repeat(120) }] }),
        f('mf1', 'text', { mehrfach: true }),
        f('mf2', 'benutzer', { mehrfach: 'ja' }),
        f('mf3', 'feld', { mehrfach: true }),
        f('sa', 'mappentyp', { schliesst_aus: 'Kaputt!' }),
        f('l1', 'zahl', { laenge_min: 1 }),
        f('l2', 'text', { laenge_min: -1, laenge_max: 1.5 }),
        f('l3', 'mehrzeilig', { laenge_min: 5, laenge_max: 2 }),
        f('mu1', 'mehrzeilig', { muster: 'a' }),
        f('mu2', 'text', { muster: '(' }),
        f('mu3', 'text', { muster: '' }),
        f('mu4', 'text', { muster: 'a'.repeat(301) }),
        f('mu5', 'text', { muster: 5 }),
        f('me1', 'text', { meldung: 'ohne Muster' }),
        f('me2', 'text', { muster: 'a', meldung: 'm'.repeat(201) }),
        f('me3', 'text', { muster: 'a', meldung: 7 }),
        f('me4', 'text', { muster: 'a', meldung: '' }),
        f('k1', 'ki_mappentypen', { standard: [] }),
        f('k2', 'fragen_grenzen', { pflicht: false }),
      ]),
    ],
  },
  bloecke: {
    einstellungen: [
      'kein block',
      ab([f('a', 'text'), f('a', 'zahl')]),
      { liste: 'a', felder: [f('x', 'text'), f('x', 'zahl'), f('k', 'ki_mappentypen'), f('ad', 'adresse')] },
      { liste: 'Kaputt!', felder: 'x' },
      { liste: 'Kaputt!', name: 'N' },
      { liste: 5 },
      ab([f('ad1', 'adresse'), f('ad2', 'adresse'), f('k1', 'ki_mappentypen'), f('k2', 'ki_mappentypen')]),
      ab([f('k3', 'fragen_grenzen'), f('k4', 'fragen_grenzen')], { hilfe: '' }),
      ab([], { abschnitt: undefined }),
    ],
    aktionen: [{ schluessel: 'x' }, { schluessel: 'x' }],
  },
  schliesstAus: {
    einstellungen: [
      ab([
        f('a', 'benutzer', { schliesst_aus: 'b' }),
        f('b', 'benutzer', { schliesst_aus: 'a' }),
        f('c', 'rolle', { schliesst_aus: 'a' }),
        f('d', 'rolle', { schliesst_aus: 'd' }),
        f('e', 'rolle', { schliesst_aus: 'fehlt' }),
        f('f', 'feld', { schliesst_aus: 'g' }),
        f('g', 'feld'),
        f('h', 'sicht', { schliesst_aus: 'i' }),
        f('i', 'sicht', { mehrfach: true, schliesst_aus: 'h' }),
      ]),
      { liste: 'l', felder: [f('x', 'benutzer', { schliesst_aus: 'a' }), f('a', 'benutzer')] },
    ],
  },
};

const Q: Verweisquelle = {
  typen: [
    { id: 't1', felder: [{ key: 'name' }, { key: 'betrag' }] },
    { id: 't2', felder: [{ key: 'titel' }] },
  ],
  benutzer: ['u1', 'u2'],
  rollen: ['r1'],
  sichten: ['s1', 's2'],
  typVon: (v) => (v === 'akte' ? 't1' : v === 'basis:x' ? 't2' : null),
};

const B = liesBeschreibung({
  einstellungen: [
    ab([
      f('t', 'text', { laenge_min: 2, laenge_max: 5, muster: '[a-z]+', meldung: 'Nur klein' }),
      f('t2', 'text', { muster: '[0-9]+' }),
      f('tp', 'text', { pflicht: true }),
      f('m', 'mehrzeilig', { laenge_max: 8 }),
      f('z', 'zahl', { min: 1, max: 10, schritt: 0.5 }),
      f('z2', 'zahl', { min: 1 }),
      f('z3', 'zahl', { max: 3 }),
      f('z4', 'zahl'),
      f('j', 'janein'),
      f('d', 'datum'),
      f('a', 'auswahl', { optionen: ['eins', 'zwei'] }),
      f('ma', 'mehrfachauswahl', { optionen: ['a', 'b'], pflicht: true }),
      f('g', 'geheim'),
      f('gp', 'geheim', { pflicht: true }),
      f('mt', 'mappentyp'),
      f('mtm', 'mappentyp', { mehrfach: true, schliesst_aus: 'mtm2' }),
      f('mtm2', 'mappentyp', { mehrfach: true }),
      f('be', 'benutzer', { schliesst_aus: 'be2' }),
      f('be2', 'benutzer', { mehrfach: true }),
      f('bem', 'benutzer', { mehrfach: true }),
      f('ro', 'rolle'),
      f('rom', 'rolle', { mehrfach: true }),
      f('si', 'sicht'),
      f('sim', 'sicht', { mehrfach: true, name: 'Ansichten' }),
      f('fe', 'feld', { mappentyp: 'akte' }),
      f('fo', 'feld'),
      f('ad', 'adresse'),
      f('ki', 'ki_mappentypen'),
    ]),
    { liste: 'konten', eintrag: 'Konto', felder: [f('name', 'text', { pflicht: true }), f('pw', 'geheim'), f('n', 'zahl', { max: 5 })] },
  ],
}).beschreibung!;

const EINGABEN: Record<string, unknown> = {
  keinObjekt: 'x',
  leer: {},
  gut: {
    t: ' abc ',
    t2: '123',
    tp: 'da',
    m: 'zeile\n',
    z: '2,5',
    z2: 7,
    z3: '-1',
    z4: '1.25',
    j: 'true',
    d: '2026-02-28',
    a: 'zwei',
    ma: ['a', 'b', 'a'],
    g: 'geheim',
    gp: { behalten: true },
    mt: 't1',
    mtm: ['t1', 't1'],
    mtm2: 't2',
    be: 'u1',
    be2: ['u2'],
    bem: 'u1',
    ro: 'r1',
    rom: ['r1'],
    si: 's2',
    sim: ['s1', 's2'],
    fe: { typ: 't1', feld: 'betrag' },
    fo: { typ: 't2', feld: 'titel' },
    ad: ' http://ollama:11434/v1 ',
    ki: 'wird übergangen',
    konten: [
      { _id: 'e1', name: 'Giro', pw: 'x', n: 3, fremd: 1 },
      'kein eintrag',
      { name: 'Spar', _id: '' },
      { _id: 'y'.repeat(80), name: ' ' },
    ],
  },
  falsch: {
    t: 'A',
    t2: 'abc',
    tp: '',
    m: 'x'.repeat(20),
    z: '2,7',
    z2: 0,
    z3: 'viel',
    z4: 'eins',
    j: 'ja',
    d: '2026-13-45',
    a: 'drei',
    ma: ['a', 'c', 'd'],
    g: 5,
    gp: '',
    mt: 'tx',
    mtm: ['t1', 'tx'],
    mtm2: ['t1'],
    be: 'ux',
    be2: ['ux'],
    bem: ['u1', 'u9'],
    ro: 'rx',
    rom: ['rx'],
    si: 'sx',
    sim: ['sx'],
    fe: { typ: 't2', feld: 'titel' },
    fo: { typ: 't1', feld: 'gibtsnicht' },
    ad: 'ftp://x',
    konten: [{ _id: 'e1', name: '', n: 9, pw: 3 }],
  },
  falsch2: {
    t: 5,
    t2: 'x'.repeat(501),
    m: 'x'.repeat(10001),
    z: 'x',
    d: 20260101,
    ma: 'c',
    fe: null,
    fo: 'x',
    ad: 5,
    gp: null,
    be: 'u1',
    be2: ['u1'],
    konten: 'keine liste',
  },
  ausschluss: { mtm: ['t1', 't2'], mtm2: ['t2'], be: 'u1', be2: ['u2', 'u1'] },
  adressen: { ad: 'https://u:p@example.org' },
  adressen2: { ad: 'http://example.org/?a=1' },
  adressen3: { ad: 'http://' + 'x'.repeat(600) },
  adressen4: { ad: 'kaputt' },
  zahlen: { z: 10.5, z2: '1', z3: 3, z4: '-0,5' },
  mehrfach: { ma: 'b', mtm: 't2', bem: [], rom: '', sim: null, ma2: 1 },
  vieleEintraege: { konten: Array.from({ length: 503 }, (_, i) => ({ _id: `e${i}`, name: `K${i}` })) },
  ohneIds: { konten: [{ name: 'a' }, { name: 'b', _id: 7 }] },
};

const LEERE: Record<string, unknown> = { nurListe: { konten: [{ name: 'x' }] }, nichts: undefined };

describe('liesBeschreibung und pruefeWerte: Charakterisierung (#1278)', () => {
  it('liest Beschreibungen wie festgehalten', () => {
    const ist: Record<string, unknown> = {};
    for (const [k, c] of Object.entries(BESCHREIBUNGEN)) ist[k] = liesBeschreibung(c);
    wieFestgehalten('lies-beschreibung', ist);
  });

  it('prüft Werte wie festgehalten (Fehler in Reihenfolge)', () => {
    const jetzt = Date.now,
      zufall = Math.random;
    let n = 0;
    Date.now = () => 1_800_000_000_000;
    Math.random = () => (++n % 97) / 97;
    try {
      const ist: Record<string, unknown> = {};
      for (const [k, e] of Object.entries({ ...EINGABEN, ...LEERE })) {
        const r = pruefeWerte(B, e, Q);
        ist[k] = { werte: Object.entries(r.werte), fehler: Object.entries(r.fehler) };
      }
      const nurListe = liesBeschreibung({ einstellungen: [{ liste: 'konten', felder: [f('name', 'text')] }] }).beschreibung!;
      ist.nurListeBeschreibung = Object.entries(pruefeWerte(nurListe, { konten: [{ name: 'x' }, { name: 'y' }] }, Q));
      wieFestgehalten('pruefe-werte', ist);
    } finally {
      Date.now = jetzt;
      Math.random = zufall;
    }
  });
});
