/**
 * Einrichtung und Nachweise als Daten für Pakete (#1053, #1054). Schicht 3. Die Quellen und Routen stehen in
 * paketdaten.routen.ts (dort darf die HTTP-Schicht die Dienste einbinden); das Journal liegt als Basis in
 * nachweisjournal.ts, weil viele Fachordner hineinschreiben.
 */
export { einrichtung, nurRechner, type EinrichtungQuellen } from './einrichtung';
export { nachweise, monatsGrenzen, type NachweisQuellen } from './nachweise';
export { liesEintraege, vergleiche, wertText, VERGLEICH_MAX } from './vergleich';
