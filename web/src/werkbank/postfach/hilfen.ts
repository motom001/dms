import { t } from '../../sprache';
import type { OAuthAnbieter, PostfachAnsicht, PostfachEingabe } from '../../api/eingaenge';
import { gebietsschema } from '../../../../shared/src/sprache';
import type { BereichListe } from '../../bausteine';

/**
 * Werkbank → Postfächer (#196): Mails per IMAP abholen, jede Mail wird neue Post.
 * Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt.
 */

export const zeit = (iso: string) => new Date(iso).toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' });
export const NEU: PostfachEingabe = {
  name: '',
  aktiv: true,
  server: '',
  port: 993,
  verschluesselung: 'ssl',
  benutzer: '',
  passwort: '',
  ordner: 'INBOX',
  abstand: 5,
  fuer: null,
  absender: '',
  nachher: 'verschieben',
  zielordner: 'Ablago',
  nurMitAnhang: false,
  original: true,
  anmeldung: 'passwort',
  anbieter: 'microsoft',
};
export const PORT = { ssl: 993, starttls: 143, keine: 143 } as const;
/** OAuth 2.0 (#358): Voreinstellungen je Anbieter. */
export const ANBIETER: Record<OAuthAnbieter, { name: string; server: string; geraet: boolean }> = {
  microsoft: { name: t('werkbank.postfaecher.microsoft-365-outlook-com'), server: 'outlook.office365.com', geraet: true },
  google: { name: t('werkbank.postfaecher.gmail-google-workspace'), server: 'imap.gmail.com', geraet: false },
  andere: { name: t('werkbank.postfaecher.anderer-anbieter'), server: '', geraet: true },
};
export type Meldung = { art: 'gut' | 'schlecht' | 'info'; text: string };
/** Feste Fehlercodes der Rückkehr (#358) – Text nie aus der Adresse übernehmen. */
export const RUECKRUF_FEHLER: Record<string, string> = {
  abgelaufen: t('werkbank.postfaecher.die-anmeldung-ist-abgelaufen'),
  admin: t('konten.verwaltende.postfach.andere'),
  browser: t('werkbank.postfaecher.die-anmeldung-wurde-in'),
  abgelehnt: t('werkbank.postfaecher.der-anbieter-hat-die'),
  ohnecode: t('werkbank.postfaecher.der-anbieter-hat-keinen'),
  tausch: t('werkbank.postfaecher.der-anbieter-hat-keine'),
};
/** Rückruf-Adresse für „Im Browser anmelden“: https, http nur für localhost. */
export const rueckrufOk = (r: string) => /^https:\/\//.test(r) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(r);
export const gleicherServer = (
  a: Pick<PostfachEingabe, 'server' | 'port' | 'verschluesselung'>,
  b: Pick<PostfachEingabe, 'server' | 'port' | 'verschluesselung'>,
) => a.server.toLowerCase() === b.server.toLowerCase() && Number(a.port) === Number(b.port) && a.verschluesselung === b.verschluesselung;
/** Nur die Felder des Formulars – der Stand (letzter Abruf …) ändert sich beim Abfragen. */
export const alsEingabe = (v: PostfachAnsicht): PostfachEingabe => ({
  ...(Object.fromEntries(Object.keys(NEU).map((k) => [k, (v as unknown as Record<string, unknown>)[k]])) as unknown as PostfachEingabe),
  absender: v.absender.join(', '),
  passwort: '',
  anmeldung: v.anmeldung ?? 'passwort',
  anbieter: v.anbieter ?? 'microsoft',
});

/** Bereiche eines Postfachs (#1000): Anmeldung beim Anbieter nur mit OAuth, der Stand erst nach dem Anlegen. */
export type PostfachBereich = 'grunddaten' | 'verbindung' | 'abholen' | 'anbieter' | 'stand' | 'fassungen';
export function postfachBereiche(oauth: boolean, gespeichert: boolean): BereichListe<PostfachBereich> {
  return [
    ['grunddaten', t('werkbank.postfaecher.bereich.grunddaten')],
    ['verbindung', t('werkbank.postfaecher.bereich.verbindung')],
    ...(oauth ? [['anbieter', t('werkbank.postfaecher.anmeldung-per-oauth-2')] as const] : []),
    ['abholen', t('werkbank.postfaecher.bereich.abholen')],
    ...(gespeichert ? [['stand', t('werkbank.postfaecher.stand')] as const, ['fassungen', t('oberflaeche.fassungen.titel')] as const] : []),
  ];
}
