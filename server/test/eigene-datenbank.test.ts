/**
 * Eigene Datenbank je Testdatei (#900): Keine Testdatei leert das Schema der gemeinsamen Test-Datenbank
 * (TEST_DATABASE_URL). Die Dateien laufen gleichzeitig; wer dort das Schema leert, nimmt den anderen die Tabellen weg.
 * Wer eine leere Datenbank braucht, nimmt `eigeneDatenbank()` aus hilfe-db.ts.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { eigeneDatenbank } from './hilfe-db';

const ORDNER = fileURLToPath(new URL('.', import.meta.url));
// Als Muster zusammengesetzt, damit diese Datei sich nicht selbst findet.
const SCHEMA_LEEREN = new RegExp(['DROP', 'SCHEMA'].join('\\s+'), 'i');

describe('Tests mit PostgreSQL: eigene Datenbank (#900)', () => {
  it('keine Testdatei leert ein Schema (DROP … SCHEMA)', () => {
    const funde: string[] = [];
    for (const datei of readdirSync(ORDNER).filter((n) => n.endsWith('.ts') && n !== 'hilfe-db.ts')) {
      readFileSync(`${ORDNER}${datei}`, 'utf8')
        .split('\n')
        .forEach((zeile, i) => {
          if (SCHEMA_LEEREN.test(zeile)) funde.push(`${datei}:${i + 1}`);
        });
    }
    assert.deepEqual(
      funde,
      [],
      `Schema der gemeinsamen Test-Datenbank geleert – stattdessen eigeneDatenbank() aus test/hilfe-db.ts nehmen: ${funde.join(', ')}`,
    );
  });

  it(
    'eigeneDatenbank: angelegt, migriert, getrennt von der gemeinsamen und am Ende gelöscht',
    { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' },
    async () => {
      const a = await eigeneDatenbank('probe');
      const b = await eigeneDatenbank('probe', { migrieren: false });
      assert.notEqual(a.name, b.name);
      assert.match(a.name, new RegExp(`^dms_test_probe_${process.pid}_\\d+$`));
      const [{ n }] = await a.sql`SELECT count(*)::int AS n FROM schema_migrationen`;
      assert.ok(n > 0, 'migriert');
      const [{ t }] = await b.sql`SELECT count(*)::int AS t FROM pg_tables WHERE schemaname = 'public'`;
      assert.equal(t, 0, 'ohne Migration leer');
      await a.ende();
      await a.ende();
      const [{ da }] = await b.sql`SELECT count(*)::int AS da FROM pg_database WHERE datname = ${a.name}`;
      assert.equal(da, 0, 'gelöscht');
      await b.ende();
    },
  );
});
