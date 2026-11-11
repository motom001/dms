/**
 * Paket-Update baut um (#1041): Umbau-Schritte im Paketformat, Vorschau, Bestätigung (nur Gesamte Verwaltung),
 * Übernahme mit gleicher Id, Zusammenlegen mit allen Werten (Notiz, Historie), Rechte und KI-Sperre gehen mit, Verweise
 * und Ansichten zeigen weiter richtig, alles oder nichts – mit Speicher und PostgreSQL. Beispieldaten wie in den Paketen
 * Haushalt und Verträge (dms-registry #163), mit Personas.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liesMerkmale } from '../../shared/src/merkmale';
import type { Mappe, Mappentyp } from '../../shared/src/model';
import { leseAusdruck, rechteAn, type Regelwerk } from '../../shared/src/rechte';
import { archivLockerer, datumAusText, regelnMitnehmen, UMBAU_FELD, zahlAusText, zeitraumAusText } from '../../shared/src/umbau';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { liesPaket, liesZip, Paketverwaltung } from '../src/pakete';
import { wandle } from '../src/pakete/index';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo-speicher';
import { heikleHandlung } from '../src/verwaltungsbereiche';
import { zipPuffer } from '../src/zip';
import { eigeneDatenbank } from './hilfe-db';

const ICH = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@example.org' };
const HAUSHALT_ID = '00000000-0000-4000-8000-000000000001';
const VERSION = '0.243.0';

const manifest = (id: string, name: string, version: string, extra = '') =>
  `schema: 1\nid: ${id}\nname: ${name}\nversion: ${version}\nbeschreibung: Test.\nautor: { name: Lena Beispiel, github: lena-beispiel }\nlizenz: MIT\ndms: ">=0.230.0"\nherausgeber: org.example\n${extra}`;
const zip = (d: Record<string, string>) => zipPuffer(Object.entries(d).map(([name, inhalt]) => ({ name, daten: Buffer.from(inhalt) })), new Date('2026-01-01T12:00:00Z'));
const lies = (d: Record<string, string>) => liesPaket(liesZip(zip(d)));
const gruende = (re: RegExp) => (e: unknown) => e instanceof Fachfehler && [e.message, ...((e.details as { gruende?: string[] })?.gruende ?? [])].some((g) => re.test(g));

const basis = {
  'manifest.yaml': manifest('basis', 'Basis', '1.0.0', 'inhalt:\n  mappentypen: inhalt/mappentypen.yaml\n'),
  'inhalt/mappentypen.yaml': '- schluessel: organisation\n  name: Organisation\n  titelVorlage: "{name}"\n  felder:\n    - { key: name, label: Name, typ: text }\n  register:\n    - { key: allgemein, name: Allgemein, art: felder, felder: [name] }\n',
};
/** Haushalt 1: Vertrag und Versicherung als eigene Typen, ein Fahrzeug verweist auf die Versicherung. */
const haushalt1 = {
  'manifest.yaml': manifest('haushalt', 'Haushalt', '1.0.0', 'abhaengigkeiten:\n  basis: ">=1.0.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n'),
  'inhalt/mappentypen.yaml': [
    '- schluessel: vertrag', '  name: Vertrag', '  titelVorlage: "{art}"', '  felder:',
    '    - { key: vertragspartner, label: Vertragspartner, typ: referenz, ziel: "basis:organisation" }',
    '    - { key: art, label: Art, typ: auswahl, optionen: [Strom, Gas, Handy] }',
    '    - { key: kuendigungsfrist, label: Kündigungsfrist, typ: text }',
    '    - { key: betrag, label: Betrag, typ: betrag }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [vertragspartner, art, kuendigungsfrist, betrag] }', '    - { key: dokumente, name: Dokumente, art: dokumente }',
    '- schluessel: versicherung', '  name: Versicherung', '  titelVorlage: "{versicherungsnummer}"', '  felder:',
    '    - { key: versicherer, label: Versicherer, typ: referenz, ziel: "basis:organisation" }',
    '    - { key: versicherungsnummer, label: Versicherungsnummer, typ: text }',
    '    - { key: beitrag, label: Beitrag, typ: betrag }',
    '    - { key: kuendigen_bis, label: Kündigen bis, typ: datum }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [versicherer, versicherungsnummer, beitrag, kuendigen_bis] }', '    - { key: unterlagen, name: Unterlagen, art: dokumente }',
    '- schluessel: fahrzeug', '  name: Fahrzeug', '  felder:',
    '    - { key: kennzeichen, label: Kennzeichen, typ: text }', '    - { key: versicherung, label: Versicherung, typ: referenz, ziel: versicherung }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [kennzeichen, versicherung] }', '',
  ].join('\n'),
};
/** Haushalt 2 (Major): gibt Vertrag und Versicherung ab, behält das Fahrzeug. */
const haushalt2 = {
  'manifest.yaml': manifest('haushalt', 'Haushalt', '2.0.0', 'abhaengigkeiten:\n  basis: ">=1.0.0"\n  vertraege: ">=1.0.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n'),
  'inhalt/mappentypen.yaml': [
    '- schluessel: fahrzeug', '  name: Fahrzeug', '  felder:',
    '    - { key: kennzeichen, label: Kennzeichen, typ: text }', '    - { key: versicherung, label: Versicherung, typ: referenz, ziel: "vertraege:vertrag" }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [kennzeichen, versicherung] }', '',
  ].join('\n'),
};
const UMBAU = [
  'umbau:',
  '  - von: haushalt:vertrag', '    nach: vertrag', '    felder: { vertragspartner: von, kuendigungsfrist: kuendigungsfrist, betrag: betrag }',
  '  - von: haushalt:versicherung', '    nach: vertrag', '    felder: { versicherer: von, versicherungsnummer: vertragsnummer, beitrag: betrag }',
  '    setzen: { art: { vorgabe: versicherung } }', '    register: { unterlagen: dokumente }', '',
].join('\n');
const vertraege = {
  'manifest.yaml': manifest('vertraege', 'Verträge', '1.0.0', `abhaengigkeiten:\n  basis: ">=1.0.0"\ninhalt:\n  mappentypen: inhalt/mappentypen.yaml\n  vorgaben: inhalt/vorgaben.yaml\n${UMBAU}`),
  'inhalt/mappentypen.yaml': [
    '- schluessel: vertragsart', '  name: Vertragsart', '  titelVorlage: "{name}"', '  felder:', '    - { key: name, label: Name, typ: text }',
    '  register:', '    - { key: allgemein, name: Allgemein, art: felder, felder: [name] }',
    '- schluessel: vertrag', '  name: Vertrag', '  titelVorlage: "{bezeichnung}"', '  felder:',
    '    - { key: bezeichnung, label: Bezeichnung, typ: text }',
    '    - { key: von, label: Anbieter, typ: referenz, ziel: ["basis:organisation"] }',
    '    - { key: art, label: Vertragsart, typ: referenz, ziel: vertragsart }',
    '    - { key: vertragsnummer, label: Vertragsnummer, typ: text, maxLen: 60 }',
    '    - { key: kuendigungsfrist, label: Kündigungsfrist, typ: zeitraum }',
    '    - { key: betrag, label: Betrag, typ: betrag }',
    '  register:', '    - { key: vertrag, name: Vertrag, art: felder, felder: [bezeichnung, von, art, vertragsnummer, kuendigungsfrist, betrag] }', '    - { key: dokumente, name: Dokumente, art: dokumente }', '',
  ].join('\n'),
  'inhalt/vorgaben.yaml': '- kennung: strom\n  typ: vertragsart\n  werte: { name: Strom }\n- kennung: versicherung\n  typ: vertragsart\n  werte: { name: Versicherung }\n',
};

describe('Umbau im Paketformat (#1041)', () => {
  it('liest Schritte: von, nach, felder, setzen, register', () => {
    const p = lies(vertraege);
    assert.equal(p.umbau?.length, 2);
    assert.deepEqual(p.umbau?.[1], { von: 'haushalt:versicherung', nach: 'vertraege:vertrag', felder: { versicherer: 'von', versicherungsnummer: 'vertragsnummer', beitrag: 'betrag' }, setzen: { art: { vorgabe: 'versicherung' } }, register: { unterlagen: 'dokumente' } });
  });

  it('prüft beim Lesen: Zieltyp des Pakets oder einer Abhängigkeit, Felder des Ziels, nicht berechnet, kein eigener Typ als Quelle', () => {
    const mit = (u: string) => () => lies({ ...vertraege, 'manifest.yaml': vertraege['manifest.yaml'].replace(UMBAU, `umbau:\n${u}`) });
    assert.throws(mit('  - { von: haushalt:vertrag, nach: gibtsnicht }\n'), gruende(/Zieltyp „gibtsnicht“ bringt das Paket nicht mit/));
    assert.throws(mit('  - { von: haushalt:vertrag, nach: "fremd:vertrag" }\n'), gruende(/nicht unter abhaengigkeiten/));
    assert.throws(mit('  - { von: haushalt:vertrag, nach: vertrag, felder: { a: gibtsnicht } }\n'), gruende(/Feld „gibtsnicht“ gibt es im Zieltyp/));
    assert.throws(mit('  - { von: vertragsart, nach: vertrag }\n'), gruende(/bringt das Paket weiter mit/));
    assert.throws(mit('  - { von: haushalt:vertrag, nach: vertrag }\n  - { von: haushalt:vertrag, nach: vertragsart }\n'), gruende(/in mehreren Schritten/));
    assert.throws(mit('  - { von: "dms:rolle", nach: vertrag }\n'), gruende(/Mappentypen von Ablago selbst/));
    assert.throws(mit('  - { von: haushalt:vertrag, nach: vertrag, setzen: { art: { x: 1 } } }\n'), gruende(/ungültiger Wert für „art“/));
    assert.doesNotThrow(mit('  - { von: alt_vertrag, nach: vertrag }\n'), 'früherer eigener Typ');
  });

  it('wandelt Werte: Zeitraum aus Text als Vorschlag, Zahlen, Datum, Auswahl; Verweise nur auf erlaubte Typen', () => {
    assert.deepEqual(zeitraumAusText('3 Monate'), { anzahl: 3, einheit: 'monate', genau: true });
    assert.deepEqual(zeitraumAusText('3 Monate zum Ende der Laufzeit'), { anzahl: 3, einheit: 'monate', genau: false });
    assert.deepEqual(zeitraumAusText('14 Tage'), { anzahl: 14, einheit: 'tage', genau: true });
    assert.equal(zeitraumAusText('zum Jahresende'), null);
    assert.equal(zahlAusText('1.234,56 €'), 1234.56);
    assert.equal(zahlAusText('12'), 12);
    assert.equal(datumAusText('31.12.2026'), '2026-12-31');
    const f = (typ: string, mehr = {}) => ({ key: 'x', label: 'X', typ, ...mehr }) as never;
    assert.deepEqual(wandle(f('text'), f('zeitraum'), '1 Jahr'), { wert: { anzahl: 1, einheit: 'jahre' }, genau: true });
    assert.deepEqual(wandle(f('zahl'), f('betrag', { waehrung: 'EUR' }), 12.5), { wert: { betrag: 12.5, waehrung: 'EUR' }, genau: true });
    assert.equal(wandle(f('auswahl', { optionen: ['Strom'] }), f('auswahl', { optionen: ['Gas'] }), 'Strom'), null, 'fehlende Option: Notiz');
    assert.equal(wandle(f('text'), f('text', { maxLen: 3 }), 'zu lang'), null);
    assert.deepEqual(wandle(f('referenz'), f('referenz', { zielTypen: ['org'] }), 'a', () => 'org'), { wert: 'a', genau: true });
    assert.equal(wandle(f('referenz'), f('referenz', { zielTypen: ['org'] }), 'a', () => 'person'), null, 'Ziel nicht erlaubt');
  });

  it('Rechte mitnehmen: Grundeinstellung und Regeln des alten Typs, nur für Mappen „umbau_aus“, dann Stopp', () => {
    const zu: Regelwerk = { grund: { C: true, R: false, U: false, D: false, P: false }, regeln: [] };
    const offen: Regelwerk = { grund: { C: true, R: true, U: true, D: true, P: true }, regeln: [] };
    assert.equal(regelnMitnehmen(offen, zu, 'h:v', 'V', () => 'id'), null, 'offen: nie breiter, nichts nötig');
    assert.equal(regelnMitnehmen(zu, zu, 'h:v', 'V', () => 'id'), null, 'gleich: nichts nötig');
    let n = 0;
    const rw = regelnMitnehmen(zu, offen, 'h:v', 'V', () => `r${++n}`)!;
    assert.equal(rw.regeln.length, 2);
    assert.deepEqual(rw.regeln[0].dann, { C: 'erteilen', R: 'entziehen', U: 'entziehen', D: 'entziehen', P: 'entziehen' });
    assert.equal(rw.regeln[1].stopp, true);
    const typ = { id: 't', name: 'Vertrag', felder: [{ key: UMBAU_FELD, label: 'Übernommen aus', typ: 'text' }], register: [], titelVorlage: '', beschreibung: '', erstellt: '', geaendert: '', berechtigungen: rw } as unknown as Mappentyp;
    const lesen = (werte: Record<string, string>) => rechteAn(typ, { id: 'm', typId: 't', werte } as unknown as Mappe, { id: 'u', rollen: [] }, { heute: '2026-11-11', ich: 'u', meineRollen: [], merkmale: liesMerkmale({}) }, { dokumente: () => 0, verknuepfungen: () => 0 }).rechte.R;
    assert.equal(lesen({ [UMBAU_FELD]: 'h:v' }), false, 'umgezogen: wie vorher nicht lesbar');
    assert.equal(lesen({}), true, 'die übrigen Mappen des Zieltyps: wie bisher');
  });

  it('Archivmodus wird nie lockerer', () => {
    assert.equal(archivLockerer(null, null, {}), null);
    assert.equal(archivLockerer({ jahre: 10, stichtag: null }, null, {}), 'aus');
    assert.equal(archivLockerer({ jahre: 10, stichtag: null }, { jahre: 6, stichtag: null }, {}), 'jahre');
    assert.equal(archivLockerer({ jahre: 6, stichtag: 'datum' }, { jahre: 10, stichtag: 'rechnungsdatum' }, { datum: 'rechnungsdatum' }), null);
    assert.equal(archivLockerer({ jahre: 6, stichtag: 'datum' }, { jahre: 10, stichtag: null }, {}), 'stichtag');
  });

  it('frische Anmeldung, wenn ein Umbau bestätigt wird', () => {
    assert.equal(heikleHandlung('POST', '/api/werkbank/pakete/installieren', { umbauBestaetigt: true }), 'rechte');
    assert.equal(heikleHandlung('POST', '/api/werkbank/pakete/:id/aktualisieren', { umbauBestaetigt: true }), 'rechte');
    assert.equal(heikleHandlung('POST', '/api/werkbank/pakete/installieren', {}), null);
  });
});

async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo-pg');
  const sql = (await eigeneDatenbank('umbau')).sql;
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT_ID}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ICH.id}, ${HAUSHALT_ID}, ${ICH.email}, 'Admin', 'admin') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT_ID) as never;
}

for (const pg of [false, true]) {
  describe(`Umbau beim Installieren (#1041)${pg ? ' – PostgreSQL' : ''}`, { skip: pg && !process.env.TEST_DATABASE_URL ? 'TEST_DATABASE_URL nicht gesetzt' : false }, () => {
    async function aufbau() {
      const r = await repo(pg);
      const einstellungen = speicherEinstellungen();
      const d = new Dienst(r, speicherDateien(), { einstellungen });
      const konto = pg ? ICH.id : '00000000-0000-4000-8000-0000000000dd';
      const p = new Paketverwaltung(d, { version: () => VERSION, katalogUrl: 'https://katalog.test/katalog.json', abruf: async () => { throw new Error('ohne Netz'); }, dienstkonto: async () => konto });
      const hoch = async (dateien: Record<string, string>) => p.hochladen(zip(dateien), ICH);
      await p.installiere({ upload: (await hoch(basis)).upload, bestaetigt: true }, ICH);
      await p.installiere({ upload: (await hoch(haushalt1)).upload, bestaetigt: true }, ICH);
      const typ = async (k: string) => (await d.mappentypen.listeTypen()).find((x) => x.schluessel === k);
      // Bestand wie im echten Haushalt: Lena, Jonas und Markus haben Verträge und Versicherungen.
      const org = async (name: string) => (await d.mappen.legeMappeAn({ typId: (await typ('basis:organisation'))!.id, werte: { name } }, ICH.id)).id;
      const stadtwerke = await org('Stadtwerke Beispielstadt'), versicherer = await org('Beispiel Versicherung AG');
      const vertrag = (await typ('haushalt:vertrag'))!, versicherung = (await typ('haushalt:versicherung'))!;
      const strom = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { vertragspartner: stadtwerke, art: 'Strom', kuendigungsfrist: '3 Monate zum Ende der Laufzeit', betrag: { betrag: 64, waehrung: 'EUR' } } }, ICH.id);
      const handy = await d.mappen.legeMappeAn({ typId: vertrag.id, werte: { art: 'Handy', kuendigungsfrist: '1 Monat' } }, ICH.id);
      // Der Administrator hat an der Versicherung ein eigenes Feld angelegt (Rückfrage) und sie eng verrechtet.
      await d.mappentypen.aendereTyp(versicherung.id, { ...versicherung, felder: [...versicherung.felder, { key: 'zustand', label: 'Zustand', typ: 'text' }] });
      const haft = await d.mappen.legeMappeAn({ typId: versicherung.id, werte: { versicherer, versicherungsnummer: 'HV-4711', beitrag: { betrag: 59.9, waehrung: 'EUR' }, kuendigen_bis: '2027-03-01', zustand: 'aktiv' } }, ICH.id);
      const hausrat = await d.mappen.legeMappeAn({ typId: versicherung.id, werte: { versicherungsnummer: 'OFFEN-1' } }, ICH.id);
      await d.kern.repo.setzeBerechtigungen(versicherung.id, { grund: { C: true, R: false, U: false, D: false, P: false }, regeln: [
        { id: 'r1', name: 'Offen', wenn: [{ art: 'feld', bedingung: { art: 'feld', feld: 'versicherungsnummer', op: 'gleich', wert: { art: 'fest', wert: 'OFFEN-1' } } }], dann: { R: 'erteilen' }, stopp: false },
      ] });
      // KI: Verträge dürfen an KI-Dienste, Versicherungen nicht (#796).
      await einstellungen.schreibe('ki_typen', { zugelassen: [vertrag.id] });
      // Ein Fahrzeug verweist auf die Versicherung, eine Ansicht zeigt Versicherungen mit Nummer.
      const fz = (await typ('haushalt:fahrzeug'))!;
      const auto = await d.mappen.legeMappeAn({ typId: fz.id, werte: { kennzeichen: 'B-LB 1', versicherung: haft.id } }, ICH.id);
      const sicht = await d.legeSichtAn({ name: 'Versicherungen mit Nummer', typen: [versicherung.id], bedingungen: [{ art: 'feld', feld: 'versicherungsnummer', op: 'nichtLeer' }] });
      return { d, p, r, einstellungen, hoch, typ, vertrag, versicherung, strom, handy, haft, hausrat, auto, sicht, stadtwerke, versicherer };
    }
    const ENTSCHEIDUNGEN = { 'haushalt:versicherung': { zustand: 'feld' } };

    it('Vorschau: übernehmen und zusammenlegen, Rückfrage je eigenem Feld, Rechte und KI-Sperre', async () => {
      const x = await aufbau();
      const { vorschau } = await x.hoch(vertraege);
      assert.deepEqual(vorschau.probleme, []);
      assert.deepEqual(vorschau.umbau.map((u) => [u.von.kennung, u.nach.kennung, u.art, u.mappen]), [['haushalt:vertrag', 'vertraege:vertrag', 'uebernehmen', 2], ['haushalt:versicherung', 'vertraege:vertrag', 'zusammenlegen', 2]]);
      const v = vorschau.umbau[0], s = vorschau.umbau[1];
      assert.deepEqual(v.felder.find((f) => f.von === 'Kündigungsfrist'), { von: 'Kündigungsfrist', nach: 'Kündigungsfrist', anzahl: 2, notiz: 1 }, '„3 Monate zum Ende …“ bleibt zusätzlich als Notiz');
      assert.deepEqual(v.notiz, [{ feld: 'Art', anzahl: 2 }], 'Auswahl ohne Ziel: Notiz');
      assert.deepEqual(s.rueckfragen.map((r) => [r.feld, r.grund, r.anzahl, r.vorschlag]), [['zustand', 'eigen', 1, 'feld']]);
      assert.deepEqual(s.setzen, [{ feld: 'Vertragsart', wert: 'Vorgabe „versicherung“' }]);
      assert.deepEqual(s.rechte, { regeln: true, ki: true, verwehrt: [] });
      assert.deepEqual(s.umgeleitet, { felder: 1, ansichten: 1 });
      assert.equal(vorschau.typen.find((t) => t.schluessel === 'vertrag')?.uebernimmt, 'Vertrag');
      // Namenskonflikte (#1123): Der Umbau übernimmt „Vertrag“ aus Haushalt – das ist kein Konflikt.
      assert.deepEqual([vorschau.typen.find((t) => t.schluessel === 'vertrag')?.konflikt, vorschau.namenskonflikte], [null, []]);
    });

    it('nur mit Bestätigung, nur „Gesamte Verwaltung“, nur mit Antwort auf jede Rückfrage', async () => {
      const x = await aufbau();
      const nochmal = async () => (await x.hoch(vertraege)).upload;
      await assert.rejects(x.p.installiere({ upload: await nochmal(), bestaetigt: true, umbauBestaetigt: true, umbauEntscheidungen: ENTSCHEIDUNGEN }, ICH), (e: Fachfehler) => e.status === 403);
      await assert.rejects(x.p.installiere({ upload: await nochmal(), bestaetigt: true, gesamteVerwaltung: true, umbauEntscheidungen: ENTSCHEIDUNGEN }, ICH), (e: Fachfehler) => e.status === 409 && (e.details as { umbau?: string }).umbau === 'bestaetigen');
      await assert.rejects(x.p.installiere({ upload: await nochmal(), bestaetigt: true, gesamteVerwaltung: true, umbauBestaetigt: true }, ICH), (e: Fachfehler) => e.status === 409 && /Zustand/.test(e.message));
      await assert.rejects(x.p.installiere({ upload: await nochmal(), bestaetigt: true, gesamteVerwaltung: true, umbauBestaetigt: true, umbauEntscheidungen: { 'haushalt:versicherung': { zustand: 'unsinn' } } }, ICH), (e: Fachfehler) => e.status === 409);
      assert.ok(await x.typ('haushalt:versicherung'), 'nichts verändert');
    });

    it('baut um: gleiche Id, alle Werte (Notiz, Historie), Vorgabe gesetzt, Rechte und KI-Sperre gehen mit, Verweise umgeleitet', async () => {
      const x = await aufbau();
      const { upload } = await x.hoch(vertraege);
      const inst = await x.p.installiere({ upload, bestaetigt: true, gesamteVerwaltung: true, umbauBestaetigt: true, umbauEntscheidungen: ENTSCHEIDUNGEN }, ICH);
      // Übernahme: derselbe Typ mit neuer Kennung und Name des Pakets; Versicherung ist aufgegangen.
      const vertrag = (await x.typ('vertraege:vertrag'))!;
      assert.equal(vertrag.id, x.vertrag.id, 'Id bleibt (Ansichten, Rechte, Direktlinks)');
      assert.equal(inst.typen.vertrag, x.vertrag.id);
      assert.equal(await x.typ('haushalt:vertrag'), undefined);
      assert.equal(await x.typ('haushalt:versicherung'), undefined, 'leerer alter Typ ist weg');
      assert.ok(vertrag.felder.some((f) => f.key === 'zustand'), 'eigenes Feld kam mit (Antwort „feld“)');
      assert.ok(!vertrag.felder.some((f) => f.key === 'vertragspartner'), 'umgezogene Felder sind weg');
      const haushalt = (await x.p.installierte()).find((p) => p.id === 'haushalt')!;
      assert.deepEqual(Object.keys(haushalt.typen).sort(), ['fahrzeug'], 'Haushalt gibt Vertrag und Versicherung ab');
      // Werte.
      const m = async (id: string) => (await x.d.kern.repo.holeMappe(id))!;
      const strom = await m(x.strom.id);
      assert.equal(strom.typId, vertrag.id);
      assert.equal(strom.werte.von, x.stadtwerke);
      assert.deepEqual(strom.werte.kuendigungsfrist, { anzahl: 3, einheit: 'monate' });
      assert.deepEqual(strom.werte.betrag, { betrag: 64, waehrung: 'EUR' });
      const notiz = (await x.d.kern.repo.notizen(x.strom.id))[0]?.text ?? '';
      assert.match(notiz, /Verträge 1\.0\.0/);
      assert.match(notiz, /Art: Strom/);
      assert.match(notiz, /Kündigungsfrist: 3 Monate zum Ende der Laufzeit/);
      const handy = await m(x.handy.id);
      assert.deepEqual(handy.werte.kuendigungsfrist, { anzahl: 1, einheit: 'monate' });
      const haft = await m(x.haft.id);
      assert.equal(haft.typId, vertrag.id, 'Mappe zog in den Vertrag – Id bleibt');
      assert.equal(haft.werte.von, x.versicherer);
      assert.equal(haft.werte.vertragsnummer, 'HV-4711');
      assert.deepEqual(haft.werte.betrag, { betrag: 59.9, waehrung: 'EUR' });
      assert.equal(haft.werte.zustand, 'aktiv');
      const art = (await x.d.kern.repo.mappenMitVorgabe('paket:vertraege:versicherung'))[0];
      assert.equal(haft.werte.art, art.id, 'Vertragsart „Versicherung“ (Vorgabe)');
      assert.equal(haft.werte[UMBAU_FELD], 'haushalt:versicherung');
      assert.match((await x.d.kern.repo.notizen(x.haft.id))[0]?.text ?? '', /Kündigen bis: /, 'Feld ohne Ziel in der Notiz');
      const hist = await x.d.kern.repo.historie(x.haft.id);
      assert.ok(hist.some((h) => h.art === 'geaendert' && /Umgebaut durch Paket Verträge 1\.0\.0/.test(String(h.daten.text)) && /Versicherung/.test(String(h.daten.text))), 'Historie');
      // Rechte: Versicherungen bleiben so verrechtet wie vorher – auch die Regel auf das umbenannte Feld.
      const A = { heute: '2026-11-11', ich: 'u', meineRollen: [], merkmale: liesMerkmale({}) };
      const z = { dokumente: () => 0, verknuepfungen: () => 0 };
      const lesen = async (id: string) => rechteAn(vertrag, await m(id), { id: 'u', rollen: [] }, A, z).rechte.R;
      assert.equal(await lesen(x.haft.id), false, 'Versicherung: vorher nicht lesbar, danach nicht lesbar');
      assert.equal(await lesen(x.hausrat.id), true, 'Regel „OFFEN-1“ auf vertragsnummer gilt weiter');
      assert.equal(await lesen(x.strom.id), true, 'Verträge wie bisher');
      assert.equal(vertrag.felder.find((f) => f.key === UMBAU_FELD)?.berechnetVon, 'dms', 'nur lesbar');
      // Dasselbe in der Abfrage der Datenbank (Listen, Zahlen, Suche): drei von vier Mappen lesbar.
      assert.equal(await x.d.kern.repo.zaehleAusdruck(vertrag.id, leseAusdruck(vertrag, { id: 'u', rollen: [] }, A)), 3);
      // KI-Sperre (#796): Vertrag ist danach nicht mehr zugelassen, weil Versicherung es nicht war.
      assert.deepEqual((await x.einstellungen.lies('ki_typen') as { zugelassen: string[] }).zugelassen, []);
      // Verweise und Ansichten zeigen auf den Vertrag.
      const fz = (await x.typ('haushalt:fahrzeug'))!;
      assert.deepEqual(fz.felder.find((f) => f.key === 'versicherung')?.zielTypen, [vertrag.id]);
      assert.equal((await m(x.auto.id)).werte.versicherung, x.haft.id);
      const sicht = (await x.d.listeSichten()).find((s) => s.id === x.sicht.id)!;
      assert.deepEqual(sicht.typen, [vertrag.id]);
      assert.deepEqual(sicht.bedingungen.map((b) => (b as { feld?: string }).feld), ['vertragsnummer']);
      // Ein zweites Update baut nichts zweimal um; Haushalt 2.0.0 (Major) gibt die Typen ab, ohne sie neu anzulegen.
      const zwei = await x.hoch(haushalt2);
      assert.deepEqual(zwei.vorschau.umbau, []);
      await x.p.installiere({ upload: zwei.upload, bestaetigt: true }, ICH);
      assert.equal(await x.typ('haushalt:vertrag'), undefined);
      assert.equal((await x.d.mappen.listeMappen(vertrag.id)).length, 4);
    });

    it('alles oder nichts: bricht der Umbau ab, ist nichts verändert', { skip: !pg && 'Transaktion nur mit PostgreSQL' }, async () => {
      const x = await aufbau();
      const { upload } = await x.hoch(vertraege);
      const titel = x.d.mappenTitel.aktualisiereTitel.bind(x.d.mappenTitel);
      let aufrufe = 0;
      // Der zweite Schritt scheitert mittendrin (nach dem Umziehen der Werte).
      x.d.mappenTitel.aktualisiereTitel = async (ids) => { if (++aufrufe === 2) throw new Error('Platte voll'); return titel(ids); };
      await assert.rejects(x.p.installiere({ upload, bestaetigt: true, gesamteVerwaltung: true, umbauBestaetigt: true, umbauEntscheidungen: ENTSCHEIDUNGEN }, ICH), (e: Fachfehler) => /nichts verändert/.test(e.message) && /Platte voll/.test(e.message));
      x.d.mappenTitel.aktualisiereTitel = titel;
      assert.ok(await x.typ('haushalt:vertrag'));
      assert.ok(await x.typ('haushalt:versicherung'));
      assert.equal(await x.typ('vertraege:vertrag'), undefined);
      assert.equal((await x.d.kern.repo.holeMappe(x.haft.id))!.typId, x.versicherung.id);
      assert.equal((await x.d.kern.repo.holeMappe(x.strom.id))!.werte.vertragspartner, x.stadtwerke);
      assert.equal((await x.p.installierte()).some((p) => p.id === 'vertraege'), false);
      assert.deepEqual((await x.einstellungen.lies('ki_typen') as { zugelassen: string[] }).zugelassen, [x.vertrag.id]);
      assert.equal((await x.d.kern.repo.notizen(x.strom.id)).length, 0);
    });

    it('fremder Herausgeber: kein Umbau', async () => {
      const x = await aufbau();
      const fremd = { ...vertraege, 'manifest.yaml': vertraege['manifest.yaml'].replace('herausgeber: org.example', 'herausgeber: net.example') };
      const { vorschau } = await x.hoch(fremd);
      assert.ok(vorschau.fehlercodes.includes('umbau-herausgeber'), vorschau.probleme.join(' | '));
    });

    it('Archivmodus: wird er beim Zusammenlegen lockerer, gibt es keinen Umbau', async () => {
      const x = await aufbau();
      await x.d.mappentypen.aendereTyp(x.versicherung.id, { ...(await x.typ('haushalt:versicherung'))!, archiv: { jahre: 10, stichtag: null } });
      const { vorschau } = await x.hoch(vertraege);
      assert.ok(vorschau.fehlercodes.includes('umbau-archiv'), vorschau.probleme.join(' | '));
    });
  });
}
