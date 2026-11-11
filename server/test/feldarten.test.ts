/**
 * Feldarten Zeitraum und Prozent, negative Beträge (#1035): Lesen und Anzeigen (de, en), Prüfen, Speichern, Titel,
 * Sortieren, Bedingungen, Suche, Erkennung, Export, Paketformat und Migration 094. Personas und Werte sind erfunden.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { liesDirektlink, linkZuMappe } from '../../shared/src/direktlink';
import { pruefeVorschlaege, schemaFuer, vorschlaegeAus } from '../../shared/src/erkennung';
import { abfrageAus, chipsVon, leeresFormular } from '../../shared/src/erweitertesuche';
import { einheitText, leseProzent, leseZeitraum, mitMinus, prozentText, rechtsbuendig, zeitraumIso, zeitraumTage, zeitraumText } from '../../shared/src/feldarten';
import { formatiere, istLeer, leseZahl, pruefeMappe, pruefeMappentyp, type Feld, type Mappentyp } from '../../shared/src/model';
import { beschreibeBedingung, bedingungsProblem, erfuellt, filterFuer, type Bedingung } from '../../shared/src/sichten';
import { inSprache } from '../../shared/src/sprache';
import { textformen, wertAusText } from '../../shared/src/uebernehmen';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { zeile } from '../src/export';
import { Fachfehler } from '../src/fehler';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { FELDARTEN_AB, mindestversion, Paketerstellung } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { xlsxAus } from '../src/xlsx';
import { eigeneDatenbank, MIGRATIONEN } from './hilfe-db';
import '../src/sprache';

const SCHMAL = '\u202f';
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const ADMIN = { id: 'x', rolle: 'admin' };

const FELDER: Feld[] = [
  { key: 'nr', label: 'Vertragsnummer', typ: 'text', pflicht: true },
  { key: 'frist', label: 'Kündigungsfrist', typ: 'zeitraum' },
  { key: 'laufzeit', label: 'Laufzeit', typ: 'zeitraum', standard: '2 Jahre' },
  { key: 'steuersatz', label: 'Steuersatz', typ: 'prozent', max: 100, nachkomma: 2 },
  { key: 'betrag', label: 'Betrag', typ: 'betrag', waehrung: 'EUR' },
  { key: 'gutschrift', label: 'Gutschrift', typ: 'betrag', waehrung: 'EUR', negativ: true },
];

function dienst(repo: Repo = speicherRepo()) {
  return new Dienst(repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
}
async function vertraege(d: Dienst) {
  const typ = await d.mappentypen.legeTypAn({ name: 'Vertrag', schluessel: 'vertrag', titelVorlage: '{nr} – {frist}', felder: FELDER.map((f) => ({ ...f })), trefferliste: ['nr', 'frist', 'steuersatz', 'gutschrift'] });
  const m = async (nr: string, werte: Record<string, unknown>) => d.mappen.legeMappeAn({ typId: typ.id, werte: { nr, ...werte } });
  return { typ, m };
}

describe('Zeitraum und Prozent lesen und zeigen (#1035)', () => {
  it('Zeitraum: Zahl und Einheit, ISO 8601 und Text in de und en; Einzahl und Mehrzahl', () => {
    assert.deepEqual(leseZeitraum('3 Monate'), { anzahl: 3, einheit: 'monate' });
    assert.deepEqual(leseZeitraum('1 Monat'), { anzahl: 1, einheit: 'monate' });
    assert.deepEqual(leseZeitraum('14 Tagen'), { anzahl: 14, einheit: 'tage' });
    assert.deepEqual(leseZeitraum('2 weeks'), { anzahl: 2, einheit: 'wochen' });
    assert.deepEqual(leseZeitraum('P1Y'), { anzahl: 1, einheit: 'jahre' });
    assert.deepEqual(leseZeitraum({ anzahl: '6', einheit: 'monate' }), { anzahl: 6, einheit: 'monate' });
    assert.equal(leseZeitraum(''), null);
    assert.equal(leseZeitraum({ anzahl: '', einheit: 'monate' }), null);
    for (const x of ['drei Monate', '3 Quartale', '-1 Monat', '1,5 Jahre', '10000 Tage', { anzahl: 3, einheit: 'quartale' }]) assert.equal(leseZeitraum(x), undefined, JSON.stringify(x));
    assert.equal(zeitraumIso({ anzahl: 3, einheit: 'monate' }), 'P3M');
    assert.deepEqual([zeitraumText({ anzahl: 1, einheit: 'monate' }), zeitraumText({ anzahl: 3, einheit: 'monate' }), zeitraumText({ anzahl: 1, einheit: 'jahre' }), zeitraumText({ anzahl: 0, einheit: 'tage' })],
      ['1 Monat', '3 Monate', '1 Jahr', '0 Tage']);
    assert.deepEqual(inSprache('en', () => [zeitraumText({ anzahl: 1, einheit: 'wochen' }), zeitraumText({ anzahl: 3, einheit: 'monate' })]), ['1 week', '3 months']);
    assert.deepEqual([einheitText('monate', 1), einheitText('monate', 3)], ['Monat', 'Monate']);
    // Vergleichen in Tagen: 12 Monate = 1 Jahr, 3 Monate > 13 Wochen.
    assert.equal(zeitraumTage({ anzahl: 12, einheit: 'monate' }), zeitraumTage({ anzahl: 1, einheit: 'jahre' }));
    assert.ok(zeitraumTage({ anzahl: 3, einheit: 'monate' }) > zeitraumTage({ anzahl: 13, einheit: 'wochen' }));
  });

  it('Prozent: „19“, „19 %“ und „19,0“ gleich; Anzeige mit schmalem geschütztem Leerzeichen (de), ohne (en)', () => {
    assert.deepEqual(['19', '19 %', '19,0', `19${SCHMAL}%`, '19%'].map(leseProzent), [19, 19, 19, 19, 19]);
    assert.equal(leseProzent('7,5 %'), 7.5);
    assert.equal(leseProzent(''), null);
    assert.ok(Number.isNaN(leseProzent('neunzehn')));
    assert.equal(prozentText(19), `19${SCHMAL}%`);
    assert.equal(prozentText(7.5), `7,5${SCHMAL}%`);
    assert.equal(inSprache('en', () => prozentText(7.5)), '7.5%');
    const f: Feld = { key: 's', label: 'Steuersatz', typ: 'prozent' };
    assert.equal(formatiere(f, 19), `19${SCHMAL}%`);
    assert.equal(formatiere({ key: 'z', label: 'Frist', typ: 'zeitraum' }, { anzahl: 3, einheit: 'monate' }), '3 Monate');
  });

  it('negativer Betrag: Minuszeichen in Listen gut sichtbar; Eingabe mit Minuszeichen gelesen; Zahlen rechtsbündig', () => {
    assert.equal(mitMinus('-25,00 €'), '\u221225,00 €');
    assert.equal(mitMinus('25,00 €'), '25,00 €');
    assert.equal(leseZahl('\u221225,00'), -25);
    // formatiere bleibt beim Bindestrich (Titel, CSV, Programme lesen ihn als Minus).
    assert.match(formatiere({ key: 'b', label: 'B', typ: 'betrag' }, { betrag: -25, waehrung: 'EUR' }), /^-25,00\s€$/);
    assert.deepEqual(['zahl', 'betrag', 'prozent', 'zeitraum', 'text'].map(rechtsbuendig), [true, true, true, false, false]);
  });
});

describe('Prüfen (#1035)', () => {
  const typ = { felder: FELDER };
  const ctx = { typVon: () => undefined, doppelt: () => undefined };
  const fehler = (werte: Record<string, unknown>) => pruefeMappe(typ, { nr: 'V-1', ...werte } as never, ctx).felder;

  it('Zeitraum nur als { anzahl, einheit } mit ganzer Zahl 0–9999; leer ohne Anzahl', () => {
    assert.deepEqual(fehler({ frist: { anzahl: 3, einheit: 'monate' } }), {});
    assert.match(fehler({ frist: { anzahl: 1.5, einheit: 'jahre' } }).frist[0], /ganze Zahl von 0 bis 9999/);
    assert.ok(fehler({ frist: { anzahl: 3, einheit: 'quartale' } }).frist);
    assert.ok(fehler({ frist: '3 Monate' }).frist, 'Text gleicht erst bereinigeWerte an');
    assert.ok(istLeer({ anzahl: '', einheit: 'monate' }));
  });

  it('Prozent wie Zahl mit Grenzen und Nachkommastellen', () => {
    assert.deepEqual(fehler({ steuersatz: 19 }), {});
    assert.match(fehler({ steuersatz: 120 }).steuersatz[0], /Höchstens 100/);
    assert.match(fehler({ steuersatz: 7.125 }).steuersatz[0], /Nachkommastellen/);
    assert.match(fehler({ steuersatz: Number.NaN }).steuersatz[0], /Prozentzahl/);
  });

  it('negativer Betrag nur mit „negativ“ am Feld; Minimum unter 0 nur dann', () => {
    assert.match(fehler({ betrag: { betrag: -5, waehrung: 'EUR' } }).betrag[0], /nicht negativ/);
    assert.deepEqual(fehler({ betrag: { betrag: 0, waehrung: 'EUR' }, gutschrift: { betrag: -25, waehrung: 'EUR' } }), {});
    const ok = { namenAndererTypen: [], existiertTyp: () => true };
    const typFehler = (f: Feld) => Object.values(pruefeMappentyp({ name: 'T', felder: [f], register: [{ key: 'r', name: 'R', art: 'felder', felder: [f.key] }] } as never, ok).felder).flat();
    assert.match(typFehler({ key: 'b', label: 'B', typ: 'betrag', min: -100 }).join(' '), /Negative Beträge erlauben/);
    assert.deepEqual(typFehler({ key: 'b', label: 'B', typ: 'betrag', min: -100, negativ: true }), []);
    assert.match(typFehler({ key: 'z', label: 'Z', typ: 'zeitraum', standard: 'bald' }).join(' '), /kein Zeitraum/);
    assert.match(typFehler({ key: 'p', label: 'P', typ: 'prozent', standard: 'viel' }).join(' '), /keine Prozentzahl/);
  });
});

describe('Speichern, Titel und Sortieren (#1035)', () => {
  it('Eingaben werden angeglichen, Standardwerte gelesen, Titel mit Einzahl und Mehrzahl', async () => {
    const d = dienst();
    const { typ, m } = await vertraege(d);
    assert.equal(typ.felder.find((f) => f.key === 'laufzeit')!.standard, 'P2Y', 'Standard in der kurzen Schreibweise');
    assert.equal(typ.felder.find((f) => f.key === 'gutschrift')!.negativ, true);
    assert.equal(typ.felder.find((f) => f.key === 'betrag')!.negativ, undefined, 'Vorgabe aus');
    const a = await m('V-1', { frist: '3 Monate', steuersatz: '19 %', gutschrift: { betrag: -25, waehrung: 'EUR' } });
    assert.deepEqual(a.werte.frist, { anzahl: 3, einheit: 'monate' });
    assert.equal(a.werte.steuersatz, 19);
    assert.equal(a.titel, 'V-1 – 3 Monate');
    const b = await m('V-2', { frist: 'P1M', steuersatz: '19,0' });
    assert.equal(b.titel, 'V-2 – 1 Monat');
    assert.equal(b.werte.steuersatz, 19);
    const c = await m('V-3', { frist: { anzahl: '6', einheit: 'wochen' } });
    assert.deepEqual(c.werte.frist, { anzahl: 6, einheit: 'wochen' });
    await assert.rejects(m('V-4', { frist: 'drei Monate' }), (e) => e instanceof Fachfehler && /Kündigungsfrist/.test(e.message));
    await assert.rejects(m('V-5', { betrag: { betrag: -1, waehrung: 'EUR' } }), (e) => e instanceof Fachfehler && /nicht negativ/.test(JSON.stringify(e.details)));
  });

  it('Sortieren: Zeitraum nach der Länge (in Tagen), Prozent wie Zahl, leere zuletzt', async () => {
    const d = dienst();
    await sortierenUndFiltern(d);
  });
});

/** Gemeinsam für Arbeitsspeicher und PostgreSQL: Sortieren und Bedingungen. */
async function sortierenUndFiltern(d: Dienst) {
  const { typ, m } = await vertraege(d);
  await m('A', { frist: '3 Monate', steuersatz: 19 });
  await m('B', { frist: '13 Wochen', steuersatz: 7 });
  await m('C', { frist: '1 Jahr', steuersatz: 0 });
  await m('D', { frist: '14 Tage' });
  await m('E', {});
  const nrn = async (sortierung: string, absteigend = false) =>
    (await d.sichten.seite(ADMIN, { sicht: typ.id, sortierung, absteigend: String(absteigend) })).mappen.map((x) => String(x.werte.nr)).join('');
  assert.equal(await nrn('frist'), 'DBACE', '14 Tage < 13 Wochen < 3 Monate < 1 Jahr, leer zuletzt');
  assert.equal(await nrn('frist', true), 'CABDE');
  assert.equal(await nrn('steuersatz'), 'CBADE');
  // Bedingungen: Zeitraum in Tagen, Prozent wie Zahl.
  const treffer = async (bedingungen: Bedingung[]) => {
    const s = await d.sichtenVerwaltung.legeSichtAn({ name: `S ${Math.random()}`, typen: [typ.id], bedingungen });
    return (await d.sichten.seite(ADMIN, { sicht: s.id, sortierung: 'nr' })).mappen.map((x) => String(x.werte.nr)).join('');
  };
  assert.equal(await treffer([{ art: 'feld', feld: 'frist', op: 'groesser', wert: { art: 'fest', wert: 'P2M' } }]), 'ABC');
  assert.equal(await treffer([{ art: 'feld', feld: 'frist', op: 'gleich', wert: { art: 'fest', wert: 'P3M' } }]), 'A');
  assert.equal(await treffer([{ art: 'feld', feld: 'frist', op: 'zwischen', wert: { art: 'fest', wert: 'P1W' }, bis: { art: 'fest', wert: 'P3M' } }]), 'ABD');
  assert.equal(await treffer([{ art: 'feld', feld: 'frist', op: 'leer' }]), 'E');
  assert.equal(await treffer([{ art: 'feld', feld: 'steuersatz', op: 'gleich', wert: { art: 'fest', wert: 19 } }]), 'A');
  assert.equal(await treffer([{ art: 'feld', feld: 'steuersatz', op: 'kleiner', wert: { art: 'fest', wert: 10 } }]), 'BC');
  return typ;
}

describe('Bedingungen, Suche und Links (#1035)', () => {
  const typ = { id: 't', name: 'Vertrag', schluessel: 'vertrag', felder: FELDER, register: [{ key: 'r', name: 'R', art: 'felder', felder: FELDER.map((f) => f.key) }], titelVorlage: '{nr}' } as unknown as Mappentyp;

  it('Bedingung lesbar, ungültiger Zeitraum ist ein Problem, Auswertung im Arbeitsspeicher', () => {
    const b: Bedingung = { art: 'feld', feld: 'frist', op: 'kleiner', wert: { art: 'fest', wert: 'P1Y' } };
    assert.equal(beschreibeBedingung(b, [typ]), 'Kündigungsfrist kleiner als 1 Jahr');
    assert.match(bedingungsProblem({ ...b, wert: { art: 'fest', wert: 'bald' } }, [typ])!, /kein Zeitraum/);
    const filter = filterFuer({ bedingungen: [b] }, [typ], { heute: '2026-11-10', ich: 'x', meineRollen: [] });
    const z = { dokumente: () => 0, verknuepfungen: () => 0 };
    const mappe = (frist: unknown) => ({ id: 'm', typId: 't', werte: { frist }, erstellt: '', geaendert: '', erstelltVon: null, geaendertVon: null }) as never;
    assert.ok(erfuellt(mappe({ anzahl: 11, einheit: 'monate' }), filter, z));
    assert.ok(!erfuellt(mappe({ anzahl: 12, einheit: 'monate' }), filter, z), '12 Monate = 1 Jahr');
  });

  it('erweiterte Suche: Zeitraum von–bis als Text, Prozent mit Zeichen; Chips lesbar', () => {
    const f = { ...leeresFormular(), typen: ['vertrag'], felder: { frist: { von: '1 Monat', bis: '6 Monate' }, steuersatz: { von: '7 %' } } };
    const a = abfrageAus(f, [typ]);
    assert.deepEqual(a.fehler, []);
    assert.deepEqual(a.bedingungen[0], { art: 'feld', feld: 'frist', op: 'zwischen', wert: { art: 'fest', wert: 'P1M' }, bis: { art: 'fest', wert: 'P6M' } });
    assert.deepEqual(a.bedingungen[1].art === 'feld' && a.bedingungen[1].wert, { art: 'fest', wert: 7 });
    assert.deepEqual(chipsVon(f, [typ], (x) => x, (x) => x).map((c) => c.text).slice(1), ['Kündigungsfrist 1 Monat–6 Monate', `Steuersatz ab 7${SCHMAL}%`]);
    assert.match(abfrageAus({ ...f, felder: { frist: { von: 'bald' } } }, [typ]).fehler[0], /kein Zeitraum/);
  });

  it('Direktlink: „3 Monate“ bzw. P3M und „19 %“; Link zu einer Mappe mit P3M', () => {
    const r = liesDirektlink(new URLSearchParams('typ=vertrag&frist=3+Monate&steuersatz=19+%25'), [typ]);
    assert.ok(r.ok, JSON.stringify(r));
    const l = (r as { link: { bedingungen: Bedingung[] } }).link;
    assert.deepEqual(l.bedingungen.map((b) => b.art === 'feld' && b.wert), [{ art: 'fest', wert: 'P3M' }, { art: 'fest', wert: 19 }]);
    const eindeutig = { ...typ, felder: FELDER.map((f) => (f.key === 'frist' ? { ...f, eindeutig: true } : f)) } as Mappentyp;
    assert.match(linkZuMappe(eindeutig, { id: 'm', typId: 't', werte: { frist: { anzahl: 3, einheit: 'monate' } } } as never)!, /frist=P3M/);
  });
});

describe('Erkennung und „Dokument übernehmen“ (#1035, #939)', () => {
  const typ = { felder: [
    { key: 'kuendigungsfrist', label: 'Kündigungsfrist', typ: 'zeitraum', erkennung: {} },
    { key: 'laufzeit', label: 'Laufzeit', typ: 'zeitraum', erkennung: {} },
    { key: 'steuersatz', label: 'Steuersatz', typ: 'prozent', erkennung: {} },
  ] as Feld[] };

  it('findet Zeitraum neben der Bezeichnung und Prozent im Text', () => {
    const text = 'Stromvertrag für Lena Beispiel\nMindestlaufzeit: 24 Monate\nDie Kündigungsfrist beträgt\n3 Monate zum Monatsende.\nEnthält 19 % MwSt.';
    const v = vorschlaegeAus(typ, text);
    assert.deepEqual(v.kuendigungsfrist?.wert, { anzahl: 3, einheit: 'monate' });
    assert.equal(v.kuendigungsfrist?.sicherheit, 'mittel');
    assert.deepEqual(v.laufzeit?.wert, { anzahl: 24, einheit: 'monate' });
    assert.equal(v.steuersatz?.wert, 19);
    assert.equal(v.steuersatz?.sicherheit, 'niedrig', 'ohne Bezeichnung im Text');
  });

  it('Antwort einer Engine: Zeitraum als Objekt oder P3M, Prozent als Zahl; Schema beschreibt beide', () => {
    const { vorschlaege, verworfen } = pruefeVorschlaege(typ, { kuendigungsfrist: { wert: 'P3M' }, laufzeit: { wert: { anzahl: 1.5, einheit: 'jahre' } }, steuersatz: { wert: '19 %' } });
    assert.deepEqual(vorschlaege.kuendigungsfrist?.wert, { anzahl: 3, einheit: 'monate' });
    assert.equal(vorschlaege.steuersatz?.wert, 19);
    assert.deepEqual(verworfen.map((x) => x.feld), ['laufzeit']);
    const s = schemaFuer({ name: 'Vertrag', felder: typ.felder }) as { properties: Record<string, { properties: { wert: Record<string, unknown> } }> };
    assert.deepEqual(s.properties.kuendigungsfrist.properties.wert.required, ['anzahl', 'einheit']);
    assert.equal(s.properties.steuersatz.properties.wert.type, 'number');
  });

  it('Text vom Dokument als Wert, Textformen für die Fundstelle', () => {
    assert.deepEqual(wertAusText({ typ: 'zeitraum' }, '3 Monaten.'), { anzahl: 3, einheit: 'monate' });
    assert.equal(wertAusText({ typ: 'prozent' }, '19 %'), 19);
    assert.ok(textformen({ typ: 'zeitraum' }, { anzahl: 3, einheit: 'monate' }).includes('3 Monate'));
    assert.ok(textformen({ typ: 'prozent' }, 7.5).includes('7,5 %'));
  });
});

describe('Export (#1035)', () => {
  it('CSV-Text lesbar, Excel: Prozent als echte Prozentzahl, Zeitraum als Text', () => {
    const typ = { id: 't', name: 'Vertrag', felder: FELDER, register: [] } as unknown as Mappentyp;
    const m = { id: 'm', typId: 't', werte: { nr: 'V-1', frist: { anzahl: 1, einheit: 'monate' }, steuersatz: 19, gutschrift: { betrag: -25, waehrung: 'EUR' } }, erstellt: '2026-11-10T10:00:00Z', geaendert: '2026-11-10T10:00:00Z', erstelltVon: null, geaendertVon: null } as never;
    const z = zeile(m, ['frist', 'steuersatz', 'gutschrift'], { typen: new Map([['t', typ]]), titel: () => '' });
    assert.deepEqual(z.text.slice(0, 2), ['1 Monat', `19${SCHMAL}%`]);
    assert.deepEqual(z.werte, ['1 Monat', { prozent: 19 }, { betrag: -25, waehrung: 'EUR' }]);
    const xlsx = liesZip(xlsxAus('Verträge', ['Frist', 'Satz', 'Gutschrift'], [z.werte]));
    const blatt = xlsx.get('xl/worksheets/sheet1.xml')!.toString();
    assert.match(blatt, /<c r="B2" s="4"><v>0\.19<\/v><\/c>/);
    assert.match(blatt, /<c r="C2" s="5"><v>-25<\/v><\/c>/);
    assert.match(xlsx.get('xl/styles.xml')!.toString(), /<xf numFmtId="10"/);
  });
});

describe('Paketformat (#1035)', () => {
  const dms = (version: string) => {
    const d = dienst();
    return { d, p: new Paketverwaltung(d, { version: () => version, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } }), e: new Paketerstellung(d, { version: () => version }) };
  };
  const angaben = (typen: string[], beispiele: string[], dmsBereich: string) => ({
    typen, sichten: [], beispiele, id: 'vertraege_test', name: 'Verträge (Test)', version: '1.0.0', beschreibung: 'Verträge mit Kündigungsfrist und Steuersatz.',
    autor: { name: 'Lena Beispiel', github: 'lena' }, lizenz: 'MIT', dms: dmsBereich, aenderungen: '',
  });

  it('Paket erstellen braucht die neue Ablago-Version, installieren bringt Felder und Beispiele mit', async () => {
    assert.equal(mindestversion(['feldarten']).version, FELDARTEN_AB);
    const q = dms(FELDARTEN_AB);
    const { typ, m } = await vertraege(q.d);
    const v = await m('V-1', { frist: '3 Monate', steuersatz: 19, gutschrift: { betrag: -25, waehrung: 'EUR' } });
    const zuAlt = await q.e.pruefe(angaben([typ.id], [v.id], '>=0.86.0'));
    assert.ok(zuAlt.probleme.some((p) => p.includes('Zeitraum und Prozent') && p.includes(FELDARTEN_AB)), zuAlt.probleme.join(' | '));
    const a = angaben([typ.id], [v.id], `>=${FELDARTEN_AB}`);
    assert.deepEqual((await q.e.pruefe(a)).probleme, []);
    const zip = await q.e.exportiere(a, ICH);
    const dateien = liesZip(zip.daten);
    const typen = parse(dateien.get('vertraege_test/inhalt/mappentypen.yaml')!.toString()) as Array<{ felder: Array<Record<string, unknown>> }>;
    assert.deepEqual(typen[0].felder.filter((f) => ['frist', 'laufzeit', 'gutschrift'].includes(String(f.key))).map((f) => [f.key, f.typ, f.standard ?? null, f.negativ ?? null]),
      [['frist', 'zeitraum', null, null], ['laufzeit', 'zeitraum', 'P2Y', null], ['gutschrift', 'betrag', null, true]]);
    const bsp = parse(dateien.get('vertraege_test/inhalt/beispiele.yaml')!.toString()) as Array<{ werte: Record<string, unknown> }>;
    assert.deepEqual(bsp[0].werte.frist, { anzahl: 3, einheit: 'monate' });
    assert.equal(bsp[0].werte.gutschrift, -25);

    const z = dms(FELDARTEN_AB);
    const h = await z.p.hochladen(zip.daten, ICH);
    assert.deepEqual(h.vorschau.probleme, []);
    const paket = await z.p.installiere({ upload: h.upload, bestaetigt: true, beispiele: true }, ICH);
    const zt = (await z.d.mappentypen.listeTypen()).find((t) => t.id === paket.typen.vertrag)!;
    assert.deepEqual(zt.felder.map((f) => [f.key, f.typ]).slice(1, 4), [['frist', 'zeitraum'], ['laufzeit', 'zeitraum'], ['steuersatz', 'prozent']]);
    assert.equal(zt.felder.find((f) => f.key === 'gutschrift')!.negativ, true);
    const [beispiel] = (await z.d.sichten.seite(ADMIN, { sicht: zt.id })).mappen;
    assert.deepEqual(beispiel.werte.frist, { anzahl: 3, einheit: 'monate' });
    assert.deepEqual(beispiel.werte.gutschrift, { betrag: -25, waehrung: 'EUR' });

    // Eine ältere Ablago-Version lehnt das Paket ab, statt die Felder still zu Text zu machen.
    const alt = dms('0.226.0');
    const ha = await alt.p.hochladen(zip.daten, ICH);
    assert.ok(ha.vorschau.probleme.some((p) => p.includes(FELDARTEN_AB)), ha.vorschau.probleme.join(' | '));
  });

  it('Prüfung beim Installieren: unbekannte Feldart und negativ außerhalb von Beträgen', () => {
    const manifest = 'schema: 1\nid: falsch\nname: Falsch\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.86.0"\ninhalt: { mappentypen: mappentypen.yaml }\n';
    const typen = '- schluessel: vertrag\n  name: Vertrag\n  felder:\n    - { key: frist, label: Frist, typ: dauer }\n    - { key: satz, label: Satz, typ: prozent, negativ: true }\n  register:\n    - { key: angaben, name: Angaben, art: felder, felder: [frist, satz] }\n';
    const gruende = (e: unknown) => (e instanceof Fachfehler ? ((e.details as { gruende?: string[] })?.gruende ?? [e.message]) : []).join(' | ');
    assert.throws(() => liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['mappentypen.yaml', Buffer.from(typen)]])),
      (e) => /unbekannte Feldart „dauer“/.test(gruende(e)) && /negativ gibt es nur bei Beträgen/.test(gruende(e)));
    // Gültig: zeitraum und prozent.
    const gut = typen.replace('typ: dauer', 'typ: zeitraum').replace(', negativ: true', '');
    assert.equal(liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['mappentypen.yaml', Buffer.from(gut)]])).typen[0].felder[0].typ, 'zeitraum');
  });
});

describe('Zeitraum, Prozent und Migration 094 – PostgreSQL (#1035)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  const H = '00000000-0000-4000-8000-000000000001';

  it('Sortieren und Bedingungen in SQL wie im Arbeitsspeicher', async () => {
    const db = await eigeneDatenbank('feldarten');
    const { pgRepo } = await import('../src/repo-pg');
    try {
      await sortierenUndFiltern(dienst(pgRepo(db.sql, H) as never as Repo));
    } finally { await db.ende(); }
  });

  it('Migration 094: Betragsfelder mit gespeicherten negativen Beträgen erlauben sie weiter, andere bleiben', async () => {
    const db = await eigeneDatenbank('betrag_negativ');
    const { pgRepo } = await import('../src/repo-pg');
    try {
      const d = dienst(pgRepo(db.sql, H) as never as Repo);
      const typ = await d.mappentypen.legeTypAn({ name: 'Beleg', felder: [
        { key: 'nr', label: 'Nr', typ: 'text' },
        { key: 'betrag', label: 'Betrag', typ: 'betrag', waehrung: 'EUR' },
        { key: 'skonto', label: 'Skonto', typ: 'betrag', waehrung: 'EUR' },
      ] });
      // So, als stünde aus einer älteren Version schon eine Gutschrift in der Datenbank.
      await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: 'G-1', betrag: { betrag: 10, waehrung: 'EUR' }, skonto: { betrag: 2, waehrung: 'EUR' } } });
      await db.sql`UPDATE mappen SET werte = jsonb_set(werte, '{betrag,betrag}', '-49.9'::jsonb) WHERE typ_id = ${typ.id}`;
      await db.sql.unsafe(readFileSync(`${MIGRATIONEN}/093_betrag_negativ.sql`, 'utf8'));
      const [t] = await db.sql<Array<{ felder: Feld[] }>>`SELECT felder FROM mappentypen WHERE id = ${typ.id}`;
      assert.deepEqual(t.felder.map((f) => [f.key, f.negativ ?? null]), [['nr', null], ['betrag', true], ['skonto', null]]);
      // Noch einmal ausgeführt ändert nichts.
      await db.sql.unsafe(readFileSync(`${MIGRATIONEN}/093_betrag_negativ.sql`, 'utf8'));
      const [t2] = await db.sql<Array<{ felder: Feld[] }>>`SELECT felder FROM mappentypen WHERE id = ${typ.id}`;
      assert.deepEqual(t2.felder, t.felder);
    } finally { await db.ende(); }
  });
});
