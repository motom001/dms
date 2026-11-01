import { monitorEventLoopDelay } from 'node:perf_hooks';
import type postgres from 'postgres';
import { kontext, protokoll, type Kontext } from './protokoll';

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

export class Messung {
  einstellungen: MessEinstellungen = { ...STANDARD };
  /** Verzögerung der Ereignisschleife (#477); läuft erst nach auslastung.start() (index.ts). */
  readonly auslastung = new Auslastung();
  private zuletztAufgeraeumt = 0;

  constructor(readonly speicher: MessSpeicher) {}

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
   * Aufteilung als Langläufer gemerkt (Zugriff „Anfrage: …“).
   */
  erfasseAnfrage(k: Pick<Kontext, 'pfad' | 'benutzer'>, t: Zeitaufteilung) {
    if (t.gesamt < this.einstellungen.schwelleMs) return;
    const zugriff = `Anfrage: ${aufteilungText(t)}`;
    log.warn(`Lange Anfrage: ${k.pfad ?? ''} dauerte ${Math.round(t.gesamt)} ms`, { anfrage: k.pfad, ms: Math.round(t.gesamt), vor: Math.round(t.vor), db: Math.round(t.db), rechte: Math.round(t.rechte), json: Math.round(t.json) });
    this.speicher.merke({ zeit: new Date().toISOString(), dauerMs: Math.round(t.gesamt), zugriff, anfrage: k.pfad ?? '', benutzer: k.benutzer ?? '' })
      .catch((e) => log.error('Langläufer nicht gespeichert', { fehler: (e as Error).message }));
  }

  private erfasse(zugriff: string, ms: number) {
    const k = kontext.getStore();
    if (k) { k.db.anzahl++; k.db.ms += ms; if (k.rechte?.offen) k.rechte.dbMs += ms; }
    if (ms >= this.einstellungen.schwelleMs) {
      const l: Langlaeufer = { zeit: new Date().toISOString(), dauerMs: Math.round(ms), zugriff, anfrage: k?.pfad ?? '', benutzer: k?.benutzer ?? '' };
      log.warn(`Langer Datenbankzugriff: ${zugriff} dauerte ${Math.round(ms)} ms`, { zugriff, ms: Math.round(ms), anfrage: l.anfrage || undefined });
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

/** Header Server-Timing: vor, app (Handler), db (Anzahl in desc), rechte, json, gesamt. */
export function serverTiming(t: Zeitaufteilung): string {
  const d = (x: number) => x.toFixed(1);
  return `vor;dur=${d(t.vor)}, app;dur=${d(t.app)}, db;dur=${d(t.db)};desc="${t.dbAnzahl}", rechte;dur=${d(t.rechte)}, json;dur=${d(t.json)}, gesamt;dur=${d(t.gesamt)}`;
}

/** Kurztext für Langläufer und Protokoll: „1.234 ms gesamt · vor 3 · Datenbank 120 (5) · …“. */
export function aufteilungText(t: Zeitaufteilung): string {
  const r = (x: number) => Math.round(x).toLocaleString('de-DE');
  const aufb = Math.max(0, t.app - t.db - t.rechte);
  return `${r(t.gesamt)} ms gesamt · Warten vor dem Handler ${r(t.vor)} · Datenbank ${r(t.db)} (${t.dbAnzahl}) · Rechte ${r(t.rechte)} · Aufbereitung ${r(aufb)} · JSON ${r(t.json)}`;
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

  start(fensterMs = 60_000) {
    if (this.h) return;
    this.h = monitorEventLoopDelay({ resolution: AUFLOESUNG_MS });
    this.h.enable();
    this.seit = Date.now();
    this.zeitgeber = setInterval(() => { this.vorher = this.jetzt(); this.h?.reset(); this.seit = Date.now(); }, fensterMs);
    this.zeitgeber.unref();
  }

  stop() { this.h?.disable(); this.h = null; if (this.zeitgeber) clearInterval(this.zeitgeber); }

  private jetzt(): Schleifenverzoegerung | null {
    if (!this.h || !this.h.count) return null;
    // Werte in Nanosekunden; sie enthalten die Auflösung (20 ms), die ziehen wir ab.
    const ms = (x: number) => Math.max(0, Math.round((x / 1e6 - AUFLOESUNG_MS) * 10) / 10);
    return { median: ms(this.h.percentile(50)), p99: ms(this.h.percentile(99)), max: ms(this.h.max), seitSekunden: Math.round((Date.now() - this.seit) / 1000) };
  }

  /** Aktuelles Fenster, solange es noch kaum Werte hat das vorherige. */
  stand(): { aktuell: Schleifenverzoegerung | null; vorher: Schleifenverzoegerung | null } {
    return { aktuell: this.jetzt(), vorher: this.vorher };
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

export function pgMessSpeicher(sql: postgres.Sql, haushaltId: string): MessSpeicher {
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
      await sql`INSERT INTO langlaeufer (zeit, dauer_ms, zugriff, anfrage, benutzer) VALUES (${l.zeit}, ${l.dauerMs}, ${l.zugriff}, ${l.anfrage.slice(0, 300)}, ${l.benutzer})`;
    },
    async liste(max) {
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
