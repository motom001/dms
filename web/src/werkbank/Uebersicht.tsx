/**
 * Werkbank → Übersicht (#68, #816) – Tür zu uebersicht/ (#1279): Meldungen, Zustand, Liste und Seite mit Kacheln,
 * „Zur Kenntnis nehmen“ und die Leiste der Werkbank stehen dort in Teilen.
 */
export { hinweiseAus, type Hinweis } from './uebersicht/hinweise';
export { useUebersicht, type UebersichtZustand } from './uebersicht/zustand';
export { UebersichtListe, UebersichtPanel } from './uebersicht/Uebersicht';
export { WerkbankNavigation, type WerkbankEintrag } from './uebersicht/WerkbankNavigation';
export { GRUPPEN, type Gruppe } from '../../../shared/src/werkbankansicht';
