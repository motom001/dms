import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { hilfeAntwort, hilfeSenden } from '../oberflaeche/hilfe';
import { einbettenAus, sicherheitsKoepfe, type Einbetten } from '../http/koepfe';
import { richteOberflaecheEin } from '../oberflaeche/auslieferer';
import { protokoll } from '../protokoll/protokoll';
import { ursprungAus, type ProxyVertrauen } from '../http/proxy';
import { mitSprache, t } from '../sprache/sprache';
import {
  startfehlerAus,
  startseiteHtml,
  startseitenSprache,
  type Startfehler,
  type Startschritt,
  type Startstand,
  type VorstartGrund,
} from './startfehler';
import { standKennung } from '../system/system';
import type { StartseitenKennung } from './dienstbenutzer';
import { MODUS_KOERPER_MAX } from '../grundlagen/grenzen';

/**
 * Startseite „Ablago startet …“ (#802): Der Port ist wenige Sekunden nach dem Start offen, auch wenn Migrationen und
 * Vorbereitungen noch Minuten dauern. Bis Ablago bereit ist, gibt es unter dem Port nur diese Seite:
 *
 * - Alle Seiten der Oberfläche zeigen „Ablago startet …“ mit dem aktuellen Schritt (nur Schritte und Zahlen, nie Daten
 *   aus der Ablage) und laden sich alle paar Sekunden neu. Ist Ablago bereit, antwortet unter derselben Adresse die
 *   Oberfläche – damit geht es von selbst weiter zur Anmeldung oder zum Einrichtungsassistenten.
 * - Alle Schnittstellen (/api, /webdav) antworten mit 503 und Retry-After. Nichts davon erreicht die Datenbank: Dieser
 *   Server kennt sie gar nicht, er hält nur den Stand im Arbeitsspeicher.
 * - /api/gesundheit meldet bis zum Ende 503 („startet“ bzw. „fehler“), damit Docker, NAS und Reverse-Proxy warten.
 * - /hilfe (Handbücher, ohne Daten) bleibt erreichbar, damit die Fehlerseite auf „Fehlersuche“ verweisen kann.
 *
 * Bei einem Fehler zeigt die Seite in Klartext, was schiefging – ohne die technische Meldung, die Werte aus der
 * Datenbank enthalten kann; die steht im Protokoll.
 */

const log = protokoll.modul('system');

export type { Startschritt, Startfehler, Startstand } from './startfehler';
export { startfehlerAus } from './startfehler';

export interface StartmodusOptionen {
  port: number;
  host: string;
  webDir?: string;
  proxy?: ProxyVertrauen;
  einbetten?: Einbetten;
  jetzt?: () => number;
  /** Sekunden bis zum Neuladen der Seite (Vorgabe 3, im Fehlerfall 30). */
  neuLadenS?: number;
  /** Beginn des Starts (ms), z. B. vom Vorstart in dms-komplett (#1250) – „Läuft seit“ zählt dann weiter. */
  seit?: number;
  /**
   * Vorstart (#1250): Prozess, der den Port bis jetzt hält (dms-komplett, deploy/komplett/start.sh). Ist der Port belegt,
   * bekommt er SIGTERM und gibt ihn frei; der Startmodus versucht es so lange erneut (höchstens UEBERGABE_MS).
   */
  vorgaenger?: number | null;
  /** dms-komplett: Auswege ohne eigenen Datenbank-Container. */
  komplett?: boolean;
  /** Vorstart (#1250): Port mit SO_REUSEPORT öffnen, damit Ablago ihn ohne Lücke übernehmen kann. */
  teilen?: boolean;
  /** Vorstart (#1250): ohne Kennung des Stands in /api/gesundheit (er kennt den Zufallswert der Installation nicht). */
  ohneStand?: boolean;
  /** Benutzer von Ablago (#1466): Wahl des Start-Skripts, Änderungen und Schreibfehler – bei jeder Seite neu gelesen. */
  kennung?: () => StartseitenKennung | null;
}

/** So lange wartet der Startmodus höchstens, bis der Vorstart den Port freigibt (#1250). */
const UEBERGABE_MS = 10_000;

/** So lange bekommen laufende Anfragen beim Freigeben des Ports noch ihre Antwort (#1419). */
const ENDE_GRENZE_MS = 3000;

/**
 * Port sanft freigeben (#1419), für Startseite und Einrichtungsmodus: Ruhende Keep-Alive-Verbindungen schließt
 * `close()` sofort; laufende Anfragen bekommen noch ihre Antwort, mit „Connection: close“, damit ihre Verbindung danach
 * endet. Nach `grenzeMs` schließt es alle übrigen. Vorher beendete `closeAllConnections()` auch laufende Anfragen – der
 * Browser bekam statt einer Antwort ERR_CONNECTION_RESET bzw. ERR_EMPTY_RESPONSE; ohne „Connection: close“ wartete
 * `close()` dagegen bis zum Ende des Keep-Alive (72 s). Vor `listen()` aufrufen (fügt einen Haken hinzu).
 */
export function sanftesEnde(app: FastifyInstance): (grenzeMs?: number) => Promise<void> {
  let endet = false;
  app.addHook('onSend', async (_req, reply, nutzlast) => {
    if (endet) reply.header('connection', 'close');
    return nutzlast;
  });
  return async (grenzeMs = ENDE_GRENZE_MS) => {
    endet = true;
    const notfalls = setTimeout(() => app.server.closeAllConnections?.(), grenzeMs);
    notfalls.unref?.();
    try {
      await app.close();
    } finally {
      clearTimeout(notfalls);
    }
  };
}

export class Startmodus {
  private app: FastifyInstance | null = null;
  private ende: ((grenzeMs?: number) => Promise<void>) | null = null;
  private jetzt: () => number;
  private migration: string | null = null;
  readonly stand: Startstand;

  constructor(private o: StartmodusOptionen) {
    this.jetzt = o.jetzt ?? Date.now;
    const seit = o.seit && Number.isFinite(o.seit) && o.seit <= this.jetzt() ? o.seit : this.jetzt();
    this.stand = { zustand: 'startet', schritt: 'datenbank', nr: null, von: null, menge: null, seit, fehler: null };
  }

  get offen() {
    return !!this.app;
  }
  /** Tatsächlicher Port (Tests mit Port 0). */
  get port(): number | null {
    const a = this.app?.server.address();
    return typeof a === 'object' && a ? a.port : null;
  }

  /** Nächster Schritt; `nr`/`von` z. B. für die Migrationen. */
  schritt(s: Startschritt, z?: { nr: number; von: number; datei?: string }) {
    if (this.stand.zustand === 'fehler') return;
    Object.assign(this.stand, { schritt: s, nr: z?.nr ?? null, von: z?.von ?? null, menge: null });
    this.migration = s === 'migration' ? (z?.datei ?? null) : null;
  }

  /** Mengenangabe im aktuellen Schritt, z. B. „120 von 200 Mappentypen“. */
  menge(fertig: number, gesamt: number) {
    if (this.stand.zustand !== 'fehler') this.stand.menge = { fertig, gesamt };
  }

  /** Start fehlgeschlagen: Grund auf der Seite, alles Weitere im Protokoll. */
  fehler(e: unknown): Startfehler {
    if (this.stand.fehler) return this.stand.fehler;
    const f = startfehlerAus(e, this.stand, this.migration);
    Object.assign(this.stand, { zustand: 'fehler', fehler: f });
    return f;
  }

  /** Kurzform für /api/gesundheit. */
  gesundheit() {
    return { ok: false, zustand: this.stand.zustand, startet: true, ...(this.o.ohneStand ? {} : { stand: standKennung() }) };
  }

  private dauer(): string {
    const s = Math.max(0, Math.round((this.jetzt() - this.stand.seit) / 1000));
    return s < 120 ? t('start.sekunden', { anzahl: s }) : t('start.minuten', { anzahl: Math.floor(s / 60) });
  }

  /** Die Seite selbst (startfehler.ts) in der Sprache der Anfrage (#1250). */
  seite(sprache: 'de' | 'en' = 'de'): string {
    return mitSprache(sprache, () =>
      startseiteHtml(this.stand, {
        dauer: this.dauer(),
        neuLadenS: this.o.neuLadenS ?? 3,
        komplett: !!this.o.komplett,
        sprache,
        kennung: this.kennung(),
      }),
    );
  }

  private kennung(): StartseitenKennung | null {
    try {
      return this.o.kennung?.() ?? null;
    } catch {
      return null;
    }
  }

  /** Fehler des Vorstarts (#1250): Grund aus start.sh, vor Ablago selbst. */
  vorstartFehler(grund: VorstartGrund) {
    if (this.stand.fehler) return;
    Object.assign(this.stand, { zustand: 'fehler', fehler: { art: 'vorstart', grund } });
  }

  /** Port öffnen. Mehrfach möglich (nach dem Einrichtungsmodus, der den Port zwischendurch braucht). */
  async oeffne() {
    if (this.app) return;
    const app = Fastify({ trustProxy: this.o.proxy ?? false, bodyLimit: MODUS_KOERPER_MAX });
    app.setErrorHandler((e: unknown, _req, reply) => {
      log.warn('Fehler auf der Startseite', { fehler: (e as Error)?.message ?? String(e) });
      return reply
        .code(503)
        .header('retry-after', '5')
        .send({ fehler: t('start.api'), startet: true });
    });
    // Körper werden nie gelesen: jeder Inhalt wird angenommen und verworfen.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('*', (req, _nutzlast, fertig) => {
      req.raw.resume();
      fertig(null, null);
    });
    app.addHook('onRequest', async (_req, reply) => {
      reply.header('cache-control', 'no-store');
    });
    app.addHook('onSend', async (req, reply, nutzlast) => {
      const typ = String(reply.getHeader('content-type') ?? '');
      for (const [k, v] of Object.entries(
        sicherheitsKoepfe(
          {
            pfad: req.url.split('?')[0],
            https: ursprungAus(req, this.o.proxy).https,
            html: typ.startsWith('text/html'),
            csp: reply.hasHeader('content-security-policy'),
          },
          this.o.einbetten ?? einbettenAus(undefined),
        ),
      )) {
        if (!reply.hasHeader(k)) reply.header(k, v);
      }
      return nutzlast;
    });
    const nichtBereit = (reply: { code(c: number): { header(k: string, v: string): { send(b: unknown): unknown } } }) =>
      reply
        .code(503)
        .header('retry-after', this.stand.zustand === 'fehler' ? '30' : '5')
        .send({ fehler: this.stand.zustand === 'fehler' ? t('start.api.fehler') : t('start.api'), startet: true });
    app.get('/api/gesundheit', async (_req, reply) => reply.code(503).header('retry-after', '5').send(this.gesundheit()));

    // Handbücher (#219) ohne Anmeldung, wie im Einrichtungsmodus – nur Dateien unter web/dist/hilfe.
    const webDir = this.o.webDir && existsSync(this.o.webDir) ? this.o.webDir : null;
    const dateien = webDir ? richteOberflaecheEin(app, webDir) : null;
    const hilfe = async (req: { url: string }, reply: Parameters<typeof hilfeSenden>[0] & { sendFile(p: string): unknown }) => {
      // Nur Einträge der beim Start gelesenen Liste (#1468) – kein Pfad aus der URL geht an das Dateisystem.
      let rel = '';
      try {
        rel = decodeURIComponent(req.url.split('?')[0]).slice(1);
      } catch {
        /* kaputt kodiert: keine Datei */
      }
      if (rel.startsWith('hilfe/') && dateien?.has(rel)) return reply.sendFile(rel);
      const a = hilfeAntwort(req.url, webDir ?? undefined);
      return a ? hilfeSenden(reply, a) : null;
    };

    app.setNotFoundHandler(async (req, reply) => {
      const pfad = req.url.split('?')[0];
      if (pfad.startsWith('/api/') || pfad === '/api' || pfad === '/webdav' || pfad.startsWith('/webdav/')) return nichtBereit(reply);
      if ((req.method === 'GET' || req.method === 'HEAD') && (pfad === '/hilfe' || pfad.startsWith('/hilfe/'))) {
        const r = await hilfe(req, reply as never);
        if (r !== null) return r;
      }
      // Dateien der Oberfläche (/assets/…, favicon) gibt es erst mit Ablago selbst.
      if (req.method !== 'GET' && req.method !== 'HEAD') return nichtBereit(reply);
      if (/\.[a-z0-9]{1,8}$/i.test(pfad)) return nichtBereit(reply);
      return reply
        .code(200)
        .type('text/html; charset=utf-8')
        .header('vary', 'accept-language')
        .send(this.seite(startseitenSprache(req.headers['accept-language'])));
    });
    const ende = sanftesEnde(app);
    await this.lausche(app);
    this.app = app;
    this.ende = ende;
  }

  /**
   * Port öffnen und – kommt Ablago nach dem Vorstart (#1250) – ihn danach um Freigabe bitten. Beide lauschen mit
   * SO_REUSEPORT (Linux), also kurz gleichzeitig: Beim Wechsel bleibt die Adresse ohne Lücke erreichbar. Ist der Port
   * trotzdem belegt (Vorstart ohne reusePort), erst bitten, dann bis UEBERGABE_MS erneut versuchen.
   */
  private async lausche(app: FastifyInstance) {
    const pid = this.o.vorgaenger;
    const teilen = !!pid || !!this.o.teilen;
    const bis = Date.now() + UEBERGABE_MS;
    const bitte = () => {
      try {
        if (pid) process.kill(pid, 'SIGTERM');
      } catch {
        /* schon beendet */
      }
    };
    let gebeten = false;
    for (;;) {
      try {
        await app.listen({ port: this.o.port, host: this.o.host, ...(teilen ? { reusePort: true } : {}) });
        if (!gebeten) bitte();
        return;
      } catch (e) {
        if ((e as { code?: string }).code !== 'EADDRINUSE' || !pid || Date.now() > bis) throw e;
        if (!gebeten) bitte();
        gebeten = true;
        await new Promise((r) => setTimeout(r, 20));
      }
    }
  }

  /** Port freigeben – für Ablago selbst (oder den Einrichtungsmodus). */
  async schliesse() {
    const ende = this.ende;
    this.app = null;
    this.ende = null;
    // Ruhende Verbindungen (Keep-Alive des Browsers) sofort, laufende Anfragen nach ihrer Antwort (#1419).
    await ende?.();
  }
}
