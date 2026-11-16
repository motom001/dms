/** Fragen an die Ablage, Wörterbuch für ähnliche Schreibweisen (#356) und Synonyme (PostgreSQL). */
import { AEHNLICH_AB, falte, TIPPFEHLER_MIN } from '../../../../shared/src/suche';
import { istUuid, KonfigurationVeraltet, type RepoTeil, WOERTER_JE_LAUF } from '..';
import type { PgKontext } from './kontext';
import { MAPPEN_SPALTEN } from './spalten';
import { lesefilterSql } from './sql';
import { alsMappe, iso } from './zeilen';

/** Fundstellen für Fragen; Wörterbuch für ähnliche Schreibweisen. */
export function pgWoerter(k: PgKontext) {
  const { sql, haushaltId, SUCHINDEX, sprachKonfigs, trigrammSchema } = k;
  return {
    async fragenFundstellen(o) {
      const woerter = o.woerter.filter((w) => /^[\p{L}\p{N}]{2,40}$/u.test(w)).slice(0, 12);
      if (!woerter.length) return { dokumente: [], mappen: [] };
      const lesen = o.lesen ? sql`AND ${lesefilterSql(sql, o.lesen)}` : sql``;
      // Ein Wort genügt (ODER); Füllwörter entfernt die deutsche Konfiguration. Erst die besten Dokumente, dann
      // nur für sie die Ausschnitte (ts_headline ist teuer).
      const q = woerter.join(' | ');
      // Je Sprache der Ablage (#400) die Wortstämme dieser Sprache.
      const anfrage = (await sprachKonfigs())
        .map((k) => sql`to_tsquery(${k}::regconfig, dms_falte(${q}::text))`)
        .reduce((x, y) => sql`(${x} || ${y})`);
      const dokumente =
        o.dokumente < 1
          ? []
          : await sql`
        WITH beste AS (
          SELECT d.id, d.mappe_id, d.name, ts_rank_cd(${SUCHINDEX}, x.q) AS rang
          FROM dokumente d JOIN mappen ON mappen.id = d.mappe_id AND mappen.haushalt_id = ${haushaltId} CROSS JOIN LATERAL (SELECT ${anfrage} AS q) x
          WHERE d.haushalt_id = ${haushaltId} AND ${SUCHINDEX} @@ x.q ${lesen}
          ORDER BY rang DESC, d.id LIMIT ${o.dokumente})
        SELECT b.id, b.mappe_id, b.name, b.rang, dms_ausschnitt(d.sprache, d.weitere_sprachen, d.volltext, ${anfrage},
          'MaxFragments=3, MaxWords=40, MinWords=15, ShortWord=2, StartSel="", StopSel="", FragmentDelimiter=" … "') AS text
        FROM beste b JOIN dokumente d ON d.id = b.id ORDER BY b.rang DESC, b.id`;
      const muster = woerter.map((w) => `%${w}%`);
      const mappen =
        o.mappen < 1
          ? []
          : await sql`
        SELECT * FROM (
          SELECT ${sql.unsafe(MAPPEN_SPALTEN.map((x) => `mappen.${x}`).join(', '))}, (SELECT count(*) FROM unnest(${muster}::text[]) w
            WHERE mappen.titel ILIKE w OR EXISTS (SELECT 1 FROM jsonb_each_text(mappen.werte) e WHERE e.value ILIKE w AND e.value NOT LIKE 'dms1$%')) AS punkte
          FROM mappen WHERE haushalt_id = ${haushaltId} ${lesen}) x
        WHERE punkte > 0 ORDER BY punkte DESC, geaendert DESC, id LIMIT ${o.mappen}`;
      return {
        dokumente: dokumente.map((z) => ({
          id: z.id as string,
          mappeId: z.mappe_id as string,
          name: z.name as string,
          text: String(z.text ?? ''),
        })),
        mappen: mappen.map(alsMappe),
      };
    },
    /* ---------- Unscharfe Suche (#356) ---------- */
    async aehnlicheWoerter(woerter, max) {
      const r: Record<string, string[]> = {};
      const liste = [...new Set(woerter.map(falte).filter((w) => w.length >= TIPPFEHLER_MIN && w.length <= 40))];
      if (!liste.length) return r;
      // pg_trgm kann fehlen (keine Rechte) oder in einem anderen Schema liegen: Funktion und Operator mit Schema.
      const trgm = await trigrammSchema();
      if (!trgm) return r;
      const aehnl = sql.unsafe(`${trgm}.similarity`);
      const op = sql.unsafe(`OPERATOR(${trgm}.%)`);
      for (const w of liste) {
        const z = await sql`
          SELECT wort FROM suchwoerter
          WHERE haushalt_id = ${haushaltId} AND wort ${op} ${w}::text AND wort <> ${w} AND ${aehnl}(wort, ${w}::text) >= ${AEHNLICH_AB}
          ORDER BY ${aehnl}(wort, ${w}::text) DESC, anzahl DESC, wort LIMIT ${max}`;
        if (z.length) r[w] = z.map((x) => x.wort as string);
      }
      return r;
    },
    async woerterAnzahl() {
      const [r] = await sql`SELECT count(*)::int AS n FROM suchwoerter WHERE haushalt_id = ${haushaltId}`;
      return r.n as number;
    },
    async woerterNeu() {
      const [r] = await sql`SELECT dms_woerter_neu(${haushaltId}::uuid) AS n`;
      return Number(r.n);
    },
    async woerterEinarbeiten(grenze = WOERTER_JE_LAUF) {
      const [r] = await sql`SELECT dms_woerter_einarbeiten(${grenze}::int) AS n`;
      return Number(r.n);
    },
  } satisfies RepoTeil;
}

/** Synonyme: Gruppen gleichbedeutender Wörter. */
export function pgSynonyme(k: PgKontext) {
  const { sql, haushaltId, STAND_WEITER } = k;
  return {
    async synonyme() {
      return (
        await sql`SELECT id, woerter, quelle, geaendert FROM synonyme WHERE haushalt_id = ${haushaltId} ORDER BY quelle <> 'werkbank', quelle, erstellt, id`
      ).map((z) => ({ id: z.id as string, woerter: z.woerter as string[], quelle: z.quelle as string, geaendert: iso(z.geaendert) }));
    },
    async legeSynonymAn(g) {
      await sql`INSERT INTO synonyme (id, haushalt_id, woerter, quelle) VALUES (${g.id}, ${haushaltId}, ${g.woerter}::text[], ${g.quelle})`;
    },
    async aendereSynonym(id, woerter, erwartet) {
      if (!istUuid(id)) return false;
      return sql.begin(async (tx) => {
        // Gleichzeitig bearbeitet (#917, #992): nur auf dem Stand, auf dem die Bearbeitung beruht.
        if (erwartet !== undefined) {
          const [a] =
            await tx`SELECT geaendert FROM synonyme WHERE haushalt_id = ${haushaltId} AND id = ${id} AND quelle = 'werkbank' FOR UPDATE`;
          if (a && iso(a.geaendert) !== erwartet) throw new KonfigurationVeraltet();
        }
        return (
          (
            await tx`UPDATE synonyme SET woerter = ${woerter}::text[], geaendert = ${STAND_WEITER} WHERE haushalt_id = ${haushaltId} AND id = ${id} AND quelle = 'werkbank'`
          ).count > 0
        );
      });
    },
    async loescheSynonym(id) {
      if (!istUuid(id)) return false;
      return (await sql`DELETE FROM synonyme WHERE haushalt_id = ${haushaltId} AND id = ${id} AND quelle = 'werkbank'`).count > 0;
    },
    async setzeSynonyme(quelle, gruppen) {
      await sql.begin(async (tx) => {
        await tx`DELETE FROM synonyme WHERE haushalt_id = ${haushaltId} AND quelle = ${quelle}`;
        for (const g of gruppen)
          await tx`INSERT INTO synonyme (id, haushalt_id, woerter, quelle) VALUES (gen_random_uuid(), ${haushaltId}, ${g}::text[], ${quelle})`;
      });
    },
  } satisfies RepoTeil;
}
