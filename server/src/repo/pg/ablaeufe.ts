/** Abläufe an Mappen und Automatisierungsvorlagen (PostgreSQL, #131, #1044). */
import { merkeAenderung } from '../../zwischenspeicher/lesespeicher';
import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { json } from './sql';
import { alsAblauf, alsVerlauf, alsVorlage } from './zeilen';

/** Abläufe an Mappen (#1044): anlegen, ändern, anhalten, löschen. */
export function pgAblaeufe(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    /* ---------- Mappen-Abläufe (#1044; früher freie Erinnerungen, #131) ---------- */
    async ablaeufe(f = {}) {
      const id = (x: string | undefined) => (istUuid(x) ? x : null);
      return (
        await sql`
        SELECT e.*, m.titel AS mappe_titel, m.typ_id FROM mappen_ablaeufe e JOIN mappen m ON m.id = e.mappe_id
        WHERE e.haushalt_id = ${haushaltId}
          ${f.mappeId ? sql`AND e.mappe_id = ${id(f.mappeId)}::uuid` : sql``}
          ${f.empfaengerId ? sql`AND e.empfaenger_id = ${id(f.empfaengerId)}::uuid` : sql``}
          ${f.personId ? sql`AND e.erstellt_von = ${id(f.personId)}::uuid` : sql``}
          ${f.vorlage ? sql`AND e.vorlage = ${f.vorlage}` : sql``}
          ${f.bis ? sql`AND e.datum <= ${f.bis}::date` : sql``}
          ${f.angehalten === undefined ? sql`` : f.angehalten ? sql`AND e.angehalten IS NOT NULL` : sql`AND e.angehalten IS NULL`}
        ORDER BY e.datum, e.erstellt, e.id`
      ).map(alsAblauf);
    },
    async holeAblauf(id) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`SELECT * FROM mappen_ablaeufe WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return r ? alsAblauf(r) : undefined;
    },
    async legeAblaufAn(e) {
      const [r] = await sql`
        INSERT INTO mappen_ablaeufe (id, haushalt_id, mappe_id, vorlage, empfaenger_id, datum, text, erstellt_von, angehalten)
        VALUES (${e.id}, ${haushaltId}, ${e.mappeId}, ${e.vorlage}, ${istUuid(e.empfaengerId) ? e.empfaengerId : null}::uuid, ${e.datum}::date, ${e.text},
          ${istUuid(e.erstelltVon) ? e.erstelltVon : null}::uuid, ${e.angehalten ? json(sql, e.angehalten) : null}::jsonb)
        RETURNING *`;
      return alsAblauf(r);
    },
    async aendereAblauf(id, e) {
      if (!istUuid(id)) return undefined;
      const [r] = await sql`
        UPDATE mappen_ablaeufe SET datum = ${e.datum}::date, text = ${e.text}, empfaenger_id = ${istUuid(e.empfaengerId) ? e.empfaengerId : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
      return r ? alsAblauf(r) : undefined;
    },
    async setzeAblaufAngehalten(id, a) {
      if (istUuid(id))
        await sql`UPDATE mappen_ablaeufe SET angehalten = ${a ? json(sql, a) : null}::jsonb WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
    },
    async loescheAblauf(id) {
      if (!istUuid(id)) return false;
      return (await sql`DELETE FROM mappen_ablaeufe WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING id`).length > 0;
    },
  } satisfies RepoTeil;
}

/** Automatisierungsvorlagen (#1044) und ihr Verlauf. */
export function pgAblaufvorlagen(k: PgKontext) {
  const { sql, haushaltId, gemerkt } = k;
  return {
    /* ---------- Automatisierungsvorlagen (#1044) ---------- */
    async ablaufvorlagen() {
      // Gemerkt wie Typen und Pakete (Trigger in 105): Mappe öffnen braucht sie fürs Menü „Mappe“ (#1044).
      return gemerkt('ablaufvorlagen', async () =>
        (await sql`SELECT * FROM ablaufvorlagen WHERE haushalt_id = ${haushaltId} ORDER BY reihenfolge, name, kennung`).map(alsVorlage),
      );
    },
    async speichereAblaufvorlage(v, von, erwartet) {
      // Ändert keine Zahl (OHNE_FOLGEN), aber die gemerkten Vorlagen: Der Stand aus dieser Anfrage gilt nicht mehr – sonst
      // läse dieselbe Anfrage danach die alte Liste (Anlegen meldete „gibt es nicht“).
      merkeAenderung();
      const daten = { beschreibung: v.beschreibung, typen: v.typen, wann: v.wann, fragen: v.fragen, karten: v.karten };
      if (erwartet === null) {
        return (
          (
            await sql`INSERT INTO ablaufvorlagen (haushalt_id, kennung, name, reihenfolge, daten, aktiv, herkunft, paket_id, version, geaendert_von)
          VALUES (${haushaltId}, ${v.kennung}, ${v.name}, ${v.reihenfolge}, ${json(sql, daten)}::jsonb, ${v.aktiv}, ${v.herkunft}, ${v.paketId}, 1, ${istUuid(von) ? von : null}::uuid)
          ON CONFLICT DO NOTHING RETURNING version`
          ).length > 0
        );
      }
      return (
        (
          await sql`UPDATE ablaufvorlagen SET name = ${v.name}, reihenfolge = ${v.reihenfolge}, daten = ${json(sql, daten)}::jsonb, aktiv = ${v.aktiv},
        herkunft = ${v.herkunft}, paket_id = ${v.paketId}, version = version + 1, geaendert = now(), geaendert_von = ${istUuid(von) ? von : null}::uuid
        WHERE haushalt_id = ${haushaltId} AND kennung = ${v.kennung} AND version = ${erwartet} RETURNING version`
        ).length > 0
      );
    },
    async loescheAblaufvorlage(kennung) {
      merkeAenderung();
      await sql`DELETE FROM ablaufvorlagen WHERE haushalt_id = ${haushaltId} AND kennung = ${kennung}`;
    },
    async vermerkeAblauf(e) {
      await sql`INSERT INTO ablauf_verlauf (id, haushalt_id, vorlage, mappe_id, ablauf_id, person_id, art, text, zeit)
        VALUES (${e.id}, ${haushaltId}, ${e.vorlage}, ${istUuid(e.mappeId) ? e.mappeId : null}::uuid, ${istUuid(e.ablaufId) ? e.ablaufId : null}::uuid,
          ${istUuid(e.personId) ? e.personId : null}::uuid, ${e.art}, ${e.text}, ${e.zeit || new Date().toISOString()}::timestamptz)`;
    },
    async ablaufVerlauf(f) {
      return (
        await sql`SELECT * FROM ablauf_verlauf WHERE haushalt_id = ${haushaltId}
        ${f.vorlage ? sql`AND vorlage = ${f.vorlage}` : sql``} ${f.mappeId ? sql`AND mappe_id = ${istUuid(f.mappeId) ? f.mappeId : null}::uuid` : sql``}
        ORDER BY zeit DESC, id LIMIT ${f.anzahl}`
      ).map(alsVerlauf);
    },
    async zaehleAblaufVerlauf(personId, seit, arten) {
      if (!istUuid(personId)) return 0;
      const [r] =
        await sql`SELECT count(*)::int AS n FROM ablauf_verlauf WHERE haushalt_id = ${haushaltId} AND person_id = ${personId} AND zeit >= ${seit}::timestamptz AND art = ANY(${arten}::text[])`;
      return r.n as number;
    },
    async raeumeAblaufVerlaufAuf(tage, je) {
      const r = await sql`DELETE FROM ablauf_verlauf l USING (
          SELECT id, row_number() OVER (PARTITION BY vorlage ORDER BY zeit DESC) AS nr, zeit FROM ablauf_verlauf WHERE haushalt_id = ${haushaltId}
        ) x WHERE l.id = x.id AND (x.nr > ${je} OR x.zeit < now() - make_interval(days => ${tage}))`;
      return r.count;
    },
  } satisfies RepoTeil;
}
