/**
 * Aufträge an Leistungen (#1569): direkt (`leistung.abrufen`, wartet auf das Ergebnis) oder im Hintergrund
 * (`leistung.beauftragen`, danach Ereignis `leistung.fertig` bzw. `leistung.fehlgeschlagen`). Gemeinsam für Server und
 * Oberfläche: Zustände, Antworten, Fehlercodes, Aufbewahrung.
 */
import { KATALOG_SEITE } from '../pakete';
import type { Datei } from './schema';
import type { Leistungsname } from './katalog';

/** Zustand eines Auftrags. `unterbrochen`: Auftrag mit Wirkung nach außen lief beim Neustart – nicht wiederholt. */
export type Auftragszustand = 'wartet' | 'laeuft' | 'fertig' | 'fehlgeschlagen' | 'angehalten' | 'unterbrochen';

/** Wie lange abgeschlossene Aufträge sichtbar bleiben (Stunden); Vorgabe 48. */
const AUFBEWAHRUNG_STUNDEN = [24, 48, 96] as const;
export type Aufbewahrung = (typeof AUFBEWAHRUNG_STUNDEN)[number];
export const AUFBEWAHRUNG_VORGABE: Aufbewahrung = 48;
export const istAufbewahrung = (x: unknown): x is Aufbewahrung => (AUFBEWAHRUNG_STUNDEN as readonly unknown[]).includes(x);

/** Eindeutige Antworten, wenn ein Auftrag nicht angenommen wird oder scheitert (Code der API, `leistung.<code>`). */
export type Fehlercode =
  | 'unbekannt'
  | 'eingabe-ungueltig'
  | 'ausgabe-ungueltig'
  | 'kein-anbieter'
  | 'kein-schreibrecht'
  | 'kein-leserecht'
  | 'ziel-noetig'
  | 'nur-verwaltung'
  | 'zeitgrenze'
  | 'anbieter-fehler'
  | 'abgebrochen';

/**
 * Warum es keinen Anbieter gibt: keiner kann es, er ist ausgeschaltet, er kann diesen Dateityp nicht, oder die Eingabe
 * liegt außerhalb dessen, was er meldet (Einschränkung, #1570).
 */
export type KeinAnbieterGrund = 'keiner' | 'aus' | 'dateityp' | 'eingabe';

/** Adresse der Leistung im Katalog (dms-registry): dort steht, welche Pakete sie anbieten. */
export const katalogAdresse = (n: Leistungsname) => `${KATALOG_SEITE}leistungen/${encodeURIComponent(n)}`;

/** Wo das Ergebnis abgelegt wird: als neues Dokument in einer Mappe (Register wie beim Hochladen; ohne: „dokumente“). */
export interface Ziel {
  mappe: string;
  register?: string;
}

/** Anfrage an `leistung.abrufen` / `leistung.beauftragen`. */
export interface Leistungsanfrage {
  eingabe: Record<string, unknown>;
  /** Kommt unverändert zurück (höchstens `KONTEXT_MAX` Zeichen als JSON). */
  kontext?: unknown;
  ziel?: Ziel;
}
export const KONTEXT_MAX = 4096;

/** Ergebnis eines Auftrags. */
export interface Leistungsergebnis {
  auftrag: string;
  leistung: Leistungsname;
  zustand: Auftragszustand;
  /** Wer es gemacht hat (Kennung des Anbieters). */
  anbieter: string | null;
  daten?: Record<string, unknown>;
  /** Das abgelegte Dokument (mit Ziel). */
  dokument?: string;
  kontext?: unknown;
  fehler?: { code: Fehlercode; text: string };
}

/** Was Ablago selbst von einer Leistung zurückbekommt (#1570): wie jeder Auftraggeber, dazu die Datei im Prozess. */
export interface InternesErgebnis {
  anbieter: string;
  daten: Record<string, unknown>;
  datei?: Datei;
  /**
   * Nur von eingebauten Anbietern: was Ablago über die Leistung hinaus für dasselbe Ergebnis wie bisher braucht (z. B.
   * Seitentexte der Textebene). Ein Paket liefert das nie; Aufrufer kommen ohne aus.
   */
  intern?: Record<string, unknown>;
}

/**
 * Der Weg, auf dem Ablago selbst Leistungen abruft (#1570, `kern.leistung`). `intern` geht nur an eingebaute Anbieter
 * (z. B. eine schon gebaute Vorlage, damit das Ergebnis gleich bleibt); `signal` bricht ab.
 */
export type Leistungsweg = (
  name: Leistungsname,
  eingabe: Record<string, unknown>,
  o?: { intern?: Record<string, unknown>; signal?: AbortSignal },
) => Promise<InternesErgebnis>;
