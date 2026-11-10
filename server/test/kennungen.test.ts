/**
 * Kennungen eindeutig (#1084): Muster und Längen, `paket:schluessel` statt `<paket>_<schluessel>`, Umzug (Migration 093)
 * ohne Alias – Zuordnung aus den installierten Paketen, Rechte-Regeln, Ansichten und Automatisierungen bleiben gleich.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { hauptpaket, istHerausgeber, PAKET_ID, SCHLUESSEL, teileKennung, TYP_KENNUNG, typKennung, TYPVERWEIS } from '../../shared/src/kennungen';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { neueKennung } from '../src/pakete';
import { speicherRepo } from '../src/repo-speicher';
import { eigeneDatenbank, MIGRATIONEN } from './hilfe-db';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const HAUSHALT = '00000000-0000-4000-8000-000000001084';

describe('Kennungen (#1084)', () => {
  it('Paket-Id bis 40 Zeichen, ein Punkt-Zusatz bis 20; Schlüssel bis 60', () => {
    assert.ok(PAKET_ID.test('haus_und_garten'));
    assert.ok(PAKET_ID.test(`a${'b'.repeat(39)}`), '40 Zeichen');
    assert.ok(!PAKET_ID.test(`a${'b'.repeat(40)}`), '41 Zeichen');
    assert.ok(PAKET_ID.test('texterkennung.fra'));
    assert.ok(PAKET_ID.test(`texterkennung.f${'r'.repeat(19)}`), 'Zusatz 20 Zeichen');
    assert.ok(!PAKET_ID.test(`texterkennung.f${'r'.repeat(20)}`), 'Zusatz 21 Zeichen');
    for (const x of ['a', 'a.b.c', 'texterkennung.', '.fra', 'texterkennung.1fra', 'Haus', 'haus-garten', 'haus:garten']) assert.ok(!PAKET_ID.test(x), x);
    assert.ok(SCHLUESSEL.test(`r${'x'.repeat(59)}`));
    assert.ok(!SCHLUESSEL.test(`r${'x'.repeat(60)}`));
    assert.ok(TYPVERWEIS.test('texterkennung.fra:sprache') && TYPVERWEIS.test('basis:person') && TYPVERWEIS.test('person'));
    assert.ok(!TYPVERWEIS.test('a:b:c') && !TYP_KENNUNG.test('basis_person:'));
    assert.equal(hauptpaket('texterkennung.fra'), 'texterkennung');
    assert.equal(hauptpaket('texterkennung'), null);
    assert.equal(typKennung('haus', 'garten_pflanze'), 'haus:garten_pflanze');
    assert.equal(typKennung(null, 'rechnung'), 'rechnung');
    assert.deepEqual(teileKennung('haus_garten:pflanze'), { paket: 'haus_garten', schluessel: 'pflanze' });
    assert.deepEqual(teileKennung('rechnung'), { paket: null, schluessel: 'rechnung' });
    for (const h of ['app.ablago', 'org.example', 'org.example.pakete', 'de.familie-meier']) assert.ok(istHerausgeber(h), h);
    for (const h of ['ablago', 'App.ablago', 'org.-example', 'org.example-', 'org..example', `org.${'x'.repeat(100)}`]) assert.ok(!istHerausgeber(h), h);
  });

  it('kein Kollisionsfall mehr: haus + garten_pflanze und haus_garten + pflanze sind zwei Kennungen', () => {
    assert.notEqual(typKennung('haus', 'garten_pflanze'), typKennung('haus_garten', 'pflanze'));
    // Ältere Dateien (fremde_typen in alter Form): Zuordnung über die Pakete, nicht am Unterstrich.
    const installiert: Array<{ id: string; typen: Record<string, string> }> = [{ id: 'haus', typen: { garten_pflanze: 'a' } }, { id: 'haus_garten', typen: { beet: 'b' } }];
    assert.equal(neueKennung('haus_garten_pflanze', installiert), 'haus:garten_pflanze');
    assert.equal(neueKennung('haus_garten_beet', installiert), 'haus_garten:beet');
    assert.equal(neueKennung('unbekannt_typ', installiert), 'unbekannt_typ', 'nichts Passendes: bleibt');
    assert.equal(neueKennung('basis:person', installiert), 'basis:person');
    // Doppeldeutig (beide Pakete hätten den Typ): keine Zuordnung.
    assert.equal(neueKennung('haus_garten_pflanze', [...installiert, { id: 'haus_garten', typen: { pflanze: 'c' } }]), 'haus_garten_pflanze');
  });

  it('eigene Mappentypen: Kennung ohne Paket; „paket:schluessel“ vergibt nur die Paketverwaltung', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const eigen = await d.legeTypAn({ name: 'Person', felder: [], register: [{ key: 'felder', name: 'Felder', art: 'felder' }] });
    assert.equal(eigen.schluessel, 'person');
    assert.equal(eigen.paket, undefined);
    await assert.rejects(d.legeTypAn({ name: 'Fremd', schluessel: 'basis:person', felder: [], register: [{ key: 'felder', name: 'Felder', art: 'felder' }] }), status(422));
    const ausPaket = await d.legeTypAn({ name: 'Person (Basis)', schluessel: 'basis:person', felder: [], register: [{ key: 'felder', name: 'Felder', art: 'felder' }] }, 'basis');
    assert.equal(ausPaket.schluessel, 'basis:person');
    assert.equal(ausPaket.paket, 'basis');
    // Ein anderes Paket darf nicht unter fremdem Präfix anlegen.
    await assert.rejects(d.legeTypAn({ name: 'X', schluessel: 'basis:x', felder: [], register: [{ key: 'felder', name: 'Felder', art: 'felder' }] }, 'haus'), status(422));
    // Fest nach dem Anlegen, auch beim Ändern mit ganzem Typ.
    const um = await d.aendereTyp(ausPaket.id, { ...ausPaket, name: 'Kontakt' });
    assert.equal(um.schluessel, 'basis:person');
  });
});

describe('Migration 093 (#1084) – PostgreSQL', () => {
  it('zieht <paket>_<schluessel> über die Paket-Einträge um; Rechte-Regeln, Ansichten, Automatisierungen bleiben gleich', async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    const db = await eigeneDatenbank('kennungen');
    const { sql } = db;
    const { pgRepo } = await import('../src/repo-pg');
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    const d = new Dienst(pgRepo(sql, HAUSHALT), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const reg = [{ key: 'felder', name: 'Felder', art: 'felder' as const }];
    // Heutiger Stand: Paket haus mit Typ garten_pflanze, Paket haus_garten mit Typ beet, eigener Typ garten_pflanze.
    const pflanze = await d.legeTypAn({ name: 'Pflanze', schluessel: 'haus:garten_pflanze', felder: [{ key: 'name', label: 'Name', typ: 'text' }], register: [{ ...reg[0], felder: ['name'] }] }, 'haus');
    const beet = await d.legeTypAn({ name: 'Beet', schluessel: 'haus_garten:beet', felder: [], register: reg }, 'haus_garten');
    const eigen = await d.legeTypAn({ name: 'Garten', schluessel: 'garten_pflanze', felder: [], register: reg });
    const ablageort = await d.legeTypAn({ name: 'Ablageort', schluessel: 'ablageort', felder: [], register: reg });
    const repo = pgRepo(sql, HAUSHALT);
    for (const [id, typen] of [['haus', { garten_pflanze: pflanze.id }], ['haus_garten', { beet: beet.id }], ['basis', { ablageort: ablageort.id }]] as const) {
      await repo.speicherePaket({ id, name: id, version: '1.0.0', beschreibung: '', lizenz: 'MIT', autor: { name: '', github: '' }, herkunft: { art: 'katalog', url: 'https://catalog.ablago.app/katalog.json' }, installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen, sichten: {}, abhaengigkeiten: {} });
    }
    // Rechte-Regel, Ansicht und Automatisierung am Typ (alle per uuid).
    const regel = { grund: { C: 'immer', R: 'nie', U: 'nie', D: 'nie', P: 'nie' }, regeln: [] };
    await sql`UPDATE mappentypen SET berechtigungen = ${sql.json(regel)} WHERE id = ${pflanze.id}`;
    const sicht = await d.legeSichtAn({ name: 'Garten', beschreibung: '', elternId: null, position: 10, typen: [pflanze.id, beet.id], bedingungen: [] });
    await sql`INSERT INTO automatisierungen (id, haushalt_id, name, daten, herkunft, paket_id) VALUES
      ('00000000-0000-4000-8000-00000000a108', ${HAUSHALT}, 'Gießen', ${sql.json({ wenn: { art: 'mappe.angelegt', typ: pflanze.id }, dann: [] })}, 'paket', 'haus')`;
    const bild = async () => ({
      typen: await sql`SELECT id, name, berechtigungen, felder, register FROM mappentypen ORDER BY id`,
      sichten: await sql`SELECT id, typen, bedingungen, berechtigungen FROM sichten ORDER BY id`,
      automatisierungen: await sql`SELECT id, daten, paket_id FROM automatisierungen ORDER BY id`,
    });
    const vorher = await bild();
    // Zurück auf den Stand vor #1084: eine Spalte, „<paket>_<schluessel>“; der übernommene Ablageort ohne Präfix.
    await sql`DROP INDEX mappentypen_kennung_uq`;
    await sql`UPDATE mappentypen SET schluessel = paket || '_' || schluessel, paket = NULL WHERE paket IS NOT NULL`;
    await sql`CREATE UNIQUE INDEX mappentypen_schluessel_uq ON mappentypen (haushalt_id, schluessel) WHERE schluessel IS NOT NULL`;
    const alt = await sql`SELECT id, paket, schluessel FROM mappentypen WHERE id = ${pflanze.id}`;
    assert.deepEqual([alt[0].paket, alt[0].schluessel], [null, 'haus_garten_pflanze'], 'alte, doppeldeutige Form');
    await sql.begin((tx) => tx.unsafe(readFileSync(join(MIGRATIONEN, '093_typ_kennungen.sql'), 'utf8')));
    const k = new Map((await sql`SELECT id, paket, schluessel FROM mappentypen`).map((r) => [r.id as string, typKennung(r.paket as string | null, r.schluessel as string)]));
    assert.equal(k.get(pflanze.id), 'haus:garten_pflanze', 'laut Paket haus – nicht haus_garten:pflanze');
    assert.equal(k.get(beet.id), 'haus_garten:beet');
    assert.equal(k.get(eigen.id), 'garten_pflanze', 'eigener Typ bleibt ohne Paket');
    assert.equal(k.get(ablageort.id), 'basis:ablageort', 'übernommener Ablageort gehört jetzt Basis');
    assert.deepEqual(await bild(), vorher, 'Rechte-Regeln, Felder, Ansichten und Automatisierungen unverändert');
    // Nach außen: paket:schluessel, Paket getrennt.
    const typ = (await d.listeTypen()).find((x) => x.id === pflanze.id)!;
    assert.equal(typ.schluessel, 'haus:garten_pflanze');
    assert.equal(typ.paket, 'haus');
    // Ein zweites Mal ändert nichts (wiederholbar), und haus_garten:pflanze ist jetzt frei.
    await sql.begin((tx) => tx.unsafe(readFileSync(join(MIGRATIONEN, '093_typ_kennungen.sql'), 'utf8')));
    const neu = await d.legeTypAn({ name: 'Pflanze (Garten)', schluessel: 'haus_garten:pflanze', felder: [], register: reg }, 'haus_garten');
    assert.equal(neu.schluessel, 'haus_garten:pflanze');
    await assert.rejects(d.legeTypAn({ name: 'Doppelt', schluessel: 'haus:garten_pflanze', felder: [], register: reg }, 'haus'), status(422));
    assert.ok(sicht.id);
    await db.ende();
  });
});
