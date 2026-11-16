import { istUuid, type RepoTeil } from '..';
import type { PgKontext } from './kontext';
import { notfallkontaktAus } from './zeilen';

/** Notfallkontakte: lesen, eintragen, ändern, Mailstand, löschen. */
export function pgNotfallkontakte(k: PgKontext) {
  const { sql, haushaltId, STAND_WEITER } = k;
  return {
    /* ---------- Notfallkontakte (#812) ---------- */
    async notfallkontakte() {
      return (await sql`SELECT * FROM notfallkontakte WHERE haushalt_id = ${haushaltId} ORDER BY erstellt, id`).map(notfallkontaktAus);
    },
    async holeNotfallkontakt(id) {
      if (!istUuid(id)) return null;
      const [z] = await sql`SELECT * FROM notfallkontakte WHERE haushalt_id = ${haushaltId} AND id = ${id}`;
      return z ? notfallkontaktAus(z) : null;
    },
    async legeNotfallkontaktAn(k, max) {
      return sql.begin(async (tx) => {
        // Grenze auch bei gleichzeitigen Anfragen und mehreren Prozessen (Durchsicht Sicherheit): Sperre je Haushalt
        // bis zum Ende der Transaktion, dann zählen und anlegen.
        await tx`SELECT pg_advisory_xact_lock(812, hashtext(${haushaltId}::text))`;
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM notfallkontakte WHERE haushalt_id = ${haushaltId}`;
        if (Number(n) >= max) return false;
        await tx`INSERT INTO notfallkontakte (id, haushalt_id, name, email, telefon, notiz, antwort_an, eingetragen_von, eingetragen_von_name, mail_stand, mail_am, mail_fehler, erstellt, geaendert)
          VALUES (${k.id}, ${haushaltId}, ${k.name}, ${k.email}, ${k.telefon}, ${k.notiz}, ${k.antwortAn}, ${k.eingetragenVon}, ${k.eingetragenVonName}, ${k.mailStand}, ${k.mailAm}, ${k.mailFehler},
            date_trunc('milliseconds', now()), date_trunc('milliseconds', now()))`;
        return true;
      });
    },
    async aendereNotfallkontakt(id, w) {
      if (!istUuid(id)) return false;
      return (
        (
          await sql`UPDATE notfallkontakte SET name = ${w.name}, email = ${w.email}, telefon = ${w.telefon}, notiz = ${w.notiz}, antwort_an = ${w.antwortAn},
        mail_stand = ${w.mailStand}, mail_am = ${w.mailAm}, mail_fehler = ${w.mailFehler}, geaendert = ${STAND_WEITER}
        WHERE haushalt_id = ${haushaltId} AND id = ${id}`
        ).count > 0
      );
    },
    async setzeNotfallkontaktMail(id, m) {
      if (!istUuid(id)) return false;
      return (
        (
          await sql`UPDATE notfallkontakte SET mail_stand = ${m.mailStand}, mail_am = ${m.mailAm}, mail_fehler = ${m.mailFehler} WHERE haushalt_id = ${haushaltId} AND id = ${id}`
        ).count > 0
      );
    },
    async loescheNotfallkontakt(id) {
      if (!istUuid(id)) return null;
      const [z] = await sql`DELETE FROM notfallkontakte WHERE haushalt_id = ${haushaltId} AND id = ${id} RETURNING *`;
      return z ? notfallkontaktAus(z) : null;
    },
  } satisfies RepoTeil;
}
