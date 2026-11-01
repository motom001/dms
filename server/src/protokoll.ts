import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Protokoll des DMS.
 *
 * - Jede Meldung gehört zu einem Modul (system, http, konto, ablage, werkbank, dokumente, datenbank, mail).
 * - Ausgabe als lesbare Zeile auf stdout – das sind die Container-Logs.
 * - Zusätzlich ein Ringpuffer der letzten 24 Stunden (höchstens 10.000 Einträge)
 *   für die Ansicht in der Werkbank. Er lebt im Arbeitsspeicher und beginnt nach
 *   einem Neustart leer; dauerhaft bleiben die Container-Logs.
 * - Der Debug-Modus lässt sich im laufenden Betrieb einschalten und schaltet sich
 *   nach einer Stunde selbst wieder ab.
 * - Wer die Anfrage gestellt hat, kommt aus dem Anfragekontext (AsyncLocalStorage),
 *   ohne dass jede Funktion den Benutzer durchreichen muss.
 */

export const STUFEN = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type Stufe = (typeof STUFEN)[number];
const RANG: Record<Stufe, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
export const MODULE = ['system', 'http', 'konto', 'ablage', 'werkbank', 'dokumente', 'texterkennung', 'datenbank', 'mail', 'sicherung'] as const;

export const AUFBEWAHRUNG_MS = 24 * 60 * 60 * 1000;
export const MAX_EINTRAEGE = 10_000;
export const DEBUG_DAUER_MS = 60 * 60 * 1000;

export interface Eintrag {
  nr: number;
  zeit: string;
  stufe: Stufe;
  modul: string;
  text: string;
  benutzer?: string;
  anfrage?: string;
  daten?: Record<string, unknown>;
}

/** Was zur laufenden Anfrage gehört (Benutzer, Anfrage-Id, Messwerte der Datenbank). */
export interface Kontext {
  anfrage: string;
  /** Methode und Pfad, z. B. „GET /api/mappen“. */
  pfad?: string;
  benutzer?: string;
  db: { anzahl: number; ms: number };
  /**
   * Rechte-Auswertung (#477): Wandzeit, in der mindestens eine Auswertung lief (überlappende zählen
   * einmal), und die Datenbankzeit darin (die zählt schon bei `db`).
   */
  rechte?: { ms: number; dbMs: number; offen: number; seit: number };
  /** Zahlen der Ansichten (#512): aus dem Zwischenspeicher („treffer“) oder neu gezählt, mit Dauer. */
  zwischenspeicher?: { art: 'treffer' | 'neu'; ms: number };
  /** Adresse, unter der die Anfrage kam, z. B. https://dms.example.org (für Links, solange keine Adresse gepflegt ist). */
  ursprung?: string;
}
export const kontext = new AsyncLocalStorage<Kontext>();

export interface ProtokollFilter { seit?: number; stufe?: Stufe; modul?: string; benutzer?: string; anfrage?: string; suche?: string; max?: number }

export class Protokoll {
  private puffer: Eintrag[] = [];
  private nr = 0;
  private debugBis = 0;
  private abschalten?: ReturnType<typeof setTimeout>;

  constructor(
    private grund: Stufe = 'info',
    /** Ausgabe einer fertigen Zeile; in Tests abschaltbar. */
    private ausgabe: (zeile: string) => void = (z) => process.stdout.write(z + '\n'),
  ) {}

  get stufe(): Stufe { return this.debugAn ? 'debug' : this.grund; }
  get debugAn() { return this.debugBis > Date.now(); }
  get debugStand() { return { an: this.debugAn, bis: this.debugAn ? new Date(this.debugBis).toISOString() : null, grundstufe: this.grund }; }
  setzeGrundstufe(s: string | undefined) { if (s && (STUFEN as readonly string[]).includes(s)) this.grund = s as Stufe; }
  aktiv(s: Stufe) { return RANG[s] >= RANG[this.stufe]; }

  /** Debug-Modus ein (für eine Stunde) oder aus. */
  setzeDebug(an: boolean) {
    clearTimeout(this.abschalten);
    this.debugBis = an ? Date.now() + DEBUG_DAUER_MS : 0;
    if (an) {
      this.abschalten = setTimeout(() => this.schreibe('info', 'system', 'Debug-Modus nach einer Stunde automatisch ausgeschaltet'), DEBUG_DAUER_MS);
      this.abschalten.unref?.();
    }
    return this.debugStand;
  }

  schreibe(stufe: Stufe, modul: string, text: string, daten?: Record<string, unknown>) {
    if (!this.aktiv(stufe)) return;
    const k = kontext.getStore();
    const e: Eintrag = { nr: ++this.nr, zeit: new Date().toISOString(), stufe, modul, text };
    if (k?.benutzer) e.benutzer = k.benutzer;
    if (k?.anfrage) e.anfrage = k.anfrage;
    if (daten && Object.keys(daten).length) e.daten = daten;
    this.puffer.push(e);
    this.aufraeumen();
    try { this.ausgabe(zeile(e)); } catch { /* Ausgabe darf nie die Anwendung stören */ }
  }

  private aufraeumen() {
    const grenze = Date.now() - AUFBEWAHRUNG_MS;
    let weg = Math.max(0, this.puffer.length - MAX_EINTRAEGE);
    while (weg < this.puffer.length && Date.parse(this.puffer[weg].zeit) < grenze) weg++;
    if (weg) this.puffer.splice(0, weg);
  }

  /** Einträge nach Filter, neueste zuerst. */
  eintraege(f: ProtokollFilter = {}): Eintrag[] {
    this.aufraeumen();
    const q = f.suche?.toLowerCase();
    const r: Eintrag[] = [];
    for (let i = this.puffer.length - 1; i >= 0 && r.length < (f.max ?? 500); i--) {
      const e = this.puffer[i];
      if (f.seit && e.nr <= f.seit) break;
      if (f.stufe && RANG[e.stufe] < RANG[f.stufe]) continue;
      if (f.modul && e.modul !== f.modul) continue;
      if (f.benutzer && e.benutzer !== f.benutzer) continue;
      if (f.anfrage && e.anfrage !== f.anfrage) continue;
      if (q && !`${e.text} ${e.daten ? JSON.stringify(e.daten) : ''}`.toLowerCase().includes(q)) continue;
      r.push(e);
    }
    return r;
  }

  get anzahl() { return this.puffer.length; }
  get letzteNr() { return this.nr; }

  /** Logger für ein Modul. */
  modul(name: string): Log {
    return {
      trace: (t, d) => this.schreibe('trace', name, t, d),
      debug: (t, d) => this.schreibe('debug', name, t, d),
      info: (t, d) => this.schreibe('info', name, t, d),
      warn: (t, d) => this.schreibe('warn', name, t, d),
      error: (t, d) => this.schreibe('error', name, t, d),
    };
  }

  /**
   * Pino-kompatibler Logger für Fastify (loggerInstance). Fastify-eigene Meldungen
   * landen im Modul „http“ bzw. „system“.
   */
  fuerFastify(bindungen: Record<string, unknown> = {}): FastifyLog {
    const self = this;
    const melde = (stufe: Stufe) => (a?: unknown, b?: unknown, ...rest: unknown[]) => {
      if (!self.aktiv(stufe)) return;
      let text = '';
      let daten: Record<string, unknown> = {};
      if (typeof a === 'string') text = [a, b, ...rest].filter((x) => x !== undefined).map(String).join(' ');
      else {
        if (a instanceof Error) daten = { fehler: fehlerText(a) };
        else if (a && typeof a === 'object') daten = serialisiere(a as Record<string, unknown>);
        text = typeof b === 'string' ? b : a instanceof Error ? a.message : '';
      }
      const modul = (daten.modul as string) ?? (bindungen.reqId ? 'http' : 'system');
      delete daten.modul;
      self.schreibe(stufe, modul, text || '(ohne Text)', daten);
    };
    const log: FastifyLog = {
      level: this.stufe,
      trace: melde('trace'), debug: melde('debug'), info: melde('info'), warn: melde('warn'), error: melde('error'), fatal: melde('fatal'),
      silent: () => {},
      child: (b: Record<string, unknown>) => self.fuerFastify({ ...bindungen, ...b }),
      isLevelEnabled: (s: string) => self.aktiv(s as Stufe),
    };
    return log;
  }
}

export interface Log {
  trace(text: string, daten?: Record<string, unknown>): void;
  debug(text: string, daten?: Record<string, unknown>): void;
  info(text: string, daten?: Record<string, unknown>): void;
  warn(text: string, daten?: Record<string, unknown>): void;
  error(text: string, daten?: Record<string, unknown>): void;
}

type Melde = (a?: unknown, b?: unknown, ...rest: unknown[]) => void;
export interface FastifyLog {
  level: string;
  trace: Melde; debug: Melde; info: Melde; warn: Melde; error: Melde; fatal: Melde; silent: () => void;
  child(b: Record<string, unknown>): FastifyLog;
  isLevelEnabled(s: string): boolean;
}

export function fehlerText(e: unknown): string {
  if (e instanceof Error) return e.stack ?? `${e.name}: ${e.message}`;
  return String(e);
}

/** Fastify übergibt Anfrage, Antwort und Fehler als Objekte; nur das Wesentliche übernehmen. */
function serialisiere(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'req' && v && typeof v === 'object') { const q = v as { method?: string; url?: string }; r.anfrage = `${q.method} ${q.url}`; }
    else if (k === 'res' && v && typeof v === 'object') r.status = (v as { statusCode?: number }).statusCode;
    else if (k === 'err' || v instanceof Error) r.fehler = fehlerText(v);
    else if (v === undefined || typeof v === 'function') continue;
    else r[k] = v;
  }
  return r;
}

/** Lesbare Zeile für die Container-Logs. */
export function zeile(e: Eintrag): string {
  const teile = [e.zeit, e.stufe.toUpperCase().padEnd(5), `[${e.modul}]`, e.text];
  if (e.benutzer) teile.push(`benutzer=${e.benutzer}`);
  if (e.daten) {
    for (const [k, v] of Object.entries(e.daten)) {
      if (k === 'fehler') continue;
      teile.push(`${k}=${typeof v === 'string' ? (/\s/.test(v) ? JSON.stringify(v) : v) : JSON.stringify(v)}`);
    }
  }
  const text = teile.join(' ');
  return e.daten?.fehler ? `${text}\n${String(e.daten.fehler)}` : text;
}

/** Das Protokoll der laufenden Anwendung. Stufe aus LOG_LEVEL (Standard: info). */
export const protokoll = new Protokoll(
  (STUFEN as readonly string[]).includes(process.env.LOG_LEVEL ?? '') ? (process.env.LOG_LEVEL as Stufe) : 'info',
  // Unter dem Test-Runner von Node nichts ausgeben (NODE_TEST_CONTEXT setzt node --test).
  process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT ? () => {} : undefined,
);
