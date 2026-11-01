/**
 * Zeitmessung genauer (#477): Server-Timing mit vor, rechte, json, gesamt; Aufteilung im Browser;
 * Rechte-Zeit ohne doppelte Zählung; lange Anfragen als Langläufer; Anstehend und Zähler ohne
 * Durchgang über alle Mappen.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { kontext, type Kontext } from '../src/protokoll';
import { aufteilungText, Messung, rechteMessen, serverTiming, speicherMessSpeicher, zeitaufteilung } from '../src/messung';
import { speicherRepo } from '../src/repo-speicher';
import { liesServerTiming, teileAuf } from '../../shared/src/zeitmessung';

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));
const neuerKontext = (): Kontext => ({ anfrage: 't', db: { anzahl: 0, ms: 0 } });

describe('Server-Timing (#477)', () => {
  it('teilt eine Anfrage auf und schreibt den Header', () => {
    const t = zeitaufteilung({ eingang: 100, start: 103, ende: 203, senden: 204, jetzt: 210, db: { anzahl: 4, ms: 60 }, rechte: { ms: 30, dbMs: 10 } });
    assert.deepEqual(t, { vor: 3, app: 100, db: 60, dbAnzahl: 4, rechte: 20, json: 6, gesamt: 110 });
    assert.equal(serverTiming(t), 'vor;dur=3.0, app;dur=100.0, db;dur=60.0;desc="4", rechte;dur=20.0, json;dur=6.0, gesamt;dur=110.0');
    assert.match(aufteilungText(t), /^110 ms gesamt · Warten vor dem Handler 3 · Datenbank 60 \(4\) · Rechte 20 · Aufbereitung 20 · JSON 6$/);
  });

  it('keine negativen oder unsinnigen Werte (Rechte höchstens so lang wie der Handler)', () => {
    const t = zeitaufteilung({ eingang: 10, start: 5, ende: 8, jetzt: 9, db: { anzahl: 0, ms: 0 }, rechte: { ms: 50, dbMs: 0 } });
    assert.equal(t.vor, 0);
    assert.equal(t.json, 0);
    assert.equal(t.rechte, 3);
  });

  it('Rechte: verschachtelte und gleichzeitige Auswertungen zählen einmal, Datenbankzeit darin abgezogen', async () => {
    const k = neuerKontext();
    const messung = new Messung(speicherMessSpeicher());
    const repo = messung.umhuelle({ async lies() { await warte(30); return 1; } }, 'test');
    await kontext.run(k, async () => {
      await rechteMessen(async () => {
        // zwei gleichzeitige, darin verschachtelt eine weitere und ein Datenbankzugriff
        await Promise.all([rechteMessen(() => warte(40)), rechteMessen(async () => { await rechteMessen(() => warte(20)); await repo.lies(); })]);
      });
    });
    const r = k.rechte!;
    assert.equal(r.offen, 0);
    assert.ok(r.ms >= 45 && r.ms < 150, `Wandzeit ${r.ms}`);
    assert.ok(r.dbMs >= 25, `Datenbank in Rechten ${r.dbMs}`);
    assert.equal(k.db.anzahl, 1);
    const t = zeitaufteilung({ eingang: 0, start: 0, ende: 1000, jetzt: 1000, db: k.db, rechte: r });
    assert.ok(Math.abs(t.rechte - (r.ms - r.dbMs)) < 0.01);
  });

  it('Rechte außerhalb einer Anfrage und bei Fehlern', async () => {
    assert.equal(rechteMessen(() => 5), 5);
    const k = neuerKontext();
    await kontext.run(k, async () => {
      assert.throws(() => rechteMessen(() => { throw new Error('x'); }));
      await assert.rejects(rechteMessen(async () => { throw new Error('y'); }));
    });
    assert.equal(k.rechte!.offen, 0);
  });

  it('lange Anfrage: Langläufer mit Aufteilung, kurze nicht', async () => {
    const m = new Messung(speicherMessSpeicher());
    await m.setze({ schwelleMs: 100 });
    const t = zeitaufteilung({ eingang: 0, start: 2, ende: 150, senden: 150, jetzt: 155, db: { anzahl: 2, ms: 90 }, rechte: { ms: 10, dbMs: 0 } });
    m.erfasseAnfrage({ pfad: 'GET /api/sichten', benutzer: 'ben' }, t);
    m.erfasseAnfrage({ pfad: 'GET /api/typen' }, { ...t, gesamt: 20 });
    await warte(5);
    const l = await m.speicher.liste(10);
    assert.equal(l.length, 1);
    assert.equal(l[0].anfrage, 'GET /api/sichten');
    assert.equal(l[0].dauerMs, 155);
    assert.match(l[0].zugriff, /^Anfrage: 155 ms gesamt · .*Datenbank 90 \(2\) · Rechte 10 /);
  });
});

describe('Aufteilung im Browser (#477)', () => {
  it('liest Server-Timing, auch ältere Header ohne gesamt', () => {
    const neu = liesServerTiming('vor;dur=0.4, app;dur=80.0, db;dur=50.0;desc="7", rechte;dur=12.5, json;dur=3.0, gesamt;dur=84.0');
    assert.deepEqual(neu, { werte: { vor: 0.4, app: 80, db: 50, rechte: 12.5, json: 3, gesamt: 84 }, dbAnzahl: 7 });
    assert.deepEqual(liesServerTiming('app;dur=12.3, db;dur=4.0;desc="2"'), { werte: { app: 12.3, db: 4 }, dbAnzahl: 2 });
    assert.deepEqual(liesServerTiming(''), { werte: {}, dbAnzahl: undefined });
  });

  it('trennt Warten im Browser, Leitung und die Teile im Server', () => {
    const st = liesServerTiming('vor;dur=5, app;dur=80, db;dur=50;desc="7", rechte;dur=10, json;dur=3, gesamt;dur=90');
    // Start 1000, wartet 200 ms im Browser (6 Anfragen laufen schon), Verbindung 0, Antwort nach 100 ms.
    const a = teileAuf(st, { startTime: 1000, connectStart: 1000, connectEnd: 1000, requestStart: 1200, responseStart: 1300, responseEnd: 1310 }, 0);
    assert.deepEqual(a, { wartenBrowser: 200, leitung: 10, wartenServer: 5, rechte: 10, aufbereitung: 20, db: 50, dbAnzahl: 7, json: 3, uebertragung: 10 });
  });

  it('ohne Resource Timing: Leitung aus der Wartezeit, Warten im Browser unbekannt', () => {
    const a = teileAuf(liesServerTiming('app;dur=30, db;dur=10;desc="1"'), undefined, 45);
    assert.equal(a.wartenBrowser, undefined);
    assert.equal(a.leitung, 15);
    assert.equal(a.aufbereitung, 20);
    assert.equal(a.wartenServer, undefined);
  });
});

const TYP = { name: 'Vertrag', beschreibung: '', titelVorlage: '', felder: [{ key: 'ende', label: 'Ende', typ: 'datum' }, { key: 'kuendigen', label: 'Kündigen', typ: 'datum' }], register: [] } as never;
const uuid = () => crypto.randomUUID();

/** Gemeinsam für Arbeitsspeicher und PostgreSQL. */
async function pruefeMappenMitDatum(repo: import('../src/repo').Repo) {
  const typ = await repo.legeTypAn(uuid(), TYP);
  const lege = (werte: Record<string, unknown>) => repo.legeMappeAn(uuid(), typ.id, werte as never, [], null);
  const a = await lege({ ende: '2026-11-10' });
  await lege({ ende: '2027-01-10' });
  const c = await lege({ kuendigen: '2026-11-30', ende: 'kein Datum' });
  await lege({});
  const ids = (await repo.mappenMitDatum(typ.id, ['ende', 'kuendigen'], '2026-11-01', '2026-11-30')).map((m) => m.id).sort();
  assert.deepEqual(ids, [a.id, c.id].sort());
  assert.deepEqual(await repo.mappenMitDatum(typ.id, ['ende'], '2026-12-01', '2026-12-31'), []);
  return { typ, a };
}

/** Eingang: Mappen mit offener Aufgabe für mich – auch mit Lesefilter, der nichts zeigt (#127). */
async function pruefeEingang(repo: import('../src/repo').Repo, mappeId: string, ben: string) {
  for (const text of ['a', 'b']) await repo.legeAufgabeAn({ id: uuid(), mappeId, empfaengerId: ben, art: 'manuell', text, erstellt: new Date().toISOString(), erstelltVon: null, erledigt: null, erledigtVon: null });
  const ohne = await repo.zaehler(ben, false);
  const mit = await repo.zaehler(ben, false, { offen: [], je: [] });
  assert.equal(ohne.eingang, 1);
  assert.equal(mit.eingang, 1, 'auch wenn der Benutzer die Mappe nicht lesen darf (#127)');
  assert.equal(mit.typen.size, 0);
  assert.equal((await repo.zaehler('00000000-0000-4000-8000-00000000ffff', false)).eingang, 0);
}

describe('Anstehend und Zähler ohne Durchgang über alle Mappen (#477)', () => {
  it('mappenMitDatum und Eingang im Arbeitsspeicher', async () => {
    const repo = speicherRepo();
    const { a } = await pruefeMappenMitDatum(repo);
    await pruefeEingang(repo, a.id, '00000000-0000-4000-8000-0000000004bb');
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('PostgreSQL: mappenMitDatum und Eingang im Zähler (#477)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sql: any; let repo: import('../src/repo').Repo;
  const HAUSHALT = '00000000-0000-4000-8000-000000000477';
  const BEN = '00000000-0000-4000-8000-0000000004bb';
  const aufraeumen = async () => {
    await sql`DELETE FROM aufgaben WHERE haushalt_id = ${HAUSHALT}`;
    await sql`DELETE FROM mappen WHERE haushalt_id = ${HAUSHALT}`;
    await sql`DELETE FROM mappentypen WHERE haushalt_id = ${HAUSHALT}`;
    await sql`DELETE FROM benutzer WHERE haushalt_id = ${HAUSHALT}`;
  };
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    const { pgRepo } = await import('../src/repo-pg');
    const { fileURLToPath } = await import('node:url');
    sql = verbinde(url!);
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Zeitmessung') ON CONFLICT DO NOTHING`;
    await aufraeumen();
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${BEN}, ${HAUSHALT}, 'ben-477@example.org', 'Ben', 'mitglied')`;
    repo = pgRepo(sql, HAUSHALT);
  });
  after(async () => { if (sql) { await aufraeumen(); await sql.end(); } });

  it('wie im Arbeitsspeicher', async () => {
    const { a } = await pruefeMappenMitDatum(repo);
    assert.deepEqual(await repo.mappenMitDatum('kein-uuid', ['ende'], '2026-11-01', '2026-11-30'), []);
    await pruefeEingang(repo, a.id, BEN);
  });
});

const echtesFastify = await import('fastify').then((m) => typeof m.default === 'function', () => false);
describe('HTTP: Server-Timing-Header (#477)', { skip: echtesFastify ? false : 'fastify nicht installiert' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let app: any; let messung: Messung; let cookie = '';
  before(async () => {
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    messung = new Messung(speicherMessSpeicher());
    // Typen etwas langsam, damit die Anfrage sicher über der kleinsten Schwelle (1 ms) liegt.
    const repo = speicherRepo();
    const typen = repo.listeTypen.bind(repo);
    repo.listeTypen = async () => { await warte(3); return typen(); };
    const dienst = new Dienst(messung.umhuelle(repo, 'mappen'), speicherDateien());
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.benutzerspiegel());
    app = await baueApp(dienst, konten, { messung });
  });
  after(async () => { await app?.close(); });

  it('jede Antwort einer Route hat vor, app, db, rechte, json und gesamt – plausibel', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/konto/einrichten', headers: { 'x-dms': '1' }, payload: { email: 'a@example.org', name: 'A', passwort: 'ein-langes-passwort' } });
    assert.equal(r.statusCode, 201);
    cookie = String(r.headers['set-cookie']).split(';')[0];
    const typen = await app.inject({ method: 'GET', url: '/api/typen', headers: { 'x-dms': '1', cookie } });
    assert.equal(typen.statusCode, 200);
    const kopf = String(typen.headers['server-timing']);
    assert.match(kopf, /^vor;dur=[\d.]+, app;dur=[\d.]+, db;dur=[\d.]+;desc="\d+", rechte;dur=[\d.]+, json;dur=[\d.]+, gesamt;dur=[\d.]+$/);
    const { werte, dbAnzahl } = liesServerTiming(kopf);
    assert.ok(dbAnzahl! >= 1, 'Typen kommen aus dem Repo');
    assert.ok(werte.gesamt >= werte.app, 'gesamt umfasst den Handler');
    assert.ok(werte.gesamt + 0.2 >= werte.vor + werte.app + werte.json, 'die Teile passen in gesamt');
    assert.ok(werte.app + 0.1 >= werte.db, 'Datenbank liegt im Handler');
    // Fehler (404 einer unbekannten Mappe): kein Server-Timing nötig, aber auch kein Absturz.
    const fehlt = await app.inject({ method: 'GET', url: '/api/mappen/00000000-0000-4000-8000-000000000000', headers: { 'x-dms': '1', cookie } });
    assert.equal(fehlt.statusCode, 404);
  });

  it('lange Anfrage landet mit Aufteilung bei den Langläufern', async () => {
    await messung.setze({ schwelleMs: 1 });
    const r = await app.inject({ method: 'GET', url: '/api/typen', headers: { 'x-dms': '1', cookie } });
    assert.equal(r.statusCode, 200);
    await warte(5);
    const l = (await messung.speicher.liste(20)).find((x) => x.anfrage === 'GET /api/typen' && x.zugriff.startsWith('Anfrage: '));
    assert.ok(l, 'Langläufer gemerkt');
    assert.match(l!.zugriff, /^Anfrage: \d+ ms gesamt · Warten vor dem Handler/);
  });
});
