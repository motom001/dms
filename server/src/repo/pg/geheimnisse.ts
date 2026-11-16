import type postgres from 'postgres';
import { umschluesseleTief } from '../../tresor';
import type { RepoTeil } from '..';
import type { PgKontext } from './kontext';

/** Verschlüsselte Werte: umschlüsseln und Fundstellen. */
export function pgGeheimnisse(k: PgKontext) {
  const { sql, haushaltId } = k;
  return {
    async umschluesseln(um, einstellungen) {
      return sql.begin(async (tx) => {
        let umgeschluesselt = 0;
        let unlesbar = 0;
        const zaehle = (x: { geaendert: number; unlesbar: number }) => {
          umgeschluesselt += x.geaendert;
          unlesbar += x.unlesbar;
        };
        const muster = '%dms1$%';
        for (const r of await tx`SELECT id, werte FROM mappen WHERE haushalt_id = ${haushaltId} AND werte::text LIKE ${muster} FOR UPDATE`) {
          const x = umschluesseleTief(r.werte, um);
          zaehle(x);
          if (x.geaendert) await tx`UPDATE mappen SET werte = ${tx.json(x.wert as postgres.JSONValue)} WHERE id = ${r.id}`;
        }
        for (const r of await tx`SELECT id, mappe FROM papierkorb WHERE haushalt_id = ${haushaltId} AND mappe::text LIKE ${muster} FOR UPDATE`) {
          const x = umschluesseleTief(r.mappe, um);
          zaehle(x);
          if (x.geaendert) await tx`UPDATE papierkorb SET mappe = ${tx.json(x.wert as postgres.JSONValue)} WHERE id = ${r.id}`;
        }
        const gesetzt = Object.keys(einstellungen);
        for (const r of await tx`SELECT schluessel, wert FROM einstellungen WHERE haushalt_id = ${haushaltId} AND wert::text LIKE ${muster} AND NOT (schluessel = ANY(${gesetzt}::text[])) FOR UPDATE`) {
          const x = umschluesseleTief(r.wert, um);
          zaehle(x);
          if (x.geaendert)
            await tx`UPDATE einstellungen SET wert = ${tx.json(x.wert as postgres.JSONValue)} WHERE haushalt_id = ${haushaltId} AND schluessel = ${r.schluessel}`;
        }
        // Aufruf von außen (#679): Geheimnis für die Signatur.
        for (const r of await tx`SELECT automatisierung_id, geheimnis FROM automatisierung_aufrufe WHERE haushalt_id = ${haushaltId} AND geheimnis LIKE ${muster} FOR UPDATE`) {
          const x = umschluesseleTief(r.geheimnis as string, um);
          zaehle(x);
          if (x.geaendert)
            await tx`UPDATE automatisierung_aufrufe SET geheimnis = ${x.wert} WHERE automatisierung_id = ${r.automatisierung_id}`;
        }
        // URL aufrufen (#671): Geheimnis je Karte für die Signatur.
        for (const r of await tx`SELECT automatisierung_id, karte, geheimnis FROM automatisierung_geheimnisse WHERE haushalt_id = ${haushaltId} AND geheimnis LIKE ${muster} FOR UPDATE`) {
          const x = umschluesseleTief(r.geheimnis as string, um);
          zaehle(x);
          if (x.geaendert)
            await tx`UPDATE automatisierung_geheimnisse SET geheimnis = ${x.wert} WHERE automatisierung_id = ${r.automatisierung_id} AND karte = ${r.karte}`;
        }
        for (const [k, w] of Object.entries(einstellungen)) {
          await tx`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, ${k}, ${tx.json(w as postgres.JSONValue)})
            ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
        }
        return { umgeschluesselt, unlesbar };
      });
    },
    async verschluesselteFundstellen() {
      // Dieselben Stellen wie umschluesseln (#410); Benutzername für die Zwei-Faktor-Anmeldung; Aufruf von außen (#679); URL aufrufen (#671).
      const muster = '%dms1$%';
      const mappen = await sql`SELECT id, titel, werte FROM mappen WHERE haushalt_id = ${haushaltId} AND werte::text LIKE ${muster}`;
      const korb = await sql`SELECT id, mappe FROM papierkorb WHERE haushalt_id = ${haushaltId} AND mappe::text LIKE ${muster}`;
      const einst = await sql`
        SELECT e.schluessel, e.wert, coalesce(nullif(b.name, ''), b.email) AS titel FROM einstellungen e
        LEFT JOIN benutzer b ON b.haushalt_id = e.haushalt_id AND (e.schluessel = 'zweifaktor_' || b.id::text OR e.schluessel = 'dokpasswoerter_' || b.id::text)
        WHERE e.haushalt_id = ${haushaltId} AND e.wert::text LIKE ${muster} ORDER BY e.schluessel`;
      const aufrufe =
        await sql`SELECT x.automatisierung_id, x.geheimnis, a.name FROM automatisierung_aufrufe x JOIN automatisierungen a ON a.id = x.automatisierung_id
        WHERE x.haushalt_id = ${haushaltId} AND x.geheimnis LIKE ${muster} ORDER BY x.erstellt, x.automatisierung_id`;
      const aussen =
        await sql`SELECT x.automatisierung_id, x.karte, x.geheimnis, a.name FROM automatisierung_geheimnisse x JOIN automatisierungen a ON a.id = x.automatisierung_id
        WHERE x.haushalt_id = ${haushaltId} AND x.geheimnis LIKE ${muster} ORDER BY x.erstellt, x.automatisierung_id, x.karte`;
      return [
        ...mappen.map((r) => ({ quelle: 'mappe' as const, schluessel: String(r.id), wert: r.werte, titel: r.titel as string })),
        ...korb.map((r) => ({
          quelle: 'papierkorb' as const,
          schluessel: String(r.id),
          wert: r.mappe,
          titel: (r.mappe as { titel?: string }).titel ?? null,
        })),
        ...einst.map((r) => ({
          quelle: 'einstellung' as const,
          schluessel: r.schluessel as string,
          wert: r.wert,
          titel: (r.titel as string | null) ?? null,
        })),
        ...aufrufe.map((r) => ({
          quelle: 'aufruf' as const,
          schluessel: String(r.automatisierung_id),
          wert: r.geheimnis,
          titel: r.name as string,
        })),
        ...aussen.map((r) => ({
          quelle: 'aussen' as const,
          schluessel: `${String(r.automatisierung_id)}:${String(r.karte)}`,
          wert: r.geheimnis,
          titel: r.name as string,
        })),
      ];
    },
  } satisfies RepoTeil;
}
