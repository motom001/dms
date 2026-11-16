import { ohneTitel } from '../../../../shared/src/markdown';
import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { alsNotiz, iso } from './zeilen';

/** Notizen an Mappen (#55) und Erwähnungen (#1293). */
export function pgNotizen(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async notizen(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (await sql`SELECT * FROM notizen WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY erstellt, id`).map(
        alsNotiz,
      );
    },
    async erwaehntIn(mappeId) {
      if (!istUuid(mappeId)) return [];
      const muster = `%:${mappeId.toLowerCase()})%`;
      const notiz = await sql`SELECT id, mappe_id, geaendert FROM notizen WHERE haushalt_id = ${haushaltId} AND mappe_id <> ${mappeId}
        AND (text LIKE ${`%(mappe${muster.slice(1)}`} OR text LIKE ${`%(benutzer${muster.slice(1)}`}) ORDER BY geaendert DESC LIMIT 200`;
      // Formatierte Felder: Werte mit der Erwähnung – den Schlüssel sucht der Dienst heraus (Feldtyp „formatiert“).
      const felder =
        await sql`SELECT m.id, m.geaendert, w.key FROM mappen m, jsonb_each_text(m.werte) w WHERE m.haushalt_id = ${haushaltId} AND m.id <> ${mappeId}
        AND m.werte::text LIKE ${muster} AND (w.value LIKE ${`%(mappe${muster.slice(1)}`} OR w.value LIKE ${`%(benutzer${muster.slice(1)}`}) ORDER BY m.geaendert DESC LIMIT 200`;
      return [
        ...notiz.map((x) => ({ mappeId: x.mappe_id as string, stelle: `notiz:${x.id as string}`, am: iso(x.geaendert) })),
        ...felder.map((x) => ({ mappeId: x.id as string, stelle: x.key as string, am: iso(x.geaendert) })),
      ].slice(0, 200);
    },
    async notizenVon(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (
        await sql`SELECT * FROM notizen WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) ORDER BY mappe_id, erstellt, id`
      ).map(alsNotiz);
    },
    async holeNotiz(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM notizen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsNotiz(r) : undefined;
    },
    // Erwähnungen nie mit Titel speichern (#1293) – auch für Wege am Dienst vorbei (z. B. Umbau eines Pakets).
    async legeNotizAn(n) {
      const [r] = await sql`
        INSERT INTO notizen (id, haushalt_id, mappe_id, text, erstellt_von, geaendert_von)
        VALUES (${n.id}, ${haushaltId}, ${n.mappeId}, ${ohneTitel(n.text)}, ${istUuid(n.erstelltVon) ? n.erstelltVon : null}::uuid, ${istUuid(n.erstelltVon) ? n.erstelltVon : null}::uuid)
        RETURNING *`;
      return alsNotiz(r);
    },
    async aendereNotiz(id, text, von) {
      const [r] =
        await sql`UPDATE notizen SET text = ${ohneTitel(text)}, geaendert = now(), geaendert_von = ${istUuid(von) ? von : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
      return alsNotiz(r);
    },
    async loescheNotiz(id) {
      await sql`DELETE FROM notizen WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
  } satisfies RepoTeil;
}
