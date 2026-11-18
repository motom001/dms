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
 * - Dokumentwerkzeuge getrennt und begrenzt (#1354): Im Image laufen sie im Werkzeugdienst unter einem eigenen Benutzer
 *   (werkzeugdienst.ts); ihre Arbeitsordner kommen aus `werkzeugOrdner`. Ohne Dienst starten sie hier, aber mit
 *   denselben Grenzen für Arbeitsspeicher, Rechenzeit und Dateigröße (werkzeuggrenzen.ts).
 */
import * as kp from 'node:child_process';
import { readdirSync } from 'node:fs';
import { chmod, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { constants as fsKonstanten } from 'node:fs';
import { getPriority, setPriority, tmpdir } from 'node:os';
import { join } from 'node:path';
import { protokoll } from '../protokoll/protokoll';
import { tDe } from '../sprache/sprache';
import { WERKZEUG_DATEI_MAX } from '../grundlagen/grenzen';
import { findeProgramm, istWerkzeug, mitGrenzen, speicherFehlerVon, werkzeugGrenzenAus } from './werkzeuggrenzen';
import { STAND_SKRIPT } from './werkzeugprotokoll';
import {
  abschirmungAus,
  abschirmungText,
  werkzeugExecFile,
  werkzeugSpawn,
  werkzeugStandImDienst,
  type WerkzeugAbschirmung,
} from './werkzeugverbindung';

export const HINTERGRUND_NICE_VORGABE = 10;
export const HINTERGRUND_NICE_MAX = 19;

export interface NiceEinstellung {
  wert: number;
  quelle: 'vorgabe' | 'umgebung';
  fehler?: string;
}

export function hintergrundNiceAus(env: Record<string, string | undefined>): NiceEinstellung {
  const roh = env.DMS_HINTERGRUND_NICE?.trim();
  if (!roh) return { wert: HINTERGRUND_NICE_VORGABE, quelle: 'vorgabe' };
  const n = Number(roh);
  if (!Number.isInteger(n) || n < 0 || n > HINTERGRUND_NICE_MAX) {
    return {
      wert: HINTERGRUND_NICE_VORGABE,
      quelle: 'vorgabe',
      fehler: tDe('meldungen.hintergrund.ungueltig', { roh, max: HINTERGRUND_NICE_MAX, wert: HINTERGRUND_NICE_VORGABE }),
    };
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
export interface Prioritaet {
  getPriority: (pid?: number) => number;
  setPriority: (pid: number, wert: number) => void;
}
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
  try {
    z = ziel(sys, n);
  } catch (e) {
    melde(e);
    return false;
  }
  for (const tid of faeden(pid)) {
    try {
      if (sys.getPriority(tid) < z) sys.setPriority(tid, z);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ESRCH') continue;
      melde(e);
      return false;
    }
  }
  return true;
}

/** Fäden eines Prozesses (Linux: /proc/<pid>/task); sonst nur der Prozess selbst. */
export function faedenVon(pid: number): number[] {
  try {
    const tids = readdirSync(`/proc/${pid}/task`)
      .map(Number)
      .filter((x) => Number.isInteger(x) && x > 0);
    if (tids.length) return tids;
  } catch {
    /* kein /proc: nur der Prozess */
  }
  return [pid];
}

/** Programme, die gerade laufen (#1203): beim Ende von Ablago beenden. */
const laufend = new Set<kp.ChildProcess>();
let endeVerbunden = false;

/** Alle noch laufenden Programme beenden (synchron, auch im Ereignis `exit`). Ergebnis: wie viele. */
export function beendeProgramme(signal: NodeJS.Signals = 'SIGKILL'): number {
  let n = 0;
  for (const k of laufend) {
    if (k.exitCode === null && k.signalCode === null) {
      try {
        if (k.kill(signal)) n++;
      } catch {
        /* schon weg */
      }
    }
  }
  laufend.clear();
  return n;
}

/** Kindprozess gleich nach dem Start senken und bis zu seinem Ende merken. */
export function niedrig<T extends kp.ChildProcess>(kind: T): T {
  if (kind.pid) senkePrioritaet(kind.pid);
  if (kind.pid) {
    laufend.add(kind);
    kind.once('exit', () => laufend.delete(kind));
    if (!endeVerbunden) {
      endeVerbunden = true;
      process.once('exit', () => {
        beendeProgramme();
      });
    }
  }
  return kind;
}

/* ---------- Dokumentwerkzeuge getrennt und begrenzt (#1354) ---------- */

/**
 * Socket des Werkzeugdienstes (DMS_WERKZEUG_DIENST, setzt das Start-Skript des Images): Dann laufen alle Programme
 * von hier im Dienst unter dessen Benutzer, nie unter dem von Ablago. Ohne (Entwicklung, Container mit `--user`)
 * starten die Werkzeuge direkt, aber mit denselben Grenzen.
 */
const dienst = () => process.env.DMS_WERKZEUG_DIENST || null;
const grenzen = () => werkzeugGrenzenAus(process.env);

/**
 * Arbeitsordner für ein Werkzeug (statt `mkdtemp(join(tmpdir(), …))`): mit dem Werkzeugdienst unter
 * DMS_WERKZEUG_ARBEIT, für die gemeinsame Gruppe les- und schreibbar (2770) – sonst wie bisher im Ordner für
 * temporäre Dateien. Der Aufrufer räumt ihn wie bisher mit `rm` auf.
 */
export async function werkzeugOrdner(vorsilbe: string): Promise<string> {
  const arbeit = process.env.DMS_WERKZEUG_ARBEIT;
  if (!dienst() || !arbeit) return mkdtemp(join(tmpdir(), vorsilbe));
  const d = await mkdtemp(join(arbeit, vorsilbe));
  await chmod(d, 0o2770);
  return d;
}

/**
 * Ein- und Ausgaben in einem Arbeitsordner der Werkzeuge (#1354). Die Werkzeuge dürfen in den Ordner schreiben – ein
 * Werkzeug, das ein präpariertes PDF übernommen hat, könnte dort statt einer Ausgabe einen Symlink (z. B. auf
 * /data/geheim/…), eine FIFO oder einen Hardlink anlegen. Darum liest und schreibt Ablago dort nur über diese drei:
 *
 * - `liesWerkzeugDatei`: öffnet ohne Symlinks zu folgen (`O_NOFOLLOW`) und ohne zu warten (`O_NONBLOCK`, für FIFOs),
 *   prüft am geöffneten Handle: reguläre Datei, nur ein Link, nicht größer als `max`.
 * - `schreibeWerkzeugDatei`: entfernt einen vorhandenen Eintrag (`rm` folgt keinem Symlink) und legt die Datei nur
 *   neu an (`wx`, also `O_CREAT|O_EXCL`: scheitert an jedem Eintrag mit dem Namen, auch an einem Symlink).
 * - `werkzeugDateien`: nur reguläre Dateien (`withFileTypes`), keine Symlinks, Ordner oder FIFOs.
 *
 * Ohne Werkzeugdienst gilt dasselbe; in einem frischen Ordner ändert es nichts am Ergebnis.
 */
export async function liesWerkzeugDatei(pfad: string, max = WERKZEUG_DATEI_MAX) {
  const fh = await open(pfad, fsKonstanten.O_RDONLY | fsKonstanten.O_NOFOLLOW | fsKonstanten.O_NONBLOCK);
  try {
    const st = await fh.stat();
    if (!st.isFile() || st.nlink !== 1 || st.size > max)
      throw Object.assign(new Error(`Ausgabe des Werkzeugs ist keine einfache Datei: ${pfad}`), { code: 'EWERKZEUGDATEI' });
    return await fh.readFile();
  } finally {
    await fh.close();
  }
}

export async function schreibeWerkzeugDatei(pfad: string, inhalt: string | Uint8Array): Promise<void> {
  await rm(pfad, { force: true });
  await writeFile(pfad, inhalt, { flag: 'wx' });
}

export async function werkzeugDateien(ordner: string): Promise<string[]> {
  return (await readdir(ordner, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
}

/** Direkt (ohne Dienst): ein Werkzeug mit Grenzen – fehlt es, bleibt der Aufruf unverändert (ENOENT wie gewohnt). */
function direkt(befehl: unknown, args: unknown): { befehl: unknown; args: unknown } {
  if (typeof befehl !== 'string' || !istWerkzeug(befehl)) return { befehl, args };
  const g = grenzen();
  const pfad = findeProgramm(befehl);
  if (!pfad) return { befehl, args };
  const a = mitGrenzen(pfad, Array.isArray(args) ? (args as string[]) : [], g);
  return { befehl: a.befehl, args: a.args };
}

/** Argumente von execFile/spawn: (befehl, args?, optionen?, rückruf?). */
function zerlege(a: unknown[]) {
  const [befehl, ...rest] = a;
  const args = Array.isArray(rest[0]) ? (rest.shift() as string[]) : [];
  const optionen = rest[0] && typeof rest[0] === 'object' ? (rest.shift() as Record<string, unknown>) : {};
  const rueckruf = typeof rest[0] === 'function' ? (rest[0] as (...x: unknown[]) => void) : undefined;
  return { befehl: String(befehl), args, optionen, rueckruf };
}

/** `execFile` aus node:child_process, das gestartete Programm mit niedrigerer Priorität (und getrennt, #1354). */
export const execFile = ((...a: unknown[]) => {
  const s = dienst();
  if (s) {
    const z = zerlege(a);
    return werkzeugExecFile(s, z.befehl, z.args, { ...z.optionen, nice: hintergrundNice() }, z.rueckruf);
  }
  const befehl = String(a[0]);
  const d = direkt(a[0], Array.isArray(a[1]) ? a[1] : undefined);
  if (d.befehl !== a[0]) a = [d.befehl, d.args, ...a.slice(Array.isArray(a[1]) ? 2 : 1)];
  // Wie mit dem Dienst: An der Speichergrenze gilt es als Fehler (auch mit Exit-Code 0), mit Hinweis auf den Schalter.
  const r = a.findIndex((x) => typeof x === 'function');
  if (r > 0) {
    const weiter = a[r] as (e: unknown, aus: unknown, err: unknown) => void;
    a[r] = (e: unknown, aus: unknown, err: unknown) => {
      const speicher = speicherFehlerVon(befehl, String(err ?? ''));
      if (!speicher) return weiter(e, aus, err);
      const f = Object.assign(new Error(speicher), { code: 'EWERKZEUGSPEICHER', killed: false, signal: null });
      weiter(f, aus, Buffer.isBuffer(err) ? Buffer.concat([err, Buffer.from(`\n${speicher}`)]) : `${String(err ?? '')}\n${speicher}`);
    };
  }
  return niedrig((kp.execFile as (...x: unknown[]) => kp.ChildProcess)(...a));
}) as typeof kp.execFile;
/** `spawn` aus node:child_process, das gestartete Programm mit niedrigerer Priorität (und getrennt, #1354). */
export const spawn = ((...a: unknown[]) => {
  const s = dienst();
  if (s) {
    const z = zerlege(a);
    return werkzeugSpawn(s, z.befehl, z.args, { stdio: z.optionen.stdio as kp.StdioOptions, nice: hintergrundNice() });
  }
  const d = direkt(a[0], Array.isArray(a[1]) ? a[1] : undefined);
  if (d.befehl !== a[0]) a = [d.befehl, d.args, ...a.slice(Array.isArray(a[1]) ? 2 : 1)];
  return niedrig((kp.spawn as (...x: unknown[]) => kp.ChildProcess)(...a));
}) as typeof kp.spawn;

/**
 * Beim Start ins Protokoll (#1354, nur der erste Prozess): Warnung, wenn Ablago im Container als root läuft, und – gemessen – Benutzer und
 * Grenzen der Dokumentwerkzeuge.
 */
export function meldeBenutzer(
  log: { info(t: string): void; warn(t: string): void },
  env: Record<string, string | undefined>,
  leiter = true,
) {
  if (!leiter) return;
  if (process.getuid?.() === 0 && env.NODE_ENV === 'production')
    log.warn('Ablago läuft als root – das Start-Skript des Images wechselt sonst zu einem eigenen Benutzer (PUID, Vorgabe 1000).');
  void werkzeugAbschirmung().then(
    (a) => log.info(abschirmungText(a)),
    (e) => log.warn(`Dokumentwerkzeuge: Benutzer und Grenzen nicht feststellbar – ${(e as Error).message}`),
  );
}

/**
 * Unter welchem Benutzer und mit welchen Grenzen laufen die Werkzeuge (Systemzustand, `dms status`, Probe im Image)?
 * Mit Dienst gemessen im Dienst; ohne gemessen mit demselben Aufruf hier.
 */
export async function werkzeugAbschirmung(): Promise<WerkzeugAbschirmung> {
  const s = dienst();
  if (s) return werkzeugStandImDienst(s);
  const g = grenzen();
  const a = mitGrenzen('/bin/sh', ['-c', STAND_SKRIPT], g);
  const aus = await new Promise<string>((ok, nein) =>
    kp.execFile(a.befehl, a.args, { timeout: 10_000, encoding: 'utf8' }, (e, o) => (e ? nein(e) : ok(o))),
  );
  return abschirmungAus(aus, false);
}
