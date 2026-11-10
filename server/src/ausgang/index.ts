/** Ausgang (#1077) – die einzige Tür: Dienst und Fachordner importieren nur von hier. */
export { AusgangDienst, type AusgangAnschluss, type AusgangTeile } from './ausgang.dienst';
export { AusgangEmail, EMAIL_MAX_EMPFAENGER, EMAIL_MAX_MAPPEN, type EmailAnschluss, type EmailTeile } from './email';
export { AusgangExport, type ExportAnschluss, type ExportTeile } from './export';
export { AUSGAENGE, mitnehmbar, pruefeAlle, sichtVerboten, verboten, type Ausgang, type Ausgangsrechte } from './pruefstelle';
