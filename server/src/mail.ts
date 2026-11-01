import type { Readable } from 'node:stream';
import { t } from './sprache';
/** Anhang einer E-Mail (#58). */
export interface MailAnhang { name: string; mime: string; inhalt: Buffer | Readable }
/** Weitere Angaben einer E-Mail: „Antworten an“ und Anhänge (#58). */
export interface MailOptionen { antwortAn?: string; anhaenge?: MailAnhang[] }
export interface Mailer { sende(an: string, betreff: string, text: string, optionen?: MailOptionen): Promise<void> }

/**
 * Mail an alle aktiven Administratoren mit echter Adresse (Notfallzugang #108, Sicherung #105).
 * Ohne eingerichteten Versand geschieht nichts; liefert die Anzahl verschickter Mails.
 */
export async function anAlleAdmins(benutzer: Array<{ email: string; rolle: string; aktiv: boolean }>, mailer: Mailer | null, betreff: string, text: string): Promise<number> {
  if (!mailer) return 0;
  let n = 0;
  for (const b of benutzer) {
    if (!b.aktiv || b.rolle !== 'admin' || !b.email || b.email.endsWith('.invalid')) continue;
    await mailer.sende(b.email, betreff, text);
    n++;
  }
  return n;
}

/** Gerüst der Mails an Benutzer: Anrede, Absätze, Leerzeile am Ende. */
const brief = (name: string, ...absaetze: string[]) => `${[t('mail.hallo', { name }), ...absaetze].join('\n\n')}\n`;

/** Mails rund um den eigenen Zugang; Texte im Bereich `mail` der Sprachdateien (#473). */
export const mailtexte = {
  emailGeaendert: (name: string, alt: string, neu: string) => ({
    betreff: t('mail.email-geaendert.betreff'),
    text: brief(name || alt, t('mail.email-geaendert.text', { alt, neu }), t('mail.nicht-du')),
  }),
  passwortGeaendert: (name: string, email: string) => ({
    betreff: t('mail.passwort-geaendert.betreff'),
    text: brief(name || email, t('mail.passwort-geaendert.text'), t('mail.nicht-du')),
  }),
  einladung: (name: string, email: string, link: string, tage: number) => ({
    betreff: t('mail.einladung.betreff'),
    text: brief(name || email, t('mail.einladung.text'), t('mail.einladung.mit', { email }),
      `${t('mail.einladung.link', { dauer: t('mail.dauer.tage', { anzahl: tage }) })}\n${link}`),
  }),
  zuruecksetzen: (name: string, email: string, link: string, stunden: number) => ({
    betreff: t('mail.zuruecksetzen.betreff'),
    text: brief(name || email, t('mail.zuruecksetzen.text'),
      `${t('mail.zuruecksetzen.link', { dauer: t('mail.dauer.stunden', { anzahl: stunden }) })}\n${link}`, t('mail.zuruecksetzen.ignorieren')),
  }),
};
