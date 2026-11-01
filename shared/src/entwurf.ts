/**
 * Werkbank-Formulare (#370): ein Muster für „Anlegen“/„Speichern“ und „Verwerfen“.
 *
 * - Neu anlegen: Hauptknopf „<Gegenstand> anlegen“, daneben „Entwurf verwerfen“ – schließt das
 *   Formular (zurück zur Liste); immer aktiv.
 * - Bearbeiten: Hauptknopf „<Gegenstand> speichern“, daneben „Änderungen verwerfen“ – setzt die
 *   Felder auf den gespeicherten Stand; beide erst aktiv, wenn etwas geändert ist.
 * - Esc im Formular = Verwerfen, mit Rückfrage, wenn etwas geändert ist.
 *
 * Reine Funktionen, damit sich das Verhalten ohne Browser prüfen lässt.
 */

/** Tiefer Vergleich für Formularwerte (JSON-artig); die Reihenfolge der Schlüssel zählt nicht. */
export function gleicherStand(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // undefined und fehlender Schlüssel gelten gleich; sonst streng.
    return a === undefined && b === undefined;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const y = b as unknown[];
    return a.length === y.length && a.every((v, i) => gleicherStand(v, y[i]));
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>;
  const schluessel = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const k of schluessel) if (!gleicherStand(x[k], y[k])) return false;
  return true;
}

/** Weicht der Entwurf vom gespeicherten Stand ab? */
export function istGeaendert<T>(gespeichert: T, aktuell: T): boolean {
  return !gleicherStand(gespeichert, aktuell);
}

export interface Entwurfsstand {
  /** Formular legt etwas Neues an (statt Vorhandenes zu bearbeiten). */
  neu: boolean;
  /** Entwurf weicht vom gespeicherten (bzw. leeren) Stand ab. */
  geaendert: boolean;
  /** Speichern läuft gerade. */
  sendet?: boolean;
  /** Eingabe ist erkennbar ungültig – Hauptknopf aus. */
  ungueltig?: boolean;
  /** Speichern auch ohne Änderung sinnvoll (z. B. Vorgaben erstmals übernehmen). */
  speicherbar?: boolean;
}

export interface Leistenknoepfe {
  haupt: { text: string; aktiv: boolean };
  verwerfen: { text: string; aktiv: boolean; titel: string };
  /** Text für die Statuszeile, wenn keine Meldung da ist. */
  status: string;
}

/**
 * Beschriftung und Zustand der beiden Knöpfe. `gegenstand` steht im Hauptknopf
 * („Nummernkreis anlegen“, „Postfach speichern“); ohne Gegenstand nur „Anlegen“/„Speichern“.
 */
export function leistenknoepfe(s: Entwurfsstand, gegenstand?: string): Leistenknoepfe {
  const verb = s.neu ? 'anlegen' : 'speichern';
  const text = s.sendet ? (s.neu ? 'Lege an …' : 'Speichere …') : gegenstand ? `${gegenstand} ${verb}` : verb[0].toUpperCase() + verb.slice(1);
  return {
    haupt: { text, aktiv: !s.sendet && !s.ungueltig && (s.neu || s.geaendert || !!s.speicherbar) },
    verwerfen: s.neu
      ? { text: 'Entwurf verwerfen', aktiv: !s.sendet, titel: 'Nichts anlegen und zurück zur Liste (Esc)' }
      : { text: 'Änderungen verwerfen', aktiv: !s.sendet && s.geaendert, titel: s.geaendert ? 'Felder auf den gespeicherten Stand zurücksetzen (Esc)' : 'Nichts geändert' },
    status: s.geaendert && !s.neu ? 'Ungespeicherte Änderungen' : '',
  };
}

export type Verwerfensaktion = 'nichts' | 'schliessen' | 'zuruecksetzen';

/**
 * Was „Verwerfen“ tut. Der Knopf handelt ohne Rückfrage (er ist eindeutig beschriftet);
 * Esc fragt nach, sobald etwas verloren ginge. Ohne Änderung tut Esc beim Bearbeiten nichts.
 */
export function verwerfenSchritt(s: Pick<Entwurfsstand, 'neu' | 'geaendert'>, ausloeser: 'knopf' | 'esc'): { aktion: Verwerfensaktion; rueckfrage: boolean } {
  if (s.neu) return { aktion: 'schliessen', rueckfrage: ausloeser === 'esc' && s.geaendert };
  if (!s.geaendert) return { aktion: 'nichts', rueckfrage: false };
  return { aktion: 'zuruecksetzen', rueckfrage: ausloeser === 'esc' };
}
