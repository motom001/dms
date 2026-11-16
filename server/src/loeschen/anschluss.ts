import type { Kern } from '../kern';

/*
 * Anschluss des Löschens (#1278, Schritt 5b; vorher in loeschen.dienst.ts): für alle Klassen dieses Ordners, ohne dass
 * sie loeschen.dienst.ts einbinden.
 */

/** Was mit dem Konto geschieht, wenn eine Benutzer-Mappe den Papierkorb verlässt (#43; `KontenHaken` am Dienst). */
export interface LoeschenKonten {
  endgueltig(id: string): Promise<void>;
  wiederda(id: string, von: string | null): Promise<void>;
}

/** Was das Löschen außer dem Kern braucht – vom Dienst hereingereicht. */
export interface LoeschenAnschluss {
  /** Ereignis auslösen – über den Anschluss (`kern.ereignis`; Tests ersetzen `dienst.kern.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Titel neu berechnen – über den Anschluss (Tests ersetzen `dienst.mappenTitel.aktualisiereTitel`). */
  aktualisiereTitel(ids: string[]): Promise<Map<string, string>>;
  /** Konten (#43), vom Start angebunden. */
  konten(): LoeschenKonten | undefined;
}
