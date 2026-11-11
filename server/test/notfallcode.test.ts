/**
 * Notfallzugang mit dem Notfallcode vom Notfallblatt (#815) und „Dein Konto“ samt Empfehlung einer zweiten Person mit
 * Verwaltungsrecht (#821). Bauvorgaben von Sicherheit: Code nur als Hash, einmal gültig (auch bei zwei gleichzeitigen
 * Anfragen), „nur Heimnetz“ hinter einem Reverse Proxy, 30 s Sperre je Adressbereich, Benachrichtigung vorher.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { NOTFALLCODE_LAENGE, NOTFALLCODE_ZEICHEN, normiereNotfallcode, notfallcodeInGruppen } from '../../shared/src/notfallcode';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { pgKontoRepo, speicherKontoRepo, type KontoRepo } from '../src/konto-repo';
import type { Mailer } from '../src/mail';
import { notfallblattPlan } from '../src/notfallblatt';
import { FEHLVERSUCHE_MELDEN, heimnetzStand, istHeimnetz, istPrivat, Notfallcode, NotfallSperre } from '../src/notfallcode';
import { protokoll } from '../src/protokoll';
import { speicherRepo } from '../src/repo-speicher';
import { routen, ZWEITE_ABGELEHNT, type Anfrage } from '../src/routen';
import { heikleHandlung } from '../src/verwaltungsbereiche';
import { Zweifaktor } from '../src/zweifaktor';
import { imModus } from './hilfen';
import { eigeneDatenbank } from './hilfe-db';

const PW = 'ein-langes-passwort';
const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const HEIM = { ip: '192.168.1.20' };
const kopf = (k: Record<string, string>) => (n: string) => k[n];

interface Post { an: string; betreff: string; text: string; hashVorher?: string | null }

async function aufbau(o: { repo?: KontoRepo; mitMail?: boolean } = {}) {
  const repo = o.repo ?? speicherKontoRepo();
  const einstellungen = speicherEinstellungen();
  const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen });
  const konten = new Konten(repo, null, 'http://nas', d.systemtypen.benutzerspiegel());
  const zf = new Zweifaktor(speicherEinstellungen(), (k) => `v:${k}`, (w) => (w.startsWith('v:') ? w.slice(2) : null));
  konten.verbindeZweifaktor(zf);
  const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: PW });
  const neu = async (email: string, name: string) => {
    const r = await konten.legeBenutzerAn({ email, name }, lena.id);
    await konten.passwortSetzen({ schluessel: r.link!.split('/passwort/')[1], passwort: PW });
    return r.benutzer;
  };
  const jonas = await neu('jonas@example.org', 'Jonas');
  const petra = await neu('petra@example.org', 'Petra');
  await konten.setzeVerwaltung(imModus(lena), jonas.id, ['benutzer']);
  const post: Post[] = [];
  // Beim Versand merken, welches Passwort noch gilt – die Meldung muss vor jeder Änderung hinausgehen.
  const mailer: Mailer = { async sende(an, betreff, text) { post.push({ an, betreff, text, hashVorher: (await repo.holeHash(lena.email))?.hash }); } };
  let jetzt = Date.parse('2026-11-05T10:00:00Z');
  let benutzt = 0;
  const n = new Notfallcode({
    konten, einstellungen, mailer: () => (o.mitMail === false ? null : mailer), proxy: ['loopback', 'linklocal', 'uniquelocal'],
    apiSchluessel: async (id) => (id === lena.id ? 2 : 0), codeBenutzt: async () => { benutzt++; }, jetzt: () => jetzt,
  });
  return { repo, konten, zf, n, lena, jonas, petra, post, einstellungen, d, uhr: (ms: number) => { jetzt += ms; }, benutzt: () => benutzt };
}

describe('Notfallcode (#815): Format und Speicherung', () => {
  it('28 Zeichen aus 32 gut unterscheidbaren (ohne 0/O, 1/I), also 140 Bit; Eingabe ohne Groß-/Kleinschreibung und Trennzeichen', async () => {
    assert.equal(NOTFALLCODE_ZEICHEN.length, 32);
    assert.ok(!/[01OI]/.test(NOTFALLCODE_ZEICHEN));
    assert.ok(NOTFALLCODE_LAENGE * Math.log2(NOTFALLCODE_ZEICHEN.length) >= 128);
    const { konten } = await aufbau();
    const c = await konten.neuerNotfallcode();
    assert.equal(c.length, NOTFALLCODE_LAENGE);
    assert.ok([...c].every((z) => NOTFALLCODE_ZEICHEN.includes(z)));
    const g = notfallcodeInGruppen(c);
    assert.match(g, /^([2-9A-HJ-NP-Z]{4}-){6}[2-9A-HJ-NP-Z]{4}$/);
    assert.equal(normiereNotfallcode(` ${g.toLowerCase().replaceAll('-', ' ')} `), c);
    assert.equal(normiereNotfallcode('O'.repeat(28)), null, 'O gibt es nicht');
    assert.equal(normiereNotfallcode(c.slice(1)), null);
    assert.notEqual(await konten.neuerNotfallcode(), c, 'jedes Blatt ein neuer Code');
  });

  it('nur der Hash liegt in der Datenbank; ein neues Blatt macht den alten Code ungültig', async () => {
    const { konten, repo } = await aufbau();
    const alt = await konten.neuerNotfallcode();
    const h = await repo.notfallcode();
    assert.ok(h && h.hash.startsWith('scrypt$') && !h.hash.includes(alt));
    assert.ok(await konten.pruefeNotfallcode(alt));
    const neu = await konten.neuerNotfallcode();
    assert.equal(await konten.pruefeNotfallcode(alt), null);
    assert.ok(await konten.pruefeNotfallcode(notfallcodeInGruppen(neu).toLowerCase()));
    assert.equal(await konten.pruefeNotfallcode('kein code'), null);
  });

  it('auf dem Notfallblatt: Code in Vierergruppen und die eigene Adresse mit /notfall', () => {
    const d = { name: 'Familie Beispiel', haushaltId: 'x', version: '0.192.0', erstellt: new Date(), schluessel: 'A'.repeat(43), fingerabdruck: 'f' };
    const p = notfallblattPlan({ ...d, adresse: 'https://ablage.example.org/', notfallcode: 'ABCDEFGHJKLMNPQRSTUVWXYZ2345' });
    assert.equal(p.notfall?.code, 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345');
    assert.deepEqual(p.notfall?.adresse, { text: 'https://ablage.example.org/notfall', link: 'https://ablage.example.org/notfall' });
    assert.match(p.notfall!.hinweis, /einmal/);
    assert.deepEqual(notfallblattPlan({ ...d, adresse: 'http://nas.home.arpa:8080', notfallcode: 'ABCDEFGHJKLMNPQRSTUVWXYZ2345' }).notfall?.adresse, { text: 'nas.home.arpa:8080/notfall' }, 'ohne https: nicht klickbar, ohne http://');
    assert.equal(notfallblattPlan({ ...d, adresse: '' }).notfall, null);
  });
});

describe('Notfallzugang (#815): nur aus dem Heimnetz – auch hinter einem Reverse Proxy', () => {
  const AUTO = ['loopback', 'linklocal', 'uniquelocal'];
  it('private Netze gelten als Heimnetz, öffentliche nicht', () => {
    for (const ip of ['192.168.1.2', '10.0.0.9', '172.20.1.1', '127.0.0.1', '::1', 'fd12:3456::1', 'fe80::1', '::ffff:192.168.0.5']) assert.ok(istPrivat(ip), ip);
    for (const ip of ['203.0.113.7', '2001:db8::1', '172.32.0.1', '100.64.0.1', '', 'kaputt']) assert.ok(!istPrivat(ip), ip);
  });

  it('mit vertrauenswürdigem Proxy gilt die echte Adresse aus X-Forwarded-For (die Ablago daraus bestimmt hat)', () => {
    // Fastify hat a.ip schon aus X-Forwarded-For bestimmt (TRUST_PROXY = auto).
    assert.equal(istHeimnetz({ ip: '203.0.113.7', kopf: kopf({ 'x-forwarded-for': '203.0.113.7' }) }, AUTO), false, 'aus dem Internet über den Proxy');
    assert.equal(istHeimnetz({ ip: '192.168.1.20', kopf: kopf({ 'x-forwarded-for': '192.168.1.20' }) }, AUTO), true, 'aus dem Heimnetz über den Proxy');
    assert.equal(istHeimnetz({ ip: '192.168.1.20', kopf: kopf({}) }, AUTO), true, 'ohne Proxy direkt');
  });

  it('kommt eine Proxy-Angabe an, obwohl kein Proxy eingetragen ist, gilt die Anfrage als „nicht Heimnetz“', () => {
    // TRUST_PROXY=false: Fastify nimmt die Adresse des Proxys (privat) – ohne diese Regel wäre /notfall aus dem Internet offen.
    assert.equal(istHeimnetz({ ip: '172.18.0.3', kopf: kopf({ 'x-forwarded-for': '203.0.113.7' }) }, false), false);
    assert.equal(istHeimnetz({ ip: '172.18.0.3', kopf: kopf({ 'x-real-ip': '203.0.113.7' }) }, false), false);
    assert.equal(istHeimnetz({ ip: '172.18.0.3', kopf: kopf({ forwarded: 'for=203.0.113.7' }) }, undefined), false);
    assert.equal(istHeimnetz({ ip: '172.18.0.3', kopf: kopf({}) }, false), true, 'ohne Proxy-Angabe zählt die Gegenstelle');
    // TRUST_PROXY=true: Die Angabe könnte jeder setzen.
    assert.equal(istHeimnetz({ ip: '192.168.1.20', kopf: kopf({ 'x-forwarded-for': '192.168.1.20' }) }, true), false);
    // Nur Köpfe, die Ablago nicht auswertet: lieber nicht.
    assert.equal(istHeimnetz({ ip: '172.18.0.3', kopf: kopf({ 'x-real-ip': '192.168.1.20' }) }, AUTO), false);
  });

  it('#885: die Werkbank erfährt, warum „nicht Heimnetz“ – öffentliche Adresse oder nicht geglaubte Proxy-Angabe', () => {
    // Zu Hause über den öffentlichen Namen (Hairpin-NAT): der Proxy gibt die öffentliche Adresse weiter, Ablago glaubt ihm.
    assert.deepEqual(heimnetzStand({ ip: '203.0.113.7', kopf: kopf({ 'x-forwarded-for': '203.0.113.7' }) }, AUTO), { heimnetz: false, grund: 'oeffentlich' });
    assert.deepEqual(heimnetzStand({ ip: '198.51.100.4', kopf: kopf({}) }, false), { heimnetz: false, grund: 'oeffentlich' }, 'ohne Proxy, öffentlich');
    // Proxy-Angabe nicht geglaubt: TRUST_PROXY=false, =true, nicht gesetzt oder nur Forwarded/X-Real-IP.
    assert.deepEqual(heimnetzStand({ ip: '172.18.0.3', kopf: kopf({ 'x-forwarded-for': '192.168.1.20' }) }, false), { heimnetz: false, grund: 'proxy' });
    assert.deepEqual(heimnetzStand({ ip: '192.168.1.20', kopf: kopf({ 'x-forwarded-for': '192.168.1.20' }) }, true), { heimnetz: false, grund: 'proxy' });
    assert.deepEqual(heimnetzStand({ ip: '172.18.0.3', kopf: kopf({ forwarded: 'for=192.0.2.9' }) }, undefined), { heimnetz: false, grund: 'proxy' });
    assert.deepEqual(heimnetzStand({ ip: '172.18.0.3', kopf: kopf({ 'x-real-ip': '192.168.1.20' }) }, AUTO), { heimnetz: false, grund: 'proxy' });
    assert.deepEqual(heimnetzStand({ ip: '172.18.0.3', kopf: kopf({ forwarded: 'for=192.0.2.9' }) }, AUTO), { heimnetz: false, grund: 'proxy' });
    // Im Heimnetz: kein Grund, nichts weiter.
    assert.deepEqual(heimnetzStand({ ip: '192.168.1.20', kopf: kopf({ 'x-forwarded-for': '192.168.1.20' }) }, AUTO), { heimnetz: true });
    assert.deepEqual(heimnetzStand({ ip: '192.168.1.20', kopf: kopf({}) }, false), { heimnetz: true });
    // Die Prüfung selbst ist unverändert istHeimnetz.
    for (const [ip, k, v] of [['203.0.113.7', { 'x-forwarded-for': '203.0.113.7' }, AUTO], ['172.18.0.3', { 'x-real-ip': '1.2.3.4' }, AUTO], ['10.0.0.2', {}, false]] as const) {
      assert.equal(heimnetzStand({ ip, kopf: kopf(k) }, v as never).heimnetz, istHeimnetz({ ip, kopf: kopf(k) }, v as never));
    }
  });

  it('aus dem Internet erst, wenn es in der Werkbank erlaubt ist – mit frischer Anmeldung (heikle Handlung)', async () => {
    const { n, konten } = await aufbau();
    await konten.neuerNotfallcode();
    const aussen = { ip: '203.0.113.7' };
    assert.deepEqual(await n.stand(aussen), { erlaubt: false, warten: 0 });
    await assert.rejects(n.pruefe(aussen, 'x'), status(403));
    await n.setzeEinstellung({ internet: true }, 'lena@example.org');
    assert.equal((await n.stand(aussen)).erlaubt, true);
    assert.equal(heikleHandlung('PUT', '/api/werkbank/anmeldeschutz/notfallzugang', { internet: true }), 'notfall');
    assert.equal(heikleHandlung('PUT', '/api/werkbank/anmeldeschutz/notfallzugang', { internet: false }), null, 'zurück auf „nur Heimnetz“ ohne');
  });
});

describe('Notfallzugang (#815): 30 Sekunden Sperre je Adressbereich, gebündelte Meldung', () => {
  it('jede Fehleingabe sperrt den Bereich 30 s mit Restzeit; andere Bereiche bleiben frei; IPv6 je /64', async () => {
    const { n, konten, uhr } = await aufbau();
    const code = await konten.neuerNotfallcode();
    await assert.rejects(n.pruefe(HEIM, 'A'.repeat(28)), (e: unknown) => e instanceof Fachfehler && e.status === 403 && e.message === 'Der Notfallcode war falsch.' && (e.details as { warten: number }).warten === 30);
    assert.equal((await n.stand(HEIM)).warten, 30, 'Countdown nach Neuladen');
    // Auch der richtige Code geht erst nach Ablauf der Sperre.
    await assert.rejects(n.pruefe(HEIM, code), (e: unknown) => e instanceof Fachfehler && e.status === 429 && (e.details as { warten: number }).warten === 30);
    uhr(12_000);
    assert.equal((await n.stand(HEIM)).warten, 18);
    // Fremde Fehlversuche sperren Lena nicht aus: anderer Bereich, eigene Uhr.
    assert.equal((await n.pruefe({ ip: '192.168.1.21' }, code)).konten.length, 2);
    uhr(18_000);
    assert.equal((await n.stand(HEIM)).warten, 0);
    assert.ok((await n.pruefe(HEIM, code)).konten.length);
    // IPv6: dieselbe /64 ist ein Bereich.
    await assert.rejects(n.pruefe({ ip: 'fd00:1:2:3::10' }, 'x'), status(403));
    await assert.rejects(n.pruefe({ ip: 'fd00:1:2:3::99' }, code), status(429));
    assert.ok((await n.pruefe({ ip: 'fd00:1:2:4::10' }, code)).konten.length);
  });

  it('höchstens eine Prüfung gleichzeitig je Bereich – parallele Anfragen kommen nicht an der Sperre vorbei', async () => {
    const s = new NotfallSperre(() => 0);
    const frei = await s.belege('a');
    assert.ok(frei);
    assert.equal(await s.belege('a'), null);
    assert.ok(await s.belege('b'));
    await frei!();
    assert.ok(await s.belege('a'));
  });

  it('viele Fehlversuche: eine gebündelte Meldung an alle mit Verwaltungsrecht, höchstens einmal je Stunde; Protokoll mit gekürzter Adresse', async () => {
    const { n, konten, post, uhr } = await aufbau();
    await konten.neuerNotfallcode();
    const vorher = protokoll.letzteNr;
    for (let i = 0; i < FEHLVERSUCHE_MELDEN + 3; i++) await assert.rejects(n.pruefe({ ip: `192.168.7.${i + 1}` }, 'falsch'), status(403));
    const m = post.filter((p) => /Fehlversuche/.test(p.betreff));
    assert.deepEqual(m.map((p) => p.an).sort(), ['jonas@example.org', 'lena@example.org'], 'alle mit Verwaltungsrecht, nicht Petra');
    assert.match(m[0].text, /5-mal ein falscher Notfallcode/);
    uhr(61 * 60_000);
    for (let i = 0; i < FEHLVERSUCHE_MELDEN; i++) await assert.rejects(n.pruefe({ ip: `192.168.8.${i + 1}` }, 'falsch'), status(403));
    assert.equal(post.filter((p) => /Fehlversuche/.test(p.betreff)).length, 4, 'nach einer Stunde wieder');
    const e = protokoll.eintraege({ seit: vorher }).filter((x) => x.text === 'Notfallzugang: falscher Notfallcode');
    assert.ok(e.length >= FEHLVERSUCHE_MELDEN);
    assert.ok(e.some((x) => x.daten?.ip === '192.168.7.0') && e.every((x) => !/192\.168\.7\.[1-9]/.test(String(x.daten?.ip))), 'IP nur gekürzt');
  });
});

describe('Notfallzugang (#815): Konto wählen, Passwort setzen, einmal gültig', () => {
  it('die Konten erst nach richtigem Code – nur aktive Personen mit Verwaltungsrecht', async () => {
    const { n, konten } = await aufbau();
    const code = await konten.neuerNotfallcode();
    const r = await n.pruefe(HEIM, code);
    assert.deepEqual(r.konten.map((k) => k.name).sort(), ['Jonas', 'Lena']);
    await assert.rejects(n.pruefe({ ip: '192.168.2.2' }, 'falsch'), (e: unknown) => e instanceof Fachfehler && !JSON.stringify(e.details ?? {}).includes('Lena'), 'verrät vorher keine Namen');
  });

  it('Meldung zuerst (bisherige Adresse und alle Verwaltenden), dann neues Passwort, Sitzungen weg, Zwei-Faktor zurück; der Code gilt danach nicht mehr', async () => {
    const { n, konten, repo, zf, lena, post, benutzt } = await aufbau();
    // Lena hat Zwei-Faktor und ist angemeldet.
    const e = await zf.beginne(lena, 'Ablago');
    const { totp, ausBase32 } = await import('../src/zweifaktor');
    await zf.bestaetige(lena.id, totp(ausBase32(e.geheimnis), Math.floor(Date.now() / 30_000)), 'test');
    const hashVorher = (await repo.holeHash(lena.email))!.hash;
    const code = await konten.neuerNotfallcode();
    await konten.anmelden({ email: lena.email, passwort: PW }, '192.168.1.5');
    const vorher = protokoll.letzteNr;
    await assert.rejects(n.einloesen(HEIM, { code, konto: lena.id, passwort: 'kurz' }), status(422));
    assert.equal(post.length, 0, 'ein zu kurzes Passwort löst keine Meldung aus');
    await assert.rejects(n.einloesen({ ip: '192.168.3.3' }, { code, konto: (await konten.listeBenutzer()).find((b) => b.name === 'Petra')!.id, passwort: 'ein-neues-passwort' }), status(404), 'nur Personen mit Verwaltungsrecht');
    const r = await n.einloesen(HEIM, { code, konto: lena.id, passwort: 'ein-neues-passwort' });
    assert.equal(r.email, 'lena@example.org');
    const meldung = post.filter((p) => /Notfallzugang wurde benutzt/.test(p.betreff));
    assert.deepEqual(meldung.map((p) => p.an).sort(), ['jonas@example.org', 'lena@example.org']);
    assert.ok(meldung.every((p) => p.hashVorher === hashVorher), 'verschickt, bevor sich das Passwort änderte');
    assert.match(meldung[0].text, /am .*2026.*\(Konto Lena, lena@example\.org\)/);
    assert.match(meldung[0].text, /Die 2 API-Schlüssel des Kontos bleiben gültig/);
    // Danach: neues Passwort, keine Sitzung, kein Zwei-Faktor, Notfallblatt veraltet.
    assert.notEqual((await repo.holeHash(lena.email))!.hash, hashVorher);
    assert.equal((await repo.listeSitzungen(lena.id)).length, 0);
    assert.equal(await zf.aktiv(lena.id), false);
    assert.equal(benutzt(), 1);
    const an = await konten.anmelden({ email: lena.email, passwort: 'ein-neues-passwort' }, '192.168.1.5');
    assert.ok('schluessel' in an, 'Anmelden ohne Code – Zwei-Faktor neu einrichten');
    assert.equal((await repo.notfallcode()), null, 'der Code gilt nicht mehr');
    await assert.rejects(n.einloesen({ ip: '192.168.4.4' }, { code, konto: lena.id, passwort: 'noch-ein-passwort' }), status(403));
    assert.ok(protokoll.eintraege({ seit: vorher }).some((x) => x.text === 'Notfallzugang benutzt: neues Passwort mit dem Notfallcode' && x.daten?.konto === 'lena@example.org'));
    // Hinweis in der Werkbank, bis jemand mit „Gesamte Verwaltung“ ihn als gelesen markiert.
    const offen = await n.offen();
    assert.deepEqual(offen.map((x) => x.email), ['lena@example.org']);
    await assert.rejects(n.gelesen(offen[0].id, imModus((await konten.listeBenutzer()).find((b) => b.name === 'Jonas')!)), status(403));
    await n.gelesen(offen[0].id, imModus(lena));
    assert.deepEqual(await n.offen(), []);
  });

  it('ohne E-Mail-Versand geht es trotzdem (Lena allein zu Hause) – mit Eintrag im Protokoll', async () => {
    const { n, konten, lena } = await aufbau({ mitMail: false });
    const code = await konten.neuerNotfallcode();
    const vorher = protokoll.letzteNr;
    await n.einloesen(HEIM, { code, konto: lena.id, passwort: 'ein-neues-passwort' });
    assert.ok(protokoll.eintraege({ seit: vorher }).some((x) => /niemand wurde benachrichtigt/.test(x.text)));
  });

  it('das neue Notfallblatt: einmal erzeugt, danach dasselbe, nur mit dem Schlüssel aus dem Einlösen', async () => {
    const { n, konten, lena } = await aufbau();
    const code = await konten.neuerNotfallcode();
    const r = await n.einloesen(HEIM, { code, konto: lena.id, passwort: 'ein-neues-passwort' });
    let erzeugt = 0;
    const erzeuge = async (von: string) => { erzeugt++; assert.equal(von, 'Notfallzugang (Lena)'); await konten.neuerNotfallcode(); return Buffer.from(`pdf${erzeugt}`); };
    assert.equal(String(await n.blatt(r.blatt, erzeuge)), 'pdf1');
    assert.equal(String(await n.blatt(r.blatt, erzeuge)), 'pdf1');
    assert.equal(erzeugt, 1);
    await assert.rejects(n.blatt('falsch', erzeuge), status(410));
    assert.ok(await konten.notfallcodeStand().then((s) => s.vorhanden), 'mit dem neuen Blatt ein neuer Code');
  });

  it('zwei gleichzeitige Anfragen mit demselben Code: nur eine gewinnt (Arbeitsspeicher)', async () => {
    const { n, konten, lena, jonas } = await aufbau();
    const code = await konten.neuerNotfallcode();
    const r = await Promise.allSettled([
      n.einloesen({ ip: '192.168.5.1' }, { code, konto: lena.id, passwort: 'passwort-von-a1' }),
      n.einloesen({ ip: '192.168.5.2' }, { code, konto: jonas.id, passwort: 'passwort-von-b2' }),
    ]);
    assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('Notfallcode gegen PostgreSQL (#815): Einlösen in einer Transaktion', { skip: !url && 'ohne TEST_DATABASE_URL' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let sql: any;
  after(async () => { await sql?.end(); });
  it('nur der Hash in der Tabelle; zwei gleichzeitige Einlösungen – genau eine setzt das Passwort', async () => {
    sql = (await eigeneDatenbank('notfallcode')).sql;
    const repo = pgKontoRepo(sql, '00000000-0000-4000-8000-000000000001');
    const { konten, n, lena, jonas } = await aufbau({ repo });
    const code = await konten.neuerNotfallcode();
    const [zeile] = await sql`SELECT hash FROM notfallcode`;
    assert.ok(String(zeile.hash).startsWith('scrypt$') && !String(zeile.hash).includes(code));
    const h = (await repo.notfallcode())!.hash;
    const r = await Promise.all([repo.loeseNotfallcodeEin(h, lena.id, 'scrypt$a'), repo.loeseNotfallcodeEin(h, jonas.id, 'scrypt$b')]);
    assert.deepEqual(r.filter(Boolean).length, 1);
    assert.equal(await repo.notfallcode(), null);
    const neu = await konten.neuerNotfallcode();
    assert.equal((await n.einloesen(HEIM, { code: neu, konto: lena.id, passwort: 'ein-neues-passwort' })).email, 'lena@example.org');
    assert.ok('schluessel' in await konten.anmelden({ email: 'lena@example.org', passwort: 'ein-neues-passwort' }, '192.168.1.5'));
  });
});

describe('Schnittstellen (#815, #821): offen für /notfall, Werkbank für den Rest', () => {
  async function tabelle() {
    const x = await aufbau();
    const t = routen(x.d, x.konten, { notfallcode: x.n });
    const rufe = (methode: string, pfad: string, benutzer: unknown, body: Record<string, unknown> = {}) => {
      const r = t.find((y) => y.methode === methode && y.pfad === pfad);
      assert.ok(r, `${methode} ${pfad}`);
      return r.handler({ body, params: {}, query: {}, ip: '192.168.1.20', benutzer } as unknown as Anfrage) as Promise<{ body: unknown }>;
    };
    return { ...x, t, rufe };
  }

  it('#885: die Werkbank-API liefert heimnetz und bei „nicht Heimnetz“ den Grund mit', async () => {
    const { t, lena } = await tabelle();
    const r = t.find((y) => y.methode === 'GET' && y.pfad === '/api/werkbank/anmeldeschutz/notfallzugang')!;
    const hole = async (ip: string, k: Record<string, string> = {}) => {
      const b = ((await r.handler({ body: {}, params: {}, query: {}, ip, kopf: kopf(k), benutzer: imModus(lena) } as unknown as Anfrage)) as { body: Record<string, unknown> }).body;
      return { heimnetz: b.heimnetz, grund: b.grund, hatGrund: 'grund' in b };
    };
    assert.deepEqual(await hole('192.168.1.20'), { heimnetz: true, grund: undefined, hatGrund: false });
    assert.deepEqual(await hole('203.0.113.7'), { heimnetz: false, grund: 'oeffentlich', hatGrund: true });
    // Ohne TRUST_PROXY (hier: kein Proxy eingetragen) wird eine Proxy-Angabe nicht geglaubt.
    assert.deepEqual(await hole('172.18.0.3', { 'x-forwarded-for': '192.168.1.20' }), { heimnetz: false, grund: 'proxy', hatGrund: true });
  });

  it('/api/notfall ohne Anmeldung, die Einstellung nur in der Werkbank (Bereich Anmeldeschutz)', async () => {
    const { t } = await tabelle();
    for (const p of ['/api/notfall', '/api/notfall/pruefen', '/api/notfall/einloesen', '/api/notfall/blatt']) assert.equal(t.find((r) => r.pfad === p)?.zugang, 'offen', p);
    for (const p of ['/api/werkbank/anmeldeschutz/notfallzugang', '/api/werkbank/uebersicht/erledigt']) assert.equal(t.find((r) => r.pfad === p)?.zugang, 'admin', p);
  });

  it('#821: zweite Person mit Verwaltungsrecht empfehlen – solange nur eine verwaltet; „Nein, danke“ gilt dauerhaft', async () => {
    const { rufe, lena, jonas, konten, einstellungen } = await tabelle();
    const zweite = async () => ((await rufe('GET', '/api/werkbank/uebersicht', imModus(lena))).body as { zweitePerson: boolean }).zweitePerson;
    assert.equal(await zweite(), false, 'Jonas verwaltet schon (Benutzer)');
    await konten.setzeVerwaltung(imModus(lena), jonas.id, []);
    assert.equal(await zweite(), true, 'nur noch Lena');
    // Nur „Gesamte Verwaltung“ lehnt ab; Unbekanntes geht nicht.
    await assert.rejects(rufe('POST', '/api/werkbank/uebersicht/erledigt', imModus({ ...jonas, verwaltung: ['benutzer'] }), { schluessel: 'verwaltung.zweite-person' }), status(403));
    await assert.rejects(rufe('POST', '/api/werkbank/uebersicht/erledigt', imModus(lena), { schluessel: 'mail' }), status(400));
    const vorher = protokoll.letzteNr;
    await rufe('POST', '/api/werkbank/uebersicht/erledigt', imModus(lena), { schluessel: 'verwaltung.zweite-person' });
    assert.equal(await zweite(), false);
    assert.ok(await einstellungen.lies(ZWEITE_ABGELEHNT));
    assert.ok(protokoll.eintraege({ seit: vorher }).some((e) => /zweite Person mit Verwaltungsrecht/.test(e.text) && e.modul === 'werkbank'));
    // Auch wenn später jemand dazu kommt und wieder geht: abgelehnt bleibt abgelehnt.
    await konten.setzeVerwaltung(imModus(lena), jonas.id, ['benutzer']);
    await konten.setzeVerwaltung(imModus(lena), jonas.id, []);
    assert.equal(await zweite(), false);
  });

  it('benutzter Notfallcode steht in der Übersicht, bis jemand „Gelesen“ wählt', async () => {
    const { rufe, lena, konten, n } = await tabelle();
    const code = await konten.neuerNotfallcode();
    await n.einloesen(HEIM, { code, konto: lena.id, passwort: 'ein-neues-passwort' });
    const liste = async () => ((await rufe('GET', '/api/werkbank/uebersicht', imModus(lena))).body as { notfallcodeBenutzt: Array<{ id: string; name: string }> }).notfallcodeBenutzt;
    const [x] = await liste();
    assert.equal(x.name, 'Lena');
    await rufe('POST', '/api/werkbank/uebersicht/erledigt', imModus(lena), { schluessel: `notfallzugang.benutzt:${x.id}` });
    assert.deepEqual(await liste(), []);
  });
});
