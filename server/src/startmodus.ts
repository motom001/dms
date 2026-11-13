import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { HILFE, hilfeUrl } from '../../shared/src/hilfe';
import { NeuereDatenbankFehler } from './db';
import { hilfeAntwort, hilfeSenden } from './hilfe';
import { einbettenAus, sicherheitsKoepfe, type Einbetten } from './koepfe';
import { statischeDateien } from './oberflaeche';
import { protokoll } from './protokoll';
import type { ProxyVertrauen } from './proxy';
import { t } from './sprache';
import { standKennung } from './system';
import { MODUS_KOERPER_MAX } from './grenzen';

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

export type Startschritt = 'datenbank' | 'migration' | 'schluessel' | 'suchindex' | 'ordner' | 'titel' | 'benutzer' | 'typen' | 'dienste' | 'lasttest';

export type Startfehler =
  | { art: 'neuere-datenbank'; unbekannt: string[] }
  | { art: 'migration'; nr: number; von: number; datei: string; code: string }
  | { art: 'allgemein'; schritt: Startschritt };

export interface Startstand {
  zustand: 'startet' | 'fehler';
  schritt: Startschritt;
  nr: number | null;
  von: number | null;
  menge: { fertig: number; gesamt: number } | null;
  /** Beginn des Starts (ms). */
  seit: number;
  fehler: Startfehler | null;
}

export interface StartmodusOptionen {
  port: number;
  host: string;
  webDir?: string;
  proxy?: ProxyVertrauen;
  einbetten?: Einbetten;
  jetzt?: () => number;
  /** Sekunden bis zum Neuladen der Seite (Vorgabe 3, im Fehlerfall 30). */
  neuLadenS?: number;
}

/** Nur diese Kennungen gehen nach außen; Dateinamen der Migrationen sind Teil des Programms, keine Daten. */
const MIGRATION = /^[\w.-]{1,120}$/;
const CODE = /^[0-9A-Z]{5}$/;

/** Fehler beim Start → was die Seite zeigen darf (keine Meldungstexte, nur Art, Schritt, Datei und Fehlercode). */
export function startfehlerAus(e: unknown, stand: Pick<Startstand, 'schritt' | 'nr' | 'von'>, migration: string | null): Startfehler {
  if (e instanceof NeuereDatenbankFehler) return { art: 'neuere-datenbank', unbekannt: e.unbekannt.filter((n) => MIGRATION.test(n)) };
  if (stand.schritt === 'migration' && migration && MIGRATION.test(migration)) {
    const code = String((e as { code?: unknown } | null)?.code ?? '');
    return { art: 'migration', nr: stand.nr ?? 0, von: stand.von ?? 0, datei: migration, code: CODE.test(code) ? code : '–' };
  }
  return { art: 'allgemein', schritt: stand.schritt };
}

const html = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export class Startmodus {
  private app: FastifyInstance | null = null;
  private jetzt: () => number;
  private migration: string | null = null;
  readonly stand: Startstand;

  constructor(private o: StartmodusOptionen) {
    this.jetzt = o.jetzt ?? Date.now;
    this.stand = { zustand: 'startet', schritt: 'datenbank', nr: null, von: null, menge: null, seit: this.jetzt(), fehler: null };
  }

  get offen() { return !!this.app; }
  /** Tatsächlicher Port (Tests mit Port 0). */
  get port(): number | null { const a = this.app?.server.address(); return typeof a === 'object' && a ? a.port : null; }

  /** Nächster Schritt; `nr`/`von` z. B. für die Migrationen. */
  schritt(s: Startschritt, z?: { nr: number; von: number; datei?: string }) {
    if (this.stand.zustand === 'fehler') return;
    Object.assign(this.stand, { schritt: s, nr: z?.nr ?? null, von: z?.von ?? null, menge: null });
    this.migration = s === 'migration' ? z?.datei ?? null : null;
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
    return { ok: false, zustand: this.stand.zustand, startet: true, stand: standKennung() };
  }

  private dauer(): string {
    const s = Math.max(0, Math.round((this.jetzt() - this.stand.seit) / 1000));
    return s < 120 ? t('start.sekunden', { anzahl: s }) : t('start.minuten', { anzahl: Math.floor(s / 60) });
  }

  private schrittText(s: Pick<Startstand, 'schritt' | 'nr' | 'von'>) {
    return t.frei(`start.schritt.${s.schritt}`, { nr: s.nr ?? '', von: s.von ?? '' });
  }

  /** Die Seite selbst: schlicht, ohne Skript (Neuladen per meta refresh), Stil inline (CSP erlaubt nur das). */
  seite(): string {
    const s = this.stand;
    const neu = s.zustand === 'fehler' ? 30 : this.o.neuLadenS ?? 3;
    const teile: string[] = [];
    if (s.zustand === 'startet') {
      const anteil = s.menge && s.menge.gesamt > 0 ? s.menge.fertig / s.menge.gesamt : s.nr && s.von ? (s.nr - 1) / s.von : null;
      teile.push(
        `<h1>${html(t('start.titel'))}</h1>`,
        `<p class="schritt" role="status">${html(this.schrittText(s))}${s.menge ? ` – ${html(t('start.menge', { fertig: s.menge.fertig.toLocaleString('de-DE'), gesamt: s.menge.gesamt.toLocaleString('de-DE') }))}` : ''}</p>`,
        anteil === null ? '<progress></progress>' : `<progress max="100" value="${Math.round(anteil * 100)}"></progress>`,
        `<p class="leise">${html(t('start.seit', { dauer: this.dauer() }))}</p>`,
        `<p>${html(t('start.beruhigung'))}</p>`,
        `<p class="leise">${html(t('start.weiter'))}</p>`,
      );
    } else {
      const f = s.fehler!;
      const grund = f.art === 'neuere-datenbank'
        ? t('start.fehler.neuere-datenbank', { anzahl: f.unbekannt.length, letzte: f.unbekannt[f.unbekannt.length - 1] ?? '–' })
        : f.art === 'migration'
          ? t('start.fehler.migration', { nr: f.nr, von: f.von, datei: f.datei, code: f.code })
          : t('start.fehler.allgemein', { schritt: this.schrittText({ schritt: f.schritt, nr: null, von: null }) });
      teile.push(
        `<h1>${html(t('start.fehler.titel'))}</h1>`,
        `<p class="schritt" role="alert">${html(grund)}</p>`,
        ...(f.art === 'neuere-datenbank' ? [`<p>${html(t('start.fehler.neuere-datenbank.tun'))}</p>`] : []),
        `<p>${html(t('start.fehler.tun'))}</p>`,
        ...(f.art === 'neuere-datenbank' ? [] : [`<p class="leise">${html(t('start.fehler.neustart'))}</p>`]),
        `<p><a href="${html(hilfeUrl(HILFE['start.fehler'], null))}">${html(t('start.fehler.hilfe'))}</a></p>`,
      );
    }
    return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${neu}"><meta name="robots" content="noindex">
<title>${html(s.zustand === 'fehler' ? t('start.fehler.titel') : t('start.titel'))}</title>
<style>
:root{color-scheme:light dark;--grund:#f5f7f8;--karte:#fff;--text:#1c2328;--leise:#5b6670;--akzent:#00796b;--rand:#dde2e6;--fehler:#b3261e}
@media (prefers-color-scheme:dark){:root{--grund:#101417;--karte:#1a2025;--text:#e6eaed;--leise:#9aa5ae;--akzent:#4db6ac;--rand:#2c343a;--fehler:#f2b8b5}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--grund);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{box-sizing:border-box;width:min(560px,100% - 32px);background:var(--karte);border:1px solid var(--rand);border-radius:14px;padding:28px}
h1{margin:0 0 12px;font-size:1.4rem}
.schritt{font-weight:600}${s.zustand === 'fehler' ? '.schritt{color:var(--fehler)}' : ''}
.leise{color:var(--leise);font-size:.93rem}
progress{width:100%;height:10px;accent-color:var(--akzent)}
a{color:var(--akzent)}
</style></head>
<body><main>
${teile.join('\n')}
</main></body></html>
`;
  }

  /** Port öffnen. Mehrfach möglich (nach dem Einrichtungsmodus, der den Port zwischendurch braucht). */
  async oeffne() {
    if (this.app) return;
    const app = Fastify({ trustProxy: this.o.proxy ?? false, bodyLimit: MODUS_KOERPER_MAX });
    app.setErrorHandler((e: unknown, _req, reply) => {
      log.warn('Fehler auf der Startseite', { fehler: (e as Error)?.message ?? String(e) });
      return reply.code(503).header('retry-after', '5').send({ fehler: t('start.api'), startet: true });
    });
    // Körper werden nie gelesen: jeder Inhalt wird angenommen und verworfen.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('*', (req, _nutzlast, fertig) => { req.raw.resume(); fertig(null, null); });
    app.addHook('onRequest', async (_req, reply) => { reply.header('cache-control', 'no-store'); });
    app.addHook('onSend', async (req, reply, nutzlast) => {
      const typ = String(reply.getHeader('content-type') ?? '');
      for (const [k, v] of Object.entries(sicherheitsKoepfe({ pfad: req.url.split('?')[0], https: req.protocol === 'https', html: typ.startsWith('text/html'), csp: reply.hasHeader('content-security-policy') }, this.o.einbetten ?? einbettenAus(undefined)))) {
        if (!reply.hasHeader(k)) reply.header(k, v);
      }
      return nutzlast;
    });
    const nichtBereit = (reply: { code(c: number): { header(k: string, v: string): { send(b: unknown): unknown } } }) =>
      reply.code(503).header('retry-after', this.stand.zustand === 'fehler' ? '30' : '5')
        .send({ fehler: this.stand.zustand === 'fehler' ? t('start.api.fehler') : t('start.api'), startet: true });
    app.get('/api/gesundheit', async (_req, reply) => reply.code(503).header('retry-after', '5').send(this.gesundheit()));

    // Handbücher (#219) ohne Anmeldung, wie im Einrichtungsmodus – nur Dateien unter web/dist/hilfe.
    const webDir = this.o.webDir && existsSync(this.o.webDir) ? this.o.webDir : null;
    if (webDir) await app.register(fastifyStatic, { root: webDir, serve: false, ...statischeDateien(webDir) });
    const hilfe = async (req: { url: string }, reply: Parameters<typeof hilfeSenden>[0] & { sendFile(p: string): unknown }) => {
      const pfad = decodeURIComponent(req.url.split('?')[0]);
      const rel = normalize(pfad.slice(1));
      if (webDir && rel.startsWith(`hilfe${sep}`) && !rel.split(sep).includes('..')) {
        try { if (statSync(join(webDir, rel)).isFile()) return reply.sendFile(rel); } catch { /* keine Datei: weiter unten */ }
      }
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
      return reply.code(200).type('text/html; charset=utf-8').send(this.seite());
    });
    await app.listen({ port: this.o.port, host: this.o.host });
    this.app = app;
  }

  /** Port freigeben – für Ablago selbst (oder den Einrichtungsmodus). */
  async schliesse() {
    const app = this.app;
    this.app = null;
    if (!app) return;
    // Offene Verbindungen (Keep-Alive des Browsers) sofort schließen, sonst wartet close() auf sie.
    app.server.closeAllConnections?.();
    await app.close();
  }
}
