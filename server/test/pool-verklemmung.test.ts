/**
 * Verklemmung im Datenbank-Pool (#1198): Zeitpläne mit `exklusiv` hielten je eine Verbindung aus dem Pool, während ihre
 * Arbeit selbst Verbindungen brauchte – mit 7 gleichzeitigen Läufen und 3 Dauersperren war der Pool (10) voll und hing
 * für immer. Geprüft wird: viele gleichzeitige Läufe mit kleinem Pool werden fertig, die Sperrverbindung verhält sich bei
 * Abbruch wie beschrieben, die Gesundheitsprüfung schlägt bei vollem Pool fehl, Wartezeit mit Grenze, Zeitpläne gestreut,
 * Startbild und Kopfzeilen der Oberfläche.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { abgewiesenOderHaengt, Datenbankpruefung, hoechstens, istVerbindungWarten, poolGroesse, verbinde, Verbindungswarten, type DatenbankBefund } from '../src/db';
import { lebenszeichen, pgKurzzustand } from '../src/kurzzustand';
import { protokoll } from '../src/protokoll';
import { eigeneSperrquelle, Sperrverbindung } from '../src/sperrverbindung';
import { versatzMs, wiederkehrend, type Uhren } from '../src/streuung';
import { schonNeuGeladen, NEU_GELADEN_MS, startbildAusTexten, startbildDauer, startbildLage, startbildSprache, STARTBILD_PLATZHALTER } from '../../shared/src/startbild';
import { eigeneDatenbank, type EigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const warte = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** Läuft `p` nicht in `ms` durch, ist es eine Verklemmung. */
const mitGrenze = <T>(p: Promise<T>, ms: number, was: string) => Promise.race([p, warte(ms).then(() => { throw new Error(`${was}: nach ${ms} ms nicht fertig – Verklemmung?`); })]);

/** Warnungen des Protokolls mitschreiben. */
function warnungen() {
  const liste: string[] = [];
  const weg = protokoll.beobachte((e) => { liste.push(`${e.text} ${JSON.stringify(e.daten ?? {})}`); });
  return { liste, weg };
}

describe('Verklemmung im Pool (#1198)', { skip: !url && 'ohne TEST_DATABASE_URL' }, () => {
  let db: EigeneDatenbank;
  let H = '';
  before(async () => {
    db = await eigeneDatenbank('pool_1198');
    H = randomUUID();
    await db.sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Test')`;
  });
  after(async () => { await db?.ende(); });

  it('kleiner Pool (4), viele gleichzeitige exklusiv-Läufe, deren Arbeit selbst Abfragen macht: alle fertig', async () => {
    const sql = verbinde(db.url, 4);
    const sperren = new Sperrverbindung(eigeneSperrquelle(db.url));
    const z = pgKurzzustand(sql, H, Date.now, sperren);
    try {
      // Wie im Betrieb: Lebenszeichen und zwei Dauersperren dauerhaft, dazu 12 Zeitpläne zur selben Sekunde.
      const lebt = await lebenszeichen(sperren, H);
      const eingang = sperren.dauerhaft({ klasse: 4711195 }, 'eingangsordner');
      const post = sperren.dauerhaft({ klasse: 4711196 }, 'postfaecher');
      assert.equal(await eingang.halte(), true);
      assert.equal(await post.halte(), true);
      const laeufe = Array.from({ length: 12 }, (_, i) => z.exklusiv(`plan-${i}`, async () => {
        // Arbeit mit mehreren Abfragen, teils gleichzeitig, und einer Transaktion – wie Papierkorb, Fristen …
        await Promise.all([sql`SELECT pg_sleep(0.05)`, sql`SELECT 1`, sql`SELECT count(*) FROM haushalte`]);
        await sql.begin(async (tx) => { await tx`SELECT pg_sleep(0.02)`; });
        return i;
      }));
      const erg = await mitGrenze(Promise.all(laeufe), 15_000, 'exklusiv-Läufe');
      assert.deepEqual(erg.map((r) => r.ok), Array(12).fill(true));
      // Der Pool hält nichts fest: Alle Sperren liegen auf der einen Sperrverbindung.
      const sitzungen = await sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'Ablago Sperren'`;
      assert.equal(sitzungen[0].n, 1, 'genau eine Sperrverbindung');
      assert.deepEqual(sperren.stand().gehalten.map((g) => g.bezeichnung).sort(), ['eingangsordner', 'lebenszeichen', 'postfaecher']);
      await eingang.gib(); await post.gib(); await lebt.ende();
      assert.equal(sperren.stand().offen, false, 'ohne Sperren ist die Verbindung zu');
    } finally { await sperren.ende(); await sql.end(); }
  });

  it('auch mit der Sperrverbindung aus dem Pool (Vorgabe ohne Angabe) keine Verklemmung', async () => {
    const sql = verbinde(db.url, 3);
    const z = pgKurzzustand(sql, H);
    try {
      const laeufe = Array.from({ length: 8 }, (_, i) => z.exklusiv(`pool-${i}`, async () => { await Promise.all([sql`SELECT pg_sleep(0.02)`, sql`SELECT 1`]); return i; }));
      const erg = await mitGrenze(Promise.all(laeufe), 15_000, 'exklusiv aus dem Pool');
      assert.ok(erg.every((r) => r.ok));
    } finally { await sql.end(); }
  });

  it('Sperren: nie doppelt (auch nicht im selben Prozess), Paket-Sperre mit einer Zahl, frei nach dem Lauf', async () => {
    const a = new Sperrverbindung(eigeneSperrquelle(db.url));
    const b = new Sperrverbindung(eigeneSperrquelle(db.url));
    try {
      const s1 = await a.versuche({ klasse: 4711405 }, 'pakete');
      assert.ok(s1?.gueltig);
      assert.equal(await a.versuche({ klasse: 4711405 }, 'pakete'), null, 'derselbe Prozess nicht doppelt');
      assert.equal(await b.versuche({ klasse: 4711405 }, 'pakete'), null, 'ein anderer Prozess nicht');
      // Gleichzeitige Versuche im selben Prozess: genau einer.
      const zwei = await Promise.all([b.versuche({ klasse: 744, name: 'x' }, 'x'), b.versuche({ klasse: 744, name: 'x' }, 'x')]);
      assert.equal(zwei.filter(Boolean).length, 1);
      await s1!.gib();
      assert.equal(s1!.gueltig, false);
      const s2 = await b.versuche({ klasse: 4711405 }, 'pakete');
      assert.ok(s2, 'nach dem Freigeben frei');
      await s2!.gib();
      await zwei.find(Boolean)!.gib();
    } finally { await a.ende(); await b.ende(); }
  });

  it('Abbruch der Sperrverbindung: Sperren verloren, Arbeit läuft weiter, Warnung, neu aufgebaut; Lebenszeichen und Dauersperre kommen wieder', async () => {
    const sql = verbinde(db.url, 2);
    const sperren = new Sperrverbindung(eigeneSperrquelle(db.url), { wiederMs: 50 });
    const z = pgKurzzustand(sql, H, Date.now, sperren);
    const w = warnungen();
    try {
      const lebt = await lebenszeichen(sperren, H);
      const eingang = sperren.dauerhaft({ klasse: 4711195 }, 'eingangsordner');
      assert.equal(await eingang.halte(), true);
      let weiter!: () => void;
      const haelt = new Promise<void>((ok) => { weiter = ok; });
      const lauf = z.exklusiv('lang', async () => { await haelt; await sql`SELECT 1`; return 'fertig'; });
      await warte(50);
      // Verbindung von außen trennen (wie ein Neustart von PostgreSQL oder ein Netzfehler).
      await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'Ablago Sperren'`;
      for (let i = 0; i < 50 && !w.liste.some((x) => x.includes('Verbindung für Sperren abgebrochen')); i++) await warte(20);
      assert.ok(w.liste.some((x) => x.includes('Verbindung für Sperren abgebrochen') && x.includes('lang') && x.includes('eingangsordner')), w.liste.join('\n'));
      assert.equal(eingang.gueltig, false, 'Dauersperre verloren');
      weiter();
      assert.deepEqual(await lauf, { ok: true, wert: 'fertig' }, 'laufende Arbeit läuft weiter');
      // Neu aufgebaut: dieselbe Sperre geht wieder, die Dauersperre holt sich ihre beim nächsten Lauf.
      assert.deepEqual(await z.exklusiv('lang', async () => 'wieder'), { ok: true, wert: 'wieder' });
      assert.equal(await eingang.halte(), true);
      // Lebenszeichen von selbst wieder gesetzt: ein zweiter Prozess ist nicht allein.
      for (let i = 0; i < 50 && !(await sql`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND mode = 'ShareLock' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`)[0].n; i++) await warte(20);
      const zweiter = new Sperrverbindung(eigeneSperrquelle(db.url));
      const p2 = await lebenszeichen(zweiter, H);
      assert.equal(p2.allein, false, 'Lebenszeichen nach Abbruch wieder da');
      await p2.ende(); await zweiter.ende();
      await eingang.gib(); await lebt.ende();
    } finally { w.weg(); await sperren.ende(); await sql.end(); }
  });

  it('Gesundheitsprüfung: schlägt bei vollem Pool fehl (Zeitgrenze), ohne weitere Abfragen anzuhäufen; zwischengespeichert', async () => {
    const sql = verbinde(db.url, 2);
    let jetzt = 0;
    const p = new Datenbankpruefung(sql, { grenzeMs: 200, gueltigMs: 1000, jetzt: () => jetzt });
    try {
      assert.equal(await p.pruefe(), true);
      // Pool voll: beide Verbindungen fest vergeben (wie die Verklemmung).
      const v1 = await sql.reserve();
      const v2 = await sql.reserve();
      assert.equal(await p.pruefe(), true, 'noch zwischengespeichert');
      jetzt += 1500;
      const t0 = Date.now();
      assert.equal(await p.pruefe(), false, 'keine Verbindung frei');
      assert.ok(Date.now() - t0 < 1500, 'mit Zeitgrenze');
      for (let i = 0; i < 5; i++) { jetzt += 1500; assert.equal(await p.pruefe(), false); }
      const stats = (sql as unknown as { stats: { waiting: number } }).stats;
      assert.ok(stats.waiting <= 1, `höchstens eine Prüfung wartet (${stats.waiting})`);
      // Befund (#1199): „antwortet nicht“ seit der ersten fehlgeschlagenen Prüfung, ohne Fehlertext.
      const b = await p.befund();
      assert.equal(b.datenbank, 'antwortet-nicht');
      assert.equal(b.seit, new Date(1500).toISOString());
      assert.equal(b.dauerS, Math.round((jetzt - 1500) / 1000));
      v1.release(); v2.release();
      await warte(50);
      jetzt += 1500;
      assert.equal(await p.pruefe(), true, 'wieder frei');
      assert.deepEqual(await p.befund(), { datenbank: 'ok', seit: null, dauerS: null });
    } finally { await sql.end(); }
  });

  it('Gesundheitsprüfung: Datenbank aus (Verbindung abgelehnt) → „abgewiesen“, nicht „antwortet nicht“ (#1199)', async () => {
    // Port 1: Niemand hört zu, der Verbindungsaufbau wird sofort abgelehnt (wie ein gestoppter Datenbank-Container).
    const sql = verbinde('postgres://postgres:dms@127.0.0.1:1/aus', 1);
    let jetzt = 10_000;
    const p = new Datenbankpruefung(sql, { grenzeMs: 3000, gueltigMs: 1000, jetzt: () => jetzt });
    try {
      const b = await p.befund();
      assert.equal(b.datenbank, 'abgewiesen');
      assert.equal(b.seit, new Date(10_000).toISOString());
      assert.equal(JSON.stringify(b).includes('127.0.0.1'), false, 'keine Adresse im Befund');
      jetzt += 61_000;
      assert.equal((await p.befund()).dauerS, 61);
    } finally { await sql.end({ timeout: 0 }); }
    assert.equal(abgewiesenOderHaengt(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), 'abgewiesen');
    assert.equal(abgewiesenOderHaengt(Object.assign(new Error('x'), { code: '57P03' })), 'abgewiesen');
    assert.equal(abgewiesenOderHaengt(Object.assign(new Error('x'), { code: 'QUEUE_TIMEOUT' })), 'antwortet-nicht');
    assert.equal(abgewiesenOderHaengt(Object.assign(new Error('x'), { code: 'CONNECT_TIMEOUT' })), 'antwortet-nicht');
  });

  it('Warten auf eine Verbindung: Grenze (QUEUE_TIMEOUT) und Warnung mit Belegung und Sperren', async () => {
    const sql = verbinde(db.url, 1, { wartenS: 1 });
    const w = warnungen();
    const warten = new Verbindungswarten(sql, 1, 'vorgabe', null, { sperren: { namen: () => ['papierkorb', 'fristen'] }, warnungMs: 100 });
    try {
      const v = await sql.reserve();
      await assert.rejects(sql`SELECT 1`, (e: unknown) => istVerbindungWarten(e), 'nach der Grenze abgebrochen');
      const probe = warten.probe().catch(() => -1);
      // Läuft schon eine Messung, kommt keine zweite in die Schlange.
      assert.equal(warten.probe(), warten.probe());
      await warte(300);
      const zeile = w.liste.find((x) => x.includes('warten lange auf eine freie Verbindung'));
      assert.ok(zeile, w.liste.join('\n'));
      assert.match(zeile!, /"reserviert":1/);
      assert.match(zeile!, /papierkorb, fristen/);
      assert.deepEqual(warten.belegung(), { verbindungen: 1, frei: 0, belegt: 1, reserviert: 1, wartend: 1, max: 1, sperren: ['papierkorb', 'fristen'] });
      v.release();
      assert.notEqual(await probe, -1);
    } finally { w.weg(); await sql.end(); }
  });
});

describe('Ohne Datenbank (#1198)', () => {
  it('Pool des Leiters ohne die Sperrverbindung, weitere Prozesse unverändert', () => {
    assert.equal(poolGroesse(10, true), 9);
    assert.equal(poolGroesse(10, false), 10);
    assert.equal(poolGroesse(1, true), 1, 'mindestens 1');
  });

  it('hoechstens: Ersatz nach der Grenze, sonst das Ergebnis; ein späterer Fehler geht ins Leere', async () => {
    assert.equal(await hoechstens(Promise.resolve(1), 50, () => 2), 1);
    assert.equal(await hoechstens(warte(200).then(() => { throw new Error('zu spät'); }), 20, () => 'ersatz'), 'ersatz');
    await warte(250);
  });

  it('Gesundheit mit Datenbank (503 „datenbank“, ohne Sitzung), Sprache mit Zeitgrenze, Warten auf Verbindung → 503', async () => {
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const dienst = new Dienst(speicherRepo(), speicherDateien());
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    let dbOk = true;
    let befund: DatenbankBefund = { datenbank: 'antwortet-nicht', seit: '2026-11-14T10:00:00.000Z', dauerS: 180 };
    let sitzungen = 0;
    let haengt = false;
    const echt = konten.anmeldungZu.bind(konten);
    konten.anmeldungZu = async (...a: Parameters<typeof konten.anmeldungZu>) => {
      sitzungen++;
      if (haengt) return new Promise<never>(() => {});
      return echt(...a);
    };
    const app = await baueApp(dienst, konten, { datenbank: { befund: async () => (dbOk ? { datenbank: 'ok', seit: null, dauerS: null } : befund) } });
    const cookie = { cookie: 'dms_sitzung=irgendwas' };
    try {
      let r = await app.inject({ method: 'GET', url: '/api/gesundheit', headers: cookie });
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().zustand, 'laeuft');
      dbOk = false;
      r = await app.inject({ method: 'GET', url: '/api/gesundheit', headers: cookie });
      assert.equal(r.statusCode, 503);
      assert.equal(r.json().zustand, 'datenbank');
      assert.equal(r.json().ok, false);
      // #1199: Zustand und seit wann, für „Ablago antwortet gerade nicht“ – sonst nichts (keine Version, kein Fehlertext).
      assert.equal(r.json().datenbank, 'antwortet-nicht');
      assert.equal(r.json().seit, '2026-11-14T10:00:00.000Z');
      assert.equal(r.json().dauerS, 180);
      assert.deepEqual(Object.keys(r.json()).sort(), ['datenbank', 'dauerS', 'ok', 'seit', 'stand', 'zustand']);
      befund = { datenbank: 'abgewiesen', seit: '2026-11-14T10:00:00.000Z', dauerS: 5 };
      r = await app.inject({ method: 'GET', url: '/api/gesundheit', headers: cookie });
      assert.equal(r.statusCode, 503);
      assert.equal(r.json().datenbank, 'abgewiesen');
      assert.equal(sitzungen, 0, 'die Gesundheitsprüfung schaut nicht nach der Sitzung');
      // /api/sprache: Hängt die Anmeldung, antwortet sie nach kurzer Zeit ohne Person.
      haengt = true;
      const t0 = Date.now();
      r = await app.inject({ method: 'GET', url: '/api/sprache', headers: { ...cookie, 'x-sprache': 'en' } });
      assert.equal(r.statusCode, 200);
      assert.equal(r.json().sprache, 'en');
      assert.ok(Date.now() - t0 < 4000, `nach ${Date.now() - t0} ms`);
      // Keine Verbindung frei nach der Grenze (QUEUE_TIMEOUT): 503 mit „datenbank“, kein interner Fehler.
      konten.anmeldungZu = async () => { throw Object.assign(new Error('Waited more than 30 seconds for a connection'), { code: 'QUEUE_TIMEOUT' }); };
      r = await app.inject({ method: 'GET', url: '/api/konto/status', headers: cookie });
      assert.equal(r.statusCode, 503);
      assert.equal(r.json().datenbank, true);
      assert.equal(r.headers['retry-after'], '10');
    } finally { await app.close(); }
  });

  it('Zeitpläne gestreut: Versatz fest je Name, innerhalb des Intervalls, verschieden je Name', () => {
    const namen = ['papierkorb', 'abwesenheiten', 'fristen', 'notfall-datei', 'verwaltung', 'probe', 'notfallkontakte', 'kurzzustand'];
    for (const n of namen) {
      const v = versatzMs(n, 60_000);
      assert.equal(v, versatzMs(n, 60_000), 'gleich bei jedem Start');
      assert.ok(v >= 0 && v < 60_000 && v % 1000 === 0, `${n}: ${v}`);
    }
    // Im 5-Minuten-Raster liegen sie nicht alle auf derselben Sekunde (vorher: alle auf 0).
    assert.ok(new Set(namen.map((n) => versatzMs(n, 5 * 60_000))).size >= namen.length - 1);
    assert.equal(versatzMs('x', 0), 0);
  });

  it('wiederkehrend: erster Lauf nach dem Versatz, danach im Intervall; anhalten', () => {
    const plan: Array<{ art: string; ms: number; f: () => void }> = [];
    const gestoppt: unknown[] = [];
    const uhren: Uhren = {
      spaeter: (f, ms) => { const e = { art: 'spaeter', ms, f }; plan.push(e); return e; },
      immer: (f, ms) => { const e = { art: 'immer', ms, f }; plan.push(e); return e; },
      stoppe: (u) => { gestoppt.push(u); },
    };
    let n = 0;
    const stopp = wiederkehrend('fristen', 300_000, () => { n++; }, uhren);
    assert.deepEqual(plan.map((e) => [e.art, e.ms]), [['spaeter', versatzMs('fristen', 300_000)]]);
    plan[0].f();
    assert.equal(n, 1);
    assert.deepEqual(plan.map((e) => [e.art, e.ms]), [['spaeter', versatzMs('fristen', 300_000)], ['immer', 300_000]]);
    stopp();
    assert.equal(gestoppt.length, 2);
  });

  it('Startbild: Deutsch und Englisch aus den Sprachdateien, ohne Skript; Sprache und „schon neu geladen“', () => {
    const texte = (s: string) => JSON.parse(readFileSync(new URL(`../../shared/src/sprachen/${s}/oberflaeche.json`, import.meta.url), 'utf8')) as Record<string, string>;
    const html = startbildAusTexten({ de: texte('de'), en: texte('en') });
    assert.match(html, /Verbindung zu Ablago wird aufgebaut …/);
    assert.match(html, /Connecting to Ablago …/);
    assert.match(html, /class="startbild-text startbild-spaeter" data-sprache="de" lang="de">Ablago antwortet noch nicht – wir versuchen es weiter\./);
    assert.match(html, /ablago-logo-mit-schriftzug-dunkel\.svg/);
    // Was tun? Notfallseite im Handbuch, je Sprache (Zusatzwunsch zu #1198).
    assert.ok(html.includes('href="https://help.ablago.app/admin/aktuell/was-ist-passiert/#laedt-nicht"'), html);
    assert.ok(html.includes('href="https://help.ablago.app/admin/aktuell/en/was-ist-passiert/#laedt-nicht"'));
    assert.doesNotMatch(html, /<script|on[a-z]+=/i, 'kein Skript (Content-Security-Policy)');
    // Der Platzhalter steht in index.html.
    assert.ok(readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8').includes(STARTBILD_PLATZHALTER));
    // HTML im Text wird nicht HTML.
    assert.match(startbildAusTexten({ de: { 'startbild.verbinden': '<b>x</b>' }, en: {} }), /&lt;b&gt;x&lt;\/b&gt;/);
    assert.equal(startbildSprache(null), 'de');
    assert.equal(startbildSprache('de-AT'), 'de');
    assert.equal(startbildSprache('en'), 'en');
    assert.equal(startbildSprache('fr'), 'en');
    assert.equal(schonNeuGeladen(null, 1000), false);
    assert.equal(schonNeuGeladen(1000, 1000 + 5000), true);
    assert.equal(schonNeuGeladen(1000, 1000 + NEU_GELADEN_MS), false);
  });

  it('Hilfe zur Selbsthilfe (#1199): Lage aus der Gesundheitsprüfung, „seit …“ in groben Stufen, Texte de und en', () => {
    assert.equal(startbildLage(null), 'unbekannt');
    assert.equal(startbildLage({ zustand: 'startet' }), 'unbekannt');
    assert.equal(startbildLage({ zustand: 'datenbank', datenbank: 'antwortet-nicht' }), 'antwortet-nicht');
    assert.equal(startbildLage({ zustand: 'datenbank' }), 'antwortet-nicht');
    assert.equal(startbildLage({ zustand: 'datenbank', datenbank: 'abgewiesen' }), 'abgewiesen');
    assert.deepEqual(startbildDauer(null), { art: 'kurz', anzahl: 0 });
    assert.deepEqual(startbildDauer(59), { art: 'kurz', anzahl: 0 });
    assert.deepEqual(startbildDauer(180), { art: 'minuten', anzahl: 3 });
    assert.deepEqual(startbildDauer(7300), { art: 'stunden', anzahl: 2 });
    for (const spr of ['de', 'en']) {
      const texte = JSON.parse(readFileSync(new URL(`../../shared/src/sprachen/${spr}/oberflaeche.json`, import.meta.url), 'utf8')) as Record<string, string>;
      for (const k of ['lage.antwortet-nicht', 'lage.abgewiesen', 'lage.unbekannt', 'schritt.neustart', 'schritt.datenbank', 'schritt.verwaltung', 'handbuch', 'stand', 'stand-version', 'dauer.kurz', 'dauer.minuten_one', 'dauer.minuten_other', 'dauer.stunden_one', 'dauer.stunden_other']) {
        assert.ok(texte[`startbild.${k}`], `${spr}: startbild.${k}`);
      }
      // Keine Aktion und kein Protokoll ohne Anmeldung (Entscheidung Sicherheit): Die Meldung bietet keinen Neustart an.
      assert.doesNotMatch(Object.entries(texte).filter(([k]) => k.startsWith('startbild.')).map(([, v]) => v).join(' '), /docker logs/);
    }
  });
});
