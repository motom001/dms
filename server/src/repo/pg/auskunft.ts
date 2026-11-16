import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { alsLink } from './zeilen';

/** Auskunft-Links: anlegen, abrufen, sperren, widerrufen. */
export function pgAuskunft(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async legeAuskunftLinkAn(l) {
      await sql`INSERT INTO auskunft_links (id, haushalt_id, auskunft_id, mappe_id, titel, schluessel, code, code_art, empfaenger, erstellt, erstellt_von, ablauf, max_abrufe)
        VALUES (${l.id}, ${haushaltId}, ${l.auskunftId}, ${l.mappeId}, ${l.titel}, ${l.schluessel}, ${l.code}, ${l.codeArt}, ${l.empfaenger}, ${l.erstellt}, ${istUuid(l.erstelltVon ?? '') ? l.erstelltVon : null}, ${l.ablauf}, ${l.maxAbrufe})`;
    },
    async auskunftLinkPerSchluessel(hash) {
      const [r] = await sql`SELECT * FROM auskunft_links WHERE haushalt_id = ${haushaltId} AND schluessel = ${hash}`;
      return r ? alsLink(r) : undefined;
    },
    async auskunftLinks(f = {}) {
      if (f.id !== undefined && !istUuid(f.id)) return [];
      const r = await sql`SELECT * FROM auskunft_links WHERE haushalt_id = ${haushaltId}
        ${f.id ? sql`AND id = ${f.id}::uuid` : sql``}
        ${f.mappeId ? sql`AND mappe_id = ${istUuid(f.mappeId) ? f.mappeId : null}::uuid` : sql``}
        ${f.auskunftId ? sql`AND auskunft_id = ${istUuid(f.auskunftId) ? f.auskunftId : null}::uuid` : sql``}
        ORDER BY erstellt DESC, id LIMIT ${f.max ?? 500}`;
      return r.map(alsLink);
    },
    async auskunftLinkFehlversuch(id, max) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`UPDATE auskunft_links SET fehlversuche = fehlversuche + 1,
          gesperrt = CASE WHEN gesperrt IS NULL AND fehlversuche + 1 >= ${max} THEN now() ELSE gesperrt END
        WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING fehlversuche, gesperrt`;
      return r ? { fehlversuche: r.fehlversuche as number, gesperrt: r.gesperrt !== null } : undefined;
    },
    async auskunftLinkAbruf(id) {
      if (!istUuid(id)) return null;
      const [r] = await sql`UPDATE auskunft_links SET abrufe = abrufe + 1, abgerufen = now()
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND abrufe < max_abrufe AND ablauf > now() AND gesperrt IS NULL AND widerrufen IS NULL
        RETURNING abrufe`;
      return r ? (r.abrufe as number) : null;
    },
    async widerrufeAuskunftLink(id) {
      if (!istUuid(id)) return false;
      const r =
        await sql`UPDATE auskunft_links SET widerrufen = now() WHERE haushalt_id = ${haushaltId} AND id = ${id} AND widerrufen IS NULL RETURNING id`;
      return r.length > 0;
    },
  } satisfies RepoTeil;
}
