/**
 * Weniger Abfragen je Anfrage (#741) und Zähler nach Rechte-Fingerabdruck (#742) – mit PostgreSQL und zwei
 * „Prozessen“ (je eigene Verbindungen, eigener Dienst, eigene App) auf derselben Datenbank, wie zwei Server.
 *
 * Bedingungen der Sicherheit (#747): kein Zwischenspeicher für Sitzungen und Rechte; Rechteänderung, Sperren, Abmelden
 * und Ende des Verwaltungsmodus wirken mit der nächsten Anfrage, auch im anderen Prozess; Zahlen nie über Mappen, die
 * jemand nicht lesen darf.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import postgres from 'postgres';
import { NICHTS, type Regelwerk } from '../../shared/src/rechte';
import { Haushaltsstand, Zaehlerspeicher } from '../src/zaehlerspeicher';
import { jeAnfrage, Lesespeicher, lesespeicherFuer, merkeAenderung } from '../src/lesespeicher';
import { kontext, type Kontext } from '../src/protokoll';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const PW = 'ein-langes-passwort';

describe('Lesespeicher und Zähler im Arbeitsspeicher (#741, #742)', () => {
  it('jeder Abruf bekommt eine eigene Kopie; ein neuer Stand lädt neu; die Zahl der Einträge bleibt klein', async () => {
    let stand = 1; let geladen = 0;
    const l = new Lesespeicher(async () => stand);
    const lade = async () => { geladen++; return [{ name: 'Rechnung', felder: [{ key: 'nr' }] }]; };
    const a = await l.hole('typen', lade);
    a[0].name = 'verändert'; a[0].felder.push({ key: 'x' });
    const b = await l.hole('typen', lade);
    assert.equal(b[0].name, 'Rechnung', 'Veränderungen eines Aufrufers erreichen andere nicht');
    assert.equal(b[0].felder.length, 1);
    assert.equal(geladen, 1);
    stand = 2;
    await l.hole('typen', lade);
    assert.equal(geladen, 2, 'neuer Stand: neu geladen');
    for (let i = 0; i < 200; i++) await l.hole(`k${i}`, async () => i);
    assert.ok(l.groesse <= 64, `höchstens 64 Einträge, sind ${l.groesse}`);
  });

  it('einmal je Anfrage: gleicher Wert bis zur nächsten Änderung in der Anfrage; außerhalb immer neu', async () => {
    let n = 0;
    const bilde = async () => ++n;
    const k: Kontext = { anfrage: 't', db: { anzahl: 0, ms: 0 } };
    await kontext.run(k, async () => {
      assert.equal(await jeAnfrage('x', bilde), 1);
      assert.equal(await jeAnfrage('x', bilde), 1);
      merkeAenderung();
      assert.equal(await jeAnfrage('x', bilde), 2, 'nach einer Änderung neu');
    });
    assert.equal(await jeAnfrage('x', bilde), 3, 'ohne Anfrage kein Merken');
    assert.equal(await jeAnfrage('x', bilde), 4);
  });

  it('Zahlen: Mindestgültigkeit nur für Änderungen anderer; eigene sofort; Speicher begrenzt', async () => {
    const stand = new Haushaltsstand();
    let t = 1_000_000;
    const zs = new Zaehlerspeicher<number>(stand, () => t);
    let wert = 1;
    const zaehle = async () => ({ wert, zeitabhaengig: false });
    const g = (wer: string) => ({ mindestensMs: 3000, wer });
    assert.equal((await zs.hole('k', zaehle, g('lena'))).wert, 1);
    wert = 2;
    await kontext.run({ anfrage: 'a', db: { anzahl: 0, ms: 0 }, benutzerId: 'jonas' }, () => stand.erhoehe());
    assert.deepEqual(await zs.hole('k', zaehle, g('lena')), { wert: 1, art: 'treffer' }, 'Änderung von Jonas: kurz noch der bisherige Wert');
    assert.deepEqual(await zs.hole('k', zaehle, {}), { wert: 2, art: 'neu' }, 'ohne Mindestgültigkeit (Hintergrund) frisch');
    wert = 3;
    await kontext.run({ anfrage: 'b', db: { anzahl: 0, ms: 0 }, benutzerId: 'lena' }, () => stand.erhoehe());
    assert.deepEqual(await zs.hole('k', zaehle, g('lena')), { wert: 3, art: 'neu' }, 'eigene Änderung: sofort');
    wert = 4;
    await stand.erhoehe();
    t += 3001;
    assert.deepEqual(await zs.hole('k', zaehle, g('lena')), { wert: 4, art: 'neu' }, 'nach der Mindestgültigkeit frisch');
    for (let i = 0; i < 600; i++) await zs.hole(`p${i}`, zaehle);
    assert.ok(zs.groesse <= 500, `höchstens 500 Einträge, sind ${zs.groesse}`);
  });

  it('Hörer (Webhooks) laufen außerhalb der Anfrage – sie zählen frisch, ohne Mindestgültigkeit', async () => {
    const stand = new Haushaltsstand();
    let gesehen: unknown = 'nie';
    stand.beiAenderung(() => { gesehen = kontext.getStore(); });
    await kontext.run({ anfrage: 'a', db: { anzahl: 0, ms: 0 }, benutzerId: 'jonas' }, () => stand.erhoehe());
    assert.equal(gesehen, undefined);
  });
});

describe('Zwei Prozesse auf einer Datenbank (#741, #742)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  type App = { inject: (o: { method: string; url: string; payload?: unknown; headers?: Record<string, string> }) => Promise<{ statusCode: number; body: string; headers: Record<string, unknown> }>; close(): Promise<void> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  type Prozess = { sql: postgres.Sql; app: App; dienst: any; konten: any; zweifaktor: any; nachlauf: { alle(): Promise<void> }; abfragen: () => number };
  const prozesse: Prozess[] = [];
  let A!: Prozess; let B!: Prozess;
  const ids = { lena: '', jonas: '', markus: '', petra: '', rechnung: '', fibu: '', andere: '', mappe: '' };
  let rw!: (rollen: string[]) => Regelwerk;
  /** Eigene Datenbank (#900); beide „Prozesse“ verbinden sich mit ihr. */
  let dbUrl = '';

  async function prozess(): Promise<Prozess> {
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { pgRepo } = await import('../src/repo-pg');
    const { Konten } = await import('../src/konten');
    const { pgKontoRepo } = await import('../src/konto-repo');
    const { ordnerSpeicher } = await import('../src/dateispeicher');
    const { pgEinstellungen } = await import('../src/einstellungen');
    const { Zweifaktor } = await import('../src/zweifaktor');
    let n = 0;
    // Wie verbinde() in db.ts, zusätzlich zählt jede SQL-Anweisung (Abfragen je Anfrage).
    const sql = postgres(dbUrl, { max: 4, onnotice: () => {}, infer: true, debug: () => { n++; } });
    const dienst = new Dienst(pgRepo(sql, HAUSHALT), ordnerSpeicher(await mkdtemp(join(tmpdir(), 'dms-a741-')), HAUSHALT), { einstellungen: pgEinstellungen(sql, HAUSHALT) });
    const konten = new Konten(pgKontoRepo(sql, HAUSHALT), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    const zweifaktor = new Zweifaktor(pgEinstellungen(sql, HAUSHALT), (k: string) => `v:${k}`, (w: string) => (w.startsWith('v:') ? w.slice(2) : null));
    konten.verbindeZweifaktor(zweifaktor);
    const { Nachlauf } = await import('../src/http');
    const nachlauf = new Nachlauf();
    const app = await baueApp(dienst, konten, { nachlauf }) as unknown as App;
    const p = { sql, app, dienst, konten, zweifaktor, nachlauf, abfragen: () => n };
    prozesse.push(p);
    return p;
  }

  const anmelden = async (p: Prozess, email: string) => {
    const r = await p.app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email, passwort: PW }, headers: { 'x-dms': '1' } });
    assert.equal(r.statusCode, 200, r.body);
    return String(([] as string[]).concat(r.headers['set-cookie'] as string)[0]).split(';')[0];
  };
  const rufe = async (p: Prozess, cookie: string, method: string, pfad: string, payload?: unknown) => {
    const r = await p.app.inject({ method, url: pfad, ...(payload === undefined ? {} : { payload }), headers: { 'x-dms': '1', cookie } });
    const zs = /zs;dur=[\d.]+;desc="(\w+)"/.exec(String(r.headers['server-timing'] ?? ''))?.[1];
    return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, zs };
  };
  /** Anzahl Rechnungen, die die Zahlen der Ablage zeigen. */
  const rechnungen = async (p: Prozess, cookie: string) => {
    const r = await rufe(p, cookie, 'GET', '/api/sichten');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return { n: r.body.typen[ids.rechnung]?.anzahl ?? 0, zs: r.zs };
  };

  before(async () => {
    dbUrl = (await eigeneDatenbank('zwischenspeicher')).url;
    A = await prozess(); B = await prozess();
    const { benutzer: lena } = await A.konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
    const mitPasswort = async (email: string, name: string) => {
      const r = await A.konten.legeBenutzerAn({ email, name }, lena.id);
      await A.konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PW });
      return r.benutzer.id as string;
    };
    ids.lena = lena.id;
    ids.jonas = await mitPasswort('jonas@example.org', 'Jonas');
    ids.markus = await mitPasswort('markus@example.org', 'Markus');
    ids.petra = await mitPasswort('petra@example.org', 'Petra');
    await A.dienst.gleicheBenutzerAb(await A.konten.listeBenutzer());
    const typen = await A.dienst.mappentypen.listeTypen();
    const rolleTyp = typen.find((t: { system?: string }) => t.system === 'rolle');
    ids.fibu = (await A.dienst.mappen.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'FiBu' } }, lena.id)).id;
    ids.andere = (await A.dienst.mappen.legeMappeAn({ typId: rolleTyp.id, werte: { name: 'Praktikum' } }, lena.id)).id;
    await A.dienst.setzeRollen(ids.jonas, [ids.fibu]);
    await A.dienst.setzeRollen(ids.markus, [ids.fibu]);
    ids.rechnung = (await A.dienst.mappentypen.legeTypAn({ name: 'Rechnung', felder: [{ key: 'nr', label: 'Nummer', typ: 'text', pflicht: true }] })).id;
    rw = (rollen) => ({ grund: NICHTS, regeln: [{ id: 'fibu', name: 'FiBu liest', wenn: [{ art: 'rolle', rollen }], dann: { R: 'erteilen', U: 'erteilen', C: 'erteilen' }, stopp: false }] }) as unknown as Regelwerk;
    await A.dienst.setzeBerechtigungen(ids.rechnung, rw([ids.fibu]), true);
    for (const nr of ['R1', 'R2']) ids.mappe = (await A.dienst.mappen.legeMappeAn({ typId: ids.rechnung, werte: { nr } }, lena.id)).id;
    for (const p of [A, B]) p.dienst.mindestensMs = 3000;
  });
  after(async () => { for (const p of prozesse) { await p.app.close(); await p.sql.end(); } });

  it('Sitzung und Person in einer Abfrage; der Haushaltsstand kommt mit', async () => {
    const c = await anmelden(B, 'jonas@example.org');
    await rufe(B, c, 'GET', '/api/typen');
    const k: Kontext = { anfrage: 't', db: { anzahl: 0, ms: 0 } };
    const vorher = B.abfragen();
    const x = await kontext.run(k, () => B.konten.anmeldungZu(decodeURIComponent(c.split('=')[1])));
    assert.equal(x?.benutzer.id, ids.jonas);
    assert.equal(B.abfragen() - vorher, 1, 'eine Abfrage für Sitzung und Person');
    assert.ok(k.staende && typeof k.staende.werte.lesen === 'number' && typeof k.staende.werte.zahlen === 'number');
  });

  it('Rechte entziehen im einen Prozess: die nächste Anfrage im anderen ist schon verboten', async () => {
    const c = await anmelden(B, 'jonas@example.org');
    assert.equal((await rufe(B, c, 'GET', `/api/mappen/${ids.mappe}`)).status, 200);
    assert.equal((await rufe(B, c, 'GET', `/api/mappen/${ids.mappe}`)).status, 200, 'zweimal: Mappentypen sind gemerkt');
    // Am Mappentyp (gemerkt im Lesespeicher): FiBu verliert das Leserecht.
    await A.dienst.setzeBerechtigungen(ids.rechnung, rw([ids.andere]), true);
    assert.equal((await rufe(B, c, 'GET', `/api/mappen/${ids.mappe}`)).status, 404);
    assert.equal((await rechnungen(B, c)).n, 0, 'und die Zahl zeigt sie nicht mehr – auch nicht in der Mindestgültigkeit');
    await A.dienst.setzeBerechtigungen(ids.rechnung, rw([ids.fibu]), true);
    assert.equal((await rufe(B, c, 'GET', `/api/mappen/${ids.mappe}`)).status, 200);
    assert.equal((await rechnungen(B, c)).n, 2);
    // An der Person (Rollen, nie gemerkt): Jonas verliert FiBu.
    await A.dienst.setzeRollen(ids.jonas, []);
    assert.equal((await rufe(B, c, 'GET', `/api/mappen/${ids.mappe}`)).status, 404);
    assert.equal((await rechnungen(B, c)).n, 0);
    await A.dienst.setzeRollen(ids.jonas, [ids.fibu]);
    assert.equal((await rechnungen(B, c)).n, 2);
  });

  it('Sperren und Abmelden im einen Prozess wirken mit der nächsten Anfrage im anderen', async () => {
    const { pgKontoRepo } = await import('../src/konto-repo');
    const c = await anmelden(B, 'petra@example.org');
    assert.equal((await rufe(B, c, 'GET', '/api/typen')).status, 200);
    await pgKontoRepo(A.sql, HAUSHALT).aendereBenutzer(ids.petra, { aktiv: false });
    assert.equal((await rufe(B, c, 'GET', '/api/typen')).status, 401, 'gesperrt');
    await pgKontoRepo(A.sql, HAUSHALT).aendereBenutzer(ids.petra, { aktiv: true });
    const d = await anmelden(B, 'petra@example.org');
    assert.equal((await rufe(B, d, 'GET', '/api/typen')).status, 200);
    assert.equal((await A.app.inject({ method: 'POST', url: '/api/konto/abmelden', headers: { 'x-dms': '1', cookie: d } })).statusCode < 300, true);
    assert.equal((await rufe(B, d, 'GET', '/api/typen')).status, 401, 'abgemeldet');
  });

  it('gemerkte Einstellung (Zwei-Faktor-Pflicht) gilt im anderen Prozess sofort', async () => {
    const vorher = await anmelden(B, 'markus@example.org');
    assert.equal((await rufe(B, vorher, 'GET', '/api/typen')).status, 200);
    await A.zweifaktor.setzePflicht({ mitglied: true }, 'test');
    try {
      const c = await anmelden(B, 'markus@example.org');
      const r = await rufe(B, c, 'GET', '/api/typen');
      assert.equal(r.status, 403, 'neue Sitzung nach dem Einschalten: erst einrichten');
    } finally { await A.zweifaktor.setzePflicht({ mitglied: false }, 'test'); }
    const c = await anmelden(B, 'markus@example.org');
    assert.equal((await rufe(B, c, 'GET', '/api/typen')).status, 200);
  });

  it('Zahlen nach Rechte-Fingerabdruck: gleiche Rechte teilen eine Zählung, andere nicht', async () => {
    const j = await anmelden(B, 'jonas@example.org');
    const m = await anmelden(B, 'markus@example.org');
    const p = await anmelden(B, 'petra@example.org');
    B.dienst.mindestensMs = 0;
    try {
      // Eine Änderung, damit alle frisch zählen.
      await A.dienst.mappen.legeMappeAn({ typId: ids.rechnung, werte: { nr: 'R3' } }, ids.lena);
      // Der Stand in der Datenbank zählt kurz nach der Änderung hoch (auch nach den Anmeldungen in B). Darauf warten
      // (#900) statt auf eine feste Zeit – danach sehen Jonas und Markus denselben Stand.
      await A.dienst.stand.hochgezaehlt(); await B.dienst.stand.hochgezaehlt();
      const a = await rechnungen(B, j), b = await rechnungen(B, m);
      const c = await rechnungen(B, p);
      assert.equal(a.n, 3); assert.equal(b.n, 3);
      assert.equal(b.zs, 'treffer', 'Markus hat dieselben Rechte wie Jonas: dieselbe Zählung');
      assert.equal(c.n, 0, 'Petra darf keine Rechnung lesen');
    } finally { B.dienst.mindestensMs = 3000; }
  });

  it('Mindestgültigkeit: Änderungen anderer kurz später, eigene sofort – auch über zwei Prozesse', async () => {
    const j = await anmelden(B, 'jonas@example.org');
    const m = await anmelden(A, 'markus@example.org');
    const start = (await rechnungen(B, j)).n;
    const neu = await rufe(A, m, 'POST', '/api/mappen', { typId: ids.rechnung, werte: { nr: 'R4' } });
    assert.equal(neu.status, 201, JSON.stringify(neu.body));
    assert.equal((await rechnungen(A, m)).n, start + 1, 'Markus sieht seine eigene Änderung sofort');
    const kurz = await rechnungen(B, j);
    assert.equal(kurz.n, start, 'Jonas (anderer Prozess) sieht kurz noch den bisherigen Wert');
    B.dienst.mindestensMs = 1;
    await new Promise((r) => setTimeout(r, 10));
    try { assert.equal((await rechnungen(B, j)).n, start + 1, 'danach frisch'); } finally { B.dienst.mindestensMs = 3000; }
  });

  it('Verwaltungsmodus: im Modus alle Mappen gezählt; nach dem Ende sofort nur noch die eigenen – keine Zahl aus dem Modus', async () => {
    const c = await anmelden(B, 'lena@example.org');
    assert.equal((await rechnungen(B, c)).n, 0, 'ohne Modus: Lena hat FiBu nicht');
    assert.equal((await rufe(B, c, 'POST', '/api/konto/verwaltung', {})).status, 200);
    const imModus = (await rechnungen(B, c)).n;
    assert.ok(imModus >= 2, `im Modus alle Rechnungen (${imModus})`);
    assert.equal((await rufe(B, c, 'GET', `/api/mappen/${ids.mappe}`)).status, 200);
    // Ende des Modus im anderen Prozess (dieselbe Sitzung).
    assert.equal((await rufe(A, c, 'POST', '/api/konto/verwaltung/beenden', {})).status, 200);
    assert.equal((await rechnungen(B, c)).n, 0, 'sofort nach dem Ende, innerhalb der Mindestgültigkeit');
    assert.equal((await rufe(B, c, 'GET', `/api/mappen/${ids.mappe}`)).status, 404);
  });

  it('Mappe öffnen: „zuletzt geöffnet“ kommt nach der Antwort', async () => {
    const m = await anmelden(B, 'markus@example.org');
    const neu = (await rufe(A, await anmelden(A, 'markus@example.org'), 'POST', '/api/mappen', { typId: ids.rechnung, werte: { nr: 'R9' } })).body;
    assert.equal((await rufe(B, m, 'GET', `/api/mappen/${neu.id}`)).status, 200);
    await B.nachlauf.alle();
    const s = (await rufe(B, m, 'GET', '/api/startseite')).body as { zuletzt: Array<{ id: string }> };
    assert.equal(s.zuletzt[0]?.id, neu.id);
  });

  it('Abfragen je Anfrage (gemerkt): Liste, Zahlen, Mappe öffnen; der Lesespeicher bleibt klein', async () => {
    const j = await anmelden(B, 'jonas@example.org');
    const zaehle = async (method: string, pfad: string) => {
      await rufe(B, j, method, pfad);
      const vorher = B.abfragen();
      const r = await rufe(B, j, method, pfad);
      assert.equal(r.status, 200, `${pfad}: ${JSON.stringify(r.body)}`);
      return B.abfragen() - vorher;
    };
    const sichten = await zaehle('GET', '/api/sichten');
    const typen = await zaehle('GET', '/api/typen');
    const liste = await zaehle('GET', `/api/mappen?sicht=typ:${ids.rechnung}&von=0&anzahl=50`);
    const mappe = await zaehle('GET', `/api/mappen/${ids.mappe}`);
    // Vorher (0.192.0, Lasttest-Daten): Zahlen 15, Typen 7, Liste 9, Mappe öffnen 17 Abfragen für ein Mitglied mit Rolle.
    assert.ok(sichten <= 6, `Zahlen: ${sichten} Abfragen`);
    assert.ok(typen <= 3, `Typen: ${typen} Abfragen`);
    assert.ok(liste <= 7, `Liste: ${liste} Abfragen`);
    assert.ok(mappe <= 13, `Mappe öffnen: ${mappe} Abfragen`);
    assert.ok(lesespeicherFuer(B.sql, HAUSHALT).groesse <= 3 + 16, `Lesespeicher: ${lesespeicherFuer(B.sql, HAUSHALT).groesse} Einträge`);
  });
});
