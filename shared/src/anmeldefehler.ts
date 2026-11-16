/**
 * Fehler der Anmeldung über einen Anbieter (OIDC, #241, #1263): Der Server leitet nur mit einem dieser festen Codes auf
 * `/?anmeldefehler=<code>` zurück, den Text nimmt die Anmeldeseite aus den Sprachdateien (`anmeldung.anbieterfehler.*`).
 * So kann kein Link einen beliebigen Satz auf der echten Anmeldeseite zeigen. Unbekannte Codes zeigen den allgemeinen
 * Text; die Einzelheiten stehen im Protokoll für die Verwaltung.
 */
export const ANMELDEFEHLER = [
  'nicht-eingerichtet',
  'anbieter-nicht-erreichbar',
  'abgelaufen',
  'anderer-browser',
  'abgelehnt',
  'token-ungueltig',
  'email-fehlt',
  'kein-konto',
  'deaktiviert',
  'wartung',
  'unbekannt',
] as const;
export type Anmeldefehler = (typeof ANMELDEFEHLER)[number];

/** Ein bekannter Code – alles andere (auch ein beliebiger Text in der Adresse) wird „unbekannt“. */
export const anmeldefehlerCode = (roh: unknown): Anmeldefehler =>
  (ANMELDEFEHLER as readonly unknown[]).includes(roh) ? (roh as Anmeldefehler) : 'unbekannt';
