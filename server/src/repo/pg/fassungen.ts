import type { RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { alsFassung } from './zeilen';

/** Fassungen (#1006): anlegen, fortschreiben, Löschvermerk, lesen. */
export function pgFassungen(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    /* ---------- Fassungen (#1006) ---------- */
    async fassungen(art, eintrag, max) {
      return (
        await sql`SELECT * FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag}
        ORDER BY nr DESC ${max !== undefined ? sql`LIMIT ${max}` : sql``}`
      ).map(alsFassung);
    },
    async zaehleFassungen(art, eintrag) {
      return Number(
        (await sql`SELECT count(*)::int AS n FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag}`)[0]
          .n,
      );
    },
    async fassung(art, eintrag, nr) {
      const [r] =
        await sql`SELECT * FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr = ${nr}`;
      return r ? alsFassung(r) : undefined;
    },
    async letzteFassungen(art) {
      const rows =
        await sql`SELECT DISTINCT ON (eintrag) * FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} ORDER BY eintrag, nr DESC`;
      return new Map(rows.map((r) => [r.eintrag as string, alsFassung(r)] as const));
    },
    async legeFassungAn(f) {
      await sql`INSERT INTO fassungen (haushalt_id, art, eintrag, nr, name, daten, urheber, vorgang, wiederhergestellt, zeit, bis, geloescht)
        VALUES (${haushaltId}, ${f.art}, ${f.eintrag}, ${f.nr}, ${f.name}, ${json(sql, f.daten)}, ${json(sql, f.urheber)}, ${f.vorgang}, ${f.wiederhergestellt},
          ${f.zeit}, ${f.bis}, ${f.geloescht ? json(sql, f.geloescht) : null})`;
    },
    async schreibeFassungFort(art, eintrag, nr, d) {
      await sql`UPDATE fassungen SET name = ${d.name}, daten = ${json(sql, d.daten)}, bis = ${d.bis}
        WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr = ${nr}`;
    },
    async loescheFassung(art, eintrag, nr) {
      await sql`DELETE FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr = ${nr}`;
    },
    async vermerkeLoeschung(art, eintrag, vermerk) {
      const [r] =
        await sql`SELECT max(nr) AS nr FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag}`;
      if (r?.nr == null) return;
      await sql`DELETE FROM fassungen WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr < ${r.nr}`;
      await sql`UPDATE fassungen SET geloescht = ${json(sql, vermerk)} WHERE haushalt_id = ${haushaltId} AND art = ${art} AND eintrag = ${eintrag} AND nr = ${r.nr}`;
    },
    async geloeschteFassungen(arten) {
      return (
        await sql`SELECT * FROM fassungen WHERE haushalt_id = ${haushaltId} AND geloescht IS NOT NULL AND art = ANY(${[...arten] as string[]}::text[])
        ORDER BY geloescht->>'zeit' DESC, art, eintrag`
      ).map(alsFassung);
    },
    async alleFassungen() {
      return (await sql`SELECT * FROM fassungen WHERE haushalt_id = ${haushaltId} ORDER BY art, eintrag, nr`).map(alsFassung);
    },
  } satisfies RepoTeil;
}
