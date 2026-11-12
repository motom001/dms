/**
 * Automatisierungen – Fachordner (#960, #679). Der Motor liegt noch in `server/src/automatisierung.ts`; hier die Tür
 * zum „Aufruf von außen“ (Adresse, Geheimnis, Signatur, Bremse). Die Routen holt routen.ts direkt.
 */
export { Aufrufe, aufrufBereich, aufrufSignatur, pgAufrufRepo, signaturPasst, speicherAufrufRepo, type AufrufAnfrage, type AufrufDeps, type AufrufEintrag, type AufrufErgebnis, type AufrufRepo, type AufrufStand } from './aufruf';
