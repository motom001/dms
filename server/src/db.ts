import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

export function verbinde(url: string) {
  return postgres(url, { max: 10, onnotice: () => {} });
}

/**
 * Führt alle noch nicht ausgeführten SQL-Dateien aus `verzeichnis` in
 * Namensreihenfolge aus. Alles läuft in einer Transaktion: scheitert eine
 * Migration, bleibt die Datenbank unverändert. Die Transaktionssperre
 * verhindert, dass zwei Instanzen gleichzeitig migrieren.
 */
export async function migriere(sql: postgres.Sql, verzeichnis: string, log: (m: string) => void = console.log) {
  const dateien = (await readdir(verzeichnis)).filter((f) => f.endsWith('.sql')).sort();
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(4711001)`;
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrationen (
        name text PRIMARY KEY,
        ausgefuehrt timestamptz NOT NULL DEFAULT now()
      )`;
    const erledigt = new Set((await tx`SELECT name FROM schema_migrationen`).map((r) => r.name as string));
    for (const datei of dateien) {
      if (erledigt.has(datei)) continue;
      await tx.unsafe(await readFile(join(verzeichnis, datei), 'utf8'));
      await tx`INSERT INTO schema_migrationen (name) VALUES (${datei})`;
      log(`Migration ausgeführt: ${datei}`);
    }
  });
}
