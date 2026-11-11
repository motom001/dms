import { monitorEventLoopDelay } from 'node:perf_hooks';
import type postgres from 'postgres';
import { SCHLEIFE_GRENZE_MS, SCHLEIFE_MINUTEN } from '../../shared/src/systemlast';
import { kontext, protokoll, type Kontext } from './protokoll';
import { zusammenfassungZusatz } from './protokollsammlung';
import { t } from './sprache';
import { gebietsschema } from '../../shared/src/sprache';
import { externTiming, type ExternAufruf } from '../../shared/src/extern';

/**
 * Messung der Datenbankzugriffe (#11, #12).
 *
 * Jede Methode der Repos (ein „Datenbankzugriff“, kann mehrere SQL-Anweisungen
 * umfassen) wird gezählt und gestoppt. Die Summe je Anfrage geht über den
 * Header Server-Timing an die Oberfläche (Entwicklermodus). Dauert ein Zugriff
 * länger als die eingestellte Schwelle, wird er als Langläufer gespeichert.
 */
export interface MessEinstellungen { schwelleMs: number; tage: number }
export const STANDARD: MessEinstellungen = { schwelleMs: 500, tage: 30 };

export interface Langlaeufer { id?: number; zeit: string; dauerMs: number; zugriff: string; anfrage: string; benutzer: string }
export interface LaufendeAbfrage { pid: number; seitMs: number; zustand: string; abfrage: string; anwendung: string }

export interface MessSpeicher {
  ladeEinstellungen(): Promise<MessEinstellungen>;
  speichereEinstellungen(e: MessEinstellungen): Promise<void>;
  merke(l: Langlaeufer): Promise<void>;
  liste(max: number): Promise<Langlaeufer[]>;
  aufraeumen(tage: number): Promise<number>;
  /** Abfragen, die gerade in der Datenbank laufen (ohne die eigene). */
  laufende(): Promise<LaufendeAbfrage[]>;
}

const log = protokoll.modul('datenbank');

/** Lange Anfragen und Datenbankzugriffe im Protokoll (#920): je Art eine Zeile je Minute statt jede einzeln. */
export const ZUSAMMENFASSUNG_MS = 60_000;

interface Zusammenfassung {
  art: 'anfrage' | 'zugriff';
  /** Routenmuster (lange Anfrage) bzw. Zugriff (langer Datenbankzugriff). */
  name: string;
  n: number; max: number; summe: number;
  /** Erstes Auftreten in diesem Fenster. */
  seit: string;
  /** Kontext der längsten (Aufteilung, Anfrage). */
  daten: Record<string, unknown>;
}

export class Messung {
  einstellungen: MessEinstellungen = { ...STANDARD };
  /** Verzögerung der Ereignisschleife (#477); läuft erst nach auslastung.start() (index.ts). */
  readonly auslastung = new Auslastung();
  private zuletztAufgeraeumt = 0;
  private offen = new Map<string, Zusammenfassung>();
  private zeitgeber: ReturnType<typeof setTimeout> | null = null;

  /** `fensterMs`: wie lange gleiche Meldungen zusammengefasst werden (#920; Tests kürzer). */
  constructor(readonly speicher: MessSpeicher, private readonly fensterMs = ZUSAMMENFASSUNG_MS) {}

  async start() {
    try { this.einstellungen = { ...STANDARD, ...(await this.speicher.ladeEinstellungen()) }; } catch { /* Standardwerte */ }
  }

  async setze(e: Partial<MessEinstellungen>) {
    const schwelleMs = Math.round(Number(e.schwelleMs ?? this.einstellungen.schwelleMs));
    const tage = Math.round(Number(e.tage ?? this.einstellungen.tage));
    if (!(schwelleMs >= 1 && schwelleMs <= 600_000)) throw new RangeError('Die Schwelle muss zwischen 1 ms und 600.000 ms liegen.');
    if (!(tage >= 1 && tage <= 3650)) throw new RangeError('Aufbewahrt wird zwischen 1 und 3650 Tagen.');
    this.einstellungen = { schwelleMs, tage };
    await this.speicher.speichereEinstellungen(this.einstellungen);
    await this.speicher.aufraeumen(tage);
    return this.einstellungen;
  }

  /** Umhüllt ein Repo: jede Methode wird gezählt und gestoppt. */
  umhuelle<T extends object>(repo: T, name: string): T {
    const self = this;
    return new Proxy(repo, {
      get(ziel, prop, empfaenger) {
        const wert = Reflect.get(ziel, prop, empfaenger);
        if (typeof wert !== 'function') return wert;
        return function (this: unknown, ...args: unknown[]) {
          const start = performance.now();
          const ergebnis = wert.apply(ziel, args);
          if (!(ergebnis instanceof Promise)) return ergebnis;
          const fertig = () => self.erfasse(`${name}.${String(prop)}`, performance.now() - start);
          return ergebnis.then((r) => { fertig(); return r; }, (e) => { fertig(); throw e; });
        };
      },
    });
  }

  /**
   * Ganze Anfrage (#477): dauert sie ab Eingang länger als die Schwelle, wird sie mit ihrer
   * Aufteilung als Langläufer gemerkt (Zugriff „Anfrage: …“). Im Protokoll mit `dauerMs` und dem Routenmuster
   * (`muster`): Die Sammlung für den Lasttest zeigt so Dauer und Route ohne Ids (#909). Seit #920 je Routenmuster
   * eine Zeile je Minute (Anzahl, höchste und mittlere Dauer) – unter Last kostete das Schreiben jeder einzelnen
   * Zeile selbst Zeit. Die Langläufer in der Werkbank bleiben einzeln.
   */
  erfasseAnfrage(k: Pick<Kontext, 'pfad' | 'benutzer' | 'muster'>, t: Zeitaufteilung) {
    if (t.gesamt < this.einstellungen.schwelleMs) return;
    const zugriff = `Anfrage: ${aufteilungText(t)}`;
    this.sammle('anfrage', k.muster ?? k.pfad ?? '', t.gesamt, { ...(k.muster ? { muster: k.muster } : {}), vor: Math.round(t.vor), db: Math.round(t.db), rechte: Math.round(t.rechte), json: Math.round(t.json) });
    this.speicher.merke({ zeit: new Date().toISOString(), dauerMs: Math.round(t.gesamt), zugriff, anfrage: k.pfad ?? '', benutzer: k.benutzer ?? '' })
      .catch((e) => log.error('Langläufer nicht gespeichert', { fehler: (e as Error).message }));
  }

  private erfasse(zugriff: string, ms: number) {
    const k = kontext.getStore();
    if (k) { k.db.anzahl++; k.db.ms += ms; if (k.rechte?.offen) k.rechte.dbMs += ms; }
    if (ms >= this.einstellungen.schwelleMs) {
      const l: Langlaeufer = { zeit: new Date().toISOString(), dauerMs: Math.round(ms), zugriff, anfrage: k?.pfad ?? '', benutzer: k?.benutzer ?? '' };
      this.sammle('zugriff', zugriff, ms, { zugriff, ...(k?.muster ? { anfrage: k.muster } : {}) });
      this.speicher.merke(l).catch((e) => log.error('Langläufer nicht gespeichert', { fehler: (e as Error).message }));
      if (Date.now() - this.zuletztAufgeraeumt > 3_600_000) {
        this.zuletztAufgeraeumt = Date.now();
        this.speicher.aufraeumen(this.einstellungen.tage).catch(() => {});
      }
    } else if (ms >= 50) {
      log.debug(`Datenbankzugriff ${zugriff}: ${Math.round(ms)} ms`, { zugriff, ms: Math.round(ms) });
    } else {
      log.trace(`Datenbankzugriff ${zugriff}: ${Math.round(ms)} ms`);
    }
  }

  /** Gleiche lange Anfrage bzw. gleichen langen Zugriff bis zum Ende des Fensters zusammenzählen (#920). */
  private sammle(art: Zusammenfassung['art'], name: string, ms: number, daten: Record<string, unknown>) {
    const k = `${art}\u0000${name}`;
    const x = this.offen.get(k);
    if (x) {
      x.n++; x.summe += ms;
      if (ms > x.max) { x.max = ms; x.daten = daten; }
    } else this.offen.set(k, { art, name, n: 1, max: ms, summe: ms, seit: new Date().toISOString(), daten });
    if (!this.zeitgeber) {
      // Außerhalb der Anfrage: Die Zeile gehört zu keiner einzelnen.
      this.zeitgeber = kontext.exit(() => setTimeout(() => this.leeren(), this.fensterMs));
      this.zeitgeber.unref?.();
    }
  }

  /**
   * Zusammenfassung schreiben (#920): je Art eine Warnung „Lange Anfrage: GET /api/mappen/:id dauerte 1240 ms
   * (längste von 120 in einer Minute, Ø 610 ms)“ – mit `dauerMs` (höchste), `summeMs`, `zusammengefasst` (Anzahl) und
   * `seit` im Kontext; die Sammlung für den Lasttest zählt daraus Anzahl und Dauer wie bei einzelnen Meldungen.
   * Am Ende jedes Fensters, beim Herunterfahren und in Tests.
   */
  leeren() {
    if (this.zeitgeber) { clearTimeout(this.zeitgeber); this.zeitgeber = null; }
    if (!this.offen.size) return;
    const liste = [...this.offen.values()];
    this.offen.clear();
    kontext.exit(() => {
      for (const x of liste) {
        const max = Math.round(x.max), mittel = Math.round(x.summe / x.n);
        const titel = x.art === 'anfrage' ? 'Lange Anfrage' : 'Langer Datenbankzugriff';
        log.warn(`${titel}: ${x.name} dauerte ${max} ms${zusammenfassungZusatz(x.n, mittel)}`, {
          ...(x.art === 'anfrage' ? { anfrage: x.name } : {}), ...x.daten,
          dauerMs: max, ...(x.n > 1 ? { mittelMs: mittel } : {}), summeMs: Math.round(x.summe), zusammengefasst: x.n, seit: x.seit,
        });
      }
    });
  }
}

/* ---------- Zeitaufteilung je Anfrage (#477) ---------- */

/**
 * Misst, wie lange Rechte ausgewertet werden (Zugriff bilden, Lesefilter, Rechte je Mappe).
 * Verschachtelte und gleichzeitige Aufrufe zählen nur einmal; die Datenbankzugriffe darin
 * werden mitgezählt und später abgezogen (sie stehen schon unter „db“). Außerhalb einer Anfrage: nur f().
 */
export function rechteMessen<T>(f: () => T): T {
  const k = kontext.getStore();
  if (!k) return f();
  const r = (k.rechte ??= { ms: 0, dbMs: 0, offen: 0, seit: 0 });
  if (r.offen++ === 0) r.seit = performance.now();
  const ende = () => { if (--r.offen === 0) r.ms += performance.now() - r.seit; };
  let x: T;
  try { x = f(); } catch (e) { ende(); throw e; }
  if (x instanceof Promise) return x.finally(ende) as T;
  ende();
  return x;
}

/** Zeiten einer Anfrage auf dem Server in ms (Header Server-Timing). */
export interface Zeitaufteilung {
  /** Eingang der Anfrage bis Beginn des Handlers (Körper lesen, Warten auf den Server). */
  vor: number;
  /** Handler (wie bisher „app“), enthält db und rechte. */
  app: number;
  db: number;
  dbAnzahl: number;
  /** Rechte-Auswertung ohne die Datenbankzugriffe darin. */
  rechte: number;
  /** Antwort in Text umwandeln (JSON). */
  json: number;
  /** Eingang bis zum Absenden. */
  gesamt: number;
}

/** Zeitpunkte (performance.now()) und Zähler einer Anfrage → Aufteilung. */
export function zeitaufteilung(p: { eingang: number; start: number; ende: number; senden?: number; jetzt: number; db: { anzahl: number; ms: number }; rechte?: { ms: number; dbMs: number } }): Zeitaufteilung {
  const nn = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const app = nn(p.ende - p.start);
  return {
    vor: nn(p.start - p.eingang), app, db: nn(p.db.ms), dbAnzahl: p.db.anzahl,
    rechte: Math.min(app, nn((p.rechte?.ms ?? 0) - (p.rechte?.dbMs ?? 0))),
    json: p.senden === undefined ? 0 : nn(p.jetzt - p.senden),
    gesamt: nn(p.jetzt - p.eingang),
  };
}

/**
 * Header Server-Timing: vor, app (Handler), db (Anzahl in desc), rechte, json, gesamt; dazu zs, wenn
 * die Anfrage die Zahlen der Ansichten brauchte (#512): Dauer und in desc „treffer“ oder „neu“. Dazu `extern` (#565),
 * wenn die Anfrage auf externe Dienste wartete: Summe, Anzahl und je Aufruf Dienst, Paket, erste Antwort, Bytes, Ergebnis.
 */
export function serverTiming(zeitaufteilung2: Zeitaufteilung, zs?: { art: string; ms: number }, extern?: ExternAufruf[]): string {
  const d = (x: number) => x.toFixed(1);
  const x = extern?.length ? externTiming(extern) : '';
  return t('meldungen.messung.vor-dur-app-dur', { d: d(zeitaufteilung2.vor), d2: d(zeitaufteilung2.app), d3: d(zeitaufteilung2.db), dbAnzahl: zeitaufteilung2.dbAnzahl, d4: d(zeitaufteilung2.rechte), d5: d(zeitaufteilung2.json), d6: d(zeitaufteilung2.gesamt) })
    + (zs ? t('meldungen.messung.zs-dur-desc', { d: d(zs.ms), art: zs.art }) : '') + (x ? `, ${x}` : '');
}

/** Kurztext für Langläufer und Protokoll: „1.234 ms gesamt · vor 3 · Datenbank 120 (5) · …“. */
export function aufteilungText(zeitaufteilung2: Zeitaufteilung): string {
  const r = (x: number) => Math.round(x).toLocaleString(gebietsschema());
  const aufb = Math.max(0, zeitaufteilung2.app - zeitaufteilung2.db - zeitaufteilung2.rechte);
  return t('meldungen.messung.ms-gesamt-warten-vor', { r: r(zeitaufteilung2.gesamt), r2: r(zeitaufteilung2.vor), r3: r(zeitaufteilung2.db), dbAnzahl: zeitaufteilung2.dbAnzahl, r4: r(zeitaufteilung2.rechte), r5: r(aufb), r6: r(zeitaufteilung2.json) });
}

/* ---------- Auslastung: Verzögerung der Ereignisschleife (#477) ---------- */

export interface Schleifenverzoegerung { median: number; p99: number; max: number; seitSekunden: number }

/**
 * Wie lange Zeitgeber und Anfragen auf den einen Faden von Node.js warten müssen. Rechnet eine
 * Anfrage lange im Arbeitsspeicher, steigt der Wert – die anderen Anfragen warten so lange.
 * Gemessen über ein gleitendes Fenster (aktuelles und vorheriges Minutenfenster).
 */
const AUFLOESUNG_MS = 20;

export class Auslastung {
  private h: ReturnType<typeof monitorEventLoopDelay> | null = null;
  private vorher: Schleifenverzoegerung | null = null;
  private seit = Date.now();
  private zeitgeber?: NodeJS.Timeout;
  /** p99 der letzten Minutenfenster (#542), neuestes zuletzt; null = Fenster ohne Messwerte. */
  private fenster: Array<number | null> = [];
  private warnungSeit: string | null = null;

  start(fensterMs = 60_000) {
    if (this.h) return;
    this.h = monitorEventLoopDelay({ resolution: AUFLOESUNG_MS });
    this.h.enable();
    this.seit = Date.now();
    this.zeitgeber = setInterval(() => this.fensterZu(), fensterMs);
    this.zeitgeber.unref();
  }

  /** Ende eines Minutenfensters: merken, zurücksetzen, Warnung prüfen. Öffentlich für Tests. */
  fensterZu(w: Schleifenverzoegerung | null = this.jetzt()) {
    this.vorher = w;
    this.h?.reset();
    this.seit = Date.now();
    this.fenster.push(w ? w.p99 : null);
    if (this.fenster.length > SCHLEIFE_MINUTEN) this.fenster.splice(0, this.fenster.length - SCHLEIFE_MINUTEN);
    const hoch = this.fenster.length >= SCHLEIFE_MINUTEN && this.fenster.every((p) => p !== null && p > SCHLEIFE_GRENZE_MS);
    if (hoch && !this.warnungSeit) {
      this.warnungSeit = new Date().toISOString();
      log.warn(`Hohe Wartezeit des Servers: Die Ereignisschleife war seit ${SCHLEIFE_MINUTEN} Minuten bei 99 % der Messungen über ${SCHLEIFE_GRENZE_MS} ms verzögert`, { p99: this.fenster.map((p) => Math.round(p ?? 0)).join(' ') });
    } else if (!hoch && this.warnungSeit) {
      log.info('Wartezeit des Servers wieder normal', { seit: this.warnungSeit });
      this.warnungSeit = null;
    }
  }

  /** Seit wann die Wartezeit dauerhaft hoch ist (#542); null = keine Warnung. */
  warnung(): string | null { return this.warnungSeit; }

  stop() { this.h?.disable(); this.h = null; if (this.zeitgeber) clearInterval(this.zeitgeber); }

  private jetzt(): Schleifenverzoegerung | null {
    if (!this.h || !this.h.count) return null;
    // Werte in Nanosekunden; sie enthalten die Auflösung (20 ms), die ziehen wir ab.
    const ms = (x: number) => Math.max(0, Math.round((x / 1e6 - AUFLOESUNG_MS) * 10) / 10);
    return { median: ms(this.h.percentile(50)), p99: ms(this.h.percentile(99)), max: ms(this.h.max), seitSekunden: Math.round((Date.now() - this.seit) / 1000) };
  }

  /** Aktuelles Fenster, solange es noch kaum Werte hat das vorherige. */
  stand(): { aktuell: Schleifenverzoegerung | null; vorher: Schleifenverzoegerung | null; warnungSeit: string | null; grenzeMs: number; minuten: number } {
    return { aktuell: this.jetzt(), vorher: this.vorher, warnungSeit: this.warnungSeit, grenzeMs: SCHLEIFE_GRENZE_MS, minuten: SCHLEIFE_MINUTEN };
  }
}

/* ---------- Speicher ---------- */

export function speicherMessSpeicher(): MessSpeicher {
  let e = { ...STANDARD };
  let liste: Langlaeufer[] = [];
  let nr = 0;
  return {
    async ladeEinstellungen() { return e; },
    async speichereEinstellungen(x) { e = { ...x }; },
    async merke(l) { liste.unshift({ ...l, id: ++nr }); },
    async liste(max) { return liste.slice(0, max); },
    async aufraeumen(tage) { const vorher = liste.length; liste = liste.filter((l) => Date.parse(l.zeit) > Date.now() - tage * 86_400_000); return vorher - liste.length; },
    async laufende() { return []; },
  };
}

/** Höchstens so viele Langläufer je Schreibvorgang (#615); mehr in einer Sekunde stehen nur im Protokoll. */
const LANGLAEUFER_JE_SCHREIBEN = 2000;

export function pgMessSpeicher(sql: postgres.Sql, haushaltId: string): MessSpeicher {
  // Langläufer gesammelt schreiben (#615): Unter Last dauern viele Zugriffe länger als die Schwelle – je Langläufer
  // ein eigenes INSERT (mit eigenem Commit) bremste die Datenbank gerade dann zusätzlich. Jetzt höchstens einmal je
  // Sekunde alle seither gemerkten in einem INSERT. Die Liste schreibt vorher, was noch offen ist; ein Absturz
  // verliert höchstens die Langläufer der letzten Sekunde (die auch im Protokoll stehen).
  let offen: Langlaeufer[] = [];
  let verworfen = 0;
  let zeitgeber: ReturnType<typeof setTimeout> | null = null;
  let schreiben: Promise<void> = Promise.resolve();
  const schreibeOffene = () => {
    if (zeitgeber) { clearTimeout(zeitgeber); zeitgeber = null; }
    const teil = offen;
    offen = [];
    if (verworfen) { log.warn('Langläufer nicht gespeichert (zu viele in einer Sekunde, stehen nur im Protokoll)', { anzahl: verworfen }); verworfen = 0; }
    if (!teil.length) return schreiben;
    schreiben = schreiben.then(async () => {
      await sql`INSERT INTO langlaeufer ${sql(teil.map((l) => ({ zeit: l.zeit, dauer_ms: l.dauerMs, zugriff: l.zugriff, anfrage: l.anfrage.slice(0, 300), benutzer: l.benutzer })))}`;
    }).catch((e) => log.error('Langläufer nicht gespeichert', { fehler: (e as Error).message, anzahl: teil.length }));
    return schreiben;
  };
  return {
    async ladeEinstellungen() {
      const [r] = await sql`SELECT wert FROM einstellungen WHERE haushalt_id = ${haushaltId} AND schluessel = 'messung'`;
      return { ...STANDARD, ...((r?.wert as Partial<MessEinstellungen>) ?? {}) };
    },
    async speichereEinstellungen(x) {
      await sql`
        INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${haushaltId}, 'messung', ${sql.json(x as unknown as postgres.JSONValue)})
        ON CONFLICT (haushalt_id, schluessel) DO UPDATE SET wert = EXCLUDED.wert`;
    },
    async merke(l) {
      if (offen.length >= LANGLAEUFER_JE_SCHREIBEN) { verworfen++; return; }
      offen.push(l);
      if (!zeitgeber) { zeitgeber = setTimeout(() => { void schreibeOffene(); }, 1000); zeitgeber.unref?.(); }
    },
    async liste(max) {
      await schreibeOffene();
      const r = await sql`SELECT * FROM langlaeufer ORDER BY zeit DESC LIMIT ${max}`;
      return r.map((z) => ({
        id: Number(z.id), zeit: (z.zeit as Date).toISOString(), dauerMs: z.dauer_ms as number,
        zugriff: z.zugriff as string, anfrage: z.anfrage as string, benutzer: z.benutzer as string,
      }));
    },
    async aufraeumen(tage) {
      const r = await sql`DELETE FROM langlaeufer WHERE zeit < now() - make_interval(days => ${tage})`;
      return r.count;
    },
    async laufende() {
      const r = await sql`
        SELECT pid, state, application_name, left(query, 500) AS query,
          (extract(epoch FROM now() - coalesce(query_start, backend_start)) * 1000)::bigint AS ms
        FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND state IS NOT NULL AND state <> 'idle'
        ORDER BY query_start NULLS LAST`;
      return r.map((z) => ({ pid: z.pid as number, seitMs: Number(z.ms), zustand: z.state as string, abfrage: z.query as string, anwendung: z.application_name as string }));
    },
  };
}
