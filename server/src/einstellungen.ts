/**
 * Einstellungen des Haushalts (Tabelle einstellungen, je Schlüssel ein JSON-Wert).
 * PostgreSQL: pgBetriebSpeicher in betrieb.ts hat dieselbe Form.
 */
export interface Einstellungen {
  lies(schluessel: string): Promise<unknown>;
  schreibe(schluessel: string, wert: unknown): Promise<void>;
}

export function speicherEinstellungen(): Einstellungen {
  const m = new Map<string, unknown>();
  return {
    async lies(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
    async schreibe(k, w) { m.set(k, structuredClone(w)); },
  };
}
