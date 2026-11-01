import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import { MAX_DATEIGROESSE, POST_KANAL, type Benutzer, type Dokument, type Mappe, type Register } from '../../shared/src/model';
import { kinderVon, type Sicht } from '../../shared/src/sichten';
import { PRAEFIX, type ApiSchluessel, type ApiSchluesselDienst } from './apischluessel';
import type { Dienst, Zugriff } from './dienst';
import { MIME } from './eingangsordner';
import type { Einstellungen } from './einstellungen';
import { Fachfehler } from './fehler';
import type { Konten } from './konten';
import { protokoll } from './protokoll';
import { dateiKoepfe } from './routen';
import {
  ABLAGE, basic, davFehler, eindeutig, istHilfsdatei, kurzId, multistatus, NEUE_POST, proppatchAntwort, proppatchNamen,
  Ratenbegrenzung, schluessel, sperrAntwort, VERKNUEPFT, WEBDAV_PFAD, zerlege, type Eintrag,
} from './webdav-baum';

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
 */

export const WEBDAV_METHODEN = ['OPTIONS', 'GET', 'HEAD', 'PUT', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'DELETE', 'COPY', 'MOVE', 'LOCK', 'UNLOCK'] as const;
/** Methoden, die Fastify nicht von sich aus kennt (addHttpMethod), mit Körper ja/nein. */
export const WEBDAV_ZUSATZMETHODEN: Array<[string, boolean]> = [['PROPFIND', true], ['PROPPATCH', true], ['MKCOL', true], ['COPY', false], ['MOVE', false], ['LOCK', true], ['UNLOCK', false]];

/** Höchstens so viele Mappen je Ansichtsordner (Schutz vor Massenabrufen). */
export const MAX_EINTRAEGE = 1000;
/** Anfragen je Benutzer und Minute (Explorer und Finder fragen beim Blättern viel). */
export const STANDARD_GRENZE = 600;
const XML_MAX = 64 * 1024;
const SCHWEBEND_MS = 10 * 60_000;
const SPERRE_SEKUNDEN = 3600;
const ZUGRIFFE = 50;
/** Gleichzeitige Uploads (PUT) je Benutzer – jeder wird bis zu 100 MB im Speicher gehalten. */
export const MAX_UPLOADS = 3;
/** Längste E-Mail-Adresse (RFC 5321); längere Eingaben werden für Protokoll und Anmeldeschutz gekürzt. */
const EMAIL_MAX = 254;

const log = protokoll.modul('dokumente');
const logKonto = protokoll.modul('konto');

export interface WebdavEinstellung { aktiv: boolean }
export interface WebdavZugriff { zeit: string; benutzer: string; methode: string; pfad: string; status: number }
export interface WebdavStand {
  einstellung: WebdavEinstellung;
  /** Adresse zum Einbinden, z. B. https://dms.example.org/webdav/ */
  adresse: string;
  https: boolean;
  grenze: number;
  anfragen: number;
  zugriffe: WebdavZugriff[];
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
  wartung?: { pruefeAnfrage(r: { pfad: string; zugang: string }, b: { rolle: string } | undefined): void };
  jetzt?: () => number;
  grenze?: number;
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
  b: Benutzer; s: ApiSchluessel; z: Zugriff;
  mappen: Map<string, Awaited<ReturnType<Dienst['laufwerkMappe']>>>;
}

const text = (status: number, t: string, extra: Record<string, string> = {}): WebdavAntwort => ({ status, koepfe: { 'content-type': 'text/plain; charset=utf-8', ...extra }, body: `${t}\n` });
const xmlAntwort = (status: number, body: string, extra: Record<string, string> = {}): WebdavAntwort => ({ status, koepfe: { 'content-type': 'application/xml; charset=utf-8', ...extra }, body });
const ORDNER_ARTEN = new Set(['wurzel', 'post', 'ablage', 'sicht', 'mappe', 'verknuepft', 'register']);
const istOrdner = (k: Knoten) => ORDNER_ARTEN.has(k.art);
/** Ort für schwebende Dateien (leer abgelegt, noch ohne Inhalt): Neue Post oder ein Register einer Mappe. */
const ortVon = (k: Knoten): string | null => (k.art === 'post' ? 'post' : k.art === 'register' ? `${k.mappeId}:${k.register.key}` : null);

async function lies(koerper: WebdavAnfrage['koerper'], max: number): Promise<Buffer> {
  if (!koerper) return Buffer.alloc(0);
  if (Buffer.isBuffer(koerper)) { if (koerper.length > max) throw new Fachfehler(413, 'Die Datei ist zu groß.'); return koerper; }
  const teile: Buffer[] = [];
  let n = 0;
  for await (const t of koerper) {
    const b = Buffer.isBuffer(t) ? t : Buffer.from(t as string);
    n += b.length;
    if (n > max) { koerper.destroy(); throw new Fachfehler(413, 'Die Datei ist zu groß.'); }
    teile.push(b);
  }
  return Buffer.concat(teile);
}
/** Körper lesen und wegwerfen, nur Bytes zählen (Hilfsdateien): nichts im Speicher, Grenze trotzdem. */
async function leere(koerper: WebdavAnfrage['koerper'], max: number): Promise<void> {
  if (!koerper) return;
  if (Buffer.isBuffer(koerper)) { if (koerper.length > max) throw new Fachfehler(413, 'Die Datei ist zu groß.'); return; }
  let n = 0;
  for await (const t of koerper) {
    n += Buffer.isBuffer(t) ? t.length : Buffer.byteLength(String(t));
    if (n > max) { koerper.destroy(); throw new Fachfehler(413, 'Die Datei ist zu groß.'); }
  }
}
/**
 * ETag eines Dokuments: nicht der reine Inhalts-Hash (sonst ließe sich mit Leserecht ohne Exportrecht
 * bestätigen, dass eine Datei einen bestimmten Inhalt hat), sondern ein Hash aus Dokument-Id und Inhalt.
 */
export function etagVon(d: Pick<Dokument, 'id' | 'sha256'>): string {
  return `"${createHash('sha256').update(`${d.id}:${d.sha256}`).digest('hex').slice(0, 32)}"`;
}
/** Unbenutzten Körper verwerfen, damit die Verbindung frei wird. */
function verwerfe(koerper: WebdavAnfrage['koerper']) {
  if (koerper && !Buffer.isBuffer(koerper) && typeof koerper.resume === 'function') koerper.resume();
}

export class Webdav {
  private grenze: Ratenbegrenzung;
  private zugriffe: WebdavZugriff[] = [];
  private anfragen = 0;
  private schwebend = new Map<string, Schwebend[]>();
  private cache: { wert: WebdavEinstellung; bis: number } | null = null;
  /** Laufende Uploads je Benutzer-Id (MAX_UPLOADS). */
  private uploads = new Map<string, number>();
  private jetzt: () => number;

  constructor(private d: WebdavDeps) {
    this.jetzt = d.jetzt ?? Date.now;
    this.grenze = new Ratenbegrenzung(d.grenze ?? STANDARD_GRENZE, this.jetzt);
  }

  /* ---------- Werkbank ---------- */

  async einstellung(): Promise<WebdavEinstellung> {
    if (this.cache && this.cache.bis > this.jetzt()) return this.cache.wert;
    const roh = (await this.d.einstellungen.lies('webdav')) as Partial<WebdavEinstellung> | null;
    const wert = { aktiv: roh?.aktiv === true };
    this.cache = { wert, bis: this.jetzt() + 5000 };
    return wert;
  }

  async speichere(e: unknown, von: string): Promise<WebdavStand> {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    if (typeof x.aktiv !== 'boolean') throw new Fachfehler(422, 'aktiv: true oder false.');
    const vorher = (await this.einstellung()).aktiv;
    await this.d.einstellungen.schreibe('webdav', { aktiv: x.aktiv });
    this.cache = null;
    if (vorher !== x.aktiv) (x.aktiv ? logKonto.warn : logKonto.info)(x.aktiv ? 'WebDAV-Laufwerk eingeschaltet' : 'WebDAV-Laufwerk ausgeschaltet', { von });
    return this.stand();
  }

  async stand(): Promise<WebdavStand> {
    const basis = (this.d.adresse?.() ?? '').replace(/\/+$/, '');
    return {
      einstellung: await this.einstellung(), adresse: `${basis}${WEBDAV_PFAD}/`, https: basis.startsWith('https://'),
      grenze: this.grenze.grenze, anfragen: this.anfragen, zugriffe: [...this.zugriffe].reverse(),
    };
  }

  private merke(benutzer: string, a: WebdavAnfrage, status: number) {
    this.zugriffe.push({ zeit: new Date(this.jetzt()).toISOString(), benutzer, methode: a.methode, pfad: decodeURIComponentSicher(a.url.split('?')[0]), status });
    if (this.zugriffe.length > ZUGRIFFE) this.zugriffe.splice(0, this.zugriffe.length - ZUGRIFFE);
  }

  /* ---------- Anfrage ---------- */

  async anfrage(a: WebdavAnfrage): Promise<WebdavAntwort> {
    const methode = a.methode.toUpperCase();
    if (!(await this.einstellung()).aktiv) { verwerfe(a.koerper); return text(404, 'Nicht gefunden.'); }
    const pfad = zerlege(a.url);
    if (!pfad) { verwerfe(a.koerper); return text(400, 'Ungültiger Pfad.'); }
    if (methode === 'OPTIONS') {
      verwerfe(a.koerper);
      return { status: 200, lesend: true, koepfe: { dav: '1, 2', 'ms-author-via': 'DAV', allow: WEBDAV_METHODEN.join(', '), 'content-length': '0' } };
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
        const r = this.grenze.pruefe(ctx.b.id);
        if (!r.ok) {
          if (r.erstes) logKonto.warn('WebDAV: zu viele Anfragen, kurz gebremst', { benutzer: ctx.b.email, grenze: this.grenze.grenze });
          verwerfe(a.koerper);
          antwort = text(429, 'Zu viele Anfragen. Bitte kurz warten.', { 'retry-after': String(r.sekunden) });
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
    const nein = (t: string) => text(401, t, { 'www-authenticate': 'Basic realm="DMS", charset="UTF-8"' });
    const c = basic(a.kopf('authorization'));
    if (!c) return { status: true, wer: '', antwort: nein('Bitte mit E-Mail-Adresse und API-Schlüssel anmelden.') };
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
      return { status: true, wer: kurz, antwort: nein('E-Mail-Adresse oder API-Schlüssel stimmen nicht. Das Laufwerk braucht einen API-Schlüssel (Mein Konto → API-Schlüssel), nicht dein Passwort.') };
    }
    await this.d.konten.sperre.erfolg(kurz, a.ip);
    return { b, s, z: await this.d.dienst.zugriff(b), mappen: new Map() };
  }

  private async verarbeite(methode: string, teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    switch (methode) {
      case 'PROPFIND': return this.propfind(teile, a, ctx);
      case 'GET': case 'HEAD': verwerfe(a.koerper); return this.hole(teile, ctx, methode === 'HEAD', a);
      case 'PUT': return this.lege(teile, a, ctx);
      case 'LOCK': return this.sperre(teile, a, ctx);
      case 'UNLOCK': verwerfe(a.koerper); return { status: 204, koepfe: {} };
      case 'PROPPATCH': {
        const body = (await lies(a.koerper, XML_MAX)).toString('utf8');
        const k = await this.finde(teile, ctx);
        if (!k) return text(404, 'Nicht gefunden.');
        return xmlAntwort(207, proppatchAntwort(teile, istOrdner(k), proppatchNamen(body)));
      }
      case 'MKCOL': verwerfe(a.koerper); return text(403, 'Ordner lassen sich über das Laufwerk nicht anlegen. Mappen legst du in der Ablage des DMS an.');
      case 'DELETE': verwerfe(a.koerper); return text(403, 'Löschen geht über das Laufwerk (noch) nicht. Bitte lösche im DMS selbst.');
      case 'MOVE': verwerfe(a.koerper); return text(403, 'Umbenennen und Verschieben gehen über das Laufwerk (noch) nicht. Bitte im DMS selbst.');
      case 'COPY': verwerfe(a.koerper); return text(403, 'Kopieren innerhalb des Laufwerks geht (noch) nicht. Lade die Datei herunter und lege sie neu ab.');
      default: verwerfe(a.koerper); return text(405, 'Diese Methode unterstützt das Laufwerk nicht.', { allow: WEBDAV_METHODEN.join(', ') });
    }
  }

  /* ---------- Baum ---------- */

  private async mappe(id: string, ctx: Ctx) {
    let m = ctx.mappen.get(id);
    if (!m) { m = await this.d.dienst.laufwerkMappe(id, ctx.z); ctx.mappen.set(id, m); }
    return m;
  }

  private schwebende(ctx: Ctx, ort: string): Schwebend[] {
    const t = this.jetzt();
    const liste = (this.schwebend.get(ctx.b.id) ?? []).filter((s) => t - Date.parse(s.zeit) < SCHWEBEND_MS);
    this.schwebend.set(ctx.b.id, liste);
    return liste.filter((s) => s.ort === ort);
  }
  private merkeSchwebend(ctx: Ctx, ort: string, name: string, groesse: number) {
    const liste = (this.schwebend.get(ctx.b.id) ?? []).filter((s) => !(s.ort === ort && schluessel(s.name) === schluessel(name)));
    liste.push({ ort, name, groesse, zeit: new Date(this.jetzt()).toISOString() });
    this.schwebend.set(ctx.b.id, liste.slice(-200));
  }
  private vergiss(ctx: Ctx, ort: string, name: string) {
    const liste = this.schwebend.get(ctx.b.id);
    if (liste) this.schwebend.set(ctx.b.id, liste.filter((s) => !(s.ort === ort && schluessel(s.name) === schluessel(name))));
  }

  private async kinder(k: Knoten, ctx: Ctx): Promise<Kind[]> {
    switch (k.art) {
      case 'wurzel': return [{ name: NEUE_POST, k: { art: 'post' } }, { name: ABLAGE, k: { art: 'ablage' } }];
      case 'post': return this.schwebende(ctx, 'post').map((s) => ({ name: s.name, k: { art: 'schwebend', s } }));
      case 'ablage': {
        const sichten = await this.d.dienst.listeSichten(ctx.z);
        // Reihenfolge wie im Baum der Ablage; alle Ansichten auf einer Ebene.
        const reihe: Sicht[] = [];
        const besuche = (eltern: string | null) => { for (const s of kinderVon(sichten, eltern)) { if (!reihe.includes(s)) { reihe.push(s); besuche(s.id); } } };
        besuche(null);
        for (const s of sichten) if (!reihe.includes(s)) reihe.push(s);
        const namen = eindeutig(reihe.map((s) => ({ name: s.name, kurz: kurzId(s.id) })));
        return reihe.map((s, i) => ({ name: namen[i], k: { art: 'sicht', sicht: s } }));
      }
      case 'sicht': {
        const r = await this.d.dienst.seite(ctx.b, { sicht: k.sicht.id, anzahl: MAX_EINTRAEGE }, ctx.z, MAX_EINTRAEGE);
        const mappen = (r.mappen as Array<Mappe & { verborgen?: boolean }>).filter((m) => !m.verborgen)
          .sort((x, y) => (x.titel ?? '').localeCompare(y.titel ?? '', 'de') || x.erstellt.localeCompare(y.erstellt) || x.id.localeCompare(y.id));
        if (r.gesamt > MAX_EINTRAEGE) log.debug('WebDAV: Ansicht gekürzt', { sicht: k.sicht.name, gesamt: r.gesamt, gezeigt: MAX_EINTRAEGE });
        const namen = eindeutig(mappen.map((m) => ({ name: m.titel || 'Ohne Titel', kurz: kurzId(m.id) })));
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
        const namen = eindeutig(liste.map((v) => ({ name: v.titel || 'Ohne Titel', kurz: kurzId(v.id) })));
        return liste.map((v, i) => ({ name: namen[i], k: { art: 'mappe', id: v.id, tiefe: 1 } }));
      }
      case 'register': {
        const m = await this.mappe(k.mappeId, ctx);
        const doks = m.dokumente.filter((x) => x.registerKey === k.register.key)
          .sort((x, y) => x.name.localeCompare(y.name, 'de') || x.erstellt.localeCompare(y.erstellt) || x.id.localeCompare(y.id));
        const namen = eindeutig(doks.map((x) => ({ name: x.name, datei: true })));
        const erg: Kind[] = doks.map((x, i) => ({ name: namen[i], k: { art: 'dokument', dok: x, mappeId: k.mappeId, register: k.register } }));
        const belegt = new Set(namen.map(schluessel));
        for (const s of this.schwebende(ctx, ortVon(k)!)) if (!belegt.has(schluessel(s.name))) erg.push({ name: s.name, k: { art: 'schwebend', s } });
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

  private eintrag(teile: string[], name: string, k: Knoten): Eintrag {
    if (k.art === 'dokument') return { teile, ordner: false, name, groesse: k.dok.groesse, mime: k.dok.mime, etag: etagVon(k.dok), geaendert: k.dok.erstellt, erstellt: k.dok.erstellt };
    if (k.art === 'schwebend') return { teile, ordner: false, name, groesse: k.s.groesse, geaendert: k.s.zeit, erstellt: k.s.zeit };
    if (k.art === 'mappe') return { teile, ordner: true, name, geaendert: k.geaendert, erstellt: k.erstellt };
    return { teile, ordner: true, name };
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
    if (!k || k.art === 'hilfsdatei') return text(404, 'Nicht gefunden.');
    const name = teile.length ? teile[teile.length - 1] : 'DMS';
    const liste = [this.eintrag(teile, name, k)];
    if (tiefe === '1' && istOrdner(k)) for (const c of await this.kinder(k, ctx)) liste.push(this.eintrag([...teile, c.name], c.name, c.k));
    return { ...xmlAntwort(207, multistatus(liste)), lesend: true };
  }

  private async hole(teile: string[], ctx: Ctx, nurKopf: boolean, a: WebdavAnfrage): Promise<WebdavAntwort> {
    const k = await this.finde(teile, ctx);
    if (!k || k.art === 'hilfsdatei') return text(404, 'Nicht gefunden.');
    if (istOrdner(k)) {
      return { ...text(200, 'Dies ist ein Ordner des DMS-Laufwerks. Binde die Adresse im Explorer, im Finder oder in der Dateien-App ein – siehe Benutzerhandbuch „Als Laufwerk einbinden“.'), lesend: true };
    }
    if (k.art !== 'dokument') return text(404, 'Diese Datei ist noch nicht fertig abgelegt.');
    // Herunterladen gibt Daten hinaus wie ein Export (#294): nur mit Exportrecht E einer Ansicht.
    if (!(await this.d.dienst.exportierbar(ctx.b, ctx.z, [k.mappeId])).has(k.mappeId)) {
      return text(403, 'Herunterladen ist für diese Mappe nicht erlaubt. Dafür brauchst du das Exportrecht in einer Ansicht, die sie zeigt.');
    }
    const d = k.dok;
    const etag = etagVon(d);
    const koepfe: Record<string, string> = {
      ...dateiKoepfe({ inhalt: Buffer.alloc(0), name: d.name, mime: d.anzeigbar ? d.mime : 'application/octet-stream', anzeigen: false, groesse: d.groesse }),
      etag, 'accept-ranges': 'none',
    };
    const lm = httpDatumSicher(d.erstellt);
    if (lm) koepfe['last-modified'] = lm;
    const wenn = a.kopf('if-none-match');
    if (wenn && wenn.split(',').map((x) => x.trim().replace(/^W\//, '')).includes(etag)) {
      const { 'content-length': _l, ...rest } = koepfe;
      return { status: 304, koepfe: rest, lesend: true };
    }
    if (nurKopf) return { status: 200, koepfe, lesend: true };
    const { inhalt } = await this.d.dienst.dokumentInhalt(d.id);
    log.debug('Dokument über WebDAV heruntergeladen', { name: d.name, id: d.id, von: ctx.b.email });
    return { status: 200, koepfe, body: inhalt, lesend: true };
  }

  /** Ziel eines Ablegens (PUT/LOCK): Ordner Neue Post oder Register, sonst Fehler. */
  private async ablageZiel(teile: string[], ctx: Ctx) {
    if (!teile.length) throw new Fachfehler(405, 'Hier lässt sich nichts ablegen.');
    const name = teile[teile.length - 1];
    const { k, eltern } = await this.loese(teile, ctx);
    if (!eltern && !k) throw new Fachfehler(409, 'Diesen Ordner gibt es nicht.');
    if (k && istOrdner(k)) throw new Fachfehler(405, 'Das ist ein Ordner.');
    const ort = eltern ? ortVon(eltern) : null;
    if (!eltern || !ort) {
      throw new Fachfehler(403, 'Hier lässt sich nichts ablegen. Lege Dateien in „Neue Post“ oder in den Register-Ordner einer Mappe.');
    }
    if (ctx.s.recht !== 'schreiben') throw new Fachfehler(403, 'Dieser API-Schlüssel darf nur lesen. Zum Ablegen braucht er „lesen und schreiben“.');
    return { name, k, eltern, ort };
  }

  private async lege(teile: string[], a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    const laenge = Number(a.kopf('content-length'));
    if (Number.isFinite(laenge) && laenge > MAX_DATEIGROESSE) { verwerfe(a.koerper); return text(413, 'Die Datei ist zu groß (höchstens 100 MB).'); }
    // Hilfsdateien der Betriebssysteme (desktop.ini, .DS_Store, ._*, ~$*): überall still annehmen und verwerfen.
    // Nur Bytes zählen, nichts puffern – und das vor jeder Prüfung des Ziels (geht auch mit Lese-Schlüssel).
    if (teile.length && istHilfsdatei(teile[teile.length - 1])) { await leere(a.koerper, MAX_DATEIGROESSE); return { status: 201, koepfe: { 'content-length': '0' } }; }
    const z = await this.ablageZiel(teile, ctx);
    if (z.eltern.art === 'register') await this.d.dienst.pruefeRecht(ctx.z, z.eltern.mappeId, 'U');
    // Jeder Upload liegt bis zu 100 MB im Speicher: nur wenige gleichzeitig je Benutzer.
    const laufend = this.uploads.get(ctx.b.id) ?? 0;
    if (laufend >= MAX_UPLOADS) {
      verwerfe(a.koerper);
      logKonto.info('WebDAV: zu viele gleichzeitige Uploads', { benutzer: ctx.b.email, laufend });
      return text(503, 'Es laufen schon mehrere Uploads. Bitte kurz warten.', { 'retry-after': '5' });
    }
    this.uploads.set(ctx.b.id, laufend + 1);
    try { return await this.legeAb(z, a, ctx); } finally {
      const n = (this.uploads.get(ctx.b.id) ?? 1) - 1;
      if (n > 0) this.uploads.set(ctx.b.id, n); else this.uploads.delete(ctx.b.id);
    }
  }

  private async legeAb(z: Awaited<ReturnType<Webdav['ablageZiel']>>, a: WebdavAnfrage, ctx: Ctx): Promise<WebdavAntwort> {
    const inhalt = await lies(a.koerper, MAX_DATEIGROESSE);
    // Leere Datei: Explorer und Finder legen erst eine leere Datei an und schreiben dann den Inhalt.
    if (inhalt.length === 0) {
      if (z.k?.art === 'dokument') return { status: 204, koepfe: {} };
      this.merkeSchwebend(ctx, z.ort, z.name, 0);
      return { status: 201, koepfe: { 'content-length': '0' } };
    }
    const typ = MIME[extname(z.name).toLowerCase()];
    if (z.eltern.art === 'post') {
      const post = await this.d.dienst.legePostAn({ betreff: z.name.replace(/\.[^.]{1,8}$/, '').slice(0, 250) || z.name }, { id: ctx.b.id, name: ctx.b.name }, ctx.z, POST_KANAL.webdav);
      const register = (await this.d.dienst.postTyp()).register.find((r) => r.art === 'dokumente')?.key;
      await this.d.dienst.ladeHoch(post.id, { register, name: z.name, typ, herkunft: 'webdav' }, inhalt, ctx.b.id);
      log.info('Post über WebDAV abgelegt', { datei: z.name, groesse: inhalt.length, mappe: post.id, von: ctx.b.email });
      this.merkeSchwebend(ctx, z.ort, z.name, inhalt.length);
      return { status: 201, koepfe: { 'content-length': '0' } };
    }
    if (z.eltern.art !== 'register') throw new Fachfehler(403, 'Hier lässt sich nichts ablegen.');
    const reg = z.eltern.register;
    if (z.k?.art === 'dokument') {
      // Gleicher Name: neue Version – nur mit Versionierung; sonst nichts überschreiben.
      if (!reg.versionierung) throw new Fachfehler(409, `Im Register „${reg.name}“ gibt es „${z.k.dok.name}“ schon, und es hat keine Versionierung. Gib der Datei einen anderen Namen.`);
      // Per Dokument-Id, nicht per Name: Laufwerksnamen sind bereinigt und eindeutig gemacht („X (2).pdf“),
      // im DMS können zwei Dokumente gleich (oder nach dem Bereinigen gleich) heißen.
      const neu = await this.d.dienst.ersetzeDokument(z.k.dok.id, { name: z.k.dok.name, typ, herkunft: 'webdav' }, inhalt, ctx.b.id);
      log.info('Neue Version über WebDAV abgelegt', { datei: neu.name, id: neu.id, groesse: inhalt.length, mappe: z.eltern.mappeId, von: ctx.b.email });
      return { status: 204, koepfe: {} };
    }
    const r = await this.d.dienst.ladeHoch(z.eltern.mappeId, { register: reg.key, name: z.name, typ, gleicherName: 'zaehler', herkunft: 'webdav' }, inhalt, ctx.b.id);
    this.vergiss(ctx, z.ort, z.name);
    log.info('Dokument über WebDAV abgelegt', { datei: r.dokument.name, groesse: inhalt.length, mappe: z.eltern.mappeId, von: ctx.b.email });
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
      if (z.eltern.art === 'register') await this.d.dienst.pruefeRecht(ctx.z, z.eltern.mappeId, 'U');
      this.merkeSchwebend(ctx, z.ort, z.name, 0);
      status = 201;
    }
    return xmlAntwort(status, sperrAntwort(token, teile, false, SPERRE_SEKUNDEN), { 'lock-token': `<${token}>` });
  }
}

function decodeURIComponentSicher(s: string) { try { return decodeURIComponent(s); } catch { return s; } }
function httpDatumSicher(iso: string) { const t = Date.parse(iso); return Number.isNaN(t) ? undefined : new Date(t).toUTCString(); }
