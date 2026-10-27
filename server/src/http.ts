import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { ladeBeispiele } from './beispiele';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';

interface Optionen {
  /** Verzeichnis der gebauten Weboberfläche; fehlt es, gibt es nur die API. */
  webDir?: string;
  logger?: FastifyServerOptions['logger'];
}

type MitId = { Params: { id: string } };

export async function baueApp(dienst: Dienst, opt: Optionen = {}) {
  const app = Fastify({ logger: opt.logger ?? false, bodyLimit: 2 * 1024 * 1024 });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof Fachfehler) return reply.code(err.status).send({ fehler: err.message, details: err.details });
    if ((err as { statusCode?: number }).statusCode && (err as { statusCode: number }).statusCode < 500) {
      return reply.code((err as { statusCode: number }).statusCode).send({ fehler: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ fehler: 'Interner Fehler. Details stehen im Server-Log.' });
  });

  app.get('/api/gesundheit', async () => ({ ok: true }));

  app.get('/api/typen', async () => dienst.listeTypen());
  app.post('/api/typen', async (req, reply) => reply.code(201).send(await dienst.legeTypAn(req.body)));
  app.put<MitId>('/api/typen/:id', async (req) => dienst.aendereTyp(req.params.id, req.body));
  app.delete<MitId>('/api/typen/:id', async (req, reply) => { await dienst.loescheTyp(req.params.id); return reply.code(204).send(); });

  app.get<{ Querystring: { typ?: string } }>('/api/mappen', async (req) => dienst.listeMappen(req.query.typ));
  app.get<MitId>('/api/mappen/:id', async (req) => dienst.holeMappe(req.params.id));
  app.post('/api/mappen', async (req, reply) => reply.code(201).send(await dienst.legeMappeAn(req.body)));
  app.put<MitId>('/api/mappen/:id', async (req) => dienst.aendereMappe(req.params.id, req.body));
  app.delete<MitId>('/api/mappen/:id', async (req, reply) => { await dienst.loescheMappe(req.params.id); return reply.code(204).send(); });

  app.post('/api/beispiele', async (_req, reply) => { await ladeBeispiele(dienst); return reply.code(204).send(); });

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
