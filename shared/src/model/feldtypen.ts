/**
 * Feldarten und Verweisarten (#1278, Schritt 5; vorher in felder.ts): ganz unten im Fachmodell, ohne Bezug auf Feld
 * oder Mappentyp – so können die Bedingungen der Ansichten (sichten/bedingungen.ts) die Feldart nennen, ohne dass ein
 * Kreis über das Feld entsteht.
 */
import { t } from '../texte';

export const FELDTYPEN = {
  text: 'Text',
  langtext: 'Langtext',
  /** Markdown (#53): fett, kursiv, Listen, Links, Überschriften, Zitate; nie als HTML ausgeführt. */
  formatiert: 'Formatierter Text',
  zahl: 'Zahl',
  betrag: 'Betrag',
  datum: 'Datum',
  janein: 'Ja/Nein',
  auswahl: 'Auswahlliste',
  referenz: 'Verweis',
  /** Verschlüsselt gespeichert (#46); nie in Titel, Trefferliste, Suche, Protokoll oder Demo-Daten. */
  passwort: 'Passwort',
  /** Zahl und Einheit (#1035): „3 Monate“, gespeichert als `{ anzahl, einheit }` (feldarten.ts). */
  zeitraum: 'Zeitraum',
  /** Prozentsatz (#1035): „19 %“, gespeichert als Zahl 19 (feldarten.ts). */
  prozent: 'Prozent',
  /**
   * Tabelle (#1030): die Mappen eines anderen Typs, die über ein Verweisfeld hierher verweisen, als Tabelle zwischen den
   * Feldern. Kein eigener Wert – reine Darstellung wie ein Abschnitt (tabelle.ts).
   */
  tabelle: 'Tabelle',
  /**
   * Zusammengesetzt (#1050): schreibgeschützt aus anderen Feldern dieser Mappe nach der Vorlage `vorlage` (Platzhalter
   * und Filter wie die Titel-Vorlage), auf Wunsch eindeutig als Kombination. Gespeichert der Schlüssel mit den Kennungen
   * verwiesener Mappen, angezeigt der Text mit ihren Titeln (zusammengesetzt.ts).
   */
  zusammengesetzt: 'Zusammengesetzt',
} as const;
export type Feldtyp = keyof typeof FELDTYPEN;

/**
 * Name einer Feldart in der Sprache des Lesers (#1094), aus `gemeinsam.model.feldart.<kennung>`. Die Werte in
 * `FELDTYPEN` sind nur die deutschen Ausgangsnamen; der Test sprachdateien-feldarten prüft, dass jede Feldart in
 * de und en einen Namen hat. Die Kennung (`text`, `betrag` …) bleibt in API, Paketen und Daten immer gleich.
 */
export const feldtypName = (typ: Feldtyp) => t.frei(`gemeinsam.model.feldart.${typ}`);
export const VERWEISARTEN = {
  zugehoerigkeit: 'Zugehörigkeit',
  bezug: 'Bezug',
} as const;
export type Verweisart = keyof typeof VERWEISARTEN;
