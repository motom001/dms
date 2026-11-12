/** Der Kern (#961) – die einzige Tür: Fachbereiche und der Dienst importieren nur von hier. */
export { Kern, PAPIERKORB_STANDARD_TAGE, type FassungsAnschluss, type FassungsKontext, type KernOptionen, type LeserechtAufZeit, type SystemIds, type Zugreifender, type Zugriff } from './kern';
export { ANLASS_TIEFE, Anlaesse, Anschlusspunkt, type AnlassName, type BenutzerGespiegelt, type Empfaenger, type MappeGeaendert, type TypAngelegt, type TypGeaendert } from './anlaesse';
export { ABO_ARTEN, Historie } from './historie';
export { dokInfo, Loeschprotokoll, versionInfo, type Anlass, type ProtokollMappe, type ProtokollTeil } from './loeschprotokoll';
