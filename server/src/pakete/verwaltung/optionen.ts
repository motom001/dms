/**
 * Was die Paketverwaltung von außen bekommt (Optionen, Paket-Läufer, Sprachpakete) und wer handelt; Protokoll.
 */
import { type HerkunftPruefung, type Katalog } from '../../../../shared/src/pakete';
import type { Probedatei } from '../../paketaktionen/index';
import { protokoll } from '../../protokoll/protokoll';
import type { Projektschluessel } from '../projektschluessel';

export const log = protokoll.modul('werkbank');

export interface PaketOptionen {
  /** Version dieses DMS. */
  version: () => string;
  /** Daten von einer Adresse holen (Tests: ohne Netz). */
  abruf?: (url: string) => Promise<Buffer>;
  /** Offizieller Katalog (Tests: eine andere Adresse). */
  katalogUrl?: string;
  /** Öffentliche Schlüssel des Projekts (#594); Tests: eigene, sonst server/src/pakete/projektschluessel.ts. */
  projektSchluessel?: readonly Projektschluessel[];
  /** Benutzer zur Auswahl in Paket-Einstellungen (#197). */
  benutzer?: () => Promise<Array<{ id: string; name: string }>>;
  /** Sprache der Installation (#1038: Werte der Vorgaben je Sprache, #728); ohne (Tests): Deutsch. */
  standardSprache?: () => Promise<string>;
  /**
   * Dienstkonto eines Pakets (#1038): Ersteller seiner Vorgaben und Vorlagen, damit die Historie die Herkunft zeigt.
   * Gibt die Id zurück; ohne (Tests) legt an, wer installiert.
   */
  dienstkonto?: (paketId: string, name: string, code: boolean) => Promise<string | null>;
  /** Paket-Läufer (Pakete mit Code): Aktionen ausführen, Ereignisse zustellen. Fehlt noch im Betrieb. */
  laeufer?: PaketLaeufer;
  /**
   * Sperre über alle Instanzen (#405, PostgreSQL): Installieren, Aktualisieren und Entfernen laufen nacheinander, auch
   * wenn mehrere Server dieselbe Datenbank nutzen. Ohne (Tests): keine.
   */
  sperre?: <T>(f: () => Promise<T>) => Promise<T>;
  /**
   * Mehrere Prozesse (#745): Ordner für hochgeladene Pakete bis zur Installation (30 Minuten) – die Installation landet
   * vielleicht bei einem anderen Prozess als das Hochladen. Je Upload das Archiv und seine Angaben, nur für den
   * Dienstbenutzer lesbar, Name aus dem Hash der Kennung. Ohne: nur im Arbeitsspeicher (ein Prozess, Tests).
   */
  uploadOrdner?: string;
  /**
   * Sprachpakete (#731): nach dem Installieren, Aktualisieren und Entfernen die Sprachen dieses Prozesses neu laden;
   * wie viele Personen eine Sprache gewählt haben und ob sie die Sprache der Installation ist (Entfernen mit Hinweis);
   * nach dem Entfernen die Sprache aus der Einstellung „sprachen“ nehmen. Ohne (Tests): nichts davon.
   */
  sprachen?: SprachpaketHaken;
}

/** Was die Paketverwaltung für Sprachpakete vom Rest braucht (#731). */
export interface SprachpaketHaken {
  geaendert(): Promise<void>;
  nutzung(kennung: string): Promise<{ personen: number; standard: boolean }>;
  entfernt(kennung: string): Promise<void>;
  /** Abdeckung einer geladenen Sprache in Prozent (Werkbank → Pakete). */
  abdeckung?(kennung: string): number | null;
}

/** Schnittstelle zum Paket-Läufer (#197); kommt mit den Paketen mit Code. */
export interface PaketLaeufer {
  aktion(paket: string, aktion: string, einstellungen: Record<string, unknown>): Promise<string>;
  /** Prüffunktion des Pakets (#996): Meldungen je Feld; null = das Paket lief nicht (dann gilt die Prüfung von Ablago). */
  pruefeEinstellungen?(paket: string, einstellungen: Record<string, unknown>): Promise<Record<string, string> | null>;
  /** Ausprobieren (#1004): Ereignis im Probemodus mit der Probedatei; erzeugte Dateien kommen mit. */
  ausprobieren?(
    paket: string,
    eingang: Record<string, unknown>,
    probe: Probedatei,
  ): Promise<{
    ok: boolean;
    text: string;
    fehler: string | null;
    ms: number;
    speicherMB: number;
    dateien: Array<{ name: string; typ: string; inhalt: Buffer }>;
  }>;
  ereignis?(paket: string, name: 'paket.einstellungen_geaendert', felder: string[]): void;
  /** Code eines Pakets installiert, aktualisiert oder entfernt (#338): Läufer lädt neu (fertig, wenn er die Pakete kennt). */
  codeGeaendert?(): void | Promise<void>;
}

/** Zeitgrenze für Aktionen, damit ein Knopf nicht hängt. */
export const AKTION_MS = 30_000;

/** Wer handelt: Id für „angelegt von“, E-Mail fürs Protokoll. */
export interface Handelnder {
  id: string | null;
  email: string | null;
}

/** Eine Katalogquelle: der offizielle Katalog oder eine weitere Adresse (erweiterte Ansicht, #189). */
export interface Quelle {
  url: string;
  offiziell: boolean;
  aktiv: boolean;
  von?: string | null;
  am?: string;
  /** Bestätigter Schlüssel des Anbieters (#594); null: Katalog ohne Schlüssel. */
  fingerabdruck?: string | null;
  /** Gesperrt, weil sich der Schlüssel geändert hat – bis ein Admin den neuen bestätigt (#594). */
  gesperrt?: { fingerabdruck: string; seit: string } | null;
}

/** Ergebnis je Quelle beim Abrufen. */
export interface Abruf {
  url: string;
  offiziell: boolean;
  katalog: Katalog | null;
  fehler: string | null;
  pruefung?: HerkunftPruefung | null;
}
