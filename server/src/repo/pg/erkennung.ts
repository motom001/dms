import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { realArray, type Zeile } from './zeilen';

/** Vektoren der Dokumente und Ergebnisse der Erkennung (#336). */
export function pgErkennung(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    /* ---------- Vektoren (#442) ---------- */
    async vektorSetze(e) {
      if (!istUuid(e.dokumentId)) return false;
      const r = await sql`INSERT INTO vektoren (dokument_id, haushalt_id, paket, modell, vektor)
        SELECT d.id, d.haushalt_id, ${e.paket}, ${e.modell}, ${Array.from(e.vektor)}::real[] FROM dokumente d WHERE d.haushalt_id = ${haushaltId} AND d.id = ${e.dokumentId}
        ON CONFLICT (dokument_id, modell) DO UPDATE SET paket = EXCLUDED.paket, vektor = EXCLUDED.vektor, zeit = now()`;
      return r.count > 0;
    },
    async vektorLoesche(dokumentId, modell) {
      if (!istUuid(dokumentId)) return 0;
      const r =
        modell === undefined
          ? await sql`DELETE FROM vektoren WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId}`
          : await sql`DELETE FROM vektoren WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} AND modell = ${modell}`;
      return r.count;
    },
    async vektorenLoeschePaket(paket, ausser) {
      const r =
        ausser === undefined
          ? await sql`DELETE FROM vektoren WHERE haushalt_id = ${haushaltId} AND paket = ${paket}`
          : await sql`DELETE FROM vektoren WHERE haushalt_id = ${haushaltId} AND paket = ${paket} AND modell <> ${ausser}`;
      return r.count;
    },
    async vektorenLaden(modell, jeTeil) {
      // Binär (array_send) statt als Text (dreimal schneller) und in Teilen über einen Cursor (wenig Speicher auf einmal).
      await sql`SELECT v.dokument_id, d.mappe_id, array_send(v.vektor) AS b FROM vektoren v JOIN dokumente d ON d.id = v.dokument_id
        WHERE v.haushalt_id = ${haushaltId} AND v.modell = ${modell}`.cursor(2000, (r: Zeile[]) => {
        jeTeil(r.map((z) => ({ dokumentId: z.dokument_id as string, mappeId: z.mappe_id as string, vektor: realArray(z.b as Buffer) })));
      });
    },
    async vektorVon(dokumentId, modell) {
      if (!istUuid(dokumentId)) return null;
      const [r] =
        await sql`SELECT vektor::text AS v FROM vektoren WHERE haushalt_id = ${haushaltId} AND dokument_id = ${dokumentId} AND modell = ${modell}`;
      return r ? Float32Array.from((r.v as string).slice(1, -1).split(','), Number) : null;
    },
    async vektorStand() {
      return (
        await sql`SELECT paket, modell, count(*)::int AS n FROM vektoren WHERE haushalt_id = ${haushaltId} GROUP BY 1, 2 ORDER BY 1, 2`
      ).map((r: Zeile) => ({ paket: r.paket as string, modell: r.modell as string, anzahl: r.n as number }));
    },
    async ohneVektor(modell, max, nach) {
      const ab = nach && istUuid(nach) ? nach : '00000000-0000-0000-0000-000000000000';
      return (
        await sql`SELECT d.id, d.mappe_id FROM dokumente d
        WHERE d.haushalt_id = ${haushaltId} AND d.id > ${ab}::uuid AND d.volltext IS NOT NULL AND d.volltext <> ''
          AND NOT EXISTS (SELECT 1 FROM vektoren v WHERE v.dokument_id = d.id AND v.modell = ${modell})
        ORDER BY d.id LIMIT ${max}`
      ).map((r: Zeile) => ({ id: r.id as string, mappeId: r.mappe_id as string }));
    },
    async erkennungLies(mappeId) {
      if (!istUuid(mappeId)) return undefined;
      const [r] = await sql`SELECT ergebnis, zeit FROM erkennungen WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId}`;
      return r ? { ergebnis: r.ergebnis, zeit: (r.zeit as Date).toISOString() } : undefined;
    },
    async erkennungSchreibe(mappeId, ergebnis, absenderId) {
      if (!istUuid(mappeId)) return;
      await sql`INSERT INTO erkennungen (mappe_id, haushalt_id, absender_id, ergebnis)
        SELECT m.id, m.haushalt_id, ${absenderId && istUuid(absenderId) ? absenderId : null}::uuid, ${json(sql, ergebnis)} FROM mappen m WHERE m.haushalt_id = ${haushaltId} AND m.id = ${mappeId}
        ON CONFLICT (mappe_id) DO UPDATE SET absender_id = EXCLUDED.absender_id, ergebnis = EXCLUDED.ergebnis, zeit = now()`;
    },
    async erkennungenMitAbsender(absenderId, max) {
      if (!istUuid(absenderId)) return [];
      return (
        await sql`SELECT mappe_id FROM erkennungen WHERE haushalt_id = ${haushaltId} AND absender_id = ${absenderId} ORDER BY zeit DESC LIMIT ${max}`
      ).map((r) => r.mappe_id as string);
    },
  } satisfies RepoTeil;
}
