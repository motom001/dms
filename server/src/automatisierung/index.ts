/**
 * Automatisierungen – Fachordner (#960, #679, #671). Der Motor liegt noch in `server/src/automatisierung.ts`; hier die
 * Tür zum „Aufruf von außen“ (Adresse, Geheimnis, Signatur, Bremse) und zu den Karten nach außen (Ausgangskorb, Ziele,
 * Geheimnisse, sicherer Abruf). Die Routen holt routen.ts direkt.
 */
export { Aufrufe, aufrufBereich, aufrufSignatur, pgAufrufRepo, signaturPasst, speicherAufrufRepo, type AufrufAnfrage, type AufrufDeps, type AufrufEintrag, type AufrufErgebnis, type AufrufRepo, type AufrufStand } from './aufruf';
export {
  Ausleitung, aussenSignatur, pgAusgangRepo, pgAussenGeheimnisRepo, signierterInhalt, speicherAusgangRepo, speicherAussenGeheimnisRepo, ZIELE_SCHLUESSEL,
  type AusgangAuftrag, type AusgangEintrag, type AusgangRepo, type AusgangVerlauf, type AusleitungDeps, type AussenGeheimnis, type AussenGeheimnisRepo,
} from './ausleitung';
export { adressArt, adresseErlaubt, alsIpv4, sichererAbruf, type AbrufAuftrag, type AbrufErgebnis, type SichererAbruf } from './sicherer-abruf';
