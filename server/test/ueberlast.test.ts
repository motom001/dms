/**
 * Überlastschutz und Verbindungen zur Datenbank (#544): Grenzen aus der Umgebung, sofortige 503 mit
 * Retry-After über der Grenze, Gesundheitsprüfung nie abgewiesen, Zähler nach Antwort und Abbruch zurück.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { verbindungenAus, VERBINDUNGEN_VORGABE } from '../src/db';
import { MAX_ANFRAGEN_VORGABE, maxAnfragenAus, Ueberlastschutz, WIEDER_IN_S, zaehlt } from '../src/ueberlast';

describe('Einstellungen (#544)', () => {
  it('DMS_DB_VERBINDUNGEN: Vorgabe 10, 2–100, sonst Hinweis', () => {
    assert.deepEqual(verbindungenAus({}), { max: VERBINDUNGEN_VORGABE, quelle: 'vorgabe' });
    assert.equal(VERBINDUNGEN_VORGABE, 10);
    assert.deepEqual(verbindungenAus({ DMS_DB_VERBINDUNGEN: '20' }), { max: 20, quelle: 'umgebung' });
    for (const x of ['1', '101', 'viele', '2.5']) {
      const v = verbindungenAus({ DMS_DB_VERBINDUNGEN: x });
      assert.equal(v.max, 10); assert.match(v.fehler!, /DMS_DB_VERBINDUNGEN/);
    }
  });
  it('DMS_MAX_ANFRAGEN: Vorgabe 250, 20–10.000', () => {
    assert.deepEqual(maxAnfragenAus({}), { max: MAX_ANFRAGEN_VORGABE, quelle: 'vorgabe' });
    assert.deepEqual(maxAnfragenAus({ DMS_MAX_ANFRAGEN: '500' }), { max: 500, quelle: 'umgebung' });
    assert.match(maxAnfragenAus({ DMS_MAX_ANFRAGEN: '5' }).fehler!, /DMS_MAX_ANFRAGEN/);
  });
  it('gezählt werden API und WebDAV, nicht Gesundheitsprüfung, Messwerte und Oberfläche', () => {
    assert.ok(zaehlt('/api/mappen?sicht=x'));
    assert.ok(zaehlt('/webdav/Ablage/a.pdf'));
    assert.ok(zaehlt('/webdav'));
    assert.ok(!zaehlt('/api/gesundheit'));
    assert.ok(!zaehlt('/api/werkbank/last'));
    assert.ok(!zaehlt('/assets/index.js'));
    assert.ok(!zaehlt('/webdavx'));
  });
});

describe('Überlastschutz (#544)', () => {
  it('über der Grenze sofort 503 mit Retry-After; danach wieder frei, auch nach Abbruch', async () => {
    const schutz = new Ueberlastschutz(2);
    const app = Fastify();
    schutz.haengeEin(app);
    let loslassen!: () => void;
    const tor = new Promise<void>((r) => { loslassen = r; });
    app.get('/api/langsam', async () => { await tor; return { ok: true }; });
    app.get('/api/schnell', async () => ({ ok: true }));
    app.get('/api/gesundheit', async () => ({ ok: true }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    const basis = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    try {
      const a = fetch(`${basis}/api/langsam`);
      const abbruch = new AbortController();
      const b = fetch(`${basis}/api/langsam`, { signal: abbruch.signal }).catch(() => null);
      for (let i = 0; i < 50 && schutz.laufend < 2; i++) await new Promise((r) => setTimeout(r, 20));
      assert.equal(schutz.laufend, 2);
      const voll = await fetch(`${basis}/api/schnell`);
      assert.equal(voll.status, 503);
      assert.equal(voll.headers.get('retry-after'), String(WIEDER_IN_S));
      assert.match(((await voll.json()) as { fehler: string }).fehler, /beschäftigt/);
      assert.equal((await fetch(`${basis}/api/gesundheit`)).status, 200, 'Gesundheitsprüfung nie abgewiesen');
      abbruch.abort();
      await b;
      for (let i = 0; i < 50 && schutz.laufend > 1; i++) await new Promise((r) => setTimeout(r, 20));
      assert.equal(schutz.laufend, 1, 'abgebrochene Anfrage zählt nicht mehr');
      assert.equal((await fetch(`${basis}/api/schnell`)).status, 200);
      loslassen();
      assert.equal((await a).status, 200);
      for (let i = 0; i < 50 && schutz.laufend > 0; i++) await new Promise((r) => setTimeout(r, 20));
      assert.deepEqual({ ...schutz.stand(), hoechstens: undefined, zuletztAbgewiesen: undefined }, { max: 2, quelle: 'vorgabe', laufend: 0, hoechstens: undefined, abgewiesen: 1, zuletztAbgewiesen: undefined });
    } finally { loslassen(); await app.close(); }
  });
});

describe('Überlastschutz im Protokoll (#920): Hinweis statt Fehler, höchstens eine Zeile je Minute', () => {
  it('erste Abweisung sofort, weitere am Ende der Minute zusammengefasst – nie als Warnung oder Fehler', async () => {
    const { protokoll } = await import('../src/protokoll');
    let uhr = Date.parse('2026-11-06T12:00:00Z');
    const u = new Ueberlastschutz(1, 'vorgabe', () => uhr);
    const zeilen: Array<{ stufe: string; text: string; daten?: Record<string, unknown> }> = [];
    const vorher = protokoll.letzteNr;
    const warn = protokoll.beobachte((x) => { if (x.modul === 'system' && x.text.startsWith('Überlast')) zeilen.push(x); });
    try {
      assert.equal(u.herein(), true);
      for (let i = 0; i < 5; i++) { uhr += 1000; assert.equal(u.herein(), false); }
      assert.deepEqual(zeilen, [], 'keine Warnung, kein Fehler');
      const info = () => protokoll.eintraege({ seit: vorher, modul: 'system' }).filter((x) => x.text.startsWith('Überlast'));
      assert.equal(info().length, 1, 'die erste sofort');
      assert.equal(info()[0].stufe, 'info');
      u.leeren();
      assert.equal(info().length, 2, 'die übrigen vier zusammen');
      assert.match(info()[0].text, /weitere 4 Anfragen mit 503 abgewiesen/);
      assert.equal(info()[0].daten?.seitLetzterMeldung, 4);
      u.leeren();
      assert.equal(info().length, 2, 'nichts offen – keine Zeile');
      uhr += 10_000; u.herein(); u.leeren();
      assert.equal(info().length, 3, 'nach der Zusammenfassung erst wieder nach einer Minute eine eigene Zeile');
      uhr += 61_000; u.herein();
      assert.equal(info().length, 4);
    } finally { warn(); u.leeren(); }
  });

  it('abgewiesene Anfragen: keine Zeile „… 503“ als Fehler (nur Debug), andere 5xx weiter als Fehler', async () => {
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Dienst } = await import('../src/dienst');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const { baueApp } = await import('../src/http');
    const { protokoll } = await import('../src/protokoll');
    const dienst = new Dienst(speicherRepo(), speicherDateien());
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    const ueberlast = new Ueberlastschutz(20);
    ueberlast.laufend = 20;
    const app = await baueApp(dienst, konten, { ueberlast });
    const fehler: string[] = [];
    const weg = protokoll.beobachte((x) => { if (x.stufe === 'error') fehler.push(x.text); });
    try {
      const r = await app.inject({ method: 'GET', url: '/api/typen' });
      assert.equal(r.statusCode, 503);
      await new Promise((x) => setTimeout(x, 10));
      assert.deepEqual(fehler, []);
    } finally { weg(); ueberlast.leeren(); await app.close(); }
  });
});

describe('Systemzustand: Werte und Engpässe nennen die Variable (#544)', () => {
  it('Engpässe aus Wartezeit, Verbindungen, Arbeiter-Warteschlange und Überlastschutz', async () => {
    const { engpaesseAus, ENGPASS_VARIABLE, ENGPASS_MINUTEN } = await import('../../shared/src/systemlast');
    const jetzt = Date.parse('2026-11-02T12:00:00Z');
    assert.deepEqual(engpaesseAus({ schleife: false, jetzt }), []);
    assert.deepEqual(engpaesseAus({ schleife: true, jetzt }), ['schleife']);
    // Verbindungen: erst ab 6 Messungen und üblich über 50 ms.
    assert.deepEqual(engpaesseAus({ schleife: false, verbindungen: { median: 80, messungen: 3 }, jetzt }), []);
    assert.deepEqual(engpaesseAus({ schleife: false, verbindungen: { median: 40, messungen: 12 }, jetzt }), []);
    assert.deepEqual(engpaesseAus({ schleife: false, verbindungen: { median: 80, messungen: 12 }, jetzt }), ['verbindungen']);
    // Abgewiesenes zählt ENGPASS_MINUTEN lang.
    const vor = (min: number) => new Date(jetzt - min * 60_000).toISOString();
    assert.deepEqual(engpaesseAus({ schleife: false, arbeiterAbgewiesen: vor(2), ueberlastAbgewiesen: vor(ENGPASS_MINUTEN + 1), jetzt }), ['arbeiter']);
    assert.deepEqual(engpaesseAus({ schleife: false, ueberlastAbgewiesen: vor(1), jetzt }), ['ueberlast']);
    assert.deepEqual(ENGPASS_VARIABLE, { schleife: 'DMS_ARBEITER', verbindungen: 'DMS_DB_VERBINDUNGEN', arbeiter: 'DMS_ARBEITER', ueberlast: 'DMS_MAX_ANFRAGEN' });
  });

  it('Überlastschutz merkt sich, wann er zuletzt abgewiesen hat; Herkunft der Grenze im Stand', () => {
    let uhr = Date.parse('2026-11-02T12:00:00Z');
    const u = new Ueberlastschutz(1, 'umgebung', () => uhr);
    assert.equal(u.stand().zuletztAbgewiesen, null);
    assert.equal(u.herein(), true);
    uhr += 1000;
    assert.equal(u.herein(), false);
    assert.deepEqual({ ...u.stand() }, { max: 1, quelle: 'umgebung', laufend: 1, hoechstens: 1, abgewiesen: 1, zuletztAbgewiesen: '2026-11-02T12:00:01.000Z' });
  });

  it('Werte für den Systemzustand über GET /api/werkbank/systemlast', async () => {
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Dienst } = await import('../src/dienst');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const { Systemlast } = await import('../src/systemlast');
    const { baueApp } = await import('../src/http');
    const dienst = new Dienst(speicherRepo(), speicherDateien());
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    const ueberlast = new Ueberlastschutz(300, 'umgebung');
    const app = await baueApp(dienst, konten, { systemlast: new Systemlast({ lies: () => null }), ueberlast });
    try {
      const e = await app.inject({ method: 'POST', url: '/api/konto/einrichten', headers: { 'x-dms': '1' }, payload: { email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' } });
      const cookie = String(e.headers['set-cookie']).split(';')[0];
      const r = await app.inject({ method: 'GET', url: '/api/werkbank/systemlast', headers: { cookie, 'x-dms': '1' } });
      assert.equal(r.statusCode, 200, r.body);
      const s = r.json();
      assert.deepEqual(s.grenzen.anfragen, { wert: 300, quelle: 'umgebung', variable: 'DMS_MAX_ANFRAGEN', min: 20, max: 10000 });
      assert.equal(s.grenzen.arbeiter.variable, 'DMS_ARBEITER');
      assert.deepEqual(s.engpaesse, []);
    } finally { await app.close(); }
  });
});
