/**
 * Notfallkontakte (#812): Vertrauenspersonen, die wissen sollen, dass es die Ablage gibt – ohne Konto, ohne Rechte,
 * ohne Link. Sie stehen auf dem Notfallblatt unter „Wen fragen?“ und bekommen eine kurze Info-Mail. Server und
 * Oberfläche teilen diese Datei (Grenzen, Prüfung der Eingaben, gekürzte Adresse fürs Protokoll).
 *
 * Durchsicht Sicherheit (12.11.2026) – hier umgesetzt:
 * - Höchstens `NOTFALLKONTAKTE_MAX` Kontakte, höchstens `NOTFALLKONTAKT_MAILS_JE_TAG` Mails je Ablage und Tag.
 * - Namen in der Mail: ohne Steuer- und Formatzeichen, ohne Zeilenumbrüche, höchstens `NOTFALLKONTAKT_NAME_MAX`
 *   Zeichen (`mailName`). Ein Name, den ein Mailprogramm zum Link machen könnte (`://`, `www.`, `@`), wird beim
 *   Speichern abgelehnt (`linkartig`).
 * - Im Protokoll steht die Adresse nur gekürzt (`gekuerzteAdresse`).
 */
import { istEmail } from './model';

export const NOTFALLKONTAKTE_MAX = 10;
/** Info-Mails an Notfallkontakte je Ablage und Tag, über alle Prozesse gezählt (Kurzzustand). */
export const NOTFALLKONTAKT_MAILS_JE_TAG = 20;
export const NOTFALLKONTAKT_NAME_MAX = 60;
export const NOTFALLKONTAKT_EMAIL_MAX = 254;
export const NOTFALLKONTAKT_TELEFON_MAX = 40;
/** Die Notiz steht auf dem Notfallblatt (eine Seite A4) – kurz halten. */
export const NOTFALLKONTAKT_NOTIZ_MAX = 120;

/** Stand der Info-Mail: noch nicht verschickt (kein Versand eingerichtet), verschickt, Fehler beim Versand. */
export type NotfallMailStand = 'offen' | 'verschickt' | 'fehler';

export interface Notfallkontakt {
  id: string;
  name: string;
  email: string;
  telefon: string;
  notiz: string;
  /** „Antworten an meine E-Mail-Adresse“: Reply-To auf die eintragende Person – Vorgabe aus. */
  antwortAn: boolean;
  /** Wer den Kontakt eingetragen hat (Benutzer-Id) und sein Name zum Zeitpunkt des Eintragens. */
  eingetragenVon: string | null;
  eingetragenVonName: string;
  mailStand: NotfallMailStand;
  mailAm: string | null;
  mailFehler: string | null;
  erstellt: string;
  geaendert: string;
}

/** Was die Werkbank zu den Kontakten zeigt. */
export interface NotfallkontakteStand {
  kontakte: Array<Notfallkontakt & { erneutMoeglich: boolean }>;
  max: number;
  /** E-Mail-Versand eingerichtet? Sonst: „wird verschickt, sobald E-Mail eingerichtet ist“. */
  versand: boolean;
  /** Seit dem letzten Notfallblatt geändert: „Notfallblatt neu ausdrucken“. */
  blattVeraltet: boolean;
}

/** Eingabe beim Anlegen und Ändern. */
export interface NotfallkontaktEingabe { name: string; email: string; telefon: string; notiz: string; antwortAn: boolean }

/** Steuer-, Format- und Trennzeichen (auch Zeilenumbrüche, Richtungszeichen, Zeichen ohne Breite). */
const UNSICHTBAR = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** Ein Name, wie er in eine Mail (auch in den Betreff) kommt: eine Zeile, ohne Steuerzeichen, höchstens 60 Zeichen. */
export const mailName = (s: string): string => [...s.replace(UNSICHTBAR, ' ').replace(/\s+/g, ' ').trim()].slice(0, NOTFALLKONTAKT_NAME_MAX).join('').trim();

/** Würde ein Mailprogramm daraus einen Link machen? Dann gehört es nicht in einen Namen. */
export const linkartig = (s: string): boolean => /:\/\/|www\.|@/i.test(s.replace(UNSICHTBAR, ''));

/** Für das Protokoll: `lena@example.org` → `l***@example.org`. */
export function gekuerzteAdresse(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${[...email.slice(0, at)][0]}***${email.slice(at)}`;
}

/** Fehlerschlüssel (Sprachdatei `meldungen.notfallkontakte.*`) einer Eingabe – leer, wenn alles passt. */
export type EingabeFehler = 'name-leer' | 'name-lang' | 'name-link' | 'email' | 'telefon-lang' | 'notiz-lang';

/** Eingabe bereinigen und prüfen (Server und Oberfläche gleich). */
export function pruefeNotfallkontakt(e: unknown): { wert: NotfallkontaktEingabe; fehler: EingabeFehler[] } {
  const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const zeile = (v: unknown) => text(v).replace(UNSICHTBAR, ' ').replace(/\s+/g, ' ').trim();
  const rohName = zeile(x.name);
  const wert: NotfallkontaktEingabe = {
    name: rohName,
    email: zeile(x.email).toLowerCase(),
    telefon: zeile(x.telefon),
    notiz: zeile(x.notiz),
    antwortAn: x.antwortAn === true,
  };
  const fehler: EingabeFehler[] = [];
  if (!wert.name) fehler.push('name-leer');
  else if ([...wert.name].length > NOTFALLKONTAKT_NAME_MAX) fehler.push('name-lang');
  if (linkartig(text(x.name))) fehler.push('name-link');
  if (!istEmail(wert.email) || wert.email.length > NOTFALLKONTAKT_EMAIL_MAX) fehler.push('email');
  if ([...wert.telefon].length > NOTFALLKONTAKT_TELEFON_MAX) fehler.push('telefon-lang');
  if ([...wert.notiz].length > NOTFALLKONTAKT_NOTIZ_MAX) fehler.push('notiz-lang');
  return { wert, fehler };
}

/** Wie erreichbar – für das Notfallblatt: Telefon und E-Mail. */
export const erreichbar = (k: Pick<Notfallkontakt, 'telefon' | 'email'>) => [k.telefon, k.email].filter(Boolean).join(' · ');

/**
 * Was davon auf dem Notfallblatt steht, als Fingerabdruck: Ändert er sich nach dem Herunterladen, ist das Blatt
 * veraltet („Notfallblatt neu ausdrucken“). Ohne Kontakte ist er leer – so gilt ein Blatt aus der Zeit vor #812 als
 * aktuell, solange niemand Kontakte einträgt.
 */
export function blattFingerabdruck(kontakte: Array<Pick<Notfallkontakt, 'name' | 'telefon' | 'email' | 'notiz'>>): string {
  if (!kontakte.length) return '';
  const s = JSON.stringify(kontakte.map((k) => [k.name, k.telefon, k.email, k.notiz]));
  // FNV-1a, 32 Bit, zweimal mit anderem Startwert: Es geht nur um „hat sich etwas geändert“, nicht um Geheimhaltung.
  const fnv = (start: number) => { let h = start; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  return fnv(0x811c9dc5) + fnv(0x01000193);
}
