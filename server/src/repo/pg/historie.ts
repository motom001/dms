/** Änderungshistorie (PostgreSQL, #57). */
import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { alsHistorie, iso } from './zeilen';

/** Historie schreiben, lesen und aufräumen. */
export function pgHistorie(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    /* ---------- Änderungshistorie (#57) ---------- */
    async historieSchreibe(e) {
      if (!e.length) return;
      await sql`INSERT INTO historie ${sql(
        e.map((x) => ({
          haushalt_id: haushaltId,
          mappe_id: x.mappeId,
          benutzer_id: istUuid(x.benutzerId) ? x.benutzerId : null,
          art: x.art,
          daten: json(sql, x.daten ?? {}),
        })),
        'haushalt_id',
        'mappe_id',
        'benutzer_id',
        'art',
        'daten',
      )}`;
    },
    async historie(mappeId, o = {}) {
      if (!istUuid(mappeId)) return [];
      const vor = Number.isSafeInteger(o.vor) ? o.vor! : null;
      // #800: Seiten über den Index historie (mappe_id, zeit DESC, id DESC) – ab dem Eintrag `vor`, nicht mit OFFSET.
      return (
        await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId}
        ${o.arten ? sql`AND art = ANY(${[...o.arten]}::text[])` : sql``}
        ${vor !== null ? sql`AND (zeit, id) < (SELECT v.zeit, v.id FROM historie v WHERE v.id = ${vor} AND v.mappe_id = ${mappeId})` : sql``}
        ORDER BY zeit DESC, id DESC ${o.max ? sql`LIMIT ${o.max}` : sql``}`
      ).map(alsHistorie);
    },
    async letzterAbruf(mappeId, art, benutzerId, dokumentId, fassung, version, seit) {
      if (!istUuid(mappeId)) return null;
      // #800: nur die Einträge der Mappe seit `seit` (Index historie_mappe_idx), darin dieselbe Person, Datei und Fassung.
      const [r] =
        await sql`SELECT zeit FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} AND zeit >= ${seit} AND art = ${art}
        AND benutzer_id IS NOT DISTINCT FROM ${istUuid(benutzerId) ? benutzerId : null}::uuid AND daten->>'dokumentId' = ${dokumentId}
        AND coalesce(daten->>'fassung', '') = ${fassung} AND coalesce(daten->>'version', '') = ${version === null ? '' : String(version)}
        ORDER BY zeit DESC LIMIT 1`;
      return r ? iso(r.zeit) : null;
    },
    async letzteBerechnung(mappeId, benutzerId, seit) {
      if (!istUuid(mappeId)) return null;
      const [r] =
        await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} AND zeit >= ${seit} AND art = 'geaendert'
        AND benutzer_id IS NOT DISTINCT FROM ${istUuid(benutzerId) ? benutzerId : null}::uuid AND daten->>'berechnet' = 'true'
        ORDER BY zeit DESC, id DESC LIMIT 1`;
      return r ? alsHistorie(r) : null;
    },
    async historieDatenErsetzen(id, daten) {
      if (daten === null) await sql`DELETE FROM historie WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      else await sql`UPDATE historie SET daten = ${json(sql, daten)} WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async historieVon(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (
        await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) ORDER BY mappe_id, zeit DESC, id DESC`
      ).map(alsHistorie);
    },
    async historieArt(art, max) {
      return (
        await sql`SELECT * FROM historie WHERE haushalt_id = ${haushaltId} AND art = ${art} ORDER BY zeit DESC, id DESC LIMIT ${max}`
      ).map(alsHistorie);
    },
    async historieAufraeumen(vor) {
      const r = await sql`
        DELETE FROM historie WHERE haushalt_id = ${haushaltId} AND mappe_id IN (
          SELECT mappe_id FROM historie WHERE haushalt_id = ${haushaltId} AND art = 'endgueltig' AND zeit < ${vor})
          -- #820: „Im Verwaltungsmodus angesehen“ ist nicht löschbar und bleibt auch nach dem Aufräumen stehen.
          AND art <> 'verwaltungsmodus'
          AND NOT EXISTS (SELECT 1 FROM mappen m WHERE m.id = historie.mappe_id)
          AND NOT EXISTS (SELECT 1 FROM papierkorb p WHERE p.id = historie.mappe_id)`;
      return r.count;
    },
  } satisfies RepoTeil;
}

/** Beim Auflösen einer Post: Historie, Notizen, Aufgaben und Abläufe an die Zielmappe übertragen; wohin aufgelöst wurde. */
export function pgUebertragen(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async uebertrageAnMappe(von, nach) {
      if (!istUuid(von) || !istUuid(nach)) return { historie: 0, notizen: 0, aufgaben: 0, ablaeufe: 0 };
      // Aufgaben „Post für dich“ bleiben an der Post: Sie gelten nur dort und sind beim Auflösen schon erledigt.
      const h =
        await sql`UPDATE historie SET mappe_id = ${nach}, daten = daten || ${json(sql, { ausPost: von })}::jsonb WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von}`;
      const n = await sql`UPDATE notizen SET mappe_id = ${nach} WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von}`;
      const a = await sql`UPDATE aufgaben SET mappe_id = ${nach} WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von} AND art <> 'post'`;
      const e = await sql`UPDATE mappen_ablaeufe SET mappe_id = ${nach} WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von}`;
      // Offene Fälle „Aufgabe ohne Leserecht“ (#798) folgen ihrer Aufgabe; vergangene bleiben, wie sie waren.
      await sql`UPDATE aufgaben_ohne_leserecht SET mappe_id = ${nach} WHERE haushalt_id = ${haushaltId} AND mappe_id = ${von} AND ende IS NULL`;
      return { historie: h.count, notizen: n.count, aufgaben: a.count, ablaeufe: e.count };
    },
    async aufgeloesteIn(ids) {
      const gueltig = [...new Set(ids.filter(istUuid))];
      const m = new Map<string, { ziel: string; zielTyp: string }>();
      if (!gueltig.length) return m;
      for (const r of await sql`SELECT mappe_id, daten->>'ziel' AS ziel, coalesce(daten->>'zielTyp', '') AS ziel_typ FROM historie
        WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) AND art = 'zugeordnet' AND daten->>'aufgeloest' = 'true' ORDER BY zeit, id`) {
        if (r.ziel) m.set(r.mappe_id as string, { ziel: r.ziel as string, zielTyp: r.ziel_typ as string });
      }
      return m;
    },
  } satisfies RepoTeil;
}
