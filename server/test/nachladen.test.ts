/**
 * Angezeigtes holt sich den neuen Stand selbst (#919) und „Gerade auch im Verwaltungsmodus“ in der Werkbank (#921).
 * Über HTTP (Fastify inject) wie im Betrieb; der Baustein der Oberfläche (web/src/nachladen.ts) als reine Logik.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { ANFANG, schritt, starteNachladen, TAKT_MS, type Umgebung } from '../../web/src/nachladen';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { hasheSchluessel } from '../src/passwort';
import { speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { pruefeVerwaltung, type Anfrage } from '../src/routen';
import { bereicheDerRoute, JEDER } from '../src/verwaltungsbereiche';
import { imModus } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';

const PW = 'ein-langes-passwort';
const MIN = 60_000;
const marke = () => Math.max(0, ...protokoll.eintraege({}).map((e) => e.nr));

async function aufbau() {
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const grund = speicherKontoRepo();
  // Zählt, wie oft „zuletzt aktiv“ einer Sitzung gesetzt wird; die Sitzung gilt dafür immer als lange unberührt.
  const beruehrt = { n: 0 };
  const repo: KontoRepo = {
    ...grund,
    holeSitzung: async (h) => { const s = await grund.holeSitzung(h); return s && { ...s, zuletztAktiv: new Date(0) }; },
    holeAnmeldung: async (h) => { const x = await grund.holeAnmeldung!(h); return x && { ...x, sitzung: { ...x.sitzung, zuletztAktiv: new Date(0) } }; },
    beruehreSitzung: async (h) => { beruehrt.n++; await grund.beruehreSitzung(h); },
  };
  const konten = new Konten(repo, null, 'http://nas', d.systemtypen.benutzerspiegel());
  d.verbindeKonten(konten.papierkorbHaken());
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const mitPasswort = async (email: string, name: string) => {
    const r = await konten.legeBenutzerAn({ email, name }, lena.id);
    await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PW });
    return r.benutzer;
  };
  const markus = await mitPasswort('markus@example.org', 'Markus');
  const petra = await mitPasswort('petra@example.org', 'Petra');
  await konten.setzeVerwaltung(imModus(lena), markus.id, ['benutzer']);
  await d.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
  const { baueApp } = await import('../src/http');
  const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
  const app = await baueApp(d, konten, { apiSchluessel: new ApiSchluesselDienst(speicherApiSchluesselRepo()) });
  const anmelden = async (email: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/konto/anmelden', payload: { email, passwort: PW }, headers: { 'x-dms': '1' } });
    assert.equal(r.statusCode, 200, r.body);
    return ([] as string[]).concat(r.headers['set-cookie'] as string | string[])[0].split(';')[0];
  };
  const rufe = (cookie: string, method: 'GET' | 'POST', url: string, payload?: unknown, kopf: Record<string, string> = {}) =>
    app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }), headers: { 'x-dms': '1', cookie, ...kopf } });
  const verwalten = (cookie: string) => rufe(cookie, 'POST', '/api/konto/verwaltung', {});
  const jetzt = { t: Date.now() };
  konten.uhr = () => jetzt.t;
  return { d, konten, grund, beruehrt, app, lena, markus, petra, anmelden, rufe, verwalten, jetzt };
}

/** Umgebung zum Durchspielen: Sichtbarkeit von Hand, Zeitgeber als Liste. */
function probeUmgebung() {
  let sichtbar = true;
  const hoerer = new Set<() => void>();
  const wartend: Array<{ ms: number; f: () => void; weg: boolean }> = [];
  const u: Umgebung = {
    sichtbar: () => sichtbar,
    beiSichtbarkeit: (f) => { hoerer.add(f); return () => hoerer.delete(f); },
    spaeter: (ms, f) => { const w = { ms, f, weg: false }; wartend.push(w); return () => { w.weg = true; }; },
    zufall: () => 0.5,
  };
  const ruhe = () => new Promise((r) => setImmediate(r));
  return {
    u,
    /** Nächsten Takt auslösen (wenn einer geplant ist). */
    async takt() { const w = wartend.filter((x) => !x.weg).shift(); if (!w) return false; w.weg = true; w.f(); await ruhe(); return true; },
    geplant: () => wartend.filter((x) => !x.weg),
    async setzeSichtbar(an: boolean) { sichtbar = an; for (const f of hoerer) f(); await ruhe(); },
    ruhe,
    hoerer: () => hoerer.size,
  };
}

describe('Baustein „von selbst nachladen“ (#919, web/src/nachladen.ts)', () => {
  it('Schritt: erster Wert nur merken, Nachlauf einmal, gleicher Stand → nichts, Änderung → laden', () => {
    let z = ANFANG;
    const lauf = (s: string, o = {}) => { const r = schritt(z, s, o); z = r.zustand; return r.melden; };
    assert.equal(lauf('a'), false, 'erster Wert: die Seite hat schon geladen');
    assert.equal(lauf('a'), true, 'Nachlauf: Zahlen anderer dürfen kurz nachhinken');
    assert.equal(lauf('a'), false);
    assert.equal(lauf('a'), false, 'Stand gleich → kein Nachladen');
    assert.equal(lauf('b'), true, 'Stand geändert → nachladen');
    assert.equal(lauf('b'), true, 'und noch einmal im nächsten Takt');
    assert.equal(lauf('b'), false);
    // Für Listen, die selbst angezeigt werden (#921): ersten Wert melden, kein Nachlauf.
    z = ANFANG;
    assert.equal(lauf('x', { erstesMelden: true, nachlauf: false }), true);
    assert.equal(lauf('x', { erstesMelden: true, nachlauf: false }), false);
    assert.equal(lauf('y', { erstesMelden: true, nachlauf: false }), true);
    assert.equal(lauf('y', { erstesMelden: true, nachlauf: false }), false);
  });

  it('Abfrage: Takt 10–15 s, gleicher Stand → keine weitere Anfrage der Seite; Hintergrund-Tab fragt nicht, zurück sofort', async () => {
    const p = probeUmgebung();
    let stand = 's1';
    let gefragt = 0;
    let geladen = 0;
    const stopp = starteNachladen({ hole: async () => { gefragt++; return stand; }, melde: () => { geladen++; }, umgebung: p.u });
    await p.ruhe();
    assert.equal(gefragt, 1, 'gleich beim Start einmal');
    assert.equal(p.geplant()[0].ms, TAKT_MS[0] + Math.floor(0.5 * (TAKT_MS[1] - TAKT_MS[0] + 1)));
    assert.ok(p.geplant()[0].ms >= 10_000 && p.geplant()[0].ms <= 15_000);
    await p.takt();
    assert.equal(geladen, 1, 'Nachlauf nach dem ersten Wert');
    for (let i = 0; i < 5; i++) await p.takt();
    assert.equal(gefragt, 7);
    assert.equal(geladen, 1, 'Stand gleich → die Seite lädt nichts nach');
    stand = 's2';
    await p.takt();
    assert.equal(geladen, 2, 'Stand geändert → einmal nachladen');
    await p.takt();
    await p.takt();
    assert.equal(geladen, 3, 'ein Nachlauf, dann Ruhe');
    // Hintergrund-Tab: kein Takt mehr geplant, keine Anfrage.
    await p.setzeSichtbar(false);
    assert.equal(p.geplant().length, 0);
    const vorher = gefragt;
    assert.equal(await p.takt(), false);
    assert.equal(gefragt, vorher, 'im Hintergrund wird nicht gefragt');
    // Zurück im Tab: sofort einmal, danach wieder im Takt.
    stand = 's3';
    await p.setzeSichtbar(true);
    assert.equal(gefragt, vorher + 1);
    assert.equal(geladen, 4);
    assert.equal(p.geplant().length, 1);
    // Fehler (nicht erreichbar): nichts melden, weiter im Takt.
    const geladenVorher = geladen;
    stopp();
    assert.equal(p.geplant().length, 0, 'beendet: nichts mehr geplant');
    assert.equal(p.hoerer(), 0, 'beendet: kein Hörer mehr');
    let fehler = 0;
    const p2 = probeUmgebung();
    const stopp2 = starteNachladen({ hole: async () => { fehler++; throw new Error('weg'); }, melde: () => { geladen++; }, umgebung: p2.u });
    await p2.ruhe();
    await p2.takt();
    assert.equal(fehler, 2);
    assert.equal(geladen, geladenVorher);
    assert.equal(p2.geplant().length, 1);
    stopp2();
  });

  it('startet im Hintergrund-Tab nicht, sondern erst beim Zurückkehren', async () => {
    const p = probeUmgebung();
    await p.setzeSichtbar(false);
    let gefragt = 0;
    const stopp = starteNachladen({ hole: async () => { gefragt++; return 1; }, melde: () => {}, umgebung: p.u });
    await p.ruhe();
    assert.equal(gefragt, 0);
    await p.setzeSichtbar(true);
    assert.equal(gefragt, 1);
    stopp();
  });
});

describe('Stand der Ablage (#919, GET /api/ablage/stand)', () => {
  const offen: Array<() => Promise<unknown>> = [];
  after(async () => { for (const f of offen) await f(); });

  it('gleich, solange sich nichts ändert; anders nach einer Änderung; nur ein kurzer Wert ohne Inhalt', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('petra@example.org');
    const stand = async () => { const r = await x.rufe(c, 'GET', '/api/ablage/stand'); assert.equal(r.statusCode, 200, r.body); return r.json() as { stand: string } };
    const s1 = await stand();
    assert.deepEqual(Object.keys(s1), ['stand']);
    assert.match(s1.stand, /^[\w-]{10,40}$/);
    assert.equal((await stand()).stand, s1.stand, 'nichts geändert → gleicher Stand');
    await x.d.mappentypen.legeTypAn({ id: crypto.randomUUID(), name: 'Notiz', felder: [{ key: 'name', label: 'Name', typ: 'text' }], register: [{ key: 'a', name: 'A', art: 'felder', felder: ['name'] }], trefferliste: ['_titel'] });
    const s2 = await stand();
    assert.notEqual(s2.stand, s1.stand, 'nach einer Änderung ein anderer Stand');
    assert.equal((await stand()).stand, s2.stand);
    // Ohne Anmeldung nichts; nicht in der öffentlichen Schnittstelle.
    assert.equal((await x.app.inject({ method: 'GET', url: '/api/ablage/stand' })).statusCode, 401);
    assert.equal((await x.rufe(c, 'GET', '/api/v1/ablage/stand')).statusCode, 404);
  });

  it('zählt nicht als Aktivität: „zuletzt aktiv“ bleibt, der Verwaltungsmodus verlängert sich nicht', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const c = await x.anmelden('lena@example.org');
    x.beruehrt.n = 0;
    assert.equal((await x.rufe(c, 'GET', '/api/ablage/stand', undefined, { 'x-dms-aktiv': '1' })).statusCode, 200);
    assert.equal(x.beruehrt.n, 0, 'die Abfrage setzt „zuletzt aktiv“ nicht');
    assert.equal((await x.rufe(c, 'GET', '/api/sichten')).statusCode, 200);
    assert.equal(x.beruehrt.n, 1, 'eine gewöhnliche Anfrage schon (Gegenprobe)');
    assert.equal((await x.verwalten(c)).statusCode, 200);
    const imModus = (await x.rufe(c, 'GET', '/api/ablage/stand')).json().stand;
    x.jetzt.t += 10 * MIN;
    // Auch mit dem Kennzeichen „aktiv“ (kurz nach einer Eingabe) verlängert die Abfrage nichts.
    assert.equal((await x.rufe(c, 'GET', '/api/ablage/stand', undefined, { 'x-dms-aktiv': '1' })).statusCode, 200);
    x.jetzt.t += 6 * MIN;
    assert.equal((await x.rufe(c, 'GET', '/api/werkbank/uebersicht')).statusCode, 403, '16 Minuten nach der letzten Eingabe abgelaufen');
    // Modus vorbei: Die Rolle gehört zum Stand – die Zahlen wechseln (im Modus sieht man mehr).
    assert.notEqual((await x.rufe(c, 'GET', '/api/ablage/stand')).json().stand, imModus);
  });
});

describe('Gerade auch im Verwaltungsmodus (#921, GET /api/werkbank/gerade-im-modus)', () => {
  const offen: Array<() => Promise<unknown>> = [];
  after(async () => { for (const f of offen) await f(); });
  const pfad = '/api/werkbank/gerade-im-modus';

  it('Person A im Modus sieht B (mit Beginn), nicht sich selbst; ohne Modus nichts; Ende und Ablauf sind sofort weg', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const lena = await x.anmelden('lena@example.org');
    const markus = await x.anmelden('markus@example.org');
    const petra = await x.anmelden('petra@example.org');
    // Ohne Modus: keine Liste (auch nicht für Personen, die verwalten dürfen).
    const ohne = await x.rufe(lena, 'GET', pfad);
    assert.equal(ohne.statusCode, 403);
    assert.equal(ohne.json().details.verwaltungsmodus, true);
    assert.equal((await x.rufe(petra, 'GET', pfad)).statusCode, 403, 'ohne Verwaltungsrecht nie');
    assert.equal((await x.verwalten(lena)).statusCode, 200);
    assert.deepEqual((await x.rufe(lena, 'GET', pfad)).json(), [], 'allein im Modus: niemand (die eigene Person nicht)');
    const seitMarkus = x.jetzt.t += MIN;
    assert.equal((await x.verwalten(markus)).statusCode, 200);
    assert.deepEqual((await x.rufe(lena, 'GET', pfad)).json(), [{ name: 'Markus', seit: new Date(seitMarkus).toISOString() }]);
    // Markus hat nur den Bereich „Benutzer“ – der Hinweis gilt für alle, die verwalten.
    const l = (await x.rufe(markus, 'GET', pfad)).json() as Array<{ name: string }>;
    assert.deepEqual(l.map((e) => e.name), ['Lena']);
    // Zweite Sitzung derselben Person zählt einmal, mit dem frühesten Beginn.
    const lena2 = await x.anmelden('lena@example.org');
    x.jetzt.t += MIN;
    assert.equal((await x.verwalten(lena2)).statusCode, 200);
    assert.equal((await x.rufe(markus, 'GET', pfad)).json().length, 1);
    // Beendet: sofort weg.
    assert.equal((await x.rufe(markus, 'POST', '/api/konto/verwaltung/beenden')).statusCode, 200);
    assert.deepEqual((await x.rufe(lena, 'GET', pfad)).json(), []);
    // Abgelaufen: weg, sobald die 15 Minuten ohne Aktivität um sind – auch ohne weitere Anfrage dieser Person.
    assert.equal((await x.verwalten(markus)).statusCode, 200);
    assert.equal((await x.rufe(lena, 'GET', pfad)).json().length, 1);
    x.jetzt.t += 10 * MIN;
    assert.equal((await x.rufe(lena, 'GET', '/api/werkbank/uebersicht', undefined, { 'x-dms-aktiv': '1' })).statusCode, 200, 'Lena arbeitet weiter');
    x.jetzt.t += 6 * MIN;
    assert.deepEqual((await x.rufe(lena, 'GET', pfad)).json(), [], 'Markus abgelaufen');
    // Petra (ohne Recht) und Lena außerhalb des Modus sehen nichts.
    assert.equal((await x.rufe(lena, 'POST', '/api/konto/verwaltung/beenden')).statusCode, 200);
    assert.equal((await x.rufe(lena, 'GET', pfad)).statusCode, 403);
  });

  it('Nachfragen verlängert den eigenen Modus nicht und schreibt keine Historie der Anwesenheit', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    const lena = await x.anmelden('lena@example.org');
    const markus = await x.anmelden('markus@example.org');
    await x.verwalten(lena);
    await x.verwalten(markus);
    const seit = marke();
    for (let i = 0; i < 3; i++) assert.equal((await x.rufe(lena, 'GET', pfad, undefined, { 'x-dms-aktiv': '1' })).statusCode, 200);
    assert.deepEqual(protokoll.eintraege({ seit }).filter((e) => e.stufe !== 'debug').map((e) => e.text), [], 'nichts im Protokoll außer Stufe debug');
    x.jetzt.t += 16 * MIN;
    const r = await x.rufe(lena, 'GET', pfad, undefined, { 'x-dms-aktiv': '1' });
    assert.equal(r.statusCode, 403, 'nach 16 Minuten nur mit Nachfragen: abgelaufen');
  });

  it('Dienst- und Systemkonten nie; nie mit API-Schlüssel, nicht in /api/v1; Rechte der Route (Vorgabe „nein“)', async () => {
    const x = await aufbau();
    offen.push(() => x.app.close());
    // Auch eine untergeschobene Sitzung im Modus eines Dienst- oder Systemkontos erscheint nicht.
    const paket = await x.konten.dienstkonto('paket-a', 'Beispiel');
    const system = await x.konten.systemkonto('automatisierung');
    for (const k of [paket, system]) {
      const h = hasheSchluessel(`probe-${k.id}`);
      await x.grund.legeSitzungAn(h, k.id, new Date(Date.now() + 60 * MIN), { geraet: 'Probe', ip: '127.0.0.1' });
      await x.grund.setzeSitzungsVerwaltung(h, { verwaltungSeit: new Date(x.jetzt.t), verwaltungAktiv: new Date(x.jetzt.t) });
    }
    assert.deepEqual(await x.konten.andereImVerwaltungsmodus(x.lena), []);
    const lena = await x.anmelden('lena@example.org');
    await x.verwalten(lena);
    assert.deepEqual((await x.rufe(lena, 'GET', pfad)).json(), []);
    // API-Schlüssel: interne Schnittstellen nehmen keine; in /api/v1 gibt es die Route nicht.
    const s = (await x.rufe(lena, 'POST', '/api/konto/api-schluessel', { name: 'Scanner', recht: 'lesen' })).json().schluessel as string;
    const mit = (url: string) => x.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${s}` } });
    assert.equal((await mit(pfad)).statusCode, 401);
    assert.equal((await mit(`/api/v1${pfad.slice(4)}`)).statusCode, 404);
    assert.equal((await mit('/api/ablage/stand')).statusCode, 401);
    // Bereich: alle, die verwalten – im Modus; ohne Recht 403.
    assert.deepEqual(bereicheDerRoute('GET', pfad), [JEDER]);
    const a = (v: string[], modus = true) => ({ benutzer: { id: 'x', verwaltung: v, rolle: 'admin' }, verwaltungsmodus: modus, body: {}, params: {}, query: {}, ip: '1' }) as unknown as Anfrage;
    pruefeVerwaltung({ methode: 'GET', pfad }, a(['benutzer']), x.konten);
    assert.throws(() => pruefeVerwaltung({ methode: 'GET', pfad }, a([]), x.konten), (e) => e instanceof Fachfehler && e.status === 403);
    assert.throws(() => pruefeVerwaltung({ methode: 'GET', pfad }, a(['*'], false), x.konten), (e) => e instanceof Fachfehler && e.status === 403);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('PostgreSQL: Sitzungen im Verwaltungsmodus (#921)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  it('nur aktive Personen des Haushalts mit Modus, ohne Vertretung, gültige Sitzung; keine Dienst- und Systemkonten', async () => {
    const { pgKontoRepo } = await import('../src/konto-repo');
    // Eigene Datenbank (#900), nicht das Schema der gemeinsamen leeren.
    const db = await eigeneDatenbank('nachladen');
    const sql = db.sql;
    try {
      const H = '00000000-0000-4000-8000-000000000001', ANDERER = '00000000-0000-4000-8000-000000000002';
      await sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Test'), (${ANDERER}, 'Anderer') ON CONFLICT DO NOTHING`;
      const repo = pgKontoRepo(sql, H);
      const fremd = pgKontoRepo(sql, ANDERER);
      const neu = async (r: KontoRepo, email: string, name: string) => r.legeBenutzerAn({ id: crypto.randomUUID(), email, name, passwortHash: 'x', verwaltung: ['*'] });
      const lena = await neu(repo, 'lena@example.org', 'Lena');
      const markus = await neu(repo, 'markus@example.org', 'Markus');
      const jonas = await neu(repo, 'jonas@example.org', 'Jonas');
      const katrin = await neu(fremd, 'katrin@example.org', 'Katrin');
      const paket = await repo.legeDienstkontoAn({ id: crypto.randomUUID(), paketId: 'p', name: 'Paket Beispiel' });
      const jetzt = new Date();
      const sitzung = async (r: KontoRepo, id: string, n: string, o: { modus?: boolean; ablauf?: number; vertretung?: string } = {}) => {
        await r.legeSitzungAn(n, id, new Date(Date.now() + (o.ablauf ?? 60 * MIN)), { geraet: 'Probe', ip: '127.0.0.1', vertretungId: o.vertretung ?? null });
        if (o.modus !== false) await r.setzeSitzungsVerwaltung(n, { verwaltungSeit: jetzt, verwaltungAktiv: jetzt });
      };
      await sitzung(repo, lena.id, 'h-lena');
      await sitzung(repo, markus.id, 'h-markus-ohne', { modus: false });
      await sitzung(repo, jonas.id, 'h-jonas');
      await sitzung(fremd, katrin.id, 'h-katrin');
      await sitzung(repo, paket.id, 'h-paket');
      // Deaktivierte Person, Vertretung und abgelaufene Sitzung (legeSitzungAn räumt abgelaufene beim nächsten Anlegen auf – deshalb zuletzt).
      await repo.aendereBenutzer(jonas.id, { aktiv: false });
      const v = crypto.randomUUID();
      await repo.legeVertretungAn({ id: v, benutzerId: markus.id, adminId: lena.id, adminName: 'Lena' });
      await sitzung(repo, markus.id, 'h-markus-vertretung', { vertretung: v });
      await sitzung(repo, markus.id, 'h-markus-alt', { ablauf: -MIN });
      const liste = await repo.sitzungenImVerwaltungsmodus();
      assert.deepEqual(liste.map((x) => x.benutzer.name), ['Lena']);
      assert.equal(liste[0].sitzung.verwaltungSeit?.getTime(), jetzt.getTime());
      assert.deepEqual((await fremd.sitzungenImVerwaltungsmodus()).map((x) => x.benutzer.name), ['Katrin'], 'nur der eigene Haushalt');
      await repo.setzeSitzungsVerwaltung('h-lena', { verwaltungSeit: null, verwaltungAktiv: null });
      assert.deepEqual(await repo.sitzungenImVerwaltungsmodus(), [], 'beendet: weg');
    } finally { await db.ende(); }
  });
});
