/**
 * Zähler-Endpunkt und Schlüssel-Stufe „nur Zähler“ (#625): GET /api/v1/ich/zaehler liefert nur Zahlen in den
 * Rechten des Benutzers, mit Stand, ETag und 304; ein Schlüssel „nur Zähler“ darf nichts anderes.
 * Über den echten HTTP-Adapter (Fastify); der Stand zusätzlich in PostgreSQL (mit TEST_DATABASE_URL).
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { passtEtag } from '../src/routen';

const echtesFastify = await import('fastify').then((m) => typeof m.default === 'function', () => false);

interface Antwort { statusCode: number; body: string; headers: Record<string, string | string[] | undefined> }
interface App { inject(o: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }): Promise<Antwort>; close(): Promise<unknown> }

const ZAHLEN = ['geaendert', 'neuePost', 'stand', 'ueberfaellig', 'zuErledigen'];
const tagVersetzt = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); };

describe('ETag-Vergleich (#625)', () => {
  it('versteht Listen, schwache ETags und *', () => {
    assert.equal(passtEtag(undefined, '"z1-a"'), false);
    assert.equal(passtEtag('"z1-a"', '"z1-a"'), true);
    assert.equal(passtEtag('W/"z1-a"', '"z1-a"'), true);
    assert.equal(passtEtag('"x", "z1-a"', '"z1-a"'), true);
    assert.equal(passtEtag('*', '"z1-a"'), true);
    assert.equal(passtEtag('"z2-a"', '"z1-a"'), false);
  });
});

describe('Schlüssel-Stufe „nur Zähler“ (#625)', () => {
  it('lässt sich anlegen und ändern, nie mit „Passwörter lesen“', async () => {
    const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
    const d = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const ich = { id: '00000000-0000-4000-8000-0000000000aa', rolle: 'mitglied' } as never;
    const s = await d.lege(ich, { name: 'Wand-Tablet', recht: 'zaehler', passwoerter: true });
    assert.equal(s.recht, 'zaehler');
    assert.equal(s.passwoerter, false);
    assert.equal((await d.aendere(ich, s.id, { name: 'Wand-Tablet', recht: 'lesen' })).recht, 'lesen');
    assert.equal((await d.aendere(ich, s.id, { name: 'Wand-Tablet', recht: 'zaehler', passwoerter: true })).passwoerter, false);
    await assert.rejects(d.lege(ich, { name: 'X', recht: 'alles' }), (e: { status?: number }) => e.status === 422);
  });

  it('steht in der OpenAPI-Beschreibung mit ETag, If-None-Match und 304', async () => {
    const { openapi } = await import('../src/api-v1');
    const doc = openapi('0.0.0') as { paths: Record<string, Record<string, { parameters?: Array<{ name: string; in: string }>; responses: Record<string, { headers?: Record<string, unknown>; content?: unknown }> }>>; components: { schemas: Record<string, { properties: Record<string, unknown>; additionalProperties?: boolean }> } };
    const op = doc.paths['/ich/zaehler'].get;
    assert.ok(op.parameters?.some((p) => p.name === 'If-None-Match' && p.in === 'header'));
    assert.ok(op.responses['200'].headers?.ETag);
    assert.ok(op.responses['304'] && !op.responses['304'].content);
    const schema = doc.components.schemas.Zaehlerstand;
    assert.deepEqual(Object.keys(schema.properties).sort(), ZAHLEN);
    assert.equal(schema.additionalProperties, false);
  });
});

describe('Zähler-Endpunkt über HTTP (#625)', { skip: echtesFastify ? false : 'Fastify nicht installiert' }, () => {
  let app: App;
  let dienst: import('../src/dienst').Dienst;
  let wd: import('../src/webdav').Webdav;
  let cookie = '';
  let adminId = '';
  let lena = { id: '', zaehler: '', lesen: '', schreiben: '' };
  let jonas = { id: '', zaehler: '' };

  const hole = async (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers });
  const zaehler = async (schluessel: string, wenn?: string) => {
    const r = await hole('/api/v1/ich/zaehler', { authorization: `Bearer ${schluessel}`, ...(wenn ? { 'if-none-match': wenn } : {}) });
    return { status: r.statusCode, etag: String(r.headers.etag ?? ''), body: r.body ? JSON.parse(r.body) : null, roh: r.body, headers: r.headers };
  };

  before(async () => {
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { speicherEinstellungen } = await import('../src/einstellungen');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
    const { Webdav } = await import('../src/webdav');
    dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    // Änderungen anderer sollen hier sofort zählen (die Mindestgültigkeit #742 prüft zaehlerspeicher.test.ts).
    dienst.mindestensMs = 0;
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    wd = new Webdav({ dienst, konten, schluessel, einstellungen: speicherEinstellungen(), adresse: () => 'https://dms.example.org' });
    app = await baueApp(dienst, konten, { apiSchluessel: schluessel, webdav: wd }) as unknown as App;
    const e = await app.inject({ method: 'POST', url: '/api/konto/einrichten', headers: { 'x-dms': '1' }, payload: { email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' } });
    assert.equal(e.statusCode, 201);
    cookie = String(e.headers['set-cookie']).split(';')[0];
    adminId = JSON.parse(e.body).benutzer.id;
    const l = (await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' }, adminId)).benutzer;
    const j = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, adminId)).benutzer;
    await dienst.postSystemmappen.gleicheBenutzerAb(await konten.listeBenutzer());
    lena = {
      id: l.id,
      zaehler: (await schluessel.lege(l, { name: 'Wand-Tablet', recht: 'zaehler' })).schluessel,
      lesen: (await schluessel.lege(l, { name: 'Lesen', recht: 'lesen' })).schluessel,
      schreiben: (await schluessel.lege(l, { name: 'Scanner', recht: 'schreiben' })).schluessel,
    };
    jonas = { id: j.id, zaehler: (await schluessel.lege(j, { name: 'Homey', recht: 'zaehler' })).schluessel };
    await wd.speichere({ aktiv: true }, 'markus@example.org');
  });
  after(async () => { await app?.close(); });

  it('liefert nur Zahlen, einen Stand und ein ETag', async () => {
    const r = await zaehler(lena.zaehler);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ZAHLEN);
    for (const k of ['neuePost', 'zuErledigen', 'ueberfaellig', 'stand']) assert.ok(Number.isInteger(r.body[k]), k);
    assert.ok(!Number.isNaN(Date.parse(r.body.geaendert)));
    assert.match(r.etag, /^"z\d+-[\w-]+"$/);
    assert.equal(r.headers['cache-control'], 'private, no-cache');
    assert.deepEqual({ ...r.body, stand: 0, geaendert: '' }, { neuePost: 0, zuErledigen: 0, ueberfaellig: 0, stand: 0, geaendert: '' });
  });

  it('antwortet mit 304 ohne Inhalt, solange sich nichts ändert', async () => {
    const a = await zaehler(lena.zaehler);
    const b = await zaehler(lena.zaehler, a.etag);
    assert.equal(b.status, 304);
    assert.equal(b.roh, '');
    assert.equal(b.etag, a.etag);
    assert.equal((await zaehler(lena.zaehler, `W/${a.etag}`)).status, 304);
    assert.equal((await zaehler(lena.zaehler, '"z0-alt"')).status, 200);
    // Gleicher Stand auch ohne If-None-Match: der Abruf selbst ändert nichts.
    assert.equal((await zaehler(lena.zaehler)).body.stand, a.body.stand);
  });

  it('Stand und ETag ändern sich nach neuer Post; nur Zahlen, keine Inhalte', async () => {
    const vorher = await zaehler(lena.zaehler);
    const post = await dienst.post.legePostAn({ betreff: 'Brief Stadtwerke Musterstadt', absender: 'Absender Beispiel GmbH', fuer: lena.id }, { id: adminId, name: 'Markus' });
    const r = await zaehler(lena.zaehler, vorher.etag);
    assert.equal(r.status, 200);
    assert.notEqual(r.etag, vorher.etag);
    assert.equal(r.body.stand, vorher.body.stand + 1);
    assert.ok(Date.parse(r.body.geaendert) >= Date.parse(vorher.body.geaendert));
    assert.equal(r.body.neuePost, 1);
    assert.equal(r.body.zuErledigen, 1, 'Aufgabe „Post für dich“');
    for (const wort of ['Stadtwerke', 'Absender', 'Lena', 'Markus', post.id]) assert.ok(!r.roh.includes(wort), wort);
    assert.equal((await zaehler(lena.zaehler, r.etag)).status, 304);
  });

  it('zählt Überfälliges; kommende Termine zählen nicht (#725: kein „anstehend“ mehr)', async () => {
    const post = await dienst.post.legePostAn({ betreff: 'Vertrag', fuer: lena.id }, { id: adminId, name: 'Markus' });
    const vorher = (await zaehler(lena.zaehler)).body;
    await dienst.legeErinnerungAn(post.id, { datum: tagVersetzt(3), text: 'Kündigen', empfaengerId: lena.id }, adminId);
    await dienst.legeErinnerungAn(post.id, { datum: tagVersetzt(30), text: 'Später', empfaengerId: lena.id }, adminId);
    await dienst.legeErinnerungAn(post.id, { datum: tagVersetzt(-2), text: 'Vergessen', empfaengerId: lena.id }, adminId);
    const r = (await zaehler(lena.zaehler)).body;
    assert.equal(r.anstehend, undefined);
    assert.equal(r.ueberfaellig, vorher.ueberfaellig + 1);
    assert.ok(r.stand > vorher.stand);
  });

  it('Rechte: jeder sieht nur seine eigenen Zahlen; Administratoren über die Sitzung', async () => {
    const jVorher = (await zaehler(jonas.zaehler)).body;
    const lVorher = (await zaehler(lena.zaehler)).body;
    // Post für Jonas zählt bei Lena nicht; Post ohne „Für“ zählt bei beiden als neue Post.
    await dienst.post.legePostAn({ betreff: 'Für Jonas', fuer: jonas.id }, { id: adminId, name: 'Markus' });
    const j = (await zaehler(jonas.zaehler)).body;
    const l = (await zaehler(lena.zaehler)).body;
    assert.equal(j.neuePost, jVorher.neuePost + 1);
    assert.equal(j.zuErledigen, jVorher.zuErledigen + 1);
    assert.equal(l.neuePost, lVorher.neuePost);
    assert.equal(l.zuErledigen, lVorher.zuErledigen);
    assert.equal(l.stand, lVorher.stand, 'Lenas Stand bleibt');
    await dienst.post.legePostAn({ betreff: 'Ohne Für' }, { id: adminId, name: 'Markus' });
    assert.equal((await zaehler(lena.zaehler)).body.neuePost, l.neuePost + 1);
    assert.equal((await zaehler(jonas.zaehler)).body.neuePost, j.neuePost + 1);
    // Der Administrator (ohne API-Schlüssel, #128) über die Sitzung: eigene Zahlen, auch die interne Adresse.
    const admin = await hole('/api/v1/ich/zaehler', { cookie });
    assert.equal(admin.statusCode, 200);
    assert.deepEqual(Object.keys(JSON.parse(admin.body)).sort(), ZAHLEN);
    assert.equal(JSON.parse(admin.body).zuErledigen, 0, 'Post mit „Für“ gehört Lena und Jonas');
    assert.equal((await hole('/api/ich/zaehler', { cookie })).statusCode, 200);
    assert.equal((await hole('/api/v1/ich/zaehler', { cookie, 'if-none-match': String(admin.headers.etag) })).statusCode, 304);
    assert.equal((await hole('/api/v1/ich/zaehler')).statusCode, 401);
  });

  it('Schlüssel „lesen“ und „lesen und schreiben“ dürfen den Zähler ebenfalls', async () => {
    assert.equal((await zaehler(lena.lesen)).status, 200);
    assert.equal((await zaehler(lena.schreiben)).status, 200);
    assert.deepEqual((await zaehler(lena.lesen)).body, (await zaehler(lena.zaehler)).body);
  });

  it('„nur Zähler“ bekommt bei jedem anderen Aufruf 403, auch intern und im Laufwerk', async () => {
    const auth = { authorization: `Bearer ${lena.zaehler}` };
    const post = (await dienst.sichten.seite({ id: lena.id, rolle: 'mitglied' }, { sicht: 'eingang' })).mappen[0];
    assert.ok(post);
    const proben: Array<[string, string, unknown?]> = [
      ['GET', '/api/v1/ich'], ['GET', '/api/v1/typen'], ['GET', `/api/v1/mappen/${post.id}`],
      ['GET', '/api/v1/aufgaben'], ['POST', '/api/v1/post', { betreff: 'x' }], ['PUT', '/api/v1/konto/abwesenheit', { an: false }],
      ['DELETE', `/api/v1/mappen/${post.id}`], ['HEAD', '/api/v1/typen'],
      // interne Schnittstellen der Oberfläche
      ['GET', '/api/ich/zaehler'], ['GET', '/api/sichten'], ['GET', '/api/typen'], ['GET', '/api/konto/api-schluessel'], ['GET', '/api/termine'],
      ['POST', '/api/konto/api-schluessel', { name: 'mehr', recht: 'schreiben' }],
    ];
    for (const [method, url, payload] of proben) {
      const r = await app.inject({ method, url, headers: { ...auth, 'x-dms': '1' }, ...(payload ? { payload } : {}) });
      assert.equal(r.statusCode, 403, `${method} ${url}`);
      if (method !== 'HEAD') assert.match(JSON.parse(r.body).fehler, /nur die Zahlen/, `${method} ${url}`);
    }
    // Laufwerk (WebDAV): Schlüssel stimmt, öffnet aber nichts.
    const basic = `Basic ${Buffer.from(`lena@example.org:${lena.zaehler}`).toString('base64')}`;
    const wd403 = await app.inject({ method: 'PROPFIND', url: '/webdav/', headers: { authorization: basic, depth: '1' } });
    assert.equal(wd403.statusCode, 403);
    assert.match(wd403.body, /nur die Zahlen/);
    // Gegenprobe: der Lese-Schlüssel kommt an dieselben Stellen.
    assert.equal((await hole('/api/v1/typen', { authorization: `Bearer ${lena.lesen}` })).statusCode, 200);
    assert.equal((await hole('/api/v1/ich/zaehler', auth)).statusCode, 200);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe('Stand der Zahlen in PostgreSQL (#625)', { skip: url ? false : 'TEST_DATABASE_URL nicht gesetzt' }, () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module erst nach dem Setzen der Umgebung dynamisch geladen; Typ im Test ohne Belang
  let haupt: any; let sql: any;
  const db = `dms_zaehler_${process.pid}`;
  const HAUSHALT = '00000000-0000-4000-8000-000000000001';
  const BENUTZER = '00000000-0000-4000-8000-0000000000b1';
  before(async () => {
    const { verbinde, migriere } = await import('../src/db');
    haupt = verbinde(url!);
    await haupt.unsafe(`DROP DATABASE IF EXISTS ${db}`);
    await haupt.unsafe(`CREATE DATABASE ${db}`);
    const u = new URL(url!); u.pathname = `/${db}`;
    sql = verbinde(u.toString());
    await migriere(sql, fileURLToPath(new URL('../migrations', import.meta.url)), () => {});
    await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${BENUTZER}, ${HAUSHALT}, 'lena@example.org', 'Lena', 'mitglied')`;
  });
  after(async () => { await sql?.end(); await haupt?.unsafe(`DROP DATABASE IF EXISTS ${db}`); await haupt?.end(); });

  it('zählt nur bei geänderten Zahlen hoch und übersteht einen Neustart', async () => {
    const { pgRepo } = await import('../src/repo-pg');
    const repo = pgRepo(sql, HAUSHALT);
    assert.equal(await repo.zaehlerstand(BENUTZER), undefined);
    const a = await repo.setzeZaehlerstand(BENUTZER, 'abc');
    assert.equal(a.stand, 1);
    assert.equal((await repo.setzeZaehlerstand(BENUTZER, 'abc')).stand, 1);
    const gleichzeitig = await Promise.all([repo.setzeZaehlerstand(BENUTZER, 'def'), repo.setzeZaehlerstand(BENUTZER, 'def')]);
    assert.deepEqual(gleichzeitig.map((x) => x.stand), [2, 2], 'eine Änderung zählt einmal');
    // „Neustart“: ein neues Repo liest denselben Stand aus der Datenbank.
    assert.deepEqual(await pgRepo(sql, HAUSHALT).zaehlerstand(BENUTZER), { ...gleichzeitig[0] });
    assert.equal((await pgRepo(sql, HAUSHALT).setzeZaehlerstand(BENUTZER, 'abc')).stand, 3);
  });

  it('nimmt die Stufe „zaehler“ an, andere nicht', async () => {
    const { pgApiSchluesselRepo } = await import('../src/apischluessel');
    const r = pgApiSchluesselRepo(sql);
    const s = { id: '00000000-0000-4000-8000-0000000000c1', benutzerId: BENUTZER, name: 'Tablet', praefix: 'dms_abc…', recht: 'zaehler' as const, passwoerter: false, ablauf: null, erstellt: '', zuletztBenutzt: null, hash: 'h1' };
    await r.lege(s);
    assert.equal((await r.zuHash('h1'))?.recht, 'zaehler');
    await assert.rejects(r.lege({ ...s, id: '00000000-0000-4000-8000-0000000000c2', hash: 'h2', recht: 'alles' as never }));
    // Benutzer gelöscht: Stand weg (ON DELETE CASCADE).
    await sql`DELETE FROM benutzer WHERE id = ${BENUTZER}`;
    assert.equal((await sql`SELECT count(*)::int AS n FROM zaehlerstaende`)[0].n, 0);
  });
});
