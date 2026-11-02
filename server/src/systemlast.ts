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
import { dauerhaftHoch, VERLAUF_MINUTEN, type Anteile, type Messpunkt, type SystemlastStand } from '../../shared/src/systemlast';

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
  return kb ? Number(kb) * 1024 : null;
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

  /** Warnung für Übersicht und Navigation: Werte, die seit 5 Minuten über 90 % liegen. */
  warnung() { return dauerhaftHoch(this.verlauf); }

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
