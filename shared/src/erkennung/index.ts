/**
 * Erkennung im Kern (#336, #391): Angaben aus dem Volltext eines Dokuments lesen und gegen die
 * Felder eines Mappentyps legen – offline, ohne KI, nur mit Mustern und dem Abgleich mit vorhandenen
 * Mappen. Dieselben reinen Funktionen dienen „Vorschläge beim Zuordnen“ (Post → Absender, Angaben,
 * Zielmappe) und „Aus Dokument ausfüllen“ (Dokument → Felder einer Mappe).
 *
 * Welche Felder die Erkennung nutzt, legt der Mappentyp fest: Feld-Eigenschaft „Aus Dokument füllen“
 * (`Feld.erkennung`, bis #938 „Für die Erkennung nutzen“) mit optionaler Art (was im Feld steht) und
 * Erkennungshinweis. Ohne Art ergibt sie sich aus Feldart, Kennung und Bezeichnung (z. B. „E-Mail“ → E-Mail).
 * Über welche Werte Ablago vorhandene Mappen wiederfindet, sagt der eigene Haken „Zum Wiederfinden nutzen“
 * (`Feld.wiederfinden`, #938); den Abgleich mit Belegen macht `gleicheAb`.
 *
 * Für Engines aus Paketen (#511, später) beschreibt `schemaFuer` die Felder als JSON Schema;
 * `pruefeVorschlaege` prüft jede Antwort gegen die Feldtypen, bevor etwas angezeigt wird.
 *
 * Seit #1278 nach Aufgabe aufgeteilt (vorher eine Datei `shared/src/erkennung.ts`); diese Datei reicht alles weiter,
 * damit Importe von `…/shared/src/erkennung` gleich bleiben.
 */
export * from './arten';
export * from './angaben';
export * from './abgleich';
export * from './vorschlaege';
export * from './schema';
export * from './nummern';
export * from './zeitraum';
