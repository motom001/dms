/**
 * Dokumentwerkzeuge getrennt und begrenzt (#1354): Grenzen und Aufruf für `pdftoppm`, `pdftotext`, `qpdf` und die
 * anderen Programme, die Ablago für PDFs startet. Gemeinsam für den Werkzeugdienst (werkzeugdienst.ts, eigener Benutzer
 * im Image) und den Aufruf ohne ihn (Entwicklung, Container mit `--user`).
 *
 * - Jedes Programm startet über `sh -c 'ulimit …; exec "$@"'`: Grenzen für Arbeitsspeicher (Adressraum), Rechenzeit
 *   und Größe einer geschriebenen Datei. `ulimit` setzt weiche und harte Grenze; das Programm kann sie nicht anheben.
 *   Das braucht keine Rechte und kein zusätzliches Paket (busybox, dash und bash kennen dieselben Schalter).
 * - Wird eine Grenze erreicht, endet nur dieses Programm (Speicher: die Anforderung scheitert; Rechenzeit: SIGXCPU,
 *   dann SIGKILL; Dateigröße: SIGXFSZ). Der Aufrufer bekommt einen gewöhnlichen Fehler wie bei einem kaputten PDF.
 * - Lässt sich eine Grenze nicht setzen, weil schon eine strengere gilt, bleibt die strengere.
 */
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

/** Programme, die der Werkzeugdienst startet. Andere lehnt er ab. */
const WERKZEUGE: ReadonlySet<string> = new Set([
  'pdftoppm',
  'pdftotext',
  'pdfinfo',
  'pdffonts',
  'pdfimages',
  'pdftocairo',
  'pdfseparate',
  'pdfunite',
  'pdfdetach',
  'pdfattach',
  'pdftohtml',
  'pdfsig',
  'qpdf',
  'gs',
  'tesseract',
]);

/** Vorgabe für den Arbeitsspeicher eines Werkzeugs (MB); `DMS_WERKZEUG_SPEICHER_MB`. */
export const WERKZEUG_SPEICHER_MB_VORGABE = 1024;
const WERKZEUG_SPEICHER_MB_MIN = 128;
const WERKZEUG_SPEICHER_MB_MAX = 65_536;
/** Rechenzeit je Aufruf (s) – nur als Rückhalt; die Aufrufer setzen eigene, kürzere Zeitgrenzen (Wanduhr). */
const WERKZEUG_CPU_S = 900;
/** Größte Datei, die ein Werkzeug schreiben darf (MB), z. B. ein Rasterbild einer riesigen Seite. */
const WERKZEUG_DATEI_MB = 2048;
/** Längste Laufzeit eines Aufrufs ohne eigene Zeitgrenze (ms). */
export const WERKZEUG_ZEIT_MAX_MS = 15 * 60_000;

export interface WerkzeugGrenzen {
  /** Arbeitsspeicher in MB; null = ohne Grenze (`DMS_WERKZEUG_SPEICHER_MB=0`). */
  speicherMb: number | null;
  cpuS: number;
  dateiMb: number;
  /** Ungültiger Wert in der Umgebung: Hinweis fürs Protokoll. */
  fehler?: string;
}

/** Grenzen aus der Umgebung. */
export function werkzeugGrenzenAus(env: Record<string, string | undefined>): WerkzeugGrenzen {
  const basis = { cpuS: WERKZEUG_CPU_S, dateiMb: WERKZEUG_DATEI_MB };
  const roh = env.DMS_WERKZEUG_SPEICHER_MB?.trim();
  if (!roh) return { ...basis, speicherMb: WERKZEUG_SPEICHER_MB_VORGABE };
  const n = Number(roh);
  if (n === 0) return { ...basis, speicherMb: null };
  if (!Number.isInteger(n) || n < WERKZEUG_SPEICHER_MB_MIN || n > WERKZEUG_SPEICHER_MB_MAX)
    return {
      ...basis,
      speicherMb: WERKZEUG_SPEICHER_MB_VORGABE,
      fehler: `DMS_WERKZEUG_SPEICHER_MB=${roh} ist ungültig (0 oder ${WERKZEUG_SPEICHER_MB_MIN}–${WERKZEUG_SPEICHER_MB_MAX}); es gilt ${WERKZEUG_SPEICHER_MB_VORGABE}.`,
    };
  return { ...basis, speicherMb: n };
}

/**
 * Das Skript vor dem Programm: Grenzen setzen, dann das Programm an seine Stelle (`exec`, gleiche PID).
 * $1 Speicher in KB (leer = ohne), $2 Rechenzeit in s, $3 Dateigröße in Blöcken zu 512 Byte, danach das Programm.
 */
const SKRIPT =
  'if [ -n "$1" ]; then ulimit -v "$1" 2>/dev/null || :; fi; ulimit -t "$2" 2>/dev/null || :; ulimit -f "$3" 2>/dev/null || :; shift 3; exec "$@"';

/** Aufruf mit Grenzen: `sh` mit dem Skript, danach das Programm (mit vollem Pfad) und seine Argumente. */
export function mitGrenzen(programm: string, args: readonly string[], g: WerkzeugGrenzen): { befehl: string; args: string[] } {
  const kb = g.speicherMb === null ? '' : String(g.speicherMb * 1024);
  return { befehl: '/bin/sh', args: ['-c', SKRIPT, 'werkzeug', kb, String(g.cpuS), String(g.dateiMb * 2048), programm, ...args] };
}

/** Programm im Suchpfad finden (wie `spawn`); null, wenn es fehlt. So bleibt „fehlt“ ein ENOENT wie ohne Grenzen. */
export function findeProgramm(name: string, pfad = process.env.PATH ?? ''): string | null {
  const ausfuehrbar = (p: string) => {
    try {
      accessSync(p, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  if (name.includes('/')) return isAbsolute(name) && ausfuehrbar(name) ? name : null;
  for (const d of pfad.split(delimiter)) {
    if (!d) continue;
    const p = join(d, name);
    if (ausfuehrbar(p)) return p;
  }
  return null;
}

/** Ein Werkzeug nach seinem Namen (auch mit Pfad, z. B. /usr/bin/qpdf). */
export const istWerkzeug = (befehl: string) => WERKZEUGE.has(befehl.slice(befehl.lastIndexOf('/') + 1));

/**
 * poppler meldet eine gescheiterte Speicheranforderung nur auf der Fehlerausgabe („Out of memory“, „Bogus memory
 * allocation size“) und endet trotzdem mit 0 – das Ergebnis ist dann leer oder kaputt (etwa ein Rasterbild ohne
 * Bildpunkte). Mit der Speichergrenze passiert das bei riesigen Seiten; als Fehler gilt es darum immer.
 */
export function speicherFehlerVon(befehl: string, stderr: string): string | null {
  const name = befehl.slice(befehl.lastIndexOf('/') + 1);
  if (!name.startsWith('pdf')) return null;
  const m = /^(Out of memory|Bogus memory allocation size)\b.*$/m.exec(stderr);
  return m
    ? `${name}: ${m[0]} – das PDF braucht mehr Arbeitsspeicher, als ein Dokumentwerkzeug haben darf (DMS_WERKZEUG_SPEICHER_MB).`
    : null;
}
