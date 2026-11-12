import type { Readable } from 'node:stream';
import type { Speicherplatz } from './speicherplatz';
import type { ProxyVertrauen } from './proxy';
import type { Einrichtung } from './einrichtung';
import type { AnbindungVerwaltung } from './anbindung';
import type { OrdnerPruefung } from './ordner';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyRequest } from 'fastify';
import { Hochgeladen, nimmAuf } from './hochladen';
import type { Dienst } from './dienst';
import { Fachfehler } from './fehler';
import type { Konten } from './konten';
import { serverTiming, zeitaufteilung, type Messung } from './messung';
import type { SystemQuelle } from './system';
import type { Designs } from './designs';
import type { ApiSchluesselDienst } from './apischluessel';
import { wer } from './api-v1';
import { oberflaecheSenden } from './oberflaeche';
import { einbettenAus, sicherheitsKoepfe, type Einbetten } from './koepfe';
import { kontext, protokoll, type Kontext } from './protokoll';
import type { Betrieb } from './betrieb';
import type { Tresor } from './tresor';
import type { Texterkennung } from './texterkennung';
import type { Vorschaubilder } from './vorschau';
import type { Aufgabenmail } from './aufgabenmail';
import type { Fehlermeldungen } from './fehlermeldungen';
import type { Verwaltung } from './verwaltung';
import { WartungFehler, type Wartung } from './wartung';
import { vomUeberlastschutzAbgewiesen } from './ueberlast';
import type { Notfallzugang } from './notfall';
import type { Sicherung } from './sicherung';
import type { Wiederherstellung } from './wiederherstellung';
import { MAX_DATEIGROESSE } from '../../shared/src/model';
import { WEBDAV_METHODEN, WEBDAV_ZUSATZMETHODEN, type Webdav } from './webdav';
import { anfrageStufe, dateiKoepfe, leseCookie, modulAus, pruefeZugang, routen, SITZUNG_COOKIE, sitzungsCookie, type Anfrage, type Route } from './routen';
import { mitSprache, setzeAnfrageSprache, t, tDe } from './sprache';
import { erlaubteSprachen } from '../../shared/src/beschriftung';
import { spracheAusKopf } from '../../shared/src/sprachwahl';
import { JSON_KOERPER_MAX, MB } from './grenzen';

/** zeit (#477): Zeitpunkte der Anfrage (performance.now()) für Server-Timing. */
type MitKontext = FastifyRequest & { dms?: Kontext; lesend?: boolean; zeit?: { eingang: number; start?: number; ende?: number; senden?: number }; nachher?: () => void };

/**
 * Arbeit nach der Antwort (#741, `Antwort.danach`): beginnt, wenn die Antwort gesendet ist (onResponse, spätestens nach
 * `NACHLAUF_SPAETESTENS_MS`). Niemand wartet darauf – eine Anfrage derselben Person im selben Augenblick sieht
 * „zuletzt geöffnet“ und „gesehen“ unter Umständen erst beim nächsten Mal. (Ein Warten je Person reihte im Lasttest –
 * drei Sitzungen, 100 Anfragen gleichzeitig – die Anfragen derselben Sitzung hintereinander.)
 */
const NACHLAUF_SPAETESTENS_MS = 5_000;
export class Nachlauf {
  private laufend = new Set<Promise<void>>();
  /** Arbeit anmelden; das Ergebnis startet sie (genau einmal). */
  melde(k: Kontext, arbeit: Array<() => Promise<unknown>>): () => void {
    let los!: () => void;
    const gesendet = new Promise<void>((r) => { los = r; });
    const zeitgeber = setTimeout(() => los(), NACHLAUF_SPAETESTENS_MS);
    zeitgeber.unref?.();
    const p: Promise<void> = gesendet.then(() => kontext.run(k, async () => {
      clearTimeout(zeitgeber);
      for (const f of arbeit) {
        try { await f(); } catch (e) { protokoll.schreibe('warn', 'http', tDe('meldungen.http.arbeit-nach-der-antwort'), { fehler: (e as Error).message }); }
      }
    }));
    this.laufend.add(p);
    void p.finally(() => this.laufend.delete(p));
    return los;
  }
  /** Für Tests: auf alles warten, was gerade läuft. */
  async alle(): Promise<void> { await Promise.all([...this.laufend]); }
}

interface Optionen {
  /** Paketverwaltung mit Paket-Läufer (#338); ohne: Paketverwaltung ohne Läufer. */
  pakete?: import('./pakete').Paketverwaltung;
  paketlaeufer?: import('./laeufer/fern').LaeuferSicht;
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
  /** Region (#726): Land, Bundesland, Zeitzone. */
  region?: import('./region').RegionDienst;
  /** Sprachen der Ablage (#729). */
  sprachen?: import('./sprachwahl').SprachDienst;
  fehlermeldungen?: Fehlermeldungen;
  /** Technische Aufgaben des Admin-Kontos (#719): Hinweis ohne Einzelheiten beim Alltags-Benutzer. */
  verwaltung?: Verwaltung;
  /** Wartungsmodus (#102). */
  wartung?: Wartung;
  /** Notfallzugang (#108). */
  notfall?: Notfallzugang;
  /** Notfallzugang mit dem Notfallcode vom Notfallblatt (#815). */
  notfallcode?: import('./notfallcode').Notfallcode;
  /** Sicherungen (#103–#105). */
  sicherung?: Sicherung;
  /** Export-Ordner (#797). */
  exporte?: import('./exportordner').ExportOrt;
  /** Wiederherstellen und Probe (#107, #109). */
  wiederherstellung?: Wiederherstellung;
  /** Speicherplatz-Überwachung (#116) und feste Ordner (#115). */
  speicherplatz?: Speicherplatz;
  /** Systemzustand → Auslastung (#409). */
  systemlast?: import('./systemlast').Systemlast;
  /** Mehrere Prozesse (#745). */
  verbund?: import('./prozesse').Verbund;
  prozessEinstellung?: import('./prozesse').ProzessEinstellung;
  eingangsordner?: import('./eingangsordner').Eingangsordner;
  postfaecher?: import('./postfach').Postfaecher;
  postfachOAuth?: import('./postfach-oauth').PostfachOAuth;
  ordner?: OrdnerPruefung;
  /** Einrichtungsassistent und Datenbank-Anbindung (#119). */
  einrichtung?: Einrichtung;
  anbindung?: AnbindungVerwaltung;
  mandantHinweis?: string | null;
  /** DMS_LASTTEST gesetzt, aber der Lasttest läuft nicht (echte Ablage, #612): Grund für die Übersicht. */
  lasttestAbbruch?: () => string | null;
  abruf?: (url: string) => Promise<unknown>;
  /** Erlaubte Ursprünge zum Einbetten (#239, DMS_EINBETTEN). */
  einbetten?: Einbetten;
  /** WebDAV-Laufwerk (#346) unter /webdav. */
  webdav?: Webdav;
  /** Automatisierungen (#674). */
  automatisierungen?: import('./automatisierung').Automatisierungen;
  /** Überlastschutz (#544): höchstens so viele Anfragen gleichzeitig, sonst 503. */
  ueberlast?: import('./ueberlast').Ueberlastschutz;
  /** Warten auf eine freie Verbindung zur Datenbank (#544). */
  verbindungen?: import('./db').Verbindungswarten;
  /** Wartezeit auf Verbindungen für den Lasttest (#874). */
  poolmessung?: import('./poolmessung').Poolmessung;
  /** Sitzungen der Datenbank mit Sperren (#874). */
  sitzungen?: () => Promise<import('./poolmessung').Sitzungsstand | null>;
  /** Teuerste Abfragen für den Lasttest (#894). */
  abfragen?: import('./routen').Abfragestatistik;
  /** CPU und Speicher je Prozessgruppe für den Lasttest (#895), gemessen im Leiter. */
  prozessgruppen?: () => Promise<import('./prozessgruppen').GruppenStand | null>;
  /** Erweiterungen der Suche (#562). */
  erweiterungen?: () => Promise<import('./erweiterungen').ErweiterungStand[]>;
  /** Arbeit nach der Antwort (#741); Tests geben einen eigenen, um darauf zu warten (`alle`). */
  nachlauf?: Nachlauf;
}

export async function baueApp(dienst: Dienst, konten: Konten, opt: Optionen = {}) {
  const app = Fastify({
    loggerInstance: protokoll.fuerFastify() as unknown as FastifyBaseLogger,
    // Eine Zeile je Anfrage schreiben wir selbst (onResponse), mit Benutzer und Modul.
    disableRequestLogging: true,
    genReqId: () => randomBytes(4).toString('hex'),
    bodyLimit: JSON_KOERPER_MAX,
    trustProxy: opt.proxy ?? false,
  });

  // Überlastschutz (#544): vor allem anderen – eine abgewiesene Anfrage kostet so fast nichts.
  opt.ueberlast?.haengeEin(app);

  app.setErrorHandler((fehler: unknown, req, reply) => {
    if (fehler instanceof WartungFehler) reply.header('retry-after', String(fehler.retryAfter));
    // 503 mit Wartezeit (#542, #544): z. B. volle Warteschlange der Arbeiter.
    const nochmal = fehler instanceof Fachfehler && fehler.status === 503 ? (fehler.details as { retryAfter?: unknown } | undefined)?.retryAfter : undefined;
    if (typeof nochmal === 'number') reply.header('retry-after', String(nochmal));
    if (fehler instanceof Fachfehler) return reply.code(fehler.status).send({ fehler: fehler.message, details: fehler.details });
    const err = fehler as Error & { statusCode?: number };
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ fehler: err.message });
    const k = (req as MitKontext).dms;
    const schreibe = () => protokoll.schreibe('error', modulAus(req.url), tDe('meldungen.http.interner-fehler-bei', { method: req.method, split: req.url.split('?')[0] }), { fehler: err.stack ?? String(err) });
    if (k) kontext.run(k, schreibe); else schreibe();
    return reply.code(500).send({ fehler: t('meldungen.http.interner-fehler-anfrage-details', { id: req.id }) });
  });

  // Zeitmessung (#477): Eingang der Anfrage – das Warten bis zum Handler steht in Server-Timing als „vor“.
  app.addHook('onRequest', async (req) => { (req as MitKontext).zeit = { eingang: performance.now() }; });
  // Server-Timing erst hier: Die Antwort ist jetzt in Text umgewandelt (JSON), das gehört mit zur Messung.
  app.addHook('onSend', async (req, reply, nutzlast) => {
    const r = req as MitKontext;
    if (r.dms && r.zeit?.start !== undefined && r.zeit.ende !== undefined) {
      const t = zeitaufteilung({ eingang: r.zeit.eingang, start: r.zeit.start, ende: r.zeit.ende, senden: r.zeit.senden, jetzt: performance.now(), db: r.dms.db, rechte: r.dms.rechte });
      reply.header('server-timing', serverTiming(t, r.dms.zwischenspeicher, r.dms.extern));
      const k = r.dms;
      kontext.run(k, () => opt.messung?.erfasseAnfrage(k, t));
    }
    return nutzlast;
  });

  // Arbeit nach der Antwort (#741).
  const nachlauf = opt.nachlauf ?? new Nachlauf();
  app.addHook('onResponse', async (req) => { (req as MitKontext).nachher?.(); });

  // Eine Zeile je Anfrage: Methode, Pfad, Status, Dauer, Benutzer.
  app.addHook('onResponse', async (req, reply) => {
    const url = req.url.split('?')[0];
    const status = reply.statusCode;
    const api = url.startsWith('/api/');
    // Vom Überlastschutz abgewiesen (#920): gewollt – die Zusammenfassung je Minute schreibt der Überlastschutz.
    const stufe = vomUeberlastschutzAbgewiesen(req) ? 'debug' : anfrageStufe({ methode: req.method, url, status, lesend: (req as MitKontext).lesend });
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

  // Datei-Uploads kommen als rohe Bytes (application/octet-stream) – nur an Routen mit `roh` (#901).
  // Dateien als Körper nur, wo die Route eine eigene Grenze nennt (#901): Sonst gälte still die Grenze für JSON (2 MB).
  const ohneDatei = { preParsing: async (req: FastifyRequest) => { if (String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() === 'application/octet-stream') throw new Fachfehler(415, t('meldungen.http.keine-datei-erwartet')); } };
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, fertig) => fertig(null, body));

  const anfrageAus = (req: FastifyRequest): Anfrage => ({
    body: req.body,
    params: req.params as Record<string, string>,
    query: req.query as Record<string, string | undefined>,
    sitzung: leseCookie(req.headers.cookie, SITZUNG_COOKIE),
    cookieKopf: req.headers.cookie,
    ip: req.ip,
    peer: req.socket.remoteAddress,
    geraet: String(req.headers['user-agent'] ?? ''),
    einrichtungscode: typeof req.headers['x-einrichtungscode'] === 'string' ? req.headers['x-einrichtungscode'] : undefined,
    kopf: (n) => { const v = req.headers[n]; return Array.isArray(v) ? v.join(', ') : v; },
  });
  const definiere = (ziel: FastifyInstance, r: Route) => {
    ziel.route({
      method: r.methode,
      url: r.pfad,
      ...(r.roh ? { bodyLimit: r.roh } : ohneDatei),
      ...(r.ohneHead ? { exposeHeadRoute: false } : {}),
      // Große Uploads (#683): Anmeldung und Rolle prüfen, **bevor** der Körper (bis zu 256 MB) gelesen wird –
      // sonst hält jede Anfrage ohne Anmeldung den ganzen Körper im Speicher, bis die 401 kommt.
      ...(r.roh && r.zugang !== 'offen' ? { onRequest: async (req: FastifyRequest) => { await pruefeZugang(r, anfrageAus(req), (n) => req.headers[n] as string | undefined, konten, opt.apiSchluessel, opt.konsole); } } : {}),
      handler: async (req, reply) => {
        const a: Anfrage = anfrageAus(req);
        const start = performance.now();
        const zeit = ((req as MitKontext).zeit ??= { eingang: start });
        zeit.start = start;
        if (r.lesend) (req as MitKontext).lesend = true;
        const k: Kontext = { anfrage: req.id, pfad: `${req.method} ${req.url.split('?')[0]}`, muster: `${req.method} ${r.pfad}`, db: { anzahl: 0, ms: 0 }, ursprung: `${req.protocol}://${req.host}`, nachAntwort: [] };
        (req as MitKontext).dms = k;
        // Sprache (#729): erst die, die die Oberfläche mitschickt, dann die der angemeldeten Person.
        const kopfSprache = spracheAusKopf(a.kopf?.('x-sprache'), erlaubteSprachen());
        // Was der Dienst nach der Antwort erledigt (#928), läuft auch nach einem Fehler – die Änderung kann schon stehen.
        // Danach ist die Liste zu: Was nach dem Handler noch in dieser Anfrage anfällt (Strom, Nachlauf, angestoßene
        // Arbeit), läuft gleich.
        const nachAntwort = () => { const l = k.nachAntwort ?? []; k.nachAntwort = undefined; return l; };
        const antwort = await mitSprache(kopfSprache, () => kontext.run(k, async () => {
          await pruefeZugang(r, a, (n) => req.headers[n] as string | undefined, konten, opt.apiSchluessel, opt.konsole);
          if (a.benutzer?.sprache && erlaubteSprachen().includes(a.benutzer.sprache)) setzeAnfrageSprache(a.benutzer.sprache);
          // Eigene Änderungen zeigen die Zahlen sofort (#742).
          k.benutzerId = a.benutzer?.id;
          // Protokoll (#819): jede Anfrage im Verwaltungsmodus mit Person und „im Verwaltungsmodus“.
          k.benutzer = a.konsole ? `${a.benutzer?.email ?? tDe('meldungen.http.ohne-verwaltungsrecht')} (Konsole)` : `${wer(a.benutzer, a.apiSchluessel)}${a.verwaltungsmodus ? tDe('meldungen.http.im-verwaltungsmodus') : ''}`;
          // Wartungsmodus (#102): API 503, in der aktiven Stufe nur Administratoren.
          // Die Konsole (#244) arbeitet auch im Wartungsmodus – etwa um ihn zu beenden.
          if (!a.konsole) opt.wartung?.pruefeAnfrage(r, a.benutzer);
          return r.handler(a);
        })).catch((e: unknown) => {
          const danach = nachAntwort();
          if (danach.length) (req as MitKontext).nachher = nachlauf.melde(k, danach);
          throw e;
        });
        // Für den Entwicklermodus: Server-Timing setzt der onSend-Hook (#477), dann mit JSON und gesamt.
        zeit.ende = performance.now();
        const danach = [...(antwort.danach ?? []), ...nachAntwort()];
        if (danach.length) (req as MitKontext).nachher = nachlauf.melde(k, danach);
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
          return reply.code(antwort.status ?? 200).send(antwort.datei.inhalt); // 206: Teil einer Datei (#975)
        }
        // Stück für Stück (#444): ohne Länge, nicht zwischenspeichern (auch nicht in nginx: X-Accel-Buffering).
        if (antwort.strom) {
          reply.header('content-type', 'application/x-ndjson; charset=utf-8').header('cache-control', 'no-store').header('x-accel-buffering', 'no').header('x-content-type-options', 'nosniff');
          zeit.senden = performance.now();
          return reply.code(200).send(antwort.strom);
        }
        reply.header('cache-control', 'no-store');
        for (const [n, v] of Object.entries(antwort.koepfe ?? {})) reply.header(n, v);
        reply.code(antwort.status ?? 200);
        zeit.senden = performance.now();
        return antwort.status === 204 || antwort.status === 304 || antwort.body === undefined ? reply.send() : reply.send(antwort.body);
      },
    });
  };
  const alle = routen(dienst, konten, opt);
  for (const r of alle) if (!r.strom) definiere(app, r);
  // Hochladen als Strom (#746): eigener Bereich mit eigenem Parser für application/octet-stream – der Körper geht in
  // eine temporäre Datei (Prüfsumme beim Lesen), nicht in den Arbeitsspeicher. Anmeldung und Rolle prüft weiterhin
  // onRequest, bevor ein Byte gelesen wird (#683). Nach der Antwort (oder einem Abbruch) ist die Datei wieder weg.
  await app.register(async (bereich) => {
    bereich.removeContentTypeParser('application/octet-stream');
    bereich.addContentTypeParser('application/octet-stream', (req, nutzlast, fertig) => {
      const laenge = req.headers['content-length'] === undefined ? undefined : Number(req.headers['content-length']);
      nimmAuf(nutzlast, req.routeOptions.bodyLimit ?? MAX_DATEIGROESSE, laenge).then((h) => fertig(null, h), (e) => fertig(e as Error, undefined));
    });
    const aufraeumen = async (req: FastifyRequest) => { if (req.body instanceof Hochgeladen) await req.body.entferne().catch(() => {}); };
    bereich.addHook('onResponse', aufraeumen);
    bereich.addHook('onRequestAbort', aufraeumen);
    for (const r of alle) if (r.strom) definiere(bereich, r);
  });

  // WebDAV-Laufwerk (#346): eigene Methoden (PROPFIND, LOCK …) und rohe Körper beliebigen Typs.
  // Eigener Plugin-Bereich, damit der Parser für „alles“ nur hier gilt.
  if (opt.webdav) {
    const wd = opt.webdav;
    const bekannt = new Set<string>((app.supportedMethods as string[] | undefined) ?? []);
    for (const [m, koerper] of WEBDAV_ZUSATZMETHODEN) if (!bekannt.has(m)) app.addHttpMethod(m, { hasBody: koerper });
    await app.register(async (bereich) => {
      bereich.removeAllContentTypeParsers();
      bereich.addContentTypeParser('*', (_req, nutzlast, fertig) => fertig(null, nutzlast));
      const handler = async (req: FastifyRequest, reply: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- Antwort im WebDAV-Bereich mit eigenen HTTP-Methoden, die Typen von Fastify passen dort nicht
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
      for (const url of ['/webdav', '/webdav/*']) bereich.route({ method: [...WEBDAV_METHODEN], url, exposeHeadRoute: false, bodyLimit: MAX_DATEIGROESSE + MB, handler });
      // Windows fragt beim Verbinden manchmal erst OPTIONS auf „/“: dort dieselben DAV-Köpfe (ausgeschaltet 404).
      bereich.route({ method: 'OPTIONS', url: '/', handler: async (req: FastifyRequest, reply: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- Antwort im WebDAV-Bereich mit eigenen HTTP-Methoden, die Typen von Fastify passen dort nicht
        const r = await wd.anfrage({ methode: 'OPTIONS', url: '/webdav/', ip: req.ip, kopf: () => undefined, koerper: null });
        reply.code(r.status);
        for (const [n, v] of Object.entries(r.koepfe)) reply.header(n, v);
        return r.body === undefined ? reply.send() : reply.send(r.body);
      } });
    });
  }

  if (opt.webDir && existsSync(opt.webDir)) {
    await app.register(fastifyStatic, { root: opt.webDir, wildcard: false });
    // Alle Nicht-API-Pfade liefern die Oberfläche aus (Routing im Browser) – fehlende Dateien nicht (#932).
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ fehler: t('meldungen.http.diese-schnittstelle-gibt-es') });
      return oberflaecheSenden(req.url, reply, opt.webDir);
    });
  }

  return app;
}
