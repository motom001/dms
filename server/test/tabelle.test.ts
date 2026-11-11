/**
 * Feldart „Tabelle“ (#1030): Einrichten und Prüfen, kein eigener Wert, Zeilen nur aus lesbaren Mappen (auch in der
 * Zahl), Spalten ohne Passwortfelder, „+ Neu“ mit Anlegerecht und Leserecht, Löschen und Felder entfernen, Export,
 * Schnittstelle und Paketformat (Lesen, Prüfen, Erstellen, Installieren). Personas und Werte sind erfunden.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { pruefeMappentyp, trefferlistenVon, type Feld, type Mappe, type Mappentyp, type MappentypDaten } from '../../shared/src/model';
import { ALLES, type Regelwerk } from '../../shared/src/rechte';
import { bedingungsfelder } from '../../shared/src/sichten';
import { inSprache } from '../../shared/src/sprache';
import { DMS_TABELLE_AB, hatWertfeld, TABELLE_SEITE, tabelleNeuText, tabellenSpalten } from '../../shared/src/tabelle';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { exportSpalten } from '../src/export';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { mindestversion, Paketerstellung } from '../src/paketerstellung';
import { speicherRepo } from '../src/repo-speicher';
import { routen, type Anfrage } from '../src/routen';
import { Tresor } from '../src/tresor';
import { imModus } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';
import type { Repo } from '../src/repo';
import '../src/sprache';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
type Seite = { typId: string; spalten: string[]; gesamt: number; von: number; mappen: Mappe[]; bezuege: Record<string, { titel: string; verborgen?: boolean }> };

/** Rechnung mit Tabelle „Positionen“; Rechnungsposition verweist über „rechnung“ hierher. */
async function rechnungen(d: Dienst) {
  const rechnung = await d.mappentypen.legeTypAn({ name: 'Rechnung', schluessel: 'rechnung', titelVorlage: '{nr}', felder: [
    { key: 'nr', label: 'Rechnungsnummer', typ: 'text', pflicht: true },
    { key: 'privat', label: 'Privat', typ: 'janein' },
  ] });
  const position = await d.mappentypen.legeTypAn({ name: 'Rechnungsposition', schluessel: 'rechnungsposition', titelVorlage: '{nr}. {beschreibung}', felder: [
    { key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTypen: [rechnung.id], pflicht: true, verweisart: 'zugehoerigkeit' },
    { key: 'nr', label: 'Nr.', typ: 'zahl' },
    { key: 'beschreibung', label: 'Beschreibung', typ: 'text', pflicht: true },
    { key: 'menge', label: 'Menge', typ: 'zahl' },
    { key: 'einzelpreis', label: 'Einzelpreis', typ: 'betrag', waehrung: 'EUR' },
    { key: 'privat', label: 'Privat', typ: 'janein' },
    { key: 'pin', label: 'Pin', typ: 'passwort' },
  ], trefferliste: ['nr', 'beschreibung', 'menge', 'einzelpreis', 'pin'] });
  const mitTabelle = await d.mappentypen.aendereTyp(rechnung.id, { ...rechnung, felder: [...rechnung.felder,
    { key: 'positionen', label: 'Positionen', typ: 'tabelle', pflicht: true, standard: 'x', quelle: { typId: position.id, feldKey: 'rechnung', neu: '+ Position' } }] });
  return { rechnung: mitTabelle, position };
}

async function aufbau() {
  const tresor = new Tresor(speicherEinstellungen(), join(await mkdtemp(join(tmpdir(), 'dms-tabelle-')), 'dms.schluessel'), () => null);
  await tresor.laden(); await tresor.erzeuge();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen(), tresor });
  const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
  const lena = (await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, admin.id)).benutzer;
  await d.gleicheBenutzerAb(await konten.listeBenutzer());
  const ich = async (id: string) => (await konten.listeBenutzer()).find((b) => b.id === id)!;
  const tabelle = routen(d, konten, {});
  const route = (m: string, p: string) => tabelle.find((r) => r.methode === m && r.pfad === p)!;
  const rufe = async (b: { id: string }, m: string, p: string, x: Partial<Anfrage> = {}) => route(m, p).handler({ body: {}, params: {}, query: {}, ip: '1', ...x, benutzer: b.id === admin.id ? imModus(await ich(b.id)) : await ich(b.id) });
  const { rechnung, position } = await rechnungen(d);
  const seite = async (b: { id: string }, mappeId: string, query: Record<string, string> = {}) => (await rufe(b, 'GET', '/api/mappen/:id/tabelle/:feld', { params: { id: mappeId, feld: 'positionen' }, query })).body as Seite;
  return { d, admin, lena, rechnung, position, rufe, seite };
}

/** Privat markierte Mappen sieht nur, wer sie angelegt hat (Ergänzung Sicherheit: nicht lesbare Zeilen). */
const privatNurErsteller: Regelwerk = {
  grund: ALLES,
  regeln: [{ id: 'privat', name: 'Privat nur für den Ersteller', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'privat', op: 'ja' } }, { art: 'feld', nicht: true, bedingung: { art: 'feld', feld: '_erstelltVon', op: 'zeigtAuf', wert: { art: 'ich' } } }], dann: { C: 'entziehen', R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' }, stopp: true }],
};

describe('Tabelle einrichten (#1030)', () => {
  const position: Mappentyp = { id: 'p', name: 'Rechnungsposition', beschreibung: '', titelVorlage: '', register: [], erstellt: '', geaendert: '',
    felder: [{ key: 'rechnung', label: 'Rechnung', typ: 'referenz', zielTypen: ['r'] }, { key: 'text', label: 'Text', typ: 'text' }, { key: 'pin', label: 'Pin', typ: 'passwort' }],
    trefferlisten: [{ key: 'standard', name: 'Standard', spalten: ['text', 'pin', '_erstellt'], standard: true }, { key: 'kurz', name: 'Kurz', spalten: ['pin'] }] };
  const rechnung = (f: Partial<Feld>): MappentypDaten => ({ name: 'Rechnung', beschreibung: '', titelVorlage: '', felder: [{ key: 'nr', label: 'Nr.', typ: 'text' }, { key: 'positionen', label: 'Positionen', typ: 'tabelle', ...f }],
    register: [{ key: 'angaben', name: 'Angaben', art: 'felder', felder: ['nr', 'positionen'] }] });
  const ctx = { eigeneId: 'r', namenAndererTypen: [], existiertTyp: (id: string) => id === 'p', felderVon: (id: string) => (id === 'p' ? position.felder : undefined), typVon: (id: string) => (id === 'p' ? position : undefined) };
  const meldungen = (f: Partial<Feld>) => Object.values(pruefeMappentyp(rechnung(f), ctx).felder).flat();

  it('Quelle wie beim Verknüpfungsregister: Typ und Feld gewählt, das Feld verweist hierher, die Trefferliste gibt es', () => {
    assert.deepEqual(meldungen({ quelle: { typId: 'p', feldKey: 'rechnung' } }), []);
    assert.deepEqual(meldungen({ quelle: { typId: 'p', feldKey: 'rechnung', trefferliste: 'kurz', neu: '+ Position' } }), []);
    assert.match(meldungen({}).join(' '), /Mappentyp/);
    assert.match(meldungen({ quelle: { typId: 'x', feldKey: 'rechnung' } }).join(' '), /gibt es nicht mehr/);
    assert.match(meldungen({ quelle: { typId: 'p', feldKey: 'text' } }).join(' '), /„Text“ verweist nicht/);
    assert.match(meldungen({ quelle: { typId: 'p', feldKey: 'rechnung', trefferliste: 'weg' } }).join(' '), /Trefferliste gibt es nicht mehr/);
    assert.match(meldungen({ quelle: { typId: 'p', feldKey: 'rechnung', neu: 'x'.repeat(41) } }).join(' '), /höchstens 40/);
    assert.match(meldungen({ quelle: { typId: 'p', feldKey: 'rechnung' }, pflicht: true }).join(' '), /keinen eigenen Wert/);
  });

  it('kein Wert: nicht im Titel, nicht als Spalte, nicht in Bedingungen', () => {
    const titel = pruefeMappentyp({ ...rechnung({ quelle: { typId: 'p', feldKey: 'rechnung' } }), titelVorlage: '{nr} {positionen}' }, ctx);
    assert.match(titel.allgemein.join(' '), /Titel-Vorlage/);
    const spalte = pruefeMappentyp({ ...rechnung({ quelle: { typId: 'p', feldKey: 'rechnung' } }), trefferliste: ['positionen'] }, ctx);
    assert.match(spalte.allgemein.join(' '), /keine Spalte/);
    const typ = { ...rechnung({ quelle: { typId: 'p', feldKey: 'rechnung' } }), id: 'r' } as Mappentyp;
    assert.deepEqual(bedingungsfelder([typ]).filter((f) => !f.key.startsWith('_')).map((f) => f.key), ['nr']);
    assert.equal(hatWertfeld({ typ: 'tabelle' }), false);
    assert.equal(hatWertfeld({ typ: 'text' }), true);
  });

  it('Spalten der Trefferliste ohne Passwortfelder; ohne Spalten der Titel', () => {
    assert.deepEqual(tabellenSpalten(position, undefined, trefferlistenVon), ['text', '_erstellt']);
    assert.deepEqual(tabellenSpalten(position, 'kurz', trefferlistenVon), ['_titel']);
    assert.deepEqual(tabellenSpalten(position, 'gibt-es-nicht', trefferlistenVon), ['text', '_erstellt']);
  });

  it('„+ Neu“: Beschriftung aus dem Typ, in anderen Sprachen ihre Beschriftung oder „+ <Typname>“', () => {
    const f = { quelle: { typId: 'p', feldKey: 'rechnung', neu: '+ Position' } };
    assert.equal(tabelleNeuText(f, position), '+ Position');
    assert.equal(tabelleNeuText({ quelle: { typId: 'p', feldKey: 'rechnung' } }, position), '+ Rechnungsposition');
    assert.equal(inSprache('en', () => tabelleNeuText(f, { name: 'Rechnungsposition', beschriftungen: { en: { name: 'Invoice item' } } })), '+ Invoice item');
    assert.equal(inSprache('en', () => tabelleNeuText({ ...f, beschriftungen: { en: { neu: '+ Item' } } }, position)), '+ Item');
  });
});

describe('Tabelle in der Ablage (#1030)', () => {
  it('Eingaben bereinigt: nie Pflicht, kein Standard; gesendete Werte unter der Kennung fallen weg', async () => {
    const { d, rechnung } = await aufbau();
    const f = rechnung.felder.find((x) => x.key === 'positionen')!;
    assert.deepEqual([f.typ, f.pflicht, f.standard, f.quelle?.feldKey, f.quelle?.neu], ['tabelle', false, null, 'rechnung', '+ Position']);
    const m = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1', positionen: ['etwas'] } });
    assert.equal('positionen' in m.werte, false);
    assert.deepEqual(exportSpalten([rechnung], 'alle').filter((k) => !k.startsWith('_')), ['nr', 'privat']);
  });

  it('Zeilen: verweisende Mappen mit den Spalten der Trefferliste, sortiert, je 50 mit „weitere“', async () => {
    const { d, admin, rechnung, position, seite } = await aufbau();
    const r = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } });
    const andere = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2' } });
    assert.deepEqual((await seite(admin, r.id)).gesamt, 0);
    for (let i = 1; i <= 60; i++) await d.mappen.legeMappeAn({ typId: position.id, werte: { rechnung: r.id, nr: i, beschreibung: `Teil ${String(i).padStart(2, '0')}`, menge: 1, einzelpreis: { betrag: i, waehrung: 'EUR' }, pin: 'geheim' } });
    await d.mappen.legeMappeAn({ typId: position.id, werte: { rechnung: andere.id, nr: 1, beschreibung: 'Fremd' } });
    const s1 = await seite(admin, r.id, { sortierung: 'nr', absteigend: 'true' });
    assert.deepEqual([s1.typId, s1.spalten, s1.gesamt, s1.mappen.length], [position.id, ['nr', 'beschreibung', 'menge', 'einzelpreis'], 60, TABELLE_SEITE]);
    assert.deepEqual(s1.mappen.slice(0, 2).map((m) => m.werte.nr), [60, 59]);
    // Nur die Werte der Spalten – kein Passwort, nichts sonst aus der Mappe.
    assert.deepEqual(Object.keys(s1.mappen[0].werte).sort(), ['beschreibung', 'einzelpreis', 'menge', 'nr']);
    const s2 = await seite(admin, r.id, { sortierung: 'nr', absteigend: 'true', von: '50', gesamt: '60' });
    assert.deepEqual([s2.von, s2.mappen.length, s2.mappen.at(-1)!.werte.nr], [50, 10, 1]);
    // Ohne Sortierung nach Titel.
    assert.equal((await seite(admin, andere.id)).mappen[0].titel, '1. Fremd');
  });

  it('nur lesbare Zeilen – auch die Zahl zählt keine anderen; Verweise in Zellen ohne Titel (Ergänzung Sicherheit)', async () => {
    const { d, admin, lena, rechnung, position, seite, rufe } = await aufbau();
    const r = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } });
    await d.mappen.legeMappeAn({ typId: position.id, werte: { rechnung: r.id, nr: 1, beschreibung: 'Öffentlich' } }, admin.id);
    for (let i = 2; i <= 4; i++) await d.mappen.legeMappeAn({ typId: position.id, werte: { rechnung: r.id, nr: i, beschreibung: `Privat ${i}`, privat: true } }, admin.id);
    await d.berechtigungen.setzeBerechtigungen(position.id, privatNurErsteller, true);
    const s = await seite(lena, r.id);
    assert.deepEqual([s.gesamt, s.mappen.map((m) => m.werte.beschreibung)], [1, ['Öffentlich']]);
    assert.equal((await seite(admin, r.id)).gesamt, 4);
    // Mappe selbst nicht lesbar: keine Tabelle (wie die Mappe: 404).
    await d.berechtigungen.setzeBerechtigungen(rechnung.id, privatNurErsteller, true);
    const geheim = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-geheim', privat: true } }, admin.id);
    await assert.rejects(seite(lena, geheim.id), status(404));
    // Eine Spalte, die auf eine nicht lesbare Mappe zeigt: nur „nicht sichtbar“, ohne Titel.
    const pt = (await d.mappentypen.listeTypen()).find((t) => t.id === position.id)!;
    await d.mappentypen.aendereTyp(position.id, { ...pt, felder: [...pt.felder, { key: 'siehe', label: 'Siehe', typ: 'referenz', zielTypen: [rechnung.id] }], trefferliste: ['beschreibung', 'siehe'] });
    await d.mappen.legeMappeAn({ typId: position.id, werte: { rechnung: r.id, nr: 5, beschreibung: 'Mit Verweis', siehe: geheim.id } }, admin.id);
    const s3 = await seite(lena, r.id);
    const zeile = s3.mappen.find((m) => m.werte.beschreibung === 'Mit Verweis')!;
    assert.equal(zeile.werte.siehe, geheim.id);
    assert.equal(s3.bezuege[geheim.id].verborgen, true);
    assert.notEqual(s3.bezuege[geheim.id].titel, 'R-geheim');
    assert.equal((await seite(admin, r.id)).bezuege[geheim.id].titel, 'R-geheim');
    const nichtSichtbar = (await rufe(lena, 'GET', '/api/mappen/:id/tabelle/:feld', { params: { id: r.id, feld: 'gibt-es-nicht' } }).catch((e) => e)) as Fachfehler;
    assert.equal(nichtSichtbar.status, 404);
  });

  it('„+ Neu“ per Schnittstelle: Anlegerecht am anderen Typ und Leserecht auf die Mappe prüft der Server', async () => {
    const { d, admin, lena, rechnung, position, rufe } = await aufbau();
    await d.berechtigungen.setzeBerechtigungen(rechnung.id, privatNurErsteller, true);
    const offen = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } }, admin.id);
    const geheim = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2', privat: true } }, admin.id);
    const neu = (rechnungId: string) => rufe(lena, 'POST', '/api/mappen', { body: { typId: position.id, werte: { rechnung: rechnungId, beschreibung: 'Neu' } } });
    // Auf die Rechnung, die Lena lesen darf: geht.
    await neu(offen.id);
    // Auf eine Rechnung, die sie nicht lesen darf: abgelehnt.
    await assert.rejects(neu(geheim.id), status(422));
    // Ohne Anlegerecht am Typ der Positionen: abgelehnt – und der Typ sagt es der Oberfläche.
    await d.berechtigungen.setzeBerechtigungen(position.id, { grund: { ...ALLES, C: false }, regeln: [] }, true);
    await assert.rejects(neu(offen.id), status(403));
    const typen = (await rufe(lena, 'GET', '/api/typen')).body as Mappentyp[];
    assert.equal(typen.find((t) => t.id === position.id)!.darfAnlegen, false);
  });

  it('Quelle bleibt: Typ löschen und Feld entfernen gehen erst ohne die Tabelle', async () => {
    const { d, rechnung, position } = await aufbau();
    await assert.rejects(d.mappentypen.loescheTyp(position.id), (e: unknown) => e instanceof Fachfehler && e.status === 409 && JSON.stringify(e.details).includes('Positionen'));
    const p = (await d.mappentypen.listeTypen()).find((t) => t.id === position.id)!;
    await assert.rejects(d.mappentypen.aendereTyp(position.id, { ...p, felder: p.felder.filter((f) => f.key !== 'rechnung') }), (e: unknown) => e instanceof Fachfehler && /braucht die Tabelle „Positionen“/.test(JSON.stringify(e.details)));
    await d.mappentypen.aendereTyp(rechnung.id, { ...rechnung, felder: rechnung.felder.filter((f) => f.key !== 'positionen') });
    await d.mappentypen.aendereTyp(position.id, { ...p, felder: p.felder.filter((f) => f.key !== 'rechnung') });
    await d.mappentypen.loescheTyp(position.id);
  });
});

describe('Paketformat (#1030)', () => {
  const manifest = 'schema: 1\nid: rechnungen_test\nname: Rechnungen (Test)\nversion: 1.0.0\nbeschreibung: Test.\nautor: { name: Test, github: test }\nlizenz: Apache-2.0\ndms: ">=0.232.0"\ninhalt: { mappentypen: mappentypen.yaml }\n';
  // Schreibweise wie im Entwurf des Pakets Rechnungen (dms-registry #172).
  const typen = (quelle: string) => `- schluessel: rechnung
  name: Rechnung
  felder:
    - { key: nr, label: Nr., typ: text }
    - key: positionen
      label: Positionen
      beschriftungen: { en: { label: "Items", neu: "+ Item" } }
      typ: tabelle
${quelle}
  register:
    - { key: rechnung, name: Rechnung, art: felder, felder: [nr, positionen], abschnitte: [{ vor: positionen, titel: Positionen }] }
- schluessel: rechnungsposition
  name: Rechnungsposition
  titelVorlage: "{nr}. {beschreibung}"
  felder:
    - { key: rechnung, label: Rechnung, typ: referenz, ziel: rechnung, pflicht: true, verweisart: zugehoerigkeit }
    - { key: nr, label: Nr., typ: zahl }
    - { key: beschreibung, label: Beschreibung, typ: text, pflicht: true }
  register:
    - { key: position, name: Position, art: felder, felder: [rechnung, nr, beschreibung] }
  trefferliste: [nr, beschreibung]
`;
  const gut = '      quelle: { typ: rechnungsposition, feld: rechnung, trefferliste: standard, neu: "+ Position" }';
  const lies = (q: string) => liesPaket(new Map([['manifest.yaml', Buffer.from(manifest)], ['mappentypen.yaml', Buffer.from(typen(q))]]));
  const gruende = (e: unknown) => (e instanceof Fachfehler ? ((e.details as { gruende?: string[] })?.gruende ?? [e.message]) : []).join(' | ');

  it('Lesen und Prüfen: quelle nur bei Tabellen und dort Pflicht; Feld muss hierher verweisen; nur „standard“', () => {
    assert.deepEqual(lies(gut).typen[0].felder[1].quelle, { typ: 'rechnungsposition', feld: 'rechnung', trefferliste: 'standard', neu: '+ Position' });
    assert.throws(() => lies(''), (e) => /braucht quelle/.test(gruende(e)));
    assert.throws(() => lies('      quelle: { typ: rechnungsposition, feld: nr }'), (e) => /„nr“ von „rechnungsposition“ ist kein Verweisfeld/.test(gruende(e)));
    assert.throws(() => lies('      quelle: { typ: lieferschein, feld: rechnung }'), (e) => /nicht mitbringt/.test(gruende(e)));
    assert.throws(() => lies('      quelle: { typ: rechnungsposition, feld: rechnung, trefferliste: kurz }'), (e) => /nur „standard“/.test(gruende(e)));
    assert.throws(() => lies(`      quelle: { typ: rechnungsposition, feld: rechnung, neu: "${'x'.repeat(41)}" }`), (e) => /höchstens 40/.test(gruende(e)));
    assert.throws(() => lies(`${gut}\n      pflicht: true`), (e) => /keine Pflicht/.test(gruende(e)));
    assert.throws(() => lies(gut.replace('quelle', 'quelle2')), (e) => /braucht quelle/.test(gruende(e)));
  });

  it('Erstellen und Installieren: Quelle als Typverweis, Mindestversion, beide Typen in einem Durchgang', async () => {
    assert.equal(mindestversion(['tabelle']).version, DMS_TABELLE_AB);
    const dms = (version: string) => {
      const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
      return { d, p: new Paketverwaltung(d, { version: () => version, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } }), e: new Paketerstellung(d, { version: () => version }) };
    };
    const q = dms(DMS_TABELLE_AB);
    const { rechnung, position } = await rechnungen(q.d);
    const a = { typen: [rechnung.id, position.id], sichten: [], beispiele: [], id: 'rechnungen_test', name: 'Rechnungen (Test)', version: '1.0.0', beschreibung: 'Rechnungen mit Positionen.',
      autor: { name: 'Lena Beispiel', github: 'lena' }, lizenz: 'MIT', dms: '>=0.86.0', aenderungen: '' };
    assert.ok((await q.e.pruefe(a)).probleme.some((p) => p.includes('Tabelle') && p.includes(DMS_TABELLE_AB)));
    const zip = await q.e.exportiere({ ...a, dms: `>=${DMS_TABELLE_AB}` }, ICH);
    const inhalt = parse(liesZip(zip.daten).get('rechnungen_test/inhalt/mappentypen.yaml')!.toString()) as Array<{ schluessel: string; felder: Array<Record<string, unknown>> }>;
    assert.deepEqual(inhalt.find((t) => t.schluessel === 'rechnung')!.felder.find((f) => f.key === 'positionen'), { key: 'positionen', label: 'Positionen', typ: 'tabelle', quelle: { typ: 'rechnungsposition', feld: 'rechnung', neu: '+ Position' } });

    const z = dms(DMS_TABELLE_AB);
    const h = await z.p.hochladen(zip.daten, ICH);
    assert.deepEqual(h.vorschau.probleme, []);
    const paket = await z.p.installiere({ upload: h.upload, bestaetigt: true }, ICH);
    const zt = (await z.d.mappentypen.listeTypen()).find((t) => t.id === paket.typen.rechnung)!;
    assert.deepEqual(zt.felder.find((f) => f.key === 'positionen')!.quelle, { typId: paket.typen.rechnungsposition, feldKey: 'rechnung', neu: '+ Position' });
    assert.ok(zt.register[0].felder!.includes('positionen'));
    // Entfernen löst den Kreis aus Tabelle und Verweis.
    await z.p.entferne('rechnungen_test', ICH);
    assert.equal((await z.d.mappentypen.listeTypen()).some((t) => t.id === paket.typen.rechnung || t.id === paket.typen.rechnungsposition), false);
  });

  it('Installieren aus der Schreibweise der Registry: Tabelle vor ihrer Quelle, Beschriftung „+ Neu“ auf Englisch', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const p = new Paketverwaltung(d, { version: () => DMS_TABELLE_AB, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); } });
    const { zipPuffer } = await import('../src/zip');
    const zip = zipPuffer([{ name: 'rechnungen_test/manifest.yaml', daten: Buffer.from(manifest.replace('mappentypen.yaml', 'inhalt/mappentypen.yaml')) }, { name: 'rechnungen_test/inhalt/mappentypen.yaml', daten: Buffer.from(typen(gut)) }]);
    const h = await p.hochladen(zip, ICH);
    assert.deepEqual(h.vorschau.probleme, []);
    const paket = await p.installiere({ upload: h.upload, bestaetigt: true }, ICH);
    const zt = (await d.mappentypen.listeTypen()).find((t) => t.id === paket.typen.rechnung)!;
    const f = zt.felder.find((x) => x.key === 'positionen')!;
    assert.deepEqual([f.quelle?.typId, f.beschriftungen?.en?.neu], [paket.typen.rechnungsposition, '+ Item']);
    assert.deepEqual(zt.register[0].abschnitte?.map((x) => x.vor), ['positionen']);
  });
});

describe('Tabelle – PostgreSQL (#1030)', { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' }, () => {
  it('Zeilen über den Verweis, sortiert und geblättert wie im Arbeitsspeicher', async () => {
    const db = await eigeneDatenbank('tabelle');
    const { pgRepo } = await import('../src/repo-pg');
    try {
      const d = new Dienst(pgRepo(db.sql, '00000000-0000-4000-8000-000000000001') as never as Repo, speicherDateien(), { einstellungen: speicherEinstellungen() });
      const { rechnung, position } = await rechnungen(d);
      const r = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-1' } });
      const andere = await d.mappen.legeMappeAn({ typId: rechnung.id, werte: { nr: 'R-2' } });
      for (let i = 1; i <= 55; i++) await d.mappen.legeMappeAn({ typId: position.id, werte: { rechnung: r.id, nr: i, beschreibung: `Teil ${i}` } });
      await d.mappen.legeMappeAn({ typId: position.id, werte: { rechnung: andere.id, nr: 1, beschreibung: 'Fremd' } });
      const s1 = await d.tabelle(r.id, 'positionen', { sortierung: 'nr', absteigend: 'true' });
      assert.deepEqual([s1.gesamt, s1.mappen.length, s1.mappen[0].werte.nr], [55, TABELLE_SEITE, 55]);
      const s2 = await d.tabelle(r.id, 'positionen', { sortierung: 'nr', von: 50, gesamt: 55 });
      assert.deepEqual(s2.mappen.map((m) => m.werte.nr), [51, 52, 53, 54, 55]);
      assert.equal((await d.tabelle(andere.id, 'positionen', {})).gesamt, 1);
    } finally { await db.ende(); }
  });
});
