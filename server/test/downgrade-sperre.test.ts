/**
 * Sperre gegen ein Zurückgehen auf eine ältere Version (#714, `:stabil` zurücksetzen): Hat eine
 * neuere Version schon Migrationen ausgeführt, die dieses Programm nicht kennt, startet es nicht.
 * Nur mit TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const mitPg = !!process.env.TEST_DATABASE_URL;

describe('Sperre gegen Downgrade der Datenbank', { skip: !mitPg && 'ohne TEST_DATABASE_URL' }, () => {
  const aufraeumen: Array<() => Promise<unknown>> = [];
  after(async () => {
    for (const f of aufraeumen.reverse()) await f().catch(() => {});
  });

  it('bricht ab, wenn die Datenbank eine unbekannte Migration hat, und läuft mit allen bekannten', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/datenbank/anbindung');
    const { verbinde, migriere, NeuereDatenbankFehler } = await import('../src/datenbank/db');
    const name = `dms_downgrade_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const a = { ...ausUrl(process.env.TEST_DATABASE_URL)!, datenbank: name };
    await legeDatenbankAn(a);
    const sql = verbinde(alsUrl(a));
    const haupt = verbinde(process.env.TEST_DATABASE_URL!);
    aufraeumen.push(async () => {
      await haupt.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await haupt.end();
    });
    aufraeumen.push(() => sql.end());

    const neu = await mkdtemp(join(tmpdir(), 'mig-neu-'));
    const alt = await mkdtemp(join(tmpdir(), 'mig-alt-'));
    aufraeumen.push(
      () => rm(neu, { recursive: true, force: true }),
      () => rm(alt, { recursive: true, force: true }),
    );
    await writeFile(join(neu, '001_a.sql'), 'CREATE TABLE a (x int);');
    await writeFile(join(neu, '002_b.sql'), 'CREATE TABLE b (x int);');
    await writeFile(join(alt, '001_a.sql'), 'CREATE TABLE a (x int);');

    // Neuere Version richtet ein, dieselbe Version startet erneut ohne Fehler.
    await migriere(sql, neu, () => {});
    await migriere(sql, neu, () => {});

    // Ältere Version kennt 002_b.sql nicht → klarer Abbruch, nichts verändert.
    await assert.rejects(
      migriere(sql, alt, () => {}),
      (e: unknown) =>
        e instanceof NeuereDatenbankFehler &&
        e.unbekannt.join() === '002_b.sql' &&
        /neueren Version von Ablago/.test((e as Error).message) &&
        /Sicherung/.test((e as Error).message),
    );
    const namen = (await sql`SELECT name FROM schema_migrationen ORDER BY name`).map((r) => r.name);
    assert.deepEqual(namen, ['001_a.sql', '002_b.sql']);
  });
});
