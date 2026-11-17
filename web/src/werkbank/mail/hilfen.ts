import type { MailEingabe } from '../../api/betrieb';
import type { MailSuche, Verbindung } from '../../api/einrichtung';

/** Angaben, wie sie im Formular stehen – das Passwort nur im Speicher des Assistenten, nie in sessionStorage. */
export type MailAngaben = Pick<MailEingabe, 'aktiv' | 'host' | 'port' | 'verbindung' | 'benutzer' | 'absender' | 'selbstsigniert'> & {
  passwort: string;
};
export interface MailGriff {
  /** Die sichtbaren Angaben für den Sammelstand (#804) – speichert nichts. */
  sammle(): MailAngaben;
}

export type Feld = 'host' | 'port' | 'verbindung' | 'benutzer' | 'absender' | 'an' | 'aktiv';
export const portFuer = (v: Verbindung) => (v === 'ssl' ? 465 : v === 'starttls' ? 587 : 25);
export const adresseAus = (absender: string, benutzer: string) =>
  /<([^>]+)>\s*$/.exec(absender)?.[1] ?? (benutzer.includes('@') ? benutzer : absender.includes('@') ? absender.trim() : '');
export const QUELLE: Record<NonNullable<MailSuche['fund']>['quelle'], string> = {
  liste: 'werkbank.mail.quelle.liste',
  dns: 'werkbank.mail.quelle.dns',
  mx: 'werkbank.mail.quelle.mx',
  autoconfig: 'werkbank.mail.quelle.autoconfig',
  thunderbird: 'werkbank.mail.quelle.thunderbird',
};
