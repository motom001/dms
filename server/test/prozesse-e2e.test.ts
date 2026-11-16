/**
 * Mehrere Prozesse (#745), das ganze Ablago (src/index.ts) mit DMS_PROZESSE=2 und TEST_DATABASE_URL: Startseite und
 * Migrationen nur einmal (im Leiter), danach beide Prozesse am Port; Systemzustand zeigt alle Prozesse und die
 * Einstellungen je Prozess; der Befehl dms (gemeinsamer Schlüssel) und ein Werkbank-Auftrag gehen bei jedem Prozess;
 * ein abgestürzter Prozess startet neu, ohne dass die Anmeldung verloren geht; Beenden beendet alle; die Sperre gegen
 * ein Downgrade zeigt ihren Grund und hält Ablago an, ohne weitere Prozesse zu starten. Gesundheit unverändert.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { ProzessZeile } from '../../shared/src/systemlast';

const URL_DB = process.env.TEST_DATABASE_URL;
const SERVER = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'dms-a745-e2e-'));
const datenbanken: string[] = [];
const prozesse: ChildProcess[] = [];

after(async () => {
  for (const p of prozesse) if (p.exitCode === null) p.kill('SIGKILL');
  if (URL_DB && datenbanken.length) {
    const { ausUrl, alsUrl } = await import('../src/anbindung');
    const { default: postgres } = await import('postgres');
    const sql = postgres(alsUrl({ ...ausUrl(URL_DB)!, datenbank: 'postgres' }), { onnotice: () => {} });
    for (const d of datenbanken) await sql.unsafe(`DROP DATABASE IF EXISTS "${d}" WITH (FORCE)`).catch(() => {});
    await sql.end();
  }
  rmSync(tmp, { recursive: true, force: true });
});

async function freierPort(): Promise<number> {
  return new Promise((r) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close(() => r(typeof a === 'object' && a ? a.port : 0));
    });
  });
}

describe('Mehrere Prozesse, ganzes Ablago (#745)', { skip: !URL_DB && 'TEST_DATABASE_URL fehlt', timeout: 300_000 }, () => {
  it('Start, Systemzustand, Konsole, Auftrag, Absturz, Beenden, Downgrade', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
    const a = { ...ausUrl(URL_DB)!, datenbank: `dmstest_a745_e_${Date.now().toString(36)}` };
    await legeDatenbankAn(a);
    datenbanken.push(a.datenbank);
    const mig = join(tmp, 'migrationen');
    cpSync(join(SERVER, 'migrations'), mig, { recursive: true });
    writeFileSync(join(mig, '999_a745_langsam.sql'), 'SELECT pg_sleep(3);');
    const konsoleDatei = join(tmp, 'konsole.json');
    const starte = async (migrationen: string) => {
      const port = await freierPort();
      const { NODE_TEST_CONTEXT: _t, NODE_ENV: _n, ...grund } = process.env;
      const p = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        cwd: SERVER,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...grund,
          DMS_PROZESSE: '2',
          DATABASE_URL: alsUrl(a),
          DMS_DATENWURZEL: join(tmp, 'daten'),
          MIGRATIONS_DIR: migrationen,
          PORT: String(port),
          HOST: '127.0.0.1',
          LOG_LEVEL: 'info',
          DMS_LASTTEST: '',
          DMS_EINRICHTUNGSCODE: 'aus',
          DMS_KONSOLE_DATEI: konsoleDatei,
        },
      });
      prozesse.push(p);
      let log = '';
      p.stdout!.on('data', (d: Buffer) => {
        log += d.toString();
      });
      p.stderr!.on('data', (d: Buffer) => {
        log += d.toString();
      });
      return { p, basis: `http://127.0.0.1:${port}`, log: () => log };
    };
    const warte = async (f: () => Promise<boolean>, was: string, log: () => string, ms = 120_000) => {
      const bis = Date.now() + ms;
      for (;;) {
        if (await f().catch(() => false)) return;
        if (Date.now() > bis) throw new Error(`${was} nicht erreicht:\n${log()}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    };

    const x = await starte(mig);
    await warte(async () => !!(await fetch(`${x.basis}/api/gesundheit`)), 'erreichbar', x.log);
    let gesehen = false;
    await warte(
      async () => {
        gesehen ||= /Datenbank wird auf den neuen Stand gebracht/.test(await (await fetch(x.basis)).text());
        return (await fetch(`${x.basis}/api/gesundheit`)).status === 200;
      },
      'bereit',
      x.log,
    );
    assert.ok(gesehen, 'Startseite mit dem Schritt der Migration');
    await warte(async () => /Prozess 2 ist bereit/.test(x.log()), 'Prozess 2', x.log);
    // Halde (#891): auch der Leiter begrenzt, 512 MB über der der anderen – beide Werte im Startprotokoll.
    const grenzen = x.log().match(/Ablago startet mit 2 Prozessen[^\n]*haldeLeiterMb=(\d+)[^\n]*haldeMb=(\d+)/);
    assert.ok(grenzen, `Startprotokoll mit beiden Grenzen:\n${x.log()}`);
    assert.equal(Number(grenzen[1]), Number(grenzen[2]) + 512);
    assert.equal(x.log().match(/999_a745_langsam/g)?.length ?? 0, 1, 'die Migration läuft genau einmal');
    const g = (await (await fetch(`${x.basis}/api/gesundheit`)).json()) as { ok: boolean; zustand: string };
    assert.deepEqual([g.ok, g.zustand], [true, 'laeuft'], 'Gesundheit unverändert');

    // Einrichten und als Administratorin anmelden.
    const r = await fetch(`${x.basis}/api/konto/einrichten`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dms': '1' },
      body: JSON.stringify({ mandant: 'Familie Test', email: 'lena@example.org', name: 'Lena', passwort: 'a745-passwort-lang-1' }),
    });
    assert.equal(r.status, 201, await r.clone().text());
    const cookie = r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const holen = async (pfad: string, o: RequestInit = {}) =>
      fetch(`${x.basis}${pfad}`, { ...o, headers: { cookie, 'x-dms': '1', 'content-type': 'application/json', ...(o.headers ?? {}) } });

    // Systemzustand: Hauptprozess, Leiter, ein weiterer; Einstellungen je Prozess.
    const sl = (await (await holen('/api/werkbank/systemlast')).json()) as {
      prozesse: ProzessZeile[];
      grenzen: Record<
        string,
        { wert: number; prozesse?: number; variable: string; aufteilung?: { leiter: number; andere: number; prozesse: number } }
      >;
      anteile: { dms: number };
    };
    assert.deepEqual(
      sl.prozesse.map((p) => p.rolle),
      ['haupt', 'leiter', 'anfragen'],
    );
    assert.ok(sl.prozesse.every((p) => p.speicher === null || p.speicher > 0));
    assert.equal(sl.grenzen.prozesse.wert, 2);
    // #874: Verbindungen gelten für alle zusammen (Vorgabe 10 + 4 je weiteren Prozess), aufgeteilt.
    assert.equal(sl.grenzen.verbindungen.wert, 14);
    assert.equal(sl.grenzen.verbindungen.prozesse, undefined);
    assert.deepEqual(sl.grenzen.verbindungen.aufteilung, { leiter: 9, andere: 5, prozesse: 2 });
    assert.equal(sl.grenzen.anfragen.prozesse, 2, 'Anfragen gelten je Prozess');
    type Engpass = {
      neustarts: { anzahl: number; letzte: unknown[] };
      pool: { max: number; klassen: number[]; an: boolean } | null;
      speicher: Array<{ nr: number; mb: number | null }>;
      cpu: { ablago: number | null } | null;
      sitzungen: { offen: number } | null;
    };
    const last = (await (await holen('/api/werkbank/last')).json()) as {
      speicherMb: number;
      prozesse: ProzessZeile[];
      datenbank: { verbindungen: number; jeProzess: number };
      engpass: Engpass;
    };
    assert.equal(last.prozesse.length, 3);
    assert.equal(last.datenbank.verbindungen, 14, 'Lasttest: Verbindungen zusammen');
    assert.ok([9, 5].includes(last.datenbank.jeProzess), 'Anteil des Prozesses, der antwortet');
    // Engpass (#874) über beide Prozesse: Verbindungen zusammen, Speicher je Prozess (mit Hauptprozess), Sitzungen.
    assert.equal(last.engpass.pool?.max, 14);
    assert.deepEqual(last.engpass.neustarts, { anzahl: 0, letzte: [] });
    assert.equal(last.engpass.pool?.an, true);
    assert.deepEqual(
      last.engpass.speicher.map((z) => z.nr),
      [0, 1, 2],
    );
    assert.ok((last.engpass.sitzungen?.offen ?? 0) >= 2);
    // #895: Warnungen aller Prozesse sammelt der Hauptprozess (ohne Einzelheiten), CPU je Gruppe misst der Leiter.
    type Mit895 = {
      engpass: Engpass & {
        protokoll: { eintraege: Array<{ text: string; prozesse: number[] }> } | null;
        gruppen: { verfuegbar: boolean; gruppen?: Array<{ art: string; nr?: number }> } | null;
      };
    };
    const last895 = async () => (await (await holen('/api/werkbank/last')).json()) as Mit895;
    await warte(
      async () =>
        !!(await last895()).engpass.protokoll?.eintraege.some(
          (e) => e.text === 'Verwaltungsmodus begonnen' && e.prozesse.some((n) => n >= 1),
        ),
      'Warnung eines Prozesses beim Hauptprozess',
      x.log,
      10_000,
    );
    const l895 = await last895();
    assert.doesNotMatch(JSON.stringify(l895.engpass.protokoll), /lena@example\.org/, 'ohne Kontextobjekt');
    assert.equal(l895.engpass.gruppen?.verfuegbar, true);
    assert.deepEqual(
      l895.engpass.gruppen?.gruppen?.filter((g) => g.art === 'ablago').map((g) => g.nr),
      [0, 1, 2],
    );

    // Befehl dms: ein Schlüssel für alle Prozesse (Verteilung reihum – mehrere Anfragen treffen beide).
    const k = JSON.parse(readFileSync(konsoleDatei, 'utf8')) as { schluessel: string; url: string };
    for (let i = 0; i < 8; i++) {
      const kr = await fetch(`${k.url}/api/werkbank/last`, { headers: { 'x-dms-konsole': k.schluessel } });
      assert.equal(kr.status, 200, `Konsole, Anfrage ${i + 1}`);
      await kr.arrayBuffer();
    }

    // Werkbank-Auftrag: Stand in jedem Prozess sichtbar.
    const auf = (await (await holen('/api/werkbank/wartung/dateien', { method: 'POST', body: '{}' })).json()) as { id: string };
    for (let i = 0; i < 8; i++) {
      const s = (await (await holen('/api/werkbank/auftrag')).json()) as { id: string } | null;
      assert.equal(s?.id, auf.id, `Auftrag in Anfrage ${i + 1}`);
    }

    // Absturz von Prozess 2: Neustart, die Anmeldung bleibt.
    const alt = sl.prozesse.find((p) => p.rolle === 'anfragen')!;
    process.kill(alt.pid, 'SIGKILL');
    await warte(
      async () => {
        const s = (await (await holen('/api/werkbank/systemlast')).json()) as { prozesse?: ProzessZeile[] };
        return (
          !!s.prozesse?.some((p) => p.rolle === 'anfragen' && p.pid !== alt.pid && p.schleifeP99 !== undefined) &&
          /Prozess 2 ist bereit[\s\S]*Prozess 2 ist bereit/.test(x.log())
        );
      },
      'Neustart von Prozess 2',
      x.log,
    );
    // #895: der Neustart mit Grund, die Meldung des Hauptprozesses in der Sammlung.
    await warte(
      async () =>
        !!(await last895()).engpass.protokoll?.eintraege.some(
          (e) => e.text === 'Prozess # beendet (SIGKILL) – startet in # s neu' && e.prozesse.includes(0),
        ),
      'Meldung des Hauptprozesses',
      x.log,
      10_000,
    );
    const n895 = (await last895()).engpass.neustarts as { letzte: Array<{ nr: number; signal: string | null; ausnahme?: string | null }> };
    assert.deepEqual(
      n895.letzte.map((z) => [z.nr, z.signal, z.ausnahme]),
      [[2, 'SIGKILL', null]],
    );
    for (let i = 0; i < 8; i++) {
      const st = (await (await holen('/api/konto/status')).json()) as { benutzer?: { email: string } | null };
      assert.equal(st.benutzer?.email, 'lena@example.org', `angemeldet in Anfrage ${i + 1}`);
    }

    // Beenden: alle Prozesse, Code 0.
    x.p.kill('SIGTERM');
    assert.equal(await new Promise((ok) => x.p.once('exit', (c) => ok(c))), 0);

    // Downgrade (#714): Grund auf der Startseite, Ablago bleibt, kein weiterer Prozess startet.
    const y = await starte(join(SERVER, 'migrations'));
    await warte(
      async () => ((await (await fetch(`${y.basis}/api/gesundheit`)).json()) as { zustand: string }).zustand === 'fehler',
      'Fehler',
      y.log,
    );
    assert.match(await (await fetch(y.basis)).text(), /neueren Version von Ablago/);
    await new Promise((ok) => setTimeout(ok, 1500));
    assert.equal(y.p.exitCode, null, 'Ablago bleibt mit der Fehlerseite erreichbar');
    assert.doesNotMatch(y.log(), /Prozess 2 für Anfragen startet/);
    y.p.kill('SIGTERM');
    await new Promise((ok) => y.p.once('exit', ok));
  });
});
