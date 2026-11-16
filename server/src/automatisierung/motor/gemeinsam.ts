/**
 * Was alle Teile des Motors brauchen (#1278, vorher oben in `server/src/automatisierung.ts`): Protokoll, Texte, Takt des
 * Zeitplans. Ohne Abhängigkeit auf andere Dateien des Motors.
 */
import { protokoll } from '../../protokoll';
import { uebersetzer } from '../../../../shared/src/sprache';
import texte from '../../../../shared/src/sprachen/de/automatisierung.json';
import ereignisTexte from '../../../../shared/src/sprachen/de/ereignisse.json';
import werkbankTexte from '../../../../shared/src/sprachen/de/werkbank.json';

/**
 * Motor der Automatisierungen (#674): Wenn · Und · Dann · Sonst (#677), ausgeführt unter dem Systemkonto „Automatisierung“ (#673).
 *
 * - **Auslösen:** über den Ereigniskatalog (#670, Abnehmer „automatisierungen“) und den Zeitplan „Datum in N Tagen“.
 *   Je Automatisierung und Ereignis genau **ein Lauf** (eindeutig in der Datenbank): Kommt ein Ereignis noch einmal
 *   oder prüfen zwei Server denselben Tag, läuft nichts doppelt. Verpasste Tage holt der Zeitplan nach.
 * - **Reihenfolge:** Automatisierungen zu einem Ereignis laufen nacheinander nach `reihenfolge` (1–99, dann Name);
 *   jede liest den aktuellen Stand. Fehler einer stoppen die folgenden nicht; die Karte „Danach keine weiteren …“
 *   schon – nur für dieses eine Ereignis.
 * - **Schutz:** Eine Automatisierung löst sich nie selbst aus; Ketten höchstens {@link AUTOMATISIERUNG_GRENZEN}.tiefe
 *   tief; mehr als `laeufeJeMinute` Läufe je Minute halten sie an (Bremse). Demo-Daten, Import und Wiederherstellung
 *   lösen nichts aus (`ohneEreignisse`), in der Wartung ruht der Verteiler; nach einer Wiederherstellung sind alle
 *   angehalten, bis ein Admin sie wieder einschaltet.
 * - **Bearbeiten geht vor Automatisierung:** Passt eine Automatisierung nicht mehr (Mappentyp, Feld oder Ansicht
 *   gelöscht), wird sie rot und angehalten – sie blockiert nie das Arbeiten im DMS.
 * - **Nachvollziehbar:** Protokoll je Lauf mit Zustand je Schritt (Live-Fortschritt), Historie der Mappe „durch
 *   Automatisierung ‚…‘“, Trockenlauf, Wiederholen fehlgeschlagener Läufe, Änderungsverlauf je Automatisierung.
 *
 * Die Dann-Karten liegen in {@link DANN_AUSFUEHRER}; neue Karten melden sich dort an (`automatisierung-karten.ts`).
 */

export const log = protokoll.modul('automatisierung');
export const alsListe = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : []);
export const t = uebersetzer({ automatisierung: texte, ereignisse: ereignisTexte, werkbank: werkbankTexte });
/** Zeitplan „Datum in N Tagen“ und Aufräumen. */
export const ZEITPLAN_MS = 60_000;
/** Ein Lauf, der so lange auf „läuft“ steht, gehört einem Server, der dabei gestorben ist. */
export const HAENGT_MIN = 10;
