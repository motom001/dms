/**
 * Sichten der Ablage (#38) mit Bedingungen (#40, #41).
 *
 * Eine Sicht zeigt Mappen bestimmter Mappentypen, die ihre Bedingungen erfüllen – eine
 * gespeicherte Abfrage. Sichten bilden einen Baum: Eine Elternsicht zeigt ihre eigenen
 * Treffer und die aller Kinder (ohne Doppelte). Server und Oberfläche teilen diese Datei.
 *
 * Seit #1278 nach Aufgabe aufgeteilt (vorher eine Datei `shared/src/sichten.ts`); diese Datei reicht alles weiter,
 * damit Importe von `…/shared/src/sichten` gleich bleiben.
 */
export * from './bedingungen';
export * from './baum';
export * from './felder';
export * from './aufloesen';
export * from './bereinigen';
export * from './trefferlisten';
export * from './auswahlfilter';
/**
 * Platzhalter in `typen` (#725): die Ansicht zeigt Mappen aller Mappentypen, auch künftiger – etwa „Favoriten“
 * mit der Bedingung „ist mein Favorit“. Gespeichert, exportiert und in Paketen steht er so, wie er ist.
 */
export { ALLE_TYPEN } from '../kennungen';
