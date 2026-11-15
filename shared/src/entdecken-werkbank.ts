/**
 * Werkbank → Rundgänge (#941) und Tipps (#942): gemeinsame Typen für Server und Oberfläche. Die Regeln (Prüfen, Filtern)
 * stehen in `entdecken.ts`.
 */
import type { Anker, Fuer, Herkunft, Rundgang, RundgangStart } from './entdecken';

/** Eigene Rundgänge heißen `eigen:<schluessel>`; so kommen sie Ablagos und denen der Pakete nicht in die Quere. */
export const EIGEN = 'eigen';
/** Schlüssel, unter dem ein Rundgang bzw. Tipp ausgeschaltet ist (Werkbank, Liste `aus`). */
export const ausSchluessel = (art: 'rundgang' | 'tipp', schluessel: string) => `${art}:${schluessel}`;

/** Ein Fehler beim Prüfen in der Werkbank: Zeile in der Datei (1-basiert, null = ganze Datei) und verständliche Ursache. */
export interface ZeilenFehler { zeile: number | null; text: string }

/** Ein Rundgang in der Werkbank: alle (Ablago, Pakete, eigene), mit Herkunft, Start, für wen und an/aus. */
export interface WerkbankRundgang {
  schluessel: string;
  herkunft: Herkunft;
  /** Name des Pakets (bei Herkunft paket:<id>). */
  paketName?: string;
  titel: string;
  beschreibung: string;
  start: RundgangStart;
  fuer: Fuer;
  schritte: number;
  an: boolean;
  /** Die Datei: bei eigenen wie gespeichert, sonst zum Ansehen und Kopieren erzeugt (mit den Texten der Sprache). */
  yaml: string;
  /** Eigene: Stand für den Konfliktschutz (#917) und wer zuletzt gespeichert hat. */
  geaendert?: string;
  von?: string | null;
  /** Eigene, die gerade nicht gelten (z. B. ein Mappentyp fehlt inzwischen). */
  fehler?: string[];
}

/** Was die Werkbank zum Schreiben braucht: Anker, Mappentypen mit Feldern und Registern, Bereiche der Werkbank. */
export interface WerkbankRundgaengeStand {
  rundgaenge: WerkbankRundgang[];
  anker: Anker[];
  typen: Array<{ kennung: string; name: string; felder: Array<{ key: string; name: string }>; register: Array<{ key: string; name: string }> }>;
  bereiche: Array<{ pfad: string; name: string }>;
}

/** Ergebnis von „Prüfen“: Fehler mit Zeile; ohne Fehler der Rundgang, wie die prüfende Person ihn sieht („Ausprobieren“). */
export interface RundgangPruefergebnis {
  fehler: ZeilenFehler[];
  rundgang: Rundgang | null;
  /** Was „Ausprobieren“ vorher öffnet (oeffne mappe/neu), sonst null. */
  pfad: string | null;
}

