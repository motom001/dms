import { createHash, randomUUID } from 'node:crypto';
import { NOTIZ_MAX, POST_KANAL } from '../../shared/src/model';
import type { Dienst } from './dienst';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import { ohne } from '../../shared/src/fassungen';
import { legeAnhaengeAb } from './postfach-anhaenge';
import { protokoll } from './protokoll';
import { imapGemessen } from './externmessung';
import { AnmeldungAbgelaufen, OAUTH_ANBIETER, type OAuthAnbieter, type OAuthStatus, type PostfachOAuth } from './postfach-oauth';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';

/**
 * Postfächer (#196): Das DMS holt Mails per IMAP ab und macht aus jeder genau eine neue Post
 * (Kanal „E-Mail“). Der Text steht an der Post. Jeder Anhang wird ein eigenes Dokument, in der
 * Reihenfolge der MIME-Struktur (#999, `eingangNr`); kleine eingebettete Bilder (Logos, Signaturen)
 * nicht. Ganz hinten steht wahlweise (Vorgabe ja) die E-Mail selbst als .eml mit dem Kennzeichen
 * „Original-E-Mail“: als letzte Anlage (#998) am letzten Anhang, ohne Anhänge als Hauptdokument.
 * Geteilt wird hier nichts – Trennblätter gelten im Postfach nicht (Pakete dürfen solche Post nicht
 * teilen, siehe pdf-bearbeiten); aufteilen tut die Person selbst („Post ab hier teilen“).
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
  /** Bytes hin und zurück in dieser Sitzung (#565, Messung externer Dienste), soweit bekannt. */
  bytes?(): { hin: number; zurueck: number };
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
  anAdmins?: (betreff: import('./mail').MailText, text: import('./mail').MailText) => Promise<void>;
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
  fuer: null, absender: [], nachher: 'verschieben', zielordner: 'Ablago', nurMitAnhang: false, original: true,
};

const text = (v: unknown, max = 250) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Bereich des Postfach-Editors, zu dem ein Prüffehler gehört (#1000) – steht als `details.orte` in der Antwort. */
export type PostfachOrt = 'grunddaten' | 'verbindung' | 'abholen';

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
  // Jeder Fehler mit seinem Bereich im Editor (#1000): Grunddaten, Verbindung oder Abholen.
  const fehler: string[] = [];
  const orte = new Set<PostfachOrt>();
  const melde = (ort: PostfachOrt, text: string) => { fehler.push(text); orte.add(ort); };
  if (!name) melde('grunddaten', t('meldungen.postfach.bitte-einen-namen-angeben'));
  if (!/^[a-z0-9.-]+$/i.test(server)) melde('verbindung', t('meldungen.postfach.server-z-b-imap'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) melde('verbindung', t('meldungen.postfach.port-1-bis-65535'));
  if (!['ssl', 'starttls', 'keine'].includes(v)) melde('verbindung', t('meldungen.postfach.verschluesselung-ssl-tls-starttls'));
  if (v === 'keine' && o.unverschluesseltBestaetigt !== true && basis.verschluesselung !== 'keine') melde('verbindung', t('meldungen.postfach.ohne-verschluesselung-gehen-passwort'));
  if (!Number.isInteger(abstand) || abstand < 1 || abstand > 1440) melde('abholen', t('meldungen.postfach.abrufabstand-1-bis-1440'));
  if (!['verschieben', 'gelesen', 'loeschen'].includes(nachher)) melde('abholen', t('meldungen.postfach.nach-dem-uebernehmen-verschieben'));
  const absender = o.absender === undefined ? basis.absender
    : (Array.isArray(o.absender) ? o.absender : String(o.absender ?? '').split(/[\s,;]+/)).map((a) => String(a).trim().toLowerCase().replace(/^@/, '')).filter(Boolean).slice(0, 100);
  if (absender.some((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$|^[^\s@]+\.[^\s@]+$/.test(a))) melde('abholen', t('meldungen.postfach.absender-adressen-name-example'));
  const benutzer = o.benutzer === undefined ? basis.benutzer : text(o.benutzer, 200);
  if (!benutzer) melde('verbindung', t('meldungen.postfach.bitte-den-benutzernamen-des'));
  // Steuerzeichen (#358): Der Benutzername steht bei OAuth im XOAUTH2-Feld „user=…“.
  else if (/[\x00-\x1f\x7f]/.test(benutzer)) melde('verbindung', t('meldungen.postfach.benutzername-ohne-zeilenumbrueche'));
  const anmeldung = (o.anmeldung ?? basis.anmeldung ?? 'passwort') as Anmeldeart;
  if (!['passwort', 'oauth'].includes(anmeldung)) melde('verbindung', t('meldungen.postfach.anmeldung-passwort-oder-oauth'));
  const anbieter = (o.anbieter ?? basis.anbieter ?? 'microsoft') as OAuthAnbieter;
  if (anmeldung === 'oauth' && !OAUTH_ANBIETER.includes(anbieter)) melde('verbindung', t('meldungen.postfach.anbieter-microsoft-google-oder'));
  if (anmeldung === 'oauth' && v === 'keine') melde('verbindung', t('meldungen.postfach.oauth-2-0-nur'));
  const neuesPasswort = anmeldung === 'passwort' && typeof o.passwort === 'string' && o.passwort !== '' ? o.passwort.slice(0, 500) : null;
  if (anmeldung === 'passwort' && !neuesPasswort && !basis.passwort) melde('verbindung', t('meldungen.postfach.bitte-das-passwort-bei'));
  // Das gespeicherte Passwort geht nur an den Server, für den es eingegeben wurde (#358, Sicherheits-Review).
  else if (anmeldung === 'passwort' && !neuesPasswort && alt && alt.anmeldung !== 'oauth' && !gleicherServer(alt, { server, port, verschluesselung: v })) melde('verbindung', t('meldungen.postfach.server-port-oder-verschluesselung'));
  if (fehler.length) throw new Fachfehler(422, fehler.join(' '), { orte: [...orte] });
  return {
    ...basis, name, server, port, verschluesselung: v, benutzer, abstand, nachher, absender, anmeldung,
    ...(anmeldung === 'oauth' ? { anbieter } : { anbieter: undefined }),
    // Beim Wechsel auf OAuth bleibt kein Passwort liegen.
    passwort: anmeldung === 'oauth' ? '' : neuesPasswort ? verschluessele(neuesPasswort) : basis.passwort,
    aktiv: o.aktiv === undefined ? basis.aktiv : o.aktiv === true,
    ordner: o.ordner === undefined ? basis.ordner : text(o.ordner, 200) || 'INBOX',
    zielordner: o.zielordner === undefined ? basis.zielordner : text(o.zielordner, 200) || 'Ablago',
    fuer: o.fuer === undefined ? basis.fuer : (typeof o.fuer === 'string' && o.fuer ? o.fuer : null),
    nurMitAnhang: o.nurMitAnhang === undefined ? basis.nurMitAnhang : o.nurMitAnhang === true,
    original: o.original === undefined ? basis.original : o.original === true,
  };
}

/** Stand eines Postfachs für die Fassungen (#1006): ohne Id und ohne Passwort – nur, ob eines gesetzt ist. */
export function postfachStand(p: Postfach): Record<string, unknown> & { name: string; passwortGesetzt: boolean } {
  return { ...ohne(p, 'id', 'passwort'), passwortGesetzt: !!p.passwort };
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
  if (oauth && (x.authenticationFailed || /AUTHENTICATIONFAILED|authentication failed|invalid credentials|AUTHENTICATE failed/i.test(m))) return t('meldungen.postfach.anmeldung-per-oauth-abgelehnt');
  if (x.authenticationFailed || /AUTHENTICATIONFAILED|authentication failed|invalid credentials|LOGIN failed/i.test(m)) return t('meldungen.postfach.anmeldung-abgelehnt-benutzername');
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET'].includes(x.code ?? '') || /timeout|getaddrinfo|connect/i.test(m)) return t('meldungen.postfach.server-nicht-erreichbar-adresse', { wert: x.code ?? t('meldungen.postfach.keine-antwort') });
  if (/CERT|certificate|self[- ]signed|SSL|TLS/i.test(`${x.code ?? ''} ${m}`)) return t('meldungen.postfach.zertifikat-ungueltig-oder', { wert: String(x.code ?? x.message) });
  if (/mailbox|NONEXISTENT|doesn.t exist/i.test(m)) return t('meldungen.postfach.ordner-nicht-gefunden', { message: String(x.message) });
  return x.message || t('meldungen.postfach.unbekannter-fehler-beim-abruf');
}

interface Merker { uidValidity: string; maxUid: number; gesehen: string[] }
interface Journal { postfach: string; uid: number; schluessel: string; mappeId: string; erstellt: boolean }

export class Postfaecher {
  private laeuft = new Set<string>();
  private zeitgeber?: NodeJS.Timeout;
  private naechster = new Map<string, number>();
  private gesperrt = false;

  constructor(private d: PostfachDeps) {
    this.d = { ...d, verbinde: imapGemessen(d.verbinde) };
    // Fassungen (#1006): ohne Passwort – nur, ob eines gesetzt ist. Wiederherstellen über das normale Speichern; das
    // Passwort bleibt, wie es ist (geht nur an denselben Server, #358).
    d.dienst.fassungen.registriere({
      art: 'postfach',
      stand: async (id) => { const p = (await this.liste()).find((x) => x.id === id); return p && { name: p.name, daten: postfachStand(p) }; },
      alle: async () => (await this.liste()).map((p) => p.id),
      stelleHer: async (id, daten, o) => { await this.speichere({ ...(daten as Record<string, unknown>), passwort: undefined, unverschluesseltBestaetigt: true }, id, o.von.email ?? ''); },
    });
  }
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
    if (!p) throw new Fachfehler(404, t('meldungen.postfach.dieses-postfach-gibt-es'));
    return p;
  }

  async speichere(x: unknown, id: string | null, von: string): Promise<PostfachAnsicht[]> {
    const l = await this.liste();
    const alt = id ? l.find((p) => p.id === id) ?? null : null;
    if (id && !alt) throw new Fachfehler(404, t('meldungen.postfach.dieses-postfach-gibt-es'));
    if (x && typeof x === 'object' && typeof (x as { fuer?: unknown }).fuer === 'string' && (x as { fuer: string }).fuer && !(await this.d.dienst.eingangskanaele.gibtMappe((x as { fuer: string }).fuer))) throw new Fachfehler(422, t('meldungen.postfach.diesen-benutzer-gibt-es'), { orte: ['grunddaten'] });
    const neu = pruefePostfach(x, alt, this.d.verschluessele);
    await this.speichereListe(alt ? l.map((p) => (p.id === alt.id ? neu : p)) : [...l, neu]);
    await this.d.dienst.kern.fassungen.halte('postfach', neu.id);
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
    if (!p) throw new Fachfehler(404, t('meldungen.postfach.dieses-postfach-gibt-es'));
    await this.d.dienst.kern.fassungen.geloescht('postfach', id, () => this.speichereListe(l.filter((x) => x.id !== id)));
    for (const k of ['stand', 'merker']) await this.d.einstellungen.schreibe(`postfach_${k}_${id}`, null);
    if (p.anmeldung === 'oauth') await this.d.oauth?.abmelden(id, von);
    await this.d.oauth?.vergiss(id);
    log.info('Postfach gelöscht', { von, postfach: p.name });
  }

  private async zugang(p: Postfach): Promise<Zugang> {
    if (p.anmeldung === 'oauth') {
      if (!this.d.oauth || !p.anbieter) throw new Fachfehler(409, t('meldungen.postfach.die-anmeldung-per-oauth'));
      const zugriffstoken = await this.d.oauth.zugriffstoken({ id: p.id, name: p.name, benutzer: p.benutzer, anbieter: p.anbieter });
      return { server: p.server, port: p.port, verschluesselung: p.verschluesselung, benutzer: p.benutzer, passwort: '', zugriffstoken };
    }
    const passwort = p.passwort ? this.d.entschluessele(p.passwort) : null;
    if (!passwort) throw new Fachfehler(409, t('meldungen.postfach.das-passwort-des-postfachs'));
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
      if (/Passwort neu eingeben/.test((e as Error).message)) throw new Fachfehler(400, t('meldungen.postfach.server-port-oder-verschluesselung-2'));
      return { ok: false, text: (e as Error).message };
    }
    if (p.anmeldung === 'oauth') {
      if (!alt || alt.anmeldung !== 'oauth' || alt.anbieter !== p.anbieter || alt.benutzer !== p.benutzer) return { ok: false, text: t('meldungen.postfach.bitte-zuerst-speichern-und') };
      if (!gleicherServer(alt, p)) throw new Fachfehler(400, t('meldungen.postfach.server-port-oder-verschluesselung-3'));
    }
    const frisch = p.anmeldung === 'passwort' && typeof o.passwort === 'string' && o.passwort !== '';
    if (p.anmeldung === 'passwort' && !frisch && (!alt || !gleicherServer(alt, p))) throw new Fachfehler(400, t('meldungen.postfach.server-port-oder-verschluesselung-2'));
    let zugang: Zugang;
    try { zugang = frisch ? { ...p, passwort: p.passwort.slice(5) } : await this.zugang(p); } catch (e) { return { ok: false, text: (e as Error).message }; }
    try {
      const s = await this.d.verbinde(zugang, p.ordner);
      try {
        const ordner = await s.ordnerListe();
        return { ok: true, text: t('meldungen.postfach.verbunden-im-ordner-liegen', { anzahl: s.anzahl, ordner: p.ordner }), ordner, anzahl: s.anzahl };
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
    if (!p) throw new Fachfehler(404, t('meldungen.postfach.dieses-postfach-gibt-es'));
    const pause = this.d.pause?.();
    if (pause) throw new Fachfehler(409, t('meldungen.postfach.der-abruf-ruht-gerade', { pause }));
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
      if (folge === FEHLER_MELDEN_AB && !(e instanceof AnmeldungAbgelaufen)) await this.d.anAdmins?.(() => t('meldungen.postfach.ablago-postfach-laesst-sich', { name: p.name }), () => t('meldungen.postfach.der-abruf-des-postfachs', { name: p.name, benutzer: p.benutzer, server: p.server, folge, text })).catch(() => {});
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
    const post = await this.d.dienst.post.legePostAn({
      betreff: mail.betreff || t('meldungen.postfach.ohne-betreff'), von: absender, ...(datum ? { datum: datum.toISOString().slice(0, 10) } : {}),
      ...(p.fuer ? { an: p.fuer } : {}), nachricht: mail.text.slice(0, NOTIZ_MAX),
    }, { id: null, name: SYSTEMNAME }, undefined, POST_KANAL.email, {
      text: t('meldungen.postfach.aus-postfach-uebernommen-mail', { name: p.name, wert: absender || t('meldungen.postfach.unbekannt'), wert2: datum ? t('meldungen.postfach.vom', { datum: datum.toLocaleString(gebietsschema(), { dateStyle: 'short', timeStyle: 'short' }) }) : '' }),
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

  /** Anhänge (und wahlweise die Original-E-Mail) als Dokumente der Post (#999, postfach-anhaenge.ts). */
  private ladeAnhaenge(p: Postfach, postId: string, mail: GeleseneMail, quelle: Buffer, abgelehnt: string[] = []): Promise<number> {
    return legeAnhaengeAb(this.d.dienst, { postId, mail, quelle, original: p.original, von: SYSTEMNAME }, abgelehnt);
  }

  /** Nach einem Absturz: Gibt es die Post schon, die Mail nur noch wegräumen und merken. */
  private async raeumeJournalAuf(p: Postfach, s: ImapSitzung, m: Merker) {
    const j = (await this.d.einstellungen.lies('postfach_journal')) as Journal | null;
    if (!j || j.postfach !== p.id) return;
    if (await this.d.dienst.eingangskanaele.gibtMappe(j.mappeId)) {
      // Abbruch vor den Anhängen? Dann jetzt nachholen.
      if (!j.erstellt || !(await this.d.dienst.eingangskanaele.anzahlDokumente(j.mappeId))) {
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
    else await s.verschiebe(uid, p.zielordner || 'Ablago');
  }

  get andereInstanz() { return this.gesperrt; }
}

