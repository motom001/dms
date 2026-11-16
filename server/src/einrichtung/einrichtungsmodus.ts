import fastifyStatic from '@fastify/static';
import type { ProxyVertrauen } from '../http/proxy';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import {
  ansicht,
  anbindungAus,
  legeDatenbankAn,
  pruefeAnbindung,
  schreibeAnbindung,
  type Anbindung,
  type Pruefung,
} from '../datenbank/anbindung';
import type { EinrichtungsAngabe, Einrichtungscode } from './einrichtungscode';
import { istHeimnetz } from '../notfall/notfallcode';
import { liesEinrichtungsdatei } from './einrichtungsdatei';
import { Fachfehler } from '../grundlagen/fehler';
import { protokoll } from '../protokoll/protokoll';
import { standKennung } from '../system/system';
import { oberflaecheSenden, statischeDateien } from '../oberflaeche/oberflaeche';
import { einbettenAus, sicherheitsKoepfe, type Einbetten } from '../http/koepfe';
import { t } from '../sprache/sprache';
import { EINGEBAUTE_SPRACHEN, setzeSprache } from '../../../shared/src/sprache';
import { spracheAusKopf } from '../../../shared/src/sprachwahl';
import { EINRICHTUNG_KOERPER_MAX } from '../grundlagen/grenzen';

/**
 * Einrichtungsmodus (#119): Das DMS läuft ohne erreichbare Datenbank und liefert nur den
 * Assistenten aus (Schritt Datenbank). Alle anderen Schnittstellen antworten mit 503 und einem
 * Verweis darauf. Sobald eine Anbindung geprüft und gespeichert ist, endet der Modus; danach
 * startet das eigentliche DMS im selben Prozess (ohne Neustart des Containers).
 */

const log = protokoll.modul('system');

export interface EinrichtungsmodusOptionen {
  geheim: string;
  code: Einrichtungscode;
  /** Vorbelegung: Datei oder DATABASE_URL, die nicht funktioniert hat. */
  vorbelegt: Anbindung | null;
  quelle: 'datei' | 'umgebung' | null;
  fehler: string | null;
  port: number;
  host: string;
  webDir?: string;
  proxy?: ProxyVertrauen;
  /** Erlaubte Ursprünge zum Einbetten (#239). */
  einbetten?: Einbetten;
  /** Für Tests: Verbindung prüfen und anlegen. */
  pruefe?: (a: Anbindung) => Promise<Pruefung>;
  anlegen?: (a: Anbindung) => Promise<void>;
  /** Vorhandene Anbindung im Hintergrund wiederholt versuchen (Datenbank startet noch). */
  wiederholenMs?: number;
}

export async function einrichtungsmodus(o: EinrichtungsmodusOptionen): Promise<Anbindung> {
  const pruefe = o.pruefe ?? ((a: Anbindung) => pruefeAnbindung(a));
  const z: Zustand = { fehler: o.fehler, vorbelegt: o.vorbelegt, beendet: false };
  let fertig!: (a: Anbindung) => void;
  const ergebnis = new Promise<Anbindung>((r) => {
    fertig = r;
  });

  const app = Fastify({ trustProxy: o.proxy ?? false, bodyLimit: EINRICHTUNG_KOERPER_MAX });
  richteGrundlagenEin(app, o);

  const uebernehmen = async (a: Anbindung, wer: string) => {
    await schreibeAnbindung(o.geheim, a);
    log.info(`Datenbank-Anbindung gespeichert (${wer}) – Ablago startet`, {
      host: a.host,
      port: a.port,
      datenbank: a.datenbank,
      benutzer: a.benutzer,
    });
    z.beendet = true;
    // Erst antworten, dann den Port für das eigentliche DMS freigeben.
    setTimeout(() => {
      void app.close().then(() => fertig(a));
    }, 300).unref?.();
  };
  richteRoutenEin(app, o, z, pruefe, uebernehmen);

  if (o.webDir && existsSync(o.webDir)) {
    await app.register(fastifyStatic, { root: o.webDir, wildcard: false, ...statischeDateien(o.webDir) });
    app.setNotFoundHandler((req, reply) => oberflaecheSenden(req.url, reply, o.webDir));
  }

  const zeitgeber = wiederholeVorhandene(o, z, pruefe, uebernehmen);

  await o.code.bereitstellen();
  await app.listen({ port: o.port, host: o.host });
  log.warn(`Einrichtungsmodus: ${z.fehler ?? 'keine Datenbank-Anbindung eingerichtet'} – weiter im Browser (Port ${o.port}).`);
  const a = await ergebnis;
  if (zeitgeber) clearInterval(zeitgeber);
  return a;
}

/* ---------- Schritte (#1278, Schritt 6b-1: aus einrichtungsmodus verschoben, Reihenfolge unverändert) ---------- */

/** Was die Routen und das Wiederholen gemeinsam ändern: letzter Fehler, Vorbelegung, ob die Einrichtung endet. */
interface Zustand {
  fehler: string | null;
  vorbelegt: Anbindung | null;
  beendet: boolean;
}
type Pruefe = (a: Anbindung) => Promise<Pruefung>;
type Uebernehmen = (a: Anbindung, wer: string) => Promise<void>;

/** Fehlerbehandlung, kein Zwischenspeichern, Sprache und Sicherheits-Header. */
function richteGrundlagenEin(app: FastifyInstance, o: EinrichtungsmodusOptionen) {
  app.setErrorHandler((e: unknown, _req, reply) => {
    if (e instanceof Fachfehler) return reply.code(e.status).send({ fehler: e.message, details: e.details });
    const err = e as Error & { statusCode?: number };
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ fehler: err.message });
    log.error('Fehler im Einrichtungsmodus', { fehler: err.stack ?? String(e) });
    return reply.code(500).send({ fehler: t('meldungen.einrichtungsmodus.interner-fehler-details-stehen') });
  });
  app.addHook('onRequest', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
  });
  // Sprache (#729): Ohne Datenbank gibt es keine Einstellung – es gilt, was der Assistent mitschickt. Im
  // Einrichtungsmodus richtet nur eine Person ein, deshalb genügt die Sprache des Prozesses.
  app.addHook('onRequest', async (req) => {
    const s = spracheAusKopf(typeof req.headers['x-sprache'] === 'string' ? req.headers['x-sprache'] : undefined, [...EINGEBAUTE_SPRACHEN]);
    if (s) setzeSprache(s);
  });
  app.get('/api/sprache', async (req) => {
    const s =
      spracheAusKopf(typeof req.headers['x-sprache'] === 'string' ? req.headers['x-sprache'] : undefined, [...EINGEBAUTE_SPRACHEN]) ?? 'de';
    return { sprache: s, standard: 'de', erlaubt: [...EINGEBAUTE_SPRACHEN], maschinell: [] };
  });
  // Sicherheits-Header wie im Betrieb (#239).
  app.addHook('onSend', async (req, reply, nutzlast) => {
    const typ = String(reply.getHeader('content-type') ?? '');
    for (const [k, v] of Object.entries(
      sicherheitsKoepfe(
        {
          pfad: req.url.split('?')[0],
          https: req.protocol === 'https',
          html: typ.startsWith('text/html'),
          csp: reply.hasHeader('content-security-policy'),
        },
        o.einbetten ?? einbettenAus(undefined),
      ),
    )) {
      if (!reply.hasHeader(k)) reply.header(k, v);
    }
    return nutzlast;
  });
}

const kopf = (req: { headers: Record<string, unknown> }, n: string) =>
  typeof req.headers[n] === 'string' ? (req.headers[n] as string) : undefined;

/** Die Schnittstelle des Assistenten: Stand, Gesundheit, Code, Datenbank prüfen, anlegen, übernehmen, Datei lesen. */
function richteRoutenEin(app: FastifyInstance, o: EinrichtungsmodusOptionen, z: Zustand, pruefe: Pruefe, uebernehmen: Uebernehmen) {
  const anlegen = o.anlegen ?? legeDatenbankAn;
  /** Einrichtungscode und Herkunft (#1359): ohne Code nur aus dem Heimnetz, wie beim Notfallzugang mit TRUST_PROXY. */
  const angabe = (req: { ip: string; headers: Record<string, unknown> }): EinrichtungsAngabe => ({
    ...(kopf(req, 'x-einrichtungscode') !== undefined ? { code: kopf(req, 'x-einrichtungscode') } : {}),
    heimnetz: istHeimnetz({ ip: req.ip, kopf: (n) => kopf(req, n) }, o.proxy),
  });
  /** Jede Änderung: Kennung der Oberfläche und Einrichtungscode. */
  const schutz = (req: { ip: string; headers: Record<string, unknown> }) => {
    if (kopf(req, 'x-dms') !== '1') throw new Fachfehler(403, t('meldungen.einrichtungsmodus.anfrage-ohne-kennung-der'));
    o.code.pruefe(angabe(req));
  };
  const eingabe = (body: unknown) => anbindungAus((body as { anbindung?: unknown } | null)?.anbindung, z.vorbelegt);

  // Angaben zur bisherigen Anbindung (Server, Benutzer, Fehler) nur mit Code.
  app.get('/api/konto/status', async (req) => {
    const mitCode = o.code.stimmt(angabe(req));
    return {
      einrichtungNoetig: true,
      mail: false,
      benutzer: null,
      marke: null,
      wartung: null,
      einrichtung: {
        phase: z.beendet ? 'startet' : 'datenbank',
        code: o.code.noetig,
        ...(mitCode ? { anbindung: ansicht(z.vorbelegt), quelle: o.quelle, fehler: z.fehler } : {}),
      },
    };
  });
  // Der Container läuft (Healthcheck im Image), wartet aber auf die Einrichtung.
  // Kennung einmal beim Start (#250): die Antwort selbst rechnet und liest nichts.
  const stand = standKennung();
  app.get('/api/gesundheit', async () => ({ ok: true, zustand: 'einrichtung', einrichtung: true, stand }));
  app.post('/api/einrichtung/code', async (req) => {
    schutz(req);
    return { ok: true };
  });
  app.post('/api/einrichtung/datenbank/pruefen', async (req) => {
    schutz(req);
    return pruefe(eingabe(req.body));
  });
  app.post('/api/einrichtung/datenbank/anlegen', async (req) => {
    schutz(req);
    const a = eingabe(req.body);
    try {
      await anlegen(a);
    } catch (e) {
      throw new Fachfehler(422, (e as Error).message);
    }
    log.info('Datenbank angelegt', { host: a.host, datenbank: a.datenbank });
    return pruefe(a);
  });
  app.post('/api/einrichtung/datenbank/uebernehmen', async (req) => {
    schutz(req);
    const a = eingabe(req.body);
    const p = await pruefe(a);
    if (!p.ok) {
      z.fehler = p.text;
      z.vorbelegt = { ...a, passwort: a.passwort };
      throw new Fachfehler(422, p.text, { pruefung: p });
    }
    await uebernehmen({ ...a, ...(z.vorbelegt?.mandant ? { mandant: z.vorbelegt.mandant } : {}) }, 'Assistent');
    return { ok: true, pruefung: p };
  });
  // Konfigurationsdatei (#806) schon vor der Datenbank: füllt die Anbindung vor, angelegt wird nichts.
  app.post('/api/einrichtung/datei/lesen', async (req) => {
    schutz(req);
    return { ...liesEinrichtungsdatei((req.body as { text?: unknown } | null)?.text), hinweise: [] };
  });
  // Alles andere: Verweis auf den Assistenten.
  app.all('/api/*', async (_req, reply) =>
    reply
      .code(503)
      .header('retry-after', '30')
      .send({ fehler: t('meldungen.einrichtungsmodus.ablago-ist-noch-nicht') }),
  );
}

/** Eine Anbindung, die nur noch nicht erreichbar war (Datenbank-Container startet noch): weiter versuchen. */
function wiederholeVorhandene(o: EinrichtungsmodusOptionen, z: Zustand, pruefe: Pruefe, uebernehmen: Uebernehmen) {
  let zeitgeber: NodeJS.Timeout | undefined;
  if (o.vorbelegt && o.quelle && o.wiederholenMs) {
    const kandidat = o.vorbelegt;
    zeitgeber = setInterval(() => {
      if (z.beendet) return;
      void pruefe(kandidat)
        .then(async (p) => {
          if (!p.ok || z.beendet) return;
          clearInterval(zeitgeber);
          log.info('Datenbank jetzt erreichbar');
          await uebernehmen(kandidat, o.quelle === 'umgebung' ? 'aus DATABASE_URL' : 'wieder erreichbar');
        })
        .catch(() => {});
    }, o.wiederholenMs);
    zeitgeber.unref?.();
  }
  return zeitgeber;
}
