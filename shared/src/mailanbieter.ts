/**
 * Gängige Mailanbieter für den E-Mail-Versand (#813): Server, Port und Verbindungsart aus der Domain der
 * Adresse – ohne Netzaufruf. Dazu je Anbieter Hinweise, wo es erfahrungsgemäß klemmt (Versand erst
 * freischalten, App-Passwort, Anmeldung über OAuth), mit Link zur Hilfe des Anbieters.
 *
 * Eigene Domains (z. B. bei IONOS, Strato, Microsoft 365, Google Workspace) erkennt der Server über den
 * MX-Eintrag der Domain (siehe server/src/mail/mailsuche.ts); dafür steht hier `mx`.
 * Die Texte der Hinweise stehen in shared/src/sprachen/de/werkbank/postfaecher.json.
 */

export type MailVerbindung = 'starttls' | 'ssl' | 'keine';
export type OAuthVersandAnbieter = 'microsoft' | 'google';

export type MailAnbieterId =
  'gmx' | 'webde' | 'tonline' | 'gmail' | 'outlook' | 'microsoft365' | 'icloud' | 'posteo' | 'mailboxorg' | 'ionos' | 'strato';

export interface MailHinweis {
  /** Schlüssel im Bereich werkbank (Datei werkbank/postfaecher.json). */
  text: string;
  /** Hilfe des Anbieters. */
  link?: string;
}

export interface MailAnbieter {
  id: MailAnbieterId;
  name: string;
  host: string;
  port: number;
  verbindung: MailVerbindung;
  /** Domains der Adressen (ohne Subdomains). */
  domains: string[];
  /** Endungen von MX-Servern, an denen man eine eigene Domain bei diesem Anbieter erkennt. */
  mx?: string[];
  hinweise: MailHinweis[];
  /** Anmeldung über OAuth möglich (Microsoft 365, Google). */
  oauth?: OAuthVersandAnbieter;
}

const FREISCHALTEN = 'werkbank.mail.hinweis.freischalten';
const APP_PASSWORT = 'werkbank.mail.hinweis.app-passwort';

export const MAIL_ANBIETER: MailAnbieter[] = [
  {
    id: 'gmx',
    name: 'GMX',
    host: 'mail.gmx.net',
    port: 587,
    verbindung: 'starttls',
    domains: ['gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'gmx.com'],
    hinweise: [{ text: FREISCHALTEN, link: 'https://hilfe.gmx.net/pop-imap/einschalten.html' }],
  },
  {
    id: 'webde',
    name: 'WEB.DE',
    host: 'smtp.web.de',
    port: 587,
    verbindung: 'starttls',
    domains: ['web.de'],
    hinweise: [{ text: FREISCHALTEN, link: 'https://hilfe.web.de/pop-imap/einschalten.html' }],
  },
  {
    id: 'tonline',
    name: 'T-Online',
    host: 'securesmtp.t-online.de',
    port: 465,
    verbindung: 'ssl',
    domains: ['t-online.de', 'magenta.de'],
    hinweise: [{ text: 'werkbank.mail.hinweis.tonline' }],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    verbindung: 'ssl',
    domains: ['gmail.com', 'googlemail.com'],
    mx: ['google.com', 'googlemail.com'],
    oauth: 'google',
    hinweise: [{ text: APP_PASSWORT, link: 'https://support.google.com/accounts/answer/185833' }],
  },
  {
    id: 'outlook',
    name: 'Outlook.com',
    host: 'smtp-mail.outlook.com',
    port: 587,
    verbindung: 'starttls',
    domains: ['outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'msn.com'],
    oauth: 'microsoft',
    hinweise: [
      {
        text: 'werkbank.mail.hinweis.microsoft',
        link: 'https://learn.microsoft.com/de-de/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission',
      },
    ],
  },
  {
    id: 'microsoft365',
    name: 'Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    verbindung: 'starttls',
    domains: [],
    mx: ['mail.protection.outlook.com'],
    oauth: 'microsoft',
    hinweise: [
      {
        text: 'werkbank.mail.hinweis.microsoft',
        link: 'https://learn.microsoft.com/de-de/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission',
      },
    ],
  },
  {
    id: 'icloud',
    name: 'iCloud',
    host: 'smtp.mail.me.com',
    port: 587,
    verbindung: 'starttls',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    hinweise: [{ text: APP_PASSWORT, link: 'https://support.apple.com/de-de/102654' }],
  },
  {
    id: 'posteo',
    name: 'Posteo',
    host: 'posteo.de',
    port: 587,
    verbindung: 'starttls',
    domains: ['posteo.de', 'posteo.net', 'posteo.org', 'posteo.eu', 'posteo.at', 'posteo.ch'],
    hinweise: [],
  },
  {
    id: 'mailboxorg',
    name: 'mailbox.org',
    host: 'smtp.mailbox.org',
    port: 465,
    verbindung: 'ssl',
    domains: ['mailbox.org'],
    mx: ['mailbox.org'],
    hinweise: [],
  },
  {
    id: 'ionos',
    name: 'IONOS',
    host: 'smtp.ionos.de',
    port: 587,
    verbindung: 'starttls',
    domains: [],
    mx: ['ionos.de', 'kundenserver.de'],
    hinweise: [],
  },
  { id: 'strato', name: 'Strato', host: 'smtp.strato.de', port: 465, verbindung: 'ssl', domains: [], mx: ['rzone.de'], hinweise: [] },
];

/** Server, an die Ablago ein OAuth-Zugriffstoken schickt – nur die des Anbieters selbst. */
export const OAUTH_VERSAND_SERVER: Record<OAuthVersandAnbieter, string[]> = {
  microsoft: ['smtp.office365.com', 'smtp-mail.outlook.com'],
  google: ['smtp.gmail.com'],
};

/** Domain einer Adresse in Kleinbuchstaben; null, wenn es keine Adresse ist. */
export function domainVon(email: string): string | null {
  const m = /^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(email.trim());
  return m ? m[1].toLowerCase().replace(/\.$/, '') : null;
}

const endetAuf = (name: string, endung: string) => name === endung || name.endsWith(`.${endung}`);

/** Anbieter aus der eingebauten Liste für eine Adresse (ohne Netz). */
export function anbieterFuerAdresse(email: string): MailAnbieter | null {
  const d = domainVon(email);
  return d ? (MAIL_ANBIETER.find((a) => a.domains.includes(d)) ?? null) : null;
}

/** Anbieter zu einem MX-Server (eigene Domain bei IONOS, Strato, Microsoft 365, Google …). */
export function anbieterFuerMx(mx: string): MailAnbieter | null {
  const n = mx.toLowerCase().replace(/\.$/, '');
  return MAIL_ANBIETER.find((a) => a.mx?.some((e) => endetAuf(n, e))) ?? null;
}

/** Anbieter zu einem Versandserver (für die Hinweise, wenn der Server anders gefunden wurde). */
export function anbieterFuerServer(host: string): MailAnbieter | null {
  const n = host.toLowerCase();
  return MAIL_ANBIETER.find((a) => a.host === n) ?? null;
}

/** Absender wie im Assistenten vorgeschlagen: „Ablago – {Name der Ablage} <adresse>“. */
export function absenderVorschlag(adresse: string, ablage: string | null | undefined): string {
  const name = `Ablago${ablage?.trim() ? ` – ${ablage.trim()}` : ''}`.replace(/[<>"\r\n]/g, '');
  return `${name} <${adresse.trim()}>`;
}
