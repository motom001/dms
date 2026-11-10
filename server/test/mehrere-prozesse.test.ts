/**
 * Zustand zwischen Anfragen in der Datenbank (#744): Je Punkt zwei Instanzen auf derselben PostgreSQL-Datenbank – so wie
 * zwei Prozesse oder zwei Server. Gezeigt wird, dass der Zustand geteilt wird: Fehlversuche zählen über beide, Tickets
 * und Kennungen lassen sich beim anderen einlösen (genau einmal), Zeitpläne laufen nur in einem.
 * Nur mit TEST_DATABASE_URL (in einer eigenen Datenbank, #900).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import type postgres from 'postgres';
import { AbrufBremse, AbrufTickets } from '../src/abruf';
import { Anmeldesperre } from '../src/anmeldesperre';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { pgEinstellungen } from '../src/einstellungen';
import { PdfEntsperren } from '../src/entsperren';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { pgKontoRepo } from '../src/konto-repo';
import { hashe, lebenszeichen, pgKurzzustand, type Kurzzustand } from '../src/kurzzustand';
import { NotfallSperre } from '../src/notfallcode';
import { Oidc, type Abruf } from '../src/oidc';
import { PostfachOAuth, RueckrufFehler } from '../src/postfach-oauth';
import { pgRepo } from '../src/repo-pg';
import { Wartung } from '../src/wartung';
import { Ratenbegrenzung } from '../src/webdav-baum';
import { ausBase32, totp, Zweifaktor } from '../src/zweifaktor';
import { eigeneDatenbank } from './hilfe-db';

const url = process.env.TEST_DATABASE_URL;
const MIGRATIONEN = fileURLToPath(new URL('../migrations', import.meta.url));
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
/** „Verschlüsselung“ für Tests: umkehrbar, aber nicht der Klartext. */
const versch = (k: string) => `t:${Buffer.from(k).toString('base64')}`;
const entsch = (w: string) => (w.startsWith('t:') ? Buffer.from(w.slice(2), 'base64').toString() : null);

describe('Mehrere Prozesse an einer Datenbank (#744)', { skip: !url && 'ohne TEST_DATABASE_URL' }, () => {
  let sql: postgres.Sql;
  let H = '';
  /** Zwei Prozesse: je eigener Kurzzustand (eigene Instanz), dieselbe Datenbank. */
  let a: Kurzzustand, b: Kurzzustand;

  before(async () => {
    sql = (await eigeneDatenbank('mehrere_prozesse')).sql;
    H = randomUUID();
    await sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Test')`;
    a = pgKurzzustand(sql, H);
    b = pgKurzzustand(sql, H);
  });
  after(async () => { await sql?.end(); });

  it('Grundbausteine: atomar zählen, genau einmal einlösen und belegen, Ablauf und Aufräumen', async () => {
    // 40 gleichzeitige Zählungen aus zwei „Prozessen“: keine geht verloren.
    await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).zaehle('t-zaehler', 'x', 60_000)));
    assert.equal((await a.lies('t-zaehler', 'x'))!.anzahl, 40);
    // Einlösen: von vielen gleichzeitigen Versuchen gewinnt genau einer.
    await a.setze('t-ticket', 'k', { linkId: 'L' }, Date.now() + 60_000);
    const r = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).nimm('t-ticket', 'k')));
    assert.equal(r.filter(Boolean).length, 1);
    // Belegen: nur einer; nach Ablauf wieder frei.
    const bel = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).belege('t-belegt', 'k', 200)));
    assert.equal(bel.filter(Boolean).length, 1);
    await new Promise((ok) => setTimeout(ok, 250));
    assert.equal(await b.belege('t-belegt', 'k', 60_000), true, 'abgelaufen: wieder frei');
    const viele = await Promise.all([a.belegeAlle('t-viele', ['1', '2', '3'], 60_000), b.belegeAlle('t-viele', ['2', '3', '4'], 60_000)]);
    assert.deepEqual([...viele[0], ...viele[1]].sort(), ['1', '2', '3', '4'], 'jeder Schlüssel genau einmal');
    // Abgelaufenes zählt nicht und räumt der Lauf weg.
    await a.setze('t-alt', 'k', 1, Date.now() - 1);
    assert.equal(await b.lies('t-alt', 'k'), null);
    assert.ok((await b.raeumeAuf()) >= 1);
    assert.equal((await sql`SELECT count(*)::int AS n FROM kurzzustand WHERE art = 't-alt'`)[0].n, 0);
  });

  it('Zeitpläne: Datenbanksperre – derselbe Lauf nie in zwei Prozessen zugleich; Lebenszeichen', async () => {
    let lauf!: () => void;
    const haelt = new Promise<void>((ok) => { lauf = ok; });
    let n = 0;
    const erster = a.exklusiv('fristen', async () => { n++; await haelt; return 'a'; });
    await new Promise((ok) => setTimeout(ok, 50));
    assert.deepEqual(await b.exklusiv('fristen', async () => { n++; return 'b'; }), { ok: false }, 'der zweite Prozess läuft nicht');
    assert.deepEqual(await a.exklusiv('fristen', async () => { n++; return 'a2'; }), { ok: false }, 'auch nicht derselbe Prozess doppelt');
    assert.deepEqual(await b.exklusiv('papierkorb', async () => 'anderer Name'), { ok: true, wert: 'anderer Name' });
    lauf();
    assert.deepEqual(await erster, { ok: true, wert: 'a' });
    assert.deepEqual(await b.exklusiv('fristen', async () => 'b'), { ok: true, wert: 'b' }, 'danach wieder frei');
    assert.equal(n, 1);
    // Lebenszeichen: Der erste Prozess ist allein, der zweite nicht; nach dem Ende des ersten ist der nächste wieder allein.
    const p1 = await lebenszeichen(sql, H);
    const p2 = await lebenszeichen(sql, H);
    assert.deepEqual([p1.allein, p2.allein], [true, false]);
    await p1.ende(); await p2.ende();
    const p3 = await lebenszeichen(sql, H);
    assert.equal(p3.allein, true);
    await p3.ende();
  });

  it('Anmeldeschutz: Fehlversuche zählen über beide Prozesse, Sperren und Entsperren gelten überall', async () => {
    const e = pgEinstellungen(sql, H);
    const s1 = new Anmeldesperre(e, undefined, Date.now, a);
    const s2 = new Anmeldesperre(e, undefined, Date.now, b);
    await s1.speichere({ konto: { versuche: 4, minuten: 5 }, ip: { versuche: 10, minuten: 0 } }, 'test');
    // Je Konto: 2 + 2 Fehlversuche, gleichzeitig – die Sperre greift in beiden.
    await Promise.all([s1.fehlschlag('lena@example.org', '203.0.113.5'), s2.fehlschlag('lena@example.org', '203.0.113.5'), s1.fehlschlag('lena@example.org', '203.0.113.5'), s2.fehlschlag('lena@example.org', '203.0.113.5')]);
    await assert.rejects(s1.pruefe('lena@example.org', '203.0.113.5'), status(429));
    await assert.rejects(s2.pruefe('lena@example.org', '203.0.113.5'), status(429));
    // Je IP über alle Adressen: 10 Fehlversuche verteilt auf beide → dauerhaft gesperrt, sichtbar in beiden.
    await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? s1 : s2).fehlschlag(`jonas${i}@example.org`, '198.51.100.7')));
    await assert.rejects(s2.pruefe('neu@example.org', '198.51.100.7'), status(429));
    assert.deepEqual((await s1.gesperrt()).map((x) => [x.ip, x.bis]), [['198.51.100.7', null]]);
    assert.equal(await s2.entsperre('198.51.100.7', 'test'), true);
    await s1.pruefe('neu@example.org', '198.51.100.7');
    // Einstellung aus dem anderen Prozess gilt nach höchstens 10 Sekunden; nach dem Speichern dort sofort.
    await s2.speichere({ ausnahmen: ['203.0.113.0/24'] }, 'test');
    await s2.pruefe('lena@example.org', '203.0.113.5');
  });

  it('zweiter Anmeldeschritt und Zwei-Faktor einrichten: bei einem Prozess begonnen, beim anderen fertig – genau einmal', async () => {
    const repo = pgKontoRepo(sql, H);
    const konten = (z: Kurzzustand) => {
      const k = new Konten(repo, null, 'http://nas.example.org');
      k.verbindeZustand(z);
      k.verbindeSperre(new Anmeldesperre(pgEinstellungen(sql, H), undefined, Date.now, z));
      k.verbindeZweifaktor(new Zweifaktor(pgEinstellungen(sql, H), versch, entsch, Date.now, z));
      return k;
    };
    const k1 = konten(a), k2 = konten(b);
    // Anmeldeschutz weiter als die fünf Codeversuche je Kennung (der vorige Test stellte ihn enger).
    await k1.sperre.speichere({ konto: { versuche: 20, minuten: 5 } }, 'test');
    const { benutzer: lena } = await k1.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    // Einrichten: Schritt 1 in Prozess 1, Schritt 2 in Prozess 2. Das Geheimnis liegt nur verschlüsselt in der Datenbank.
    const { geheimnis } = await k1.zweifaktor!.beginne(lena);
    const roh = JSON.stringify(await sql`SELECT wert FROM kurzzustand WHERE art = 'zweifaktor-entwurf'`);
    assert.ok(!roh.includes(geheimnis.replace(/\s/g, '')), 'nicht im Klartext');
    const g = ausBase32(geheimnis.replace(/\s/g, ''));
    // Nicht kurz vor dem Fensterwechsel beginnen: sonst ist `schritt - 1` beim Prüfen schon zwei Fenster alt.
    const rest = 30_000 - (Date.now() % 30_000);
    if (rest < 5_000) await new Promise((fertig) => setTimeout(fertig, rest + 50));
    const schritt = Math.floor(Date.now() / 30_000);
    await k2.zweifaktor!.bestaetige(lena.id, totp(g, schritt - 1), 'test');
    await assert.rejects(k1.zweifaktor!.bestaetige(lena.id, totp(g, schritt - 1), 'test'), status(409), 'Entwurf nur einmal');
    // Anmelden: Passwort bei Prozess 1, Code bei Prozess 2.
    const r = await k1.anmelden({ email: 'lena@example.org', passwort: 'ein-langes-passwort' }, '192.0.2.1');
    assert.ok('zweiterSchritt' in r && typeof r.zweiterSchritt === 'string');
    const kennung = (r as { zweiterSchritt: string }).zweiterSchritt;
    assert.equal((await sql`SELECT count(*)::int AS n FROM kurzzustand WHERE art = 'zweiter-schritt' AND schluessel = ${hashe(kennung)}`)[0].n, 1, 'nur der Hash');
    // Derselbe Code gleichzeitig bei beiden Prozessen: genau eine Sitzung.
    const code = totp(g, schritt);
    const beide = await Promise.allSettled([k2.anmeldenMitCode({ kennung, code }, '192.0.2.1'), k1.anmeldenMitCode({ kennung, code }, '192.0.2.1')]);
    assert.equal(beide.filter((x) => x.status === 'fulfilled').length, 1);
    await assert.rejects(k2.anmeldenMitCode({ kennung, code: totp(g, schritt + 1) }, '192.0.2.1'), status(401), 'Kennung verbraucht');
    // Fünf falsche Codes, verteilt auf beide Prozesse: danach gilt die Kennung nicht mehr.
    const r2 = await k2.anmelden({ email: 'lena@example.org', passwort: 'ein-langes-passwort' }, '192.0.2.2') as { zweiterSchritt: string };
    for (let i = 0; i < 5; i++) await assert.rejects((i % 2 ? k1 : k2).anmeldenMitCode({ kennung: r2.zweiterSchritt, code: '000000' }, '192.0.2.2'), status(401));
    assert.equal((await sql`SELECT count(*)::int AS n FROM kurzzustand WHERE art = 'zweiter-schritt' AND schluessel = ${hashe(r2.zweiterSchritt)}`)[0].n, 0);
  });

  it('Abrufseite: Ticket bei einem Prozess ausgestellt, beim anderen genau einmal eingelöst; Fehlversuche je Bereich über beide', async () => {
    const t1 = new AbrufTickets(Date.now, a), t2 = new AbrufTickets(Date.now, b);
    const ticket = await t1.stelleAus('L1');
    assert.equal((await sql`SELECT count(*)::int AS n FROM kurzzustand WHERE schluessel = ${ticket}`)[0].n, 0, 'nur der Hash');
    const r = await Promise.all([t2.loese(ticket), t1.loese(ticket)]);
    assert.deepEqual(r.filter(Boolean), ['L1']);
    const b1 = new AbrufBremse({ fehlerMax: 4, zustand: a }), b2 = new AbrufBremse({ fehlerMax: 4, zustand: b });
    await Promise.all([b1.fehlschlag('203.0.113.9'), b2.fehlschlag('203.0.113.9'), b1.fehlschlag('203.0.113.9')]);
    assert.equal(await b2.gesperrt('203.0.113.9'), false);
    await b2.fehlschlag('203.0.113.9');
    assert.equal(await b1.gesperrt('203.0.113.9'), true);
  });

  it('OIDC: Anmeldung bei einem Prozess begonnen, Rückkehr beim anderen – state nur gehasht, Werte verschlüsselt, genau einmal', async () => {
    const ISS = 'https://login.example.org/t';
    const abruf: Abruf = async (u) => ({ ok: true, status: 200, json: async () => (u.endsWith('openid-configuration') ? { issuer: ISS, authorization_endpoint: 'https://login.example.org/authorize', token_endpoint: 'https://login.example.org/token', jwks_uri: 'https://login.example.org/keys' } : {}), text: async () => '' });
    const o = (z: Kurzzustand) => new Oidc({ einstellungen: pgEinstellungen(sql, H), verschluessele: versch, entschluessele: entsch, abruf, zustand: z });
    const o1 = o(a), o2 = o(b);
    await o1.speichere({ aktiv: true, aussteller: ISS, clientId: 'ablago' }, 'test');
    const { url: adresse, bindung } = await o1.start('https://dms.example.org/api/oidc/rueckkehr');
    const state = new URL(adresse).searchParams.get('state')!;
    const zeilen = JSON.stringify(await sql`SELECT schluessel, wert FROM kurzzustand WHERE art = 'oidc-anmeldung'`);
    assert.ok(!zeilen.includes(state) && !zeilen.includes(bindung), 'weder state noch Bindung im Klartext');
    // Prozess 2 kennt die Anmeldung (falscher Browser statt „abgelaufen“) …
    await assert.rejects(o2.rueckkehr({ state, code: 'c' }, 'falsch'), /anderen Browser/);
    // … und sie gilt danach nirgends mehr.
    await assert.rejects(o1.rueckkehr({ state, code: 'c' }, bindung), /abgelaufen/);
  });

  it('Postfach-OAuth: Rückruf beim anderen Prozess, state genau einmal', async () => {
    const p = (z: Kurzzustand) => new PostfachOAuth({ einstellungen: pgEinstellungen(sql, H), verschluessele: versch, entschluessele: entsch, zustand: z });
    const p1 = p(a), p2 = p(b);
    await p1.speichereApp('microsoft', { clientId: 'app-1', tenant: 'common' }, 'test');
    const { url: adresse, bindung } = await p1.start({ id: 'pf1', anbieter: 'microsoft', benutzer: 'post@example.org' }, { id: 'admin-1', email: 'markus@example.org' }, 'https://dms.example.org/api/oauth/rueckruf');
    const state = new URL(adresse).searchParams.get('state')!;
    // Prozess 2 findet die Anmeldung (andere Person statt „abgelaufen“) …
    await assert.rejects(p2.rueckruf({ state, code: 'c' }, { id: 'admin-2' }, bindung), (e) => e instanceof RueckrufFehler && e.code === 'admin' && e.postfachId === 'pf1');
    // … und danach ist sie verbraucht.
    await assert.rejects(p1.rueckruf({ state, code: 'c' }, { id: 'admin-1' }, bindung), (e) => e instanceof RueckrufFehler && e.code === 'abgelaufen');
  });

  it('WebDAV: das Zählfenster gilt über beide Prozesse', async () => {
    const r1 = new Ratenbegrenzung(3, Date.now, 60_000, a), r2 = new Ratenbegrenzung(3, Date.now, 60_000, b);
    const erg = await Promise.all([r1.pruefe('jonas'), r2.pruefe('jonas'), r1.pruefe('jonas'), r2.pruefe('jonas')]);
    assert.equal(erg.filter((x) => x.ok).length, 3, 'höchstens die Grenze, egal bei welchem Prozess');
    assert.equal((await r1.pruefe('petra')).ok, true, 'andere Benutzer eigenes Fenster');
  });

  it('Geschützte PDFs: Fehlversuche und Bestätigung für Dokument-Passwörter gelten in beiden Prozessen', async () => {
    const e = (z: Kurzzustand) => new PdfEntsperren({ ablage: {} as never, datei: async () => Buffer.alloc(0), dokumenteMitSha: async () => [], zustand: z });
    const e1 = e(a), e2 = e(b);
    const falsch = async () => { throw new Fachfehler(403, 'Das Passwort stimmt nicht.'); };
    for (let i = 0; i < 5; i++) await assert.rejects((i % 2 ? e1 : e2).bestaetige('katrin', 's1', falsch), status(403));
    await assert.rejects(e1.bestaetige('katrin', 's1', async () => {}), status(429), 'nach 5 Fehlversuchen über beide gesperrt');
    await e1.bestaetige('petra', 'sitzung-p', async () => {});
    assert.ok(await e2.bestaetigtBis('sitzung-p'), 'Bestätigung gilt auch im anderen Prozess');
    await e2.pruefeBestaetigt('sitzung-p');
    assert.equal((await sql`SELECT count(*)::int AS n FROM kurzzustand WHERE schluessel = 'sitzung-p'`)[0].n, 0, 'Sitzung nur als Hash');
  });

  it('Notfallzugang: Sperre je Adressbereich und „höchstens eine Prüfung gleichzeitig“ über beide Prozesse', async () => {
    const n1 = new NotfallSperre(Date.now, a), n2 = new NotfallSperre(Date.now, b);
    await n1.fehlschlag('192.168.5.0');
    assert.ok((await n2.rest('192.168.5.0')) > 0);
    const frei = await n1.belege('192.168.6.0');
    assert.ok(frei);
    assert.equal(await n2.belege('192.168.6.0'), null, 'der andere Prozess wartet');
    await frei!();
    assert.ok(await n2.belege('192.168.6.0'));
  });

  it('Spur im Verwaltungsmodus (#820): „kurz hintereinander nur einmal“ gilt über beide Prozesse', async () => {
    const d1 = new Dienst(pgRepo(sql, H), speicherDateien(), { einstellungen: pgEinstellungen(sql, H), zustand: a });
    const d2 = new Dienst(pgRepo(sql, H), speicherDateien(), { einstellungen: pgEinstellungen(sql, H), zustand: b });
    const lena = randomUUID(), m = randomUUID();
    // Derselbe Merker, den vermerkeVerwaltungsmodus setzt: Person|Mappe|Art.
    const [m1, m2] = await Promise.all([d1.kurzzustand.belegeAlle('modusspur', [`${lena}|${m}|angesehen`], 600_000), d2.kurzzustand.belegeAlle('modusspur', [`${lena}|${m}|angesehen`], 600_000)]);
    assert.equal(m1.size + m2.size, 1, 'nur ein Prozess schreibt den Eintrag');
    assert.equal(await d2.kurzzustand.belege('modusspur', `${lena}|${m}|geaendert`, 600_000), true, 'andere Art: eigener Merker');
  });

  it('Wartungsmodus: im einen Prozess eingeschaltet, im anderen beim nächsten Prüfen aktiv – und wieder aus', async () => {
    const konten = { beendeAlleSitzungenAusser: async () => 0 };
    const w1 = new Wartung(pgEinstellungen(sql, H), konten), w2 = new Wartung(pgEinstellungen(sql, H), konten);
    await w1.laden(); await w2.laden();
    let angestossen = 0;
    w2.beimAusschalten(() => { angestossen++; });
    await w1.einschalten({ vorlauf: 0 }, { email: 'markus@example.org' }, null);
    await w2.pruefe();
    assert.equal(w2.aktiv, true);
    await w1.ausschalten('markus@example.org');
    await w2.pruefe();
    assert.equal(w2.aktiv, false);
    assert.equal(angestossen, 1, 'Hintergrundarbeiten im anderen Prozess wieder angestoßen');
  });

  it('Migration 078: bisherige Sperren des Anmeldeschutzes kommen in den Kurzzustand', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'a744-'));
    try {
      const vor = join(ordner, 'vor');
      await mkdir(vor);
      for (const f of (await readdir(MIGRATIONEN)).filter((x) => x.endsWith('.sql') && x < '078')) await cp(join(MIGRATIONEN, f), join(vor, f));
      const { migriere } = await import('../src/db');
      // Eigene Datenbank auf dem Stand vor 078 (#900) – die der übrigen Fälle bleibt unberührt.
      const db = await eigeneDatenbank('mehrere_prozesse_078', { migrieren: false });
      const sql = db.sql;
      await migriere(sql, vor, () => {});
      const h = '00000000-0000-4000-8000-000000000001';
      const bis = Date.now() + 60_000;
      await sql`INSERT INTO einstellungen (haushalt_id, schluessel, wert) VALUES (${h}, 'anmeldesperren', ${sql.json({ ips: [{ ip: '203.0.113.1', seit: '2026-11-01T10:00:00.000Z', bis: null, grund: 'Test' }], konten: { 'lena@example.org|203.0.113.2': { anzahl: 5, bis } } })})`;
      await migriere(sql, MIGRATIONEN, () => {});
      const z = pgKurzzustand(sql, h);
      const s = new Anmeldesperre(pgEinstellungen(sql, h), undefined, Date.now, z);
      assert.deepEqual((await s.gesperrt()).map((x) => [x.ip, x.bis, x.grund]), [['203.0.113.1', null, 'Test']]);
      await assert.rejects(s.pruefe('lena@example.org', '203.0.113.2'), status(429));
      assert.equal(await pgEinstellungen(sql, h).lies('anmeldesperren'), null);
      await db.ende();
    } finally { await rm(ordner, { recursive: true, force: true }); }
  });
});
