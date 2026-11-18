/**
 * Dokumentwerkzeuge getrennt und begrenzt (#1354): Werkzeugdienst und Ablagos Seite davon. Statt poppler und qpdf
 * laufen hier kleine Skripte unter deren Namen – so lassen sich Zeitgrenze, Speichergrenze, Standardeingabe und das
 * Ende ganzer Prozessgruppen prüfen. Den eigenen Benutzer im Image prüft die Probe in der CI (komplett-probe.sh).
 */
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  execFile,
  liesWerkzeugDatei,
  schreibeWerkzeugDatei,
  spawn,
  werkzeugAbschirmung,
  werkzeugDateien,
  werkzeugOrdner,
} from '../src/prozesse/hintergrund';
import { starteWerkzeugdienst } from '../src/prozesse/werkzeugdienst';
import { WERKZEUG_SPEICHER_MB_VORGABE } from '../src/grundlagen/grenzen';
import { werkzeugGrenzenAus } from '../src/prozesse/werkzeuggrenzen';
import { abschirmungText } from '../src/prozesse/werkzeugverbindung';

const tmp = mkdtempSync(join(tmpdir(), 'dms-b-werkzeuge-'));
const bin = join(tmp, 'bin');
mkdirSync(bin);
const skript = (name: string, inhalt: string) => {
  writeFileSync(join(bin, name), `#!/bin/sh\n${inhalt}\n`);
  chmodSync(join(bin, name), 0o755);
};
// pdfinfo: Ausgabe, Fehlerausgabe und Exit-Code aus den Argumenten.
skript('pdfinfo', 'echo "Pages: $1"; echo "Warnung $2" >&2; exit "${3:-0}"');
// pdftoppm: startet ein Kind und wartet; beide PIDs in die Datei $1.
skript('pdftoppm', '/bin/sleep 30 & echo "$! $$" > "$1"; wait');
// qpdf: erste Zeile der Standardeingabe – nur ihre Länge auf die Fehlerausgabe.
skript('qpdf', 'read -r zeile; echo "${#zeile}" >&2');
// pdffonts: holt 300 MB Arbeitsspeicher auf einmal.
skript('pdffonts', 'exec /bin/dd if=/dev/zero of=/dev/null bs=300M count=1');
// pdftocairo: wie poppler, wenn eine Speicheranforderung scheitert – Meldung, aber Exit-Code 0.
skript('pdftocairo', 'echo "Syntax Warning: egal" >&2; echo "Out of memory" >&2; exit 0');
// pdfimages: wie ein übernommenes Werkzeug – legt statt seiner Ausgabe einen Symlink auf die Datei $1 als $2 an.
skript('pdfimages', '/bin/ln -s "$1" "$2"');
// pdftotext: 3 MB Ausgabe.
skript('pdftotext', '/usr/bin/head -c 3000000 /dev/zero');

// Nur die Skripte: So fehlt jedes andere Werkzeug (ENOENT), auch wenn poppler auf dem Rechner liegt.
const PFAD = bin;
const dienste: Server[] = [];
async function dienst(name: string, env: Record<string, string> = {}): Promise<string> {
  const socket = join(tmp, `${name}.sock`);
  dienste.push(await starteWerkzeugdienst({ socket, env: { PATH: PFAD, ...env }, heim: tmp, log: () => {} }));
  return socket;
}

type Ergebnis = { e: (Error & { code?: unknown; killed?: boolean; signal?: unknown }) | null; aus: string; err: string };
const lauf = (befehl: string, args: string[], o: Record<string, unknown> = {}) =>
  new Promise<Ergebnis>((ok) =>
    execFile(befehl, args, { encoding: 'utf8', ...o }, (e, aus, err) => ok({ e: e as Ergebnis['e'], aus: String(aus), err: String(err) })),
  );

/** Läuft der Prozess noch? Ein Zombie (beendet, nur noch nicht abgeholt) zählt als beendet. */
const lebt = (pid: number) => {
  try {
    return readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2] !== 'Z';
  } catch {
    try {
      process.kill(pid, 0);
      return !existsSync('/proc/self');
    } catch {
      return false;
    }
  }
};

let alt: Record<string, string | undefined>;
before(() => {
  alt = {
    d: process.env.DMS_WERKZEUG_DIENST,
    a: process.env.DMS_WERKZEUG_ARBEIT,
    s: process.env.DMS_WERKZEUG_SPEICHER_MB,
    p: process.env.PATH,
  };
});
after(async () => {
  for (const s of dienste) await new Promise((r) => s.close(r));
  const setze = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  setze('DMS_WERKZEUG_DIENST', alt.d);
  setze('DMS_WERKZEUG_ARBEIT', alt.a);
  setze('DMS_WERKZEUG_SPEICHER_MB', alt.s);
  setze('PATH', alt.p);
  rmSync(tmp, { recursive: true, force: true });
});

describe('Grenzen der Dokumentwerkzeuge (#1354)', () => {
  it('Vorgabe 1024 MB, 0 = ohne Speichergrenze, Ungültiges mit Hinweis', () => {
    assert.equal(werkzeugGrenzenAus({}).speicherMb, WERKZEUG_SPEICHER_MB_VORGABE);
    assert.equal(werkzeugGrenzenAus({ DMS_WERKZEUG_SPEICHER_MB: ' 512 ' }).speicherMb, 512);
    assert.equal(werkzeugGrenzenAus({ DMS_WERKZEUG_SPEICHER_MB: '0' }).speicherMb, null);
    for (const roh of ['64', 'viel', '1.5', '100000']) {
      const g = werkzeugGrenzenAus({ DMS_WERKZEUG_SPEICHER_MB: roh });
      assert.equal(g.speicherMb, WERKZEUG_SPEICHER_MB_VORGABE, roh);
      assert.match(g.fehler ?? '', /ungültig/, roh);
    }
  });
});

describe('Werkzeugdienst (#1354)', () => {
  let socket: string;
  before(async () => {
    socket = await dienst('normal', { DMS_WERKZEUG_SPEICHER_MB: '256' });
    process.env.DMS_WERKZEUG_DIENST = socket;
  });

  it('execFile: Ausgabe, Fehlerausgabe und Exit-Code wie bei node:child_process', async () => {
    const r = await lauf('pdfinfo', ['3', 'a']);
    assert.equal(r.e, null);
    assert.equal(r.aus, 'Pages: 3\n');
    assert.equal(r.err, 'Warnung a\n');
    const f = await lauf('pdfinfo', ['1', 'kaputt', '7']);
    assert.equal(f.e?.code, 7);
    assert.equal(f.e?.killed, false);
    assert.match(f.e!.message, /Command failed: pdfinfo 1 kaputt 7\nWarnung kaputt/);
    const b = await new Promise<Buffer>((ok, nein) =>
      execFile('pdfinfo', ['2'], { encoding: 'buffer' }, (e, aus) => (e ? nein(e) : ok(aus as unknown as Buffer))),
    );
    assert.ok(Buffer.isBuffer(b), 'encoding buffer');
  });

  it('fehlendes Werkzeug: ENOENT; anderes Programm: abgelehnt', async () => {
    assert.equal((await lauf('pdfdetach', [])).e?.code, 'ENOENT');
    const r = await lauf('sleep', ['1']);
    assert.equal(r.e?.code, 'EACCES');
    assert.match(r.e!.message, /gehört nicht zu den Dokumentwerkzeugen/);
  });

  it('Zeitgrenze: killed, das Programm und sein Kind sind weg', async () => {
    const pids = join(tmp, 'pids');
    const t0 = Date.now();
    const r = await lauf('pdftoppm', [pids], { timeout: 500 });
    assert.equal(r.e?.killed, true);
    assert.equal(r.e?.signal, 'SIGTERM');
    const [kind, eltern] = readFileSync(pids, 'utf8').trim().split(' ').map(Number);
    for (let i = 0; i < 60 && (lebt(kind) || lebt(eltern)); i++) await new Promise((x) => setTimeout(x, 50));
    assert.equal(lebt(eltern), false, 'Programm beendet');
    assert.equal(lebt(kind), false, 'auch sein Kind (ganze Prozessgruppe)');
    assert.ok(Date.now() - t0 < 2000, `gleich mit der Zeitgrenze, nicht erst nach dem Nachlauf des Dienstes (${Date.now() - t0} ms)`);
  });

  it('spawn: Standardeingabe über den Dienst, kill wie gewohnt', async () => {
    const p = spawn('qpdf', [], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr!.on('data', (d: Buffer) => (err += d.toString()));
    p.stdin!.write('geheimes-passwort\n');
    p.stdin!.end();
    const [code, signal] = await new Promise<[number | null, string | null]>((ok) => p.on('close', (c, s) => ok([c, s])));
    assert.deepEqual([code, signal, err.trim()], [0, null, '17']);
    const q = spawn('pdftoppm', [join(tmp, 'pids2')], { stdio: ['pipe', 'ignore', 'pipe'] });
    setTimeout(() => q.kill('SIGKILL'), 200);
    const s = await new Promise((ok) => q.on('close', (_c, sig) => ok(sig)));
    assert.equal(s, 'SIGKILL');
  });

  it('maxBuffer und AbortSignal wie bei node:child_process', async () => {
    const r = await lauf('pdftotext', [], { maxBuffer: 1024 * 1024 });
    assert.equal(r.e?.code, 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
    const ab = new AbortController();
    setTimeout(() => ab.abort(), 200);
    const a = await lauf('pdftoppm', [join(tmp, 'pids3')], { signal: ab.signal });
    assert.equal(a.e?.name, 'AbortError');
  });

  it('Speichergrenze: nur das Werkzeug scheitert, der Dienst arbeitet weiter', async () => {
    const r = await lauf('pdffonts', []);
    assert.ok(r.e, 'dd mit 300 MB scheitert unter 256 MB');
    assert.equal((await lauf('pdfinfo', ['5'])).aus, 'Pages: 5\n', 'nächster Aufruf geht');
    process.env.DMS_WERKZEUG_DIENST = await dienst('ohne-grenze', { DMS_WERKZEUG_SPEICHER_MB: '0' });
    try {
      assert.equal((await lauf('pdffonts', [])).e, null, 'ohne Grenze geht es');
    } finally {
      process.env.DMS_WERKZEUG_DIENST = socket;
    }
  });

  it('poppler ohne Speicher (Exit-Code 0, „Out of memory“) gilt als Fehler', async () => {
    const r = await lauf('pdftocairo', []);
    assert.equal(r.e?.code, 'EWERKZEUGSPEICHER');
    assert.match(r.e!.message, /pdftocairo: Out of memory – das PDF braucht mehr Arbeitsspeicher/);
    assert.match(r.e!.message, /DMS_WERKZEUG_SPEICHER_MB/, 'nennt den Schalter');
    assert.match(r.err, /DMS_WERKZEUG_SPEICHER_MB/, 'auch in der Fehlerausgabe, die viele Aufrufer zeigen');
  });

  it('Stand: Benutzer und Grenzen, gemessen im Dienst', async () => {
    const a = await werkzeugAbschirmung();
    assert.deepEqual(a, {
      getrennt: true,
      benutzer: process.getuid!(),
      gruppe: process.getgid!(),
      speicherMb: 256,
      cpuS: 900,
      dateiMb: 2048,
    });
    assert.match(abschirmungText(a), /getrennt als Benutzer \d+, je Aufruf höchstens 256 MB Arbeitsspeicher/);
  });

  it('Arbeitsordner: unter DMS_WERKZEUG_ARBEIT, für die Gruppe (2770)', async () => {
    const arbeit = join(tmp, 'arbeit');
    mkdirSync(arbeit);
    process.env.DMS_WERKZEUG_ARBEIT = arbeit;
    try {
      const d = await werkzeugOrdner('dms-probe-');
      assert.ok(d.startsWith(`${arbeit}/dms-probe-`), d);
      assert.equal(statSync(d).mode & 0o7777, 0o2770);
    } finally {
      delete process.env.DMS_WERKZEUG_ARBEIT;
    }
  });
});

describe('Arbeitsordner ohne Symlinks (#1354)', () => {
  const draussen = join(tmp, 'draussen.txt');
  let dir: string;
  before(async () => {
    writeFileSync(draussen, 'geheim');
    dir = await werkzeugOrdner('dms-probe-links-');
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('Lesen: Symlink eines Werkzeugs auf eine Datei außerhalb → Fehler, die Datei bleibt unberührt', async () => {
    // Über den Dienst: das Werkzeug legt den Symlink selbst an.
    const r = await lauf('pdfimages', [draussen, join(dir, 'bild.jpg')]);
    assert.equal(r.e, null);
    assert.ok(lstatSync(join(dir, 'bild.jpg')).isSymbolicLink());
    await assert.rejects(liesWerkzeugDatei(join(dir, 'bild.jpg')), (e: NodeJS.ErrnoException) => e.code === 'ELOOP');
    assert.deepEqual(await werkzeugDateien(dir), [], 'Liste ohne Symlinks');
    assert.equal(readFileSync(draussen, 'utf8'), 'geheim');
  });

  it('Lesen: Hardlink und FIFO gelten nicht als Ausgabe; eine echte Datei geht', async () => {
    linkSync(draussen, join(dir, 'hart.jpg'));
    await assert.rejects(liesWerkzeugDatei(join(dir, 'hart.jpg')), (e: NodeJS.ErrnoException) => e.code === 'EWERKZEUGDATEI');
    execFileSync('mkfifo', [join(dir, 'rohr.jpg')]);
    await assert.rejects(liesWerkzeugDatei(join(dir, 'rohr.jpg')), (e: NodeJS.ErrnoException) => e.code === 'EWERKZEUGDATEI');
    writeFileSync(join(dir, 'echt.jpg'), 'bild');
    assert.equal((await liesWerkzeugDatei(join(dir, 'echt.jpg'))).toString(), 'bild');
    assert.deepEqual((await werkzeugDateien(dir)).sort(), ['echt.jpg', 'hart.jpg'], 'nur reguläre Dateien');
    await assert.rejects(liesWerkzeugDatei(join(dir, 'echt.jpg'), 2), (e: NodeJS.ErrnoException) => e.code === 'EWERKZEUGDATEI', 'Größe');
  });

  it('Schreiben über einen vorab gelegten Symlink: die Datei außerhalb bleibt unberührt', async () => {
    symlinkSync(draussen, join(dir, 'ein.pdf'));
    await schreibeWerkzeugDatei(join(dir, 'ein.pdf'), 'neu');
    assert.equal(readFileSync(draussen, 'utf8'), 'geheim');
    assert.ok(lstatSync(join(dir, 'ein.pdf')).isFile());
    assert.equal(readFileSync(join(dir, 'ein.pdf'), 'utf8'), 'neu');
    // Derselbe Name noch einmal (Schleife): wieder eine neue Datei.
    await schreibeWerkzeugDatei(join(dir, 'ein.pdf'), 'zweiter');
    assert.equal(readFileSync(join(dir, 'ein.pdf'), 'utf8'), 'zweiter');
  });
});

describe('Ohne Werkzeugdienst: direkt, aber mit Grenzen (#1354)', () => {
  before(() => {
    delete process.env.DMS_WERKZEUG_DIENST;
    process.env.PATH = `${bin}:${alt.p ?? ''}`;
  });

  it('Speichergrenze gilt auch direkt; Ergebnis wie gewohnt', async () => {
    process.env.DMS_WERKZEUG_SPEICHER_MB = '200';
    assert.ok((await lauf('pdffonts', [])).e, 'unter 200 MB scheitert dd mit 300 MB');
    assert.equal((await lauf('pdfinfo', ['4', 'w'])).aus, 'Pages: 4\n');
    const a = await werkzeugAbschirmung();
    assert.equal(a.getrennt, false);
    assert.equal(a.speicherMb, 200);
    assert.equal((await lauf('pdftocairo', [])).e?.code, 'EWERKZEUGSPEICHER', 'Speicherfehler auch direkt');
    process.env.DMS_WERKZEUG_SPEICHER_MB = '0';
    assert.equal((await lauf('pdffonts', [])).e, null);
  });

  it('Arbeitsordner wie bisher im Ordner für temporäre Dateien', async () => {
    const d = await werkzeugOrdner('dms-probe-');
    try {
      assert.ok(d.startsWith(join(tmpdir(), 'dms-probe-')), d);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
