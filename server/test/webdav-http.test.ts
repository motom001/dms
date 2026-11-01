/**
 * WebDAV-Laufwerk (#346) über den echten HTTP-Adapter (baueApp, Fastify): eigene Methoden, rohe Körper,
 * Anmeldung, und dass der Parser für alle Typen nur unter /webdav greift.
 * Braucht das echte Fastify; läuft in der CI (lokal ohne installierte Pakete übersprungen).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const echtesFastify = await import('fastify').then((m) => typeof m.default === 'function', () => false);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n% binär '), Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x0a])]);

interface Antwort { statusCode: number; body: string; rawPayload: Buffer; headers: Record<string, string | string[] | undefined> }
interface App { inject(o: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }): Promise<Antwort>; close(): Promise<unknown> }

describe('WebDAV über HTTP (#346)', { skip: echtesFastify ? false : 'Fastify nicht installiert' }, () => {
  let app: App;
  let wd: import('../src/webdav').Webdav;
  let dienst: import('../src/dienst').Dienst;
  let annaId = '';
  let mappeId = '';
  let basic = '';
  let bearer = '';
  const post = async () => {
    const typ = await dienst.postTyp();
    return (await dienst.seite({ id: annaId, rolle: 'mitglied' }, { sicht: `typ:${typ.id}` })).mappen;
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
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    const { benutzer: admin } = await konten.einrichten({ email: 'admin@example.org', name: 'Admin', passwort: 'ein-langes-passwort' });
    const anna = (await konten.legeBenutzerAn({ email: 'anna@example.org', name: 'Anna', rolle: 'mitglied' }, admin.id)).benutzer;
    annaId = anna.id;
    await dienst.gleicheBenutzerAb(await konten.listeBenutzer());
    const schluessel = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    const k = (await schluessel.lege(anna, { name: 'Laufwerk', recht: 'schreiben' })).schluessel;
    basic = `Basic ${Buffer.from(`anna@example.org:${k}`).toString('base64')}`;
    bearer = `Bearer ${k}`;
    const typ = await dienst.legeTypAn({ name: 'Vertrag', titelVorlage: '{nr}', felder: [{ key: 'nr', label: 'Nr', typ: 'text' }], register: [
      { key: 'daten', name: 'Daten', art: 'felder' }, { key: 'belege', name: 'Belege', art: 'dokumente', versionierung: true },
    ] } as never);
    const m = await dienst.legeMappeAn({ typId: typ.id, werte: { nr: 'V-1' } }, anna.id);
    mappeId = m.id;
    await dienst.ladeHoch(m.id, { register: 'belege', name: 'Rechnung.pdf' }, PDF, anna.id);
    wd = new Webdav({ dienst, konten, schluessel, einstellungen: speicherEinstellungen(), adresse: () => 'https://dms.example.org' });
    app = await baueApp(dienst, konten, { apiSchluessel: schluessel, webdav: wd }) as unknown as App;
  });
  after(async () => { await app?.close(); });

  it('ausgeschaltet: 404, auch für OPTIONS', async () => {
    assert.equal((await app.inject({ method: 'OPTIONS', url: '/webdav/' })).statusCode, 404);
    assert.equal((await app.inject({ method: 'PROPFIND', url: '/webdav/', headers: { authorization: basic, depth: '1' } })).statusCode, 404);
    await wd.speichere({ aktiv: true }, 'admin@example.org');
  });

  it('OPTIONS mit DAV-Kopf, auch auf „/“', async () => {
    const r = await app.inject({ method: 'OPTIONS', url: '/webdav/' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers.dav, '1, 2');
    assert.match(String(r.headers.allow), /PROPFIND/);
    assert.equal((await app.inject({ method: 'OPTIONS', url: '/' })).headers.dav, '1, 2');
  });

  it('PROPFIND: ohne Anmeldung 401 mit WWW-Authenticate, mit Schlüssel 207 als XML', async () => {
    const ohne = await app.inject({ method: 'PROPFIND', url: '/webdav/', headers: { depth: '1' } });
    assert.equal(ohne.statusCode, 401);
    assert.equal(ohne.headers['www-authenticate'], 'Basic realm="DMS", charset="UTF-8"');
    const r = await app.inject({ method: 'PROPFIND', url: '/webdav/', headers: { authorization: basic, depth: '1', 'content-type': 'application/xml' },
      payload: '<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:allprop/></D:propfind>' });
    assert.equal(r.statusCode, 207);
    assert.match(String(r.headers['content-type']), /^application\/xml/);
    assert.match(r.body, /<D:multistatus xmlns:D="DAV:">/);
    assert.match(r.body, /<D:href>\/webdav\/Neue%20Post\/<\/D:href>/);
    // Ohne Content-Type und ohne Körper geht es auch.
    assert.equal((await app.inject({ method: 'PROPFIND', url: '/webdav/Ablage/', headers: { authorization: basic, depth: '1' } })).statusCode, 207);
    assert.equal((await app.inject({ method: 'PROPFIND', url: '/webdav/', headers: { authorization: basic, depth: 'infinity' } })).statusCode, 403);
  });

  it('PUT in „Neue Post“: Binärdaten mit beliebigem Content-Type werden Post', async () => {
    const vorher = (await post()).length;
    for (const [name, typ] of [['Scan.pdf', 'application/pdf'], ['Roh.bin', 'application/octet-stream'], ['Ohne.pdf', '']] as const) {
      const r = await app.inject({ method: 'PUT', url: `/webdav/Neue%20Post/${name}`, headers: { authorization: basic, ...(typ ? { 'content-type': typ } : {}) }, payload: PDF });
      assert.equal(r.statusCode, 201, name);
    }
    const p = await post();
    assert.equal(p.length, vorher + 3);
    const doks = (await dienst.laufwerkMappe(p.find((x) => x.werte.betreff === 'Scan')!.id, await dienst.zugriff({ id: annaId, rolle: 'mitglied' }))).dokumente;
    assert.equal(doks.length, 1);
    assert.equal(doks[0].groesse, PDF.length);
  });

  it('GET liefert den Inhalt unverändert; LOCK antwortet mit lockdiscovery', async () => {
    const pfad = (await app.inject({ method: 'PROPFIND', url: '/webdav/Ablage/Vertrag/', headers: { authorization: basic, depth: '1' } })).body;
    const mappe = /<D:href>(\/webdav\/Ablage\/Vertrag\/[^<]+\/)<\/D:href>/.exec(pfad)?.[1];
    assert.ok(mappe, 'Mappe im Ansichtsordner');
    const g = await app.inject({ method: 'GET', url: `${mappe}Belege/Rechnung.pdf`, headers: { authorization: basic } });
    assert.equal(g.statusCode, 200);
    assert.deepEqual(g.rawPayload, PDF);
    assert.match(String(g.headers.etag), /^"[0-9a-f]{32}"$/);
    const l = await app.inject({ method: 'LOCK', url: `${mappe}Belege/Rechnung.pdf`, headers: { authorization: basic, 'content-type': 'application/xml' },
      payload: '<?xml version="1.0"?><D:lockinfo xmlns:D="DAV:"><D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype></D:lockinfo>' });
    assert.equal(l.statusCode, 200);
    assert.match(l.body, /<D:lockdiscovery>/);
    assert.match(String(l.headers['lock-token']), /^<opaquelocktoken:/);
    assert.equal((await app.inject({ method: 'UNLOCK', url: `${mappe}Belege/Rechnung.pdf`, headers: { authorization: basic, 'lock-token': String(l.headers['lock-token']) } })).statusCode, 204);
  });

  it('/api bleibt unberührt: JSON und Datei-Upload wie bisher', async () => {
    const json = await app.inject({ method: 'POST', url: '/api/konto/anmelden', headers: { 'x-dms': '1', 'content-type': 'application/json' }, payload: JSON.stringify({ email: 'admin@example.org', passwort: 'ein-langes-passwort' }) });
    assert.equal(json.statusCode, 200);
    assert.equal(JSON.parse(json.body).benutzer.email, 'admin@example.org');
    // Die Sitzung der Oberfläche allein öffnet das Laufwerk nicht.
    const cookie = String(([] as string[]).concat(json.headers['set-cookie'] ?? [])[0] ?? '').split(';')[0];
    assert.match(cookie, /^dms_sitzung=/);
    assert.equal((await app.inject({ method: 'PROPFIND', url: '/webdav/', headers: { cookie, depth: '0' } })).statusCode, 401);
    const hoch = await app.inject({ method: 'POST', url: `/api/v1/mappen/${mappeId}/dokumente?register=belege&name=api.pdf`,
      headers: { authorization: bearer, 'content-type': 'application/octet-stream' }, payload: PDF });
    assert.equal(hoch.statusCode, 201);
    // Unbekannter Typ an der API: weiterhin abgelehnt (kein Parser für alles außerhalb von /webdav).
    const fremd = await app.inject({ method: 'POST', url: '/api/v1/post', headers: { authorization: bearer, 'content-type': 'application/x-unbekannt' }, payload: 'x' });
    assert.equal(fremd.statusCode, 415);
  });
});
