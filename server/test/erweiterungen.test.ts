/**
 * Erweiterungen der Suche (#562): pg_trgm und unaccent im eigenen Schema erweiterungen_dms – Bewertung, Umzug einer
 * Datenbank im alten Stand (Migration 050) und Prüfung beim Start (fehlende pg_trgm neu, unaccent von Hand umgezogen).
 * Wiederherstellung und Aufräumen selbst stehen in wiederherstellung.test.ts.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import { bewerteErweiterung, beschreibe, problemeAus } from '../src/erweiterungen';

const url = process.env.TEST_DATABASE_URL;
const MIGRATIONEN = fileURLToPath(new URL('../migrations', import.meta.url));
const HAUSHALT = '00000000-0000-4000-8000-000000000001';

describe('Erweiterungen der Suche (#562): Bewertung', () => {
  it('ok im eigenen oder fremden Schema, gefährdet in public und dms_*, sonst fehlt', () => {
    assert.equal(bewerteErweiterung('pg_trgm', 'erweiterungen_dms').zustand, 'ok');
    assert.equal(bewerteErweiterung('pg_trgm', 'extensions').zustand, 'ok', 'vom Anbieter verwaltetes Schema bleibt');
    assert.equal(bewerteErweiterung('pg_trgm', 'public').zustand, 'gefaehrdet');
    assert.equal(bewerteErweiterung('unaccent', 'dms_alt_behalten_20261102').zustand, 'gefaehrdet');
    assert.equal(bewerteErweiterung('unaccent', null).zustand, 'fehlt');
    const p = problemeAus([bewerteErweiterung('pg_trgm', null), bewerteErweiterung('unaccent', 'erweiterungen_dms')]);
    assert.deepEqual(p.map((e) => e.name), ['pg_trgm']);
    assert.match(beschreibe(p[0]), /Tippfehler/);
    assert.match(beschreibe(bewerteErweiterung('pg_trgm', 'public')), /Schema public.*Wiederherstellung/);
  });
});

describe('Erweiterungen der Suche (#562) mit PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Sql aus dynamisch geladenem Modul; Typ im Test ohne Belang
  type Sql = any;
  const db = `dms_erw_${process.pid}`;
  const offen: Array<() => Promise<void>> = [];
  const urlVon = (name: string) => { const u = new URL(url!); u.pathname = `/${name}`; return u.toString(); };
  after(async () => { for (const f of offen.reverse()) await f().catch(() => {}); });

  const schemaVon = async (sql: Sql, ext: string) => (await sql`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = ${ext}`)[0]?.nspname ?? null;
  const indizes = async (sql: Sql) => (await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('dokumente_volltext_trgm_idx', 'suchwoerter_trgm') ORDER BY 1`).map((r: { indexname: string }) => r.indexname);
  const stumm = { info: () => {}, warn: () => {} };

  it('Datenbank im alten Stand: Migration 050 zieht pg_trgm und unaccent aus public um, die Suche läuft weiter', async () => {
    const { verbinde, migriere } = await import('../src/db');
    const haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    offen.push(async () => { await haupt.unsafe(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`); await haupt.end(); });
    const sql = verbinde(urlVon(db));
    offen.push(() => sql.end());
    // Stand bis 0.131.0: pg_trgm aus Migration 030 in public; unaccent hat der Betreiber vorab in public angelegt.
    await sql`CREATE EXTENSION unaccent`;
    const bis049 = await mkdtemp(join(tmpdir(), 'dms-erw-'));
    offen.push(() => rm(bis049, { recursive: true, force: true }));
    for (const f of (await readdir(MIGRATIONEN)).filter((x) => x.endsWith('.sql') && x < '050')) await symlink(join(MIGRATIONEN, f), join(bis049, f));
    await migriere(sql, bis049, () => {});
    assert.equal(await schemaVon(sql, 'pg_trgm'), 'public');
    assert.equal(await schemaVon(sql, 'unaccent'), 'public');
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;

    await migriere(sql, MIGRATIONEN, () => {});
    assert.equal(await schemaVon(sql, 'pg_trgm'), 'erweiterungen_dms');
    assert.equal(await schemaVon(sql, 'unaccent'), 'erweiterungen_dms');
    assert.deepEqual(await indizes(sql), ['dokumente_volltext_trgm_idx', 'suchwoerter_trgm']);
    // dms_falte nennt jetzt das neue Schema; die Suchkonfiguration faltet weiter.
    assert.equal((await sql`SELECT dms_falte('Özdemir Straße') AS f`)[0].f, 'Ozdemir Strasse');
    assert.equal((await sql`SELECT to_tsvector('dms_german', 'Müller')::text AS v`)[0].v, "'mull':1");
    // Das alte Schema public ließe sich jetzt löschen, ohne die Erweiterungen mitzunehmen.
    const [abh] = await sql`SELECT count(*)::int AS n FROM pg_depend d JOIN pg_extension e ON e.oid = d.objid WHERE d.classid = 'pg_extension'::regclass AND d.refclassid = 'pg_namespace'::regclass AND d.refobjid = 'public'::regnamespace`;
    assert.equal(abh.n, 0);
    const { liesErweiterungen } = await import('../src/erweiterungen');
    assert.deepEqual(problemeAus(await liesErweiterungen(sql)), []);
  });

  it('beim Start: fehlende pg_trgm neu mit Indizes, unaccent von Hand umgezogen – Faltung passt sich an', async () => {
    const { verbinde } = await import('../src/db');
    const { sichereErweiterungen } = await import('../src/erweiterungen');
    const sql = verbinde(urlVon(db));
    offen.push(() => sql.end());
    // Wie nach einer Wiederherstellung mit 0.131.0: pg_trgm samt Indizes weg.
    await sql`DROP EXTENSION pg_trgm CASCADE`;
    assert.deepEqual(await indizes(sql), []);
    const meldungen: string[] = [];
    const log = { info: (t: string) => meldungen.push(t), warn: (t: string) => meldungen.push(`WARN ${t}`) };
    const r = await sichereErweiterungen(sql, log);
    await r.indizes;
    assert.deepEqual(problemeAus(r.stand), []);
    assert.equal(await schemaVon(sql, 'pg_trgm'), 'erweiterungen_dms');
    assert.deepEqual(await indizes(sql), ['dokumente_volltext_trgm_idx', 'suchwoerter_trgm']);
    assert.ok(meldungen.includes('Erweiterung pg_trgm neu angelegt'), meldungen.join('\n'));
    const { pgRepo } = await import('../src/repo-pg');
    await sql`INSERT INTO suchwoerter (haushalt_id, wort, anzahl) VALUES (${HAUSHALT}, 'waschmaschine', 3)`;
    assert.deepEqual(await pgRepo(sql, HAUSHALT).aehnlicheWoerter(['Waschmaschiene'], 3), { waschmaschiene: ['waschmaschine'] });

    // unaccent von der Verwaltung der Datenbank in ein anderes Schema gelegt: dms_falte zeigte ins Leere.
    await sql`CREATE SCHEMA extensions`;
    await sql`ALTER EXTENSION unaccent SET SCHEMA extensions`;
    await assert.rejects(sql`SELECT dms_falte('Müller')`);
    await sichereErweiterungen(sql, stumm);
    assert.equal((await sql`SELECT dms_falte('Müller') AS f`)[0].f, 'Muller');
    assert.equal(await schemaVon(sql, 'unaccent'), 'extensions', 'fremdes Schema bleibt');

    // Zurück nach public (gefährdet): zieht wieder nach erweiterungen_dms.
    await sql`ALTER EXTENSION unaccent SET SCHEMA public`;
    const z = await sichereErweiterungen(sql, stumm);
    assert.deepEqual(problemeAus(z.stand), []);
    assert.equal((await sql`SELECT dms_falte('Müller') AS f`)[0].f, 'Muller');
    // Zweiter Start ohne Befund: nichts zu tun, keine Meldung.
    const leise: string[] = [];
    await sichereErweiterungen(sql, { info: (t: string) => leise.push(t), warn: (t: string) => leise.push(t) });
    assert.deepEqual(leise, []);
  });
});
