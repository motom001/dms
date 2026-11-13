import fastifyStatic from '@fastify/static';
import type { ProxyVertrauen } from './proxy';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { ansicht, anbindungAus, legeDatenbankAn, pruefeAnbindung, schreibeAnbindung, type Anbindung, type Pruefung } from './anbindung';
import type { Einrichtungscode } from './einrichtungscode';
import { liesEinrichtungsdatei } from './einrichtungsdatei';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { standKennung } from './system';
import { oberflaecheSenden, statischeDateien } from './oberflaeche';
import { einbettenAus, sicherheitsKoepfe, type Einbetten } from './koepfe';
import { t } from './sprache';
import { EINGEBAUTE_SPRACHEN, setzeSprache } from '../../shared/src/sprache';
import { spracheAusKopf } from '../../shared/src/sprachwahl';
import { EINRICHTUNG_KOERPER_MAX } from './grenzen';

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
  const anlegen = o.anlegen ?? legeDatenbankAn;
  let fehler = o.fehler;
  let vorbelegt = o.vorbelegt;
  let fertig!: (a: Anbindung) => void;
  const ergebnis = new Promise<Anbindung>((r) => { fertig = r; });
  let beendet = false;

  const app = Fastify({ trustProxy: o.proxy ?? false, bodyLimit: EINRICHTUNG_KOERPER_MAX });
  app.setErrorHandler((e: unknown, _req, reply) => {
    if (e instanceof Fachfehler) return reply.code(e.status).send({ fehler: e.message, details: e.details });
    const err = e as Error & { statusCode?: number };
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ fehler: err.message });
    log.error('Fehler im Einrichtungsmodus', { fehler: err.stack ?? String(e) });
    return reply.code(500).send({ fehler: t('meldungen.einrichtungsmodus.interner-fehler-details-stehen') });
  });
  app.addHook('onRequest', async (_req, reply) => { reply.header('cache-control', 'no-store'); });
  // Sprache (#729): Ohne Datenbank gibt es keine Einstellung – es gilt, was der Assistent mitschickt. Im
  // Einrichtungsmodus richtet nur eine Person ein, deshalb genügt die Sprache des Prozesses.
  app.addHook('onRequest', async (req) => {
    const s = spracheAusKopf(typeof req.headers['x-sprache'] === 'string' ? req.headers['x-sprache'] : undefined, [...EINGEBAUTE_SPRACHEN]);
    if (s) setzeSprache(s);
  });
  app.get('/api/sprache', async (req) => {
    const s = spracheAusKopf(typeof req.headers['x-sprache'] === 'string' ? req.headers['x-sprache'] : undefined, [...EINGEBAUTE_SPRACHEN]) ?? 'de';
    return { sprache: s, standard: 'de', erlaubt: [...EINGEBAUTE_SPRACHEN], maschinell: [] };
  });
  // Sicherheits-Header wie im Betrieb (#239).
  app.addHook('onSend', async (req, reply, nutzlast) => {
    const typ = String(reply.getHeader('content-type') ?? '');
    for (const [k, v] of Object.entries(sicherheitsKoepfe({ pfad: req.url.split('?')[0], https: req.protocol === 'https', html: typ.startsWith('text/html'), csp: reply.hasHeader('content-security-policy') }, o.einbetten ?? einbettenAus(undefined)))) {
      if (!reply.hasHeader(k)) reply.header(k, v);
    }
    return nutzlast;
  });

  const kopf = (req: { headers: Record<string, unknown> }, n: string) => (typeof req.headers[n] === 'string' ? req.headers[n] as string : undefined);
  /** Jede Änderung: Kennung der Oberfläche und Einrichtungscode. */
  const schutz = (req: { headers: Record<string, unknown> }) => {
    if (kopf(req, 'x-dms') !== '1') throw new Fachfehler(403, t('meldungen.einrichtungsmodus.anfrage-ohne-kennung-der'));
    o.code.pruefe(kopf(req, 'x-einrichtungscode'));
  };
  const eingabe = (body: unknown) => anbindungAus((body as { anbindung?: unknown } | null)?.anbindung, vorbelegt);

  const uebernehmen = async (a: Anbindung, wer: string) => {
    await schreibeAnbindung(o.geheim, a);
    log.info(`Datenbank-Anbindung gespeichert (${wer}) – Ablago startet`, { host: a.host, port: a.port, datenbank: a.datenbank, benutzer: a.benutzer });
    beendet = true;
    // Erst antworten, dann den Port für das eigentliche DMS freigeben.
    setTimeout(() => { void app.close().then(() => fertig(a)); }, 300).unref?.();
  };

  // Angaben zur bisherigen Anbindung (Server, Benutzer, Fehler) nur mit Code.
  app.get('/api/konto/status', async (req) => {
    const mitCode = o.code.stimmt(kopf(req, 'x-einrichtungscode'));
    return {
      einrichtungNoetig: true, mail: false, benutzer: null, marke: null, wartung: null,
      einrichtung: { phase: beendet ? 'startet' : 'datenbank', code: o.code.noetig, ...(mitCode ? { anbindung: ansicht(vorbelegt), quelle: o.quelle, fehler } : {}) },
    };
  });
  // Der Container läuft (Healthcheck im Image), wartet aber auf die Einrichtung.
  // Kennung einmal beim Start (#250): die Antwort selbst rechnet und liest nichts.
  const stand = standKennung();
  app.get('/api/gesundheit', async () => ({ ok: true, zustand: 'einrichtung', einrichtung: true, stand }));
  app.post('/api/einrichtung/code', async (req) => { schutz(req); return { ok: true }; });
  app.post('/api/einrichtung/datenbank/pruefen', async (req) => { schutz(req); return pruefe(eingabe(req.body)); });
  app.post('/api/einrichtung/datenbank/anlegen', async (req) => {
    schutz(req);
    const a = eingabe(req.body);
    try { await anlegen(a); } catch (e) { throw new Fachfehler(422, (e as Error).message); }
    log.info('Datenbank angelegt', { host: a.host, datenbank: a.datenbank });
    return pruefe(a);
  });
  app.post('/api/einrichtung/datenbank/uebernehmen', async (req) => {
    schutz(req);
    const a = eingabe(req.body);
    const p = await pruefe(a);
    if (!p.ok) { fehler = p.text; vorbelegt = { ...a, passwort: a.passwort }; throw new Fachfehler(422, p.text, { pruefung: p }); }
    await uebernehmen({ ...a, ...(vorbelegt?.mandant ? { mandant: vorbelegt.mandant } : {}) }, 'Assistent');
    return { ok: true, pruefung: p };
  });
  // Konfigurationsdatei (#806) schon vor der Datenbank: füllt die Anbindung vor, angelegt wird nichts.
  app.post('/api/einrichtung/datei/lesen', async (req) => { schutz(req); return { ...liesEinrichtungsdatei((req.body as { text?: unknown } | null)?.text), hinweise: [] }; });
  // Alles andere: Verweis auf den Assistenten.
  app.all('/api/*', async (_req, reply) => reply.code(503).header('retry-after', '30').send({ fehler: t('meldungen.einrichtungsmodus.ablago-ist-noch-nicht') }));

  if (o.webDir && existsSync(o.webDir)) {
    await app.register(fastifyStatic, { root: o.webDir, wildcard: false, ...statischeDateien(o.webDir) });
    app.setNotFoundHandler((req, reply) => oberflaecheSenden(req.url, reply, o.webDir));
  }

  // Eine Anbindung, die nur noch nicht erreichbar war (Datenbank-Container startet noch): weiter versuchen.
  let zeitgeber: NodeJS.Timeout | undefined;
  if (o.vorbelegt && o.quelle && o.wiederholenMs) {
    const kandidat = o.vorbelegt;
    zeitgeber = setInterval(() => {
      if (beendet) return;
      void pruefe(kandidat).then(async (p) => {
        if (!p.ok || beendet) return;
        clearInterval(zeitgeber);
        log.info('Datenbank jetzt erreichbar');
        await uebernehmen(kandidat, o.quelle === 'umgebung' ? 'aus DATABASE_URL' : 'wieder erreichbar');
      }).catch(() => {});
    }, o.wiederholenMs);
    zeitgeber.unref?.();
  }

  await o.code.bereitstellen();
  await app.listen({ port: o.port, host: o.host });
  log.warn(`Einrichtungsmodus: ${fehler ?? 'keine Datenbank-Anbindung eingerichtet'} – weiter im Browser (Port ${o.port}).`);
  const a = await ergebnis;
  if (zeitgeber) clearInterval(zeitgeber);
  return a;
}
