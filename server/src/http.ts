import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyRequest } from 'fastify';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import type { Konten } from './konten';
import { kontext, protokoll, type Kontext, type Stufe } from './protokoll';
import { dateiKoepfe, leseCookie, modulAus, pruefeZugang, routen, SITZUNG_COOKIE, sitzungsCookie, type Anfrage } from './routen';

/** Häufige Abfragen, die das Protokoll sonst fluten würden. */
const LEISE = /^\/api\/(werkbank\/(protokoll|auftrag)|gesundheit)\b/;

type MitKontext = FastifyRequest & { dms?: Kontext };

interface Optionen {
  /** Verzeichnis der gebauten Weboberfläche; fehlt es, gibt es nur die API. */
  webDir?: string;
  /** @deprecated Protokoll läuft immer über protokoll.ts; bleibt für ältere Aufrufer. */
  logger?: unknown;
  /** Secure-Flag am Cookie (nur bei HTTPS). */
  sicher?: boolean;
  /** Hinter einem Reverse-Proxy: X-Forwarded-For auswerten. */
  proxy?: boolean;
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

  // Datei-Uploads kommen als rohe Bytes (application/octet-stream).
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, fertig) => fertig(null, body));

  for (const r of routen(dienst, konten)) {
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
        };
        const k: Kontext = { anfrage: req.id, db: { anzahl: 0, ms: 0 } };
        (req as MitKontext).dms = k;
        const antwort = await kontext.run(k, async () => {
          await pruefeZugang(r, a, (n) => req.headers[n] as string | undefined, konten);
          k.benutzer = a.benutzer?.email;
          return r.handler(a);
        });
        if (antwort.sitzungSetzen !== undefined) reply.header('set-cookie', sitzungsCookie(antwort.sitzungSetzen, opt.sicher ?? false));
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
      return reply.sendFile('index.html');
    });
  }

  return app;
}
