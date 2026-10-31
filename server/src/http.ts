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
import type { Messung } from './messung';
import type { SystemQuelle } from './system';
import type { Designs } from './designs';
import type { ApiSchluesselDienst } from './apischluessel';
import { wer } from './api-v1';
import { hilfeAntwort, hilfeSenden } from './hilfe';
import { einbettenAus, sicherheitsKoepfe, type Einbetten } from './koepfe';
import { kontext, protokoll, type Kontext, type Stufe } from './protokoll';
import type { Betrieb } from './betrieb';
import type { Tresor } from './tresor';
import type { Texterkennung } from './texterkennung';
import type { Aufgabenmail } from './aufgabenmail';
import type { Fehlermeldungen } from './fehlermeldungen';
import { WartungFehler, type Wartung } from './wartung';
import type { Notfallzugang } from './notfall';
import type { Sicherung } from './sicherung';
import type { Wiederherstellung } from './wiederherstellung';
import { dateiKoepfe, leseCookie, modulAus, pruefeZugang, routen, SITZUNG_COOKIE, sitzungsCookie, type Anfrage } from './routen';

/** Häufige Abfragen, die das Protokoll sonst fluten würden. */
const LEISE = /^\/api\/(werkbank\/(protokoll|auftrag)|gesundheit)\b/;

type MitKontext = FastifyRequest & { dms?: Kontext };

interface Optionen {
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
  betrieb?: Betrieb;
  tresor?: Tresor;
  texterkennung?: Texterkennung;
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
  eingangsordner?: import('./eingangsordner').Eingangsordner;
  postfaecher?: import('./postfach').Postfaecher;
  ordner?: OrdnerPruefung;
  /** Einrichtungsassistent und Datenbank-Anbindung (#119). */
  einrichtung?: Einrichtung;
  anbindung?: AnbindungVerwaltung;
  mandantHinweis?: string | null;
  abruf?: (url: string) => Promise<unknown>;
  /** Erlaubte Ursprünge zum Einbetten (#239, DMS_EINBETTEN). */
  einbetten?: Einbetten;
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

  // Eine Zeile je Anfrage: Methode, Pfad, Status, Dauer, Benutzer.
  app.addHook('onResponse', async (req, reply) => {
    const url = req.url.split('?')[0];
    const status = reply.statusCode;
    const api = url.startsWith('/api/');
    let stufe: Stufe = status >= 500 ? 'error' : !api ? 'debug' : LEISE.test(url) ? 'trace' : req.method === 'GET' && status < 400 ? 'debug' : 'info';
    if (status === 401 && url === '/api/konto/status') stufe = 'debug';
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
          ip: req.ip,
          geraet: String(req.headers['user-agent'] ?? ''),
          einrichtungscode: typeof req.headers['x-einrichtungscode'] === 'string' ? req.headers['x-einrichtungscode'] : undefined,
        };
        const start = performance.now();
        const k: Kontext = { anfrage: req.id, pfad: `${req.method} ${req.url.split('?')[0]}`, db: { anzahl: 0, ms: 0 }, ursprung: `${req.protocol}://${req.host}` };
        (req as MitKontext).dms = k;
        const antwort = await kontext.run(k, async () => {
          await pruefeZugang(r, a, (n) => req.headers[n] as string | undefined, konten, opt.apiSchluessel);
          k.benutzer = wer(a.benutzer, a.apiSchluessel);
          // Wartungsmodus (#102): API 503, in der aktiven Stufe nur Administratoren.
          opt.wartung?.pruefeAnfrage(r, a.benutzer);
          return r.handler(a);
        });
        // Für den Entwicklermodus: Dauer auf dem Server, davon Datenbank (Anzahl Zugriffe in desc).
        reply.header('server-timing', `app;dur=${(performance.now() - start).toFixed(1)}, db;dur=${k.db.ms.toFixed(1)};desc="${k.db.anzahl}"`);
        if (antwort.sitzungSetzen !== undefined) {
          const sicher = typeof opt.sicher === 'function' ? kontext.run(k, opt.sicher) : opt.sicher ?? false;
          reply.header('set-cookie', sitzungsCookie(antwort.sitzungSetzen, sicher));
        }
        if (antwort.datei) {
          for (const [k, v] of Object.entries(dateiKoepfe(antwort.datei))) reply.header(k, v);
          return reply.send(antwort.datei.inhalt);
        }
        reply.header('cache-control', 'no-store');
        reply.code(antwort.status ?? 200);
        return antwort.status === 204 || antwort.body === undefined ? reply.send() : reply.send(antwort.body);
      },
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
