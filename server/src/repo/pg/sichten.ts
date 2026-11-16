import type { SichtDaten } from '../../../../shared/src/sichten';
import { KonfigurationVeraltet, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { alsSicht, iso } from './zeilen';

/** Ansichten (#38): anlegen, ändern, verschieben, löschen. */
export function pgSichten(k: PgKontext) {
  const { sql, haushaltId, gemerkt, STAND_WEITER } = k;
  return {
    async listeSichten() {
      return gemerkt('sichten', async () =>
        (await sql`SELECT * FROM sichten WHERE haushalt_id = ${haushaltId} ORDER BY position, lower(name)`).map(alsSicht),
      );
    },
    async legeSichtAn(id, d: SichtDaten) {
      const [r] = await sql`
        INSERT INTO sichten (id, haushalt_id, name, beschreibung, eltern_id, position, typen, bedingungen, trefferliste, berechtigungen, symbol, beschriftungen)
        VALUES (${id}, ${haushaltId}, ${d.name}, ${d.beschreibung}, ${d.elternId}, ${d.position}, ${json(sql, d.typen)}, ${json(sql, d.bedingungen)}, ${d.trefferliste ?? null}, ${d.berechtigungen ? json(sql, d.berechtigungen) : null}, ${d.symbol ?? null}, ${d.beschriftungen ? json(sql, d.beschriftungen) : null})
        RETURNING *`;
      return alsSicht(r);
    },
    async aendereSicht(id, d: SichtDaten, erwartet) {
      const schreibe = async (q: typeof sql) => {
        const [r] = await q`
          UPDATE sichten SET name = ${d.name}, beschreibung = ${d.beschreibung}, eltern_id = ${d.elternId}, position = ${d.position},
            typen = ${json(sql, d.typen)}, bedingungen = ${json(sql, d.bedingungen)}, trefferliste = ${d.trefferliste ?? null},
            berechtigungen = ${d.berechtigungen ? json(sql, d.berechtigungen) : null}, symbol = ${d.symbol ?? null}, beschriftungen = ${d.beschriftungen ? json(sql, d.beschriftungen) : null}, geaendert = ${STAND_WEITER}
          WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
        return alsSicht(r);
      };
      if (erwartet === undefined) return schreibe(sql);
      // Gleichzeitig bearbeitet (#917): nur auf dem Stand, auf dem die Bearbeitung beruht.
      return sql.begin(async (tx) => {
        const [a] = await tx`SELECT geaendert FROM sichten WHERE haushalt_id = ${haushaltId} AND id = ${id} FOR UPDATE`;
        if (a && iso(a.geaendert) !== erwartet) throw new KonfigurationVeraltet();
        return schreibe(tx as unknown as typeof sql);
      });
    },
    async setzeSichtOrt(id, elternId, position) {
      // Nur der Wechsel der Elternsicht ist eine Änderung der Ansicht (#917); Umnummerieren lässt den Stand.
      await sql`
        UPDATE sichten SET geaendert = CASE WHEN eltern_id IS DISTINCT FROM ${elternId}::uuid THEN ${STAND_WEITER} ELSE geaendert END,
          eltern_id = ${elternId}, position = ${position}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loescheSicht(id) {
      await sql`DELETE FROM sichten WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
  } satisfies RepoTeil;
}
