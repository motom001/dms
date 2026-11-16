/** Gemeinsamer Kontext der Teile des PostgreSQL-Repos (#1278): Verbindung, Haushalt, Spalten, Zwischenspeicher, Hilfen. */
import type postgres from 'postgres';
import { datumIn, ziehe } from '../../../../shared/src/nummernkreis';
import type { Varianten } from '../../../../shared/src/suche';
import { suchkonfig } from '../../../../shared/src/textsprache';
import { lesespeicherFuer } from '../../zwischenspeicher/lesespeicher';
import { istUuid, type Verweis } from '..';
import { DOKUMENT_SPALTEN, MAPPEN_SPALTEN, SUCHINDEX_TEXT, VERSION_SPALTEN } from './spalten';
import { type Sql, type SqlTeil, suchanfrage } from './sql';
import { alsKreis, alsTyp } from './zeilen';

/**
 * `imTx`: Repo innerhalb einer Transaktion – dort nie aus dem Lesespeicher (#741), denn die Transaktion sieht ihre
 * eigenen, noch nicht abgeschlossenen Änderungen, der Haushaltsstand zählt aber erst beim Abschluss.
 */
export function pgKontext(sql: Sql, haushaltId: string, imTx: boolean) {
  /** Mappentypen, Ansichten und Pakete (#741): für alle gleich, gültig bei gleichem Haushaltsstand `lesen`. */
  const gemerkt = <T>(schluessel: string, lade: () => Promise<T>): Promise<T> =>
    imTx ? lade() : lesespeicherFuer(sql, haushaltId).hole(schluessel, lade);
  const alleTypen = () =>
    gemerkt('typen', async () => (await sql`SELECT * FROM mappentypen WHERE haushalt_id = ${haushaltId} ORDER BY lower(name)`).map(alsTyp));
  // Dokumente immer mit ausdrücklichen Spalten, nie `d.*` (#367): sonst kommt der Volltext mit.
  const DOK = sql.unsafe(DOKUMENT_SPALTEN.map((c) => `d.${c}`).join(', '));
  const DOK_RUECK = sql.unsafe(DOKUMENT_SPALTEN.join(', '));
  // Mappen ebenso ohne `suchtext` (#615).
  const MAP = sql.unsafe(MAPPEN_SPALTEN.join(', '));
  const SUCHINDEX = sql.unsafe(SUCHINDEX_TEXT);
  // „Zuletzt geändert“ (#609): auf Millisekunden genau (wie in der API) und bei jedem Schreiben größer als vorher.
  const STAND_WEITER = sql.unsafe(
    "greatest(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', geaendert) + interval '1 millisecond')",
  );
  /**
   * Was sich die Teile über einen Aufruf hinaus merken: Suchkonfigurationen der Sprachen (s. u.) und wann zuletzt
   * Ereignisse und der Verlauf der Pakete aufgeräumt wurden (höchstens alle zehn Minuten).
   */
  const stand = {
    sprachenZwischen: null as { zeit: number; konfigs: Promise<string[]> } | null,
    ereignisseAufgeraeumt: 0,
    verlaufAufgeraeumt: 0,
  };
  /**
   * Suchkonfigurationen der Sprachen, die in der Ablage vorkommen (#400): Deutsch immer, dazu die der Dokumente.
   * Eine Minute gemerkt; neu, sobald eine Sprache gesetzt wird. Lockerer Indexlauf über (haushalt_id, sprache), dazu
   * die weiteren Sprachen mehrsprachiger Dokumente (#579, Teilindex – nur diese wenigen Zeilen).
   */
  const sprachKonfigs = () => {
    if (!stand.sprachenZwischen || Date.now() - stand.sprachenZwischen.zeit > 60_000) {
      stand.sprachenZwischen = {
        zeit: Date.now(),
        konfigs: sql`
        WITH RECURSIVE s AS (
          (SELECT sprache FROM dokumente WHERE haushalt_id = ${haushaltId} AND sprache IS NOT NULL ORDER BY sprache LIMIT 1)
          UNION ALL
          SELECT (SELECT d.sprache FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.sprache > s.sprache ORDER BY d.sprache LIMIT 1) FROM s WHERE s.sprache IS NOT NULL)
        SELECT sprache FROM s WHERE sprache IS NOT NULL
        UNION
        SELECT DISTINCT unnest(weitere_sprachen) FROM dokumente WHERE haushalt_id = ${haushaltId} AND weitere_sprachen IS NOT NULL`.then(
          (r) => [...new Set(['dms_german', ...r.map((z) => suchkonfig(z.sprache as string))])],
          () => ['dms_german'],
        ),
      };
    }
    return stand.sprachenZwischen.konfigs;
  };
  /**
   * Suchanfrage über alle Sprachen der Ablage (#400) als feste tsquery: Die Anfragen je Sprache rechnet PostgreSQL
   * vorab aus, gleiche fallen weg – sonst läse der Index bei häufigen Wörtern dieselben Listen mehrfach.
   */
  // Ergebnis in einem Objekt: Ein sql-Fragment ist „thenable“ – aus einer async-Funktion zurückgegeben, liefe es los.
  const tsAnfrage = async (t: string, v: Varianten): Promise<{ q: SqlTeil }> => {
    const konfigs = await sprachKonfigs();
    if (konfigs.length === 1) return { q: suchanfrage(sql, t, v, konfigs) };
    const [z] =
      await sql`SELECT ARRAY[${konfigs.map((k) => sql`${suchanfrage(sql, t, v, [k])}::text`).reduce((a, b) => sql`${a}, ${b}`)}] AS q`;
    return { q: [...new Set(z.q as string[])].map((q) => sql`${q}::tsquery`).reduce((a, b) => sql`(${a} || ${b})`) };
  };
  /** Schema von pg_trgm (#356), einmal nachgesehen; null ohne Erweiterung. */
  let trgmSchema: Promise<string | null> | null = null;
  const trigrammSchema = () =>
    (trgmSchema ??=
      sql`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'`.then(
        (r) => (r[0] ? `"${String(r[0].nspname).replace(/"/g, '""')}"` : null),
        () => null,
      ));
  const VERS = sql.unsafe(VERSION_SPALTEN);
  /** Nummer ziehen (#171) – nur innerhalb einer Transaktion; die Zeile bleibt bis zu deren Ende gesperrt. */
  async function zieheIn(tx: postgres.TransactionSql, schluessel: string, mappeId: string | null, jetzt: Date): Promise<string> {
    const [r] = await tx`SELECT * FROM nummernkreise WHERE haushalt_id = ${haushaltId} AND schluessel = ${schluessel} FOR UPDATE`;
    if (!r) throw new Error(`Nummernkreis ${schluessel} fehlt`);
    const z = ziehe(alsKreis(r), datumIn(jetzt), mappeId, jetzt.toISOString());
    await tx`UPDATE nummernkreise SET staende = ${tx.json(z.kreis.staende)}, zuletzt = ${tx.json(z.kreis.zuletzt as unknown as postgres.JSONValue)}
      WHERE haushalt_id = ${haushaltId} AND schluessel = ${schluessel}`;
    return z.nummer;
  }

  async function schreibeVerweise(tx: postgres.TransactionSql, quelleId: string, vs: Verweis[]) {
    await tx`DELETE FROM verweise WHERE quelle_id = ${quelleId}`;
    const gueltig = vs.filter((v) => istUuid(v.zielId));
    if (!gueltig.length) return;
    const zeilen = gueltig.map((v) => ({ quelle_id: quelleId, feld_key: v.feldKey, ziel_id: v.zielId, haushalt_id: haushaltId }));
    await tx`INSERT INTO verweise ${tx(zeilen)} ON CONFLICT DO NOTHING`;
  }

  return {
    sql,
    haushaltId,
    imTx,
    gemerkt,
    alleTypen,
    DOK,
    DOK_RUECK,
    MAP,
    SUCHINDEX,
    STAND_WEITER,
    sprachKonfigs,
    tsAnfrage,
    trigrammSchema,
    VERS,
    stand,
    zieheIn,
    schreibeVerweise,
  };
}

export type PgKontext = ReturnType<typeof pgKontext>;
