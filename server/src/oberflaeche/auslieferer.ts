import { closeSync, constants, createReadStream, lstatSync, openSync, readdirSync, type Stats } from 'node:fs';
import { extname, join, posix, sep } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ASSETS_CACHE, SEITE_CACHE } from './oberflaeche';
import { t } from '../sprache/sprache';
import { protokoll } from '../protokoll/protokoll';

/**
 * Eigener Auslieferer für die gebaute Oberfläche (#1468) – statt @fastify/static mit seinen 25 mitgebrachten Paketen.
 *
 * Die Eingabe ist unsere eigene, beim Bau erzeugte Dateiliste: Beim Start wird `web/dist` einmal gelesen (nur reguläre
 * Dateien, keine Symlinks, keine Punktdateien), danach ist die Liste fest. Eine Anfrage trifft eine Datei nur über
 * einen exakten Eintrag dieser Liste – kein Pfad aus der URL wird je an das Dateisystem gereicht, `..`, kodierte
 * Schrägstriche oder Backslashes können also nichts außerhalb erreichen.
 *
 * Kann, was die Oberfläche braucht, und nicht mehr: Content-Type aus einer festen Tabelle, `Cache-Control` wie bisher
 * (#1198), schwaches ETag und `Last-Modified` mit 304, `HEAD`, vorkomprimierte `.br`/`.gz`-Fassungen passend zu
 * `Accept-Encoding` mit `Vary` (#1236). Keine Teilbereiche (`Range`), keine Verzeichnislisten.
 */

const log = protokoll.modul('system');

/** Content-Type je Endung – die Endungen, die der Bau von Oberfläche und Handbuch erzeugt. Text bekommt `charset=utf-8`. */
const TYPEN: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  cjs: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  map: 'application/json; charset=utf-8',
  json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/vnd.microsoft.icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pfb: 'application/x-font-type1',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
};
const UNBEKANNT = 'application/octet-stream';

/** Vorkomprimierte Fassungen in der Reihenfolge, in der sie bei gleicher Gewichtung gewählt werden. */
const KODIERUNGEN = [
  ['br', '.br'],
  ['gzip', '.gz'],
] as const;
type Kodierung = (typeof KODIERUNGEN)[number][0];

interface Fassung {
  pfad: string;
  groesse: number;
  etag: string;
}

export interface Datei extends Fassung {
  /** Pfad relativ zum Ordner, mit `/` getrennt, ohne führenden `/`. */
  rel: string;
  typ: string;
  cache: string;
  geaendert: string;
  fassungen: Partial<Record<Kodierung, Fassung>>;
}

const etagAus = (s: Stats) => `W/"${s.size.toString(16)}-${s.mtime.getTime().toString(16)}"`;

/**
 * Liest den Ordner einmal ein. Nur reguläre Dateien; Symlinks (auf Dateien wie auf Ordner) und Punktdateien bleiben
 * draußen. `.br`/`.gz` sind Fassungen der Datei daneben und bekommen keinen eigenen Eintrag.
 */
export function leseDateien(root: string): Map<string, Datei> {
  const funde = new Map<string, Stats>();
  const gehe = (ordner: string, rel: string) => {
    for (const e of readdirSync(ordner, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const pfad = join(ordner, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      // lstat statt Dirent: kein Symlink wird verfolgt, auch kein Ordner-Symlink.
      const s = lstatSync(pfad);
      if (s.isDirectory()) gehe(pfad, r);
      else if (s.isFile()) funde.set(r, s);
    }
  };
  gehe(root, '');
  const dateien = new Map<string, Datei>();
  for (const [rel, s] of funde) {
    if (KODIERUNGEN.some(([, endung]) => rel.endsWith(endung))) continue;
    const fassungen: Datei['fassungen'] = {};
    for (const [k, endung] of KODIERUNGEN) {
      const f = funde.get(rel + endung);
      if (f) fassungen[k] = { pfad: join(root, ...(rel + endung).split('/')), groesse: f.size, etag: etagAus(f) };
    }
    const endung = extname(rel).slice(1).toLowerCase();
    dateien.set(rel, {
      rel,
      pfad: join(root, ...rel.split('/')),
      groesse: s.size,
      etag: etagAus(s),
      typ: TYPEN[endung] ?? UNBEKANNT,
      cache: rel.startsWith('assets/') ? ASSETS_CACHE : SEITE_CACHE,
      geaendert: s.mtime.toUTCString(),
      fassungen,
    });
  }
  return dateien;
}

/** Beste vorhandene Fassung nach `Accept-Encoding` (Gewichte beachtet, `*` gilt als gzip, `q=0` schließt aus). */
export function waehleKodierung(kopf: string | undefined, vorhanden: Datei['fassungen']): Kodierung | null {
  if (!kopf) return null;
  const gewicht = new Map<string, number>();
  for (const teil of kopf.toLowerCase().split(',')) {
    const [name, ...param] = teil.trim().split(';');
    const q = param.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)).find(Boolean);
    const wert = q ? Number(q[1]) : 1;
    const n = name.trim() === '*' ? 'gzip' : name.trim();
    if (n && Number.isFinite(wert) && !gewicht.has(n)) gewicht.set(n, wert);
  }
  let beste: Kodierung | null = null;
  let besteQ = 0;
  for (const [k] of KODIERUNGEN) {
    const q = gewicht.get(k) ?? 0;
    if (vorhanden[k] && q > besteQ) {
      beste = k;
      besteQ = q;
    }
  }
  return beste;
}

/** Passt ein `If-None-Match` zum ETag (schwacher Vergleich, Liste oder `*`)? */
function etagPasst(kopf: string, etag: string): boolean {
  const ohneW = (x: string) => x.trim().replace(/^W\//, '');
  return kopf.split(',').some((x) => x.trim() === '*' || ohneW(x) === ohneW(etag));
}

/** Datei senden: Kopfzeilen, 304, HEAD, Fassung nach Accept-Encoding. */
function sendeDatei(req: FastifyRequest, reply: FastifyReply, d: Datei) {
  const k = d.fassungen.br || d.fassungen.gzip ? waehleKodierung(req.headers['accept-encoding'], d.fassungen) : null;
  const f: Fassung = k ? d.fassungen[k]! : d;
  reply.header('content-type', d.typ);
  reply.header('cache-control', d.cache);
  reply.header('etag', f.etag);
  reply.header('last-modified', d.geaendert);
  // Wie bisher (#1236): Vary immer, auch für die unkomprimierte Fassung – Zwischenspeicher trennen nach Accept-Encoding.
  const vary = reply.getHeader('vary');
  if (!vary) reply.header('vary', 'accept-encoding');
  else if (!/accept-encoding|\*/i.test(String(vary))) reply.header('vary', `${String(vary)}, accept-encoding`);
  if (k) reply.header('content-encoding', k);

  const keinNeues = req.headers['if-none-match'];
  const seit = req.headers['if-modified-since'];
  if (keinNeues ? etagPasst(keinNeues, f.etag) : seit && Date.parse(seit) >= Date.parse(d.geaendert)) {
    reply.removeHeader('content-type');
    reply.removeHeader('content-encoding');
    return reply.code(304).send();
  }
  // O_NOFOLLOW: Wird die Datei nach dem Start durch einen Symlink ersetzt, öffnet Ablago ihn nicht; fehlt sie, 404.
  let fd: number;
  try {
    fd = openSync(f.pfad, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    reply.removeHeader('content-encoding');
    return reply
      .code(404)
      .type('text/plain; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(t('meldungen.http.diese-datei-gibt-es'));
  }
  reply.header('content-length', String(f.groesse));
  if (req.method === 'HEAD') {
    closeSync(fd);
    return reply.send();
  }
  return reply.send(createReadStream('', { fd }));
}

/** Nur Zeichen, die Fastify als festen Pfad versteht – `:` und `*` wären sonst Platzhalter einer Route. */
const SICHERER_PFAD = /^[\w.~@+-]+(?:\/[\w.~@+-]+)*$/;

declare module 'fastify' {
  interface FastifyReply {
    /** Datei der Oberfläche senden (relativ zu `web/dist`, nur Einträge der beim Start gelesenen Liste). */
    sendFile(rel: string): FastifyReply;
  }
}

/**
 * Oberfläche einrichten – gleich in allen Betriebsarten. `routen: true` legt je Datei eine Route an (GET und HEAD) und für jeden Ordner mit `index.html` die Route `/ordner/`. `reply.sendFile(rel)` liefert eine Datei der
 * Liste (für die Ausweichregel #932 und das Handbuch); was nicht in der Liste steht, bekommt 404.
 */
export function richteOberflaecheEin(app: FastifyInstance, root: string, o: { routen: boolean }): Map<string, Datei> {
  const dateien = leseDateien(root);
  app.decorateReply('sendFile', function (this: FastifyReply, rel: string) {
    const d = dateien.get(rel.split(sep).join('/').replace(/^\/+/, ''));
    if (!d) return this.code(404).type('text/plain; charset=utf-8').send(t('meldungen.http.diese-datei-gibt-es'));
    return sendeDatei(this.request, this, d);
  });
  if (!o.routen) return dateien;
  const ausgelassen: string[] = [];
  // GET und HEAD als eine Route: Fastifys eigene HEAD-Route läse die Datei ganz und verwürfe sie.
  const route = (url: string, d: Datei) => app.route({ method: ['GET', 'HEAD'], url, handler: (req, reply) => sendeDatei(req, reply, d) });
  for (const d of dateien.values()) {
    if (!SICHERER_PFAD.test(d.rel)) {
      ausgelassen.push(d.rel);
      continue;
    }
    route(`/${d.rel}`, d);
    if (posix.basename(d.rel) === 'index.html') {
      const ordner = posix.dirname(d.rel);
      route(ordner === '.' ? '/' : `/${ordner}/`, d);
    }
  }
  if (ausgelassen.length)
    log.warn('Dateien der Oberfläche mit ungewöhnlichem Namen nicht ausgeliefert', {
      anzahl: String(ausgelassen.length),
      beispiel: ausgelassen[0],
    });
  return dateien;
}
