/**
 * Lasttest-Modus Ende zu Ende (#612), mit TEST_DATABASE_URL: das ganze DMS (src/index.ts) mit DMS_LASTTEST=klein und
 * kurzer Dauer gegen eine frische Datenbank – Seite statt Ablage, Lauf bis zum Ergebnis, Datei, Herunterfahren und
 * Neustart danach. Und die Sperre: Dieselbe Variable in einer eingerichteten, echten Installation legt nichts an,
 * das DMS läuft normal und meldet den Abbruch in der Werkbank-Übersicht.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import type { LasttestStand } from '../../shared/src/lasttest';

const URL_DB = process.env.TEST_DATABASE_URL;
const SERVER = new URL('..', import.meta.url).pathname;
const WEB_DIST = join(SERVER, '..', 'web', 'dist');
const tmp = mkdtempSync(join(tmpdir(), 'dms-lasttest-e2e-'));
const datenbanken: string[] = [];
const prozesse: ChildProcess[] = [];

after(async () => {
  for (const p of prozesse) if (p.exitCode === null) p.kill('SIGKILL');
  if (URL_DB) {
    const { ausUrl, alsUrl } = await import('../src/anbindung');
    const { default: postgres } = await import('postgres');
    const a = ausUrl(URL_DB)!;
    const sql = postgres(alsUrl({ ...a, datenbank: 'postgres' }), { onnotice: () => {} });
    for (const d of datenbanken) await sql.unsafe(`DROP DATABASE IF EXISTS "${d}" WITH (FORCE)`).catch(() => {});
    await sql.end();
  }
  rmSync(tmp, { recursive: true, force: true });
});

async function freierPort(): Promise<number> {
  return new Promise((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => r(typeof a === 'object' && a ? a.port : 0)); }); });
}

async function neueDatenbank(name: string): Promise<string> {
  const { ausUrl, alsUrl, legeDatenbankAn } = await import('../src/anbindung');
  const a = { ...ausUrl(URL_DB)!, datenbank: `dms_lt612_${name}_${Date.now().toString(36)}` };
  await legeDatenbankAn(a);
  datenbanken.push(a.datenbank);
  return alsUrl(a);
}

/** Das DMS als eigenen Prozess starten; wartet, bis der Port antwortet. */
async function starte(db: string, wurzel: string, extra: Record<string, string> = {}) {
  const port = await freierPort();
  // Protokoll wie im Betrieb (unter dem Test-Runner schweigt es sonst).
  const { NODE_TEST_CONTEXT: _t, NODE_ENV: _n, ...grund } = process.env;
  const p = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: SERVER, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...grund, DATABASE_URL: db, DMS_DATENWURZEL: wurzel, PORT: String(port), HOST: '127.0.0.1', LOG_LEVEL: 'warn', DMS_LASTTEST: '', DMS_EINRICHTUNGSCODE: '', ...extra },
  });
  prozesse.push(p);
  let log = '';
  p.stdout!.on('data', (d: Buffer) => { log += d.toString(); });
  p.stderr!.on('data', (d: Buffer) => { log += d.toString(); });
  const ende = new Promise<number | null>((r) => p.on('exit', (c) => r(c)));
  const basis = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    if (p.exitCode !== null) throw new Error(`DMS beendet (Code ${p.exitCode}):\n${log}`);
    try { if ((await fetch(`${basis}/api/konto/status`)).ok) break; } catch { /* startet noch */ }
    if (i > 240) throw new Error(`Ablago startet nicht:\n${log}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  return { basis, prozess: p, ende, log: () => log };
}

const json = async <T>(r: Response | Promise<Response>): Promise<T> => (await (await r).json()) as T;
const post = (basis: string, pfad: string, body: unknown, koepfe: Record<string, string> = {}) =>
  fetch(basis + pfad, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json', ...koepfe }, body: JSON.stringify(body) });

/** #1117: Werte vor den Durchgängen – beim Einrichten, Anlegen der Demo-Mappen oder Warten auf den Volltext. */
const vorDenDurchgaengen = (s: LasttestStand) => (s.live && s.live.jetzt.name === null && ['einrichten', 'demo', 'hintergrund'].includes(s.schritt) ? s.live : null);

/** #1117: Version des Containers im Stand, im Bericht und im Ergebnisblock; Auslastung schon vor den Durchgängen. */
function pruefeVersionUndVorlauf(s: LasttestStand, vorher: LasttestStand['live']) {
  assert.match(s.version ?? '', /^\d+\.\d+\.\d+/);
  assert.ok(s.ergebnis!.bericht.includes(`\nAblago-Version: ${s.version}\n`), 'Version im Bericht');
  assert.ok(s.ergebnis!.vorlage.includes(`\nAblago-Version: ${s.version} · `), 'Version im Ergebnisblock');
  assert.ok(vorher && vorher.jetzt.p95 === null && vorher.jetzt.n === null, 'Auslastung schon beim Einrichten bzw. Anlegen der Demo-Mappen');
}

describe('Lasttest-Modus Ende zu Ende (#612)', { skip: !URL_DB && 'TEST_DATABASE_URL fehlt', timeout: 600_000 }, () => {
  it('nur DMS_LASTTEST=klein, ohne Ordner: Seite, Lauf bis zum Ergebnis, Herunterfahren, Neustart ohne zweiten Lauf', async () => {
    const db = await neueDatenbank('frisch');
    const wurzel = join(tmp, 'frisch');
    const env = { DMS_LASTTEST: 'klein', DMS_LASTTEST_DAUER: '3' };
    const d = await starte(db, wurzel, env);
    const status = await json<{ lasttest?: boolean }>(fetch(`${d.basis}/api/konto/status`));
    assert.equal(status.lasttest, true);
    assert.equal((await fetch(`${d.basis}/api/mappen`)).status, 503, 'keine Ablage unter dem Port');
    // Die Seite selbst gibt es nur mit gebauter Oberfläche (im Image immer; in der CI laufen die Tests vor dem Bauen,
    // dort prüft deploy/komplett-probe.sh die Seite im echten Container).
    if (existsSync(join(WEB_DIST, 'index.html'))) assert.match(await (await fetch(`${d.basis}/`)).text(), /<div id="root">/, 'Seite der Oberfläche');
    let s: LasttestStand;
    /** #895: Werte der laufenden Messung, wie sie die Seite zeigt. */
    let live: LasttestStand['live'] = null;
    /** #1117: Werte schon beim Anlegen der Demo-Mappen (ohne Durchgang). */
    let vorher: LasttestStand['live'] = null;
    for (let i = 0; ; i++) {
      s = await json<LasttestStand>(fetch(`${d.basis}/api/lasttest`));
      if (s.live?.jetzt.name && s.live.verlauf.length >= (live?.verlauf.length ?? 0)) live = s.live;
      vorher ??= vorDenDurchgaengen(s);
      if (s.zustand !== 'laeuft') break;
      if (i > 600) throw new Error(`Lasttest nicht fertig:\n${d.log()}`);
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(s.zustand, 'fertig', `${s.meldung}\n${d.log()}`);
    assert.deepEqual(s.fertigeStufen, ['klein']);
    // Der bisherige Durchgang und danach „mit Speichern“ (#739) als eigene Zeile.
    assert.deepEqual(s.durchgaenge.map((x) => x.name), ['klein', 'klein + Speichern']);
    assert.match(s.ergebnis!.vorlage, /Messergebnis Lasttest[\s\S]*Gerät\/Modell: \{\{geraet\}\}[\s\S]*klein\s+25 gleichzeitig: p50[^\n]*\n  Engpass klein: Warten auf DB-Verbindung p95 [^\n]*\n(?:  Teuerste Abfragen klein: [^\n]*\n)?(?:  CPU je Gruppe klein [^\n]*\n)?klein \+ Speichern\s+25 gleichzeitig: p50/);
    // #895: CPU je Gruppe unter der Stufe, Protokoll als Zeile; im Bericht ausführlich; live auf der Seite.
    assert.match(s.ergebnis!.vorlage, /\n  CPU je Gruppe klein \(% eines Kerns, Speicher RSS höchstens\): Ablago Prozess 1 \d+ % \d+ MB · Lastgenerator \d+ % /);
    assert.match(s.ergebnis!.vorlage, /\nProtokoll: (keine Warnungen und Fehler|[\d.]+ Warnungen und Fehler, \d+ (?:Art|Arten) – )/);
    assert.match(s.ergebnis!.bericht, /CPU und Speicher je Gruppe „klein“[\s\S]*Warnungen und Fehler im Protokoll \(#895/);
    assert.ok(live && live.jetzt.name?.startsWith('klein') && live.jetzt.n === 25, 'Werte der laufenden Messung auf der Seite');
    pruefeVersionUndVorlauf(s, vorher);
    assert.ok(live.jetzt.gruppen?.some((g) => g.art === 'lastgenerator'), 'Lastgenerator erkannt');
    assert.equal(s.live, null, 'nach dem Lauf weg');
    // Engpass (#874): eigene Zeile je Durchgang, über alle Prozesse.
    assert.match(s.ergebnis!.vorlage, /\n  Engpass klein \+ Speichern: [^\n]*Speicher je Prozess: Prozess 1: \d+ MB \(Halde \d+\)/);
    assert.ok(!/Abgelehnt \(4xx\)/.test(s.ergebnis!.bericht), 'alle schreibenden Anfragen gehen durch');
    assert.match(s.ergebnis!.bericht, /Bestand: 50\d\d Mappen \(5000 Demo-Mappen\)/);
    assert.ok(!/lasttest-passwort|lasttest-person-passwort|EINRICHTUNGSCODE|127\.0\.0\.1/.test(JSON.stringify(s)), 'keine Zugangsdaten, keine Adressen');
    // #920: je Person ein eigenes Konto – im Bericht und im Ergebnisblock erkennbar.
    assert.match(s.ergebnis!.vorlage, /\nPersonen: je Person ein eigenes Konto \(30 Konten, reihum; seit #920\)\n/);
    assert.match(s.ergebnis!.bericht, /Simulierte Personen \(#920\): je Person ein eigenes Konto mit eigener Sitzung – 30 Konten/);
    assert.ok(!/@example\.org/.test(s.ergebnis!.vorlage), 'keine Adressen der Konten im Ergebnis');
    await post(d.basis, '/api/lasttest/angaben', { geraet: 'Beispiel-NAS, 8 GB RAM', speicher: 'SSD' });
    const datei = join(wurzel, 'ergebnis', 'lasttest-klein.md');
    assert.match(readFileSync(datei, 'utf8'), /Gerät\/Modell: Beispiel-NAS, 8 GB RAM/);
    assert.match(d.log(), /Messergebnis Lasttest/, 'Ergebnis auch in den Logs');

    assert.equal((await post(d.basis, '/api/lasttest/beenden', {})).status, 200);
    assert.equal(await d.ende, 0, 'Ablago beendet sich – der Container endet mit ihm');
    assert.ok(existsSync(join(wurzel, 'ergebnis', 'beendet')));

    // Neustart (z. B. Neustart-Regel der NAS): kein zweiter Lauf, das Ergebnis steht noch da.
    const n = await starte(db, wurzel, env);
    const s2 = await json<LasttestStand>(fetch(`${n.basis}/api/lasttest`));
    assert.equal(s2.zustand, 'beendet');
    assert.equal(s2.angaben.geraet, 'Beispiel-NAS, 8 GB RAM');
    n.prozess.kill('SIGTERM');
    await n.ende;
  });

  it('DMS_LASTTEST in einer echten Installation: nichts angelegt, Ablago läuft normal, Hinweis in der Übersicht', async () => {
    const db = await neueDatenbank('echt');
    const wurzel = join(tmp, 'echt');
    // Erst normal einrichten – mit einem eigenen Administrator wie in einem echten Haushalt.
    const a = await starte(db, wurzel, { DMS_EINRICHTUNGSCODE: 'aus' });
    const r = await post(a.basis, '/api/konto/einrichten', { mandant: 'Familie Beispiel', email: 'katrin@example.org', name: 'Katrin', passwort: 'echtes-passwort-123' });
    assert.equal(r.status, 201, await r.text());
    a.prozess.kill('SIGTERM');
    await a.ende;

    const d = await starte(db, wurzel, { DMS_LASTTEST: 'klein' });
    const status = await json<{ lasttest?: boolean; einrichtungNoetig: boolean }>(fetch(`${d.basis}/api/konto/status`));
    assert.equal(status.lasttest, undefined, 'keine Lasttest-Seite');
    assert.equal(status.einrichtungNoetig, false);
    assert.notEqual((await fetch(`${d.basis}/api/lasttest/beenden`, { method: 'POST', headers: { 'x-dms': '1' } })).status, 200, 'kein Knopf zum Herunterfahren');
    const an = await post(d.basis, '/api/konto/anmelden', { email: 'katrin@example.org', passwort: 'echtes-passwort-123' });
    assert.equal(an.status, 200);
    const cookie = an.headers.get('set-cookie')!.split(';')[0];
    // Werkbank nur im Verwaltungsmodus (#819); die Anmeldung ist frisch.
    assert.equal((await fetch(`${d.basis}/api/konto/verwaltung`, { method: 'POST', headers: { cookie, 'x-dms': '1', 'content-type': 'application/json' }, body: '{}' })).status, 200);
    const u = await json<{ lasttestAbbruch: string | null }>(fetch(`${d.basis}/api/werkbank/uebersicht`, { headers: { cookie, 'x-dms': '1' } }));
    assert.match(u.lasttestAbbruch ?? '', /schon eingerichtet, aber nicht vom Lasttest/);
    const demo = await json<Array<{ demo: number }>>(fetch(`${d.basis}/api/werkbank/demo`, { headers: { cookie, 'x-dms': '1' } }));
    assert.equal(demo.reduce((x, t) => x + t.demo, 0), 0, 'keine Demo-Mappen angelegt');
    const benutzer = await json<Array<{ email: string }>>(fetch(`${d.basis}/api/benutzer`, { headers: { cookie, 'x-dms': '1' } }));
    assert.deepEqual(benutzer.map((b) => b.email), ['katrin@example.org'], 'keine Lasttest-Konten');
    assert.ok(!existsSync(join(wurzel, 'ergebnis')));
    assert.match(d.log(), /DMS_LASTTEST ist gesetzt, der Lasttest startet aber nicht/);
    d.prozess.kill('SIGTERM');
    await d.ende;
  });
});
