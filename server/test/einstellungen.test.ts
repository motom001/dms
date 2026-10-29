/**
 * Einstellungen (#165): null schreiben löscht den Eintrag – im Arbeitsspeicher und in PostgreSQL
 * (Spalte wert ist NOT NULL). Vorher scheiterte „Wartung beenden“.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { speicherEinstellungen, type Einstellungen } from '../src/einstellungen';

async function nullLoescht(e: Einstellungen) {
  await e.schreibe('wartung', { stufe: 'aktiv' });
  assert.deepEqual(await e.lies('wartung'), { stufe: 'aktiv' });
  await e.schreibe('wartung', null);
  assert.equal(await e.lies('wartung'), null);
  await e.schreibe('wartung', null); // auch ohne Eintrag kein Fehler
  assert.equal(await e.lies('wartung'), null);
  await e.schreibe('zahl', 0);
  await e.schreibe('aus', false);
  assert.equal(await e.lies('zahl'), 0, '0 bleibt ein Wert');
  assert.equal(await e.lies('aus'), false, 'false bleibt ein Wert');
}

it('Arbeitsspeicher: null löscht den Eintrag', async () => {
  await nullLoescht(speicherEinstellungen());
});

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
describe('Einstellungen mit PostgreSQL', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let haupt: any; let sql: any;
  const db = `dms_einstellungen_${process.pid}`;
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    const { fileURLToPath } = await import('node:url');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  });
  after(async () => {
    await sql?.end();
    await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt?.end();
  });

  it('pgEinstellungen und pgBetriebSpeicher: null löscht den Eintrag', async () => {
    const { pgEinstellungen } = await import('../src/einstellungen');
    await nullLoescht(pgEinstellungen(sql, HAUSHALT));
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM einstellungen WHERE schluessel = 'wartung'`;
    assert.equal(n, 0);
  });

  it('Wartung beenden und nach Neustart aus', async () => {
    const { pgEinstellungen } = await import('../src/einstellungen');
    const { Wartung } = await import('../src/wartung');
    const konten = { beendeAlleSitzungenAusser: async () => 0 };
    const w = new Wartung(pgEinstellungen(sql, HAUSHALT), konten);
    await w.laden();
    await w.einschalten({ text: 'Test', ende: null, vorlauf: 0 }, { email: 'a@b.de' }, null);
    await w.jetztAktiv({ email: 'a@b.de' }, null);
    await w.ausschalten('a@b.de');
    const neu = new Wartung(pgEinstellungen(sql, HAUSHALT), konten);
    await neu.laden();
    assert.equal(neu.stand.stufe, 'aus');
  });
});
