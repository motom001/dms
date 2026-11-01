import { createHash, createPublicKey, randomBytes, verify, constants, type KeyObject } from 'node:crypto';

/** Öffentlicher Schlüssel im JWK-Format (RFC 7517). */
export interface JsonWebKey { kty?: string; kid?: string; use?: string; alg?: string; [k: string]: unknown }
import type { Rolle } from '../../shared/src/model';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';

/**
 * Anmeldung über OpenID Connect (#241): Authorization Code Flow mit PKCE (S256), state und nonce;
 * die ID-Token-Signatur prüft das DMS selbst gegen die Schlüssel des Anbieters (JWKS).
 * Getestet gegen das Verhalten von Entra ID, Google, Keycloak, Authentik und Authelia.
 */

const log = protokoll.modul('konto');

/** Das Nötigste von fetch (ohne DOM-Typen), damit Tests einen Anbieter nachstellen können. */
export type Abruf = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface OidcEinstellung {
  aktiv: boolean;
  /** Aussteller (issuer), z. B. https://login.microsoftonline.com/<tenant>/v2.0 */
  aussteller: string;
  clientId: string;
  /** Verschlüsselt mit dem Schlüssel des DMS. */
  clientSecret: string;
  /** Beschriftung des Knopfes auf der Anmeldeseite. */
  knopf: string;
  /** Unbekannte E-Mail-Adressen als neue Benutzer anlegen (sonst nur vorhandene). */
  anlegen: boolean;
  /** Rolle neuer Benutzer. */
  standardrolle: Rolle;
  /** Gruppe beim Anbieter, deren Mitglieder Administratoren sind (leer: Rollen nur im DMS). */
  adminGruppe: string;
  /** Name des Claims mit den Gruppen. */
  gruppenClaim: string;
  /** Anmeldung mit Passwort nur noch für Administratoren (Notzugang). */
  lokalNurAdmins: boolean;
  /** Beim Abmelden auch beim Anbieter abmelden. */
  abmeldenBeimAnbieter: boolean;
}
export type OidcAnsicht = Omit<OidcEinstellung, 'clientSecret'> & { secretGesetzt: boolean };

export const OIDC_STANDARD: OidcEinstellung = {
  aktiv: false, aussteller: '', clientId: '', clientSecret: '', knopf: 'Mit Firmenkonto anmelden',
  anlegen: false, standardrolle: 'mitglied', adminGruppe: '', gruppenClaim: 'groups', lokalNurAdmins: false, abmeldenBeimAnbieter: true,
};

interface Discovery {
  issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string;
  end_session_endpoint?: string; token_endpoint_auth_methods_supported?: string[]; code_challenge_methods_supported?: string[];
}
export interface AnbieterIdentitaet { sub: string; email: string; name: string; gruppen: string[] }

const b64url = (b: Buffer) => b.toString('base64url');
const ohneSchraegstrich = (s: string) => s.replace(/\/+$/, '');

/** Aussteller-Adresse prüfen: https; http nur für localhost und private Netze (Heimnetz, Keycloak im LAN). */
export function pruefeAussteller(x: unknown): string {
  const s = ohneSchraegstrich(String(x ?? '').trim());
  let u: URL;
  try { u = new URL(s); } catch { throw new Fachfehler(422, 'Die Adresse des Anbieters ist keine gültige URL.'); }
  const privat = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(u.hostname) || !u.hostname.includes('.') || u.hostname.endsWith('.local') || u.hostname.endsWith('.lan') || u.hostname.endsWith('.internal');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && privat)) throw new Fachfehler(422, 'Der Anbieter muss über https erreichbar sein (http nur im eigenen Netz).');
  if (u.search || u.hash) throw new Fachfehler(422, 'Die Adresse des Anbieters darf keine ?- oder #-Teile haben.');
  return s;
}

/* ---------- ID-Token ---------- */

const ALGORITHMEN: Record<string, { hash: string | null; art: 'rsa' | 'pss' | 'ec' | 'ed' }> = {
  RS256: { hash: 'sha256', art: 'rsa' }, RS384: { hash: 'sha384', art: 'rsa' }, RS512: { hash: 'sha512', art: 'rsa' },
  PS256: { hash: 'sha256', art: 'pss' }, PS384: { hash: 'sha384', art: 'pss' }, PS512: { hash: 'sha512', art: 'pss' },
  ES256: { hash: 'sha256', art: 'ec' }, ES384: { hash: 'sha384', art: 'ec' }, ES512: { hash: 'sha512', art: 'ec' },
  EdDSA: { hash: null, art: 'ed' },
};

export interface Pruefung { aussteller: string; clientId: string; nonce: string; jetzt: number }

/** Prüft Signatur und Inhalt eines ID-Tokens; liefert die Claims. */
export function pruefeIdToken(token: string, schluessel: JsonWebKey[], p: Pruefung): Record<string, unknown> {
  const teile = token.split('.');
  if (teile.length !== 3) throw new Fachfehler(401, 'Ungültiges ID-Token.');
  let kopf: { alg?: string; kid?: string }, claims: Record<string, unknown>;
  try {
    kopf = JSON.parse(Buffer.from(teile[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(teile[1], 'base64url').toString('utf8'));
  } catch { throw new Fachfehler(401, 'Ungültiges ID-Token.'); }
  const alg = ALGORITHMEN[kopf.alg ?? ''];
  if (!alg) throw new Fachfehler(401, `ID-Token mit nicht erlaubtem Verfahren ${kopf.alg ?? '(keins)'}.`);
  const passend = schluessel.filter((k) => (!kopf.kid || k.kid === kopf.kid) && (!k.use || k.use === 'sig') && (!k.alg || k.alg === kopf.alg)
    && ({ rsa: 'RSA', pss: 'RSA', ec: 'EC', ed: 'OKP' } as const)[alg.art] === k.kty);
  if (!passend.length) throw new SchluesselFehlt();
  const daten = Buffer.from(`${teile[0]}.${teile[1]}`);
  const sig = Buffer.from(teile[2], 'base64url');
  const echt = passend.some((jwk) => {
    let key: KeyObject;
    try { key = createPublicKey({ key: jwk as never, format: 'jwk' }); } catch { return false; }
    try {
      if (alg.art === 'ed') return verify(null, daten, key, sig);
      if (alg.art === 'ec') return verify(alg.hash, daten, { key, dsaEncoding: 'ieee-p1363' }, sig);
      if (alg.art === 'pss') return verify(alg.hash, daten, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST }, sig);
      return verify(alg.hash, daten, key, sig);
    } catch { return false; }
  });
  if (!echt) throw new Fachfehler(401, 'Die Signatur des ID-Tokens stimmt nicht.');
  if (ohneSchraegstrich(String(claims.iss ?? '')) !== ohneSchraegstrich(p.aussteller)) throw new Fachfehler(401, 'Das ID-Token stammt von einem anderen Aussteller.');
  const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud ?? '')];
  if (!aud.includes(p.clientId)) throw new Fachfehler(401, 'Das ID-Token ist für eine andere Anwendung ausgestellt.');
  if (aud.length > 1 && claims.azp !== undefined && claims.azp !== p.clientId) throw new Fachfehler(401, 'Das ID-Token ist für eine andere Anwendung ausgestellt.');
  const s = Math.floor(p.jetzt / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < s - 60) throw new Fachfehler(401, 'Das ID-Token ist abgelaufen. Uhrzeit von Server und Anbieter prüfen.');
  if (typeof claims.iat === 'number' && claims.iat > s + 300) throw new Fachfehler(401, 'Das ID-Token ist in der Zukunft ausgestellt. Uhrzeit von Server und Anbieter prüfen.');
  if (claims.nonce !== p.nonce) throw new Fachfehler(401, 'Das ID-Token gehört nicht zu dieser Anmeldung.');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new Fachfehler(401, 'Das ID-Token nennt keinen Benutzer.');
  return claims;
}
class SchluesselFehlt extends Fachfehler { constructor() { super(401, 'Zum ID-Token passt kein Schlüssel des Anbieters.'); } }

/** E-Mail, Name und Gruppen aus den Claims (Entra liefert die Adresse oft nur als preferred_username). */
export function identitaetAus(claims: Record<string, unknown>, gruppenClaim: string): AnbieterIdentitaet {
  if (claims.email_verified === false) throw new Fachfehler(403, 'Der Anbieter hat die E-Mail-Adresse nicht bestätigt.');
  const kandidat = [claims.email, claims.preferred_username, claims.upn].find((x) => typeof x === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (!kandidat) throw new Fachfehler(403, 'Der Anbieter liefert keine E-Mail-Adresse. Bitte beim Anbieter den Scope „email“ freigeben.');
  const roh = claims[gruppenClaim || 'groups'];
  const gruppen = Array.isArray(roh) ? roh.map(String) : typeof roh === 'string' ? [roh] : [];
  const name = [claims.name, [claims.given_name, claims.family_name].filter(Boolean).join(' ')].find((x) => typeof x === 'string' && x.trim()) as string | undefined;
  return { sub: String(claims.sub), email: String(kandidat).toLowerCase(), name: name?.trim() ?? '', gruppen };
}

/* ---------- Ablauf ---------- */

interface Offen { verifier: string; nonce: string; bindung: string; rueckkehr: string; bis: number }

export class Oidc {
  private disc: { d: Discovery; fuer: string; bis: number } | null = null;
  private jwks: { k: JsonWebKey[]; fuer: string; bis: number; geholt: number } | null = null;
  private offen = new Map<string, Offen>();
  private stand: OidcEinstellung | null = null;
  private geladen = 0;

  constructor(private deps: {
    einstellungen: Einstellungen;
    verschluessele: (k: string) => string;
    entschluessele: (w: string) => string | null;
    abruf?: Abruf;
    jetzt?: () => number;
  }) {}

  private get jetzt() { return this.deps.jetzt?.() ?? Date.now(); }
  private abruf(url: string, init?: Parameters<Abruf>[1]) {
    const f = this.deps.abruf ?? (fetch as unknown as Abruf);
    return f(url, { ...init, signal: AbortSignal.timeout(15_000) }).catch((e: Error) => {
      throw new Fachfehler(502, `Der Anbieter ist nicht erreichbar (${new URL(url).host}): ${e.message}`);
    });
  }

  async einstellung(): Promise<OidcEinstellung> {
    // Kurz zwischenspeichern; mehrere Instanzen sehen Änderungen nach spätestens 30 Sekunden.
    if (!this.stand || this.jetzt - this.geladen > 30_000) {
      this.stand = { ...OIDC_STANDARD, ...((await this.deps.einstellungen.lies('oidc')) as Partial<OidcEinstellung> | null ?? {}) };
      this.geladen = this.jetzt;
    }
    return this.stand;
  }
  /** Zwischengespeicherte Einstellung vergessen, z. B. nach dem Schlüsselwechsel (#410: neues Client-Secret). */
  vergiss() { this.stand = null; }
  async ansicht(): Promise<OidcAnsicht> {
    const { clientSecret, ...rest } = await this.einstellung();
    return { ...rest, secretGesetzt: !!clientSecret };
  }
  /** Für Anmeldeseite und Konten: aktiv und vollständig? */
  async bereit(): Promise<OidcEinstellung | null> {
    const e = await this.einstellung();
    return e.aktiv && e.aussteller && e.clientId ? e : null;
  }

  async speichere(x: unknown, von: string): Promise<OidcAnsicht> {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const alt = await this.einstellung();
    const t = (k: string, max = 500) => (o[k] === undefined ? undefined : String(o[k] ?? '').trim().slice(0, max));
    const neu: OidcEinstellung = {
      aktiv: o.aktiv === undefined ? alt.aktiv : o.aktiv === true,
      aussteller: o.aussteller === undefined ? alt.aussteller : (t('aussteller') ? pruefeAussteller(o.aussteller) : ''),
      clientId: t('clientId') ?? alt.clientId,
      clientSecret: o.clientSecretLoeschen === true ? '' : typeof o.clientSecret === 'string' && o.clientSecret.trim() ? this.deps.verschluessele(o.clientSecret.trim().slice(0, 2000)) : alt.clientSecret,
      knopf: t('knopf', 60) || alt.knopf || OIDC_STANDARD.knopf,
      anlegen: o.anlegen === undefined ? alt.anlegen : o.anlegen === true,
      standardrolle: o.standardrolle === undefined ? alt.standardrolle : o.standardrolle === 'admin' ? 'admin' : 'mitglied',
      adminGruppe: t('adminGruppe', 300) ?? alt.adminGruppe,
      gruppenClaim: t('gruppenClaim', 100) || alt.gruppenClaim || 'groups',
      lokalNurAdmins: o.lokalNurAdmins === undefined ? alt.lokalNurAdmins : o.lokalNurAdmins === true,
      abmeldenBeimAnbieter: o.abmeldenBeimAnbieter === undefined ? alt.abmeldenBeimAnbieter : o.abmeldenBeimAnbieter === true,
    };
    if (neu.aktiv && (!neu.aussteller || !neu.clientId)) throw new Fachfehler(422, 'Zum Einschalten bitte Adresse des Anbieters und Client-ID eintragen.');
    await this.deps.einstellungen.schreibe('oidc', neu);
    this.stand = neu; this.geladen = this.jetzt;
    if (neu.aussteller !== alt.aussteller) { this.disc = null; this.jwks = null; }
    log.info('Anmeldung über Anbieter (OIDC) geändert', { von, aktiv: neu.aktiv, aussteller: neu.aussteller, anlegen: neu.anlegen, lokalNurAdmins: neu.lokalNurAdmins });
    return this.ansicht();
  }

  private async discovery(aussteller: string, frisch = false): Promise<Discovery> {
    if (!frisch && this.disc && this.disc.fuer === aussteller && this.disc.bis > this.jetzt) return this.disc.d;
    const r = await this.abruf(`${aussteller}/.well-known/openid-configuration`);
    if (!r.ok) throw new Fachfehler(502, `Der Anbieter liefert keine OpenID-Konfiguration (HTTP ${r.status}). Stimmt die Adresse?`);
    const d = (await r.json().catch(() => null)) as Discovery | null;
    if (!d || !d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) throw new Fachfehler(502, 'Die OpenID-Konfiguration des Anbieters ist unvollständig.');
    if (ohneSchraegstrich(d.issuer ?? '') !== ohneSchraegstrich(aussteller)) throw new Fachfehler(502, `Der Anbieter nennt sich ${d.issuer} – bitte genau diese Adresse eintragen.`);
    this.disc = { d, fuer: aussteller, bis: this.jetzt + 60 * 60_000 };
    return d;
  }

  private async schluessel(d: Discovery, neu = false): Promise<JsonWebKey[]> {
    if (!neu && this.jwks && this.jwks.fuer === d.jwks_uri && this.jwks.bis > this.jetzt) return this.jwks.k;
    // Neu holen höchstens einmal je Minute (unbekannte kid).
    if (neu && this.jwks && this.jwks.fuer === d.jwks_uri && this.jetzt - this.jwks.geholt < 60_000) return this.jwks.k;
    const r = await this.abruf(d.jwks_uri);
    if (!r.ok) throw new Fachfehler(502, `Die Schlüssel des Anbieters sind nicht abrufbar (HTTP ${r.status}).`);
    const k = ((await r.json().catch(() => null)) as { keys?: JsonWebKey[] } | null)?.keys;
    if (!Array.isArray(k)) throw new Fachfehler(502, 'Die Schlüssel des Anbieters sind unlesbar.');
    this.jwks = { k, fuer: d.jwks_uri, bis: this.jetzt + 60 * 60_000, geholt: this.jetzt };
    return k;
  }

  /** Verbindung prüfen (Werkbank). */
  async pruefe(): Promise<{ aussteller: string; abmelden: boolean; schluessel: number }> {
    const e = await this.einstellung();
    if (!e.aussteller) throw new Fachfehler(422, 'Bitte zuerst die Adresse des Anbieters eintragen.');
    const d = await this.discovery(e.aussteller, true);
    const k = await this.schluessel(d, false);
    return { aussteller: d.issuer, abmelden: !!d.end_session_endpoint, schluessel: k.length };
  }

  /** Schritt 1: Adresse beim Anbieter; `bindung` kommt als Cookie in den Browser (gegen untergeschobene Anmeldungen). */
  async start(rueckkehr: string): Promise<{ url: string; bindung: string }> {
    const e = await this.bereit();
    if (!e) throw new Fachfehler(404, 'Die Anmeldung über einen Anbieter ist nicht eingeschaltet.');
    const d = await this.discovery(e.aussteller);
    const t = this.jetzt;
    for (const [k, v] of this.offen) if (v.bis < t) this.offen.delete(k);
    if (this.offen.size > 5000) throw new Fachfehler(429, 'Zu viele offene Anmeldungen. Bitte gleich noch einmal.');
    const state = b64url(randomBytes(24)), nonce = b64url(randomBytes(24)), verifier = b64url(randomBytes(32)), bindung = b64url(randomBytes(24));
    this.offen.set(state, { verifier, nonce, bindung, rueckkehr, bis: t + 10 * 60_000 });
    const u = new URL(d.authorization_endpoint);
    const q = { response_type: 'code', client_id: e.clientId, redirect_uri: rueckkehr, scope: 'openid email profile', state, nonce, code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' };
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    return { url: u.toString(), bindung };
  }

  /** Schritt 2: Rückkehr vom Anbieter; liefert die geprüfte Identität. */
  async rueckkehr(q: Record<string, string | undefined>, bindung: string | undefined): Promise<AnbieterIdentitaet> {
    const e = await this.bereit();
    if (!e) throw new Fachfehler(404, 'Die Anmeldung über einen Anbieter ist nicht eingeschaltet.');
    const o = q.state ? this.offen.get(q.state) : undefined;
    if (q.state) this.offen.delete(q.state);
    if (!o || o.bis < this.jetzt) throw new Fachfehler(400, 'Die Anmeldung ist abgelaufen. Bitte noch einmal beginnen.');
    if (!bindung || bindung !== o.bindung) throw new Fachfehler(400, 'Die Anmeldung wurde in einem anderen Browser begonnen. Bitte noch einmal beginnen.');
    if (q.error) throw new Fachfehler(401, `Der Anbieter hat die Anmeldung abgelehnt: ${String(q.error_description || q.error).slice(0, 300)}`);
    if (!q.code) throw new Fachfehler(400, 'Der Anbieter hat keinen Code geliefert.');
    const d = await this.discovery(e.aussteller);
    const secret = e.clientSecret ? this.deps.entschluessele(e.clientSecret) : '';
    if (e.clientSecret && secret === null) throw new Fachfehler(500, 'Das Client-Secret ist mit dem aktuellen Schlüssel nicht lesbar. Bitte in der Werkbank neu eintragen.');
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: q.code, redirect_uri: o.rueckkehr, code_verifier: o.verifier });
    const koepfe: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
    const methoden = d.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
    if (!secret) body.set('client_id', e.clientId);
    else if (methoden.includes('client_secret_basic')) koepfe.authorization = `Basic ${Buffer.from(`${encodeURIComponent(e.clientId)}:${encodeURIComponent(secret)}`).toString('base64')}`;
    else { body.set('client_id', e.clientId); body.set('client_secret', secret); }
    const r = await this.abruf(d.token_endpoint, { method: 'POST', headers: koepfe, body: body.toString() });
    const antwort = (await r.json().catch(() => null)) as { id_token?: string; error?: string; error_description?: string } | null;
    if (!r.ok || !antwort?.id_token) {
      throw new Fachfehler(502, `Der Anbieter hat den Code nicht eingelöst: ${antwort?.error_description || antwort?.error || `HTTP ${r.status}`}`);
    }
    const p = { aussteller: e.aussteller, clientId: e.clientId, nonce: o.nonce, jetzt: this.jetzt };
    let claims: Record<string, unknown>;
    try { claims = pruefeIdToken(antwort.id_token, await this.schluessel(d), p); } catch (x) {
      // Schlüsselwechsel beim Anbieter: einmal neu holen.
      if (!(x instanceof SchluesselFehlt)) throw x;
      claims = pruefeIdToken(antwort.id_token, await this.schluessel(d, true), p);
    }
    return identitaetAus(claims, e.gruppenClaim);
  }

  /** Abmelde-Adresse beim Anbieter (RP-initiated logout), falls eingeschaltet und angeboten. */
  async abmeldeUrl(zurueck: string): Promise<string | null> {
    const e = await this.bereit();
    if (!e || !e.abmeldenBeimAnbieter) return null;
    try {
      const d = await this.discovery(e.aussteller);
      if (!d.end_session_endpoint) return null;
      const u = new URL(d.end_session_endpoint);
      u.searchParams.set('client_id', e.clientId);
      u.searchParams.set('post_logout_redirect_uri', zurueck);
      return u.toString();
    } catch { return null; }
  }
}
