/**
 * Startseite „Ablago startet …“ (#802): Port sofort offen, nur Schritte und Zahlen, alles andere 503, Gesundheit
 * „startet“/„fehler“ bis zum Ende, Fehler in Klartext ohne technische Meldung. Mit TEST_DATABASE_URL zusätzlich:
 * Fortschritt der Migrationen und das ganze DMS (src/index.ts) mit einer langsamen Migration und der Sperre gegen ein
 * Downgrade (#714).
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { after, describe, it } from 'node:test';
import { istAusfall } from '../../shared/src/erreichbarkeit';
import { NeuereDatenbankFehler } from '../src/db';
import { startfehlerAus, Startmodus } from '../src/startmodus';

const URL_DB = process.env.TEST_DATABASE_URL;
const SERVER = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'dms-a746-start-'));
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

async function offen(o: { jetzt?: () => number } = {}) {
  const s = new Startmodus({ port: 0, host: '127.0.0.1', ...o });
  await s.oeffne();
  return { s, basis: `http://127.0.0.1:${s.port}` };
}

describe('Startseite (#802)', () => {
  it('zeigt „Ablago startet …“ mit Schritt, Menge und Neuladen – unter jeder Adresse der Oberfläche', async () => {
    let jetzt = 1_000_000;
    const { s, basis } = await offen({ jetzt: () => jetzt });
    try {
      s.schritt('migration', { nr: 3, von: 5, datei: '070_beispiel.sql' });
      jetzt += 65_000;
      for (const pfad of ['/', '/mappen/00000000-0000-4000-8000-000000000001', '/anmelden?weiter=%2F']) {
        const r = await fetch(basis + pfad);
        assert.equal(r.status, 200, pfad);
        assert.match(r.headers.get('content-type') ?? '', /^text\/html/);
        assert.equal(r.headers.get('cache-control'), 'no-store');
        const text = await r.text();
        assert.match(text, /Ablago startet …/);
        assert.match(text, /Datenbank wird auf den neuen Stand gebracht – Schritt 3 von 5/);
        assert.match(text, /<meta http-equiv="refresh" content="3">/);
        assert.match(text, /Du hast nichts falsch gemacht/);
        assert.match(text, /Läuft seit 65 s/);
        assert.match(text, /<progress max="100" value="40">/);
        assert.ok(!text.includes('070_beispiel.sql'), 'Dateiname nur im Fehlerfall');
        assert.ok(!/<script/i.test(text), 'kein Skript (CSP)');
      }
      s.schritt('benutzer');
      s.menge(120_000, 200_000);
      const text = await (await fetch(basis)).text();
      assert.match(text, /Benutzer werden abgeglichen – 120\.000 von 200\.000/);
      assert.match(text, /value="60"/);
    } finally {
      await s.schliesse();
    }
  });

  it('Gesundheit 503 „startet“; API, Anmeldung und WebDAV 503 mit Retry-After; Dateien der Oberfläche 503', async () => {
    const { s, basis } = await offen();
    try {
      const g = await fetch(`${basis}/api/gesundheit`);
      assert.equal(g.status, 503);
      const gj = (await g.json()) as { ok: boolean; zustand: string; startet: boolean; stand: string };
      assert.deepEqual([gj.ok, gj.zustand, gj.startet], [false, 'startet', true]);
      assert.match(gj.stand, /^[0-9a-f]{12}$/);
      const anfragen: Array<[string, string, RequestInit?]> = [
        ['GET', '/api/konto/status'],
        ['GET', '/api/mappen?sicht=x'],
        ['GET', '/api/v1/mappen'],
        [
          'POST',
          '/api/konto/anmelden',
          {
            headers: { 'content-type': 'application/json', 'x-dms': '1' },
            body: JSON.stringify({ email: 'lena@example.org', passwort: 'x' }),
          },
        ],
        ['PROPFIND', '/webdav/', { headers: { depth: '1' } }],
        ['GET', '/webdav/Ablage/'],
        ['GET', '/assets/index-abc123.js'],
        ['GET', '/favicon.svg'],
        ['POST', '/'],
      ];
      for (const [methode, pfad, init] of anfragen) {
        const r = await fetch(basis + pfad, { method: methode, ...init });
        assert.equal(r.status, 503, `${methode} ${pfad}`);
        assert.equal(r.headers.get('retry-after'), '5', `${methode} ${pfad}`);
        const j = (await r.json()) as { fehler: string; startet: boolean };
        assert.equal(j.startet, true);
        assert.match(j.fehler, /Ablago startet gerade/);
        // Die Oberfläche zeigt dafür die Leiste „nicht erreichbar“ und wartet, statt einer Fehlermeldung.
        assert.equal(istAusfall(r.status, j), true);
      }
    } finally {
      await s.schliesse();
    }
  });

  it('liest keinen Körper ein: ein großer Upload bekommt sofort 503', async () => {
    const { s, basis } = await offen();
    try {
      let gelesen = 0;
      const MB = Buffer.alloc(1024 * 1024);
      const koerper = Readable.toWeb(
        Readable.from(
          (function* () {
            for (let i = 0; i < 64; i++) {
              gelesen += MB.length;
              yield MB;
            }
          })(),
        ),
      );
      const r = await fetch(`${basis}/api/mappen/00000000-0000-4000-8000-000000000009/dokumente?register=d&name=x.pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: koerper as never,
        duplex: 'half',
      } as RequestInit);
      assert.equal(r.status, 503);
      assert.ok(gelesen <= 64 * MB.length);
    } finally {
      await s.schliesse();
    }
  });

  it('Fehler: Klartext ohne die technische Meldung (keine Daten), Gesundheit „fehler“', async () => {
    const { s, basis } = await offen();
    try {
      s.schritt('migration', { nr: 2, von: 4, datei: '071_rechnungen.sql' });
      const e = Object.assign(new Error('Schlüssel (titel)=(Rechnung Herr Özdemir) ist bereits vorhanden'), { code: '23505' });
      assert.deepEqual(s.fehler(e), { art: 'migration', nr: 2, von: 4, datei: '071_rechnungen.sql', code: '23505' });
      // Spätere Schritte ändern nichts mehr.
      s.schritt('titel');
      const text = await (await fetch(basis)).text();
      assert.match(text, /Ablago konnte nicht starten/);
      assert.match(text, /Schritt 2 von 4: 071_rechnungen\.sql, Fehlercode 23505/);
      assert.match(text, /Protokoll des Containers/);
      assert.match(text, /href="\/hilfe\/admin\/fehlersuche\/#container-logs"/);
      assert.match(text, /beendet sich in einigen Minuten/);
      assert.match(text, /content="30"/);
      assert.ok(!text.includes('Özdemir') && !text.includes('Rechnung Herr'), 'keine Werte aus der Meldung');
      const g = await fetch(`${basis}/api/gesundheit`);
      assert.equal(g.status, 503);
      assert.equal(((await g.json()) as { zustand: string }).zustand, 'fehler');
      const a = await fetch(`${basis}/api/konto/status`);
      assert.equal(a.status, 503);
      assert.equal(a.headers.get('retry-after'), '30');
      assert.match(((await a.json()) as { fehler: string }).fehler, /konnte nicht starten/);
    } finally {
      await s.schliesse();
    }
  });

  it('Sperre gegen ein Downgrade (#714): Grund mit Migration, ohne Hinweis auf einen Neustart', async () => {
    const { s, basis } = await offen();
    try {
      s.schritt('migration', { nr: 0, von: 0 });
      s.fehler(new NeuereDatenbankFehler(['069_neu.sql', '070_neuer.sql']));
      const text = await (await fetch(basis)).text();
      assert.match(text, /neueren Version von Ablago \(2 unbekannte Migrationen, zuletzt 070_neuer\.sql\)/);
      assert.match(text, /Stelle das Image wieder auf die neuere Version/);
      assert.ok(!text.includes('beendet sich in einigen Minuten'));
    } finally {
      await s.schliesse();
    }
  });

  it('allgemeiner Fehler nennt nur den Schritt; unsichere Kennungen gehen nicht nach außen', () => {
    assert.deepEqual(startfehlerAus(new Error('geheim'), { schritt: 'titel', nr: null, von: null }, null), {
      art: 'allgemein',
      schritt: 'titel',
    });
    assert.deepEqual(startfehlerAus(Object.assign(new Error('x'), { code: '<b>' }), { schritt: 'migration', nr: 1, von: 1 }, '001.sql'), {
      art: 'migration',
      nr: 1,
      von: 1,
      datei: '001.sql',
      code: '–',
    });
    assert.deepEqual(startfehlerAus(new Error('x'), { schritt: 'migration', nr: 1, von: 1 }, '<script>.sql'), {
      art: 'allgemein',
      schritt: 'migration',
    });
  });

  it('gibt den Port frei und öffnet ihn wieder (Einrichtungsmodus dazwischen)', async () => {
    const { s, basis } = await offen();
    const port = s.port!;
    await fetch(basis); // Keep-Alive-Verbindung offen lassen
    await s.schliesse();
    assert.equal(s.offen, false);
    // Jetzt ist der Port frei: ein anderer Server kann ihn nehmen.
    await new Promise<void>((r, f) => {
      const x = createServer();
      x.once('error', f);
      x.listen(port, '127.0.0.1', () => x.close(() => r()));
    });
    await s.oeffne();
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/api/gesundheit`)).status, 503);
    await s.schliesse();
  });
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

describe('Start mit Datenbank (#802)', { skip: !URL_DB && 'TEST_DATABASE_URL fehlt', timeout: 300_000 }, () => {
  it('migriere meldet Schritt x von y nur für offene Migrationen', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
    const { migriere, verbinde } = await import('../src/db');
    const a = { ...ausUrl(URL_DB)!, datenbank: `dmstest_a746_m_${Date.now().toString(36)}` };
    await legeDatenbankAn(a);
    datenbanken.push(a.datenbank);
    const ordner = mkdtempSync(join(tmp, 'mig-'));
    for (const n of ['001_a.sql', '002_b.sql', '003_c.sql']) writeFileSync(join(ordner, n), `CREATE TABLE t_${n.slice(4, 5)} (x int);`);
    const sql = verbinde(alsUrl(a), 2);
    try {
      const schritte: string[] = [];
      await migriere(
        sql,
        ordner,
        () => {},
        (nr, von, datei) => schritte.push(`${nr}/${von} ${datei}`),
      );
      assert.deepEqual(schritte, ['1/3 001_a.sql', '2/3 002_b.sql', '3/3 003_c.sql']);
      writeFileSync(join(ordner, '004_d.sql'), 'CREATE TABLE t_d (x int);');
      schritte.length = 0;
      await migriere(
        sql,
        ordner,
        () => {},
        (nr, von, datei) => schritte.push(`${nr}/${von} ${datei}`),
      );
      assert.deepEqual(schritte, ['1/1 004_d.sql']);
    } finally {
      await sql.end({ timeout: 1 });
    }
  });

  it('ganzes Ablago: Port offen während der Migrationen, Gesundheit erst danach 200; Downgrade zeigt den Grund', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
    const a = { ...ausUrl(URL_DB)!, datenbank: `dmstest_a746_e_${Date.now().toString(36)}` };
    await legeDatenbankAn(a);
    datenbanken.push(a.datenbank);
    // Eigene Kopie der Migrationen mit einer langsamen dazu (eine neuere Version).
    const mig = join(tmp, 'migrationen');
    cpSync(join(SERVER, 'migrations'), mig, { recursive: true });
    writeFileSync(join(mig, '999_a746_langsam.sql'), 'SELECT pg_sleep(4);');
    const starte = async (migrationen: string) => {
      const port = await freierPort();
      const { NODE_TEST_CONTEXT: _t, NODE_ENV: _n, ...grund } = process.env;
      const p = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
        cwd: SERVER,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...grund,
          DATABASE_URL: alsUrl(a),
          DMS_DATENWURZEL: join(tmp, 'daten'),
          MIGRATIONS_DIR: migrationen,
          PORT: String(port),
          HOST: '127.0.0.1',
          LOG_LEVEL: 'warn',
          DMS_LASTTEST: '',
          DMS_EINRICHTUNGSCODE: 'aus',
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
    // Während der Migrationen (pg_sleep 4 s): Seite mit Schritt, Gesundheit 503, Anmeldung 503.
    let gesehen = false;
    await warte(
      async () => {
        const text = await (await fetch(x.basis)).text();
        gesehen ||= /Datenbank wird auf den neuen Stand gebracht – Schritt \d+ von \d+/.test(text);
        const g = await fetch(`${x.basis}/api/gesundheit`);
        return g.status === 200;
      },
      'bereit',
      x.log,
    );
    assert.ok(gesehen, 'Schritt der Migration auf der Seite');
    const g = (await (await fetch(`${x.basis}/api/gesundheit`)).json()) as { ok: boolean; zustand: string };
    assert.deepEqual([g.ok, g.zustand], [true, 'laeuft']);
    assert.equal((await fetch(`${x.basis}/api/konto/status`)).status, 200);
    x.p.kill('SIGTERM');
    await new Promise((r) => x.p.once('exit', r));

    // Dieselbe Datenbank mit den Migrationen dieser (älteren) Version: Sperre gegen ein Downgrade, der Prozess bleibt.
    const y = await starte(join(SERVER, 'migrations'));
    await warte(
      async () => ((await (await fetch(`${y.basis}/api/gesundheit`)).json()) as { zustand: string }).zustand === 'fehler',
      'Fehler',
      y.log,
    );
    const text = await (await fetch(y.basis)).text();
    assert.match(text, /neueren Version von Ablago \(1 unbekannte Migrationen, zuletzt 999_a746_langsam\.sql\)/);
    assert.equal((await fetch(`${y.basis}/api/konto/status`)).status, 503);
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(y.p.exitCode, null, 'Ablago bleibt mit der Fehlerseite erreichbar');
    assert.match(y.log(), /Start abgebrochen: Diese Datenbank stammt von einer neueren Version/);
    y.p.kill('SIGTERM');
  });
});
