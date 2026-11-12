import type { Readable } from 'node:stream';
import { mitSpracheVon, t } from './sprache';
import { darfBereich, hatGesamt } from '../../shared/src/verwaltungsrecht';
/** Anhang einer E-Mail (#58). */
export interface MailAnhang { name: string; mime: string; inhalt: Buffer | Readable }
/**
 * Weitere Angaben einer E-Mail: „Antworten an“ und Anhänge (#58). `anImProtokoll` (#812): So steht der Empfänger im
 * Protokoll – etwa gekürzt (`l***@example.org`) bei Mails an Dritte, deren volle Adresse nicht ins Protokoll gehört.
 */
export interface MailOptionen { antwortAn?: string; anhaenge?: MailAnhang[]; anImProtokoll?: string }
export interface Mailer { sende(an: string, betreff: string, text: string, optionen?: MailOptionen): Promise<void> }

/**
 * Mail an Personen mit Verwaltungsrecht und echter Adresse (Notfallzugang #108, Sicherung #105; #818 statt „an die
 * Administratoren“): mit `bereich` an alle, die diesen Werkbank-Bereich verwalten (auch „Gesamte Verwaltung“), ohne an
 * alle mit „Gesamte Verwaltung“. Ohne eingerichteten Versand geschieht nichts; liefert die Anzahl verschickter Mails.
 */
/** Text einer Mail: fertig oder erst je Empfänger gebildet – dann in dessen Sprache (#729). */
export type MailText = string | (() => string);
export const mailText = (x: MailText) => (typeof x === 'function' ? x() : x);

export async function anVerwaltende(benutzer: Array<{ email: string; aktiv: boolean; verwaltung?: string[]; art?: string; sprache?: string | null }>, mailer: Mailer | null, betreff: MailText, text: MailText, bereich?: string): Promise<number> {
  if (!mailer) return 0;
  let n = 0;
  for (const b of benutzer) {
    if (!b.aktiv || !(bereich ? darfBereich(b, bereich) : hatGesamt(b)) || !b.email || b.email.endsWith('.invalid')) continue;
    const [bt, tx] = mitSpracheVon(b, () => [mailText(betreff), mailText(text)]);
    await mailer.sende(b.email, bt, tx);
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
  /** #818: an alle mit „Gesamte Verwaltung“, wenn sich Verwaltungsrechte ändern. */
  verwaltungsrecht: (person: string, vorher: string, nachher: string, von: string) => ({
    betreff: t('mail.verwaltungsrecht.betreff', { person }),
    text: `${[t('mail.verwaltung.anrede'), t('mail.verwaltungsrecht.text', { person, vorher, nachher, von }), t('mail.nicht-du')].join('\n\n')}\n`,
  }),
  /**
   * #815: Notfallzugang benutzt – an die bisherige Adresse des Kontos und an alle mit Verwaltungsrecht, bevor sich etwas
   * ändert. Nennt die API-Schlüssel des Kontos (sie bleiben gültig).
   */
  notfallBenutzt: (konto: string, email: string, datum: string, ip: string, apiSchluessel: number) => ({
    betreff: t('mail.notfall.benutzt.betreff'),
    text: `${[t('mail.verwaltung.anrede'), t('mail.notfall.benutzt.text', { datum, konto, email, ip }),
      ...(apiSchluessel ? [t('mail.notfall.benutzt.api', { anzahl: apiSchluessel })] : []), t('mail.notfall.benutzt.nicht-du')].join('\n\n')}\n`,
  }),
  /** #815: gebündelt, höchstens einmal je Stunde, an alle mit Verwaltungsrecht. */
  notfallFehlversuche: (anzahl: number, ip: string) => ({
    betreff: t('mail.notfall.fehlversuche.betreff'),
    text: `${[t('mail.verwaltung.anrede'), t('mail.notfall.fehlversuche.text', { anzahl, ip }), t('mail.notfall.fehlversuche.rat')].join('\n\n')}\n`,
  }),
  zuruecksetzen: (name: string, email: string, link: string, stunden: number) => ({
    betreff: t('mail.zuruecksetzen.betreff'),
    text: brief(name || email, t('mail.zuruecksetzen.text'),
      `${t('mail.zuruecksetzen.link', { dauer: t('mail.dauer.stunden', { anzahl: stunden }) })}\n${link}`, t('mail.zuruecksetzen.ignorieren')),
  }),
};
