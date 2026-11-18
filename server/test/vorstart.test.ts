/**
 * Startseite schon beim Containerstart (#1250): Vorstart (src/vorstart.ts) mit dem Schritt aus der Datei von
 * deploy/komplett/start.sh, Fehler mit Ursache und Ausweg, Übergabe des Ports an Ablago ohne Lücke; dazu die Deutung
 * „Datenbank nicht erreichbar oder blockiert“, die Sprache der Seite (de/en) und das Warten auf eine gesperrte Migration.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { datenbankGrund, startfehlerAus, startseitenSprache } from '../src/einrichtung/startfehler';
import { Startmodus } from '../src/einrichtung/startmodus';

const SERVER = new URL('..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'dms-b-vorstart-'));
const prozesse: ChildProcess[] = [];
after(() => {
  for (const p of prozesse) if (p.exitCode === null) p.kill('SIGKILL');
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

const schritt = (html: string) => /class="schritt"[^>]*>([^<]*)/.exec(html)?.[1] ?? null;

async function bis(f: () => Promise<boolean>, was: string, ms = 20_000) {
  const ende = Date.now() + ms;
  for (;;) {
    if (await f().catch(() => false)) return;
    if (Date.now() > ende) throw new Error(`${was} nicht erreicht`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('Datenbank nicht erreichbar oder blockiert (#1250)', () => {
  it('deutet nur den Fehlercode, nie den Text', () => {
    const mit = (code: string) => Object.assign(new Error('Herr Özdemir'), { code });
    assert.equal(datenbankGrund(mit('ECONNREFUSED')), 'abgewiesen');
    assert.equal(datenbankGrund(mit('57P03')), 'abgewiesen');
    assert.equal(datenbankGrund(mit('CONNECTION_CLOSED')), 'abgewiesen');
    assert.equal(datenbankGrund(mit('55P03')), 'sperre');
    assert.equal(datenbankGrund(mit('40P01')), 'sperre');
    assert.equal(datenbankGrund(mit('53100')), 'platte');
    assert.equal(datenbankGrund(mit('ENOSPC')), 'platte');
    assert.equal(datenbankGrund(mit('53300')), 'verbindungen');
    assert.equal(datenbankGrund(mit('23505')), null);
    assert.equal(datenbankGrund(new Error('connect ECONNREFUSED 10.0.0.5:5432')), null, 'nicht aus dem Text');
  });

  it('volle Platte in einer Migration: Grund „Speicher voll“ statt Dateiname', () => {
    const f = startfehlerAus(Object.assign(new Error('x'), { code: '53100' }), { schritt: 'migration', nr: 2, von: 4 }, '071.sql');
    assert.deepEqual(f, { art: 'datenbank', grund: 'platte' });
  });

  it('Seite: Ursache, Ausweg (Neustart, Protokoll) und Handbuch; ohne Rechnernamen und Adressen', async () => {
    const s = new Startmodus({ port: 0, host: '127.0.0.1' });
    await s.oeffne();
    try {
      s.fehler(Object.assign(new Error('connect ECONNREFUSED db.example.org:5432'), { code: 'ECONNREFUSED' }));
      const text = await (await fetch(`http://127.0.0.1:${s.port}/`)).text();
      assert.match(text, /Die Datenbank ist nicht erreichbar oder nimmt keine Verbindung an/);
      assert.match(text, /Was du tun kannst:/);
      assert.match(text, /Container der Datenbank läuft/);
      assert.match(text, /Protokoll des Containers/);
      assert.match(text, /href="\/hilfe\/admin\/fehlersuche\/#container-logs"/);
      assert.doesNotMatch(text, /example\.org|5432/, 'kein Rechnername, keine Adresse');
    } finally {
      await s.schliesse();
    }
  });

  it('dms-komplett: Ausweg ist der Neustart des Containers', () => {
    const s = new Startmodus({ port: 0, host: '127.0.0.1', komplett: true });
    s.fehler(Object.assign(new Error('x'), { code: '57P01' }));
    assert.match(s.seite(), /Starte den Container neu/);
  });

  it('Sprache aus Accept-Language: de, sonst Englisch', async () => {
    assert.equal(startseitenSprache(undefined), 'de');
    assert.equal(startseitenSprache('de-AT,de;q=0.9'), 'de');
    assert.equal(startseitenSprache('en-GB,en;q=0.9'), 'en');
    assert.equal(startseitenSprache('fr'), 'en');
    const s = new Startmodus({ port: 0, host: '127.0.0.1' });
    await s.oeffne();
    try {
      s.schritt('datenbank-warten', { nr: 3, von: 30 });
      const r = await fetch(`http://127.0.0.1:${s.port}/`, { headers: { 'accept-language': 'en-US' } });
      assert.equal(r.headers.get('vary'), 'accept-language');
      const text = await r.text();
      assert.match(text, /<html lang="en">/);
      assert.equal(schritt(text), 'The database is not reachable yet – new attempt 3 of 30');
      assert.match(text, /<progress><\/progress>/, 'Versuche sind kein Fortschritt');
      const de = await (await fetch(`http://127.0.0.1:${s.port}/`)).text();
      assert.equal(schritt(de), 'Datenbank ist noch nicht erreichbar – neuer Versuch 3 von 30');
      assert.match(de, /Beim ersten Start und bei großen Ablagen kann das einige Minuten dauern/);
      assert.match(de, /zur Lasttest-Seite/);
    } finally {
      await s.schliesse();
    }
  });
});

describe('Vorstart in dms-komplett (#1250)', () => {
  it('Schritt aus der Datei, Fehler mit Ausweg, Gesundheit ohne Kennung; Ablago übernimmt den Port ohne Lücke', async () => {
    const port = await freierPort();
    const datei = join(tmp, 'vorstart');
    writeFileSync(datei, 'pg-anlegen\n');
    const seit = Math.floor(Date.now() / 1000) - 75;
    const grund = { ...process.env };
    delete grund.NODE_TEST_CONTEXT;
    const p = spawn(process.execPath, ['--import', 'tsx', 'src/vorstart.ts'], {
      cwd: SERVER,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...grund, PORT: String(port), HOST: '127.0.0.1', DMS_VORSTART_DATEI: datei, DMS_VORSTART_SEIT: String(seit) },
    });
    prozesse.push(p);
    const basis = `http://127.0.0.1:${port}`;
    const seite = async () => (await fetch(basis)).text();
    await bis(async () => schritt(await seite()) === 'Datenbank wird angelegt (nur beim ersten Start)', 'Schritt pg-anlegen');
    const erste = await seite();
    assert.match(erste, /Läuft seit 7\d s/, 'zählt ab dem Start des Containers');
    assert.ok(!/<script|https?:\/\//i.test(erste), 'kein Skript, nichts von Dritten');
    const g = await fetch(`${basis}/api/gesundheit`);
    assert.equal(g.status, 503);
    assert.deepEqual(await g.json(), { ok: false, zustand: 'startet', startet: true });
    assert.equal((await fetch(`${basis}/api/konto/status`)).status, 503);

    writeFileSync(datei, 'unsinn\n');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(schritt(await seite()), 'Datenbank wird angelegt (nur beim ersten Start)', 'Unbekanntes bleibt liegen');
    writeFileSync(datei, 'ablago\n');
    await bis(async () => schritt(await seite()) === 'Ablago startet', 'Schritt ablago');

    // Übergabe: Ablago lauscht mit (SO_REUSEPORT) und bittet den Vorstart dann um Freigabe – jede neue Verbindung (wie
    // beim Neuladen der Seite) bekommt Antwort. Eine ruhende Keep-Alive-Verbindung zum Vorstart darf dabei enden;
    // Browser wiederholen ein GET darauf von selbst.
    const ablago = new Startmodus({ port, host: '127.0.0.1', vorgaenger: p.pid!, seit: seit * 1000 });
    let ausfaelle = 0;
    let laeuft = true;
    const neu = () =>
      new Promise<void>((fertig) => {
        httpGet(basis, { agent: false }, (r) => {
          r.resume();
          r.on('end', () => fertig());
        }).on('error', () => {
          ausfaelle++;
          fertig();
        });
      });
    const dauerfeuer = (async () => {
      while (laeuft) await neu();
    })();
    const ende = new Promise((r) => p.once('exit', r));
    await ablago.oeffne();
    await ende;
    await new Promise((r) => setTimeout(r, 200));
    laeuft = false;
    await dauerfeuer;
    try {
      // Linux verteilt neue Verbindungen bei SO_REUSEPORT auf beide Lauscher. Schließt der Vorstart seinen, verwirft der
      // Kern Verbindungen, die schon in dessen Warteschlange lagen, aber noch nicht angenommen waren. Unter Dauerfeuer
      // trifft das selten genau eine (CI 18.11.: 1 von einigen Hundert); im Alltag lädt die Startseite ohnehin neu.
      assert.ok(ausfaelle <= 1, `höchstens eine Anfrage ohne Antwort beim Wechsel (waren ${ausfaelle})`);
      assert.equal(p.exitCode, 0);
      const text = await seite();
      assert.equal(schritt(text), 'Verbindung zur Datenbank wird hergestellt');
      assert.match(text, /Läuft seit 7\d s/);
    } finally {
      await ablago.schliesse();
    }
  });

  it('Fehler aus start.sh: Grund ohne Version, Ausweg, Fehlerseite bleibt', async () => {
    const port = await freierPort();
    const datei = join(tmp, 'vorstart-fehler');
    writeFileSync(datei, 'fehler pg-version\n');
    const grund = { ...process.env };
    delete grund.NODE_TEST_CONTEXT;
    const p = spawn(process.execPath, ['--import', 'tsx', 'src/vorstart.ts'], {
      cwd: SERVER,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...grund, PORT: String(port), HOST: '127.0.0.1', DMS_VORSTART_DATEI: datei },
    });
    prozesse.push(p);
    const basis = `http://127.0.0.1:${port}`;
    let text = '';
    await bis(async () => {
      text = await (await fetch(basis)).text();
      return /Ablago konnte nicht starten/.test(text);
    }, 'Fehlerseite');
    assert.match(text, /anderen Hauptversion von PostgreSQL als dieses Image/);
    assert.match(text, /Sicherung und Wiederherstellung/);
    assert.ok(!/PostgreSQL \d/.test(text), 'keine Version');
    // Ein späterer Schritt ändert nichts mehr.
    writeFileSync(datei, 'ablago\n');
    await new Promise((r) => setTimeout(r, 400));
    assert.match(await (await fetch(basis)).text(), /Ablago konnte nicht starten/);
    const g = (await (await fetch(`${basis}/api/gesundheit`)).json()) as { zustand: string };
    assert.equal(g.zustand, 'fehler');
    p.kill('SIGTERM');
    await new Promise((r) => p.once('exit', r));
    assert.equal(p.exitCode, 0);
  });
});

const URL_DB = process.env.TEST_DATABASE_URL;
describe('Migration wartet auf die Sperre (#1250)', { skip: !URL_DB && 'TEST_DATABASE_URL fehlt', timeout: 60_000 }, () => {
  it('meldet „wartet“, solange eine andere Ablago die Sperre hält, und migriert danach', async () => {
    const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/datenbank/anbindung');
    const { migriere, verbinde } = await import('../src/datenbank/db');
    const { default: postgres } = await import('postgres');
    const a = { ...ausUrl(URL_DB)!, datenbank: `dmstest_b_sperre_${Date.now().toString(36)}` };
    await legeDatenbankAn(a);
    const ordner = mkdtempSync(join(tmp, 'mig-'));
    writeFileSync(join(ordner, '001_a.sql'), 'CREATE TABLE t_a (x int);');
    const sql = verbinde(alsUrl(a), 2);
    const andere = postgres(alsUrl(a), { max: 1, onnotice: () => {} });
    try {
      let gewartet = 0;
      let frei: () => void = () => {};
      const gehalten = new Promise<void>((r) => (frei = r));
      let belegt: () => void = () => {};
      const sperreDa = new Promise<void>((r) => (belegt = r));
      const halter = andere.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(4711001)`;
        belegt();
        await gehalten;
      });
      await sperreDa;
      const lauf = migriere(
        sql,
        ordner,
        () => {},
        () => {},
        () => gewartet++,
      );
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(gewartet, 1, 'Startseite zeigt „gesperrt“');
      frei();
      await halter;
      await lauf;
      assert.equal((await sql`SELECT count(*)::int AS n FROM schema_migrationen`)[0].n, 1);
    } finally {
      await sql.end({ timeout: 1 });
      await andere.end({ timeout: 1 });
      const verwaltung = postgres(alsUrl({ ...a, datenbank: 'postgres' }), { onnotice: () => {} });
      await verwaltung.unsafe(`DROP DATABASE IF EXISTS "${a.datenbank}" WITH (FORCE)`).catch(() => {});
      await verwaltung.end();
    }
  });
});
