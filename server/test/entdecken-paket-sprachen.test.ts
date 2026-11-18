/**
 * Rundgänge und Tipps aus Paketen in mehreren Sprachen (#1307): Texte aus `texte/<sprache>/entdecken.json`, angezeigt in
 * der Sprache der Person, sonst Text in der Datei bzw. Deutsch. Die Prüfung beim Installieren meldet überzählige
 * Schlüssel (Fehler) und fehlende Übersetzungen (Hinweis); Pakete mit Text direkt in der YAML-Datei laufen weiter.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pruefePaketTexte, paketTextstellen } from '../../shared/src/entdecken-paket';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { inSprache } from '../../shared/src/sprache';
import { ankerListe, paketRundgaenge, paketTipps } from '../src/entdecken/entdecken';
import { Fachfehler } from '../src/grundlagen/fehler';
import { liesPaket } from '../src/pakete/verwaltung/index';
import { mitkommtVon } from '../src/pakete/index';

const MANIFEST =
  'schema: 1\nid: vertraege\nname: Verträge\nversion: 2.2.0\nbeschreibung: x\nautor: { name: x, github: x }\nlizenz: Apache-2.0\ndms: ">=0.291.0"\n' +
  'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  rundgaenge: inhalt/rundgaenge.yaml\n  tipps: inhalt/tipps.yaml\n';
const TYPEN =
  '- schluessel: vertrag\n  name: Vertrag\n  felder:\n    - { key: kuendigen_bis, label: Kündigen bis, typ: datum }\n' +
  '  register:\n    - { key: dokumente, name: Dokumente, art: dokumente }\n';
// Neues Format: nur der Aufbau in der YAML-Datei, die Texte in den Sprachdateien.
const RUNDGANG = `- schluessel: kennenlernen
  start: nach_installation
  oeffne:
    mappe: { typ: vertrag }
  schritte:
    - schluessel: kuendigen_bis
      ziel: mappe.feld:kuendigen_bis
`;
const TIPPS = `- schluessel: frist
  typ: vertrag
  ziel: mappe.feld:kuendigen_bis
`;
const DE = {
  'rundgang.kennenlernen.titel': 'Verträge im Überblick',
  'rundgang.kennenlernen.beschreibung': 'Wo Fristen und Unterlagen eines Vertrags stehen.',
  'rundgang.kennenlernen.ersatz': 'Sobald du einen Vertrag angelegt hast, zeigt dir Ablago hier, wie es geht.',
  'rundgang.kennenlernen.kuendigen-bis.titel': 'Kündigen bis',
  'rundgang.kennenlernen.kuendigen-bis.text': 'Hier steht, bis wann du kündigen musst.',
  'rundgang.kennenlernen.kuendigen-bis.ort': 'Rechts in der Mappe',
  'tipp.frist': 'Trag „Kündigen bis“ ein – Ablago erinnert dich rechtzeitig.',
};
const EN = {
  'rundgang.kennenlernen.titel': 'Contracts at a glance',
  'rundgang.kennenlernen.beschreibung': 'Where the deadlines and documents of a contract are.',
  'rundgang.kennenlernen.kuendigen-bis.titel': 'Cancel by',
  'rundgang.kennenlernen.kuendigen-bis.text': 'This is when you must cancel at the latest.',
  'rundgang.kennenlernen.kuendigen-bis.ort': 'On the right in the folder',
  'tipp.frist': 'Enter “Cancel by” – Ablago reminds you in time.',
};

const json = (x: unknown) => Buffer.from(JSON.stringify(x));
const lies = (o: { rundgaenge?: string; tipps?: string; dateien?: Record<string, Buffer> } = {}) =>
  liesPaket(
    new Map([
      ['manifest.yaml', Buffer.from(MANIFEST)],
      ['inhalt/mappentypen.yaml', Buffer.from(TYPEN)],
      ['inhalt/rundgaenge.yaml', Buffer.from(o.rundgaenge ?? RUNDGANG)],
      ['inhalt/tipps.yaml', Buffer.from(o.tipps ?? TIPPS)],
      ...Object.entries(o.dateien ?? { 'texte/de/entdecken.json': json(DE), 'texte/en/entdecken.json': json(EN) }),
    ]),
  );
const gruende = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    if (e instanceof Fachfehler) return JSON.stringify(e.details);
    throw e;
  }
  return '';
};
const TYP = { kennung: 'vertraege:vertrag', felder: ['kuendigen_bis'], register: ['dokumente'] };
const installiert = (entdecken: NonNullable<InstalliertesPaket['entdecken']>) =>
  ({ id: 'vertraege', version: '2.2.0', entdecken }) as unknown as InstalliertesPaket;
/** Titel des Rundgangs, Text des ersten Schritts und Text des Tipps in einer Sprache. */
const anzeige = (p: InstalliertesPaket, spr: string) =>
  inSprache(spr, () => {
    const r = paketRundgaenge(p, p.entdecken!.rundgaenge, { anker: ankerListe(), typen: () => TYP, texte: p.entdecken!.texte });
    const x = paketTipps(p, p.entdecken!.tipps, { anker: ankerListe(), rundgaenge: [], typen: () => TYP, texte: p.entdecken!.texte });
    assert.deepEqual([...r.fehler, ...x.fehler], []);
    return [r.rundgaenge[0]?.titel, r.rundgaenge[0]?.schritte[0]?.text, r.rundgaenge[0]?.ersatz, x.tipps[0]?.text];
  });

describe('Rundgänge und Tipps aus Paketen: mehrsprachig (#1307)', () => {
  it('Texte aus den Sprachdateien des Pakets, in der Sprache der Person; fehlt eine Übersetzung, gilt Deutsch', () => {
    const p = lies();
    assert.deepEqual(p.entdecken?.texte, { de: DE, en: EN });
    const ip = installiert(p.entdecken!);
    assert.deepEqual(anzeige(ip, 'de'), [
      'Verträge im Überblick',
      'Hier steht, bis wann du kündigen musst.',
      DE['rundgang.kennenlernen.ersatz'],
      DE['tipp.frist'],
    ]);
    // Englisch; „ersatz“ fehlt in der Übersetzung → Deutsch.
    assert.deepEqual(anzeige(ip, 'en'), [
      'Contracts at a glance',
      'This is when you must cancel at the latest.',
      DE['rundgang.kennenlernen.ersatz'],
      EN['tipp.frist'],
    ]);
    // Regionale Sprache nimmt die Hauptsprache, eine fremde die Grundsprache.
    assert.equal(anzeige(ip, 'en-US')[0], 'Contracts at a glance');
    assert.equal(anzeige(ip, 'fr')[0], 'Verträge im Überblick');
  });

  it('Text direkt in der YAML-Datei läuft weiter (auch gemischt mit einer Übersetzung)', () => {
    const alt = RUNDGANG.replace('  start:', '  titel: Verträge im Überblick\n  beschreibung: Wo Fristen stehen.\n  start:').replace(
      '      ziel: mappe.feld:kuendigen_bis\n',
      '      ziel: mappe.feld:kuendigen_bis\n      ort: Rechts in der Mappe\n      titel: Kündigen bis\n      text: Hier steht die Frist.\n',
    );
    const tipps = `${TIPPS}  text: Trag die Frist ein.\n`;
    // Ohne Sprachdateien: wie bisher.
    const ohne = lies({ rundgaenge: alt, tipps, dateien: {} });
    assert.equal(ohne.entdecken?.texte, undefined);
    assert.equal(anzeige(installiert(ohne.entdecken!), 'en')[0], 'Verträge im Überblick');
    // Mit englischer Übersetzung: Englisch für englische Personen, Deutsch aus der Datei für alle anderen.
    const mit = lies({ rundgaenge: alt, tipps, dateien: { 'texte/en/entdecken.json': json(EN) } });
    assert.equal(anzeige(installiert(mit.entdecken!), 'en')[0], 'Contracts at a glance');
    assert.equal(anzeige(installiert(mit.entdecken!), 'de')[3], 'Trag die Frist ein.');
  });

  it('Prüfung beim Installieren: überzählige Schlüssel und kaputte Dateien sind Fehler, Übersetzungen wie Deutsch geprüft', () => {
    assert.match(
      gruende(() => lies({ dateien: { 'texte/de/entdecken.json': json({ ...DE, 'tipp.gibt-es-nicht': 'x' }) } })),
      /texte\/de\/entdecken.json: Diese Schlüssel gehören zu keinem Rundgang, Schritt oder Tipp des Pakets: tipp.gibt-es-nicht/,
    );
    assert.match(
      gruende(() => lies({ dateien: { 'texte/de/entdecken.json': Buffer.from('[1]') } })),
      /JSON-Objekt mit Texten/,
    );
    assert.match(
      gruende(() => lies({ dateien: { 'texte/de/entdecken.json': json({ ...DE, 'tipp.frist': 3 }) } })),
      /JSON-Objekt/,
    );
    // Ohne Deutsch fehlt der Text in der Grundsprache.
    assert.match(
      gruende(() => lies({ dateien: { 'texte/en/entdecken.json': json(EN) } })),
      /Text „titel“ fehlt/,
    );
    // Zu lang in der Übersetzung: Fehler mit der Datei der Sprache.
    const lang = { ...EN, 'tipp.frist': `${'x'.repeat(170)}.` };
    assert.match(
      gruende(() => lies({ dateien: { 'texte/de/entdecken.json': json(DE), 'texte/en/entdecken.json': json(lang) } })),
      /texte\/en\/entdecken.json: Tipp „frist“: „text“ ist 171 Zeichen lang, höchstens 160/,
    );
    assert.match(
      gruende(() => lies({ dateien: { 'texte/de/entdecken.json': json({ ...DE, 'tipp.frist': 'Ein <b>Satz</b>.' }) } })),
      /spitze Klammern/,
    );
    // Andere Dateien unter texte/ (z. B. falsche Sprache) liest Ablago nicht als Sprachdatei.
    assert.equal(
      lies({ dateien: { 'texte/de/entdecken.json': json(DE), 'texte/Deutsch/entdecken.json': json({}) } }).entdecken?.texte?.Deutsch,
      undefined,
    );
  });

  it('Hinweise: fehlende Übersetzungen je Sprache, nur eine Sprache bei Text in der Datei', () => {
    const b = pruefePaketTexte({ de: DE, en: EN }, lies().entdecken!.rundgaenge, lies().entdecken!.tipps);
    assert.deepEqual(b.ueberzaehlig, []);
    assert.deepEqual(b.fehlt, [{ sprache: 'en', schluessel: ['rundgang.kennenlernen.ersatz'] }]);
    assert.equal(b.inDatei, 0);
    assert.equal(b.nurEineSprache, false);
    // Hinweise der Vorschau (planen-lauf.ts, inhaltsHinweise) aus dem Befund.
    const befund = (p: ReturnType<typeof lies>) => pruefePaketTexte(p.entdecken?.texte, p.entdecken?.rundgaenge, p.entdecken?.tipps);
    const nurDeutsch = befund(lies({ dateien: { 'texte/de/entdecken.json': json(DE) } }));
    assert.deepEqual([nurDeutsch.fehlt, nurDeutsch.nurEineSprache], [[], false]);
    // Text direkt in der Datei, keine Übersetzung: nur eine Sprache.
    const tipps = `${TIPPS}  text: Trag die Frist ein.\n`;
    const inDatei = befund(lies({ tipps, dateien: { 'texte/de/entdecken.json': json({ ...DE, 'tipp.frist': undefined }) } }));
    assert.deepEqual([inDatei.inDatei, inDatei.nurEineSprache], [1, true]);
    // Mit Übersetzung: kein Hinweis auf eine Sprache, aber auf den fehlenden Tipp in Englisch.
    const gemischt = befund(
      lies({
        tipps,
        dateien: { 'texte/de/entdecken.json': json(DE), 'texte/en/entdecken.json': json({ ...EN, 'tipp.frist': undefined }) },
      }),
    );
    assert.equal(gemischt.nurEineSprache, false);
    assert.deepEqual(gemischt.fehlt, [{ sprache: 'en', schluessel: ['rundgang.kennenlernen.ersatz', 'tipp.frist'] }]);
    // Alle Stellen eines Rundgangs mit Pflicht und Herkunft.
    assert.deepEqual(
      paketTextstellen([{ schluessel: 'a', titel: 'T', schritte: [{ schluessel: 'b_c' }] }], [])
        .filter((s) => s.pflicht)
        .map((s) => [s.schluessel, s.inDatei]),
      [
        ['rundgang.a.titel', true],
        ['rundgang.a.beschreibung', false],
        ['rundgang.a.b-c.titel', false],
        ['rundgang.a.b-c.text', false],
      ],
    );
  });

  it('„Was mitkommt“ nennt den Rundgang in der Sprache der Person', () => {
    const p = lies();
    const namen = { typ: (x: string) => x, feld: (_x: string, k: string) => k };
    const plan = { typen: [], sichten: [], vorgaben: [], ergaenzungen: [], automatisierungen: [], einstellungen: null };
    const name = (spr: string) => inSprache(spr, () => mitkommtVon(p, plan, namen, false).rundgaenge?.[0]);
    assert.deepEqual(name('en'), {
      schluessel: 'kennenlernen',
      name: 'Contracts at a glance',
      beschreibung: EN['rundgang.kennenlernen.beschreibung'],
    });
    assert.equal(name('de')?.name, 'Verträge im Überblick');
  });
});
