import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Einstellungen } from '../einstellungen/einstellungen';
import { Fachfehler } from '../grundlagen/fehler';
import { hashe, speicherKurzzustand, type Kurzzustand } from '../zwischenspeicher/kurzzustand';
import { pruefeAussteller, type Abruf } from '../anmeldung/oidc';
import { protokoll } from '../protokoll/protokoll';
import { t } from '../sprache/sprache';

/**
 * Postfächer: Anmeldung per OAuth 2.0 (#358) – IMAP mit XOAUTH2/OAUTHBEARER statt Passwort.
 *
 * - Eigene App-Registrierung je Installation (Client-ID, Client-Geheimnis) je Anbieter; Microsoft 365/Outlook.com,
 *   Gmail und „anderer Anbieter“ mit freien Endpunkten.
 * - Anmeldung im Browser: Autorisierungscode mit PKCE (S256) und state – einmalig, 10 Minuten gültig, an den
 *   Administrator gebunden, der sie begonnen hat, dazu ein Bindungs-Cookie an den Browser. Rückruf-Adresse fest
 *   aus der eingestellten Adresse des DMS.
 * - Gerätecode-Fluss (RFC 8628) für ein DMS ohne öffentliche Adresse (Microsoft, „anderer Anbieter“ mit Endpunkt).
 * - Token (und Client-Geheimnis) nur verschlüsselt über den Tresor in den Einstellungen; nie in Antworten,
 *   nie im Protokoll, nicht im Vollexport (Einstellungen gehören nicht dazu). Ein Schlüsselwechsel schlüsselt sie
 *   mit um (verschlüsselte Werte in den Einstellungen).
 * - Erneuerung vor Ablauf; abgelaufen oder entzogen („invalid_grant“) → Zustand am Postfach, Warnung in der
 *   Werkbank und einmal eine Mail an die Administratoren.
 *
 * Alle Aufrufe an die Anbieter gehen über `abruf` (fetch), damit Tests ohne Netz laufen.
 */

const log = protokoll.modul('ablage');

export type OAuthAnbieter = 'microsoft' | 'google' | 'andere';
export const OAUTH_ANBIETER: OAuthAnbieter[] = ['microsoft', 'google', 'andere'];

/**
 * E-Mail-Versand (#813): dieselbe App-Registrierung und derselbe Ablauf wie bei den Postfächern, die Anmeldung
 * liegt unter dieser festen Kennung (`postfach_oauth_versand`) und bekommt den Bereich zum Senden (SMTP).
 * Postfächer haben UUIDs als Kennung, es gibt also keine Verwechslung.
 */
export const VERSAND_OAUTH_ID = 'versand';
export type OAuthZweck = 'abruf' | 'versand';
const zweckVon = (id: string): OAuthZweck => (id === VERSAND_OAUTH_ID ? 'versand' : 'abruf');

/** App-Registrierung je Anbieter (eine je Installation). Endpunkte nur bei „anderer Anbieter“. */
export interface OAuthApp {
  clientId: string;
  /** Verschlüsselt mit dem Tresor; leer bei öffentlichen Clients. */
  clientSecret: string;
  /** Microsoft: Mandant (common, consumers, organizations, Tenant-ID oder Domain). */
  tenant?: string;
  autorisierung?: string;
  token?: string;
  geraet?: string;
  bereich?: string;
}
export type OAuthApps = Partial<Record<OAuthAnbieter, OAuthApp>>;
export type OAuthAppAnsicht = Omit<OAuthApp, 'clientSecret'> & { secretGesetzt: boolean };

export interface Endpunkte {
  autorisierung: string;
  token: string;
  geraet: string | null;
  bereich: string;
  widerruf: string | null;
  extra: Record<string, string>;
}

/** Gespeicherte Anmeldung eines Postfachs (Einstellung `postfach_oauth_<id>`). */
export interface OAuthToken {
  anbieter: OAuthAnbieter;
  /** Verschlüsselt. */
  zugriff: string;
  /** Verschlüsselt; leer, wenn der Anbieter keins geliefert hat. */
  aktualisierung: string;
  ablauf: string;
  /** Über den Gerätecode (öffentlicher Client): Erneuern ohne Client-Geheimnis. */
  oeffentlich: boolean;
  angemeldet: string;
  von: string;
  zustand: 'ok' | 'abgelaufen';
  fehler: string | null;
  /** Mail an die Administratoren zu diesem Ablauf schon verschickt. */
  gemeldet: boolean;
  /** Zufällige Kennung je Anmeldung: Eine Erneuerung schreibt nur in dieselbe Anmeldung zurück. Fehlt bei frühen Ständen. */
  kennung?: string;
}

/** Dieselbe Anmeldung (nicht abgemeldet, nicht neu angemeldet)? */
const dieselbe = (a: OAuthToken, b: OAuthToken) =>
  a.anbieter === b.anbieter && a.angemeldet === b.angemeldet && (a.kennung ?? '') === (b.kennung ?? '');

/** Feste Fehlercodes für die Rückkehr in die Werkbank (?oauthfehler=…); die Texte stehen in der Oberfläche. */
export type RueckrufCode = 'abgelaufen' | 'admin' | 'browser' | 'abgelehnt' | 'ohnecode' | 'tausch' | 'unbekannt';
/** Was die Oberfläche sieht – ohne Token. */
export interface OAuthStatus {
  angemeldet: boolean;
  zustand: 'ok' | 'abgelaufen' | 'abgemeldet';
  ablauf: string | null;
  angemeldetAm: string | null;
  von: string | null;
  fehler: string | null;
}

/** Abgelaufene oder entzogene Anmeldung: kein normaler Abruffehler, eigene Meldung. */
export class AnmeldungAbgelaufen extends Fachfehler {
  constructor(text: string) {
    super(409, text);
  }
}

interface OffenCode {
  postfachId: string;
  anbieter: OAuthAnbieter;
  adminId: string;
  von: string;
  verifier: string;
  bindung: string;
  rueckruf: string;
}
interface OffenGeraet {
  anbieter: OAuthAnbieter;
  adminId: string;
  von: string;
  deviceCode: string;
  intervall: number;
  naechste: number;
  bis: number;
}
/**
 * Offene Anmeldungen im Kurzzustand (#744), für alle Prozesse: Rückruf mit state (Schlüssel: Hash von state) und
 * Gerätecode (Schlüssel: Postfach). Die Werte – mit PKCE-Verifier bzw. Gerätecode – mit dem Schlüssel des DMS verschlüsselt.
 */
const CODE = 'postfach-oauth-code';
const GERAET = 'postfach-oauth-geraet';
const CODE_MS = 10 * 60_000;
const CODES_MAX = 500;

export interface PostfachOAuthDeps {
  einstellungen: Einstellungen;
  verschluessele: (klartext: string) => string;
  entschluessele: (wert: string) => string | null;
  abruf?: Abruf;
  jetzt?: () => number;
  anAdmins?: (betreff: import('../mail/mail').MailText, text: import('../mail/mail').MailText) => Promise<void>;
  /** Zustand zwischen Anfragen (#744); ohne Angabe im Arbeitsspeicher. */
  zustand?: Kurzzustand;
}

const b64url = (b: Buffer) => b.toString('base64url');
export const pkceChallenge = (verifier: string) => b64url(createHash('sha256').update(verifier).digest());
const gleich = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const kurz = (s: unknown, max = 300) =>
  String(s ?? '')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, max);
/** Ziel, an das Aktualisierungstoken und Client-Geheimnis gehen (Token-Endpunkt); '' wenn unvollständig. */
const tokenZiel = (anbieter: OAuthAnbieter, app: OAuthApp) => {
  try {
    return endpunkte(anbieter, app).token;
  } catch {
    return '';
  }
};
/** Rückruf-Adresse: https, http nur für localhost (so verlangen es auch Microsoft und Google). */
export function rueckrufErlaubt(rueckruf: string): boolean {
  let u: URL;
  try {
    u = new URL(rueckruf);
  } catch {
    return false;
  }
  return u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname));
}

/** Endpunkte und Bereich eines Anbieters aus der App-Registrierung. */
export function endpunkte(anbieter: OAuthAnbieter, app: OAuthApp, zweck: OAuthZweck = 'abruf'): Endpunkte {
  if (anbieter === 'microsoft') {
    const t = app.tenant || 'common';
    const basis = `https://login.microsoftonline.com/${encodeURIComponent(t)}/oauth2/v2.0`;
    // Versand (#813): SMTP.Send statt IMAP – dieselbe App braucht dafür die Berechtigung SMTP.Send.
    const bereich =
      zweck === 'versand'
        ? 'https://outlook.office.com/SMTP.Send offline_access'
        : 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access';
    return {
      autorisierung: `${basis}/authorize`,
      token: `${basis}/token`,
      geraet: `${basis}/devicecode`,
      bereich,
      widerruf: null,
      extra: {},
    };
  }
  if (anbieter === 'google') {
    // Gerätecode erlaubt Google für den Bereich mail.google.com nicht.
    return {
      autorisierung: 'https://accounts.google.com/o/oauth2/v2/auth',
      token: 'https://oauth2.googleapis.com/token',
      geraet: null,
      bereich: 'https://mail.google.com/',
      widerruf: 'https://oauth2.googleapis.com/revoke',
      extra: { access_type: 'offline', prompt: 'consent' },
    };
  }
  // Google: https://mail.google.com/ gilt für IMAP und SMTP. Für „anderer Anbieter“ gibt es keinen Versand per OAuth.
  if (zweck === 'versand') throw new Fachfehler(422, t('meldungen.postfachoauth.den-e-mail-versand'));
  if (!app.autorisierung || !app.token || !app.bereich) throw new Fachfehler(422, t('meldungen.postfachoauth.fuer-anderer-anbieter-bitte'));
  return {
    autorisierung: app.autorisierung,
    token: app.token,
    geraet: app.geraet || null,
    bereich: app.bereich,
    widerruf: null,
    extra: {},
  };
}

/** Endpunkt-Adresse prüfen (https; http nur im eigenen Netz) – ohne #-Teil. */
function pruefeEndpunkt(x: unknown, was: string): string {
  const s = String(x ?? '').trim();
  if (!s) return '';
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Fachfehler(422, `${was}: keine gültige Adresse.`);
  }
  if (u.hash) throw new Fachfehler(422, `${was}: ohne #-Teil.`);
  pruefeAussteller(`${u.protocol}//${u.host}`);
  return u.toString();
}

export class PostfachOAuth {
  private zustand: Kurzzustand;
  /** Laufende Erneuerung je Postfach in diesem Prozess (gleichzeitige Abrufe warten auf dieselbe). */
  private erneuern = new Map<string, Promise<string>>();
  /** Je Postfach hochgezählt bei Abmelden, Vergessen und neuer Anmeldung: Eine laufende Erneuerung schreibt dann nichts mehr. */
  private generation = new Map<string, number>();
  private gen(id: string) {
    return this.generation.get(id) ?? 0;
  }
  private macheUngueltig(id: string) {
    this.generation.set(id, this.gen(id) + 1);
    this.erneuern.delete(id);
  }

  constructor(private d: PostfachOAuthDeps) {
    this.zustand = d.zustand ?? speicherKurzzustand(() => this.jetzt);
  }
  private get jetzt() {
    return this.d.jetzt?.() ?? Date.now();
  }
  private verpacke(w: unknown) {
    return this.d.verschluessele(JSON.stringify(w));
  }
  private entpacke<T>(w: unknown): T | null {
    const klar = typeof w === 'string' ? this.d.entschluessele(w) : null;
    try {
      return klar ? (JSON.parse(klar) as T) : null;
    } catch {
      return null;
    }
  }
  private async geraet(id: string): Promise<OffenGeraet | null> {
    return this.entpacke<OffenGeraet>((await this.zustand.lies(GERAET, id))?.wert);
  }

  private async abruf(
    url: string,
    felder: Record<string, string>,
  ): Promise<{ ok: boolean; status: number; daten: Record<string, unknown> }> {
    const f = this.d.abruf ?? (fetch as unknown as Abruf);
    let r: Awaited<ReturnType<Abruf>>;
    try {
      r = await f(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams(felder).toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new Fachfehler(
        502,
        t('meldungen.postfachoauth.der-anbieter-ist-nicht', { host: new URL(url).host, kurz: kurz((e as Error).message, 200) }),
      );
    }
    const daten = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: r.ok, status: r.status, daten: daten && typeof daten === 'object' ? daten : {} };
  }

  /* ---------- App-Registrierungen ---------- */

  async apps(): Promise<OAuthApps> {
    return ((await this.d.einstellungen.lies('postfach_oauth_apps')) as OAuthApps | null) ?? {};
  }

  async appsAnsicht(): Promise<Partial<Record<OAuthAnbieter, OAuthAppAnsicht>>> {
    const a = await this.apps();
    return Object.fromEntries(
      Object.entries(a).map(([k, v]) => {
        const { clientSecret, ...rest } = v!;
        return [k, { ...rest, secretGesetzt: !!clientSecret }];
      }),
    );
  }

  /**
   * App-Registrierung speichern. Ändert sich das Ziel des Token-Endpunkts (Mandant bzw. Token-Endpunkt), meldet das
   * DMS die Postfächer dieses Anbieters ab (`betroffen`) – sonst gingen Aktualisierungstoken und Client-Geheimnis
   * an die neue Adresse.
   */
  async speichereApp(anbieter: unknown, x: unknown, von: string, betroffen?: (anbieter: OAuthAnbieter) => Promise<string[]>) {
    if (!OAUTH_ANBIETER.includes(anbieter as OAuthAnbieter))
      throw new Fachfehler(422, t('meldungen.postfachoauth.anbieter-microsoft-google-oder'));
    const an = anbieter as OAuthAnbieter;
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const alle = await this.apps();
    const alt: OAuthApp = alle[an] ?? { clientId: '', clientSecret: '' };
    const eintrag = (k: string, max = 500) =>
      o[k] === undefined
        ? undefined
        : String(o[k] ?? '')
            .trim()
            .slice(0, max);
    const neu: OAuthApp = {
      clientId: eintrag('clientId', 300) ?? alt.clientId,
      clientSecret:
        o.clientSecretLoeschen === true
          ? ''
          : typeof o.clientSecret === 'string' && o.clientSecret.trim()
            ? this.d.verschluessele(o.clientSecret.trim().slice(0, 2000))
            : alt.clientSecret,
    };
    if (an === 'microsoft') {
      const tenant = eintrag('tenant', 100) ?? alt.tenant ?? 'common';
      if (tenant && !/^[a-z0-9.-]+$/i.test(tenant)) throw new Fachfehler(422, t('meldungen.postfachoauth.mandant-tenant-common-consumers'));
      neu.tenant = tenant || 'common';
    }
    if (an === 'andere') {
      neu.autorisierung =
        o.autorisierung === undefined
          ? (alt.autorisierung ?? '')
          : pruefeEndpunkt(o.autorisierung, t('meldungen.postfachoauth.autorisierungs-endpunkt'));
      neu.token = o.token === undefined ? (alt.token ?? '') : pruefeEndpunkt(o.token, t('meldungen.postfachoauth.token-endpunkt'));
      neu.geraet =
        o.geraet === undefined ? (alt.geraet ?? '') : pruefeEndpunkt(o.geraet, t('meldungen.postfachoauth.geraetecode-endpunkt'));
      neu.bereich = eintrag('bereich', 500) ?? alt.bereich ?? '';
    }
    if (!neu.clientId) throw new Fachfehler(422, t('meldungen.postfachoauth.bitte-die-client-id'));
    await this.d.einstellungen.schreibe('postfach_oauth_apps', { ...alle, [an]: neu });
    log.info('Postfächer: OAuth-App geändert', { von, anbieter: an });
    if (alle[an] && betroffen && tokenZiel(an, alle[an]!) !== tokenZiel(an, neu)) {
      for (const id of await betroffen(an)) await this.abmelden(id, von);
    }
    return this.appsAnsicht();
  }

  private async app(anbieter: OAuthAnbieter, zweck: OAuthZweck = 'abruf'): Promise<{ app: OAuthApp; e: Endpunkte; secret: string }> {
    const app = (await this.apps())[anbieter];
    if (!app?.clientId) throw new Fachfehler(409, t('meldungen.postfachoauth.fuer-diesen-anbieter-ist'));
    const secret = app.clientSecret ? this.d.entschluessele(app.clientSecret) : '';
    if (secret === null) throw new Fachfehler(409, t('meldungen.postfachoauth.das-client-geheimnis-ist'));
    return { app, e: endpunkte(anbieter, app, zweck), secret };
  }

  /* ---------- Gespeicherte Anmeldung ---------- */

  private schluessel(id: string) {
    return `postfach_oauth_${id}`;
  }
  async token(id: string): Promise<OAuthToken | null> {
    return (await this.d.einstellungen.lies(this.schluessel(id))) as OAuthToken | null;
  }

  async status(id: string): Promise<OAuthStatus> {
    const t = await this.token(id);
    if (!t) return { angemeldet: false, zustand: 'abgemeldet', ablauf: null, angemeldetAm: null, von: null, fehler: null };
    return {
      angemeldet: t.zustand === 'ok',
      zustand: t.zustand,
      ablauf: t.ablauf,
      angemeldetAm: t.angemeldet,
      von: t.von,
      fehler: t.fehler,
    };
  }

  /** Abmelden: Token löschen; bei Google zusätzlich beim Anbieter widerrufen (wenn erreichbar). */
  async abmelden(id: string, von: string) {
    // Zuerst (ohne await): Eine laufende Erneuerung darf das Token danach nicht zurückschreiben.
    this.macheUngueltig(id);
    const t = await this.token(id);
    await this.d.einstellungen.schreibe(this.schluessel(id), null);
    await this.zustand.loesche(GERAET, id);
    if (!t) return;
    const app = (await this.apps())[t.anbieter];
    const w = app
      ? (() => {
          try {
            return endpunkte(t.anbieter, app).widerruf;
          } catch {
            return null;
          }
        })()
      : null;
    const wert = t.aktualisierung ? this.d.entschluessele(t.aktualisierung) : null;
    if (w && wert) await this.abruf(w, { token: wert }).catch(() => null);
    log.info('Postfach: OAuth-Anmeldung entfernt', { von, postfach: id });
  }

  /* ---------- Autorisierungscode mit PKCE ---------- */

  /** Schritt 1: Adresse beim Anbieter. `bindung` geht als Cookie an den Browser des Administrators. */
  async start(
    p: { id: string; anbieter: OAuthAnbieter; benutzer: string },
    admin: { id: string; email: string },
    rueckruf: string,
  ): Promise<{ url: string; bindung: string }> {
    if (!/^https?:\/\//.test(rueckruf)) throw new Fachfehler(409, t('meldungen.postfachoauth.fuer-die-anmeldung-im'));
    if (!rueckrufErlaubt(rueckruf)) throw new Fachfehler(409, t('meldungen.postfachoauth.fuer-die-anmeldung-im-2'));
    const { app, e } = await this.app(p.anbieter, zweckVon(p.id));
    const zahl = this.jetzt;
    if ((await this.zustand.anzahl(CODE)) > CODES_MAX) throw new Fachfehler(429, t('meldungen.postfachoauth.zu-viele-offene-anmeldungen'));
    const state = b64url(randomBytes(32)),
      verifier = b64url(randomBytes(48)),
      bindung = b64url(randomBytes(24));
    await this.zustand.setze(
      CODE,
      hashe(state),
      this.verpacke({
        postfachId: p.id,
        anbieter: p.anbieter,
        adminId: admin.id,
        von: admin.email,
        verifier,
        bindung,
        rueckruf,
      } satisfies OffenCode),
      zahl + CODE_MS,
    );
    const u = new URL(e.autorisierung);
    const q: Record<string, string> = {
      response_type: 'code',
      client_id: app.clientId,
      redirect_uri: rueckruf,
      scope: e.bereich,
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      ...(p.benutzer.includes('@') ? { login_hint: p.benutzer } : {}),
      ...e.extra,
    };
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    log.info('Postfach: OAuth-Anmeldung begonnen', { von: admin.email, postfach: p.id, anbieter: p.anbieter });
    return { url: u.toString(), bindung };
  }

  /**
   * Schritt 2: Rückruf. Prüft state (einmalig, nicht abgelaufen), Administrator und Bindungs-Cookie, tauscht den
   * Code mit dem PKCE-Verifier. Liefert die Kennung des Postfachs – nur aus dem gespeicherten state, nie aus der Anfrage.
   */
  async rueckruf(
    q: Record<string, string | undefined>,
    admin: { id: string } | null,
    bindung: string | undefined,
  ): Promise<{ postfachId: string }> {
    const state = typeof q.state === 'string' ? q.state : '';
    // Einmal einlösbar (#744): Von zwei gleichzeitigen Rückrufen mit demselben state kommt nur einer weiter.
    const o = state ? this.entpacke<OffenCode>((await this.zustand.nimm(CODE, hashe(state)))?.wert) : null;
    if (!o) throw new RueckrufFehler('', 400, t('meldungen.postfachoauth.die-anmeldung-ist-abgelaufen'), 'abgelaufen');
    if (!admin || admin.id !== o.adminId)
      throw new RueckrufFehler(o.postfachId, 403, t('meldungen.postfachoauth.die-anmeldung-hat-eine'), 'admin');
    if (!bindung || !gleich(bindung, o.bindung))
      throw new RueckrufFehler(o.postfachId, 400, t('meldungen.postfachoauth.die-anmeldung-wurde-in'), 'browser');
    if (q.error)
      throw new RueckrufFehler(
        o.postfachId,
        401,
        t('meldungen.postfachoauth.der-anbieter-hat-die', { kurz: kurz(q.error_description || q.error) }),
        'abgelehnt',
      );
    if (!q.code) throw new RueckrufFehler(o.postfachId, 400, t('meldungen.postfachoauth.der-anbieter-hat-keinen'), 'ohnecode');
    try {
      const { app, e, secret } = await this.app(o.anbieter, zweckVon(o.postfachId));
      const felder: Record<string, string> = {
        grant_type: 'authorization_code',
        code: q.code,
        redirect_uri: o.rueckruf,
        code_verifier: o.verifier,
        client_id: app.clientId,
        ...(secret ? { client_secret: secret } : {}),
      };
      const r = await this.abruf(e.token, felder);
      await this.merke(o.postfachId, o.anbieter, r, false, o.von);
    } catch (x) {
      throw new RueckrufFehler(o.postfachId, (x as Fachfehler).status ?? 502, (x as Error).message, 'tausch');
    }
    log.info('Postfach: per OAuth angemeldet', { von: o.von, postfach: o.postfachId, anbieter: o.anbieter });
    return { postfachId: o.postfachId };
  }

  /** Antwort des Token-Endpunkts speichern (verschlüsselt). */
  private async merke(
    id: string,
    anbieter: OAuthAnbieter,
    r: { ok: boolean; status: number; daten: Record<string, unknown> },
    oeffentlich: boolean,
    von: string,
  ) {
    const z = r.daten.access_token;
    if (!r.ok || typeof z !== 'string' || !z)
      throw new Fachfehler(
        502,
        t('meldungen.postfachoauth.der-anbieter-hat-keine', {
          kurz: kurz(r.daten.error_description || r.daten.error || `HTTP ${r.status}`),
        }),
      );
    const a = typeof r.daten.refresh_token === 'string' ? r.daten.refresh_token : '';
    const sek = Number(r.daten.expires_in) > 0 ? Number(r.daten.expires_in) : 3600;
    const oAuthToken: OAuthToken = {
      anbieter,
      zugriff: this.d.verschluessele(z),
      aktualisierung: a ? this.d.verschluessele(a) : '',
      ablauf: new Date(this.jetzt + sek * 1000).toISOString(),
      oeffentlich,
      angemeldet: new Date(this.jetzt).toISOString(),
      von,
      zustand: 'ok',
      fehler: null,
      gemeldet: false,
      kennung: b64url(randomBytes(12)),
    };
    // Neue Anmeldung: Eine noch laufende Erneuerung der alten schreibt nicht mehr darüber.
    this.macheUngueltig(id);
    await this.d.einstellungen.schreibe(this.schluessel(id), oAuthToken);
  }

  /* ---------- Gerätecode (RFC 8628) ---------- */

  async geraetStart(
    p: { id: string; anbieter: OAuthAnbieter },
    admin: { id: string; email: string },
  ): Promise<{ code: string; adresse: string; bis: string; intervall: number }> {
    const { app, e } = await this.app(p.anbieter, zweckVon(p.id));
    if (!e.geraet) throw new Fachfehler(409, t('meldungen.postfachoauth.dieser-anbieter-bietet-keinen'));
    const r = await this.abruf(e.geraet, { client_id: app.clientId, scope: e.bereich });
    const d = r.daten;
    if (!r.ok || typeof d.device_code !== 'string' || typeof d.user_code !== 'string')
      throw new Fachfehler(
        502,
        t('meldungen.postfachoauth.der-anbieter-hat-keinen-2', { kurz: kurz(d.error_description || d.error || `HTTP ${r.status}`) }),
      );
    const adresse = String(d.verification_uri ?? d.verification_url ?? '');
    if (!/^https:\/\//.test(adresse)) throw new Fachfehler(502, t('meldungen.postfachoauth.der-anbieter-nennt-keine'));
    const intervall = Math.min(Math.max(Number(d.interval) || 5, 1), 60);
    const bis = this.jetzt + Math.min(Math.max(Number(d.expires_in) || 900, 60), 1800) * 1000;
    await this.zustand.setze(
      GERAET,
      p.id,
      this.verpacke({
        anbieter: p.anbieter,
        adminId: admin.id,
        von: admin.email,
        deviceCode: d.device_code,
        intervall,
        naechste: 0,
        bis,
      } satisfies OffenGeraet),
      bis,
    );
    log.info('Postfach: Gerätecode angefordert', { von: admin.email, postfach: p.id, anbieter: p.anbieter });
    return { code: kurz(d.user_code, 40), adresse: kurz(adresse, 300), bis: new Date(bis).toISOString(), intervall };
  }

  /** Einmal beim Anbieter nachfragen, ob der Code eingegeben ist. */
  async geraetPruefen(id: string, admin: { id: string }): Promise<{ fertig: boolean; text: string }> {
    const g = await this.geraet(id);
    if (!g || g.adminId !== admin.id) throw new Fachfehler(404, t('meldungen.postfachoauth.kein-offener-geraetecode-fuer'));
    if (g.bis < this.jetzt) {
      await this.zustand.loesche(GERAET, id);
      throw new Fachfehler(410, t('meldungen.postfachoauth.der-geraetecode-ist-abgelaufen'));
    }
    if (g.naechste > this.jetzt) return { fertig: false, text: t('meldungen.postfachoauth.warte-auf-die-anmeldung') };
    g.naechste = this.jetzt + g.intervall * 1000;
    await this.zustand.setze(GERAET, id, this.verpacke(g), g.bis);
    const { app, e } = await this.app(g.anbieter, zweckVon(id));
    const r = await this.abruf(e.token, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: g.deviceCode,
      client_id: app.clientId,
    });
    const fehler = String(r.daten.error ?? '');
    if (!r.ok && fehler === 'authorization_pending') return { fertig: false, text: t('meldungen.postfachoauth.warte-auf-die-anmeldung') };
    if (!r.ok && fehler === 'slow_down') {
      g.intervall = Math.min(g.intervall + 5, 60);
      await this.zustand.setze(GERAET, id, this.verpacke(g), g.bis);
      return { fertig: false, text: t('meldungen.postfachoauth.warte-auf-die-anmeldung') };
    }
    await this.zustand.loesche(GERAET, id);
    if (!r.ok)
      throw new Fachfehler(
        fehler === 'expired_token' ? 410 : 401,
        t('meldungen.postfachoauth.anmeldung-nicht-abgeschlossen', {
          kurz: kurz(r.daten.error_description || fehler || `HTTP ${r.status}`),
        }),
      );
    await this.merke(id, g.anbieter, r, true, g.von);
    log.info('Postfach: per Gerätecode angemeldet', { von: g.von, postfach: id, anbieter: g.anbieter });
    return { fertig: true, text: t('meldungen.postfachoauth.angemeldet') };
  }

  /* ---------- Zugriffstoken für die Verbindung ---------- */

  /** Gültiges Zugriffstoken; erneuert 5 Minuten vor Ablauf. Abgelaufen/entzogen → Zustand, einmal Mail, AnmeldungAbgelaufen. */
  async zugriffstoken(p: { id: string; name: string; benutzer: string; anbieter: OAuthAnbieter }): Promise<string> {
    const laufend = this.erneuern.get(p.id);
    if (laufend) return laufend;
    const f: Promise<string> = this.holeToken(p).finally(() => {
      if (this.erneuern.get(p.id) === f) this.erneuern.delete(p.id);
    });
    this.erneuern.set(p.id, f);
    return f;
  }

  /**
   * Schreibt `neu` nur, wenn seit `g` niemand abgemeldet, vergessen oder neu angemeldet hat und gespeichert noch
   * dieselbe Anmeldung `alt` steht (Einstellung neu gelesen – auch gegen eine andere Instanz). Sonst: der jetzige Stand.
   */
  private async schreibeWennGleich(
    id: string,
    g: number,
    alt: OAuthToken,
    neu: OAuthToken,
  ): Promise<{ ok: true } | { ok: false; jetzt: OAuthToken | null }> {
    const jetzt = await this.token(id);
    // Zwischen Prüfen und Schreiben kein await – Abmelden zählt die Generation sofort hoch.
    if (g !== this.gen(id) || !jetzt || !dieselbe(jetzt, alt))
      return { ok: false, jetzt: g !== this.gen(id) && jetzt && dieselbe(jetzt, alt) ? null : jetzt };
    // Mehrere Prozesse (#744): nur schreiben, wenn in der Datenbank noch genau das Gelesene steht (vergleichen und
    // tauschen) – ein anderer Prozess kann inzwischen abgemeldet, neu angemeldet oder selbst erneuert haben.
    if (this.d.einstellungen.tausche) {
      if (!(await this.d.einstellungen.tausche(this.schluessel(id), jetzt, neu))) return { ok: false, jetzt: await this.token(id) };
      return { ok: true };
    }
    await this.d.einstellungen.schreibe(this.schluessel(id), neu);
    return { ok: true };
  }

  /** Die Anmeldung hat sich während der Erneuerung geändert: abgemeldet → Fehler; neu angemeldet → einmal mit der neuen. */
  private async geaendert(
    p: { id: string; name: string; benutzer: string; anbieter: OAuthAnbieter },
    jetzt: OAuthToken | null,
    versuch: number,
  ): Promise<string> {
    if (!jetzt) throw new AnmeldungAbgelaufen(t('meldungen.postfachoauth.das-postfach-wurde-inzwischen'));
    if (versuch > 0) throw new Fachfehler(409, t('meldungen.postfachoauth.die-anmeldung-des-postfachs'));
    return this.holeToken(p, versuch + 1);
  }

  private async holeToken(p: { id: string; name: string; benutzer: string; anbieter: OAuthAnbieter }, versuch = 0): Promise<string> {
    const g = this.gen(p.id);
    const eintrag = await this.token(p.id);
    if (!eintrag) throw new AnmeldungAbgelaufen(t('meldungen.postfachoauth.das-postfach-ist-nicht'));
    if (eintrag.anbieter !== p.anbieter) throw new AnmeldungAbgelaufen(t('meldungen.postfachoauth.die-anmeldung-gehoert-zu'));
    if (eintrag.zustand === 'abgelaufen')
      throw new AnmeldungAbgelaufen(
        t('meldungen.postfachoauth.die-anmeldung-ist-abgelaufen-2', { wert: eintrag.fehler ? ` (${eintrag.fehler})` : '' }),
      );
    if (Date.parse(eintrag.ablauf) - 5 * 60_000 > this.jetzt) {
      const z = this.d.entschluessele(eintrag.zugriff);
      if (z) return z;
    }
    const a = eintrag.aktualisierung ? this.d.entschluessele(eintrag.aktualisierung) : null;
    if (!a)
      return this.abgelaufen(
        p,
        eintrag,
        g,
        versuch,
        eintrag.aktualisierung
          ? t('meldungen.postfachoauth.das-aktualisierungstoken-ist-mit')
          : t('meldungen.postfachoauth.der-anbieter-hat-kein'),
      );
    const { app, e, secret } = await this.app(p.anbieter, zweckVon(p.id));
    const r = await this.abruf(e.token, {
      grant_type: 'refresh_token',
      refresh_token: a,
      client_id: app.clientId,
      scope: e.bereich,
      ...(secret && !eintrag.oeffentlich ? { client_secret: secret } : {}),
    });
    const z = r.daten.access_token;
    if (r.ok && typeof z === 'string' && z) {
      const sek = Number(r.daten.expires_in) > 0 ? Number(r.daten.expires_in) : 3600;
      const neuA =
        typeof r.daten.refresh_token === 'string' && r.daten.refresh_token
          ? this.d.verschluessele(r.daten.refresh_token)
          : eintrag.aktualisierung;
      const w = await this.schreibeWennGleich(p.id, g, eintrag, {
        ...eintrag,
        zugriff: this.d.verschluessele(z),
        aktualisierung: neuA,
        ablauf: new Date(this.jetzt + sek * 1000).toISOString(),
        fehler: null,
      });
      if (!w.ok) return this.geaendert(p, w.jetzt, versuch);
      log.info('Postfach: Zugriffstoken erneuert', { postfach: p.name });
      return z;
    }
    const fehler = String(r.daten.error ?? '');
    // Endgültig: Aktualisierungstoken abgelaufen, entzogen, Zustimmung fehlt, App falsch. Sonst (Netz, 5xx) später erneut.
    if (['invalid_grant', 'interaction_required', 'consent_required', 'invalid_client', 'unauthorized_client'].includes(fehler)) {
      return this.abgelaufen(p, eintrag, g, versuch, kurz(r.daten.error_description || fehler, 200));
    }
    throw new Fachfehler(
      502,
      t('meldungen.postfachoauth.der-anbieter-hat-die-2', { kurz: kurz(r.daten.error_description || fehler || `HTTP ${r.status}`) }),
    );
  }

  /** Nur dieselbe Anmeldung als abgelaufen markieren – eine inzwischen neuere bleibt unberührt. */
  private async abgelaufen(
    p: { id: string; name: string; benutzer: string; anbieter: OAuthAnbieter },
    oAuthToken: OAuthToken,
    g: number,
    versuch: number,
    grund: string,
  ): Promise<string> {
    const melden = !oAuthToken.gemeldet;
    const w = await this.schreibeWennGleich(p.id, g, oAuthToken, { ...oAuthToken, zustand: 'abgelaufen', fehler: grund, gemeldet: true });
    if (!w.ok) return this.geaendert(p, w.jetzt, versuch);
    log.warn('Postfach: OAuth-Anmeldung abgelaufen oder entzogen', { postfach: p.name, grund });
    // Versand (#813): Die Mail ginge über genau diese Anmeldung – dafür warnt die Werkbank.
    if (melden && zweckVon(p.id) === 'abruf') {
      await this.d
        .anAdmins?.(
          () => t('meldungen.postfachoauth.ablago-postfach-anmeldung-abgelaufen', { name: p.name }),
          () => t('meldungen.postfachoauth.die-anmeldung-oauth-2', { name: p.name, benutzer: p.benutzer, grund }),
        )
        .catch(() => {});
    }
    throw new AnmeldungAbgelaufen(t('meldungen.postfachoauth.die-anmeldung-ist-abgelaufen-3', { grund }));
  }

  /** Postfach gelöscht: alles dazu vergessen. */
  async vergiss(id: string) {
    this.macheUngueltig(id);
    await this.d.einstellungen.schreibe(this.schluessel(id), null);
    await this.zustand.loesche(GERAET, id);
    for (const x of await this.zustand.liste(CODE))
      if (this.entpacke<OffenCode>(x.wert)?.postfachId === id) await this.zustand.loesche(CODE, x.schluessel);
  }
}

/** Fehler im Rückruf, bei dem das Postfach bekannt ist (Rückkehr auf dessen Seite). */
export class RueckrufFehler extends Fachfehler {
  /** postfachId leer: unbekannt (state abgelaufen oder erfunden). */
  constructor(
    public postfachId: string,
    status: number,
    text: string,
    public code: RueckrufCode,
  ) {
    super(status, text);
  }
}
