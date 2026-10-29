import type postgres from 'postgres';

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
}

export function speicherEinstellungen(): Einstellungen {
  const m = new Map<string, unknown>();
  return {
    async lies(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async schreibe(k, w) { if (w === null || w === undefined) m.delete(k); else m.set(k, structuredClone(w)); },
  };
}

/** Einstellungen in PostgreSQL (ohne weitere Abhängigkeiten, z. B. für Sicherung und Tests). */
export function pgEinstellungen(sql: postgres.Sql, haushaltId: string): Einstellungen {
  return {
    async lies(k) {
      const [r] = await sql`SELECT wert FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = ${k}`;
      return r ? r.wert : null;
    },
    async schreibe(k, w) {
      if (w === null || w === undefined) {
        await sql`DELETE FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = ${k}`;
        return;
      }
      await sql`
        INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, ${k}, ${sql.json(w as postgres.JSONValue)})
        ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    },
  };
}
