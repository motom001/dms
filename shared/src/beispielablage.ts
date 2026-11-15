/**
 * Beispiel-Ablage (#988): eine kleine, stimmige Ablage einer erfundenen Familie zum Umsehen – die Beispiel-Mappen der
 * installierten Pakete auf einen Klick, ohne Automatisierungen und Benachrichtigungen, und mit einem Klick wieder weg.
 * Die Inhalte (Texte, Dokumente) liefern die Pakete im Katalog (dms-registry) – nur mit Personas und reservierten
 * Adressen. Getrennt davon die Lasttest-Daten (früher „Demo-Daten“) für Messungen.
 */

/** Ohne diese Pakete fehlt der Familie Wesentliches – die Werkbank nennt fehlende vorher. Reihenfolge = Abhängigkeiten. */
export const BEISPIEL_NOETIG = ['basis', 'haushalt', 'vertraege'] as const;
/** Pakete, deren Beispiele dazukommen, wenn sie installiert sind. */
export const BEISPIEL_DAZU = ['rechnungen', 'haus', 'fahrzeuge'] as const;
/** In dieser Reihenfolge legt die Beispiel-Ablage an: erst die Pakete, auf deren Beispiele andere verweisen. */
export const BEISPIEL_PAKETE: readonly string[] = [...BEISPIEL_NOETIG, ...BEISPIEL_DAZU];

/** Beispiel-Mappe, die beim Entfernen bleibt: geändert oder von einer eigenen Mappe verwiesen. */
export interface BeispielBleibt { id: string; titel: string; grund: 'geaendert' | 'verwiesen' }

export interface BeispielAblageStand {
  /** Nötige Pakete: Kennung, Name (bei installierten) und ob installiert. */
  noetig: Array<{ id: string; name: string | null; installiert: boolean }>;
  /** Installierte Pakete mit Beispiel-Mappen und deren Zahl. */
  pakete: Array<{ id: string; name: string; angelegt: number }>;
  /** Beispiel-Mappen insgesamt. */
  angelegt: number;
}

export interface BeispielAblageAnlegen {
  angelegt: number;
  /** Pakete, deren Beispiele sich nicht anlegen ließen (z. B. Katalog nicht erreichbar) – die übrigen sind da. */
  fehler: Array<{ id: string; name: string; meldung: string }>;
}

export interface BeispielAblageEntfernen { entfernt: number; behalten: BeispielBleibt[] }
