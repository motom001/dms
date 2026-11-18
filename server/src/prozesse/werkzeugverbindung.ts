/**
 * Ablagos Seite des Werkzeugdienstes (#1354): `spawn` und `execFile` für Dokumentwerkzeuge über den Unix-Socket des
 * Dienstes (werkzeugdienst.ts). Die Aufrufer merken davon nichts: Das Ergebnis sieht aus wie bei node:child_process –
 * Ausgabe, Fehlerausgabe, Exit-Code bzw. Signal, ENOENT für ein fehlendes Programm, `killed` nach der Zeitgrenze,
 * `maxBuffer`, `encoding` und `signal` (AbortSignal).
 *
 * - Die Verbindung zu Ablago ist zugleich die Lebensader des Programms: `kill()` oder das Ende von Ablago schließt
 *   sie, und der Dienst beendet das Programm samt allem, was es gestartet hat.
 * - Startet der Dienst gerade neu (Socket fehlt oder lehnt ab), versucht es Ablago einige Sekunden lang erneut. Danach
 *   ein Fehler – Ablago startet die Werkzeuge dann nie unter seinem eigenen Benutzer, sonst wäre die Trennung umgangen.
 */
import { EventEmitter } from 'node:events';
import { connect, type Socket } from 'node:net';
import { PassThrough, Writable } from 'node:stream';
import type { ExecFileOptions, StdioOptions } from 'node:child_process';
import { speicherFehlerVon } from './werkzeuggrenzen';
import { RAHMEN, rahmen, RahmenLeser, STAND_AUFTRAG, type Auftrag } from './werkzeugprotokoll';

/** Neue Versuche, wenn der Dienst (noch) nicht lauscht: zusammen etwa 5 s. */
const VERSUCHE = 20;
const ABSTAND_MS = 250;

interface KindOptionen {
  stdio?: StdioOptions;
  zeitMs?: number;
  nice?: number;
}

const istRohr = (s: unknown) => s === undefined || s === 'pipe' || s === 'overlapped';
function rohre(stdio: StdioOptions | undefined): [boolean, boolean, boolean] {
  if (stdio === undefined || typeof stdio === 'string') {
    const r = istRohr(stdio);
    return [r, r, r];
  }
  return [istRohr(stdio[0]), istRohr(stdio[1]), istRohr(stdio[2])];
}

/** Ein Programm im Werkzeugdienst – mit den Teilen von ChildProcess, die Ablago benutzt. */
export class WerkzeugKind extends EventEmitter {
  /** Die Prozess-Id kennt nur der Dienst (anderer Benutzer); Ablago braucht sie nicht. */
  readonly pid: number | undefined = undefined;
  readonly stdin: Writable | null;
  readonly stdout: PassThrough | null;
  readonly stderr: PassThrough | null;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  private sock: Socket | null = null;
  private beendet = false;
  private verbunden = false;
  private puffer: Array<Buffer | null> = [];

  constructor(
    private socketPfad: string,
    readonly befehl: string,
    readonly args: readonly string[],
    o: KindOptionen = {},
  ) {
    super();
    const [ein, aus, err] = rohre(o.stdio);
    this.stdout = aus ? new PassThrough() : null;
    this.stderr = err ? new PassThrough() : null;
    this.stdin = ein
      ? new Writable({
          write: (stueck: Buffer, _enc, fertig) => {
            this.schreibe(stueck);
            fertig();
          },
          final: (fertig) => {
            this.schreibe(null);
            fertig();
          },
        })
      : null;
    const auftrag: Auftrag = {
      befehl,
      args: [...args],
      eingabe: ein,
      ...(o.zeitMs ? { zeitMs: o.zeitMs } : {}),
      ...(o.nice ? { nice: o.nice } : {}),
    };
    this.verbinde(`${JSON.stringify(auftrag)}\n`, 1);
  }

  private schreibe(b: Buffer | null) {
    if (!this.verbunden || !this.sock) {
      this.puffer.push(b);
      return;
    }
    this.sock.write(b === null ? rahmen(RAHMEN.einEnde, '') : rahmen(RAHMEN.ein, b));
  }

  private verbinde(kopf: string, versuch: number) {
    if (this.beendet) return;
    const s = connect({ path: this.socketPfad });
    this.sock = s;
    const leser = new RahmenLeser((art, inhalt) => this.rahmen(art, inhalt));
    s.once('connect', () => {
      this.verbunden = true;
      s.write(kopf);
      for (const b of this.puffer.splice(0)) this.schreibe(b);
      this.emit('spawn');
    });
    s.on('data', (d: Buffer) => leser.nimm(d));
    s.on('error', (e: NodeJS.ErrnoException) => {
      if (this.beendet) return;
      if (!this.verbunden && (e.code === 'ENOENT' || e.code === 'ECONNREFUSED' || e.code === 'EAGAIN') && versuch < VERSUCHE) {
        s.destroy();
        setTimeout(() => this.verbinde(kopf, versuch + 1), ABSTAND_MS).unref();
        return;
      }
      this.scheitere('EWERKZEUGDIENST', `Die Dokumentwerkzeuge sind nicht erreichbar (${e.code ?? e.message}).`);
    });
    s.on('close', () => {
      if (this.beendet || !this.verbunden) return;
      this.scheitere('EWERKZEUGDIENST', 'Der Dienst der Dokumentwerkzeuge hat die Verbindung beendet.');
    });
  }

  private rahmen(art: number, inhalt: Buffer) {
    if (this.beendet) return;
    if (art === RAHMEN.aus) this.stdout?.write(inhalt);
    else if (art === RAHMEN.err) this.stderr?.write(inhalt);
    else if (art === RAHMEN.ende) {
      const e = JSON.parse(inhalt.toString('utf8')) as { code: number | null; signal: NodeJS.Signals | null };
      this.ende(e.code, e.signal);
    } else if (art === RAHMEN.fehler) {
      const e = JSON.parse(inhalt.toString('utf8')) as { code: string; meldung: string };
      this.scheitere(e.code, e.meldung);
    }
  }

  /** Wie ein Startfehler von spawn: erst `error`, dann `close`. */
  private scheitere(code: string, meldung: string) {
    if (this.beendet) return;
    const fehler = Object.assign(new Error(meldung), {
      code,
      syscall: `spawn ${this.befehl}`,
      path: this.befehl,
      spawnargs: [...this.args],
    });
    this.beendet = true;
    this.sock?.destroy();
    this.stdout?.end();
    this.stderr?.end();
    this.emit('error', fehler);
    setImmediate(() => this.emit('close', null, null));
  }

  private ende(code: number | null, signal: NodeJS.Signals | null) {
    if (this.beendet) return;
    this.beendet = true;
    this.exitCode = code;
    this.signalCode = signal;
    this.sock?.end();
    this.stdout?.end();
    this.stderr?.end();
    this.emit('exit', code, signal);
    setImmediate(() => this.emit('close', code, signal));
  }

  kill(signal: NodeJS.Signals | number = 'SIGTERM'): boolean {
    if (this.beendet) return false;
    this.killed = true;
    this.sock?.destroy();
    this.ende(null, typeof signal === 'number' ? 'SIGKILL' : signal);
    return true;
  }
}

export function werkzeugSpawn(socketPfad: string, befehl: string, args: readonly string[], o: KindOptionen = {}): WerkzeugKind {
  return new WerkzeugKind(socketPfad, befehl, args, o);
}

type Rueckruf = (fehler: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void;

/** `execFile` über den Werkzeugdienst – Fehler und Ergebnis wie bei node:child_process. */
export function werkzeugExecFile(
  socketPfad: string,
  befehl: string,
  args: readonly string[],
  o: ExecFileOptions & { encoding?: BufferEncoding | 'buffer' | null; nice?: number } = {},
  rueckruf?: Rueckruf,
): WerkzeugKind {
  const nice = o.nice;
  const text = o.encoding !== 'buffer' && o.encoding !== null;
  const kodierung = (text ? (o.encoding ?? 'utf8') : 'utf8') as BufferEncoding;
  const max = o.maxBuffer ?? 1024 * 1024;
  const k = werkzeugSpawn(socketPfad, befehl, args, { stdio: ['ignore', 'pipe', 'pipe'], zeitMs: o.timeout || undefined, nice });
  const teile: Record<'aus' | 'err', Buffer[]> = { aus: [], err: [] };
  const laenge = { aus: 0, err: 0 };
  let fehler: Error | null = null;
  let zuLange = false;
  let gemeldet = false;
  const ergebnis = (w: 'aus' | 'err') => {
    const b = Buffer.concat(teile[w]);
    return text ? b.toString(kodierung) : b;
  };
  const melde = (e: Error | null) => {
    if (gemeldet) return;
    gemeldet = true;
    clearTimeout(uhr);
    o.signal?.removeEventListener('abort', abbruch);
    rueckruf?.(e, ergebnis('aus'), ergebnis('err'));
  };
  const sammle = (w: 'aus' | 'err', name: string) => (d: Buffer) => {
    laenge[w] += d.length;
    if (laenge[w] > max) {
      fehler ??= Object.assign(new RangeError(`${name} maxBuffer length exceeded`), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' });
      k.kill(o.killSignal ?? 'SIGTERM');
      return;
    }
    teile[w].push(d);
  };
  k.stdout!.on('data', sammle('aus', 'stdout'));
  k.stderr!.on('data', sammle('err', 'stderr'));
  const uhr = o.timeout
    ? setTimeout(() => {
        zuLange = true;
        k.kill(o.killSignal ?? 'SIGTERM');
      }, o.timeout)
    : undefined;
  const abbruch = () => {
    fehler ??= Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR', cause: o.signal?.reason });
    k.kill(o.killSignal ?? 'SIGTERM');
  };
  if (o.signal?.aborted) setImmediate(abbruch);
  else o.signal?.addEventListener('abort', abbruch, { once: true });
  k.on('error', (e: Error) => melde(e));
  k.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
    if (gemeldet) return;
    if (fehler) return melde(fehler);
    const speicher = code === 0 && !signal ? speicherFehlerVon(befehl, ergebnis('err').toString()) : null;
    if (speicher) return melde(Object.assign(new Error(speicher), { code: 'EWERKZEUGSPEICHER', killed: false, signal: null }));
    if (code === 0 && !signal) return melde(null);
    const befehlszeile = [befehl, ...args].join(' ');
    const e = Object.assign(new Error(`Command failed: ${befehlszeile}\n${ergebnis('err').toString()}`), {
      code,
      killed: k.killed || zuLange,
      signal,
      cmd: befehlszeile,
    });
    melde(e);
  });
  return k;
}

export interface WerkzeugAbschirmung {
  /** Laufen die Werkzeuge im Werkzeugdienst (eigener Benutzer)? */
  getrennt: boolean;
  /** Benutzer und Gruppe der Werkzeuge. */
  benutzer: number | null;
  gruppe: number | null;
  /** Grenzen, wie das Programm sie sieht; null = ohne Grenze. */
  speicherMb: number | null;
  cpuS: number | null;
  dateiMb: number | null;
}

const zahl = (s: string | undefined) => (s === undefined || s === 'unlimited' || !/^\d+$/.test(s) ? null : Number(s));

/** Ausgabe des Stand-Auftrags „uid gid ulimit-v ulimit-t ulimit-f“ lesen. */
export function abschirmungAus(zeile: string, getrennt: boolean): WerkzeugAbschirmung {
  const [uid, gid, v, t, f] = zeile.trim().split(/\s+/);
  const kb = zahl(v);
  const bl = zahl(f);
  return {
    getrennt,
    benutzer: zahl(uid),
    gruppe: zahl(gid),
    speicherMb: kb === null ? null : Math.round(kb / 1024),
    cpuS: zahl(t),
    dateiMb: bl === null ? null : Math.round(bl / 2048),
  };
}

/** Benutzer und Grenzen der Werkzeuge im Dienst – gemessen, nicht nur eingestellt. */
export function werkzeugStandImDienst(socketPfad: string): Promise<WerkzeugAbschirmung> {
  return new Promise((ok, nein) =>
    werkzeugExecFile(socketPfad, STAND_AUFTRAG, [], { timeout: 10_000, encoding: 'utf8' }, (e, aus) =>
      e ? nein(e) : ok(abschirmungAus(String(aus), true)),
    ),
  );
}

/** Eine Zeile fürs Protokoll und `dms status`. */
export function abschirmungText(a: WerkzeugAbschirmung): string {
  const speicher = a.speicherMb === null ? 'ohne Speichergrenze' : `höchstens ${a.speicherMb} MB Arbeitsspeicher`;
  const wer = a.getrennt
    ? `getrennt als Benutzer ${a.benutzer ?? '?'}`
    : `als Benutzer von Ablago (${a.benutzer ?? '?'}), ohne Werkzeugdienst`;
  return `Dokumentwerkzeuge laufen ${wer}, je Aufruf ${speicher}, ${a.cpuS ?? '∞'} s Rechenzeit, Dateien bis ${a.dateiMb ?? '∞'} MB`;
}
