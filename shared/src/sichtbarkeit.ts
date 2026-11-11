/**
 * Sichtbarkeit einer Mappe, auf die etwas verweist (#888): Erwähnungen, „angelegt von“ und andere Namen von Benutzern
 * – und mit #889 Erwähnungen beliebiger Mappen. Server und Oberfläche teilen diese Datei.
 *
 * - `sichtbar`: Die Person darf die Mappe lesen.
 * - `verborgen`: Die Mappe gibt es, die Person darf sie nicht lesen – Anzeige „Benutzer (nicht sichtbar)“ bzw.
 *   „Mappe (nicht sichtbar)“, ohne Namen oder Titel.
 * - `geloescht`: Die Mappe gibt es nicht (mehr) oder sie liegt im Papierkorb.
 *
 * Mehr verrät die Antwort nicht als heute schon ein Verweisfeld (#124: „nicht sichtbare Mappe“) und das Öffnen einer
 * Mappe (404 mit `verborgen`): Gefragt wird nur nach Ids, die die Person schon kennt; Titel, Namen und Mappentyp
 * gehen nie hinaus.
 */
export type Sichtbarkeit = 'sichtbar' | 'verborgen' | 'geloescht';

/** Höchstens so viele Ids je Anfrage (`POST /api/mappen/sichtbarkeit`); mehr schneidet der Server ab. */
export const SICHTBARKEIT_MAX = 200;
