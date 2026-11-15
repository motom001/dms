/**
 * Arbeit im Hintergrund mit niedrigerer Priorität (#893): Menschen haben Vorrang.
 *
 * Große Stapel Scans belegen mit Texterkennung und Vorschaubildern die Kerne. Damit die Oberfläche flüssig bleibt,
 * laufen die Arbeiter (Fäden für PDF und Exporte, #542), der Paket-Läufer (#338, dort läuft z. B. die Texterkennung)
 * und alle Programme, die Ablago startet (`pdftoppm`, `pdftotext`, `qpdf`, Ghostscript …), mit einem höheren
 * nice-Wert. Der Hauptfaden, der die Anfragen beantwortet, bleibt auf seiner Priorität.
 *
 * - `DMS_HINTERGRUND_NICE` (0–19, Vorgabe 10; 0 = aus) gilt **zusätzlich** zur Priorität des Hauptfadens, höchstens 19.
 *   Höher als jetzt wird nie gesetzt – so braucht es keine Rechte.
 * - Linux kennt die Priorität je Faden: `setPriority(0, n)` in einem Worker-Thread senkt nur diesen Faden.
 *   Kindprozesse erben die Priorität des Fadens, der sie startet; darum senkt `execFile`/`spawn` von hier die
 *   Priorität gleich nach dem Start (die Programme laufen dann schon, starten aber noch keine eigenen Kinder).
 * - Geht es nicht (z. B. EACCES oder ENOSYS in einem eingeschränkten Container), steht es einmal im Protokoll und
 *   alles läuft mit normaler Priorität weiter.
 * - Endet Ablago (#1203), enden auch diese Programme: Wer beim Ende noch läuft, bekommt SIGKILL (Ereignis `exit` des
 *   Prozesses – nach dem geordneten Beenden ebenso wie nach einem Absturz). Sonst liefe z. B. Ghostscript an einer großen
 *   PDF ohne Ablago weiter. Paket-Läufer und weitere Prozesse (`DMS_PROZESSE`) enden selbst mit der IPC-Verbindung.
 */
import * as kp from 'node:child_process';
import { readdirSync } from 'node:fs';
import { getPriority, setPriority } from 'node:os';
import { protokoll } from './protokoll';
import { tDe } from './sprache';

export const HINTERGRUND_NICE_VORGABE = 10;
export const HINTERGRUND_NICE_MAX = 19;

export interface NiceEinstellung { wert: number; quelle: 'vorgabe' | 'umgebung'; fehler?: string }

export function hintergrundNiceAus(env: Record<string, string | undefined>): NiceEinstellung {
  const roh = env.DMS_HINTERGRUND_NICE?.trim();
  if (!roh) return { wert: HINTERGRUND_NICE_VORGABE, quelle: 'vorgabe' };
  const n = Number(roh);
  if (!Number.isInteger(n) || n < 0 || n > HINTERGRUND_NICE_MAX) {
    return { wert: HINTERGRUND_NICE_VORGABE, quelle: 'vorgabe', fehler: tDe('meldungen.hintergrund.ungueltig', { roh, max: HINTERGRUND_NICE_MAX, wert: HINTERGRUND_NICE_VORGABE }) };
  }
  return { wert: n, quelle: 'umgebung' };
}

let einstellung: NiceEinstellung | null = null;
let gemeldet = false;

/** Einstellung lesen (beim Start; sonst beim ersten Gebrauch aus `process.env`). */
export function richteHintergrundEin(env: Record<string, string | undefined> = process.env): NiceEinstellung {
  einstellung = hintergrundNiceAus(env);
  gemeldet = false;
  return einstellung;
}

export const hintergrundNice = () => (einstellung ?? richteHintergrundEin()).wert;

/** Für Tests: welche Funktionen des Betriebssystems benutzt werden. */
export interface Prioritaet { getPriority: (pid?: number) => number; setPriority: (pid: number, wert: number) => void }
const SYSTEM: Prioritaet = { getPriority, setPriority };

function melde(e: unknown) {
  if (gemeldet) return;
  gemeldet = true;
  const f = e as NodeJS.ErrnoException;
  protokoll.modul('system').warn(tDe('meldungen.hintergrund.ohne-nice', { fehler: f?.code ?? f?.message ?? String(e) }));
}

/** Ziel-Priorität: die des Hauptfadens (TID = PID) plus die Einstellung, höchstens 19. */
function ziel(sys: Prioritaet, n: number) {
  return Math.min(HINTERGRUND_NICE_MAX, sys.getPriority(process.pid) + n);
}

/**
 * Senkt die Priorität eines Prozesses bzw. Fadens. `pid` 0: der aufrufende Faden (unter Linux nur dieser, nicht
 * der ganze Prozess). Ergebnis: ob die Priorität jetzt niedrig ist (false auch bei ausgeschaltet).
 */
export function senkePrioritaet(pid = 0, sys: Prioritaet = SYSTEM): boolean {
  const n = hintergrundNice();
  if (!n) return false;
  try {
    const z = ziel(sys, n);
    if (sys.getPriority(pid) >= z) return true;
    sys.setPriority(pid, z);
    return true;
  } catch (e) {
    // Schon beendet: nichts zu senken, kein Grund für einen Hinweis.
    if ((e as NodeJS.ErrnoException)?.code !== 'ESRCH') melde(e);
    return false;
  }
}

/**
 * Senkt alle Fäden eines Prozesses, die es schon gibt (für den Paket-Läufer, aus dem DMS heraus: Der Läufer selbst
 * darf /proc nicht lesen). Fäden, die er danach startet, erben die niedrige Priorität ihres Hauptfadens.
 */
export function senkeProzess(pid: number, sys: Prioritaet = SYSTEM, faeden: (pid: number) => number[] = faedenVon): boolean {
  const n = hintergrundNice();
  if (!n) return false;
  let z: number;
  try { z = ziel(sys, n); } catch (e) { melde(e); return false; }
  for (const tid of faeden(pid)) {
    try { if (sys.getPriority(tid) < z) sys.setPriority(tid, z); } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ESRCH') continue;
      melde(e); return false;
    }
  }
  return true;
}

/** Fäden eines Prozesses (Linux: /proc/<pid>/task); sonst nur der Prozess selbst. */
export function faedenVon(pid: number): number[] {
  try {
    const tids = readdirSync(`/proc/${pid}/task`).map(Number).filter((x) => Number.isInteger(x) && x > 0);
    if (tids.length) return tids;
  } catch { /* kein /proc: nur der Prozess */ }
  return [pid];
}

/** Programme, die gerade laufen (#1203): beim Ende von Ablago beenden. */
const laufend = new Set<kp.ChildProcess>();
let endeVerbunden = false;

/** Alle noch laufenden Programme beenden (synchron, auch im Ereignis `exit`). Ergebnis: wie viele. */
export function beendeProgramme(signal: NodeJS.Signals = 'SIGKILL'): number {
  let n = 0;
  for (const k of laufend) { if (k.exitCode === null && k.signalCode === null) { try { if (k.kill(signal)) n++; } catch { /* schon weg */ } } }
  laufend.clear();
  return n;
}

/** Kindprozess gleich nach dem Start senken und bis zu seinem Ende merken. */
export function niedrig<T extends kp.ChildProcess>(kind: T): T {
  if (kind.pid) senkePrioritaet(kind.pid);
  if (kind.pid) {
    laufend.add(kind);
    kind.once('exit', () => laufend.delete(kind));
    if (!endeVerbunden) { endeVerbunden = true; process.once('exit', () => { beendeProgramme(); }); }
  }
  return kind;
}

/** `execFile` aus node:child_process, das gestartete Programm mit niedrigerer Priorität. */
export const execFile = ((...a: unknown[]) => niedrig((kp.execFile as (...x: unknown[]) => kp.ChildProcess)(...a))) as typeof kp.execFile;
/** `spawn` aus node:child_process, das gestartete Programm mit niedrigerer Priorität. */
export const spawn = ((...a: unknown[]) => niedrig((kp.spawn as (...x: unknown[]) => kp.ChildProcess)(...a))) as typeof kp.spawn;
