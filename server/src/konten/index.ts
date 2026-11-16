/**
 * Konten – Fachordner (#1278, vorher `server/src/konten.ts`): Anmeldung, Sitzungen, Verwaltungsmodus,
 * Benutzerverwaltung, Abwesenheit, Notfallcode und Passwort-Links. Die Klasse `Konten` ist eine Kette von Teil-Klassen
 * (basis.ts → … → konten.ts), Regeln und Konstanten stehen in hilfen.ts. Die Routen holt routen.ts direkt.
 */
export { Konten } from './konten';
export { pruefeEmail, pruefePasswortRegeln, schutzGesamt, SITZUNG_TAGE, zaehltAlsGesamt, ZULETZT_LISTE } from './hilfen';
