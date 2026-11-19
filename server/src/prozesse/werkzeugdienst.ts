/**
 * Werkzeugdienst (#1354): startet die Dokumentwerkzeuge (poppler, qpdf) für Ablago – als eigener, unprivilegierter
 * Benutzer und mit Grenzen (werkzeuggrenzen.ts). Im Image startet ihn das Start-Skript als `ablago-werkzeug`, bevor
 * es zum Benutzer von Ablago wechselt; Ablago spricht ihn über einen Unix-Socket an (werkzeugverbindung.ts).
 *
 * So erreicht ein fehlerhaftes oder bösartiges PDF, das ein Werkzeug aus dem Tritt bringt, weder den Prozess von
 * Ablago noch dessen Daten: Der Benutzer darf nur in seinen Arbeitsordner schreiben, `/data` gehört Ablago, und
 * Signale an Ablago oder ein Blick in dessen Umgebung gehen unter einem anderen Benutzer nicht.
 *
 * - Nur Programme aus `WERKZEUGE`, mit vollem Pfad aus dem Suchpfad, über das Startprogramm mit den Grenzen; die Umgebung ist knapp (Suchpfad, Sprache,
 *   Zeitzone, fontconfig) – keine Variablen von Ablago.
 * - Jedes Programm in einer eigenen Prozessgruppe: Zeitgrenze erreicht oder Verbindung weg → SIGKILL an die Gruppe.
 * - umask 007: Ausgaben sind für die Gruppe lesbar (Ablago gehört ihr an), für andere nicht.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { getPriority, setPriority } from 'node:os';
import { findeProgramm, mitGrenzen, werkzeugName, werkzeugGrenzenAus, WERKZEUG_ZEIT_MAX_MS, type WerkzeugGrenzen } from './werkzeuggrenzen';
import { AUFTRAG_MAX, RAHMEN, rahmen, RahmenLeser, STAND_AUFTRAG, STAND_SKRIPT, type Auftrag } from './werkzeugprotokoll';

/** Höchstens so viele Programme gleichzeitig; mehr lehnt der Dienst ab (EAGAIN), statt den Rechner zu überladen. */
const GLEICHZEITIG_MAX = 32;
/** Nach der Zeitgrenze des Aufrufers noch so lange, bevor der Dienst selbst beendet (Ablago beendet meist vorher). */
const NACHLAUF_MS = 2000;

export interface DienstOptionen {
  socket: string;
  env: Record<string, string | undefined>;
  /** Startordner der Programme (HOME, z. B. für den Zwischenspeicher von fontconfig). */
  heim?: string;
  log?: (zeile: string) => void;
}

/** Umgebung der Programme: nur, was sie brauchen. */
function werkzeugUmgebung(env: Record<string, string | undefined>, heim: string): Record<string, string> {
  const aus: Record<string, string> = { PATH: env.PATH || '/usr/local/bin:/usr/bin:/bin', HOME: heim };
  for (const [k, v] of Object.entries(env)) if (v !== undefined && /^(LANG|LC_[A-Z]+|TZ|FONTCONFIG_[A-Z]+)$/.test(k)) aus[k] = v;
  return aus;
}

function pruefeAuftrag(x: unknown): Auftrag | null {
  const a = x as Partial<Auftrag> | null;
  if (!a || typeof a.befehl !== 'string' || !Array.isArray(a.args) || !a.args.every((s) => typeof s === 'string')) return null;
  if (a.zeitMs !== undefined && (typeof a.zeitMs !== 'number' || !(a.zeitMs > 0))) return null;
  if (a.nice !== undefined && (typeof a.nice !== 'number' || !Number.isInteger(a.nice))) return null;
  return { befehl: a.befehl, args: a.args, zeitMs: a.zeitMs, eingabe: a.eingabe === true, nice: a.nice };
}

/** Was alle Verbindungen teilen. */
interface Dienst {
  grenzen: WerkzeugGrenzen;
  heim: string;
  umgebung: Record<string, string>;
  laufend: Set<ChildProcess>;
}

/** Programm samt Gruppe hart beenden (Zeitgrenze, Verbindung weg, Dienst endet). */
function beende(k: ChildProcess) {
  if (k.exitCode !== null || k.signalCode !== null || !k.pid) return;
  try {
    process.kill(-k.pid, 'SIGKILL');
  } catch {
    try {
      k.kill('SIGKILL');
    } catch {
      /* schon weg */
    }
  }
}

/** Eine Verbindung: Antworten an Ablago und das gestartete Programm. */
class Verbindung {
  kind: ChildProcess | null = null;
  private fertig = false;
  constructor(readonly s: Socket) {}
  sende(b: Buffer) {
    if (!this.s.destroyed) this.s.write(b);
  }
  schluss(b: Buffer) {
    if (this.fertig) return;
    this.fertig = true;
    if (!this.s.destroyed) this.s.end(b);
  }
  fehler(code: string, meldung: string) {
    this.schluss(rahmen(RAHMEN.fehler, JSON.stringify({ code, meldung })));
  }
}

/** Programm und Argumente eines Auftrags, mit Grenzen; null, wenn es nicht erlaubt ist oder fehlt (Antwort ist dann raus). */
function aufrufFuer(d: Dienst, v: Verbindung, a: Auftrag): { befehl: string; args: string[] } | null {
  const stand = a.befehl === STAND_AUFTRAG;
  const name = stand ? null : werkzeugName(a.befehl);
  if (!stand && !name) return (v.fehler('EACCES', `${a.befehl} gehört nicht zu den Dokumentwerkzeugen`), null);
  if (d.laufend.size >= GLEICHZEITIG_MAX) return (v.fehler('EAGAIN', 'zu viele Werkzeuge gleichzeitig'), null);
  // Gestartet wird der Name aus der Liste (im Suchpfad des Dienstes), nicht der Text aus dem Auftrag.
  const pfad = stand ? '/bin/sh' : findeProgramm(name!, d.umgebung.PATH);
  if (!pfad) return (v.fehler('ENOENT', `spawn ${a.befehl} ENOENT`), null);
  return mitGrenzen(pfad, stand ? ['-c', `PATH="$PATH:/usr/bin:/bin"; ${STAND_SKRIPT}`] : a.args, d.grenzen);
}

/** Standardeingabe aus den Rahmen von Ablago an das Programm. */
function leiteEingabe(k: ChildProcess, s: Socket, rest: Buffer) {
  const ein = k.stdin;
  if (!ein) return;
  ein.on('error', () => {});
  const leser = new RahmenLeser((art, inhalt) => {
    if (art === RAHMEN.ein) ein.write(inhalt);
    else if (art === RAHMEN.einEnde) ein.end();
  });
  if (rest.length) leser.nimm(rest);
  s.on('data', (d: Buffer) => leser.nimm(d));
}

function starte(d: Dienst, v: Verbindung, a: Auftrag, rest: Buffer) {
  const aufruf = aufrufFuer(d, v, a);
  if (!aufruf) return;
  let k: ChildProcess;
  try {
    k = spawn(aufruf.befehl, aufruf.args, {
      cwd: d.heim,
      env: d.umgebung,
      detached: true,
      stdio: [a.eingabe ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return v.fehler((e as NodeJS.ErrnoException).code ?? 'EIO', (e as Error).message);
  }
  v.kind = k;
  d.laufend.add(k);
  if (k.pid && a.nice) {
    try {
      setPriority(k.pid, Math.min(19, getPriority(0) + a.nice));
    } catch {
      /* ohne niedrigere Priorität weiter */
    }
  }
  // Zeitgrenze des Aufrufers, höchstens WERKZEUG_ZEIT_MAX_MS.
  const grenze = a.zeitMs !== undefined && a.zeitMs > 0 && a.zeitMs < WERKZEUG_ZEIT_MAX_MS ? a.zeitMs : WERKZEUG_ZEIT_MAX_MS;
  const zeit = setTimeout(() => beende(k), grenze + NACHLAUF_MS);
  k.stdout!.on('data', (b: Buffer) => v.sende(rahmen(RAHMEN.aus, b)));
  k.stderr!.on('data', (b: Buffer) => v.sende(rahmen(RAHMEN.err, b)));
  leiteEingabe(k, v.s, rest);
  const vorbei = () => {
    clearTimeout(zeit);
    d.laufend.delete(k);
  };
  k.on('error', (e: NodeJS.ErrnoException) => {
    vorbei();
    v.fehler(e.code ?? 'EIO', e.message);
  });
  k.on('close', (code, signal) => {
    vorbei();
    v.schluss(rahmen(RAHMEN.ende, JSON.stringify({ code, signal })));
  });
}

/** Eine Verbindung bedienen: erst die Zeile mit dem Auftrag, dann das Programm. */
function bediene(d: Dienst, s: Socket) {
  const v = new Verbindung(s);
  let kopf: Buffer = Buffer.alloc(0);
  s.on('error', () => {});
  s.on('close', () => {
    if (v.kind) beende(v.kind);
  });
  s.on('data', function erstes(b: Buffer) {
    kopf = kopf.length ? Buffer.concat([kopf, b]) : b;
    const nl = kopf.indexOf(10);
    if (nl < 0) {
      if (kopf.length > AUFTRAG_MAX) {
        s.off('data', erstes);
        v.fehler('EINVAL', 'Auftrag zu lang');
      }
      return;
    }
    s.off('data', erstes);
    let auftrag: Auftrag | null = null;
    try {
      auftrag = pruefeAuftrag(JSON.parse(kopf.subarray(0, nl).toString('utf8')));
    } catch {
      /* unten */
    }
    if (!auftrag) return v.fehler('EINVAL', 'Auftrag ungültig');
    starte(d, v, auftrag, kopf.subarray(nl + 1));
  });
}

export function starteWerkzeugdienst(o: DienstOptionen): Promise<Server> {
  const grenzen = werkzeugGrenzenAus(o.env);
  const heim = o.heim ?? o.env.HOME ?? '/tmp';
  const d: Dienst = { grenzen, heim, umgebung: werkzeugUmgebung(o.env, heim), laufend: new Set() };
  const log = o.log ?? ((z: string) => console.error(`[werkzeuge] ${z}`));
  if (grenzen.fehler) log(grenzen.fehler);
  process.umask(0o007);
  const server = createServer((s) => bediene(d, s));
  rmSync(o.socket, { force: true });
  return new Promise((ok, nein) => {
    server.once('error', nein);
    server.listen(o.socket, () => {
      server.off('error', nein);
      // Nur Besitzer und Gruppe (Ablago gehört der Gruppe an).
      chmodSync(o.socket, 0o660);
      const speicher = grenzen.speicherMb === null ? 'ohne Grenze' : `${grenzen.speicherMb} MB`;
      log(`bereit (Benutzer ${process.getuid?.() ?? '?'}, Arbeitsspeicher je Werkzeug ${speicher})`);
      server.on('close', () => {
        for (const k of d.laufend) beende(k);
      });
      ok(server);
    });
  });
}
