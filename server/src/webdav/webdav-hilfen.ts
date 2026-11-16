import type { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { protokoll } from '../protokoll/protokoll';
import type { Dienst } from '../dienst/dienst';
import type { Konten } from '../konten';
import type { ApiSchluesselDienst, ApiSchluessel } from '../anmeldung/apischluessel';
import type { Einstellungen } from '../einstellungen/einstellungen';
import type { Kurzzustand } from '../zwischenspeicher/kurzzustand';
import type { Sicht } from '../../../shared/src/sichten';
import type { Register, Dokument, Benutzer } from '../../../shared/src/model';
import type { Zugriff } from '../kern';
import { anteilVon } from '../zwischenspeicher/zwischenspeicher';
import { WEBDAV_STEMPEL_SPEICHER as STEMPEL_SPEICHER } from '../grundlagen/grenzen';
import { t } from '../sprache/sprache';
import { Fachfehler } from '../grundlagen/fehler';

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

export const WEBDAV_METHODEN = [
  'OPTIONS',
  'GET',
  'HEAD',
  'PUT',
  'PROPFIND',
  'PROPPATCH',
  'MKCOL',
  'DELETE',
  'COPY',
  'MOVE',
  'LOCK',
  'UNLOCK',
] as const;
/** Methoden, die Fastify nicht von sich aus kennt (addHttpMethod), mit Körper ja/nein. */
export const WEBDAV_ZUSATZMETHODEN: Array<[string, boolean]> = [
  ['PROPFIND', true],
  ['PROPPATCH', true],
  ['MKCOL', true],
  ['COPY', false],
  ['MOVE', false],
  ['LOCK', true],
  ['UNLOCK', false],
];

/** Höchstens so viele Mappen je Ansichtsordner (Schutz vor Massenabrufen). */
export const MAX_EINTRAEGE = 1000;
/** Anfragen je Benutzer und Minute (Explorer und Finder fragen beim Blättern viel). */
export const STANDARD_GRENZE = 600;
export const SCHWEBEND_MS = 10 * 60_000;
export const SCHWEBEND = 'webdav-schwebend';
/** Höchstens so viele schwebende Dateien je Benutzer und Ort zeigt der Ordner. */
export const SCHWEBEND_MAX = 200;
export const SPERRE_SEKUNDEN = 3600;
export const ZUGRIFFE = 50;
/** Gleichzeitige Uploads (PUT) je Benutzer – jeder belegt bis zu 100 MB (seit #746 als temporäre Datei, nicht im Speicher). */
export const MAX_UPLOADS = 3;
/** Längste E-Mail-Adresse (RFC 5321); längere Eingaben werden für Protokoll und Anmeldeschutz gekürzt. */
export const EMAIL_MAX = 254;

export const log = protokoll.modul('dokumente');
export const logKonto = protokoll.modul('konto');

export interface WebdavEinstellung {
  aktiv: boolean;
  /** Stempel beim Lesen (#722): Id einer Stempel-Vorlage oder null (aus). Ohne Angabe die mitgelieferte Vorlage. */
  stempel: string | null;
  /** Nur lesend für alle Benutzer (#722): alle schreibenden Methoden einschließlich LOCK → 403. */
  nurLesend: boolean;
}
export interface WebdavZugriff {
  zeit: string;
  benutzer: string;
  methode: string;
  pfad: string;
  status: number;
}
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

export type Knoten =
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
export interface Kind {
  name: string;
  k: Knoten;
}
export interface Schwebend {
  ort: string;
  name: string;
  groesse: number;
  zeit: string;
}
export interface Ctx {
  b: Benutzer;
  s: ApiSchluessel;
  z: Zugriff;
  e: WebdavEinstellung;
  mappen: Map<string, Awaited<ReturnType<Dienst['berechtigungen']['laufwerkMappe']>>>;
  /** Stempel je Mappentyp (#722) und ob eine Mappe hinausdarf (#723) – einmal je Anfrage. */
  stempel: Map<string, Promise<Awaited<ReturnType<Dienst['ausgang']['laufwerkStempel']>>>>;
  raus: Map<string, Promise<boolean>>;
}
/** Was beim Lesen eines Dokuments hinausgeht (#722): gestempelt oder das Original, mit Größe und ETag dazu. */
export interface Auslieferung {
  gestempelt: boolean;
  name: string;
  mime: string;
  groesse: number;
  etag: string;
  inhalt(): Promise<Buffer | Readable>;
  /** Pflicht-Stempel, der sich nicht bilden lässt: die Datei geht nicht hinaus. */
  fehler?: string;
}
/** Methoden, die etwas ändern würden (#722: bei „nur lesend“ und in schreibgeschützten Registern 403). */
export const SCHREIBEND = new Set(['PUT', 'PROPPATCH', 'MKCOL', 'DELETE', 'COPY', 'MOVE', 'LOCK']);
export const LESEMETHODEN = ['OPTIONS', 'GET', 'HEAD', 'PROPFIND'];
/**
 * Gestempelte Fassungen im Speicher: höchstens so viele Bytes; Größe und Stand bleiben länger gemerkt. Mit mehreren
 * Prozessen teilen sie sich die Bytes (#874, `anteilVon`); die Einträge (nur Größe und Stand) bleiben je Prozess.
 */
export const stempelSpeicher = () => anteilVon(STEMPEL_SPEICHER);
export const STEMPEL_EINTRAEGE = 2000;

export const text = (status: number, t: string, extra: Record<string, string> = {}): WebdavAntwort => ({
  status,
  koepfe: { 'content-type': 'text/plain; charset=utf-8', ...extra },
  body: `${t}\n`,
});
export const xmlAntwort = (status: number, body: string, extra: Record<string, string> = {}): WebdavAntwort => ({
  status,
  koepfe: { 'content-type': 'application/xml; charset=utf-8', ...extra },
  body,
});
const ORDNER_ARTEN = new Set(['wurzel', 'post', 'ablage', 'sicht', 'mappe', 'verknuepft', 'register']);
export const istOrdner = (k: Knoten) => ORDNER_ARTEN.has(k.art);
/** Ort für schwebende Dateien (leer abgelegt, noch ohne Inhalt): Neue Post oder ein Register einer Mappe. */
export const ortVon = (k: Knoten): string | null =>
  k.art === 'post' ? 'post' : k.art === 'register' ? `${k.mappeId}:${k.register.key}` : null;

export async function lies(koerper: WebdavAnfrage['koerper'], max: number): Promise<Buffer> {
  if (!koerper) return Buffer.alloc(0);
  if (Buffer.isBuffer(koerper)) {
    if (koerper.length > max) throw new Fachfehler(413, t('meldungen.webdav.die-datei-ist-zu'));
    return koerper;
  }
  const teile: Buffer[] = [];
  let n = 0;
  for await (const eintrag of koerper) {
    const b = Buffer.isBuffer(eintrag) ? eintrag : Buffer.from(eintrag as string);
    n += b.length;
    if (n > max) {
      koerper.destroy();
      throw new Fachfehler(413, t('meldungen.webdav.die-datei-ist-zu'));
    }
    teile.push(b);
  }
  return Buffer.concat(teile);
}
/** Körper lesen und wegwerfen, nur Bytes zählen (Hilfsdateien): nichts im Speicher, Grenze trotzdem. */
export async function leere(koerper: WebdavAnfrage['koerper'], max: number): Promise<void> {
  if (!koerper) return;
  if (Buffer.isBuffer(koerper)) {
    if (koerper.length > max) throw new Fachfehler(413, t('meldungen.webdav.die-datei-ist-zu'));
    return;
  }
  let n = 0;
  for await (const eintrag of koerper) {
    n += Buffer.isBuffer(eintrag) ? eintrag.length : Buffer.byteLength(String(eintrag));
    if (n > max) {
      koerper.destroy();
      throw new Fachfehler(413, t('meldungen.webdav.die-datei-ist-zu'));
    }
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
export function etagGestempelt(d: Pick<Dokument, 'id' | 'sha256'>, signatur: string): string {
  return `"${createHash('sha256').update(`${d.id}:${d.sha256}:${signatur}`).digest('hex').slice(0, 32)}"`;
}
/** Unbenutzten Körper verwerfen, damit die Verbindung frei wird. */
export function verwerfe(koerper: WebdavAnfrage['koerper']) {
  if (koerper && !Buffer.isBuffer(koerper) && typeof koerper.resume === 'function') koerper.resume();
}

export function decodeURIComponentSicher(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
export function httpDatumSicher(iso: string) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : new Date(t).toUTCString();
}
