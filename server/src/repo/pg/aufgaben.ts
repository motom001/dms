/** Aufgaben (PostgreSQL, #54) und Aufgaben bei Personen ohne Leserecht (#798). */
import { t } from '../../sprache/sprache';
import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { alsAufgabe, alsFall, iso } from './zeilen';

/** Aufgaben anlegen, lesen, erledigen, delegieren. */
export function pgAufgaben(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    /* ---------- Aufgaben (#54) ---------- */
    async aufgabenZurPassung(liste) {
      const offen = liste.filter((x) => x.problem && istUuid(x.id));
      const fertig = liste.filter((x) => !x.problem && istUuid(x.id)).map((x) => x.id);
      if (offen.length) {
        const ids = offen.map((x) => x.id);
        const texte = offen.map((x) => t('meldungen.repopg.passt-nicht-zur-definition', { problem: String(x.problem) }));
        await sql`
          UPDATE aufgaben a SET text = n.text FROM unnest(${ids}::uuid[], ${texte}::text[]) AS n(mappe_id, text)
          WHERE a.mappe_id = n.mappe_id AND a.art = 'passung' AND a.erledigt IS NULL AND a.text <> n.text`;
        await sql`
          INSERT INTO aufgaben (id, haushalt_id, mappe_id, empfaenger_id, art, text)
          SELECT gen_random_uuid(), ${haushaltId}, n.mappe_id, m.erstellt_von, 'passung', n.text
          FROM unnest(${ids}::uuid[], ${texte}::text[]) AS n(mappe_id, text) JOIN mappen m ON m.id = n.mappe_id
          WHERE NOT EXISTS (SELECT 1 FROM aufgaben a WHERE a.mappe_id = n.mappe_id AND a.art = 'passung' AND a.erledigt IS NULL)`;
      }
      if (fertig.length) {
        await sql`UPDATE aufgaben SET erledigt = now() WHERE mappe_id = ANY(${fertig}::uuid[]) AND art = 'passung' AND erledigt IS NULL`;
      }
    },
    async legeAufgabeAn(a) {
      const [r] = await sql`
        INSERT INTO aufgaben (id, haushalt_id, mappe_id, empfaenger_id, art, text, feld_key, erstellt_von, datum, anlass)
        VALUES (${a.id}, ${haushaltId}, ${a.mappeId}, ${istUuid(a.empfaengerId) ? a.empfaengerId : null}::uuid, ${a.art}, ${a.text}, ${a.feldKey ?? null},
          ${istUuid(a.erstelltVon) ? a.erstelltVon : null}::uuid, ${a.datum ?? null}::date, ${a.anlass ? sql.json(a.anlass as never) : null})
        RETURNING *`;
      return alsAufgabe(r);
    },
    async holeAufgabe(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM aufgaben WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsAufgabe(r) : undefined;
    },
    async aufgabenVon(mappeId) {
      if (!istUuid(mappeId)) return [];
      return (
        await sql`SELECT * FROM aufgaben WHERE haushalt_id = ${haushaltId} AND mappe_id = ${mappeId} ORDER BY erledigt IS NOT NULL, erstellt DESC, id`
      ).map(alsAufgabe);
    },
    async aufgabenVonMappen(mappeIds) {
      const gueltig = [...new Set(mappeIds.filter(istUuid))];
      if (!gueltig.length) return [];
      return (
        await sql`SELECT * FROM aufgaben WHERE haushalt_id = ${haushaltId} AND mappe_id = ANY(${gueltig}::uuid[]) ORDER BY mappe_id, erledigt IS NOT NULL, erstellt DESC, id`
      ).map(alsAufgabe);
    },
    async offeneAufgaben(f = {}) {
      const wer = f.benutzerId
        ? sql`AND (a.empfaenger_id = ${istUuid(f.benutzerId) ? f.benutzerId : null}::uuid ${f.admin ? sql`OR a.empfaenger_id IS NULL` : sql``})`
        : sql``;
      const welche = f.mappeIds ? sql`AND a.mappe_id = ANY(${f.mappeIds.filter(istUuid)}::uuid[])` : sql``;
      return (
        await sql`
        SELECT a.*, m.titel AS mappe_titel, m.typ_id FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id
        WHERE a.haushalt_id = ${haushaltId} AND a.erledigt IS NULL ${wer} ${welche}
        ORDER BY a.erstellt, a.id`
      ).map(alsAufgabe);
    },
    async erledigteAufgaben(max) {
      return (
        await sql`
        SELECT a.*, m.titel AS mappe_titel, m.typ_id FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id
        WHERE a.haushalt_id = ${haushaltId} AND a.erledigt IS NOT NULL ORDER BY a.erledigt DESC, a.id LIMIT ${max}`
      ).map(alsAufgabe);
    },
    async erledigeAufgabe(id, von) {
      await sql`UPDATE aufgaben SET erledigt = now(), erledigt_von = ${istUuid(von) ? von : null}::uuid WHERE haushalt_id = ${haushaltId} AND id = ${id} AND erledigt IS NULL`;
    },
    async delegiereAufgabe(id, an) {
      await sql`UPDATE aufgaben SET empfaenger_id = ${istUuid(an) ? an : null}::uuid WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async aendereAufgabeText(id, text) {
      await sql`UPDATE aufgaben SET text = ${text} WHERE haushalt_id = ${haushaltId} AND id = ${id} AND erledigt IS NULL`;
    },
    async fristAufgaben(mappeIds) {
      const welche = mappeIds ? sql`AND a.mappe_id = ANY(${mappeIds.filter(istUuid)}::uuid[])` : sql``;
      return (
        await sql`
        SELECT a.*, m.titel AS mappe_titel, m.typ_id FROM aufgaben a JOIN mappen m ON m.id = a.mappe_id
        WHERE a.haushalt_id = ${haushaltId} AND a.art = 'frist' ${welche} ORDER BY a.erstellt, a.id`
      ).map(alsAufgabe);
    },
  } satisfies RepoTeil;
}

/** Aufgaben bei Personen ohne Leserecht (#798): Fälle und Leserecht auf Zeit. */
export function pgFaelle(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    // Aufgaben bei Personen ohne Leserecht (#798)
    async faelleOhneLeserecht(f = {}) {
      const offen = f.offen ? sql`AND f.ende IS NULL` : sql``;
      const welche = f.mappeIds ? sql`AND f.mappe_id = ANY(${f.mappeIds.filter(istUuid)}::uuid[])` : sql``;
      return (
        await sql`
        SELECT f.*, m.titel AS mappe_titel, m.typ_id FROM aufgaben_ohne_leserecht f LEFT JOIN mappen m ON m.id = f.mappe_id
        WHERE f.haushalt_id = ${haushaltId} ${offen} ${welche}
        ORDER BY f.ende IS NOT NULL, coalesce(f.ende, f.beginn) DESC, f.id LIMIT ${f.max ?? 1000}`
      ).map(alsFall);
    },
    async legeFallAn(f) {
      const r = await sql`
        INSERT INTO aufgaben_ohne_leserecht (id, haushalt_id, aufgabe_id, mappe_id, benutzer_id, aufgabentext)
        VALUES (${f.id}, ${haushaltId}, ${f.aufgabeId}, ${f.mappeId}, ${f.benutzerId}, ${f.aufgabentext})
        ON CONFLICT (aufgabe_id, benutzer_id) WHERE ende IS NULL DO NOTHING`;
      return r.count > 0;
    },
    async beendeFall(id, grund, zeit) {
      const r = await sql`UPDATE aufgaben_ohne_leserecht SET ende = coalesce(${zeit ?? null}::timestamptz, now()), ende_grund = ${grund}
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND ende IS NULL`;
      return r.count > 0;
    },
    async gibLeserechtAufZeit(id, von) {
      const r = await sql`UPDATE aufgaben_ohne_leserecht SET leserecht_seit = now(), leserecht_von = ${istUuid(von) ? von : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND id = ${id} AND ende IS NULL AND leserecht_seit IS NULL`;
      return r.count > 0;
    },
    async leserechteAufZeit(benutzerId) {
      if (!istUuid(benutzerId)) return [];
      return (
        await sql`
        SELECT f.id, f.mappe_id, m.typ_id, f.aufgabe_id, f.aufgabentext, f.leserecht_seit, f.leserecht_von
        FROM aufgaben_ohne_leserecht f JOIN aufgaben a ON a.id = f.aufgabe_id JOIN mappen m ON m.id = f.mappe_id
        WHERE f.haushalt_id = ${haushaltId} AND f.benutzer_id = ${benutzerId} AND f.ende IS NULL AND f.leserecht_seit IS NOT NULL
          AND a.erledigt IS NULL AND a.empfaenger_id = f.benutzer_id AND a.mappe_id = f.mappe_id`
      ).map((r) => ({
        fallId: r.id as string,
        mappeId: r.mappe_id as string,
        typId: r.typ_id as string,
        aufgabeId: r.aufgabe_id as string,
        aufgabentext: r.aufgabentext as string,
        seit: iso(r.leserecht_seit),
        von: (r.leserecht_von as string | null) ?? null,
      }));
    },
  } satisfies RepoTeil;
}
