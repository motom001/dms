/** Mappen (#1074) – die einzige Tür: Dienst und Fachordner importieren nur von hier. */
export { MappenDienst, type MappenAnschluss, type MappenTeile } from './mappen.dienst';
export { bereinigeWerte, MappenEingaben, type MappenEingabenAnschluss } from './eingaben';
export { MappenTitel } from './titel';
export { HISTORIE_SEITE_MAX, HISTORIE_STANDARD_TAGE, MappenHistorie } from './historie';
export { keinSchluessel, Passwortfelder, type PasswortfelderAnschluss } from './passwortfelder';
export { ARCHIV_PRAEFIX, archivnummerAus, MappenArchiv, type MappenArchivAnschluss } from './archiv';
export { MappenNotizen, type NotizenAnschluss } from './notizen';
export { geaenderteBerechnete, pruefeBerechnete, type BerechnetAbgelehnt } from './berechnet';
export { darfSchreibschutz, geaenderteGeschuetzte, gesperrteSchreibfelder, organisationsNotizen, pruefeSchreibschutz, type SchreibschutzAbgelehnt } from './schreibschutz';
export { MappenHinweise } from './hinweise';
