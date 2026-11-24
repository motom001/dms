/**
 * Zählung hinter den Ansichten ohne JIT (#1631): Die große Zählung (`zaehleBestand`) schaltet das Übersetzen von
 * PostgreSQL nur für sich ab (`SET LOCAL jit = off` in ihrer Transaktion) – die Verbindung behält ihre Einstellung,
 * die Zahlen bleiben gleich. Nur mit TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import postgres from 'postgres';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const offen: Array<{ end(): Promise<void> }> = [];
after(async () => {
  for (const s of offen) await s.end();
});

describe('Zählung der Ansichten ohne JIT (#1631)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  it('SET LOCAL jit = off nur in der Transaktion der Zählung; Zahlen wie bisher', async () => {
    const { pgRepo } = await import('../src/repo/pg');
    const db = await eigeneDatenbank('jit');
    offen.push(db.sql);
    const h = randomUUID();
    const [t1, t2] = [randomUUID(), randomUUID()];
    await db.sql`INSERT INTO haushalte (id, name) VALUES (${h}, 'Test')`;
    for (const [id, name] of [
      [t1, 'Rechnung'],
      [t2, 'Vertrag'],
    ])
      await db.sql`INSERT INTO mappentypen (id, haushalt_id, name, trefferlisten) VALUES (${id}, ${h}, ${name}, '[]'::jsonb)`;
    await db.sql`INSERT INTO mappen (id, haushalt_id, typ_id, werte, titel, passt)
      SELECT gen_random_uuid(), ${h}, CASE WHEN g % 3 = 0 THEN ${t2}::uuid ELSE ${t1}::uuid END,
        jsonb_build_object('status', CASE WHEN g % 2 = 0 THEN 'offen' ELSE 'bezahlt' END), 'M' || g, true
      FROM generate_series(1, 30) g`;
    // Eine Verbindung, die jede Anweisung mitschreibt – so sieht der Test, was die Zählung schickt und was danach gilt.
    const gesehen: string[] = [];
    const sql = postgres(db.url, { max: 1, onnotice: () => {}, debug: (_c, q) => gesehen.push(q.trim()) });
    offen.push(sql);
    const repo = pgRepo(sql as never, h);
    const offenFilter = { art: 'feld', key: 'status', feldart: 'text', op: 'gleich', a: 'offen' };
    const r = await repo.zaehleBestand([[{ typen: [t1], filter: [] }], [{ typen: [t1, t2], filter: [offenFilter] }]] as never, null);
    assert.deepEqual(r.sichten, [20, 15]);
    assert.equal(r.typen.get(t1)?.anzahl, 20);
    const i = gesehen.findIndex((q) => /^SET LOCAL jit = off$/i.test(q));
    assert.ok(i >= 0, 'jit aus');
    assert.match(gesehen[i + 1], /^SELECT typ_id/, 'gleich danach die Zählung');
    assert.equal((await sql`SHOW jit`)[0].jit, 'on', 'die Verbindung behält JIT');
  });
});
