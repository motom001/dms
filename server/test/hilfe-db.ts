/**
 * Eigene PostgreSQL-Datenbank je Testdatei (#900). `npm test` startet alle Testdateien gleichzeitig; mit
 * TEST_DATABASE_URL teilen sie sich sonst eine Datenbank, und eine Datei, die dort das Schema leert, nimmt jeder
 * anderen gerade laufenden Datei die Tabellen weg („relation … does not exist“).
 *
 * `eigeneDatenbank(name)` legt `dms_test_<name>_<pid>_<n>` neben der Datenbank aus TEST_DATABASE_URL an, migriert
 * sie (abschaltbar) und gibt Adresse und Verbindung zurück. `ende()` löscht sie wieder; spätestens nach dem letzten
 * Test der Datei geschieht das von selbst (Hook auf oberster Ebene). Die Verbindungen sind bewusst wenige (Vorgabe 4),
 * damit viele parallele Dateien unter `max_connections` (Vorgabe 100) bleiben.
 *
 * `jeTest: true` (QS-Runde 11/2026): Legt eine Datei je Test eine frische Datenbank an, schließt `afterEach` sie gleich nach
 * dem Test – sonst bleiben bis zum Ende der Datei je Test bis zu `max` Verbindungen offen (bei 20 Tests 80), und mehrere
 * Dateien gleichzeitig stoßen an `max_connections` („too many clients“). Nur für Datenbanken, die kein späterer Test braucht.
 *
 * Auf der gemeinsamen Datenbank selbst schreibt kein Test – eigene-datenbank.test.ts prüft das.
 */
import { after, afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';
import { alsUrl, ausUrl } from '../src/datenbank/anbindung';
import { migriere, verbinde } from '../src/datenbank/db';

export const MIGRATIONEN = fileURLToPath(new URL('../migrations', import.meta.url));

export interface EigeneDatenbank {
  /** Name der Datenbank, z. B. `dms_test_pg_1234_1`. */
  name: string;
  /** Adresse wie TEST_DATABASE_URL, nur mit der eigenen Datenbank. */
  url: string;
  /** Verbindung mit wenigen Plätzen (`max`); baut erst bei der ersten Abfrage auf. */
  sql: postgres.Sql;
  /** Verbindung schließen und die Datenbank löschen; mehrfacher Aufruf schadet nicht. */
  ende(): Promise<void>;
}

const offen = new Set<EigeneDatenbank>();
/** Datenbanken mit `jeTest`: nach jedem Test löschen. */
const jeTest = new Set<EigeneDatenbank>();
let zaehler = 0;

/** Nach jedem Test: die Datenbanken mit `jeTest` löschen. */
afterEach(async () => {
  for (const d of [...jeTest]) await d.ende();
});

/** Nach dem letzten Test der Datei: alles löschen, was noch offen ist. */
after(async () => {
  for (const d of [...offen]) await d.ende();
});

/** Verbindung zur gemeinsamen Datenbank – nur zum Anlegen und Löschen der eigenen. */
async function mitVerwaltung<T>(f: (s: postgres.Sql) => Promise<T>): Promise<T> {
  const basis = ausUrl(process.env.TEST_DATABASE_URL);
  if (!basis) throw new Error('TEST_DATABASE_URL fehlt');
  const s = verbinde(alsUrl(basis), 1);
  try {
    return await f(s);
  } finally {
    await s.end();
  }
}

export async function eigeneDatenbank(
  kurz: string,
  o: { migrieren?: boolean; max?: number; jeTest?: boolean } = {},
): Promise<EigeneDatenbank> {
  const basis = ausUrl(process.env.TEST_DATABASE_URL);
  if (!basis) throw new Error('TEST_DATABASE_URL fehlt');
  const name = `dms_test_${kurz.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${process.pid}_${++zaehler}`.slice(0, 63);
  await mitVerwaltung(async (s) => {
    await s.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await s.unsafe(`CREATE DATABASE "${name}"`);
  });
  const url = alsUrl(basis, name);
  const sql = verbinde(url, o.max ?? 4);
  let beendet = false;
  const d: EigeneDatenbank = {
    name,
    url,
    sql,
    ende: async () => {
      if (beendet) return;
      beendet = true;
      offen.delete(d);
      jeTest.delete(d);
      await sql.end({ timeout: 5 }).catch(() => {});
      // WITH (FORCE): auch Verbindungen, die ein Test offen ließ (eigener Pool, Server), stehen dem Löschen nicht im Weg.
      await mitVerwaltung((s) => s.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)).catch(() => {});
    },
  };
  offen.add(d);
  if (o.jeTest) jeTest.add(d);
  if (o.migrieren !== false) await migriere(sql, MIGRATIONEN, () => {});
  return d;
}
