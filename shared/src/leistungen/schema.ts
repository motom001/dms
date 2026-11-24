/**
 * Schemas der Leistungen (#1569): eine kleine Teilmenge von JSON Schema, damit dms-registry und Paketautorinnen sie mit
 * üblichen Werkzeugen lesen können. Jede Angabe hat Grenzen (Text `maxLength`, Liste `maxItems`, Zahl `minimum` und
 * `maximum`); Objekte nennen ihre Felder abschließend (`additionalProperties: false`). `format: 'dokument'` ist ein
 * Dokument in Ablago (von außen seine Id; im Kern auch die Datei selbst, siehe `istDatei`).
 */

export type Schema =
  | { type: 'string'; maxLength: number; minLength?: number; enum?: readonly string[]; pattern?: string; format?: 'dokument' | 'uuid' }
  | { type: 'number' | 'integer'; minimum: number; maximum: number }
  | { type: 'boolean' }
  | { type: 'array'; items: Schema; maxItems: number; minItems?: number }
  | {
      type: 'object';
      properties: Readonly<Record<string, Schema>>;
      required?: readonly string[];
      additionalProperties: false;
    };

/** Eine Datei, wie der Kern sie einem Anbieter gibt und von ihm bekommt. */
export interface Datei {
  inhalt: Uint8Array;
  mime: string;
  name: string;
}

export const istDatei = (x: unknown): x is Datei =>
  !!x &&
  typeof x === 'object' &&
  (x as Datei).inhalt instanceof Uint8Array &&
  typeof (x as Datei).mime === 'string' &&
  typeof (x as Datei).name === 'string';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ein Fehler beim Prüfen: wo (Pfad wie `seiten[2].nr`) und was. */
export interface Schemafehler {
  pfad: string;
  grund: 'typ' | 'fehlt' | 'unbekannt' | 'zu-lang' | 'zu-kurz' | 'zu-klein' | 'zu-gross' | 'wert' | 'muster';
}

const fehler = (pfad: string, grund: Schemafehler['grund']): Schemafehler => ({ pfad: pfad || '.', grund });

function pruefeText(s: Extract<Schema, { type: 'string' }>, w: unknown, pfad: string, dateien: boolean): Schemafehler | null {
  if (s.format === 'dokument' && dateien && istDatei(w)) return null;
  if (typeof w !== 'string') return fehler(pfad, 'typ');
  if (w.length > s.maxLength) return fehler(pfad, 'zu-lang');
  if (s.minLength !== undefined && w.length < s.minLength) return fehler(pfad, 'zu-kurz');
  if (s.enum && !s.enum.includes(w)) return fehler(pfad, 'wert');
  if ((s.format === 'dokument' || s.format === 'uuid') && !UUID.test(w)) return fehler(pfad, 'muster');
  if (s.pattern && !new RegExp(s.pattern, 'u').test(w)) return fehler(pfad, 'muster');
  return null;
}

function pruefeObjekt(s: Extract<Schema, { type: 'object' }>, w: unknown, pfad: string, dateien: boolean): Schemafehler | null {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return fehler(pfad, 'typ');
  const o = w as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!Object.hasOwn(s.properties, k)) return fehler(pfad ? `${pfad}.${k}` : k, 'unbekannt');
  for (const k of s.required ?? []) if (o[k] === undefined) return fehler(pfad ? `${pfad}.${k}` : k, 'fehlt');
  for (const [k, teil] of Object.entries(s.properties)) {
    if (o[k] === undefined) continue;
    const f = pruefe(teil, o[k], { pfad: pfad ? `${pfad}.${k}` : k, dateien });
    if (f) return f;
  }
  return null;
}

function pruefeZahl(s: Extract<Schema, { type: 'number' | 'integer' }>, w: unknown, pfad: string): Schemafehler | null {
  if (typeof w !== 'number' || !Number.isFinite(w) || (s.type === 'integer' && !Number.isInteger(w))) return fehler(pfad, 'typ');
  if (w < s.minimum) return fehler(pfad, 'zu-klein');
  return w > s.maximum ? fehler(pfad, 'zu-gross') : null;
}

function pruefeListe(s: Extract<Schema, { type: 'array' }>, w: unknown, pfad: string, dateien: boolean): Schemafehler | null {
  if (!Array.isArray(w)) return fehler(pfad, 'typ');
  if (w.length > s.maxItems) return fehler(pfad, 'zu-lang');
  if (s.minItems !== undefined && w.length < s.minItems) return fehler(pfad, 'zu-kurz');
  for (let i = 0; i < w.length; i++) {
    const f = pruefe(s.items, w[i], { pfad: `${pfad}[${i}]`, dateien });
    if (f) return f;
  }
  return null;
}

/**
 * Wert gegen Schema prüfen; null = passt. `dateien`: Felder mit `format: 'dokument'` dürfen auch eine Datei sein
 * (nur im Kern, nie von außen).
 */
export function pruefe(s: Schema, w: unknown, o: { pfad?: string; dateien?: boolean } = {}): Schemafehler | null {
  const pfad = o.pfad ?? '';
  const dateien = o.dateien ?? false;
  switch (s.type) {
    case 'string':
      return pruefeText(s, w, pfad, dateien);
    case 'number':
    case 'integer':
      return pruefeZahl(s, w, pfad);
    case 'boolean':
      return typeof w === 'boolean' ? null : fehler(pfad, 'typ');
    case 'array':
      return pruefeListe(s, w, pfad, dateien);
    case 'object':
      return pruefeObjekt(s, w, pfad, dateien);
  }
}

/** Pfade aller Felder mit `format: 'dokument'` (Listen als `feld[]`), in Reihenfolge des Schemas. */
export function dokumentFelder(s: Schema, pfad = ''): string[] {
  if (s.type === 'string') return s.format === 'dokument' ? [pfad] : [];
  if (s.type === 'array') return dokumentFelder(s.items, `${pfad}[]`);
  if (s.type === 'object') return Object.entries(s.properties).flatMap(([k, t]) => dokumentFelder(t, pfad ? `${pfad}.${k}` : k));
  return [];
}

/** Hat jedes Teil des Schemas seine Grenzen? Gibt die Pfade ohne zurück (für den Vollständigkeitstest). */
export function ohneGrenzen(s: Schema, pfad = ''): string[] {
  const hier = pfad || '.';
  const unter = (k: string) => (pfad ? `${pfad}.${k}` : k);
  switch (s.type) {
    case 'string':
      return s.maxLength > 0 ? [] : [hier];
    case 'number':
    case 'integer':
      return s.minimum <= s.maximum ? [] : [hier];
    case 'boolean':
      return [];
    case 'array':
      return [...(s.maxItems > 0 ? [] : [hier]), ...ohneGrenzen(s.items, `${pfad}[]`)];
    case 'object':
      return [
        ...(s.additionalProperties === false ? [] : [hier]),
        ...(s.required ?? []).filter((k) => !Object.hasOwn(s.properties, k)).map(unter),
        ...Object.entries(s.properties).flatMap(([k, t]) => ohneGrenzen(t, unter(k))),
      ];
  }
}
