/**
 * Mehrere Prozesse für Anfragen (#745): `DMS_PROZESSE` (Vorgabe 1 = wie bisher ein Prozess; `auto` = Kerne − 1,
 * höchstens 2 (#874), mit PostgreSQL im selben Container ebenfalls höchstens 2, und nur so viele, wie Arbeitsspeicher und Verbindungen
 * hergeben – {@link empfohleneProzesse}, #874).
 *
 * Aufbau mit `node:cluster`:
 * - Der **Hauptprozess** ist schlank (lädt nur diese Datei): Er startet die Prozesse, startet einen abgestürzten neu,
 *   reicht Nachrichten zwischen ihnen weiter und beendet beim Herunterfahren alle. Selbst beantwortet er keine Anfrage;
 *   den Port teilt er den Prozessen zu (Verteilung reihum).
 * - **Prozess 1 ist der Leiter.** Er startet zuerst – mit der Startseite „Ablago startet …“ (#802), den Migrationen
 *   und den einmaligen Arbeiten beim Start – und erledigt alle **Hintergrundarbeit**: Zeitpläne, Texterkennung,
 *   Vorschaubilder, Ereignisse und Automatisierungen, Paket-Läufer (genau einmal, er hält die API-Schlüssel der
 *   Pakete), Eingangsordner, Postfächer, Sicherung und Wiederherstellung. Daneben beantwortet er Anfragen wie alle.
 * - Erst wenn der Leiter bereit ist, starten die **weiteren Prozesse**: ohne Startseite und ohne Migrationen, nur für
 *   Anfragen. Was dabei Hintergrundarbeit anstößt, geht als Meldung oder Aufruf an den Leiter ({@link Verbund}).
 *
 * Zustand zwischen Anfragen steht seit #744 in der Datenbank; Anmeldungen überstehen den Neustart eines Prozesses.
 * Mit einem Prozess (Vorgabe) gibt es keinen Hauptprozess: {@link einzeln} erledigt alles im eigenen Prozess.
 */
import cluster, { type Worker } from 'node:cluster';
import { randomBytes } from 'node:crypto';
import { availableParallelism, totalmem } from 'node:os';
import { Fachfehler } from './fehler';
import { protokoll } from './protokoll';
import { ausnahmeArt, Buendel, Protokollsammlung, rohAus, type Rohmeldung, type Sammelstand } from './protokollsammlung';
import { dateiLeser, liesCgroup, type Leser } from './systemlast';
import { GB, HALDE_MIN_MB, MB, SPEICHER_JE_PROZESS, SPEICHER_RESERVE } from './grenzen';

export const PROZESSE_MAX = 16;
/**
 * Höchstens so viele nimmt `auto` (#874). Vorher 4: Auf dem NAS (#576) wurde mit 4 Prozessen nur der Median schneller –
 * mit PostgreSQL im selben Container wie in einem eigenen sank die Grenze der Stufe groß, der Arbeitsspeicher stieg auf
 * 3,5 GB (mit Speichern 5,8 GB). Bis eine Messung zeigt, dass mehr hilft, bleibt es bei 2.
 */
export const PROZESSE_EMPFOHLEN_MAX = 2;
/**
 * Mit PostgreSQL im selben Container (dms-komplett) nimmt `auto` höchstens so viele (#874): Auf dem NAS (Pentium Gold
 * 8505, #576) wurde mit 4 Prozessen nur der Median schneller, p95 nicht – Ablago und PostgreSQL teilen sich die Kerne.
 * Bis eine Messung zeigt, dass mehr hilft, bleibt es bei 2.
 */
export const PROZESSE_MIT_DATENBANK_MAX = 2;
/**
 * Richtwert Arbeitsspeicher je Prozess (#874) und Reserve für PostgreSQL, Dateizwischenspeicher und System. NAS (#576):
 * ein Prozess bis 1,3 GB, vier Prozesse bis 3,3 GB (mit Speichern 3,7 GB) – rund 1 GB je Prozess ist großzügig gerechnet.
 */
export { SPEICHER_JE_PROZESS };
export { SPEICHER_RESERVE };

export interface ProzessEinstellung {
  anzahl: number;
  quelle: 'vorgabe' | 'umgebung' | 'auto';
  /** Nutzbare Kerne und Arbeitsspeicher (Grenze des Containers, sonst des Rechners) – Grundlage der Empfehlung. */
  kerne: number;
  speicher: number | null;
  /** PostgreSQL im selben Container (dms-komplett)? */
  datenbankImContainer?: boolean;
  /** Was `auto` begrenzt hat (für das Protokoll): Kerne, Speicher, Datenbank im Container, Verbindungen. */
  begrenzt?: 'kerne' | 'speicher' | 'datenbank' | 'verbindungen' | 'hoechstens';
  /** Ungültiger Wert von DMS_PROZESSE (dann gilt 1); den Hinweis schreibt der Leiter ins Protokoll. */
  ungueltig?: string;
}

/**
 * Obergrenze der Halde der weiteren Prozesse in MB (#874, `--max-old-space-size`): Node.js richtet die Halde nach dem
 * Speicher des ganzen Containers aus – jeder Prozess für sich. Mit mehreren Prozessen rechnet so jeder, er hätte den
 * Container allein; unter Last wächst die Halde (vor allem Abfall, den V8 spät einsammelt) in allen zugleich. Darum
 * bekommt jeder weitere Prozess 60 % seines Anteils (Speicher − Reserve, geteilt durch die Prozesse), mindestens 1024 MB,
 * höchstens 1536 MB. Gemessen (2 Kerne, 2 Prozesse, mittel + Speichern): mit 1024 MB je Prozess 650–770 MB statt
 * 990–1060 MB, die Halde höchstens 330 statt 690 MB; im Leerlauf belegt ein Prozess rund 190 MB Halde. Den Leiter
 * begrenzt `haldeLeiter` (#891). Der Hauptprozess (nur Leitung) bleibt ohne Grenze.
 * null: ein Prozess oder schon von Hand gesetzt (`NODE_OPTIONS` bzw. Argumente von Node.js) – dann bleibt es dabei.
 */
export { HALDE_MIN_MB };
export const HALDE_MAX_MB = 1536;
export function haldeJeProzess(e: Pick<ProzessEinstellung, 'anzahl' | 'speicher'>, gesetzt: string[] = [...process.execArgv, process.env.NODE_OPTIONS ?? '']): number | null {
  if (e.anzahl <= 1 || gesetzt.some((a) => a.includes('--max-old-space-size'))) return null;
  if (e.speicher === null) return HALDE_MAX_MB;
  const anteil = (e.speicher - SPEICHER_RESERVE) / e.anzahl / MB;
  return Math.max(HALDE_MIN_MB, Math.min(HALDE_MAX_MB, Math.floor(anteil * 0.6)));
}

/**
 * Obergrenze der Halde des Leiters (Prozess 1) in MB (#891): Er beantwortet Anfragen wie die anderen und erledigt dazu die
 * Arbeit im Hintergrund (Sicherung, Texterkennung, Pakete) – darum 512 MB mehr als die weiteren Prozesse. Ohne Grenze
 * wuchs er auf dem NAS (2 Prozesse, groß + Speichern) auf 2,6 GB (Halde 2,3 GB), Prozess 2 mit Grenze auf 1,3 GB.
 * null wie bei `haldeJeProzess`: ein Prozess oder von Hand gesetzt.
 */
export const HALDE_LEITER_MEHR_MB = 512;
export function haldeLeiter(halde: number | null): number | null {
  return halde === null ? null : halde + HALDE_LEITER_MEHR_MB;
}

/** So viele Prozesse tragen die Verbindungen (`DMS_DB_VERBINDUNGEN` zusammen): Leiter 6, jeder weitere 2 (#874). */
export const prozesseFuerVerbindungen = (gesamt: number) => Math.max(1, 1 + Math.floor((gesamt - 6) / 2));

/**
 * Empfehlung (`auto`, #874): Kerne − 1 (einer bleibt für PostgreSQL und das System), höchstens 2; mit PostgreSQL im
 * selben Container höchstens 2; nur so viele, wie Arbeitsspeicher (Reserve + je Prozess rund 1 GB) und Verbindungen
 * (wenn `DMS_DB_VERBINDUNGEN` gesetzt ist) hergeben.
 */
export function empfohleneProzesse(kerne: number, speicher: number | null, o: { datenbankImContainer?: boolean; verbindungen?: number | null } = {}): { anzahl: number; begrenzt: NonNullable<ProzessEinstellung['begrenzt']> } {
  const grenzen: Array<[number, NonNullable<ProzessEinstellung['begrenzt']>]> = [
    [Math.floor(kerne) - 1, 'kerne'],
    [PROZESSE_EMPFOHLEN_MAX, 'hoechstens'],
    ...(o.datenbankImContainer ? [[PROZESSE_MIT_DATENBANK_MAX, 'datenbank'] as [number, 'datenbank']] : []),
    ...(speicher !== null ? [[Math.floor((speicher - SPEICHER_RESERVE) / SPEICHER_JE_PROZESS), 'speicher'] as [number, 'speicher']] : []),
    ...(o.verbindungen ? [[prozesseFuerVerbindungen(o.verbindungen), 'verbindungen'] as [number, 'verbindungen']] : []),
  ];
  const [n, begrenzt] = grenzen.reduce((a, b) => (b[0] < a[0] ? b : a));
  return { anzahl: Math.max(1, n), begrenzt };
}

export function prozesseAus(env: Record<string, string | undefined>, lies: Leser = dateiLeser): ProzessEinstellung {
  const c = liesCgroup(lies);
  const kerne = Math.max(1, Math.round((c.kerne ?? availableParallelism()) * 100) / 100);
  const speicher = c.grenze ?? totalmem();
  const datenbankImContainer = env.DMS_VARIANTE === 'komplett';
  const roh = env.DMS_PROZESSE?.trim();
  if (!roh) return { anzahl: 1, quelle: 'vorgabe', kerne, speicher, datenbankImContainer };
  if (roh.toLowerCase() === 'auto') {
    const v = Number(env.DMS_DB_VERBINDUNGEN?.trim());
    const verbindungen = Number.isInteger(v) && v >= 2 && v <= 100 ? v : null;
    return { ...empfohleneProzesse(kerne, speicher, { datenbankImContainer, verbindungen }), quelle: 'auto', kerne, speicher, datenbankImContainer };
  }
  const n = Number(roh);
  if (!Number.isInteger(n) || n < 1 || n > PROZESSE_MAX) {
    return { anzahl: 1, quelle: 'vorgabe', kerne, speicher, datenbankImContainer, ungueltig: roh };
  }
  return { anzahl: n, quelle: 'umgebung', kerne, speicher, datenbankImContainer };
}

/** Ein Prozess von Ablago, wie der Hauptprozess ihn kennt. */
export interface ProzessInfo { nr: number; pid: number; leiter: boolean }

/**
 * Abgestürzte und neu gestartete Prozesse seit dem Start (#874), für Lasttest und Systemzustand: Anzahl und die letzten
 * zehn mit Nummer, Code bzw. Signal (z. B. SIGKILL vom Kernel bei zu wenig Arbeitsspeicher, SIGABRT bei voller Halde).
 */
export interface Neustarts { anzahl: number; letzte: Array<{ nr: number; code: number | null; signal: string | null; zeit: string; ausnahme?: string | null }> }
const KEINE_NEUSTARTS: Neustarts = { anzahl: 0, letzte: [] };

/** Bearbeitet einen Aufruf; `teil` schickt Zwischenstände (z. B. Teile einer Antwort) an den Aufrufer. */
export type Bediener = (args: unknown[], teil: (wert: unknown) => void) => unknown;

/**
 * Verbindung zu den anderen Prozessen. Mit einem Prozess ({@link einzeln}) bleibt alles im eigenen.
 * - `rufe`: Aufruf beim Leiter mit Ergebnis (Fehler kommen als Fachfehler mit Status zurück).
 * - `melde`: Meldung ohne Antwort an den Leiter, an alle (auch an sich selbst) oder an alle anderen.
 * - `frageAlle`: denselben Aufruf in jedem Prozess (z. B. Arbeitsspeicher und Wartezeit für den Systemzustand).
 */
export interface Verbund {
  /** Mehr als ein Prozess (mit Hauptprozess)? */
  readonly mehrere: boolean;
  readonly anzahl: number;
  readonly nr: number;
  readonly leiter: boolean;
  /** Erster Start des Leiters: Startseite, Migrationen und Arbeiten beim Start (nach einem Neustart nur ohne Startseite). */
  readonly erster: boolean;
  /** Gemeinsamer Zugangsschlüssel für den Befehl `dms` (#244); null = jeder Prozess erzeugt seinen eigenen. */
  readonly konsole: string | null;
  /** Prozess-Id des Hauptprozesses (null mit einem Prozess). */
  readonly primaer: number | null;
  bediene(name: string, f: Bediener): void;
  rufe<T>(name: string, args?: unknown[], o?: { teil?: (wert: unknown) => void; ms?: number }): Promise<T>;
  melde(name: string, daten?: unknown, an?: 'leiter' | 'alle' | 'andere'): void;
  hoere(name: string, f: (daten: unknown) => void): void;
  frageAlle<T>(name: string, ms?: number): Promise<Array<ProzessInfo & { wert: T | null }>>;
  prozesse(): ProzessInfo[];
  /** Neustarts abgestürzter Prozesse seit dem Start (#874); mit der Art der Ausnahme, wenn der Prozess sie meldete (#895). */
  neustarts(): Neustarts;
  /** Warnungen und Fehler aller Prozesse, zusammengefasst (#895); null, wenn der Hauptprozess nicht antwortet. */
  meldungen(): Promise<Sammelstand | null>;
  /** Vor dem Beenden nach einem unerwarteten Fehler (#895): Art der Ausnahme an den Hauptprozess (für die Neustarts). */
  absturz(e: unknown): void;
  /** Dieser Prozess lauscht am Port. */
  bereit(): void;
  /** Ganz Ablago beenden (z. B. Neustart nach einer Wiederherstellung). false: nur ein Prozess – der Aufrufer beendet sich selbst. */
  beendeAlle(grund: string): boolean;
}

const KANAL = 'dms-prozesse';
/** Wartezeit eines Aufrufs beim Leiter, wenn der Aufrufer keine nennt. */
export const RUF_MS = 10 * 60_000;

/**
 * Fehler über Prozessgrenzen. `schluessel`: Text aus den Sprachdateien (`meldungen.prozesse.*`) – der Hauptprozess lädt
 * keine Sprachdateien, er schickt nur den Schlüssel; übersetzt wird beim Empfänger.
 */
interface Fehlerbild { status?: number; message: string; details?: unknown; schluessel?: string }
type Uebersetzer = (schluessel: string) => string;
const alsFehlerbild = (e: unknown): Fehlerbild => (e instanceof Fachfehler ? { status: e.status, message: e.message, details: e.details } : { message: e instanceof Error ? e.message : String(e) });
const ausFehlerbild = (f: Fehlerbild, t: Uebersetzer) => {
  const text = f.schluessel ? t(f.schluessel) : f.message;
  return f.status ? new Fachfehler(f.status, text, f.details) : new Error(text);
};

/** Gemeinsam für beide Arten: Bediener und Hörer im eigenen Prozess. */
abstract class Grund {
  protected bediener = new Map<string, Bediener>();
  protected hoerer = new Map<string, Array<(d: unknown) => void>>();
  bediene(name: string, f: Bediener) { this.bediener.set(name, f); }
  hoere(name: string, f: (d: unknown) => void) { this.hoerer.set(name, [...(this.hoerer.get(name) ?? []), f]); }
  protected verteile(name: string, daten: unknown) {
    for (const f of this.hoerer.get(name) ?? []) {
      try { f(daten); } catch (e) { protokoll.modul('system').warn('Meldung zwischen Prozessen nicht verarbeitet', { meldung: name, fehler: (e as Error).message }); }
    }
  }
  protected async lokal(name: string, args: unknown[], teil: (w: unknown) => void): Promise<unknown> {
    const f = this.bediener.get(name);
    if (!f) throw new Error(`Unbekannter Aufruf zwischen Prozessen: ${name}`);
    return f(args, teil);
  }
}

/** Sammlung im eigenen Prozess (ein Prozess oder Hauptprozess): einmal angelegt, meldet sich beim Protokoll an. */
let eigeneSammlung: Protokollsammlung | null = null;
function sammlungHier(nr: number): Protokollsammlung {
  if (!eigeneSammlung) {
    const s = new Protokollsammlung();
    eigeneSammlung = s;
    protokoll.beobachte((e) => { const m = rohAus(e); if (m) s.nimm(m, nr); });
  }
  return eigeneSammlung;
}

/** Ein Prozess (Vorgabe): Aufrufe und Meldungen bleiben im eigenen Prozess. */
class Einzeln extends Grund implements Verbund {
  readonly mehrere = false;
  readonly anzahl = 1;
  readonly nr = 1;
  readonly leiter = true;
  readonly erster = true;
  readonly konsole = null;
  readonly primaer = null;
  async rufe<T>(name: string, args: unknown[] = [], o: { teil?: (w: unknown) => void } = {}): Promise<T> { return await this.lokal(name, args, o.teil ?? (() => {})) as T; }
  melde(name: string, daten?: unknown, an: 'leiter' | 'alle' | 'andere' = 'leiter') { if (an !== 'andere') queueMicrotask(() => this.verteile(name, daten)); }
  async frageAlle<T>(name: string): Promise<Array<ProzessInfo & { wert: T | null }>> {
    const wert = this.bediener.has(name) ? await this.lokal(name, [], () => {}).catch(() => null) as T : null;
    return [{ nr: 1, pid: process.pid, leiter: true, wert }];
  }
  prozesse(): ProzessInfo[] { return [{ nr: 1, pid: process.pid, leiter: true }]; }
  neustarts(): Neustarts { return KEINE_NEUSTARTS; }
  constructor() { super(); sammlungHier(1); }
  async meldungen() { return sammlungHier(1).stand(); }
  absturz() {}
  bereit() {}
  beendeAlle() { return false; }
}

/** Ein Prozess für alle Fälle ohne Hauptprozess (Tests, `DMS_PROZESSE=1`). */
export const einzeln = (): Verbund => new Einzeln();

interface Rolle { nr: number; leiter: boolean; erster: boolean; konsole: string; anzahl: number; primaer: number }
type Nachricht = { dms: typeof KANAL; art: string; [k: string]: unknown };

/** Ein Prozess unter dem Hauptprozess (`cluster.isWorker`). */
class Teil extends Grund implements Verbund {
  readonly mehrere = true;
  readonly anzahl: number;
  readonly nr: number;
  readonly leiter: boolean;
  readonly erster: boolean;
  readonly konsole: string;
  readonly primaer: number;
  private liste: ProzessInfo[] = [];
  private abstuerze: Neustarts = KEINE_NEUSTARTS;
  private offen = new Map<number, { ok: (w: unknown) => void; nein: (e: Error) => void; teil?: (w: unknown) => void; uhr: NodeJS.Timeout }>();
  private naechste = 1;

  constructor(r: Rolle, private t: Uebersetzer) {
    super();
    this.nr = r.nr; this.leiter = r.leiter; this.erster = r.erster; this.konsole = r.konsole; this.anzahl = r.anzahl; this.primaer = r.primaer;
    this.liste = [{ nr: r.nr, pid: process.pid, leiter: r.leiter }];
    process.on('message', (m: Nachricht) => { if (m?.dms === KANAL) void this.empfange(m); });
    // Warnungen und Fehler (#895) gebündelt an den Hauptprozess – er sammelt für alle, auch über einen Absturz hinaus.
    const b = new Buendel((eintraege: Rohmeldung[]) => this.sende({ art: 'protokoll', eintraege }));
    protokoll.beobachte((e) => { const m = rohAus(e); if (m) b.nimm(m); });
    // Ohne Hauptprozess (abgestürzt, beendet) gibt es keine Anfragen mehr: geordnet beenden.
    process.on('disconnect', () => process.kill(process.pid, 'SIGTERM'));
  }

  private sende(m: Record<string, unknown>) { if (process.connected) process.send!({ dms: KANAL, ...m }); }

  private async empfange(m: Nachricht) {
    switch (m.art) {
      case 'rufe': {
        const id = m.id;
        try {
          const wert = await this.lokal(String(m.name), (m.args as unknown[]) ?? [], (w) => this.sende({ art: 'teil', id, wert: w }));
          this.sende({ art: 'antwort', id, ok: true, wert });
        } catch (e) { this.sende({ art: 'antwort', id, ok: false, fehler: alsFehlerbild(e) }); }
        return;
      }
      case 'antwort': {
        const p = this.offen.get(Number(m.id));
        if (!p) return;
        this.offen.delete(Number(m.id));
        clearTimeout(p.uhr);
        if (m.ok) p.ok(m.wert); else p.nein(ausFehlerbild(m.fehler as Fehlerbild, this.t));
        return;
      }
      case 'teil': this.offen.get(Number(m.id))?.teil?.(m.wert); return;
      case 'meldung': this.verteile(String(m.name), m.daten); return;
      case 'prozesse': this.liste = m.liste as ProzessInfo[]; if (m.neustarts) this.abstuerze = m.neustarts as Neustarts; return;
    }
  }

  private warte<T>(m: Record<string, unknown>, ms: number, teil?: (w: unknown) => void): Promise<T> {
    const id = this.naechste++;
    return new Promise<T>((ok, nein) => {
      const uhr = setTimeout(() => { if (this.offen.delete(id)) nein(new Fachfehler(504, this.t('meldungen.prozesse.keine-antwort'))); }, ms);
      uhr.unref?.();
      this.offen.set(id, { ok: ok as (w: unknown) => void, nein, teil, uhr });
      this.sende({ ...m, id });
    });
  }

  async rufe<T>(name: string, args: unknown[] = [], o: { teil?: (w: unknown) => void; ms?: number } = {}): Promise<T> {
    if (this.leiter) return await this.lokal(name, args, o.teil ?? (() => {})) as T;
    return this.warte<T>({ art: 'rufe', name, args }, o.ms ?? RUF_MS, o.teil);
  }

  melde(name: string, daten?: unknown, an: 'leiter' | 'alle' | 'andere' = 'leiter') {
    if (an === 'leiter' && this.leiter) { queueMicrotask(() => this.verteile(name, daten)); return; }
    this.sende({ art: 'melde', an, name, daten });
  }

  frageAlle<T>(name: string, ms = 2000): Promise<Array<ProzessInfo & { wert: T | null }>> {
    return this.warte({ art: 'frageAlle', name, ms }, ms + 1000);
  }

  prozesse() { return this.liste; }
  neustarts() { return this.abstuerze; }
  meldungen(): Promise<Sammelstand | null> { return this.warte<Sammelstand>({ art: 'meldungen' }, 3000).catch(() => null); }
  absturz(e: unknown) { this.sende({ art: 'absturz', ausnahme: ausnahmeArt(e) }); }
  bereit() { this.sende({ art: 'bereit' }); }
  beendeAlle(grund: string) { this.sende({ art: 'beenden', grund }); return true; }
}

/** Verbund für diesen Prozess: unter einem Hauptprozess erst die Rolle erfragen, sonst {@link einzeln}. */
export async function verbundFuerProzess(): Promise<Verbund> {
  if (!cluster.isWorker) return einzeln();
  // Sprachdateien erst hier: Der Hauptprozess lädt sie nie.
  const { t } = await import('./sprache');
  const uebersetze: Uebersetzer = (k) => t(k as never);
  return new Promise((ok) => {
    const f = (m: Nachricht) => {
      if (m?.dms !== KANAL || m.art !== 'rolle') return;
      process.off('message', f);
      ok(new Teil(m as unknown as Rolle, uebersetze));
    };
    process.on('message', f);
    process.send!({ dms: KANAL, art: 'hallo' });
  });
}

/* ---------- Hauptprozess ---------- */

/** Neustart eines abgestürzten Prozesses: 1 s, dann doppelt so lange bis höchstens 60 s; nach 5 Minuten Laufzeit wieder 1 s. */
export const neustartWarten = (folge: number) => Math.min(60_000, 1000 * 2 ** folge);
const STABIL_MS = 5 * 60_000;
/** So lange warten die Prozesse beim Beenden, bevor der Hauptprozess sie hart beendet. */
const BEENDEN_MS = 20_000;

/**
 * Der Hauptprozess: startet den Leiter, nach dessen „bereit“ die übrigen; reicht Aufrufe und Meldungen weiter, startet
 * Abgestürzte neu (der Leiter vor seinem ersten „bereit“ nicht – dann endet Ablago wie bisher mit seinem Code, und
 * Docker startet den Container neu). Kehrt nicht zurück.
 */
export function leite(e: ProzessEinstellung): Promise<never> {
  const log = protokoll.modul('system');
  const halde = haldeJeProzess(e);
  const leiterHalde = haldeLeiter(halde);
  cluster.setupPrimary({ serialization: 'advanced' });
  const konsole = randomBytes(32).toString('base64url');
  const plaetze = new Map<number, { w: Worker; bereit: boolean; seit: number }>();
  const folgen = new Map<number, number>();
  /** Weitergereichte Aufrufe: Nummer beim Ziel → Absender und seine Nummer. */
  const weiter = new Map<number, { w: Worker; id: unknown }>();
  /** Sammelfragen an alle: Nummer beim Ziel → Sammlung und Prozess. */
  const fragen = new Map<number, { s: Sammlung; info: ProzessInfo }>();
  interface Sammlung { w: Worker; id: unknown; offen: Set<number>; werte: Array<ProzessInfo & { wert: unknown }>; uhr: NodeJS.Timeout }
  let naechste = 1;
  const neustarts: Neustarts = { anzahl: 0, letzte: [] };
  let leiterWarBereit = false;
  let ende: number | null = null;
  // Warnungen und Fehler aller Prozesse (#895): die eigenen direkt, die der anderen gebündelt per Nachricht.
  const sammlung = sammlungHier(0);
  /** Art der Ausnahme, die ein Prozess vor seinem Absturz meldete (#895) – für den Eintrag unter den Neustarts. */
  const ausnahmen = new Map<number, string | null>();

  const sende = (w: Worker, m: Record<string, unknown>) => { if (w.isConnected()) w.send({ dms: KANAL, ...m }); };
  const liste = (): ProzessInfo[] => [...plaetze].filter(([, p]) => p.w.process.pid).map(([nr, p]) => ({ nr, pid: p.w.process.pid!, leiter: nr === 1 }));
  const verteileListe = () => { const l = liste(); for (const p of plaetze.values()) sende(p.w, { art: 'prozesse', liste: l, neustarts }); };
  const sammlungFertig = (s: Sammlung, k?: number) => {
    if (k !== undefined) s.offen.delete(k);
    if (s.offen.size) return;
    clearTimeout(s.uhr);
    s.werte.sort((a, b) => a.nr - b.nr);
    sende(s.w, { art: 'antwort', id: s.id, ok: true, wert: s.werte });
  };

  const nachricht = (nr: number, w: Worker, m: Nachricht) => {
    if (m?.dms !== KANAL) return;
    const p = plaetze.get(nr);
    switch (m.art) {
      case 'hallo':
        sende(w, { art: 'rolle', nr, leiter: nr === 1, erster: nr === 1 && !leiterWarBereit, konsole, anzahl: e.anzahl, primaer: process.pid });
        verteileListe();
        return;
      case 'bereit':
        if (p) p.bereit = true;
        log.info(`Prozess ${nr}${nr === 1 ? ' (Leiter)' : ''} ist bereit`, { pid: w.process.pid });
        if (nr === 1 && !leiterWarBereit) {
          leiterWarBereit = true;
          for (let i = 2; i <= e.anzahl; i++) starte(i);
        }
        verteileListe();
        return;
      case 'rufe': {
        const l = plaetze.get(1);
        if (!l?.bereit) { sende(w, { art: 'antwort', id: m.id, ok: false, fehler: { status: 503, message: '', schluessel: 'meldungen.prozesse.leiter-startet' } }); return; }
        const k = naechste++;
        weiter.set(k, { w, id: m.id });
        sende(l.w, { art: 'rufe', id: k, name: m.name, args: m.args });
        return;
      }
      case 'antwort': case 'teil': {
        const k = Number(m.id);
        const f = fragen.get(k);
        if (f) {
          if (m.art === 'teil') return;
          fragen.delete(k);
          f.s.werte.push({ ...f.info, wert: m.ok ? m.wert : null });
          sammlungFertig(f.s, k);
          return;
        }
        const z = weiter.get(k);
        if (!z) return;
        if (m.art === 'antwort') weiter.delete(k);
        sende(z.w, { ...m, id: z.id });
        return;
      }
      case 'melde': {
        const an = m.an === 'alle' || m.an === 'andere' ? m.an : 'leiter';
        for (const [n, x] of plaetze) {
          if ((an === 'leiter' && n !== 1) || (an === 'andere' && x.w === w)) continue;
          sende(x.w, { art: 'meldung', name: m.name, daten: m.daten });
        }
        return;
      }
      case 'frageAlle': {
        const s: Sammlung = { w, id: m.id, offen: new Set(), werte: [], uhr: setTimeout(() => {
          for (const k of s.offen) { const f = fragen.get(k); if (f) { fragen.delete(k); s.werte.push({ ...f.info, wert: null }); } }
          s.offen.clear();
          sammlungFertig(s);
        }, Number(m.ms) || 2000) };
        for (const i of liste()) {
          const x = plaetze.get(i.nr)!;
          if (!x.bereit && x.w !== w) { s.werte.push({ ...i, wert: null }); continue; }
          const k = naechste++;
          fragen.set(k, { s, info: i });
          s.offen.add(k);
          sende(x.w, { art: 'rufe', id: k, name: m.name, args: [] });
        }
        sammlungFertig(s);
        return;
      }
      case 'protokoll':
        for (const x of Array.isArray(m.eintraege) ? m.eintraege as Rohmeldung[] : []) sammlung.nimm(x, nr);
        return;
      case 'meldungen':
        sende(w, { art: 'antwort', id: m.id, ok: true, wert: sammlung.stand() });
        return;
      case 'absturz':
        ausnahmen.set(nr, typeof m.ausnahme === 'string' ? m.ausnahme : null);
        return;
      case 'beenden':
        log.warn(`Ablago wird ganz beendet: ${String(m.grund ?? '')}`);
        beendeAlle(0);
        return;
    }
  };

  const beendet = (nr: number, w: Worker, code: number | null, signal: string | null) => {
    const p = plaetze.get(nr);
    if (p?.w !== w) return;
    plaetze.delete(nr);
    // Was noch auf den beendeten Prozess wartet, bekommt eine Antwort; Fragen von ihm verfallen.
    for (const [k, z] of weiter) {
      if (z.w === w) weiter.delete(k);
      else if (nr === 1) { weiter.delete(k); sende(z.w, { art: 'antwort', id: z.id, ok: false, fehler: { status: 503, message: '', schluessel: 'meldungen.prozesse.leiter-neu' } }); }
    }
    for (const [k, f] of fragen) if (f.info.nr === nr) { fragen.delete(k); f.s.werte.push({ ...f.info, wert: null }); sammlungFertig(f.s, k); }
    if (ende !== null) { if (!plaetze.size) process.exit(ende); return; }
    // Für Lasttest und Systemzustand (#874): Wer stürzt ab, mit welchem Code bzw. Signal?
    neustarts.anzahl++;
    neustarts.letzte = [...neustarts.letzte, { nr, code, signal, zeit: new Date().toISOString(), ausnahme: ausnahmen.get(nr) ?? null }].slice(-10);
    ausnahmen.delete(nr);
    verteileListe();
    if (nr === 1 && !leiterWarBereit) {
      // Start gescheitert: wie mit einem Prozess beenden – Docker startet den Container neu.
      log.error(`Ablago startet nicht (Prozess 1 beendet: ${signal ?? `Code ${code}`})`);
      process.exit(code ?? 1);
    }
    const folge = Date.now() - p.seit > STABIL_MS ? 0 : (folgen.get(nr) ?? 0);
    folgen.set(nr, folge + 1);
    const ms = neustartWarten(folge);
    // Nur Nummer, Code und Signal – der Grund steht im Protokoll des Prozesses selbst (ohne Geheimnisse).
    log.warn(`Prozess ${nr}${nr === 1 ? ' (Leiter)' : ''} beendet (${signal ?? `Code ${code}`}) – startet in ${ms / 1000} s neu`);
    setTimeout(() => { if (ende === null) starte(nr); }, ms);
  };

  const starte = (nr: number) => {
    // Halde (#874, #891): jeder Prozess begrenzt, der Leiter mit 512 MB mehr; null (ein Prozess, von Hand gesetzt): wie bisher.
    const grenze = nr === 1 ? leiterHalde : halde;
    cluster.setupPrimary({ execArgv: grenze ? [...process.execArgv, `--max-old-space-size=${grenze}`] : process.execArgv });
    const w = cluster.fork();
    plaetze.set(nr, { w, bereit: false, seit: Date.now() });
    w.on('message', (m: Nachricht) => nachricht(nr, w, m));
    w.on('exit', (code, signal) => beendet(nr, w, code, signal));
  };

  const beendeAlle = (code: number) => {
    if (ende !== null) return;
    ende = code;
    if (!plaetze.size) process.exit(code);
    for (const p of plaetze.values()) p.w.process.kill('SIGTERM');
    setTimeout(() => { for (const p of plaetze.values()) p.w.process.kill('SIGKILL'); process.exit(code); }, BEENDEN_MS).unref();
  };
  process.on('SIGTERM', () => beendeAlle(0));
  process.on('SIGINT', () => beendeAlle(0));

  log.info(`Ablago startet mit ${e.anzahl} Prozessen (DMS_PROZESSE${e.quelle === 'auto' ? '=auto' : ''}): Prozess 1 leitet und erledigt die Arbeit im Hintergrund, alle beantworten Anfragen`, { kerne: e.kerne, ...(e.quelle === 'auto' ? { begrenzt: e.begrenzt } : {}), ...(halde ? { haldeLeiterMb: leiterHalde, haldeMb: halde } : {}) });
  starte(1);
  return new Promise<never>(() => {});
}
