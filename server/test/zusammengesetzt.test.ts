/**
 * Feldart Zusammengesetzt (#1050): Vorlage und ihre Prüfung, Schlüssel ohne Sprache mit Kennungen statt Titeln
 * (Ergänzung Sicherheit), Text je Person, schreibgeschützt (gesendete Werte zählen nicht), eindeutig als Kombination
 * (422 am ersten beteiligten Feld, ohne Titel nicht lesbarer Mappen), Neuberechnen nach einer Änderung der Vorlage mit
 * Rückfrage bei Doppelten, Historie, Bedingungen, Wiederfinden, Export, Paketformat. Der Kern läuft im Arbeitsspeicher
 * und – mit TEST_DATABASE_URL – gegen PostgreSQL. Personas und Werte sind erfunden.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { gleicheAb } from '../../shared/src/erkennung';
import { formatiere, pruefeMappentyp, titelAus, zusammengesetztText, type Feld, type Mappe, type MappentypDaten } from '../../shared/src/model';
import { ALLES, type Regelwerk } from '../../shared/src/rechte';
import { erfuellt, filterFuer } from '../../shared/src/sichten';
import { inSprache } from '../../shared/src/sprache';
import { DMS_ZUSAMMENGESETZT_AB, setzeZusammengesetzte, zusammengesetztProbleme, zusammengesetztSchluessel } from '../../shared/src/zusammengesetzt';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { zeile } from '../src/export';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { liesPaket, liesZip } from '../src/pakete';
import { mindestversion } from '../src/paketerstellung';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { zipPuffer } from '../src/zip';
import { imModus } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';
import '../src/sprache';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Verbindungen nur zum Schließen
const offen: any[] = [];
after(async () => { for (const s of offen) await s.end(); });

const status = (s: number, muster?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!muster || muster.test(`${e.message} ${JSON.stringify(e.details ?? {})}`));

/* ---------- Definition und Schlüssel ---------- */

const FELDER: Feld[] = [
  { key: 'bereich', label: 'Bereich', typ: 'auswahl', optionen: ['Ablage', 'Sicherung'], beschriftungen: { en: { optionen: { Ablage: 'Filing', Sicherung: 'Backup' } } } },
  { key: 'stichtag', label: 'Stichtag', typ: 'datum' },
  { key: 'nr', label: 'Nummer', typ: 'text' },
  { key: 'betrag', label: 'Betrag', typ: 'betrag' },
  { key: 'von', label: 'Absender', typ: 'referenz', zielTypen: ['org'] },
  { key: 'geheim', label: 'PIN', typ: 'passwort' },
  { key: 'notiz', label: 'Notiz', typ: 'langtext' },
  { key: 'lfd', label: 'Laufende Nummer', typ: 'text', standard: '{nummernkreis:rechnung}' },
];
const zus = (vorlage: string, extra: Partial<Feld> = {}): Feld => ({ key: 'kennung', label: 'Kennung', typ: 'zusammengesetzt', vorlage, ...extra });

describe('Zusammengesetzt (#1050): Vorlage, Schlüssel und Text', () => {
  it('Vorlage: Platzhalter aus geeigneten Feldern dieses Typs, Filter wie in der Titel-Vorlage – sonst eine Meldung', () => {
    const p = (v: string) => zusammengesetztProbleme(FELDER, zus(v)).join(' ');
    assert.equal(p('{bereich} · {stichtag|jahr}'), '');
    assert.equal(p('{von} · {nr}'), '');
    assert.match(p(''), /Gib eine Vorlage/);
    assert.match(p('nur Text'), /mindestens einen Platzhalter/);
    assert.match(p('{gibts_nicht} · {nr}'), /\{gibts_nicht\}/);
    assert.match(p('{geheim}'), /„PIN“ kann nicht Teil sein/);
    assert.match(p('{notiz}'), /„Notiz“ kann nicht Teil sein/);
    assert.match(p('{lfd}'), /„Laufende Nummer“ kann nicht Teil sein/, 'Nummernkreis: die Nummer vergibt Ablago erst beim Anlegen');
    assert.match(p('{nr|jahr}'), /jahr/);
    assert.match(p(`{nr}${'x'.repeat(300)}`), /höchstens 300 Zeichen/);
    // Über die Prüfung des Mappentyps am Feld; ein zusammengesetztes Feld ist nie Teil eines anderen.
    const d: MappentypDaten = { name: 'Beleg', beschreibung: '', titelVorlage: '', felder: [...FELDER.slice(0, 5), zus('{nr}'), { ...zus('{kennung}'), key: 'k2' }], register: [{ key: 'a', name: 'A', art: 'felder', felder: [...FELDER.slice(0, 5).map((f) => f.key), 'kennung', 'k2'] }] };
    const r = pruefeMappentyp(d, { eigeneId: 't', namenAndererTypen: [], existiertTyp: (id) => id === 'org' });
    assert.deepEqual(Object.keys(r.felder), ['6']);
    assert.match(r.felder['6'].join(' '), /„Kennung“ kann nicht Teil sein/);
  });

  it('Schlüssel ohne Sprache und Region: Datum JJJJ-MM-TT, Zahl mit Punkt, Auswahl als fester Wert, Verweis als Kennung', () => {
    const werte = { bereich: 'Sicherung', stichtag: '2026-11-30', nr: ' RE-17 ', betrag: { betrag: 1234.5, waehrung: 'EUR' }, von: 'a1b2c3d4-0000-4000-8000-000000000001' };
    const f = zus('{bereich} · {stichtag|monat}/{stichtag|jahr} · {von} · {nr|gross} · {betrag}');
    const s = zusammengesetztSchluessel(FELDER, f, werte);
    assert.equal(s, 'Sicherung · 11/2026 · a1b2c3d4-0000-4000-8000-000000000001 · RE-17 · 1234.50 EUR');
    assert.equal(inSprache('en', () => zusammengesetztSchluessel(FELDER, f, werte)), s, 'gleich in jeder Sprache');
    assert.equal(zusammengesetztSchluessel(FELDER, zus('{betrag|ohne_waehrung}'), werte), '1234.50');
    // Leere Teile fallen samt Trenner weg; ganz leer = kein Wert.
    assert.equal(zusammengesetztSchluessel(FELDER, zus('{bereich} · {nr}'), { nr: 'RE-1' }), 'RE-1');
    assert.equal(zusammengesetztSchluessel(FELDER, zus('{bereich} · {nr}'), {}), null);
    // An einem Verweis wirkt nur „sonst“ – Kennungen kürzt oder verändert nichts.
    assert.equal(zusammengesetztSchluessel(FELDER, zus('{von|gross|kurz:5|sonst:"ohne"}'), werte), werte.von);
    assert.equal(zusammengesetztSchluessel(FELDER, zus('{von|sonst:"ohne"} · {nr}'), { nr: 'X' }), 'ohne · X');
  });

  it('Text je Person: formatiert in ihrer Sprache, Verweise mit dem Titel, den sie sehen darf', () => {
    const werte = { bereich: 'Sicherung', stichtag: '2026-11-30', von: 'org-1', nr: 'RE-17' };
    const f = zus('{bereich} · {stichtag} · {von} · {nr}');
    assert.equal(zusammengesetztText(FELDER, f, werte, () => 'Muster GmbH'), 'Sicherung · 30.11.2026 · Muster GmbH · RE-17');
    assert.equal(inSprache('en', () => zusammengesetztText(FELDER, f, werte, () => 'folder not visible')), 'Backup · 30/11/2026 · folder not visible · RE-17');
    // formatiere braucht die Mappe – ohne sie nie der Schlüssel mit Kennungen.
    assert.equal(formatiere(f, 'Sicherung · 2026-11-30 · org-1 · RE-17'), '');
    assert.equal(formatiere(f, 'egal', () => 'Muster GmbH', { felder: FELDER, werte }), 'Sicherung · 30.11.2026 · Muster GmbH · RE-17');
    // Im Titel wie ein Verweis im Titel.
    const typ = { felder: [...FELDER, f], titelVorlage: 'Beleg {kennung}' };
    assert.equal(titelAus(typ, werte, () => 'Muster GmbH'), 'Beleg Sicherung · 30.11.2026 · Muster GmbH · RE-17');
    // Setzen: Gesendetes zählt nicht.
    const w: Record<string, unknown> = { ...werte, kennung: 'von Hand' };
    assert.deepEqual(setzeZusammengesetzte({ felder: [...FELDER, f] }, w as never), ['kennung']);
    assert.equal(w.kennung, 'Sicherung · 2026-11-30 · org-1 · RE-17');
  });

  it('Bedingungen: wie Text über den Schlüssel – „ist gleich“ ohne Groß-/Kleinschreibung, „enthält“', () => {
    const m = { id: 'm', typId: 't', werte: { kennung: 'Sicherung · 2026-11' } } as unknown as Mappe;
    const z = { dokumente: () => 0, verknuepfungen: () => 0 };
    const bed = (op: 'gleich' | 'enthaelt', a: string) => [{ art: 'feld' as const, key: 'kennung', feldart: 'zusammengesetzt' as const, op, a }];
    assert.equal(erfuellt(m, bed('gleich', 'sicherung · 2026-11'), z), true);
    assert.equal(erfuellt(m, bed('gleich', 'sicherung'), z), false);
    assert.equal(erfuellt(m, bed('enthaelt', '2026'), z), true);
    // Über die Bedingung einer Ansicht: „zusammengesetzt“ ist die Art des Felds.
    const typ = { id: 't', name: 'T', felder: [{ key: 'bereich', label: 'Bereich', typ: 'text' }, zus('{bereich}')] } as never;
    assert.deepEqual(filterFuer({ bedingungen: [{ art: 'feld', feld: 'kennung', op: 'gleich', wert: { art: 'fest', wert: 'x' } }] }, [typ], { ich: 'i', rollen: [] } as never).map((f) => (f as { feldart?: string }).feldart), ['zusammengesetzt']);
  });

  it('Mindestversion im Paketformat', () => {
    assert.match(mindestversion(['zusammengesetzt']).gruende.join(' '), /Zusammengesetzt/);
    assert.equal(mindestversion(['zusammengesetzt']).version, DMS_ZUSAMMENGESETZT_AB);
  });
});

/* ---------- Server ---------- */

async function pgRepos(name: string): Promise<{ repo: Repo; konto: KontoRepo }> {
  const { pgRepo } = await import('../src/repo-pg');
  const { pgKontoRepo } = await import('../src/konto-repo');
  const { sql } = await eigeneDatenbank(name);
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  return { repo: pgRepo(sql, HAUSHALT), konto: pgKontoRepo(sql, HAUSHALT) };
}

/** Private Mappen sieht nur, wer sie angelegt hat. */
const privatNurErsteller: Regelwerk = {
  grund: ALLES,
  regeln: [{ id: 'privat', name: 'Privat nur für den Ersteller', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }, { art: 'feld', nicht: true, bedingung: { art: 'feld', feld: '_erstelltVon', op: 'zeigtAuf', wert: { art: 'ich' } } }], dann: { R: 'entziehen', U: 'entziehen', D: 'entziehen' }, stopp: true }],
};

async function aufbau(pg: boolean, name: string) {
  const r = pg ? await pgRepos(name) : { repo: speicherRepo(), konto: speicherKontoRepo() };
  const d = new Dienst(r.repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
  const konten = new Konten(r.konto, null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Markus', passwort: 'ein-langes-passwort' });
  const lena = (await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, admin.id)).benutzer;
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const zg = async (b: { id: string }) => d.rechtepruefung.zugriff(b.id === admin.id ? imModus(await ich(b.id)) : await ich(b.id));
  const org = await d.mappentypen.legeTypAn({ name: 'Organisation', schluessel: 'organisation', titelVorlage: '{name}', felder: [
    { key: 'name', label: 'Name', typ: 'text', pflicht: true }, { key: 'privat', label: 'Privat', typ: 'janein' }] });
  const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', schluessel: 'rechnung', titelVorlage: '{nr} von {von}', felder: [
    { key: 'von', label: 'Absender', typ: 'referenz', zielTypen: [org.id] },
    { key: 'nr', label: 'Rechnungsnummer', typ: 'text' },
    { key: 'privat', label: 'Privat', typ: 'janein' },
    { key: 'kennung', label: 'Kennung', typ: 'zusammengesetzt', vorlage: '{von} · {nr}', eindeutig: true, pflicht: true },
  ], trefferliste: ['_titel', 'kennung'] });
  await d.berechtigungen.setzeBerechtigungen(org.id, privatNurErsteller, true);
  await d.berechtigungen.setzeBerechtigungen(rechnung.id, privatNurErsteller, true);
  return { d, repo: r.repo, admin, lena, zg, org, rechnung: (await d.mappentypen.listeTypen()).find((x) => x.id === rechnung.id)! };
}

for (const pg of [false, ...(url ? [true] : [])]) {
  describe(`Zusammengesetzt (#1050) im Kern – ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'}`, () => {
    it('Definition: nie Pflicht, eindeutig erlaubt, Vorlage gespeichert', async () => {
      const { rechnung } = await aufbau(pg, 'zus_def');
      const f = rechnung.felder.find((x) => x.key === 'kennung')!;
      assert.deepEqual([f.typ, f.vorlage, f.eindeutig, f.pflicht], ['zusammengesetzt', '{von} · {nr}', true, false]);
    });

    it('beim Speichern gesetzt, schreibgeschützt, Kennung statt Titel; eindeutig als Kombination – je Absender, nicht je Name', async () => {
      const { d, admin, lena, zg, org, rechnung } = await aufbau(pg, 'zus_speichern');
      const muster1 = await d.mappen.legeMappeAn({ typId: org.id, werte: { name: 'Muster GmbH' } }, admin.id);
      const muster2 = await d.mappen.legeMappeAn({ typId: org.id, werte: { name: 'Muster GmbH' } }, admin.id);
      const a = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { von: muster1.id, nr: 'RE-17', kennung: 'von Hand' } }, lena.id, false, await zg(lena));
      assert.equal(a.werte.kennung, `${muster1.id} · RE-17`, 'gesendeter Wert zählt nicht');
      assert.ok(!String(a.werte.kennung).includes('Muster'), 'nie der Titel der verwiesenen Mappe');
      // Gleiche Nummer bei einer anderen Organisation gleichen Namens: keine Doppelung.
      await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { von: muster2.id, nr: 'RE-17' } }, lena.id, false, await zg(lena));
      // Gleiche Kombination: 422 am ersten beteiligten Feld (Absender), mit beiden Feldern und dem Titel.
      await assert.rejects(d.mappen.legeMappeAn({ typId: rechnung.id, werte: { von: muster1.id, nr: 're-17' } }, lena.id, false, await zg(lena)), (e: unknown) => {
        assert.ok(e instanceof Fachfehler && e.status === 422);
        const felder = (e.details as { felder: Record<string, string[]> }).felder;
        assert.deepEqual(Object.keys(felder), ['von']);
        assert.equal(felder.von[0], 'Diese Kombination aus Absender und Rechnungsnummer gibt es schon in „RE-17 von Muster GmbH“.');
        return true;
      });
      // Ändern: Wert folgt den Teilen, eigene Mappe zählt nicht.
      const geaendert = await d.mappen.aendereMappe(a.id, { werte: { nr: 'RE-18', kennung: 'egal' } }, lena.id, await zg(lena));
      assert.equal(geaendert.werte.kennung, `${muster1.id} · RE-18`);
      await d.mappen.aendereMappe(a.id, { werte: { nr: 'RE-18' } }, lena.id, await zg(lena));
      // Die Historie nennt die Teile, nicht das zusammengesetzte Feld (kein Titel zusätzlich darin).
      const h = (await d.mappenHistorie.historie(a.id)).find((x) => x.art === 'geaendert')!;
      assert.deepEqual((h.daten.aenderungen as Array<{ feld: string }>).map((x) => x.feld), ['nr']);
      // Gibt es die Kombination in einer Mappe, die die Person nicht lesen darf: Meldung ohne deren Titel.
      await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { von: muster1.id, nr: 'RE-99', privat: true } }, admin.id, false, await zg({ id: admin.id }));
      await assert.rejects(d.mappen.legeMappeAn({ typId: rechnung.id, werte: { von: muster1.id, nr: 'RE-99' } }, lena.id, false, await zg(lena)), (e: unknown) => {
        const felder = (e as Fachfehler).details as { felder: Record<string, string[]> };
        assert.equal(felder.felder.von[0], 'Diese Kombination aus Absender und Rechnungsnummer gibt es schon.');
        return true;
      });
    });

    it('Titel verwiesener Mappen, die die Person nicht lesen darf: „nicht sichtbare Mappe“ – in der Mappe, in Spalten und im Export', async () => {
      const { d, admin, lena, zg, org, rechnung } = await aufbau(pg, 'zus_sichtbar');
      const geheim = await d.mappen.legeMappeAn({ typId: org.id, werte: { name: 'Geheime Bank', privat: true } }, admin.id);
      const m = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { von: geheim.id, nr: 'RE-5' } }, admin.id, false, await zg({ id: admin.id }));
      const fuerLena = await d.mappen.holeMappe(m.id, await zg(lena));
      assert.equal(fuerLena.bezuege[geheim.id].verborgen, true);
      const f = rechnung.felder.find((x) => x.key === 'kennung')!;
      const text = formatiere(f, fuerLena.mappe.werte.kennung, (id) => fuerLena.bezuege[id]?.titel ?? '', { felder: rechnung.felder, werte: fuerLena.mappe.werte });
      assert.equal(text, 'nicht sichtbare Mappe · RE-5');
      assert.ok(!JSON.stringify(fuerLena.mappe.werte).includes('Geheime Bank'));
      // Export: die Quelle reicht maskierte Titel herein.
      const z = zeile(fuerLena.mappe, ['kennung'], { typen: new Map([[rechnung.id, rechnung]]), titel: (id) => (id === geheim.id ? 'nicht sichtbare Mappe' : '') });
      assert.deepEqual(z.text, ['nicht sichtbare Mappe · RE-5']);
    });

    it('Vorlage ändern: vorher 409 mit Anzahl der Doppelten, mit Bestätigung gespeichert und alle Mappen neu berechnet', async () => {
      const { d, admin, org, rechnung, repo } = await aufbau(pg, 'zus_vorlage');
      const o1 = await d.mappen.legeMappeAn({ typId: org.id, werte: { name: 'Stadtwerke' } }, admin.id);
      const o2 = await d.mappen.legeMappeAn({ typId: org.id, werte: { name: 'Muster GmbH' } }, admin.id);
      const a = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { von: o1.id, nr: 'RE-1' } }, admin.id);
      const b = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { von: o2.id, nr: 'RE-1' } }, admin.id);
      const nurNummer = { ...rechnung, felder: rechnung.felder.map((f) => (f.key === 'kennung' ? { ...f, vorlage: '{nr}' } : f)) };
      await assert.rejects(d.mappentypen.aendereTyp(rechnung.id, nurNummer), status(409, /2 Mappen in „Kennung“/));
      assert.equal((await repo.holeMappe(a.id))!.werte.kennung, `${o1.id} · RE-1`, 'nichts gespeichert');
      await d.mappentypen.aendereTyp(rechnung.id, { ...nurNummer, doppelteBestaetigt: true });
      assert.equal((await repo.holeMappe(a.id))!.werte.kennung, 'RE-1');
      assert.equal((await repo.holeMappe(b.id))!.werte.kennung, 'RE-1');
      // Beide passen danach nicht – wie beim Einschalten von „eindeutig“.
      assert.deepEqual((await repo.unpassende(rechnung.id)).sort(), [a.id, b.id].sort());
      // Ohne Doppelte keine Rückfrage; die Werte folgen der neuen Vorlage.
      await d.mappentypen.aendereTyp(rechnung.id, { ...nurNummer, felder: nurNummer.felder.map((f) => (f.key === 'kennung' ? { ...f, vorlage: '{nr} · {von}' } : f)) });
      assert.equal((await repo.holeMappe(b.id))!.werte.kennung, `RE-1 · ${o2.id}`);
      assert.deepEqual(await repo.unpassende(rechnung.id), []);
    });
  });
}

describe('Zusammengesetzt (#1050): Wiederfinden und Paketformat', () => {
  it('Zum Wiederfinden: nur die ganze Kombination – Nummer im Text und der Absender wiedergefunden', () => {
    const org = { id: 'org', felder: [{ key: 'name', label: 'Name', typ: 'text', wiederfinden: true, erkennung: { art: 'name' } }] as Feld[] };
    const rechnung = { id: 're', felder: [
      { key: 'von', label: 'Absender', typ: 'referenz', zielTypen: ['org'] },
      { key: 'nr', label: 'Rechnungsnummer', typ: 'text' },
      { key: 'kennung', label: 'Kennung', typ: 'zusammengesetzt', vorlage: '{von} · {nr}', wiederfinden: true },
    ] as Feld[] };
    const mappen = [
      { id: 'o1', typId: 'org', werte: { name: 'Stadtwerke Musterstadt' } },
      { id: 'o2', typId: 'org', werte: { name: 'Muster GmbH' } },
      { id: 'r1', typId: 're', werte: { von: 'o1', nr: 'RE-2026-17', kennung: 'o1 · RE-2026-17' } },
      { id: 'r2', typId: 're', werte: { von: 'o2', nr: 'RE-2026-17', kennung: 'o2 · RE-2026-17' } },
    ];
    const text = 'Stadtwerke Musterstadt\nRechnung Nr. RE-2026-17 vom 01.11.2026';
    const a = gleicheAb(text, [org, rechnung], mappen, rechnung);
    const r = a.treffer.filter((x) => x.typId === 're').map((x) => x.mappeId);
    assert.deepEqual(r, ['r1'], 'nur die Rechnung des Absenders, der im Text steht');
    assert.deepEqual(a.doppelt.map((x) => x.mappeId), ['r1']);
    assert.equal(a.treffer.find((x) => x.mappeId === 'r1')!.belege[0].wert, 'RE-2026-17');
  });

  const archiv = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
  const paket = (feld: string) => ({
    'manifest.yaml': `schema: 1\nid: compliance\nname: Compliance\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: MIT\ndms: ">=${DMS_ZUSAMMENGESETZT_AB}"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n`,
    'inhalt/mappentypen.yaml': `- schluessel: konfiguration
  name: Konfiguration
  felder:
    - ${feld}
    - { key: bereich, label: Bereich, typ: auswahl, optionen: [Ablage, Sicherung] }
    - { key: zeitraum, label: Monat, typ: text }
  register:
    - { key: angaben, name: Angaben, art: felder, felder: [kennung, bereich, zeitraum] }
`,
  });
  const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

  it('Paketformat wie im Entwurf Compliance: typ zusammengesetzt mit vorlage, gern eindeutig; Fehler beim Lesen', () => {
    const p = liesPaket(liesZip(archiv(paket('{ key: kennung, label: Kennung, typ: zusammengesetzt, vorlage: "{bereich} · {zeitraum}", eindeutig: true }'))));
    const f = p.typen[0].felder.find((x) => x.key === 'kennung')!;
    assert.deepEqual([f.typ, f.vorlage, f.eindeutig], ['zusammengesetzt', '{bereich} · {zeitraum}', true]);
    assert.throws(() => liesPaket(liesZip(archiv(paket('{ key: kennung, label: Kennung, typ: zusammengesetzt }')))), gruende(/braucht vorlage/));
    assert.throws(() => liesPaket(liesZip(archiv(paket('{ key: kennung, label: Kennung, typ: text, vorlage: "{bereich}" }')))), gruende(/vorlage gibt es nur bei zusammengesetzten/));
    assert.throws(() => liesPaket(liesZip(archiv(paket('{ key: kennung, label: Kennung, typ: zusammengesetzt, vorlage: "{bereich}", pflicht: true }')))), gruende(/nie Pflicht/));
    assert.throws(() => liesPaket(liesZip(archiv(paket('{ key: kennung, label: Kennung, typ: zusammengesetzt, vorlage: "{monat}" }')))), gruende(/\{monat\}/));
  });
});
