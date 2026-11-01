import type { Readable } from 'node:stream';
import type { Speicherplatz } from './speicherplatz';
import type { ProxyVertrauen } from './proxy';
import type { Einrichtung } from './einrichtung';
import type { AnbindungVerwaltung } from './anbindung';
import type { OrdnerPruefung } from './ordner';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyRequest } from 'fastify';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import type { Konten } from './konten';
import { serverTiming, zeitaufteilung, type Messung } from './messung';
import type { SystemQuelle } from './system';
import type { Designs } from './designs';
import type { ApiSchluesselDienst } from './apischluessel';
import { wer } from './api-v1';
import { hilfeAntwort, hilfeSenden } from './hilfe';
import { einbettenAus, sicherheitsKoepfe, type Einbetten } from './koepfe';
import { kontext, protokoll, type Kontext } from './protokoll';
import type { Betrieb } from './betrieb';
import type { Tresor } from './tresor';
import type { Texterkennung } from './texterkennung';
import type { Vorschaubilder } from './vorschau';
import type { Aufgabenmail } from './aufgabenmail';
import type { Fehlermeldungen } from './fehlermeldungen';
import { WartungFehler, type Wartung } from './wartung';
import type { Notfallzugang } from './notfall';
import type { Sicherung } from './sicherung';
import type { Wiederherstellung } from './wiederherstellung';
import { MAX_DATEIGROESSE } from '../../shared/src/model';
import { WEBDAV_METHODEN, WEBDAV_ZUSATZMETHODEN, type Webdav } from './webdav';
import { anfrageStufe, dateiKoepfe, leseCookie, modulAus, pruefeZugang, routen, SITZUNG_COOKIE, sitzungsCookie, type Anfrage } from './routen';

/** zeit (#477): Zeitpunkte der Anfrage (performance.now()) für Server-Timing. */
type MitKontext = FastifyRequest & { dms?: Kontext; lesend?: boolean; zeit?: { eingang: number; start?: number; ende?: number; senden?: number } };

interface Optionen {
  /** Paketverwaltung mit Paket-Läufer (#338); ohne: Paketverwaltung ohne Läufer. */
  pakete?: import('./pakete').Paketverwaltung;
  paketlaeufer?: import('./laeufer/verwaltung').Paketlaeufer;
  /** Verzeichnis der gebauten Weboberfläche; fehlt es, gibt es nur die API. */
  webDir?: string;
  /** @deprecated Protokoll läuft immer über protokoll.ts; bleibt für ältere Aufrufer. */
  logger?: unknown;
  /** Secure-Flag am Cookie (nur bei HTTPS); als Funktion je Anfrage ausgewertet (#37). */
  sicher?: boolean | (() => boolean);
  /** Wem X-Forwarded-* geglaubt wird (#234), siehe proxy.ts. */
  proxy?: ProxyVertrauen;
  /** Messung der Datenbankzugriffe (lange Zugriffe, Server-Timing). */
  messung?: Messung;
  system?: SystemQuelle;
  designs?: Designs;
  apiSchluessel?: ApiSchluesselDienst;
  /** Befehl `dms` im Container (#244). */
  konsole?: import('./konsole').Konsolenzugang;
  oidc?: import('./oidc').Oidc;
  mandantName?: () => Promise<string | null>;
  betrieb?: Betrieb;
  tresor?: Tresor;
  texterkennung?: Texterkennung;
  /** Vorschaubilder der ersten Seite (#332). */
  vorschau?: Vorschaubilder;
  aufgabenmail?: Aufgabenmail;
  fehlermeldungen?: Fehlermeldungen;
  /** Wartungsmodus (#102). */
  wartung?: Wartung;
  /** Notfallzugang (#108). */
  notfall?: Notfallzugang;
  /** Sicherungen (#103–#105). */
  sicherung?: Sicherung;
  /** Wiederherstellen und Probe (#107, #109). */
  wiederherstellung?: Wiederherstellung;
  /** Speicherplatz-Überwachung (#116) und feste Ordner (#115). */
  speicherplatz?: Speicherplatz;
  /** Systemzustand → Auslastung (#409). */
  systemlast?: import('./systemlast').Systemlast;
  eingangsordner?: import('./eingangsordner').Eingangsordner;
  postfaecher?: import('./postfach').Postfaecher;
  postfachOAuth?: import('./postfach-oauth').PostfachOAuth;
  ordner?: OrdnerPruefung;
  /** Einrichtungsassistent und Datenbank-Anbindung (#119). */
  einrichtung?: Einrichtung;
  anbindung?: AnbindungVerwaltung;
  mandantHinweis?: string | null;
  abruf?: (url: string) => Promise<unknown>;
  /** Erlaubte Ursprünge zum Einbetten (#239, DMS_EINBETTEN). */
  einbetten?: Einbetten;
  /** WebDAV-Laufwerk (#346) unter /webdav. */
  webdav?: Webdav;
}

export async function baueApp(dienst: Dienst, konten: Konten, opt: Optionen = {}) {
  const app = Fastify({
    loggerInstance: protokoll.fuerFastify() as unknown as FastifyBaseLogger,
    // Eine Zeile je Anfrage schreiben wir selbst (onResponse), mit Benutzer und Modul.
    disableRequestLogging: true,
    genReqId: () => randomBytes(4).toString('hex'),
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: opt.proxy ?? false,
  });

  app.setErrorHandler((fehler: unknown, req, reply) => {
    if (fehler instanceof WartungFehler) reply.header('retry-after', String(fehler.retryAfter));
    if (fehler instanceof Fachfehler) return reply.code(fehler.status).send({ fehler: fehler.message, details: fehler.details });
    const err = fehler as Error & { statusCode?: number };
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ fehler: err.message });
    const k = (req as MitKontext).dms;
    const schreibe = () => protokoll.schreibe('error', modulAus(req.url), `Interner Fehler bei ${req.method} ${req.url.split('?')[0]}`, { fehler: err.stack ?? String(err) });
    if (k) kontext.run(k, schreibe); else schreibe();
    return reply.code(500).send({ fehler: `Interner Fehler (Anfrage ${req.id}). Details stehen im Protokoll.` });
  });

  // Zeitmessung (#477): Eingang der Anfrage – das Warten bis zum Handler steht in Server-Timing als „vor“.
  app.addHook('onRequest', async (req) => { (req as MitKontext).zeit = { eingang: performance.now() }; });
  // Server-Timing erst hier: Die Antwort ist jetzt in Text umgewandelt (JSON), das gehört mit zur Messung.
  app.addHook('onSend', async (req, reply, nutzlast) => {
    const r = req as MitKontext;
    if (r.dms && r.zeit?.start !== undefined && r.zeit.ende !== undefined) {
      const t = zeitaufteilung({ eingang: r.zeit.eingang, start: r.zeit.start, ende: r.zeit.ende, senden: r.zeit.senden, jetzt: performance.now(), db: r.dms.db, rechte: r.dms.rechte });
      reply.header('server-timing', serverTiming(t, r.dms.zwischenspeicher));
      const k = r.dms;
      kontext.run(k, () => opt.messung?.erfasseAnfrage(k, t));
    }
    return nutzlast;
  });

  // Eine Zeile je Anfrage: Methode, Pfad, Status, Dauer, Benutzer.
  app.addHook('onResponse', async (req, reply) => {
    const url = req.url.split('?')[0];
    const status = reply.statusCode;
    const api = url.startsWith('/api/');
    const stufe = anfrageStufe({ methode: req.method, url, status, lesend: (req as MitKontext).lesend });
    const k = (req as MitKontext).dms ?? { anfrage: req.id, db: { anzahl: 0, ms: 0 } };
    kontext.run(k, () => protokoll.schreibe(stufe, api ? modulAus(url) : 'http', `${req.method} ${url} ${status}`, {
      ms: Math.round(reply.elapsedTime), ...(k.db.anzahl ? { db: k.db.anzahl, dbMs: Math.round(k.db.ms) } : {}),
    }));
  });

  // Sicherheits-Header für jede Antwort (#239); eigene CSP einer Antwort (z. B. Dokumente) bleibt.
  app.addHook('onSend', async (req, reply, nutzlast) => {
    const typ = String(reply.getHeader('content-type') ?? '');
    for (const [k, v] of Object.entries(sicherheitsKoepfe({
      pfad: req.url.split('?')[0], https: req.protocol === 'https', html: typ.startsWith('text/html'), csp: reply.hasHeader('content-security-policy'),
    }, opt.einbetten ?? einbettenAus(undefined)))) if (!reply.hasHeader(k)) reply.header(k, v);
    return nutzlast;
  });

  // Datei-Uploads kommen als rohe Bytes (application/octet-stream).
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, fertig) => fertig(null, body));

  for (const r of routen(dienst, konten, opt)) {
    app.route({
      method: r.methode,
      url: r.pfad,
      ...(r.roh ? { bodyLimit: r.roh } : {}),
      handler: async (req, reply) => {
        const a: Anfrage = {
          body: req.body,
          params: req.params as Record<string, string>,
          query: req.query as Record<string, string | undefined>,
          sitzung: leseCookie(req.headers.cookie, SITZUNG_COOKIE),
          cookieKopf: req.headers.cookie,
          ip: req.ip,
          peer: req.socket.remoteAddress,
          geraet: String(req.headers['user-agent'] ?? ''),
          einrichtungscode: typeof req.headers['x-einrichtungscode'] === 'string' ? req.headers['x-einrichtungscode'] : undefined,
        };
        const start = performance.now();
        const zeit = ((req as MitKontext).zeit ??= { eingang: start });
        zeit.start = start;
        if (r.lesend) (req as MitKontext).lesend = true;
        const k: Kontext = { anfrage: req.id, pfad: `${req.method} ${req.url.split('?')[0]}`, db: { anzahl: 0, ms: 0 }, ursprung: `${req.protocol}://${req.host}` };
        (req as MitKontext).dms = k;
        const antwort = await kontext.run(k, async () => {
          await pruefeZugang(r, a, (n) => req.headers[n] as string | undefined, konten, opt.apiSchluessel, opt.konsole);
          k.benutzer = a.konsole ? `${a.benutzer?.email ?? 'ohne Administrator'} (Konsole)` : wer(a.benutzer, a.apiSchluessel);
          // Wartungsmodus (#102): API 503, in der aktiven Stufe nur Administratoren.
          // Die Konsole (#244) arbeitet auch im Wartungsmodus – etwa um ihn zu beenden.
          if (!a.konsole) opt.wartung?.pruefeAnfrage(r, a.benutzer);
          return r.handler(a);
        });
        // Für den Entwicklermodus: Server-Timing setzt der onSend-Hook (#477), dann mit JSON und gesamt.
        zeit.ende = performance.now();
        if (antwort.sitzungSetzen !== undefined || antwort.cookies?.length) {
          const sicher = typeof opt.sicher === 'function' ? kontext.run(k, opt.sicher) : opt.sicher ?? false;
          reply.header('set-cookie', [
            ...(antwort.sitzungSetzen !== undefined ? [sitzungsCookie(antwort.sitzungSetzen, sicher)] : []),
            ...(antwort.cookies ?? []).map((c) => (sicher ? `${c}; Secure` : c)),
          ]);
        }
        if (antwort.weiterleiten) {
          reply.header('cache-control', 'no-store');
          return reply.code(302).header('location', antwort.weiterleiten).send();
        }
        if (antwort.datei) {
          for (const [k, v] of Object.entries({ ...dateiKoepfe(antwort.datei), ...antwort.datei.koepfe })) reply.header(k, v);
          return reply.send(antwort.datei.inhalt);
        }
        reply.header('cache-control', 'no-store');
        reply.code(antwort.status ?? 200);
        zeit.senden = performance.now();
        return antwort.status === 204 || antwort.body === undefined ? reply.send() : reply.send(antwort.body);
      },
    });
  }

  // WebDAV-Laufwerk (#346): eigene Methoden (PROPFIND, LOCK …) und rohe Körper beliebigen Typs.
  // Eigener Plugin-Bereich, damit der Parser für „alles“ nur hier gilt.
  if (opt.webdav) {
    const wd = opt.webdav;
    const bekannt = new Set<string>((app.supportedMethods as string[] | undefined) ?? []);
    for (const [m, koerper] of WEBDAV_ZUSATZMETHODEN) if (!bekannt.has(m)) app.addHttpMethod(m, { hasBody: koerper });
    await app.register(async (bereich) => {
      bereich.removeAllContentTypeParsers();
      bereich.addContentTypeParser('*', (_req, nutzlast, fertig) => fertig(null, nutzlast));
      const handler = async (req: FastifyRequest, reply: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const k: Kontext = { anfrage: req.id, pfad: `${req.method} ${req.url.split('?')[0]}`, db: { anzahl: 0, ms: 0 }, ursprung: `${req.protocol}://${req.host}` };
        (req as MitKontext).dms = k;
        const koerper: Readable = req.body && typeof (req.body as { pipe?: unknown }).pipe === 'function' ? req.body as Readable : req.raw;
        const antwort = await kontext.run(k, () => wd.anfrage({
          methode: req.method, url: req.url, ip: req.ip, koerper: ['GET', 'HEAD', 'OPTIONS', 'DELETE', 'COPY', 'MOVE', 'UNLOCK'].includes(req.method) ? null : koerper,
          kopf: (n: string) => { const v = req.headers[n]; return Array.isArray(v) ? v[0] : v; },
        }));
        if (antwort.lesend) (req as MitKontext).lesend = true;
        reply.code(antwort.status);
        for (const [n, v] of Object.entries(antwort.koepfe)) reply.header(n, v);
        if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
        return antwort.body === undefined || req.method === 'HEAD' || antwort.status === 204 || antwort.status === 304 ? reply.send() : reply.send(antwort.body);
      };
      // Der Parser reicht den Körper als Strom durch – dafür wirkt `bodyLimit` nicht (Fastify zählt nur, was es
      // selbst liest). Begrenzt wird in webdav.ts beim Lesen (`lies()`/`leere()`, 100 MB); die Angabe hier
      // ist nur eine Obergrenze, falls ein Parser den Körper doch einmal selbst liest.
      for (const url of ['/webdav', '/webdav/*']) bereich.route({ method: [...WEBDAV_METHODEN], url, exposeHeadRoute: false, bodyLimit: MAX_DATEIGROESSE + 1024 * 1024, handler });
      // Windows fragt beim Verbinden manchmal erst OPTIONS auf „/“: dort dieselben DAV-Köpfe (ausgeschaltet 404).
      bereich.route({ method: 'OPTIONS', url: '/', handler: async (req: FastifyRequest, reply: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const r = await wd.anfrage({ methode: 'OPTIONS', url: '/webdav/', ip: req.ip, kopf: () => undefined, koerper: null });
        reply.code(r.status);
        for (const [n, v] of Object.entries(r.koepfe)) reply.header(n, v);
        return r.body === undefined ? reply.send() : reply.send(r.body);
      } });
    });
  }

  if (opt.webDir && existsSync(opt.webDir)) {
    await app.register(fastifyStatic, { root: opt.webDir, wildcard: false });
    // Alle Nicht-API-Pfade liefern die Oberfläche aus (Routing im Browser).
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ fehler: 'Diese Schnittstelle gibt es nicht.' });
      const hilfe = hilfeAntwort(req.url, opt.webDir);
      if (hilfe) return hilfeSenden(reply, hilfe);
      return reply.sendFile('index.html');
    });
  }

  return app;
}
