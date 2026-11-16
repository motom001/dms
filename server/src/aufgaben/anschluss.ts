import type { Kern, Zugriff } from '../kern';
import type { Gueltigkeit } from '../zwischenspeicher/zaehlerspeicher';
import type { Benutzer, Mappe, Mappentyp } from '../../../shared/src/model';

/*
 * Anschluss der Aufgaben (#1278, Schritt 5b; vorher in aufgaben.dienst.ts und ablaeufe.ts): für alle Klassen dieses
 * Ordners, ohne dass sie aufgaben.dienst.ts einbinden.
 */

/**
 * Platzhalter füllen (#795) – der Motor (automatisierung/motor/) setzt das: mit den Rechten der Person (`z`) und, mit `empf`,
 * zusätzlich mit denen des Empfängers. Ohne Motor (Tests) bleiben Platzhalter der Vorlage stehen.
 */
export type AblaufPlatzhalter = (
  text: string,
  c: { name: string; mappe: Mappe; typ: Mappentyp | null; z: Zugriff; daten: Record<string, unknown> },
  empf: Zugriff | null,
) => Promise<{ text: string; verborgen: number; mappe: boolean }>;

/** Konten (#43, #78, #506), vom Start angebunden: alle Personen mit Abwesenheit, persönliche Einstellungen. */
export interface AufgabenKonten {
  benutzer?(): Promise<Benutzer[]>;
  /**
   * Eine Person (#1256): nur Menschen, ohne letzte Aktivität – für Vertretung und Alltags-Empfänger, die nur wenige
   * Personen brauchen. Ohne sie lesen beide die Liste aller Personen.
   */
  person?(id: string): Promise<Benutzer | undefined>;
  /** Persönliche Einstellungen (#889: „Wenn ein Favorit erwähnt wird“). */
  einstellungen?(id: string): Promise<Record<string, unknown>>;
  setzeEinstellung?(id: string, schluessel: string, wert: unknown): Promise<void>;
}

/** Was die Aufgaben außer dem Kern brauchen – vom Dienst hereingereicht. */
export interface AufgabenAnschluss {
  /** Ereignis auslösen – über den Anschluss (`kern.ereignis`; Tests ersetzen `dienst.kern.ereignis`). */
  ereignis(...a: Parameters<Kern['ereignis']>): Promise<void>;
  /** Konten (#43), vom Start angebunden. */
  konten(): AufgabenKonten | undefined;
  /** Gültigkeit der Zahlen in dieser Anfrage (#742; `mindestensMs` setzen Tests am Dienst). */
  gueltigkeit(): Gueltigkeit;
  /** Platzhalter der Automatisierungsvorlagen füllen (#1044, #795) – setzt der Motor (automatisierung/motor/). */
  ablaufPlatzhalter?(): AblaufPlatzhalter | undefined;
  /** Wer Favoriten-Änderungen bekommt (#1001) – setzt der Motor; ohne ihn alle, Vorgabe an. */
  favoritenRegeln?(): Promise<Array<{ rollen: string[]; vorgabe: boolean }>> | undefined;
}
