import type { RepoTeil } from '..';
import type { PgKontext } from './kontext';
import type { Zeile } from './zeilen';

/** Beispieldaten (Demo): zählen, Verweise darauf, löschen. */
export function pgDemo(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async zaehleDemo() {
      const r = await sql`SELECT typ_id, count(*)::int AS n FROM mappen WHERE haushalt_id = ${haushaltId} AND demo GROUP BY typ_id`;
      return new Map(r.map((z) => [z.typ_id as string, z.n as number]));
    },
    async echteVerweiseAufDemo() {
      const [r] = await sql`
        SELECT count(DISTINCT q.id)::int AS n FROM verweise v
        JOIN mappen q ON q.id = v.quelle_id JOIN mappen z ON z.id = v.ziel_id
        WHERE z.demo AND NOT q.demo AND z.haushalt_id = ${haushaltId}`;
      return r.n as number;
    },
    async loescheDemo(max) {
      return sql.begin(async (tx) => {
        const grenze = max && Number.isFinite(max) ? Math.max(1, Math.floor(max)) : null;
        const ids = (
          grenze
            ? await tx`SELECT id FROM mappen WHERE demo AND haushalt_id = ${haushaltId} LIMIT ${grenze}`
            : await tx`SELECT id FROM mappen WHERE demo AND haushalt_id = ${haushaltId}`
        ).map((z) => z.id as string);
        const dateien = ids.length
          ? (
              await tx`
          SELECT DISTINCT sha256 FROM dokumente WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${ids}::uuid[])`
            ).map((z) => z.sha256 as string)
          : [];
        let anzahl = 0;
        if (ids.length) {
          // Demo-Mappen verweisen aufeinander. Erst die Verweise entfernen (auch die auf dieses Paket),
          // sonst greift der Fremdschlüssel auf ziel_id vor der Kaskade.
          await tx`DELETE FROM verweise WHERE haushalt_id = ${haushaltId} AND (quelle_id = ANY(${ids}::uuid[]) OR ziel_id = ANY(${ids}::uuid[]))`;
          anzahl = (await tx`DELETE FROM mappen WHERE haushalt_id = ${haushaltId} AND id = ANY(${ids}::uuid[])`).count;
        }
        // Demo-Mappen im Papierkorb gehen mit (#43) – im letzten Paket.
        if (!grenze || ids.length < grenze) {
          const korb =
            await tx`DELETE FROM papierkorb WHERE haushalt_id = ${haushaltId} AND (mappe ->> 'demo')::boolean RETURNING dokumente`;
          for (const z of korb) for (const d of z.dokumente as Zeile[]) dateien.push(d.sha256 as string);
          anzahl += korb.count;
        }
        return { anzahl, dateien: [...new Set(dateien)] };
      });
    },
  } satisfies RepoTeil;
}
