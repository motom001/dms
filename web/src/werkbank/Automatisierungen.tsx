/**
 * Werkbank → Ablage aufbauen → Automatisierungen (#675): Mitte die Liste (Name, Kurzform, an/aus, letzter Lauf,
 * Herkunft; „nach Auslöser“ mit Reihenfolge zum Umsortieren), rechts der Editor mit Wenn · Und · Dann · Sonst wie bei Homey –
 * Karten aus dem Vorrat hineinziehen oder mit „+ Karte“ per Tastatur hinzufügen, aufklappen zum Einstellen, zuklappen
 * zur Kurzzeile. Darunter Wiedergeben (auch trocken), der Verlauf mit Live-Fortschritt und der Änderungsverlauf.
 * Sonst (#677): dieselben Karten wie Dann, wenn die Bedingungen nicht zutreffen. Werkbank-Karten (#677): Wenn „Fehler
 * gemeldet“, „Protokollmeldung“, „Neue Version verfügbar“ (ohne Mappe) und Dann „Sicherung anstoßen“. „Aufruf von
 * außen“ (#679): Parameter an der Karte, Adresse und Geheimnis darunter (`AutomatisierungAufruf.tsx`). Nach außen
 * (#671): Dann „URL aufrufen“ und „E-Mail senden“, Zustellungen und Ziele nach außen (`AutomatisierungAussen.tsx`).
 */

/** Seit #1279 in Teilen unter automatisierungen/ (Liste, Editor, Wenn, Und, Dann, Verlauf); diese Datei bleibt die Tür. */
export { AutomatisierungenListe } from './automatisierungen/liste';
export { AutomatisierungEditor } from './automatisierungen/editor';
export { automatisierungWarnungen, useAutomatisierungen } from './automatisierungen/zustand';
