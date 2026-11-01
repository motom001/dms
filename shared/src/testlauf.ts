/**
 * Testläufe in der Werkbank (#371): Ein Ergebnis gehört immer zu genau einer Auswahl
 * (Benutzer, Mappe bzw. Ansicht und Stand der Regeln). Es wird mit dem Schlüssel dieser Auswahl
 * gespeichert und nur angezeigt, solange der Schlüssel zur aktuellen Auswahl passt – so steht nie
 * ein Ergebnis zu einer anderen Mappe oder einem anderen Benutzer da, auch nicht, wenn eine
 * ältere Antwort des Servers erst nach dem Wechsel eintrifft.
 */

/** Was im Testlauf gerade gewählt ist. `stand` beschreibt die Regeln (z. B. als JSON), wie sie im Editor stehen. */
export interface TestlaufWahl {
  benutzerId: string;
  /** Mappe des Testlaufs; bei Ansichten leer lassen. */
  mappeId?: string;
  stand?: string;
}

/** Ein Ergebnis mit dem Schlüssel der Auswahl, zu der es gehört. */
export interface TestlaufErgebnis<T> {
  schluessel: string;
  wert: T;
}

/** Schlüssel einer Auswahl; leer, solange nicht alles Nötige gewählt ist. */
export function testlaufSchluessel(w: TestlaufWahl, mitMappe = true): string {
  if (!w.benutzerId || (mitMappe && !w.mappeId)) return '';
  return JSON.stringify([w.benutzerId, mitMappe ? w.mappeId : null, w.stand ?? '']);
}

/** Das gespeicherte Ergebnis – aber nur, wenn es zur aktuellen Auswahl gehört. */
export function passendesErgebnis<T>(erg: TestlaufErgebnis<T> | undefined, schluessel: string): T | undefined {
  return erg && schluessel && erg.schluessel === schluessel ? erg.wert : undefined;
}
