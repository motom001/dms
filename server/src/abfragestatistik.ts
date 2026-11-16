import type postgres from 'postgres';
import { ERWEITERUNGEN_SCHEMA } from './erweiterungen';

/**
 * Teuerste Datenbank-Abfragen für den Lasttest (#894), aus `pg_stat_statements`.
 *
 * Die Erweiterung zählt je normalisierter Abfrage (Werte als `$1`, `$2` …) Anzahl, Rechenzeit und Zeilen. Sie wirkt nur,
 * wenn PostgreSQL sie beim Start lädt (`shared_preload_libraries`); dms-komplett tut das, eine Datenbank im eigenen
 * Container braucht `command: postgres -c shared_preload_libraries=pg_stat_statements`. Fehlt sie, meldet Ablago das mit
 * dem Grund – der Lasttest läuft dann ohne diese Werte weiter.
 *
 * Ablago liest die Werte nur, wenn jemand fragt (Lasttest, Werkbank → Systemzustand mit Recht „systemzustand“), und
 * setzt sie nur dann zurück – nie im laufenden Betrieb. Zurückgesetzt und gelesen wird nur die eigene Datenbank.
 * Abfragen erscheinen nur normalisiert und gekürzt; Zeichenketten, die doch im Text stehen, ersetzt {@link kuerzeAbfrage}.
 */

/** So schaltet man das Modul in einer Datenbank im eigenen Container ein (Docker Compose, Dienst der Datenbank). */
export const EINSCHALTEN = 'command: postgres -c shared_preload_libraries=pg_stat_statements';
/** Länge einer Abfrage in der Ausgabe. */
export const ABFRAGE_ZEICHEN = 120;
export const ANZAHL_MAX = 25;

export interface TeureAbfrage {
  /** Normalisiert, Leerraum zusammengezogen, gekürzt. */
  abfrage: string;
  gesamtMs: number;
  anzahl: number;
  mittelMs: number;
  zeilen: number;
  /** Anteil an der Rechenzeit aller Abfragen dieser Datenbank (0–1). */
  anteil: number;
}

/** nicht-geladen: Modul nicht in shared_preload_libraries · keine-erweiterung: CREATE EXTENSION fehlt (ohne Recht dazu) · keine-rechte · fehler */
export type Grund = 'nicht-geladen' | 'keine-erweiterung' | 'keine-rechte' | 'fehler';

export type AbfragenStand =
  { verfuegbar: true; gesamtMs: number; abfragen: TeureAbfrage[] } | { verfuegbar: false; grund: Grund; hinweis: string };

/** Ergebnis des Zurücksetzens: ok, oder warum nicht (dann zählen die Werte seit dem letzten Zurücksetzen weiter). */
export type Zuruecksetzen = { zurueckgesetzt: true } | { zurueckgesetzt: false; grund: Grund; hinweis: string };

const HINWEIS: Record<Grund, string> = {
  'nicht-geladen': `pg_stat_statements nicht geladen, so einschalten: ${EINSCHALTEN}`,
  'keine-erweiterung':
    'pg_stat_statements geladen, aber die Erweiterung fehlt: als Superuser in der Datenbank von Ablago „CREATE EXTENSION pg_stat_statements“',
  'keine-rechte':
    'pg_stat_statements vorhanden, aber ohne Recht: als Superuser „GRANT pg_read_all_stats TO <Rolle>“ und das Ausführen von pg_stat_statements_reset erlauben',
  fehler: 'pg_stat_statements nicht lesbar',
};
const ohne = (grund: Grund) => ({ grund, hinweis: HINWEIS[grund] });

/**
 * Für die Ausgabe: Leerraum zusammenziehen, Zeichenketten in Anführungszeichen durch `'…'` ersetzen (normalisierte
 * Abfragen haben dort `$1`; nur Befehle ohne Normalisierung könnten noch Inhalte tragen) und auf `max` Zeichen kürzen.
 */
export function kuerzeAbfrage(text: string, max = ABFRAGE_ZEICHEN): string {
  const t = text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(?:\bE)?'(?:[^']|'')*'/g, "'…'")
    .replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, "'…'")
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const code = (e: unknown) => (e as { code?: string })?.code;
const grundAus = (e: unknown): Grund => (code(e) === '55000' ? 'nicht-geladen' : code(e) === '42501' ? 'keine-rechte' : 'fehler');

/** Schema der Erweiterung (z. B. `erweiterungen_dms`), null, wenn sie fehlt. */
async function schemaDerErweiterung(sql: postgres.Sql): Promise<string | null> {
  const [z] =
    await sql`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_stat_statements'`;
  return (z?.nspname as string | undefined) ?? null;
}

/** Ist das Modul geladen? null: nicht lesbar (ohne Recht auf die Einstellung). */
async function geladen(sql: postgres.Sql): Promise<boolean | null> {
  try {
    const [z] = await sql`SELECT current_setting('shared_preload_libraries') AS w`;
    return String(z.w)
      .split(',')
      .map((x) => x.trim().replace(/^"|"$/g, ''))
      .includes('pg_stat_statements');
  } catch {
    return null;
  }
}

const id = (n: string) => `"${n.replace(/"/g, '""')}"`;

/**
 * Erweiterung finden; fehlt sie und ist das Modul geladen, anlegen (ins eigene Schema wie pg_trgm und unaccent, damit
 * das Wiederherstellen sie nicht mit dem Schema public löscht). Ohne Recht dazu: Grund.
 */
async function erweiterung(sql: postgres.Sql, anlegen: boolean): Promise<{ schema: string } | { grund: Grund }> {
  const schema = await schemaDerErweiterung(sql);
  if (schema) return { schema };
  if ((await geladen(sql)) === false) return { grund: 'nicht-geladen' };
  if (!anlegen) return { grund: 'keine-erweiterung' };
  try {
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${ERWEITERUNGEN_SCHEMA}`);
    await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements SCHEMA ${ERWEITERUNGEN_SCHEMA}`);
  } catch (e) {
    return { grund: code(e) === '42501' ? 'keine-erweiterung' : grundAus(e) };
  }
  return { schema: (await schemaDerErweiterung(sql)) ?? ERWEITERUNGEN_SCHEMA };
}

/** Werte der eigenen Datenbank zurücksetzen (vor jedem Durchgang des Lasttests); legt die Erweiterung an, wenn möglich. */
export async function abfragenZuruecksetzen(sql: postgres.Sql): Promise<Zuruecksetzen> {
  try {
    const e = await erweiterung(sql, true);
    if ('grund' in e) return { zurueckgesetzt: false, ...ohne(e.grund) };
    await sql.unsafe(
      `SELECT ${id(e.schema)}.pg_stat_statements_reset(0, (SELECT oid FROM pg_database WHERE datname = current_database()), 0)`,
    );
    return { zurueckgesetzt: true };
  } catch (e) {
    return { zurueckgesetzt: false, ...ohne(grundAus(e)) };
  }
}

/**
 * Die `anzahl` teuersten Abfragen der eigenen Datenbank nach Gesamtzeit, ohne die Abfragen an pg_stat_statements
 * selbst. Anteil an der Gesamtzeit aller übrigen Abfragen dieser Datenbank.
 */
export async function teuersteAbfragen(sql: postgres.Sql, anzahl = 10): Promise<AbfragenStand> {
  const n = Math.max(1, Math.min(ANZAHL_MAX, Math.floor(anzahl) || 10));
  try {
    const e = await erweiterung(sql, false);
    if ('grund' in e) return { verfuegbar: false, ...ohne(e.grund) };
    const s = id(e.schema);
    // Mit der Vorgabe pg_stat_statements.track = top zählen nur Abfragen auf oberster Ebene (Funktionen samt Inhalt).
    const rows = await sql.unsafe(`
      WITH a AS (
        SELECT query, total_exec_time, calls, rows FROM ${s}.pg_stat_statements
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND query NOT ILIKE '%pg_stat_statements%'
      )
      SELECT query, total_exec_time::float8 AS ms, calls::float8 AS calls, rows::float8 AS rows, sum(total_exec_time) OVER ()::float8 AS gesamt
      FROM a ORDER BY total_exec_time DESC LIMIT ${n}`);
    const gesamt = Number(rows[0]?.gesamt ?? 0);
    const r1 = (x: number) => Math.round(x * 10) / 10;
    return {
      verfuegbar: true,
      gesamtMs: Math.round(gesamt),
      abfragen: rows.map((r) => ({
        // Ohne Recht auf fremde Abfragen steht dort „<insufficient privilege>“ – das bleibt so stehen.
        abfrage: kuerzeAbfrage(String(r.query ?? '')),
        gesamtMs: r1(Number(r.ms)),
        anzahl: Number(r.calls),
        mittelMs: Number(r.calls) ? Math.round((Number(r.ms) / Number(r.calls)) * 100) / 100 : 0,
        zeilen: Number(r.rows),
        anteil: gesamt > 0 ? Math.round((Number(r.ms) / gesamt) * 1000) / 1000 : 0,
      })),
    };
  } catch (e) {
    return { verfuegbar: false, ...ohne(grundAus(e)) };
  }
}
