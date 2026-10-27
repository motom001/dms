import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import type { Konten } from './konten';
import { dateiKoepfe, leseCookie, pruefeZugang, routen, SITZUNG_COOKIE, sitzungsCookie, type Anfrage } from './routen';

interface Optionen {
  /** Verzeichnis der gebauten Weboberfläche; fehlt es, gibt es nur die API. */
  webDir?: string;
  logger?: FastifyServerOptions['logger'];
  /** Secure-Flag am Cookie (nur bei HTTPS). */
  sicher?: boolean;
  /** Hinter einem Reverse-Proxy: X-Forwarded-For auswerten. */
  proxy?: boolean;
}

export async function baueApp(dienst: Dienst, konten: Konten, opt: Optionen = {}) {
  const app = Fastify({ logger: opt.logger ?? false, bodyLimit: 2 * 1024 * 1024, trustProxy: opt.proxy ?? false });

  app.setErrorHandler((fehler: unknown, req, reply) => {
    if (fehler instanceof Fachfehler) return reply.code(fehler.status).send({ fehler: fehler.message, details: fehler.details });
    const err = fehler as Error & { statusCode?: number };
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ fehler: err.message });
    req.log.error(err);
    return reply.code(500).send({ fehler: 'Interner Fehler. Details stehen im Server-Log.' });
  });

  // Datei-Uploads kommen als rohe Bytes (application/octet-stream).
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, fertig) => fertig(null, body));

  for (const r of routen(dienst, konten, (m) => app.log.warn(m))) {
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
        };
        await pruefeZugang(r, a, (n) => req.headers[n] as string | undefined, konten);
        const antwort = await r.handler(a);
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
