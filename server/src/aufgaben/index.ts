/** Aufgaben (#1078) – die einzige Tür: Dienst und Fachordner importieren nur von hier. */
export { AufgabenDienst } from './aufgaben.dienst';
export type { AufgabenAnschluss, AufgabenKonten, AblaufPlatzhalter } from './anschluss';
export type { AufgabenTeile } from './aufgaben-teile';
export { AufgabenVertretung, SAMMEL_MAX } from './vertretung';
export { SAMMEL_WEITERGABE } from './vertretung-teil';
export { OhneLeserecht } from './ohne-leserecht';
export { Fristen, NAECHSTER_TERMIN_ERST_TAGE, type FristenStaende } from './fristen';
export { OhneEmpfaenger, taugtAlsAufgabenEmpfaenger } from './ohne-empfaenger';
export { MappenAblaeufe, type PaketAblaufvorlage } from './ablaeufe';
