import type postgres from 'postgres';
import { GEMERKTE_EINSTELLUNGEN, lesespeicherFuer, merkeAenderung } from './lesespeicher';

/**
 * Einstellungen des Haushalts (Tabelle einstellungen, je Schlüssel ein JSON-Wert).
 * PostgreSQL: pgBetriebSpeicher in betrieb.ts nutzt pgEinstellungen.
 *
 * `null` (oder undefined) schreiben löscht den Eintrag; Lesen liefert dann `null` (#165).
 * Die Spalte wert ist NOT NULL – vorher scheiterte z. B. „Wartung beenden“.
 */
export interface Einstellungen {
  lies(schluessel: string): Promise<unknown>;
  schreibe(schluessel: string, wert: unknown): Promise<void>;
  /**
   * Nur schreiben, wenn noch `alt` drinsteht (null = noch nichts); true, wenn geschrieben. Für Zeitpläne mit mehreren
   * Servern (#724): Wer den Lauf eines Tages für sich einträgt, macht ihn – der andere nicht.
   */
  tausche?(schluessel: string, alt: unknown, neu: unknown): Promise<boolean>;
}

export function speicherEinstellungen(): Einstellungen {
  const m = new Map<string, unknown>();
  return {
    async lies(k) {
      return m.has(k) ? structuredClone(m.get(k)) : null;
    },
    async schreibe(k, w) {
      if (w === null || w === undefined) m.delete(k);
      else m.set(k, structuredClone(w));
      merkeAenderung();
    },
    async tausche(k, alt, neu) {
      if (JSON.stringify(m.has(k) ? m.get(k) : null) !== JSON.stringify(alt ?? null)) return false;
      m.set(k, structuredClone(neu));
      merkeAenderung();
      return true;
    },
  };
}

/**
 * Einstellungen in PostgreSQL (ohne weitere Abhängigkeiten, z. B. für Sicherung und Tests). Die Einstellungen aus
 * `GEMERKTE_EINSTELLUNGEN` kommen aus dem Lesespeicher (#741): gemeinsam für alle Aufrufe auf derselben Verbindung,
 * gültig bei gleichem Haushaltsstand `lesen` – den zählt jede Änderung der Tabelle hoch (Trigger, Migration 077).
 */
export function pgEinstellungen(sql: postgres.Sql, haushaltId: string): Einstellungen {
  const roh = async (k: string) => {
    const [r] = await sql`SELECT wert FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = ${k}`;
    return r ? r.wert : null;
  };
  return {
    async lies(k) {
      return GEMERKTE_EINSTELLUNGEN.has(k) ? lesespeicherFuer(sql, haushaltId).hole(`einstellung:${k}`, () => roh(k)) : roh(k);
    },
    async schreibe(k, w) {
      try {
        if (w === null || w === undefined) {
          await sql`DELETE FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = ${k}`;
          return;
        }
        await sql`
          INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, ${k}, ${sql.json(w as postgres.JSONValue)})
          ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
      } finally {
        merkeAenderung();
      }
    },
    async tausche(k, alt, neu) {
      const w = sql.json(neu as postgres.JSONValue);
      try {
        const r =
          alt === null || alt === undefined
            ? await sql`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, ${k}, ${w}) ON CONFLICT DO NOTHING RETURNING 1`
            : await sql`UPDATE einstellungen SET wert = ${w} WHERE haushalt_id = ${haushaltId} AND schluessel = ${k} AND wert = ${sql.json(alt as postgres.JSONValue)} RETURNING 1`;
        return r.length > 0;
      } finally {
        merkeAenderung();
      }
    },
  };
}
