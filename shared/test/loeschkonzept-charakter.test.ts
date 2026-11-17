/**
 * Charakterisierung von `loeschkonzept` (#1278, Schritt 6b-3): Vor dem Zerlegen hält dieser Test fest, was die
 * Funktion für viele Quellen erzeugt – alle Abschnitte, Lücken und Datenarten im Wortlaut.
 * Erwartung: `charakter/loeschkonzept.json` (siehe charakter.ts).
 */
import { describe, it } from 'node:test';
import { DATENSCHUTZ_STANDARD } from '../src/auskunft';
import { loeschkonzept, type LoeschkonzeptQuelle, type LoeschkonzeptTyp } from '../src/loeschkonzept';
import { wieFestgehalten } from './charakter';

const kunde: LoeschkonzeptTyp = { id: 'k', name: 'Kunde', felder: [{ key: 'name', label: 'Name', typ: 'text' }] };
const person: LoeschkonzeptTyp = {
  id: 'p',
  name: 'Person',
  archiv: { jahre: 10, stichtag: null },
  felder: [{ key: 'name', label: 'Name', typ: 'text' }],
};
const rechnung: LoeschkonzeptTyp = {
  id: 'r',
  name: 'Rechnung',
  archiv: { jahre: 8, stichtag: 'datum' },
  felder: [
    { key: 'datum', label: 'Rechnungsdatum', typ: 'datum' },
    { key: 'kunde', label: 'Kunde', typ: 'referenz', zielTypen: ['k'] },
    { key: 'partner', label: 'Partner', typ: 'referenz', zielTypen: ['k', 'p', 'r'] },
  ],
};
const vertrag: LoeschkonzeptTyp = {
  id: 'v',
  name: 'Vertrag',
  archiv: { jahre: 6, stichtag: 'ende', leererStichtag: 'laeuftNicht' },
  felder: [
    { key: 'ende', label: 'Vertragsende', typ: 'datum' },
    { key: 'irgendwer', label: 'Irgendwer', typ: 'referenz', zielTypen: ['*'] },
  ],
};
const notiz: LoeschkonzeptTyp = { id: 'n', name: 'Notiz', archiv: { jahre: 3, stichtag: 'fehlt' }, felder: [] };
const haus: LoeschkonzeptTyp = { id: 'h', name: 'Haus', felder: [{ key: 'adresse', label: 'Adresse', typ: 'text' }] };
const aepfel: LoeschkonzeptTyp = { id: 'a', name: 'Äpfel', felder: [] };
const benutzer: LoeschkonzeptTyp = { id: 'b', name: 'Benutzer', system: 'benutzer', felder: [] };
const rolle: LoeschkonzeptTyp = { id: 'ro', name: 'Rolle', system: 'rolle', felder: [] };
const selbst: LoeschkonzeptTyp = {
  id: 's',
  name: 'Selbstbezug',
  felder: [{ key: 'chef', label: 'Chef', typ: 'referenz', zielTypen: ['s'] }],
};

const ALLE = [kunde, person, rechnung, vertrag, notiz, haus, aepfel, benutzer, rolle, selbst];

const basis = (x: Partial<LoeschkonzeptQuelle> = {}): LoeschkonzeptQuelle => ({
  typen: ALLE,
  datenschutz: {
    ...DATENSCHUTZ_STANDARD,
    verantwortlicher: 'Erika Musterfrau\nBeispielweg 1\n\n12345 Musterstadt',
    typen: {
      k: { person: true, zweck: '  Kundenbeziehung ' },
      p: { person: true, zweck: '' },
      s: { person: true, zweck: 'Organigramm' },
      n: { person: false, zweck: 'Gedächtnis' },
      b: { person: true, zweck: 'Anmeldung' },
      h: { person: false, zweck: '   ' },
    },
  },
  papierkorbTage: 30,
  historieTage: 365,
  auskunftTage: 7,
  sicherung: { aktiv: true, haeufigkeit: 'taeglich', aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 } },
  loeschprotokoll: { jahre: 3 },
  version: '0.290.14',
  stand: '2026-11-17',
  mandant: 'Hausverwaltung Muster',
  ...x,
});

const FAELLE: Record<string, LoeschkonzeptQuelle> = {
  voll: basis(),
  ohneLoeschprotokoll: basis({ loeschprotokoll: null }),
  loeschprotokollFehlt: basis({ loeschprotokoll: undefined }),
  einJahrProtokoll: basis({ loeschprotokoll: { jahre: 1 } }),
  ohnePapierkorb: basis({ papierkorbTage: 0, historieTage: 1, auskunftTage: 1 }),
  einTagPapierkorb: basis({ papierkorbTage: 1 }),
  ohneSicherung: basis({ sicherung: null }),
  sicherungAus: basis({
    sicherung: { aktiv: false, haeufigkeit: 'taeglich', aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 } },
  }),
  woechentlich: basis({
    sicherung: { aktiv: true, haeufigkeit: 'woechentlich', aufbewahrung: { taeglich: 7, woechentlich: 4, monatlich: 12 } },
  }),
  nurMonatlich: basis({
    sicherung: { aktiv: true, haeufigkeit: 'taeglich', aufbewahrung: { taeglich: 0, woechentlich: 0, monatlich: 6 } },
  }),
  nurLetzte: basis({
    sicherung: { aktiv: true, haeufigkeit: 'woechentlich', aufbewahrung: { taeglich: 3, woechentlich: 0, monatlich: 0 } },
  }),
  ohneVerantwortlichen: basis({ datenschutz: { ...basis().datenschutz, verantwortlicher: '  ' } }),
  ohneMandantUndVerantwortlichen: basis({ mandant: '', datenschutz: { ...basis().datenschutz, verantwortlicher: '' } }),
  ohneMandant: basis({ mandant: '' }),
  keineTypen: basis({ typen: [] }),
  nurSystem: basis({ typen: [benutzer, rolle] }),
  ohnePersonen: basis({ typen: [haus, aepfel, notiz] }),
  ohneDatenschutz: basis({ datenschutz: DATENSCHUTZ_STANDARD }),
  einzeln: basis({ typen: [kunde] }),
  nurVerweis: basis({
    typen: [kunde, rechnung],
    datenschutz: { ...DATENSCHUTZ_STANDARD, verantwortlicher: 'X', typen: { k: { person: true, zweck: 'Z' } } },
  }),
  jedeMappeOhnePersonen: basis({ typen: [vertrag, haus], datenschutz: { ...DATENSCHUTZ_STANDARD, typen: {} } }),
  alleFristen: basis({
    typen: [2, 6, 8, 10, 5].map((jahre, i) => ({ id: `f${i}`, name: `Frist ${jahre}`, archiv: { jahre, stichtag: null }, felder: [] })),
    datenschutz: {
      ...DATENSCHUTZ_STANDARD,
      typen: Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`f${i}`, { person: i % 2 === 0, zweck: i === 1 ? 'Z' : '' }])),
    },
  }),
};

describe('loeschkonzept: Charakterisierung (#1278)', () => {
  it('erzeugt wie festgehalten', () => {
    const ist: Record<string, unknown> = {};
    for (const [k, q] of Object.entries(FAELLE)) ist[k] = loeschkonzept(q);
    wieFestgehalten('loeschkonzept', ist);
  });
});
