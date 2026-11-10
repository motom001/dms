/**
 * Systemzustand → Auslastung (#409, Stufe 1): CPU, Arbeitsspeicher und Netzwerk des DMS-Containers.
 *
 * Gelesen wird nur, was der Container ohne zusätzliche Rechte sieht: cgroup v2 (`cpu.stat`, `cpu.max`,
 * `memory.current`, `memory.max`) bzw. v1 (`cpuacct.usage`, `cpu.cfs_quota_us`, `memory.usage_in_bytes`,
 * `memory.limit_in_bytes`), `/proc/net/dev` und `/proc/<pid>/smaps_rollup`. Was nicht lesbar ist, bleibt
 * `null` und erscheint als „nicht verfügbar“ – geschätzt wird nichts. Messung jede Minute, die letzten
 * 60 Werte nur im Arbeitsspeicher (keine Tabelle).
 *
 * Stufe 2 (Auslastung je Paket, nach #338/#403) ist ein eigenes Issue; hier nur der Anteil des Paket-Läufers
 * am Arbeitsspeicher, soweit messbar.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism, cpus, loadavg, totalmem } from 'node:os';
import { dauerhaftHoch, VERLAUF_MINUTEN, type Anteile, type Messpunkt, type SystemlastStand, type Warnung } from '../../shared/src/systemlast';
import { KB } from './grenzen';

export { dauerhaftHoch, type Messpunkt, type SystemlastStand } from '../../shared/src/systemlast';

/** Liest eine Datei als Text; `null`, wenn es sie nicht gibt oder sie nicht lesbar ist. */
export type Leser = (pfad: string) => string | null;
export const dateiLeser: Leser = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

/** Grenzen über 2^60 Byte bedeuten bei cgroup v1 „keine Grenze“. */
const OHNE_GRENZE = 2 ** 60;
const zahl = (s: string | null | undefined) => { const n = Number(s?.trim()); return s != null && s.trim() !== '' && Number.isFinite(n) ? n : null; };

export interface Cgroup {
  version: 'v2' | 'v1' | null;
  /** Verbrauchte Rechenzeit des Containers in Mikrosekunden (fortlaufend). */
  cpuUs: number | null;
  /** Erlaubte Kerne (Quote/Periode); `null` = keine Grenze. */
  kerne: number | null;
  speicher: number | null;
  /** Grenze in Byte; `null` = keine Grenze gesetzt (oder nicht lesbar). */
  grenze: number | null;
}

/** cgroup v2 vor v1; liest nur Dateien unter `wurzel` (Standard /sys/fs/cgroup). */
export function liesCgroup(lies: Leser, wurzel = '/sys/fs/cgroup'): Cgroup {
  const stat = lies(`${wurzel}/cpu.stat`);
  const mem = lies(`${wurzel}/memory.current`);
  if (stat !== null || mem !== null) {
    const usage = stat?.match(/^usage_usec\s+(\d+)/m)?.[1];
    const [quote, periode] = (lies(`${wurzel}/cpu.max`) ?? '').trim().split(/\s+/);
    const maxText = lies(`${wurzel}/memory.max`)?.trim();
    return {
      version: 'v2',
      cpuUs: zahl(usage),
      kerne: quote && quote !== 'max' && zahl(quote) && zahl(periode) ? zahl(quote)! / zahl(periode)! : null,
      speicher: zahl(mem),
      grenze: maxText && maxText !== 'max' ? zahl(maxText) : null,
    };
  }
  const usageNs = zahl(lies(`${wurzel}/cpuacct/cpuacct.usage`) ?? lies(`${wurzel}/cpu,cpuacct/cpuacct.usage`));
  const quote = zahl(lies(`${wurzel}/cpu/cpu.cfs_quota_us`) ?? lies(`${wurzel}/cpu,cpuacct/cpu.cfs_quota_us`));
  const periode = zahl(lies(`${wurzel}/cpu/cpu.cfs_period_us`) ?? lies(`${wurzel}/cpu,cpuacct/cpu.cfs_period_us`));
  const speicher = zahl(lies(`${wurzel}/memory/memory.usage_in_bytes`));
  const grenze = zahl(lies(`${wurzel}/memory/memory.limit_in_bytes`));
  if (usageNs === null && speicher === null) return { version: null, cpuUs: null, kerne: null, speicher: null, grenze: null };
  return {
    version: 'v1',
    cpuUs: usageNs === null ? null : usageNs / 1000,
    kerne: quote !== null && quote > 0 && periode ? quote / periode : null,
    speicher,
    grenze: grenze !== null && grenze < OHNE_GRENZE ? grenze : null,
  };
}

/**
 * Arbeitsspeicher des ganzen Containers (#696), wie ihn die NAS anzeigt: jetzt, Spitze seit dem Start und die
 * Aufteilung in Programme (anon) und Dateizwischenspeicher (file). cgroup v2: memory.current, memory.peak,
 * memory.stat; v1: memory.usage_in_bytes, memory.max_usage_in_bytes, memory.stat (total_rss/total_cache).
 * Was nicht lesbar ist, bleibt null – geschätzt wird nichts.
 */
export interface ContainerSpeicher { aktuell: number | null; spitze: number | null; programme: number | null; zwischenspeicher: number | null }
export function liesContainerSpeicher(lies: Leser, wurzel = '/sys/fs/cgroup'): ContainerSpeicher {
  const stat = (text: string | null, ...namen: string[]) => {
    for (const n of namen) { const m = text?.match(new RegExp(`^${n}\\s+(\\d+)`, 'm')); if (m) return Number(m[1]); }
    return null;
  };
  const v2 = lies(`${wurzel}/memory.current`);
  if (v2 !== null) {
    const s = lies(`${wurzel}/memory.stat`);
    return { aktuell: zahl(v2), spitze: zahl(lies(`${wurzel}/memory.peak`)), programme: stat(s, 'anon'), zwischenspeicher: stat(s, 'file') };
  }
  const v1 = lies(`${wurzel}/memory/memory.usage_in_bytes`);
  if (v1 !== null) {
    const s = lies(`${wurzel}/memory/memory.stat`);
    return { aktuell: zahl(v1), spitze: zahl(lies(`${wurzel}/memory/memory.max_usage_in_bytes`)), programme: stat(s, 'total_rss', 'rss'), zwischenspeicher: stat(s, 'total_cache', 'cache') };
  }
  return { aktuell: null, spitze: null, programme: null, zwischenspeicher: null };
}

/** Empfangene und gesendete Bytes aller Schnittstellen außer `lo` aus `/proc/net/dev`. */
export function liesNetz(text: string | null): { rx: number; tx: number } | null {
  if (!text) return null;
  let rx = 0, tx = 0, gefunden = false;
  for (const z of text.split('\n').slice(2)) {
    const m = z.match(/^\s*([^:]+):\s*(.*)$/);
    if (!m || m[1].trim() === 'lo') continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    if (f.length < 9 || !Number.isFinite(f[0]) || !Number.isFinite(f[8])) continue;
    rx += f[0]; tx += f[8]; gefunden = true;
  }
  return gefunden ? { rx, tx } : null;
}

/** Proportionaler Anteil am Arbeitsspeicher (Pss) eines Prozesses in Byte; geteilter Speicher zählt anteilig. */
export function liesPss(lies: Leser, pid: number): number | null {
  const kb = lies(`/proc/${pid}/smaps_rollup`)?.match(/^Pss:\s+(\d+)\s+kB/m)?.[1];
  return kb ? Number(kb) * KB : null;
}

/** Belegter Arbeitsspeicher (RSS) eines Prozesses in Byte (#745, z. B. des Hauptprozesses). */
export function liesRss(lies: Leser, pid: number): number | null {
  const kb = lies(`/proc/${pid}/status`)?.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1];
  return kb ? Number(kb) * KB : null;
}

export function liesAnteile(lies: Leser, o: { eigen: number; laeufer: number | null; postgres: boolean; pids?: () => number[] }): Anteile {
  let datenbank: number | null = null;
  if (o.postgres) {
    let summe = 0, ok = false, unlesbar = false;
    for (const pid of (o.pids ?? alleProzesse)()) {
      if (lies(`/proc/${pid}/comm`)?.trim() !== 'postgres') continue;
      const p = liesPss(lies, pid);
      if (p === null) { unlesbar = true; continue; }
      summe += p; ok = true;
    }
    datenbank = ok && !unlesbar ? summe : null;
  }
  return { dms: liesPss(lies, o.eigen), pakete: o.laeufer ? liesPss(lies, o.laeufer) : null, datenbank };
}

/** Takte je Sekunde in /proc/<pid>/stat (USER_HZ ist unter Linux für Programme immer 100). */
const USER_HZ = 100;

/**
 * Verbrauchte Rechenzeit eines Prozesses in Sekunden (#874): utime + stime, dazu cutime + cstime seiner beendeten
 * Kinder (bei PostgreSQL die beendeten Verbindungen, bei Ablago z. B. pdftoppm). null, wenn nicht lesbar.
 */
export function liesCpuSekunden(lies: Leser, pid: number): number | null {
  const text = lies(`/proc/${pid}/stat`);
  if (!text) return null;
  // Der Name in Klammern darf Leerzeichen enthalten: erst nach der letzten Klammer zählen.
  const f = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
  // f[0] ist Feld 3 (state); utime … cstime sind die Felder 14–17.
  const t = [11, 12, 13, 14].map((i) => Number(f[i]));
  return t.every(Number.isFinite) ? t.reduce((a, b) => a + b, 0) / USER_HZ : null;
}

/**
 * Rechenzeit seit dem Start in Sekunden, fortlaufend (#874): PostgreSQL (alle Prozesse namens `postgres`, nur wenn es
 * im selben Container läuft), Ablago (die genannten Prozesse: Hauptprozess und alle Prozesse für Anfragen) und der
 * ganze Container (cgroup). Den Anteil in Prozent eines Kerns bildet der Lasttest aus zwei Ständen.
 */
export interface CpuJeArt { postgres: number | null; ablago: number | null; container: number | null }
export function liesCpuJeArt(lies: Leser, o: { ablago: number[]; postgres: boolean; pids?: () => number[] }): CpuJeArt {
  let ablago = 0, ablagoOk = o.ablago.length > 0;
  for (const pid of o.ablago) { const c = liesCpuSekunden(lies, pid); if (c === null) ablagoOk = false; else ablago += c; }
  let postgres: number | null = null;
  if (o.postgres) {
    let summe = 0, ok = false;
    for (const pid of (o.pids ?? alleProzesse)()) {
      if (lies(`/proc/${pid}/comm`)?.trim() !== 'postgres') continue;
      const c = liesCpuSekunden(lies, pid);
      if (c !== null) { summe += c; ok = true; }
    }
    postgres = ok ? Math.round(summe * 100) / 100 : null;
  }
  const us = liesCgroup(lies).cpuUs;
  return { postgres, ablago: ablagoOk ? Math.round(ablago * 100) / 100 : null, container: us === null ? null : Math.round(us / 1e4) / 100 };
}

function alleProzesse(): number[] {
  try { return readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map(Number); } catch { return []; }
}

/* ---------- Verlauf und Schwellen ---------- */

interface Roh { t: number; cpuUs: number | null; netz: { rx: number; tx: number } | null }

export interface SystemlastOptionen {
  lies?: Leser;
  /** Pid des Paket-Läufers, falls er läuft. */
  laeufer?: () => number | null;
  postgres?: boolean;
  jetzt?: () => number;
  /** Wartezeit der Ereignisschleife dauerhaft hoch? (#542, `Auslastung.warnung`) */
  schleife?: () => boolean;
}

export class Systemlast {
  private verlauf: Messpunkt[] = [];
  private letzte: Roh | null = null;
  private zeitgeber?: NodeJS.Timeout;
  private readonly lies: Leser;
  private readonly uhr: () => number;

  constructor(private o: SystemlastOptionen = {}) {
    this.lies = o.lies ?? dateiLeser;
    this.uhr = o.jetzt ?? Date.now;
  }

  start(intervallMs = 60_000) {
    if (this.zeitgeber) return;
    this.letzte = this.roh();
    this.zeitgeber = setInterval(() => this.messe(), intervallMs);
    this.zeitgeber.unref();
  }

  stop() { if (this.zeitgeber) clearInterval(this.zeitgeber); this.zeitgeber = undefined; }

  private roh(): Roh { return { t: this.uhr(), cpuUs: liesCgroup(this.lies).cpuUs, netz: liesNetz(this.lies('/proc/net/dev')) }; }

  private kerne(c = liesCgroup(this.lies)) { return c.kerne ?? availableParallelism(); }

  /** Messpunkt zwischen zwei Rohwerten. */
  private punkt(von: Roh, bis: Roh): Messpunkt {
    const c = liesCgroup(this.lies);
    const sek = Math.max(0.001, (bis.t - von.t) / 1000);
    const cpu = von.cpuUs !== null && bis.cpuUs !== null ? Math.min(100, Math.max(0, ((bis.cpuUs - von.cpuUs) / 1e6 / sek / this.kerne(c)) * 100)) : null;
    const grenze = c.grenze ?? (c.speicher !== null ? totalmem() : null);
    const speicher = c.speicher !== null && grenze ? Math.min(100, (c.speicher / grenze) * 100) : null;
    const netz = von.netz && bis.netz ? { rx: Math.max(0, (bis.netz.rx - von.netz.rx) / sek), tx: Math.max(0, (bis.netz.tx - von.netz.tx) / sek) } : null;
    const r = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
    return { zeit: new Date(bis.t).toISOString(), cpu: r(cpu), speicher: r(speicher), rx: netz ? Math.round(netz.rx) : null, tx: netz ? Math.round(netz.tx) : null };
  }

  /** Eine Messung (jede Minute); öffentlich für Tests. */
  messe(): Messpunkt | null {
    const neu = this.roh();
    const alt = this.letzte;
    this.letzte = neu;
    if (!alt) return null;
    const p = this.punkt(alt, neu);
    this.verlauf.push(p);
    if (this.verlauf.length > VERLAUF_MINUTEN) this.verlauf.splice(0, this.verlauf.length - VERLAUF_MINUTEN);
    return p;
  }

  /** Warnung für Übersicht und Navigation: Werte, die seit 5 Minuten über 90 % liegen; Wartezeit des Servers (#542). */
  warnung(): Warnung[] { return [...dauerhaftHoch(this.verlauf), ...(this.o.schleife?.() ? ['schleife' as const] : [])]; }

  /** Speicher des ganzen Containers (#696) und – wenn PostgreSQL mitläuft – dessen Anteil (Pss). */
  container(): ContainerSpeicher & { datenbank: number | null } {
    const c = liesContainerSpeicher(this.lies);
    const datenbank = this.o.postgres ? liesAnteile(this.lies, { eigen: process.pid, laeufer: null, postgres: true }).datenbank : null;
    return { ...c, datenbank };
  }

  /** Rechenzeit von PostgreSQL, Ablago und Container (#874), fortlaufend in Sekunden. */
  cpuJeArt(ablago: number[]): CpuJeArt { return liesCpuJeArt(this.lies, { ablago, postgres: !!this.o.postgres }); }

  /** Kerne und Grenze des Arbeitsspeichers (#895, für den Lasttest) – wie in `stand()`. */
  rahmen(): { kerne: number; kerneBegrenzt: boolean; grenze: number | null; ohneGrenze: boolean } {
    const c = liesCgroup(this.lies);
    return { kerne: Math.round(this.kerne(c) * 100) / 100, kerneBegrenzt: c.kerne !== null, grenze: c.grenze ?? (c.speicher !== null ? totalmem() : null), ohneGrenze: c.grenze === null };
  }

  stand(): SystemlastStand {
    const c = liesCgroup(this.lies);
    const jetztRoh = this.roh();
    // „Jetzt“: seit der letzten Minutenmessung; liegt die weniger als eine Sekunde zurück, gilt der letzte Messpunkt.
    const jetzt = this.letzte && jetztRoh.t - this.letzte.t >= 1000 ? this.punkt(this.letzte, jetztRoh) : this.verlauf.at(-1) ?? { zeit: new Date(jetztRoh.t).toISOString(), cpu: null, speicher: null, rx: null, tx: null };
    const laeufer = this.o.laeufer?.() ?? null;
    return {
      jetzt, verlauf: [...this.verlauf], cgroup: c.version,
      kerne: Math.round(this.kerne(c) * 100) / 100, kerneBegrenzt: c.kerne !== null,
      speicher: { belegt: c.speicher, grenze: c.grenze ?? (c.speicher !== null ? totalmem() : null), ohneGrenze: c.grenze === null },
      anteile: liesAnteile(this.lies, { eigen: process.pid, laeufer, postgres: !!this.o.postgres }),
      last: loadavg().map((x) => Math.round(x * 100) / 100) as [number, number, number], hostKerne: cpus().length,
      netz: jetztRoh.netz !== null,
      datenbankImContainer: !!this.o.postgres,
      warnung: this.warnung(),
    };
  }
}
