/** Texterkennung und Volltext (PostgreSQL): Aufträge, Ergebnis, Sprachen (#400, #579), Leerseiten. */
import type postgres from 'postgres';
import type { OcrStandArt } from '../../../../shared/src/model';
import { alsSeitensprachen } from '../../../../shared/src/seitensprachen';
import { SPRACHE_MARKE, SPRACHE_SQL_MUSTER } from '../../../../shared/src/textsprache';
import { beiVerklemmungWiederholen } from '../../db';
import { protokoll } from '../../protokoll';
import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { alsDokument, type Zeile } from './zeilen';

const log = protokoll.modul('texterkennung');
/** Sprachmarke im Hinweis der Texterkennung (#395) samt Konfidenz, zum Ersetzen (#400). */
const SPRACHE_INFO_SQL = ' · Sprache: [a-z_]{3,10}( \\(\\d{1,3} %\\))?';

/** Aufträge der Texterkennung: einreihen, holen, Ergebnis setzen, zählen. */
export function pgTexterkennung(k: PgKontext) {
  const { sql, haushaltId, DOK, DOK_RUECK, stand } = k;
  return {
    /* ---------- Texterkennung (#45) ---------- */
    async ocrEinreihen(ids) {
      const gueltig = ids.filter(istUuid);
      if (!gueltig.length) return;
      await sql`UPDATE dokumente SET ocr_stand = 'wartet', ocr_info = NULL WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[])`;
    },
    async ocrNaechster() {
      // SKIP LOCKED: mehrere Aufträge nehmen sich nie dasselbe Dokument.
      const [r] = await sql`
        UPDATE dokumente SET ocr_stand = 'laeuft', ocr_zeit = now()
        WHERE id = (SELECT id FROM dokumente WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'wartet' ORDER BY erstellt, id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING ${DOK_RUECK}`;
      return r ? alsDokument(r) : undefined;
    },
    async ocrSetze(id, e) {
      // Bricht PostgreSQL das Speichern wegen einer Verklemmung ab (#575), noch einmal versuchen – in einer eigenen
      // Transaktion bzw. innerhalb einer Transaktion in einem Sicherungspunkt, damit der Versuch wiederholbar ist.
      await beiVerklemmungWiederholen(
        () =>
          sql.begin(
            (tx) => tx`
        UPDATE dokumente SET ocr_stand = ${e.stand}, ocr_info = ${e.info ?? null}, ocr_seiten = ${e.seiten ?? null}, ocr_zeit = now()
          ${e.text !== undefined ? tx`, volltext = ${e.text}` : tx``}${e.sprache !== undefined ? tx`, sprache = ${e.sprache}` : tx``}
          ${e.text !== undefined || e.weitere !== undefined ? tx`, weitere_sprachen = ${e.weitere?.length ? e.weitere : null}` : tx``}
          ${e.text !== undefined || e.seitensprachen !== undefined ? tx`, seitensprachen = ${e.seitensprachen?.length ? tx.json(e.seitensprachen as unknown as postgres.JSONValue) : null}, teilen_hinweis_aus = NULL` : tx``}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`,
          ),
        {
          nochmal: (versuch, f) =>
            log.warn('Volltext speichern: Datenbank hat abgebrochen, neuer Versuch', {
              dokument: id,
              versuch,
              fehler: (f as Error).message,
            }),
        },
      );
      if (e.sprache || e.weitere?.length) stand.sprachenZwischen = null;
    },
    async ocrVonSha(sha256, ausser) {
      const [r] = await sql`
        SELECT volltext, ocr_seiten, ocr_info, sprache, weitere_sprachen, seitensprachen FROM dokumente
        WHERE haushalt_id = ${haushaltId} AND sha256 = ${sha256} AND id IS DISTINCT FROM ${istUuid(ausser) ? ausser : null}::uuid AND ocr_stand = 'fertig' AND volltext IS NOT NULL
        LIMIT 1`;
      return r
        ? {
            text: r.volltext as string,
            seiten: (r.ocr_seiten as number | null) ?? null,
            info: (r.ocr_info as string | null) ?? null,
            sprache: (r.sprache as string | null) ?? null,
            weitere: (r.weitere_sprachen as string[] | null) ?? null,
            seitensprachen: alsSeitensprachen(r.seitensprachen),
          }
        : undefined;
    },
    async ocrZurueckstellen() {
      const r = await sql`UPDATE dokumente SET ocr_stand = 'wartet' WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'laeuft'`;
      return r.count;
    },
    async ocrZaehler() {
      const z = { keiner: 0, wartet: 0, laeuft: 0, fertig: 0, fehler: 0, ausgelassen: 0, paket: 0 };
      for (const r of await sql`SELECT coalesce(ocr_stand, 'keiner') AS s, count(*)::int AS n FROM dokumente WHERE haushalt_id = ${haushaltId} GROUP BY 1`) {
        z[r.s as OcrStandArt] = r.n as number;
      }
      return z;
    },
    async ocrAuftraege({ stand, von, anzahl }) {
      const bed = stand === 'keiner' ? sql`coalesce(d.ocr_stand, 'keiner') = 'keiner'` : sql`d.ocr_stand = ${stand}`;
      const [{ n }] =
        await sql`SELECT count(*)::int AS n FROM dokumente d JOIN mappen m ON m.id = d.mappe_id WHERE d.haushalt_id = ${haushaltId} AND ${bed}`;
      const r = await sql`
        SELECT ${DOK}, m.titel AS mappe_titel, m.typ_id AS mappe_typ FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE d.haushalt_id = ${haushaltId} AND ${bed}
        ORDER BY coalesce(d.ocr_zeit, d.erstellt) DESC, d.id LIMIT ${anzahl} OFFSET ${von}`;
      return {
        gesamt: n as number,
        eintraege: r.map((x) => ({ dokument: alsDokument(x), mappeTitel: (x.mappe_titel as string) ?? '', typId: x.mappe_typ as string })),
      };
    },
    async ocrOhneVolltext() {
      return (
        await sql`
        SELECT d.id, m.typ_id, d.register_key FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE d.haushalt_id = ${haushaltId} AND coalesce(d.ocr_stand, 'keiner') = 'keiner'`
      ).map((r: Zeile) => ({ id: r.id as string, typId: r.typ_id as string, registerKey: r.register_key as string }));
    },
  } satisfies RepoTeil;
}

/** Sprache, Seitensprachen und Leerseiten eines Dokuments; Volltext lesen. */
export function pgVolltext(k: PgKontext) {
  const { sql, haushaltId, stand } = k;
  return {
    async setzeDokumentSprache(id, sprache, weitere) {
      if (!istUuid(id)) return false;
      // Der Hinweis der Texterkennung nennt danach dieselbe Sprache (ältere Dokumente lesen sie nur von dort).
      // Weitere Sprachen (#579): ohne Angabe bleiben sie (ohne die neue Hauptsprache); mit Angabe gelten sie fürs
      // ganze Dokument, die Seitensprachen entfallen.
      const r = await sql`UPDATE dokumente SET sprache = ${sprache},
          ocr_info = CASE WHEN ocr_info IS NULL THEN NULL ELSE regexp_replace(ocr_info, ${SPRACHE_INFO_SQL}, '') || coalesce(${SPRACHE_MARKE} || ${sprache}::text, '') END,
          ${
            weitere !== undefined
              ? sql`weitere_sprachen = ${weitere.length ? weitere : null}, seitensprachen = NULL, teilen_hinweis_aus = NULL`
              : sql`weitere_sprachen = nullif(array_remove(weitere_sprachen, ${sprache}::text), '{}')`
          }
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      if (r.count) stand.sprachenZwischen = null;
      return r.count > 0;
    },
    async seitensprachen(id) {
      if (!istUuid(id)) return null;
      const [r] = await sql`SELECT seitensprachen FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsSeitensprachen(r.seitensprachen) : null;
    },
    async teilenHinweisAus(id) {
      if (!istUuid(id)) return false;
      const r = await sql`UPDATE dokumente SET teilen_hinweis_aus = true WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r.count > 0;
    },
    async setzeLeerseiten(id, l) {
      if (!istUuid(id)) return false;
      // Nur, solange die Datei dieselbe ist (#997): Eine neue Fassung dazwischen setzt die Markierung zurück.
      const r = l
        ? await sql`UPDATE dokumente SET leerseiten = ${sql.json(l as unknown as postgres.JSONValue)} WHERE haushalt_id = ${haushaltId} AND id = ${id} AND sha256 = ${l.sha256}`
        : await sql`UPDATE dokumente SET leerseiten = NULL WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r.count > 0;
    },
    async volltextKandidaten(umfang) {
      const ohne = umfang === 'ohne' ? sql`AND coalesce(btrim(d.volltext), '') = ''` : sql``;
      return (
        await sql`
        SELECT d.id, m.typ_id, d.register_key FROM dokumente d JOIN mappen m ON m.id = d.mappe_id
        WHERE d.haushalt_id = ${haushaltId} AND coalesce(d.ocr_stand, 'keiner') NOT IN ('wartet', 'laeuft') ${ohne}
        ORDER BY d.erstellt, d.id`
      ).map((r: Zeile) => ({ id: r.id as string, typId: r.typ_id as string, registerKey: r.register_key as string }));
    },
    async volltextHerkunft() {
      const [r] = await sql`
        SELECT count(*) FILTER (WHERE leer)::int AS ohne,
          count(*) FILTER (WHERE NOT leer AND (i LIKE 'Texterkennung durch Paket %' OR i LIKE 'Volltext durch Paket %'))::int AS paket,
          count(*) FILTER (WHERE NOT leer AND i LIKE 'Textebene des PDFs%')::int AS pdf,
          count(*) FILTER (WHERE NOT leer AND i LIKE 'Volltext über die API%')::int AS api,
          count(*) FILTER (WHERE NOT leer AND i NOT LIKE 'Texterkennung durch Paket %' AND i NOT LIKE 'Volltext durch Paket %' AND i NOT LIKE 'Textebene des PDFs%' AND i NOT LIKE 'Volltext über die API%' AND i LIKE '%Texterkennung%')::int AS eingebaut,
          count(*) FILTER (WHERE NOT leer AND i NOT LIKE 'Texterkennung durch Paket %' AND i NOT LIKE 'Volltext durch Paket %' AND i NOT LIKE 'Textebene des PDFs%' AND i NOT LIKE 'Volltext über die API%' AND i NOT LIKE '%Texterkennung%')::int AS sonst
        FROM (SELECT coalesce(btrim(volltext), '') = '' AS leer, regexp_replace(coalesce(ocr_info, ''), '^übernommen \\(gleicher Inhalt\\): ', '') AS i
          FROM dokumente WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'fertig') x`;
      return {
        pdf: r.pdf as number,
        paket: r.paket as number,
        api: r.api as number,
        eingebaut: r.eingebaut as number,
        sonst: r.sonst as number,
        ohneText: r.ohne as number,
      };
    },
    async ocrSprachen() {
      const z: Record<string, number> = {};
      for (const r of await sql`
        SELECT substring(ocr_info from ${SPRACHE_SQL_MUSTER}::text) AS s, count(*)::int AS n FROM dokumente
        WHERE haushalt_id = ${haushaltId} AND ocr_stand = 'fertig' AND ocr_info LIKE '%· Sprache: %' GROUP BY 1`) {
        if (r.s) z[r.s as string] = r.n as number;
      }
      return z;
    },
    async mitVolltext() {
      const [r] =
        await sql`SELECT count(*)::int AS n FROM dokumente WHERE haushalt_id = ${haushaltId} AND volltext IS NOT NULL AND volltext <> ''`;
      return r.n as number;
    },
    async volltext(id) {
      if (!istUuid(id)) return null;
      const [r] = await sql`SELECT volltext FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? ((r.volltext as string | null) ?? null) : null;
    },
    async volltexte(ids) {
      const r = new Map<string, string>();
      const gueltig = [...new Set(ids.filter(istUuid))];
      if (!gueltig.length) return r;
      for (const z of await sql`SELECT id, volltext FROM dokumente WHERE haushalt_id = ${haushaltId} AND id = ANY(${gueltig}::uuid[]) AND volltext IS NOT NULL`)
        r.set(z.id as string, z.volltext as string);
      return r;
    },
  } satisfies RepoTeil;
}
