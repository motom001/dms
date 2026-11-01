import { createHash, randomUUID } from 'node:crypto';
import { MAX_DATEIGROESSE, NOTIZ_MAX, POST_KANAL } from '../../shared/src/model';
import type { Dienst } from './dienst';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { AnmeldungAbgelaufen, OAUTH_ANBIETER, type OAuthAnbieter, type OAuthStatus, type PostfachOAuth } from './postfach-oauth';

/**
 * Postfächer (#196): Das DMS holt Mails per IMAP ab und macht aus jeder eine neue Post
 * (Kanal „E-Mail“). Anhänge werden Dokumente, der Text steht an der Post, wahlweise auch die
 * Original-Mail als .eml.
 *
 * Die Verbindung (imapflow) und das Lesen der Mail (mailparser) stecken in imap.ts hinter
 * ImapVerbinder und MailLeser – so lässt sich der Ablauf ohne Mailserver testen.
 *
 * Keine doppelte Übernahme: je Postfach UIDVALIDITY und höchste UID, dazu die Message-IDs der
 * übernommenen Mails; ein Journal mit der vorab gewählten Id der Post, damit nach einem Absturz
 * zwischen „Post gespeichert“ und „Mail verschoben“ nichts doppelt entsteht.
 */

export type Verschluesselung = 'ssl' | 'starttls' | 'keine';
export type Nachher = 'verschieben' | 'gelesen' | 'loeschen';
/** #358: Anmeldung mit Passwort (Standard, auch für alle älteren Postfächer) oder OAuth 2.0. */
export type Anmeldeart = 'passwort' | 'oauth';

export interface Postfach {
  id: string;
  name: string;
  aktiv: boolean;
  server: string;
  port: number;
  verschluesselung: Verschluesselung;
  benutzer: string;
  /** Verschlüsselt mit dem Tresor; nie an die Oberfläche. */
  passwort: string;
  /** Fehlt bei Postfächern von vor 0.85: Passwort. */
  anmeldung?: Anmeldeart;
  /** Bei OAuth: Anbieter (App-Registrierung je Installation). */
  anbieter?: OAuthAnbieter;
  ordner: string;
  /** Abrufabstand in Minuten. */
  abstand: number;
  fuer: string | null;
  /** Nur von diesen Absendern (Adressen oder Domains); leer = alle. */
  absender: string[];
  nachher: Nachher;
  zielordner: string;
  nurMitAnhang: boolean;
  original: boolean;
}
export type PostfachAnsicht = Omit<Postfach, 'passwort'> & { passwortGesetzt: boolean; stand: PostfachStand; /** #358: ohne Token. */ oauth: OAuthStatus | null };

export interface PostfachEreignis { zeit: string; betreff?: string; absender?: string; mappeId?: string; fehler?: string }
export interface PostfachStand { letzterAbruf: string | null; naechsterAbruf: string | null; fehlerFolge: number; uebernommen: PostfachEreignis[]; fehler: PostfachEreignis[] }

/** Zugangsdaten mit Klartext-Passwort bzw. Zugriffstoken (OAuth, #358), nur für die Verbindung. */
export interface Zugang { server: string; port: number; verschluesselung: Verschluesselung; benutzer: string; passwort: string; zugriffstoken?: string }

export interface ImapSitzung {
  uidValidity: string;
  /** Anzahl Mails im Ordner. */
  anzahl: number;
  /** UIDs (und Message-IDs) ab dieser UID. */
  neue(abUid: number): Promise<Array<{ uid: number; messageId?: string }>>;
  quelle(uid: number): Promise<Buffer>;
  verschiebe(uid: number, ordner: string): Promise<void>;
  gelesen(uid: number): Promise<void>;
  loesche(uid: number): Promise<void>;
  ordnerListe(): Promise<string[]>;
  schliessen(): Promise<void>;
}
export type ImapVerbinder = (z: Zugang, ordner: string) => Promise<ImapSitzung>;

export interface GeleseneMail {
  messageId?: string;
  betreff: string;
  datum: Date | null;
  absenderName: string;
  absenderAdresse: string;
  text: string;
  anhaenge: Array<{ name: string; mime: string; inhalt: Buffer; eingebettet: boolean }>;
}
export type MailLeser = (quelle: Buffer) => Promise<GeleseneMail>;

export interface PostfachDeps {
  dienst: Dienst;
  einstellungen: Einstellungen;
  verbinde: ImapVerbinder;
  lies: MailLeser;
  verschluessele: (klartext: string) => string;
  entschluessele: (wert: string) => string | null;
  pause?: () => string | null;
  sperre?: () => Promise<boolean>;
  /** Wirft 507, wenn die Speicherplatz-Grenze erreicht ist. */
  platz?: () => Promise<void>;
  /** Meldung an die Administratoren nach wiederholten Fehlern. */
  anAdmins?: (betreff: string, text: string) => Promise<void>;
  /** Anmeldung per OAuth 2.0 (#358). */
  oauth?: PostfachOAuth;
  jetzt?: () => number;
}

const SYSTEMNAME = 'Postfach';
const MAX_EREIGNISSE = 20;
const MAX_GESEHEN = 10_000;
const FEHLER_MELDEN_AB = 3;
const log = protokoll.modul('ablage');

const NEU: Omit<Postfach, 'id'> = {
  name: '', aktiv: true, server: '', port: 993, verschluesselung: 'ssl', benutzer: '', passwort: '', ordner: 'INBOX', abstand: 5,
  fuer: null, absender: [], nachher: 'verschieben', zielordner: 'DMS', nurMitAnhang: false, original: true,
};

const text = (v: unknown, max = 250) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Eingaben prüfen; ein leeres Passwort behält das bisherige. */
export function pruefePostfach(x: unknown, alt: Postfach | null, verschluessele: (k: string) => string): Postfach {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const basis: Postfach = alt ?? { id: randomUUID(), ...NEU };
  const name = o.name === undefined ? basis.name : text(o.name, 80);
  const server = o.server === undefined ? basis.server : text(o.server, 200);
  const port = o.port === undefined ? basis.port : Math.round(Number(o.port));
  const v = (o.verschluesselung ?? basis.verschluesselung) as Verschluesselung;
  const abstand = o.abstand === undefined ? basis.abstand : Math.round(Number(o.abstand));
  const nachher = (o.nachher ?? basis.nachher) as Nachher;
  const fehler: string[] = [];
  if (!name) fehler.push('Bitte einen Namen angeben.');
  if (!/^[a-z0-9.-]+$/i.test(server)) fehler.push('Server: z. B. imap.example.org.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fehler.push('Port: 1 bis 65535 (meist 993).');
  if (!['ssl', 'starttls', 'keine'].includes(v)) fehler.push('Verschlüsselung: SSL/TLS, STARTTLS oder keine.');
  if (v === 'keine' && o.unverschluesseltBestaetigt !== true && basis.verschluesselung !== 'keine') fehler.push('Ohne Verschlüsselung gehen Passwort und Mails im Klartext über das Netz. Bitte ausdrücklich bestätigen.');
  if (!Number.isInteger(abstand) || abstand < 1 || abstand > 1440) fehler.push('Abrufabstand: 1 bis 1440 Minuten.');
  if (!['verschieben', 'gelesen', 'loeschen'].includes(nachher)) fehler.push('Nach dem Übernehmen: verschieben, als gelesen markieren oder löschen.');
  const absender = o.absender === undefined ? basis.absender
    : (Array.isArray(o.absender) ? o.absender : String(o.absender ?? '').split(/[\s,;]+/)).map((a) => String(a).trim().toLowerCase().replace(/^@/, '')).filter(Boolean).slice(0, 100);
  if (absender.some((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$|^[^\s@]+\.[^\s@]+$/.test(a))) fehler.push('Absender: Adressen (name@example.org) oder Domains (example.org).');
  const benutzer = o.benutzer === undefined ? basis.benutzer : text(o.benutzer, 200);
  if (!benutzer) fehler.push('Bitte den Benutzernamen des Postfachs angeben.');
  // Steuerzeichen (#358): Der Benutzername steht bei OAuth im XOAUTH2-Feld „user=…“.
  else if (/[\x00-\x1f\x7f]/.test(benutzer)) fehler.push('Benutzername: ohne Zeilenumbrüche und Steuerzeichen.');
  const anmeldung = (o.anmeldung ?? basis.anmeldung ?? 'passwort') as Anmeldeart;
  if (!['passwort', 'oauth'].includes(anmeldung)) fehler.push('Anmeldung: Passwort oder OAuth 2.0.');
  const anbieter = (o.anbieter ?? basis.anbieter ?? 'microsoft') as OAuthAnbieter;
  if (anmeldung === 'oauth' && !OAUTH_ANBIETER.includes(anbieter)) fehler.push('Anbieter: Microsoft, Google oder anderer Anbieter.');
  if (anmeldung === 'oauth' && v === 'keine') fehler.push('OAuth 2.0 nur mit Verschlüsselung (SSL/TLS oder STARTTLS).');
  const neuesPasswort = anmeldung === 'passwort' && typeof o.passwort === 'string' && o.passwort !== '' ? o.passwort.slice(0, 500) : null;
  if (anmeldung === 'passwort' && !neuesPasswort && !basis.passwort) fehler.push('Bitte das Passwort (bei vielen Anbietern ein App-Passwort) angeben.');
  // Das gespeicherte Passwort geht nur an den Server, für den es eingegeben wurde (#358, Sicherheits-Review).
  else if (anmeldung === 'passwort' && !neuesPasswort && alt && alt.anmeldung !== 'oauth' && !gleicherServer(alt, { server, port, verschluesselung: v })) fehler.push('Server, Port oder Verschlüsselung geändert: Bitte das Passwort neu eingeben – das gespeicherte geht nur an den bisherigen Server.');
  if (fehler.length) throw new Fachfehler(422, fehler.join(' '));
  return {
    ...basis, name, server, port, verschluesselung: v, benutzer, abstand, nachher, absender, anmeldung,
    ...(anmeldung === 'oauth' ? { anbieter } : { anbieter: undefined }),
    // Beim Wechsel auf OAuth bleibt kein Passwort liegen.
    passwort: anmeldung === 'oauth' ? '' : neuesPasswort ? verschluessele(neuesPasswort) : basis.passwort,
    aktiv: o.aktiv === undefined ? basis.aktiv : o.aktiv === true,
    ordner: o.ordner === undefined ? basis.ordner : text(o.ordner, 200) || 'INBOX',
    zielordner: o.zielordner === undefined ? basis.zielordner : text(o.zielordner, 200) || 'DMS',
    fuer: o.fuer === undefined ? basis.fuer : (typeof o.fuer === 'string' && o.fuer ? o.fuer : null),
    nurMitAnhang: o.nurMitAnhang === undefined ? basis.nurMitAnhang : o.nurMitAnhang === true,
    original: o.original === undefined ? basis.original : o.original === true,
  };
}

/** Gleicher Server, Port und gleiche Verschlüsselung – nur dann darf ein gespeichertes Geheimnis mit (#358). */
export function gleicherServer(a: Pick<Postfach, 'server' | 'port' | 'verschluesselung'>, b: Pick<Postfach, 'server' | 'port' | 'verschluesselung'>): boolean {
  return a.server.toLowerCase() === b.server.toLowerCase() && a.port === b.port && a.verschluesselung === b.verschluesselung;
}

/** Passt der Absender zum Filter (Adresse genau oder Domain samt Subdomains)? */
export function absenderPasst(adresse: string, filter: string[]): boolean {
  if (!filter.length) return true;
  const a = adresse.toLowerCase();
  const domain = a.split('@')[1] ?? '';
  return filter.some((f) => (f.includes('@') ? a === f : domain === f || domain.endsWith(`.${f}`)));
}

/** Fehler der Verbindung in verständlichen Worten. */
export function verstaendlich(e: unknown, oauth = false): string {
  const x = e as { authenticationFailed?: boolean; code?: string; message?: string; responseText?: string };
  const m = `${x.message ?? ''} ${x.responseText ?? ''}`;
  if (oauth && (x.authenticationFailed || /AUTHENTICATIONFAILED|authentication failed|invalid credentials|AUTHENTICATE failed/i.test(m))) return 'Anmeldung per OAuth abgelehnt: Stimmt der Benutzername (die Mail-Adresse des angemeldeten Kontos)? Hat die App die Berechtigung für IMAP (Microsoft: IMAP.AccessAsUser.All) und ist IMAP für das Postfach eingeschaltet?';
  if (x.authenticationFailed || /AUTHENTICATIONFAILED|authentication failed|invalid credentials|LOGIN failed/i.test(m)) return 'Anmeldung abgelehnt: Benutzername oder Passwort stimmen nicht. Viele Anbieter verlangen ein App-Passwort.';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'].includes(x.code ?? '') || /timeout|getaddrinfo|connect/i.test(m)) return `Server nicht erreichbar (${x.code ?? 'keine Antwort'}). Adresse und Port prüfen.`;
  if (/CERT|certificate|self[- ]signed|SSL|TLS/i.test(`${x.code ?? ''} ${m}`)) return `Zertifikat ungültig oder Verschlüsselung passt nicht (${x.code ?? x.message}). Verschlüsselung und Port prüfen (SSL/TLS meist 993, STARTTLS meist 143).`;
  if (/mailbox|NONEXISTENT|doesn.t exist/i.test(m)) return `Ordner nicht gefunden: ${x.message}`;
  return x.message || 'Unbekannter Fehler beim Abruf.';
}

interface Merker { uidValidity: string; maxUid: number; gesehen: string[] }
interface Journal { postfach: string; uid: number; schluessel: string; mappeId: string; erstellt: boolean }

export class Postfaecher {
  private laeuft = new Set<string>();
  private zeitgeber?: NodeJS.Timeout;
  private naechster = new Map<string, number>();
  private gesperrt = false;

  constructor(private d: PostfachDeps) {}
  private jetzt() { return this.d.jetzt?.() ?? Date.now(); }

  async liste(): Promise<Postfach[]> { return ((await this.d.einstellungen.lies('postfaecher')) as Postfach[] | null) ?? []; }
  private async speichereListe(l: Postfach[]) { await this.d.einstellungen.schreibe('postfaecher', l); }

  private async stand(id: string): Promise<PostfachStand> {
    const s = (await this.d.einstellungen.lies(`postfach_stand_${id}`)) as Partial<PostfachStand> | null;
    const n = this.naechster.get(id);
    return { letzterAbruf: s?.letzterAbruf ?? null, naechsterAbruf: n ? new Date(n).toISOString() : null, fehlerFolge: s?.fehlerFolge ?? 0, uebernommen: s?.uebernommen ?? [], fehler: s?.fehler ?? [] };
  }
  private async setzeStand(id: string, f: (s: PostfachStand) => PostfachStand) {
    const neu = f(await this.stand(id));
    await this.d.einstellungen.schreibe(`postfach_stand_${id}`, { ...neu, naechsterAbruf: undefined });
  }

  async ansicht(): Promise<PostfachAnsicht[]> {
    return Promise.all((await this.liste()).map(async (p) => {
      const { passwort, ...rest } = p;
      return { ...rest, anmeldung: p.anmeldung ?? 'passwort', passwortGesetzt: !!passwort, stand: await this.stand(p.id), oauth: p.anmeldung === 'oauth' && this.d.oauth ? await this.d.oauth.status(p.id) : null };
    }));
  }

  /** Für die Übersicht der Werkbank (#358): OAuth-Postfächer, die abgelaufen oder nicht angemeldet sind. */
  async anmeldungFehlt(): Promise<Array<{ id: string; name: string; zustand: 'abgelaufen' | 'abgemeldet' }>> {
    if (!this.d.oauth) return [];
    const aus: Array<{ id: string; name: string; zustand: 'abgelaufen' | 'abgemeldet' }> = [];
    for (const p of await this.liste()) {
      if (p.anmeldung !== 'oauth' || !p.aktiv) continue;
      const s = await this.d.oauth.status(p.id);
      if (s.zustand !== 'ok') aus.push({ id: p.id, name: p.name, zustand: s.zustand });
    }
    return aus;
  }

  /** Das Postfach (für den OAuth-Ablauf in den Routen). */
  async hole(id: string): Promise<Postfach> {
    const p = (await this.liste()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, 'Dieses Postfach gibt es nicht.');
    return p;
  }

  async speichere(x: unknown, id: string | null, von: string): Promise<PostfachAnsicht[]> {
    const l = await this.liste();
    const alt = id ? l.find((p) => p.id === id) ?? null : null;
    if (id && !alt) throw new Fachfehler(404, 'Dieses Postfach gibt es nicht.');
    if (x && typeof x === 'object' && typeof (x as { fuer?: unknown }).fuer === 'string' && (x as { fuer: string }).fuer && !(await this.d.dienst.gibtMappe((x as { fuer: string }).fuer))) throw new Fachfehler(422, 'Diesen Benutzer gibt es nicht.');
    const neu = pruefePostfach(x, alt, this.d.verschluessele);
    await this.speichereListe(alt ? l.map((p) => (p.id === alt.id ? neu : p)) : [...l, neu]);
    // Verbindung oder Ordner geändert: wieder von vorn zählen (Message-IDs schützen vor Doppelten).
    if (alt && (alt.server !== neu.server || alt.benutzer !== neu.benutzer || alt.ordner !== neu.ordner)) {
      const m = await this.merker(neu.id);
      await this.d.einstellungen.schreibe(`postfach_merker_${neu.id}`, { ...m, uidValidity: '', maxUid: 0 });
    }
    // OAuth (#358): Anmeldeart, Anbieter, Konto oder Server geändert – die gespeicherte Anmeldung gilt nicht mehr
    // (das Token geht nur an den Server, für den angemeldet wurde).
    if (alt && alt.anmeldung === 'oauth' && (neu.anmeldung !== 'oauth' || alt.anbieter !== neu.anbieter || alt.benutzer !== neu.benutzer || !gleicherServer(alt, neu))) await this.d.oauth?.abmelden(neu.id, von);
    this.naechster.delete(neu.id);
    log.info(alt ? 'Postfach geändert' : 'Postfach angelegt', { von, postfach: neu.name, server: neu.server });
    return this.ansicht();
  }

  async loesche(id: string, von: string) {
    const l = await this.liste();
    const p = l.find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, 'Dieses Postfach gibt es nicht.');
    await this.speichereListe(l.filter((x) => x.id !== id));
    for (const k of ['stand', 'merker']) await this.d.einstellungen.schreibe(`postfach_${k}_${id}`, null);
    if (p.anmeldung === 'oauth') await this.d.oauth?.abmelden(id, von);
    await this.d.oauth?.vergiss(id);
    log.info('Postfach gelöscht', { von, postfach: p.name });
  }

  private async zugang(p: Postfach): Promise<Zugang> {
    if (p.anmeldung === 'oauth') {
      if (!this.d.oauth || !p.anbieter) throw new Fachfehler(409, 'Die Anmeldung per OAuth ist nicht eingerichtet.');
      const zugriffstoken = await this.d.oauth.zugriffstoken({ id: p.id, name: p.name, benutzer: p.benutzer, anbieter: p.anbieter });
      return { server: p.server, port: p.port, verschluesselung: p.verschluesselung, benutzer: p.benutzer, passwort: '', zugriffstoken };
    }
    const passwort = p.passwort ? this.d.entschluessele(p.passwort) : null;
    if (!passwort) throw new Fachfehler(409, 'Das Passwort des Postfachs ist nicht lesbar. Bitte in der Werkbank neu eingeben.');
    return { server: p.server, port: p.port, verschluesselung: p.verschluesselung, benutzer: p.benutzer, passwort };
  }

  /**
   * Verbindung testen – mit gespeicherten oder eben eingegebenen Angaben. Ein eben eingegebenes Passwort darf an
   * jeden Server; ein gespeichertes Geheimnis (Passwort oder OAuth-Token) nur an den gespeicherten Server, Port und
   * die gespeicherte Verschlüsselung (#358, Sicherheits-Review) – sonst 400.
   */
  async teste(x: unknown, id: string | null): Promise<{ ok: boolean; text: string; ordner?: string[]; anzahl?: number }> {
    const alt = id ? (await this.liste()).find((p) => p.id === id) ?? null : null;
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    let p: Postfach;
    // Ein geändertes gespeichertes Passwort meldet pruefePostfach schon (422) – beim Testen als 400 mit Hinweis.
    try { p = pruefePostfach(o, alt, (k) => `klar:${k}`); } catch (e) {
      if (/Passwort neu eingeben/.test((e as Error).message)) throw new Fachfehler(400, 'Server, Port oder Verschlüsselung geändert: Das gespeicherte Passwort geht nur an den gespeicherten Server. Bitte das Passwort neu eingeben oder erst speichern.');
      return { ok: false, text: (e as Error).message };
    }
    if (p.anmeldung === 'oauth') {
      if (!alt || alt.anmeldung !== 'oauth' || alt.anbieter !== p.anbieter || alt.benutzer !== p.benutzer) return { ok: false, text: 'Bitte zuerst speichern und dann beim Anbieter anmelden.' };
      if (!gleicherServer(alt, p)) throw new Fachfehler(400, 'Server, Port oder Verschlüsselung geändert: Bitte erst speichern und dann beim Anbieter neu anmelden – das Token geht nur an den gespeicherten Server.');
    }
    const frisch = p.anmeldung === 'passwort' && typeof o.passwort === 'string' && o.passwort !== '';
    if (p.anmeldung === 'passwort' && !frisch && (!alt || !gleicherServer(alt, p))) throw new Fachfehler(400, 'Server, Port oder Verschlüsselung geändert: Das gespeicherte Passwort geht nur an den gespeicherten Server. Bitte das Passwort neu eingeben oder erst speichern.');
    let zugang: Zugang;
    try { zugang = frisch ? { ...p, passwort: p.passwort.slice(5) } : await this.zugang(p); } catch (e) { return { ok: false, text: (e as Error).message }; }
    try {
      const s = await this.d.verbinde(zugang, p.ordner);
      try {
        const ordner = await s.ordnerListe();
        return { ok: true, text: `Verbunden. Im Ordner „${p.ordner}“ ${s.anzahl === 1 ? 'liegt 1 Mail' : `liegen ${s.anzahl} Mails`}.`, ordner, anzahl: s.anzahl };
      } finally { await s.schliessen().catch(() => {}); }
    } catch (e) { return { ok: false, text: verstaendlich(e, p.anmeldung === 'oauth') }; }
  }

  start(ms = 30_000) {
    this.zeitgeber = setInterval(() => void this.faellige().catch((e) => log.error('Postfächer abrufen fehlgeschlagen', { fehler: (e as Error).message })), ms);
    this.zeitgeber.unref?.();
  }
  stop() { if (this.zeitgeber) clearInterval(this.zeitgeber); }

  /** Alle fälligen Postfächer abrufen (Abstand, nach Fehlern immer länger warten). */
  async faellige() {
    if (this.d.pause?.()) return;
    for (const p of await this.liste()) {
      if (!p.aktiv) continue;
      const n = this.naechster.get(p.id);
      if (n && n > this.jetzt()) continue;
      // OAuth (#358): abgelaufen oder noch nicht angemeldet – nicht immer wieder versuchen; die Werkbank warnt.
      if (p.anmeldung === 'oauth' && this.d.oauth && (await this.d.oauth.status(p.id)).zustand !== 'ok') continue;
      await this.abrufen(p.id).catch(() => {});
    }
  }

  /** Ein Postfach abrufen. Liefert die Zahl übernommener Mails. */
  async abrufen(id: string): Promise<number> {
    const p = (await this.liste()).find((x) => x.id === id);
    if (!p) throw new Fachfehler(404, 'Dieses Postfach gibt es nicht.');
    const pause = this.d.pause?.();
    if (pause) throw new Fachfehler(409, `Der Abruf ruht gerade: ${pause}.`);
    if (this.d.sperre && !(await this.d.sperre())) { this.gesperrt = true; return 0; }
    this.gesperrt = false;
    if (this.laeuft.has(id)) return 0;
    this.laeuft.add(id);
    let n = 0;
    try {
      const s = await this.d.verbinde(await this.zugang(p), p.ordner);
      try { n = await this.uebernimmAlle(p, s); } finally { await s.schliessen().catch(() => {}); }
      await this.setzeStand(p.id, (st) => ({ ...st, letzterAbruf: new Date(this.jetzt()).toISOString(), fehlerFolge: 0 }));
      this.naechster.set(p.id, this.jetzt() + p.abstand * 60_000);
      return n;
    } catch (e) {
      const text = e instanceof Fachfehler ? e.message : verstaendlich(e, p.anmeldung === 'oauth');
      const st = await this.stand(p.id);
      const folge = st.fehlerFolge + 1;
      await this.setzeStand(p.id, (x) => ({ ...x, letzterAbruf: new Date(this.jetzt()).toISOString(), fehlerFolge: folge, fehler: [{ zeit: new Date(this.jetzt()).toISOString(), fehler: text }, ...x.fehler].slice(0, MAX_EREIGNISSE) }));
      // Immer länger warten: Abstand × 2^Fehler, höchstens 6 Stunden.
      this.naechster.set(p.id, this.jetzt() + Math.min(p.abstand * 60_000 * 2 ** folge, 6 * 3600_000));
      log.warn('Postfach: Abruf fehlgeschlagen', { postfach: p.name, fehler: text, folge });
      // Abgelaufene OAuth-Anmeldung meldet postfach-oauth.ts selbst, einmal.
      if (folge === FEHLER_MELDEN_AB && !(e instanceof AnmeldungAbgelaufen)) await this.d.anAdmins?.(`DMS: Postfach „${p.name}“ lässt sich nicht abrufen`, `Der Abruf des Postfachs „${p.name}“ (${p.benutzer} auf ${p.server}) ist ${folge}-mal hintereinander fehlgeschlagen:\n\n${text}\n\nDas DMS versucht es weiter, mit wachsendem Abstand. Einstellungen: Werkbank → Postfächer.`).catch(() => {});
      throw e instanceof AnmeldungAbgelaufen ? e : new Fachfehler(502, text);
    } finally { this.laeuft.delete(id); }
  }

  private async merker(id: string): Promise<Merker> {
    const m = (await this.d.einstellungen.lies(`postfach_merker_${id}`)) as Partial<Merker> | null;
    return { uidValidity: m?.uidValidity ?? '', maxUid: m?.maxUid ?? 0, gesehen: m?.gesehen ?? [] };
  }

  private async uebernimmAlle(p: Postfach, s: ImapSitzung): Promise<number> {
    let m = await this.merker(p.id);
    // UIDVALIDITY geändert: Die UIDs gelten nicht mehr – alles neu ansehen, Message-IDs verhindern Doppelte.
    if (m.uidValidity !== s.uidValidity) m = { ...m, uidValidity: s.uidValidity, maxUid: 0 };
    await this.raeumeJournalAuf(p, s, m);
    const gesehen = new Set(m.gesehen);
    let n = 0;
    for (const k of await s.neue(m.maxUid + 1)) {
      if (k.uid <= m.maxUid) continue;
      if (this.d.pause?.()) break;
      const quelle = await s.quelle(k.uid);
      const schluessel = (k.messageId?.trim() || `sha256:${createHash('sha256').update(quelle).digest('hex')}`).toLowerCase();
      if (gesehen.has(schluessel)) {
        // Schon übernommen (z. B. nach geänderter UIDVALIDITY): nur noch wegräumen.
        await this.nachher(p, s, k.uid);
      } else if (await this.uebernimm(p, s, k.uid, quelle, schluessel)) {
        n++;
        gesehen.add(schluessel);
      }
      m = { ...m, maxUid: k.uid, gesehen: [...gesehen].slice(-MAX_GESEHEN) };
      await this.d.einstellungen.schreibe(`postfach_merker_${p.id}`, m);
    }
    await this.d.einstellungen.schreibe(`postfach_merker_${p.id}`, { ...m, gesehen: [...gesehen].slice(-MAX_GESEHEN) });
    return n;
  }

  /** Eine Mail übernehmen. false = übersprungen (Filter), bleibt unverändert im Postfach. */
  private async uebernimm(p: Postfach, s: ImapSitzung, uid: number, quelle: Buffer, schluessel: string): Promise<boolean> {
    const mail = await this.d.lies(quelle);
    if (!absenderPasst(mail.absenderAdresse, p.absender)) return false;
    const anhaenge = mail.anhaenge.filter((a) => !a.eingebettet);
    if (p.nurMitAnhang && !anhaenge.length) return false;
    await this.d.platz?.();
    const mappeId = randomUUID();
    await this.d.einstellungen.schreibe('postfach_journal', { postfach: p.id, uid, schluessel, mappeId, erstellt: false } satisfies Journal);
    const absender = mail.absenderName && mail.absenderAdresse ? `${mail.absenderName} <${mail.absenderAdresse}>` : mail.absenderAdresse || mail.absenderName;
    const datum = mail.datum && !Number.isNaN(mail.datum.getTime()) ? mail.datum : null;
    const abgelehnt: string[] = [];
    const post = await this.d.dienst.legePostAn({
      betreff: mail.betreff || '(ohne Betreff)', absender, ...(datum ? { datum: datum.toISOString().slice(0, 10) } : {}),
      ...(p.fuer ? { fuer: p.fuer } : {}), nachricht: mail.text.slice(0, NOTIZ_MAX),
    }, { id: null, name: SYSTEMNAME }, undefined, POST_KANAL.email, {
      text: `aus Postfach „${p.name}“ übernommen (Mail von ${absender || 'unbekannt'}${datum ? ` vom ${datum.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : ''})`,
      postfach: p.name,
    }, mappeId);
    await this.d.einstellungen.schreibe('postfach_journal', { postfach: p.id, uid, schluessel, mappeId, erstellt: true } satisfies Journal);
    const anzahl = await this.ladeAnhaenge(p, post.id, mail, quelle, abgelehnt);
    await this.nachher(p, s, uid);
    await this.d.einstellungen.schreibe('postfach_journal', null);
    await this.setzeStand(p.id, (st) => ({ ...st, uebernommen: [{ zeit: new Date(this.jetzt()).toISOString(), betreff: mail.betreff, absender, mappeId: post.id }, ...st.uebernommen].slice(0, MAX_EREIGNISSE) }));
    log.info('Postfach: Mail übernommen', { postfach: p.name, mappe: post.id, anhaenge: anzahl });
    return true;
  }

  /** Anhänge (und wahlweise die Original-Mail) als Dokumente; Abgelehntes mit Grund in die Historie. */
  private async ladeAnhaenge(p: Postfach, postId: string, mail: GeleseneMail, quelle: Buffer, abgelehnt: string[] = []): Promise<number> {
    const register = (await this.d.dienst.postTyp()).register.find((r) => r.art === 'dokumente')?.key;
    const dateien = mail.anhaenge.filter((a) => !a.eingebettet);
    if (p.original) dateien.push({ name: `${(mail.betreff || 'Mail').replace(/[\\/:*?"<>|\r\n]+/g, ' ').slice(0, 80).trim() || 'Mail'}.eml`, mime: 'message/rfc822', inhalt: quelle, eingebettet: false });
    let n = 0;
    const doppelt: string[] = [];
    for (const a of dateien) {
      if (a.inhalt.length > MAX_DATEIGROESSE) { abgelehnt.push(`${a.name}: größer als 100 MB`); continue; }
      if (!a.inhalt.length) { abgelehnt.push(`${a.name}: leer`); continue; }
      try {
        const r = await this.d.dienst.ladeHoch(postId, { register, name: a.name, typ: a.mime }, a.inhalt, null);
        n++;
        // Doppelt (#333): Hinweis ohne Titel – wer die Post liest, sieht beim Zuordnen nur die Fundstellen, die er lesen darf.
        if (r.gleicherInhalt.some((g) => g.mappeId !== postId)) doppelt.push(a.name);
      } catch (e) { abgelehnt.push(`${a.name}: ${(e as Error).message}`); }
    }
    if (doppelt.length) await this.d.dienst.notiereSystem(postId, SYSTEMNAME, `Doppelt: ${doppelt.map((x) => `„${x}“`).join(', ')} ${doppelt.length === 1 ? 'liegt' : 'liegen'} schon im DMS – vor dem Zuordnen prüfen.`);
    if (abgelehnt.length) await this.d.dienst.notiereSystem(postId, SYSTEMNAME, `Nicht übernommene Anhänge: ${abgelehnt.join('; ')}`);
    return n;
  }

  /** Nach einem Absturz: Gibt es die Post schon, die Mail nur noch wegräumen und merken. */
  private async raeumeJournalAuf(p: Postfach, s: ImapSitzung, m: Merker) {
    const j = (await this.d.einstellungen.lies('postfach_journal')) as Journal | null;
    if (!j || j.postfach !== p.id) return;
    if (await this.d.dienst.gibtMappe(j.mappeId)) {
      // Abbruch vor den Anhängen? Dann jetzt nachholen.
      if (!j.erstellt || !(await this.d.dienst.anzahlDokumente(j.mappeId))) {
        const quelle = await s.quelle(j.uid).catch(() => null);
        if (quelle) await this.ladeAnhaenge(p, j.mappeId, await this.d.lies(quelle), quelle).catch(() => 0);
      }
      m.gesehen = [...m.gesehen, j.schluessel].slice(-MAX_GESEHEN);
      await this.d.einstellungen.schreibe(`postfach_merker_${p.id}`, m);
      await this.nachher(p, s, j.uid).catch(() => {});
      log.warn('Postfach: nach einem Abbruch aufgeräumt – keine doppelte Post', { postfach: p.name, mappe: j.mappeId });
    }
    await this.d.einstellungen.schreibe('postfach_journal', null);
  }

  private async nachher(p: Postfach, s: ImapSitzung, uid: number) {
    if (p.nachher === 'loeschen') await s.loesche(uid);
    else if (p.nachher === 'gelesen') await s.gelesen(uid);
    else await s.verschiebe(uid, p.zielordner || 'DMS');
  }

  get andereInstanz() { return this.gesperrt; }
}
