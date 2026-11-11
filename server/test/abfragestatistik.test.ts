/**
 * Teuerste Abfragen für den Lasttest (#894): pg_stat_statements, wenn geladen; sonst Grund und Abhilfe. Die
 * Datenbank-Tests decken beide Fälle ab – welcher läuft, hängt davon ab, ob die Test-Datenbank das Modul geladen hat.
 * Ausgabe im Lasttest: eine knappe Zeile im Ergebnisblock, die Tabelle im Bericht.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type postgres from 'postgres';
import { ABFRAGE_ZEICHEN, abfragenZuruecksetzen, EINSCHALTEN, kuerzeAbfrage, teuersteAbfragen } from '../src/abfragestatistik';
import { bereicheDerRoute } from '../src/verwaltungsbereiche';
import { eigeneDatenbank } from './hilfe-db';

describe('Teuerste Abfragen: Text (#894)', () => {
  it('Leerraum zusammengezogen, Zeichenketten und Kommentare entfernt, gekürzt', () => {
    assert.equal(kuerzeAbfrage('SELECT  *\n\tFROM mappen\n  WHERE id = $1'), 'SELECT * FROM mappen WHERE id = $1');
    assert.equal(kuerzeAbfrage("SELECT 1 FROM mappen WHERE titel = 'Brief an Jonas' AND x = E'a''b' -- Notiz\n LIMIT $1"), "SELECT 1 FROM mappen WHERE titel = '…' AND x = '…' LIMIT $1");
    assert.equal(kuerzeAbfrage('SELECT /* Petra */ $body$ geheim $body$'), "SELECT '…'");
    const lang = kuerzeAbfrage(`SELECT ${'spalte, '.repeat(40)} FROM mappen`);
    assert.ok(lang.length <= ABFRAGE_ZEICHEN && lang.length >= ABFRAGE_ZEICHEN - 2, String(lang.length));
    assert.ok(lang.endsWith('…'));
    assert.match(EINSCHALTEN, /command: postgres -c shared_preload_libraries=pg_stat_statements/);
  });

  it('Recht: Werte und Zurücksetzen gehören zu „systemzustand“', () => {
    assert.deepEqual(bereicheDerRoute('GET', '/api/werkbank/last'), ['systemzustand']);
    assert.deepEqual(bereicheDerRoute('POST', '/api/werkbank/last/abfragen-zuruecksetzen'), ['systemzustand']);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('Teuerste Abfragen: Datenbank (#894)', { skip: !url && 'TEST_DATABASE_URL fehlt' }, () => {
  let sql: postgres.Sql;
  let geladen = false;
  before(async () => {
    // Eigene Datenbank (#900): Erweiterung anlegen und Zurücksetzen nicht auf der gemeinsamen.
    sql = (await eigeneDatenbank('abfragestatistik', { max: 2 })).sql;
    const [z] = await sql`SELECT current_setting('shared_preload_libraries') AS w`;
    geladen = String(z.w).includes('pg_stat_statements');
  });
  after(async () => { await sql?.end(); });

  it('ohne geladenes Modul: Grund und Abhilfe, nichts angelegt; mit Modul: angelegt und zurückgesetzt', async () => {
    const r = await abfragenZuruecksetzen(sql);
    const [e] = await sql`SELECT count(*)::int AS n FROM pg_extension WHERE extname = 'pg_stat_statements'`;
    if (!geladen) {
      assert.equal(r.zurueckgesetzt, false);
      assert.ok(!r.zurueckgesetzt && r.grund === 'nicht-geladen' && r.hinweis.includes(EINSCHALTEN), JSON.stringify(r));
      assert.equal(e.n, 0, 'Erweiterung nicht angelegt, solange das Modul fehlt');
      const s = await teuersteAbfragen(sql, 10);
      assert.ok(!s.verfuegbar && s.grund === 'nicht-geladen', JSON.stringify(s));
      assert.equal(s.hinweis, `pg_stat_statements nicht geladen, so einschalten: ${EINSCHALTEN}`);
    } else {
      assert.deepEqual(r, { zurueckgesetzt: true });
      assert.equal(e.n, 1);
      const [sch] = await sql`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_stat_statements'`;
      assert.ok(['erweiterungen_dms', 'public'].includes(sch.nspname as string), String(sch.nspname));
    }
  });

  it('mit Modul: teuerste Abfragen der eigenen Datenbank, normalisiert, mit Anteil; Zurücksetzen leert', { skip: false }, async (t) => {
    if (!geladen) { t.skip('pg_stat_statements nicht geladen'); return; }
    await abfragenZuruecksetzen(sql);
    await sql`CREATE TEMP TABLE IF NOT EXISTS probe_894 (titel text)`;
    for (let i = 0; i < 20; i++) await sql`SELECT count(*) FROM generate_series(1, 20000) g WHERE g::text <> ${`Brief an Lena ${i}`}`;
    await sql.unsafe("SELECT 'Notiz von Markus' AS x, pg_sleep(0.05)");
    const s = await teuersteAbfragen(sql, 3);
    assert.ok(s.verfuegbar, JSON.stringify(s));
    assert.ok(s.abfragen.length >= 1 && s.abfragen.length <= 3);
    assert.ok(s.gesamtMs >= 0);
    const anteil = s.abfragen.reduce((n, a) => n + a.anteil, 0);
    assert.ok(anteil > 0 && anteil <= 1.001, String(anteil));
    for (let i = 1; i < s.abfragen.length; i++) assert.ok(s.abfragen[i - 1].gesamtMs >= s.abfragen[i].gesamtMs, 'nach Gesamtzeit');
    const alle = await teuersteAbfragen(sql, 25);
    assert.ok(alle.verfuegbar);
    const serie = alle.abfragen.find((a) => a.abfrage.includes('generate_series'));
    assert.ok(serie, JSON.stringify(alle.abfragen));
    assert.ok(serie.anzahl >= 20, JSON.stringify(serie));
    assert.ok(serie.mittelMs > 0 && serie.zeilen === serie.anzahl, JSON.stringify(serie));
    assert.ok(alle.abfragen.every((a) => !/Lena|Markus/.test(a.abfrage) && a.abfrage.length <= 120 && !/\s{2}/.test(a.abfrage)), 'keine Inhalte, gekürzt');
    assert.ok(alle.abfragen.every((a) => !a.abfrage.includes('pg_stat_statements')), 'ohne die eigenen Abfragen');
    assert.deepEqual(await abfragenZuruecksetzen(sql), { zurueckgesetzt: true });
    const leer = await teuersteAbfragen(sql, 25);
    assert.ok(leer.verfuegbar && !leer.abfragen.some((a) => a.abfrage.includes('generate_series')), 'nach dem Zurücksetzen leer');
  });
});

describe('Teuerste Abfragen: Route und Lasttest (#894)', () => {
  let app: Awaited<ReturnType<typeof import('../src/http')['baueApp']>>;
  type Stand = { verfuegbar: boolean; [k: string]: unknown };
  let stand: Stand = { verfuegbar: false, grund: 'nicht-geladen', hinweis: `pg_stat_statements nicht geladen, so einschalten: ${EINSCHALTEN}` };
  const aufrufe: string[] = [];
  let lt: {
    anmelden(k: [string, string]): Promise<string>;
    teuersteAbfragen(cookie: string, zurueck: unknown): Promise<Record<string, unknown> | null>;
    durchgang(v: unknown, o: { name: string; n: number; dauer: number; mitExport: boolean }): Promise<{ abfragen: Record<string, unknown> | null }>;
    abfragenZeile(a: unknown): string | null;
    abfragenBericht(name: string, a: unknown): string[];
    ergebnisblock(e: unknown[], x: unknown, u: unknown, angaben: unknown): string;
  };
  const LENA: [string, string] = ['lena@example.org', 'lasttest-passwort-1'];
  const PETRA: [string, string] = ['petra@example.org', 'lasttest-passwort-3'];

  before(async () => {
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { speicherEinstellungen } = await import('../src/einstellungen');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas.example.org', d.systemtypen.benutzerspiegel());
    d.verbindeKonten(konten.papierkorbHaken());
    const { benutzer: lena } = await konten.einrichten({ email: LENA[0], name: 'Lena (Lasttest)', passwort: LENA[1] });
    const r = await konten.legeBenutzerAn({ email: PETRA[0], name: 'Petra (Lasttest)' }, lena.id);
    await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PETRA[1] });
    await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const { baueApp } = await import('../src/http');
    const { Systemlast } = await import('../src/systemlast');
    app = await baueApp(d, konten, {
      systemlast: new Systemlast(),
      abfragen: {
        stand: async (n: number) => { aufrufe.push(`stand ${n}`); return stand as never; },
        zuruecksetzen: async () => { aufrufe.push('zuruecksetzen'); return (stand.verfuegbar ? { zurueckgesetzt: true } : { zurueckgesetzt: false, grund: stand.grund, hinweis: stand.hinweis }) as never; },
      },
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    process.env.DMS_URL = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    lt = await import(new URL('./lasttest.mjs', import.meta.url).href);
  });
  after(async () => { await app?.close().catch(() => {}); });

  it('nur auf Anfrage gelesen; Zurücksetzen nur für Verwaltende', async () => {
    const admin = await lt.anmelden(LENA);
    const petra = await lt.anmelden(PETRA);
    const holen = (c: string, q = '') => fetch(`${process.env.DMS_URL}/api/werkbank/last${q}`, { headers: { 'x-dms': '1', 'x-dms-aktiv': '1', cookie: c } });
    aufrufe.length = 0;
    const ohne = await (await holen(admin)).json() as Record<string, unknown>;
    assert.ok(!('abfragen' in ohne), 'die Abfrage alle 2 Sekunden liest pg_stat_statements nicht');
    assert.deepEqual(aufrufe, []);
    const mit = await (await holen(admin, '?abfragen=3')).json() as { abfragen: Stand };
    assert.equal(mit.abfragen.verfuegbar, false);
    assert.deepEqual(aufrufe, ['stand 3']);
    assert.equal((await holen(petra, '?abfragen=3')).status, 403);
    const z = await fetch(`${process.env.DMS_URL}/api/werkbank/last/abfragen-zuruecksetzen`, { method: 'POST', headers: { 'x-dms': '1', 'content-type': 'application/json', cookie: petra }, body: '{}' });
    assert.equal(z.status, 403);
    assert.deepEqual(aufrufe, ['stand 3']);
  });

  it('Durchgang ohne pg_stat_statements: läuft, Zeile mit Abhilfe; mit: zurückgesetzt, Top 3 im Block, Top 10 im Bericht', async () => {
    const admin = await lt.anmelden(LENA);
    const v = { sitzungen: { admin, mitRolle: admin, ohneRolle: admin }, ansichten: ['keine'], mappen: ['keine'], dokumente: [] };
    stand = { verfuegbar: false, grund: 'nicht-geladen', hinweis: `pg_stat_statements nicht geladen, so einschalten: ${EINSCHALTEN}` };
    aufrufe.length = 0;
    const e = await lt.durchgang(v, { name: 'klein', n: 1, dauer: 1, mitExport: false });
    assert.equal(aufrufe[0], 'zuruecksetzen', 'vor dem Durchgang zurückgesetzt');
    assert.equal(aufrufe.at(-1), 'stand 10');
    assert.equal(lt.abfragenZeile(e.abfragen), `Teuerste Abfragen: – (pg_stat_statements nicht geladen, so einschalten: ${EINSCHALTEN})`);
    assert.deepEqual(lt.abfragenBericht('klein', e.abfragen), [`Teuerste Abfragen „klein“: – (pg_stat_statements nicht geladen, so einschalten: ${EINSCHALTEN})`]);

    const liste = Array.from({ length: 10 }, (_, i) => ({ abfrage: i === 0 ? `SELECT m.id, m.titel FROM mappen m WHERE m.haushalt_id = $1 AND m.titel ILIKE $2 ORDER BY m.geaendert DESC LIMIT $3` : `SELECT ${i} | x FROM t${i} WHERE id = $1`, gesamtMs: 5000 - i * 400, anzahl: 12_300 - i, mittelMs: 0.41 + i, zeilen: 100 * i, anteil: 0.41 - i * 0.03 }));
    stand = { verfuegbar: true, gesamtMs: 12_200, abfragen: liste };
    const m = await lt.durchgang(v, { name: 'klein', n: 1, dauer: 1, mitExport: false });
    assert.equal(m.abfragen?.zurueckgesetzt, true);
    const zeile = lt.abfragenZeile(m.abfragen)!;
    assert.match(zeile, /^Teuerste Abfragen: 41 % 12\.300× Ø 0,41 ms SELECT m\.id, m\.titel FROM mappen m WHERE m\.haushalt_id = \$1… · 38 % 12\.299× Ø 1,41 ms SELECT 1 \| x FROM t1 WHERE id = \$1 · 35 % /);
    assert.equal(zeile.split(' · ').length, 3, 'nur die drei teuersten');
    const b = lt.abfragenBericht('klein', m.abfragen);
    assert.equal(b[0], 'Teuerste Abfragen „klein“ (pg_stat_statements, normalisiert; Rechenzeit aller Abfragen 12,2 s):');
    assert.equal(b[2], '| # | Abfrage | Gesamt ms | Anzahl | Mittel ms | Zeilen | Anteil |');
    assert.equal(b.length, 4 + 10, 'zehn Zeilen');
    assert.equal(b[5], '| 2 | `SELECT 1 \\| x FROM t1 WHERE id = $1` | 4.600 | 12.299 | 1,41 | 100 | 38 % |');
    // Ergebnisblock: eine Zeile unter der Stufe.
    const umgebung = { version: '0.200.0', image: 'dms-komplett', datenbank: 'im Container', architektur: 'x64', cpu: 'Beispiel-CPU', kerne: 4, kerneBegrenzt: false, rechnerKerne: 4, ramGb: 8, ramBegrenzt: false, grenzen: null };
    const ergebnisse = [{ stufe: 'klein', art: 'zusage', verfehlt: [], zielVerfehlt: [], durchgang: { ...m, n: 25 } }];
    const block = lt.ergebnisblock(ergebnisse, { bestand: { gesamt: 5013, demo: 5000 }, dokumente: 110, laeufe: [m] }, umgebung, {});
    assert.match(block, /\nklein    25 gleichzeitig: [^\n]*\n(?:  [^\n]*\n)*  Teuerste Abfragen klein: 41 % 12\.300×/);
    // Nicht zurückgesetzt (ohne Recht): steht im Bericht.
    const nz = { ...m.abfragen, zurueckgesetzt: false, hinweis: 'ohne Recht' };
    assert.match(lt.abfragenBericht('klein', nz)[0], /nicht zurückgesetzt, Werte seit dem letzten Zurücksetzen: ohne Recht\):$/);
  });
});
