import type postgres from 'postgres';
import { t } from '../sprache/sprache';

/**
 * Datenbank-Erweiterungen der Suche (#562): pg_trgm (Tippfehler, Wortteile) und unaccent (Umlaute, #356).
 *
 * Beide gehören ins eigene Schema `erweiterungen_dms` (Migrationen 048 und 050): Das Wiederherstellen tauscht das
 * Schema public aus und löscht das alte samt Inhalt – eine Erweiterung dort verschwände mit. Fehlt eine Erweiterung,
 * läuft die Suche weiter, nur schlechter; damit das nicht still passiert, prüft das DMS den Stand beim Start, im
 * Systemzustand und in der Probe-Wiederherstellung und nennt die Abhilfe.
 */
export const ERWEITERUNGEN_SCHEMA = 'erweiterungen_dms';
export const ERWEITERUNGEN = ['pg_trgm', 'unaccent'] as const;
export type ErweiterungName = (typeof ERWEITERUNGEN)[number];

/**
 * ok: vorhanden und sicher vor dem Wiederherstellen · fehlt · gefaehrdet: liegt in einem Schema, das eine
 * Wiederherstellung austauscht oder löscht (public, dms_*).
 */
export interface ErweiterungStand {
  name: ErweiterungName;
  schema: string | null;
  zustand: 'ok' | 'fehlt' | 'gefaehrdet';
}

/** Trigramm-Indizes (Migrationen 030, 048, 050): Name, Tabelle, Spalte. */
const TRIGRAMM_INDIZES = [
  ['dokumente_volltext_trgm_idx', 'dokumente', 'volltext'],
  ['suchwoerter_trgm', 'suchwoerter', 'wort'],
] as const;

/** Bezeichner wie format('%I') in PostgreSQL: einfache Namen ohne Anführungszeichen. */
const bezeichner = (n: string) => (/^[a-z_][a-z0-9_]*$/.test(n) ? n : `"${n.replace(/"/g, '""')}"`);
/** dms_falte mit unaccent aus dem Schema (wie Migration 048); der Text der Funktion nennt das Schema. */
const falteMit = (schema: string) => `CREATE OR REPLACE FUNCTION dms_falte(t text) RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $g$
  SELECT ${bezeichner(schema)}.unaccent('${bezeichner(schema).replace(/'/g, "''")}.unaccent'::regdictionary, coalesce($1, ''))
$g$`;

const gefaehrdet = (schema: string) => schema === 'public' || schema.startsWith('dms_');

export function bewerteErweiterung(name: ErweiterungName, schema: string | null): ErweiterungStand {
  return { name, schema, zustand: schema === null ? 'fehlt' : schema !== ERWEITERUNGEN_SCHEMA && gefaehrdet(schema) ? 'gefaehrdet' : 'ok' };
}

type Abfrage = postgres.Sql | postgres.TransactionSql;

export async function liesErweiterungen(sql: Abfrage): Promise<ErweiterungStand[]> {
  const z =
    await sql`SELECT e.extname, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname IN ('pg_trgm', 'unaccent')`;
  const schema = new Map(z.map((r) => [r.extname as string, r.nspname as string]));
  return ERWEITERUNGEN.map((n) => bewerteErweiterung(n, schema.get(n) ?? null));
}

/** Nur die Probleme (für Übersicht und Hinweise). */
export const problemeAus = (s: ErweiterungStand[]) => s.filter((e) => e.zustand !== 'ok');

/** Ein Satz je Problem (Protokoll beim Start, Probe-Wiederherstellung). */
export function beschreibe(e: ErweiterungStand): string {
  if (e.zustand === 'gefaehrdet') return t('meldungen.erweiterungen.liegt-im-schema-und', { name: e.name, schema: String(e.schema) });
  return e.name === 'pg_trgm'
    ? t('meldungen.erweiterungen.pg-trgm-fehlt-keine')
    : t('meldungen.erweiterungen.unaccent-fehlt-umlaute-faltet');
}

export interface Protokoll {
  info(text: string, daten?: Record<string, unknown>): void;
  warn(text: string, daten?: Record<string, unknown>): void;
}

/**
 * Beim Start (nach dem Aufräumen früherer Wiederherstellungen): pg_trgm anlegen bzw. ins eigene Schema umziehen,
 * wenn es fehlt oder gefährdet liegt – etwa nach einer Wiederherstellung mit einer älteren Version oder wenn die
 * Datenbank ohne dieses Schema umgezogen wurde. Die Trigramm-Indizes entstehen danach im Hintergrund, damit der
 * Start nicht wartet. Liegt unaccent gefährdet, zieht sie ebenso um. Fehlt sie, legt das DMS sie nicht
 * nachträglich an: Die Suchkonfigurationen entstehen in Migration 048 und nähmen sie erst mit einem Neuaufbau des
 * Suchindex auf. Ergebnis: der Stand nach dem Versuch.
 */
export async function sichereErweiterungen(
  sql: postgres.Sql,
  log: Protokoll,
): Promise<{ stand: ErweiterungStand[]; indizes: Promise<void> }> {
  let stand = await liesErweiterungen(sql);
  const trgm = stand.find((e) => e.name === 'pg_trgm')!;
  let indizes: Promise<void> = Promise.resolve();
  if (trgm.zustand !== 'ok') {
    try {
      await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${ERWEITERUNGEN_SCHEMA}`);
      await sql.unsafe(
        trgm.schema === null
          ? `CREATE EXTENSION pg_trgm SCHEMA ${ERWEITERUNGEN_SCHEMA}`
          : `ALTER EXTENSION pg_trgm SET SCHEMA ${ERWEITERUNGEN_SCHEMA}`,
      );
      log.info(trgm.schema === null ? 'Erweiterung pg_trgm neu angelegt' : 'Erweiterung pg_trgm ins eigene Schema umgezogen', {
        schema: ERWEITERUNGEN_SCHEMA,
        vorher: trgm.schema ?? undefined,
      });
      indizes = (async () => {
        for (const [name, tabelle, spalte] of TRIGRAMM_INDIZES) {
          const t0 = Date.now();
          try {
            await sql.unsafe(`CREATE INDEX IF NOT EXISTS ${name} ON ${tabelle} USING gin (${spalte} ${ERWEITERUNGEN_SCHEMA}.gin_trgm_ops)`);
            log.info('Trigramm-Index geprüft', { index: name, ms: Date.now() - t0 });
          } catch (e) {
            log.warn('Trigramm-Index nicht angelegt', { index: name, fehler: (e as Error).message });
          }
        }
      })();
    } catch (e) {
      log.warn('Erweiterung pg_trgm nicht angelegt', { fehler: (e as Error).message });
    }
    stand = await liesErweiterungen(sql);
  }
  // unaccent in public (vom Betreiber vorab angelegt, 048 nahm sie dann dort): umziehen wie Migration 050.
  if (stand.find((e) => e.name === 'unaccent')!.zustand === 'gefaehrdet') {
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS ${ERWEITERUNGEN_SCHEMA}`);
        await tx.unsafe(`ALTER EXTENSION unaccent SET SCHEMA ${ERWEITERUNGEN_SCHEMA}`);
      });
      log.info('Erweiterung unaccent ins eigene Schema umgezogen', { schema: ERWEITERUNGEN_SCHEMA });
    } catch (e) {
      log.warn('Erweiterung unaccent nicht umgezogen', { fehler: (e as Error).message });
    }
    stand = await liesErweiterungen(sql);
  }
  // dms_falte nennt das Schema von unaccent im Text: nach einem Umzug (auch von Hand) anpassen. Ohne unaccent bei
  // Migration 048 faltet sie selbst und bleibt so.
  const u = stand.find((e) => e.name === 'unaccent')!;
  if (u.schema) {
    try {
      const [f] = await sql`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p WHERE p.oid = to_regprocedure('dms_falte(text)')`;
      const d = String(f?.d ?? '');
      if (d.includes('unaccent') && !d.includes(`${bezeichner(u.schema)}.unaccent(`)) {
        await sql.unsafe(falteMit(u.schema));
        log.info('Umlaut-Faltung an das Schema von unaccent angepasst', { schema: u.schema });
      }
    } catch (e) {
      log.warn('Umlaut-Faltung nicht angepasst', { fehler: (e as Error).message });
    }
  }
  for (const e of problemeAus(stand)) log.warn(`Datenbank-Erweiterung: ${beschreibe(e)}. Einzelheiten unter Werkbank → Systemzustand.`);
  return { stand, indizes };
}

/** Gibt es die Trigramm-Indizes im Schema? (Probe-Wiederherstellung: im eingespielten Schema.) */
export async function trigrammIndizes(sql: Abfrage, schema: string): Promise<string[]> {
  const namen = TRIGRAMM_INDIZES.map(([n]) => n as string);
  return (await sql`SELECT indexname FROM pg_indexes WHERE schemaname = ${schema} AND indexname IN ${sql(namen)}`).map(
    (r) => r.indexname as string,
  );
}
export const TRIGRAMM_INDEXNAMEN: readonly string[] = TRIGRAMM_INDIZES.map(([n]) => n);
