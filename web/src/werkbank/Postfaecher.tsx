/**
 * Werkbank → Postfächer (#196, #358) – Tür zu postfach/ (#1279): Liste, Editor mit seinen Bereichen, Verbindung und die
 * Anmeldung per OAuth 2.0 (auch für den E-Mail-Versand) stehen dort in Teilen und Hooks.
 */
export { usePostfaecher, useRueckkehr } from './postfach/zustand';
export type { Meldung } from './postfach/hilfen';
export { PostfaecherListe } from './postfach/PostfaecherListe';
export { PostfachEditor } from './postfach/PostfachEditor';
export { OAuthBereich } from './postfach/OAuthBereich';
