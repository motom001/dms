/**
 * Webhooks (#627): Ziel-Regeln, Signatur, Zustellung an einen echten kleinen HTTP-Empfänger (Signatur prüfen,
 * keine Inhalte, Zusammenfassen, Wiederholung bei 500 bis zum Abschalten, Weiterleitungen nicht verfolgen),
 * Ende-zu-Ende über Dienst und Fastify, dazu Ausgangskorb und Schlüsselwechsel in PostgreSQL (TEST_DATABASE_URL).
 */
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import { WEBHOOK_KOPF, WEBHOOK_VERSUCHE, WEBHOOK_WARTEN_S, ursprung, zielProblem, type WebhookZahlen } from '../../shared/src/webhook';
import { speicherEinstellungen } from '../src/einstellungen';
import { GEHEIMNIS_PRAEFIX, pruefeSignatur, signatur, speicherWebhookRepo, Webhooks, type WebhookDeps } from '../src/webhook';
import { mailText } from '../src/mail';

const echtesFastify = await import('fastify').then((m) => typeof m.default === 'function', () => false);
const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Bis die Bedingung gilt (höchstens `ms`). */
async function bis(f: () => boolean | Promise<boolean>, ms = 5000) {
  const ende = Date.now() + ms;
  while (!(await f())) { if (Date.now() > ende) throw new Error('Zeit abgelaufen'); await warte(20); }
}

interface Eingang { pfad: string; kopf: IncomingHttpHeaders; rumpf: string }
/** Kleiner Empfänger: merkt sich jede Anfrage, antwortet mit `status` (oder einer Weiterleitung auf /anders). */
async function empfaenger() {
  const eingaenge: Eingang[] = [];
  const e = { status: 204, eingaenge, url: '', server: null as Server | null };
  e.server = createServer((req, res) => {
    let rumpf = '';
    req.on('data', (c) => { rumpf += c; });
    req.on('end', () => {
      eingaenge.push({ pfad: req.url ?? '', kopf: req.headers, rumpf });
      if (e.status >= 300 && e.status < 400) res.writeHead(e.status, { location: '/anders' }).end();
      else res.writeHead(e.status).end();
    });
  });
  await new Promise<void>((r) => e.server!.listen(0, '127.0.0.1', () => r()));
  const a = e.server.address();
  e.url = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/hook`;
  return e;
}

const lena = { id: '00000000-0000-4000-8000-0000000000a1', email: 'lena@example.org', name: 'Lena', rolle: 'mitglied', aktiv: true } as never as import('../../shared/src/model').Benutzer;
const markus = { id: '00000000-0000-4000-8000-0000000000a2', email: 'markus@example.org', name: 'Markus', rolle: 'admin', aktiv: true } as never as import('../../shared/src/model').Benutzer;
/** „Verschlüsseln“ für Tests: erkennbar wie echte Werte (dms1$…), umkehrbar. */
const verschluessele = (k: string) => `dms1$${Buffer.from(k).toString('base64url')}`;
const entschluessele = (w: string) => (w.startsWith('dms1$') ? Buffer.from(w.slice(5), 'base64url').toString() : null);

describe('Ziel-Adressen (#627)', () => {
  it('https überall, http nur im Heimnetz; keine Anmeldedaten, kein #', () => {
    assert.equal(zielProblem('https://hooks.example.org/dms'), null);
    assert.equal(zielProblem('http://homey.home.arpa/api/app/x/dms'), null);
    assert.equal(zielProblem('http://192.168.178.20/api/app/x/dms'), null);
    assert.equal(zielProblem('http://nodered:1880/dms'), null, 'Name ohne Punkt = Heimnetz');
    assert.match(zielProblem('http://hooks.example.org/dms')!, /Heimnetz/);
    assert.match(zielProblem('ftp://homey.home.arpa/x')!, /https/);
    assert.match(zielProblem('https://lena:geheim@hooks.example.org/')!, /Passwort/);
    assert.match(zielProblem('https://hooks.example.org/#x')!, /#/);
    assert.match(zielProblem('kein link')!, /gültige/);
    assert.equal(ursprung('https://Homey.home.arpa:8443/a?b=1'), 'https://homey.home.arpa:8443');
  });
});

describe('Signatur (#627)', () => {
  it('HMAC-SHA256 über <zeit>.<rumpf>, mit Zeitgrenze', () => {
    const rumpf = '{"art":"probe"}';
    const s = signatur('whsec_test', 1762156800, rumpf);
    assert.match(s, /^v1=[0-9a-f]{64}$/);
    assert.equal(pruefeSignatur('whsec_test', { signatur: s, zeit: '1762156800' }, rumpf, 1762156800 + 10), true);
    assert.equal(pruefeSignatur('whsec_test', { signatur: s, zeit: '1762156800' }, rumpf, 1762156800 + 400), false, 'zu alt');
    assert.equal(pruefeSignatur('whsec_anders', { signatur: s, zeit: '1762156800' }, rumpf, 1762156800), false);
    assert.equal(pruefeSignatur('whsec_test', { signatur: s, zeit: '1762156801' }, rumpf, 1762156800), false, 'Zeit gehört zur Signatur');
    assert.equal(pruefeSignatur('whsec_test', { signatur: s, zeit: '1762156800' }, `${rumpf} `, 1762156800), false);
  });
  it('wartet wachsend und gibt nach etwa einem Tag auf', () => {
    const summe = WEBHOOK_WARTEN_S.reduce((a, b) => a + b, 0);
    assert.ok(summe > 18 * 3600 && summe < 26 * 3600, String(summe));
    assert.equal(WEBHOOK_VERSUCHE, WEBHOOK_WARTEN_S.length + 1);
    for (let i = 1; i < WEBHOOK_WARTEN_S.length; i++) assert.ok(WEBHOOK_WARTEN_S[i] >= WEBHOOK_WARTEN_S[i - 1]);
  });
});

describe('Zustellung an einen Empfänger (#627)', () => {
  let e: Awaited<ReturnType<typeof empfaenger>>;
  let zahlen: WebhookZahlen;
  let w: Webhooks;
  let admins: string[];
  let besitzer: Array<{ an: string; text: string }>;
  const neu = (z: Partial<WebhookZahlen>) => { zahlen = { ...zahlen, ...z, stand: zahlen.stand + 1, geaendert: new Date().toISOString() }; };
  const baue = (mehr: Partial<WebhookDeps> = {}) => new Webhooks({
    repo: speicherWebhookRepo(), einstellungen: speicherEinstellungen(), verschluessele, entschluessele,
    zahlen: async () => ({ ...zahlen }), benutzer: async (id) => [lena, markus].find((b) => b.id === id),
    anAdmins: async (betreff) => { admins.push(mailText(betreff)); },
    anBesitzer: async (b, _betreff, text) => { besitzer.push({ an: b.email, text: mailText(text) }); },
    zeiten: { abstandS: 0.3, anstossS: 0.02, wartenS: [0.05, 0.05, 0.05] }, ...mehr,
  });
  before(async () => { e = await empfaenger(); });
  after(async () => { w?.stop(); await new Promise((r) => e.server!.close(r)); });
  beforeEach(async () => {
    // Zeitgeber des vorigen Tests (anstossen nach dem Anlegen) sollen hier nichts mehr zustellen.
    w?.stop(); await warte(100);
    e.eingaenge.length = 0; e.status = 204; admins = []; besitzer = [];
    zahlen = { neuePost: 0, zuErledigen: 0, ueberfaellig: 0, stand: 1, geaendert: new Date().toISOString() };
    w = baue();
  });

  it('Ziel muss freigegeben sein; ein Administrator gibt es mit dem Eintragen frei', async () => {
    await assert.rejects(w.lege(lena, { name: 'Homey', url: e.url }), /nicht freigegeben/);
    await assert.rejects(w.lege(markus, { name: 'Draußen', url: 'http://hooks.example.org/x' }), /Heimnetz/);
    const m = await w.lege(markus, { name: 'Node-RED', url: e.url });
    assert.deepEqual(await w.ziele(), [ursprung(e.url)]);
    assert.ok(m.geheimnis.startsWith(GEHEIMNIS_PRAEFIX));
    const l = await w.lege(lena, { name: 'Homey', url: e.url });
    assert.ok(l.geheimnis);
    // Geheimnis nur einmal: Liste, Werkbank und Verlauf enthalten es nicht.
    assert.ok(!JSON.stringify(await w.liste(lena)).includes(l.geheimnis));
    assert.ok(!JSON.stringify(await w.uebersicht()).includes(l.geheimnis));
    assert.equal((await w.liste(lena)).length, 1);
    await assert.rejects(w.aendere(lena, m.id, { name: 'fremd' }), (x: { status?: number }) => x.status === 404, 'fremder Webhook');
  });

  it('meldet signiert, nur Zahlen, und nur bei Änderungen', async () => {
    await w.setzeZiele([e.url], 'markus@example.org');
    const h = await w.lege(lena, { name: 'Homey', url: e.url });
    await w.pruefe(); await w.stelleZu();
    assert.equal(e.eingaenge.length, 1, 'erste Meldung mit dem aktuellen Stand');
    const x = e.eingaenge[0];
    assert.equal(x.kopf['content-type'], 'application/json');
    assert.equal(x.kopf[WEBHOOK_KOPF.art], 'zaehler.geaendert');
    assert.equal(x.kopf[WEBHOOK_KOPF.webhook], h.id);
    assert.equal(x.kopf[WEBHOOK_KOPF.versuch], '1');
    assert.equal(pruefeSignatur(h.geheimnis, { signatur: String(x.kopf[WEBHOOK_KOPF.signatur]), zeit: String(x.kopf[WEBHOOK_KOPF.zeit]) }, x.rumpf), true);
    const r = JSON.parse(x.rumpf);
    assert.equal(JSON.stringify(r), x.rumpf, 'kompaktes JSON: Prüfen geht auch mit dem geparsten Rumpf (Node-RED)');
    assert.match(x.rumpf, /^[\x20-\x7e]+$/, 'nur ASCII');
    assert.deepEqual(Object.keys(r).sort(), ['art', 'daten', 'id', 'zeit']);
    assert.equal(r.id, x.kopf[WEBHOOK_KOPF.ereignis]);
    assert.deepEqual(Object.keys(r.daten).sort(), ['geaendert', 'neuePost', 'stand', 'ueberfaellig', 'zuErledigen']);
    for (const [k, v] of Object.entries(r.daten)) assert.ok(k === 'geaendert' ? typeof v === 'string' : Number.isInteger(v), k);
    for (const wort of ['Lena', 'lena@', 'Homey']) assert.ok(!x.rumpf.includes(wort), wort);
    // Nichts geändert: keine weitere Meldung.
    await w.pruefe(); await w.stelleZu();
    assert.equal(e.eingaenge.length, 1);
    const l = (await w.liste(lena))[0];
    assert.equal(l.letzte?.ok, true);
    assert.equal(l.letzte?.status, 204);
    assert.equal(l.offen, null);
  });

  it('fasst 20 Änderungen in kurzer Zeit zu wenigen Meldungen zusammen; der letzte Stand stimmt', async () => {
    await w.setzeZiele([e.url], 'markus@example.org');
    await w.lege(lena, { name: 'Homey', url: e.url });
    await w.pruefe(); await w.stelleZu();
    e.eingaenge.length = 0;
    for (let i = 1; i <= 20; i++) {
      neu({ neuePost: i });
      await w.pruefe(); await w.stelleZu();
      await warte(30);
    }
    await bis(async () => { await w.stelleZu(); return (await w.liste(lena))[0].offen === null; });
    const n = e.eingaenge.length;
    assert.ok(n >= 1 && n <= 4, `wenige Meldungen, nicht 20 (${n})`);
    const letzte = JSON.parse(e.eingaenge.at(-1)!.rumpf);
    assert.equal(letzte.daten.neuePost, 20);
    assert.equal(letzte.daten.stand, zahlen.stand);
    assert.equal(new Set(e.eingaenge.map((x) => x.kopf[WEBHOOK_KOPF.ereignis])).size, n, 'jede Meldung mit eigener Ereignis-Id');
  });

  it('wiederholt bei 500, zeigt den Fehler und schaltet nach dem letzten Versuch ab', async () => {
    await w.setzeZiele([e.url], 'markus@example.org');
    const h = await w.lege(lena, { name: 'Homey', url: e.url });
    e.status = 500;
    await w.pruefe(); await w.stelleZu();
    let l = (await w.liste(lena))[0];
    assert.equal(l.letzte?.ok, false);
    assert.match(l.letzte?.fehler ?? '', /500/);
    assert.equal(l.fehlerFolge, 1);
    assert.equal(l.offen?.versuche, 1);
    await bis(async () => { await w.stelleZu(); return !(await w.liste(lena))[0].aktiv; });
    l = (await w.liste(lena))[0];
    assert.equal(e.eingaenge.length, 4, 'ein Versuch und drei Wiederholungen');
    assert.equal(new Set(e.eingaenge.map((x) => x.kopf[WEBHOOK_KOPF.ereignis])).size, 1, 'Wiederholung mit derselben Ereignis-Id');
    assert.deepEqual(e.eingaenge.map((x) => x.kopf[WEBHOOK_KOPF.versuch]), ['1', '2', '3', '4']);
    assert.equal(l.abgeschaltet?.grund, 'fehler');
    assert.equal(admins.length, 1);
    assert.equal(besitzer.length, 1, 'Besitzerin bekommt auch eine Mail (Frage 67)');
    assert.equal(besitzer[0].an, 'lena@example.org');
    assert.match(besitzer[0].text, /Hallo Lena,\n\ndein Webhook „Homey“ .*Mein Konto → Benachrichtigungen/s);
    assert.equal((await w.verlauf(lena, h.id))[0].zustand, 'aufgegeben');
    // Wieder einschalten: beginnt von vorn und meldet den aktuellen Stand.
    e.status = 200;
    await w.aendere(lena, h.id, { aktiv: true });
    await bis(async () => { await w.pruefe(); await w.stelleZu(); return e.eingaenge.length === 5; });
    assert.equal((await w.liste(lena))[0].fehlerFolge, 0);
  });

  it('neuere Zahlen während der Wiederholung: neue Ereignis-Id, Wiederholung geht weiter', async () => {
    w = baue({ zeiten: { abstandS: 0.05, anstossS: 0.02, wartenS: [0.3, 0.3] } });
    await w.setzeZiele([e.url], 'markus@example.org');
    await w.lege(lena, { name: 'Homey', url: e.url });
    e.status = 503;
    await w.pruefe(); await w.stelleZu();
    const erste = e.eingaenge[0].kopf[WEBHOOK_KOPF.ereignis];
    neu({ neuePost: 3 });
    await w.pruefe();
    e.status = 200;
    await bis(async () => { await w.stelleZu(); return e.eingaenge.length === 2; });
    const zweite = JSON.parse(e.eingaenge[1].rumpf);
    assert.notEqual(zweite.id, erste);
    assert.equal(zweite.daten.neuePost, 3);
  });

  it('folgt keiner Weiterleitung', async () => {
    await w.setzeZiele([e.url], 'markus@example.org');
    const h = await w.lege(lena, { name: 'Homey', url: e.url });
    e.status = 302;
    const p = await w.probe(lena, h.id);
    assert.equal(p.ok, false);
    assert.equal(p.status, 302);
    assert.match(p.fehler ?? '', /Weiterleitung/);
    assert.deepEqual(e.eingaenge.map((x) => x.pfad), ['/hook'], '/anders nie aufgerufen');
  });

  it('Probe senden, Geheimnis erneuern, Abschalten durch den Administrator', async () => {
    await w.setzeZiele([e.url], 'markus@example.org');
    const h = await w.lege(lena, { name: 'Homey', url: e.url });
    const p = await w.probe(lena, h.id);
    assert.equal(p.ok, true);
    assert.equal(e.eingaenge[0].kopf[WEBHOOK_KOPF.art], 'probe');
    const { geheimnis } = await w.erneuereGeheimnis(lena, h.id);
    assert.notEqual(geheimnis, h.geheimnis);
    await w.probe(lena, h.id);
    const x = e.eingaenge[1];
    const kopf = { signatur: String(x.kopf[WEBHOOK_KOPF.signatur]), zeit: String(x.kopf[WEBHOOK_KOPF.zeit]) };
    assert.equal(pruefeSignatur(geheimnis, kopf, x.rumpf), true);
    assert.equal(pruefeSignatur(h.geheimnis, kopf, x.rumpf), false, 'altes Geheimnis gilt nicht mehr');
    await w.schalteWerkbank(h.id, false, 'markus@example.org');
    await assert.rejects(w.aendere(lena, h.id, { aktiv: true }), (f: { status?: number }) => f.status === 403);
    await w.pruefe(); await w.stelleZu();
    assert.equal(e.eingaenge.length, 2, 'abgeschaltet: keine Meldung');
    // Ziel entzogen: keine Zustellung mehr, mit verständlichem Fehler.
    await w.schalteWerkbank(h.id, true, 'markus@example.org');
    await w.setzeZiele([], 'markus@example.org');
    await w.pruefe(); await w.stelleZu();
    assert.equal(e.eingaenge.length, 2);
    assert.match((await w.liste(lena))[0].letzte?.fehler ?? '', /nicht mehr freigegeben/);
    await w.loesche(lena, h.id);
    assert.deepEqual(await w.liste(lena), []);
  });
});

describe('Webhooks Ende zu Ende: neue Post → Meldung (#627)', { skip: echtesFastify ? false : 'Fastify nicht installiert' }, () => {
  let e: Awaited<ReturnType<typeof empfaenger>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let app: any; let dienst: import('../src/dienst').Dienst; let w: Webhooks;
  let cookieAdmin = ''; let cookieLena = ''; let adminId = ''; let lenaId = '';
  before(async () => {
    e = await empfaenger();
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    w = new Webhooks({
      repo: speicherWebhookRepo(), einstellungen: speicherEinstellungen(), verschluessele, entschluessele,
      zahlen: async (b) => { const r = await dienst.sichten.zaehlerAbruf(await dienst.rechtepruefung.zugriff(b)); return { ...r.zahlen, stand: r.stand, geaendert: r.geaendert }; },
      benutzer: (id) => konten.benutzerMitId(id), zeiten: { abstandS: 0.5, anstossS: 0.1 },
    });
    dienst.sichten.beiAenderung(() => w.anstossen());
    app = await baueApp(dienst, konten, { webhooks: w });
    const r = await app.inject({ method: 'POST', url: '/api/konto/einrichten', headers: { 'x-dms': '1' }, payload: { email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' } });
    cookieAdmin = String(r.headers['set-cookie']).split(';')[0];
    adminId = JSON.parse(r.body).benutzer.id;
    const l = await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, adminId);
    lenaId = l.benutzer.id;
    await konten.setzePasswortDirekt('lena@example.org', 'noch-ein-langes-passwort');
    await dienst.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    const a = await app.inject({ method: 'POST', url: '/api/konto/anmelden', headers: { 'x-dms': '1' }, payload: { email: 'lena@example.org', passwort: 'noch-ein-langes-passwort' } });
    assert.equal(a.statusCode, 200, a.body);
    cookieLena = String(a.headers['set-cookie']).split(';')[0];
  });
  after(async () => { w?.stop(); await app?.close(); await new Promise((r) => e.server!.close(r)); });

  const rufe = (cookie: string, method: string, url: string, payload?: unknown) => app.inject({ method, url, headers: { cookie, 'x-dms': '1' }, ...(payload !== undefined ? { payload } : {}) });

  it('über die Oberfläche anlegen; nach neuer Post kommt in wenigen Sekunden eine gültige Meldung ohne Inhalte', async () => {
    assert.equal((await rufe(cookieLena, 'POST', '/api/konto/webhooks', { name: 'Homey', url: e.url })).statusCode, 422, 'noch nicht freigegeben');
    assert.equal((await rufe(cookieLena, 'GET', '/api/werkbank/webhooks')).statusCode, 403);
    assert.equal((await rufe(cookieAdmin, 'PUT', '/api/werkbank/webhooks/ziele', { ziele: [e.url] })).statusCode, 200);
    const r = await rufe(cookieLena, 'POST', '/api/konto/webhooks', { name: 'Homey', url: e.url });
    assert.equal(r.statusCode, 201, r.body);
    const { geheimnis, id } = JSON.parse(r.body);
    await bis(() => e.eingaenge.length === 1);
    const start = Date.now();
    await dienst.post.legePostAn({ betreff: 'Brief Stadtwerke Musterstadt', absender: 'Absender Beispiel GmbH', fuer: lenaId }, { id: adminId, name: 'Markus' });
    await bis(() => e.eingaenge.length === 2, 5000);
    assert.ok(Date.now() - start < 3000, `innerhalb weniger Sekunden (${Date.now() - start} ms)`);
    const x = e.eingaenge[1];
    assert.equal(pruefeSignatur(geheimnis, { signatur: String(x.kopf[WEBHOOK_KOPF.signatur]), zeit: String(x.kopf[WEBHOOK_KOPF.zeit]) }, x.rumpf), true);
    const daten = JSON.parse(x.rumpf).daten;
    assert.equal(daten.neuePost, 1);
    for (const wort of ['Stadtwerke', 'Absender', 'Lena', 'Markus', 'Brief']) assert.ok(!x.rumpf.includes(wort), wort);
    // Stand wie beim Zähler-Endpunkt.
    const z = await dienst.sichten.zaehlerAbruf(await dienst.rechtepruefung.zugriff({ id: lenaId, rolle: 'mitglied' }));
    assert.equal(daten.stand, z.stand);
    const liste = JSON.parse((await rufe(cookieLena, 'GET', '/api/konto/webhooks')).body);
    assert.equal(liste.webhooks.length, 1);
    assert.ok(!JSON.stringify(liste).includes(geheimnis));
    assert.equal((await rufe(cookieLena, 'POST', `/api/konto/webhooks/${id}/probe`)).statusCode, 200);
    assert.equal(JSON.parse((await rufe(cookieAdmin, 'GET', '/api/werkbank/webhooks')).body).webhooks[0].benutzer.name, 'Lena');
    assert.equal((await rufe(cookieLena, 'DELETE', `/api/konto/webhooks/${id}`)).statusCode, 204);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('Webhooks in PostgreSQL (#627)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let haupt: any; let sql: any;
  const db = `dms_webhook_${process.pid}`;
  const HAUSHALT = '00000000-0000-4000-8000-000000000001';
  const B = '00000000-0000-4000-8000-0000000000b1';
  const W = '00000000-0000-4000-8000-0000000000d1';
  const zahlen = (stand: number): WebhookZahlen => ({ neuePost: stand, zuErledigen: 0, ueberfaellig: 0, stand, geaendert: new Date().toISOString() });
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${B}, ${HAUSHALT}, 'lena@example.org', 'Lena', 'mitglied')`;
  });
  after(async () => { await sql?.end(); await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`); await haupt?.end(); });

  it('meldet einen Stand einmal, fasst zusammen und verteilt Meldungen ohne Doppel', async () => {
    const { pgWebhookRepo } = await import('../src/webhook');
    const repo = pgWebhookRepo(sql, HAUSHALT);
    await repo.lege({ id: W, benutzerId: B, name: 'Homey', url: 'https://homey.home.arpa/x', geheimnis: verschluessele('whsec_a'), ereignisse: ['zaehler.geaendert'] });
    // Zwei Server prüfen gleichzeitig denselben Stand: eine Meldung.
    const r = await Promise.all([repo.merkeStand(W, 1, zahlen(1), 30), repo.merkeStand(W, 1, zahlen(1), 30), pgWebhookRepo(sql, HAUSHALT).merkeStand(W, 1, zahlen(1), 30)]);
    assert.deepEqual(r.filter(Boolean), ['neu']);
    assert.equal(await repo.merkeStand(W, 2, zahlen(2), 30), 'zusammengefasst');
    assert.equal(await repo.merkeStand(W, 2, zahlen(2), 30), null);
    // Zwei Server holen gleichzeitig: nur einer bekommt die Meldung.
    const [a, b] = await Promise.all([repo.faellige(10, 60), pgWebhookRepo(sql, HAUSHALT).faellige(10, 60)]);
    assert.equal(a.length + b.length, 1);
    const m = [...a, ...b][0];
    assert.equal(m.daten.stand, 2);
    assert.equal(m.versuch, 1);
    assert.deepEqual(await repo.faellige(10, 60), [], 'Lease: nicht gleich noch einmal');
    // Während des Sendens neuere Zahlen: neue Ereignis-Id, die alte Zustellung schließt die Meldung nicht.
    assert.equal(await repo.merkeStand(W, 3, zahlen(3), 30), 'zusammengefasst');
    const ok = { zeit: new Date().toISOString(), art: 'zaehler.geaendert' as const, ok: true, status: 204, fehler: null, ms: 3 };
    assert.equal(await repo.zugestellt(m, ok, 0), false);
    const [n] = await repo.faellige(10, 60);
    assert.notEqual(n.ereignisId, m.ereignisId);
    assert.equal(n.daten.stand, 3);
    assert.equal(await repo.zugestellt(n, ok, 0), true);
    const h = (await repo.hole(W))!;
    assert.equal(h.offen, null);
    assert.equal(h.gemeldetStand, 3);
    assert.equal(h.letzte?.status, 204);
    // Neue Meldung frühestens nach dem Mindestabstand.
    assert.equal(await repo.merkeStand(W, 4, zahlen(4), 30), 'neu');
    assert.deepEqual(await repo.faellige(10, 60), []);
    assert.ok(Date.parse((await repo.hole(W))!.offen!.faellig) > Date.now() + 20_000);
    // Fehlschlag mit Aufgeben: abgeschaltet.
    await sql`UPDATE webhook_meldungen SET faellig = now() WHERE webhook_id = ${W} AND zustand = 'offen'`;
    const [f] = await repo.faellige(10, 60);
    await repo.fehlgeschlagen(f, { ...ok, ok: false, status: 500, fehler: 'Der Empfänger antwortet mit 500.' }, null, { grund: 'fehler', zeit: new Date().toISOString() });
    const g = (await repo.hole(W))!;
    assert.equal(g.aktiv, false);
    assert.equal(g.fehlerFolge, 1);
    assert.equal(g.abgeschaltet?.grund, 'fehler');
    assert.deepEqual((await repo.verlauf(W, 10)).map((v) => v.zustand), ['aufgegeben', 'zugestellt']);
    await repo.aendere(W, { aktiv: true, abgeschaltet: null });
    assert.equal((await repo.hole(W))!.gemeldetStand, null, 'wieder ein: von vorn');
  });

  it('Schlüsselwechsel schlüsselt das Geheimnis mit um; Benutzer gelöscht → Webhooks weg', async () => {
    const { pgRepo } = await import('../src/repo-pg');
    const repo = pgRepo(sql, HAUSHALT);
    const funde = await repo.verschluesselteFundstellen();
    assert.ok(funde.some((f) => f.quelle === 'webhook' && f.schluessel === W && f.titel === 'Homey'));
    const { bestandAus } = await import('../src/geheimnisse');
    assert.equal(bestandAus(funde, () => true).arten.find((x) => x.art === 'webhook')?.anzahl, 1);
    const r = await repo.umschluesseln((w) => verschluessele(`neu:${entschluessele(w)}`), {});
    assert.ok(r.umgeschluesselt >= 1);
    const [z] = await sql`SELECT geheimnis FROM webhooks WHERE id = ${W}`;
    assert.equal(entschluessele(z.geheimnis), 'neu:whsec_a');
    await sql`DELETE FROM benutzer WHERE id = ${B}`;
    assert.equal((await sql`SELECT count(*)::int AS n FROM webhooks`)[0].n, 0);
    assert.equal((await sql`SELECT count(*)::int AS n FROM webhook_meldungen`)[0].n, 0);
  });
});
