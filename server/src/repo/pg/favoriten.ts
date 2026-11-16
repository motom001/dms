import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { ohneWarten } from './sql';

/** Favoriten und Abos (#62, #422), Zählerstand (#625), „gesehen“. */
export function pgFavoriten(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async setzeFavorit(benutzerId, mappeId, an) {
      if (!istUuid(benutzerId) || !istUuid(mappeId)) return;
      if (an)
        await sql`INSERT INTO favoriten (benutzer_id, mappe_id, haushalt_id) VALUES (${benutzerId}, ${mappeId}, ${haushaltId}) ON CONFLICT DO NOTHING`;
      else await sql`DELETE FROM favoriten WHERE benutzer_id = ${benutzerId} AND mappe_id = ${mappeId}`;
    },
    async alleFavoriten() {
      return (await sql`SELECT benutzer_id, mappe_id FROM favoriten WHERE haushalt_id = ${haushaltId} ORDER BY benutzer_id, mappe_id`).map(
        (r) => ({ benutzerId: r.benutzer_id as string, mappeId: r.mappe_id as string }),
      );
    },
    async favoritenDerMappe(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT benutzer_id, benachrichtigen FROM favoriten WHERE mappe_id = ${mappeId}`).map((r) => ({
        benutzerId: r.benutzer_id as string,
        benachrichtigen: r.benachrichtigen !== false,
      }));
    },
    async setzeFavoritBenachrichtigen(benutzerId, mappeId, an) {
      if (!istUuid(benutzerId) || !istUuid(mappeId)) return;
      await sql`UPDATE favoriten SET benachrichtigen = ${an ? null : false} WHERE benutzer_id = ${benutzerId} AND mappe_id = ${mappeId}`;
    },
    async stummeFavoriten(benutzerId, mappeIds) {
      const ids = mappeIds.filter(istUuid);
      if (!istUuid(benutzerId) || !ids.length) return new Set();
      return new Set(
        (
          await sql`SELECT mappe_id FROM favoriten WHERE benutzer_id = ${benutzerId} AND mappe_id = ANY(${ids}::uuid[]) AND benachrichtigen = false`
        ).map((r) => r.mappe_id as string),
      );
    },
    async zaehlerstand(benutzerId) {
      if (!istUuid(benutzerId)) return undefined;
      const [r] = await sql`SELECT stand, abdruck, geaendert FROM zaehlerstaende WHERE benutzer_id = ${benutzerId}`;
      return r ? { stand: Number(r.stand), abdruck: r.abdruck as string, geaendert: (r.geaendert as Date).toISOString() } : undefined;
    },
    async setzeZaehlerstand(benutzerId, abdruck) {
      // Ein Befehl: gleichzeitige Abrufe zählen je echter Änderung höchstens einmal hoch (Zeilensperre im UPSERT).
      const [r] =
        await sql`INSERT INTO zaehlerstaende (benutzer_id, haushalt_id, stand, abdruck) VALUES (${benutzerId}, ${haushaltId}, 1, ${abdruck})
        ON CONFLICT (benutzer_id) DO UPDATE SET stand = zaehlerstaende.stand + 1, abdruck = EXCLUDED.abdruck, geaendert = now()
          WHERE zaehlerstaende.abdruck IS DISTINCT FROM EXCLUDED.abdruck
        RETURNING stand, abdruck, geaendert`;
      if (r) return { stand: Number(r.stand), abdruck: r.abdruck as string, geaendert: (r.geaendert as Date).toISOString() };
      const [d] = await sql`SELECT stand, abdruck, geaendert FROM zaehlerstaende WHERE benutzer_id = ${benutzerId}`;
      return { stand: Number(d.stand), abdruck: d.abdruck as string, geaendert: (d.geaendert as Date).toISOString() };
    },
    async merkeGesehen(benutzerId, mappeIds) {
      const ids = [...new Set(mappeIds.filter(istUuid))];
      if (!istUuid(benutzerId) || !ids.length) return;
      // Ein Merkposten (Hervorhebung „geändert“, #422): ohne Warten auf die Platte (#615, wie „Zuletzt geöffnet“).
      await sql`INSERT INTO gesehen (benutzer_id, mappe_id, haushalt_id)
        SELECT ${benutzerId}::uuid, m.id, m.haushalt_id FROM mappen m, ${ohneWarten(sql)} WHERE m.haushalt_id = ${haushaltId} AND m.id = ANY(${ids}::uuid[])
        ON CONFLICT (benutzer_id, mappe_id) DO UPDATE SET zeit = now()`;
    },
    async geaendertVonAnderen(benutzerId, mappeIds, arten) {
      const ids = [...new Set(mappeIds.filter(istUuid))];
      if (!istUuid(benutzerId) || !ids.length) return new Set();
      // Nur die Mappen dieser Seite: Favorit oder selbst angelegt; je Mappe ein Blick in den Index historie (mappe_id, zeit).
      return new Set(
        (
          await sql`
        WITH k AS (
          SELECT m.id, GREATEST(g.zeit, f.erstellt, m.erstellt) AS seit
          FROM mappen m
          LEFT JOIN favoriten f ON f.mappe_id = m.id AND f.benutzer_id = ${benutzerId}
          LEFT JOIN gesehen g ON g.mappe_id = m.id AND g.benutzer_id = ${benutzerId}
          WHERE m.haushalt_id = ${haushaltId} AND m.id = ANY(${ids}::uuid[]) AND (f.mappe_id IS NOT NULL OR m.erstellt_von = ${benutzerId})
        )
        SELECT k.id FROM k WHERE EXISTS (
          SELECT 1 FROM historie h WHERE h.mappe_id = k.id AND h.zeit > k.seit AND h.benutzer_id IS NOT NULL AND h.benutzer_id <> ${benutzerId}
            AND h.art = ANY(${[...arten]}::text[]) AND coalesce(h.daten->>'aufgabenart', '') <> 'aenderung')`
        ).map((r) => r.id as string),
      );
    },
    async favoritenVon(benutzerId, mappeIds) {
      const ids = mappeIds.filter(istUuid);
      if (!istUuid(benutzerId) || !ids.length) return new Set();
      return new Set(
        (await sql`SELECT mappe_id FROM favoriten WHERE benutzer_id = ${benutzerId} AND mappe_id = ANY(${ids}::uuid[])`).map(
          (r) => r.mappe_id as string,
        ),
      );
    },
  } satisfies RepoTeil;
}
