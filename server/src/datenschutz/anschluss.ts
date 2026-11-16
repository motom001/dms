import type { Benutzer } from '../../../shared/src/model';
import type { Kurzzustand } from '../zwischenspeicher/kurzzustand';

/*
 * Anschluss des Datenschutzes (#1278, Schritt 5b; vorher in datenschutz.dienst.ts): für den Dienst und die Quellen des
 * Vollexports (vollexport.ts), ohne dass diese datenschutz.dienst.ts einbinden.
 */

/** Was der Datenschutz außer dem Kern braucht – vom Dienst hereingereicht. */
export interface DatenschutzAnschluss {
  /** Konten (#43), vom Start angebunden: aktive Personen für Benachrichtigungen. */
  konten(): { benutzer?(): Promise<Benutzer[]> } | undefined;
  /** Zustand zwischen Anfragen (#744; Belegung der Code-Prüfung am Abruf-Link). */
  kurzzustand(): Kurzzustand;
  /** Der Schlüssel (#39, #46; tresor.ts, beim Start gesetzt) – nur zum Entschlüsseln im Export. */
  tresor(): { entschluessele(wert: string): string | null } | undefined;
  /** Automatisierungen mit Änderungsverlauf für den Vollexport (#674 setzt das am Dienst). */
  automatisierungenExport(): (() => Promise<unknown[]>) | undefined;
  /** Automatisierungsvorlagen mit Änderungsverlauf für den Vollexport (#1044). */
  ablaufvorlagenExport?(): Promise<unknown[]>;
}
