import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import { Hochgeladen, nimmAuf } from './hochladen';
import { MAX_DATEIGROESSE, POST_KANAL, type Benutzer, type Dokument, type Mappe, type Register } from '../../shared/src/model';
import { kinderVon, type Sicht } from '../../shared/src/sichten';
import { ersetzePlatzhalter, kannStempeln, WEBDAV_VORLAGE, type GeltenderStempel } from '../../shared/src/stempel';
import { pdfName } from './ausgabe';
import { NUR_ZAEHLER, PRAEFIX, type ApiSchluessel, type ApiSchluesselDienst } from './apischluessel';
import { t } from './sprache';
import type { Dienst, Zugriff } from './dienst';
import { MIME } from './eingangsordner';
import type { Einstellungen } from './einstellungen';
import { DateiFehlt } from './dateispeicher';
import { Fachfehler } from './fehler';
import { speicherKurzzustand, type Kurzzustand } from './kurzzustand';
import type { Konten } from './konten';
import { protokoll } from './protokoll';
import { dateiKoepfe } from './routen';
import {
  ABLAGE, basic, davFehler, eindeutig, istHilfsdatei, kurzId, multistatus, NEUE_POST, proppatchAntwort, proppatchNamen,
  Ratenbegrenzung, schluessel, sperrAntwort, VERKNUEPFT, WEBDAV_PFAD, zerlege, type Eintrag,
} from './webdav-baum';
import { anteilVon } from './zwischenspeicher';
import { WEBDAV_STEMPEL_SPEICHER as STEMPEL_SPEICHER, WEBDAV_XML_MAX as XML_MAX } from './grenzen';

/**
 * WebDAV-Laufwerk (#346), Stufe 1: lesen und ablegen.
 *
 *   /webdav/Neue Post/                                   Datei hineinlegen = neue Post (Kanal „WebDAV“)
 *   /webdav/Ablage/<Ansicht>/<Mappe>/<Register>/<Datei>  lesen (Herunterladen nur mit Exportrecht E);
 *                                                        Datei hineinlegen = Dokument (gleicher Name + Versionierung = neue Version)
 *   /webdav/Ablage/<Ansicht>/<Mappe>/Verknüpft/<Mappe>/… verknüpfte Mappen, nur EINE Ebene (keine Endlosschleifen)
 *
 * Anmeldung: HTTP Basic mit E-Mail-Adresse und API-Schlüssel (nie mit dem Passwort), Fehlversuche zählen im
 * Anmeldeschutz. Rechte wie in der Oberfläche. Namen werden bei jeder Anfrage aus den Listen abgeleitet
 * (bereinigt, eindeutig mit Kurzkennung) – keine eigene Tabelle.
 *
 * LOCK/UNLOCK: macOS bindet ein Laufwerk ohne „DAV: 2“ nur lesend ein, Windows und macOS sperren eine Datei vor
 * dem Hochladen. Stufe 1 antwortet darum mit einer Schein-Sperre (Token, nicht durchgesetzt) – nur dort, wo
 * Ablegen erlaubt ist. Echte Sperren gegen gleichzeitiges Überschreiben kommen mit Stufe 2 (Office bearbeiten).
 *
 * Stempel beim Lesen (#722): Herunterladen ist Mitnehmen (gemeinsame Prüfstelle, #723). Hat der Mappentyp einen
 * Pflicht-Stempel, kommt jede Datei gestempelt heraus (Bilder als PDF), auch wenn die Einstellung „aus“ ist; sonst
 * stempelt die gewählte Vorlage PDFs (Vorgabe: die mitgelieferte Vorlage „webdav“). Größe und ETag beziehen sich auf
 * die gestempelte Fassung. Register mit Pflicht-Stempel sind schreibgeschützt; gestempelt ausgelieferte Dokumente
 * lassen sich nicht überschreiben (neue Dateien ablegen geht). „Nur lesend“ sperrt alles Schreibende für alle.
 */

export const WEBDAV_METHODEN = ['OPTIONS', 'GET', 'HEAD', 'PUT', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'DELETE', 'COPY', 'MOVE', 'LOCK', 'UNLOCK'] as const;
/** Methoden, die Fastify nicht von sich aus kennt (addHttpMethod), mit Körper ja/nein. */
export const WEBDAV_ZUSATZMETHODEN: Array<[string, boolean]> = [['PROPFIND', true], ['PROPPATCH', true], ['MKCOL', true], ['COPY', false], ['MOVE', false], ['LOCK', true], ['UNLOCK', false]];

/** Höchstens so viele Mappen je Ansichtsordner (Schutz vor Massenabrufen). */
export const MAX_EINTRAEGE = 1000;
/** Anfragen je Benutzer und Minute (Explorer und Finder fragen beim Blättern viel). */
export const STANDARD_GRENZE = 600;
const SCHWEBEND_MS = 10 * 60_000;
const SCHWEBEND = 'webdav-schwebend';
/** Höchstens so viele schwebende Dateien je Benutzer und Ort zeigt der Ordner. */
const SCHWEBEND_MAX = 200;
const SPERRE_SEKUNDEN = 3600;
const ZUGRIFFE = 50;
/** Gleichzeitige Uploads (PUT) je Benutzer – jeder belegt bis zu 100 MB (seit #746 als temporäre Datei, nicht im Speicher). */
export const MAX_UPLOADS = 3;
/** Längste E-Mail-Adresse (RFC 5321); längere Eingaben werden für Protokoll und Anmeldeschutz gekürzt. */
const EMAIL_MAX = 254;

const log = protokoll.modul('dokumente');
const logKonto = protokoll.modul('konto');

export interface WebdavEinstellung {
  aktiv: boolean;
  /** Stempel beim Lesen (#722): Id einer Stempel-Vorlage oder null (aus). Ohne Angabe die mitgelieferte Vorlage. */
  stempel: string | null;
  /** Nur lesend für alle Benutzer (#722): alle schreibenden Methoden einschließlich LOCK → 403. */
  nurLesend: boolean;
}
export interface WebdavZugriff { zeit: string; benutzer: string; methode: string; pfad: string; status: number }
export interface WebdavStand {
  einstellung: WebdavEinstellung;
  /** Adresse zum Einbinden, z. B. https://dms.example.org/webdav/ */
  adresse: string;
  https: boolean;
  grenze: number;
  anfragen: number;
  zugriffe: WebdavZugriff[];
  /** Stempel-Vorlagen zur Auswahl für „Stempel beim Lesen“. */
  vorlagen: Array<{ id: string; name: string; text: string }>;
}

export interface WebdavAnfrage {
  methode: string;
  url: string;
  kopf(name: string): string | undefined;
  ip: string;
  /** Körper als Strom (Fastify) oder Puffer (Tests); bei Methoden ohne Körper leer. */
  koerper?: Readable | Buffer | null;
}
export interface WebdavAntwort {
  status: number;
  koepfe: Record<string, string>;
  body?: string | Buffer | Readable;
  /** Für die Anfragezeile im Protokoll: nur lesend (Stufe debug). */
  lesend?: boolean;
}

export interface WebdavDeps {
  dienst: Dienst;
  konten: Konten;
  schluessel?: ApiSchluesselDienst;
  einstellungen: Einstellungen;
  /** Adresse des DMS für die Anzeige in der Werkbank. */
  adresse?: () => string;
  /** Wartungsmodus (#102): wie die API – im aktiven Wartungsmodus 503. */
  wartung?: { pruefeAnfrage(r: { pfad: string; zugang: string }, b: { verwaltung?: string[]; art?: string } | undefined): void };
  jetzt?: () => number;
  grenze?: number;
  /** Zustand zwischen Anfragen (#744: Zählfenster, schwebende Dateien); ohne Angabe im Arbeitsspeicher. */
  zustand?: Kurzzustand;
}

type Knoten =
  | { art: 'wurzel' }
  | { art: 'post' }
  | { art: 'ablage' }
  | { art: 'sicht'; sicht: Sicht }
  | { art: 'mappe'; id: string; tiefe: number; geaendert?: string; erstellt?: string }
  | { art: 'verknuepft'; id: string }
  | { art: 'register'; mappeId: string; register: Register }
  | { art: 'dokument'; dok: Dokument; mappeId: string; register: Register }
  | { art: 'schwebend'; s: Schwebend }
  | { art: 'hilfsdatei' };
interface Kind { name: string; k: Knoten }
interface Schwebend { ort: string; name: string; groesse: number; zeit: string }
interface Ctx {
  b: Benutzer; s: ApiSchluessel; z: Zugriff; e: WebdavEinstellung;
  mappen: Map<string, Awaited<ReturnType<Dienst['berechtigungen']['laufwerkMappe']>>>;
  /** Stempel je Mappentyp (#722) und ob eine Mappe hinausdarf (#723) – einmal je Anfrage. */
  stempel: Map<string, Promise<Awaited<ReturnType<Dienst['laufwerkStempel']>>>>;
  raus: Map<string, Promise<boolean>>;
}
/** Was beim Lesen eines Dokuments hinausgeht (#722): gestempelt oder das Original, mit Größe und ETag dazu. */
interface Auslieferung {
  gestempelt: boolean; name: string; mime: string; groesse: number; etag: string;
  inhalt(): Promise<Buffer | Readable>;
  /** Pflicht-Stempel, der sich nicht bilden lässt: die Datei geht nicht hinaus. */
  fehler?: string;
}
/** Methoden, die etwas ändern würden (#722: bei „nur lesend“ und in schreibgeschützten Registern 403). */
const SCHREIBEND = new Set(['PUT', 'PROPPATCH', 'MKCOL', 'DELETE', 'COPY', 'MOVE', 'LOCK']);
const LESEMETHODEN = ['OPTIONS', 'GET', 'HEAD', 'PROPFIND'];
/**
 * Gestempelte Fassungen im Speicher: höchstens so viele Bytes; Größe und Stand bleiben länger gemerkt. Mit mehreren
 * Prozessen teilen sie sich die Bytes (#874, `anteilVon`); die Einträge (nur Größe und Stand) bleiben je Prozess.
 */
const stempelSpeicher = () => anteilVon(STEMPEL_SPEICHER);
const STEMPEL_EINTRAEGE = 2000;

const text = (status: number, t: string, extra: Record<string, string> = {}): WebdavAntwort => ({ status, koepfe: { 'content-type': 'text/plain; charset=utf-8', ...extra }, body: `${t}\n` });
const xmlAntwort = (status: number, body: string, extra: Record<string, string> = {}): WebdavAntwort => ({ status, koepfe: { 'content-type': 'application/xml; charset=utf-8', ...extra }, body });
const ORDNER_ARTEN = new Set(['wurzel', 'post', 'ablage', 'sicht', 'mappe', 'verknuepft', 'register']);
const istOrdner = (k: Knoten) => ORDNER_ARTEN.has(k.art);
/** Ort für schwebende Dateien (leer abgelegt, noch ohne Inhalt): Neue Post oder ein Register einer Mappe. */
const ortVon = (k: Knoten): string | null => (k.art === 'post' ? 'post' : k.art === 'register' ? `${k.mappeId}:${k.register.key}` : null);

async function lies(koerper: WebdavAnfrage['koerper'], max: number): Promise<Buffer> {
  if (!koerper) return Buffer.alloc(0);
  if (Buffer.isBuffer(koerper)) { if (koerper.length > max) throw new Fachfehler(413, t('meldungen.webdav.die-datei-ist-zu')); return koerper; }
  const teile: Buffer[] = [];
  let n = 0;
  for await (const eintrag of koerper) {
    const b = Buffer.isBuffer(eintrag) ? eintrag : Buffer.from(eintrag as string);
    n += b.length;
    if (n > max) { koerper.destroy(); throw new Fachfehler(413, t('meldungen.webdav.die-datei-ist-zu')); }
    teile.push(b);
  }
  return Buffer.concat(teile);
}
/** Körper lesen und wegwerfen, nur Bytes zählen (Hilfsdateien): nichts im Speicher, Grenze trotzdem. */
async function leere(koerper: WebdavAnfrage['koerper'], max: number): Promise<void> {
  if (!koerper) return;
  if (Buffer.isBuffer(koerper)) { if (koerper.length > max) throw new Fachfehler(413, t('meldungen.webdav.die-datei-ist-zu')); return; }
  let n = 0;
  for await (const eintrag of koerper) {
    n += Buffer.isBuffer(eintrag) ? eintrag.length : Buffer.byteLength(String(eintrag));
    if (n > max) { koerper.destroy(); throw new Fachfehler(413, t('meldungen.webdav.die-datei-ist-zu')); }
  }
}
/**
 * ETag eines Dokuments: nicht der reine Inhalts-Hash (sonst ließe sich mit Leserecht ohne Exportrecht
 * bestätigen, dass eine Datei einen bestimmten Inhalt hat), sondern ein Hash aus Dokument-Id und Inhalt.
 */
export function etagVon(d: Pick<Dokument, 'id' | 'sha256'>): string {
  return `"${createHash('sha256').update(`${d.id}:${d.sha256}`).digest('hex').slice(0, 32)}"`;
}
/** ETag der gestempelten Fassung (#722): ändert sich mit Stempel, Text (Datum, Leser) und Inhalt. */
function etagGestempelt(d: Pick<Dokument, 'id' | 'sha256'>, signatur: string): string {
  return `"${createHash('sha256').update(`${d.id}:${d.sha256}:${signatur}`).digest('hex').slice(0, 32)}"`;
}
/** Unbenutzten Körper verwerfen, damit die Verbindung frei wird. */
function verwerfe(koerper: WebdavAnfrage['koerper']) {
  if (koerper && !Buffer.isBuffer(koerper) && typeof koerper.resume === 'function') koerper.resume();
}

export class Webdav {
  private grenze: Ratenbegrenzung;
  private zugriffe: WebdavZugriff[] = [];
  private anfragen = 0;
  private zustand: Kurzzustand;
  private cache: { wert: WebdavEinstellung; bis: number } | null = null;
  /** Laufende Uploads je Benutzer-Id (MAX_UPLOADS). */
  private uploads = new Map<string, number>();
  /** Gestempelte Fassungen (#722) je Dokument, Inhalt und Stempel; `inhalt` fällt bei Platzmangel weg. */
  private gestempelt = new Map<string, { gestempelt: boolean; groesse: number; inhalt: Buffer | null }>();
  private stempelBytes = 0;
  private jetzt: () => number;

  constructor(private d: WebdavDeps) {
    this.jetzt = d.jetzt ?? Date.now;
    this.zustand = d.zustand ?? speicherKurzzustand(this.jetzt);
    this.grenze = new Ratenbegrenzung(d.grenze ?? STANDARD_GRENZE, this.jetzt, 60_000, this.zustand);
  }

  /* ---------- Werkbank ---------- */

  async einstellung(): Promise<WebdavEinstellung> {
    if (this.cache && this.cache.bis > this.jetzt()) return this.cache.wert;
    const roh = (await this.d.einstellungen.lies('webdav')) as Partial<WebdavEinstellung> | null;
    // Stempel (#722): ohne Angabe die mitgelieferte Vorlage (neue Installationen; bestehende über Migration 067).
    const stempel = roh && 'stempel' in roh ? (typeof roh.stempel === 'string' && roh.stempel ? roh.stempel : null) : WEBDAV_VORLAGE;
    const wert: WebdavEinstellung = { aktiv: roh?.aktiv === true, stempel, nurLesend: roh?.nurLesend === true };
    this.cache = { wert, bis: this.jetzt() + 5000 };
    return wert;
  }

  async speichere(e: unknown, von: string): Promise<WebdavStand> {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const hat = (k: string) => k in x && x[k] !== undefined;
    if (!hat('aktiv') && !hat('stempel') && !hat('nurLesend')) throw new Fachfehler(422, t('meldungen.webdav.aktiv-true-oder-false'));
    if (hat('aktiv') && typeof x.aktiv !== 'boolean') throw new Fachfehler(422, t('meldungen.webdav.aktiv-true-oder-false'));
    if (hat('nurLesend') && typeof x.nurLesend !== 'boolean') throw new Fachfehler(422, t('api.webdav.nur-lesend-ungueltig'));
    if (hat('stempel') && x.stempel !== null && typeof x.stempel !== 'string') throw new Fachfehler(422, t('api.webdav.stempel-ungueltig'));
    if (hat('stempel') && x.stempel && !(await this.d.dienst.stempelvorlagen.stempelVorlagen()).some((v) => v.id === x.stempel)) throw new Fachfehler(422, t('api.webdav.vorlage-fehlt'));
    const vorher = await this.einstellung();
    const neu: WebdavEinstellung = {
      aktiv: hat('aktiv') ? x.aktiv as boolean : vorher.aktiv,
      stempel: hat('stempel') ? (x.stempel as string | null) || null : vorher.stempel,
      nurLesend: hat('nurLesend') ? x.nurLesend as boolean : vorher.nurLesend,
    };
    await this.d.einstellungen.schreibe('webdav', neu);
    this.cache = null;
    if (vorher.aktiv !== neu.aktiv) (neu.aktiv ? logKonto.warn : logKonto.info)(neu.aktiv ? t('meldungen.webdav.webdav-laufwerk-eingeschaltet') : t('meldungen.webdav.webdav-laufwerk-ausgeschaltet'), { von });
    if (vorher.stempel !== neu.stempel) logKonto.info('WebDAV-Laufwerk: Stempel beim Lesen eingestellt', { vorlage: neu.stempel ?? 'aus', von });
    if (vorher.nurLesend !== neu.nurLesend) logKonto.info(neu.nurLesend ? 'WebDAV-Laufwerk nur lesend' : 'WebDAV-Laufwerk wieder mit Ablegen', { von });
    return this.stand();
  }

  async stand(): Promise<WebdavStand> {
    const basis = (this.d.adresse?.() ?? '').replace(/\/+$/, '');
    return {
      einstellung: await this.einstellung(), adresse: `${basis}${WEBDAV_PFAD}/`, https: basis.startsWith('https://'),
      grenze: this.grenze.grenze, anfragen: this.anfragen, zugriffe: [...this.zugriffe].reverse(),
      vorlagen: (await this.d.dienst.stempelvorlagen.stempelVorlagen()).map((v) => ({ id: v.id, name: v.name, text: v.text })),
    };
  }

  private merke(benutzer: string, a: WebdavAnfrage, status: number) {
    this.zugriffe.push({ zeit: new Date(this.jetzt()).toISOString(), benutzer, methode: a.methode, pfad: decodeURIComponentSicher(a.url.split('?')[0]), status });
    if (this.zugriffe.length > ZUGRIFFE) this.zugriffe.splice(0, this.zugriffe.length - ZUGRIFFE);
  }

  /* ---------- Anfrage ---------- */

  async anfrage(a: WebdavAnfrage): Promise<WebdavAntwort> {
    const methode = a.methode.toUpperCase();
    if (!(await this.einstellung()).aktiv) { verwerfe(a.koerper); return text(404, t('meldungen.webdav.nicht-gefunden')); }
    const pfad = zerlege(a.url);
    if (!pfad) { verwerfe(a.koerper); return text(400, t('meldungen.webdav.ungueltiger-pfad')); }
    if (methode === 'OPTIONS') {
      verwerfe(a.koerper);
      // Nur lesend (#722): ohne „DAV: 2“ (keine Sperren) bindet macOS das Laufwerk schreibgeschützt ein.
      const nur = (await this.einstellung()).nurLesend;
      return { status: 200, lesend: true, koepfe: { dav: nur ? '1' : '1, 2', 'ms-author-via': 'DAV', allow: (nur ? LESEMETHODEN : WEBDAV_METHODEN).join(', '), 'content-length': '0' } };
    }
    this.anfragen++;
    let wer = '';
    const hilfsdatei = pfad.teile.length > 0 && istHilfsdatei(pfad.teile[pfad.teile.length - 1]);
    let antwort: WebdavAntwort;
    try {
      const ctx = await this.anmelden(a);
      if ('status' in ctx) { verwerfe(a.koerper); antwort = ctx.antwort; wer = ctx.wer; }
      else {
        wer = ctx.b.email;
        const r = await this.grenze.pruefe(ctx.b.id);
        if (!r.ok) {
          if (r.erstes) logKonto.warn('WebDAV: zu viele Anfragen, kurz gebremst', { benutzer: ctx.b.email, grenze: this.grenze.grenze });
          verwerfe(a.koerper);
          antwort = text(429, t('meldungen.webdav.zu-viele-anfragen-bitte'), { 'retry-after': String(r.sekunden) });
        } else {
          this.d.wartung?.pruefeAnfrage({ pfad: '/api/v1/webdav', zugang: 'angemeldet' }, ctx.b);
          antwort = await this.verarbeite(methode, pfad.teile, a, ctx);
        }
      }
    } catch (e) {
      verwerfe(a.koerper);
      const f = e as Fachfehler & { retryAfter?: number };
      if (!(e instanceof Fachfehler)) throw e;
      antwort = text(f.status, f.message, f.retryAfter ? { 'retry-after': String(f.retryAfter) } : {});
    }
    if (!hilfsdatei && wer) this.merke(wer, a, antwort.status);
    return antwort;
  }

  /** Basic mit E-Mail-Adresse und API-Schlüssel. Liefert den Kontext oder die Antwort (401/429). */
  private async anmelden(a: WebdavAnfrage): Promise<Ctx | { status: true; antwort: WebdavAntwort; wer: string }> {
    const nein = (text2: string) => text(401, text2, { 'www-authenticate': t('meldungen.webdav.basic-realm-ablago-charset') });
    const c = basic(a.kopf('authorization'));
    if (!c) return { status: true, wer: '', antwort: nein(t('meldungen.webdav.bitte-mit-e-mail')) };
    const email = c.name.toLowerCase();
    // Für Protokoll, Zugriffsliste und Anmeldeschutz gekürzt – die Eingabe stammt vom Anfragenden.
    const kurz = email.slice(0, EMAIL_MAX);
    // Anmeldeschutz (#240): gesperrte Adressen und Konten kommen auch hier nicht hinein.
    await this.d.konten.sperre.pruefe(kurz, a.ip);
    let s: ApiSchluessel | undefined;
    let b: Benutzer | undefined;
    // Nur API-Schlüssel – ein Passwort wird hier nie geprüft (Zwei-Faktor bleibt wirksam).
    if (c.passwort.startsWith(PRAEFIX) && this.d.schluessel) {
      try { s = await this.d.schluessel.pruefe(`Bearer ${c.passwort}`); } catch { s = undefined; }
      b = s ? await this.d.konten.benutzerMitId(s.benutzerId) : undefined;
    }
    // Dienstkonten aus #338 (Pakete) haben API-Schlüssel nur für den DMS-Prozess – nie über das Laufwerk.
    const dienstkonto = (b as { art?: string } | undefined)?.art === 'dienst';
    if (!s || !b || b.email.toLowerCase() !== email || dienstkonto) {
      // Gehört die Adresse zu einem aktiven Konto, meldet der Anmeldeschutz eine Sperre sofort (#368).
      await this.d.konten.sperre.fehlschlag(kurz, a.ip, email.length <= EMAIL_MAX && await this.d.konten.istAktiveEmail(email));
      logKonto.info('WebDAV: Anmeldung abgelehnt', { email: kurz, ip: a.ip, grund: dienstkonto ? 'Dienstkonto' : c.passwort.startsWith(PRAEFIX) ? 'Schlüssel ungültig oder gehört nicht zu dieser Adresse' : 'kein API-Schlüssel' });
      return { status: true, wer: kurz, antwort: nein(t('meldungen.webdav.e-mail-adresse-oder')) };
    }
    await this.d.konten.sperre.erfolg(kurz, a.ip);
    // „Nur Zähler“ (#625): Schlüssel stimmt, öffnet aber das Laufwerk nicht.
    if (s.recht === NUR_ZAEHLER) {
      logKonto.info('WebDAV: Anmeldung abgelehnt', { email: kurz, ip: a.ip, grund: 'Schlüssel nur Zähler' });
      return { status: true, wer: kurz, antwort: text(403, t('api.schluessel.nur-zaehler-laufwerk')) };
    }
    return { b, s, z: await this.d.dienst.rechtepruefung.zugriff(b), e: await this.einstellung(), mappen: new Map(), stempel: new Map(), raus: new Map() };
  }

  private async verarbeite(methode: string, teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    // Nur lesend (#722): für alle Benutzer, auch Hilfsdateien und Schein-Sperren.
    if (ctx.e.nurLesend && SCHREIBEND.has(methode)) { verwerfe(a.koerper); return text(403, t('api.webdav.nur-lesend')); }
    // Register mit Pflicht-Stempel (#722): nichts ablegen, ändern, umbenennen, kopieren oder löschen.
    if (methode === 'MKCOL' || methode === 'DELETE' || methode === 'MOVE' || methode === 'COPY') {
      verwerfe(a.koerper);
      if (await this.inPflichtMappe(teile, ctx)) return text(403, t('api.webdav.pflicht'));
    }
    switch (methode) {
      case 'PROPFIND': return this.propfind(teile, a, ctx);
      case 'GET': case 'HEAD': verwerfe(a.koerper); return this.hole(teile, ctx, methode === 'HEAD', a);
      case 'PUT': return this.lege(teile, a, ctx);
      case 'LOCK': return this.sperre(teile, a, ctx);
      case 'UNLOCK': verwerfe(a.koerper); return { status: 204, koepfe: {} };
      case 'PROPPATCH': {
        const body = (await lies(a.koerper, XML_MAX)).toString('utf8');
        const k = await this.finde(teile, ctx);
        if (!k) return text(404, t('meldungen.webdav.nicht-gefunden'));
        if (await this.istPflicht(k, ctx)) return text(403, t('api.webdav.pflicht'));
        if (k.art === 'dokument' && (await this.auslieferung(k, ctx))?.gestempelt) return text(403, t('api.webdav.gestempelt', { name: k.dok.name }));
        return xmlAntwort(207, proppatchAntwort(teile, istOrdner(k), proppatchNamen(body)));
      }
      case 'MKCOL': verwerfe(a.koerper); return text(403, t('meldungen.webdav.ordner-lassen-sich-ueber'));
      case 'DELETE': verwerfe(a.koerper); return text(403, t('meldungen.webdav.loeschen-geht-ueber-das'));
      case 'MOVE': verwerfe(a.koerper); return text(403, t('meldungen.webdav.umbenennen-und-verschieben-gehen'));
      case 'COPY': verwerfe(a.koerper); return text(403, t('meldungen.webdav.kopieren-innerhalb-des-laufwerks'));
      default: verwerfe(a.koerper); return text(405, t('meldungen.webdav.diese-methode-unterstuetzt-das'), { allow: WEBDAV_METHODEN.join(', ') });
    }
  }

  /* ---------- Baum ---------- */

  private async mappe(id: string, ctx: Ctx) {
    let m = ctx.mappen.get(id);
    if (!m) { m = await this.d.dienst.berechtigungen.laufwerkMappe(id, ctx.z); ctx.mappen.set(id, m); }
    return m;
  }

  /* ---------- Stempel und Mitnehmen (#722, #723) ---------- */

  private leser(ctx: Ctx) { return ctx.b.name || ctx.b.email; }

  /** Stempel beim Lesen für Mappen dieses Typs: Pflicht des Typs, sonst die Vorlage der Einstellung. */
  private stempelFuer(typId: string, ctx: Ctx) {
    let p = ctx.stempel.get(typId);
    if (!p) { p = this.d.dienst.laufwerkStempel(typId, ctx.e.stempel, this.leser(ctx)); ctx.stempel.set(typId, p); }
    return p;
  }
  /** Hat der Mappentyp dieser Mappe einen Pflicht-Stempel? Dann ist sie über das Laufwerk nur lesbar. */
  private async pflichtMappe(mappeId: string, ctx: Ctx): Promise<boolean> {
    const m = await this.mappe(mappeId, ctx);
    return (await this.stempelFuer(m.mappe.typId, ctx)).pflicht;
  }
  private mappeVon(k: Knoten): string | null {
    return k.art === 'mappe' || k.art === 'verknuepft' ? k.id : k.art === 'register' || k.art === 'dokument' ? k.mappeId : null;
  }
  private async istPflicht(k: Knoten, ctx: Ctx): Promise<boolean> {
    const id = this.mappeVon(k);
    return !!id && this.pflichtMappe(id, ctx);
  }
  /** Liegt der Pfad (oder bei neuen Namen sein Ordner) in einer Mappe mit Pflicht-Stempel? */
  private async inPflichtMappe(teile: string[], ctx: Ctx): Promise<boolean> {
    const { k, eltern } = await this.loese(teile, ctx);
    const ziel = k ?? eltern;
    return !!ziel && this.istPflicht(ziel, ctx);
  }
  /** Darf die Mappe über das Laufwerk hinaus (Lesen und Exportrecht, gemeinsame Prüfstelle #723)? */
  private darfRaus(mappeId: string, ctx: Ctx): Promise<boolean> {
    let p = ctx.raus.get(mappeId);
    if (!p) { p = this.d.dienst.mitnehmbar(ctx.b, ctx.z, [mappeId]).then((x) => x.has(mappeId)); ctx.raus.set(mappeId, p); }
    return p;
  }

  /**
   * Was beim Lesen herauskommt (#722). Pflicht: jede stempelbare Datei gestempelt (Bilder als PDF), sonst gar nicht;
   * Vorlage der Einstellung: nur PDFs, und lässt sich eins nicht stempeln (z. B. verschlüsselt), das Original.
   * Gestempelte Fassungen merkt sich das Laufwerk, damit Größe (PROPFIND) und Inhalt (GET) übereinstimmen.
   */
  private async auslieferung(k: Extract<Knoten, { art: 'dokument' }>, ctx: Ctx): Promise<Auslieferung> {
    const d = k.dok;
    const original: Auslieferung = {
      gestempelt: false, name: d.name, mime: d.anzeigbar ? d.mime : 'application/octet-stream', groesse: d.groesse, etag: etagVon(d),
      inhalt: async () => (await this.d.dienst.dokumente.dokumentInhalt(d.id)).inhalt,
    };
    const m = await this.mappe(k.mappeId, ctx);
    const s = await this.stempelFuer(m.mappe.typId, ctx);
    if (s.pflicht && !s.plan) return { ...original, fehler: s.fehler ?? t('api.webdav.nicht-stempelbar', { name: d.name }) };
    if (!s.plan || (!s.pflicht && d.mime !== 'application/pdf')) return original;
    if (!kannStempeln(d.mime)) return { ...original, fehler: t('api.webdav.nicht-stempelbar', { name: d.name }) };
    const plan: GeltenderStempel = s.plan;
    const text = ersetzePlatzhalter(plan.stempel.text, { empfaenger: plan.empfaenger, benutzer: this.leser(ctx), mappe: m.mappe.titel || t('meldungen.webdav.ohne-titel') });
    const signatur = createHash('sha256').update(JSON.stringify([plan.stempel, text, d.archivnummer ?? null])).digest('hex');
    const schluessel = `${d.id}:${d.sha256}:${signatur}`;
    const name = d.mime === 'application/pdf' ? d.name : pdfName(d.name);
    const fertig = (inhalt: Buffer | null, groesse: number): Auslieferung => ({
      gestempelt: true, name, mime: 'application/pdf', groesse, etag: etagGestempelt(d, signatur),
      inhalt: async () => inhalt ?? (await this.stemple(d, m.mappe, plan, ctx, schluessel)).inhalt!,
    });
    const alt = this.gestempelt.get(schluessel);
    if (alt) {
      this.gestempelt.delete(schluessel); this.gestempelt.set(schluessel, alt);
      if (!alt.gestempelt) return original;
      return fertig(alt.inhalt, alt.groesse);
    }
    try {
      const neu = await this.stemple(d, m.mappe, plan, ctx, schluessel);
      return fertig(neu.inhalt, neu.groesse);
    } catch (e) {
      // Datei fehlt (#877): nichts merken, nichts ausliefern – GET antwortet 404, PROPFIND zeigt das Dokument weiter.
      if (e instanceof DateiFehlt) return { ...original, inhalt: async () => { throw e; } };
      // Beschädigte PDFs scheitern auch unterwegs im PDF-Leser (kein Fachfehler) – das Laufwerk bleibt dabei ruhig.
      const grund = e instanceof Fachfehler ? e.message : t('api.webdav.nicht-stempelbar', { name: d.name });
      if (!(e instanceof Fachfehler)) log.debug('WebDAV: Stempeln fehlgeschlagen', { id: d.id, fehler: (e as Error).message });
      if (s.pflicht) return { ...original, fehler: grund };
      // Freiwilliger Stempel: Lässt sich das PDF nicht stempeln, geht das Original hinaus (und bleibt überschreibbar).
      this.merkeStempel(schluessel, { gestempelt: false, groesse: d.groesse, inhalt: null });
      log.debug('WebDAV: PDF ließ sich nicht stempeln, Original ausgeliefert', { id: d.id, grund });
      return original;
    }
  }
  private async stemple(d: Dokument, m: Mappe, plan: GeltenderStempel, ctx: Ctx, schluessel: string) {
    const a = await this.d.dienst.laufwerkAusgabe(d, m, plan, this.leser(ctx));
    const eintrag = { gestempelt: true, groesse: a.inhalt.length, inhalt: a.inhalt };
    this.merkeStempel(schluessel, eintrag);
    return eintrag;
  }
  /** Merken mit Grenzen: älteste Inhalte fallen zuerst weg, Größen bleiben bis STEMPEL_EINTRAEGE. */
  private merkeStempel(schluessel: string, e: { gestempelt: boolean; groesse: number; inhalt: Buffer | null }) {
    const alt = this.gestempelt.get(schluessel);
    if (alt?.inhalt) this.stempelBytes -= alt.inhalt.length;
    this.gestempelt.delete(schluessel);
    if (e.inhalt && e.inhalt.length > stempelSpeicher() / 4) e = { ...e, inhalt: null };
    this.gestempelt.set(schluessel, e);
    if (e.inhalt) this.stempelBytes += e.inhalt.length;
    for (const [k, v] of this.gestempelt) {
      if (this.stempelBytes <= stempelSpeicher() && this.gestempelt.size <= STEMPEL_EINTRAEGE) break;
      if (k === schluessel) continue;
      if (this.gestempelt.size > STEMPEL_EINTRAEGE) { this.gestempelt.delete(k); if (v.inhalt) this.stempelBytes -= v.inhalt.length; continue; }
      if (v.inhalt) { this.stempelBytes -= v.inhalt.length; v.inhalt = null; }
    }
  }
  /** Wird dieses Dokument gestempelt ausgeliefert? Nur für Leser mit Exportrecht – andere bekommen es ohnehin nicht. */
  private async istGestempelt(k: Extract<Knoten, { art: 'dokument' }>, ctx: Ctx): Promise<boolean> {
    return (await this.darfRaus(k.mappeId, ctx)) && (await this.auslieferung(k, ctx)).gestempelt;
  }

  /*
   * Schwebende Dateien (leer angelegt, Inhalt folgt mit der nächsten Anfrage) im Kurzzustand (#744): Die nächste Anfrage
   * darf bei einem anderen Prozess landen. Schlüssel „Benutzer|Ort|Name“, gültig SCHWEBEND_MS.
   */
  private async schwebende(ctx: Ctx, ort: string): Promise<Schwebend[]> {
    return (await this.zustand.liste(SCHWEBEND, `${ctx.b.id}|${ort}|`, SCHWEBEND_MAX)).map((x) => x.wert as Schwebend).sort((a, b) => a.zeit.localeCompare(b.zeit));
  }
  private async merkeSchwebend(ctx: Ctx, ort: string, name: string, groesse: number) {
    const t = this.jetzt();
    await this.zustand.setze(SCHWEBEND, `${ctx.b.id}|${ort}|${schluessel(name)}`, { ort, name, groesse, zeit: new Date(t).toISOString() } satisfies Schwebend, t + SCHWEBEND_MS);
  }
  private async vergiss(ctx: Ctx, ort: string, name: string) {
    await this.zustand.loesche(SCHWEBEND, `${ctx.b.id}|${ort}|${schluessel(name)}`);
  }

  private async kinder(k: Knoten, ctx: Ctx): Promise<Kind[]> {
    switch (k.art) {
      case 'wurzel': return [{ name: NEUE_POST, k: { art: 'post' } }, { name: ABLAGE, k: { art: 'ablage' } }];
      case 'post': return (await this.schwebende(ctx, 'post')).map((s) => ({ name: s.name, k: { art: 'schwebend', s } }));
      case 'ablage': {
        const sichten = await this.d.dienst.sichtenVerwaltung.listeSichten(ctx.z);
        // Reihenfolge wie im Baum der Ablage; alle Ansichten auf einer Ebene.
        const reihe: Sicht[] = [];
        const besuche = (eltern: string | null) => { for (const s of kinderVon(sichten, eltern)) { if (!reihe.includes(s)) { reihe.push(s); besuche(s.id); } } };
        besuche(null);
        for (const s of sichten) if (!reihe.includes(s)) reihe.push(s);
        const namen = eindeutig(reihe.map((s) => ({ name: s.name, kurz: kurzId(s.id) })));
        return reihe.map((s, i) => ({ name: namen[i], k: { art: 'sicht', sicht: s } }));
      }
      case 'sicht': {
        const r = await this.d.dienst.sichten.seite(ctx.b, { sicht: k.sicht.id, anzahl: MAX_EINTRAEGE }, ctx.z, MAX_EINTRAEGE);
        const mappen = (r.mappen as Array<Mappe & { verborgen?: boolean }>).filter((m) => !m.verborgen)
          .sort((x, y) => (x.titel ?? '').localeCompare(y.titel ?? '', 'de') || x.erstellt.localeCompare(y.erstellt) || x.id.localeCompare(y.id));
        if (r.gesamt > MAX_EINTRAEGE) log.debug('WebDAV: Ansicht gekürzt', { sicht: k.sicht.name, gesamt: r.gesamt, gezeigt: MAX_EINTRAEGE });
        const namen = eindeutig(mappen.map((m) => ({ name: m.titel || t('meldungen.webdav.ohne-titel'), kurz: kurzId(m.id) })));
        return mappen.map((m, i) => ({ name: namen[i], k: { art: 'mappe', id: m.id, tiefe: 0, geaendert: m.geaendert, erstellt: m.erstellt } }));
      }
      case 'mappe': {
        const m = await this.mappe(k.id, ctx);
        const register = (m.typ?.register ?? []).filter((r) => r.art === 'dokumente');
        // „Verknüpft“ nur auf der ersten Ebene – so kann kein Programm endlos im Kreis laufen.
        const mitVerknuepft = k.tiefe === 0 && m.verknuepft.length > 0;
        const namen = eindeutig(register.map((r) => ({ name: r.name })), mitVerknuepft ? [VERKNUEPFT] : []);
        const erg: Kind[] = register.map((r, i) => ({ name: namen[i], k: { art: 'register', mappeId: k.id, register: r } }));
        if (mitVerknuepft) erg.push({ name: VERKNUEPFT, k: { art: 'verknuepft', id: k.id } });
        return erg;
      }
      case 'verknuepft': {
        const m = await this.mappe(k.id, ctx);
        const liste = [...m.verknuepft].sort((x, y) => x.titel.localeCompare(y.titel, 'de') || x.id.localeCompare(y.id));
        const namen = eindeutig(liste.map((v) => ({ name: v.titel || t('meldungen.webdav.ohne-titel'), kurz: kurzId(v.id) })));
        return liste.map((v, i) => ({ name: namen[i], k: { art: 'mappe', id: v.id, tiefe: 1 } }));
      }
      case 'register': {
        const m = await this.mappe(k.mappeId, ctx);
        const doks = m.dokumente.filter((x) => x.registerKey === k.register.key)
          .sort((x, y) => x.name.localeCompare(y.name, 'de') || x.erstellt.localeCompare(y.erstellt) || x.id.localeCompare(y.id));
        // Pflicht-Stempel (#722): Bilder kommen als PDF heraus und heißen darum auch so.
        const pflicht = doks.some((x) => x.mime !== 'application/pdf' && kannStempeln(x.mime)) && await this.pflichtMappe(k.mappeId, ctx);
        const namen = eindeutig(doks.map((x) => ({ name: pflicht && x.mime !== 'application/pdf' && kannStempeln(x.mime) ? pdfName(x.name) : x.name, datei: true })));
        const erg: Kind[] = doks.map((x, i) => ({ name: namen[i], k: { art: 'dokument', dok: x, mappeId: k.mappeId, register: k.register } }));
        const belegt = new Set(namen.map(schluessel));
        for (const s of await this.schwebende(ctx, ortVon(k)!)) if (!belegt.has(schluessel(s.name))) erg.push({ name: s.name, k: { art: 'schwebend', s } });
        return erg;
      }
      default: return [];
    }
  }

  /** Pfad zum Knoten auflösen; null = gibt es nicht (oder darf man nicht sehen). */
  private async finde(teile: string[], ctx: Ctx): Promise<Knoten | null> {
    return (await this.loese(teile, ctx)).k;
  }
  private async loese(teile: string[], ctx: Ctx): Promise<{ k: Knoten | null; eltern: Knoten | null }> {
    let k: Knoten = { art: 'wurzel' };
    let eltern: Knoten | null = null;
    for (let i = 0; i < teile.length; i++) {
      const name = teile[i];
      if (!istOrdner(k)) return { k: null, eltern: null };
      if (istHilfsdatei(name)) return { k: i === teile.length - 1 ? { art: 'hilfsdatei' } : null, eltern: k };
      let kids: Kind[];
      try { kids = await this.kinder(k, ctx); } catch (e) {
        // Nicht (mehr) lesbare Mappe auf dem Weg: wie „gibt es nicht“.
        if (e instanceof Fachfehler && (e.status === 404 || e.status === 403)) return { k: null, eltern: null };
        throw e;
      }
      const s = schluessel(name);
      const t = kids.find((x) => x.name === name) ?? kids.find((x) => schluessel(x.name) === s);
      eltern = k;
      if (!t) return { k: null, eltern: i === teile.length - 1 ? k : null };
      k = t.k;
    }
    return { k, eltern };
  }

  /**
   * Eintrag für PROPFIND. Größe, Art und ETag eines Dokuments beziehen sich auf das, was GET liefert – bei Stempel
   * die gestempelte Fassung (#722). Nur lesbar (kein LOCK angeboten, Windows-Attribut „schreibgeschützt“): alles bei
   * „nur lesend“, Mappen mit Pflicht-Stempel und gestempelt ausgelieferte Dokumente.
   */
  private async eintrag(teile: string[], name: string, k: Knoten, ctx: Ctx): Promise<Eintrag> {
    const nurLesend = ctx.e.nurLesend || (k.art !== 'schwebend' && await this.istPflicht(k, ctx));
    if (k.art === 'dokument') {
      const raus = await this.darfRaus(k.mappeId, ctx);
      const a = raus ? await this.auslieferung(k, ctx) : null;
      return { teile, ordner: false, name, groesse: a?.groesse ?? k.dok.groesse, mime: a?.gestempelt ? a.mime : k.dok.mime, etag: a?.etag ?? etagVon(k.dok),
        geaendert: k.dok.erstellt, erstellt: k.dok.erstellt, nurLesend: nurLesend || !!a?.gestempelt };
    }
    if (k.art === 'schwebend') return { teile, ordner: false, name, groesse: k.s.groesse, geaendert: k.s.zeit, erstellt: k.s.zeit, nurLesend };
    if (k.art === 'mappe') return { teile, ordner: true, name, geaendert: k.geaendert, erstellt: k.erstellt, nurLesend };
    return { teile, ordner: true, name, nurLesend };
  }

  /* ---------- Methoden ---------- */

  private async propfind(teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    // Körper (welche Eigenschaften) wird nicht ausgewertet: Antwort immer wie „allprop“.
    await lies(a.koerper, XML_MAX);
    const tiefe = (a.kopf('depth') ?? '1').trim().toLowerCase();
    if (tiefe !== '0' && tiefe !== '1') {
      return xmlAntwort(403, davFehler('propfind-finite-depth'));
    }
    const k = await this.finde(teile, ctx);
    if (!k || k.art === 'hilfsdatei') return text(404, t('meldungen.webdav.nicht-gefunden'));
    const name = teile.length ? teile[teile.length - 1] : 'Ablago';
    const liste = [await this.eintrag(teile, name, k, ctx)];
    if (tiefe === '1' && istOrdner(k)) for (const c of await this.kinder(k, ctx)) liste.push(await this.eintrag([...teile, c.name], c.name, c.k, ctx));
    return { ...xmlAntwort(207, multistatus(liste)), lesend: true };
  }

  private async hole(teile: string[], ctx: Ctx, nurKopf: boolean, a: WebdavAnfrage): Promise<WebdavAntwort> {
    const k = await this.finde(teile, ctx);
    if (!k || k.art === 'hilfsdatei') return text(404, t('meldungen.webdav.nicht-gefunden'));
    if (istOrdner(k)) {
      return { ...text(200, t('meldungen.webdav.dies-ist-ein-ordner')), lesend: true };
    }
    if (k.art !== 'dokument') return text(404, t('meldungen.webdav.diese-datei-ist-noch'));
    // Herunterladen gibt Daten hinaus wie ein Export (#294): gemeinsame Prüfstelle aller Wege nach draußen (#723).
    if (!(await this.darfRaus(k.mappeId, ctx))) return text(403, t('api.ausgang.webdav.eine'));
    const d = k.dok;
    // Stempel beim Lesen (#722): Pflicht des Mappentyps oder Vorlage der Einstellung.
    const aus = await this.auslieferung(k, ctx);
    if (aus.fehler) return text(403, aus.fehler);
    const etag = aus.etag;
    const koepfe: Record<string, string> = {
      ...dateiKoepfe({ inhalt: Buffer.alloc(0), name: aus.name, mime: aus.mime, anzeigen: false, groesse: aus.groesse }),
      etag, 'accept-ranges': 'none', ...(aus.gestempelt ? { 'x-dms-stempel': '1' } : {}),
    };
    const lm = httpDatumSicher(d.erstellt);
    if (lm) koepfe['last-modified'] = lm;
    const wenn = a.kopf('if-none-match');
    if (wenn && wenn.split(',').map((x) => x.trim().replace(/^W\//, '')).includes(etag)) {
      const { 'content-length': _l, ...rest } = koepfe;
      return { status: 304, koepfe: rest, lesend: true };
    }
    if (nurKopf) return { status: 200, koepfe, lesend: true };
    const inhalt = await aus.inhalt();
    // #800: Ein echter Inhaltsabruf (GET mit Inhalt – kein PROPFIND, HEAD oder „nicht geändert“) kommt in die Historie.
    // Explorer, Finder und Office lesen dieselbe Datei oft viele Male (auch für Vorschaubilder): Je Person, Datei und
    // Tag bleibt es bei einem Eintrag. Scheitert das Schreiben, geht die Datei nicht hinaus.
    try {
      await this.d.dienst.mappenHistorie.notiereAbruf({ dokumentId: d.id, benutzerId: ctx.b.id, weg: 'webdav', schluessel: ctx.s.name, gestempelt: aus.gestempelt, datei: aus.name });
    } catch (e) {
      if (!Buffer.isBuffer(inhalt)) (inhalt as Readable).destroy();
      throw e;
    }
    log.debug(aus.gestempelt ? 'Dokument über WebDAV mit Stempel heruntergeladen' : 'Dokument über WebDAV heruntergeladen', { name: d.name, id: d.id, von: ctx.b.email });
    return { status: 200, koepfe, body: inhalt, lesend: true };
  }

  /** Ziel eines Ablegens (PUT/LOCK): Ordner Neue Post oder Register, sonst Fehler. */
  private async ablageZiel(teile: string[], ctx: Ctx) {
    if (!teile.length) throw new Fachfehler(405, t('meldungen.webdav.hier-laesst-sich-nichts'));
    const name = teile[teile.length - 1];
    const { k, eltern } = await this.loese(teile, ctx);
    if (!eltern && !k) throw new Fachfehler(409, t('meldungen.webdav.diesen-ordner-gibt-es'));
    if (k && istOrdner(k)) throw new Fachfehler(405, t('meldungen.webdav.das-ist-ein-ordner'));
    const ort = eltern ? ortVon(eltern) : null;
    if (!eltern || !ort) {
      throw new Fachfehler(403, t('meldungen.webdav.hier-laesst-sich-nichts-2'));
    }
    if (ctx.s.recht !== 'schreiben') throw new Fachfehler(403, t('meldungen.webdav.dieser-api-schluessel-darf'));
    // Pflicht-Stempel (#722): Register schreibgeschützt; gestempelt ausgelieferte Dokumente nicht überschreiben
    // (sonst käme der Stempel beim Zurückspeichern in eine neue Version) – neue Dateien ablegen geht.
    if (eltern.art === 'register' && await this.pflichtMappe(eltern.mappeId, ctx)) throw new Fachfehler(403, t('api.webdav.pflicht'));
    if (k?.art === 'dokument' && await this.istGestempelt(k, ctx)) throw new Fachfehler(403, t('api.webdav.gestempelt', { name: k.dok.name }));
    return { name, k, eltern, ort };
  }

  private async lege(teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    const laenge = Number(a.kopf('content-length'));
    if (Number.isFinite(laenge) && laenge > MAX_DATEIGROESSE) { verwerfe(a.koerper); return text(413, t('meldungen.webdav.die-datei-ist-zu-2')); }
    // Hilfsdateien der Betriebssysteme (desktop.ini, .DS_Store, ._*, ~$*): überall still annehmen und verwerfen.
    // Nur Bytes zählen, nichts puffern – und das vor jeder Prüfung des Ziels (geht auch mit Lese-Schlüssel).
    if (teile.length && istHilfsdatei(teile[teile.length - 1])) { await leere(a.koerper, MAX_DATEIGROESSE); return { status: 201, koepfe: { 'content-length': '0' } }; }
    const z = await this.ablageZiel(teile, ctx);
    if (z.eltern.art === 'register') await this.d.dienst.rechtepruefung.pruefeRecht(ctx.z, z.eltern.mappeId, 'U');
    // Jeder Upload belegt bis zu 100 MB (temporäre Datei, #746): nur wenige gleichzeitig je Benutzer.
    const laufend = this.uploads.get(ctx.b.id) ?? 0;
    if (laufend >= MAX_UPLOADS) {
      verwerfe(a.koerper);
      logKonto.info('WebDAV: zu viele gleichzeitige Uploads', { benutzer: ctx.b.email, laufend });
      return text(503, t('meldungen.webdav.es-laufen-schon-mehrere'), { 'retry-after': '5' });
    }
    this.uploads.set(ctx.b.id, laufend + 1);
    try { return await this.legeAb(z, a, ctx); } finally {
      const n = (this.uploads.get(ctx.b.id) ?? 1) - 1;
      if (n > 0) this.uploads.set(ctx.b.id, n); else this.uploads.delete(ctx.b.id);
    }
  }

  private async legeAb(z: Awaited<ReturnType<Webdav['ablageZiel']>>, a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    // Hochladen als Strom (#746): in eine temporäre Datei, Prüfsumme beim Lesen; danach ist sie wieder weg.
    const inhalt = a.koerper && !Buffer.isBuffer(a.koerper) ? await nimmAuf(a.koerper, MAX_DATEIGROESSE, Number(a.kopf('content-length') ?? NaN)) : await lies(a.koerper, MAX_DATEIGROESSE);
    try { return await this.legeInhaltAb(z, inhalt, ctx); } finally { if (inhalt instanceof Hochgeladen) await inhalt.entferne(); }
  }

  private async legeInhaltAb(z: Awaited<ReturnType<Webdav['ablageZiel']>>, inhalt: Buffer | Hochgeladen, ctx: Ctx): Promise<WebdavAntwort> {
    const groesse = Buffer.isBuffer(inhalt) ? inhalt.length : inhalt.groesse;
    // Leere Datei: Explorer und Finder legen erst eine leere Datei an und schreiben dann den Inhalt.
    if (groesse === 0) {
      if (z.k?.art === 'dokument') return { status: 204, koepfe: {} };
      await this.merkeSchwebend(ctx, z.ort, z.name, 0);
      return { status: 201, koepfe: { 'content-length': '0' } };
    }
    const typ = MIME[extname(z.name).toLowerCase()];
    if (z.eltern.art === 'post') {
      const post = await this.d.dienst.post.legePostAn({ betreff: z.name.replace(/\.[^.]{1,8}$/, '').slice(0, 250) || z.name }, { id: ctx.b.id, name: ctx.b.name }, ctx.z, POST_KANAL.webdav);
      const register = (await this.d.dienst.eingangskanaele.postTyp()).register.find((r) => r.art === 'dokumente')?.key;
      await this.d.dienst.dokumente.ladeHoch(post.id, { register, name: z.name, typ, herkunft: 'webdav' }, inhalt, ctx.b.id);
      log.info('Post über WebDAV abgelegt', { datei: z.name, groesse, mappe: post.id, von: ctx.b.email });
      await this.merkeSchwebend(ctx, z.ort, z.name, groesse);
      return { status: 201, koepfe: { 'content-length': '0' } };
    }
    if (z.eltern.art !== 'register') throw new Fachfehler(403, t('meldungen.webdav.hier-laesst-sich-nichts'));
    const reg = z.eltern.register;
    if (z.k?.art === 'dokument') {
      // Gleicher Name: neue Version – nur mit Versionierung; sonst nichts überschreiben.
      if (!reg.versionierung) throw new Fachfehler(409, t('meldungen.webdav.im-register-gibt-es', { name: reg.name, name2: z.k.dok.name }));
      // Per Dokument-Id, nicht per Name: Laufwerksnamen sind bereinigt und eindeutig gemacht („X (2).pdf“),
      // im DMS können zwei Dokumente gleich (oder nach dem Bereinigen gleich) heißen.
      const neu = await this.d.dienst.dokumentVersionen.ersetzeDokument(z.k.dok.id, { name: z.k.dok.name, typ, herkunft: 'webdav' }, inhalt, ctx.b.id);
      log.info('Neue Version über WebDAV abgelegt', { datei: neu.name, id: neu.id, groesse, mappe: z.eltern.mappeId, von: ctx.b.email });
      return { status: 204, koepfe: {} };
    }
    const r = await this.d.dienst.dokumente.ladeHoch(z.eltern.mappeId, { register: reg.key, name: z.name, typ, gleicherName: 'zaehler', herkunft: 'webdav' }, inhalt, ctx.b.id);
    await this.vergiss(ctx, z.ort, z.name);
    log.info('Dokument über WebDAV abgelegt', { datei: r.dokument.name, groesse, mappe: z.eltern.mappeId, von: ctx.b.email });
    return { status: 201, koepfe: { 'content-length': '0' } };
  }

  /** Schein-Sperre (s. oben): nur, wo Ablegen erlaubt ist; neue Namen erscheinen als leere Datei. */
  private async sperre(teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    await lies(a.koerper, XML_MAX);
    const hilfsdatei = teile.length > 0 && istHilfsdatei(teile[teile.length - 1]);
    const z = hilfsdatei ? null : await this.ablageZiel(teile, ctx);
    const vorhanden = /\(<(opaquelocktoken:[0-9a-f-]{36})>\)/i.exec(a.kopf('if') ?? '')?.[1];
    const token = vorhanden ?? `opaquelocktoken:${randomUUID()}`;
    let status = 200;
    if (z && !z.k) {
      if (z.eltern.art === 'register') await this.d.dienst.rechtepruefung.pruefeRecht(ctx.z, z.eltern.mappeId, 'U');
      await this.merkeSchwebend(ctx, z.ort, z.name, 0);
      status = 201;
    }
    return xmlAntwort(status, sperrAntwort(token, teile, false, SPERRE_SEKUNDEN), { 'lock-token': `<${token}>` });
  }
}

function decodeURIComponentSicher(s: string) { try { return decodeURIComponent(s); } catch { return s; } }
function httpDatumSicher(iso: string) { const t = Date.parse(iso); return Number.isNaN(t) ? undefined : new Date(t).toUTCString(); }
