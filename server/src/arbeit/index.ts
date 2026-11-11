/**
 * Arbeiter für PDF und große Exporte (#542): ein Pool je Prozess, beim ersten Auftrag gestartet.
 *
 * Zahl der Arbeiter: Umgebungsvariable `DMS_ARBEITER` (1–16); nicht gesetzt: die Hälfte der Kerne, die der
 * Container nutzen darf, mindestens 1, höchstens 4. `DMS_ARBEITER=0` schaltet den Pool aus: Dann läuft alles
 * wie vor #542 im Hauptfaden (nur zur Fehlersuche gedacht).
 *
 * Mehrere Prozesse (#745): Der Pool gilt je Prozess. Die Vorgabe teilt sich auf die Prozesse auf (mindestens 1 je
 * Prozess), damit zusammen nicht mehr Fäden rechnen als mit einem Prozess; `DMS_ARBEITER` gilt je Prozess.
 */
import { availableParallelism } from 'node:os';
import { ladeArgumente } from '../laeufer/modul';
import { dateiLeser, liesCgroup } from '../systemlast';
import { Arbeiterpool, type PoolStand } from './pool';
import type { Vorgaenge, Vorgang } from './vorgaenge';
import { t } from '../sprache';

export const ARBEITER_MAX = 16;
/** Zeitgrenze je Auftrag. */
export const ARBEIT_ZEIT_MS = 10 * 60_000;
/** Aufträge, die höchstens warten dürfen; darüber antwortet das DMS sofort mit 503. */
export const WARTESCHLANGE_MAX = 50;

/** Vorgabe: die Hälfte der nutzbaren Kerne, mindestens 1, höchstens 4 – der Hauptfaden und PostgreSQL brauchen auch Rechenzeit. */
export const vorgabeArbeiter = (kerne: number) => Math.max(1, Math.min(4, Math.floor(kerne / 2)));

export interface ArbeiterEinstellung { groesse: number; quelle: 'vorgabe' | 'umgebung'; kerne: number; fehler?: string }

/** Vorgabe je Prozess bei mehreren Prozessen (#745). */
export const vorgabeJeProzess = (kerne: number, prozesse: number) => Math.max(1, Math.floor(vorgabeArbeiter(kerne) / Math.max(1, prozesse)));

export function arbeiterAus(env: Record<string, string | undefined>, kerne = liesCgroup(dateiLeser).kerne ?? availableParallelism(), prozesse = 1): ArbeiterEinstellung {
  const k = Math.max(1, Math.round(kerne * 100) / 100);
  const roh = env.DMS_ARBEITER?.trim();
  if (!roh) return { groesse: vorgabeJeProzess(k, prozesse), quelle: 'vorgabe', kerne: k };
  const n = Number(roh);
  if (!Number.isInteger(n) || n < 0 || n > ARBEITER_MAX) return { groesse: vorgabeJeProzess(k, prozesse), quelle: 'vorgabe', kerne: k, fehler: t('meldungen.index.dms-arbeiter-ist-keine', { roh, ARBEITER_MAX }) };
  return { groesse: n, quelle: 'umgebung', kerne: k };
}

let einstellung: ArbeiterEinstellung | null = null;
let pool: Arbeiterpool | null = null;

const datei = () => new URL(import.meta.url.endsWith('.ts') ? './arbeitsfaden.ts' : './arbeitsfaden.mjs', import.meta.url);

/** Einstellung lesen und den Pool anlegen (beim Start des Servers; sonst beim ersten Auftrag). */
export function richteArbeiterEin(env: Record<string, string | undefined> = process.env, o: { vorwaermen?: boolean; prozesse?: number } = {}): ArbeiterEinstellung {
  einstellung = arbeiterAus(env, undefined, o.prozesse);
  pool = einstellung.groesse > 0 ? new Arbeiterpool({ datei: datei(), groesse: einstellung.groesse, zeitMs: ARBEIT_ZEIT_MS, warteschlangeMax: WARTESCHLANGE_MAX, execArgv: ladeArgumente(process.execArgv) }) : null;
  if (o.vorwaermen) pool?.vorwaermen();
  return einstellung;
}

/** Stand für Werkbank → Systemzustand. */
export function arbeiterStand(): (PoolStand & { aus: false; quelle: ArbeiterEinstellung['quelle']; kerne: number }) | { aus: true; quelle: ArbeiterEinstellung['quelle']; kerne: number } {
  if (!einstellung) richteArbeiterEin();
  const e = einstellung!;
  return pool ? { ...pool.stand(), aus: false, quelle: e.quelle, kerne: e.kerne } : { aus: true, quelle: e.quelle, kerne: e.kerne };
}

export async function beendeArbeiter() { await pool?.beenden(); pool = null; einstellung = null; }

type Fn<K extends Vorgang> = Vorgaenge[K] extends (...a: infer A) => infer R ? { args: A; erg: Awaited<R> } : never;

/** Führt einen Vorgang in einem Arbeiter aus – oder, ohne Pool, hier im Hauptfaden. */
export async function arbeite<K extends Vorgang>(vorgang: K, ...args: Fn<K>['args']): Promise<Fn<K>['erg']> {
  return arbeiteBis(ARBEIT_ZEIT_MS, vorgang, ...args);
}

/**
 * Wie `arbeite`, aber mit eigener, kürzerer Zeitgrenze (#1040: Text setzen). Im Pool beendet die Grenze den Arbeiter;
 * ohne Pool (`DMS_ARBEITER=0`, nur zur Fehlersuche) scheitert nur das Warten.
 */
export async function arbeiteBis<K extends Vorgang>(zeitMs: number, vorgang: K, ...args: Fn<K>['args']): Promise<Fn<K>['erg']> {
  if (!einstellung) richteArbeiterEin();
  if (!pool) {
    const { VORGAENGE } = await import('./vorgaenge');
    const lauf = (VORGAENGE[vorgang] as (...a: unknown[]) => Promise<Fn<K>['erg']>)(...args);
    if (zeitMs >= ARBEIT_ZEIT_MS) return lauf;
    let uhr: NodeJS.Timeout | undefined;
    const grenze = new Promise<never>((_, nein) => { uhr = setTimeout(() => nein(new Error(t('meldungen.prozess.zeitgrenze-erreicht-s-abgebrochen', { sekunden: Math.round(zeitMs / 1000) }))), zeitMs); });
    try { return await Promise.race([lauf, grenze]); } finally { clearTimeout(uhr); }
  }
  return pool.ausfuehren<Fn<K>['erg']>(vorgang, args, zeitMs < ARBEIT_ZEIT_MS ? { zeitMs } : {});
}
