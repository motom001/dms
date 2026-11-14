/** Schnittstelle (#1234): Eingänge: Postfächer (auch OAuth), Eingangsordner, WebDAV-Laufwerk, E-Mail-Versand. */
import { anfrage } from './anfrage';
import type { EingangWarnung, OAuthStatus } from './betrieb';

/** Eingangsordner (#195). */
export interface EingangEinstellung {
  aktiv: boolean; abstand: number; nachher: 'erledigt' | 'loeschen'; /** #333 */ doppelteUeberspringen?: boolean;
  /** #915: Ordner je Person für neue Benutzer von selbst anlegen. */ ordnerAutomatisch?: boolean;
  /** #915: Grenzen der Warnungen; 0 = aus. */ warnTage?: number; warnGb?: number; warnDateien?: number;
}
export interface EingangEreignis { datei: string; zeit: string; mappeId?: string; grund?: string }
/** Überwachung (#915): ein Ordner mit Zahlen für alles darunter. */
export interface EingangKnoten { pfad: string; name: string; dateien: number; bytes: number; aeltester: string | null; zuTief: number; kinder: EingangKnoten[] }
export interface EingangUeberblick { berechnet: string; dateien: number; bytes: number; aeltester: string | null; fehler: number; zuTief: number; baum: EingangKnoten; gekuerzt?: boolean }
export interface EingangStand {
  vorhanden: boolean; pfad?: string; einstellung?: EingangEinstellung; letztePruefung?: string | null; wartend?: number;
  pausiert?: string | null; uebernommen?: EingangEreignis[]; fehler?: EingangEreignis[]; andereInstanz?: boolean;
  /** #915 */ ueberblick?: EingangUeberblick | null; warnungen?: EingangWarnung[]; ohnePerson?: string[]; umbenennen?: Array<{ alt: string; neu: string }>; ohneOrdner?: number;
}
/** WebDAV-Laufwerk (#346). */
export interface WebdavEinstellung {
  aktiv: boolean;
  /** Stempel beim Lesen (#722): Id einer Stempel-Vorlage oder null (kein Stempel). */
  stempel: string | null;
  /** Nur lesend für alle Benutzer (#722). */
  nurLesend: boolean;
}
export interface WebdavZugriff { zeit: string; benutzer: string; methode: string; pfad: string; status: number }
export interface WebdavStand { einstellung: WebdavEinstellung; adresse: string; https: boolean; grenze: number; anfragen: number; zugriffe: WebdavZugriff[]; /** Stempel-Vorlagen zur Auswahl (#722). */ vorlagen: Array<{ id: string; name: string; text: string }> }
/** Postfächer (#196). */
export interface PostfachEingabe {
  name: string; aktiv: boolean; server: string; port: number; verschluesselung: 'ssl' | 'starttls' | 'keine'; benutzer: string; passwort?: string;
  ordner: string; abstand: number; fuer: string | null; absender: string[] | string; nachher: 'verschieben' | 'gelesen' | 'loeschen'; zielordner: string;
  nurMitAnhang: boolean; original: boolean; unverschluesseltBestaetigt?: boolean;
  /** #358 */
  anmeldung?: 'passwort' | 'oauth'; anbieter?: OAuthAnbieter;
}
/** Postfächer: OAuth 2.0 (#358). */
export type OAuthAnbieter = 'microsoft' | 'google' | 'andere';
export interface OAuthAppAnsicht { clientId: string; secretGesetzt: boolean; tenant?: string; autorisierung?: string; token?: string; geraet?: string; bereich?: string }
export interface OAuthAppEingabe { clientId: string; clientSecret?: string; clientSecretLoeschen?: boolean; tenant?: string; autorisierung?: string; token?: string; geraet?: string; bereich?: string }
export interface OAuthAppsStand { apps: Partial<Record<OAuthAnbieter, OAuthAppAnsicht>>; rueckruf: string }
export interface PostfachEreignis { zeit: string; betreff?: string; absender?: string; mappeId?: string; fehler?: string }
export interface PostfachAnsicht extends Omit<PostfachEingabe, 'passwort' | 'absender'> {
  id: string; absender: string[]; passwortGesetzt: boolean; oauth: OAuthStatus | null;
  stand: { letzterAbruf: string | null; naechsterAbruf: string | null; fehlerFolge: number; uebernommen: PostfachEreignis[]; fehler: PostfachEreignis[] };
}

export const eingaengeApi = {
  emailBereit: () => anfrage<{ bereit: boolean }>('GET', '/api/email/bereit'),
  eingangsordner: () => anfrage<EingangStand>('GET', '/api/werkbank/eingangsordner'),
  webdav: () => anfrage<WebdavStand>('GET', '/api/werkbank/webdav'),
  webdavSetzen: (e: WebdavEinstellung) => anfrage<WebdavStand>('PUT', '/api/werkbank/webdav', e),
  postfaecher: () => anfrage<PostfachAnsicht[]>('GET', '/api/werkbank/postfaecher'),
  postfachAnlegen: (p: PostfachEingabe) => anfrage<PostfachAnsicht[]>('POST', '/api/werkbank/postfaecher', p),
  postfachAendern: (id: string, p: PostfachEingabe) => anfrage<PostfachAnsicht[]>('PUT', `/api/werkbank/postfaecher/${id}`, p),
  postfachLoeschen: (id: string) => anfrage<void>('DELETE', `/api/werkbank/postfaecher/${id}`),
  postfachTesten: (p: PostfachEingabe & { id?: string }) => anfrage<{ ok: boolean; text: string; ordner?: string[]; anzahl?: number }>('POST', '/api/werkbank/postfaecher/testen', p),
  postfachAbrufen: (id: string) => anfrage<{ uebernommen: number }>('POST', `/api/werkbank/postfaecher/${id}/abrufen`),
  /* Postfächer: OAuth 2.0 (#358) */
  postfachOAuthApps: () => anfrage<OAuthAppsStand>('GET', '/api/werkbank/postfaecher-oauth'),
  postfachOAuthApp: (anbieter: OAuthAnbieter, app: OAuthAppEingabe) => anfrage<OAuthAppsStand>('PUT', `/api/werkbank/postfaecher-oauth/${anbieter}`, app),
  postfachOAuthStart: (id: string) => anfrage<{ url: string }>('POST', `/api/werkbank/postfaecher/${id}/oauth/start`),
  postfachOAuthGeraet: (id: string) => anfrage<{ code: string; adresse: string; bis: string; intervall: number }>('POST', `/api/werkbank/postfaecher/${id}/oauth/geraet`),
  postfachOAuthGeraetPruefen: (id: string) => anfrage<{ fertig: boolean; text: string }>('POST', `/api/werkbank/postfaecher/${id}/oauth/geraet/pruefen`),
  postfachOAuthAbmelden: (id: string) => anfrage<PostfachAnsicht[]>('POST', `/api/werkbank/postfaecher/${id}/oauth/abmelden`),
  eingangsordnerSetzen: (e: Partial<EingangEinstellung>) => anfrage<EingangStand>('PUT', '/api/werkbank/eingangsordner', e),
  eingangsordnerPruefen: () => anfrage<{ uebernommen: number; stand: EingangStand }>('POST', '/api/werkbank/eingangsordner/pruefen'),
  /** „Ordner für alle Benutzer anlegen“ (#915). */
  eingangsordnerPersonen: () => anfrage<{ angelegt: string[]; stand: EingangStand }>('POST', '/api/werkbank/eingangsordner/personen'),
};
