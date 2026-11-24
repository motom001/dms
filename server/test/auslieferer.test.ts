/**
 * Eigener Auslieferer der Oberfläche (#1468): feste Dateiliste beim Start, Content-Type, Cache, ETag/304, HEAD,
 * vorkomprimierte Fassungen, und nichts außerhalb der Liste – weder Symlinks noch Pfad-Tricks.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { eintragZurAdresse, leseDateien, richteOberflaecheEin, waehleKodierung } from '../src/oberflaeche/auslieferer';

const echtesFastify = await import('fastify').then(
  (m) => typeof m.default === 'function',
  () => false,
);
const ohneFastify = echtesFastify ? false : 'Fastify nicht installiert';

type Antwort = { statusCode: number; body: string; headers: Record<string, string | undefined> };
type App = {
  inject(o: { method: string; url: string; headers?: Record<string, string> }): Promise<Antwort>;
  close(): Promise<unknown>;
  ready(): Promise<unknown>;
};

/** Wie die Ausweichregel der Oberfläche (`oberflaecheSenden`): GET/HEAD auf einen Eintrag der Liste, sonst 404. */
function oberflaeche(f: FastifyInstance) {
  richteOberflaecheEin(f, web);
  f.setNotFoundHandler((q, r) => {
    const rel = q.method === 'GET' || q.method === 'HEAD' ? r.dateiZurAdresse(q.url) : null;
    return rel ? r.sendFile(rel) : r.code(404).send('NICHT DA');
  });
}

let wurzel = '';
let web = '';
before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), 'dms-auslieferer-'));
  web = join(wurzel, 'web');
  await mkdir(join(web, 'assets'), { recursive: true });
  await mkdir(join(web, 'hilfe', 'admin'), { recursive: true });
  await writeFile(join(web, 'index.html'), '<!doctype html>OBERFLAECHE');
  await writeFile(join(web, 'assets', 'start-1a2b.js'), 'console.log("klar")');
  await writeFile(join(web, 'assets', 'start-1a2b.js.gz'), gzipSync('console.log("gzip")'));
  await writeFile(join(web, 'assets', 'schrift.woff2'), 'W');
  await writeFile(join(web, 'assets', 'daten.unbekannt'), 'X');
  await writeFile(join(web, 'assets', 'zeit:stempel.js'), 'Z');
  await writeFile(join(web, 'hilfe', 'admin', 'index.html'), 'ADMIN');
  await writeFile(join(web, '.versteckt'), 'PUNKT');
  // Außerhalb von web/ – und Symlinks dorthin, als Datei und als Ordner.
  await writeFile(join(wurzel, 'geheim.txt'), 'GEHEIM');
  await mkdir(join(wurzel, 'draussen'));
  await writeFile(join(wurzel, 'draussen', 'auch.txt'), 'GEHEIM');
  await symlink(join(wurzel, 'geheim.txt'), join(web, 'assets', 'link.txt'));
  await symlink(join(wurzel, 'draussen'), join(web, 'assets', 'ordner'));
});
after(async () => {
  if (wurzel) await rm(wurzel, { recursive: true, force: true });
});

describe('Dateiliste (#1468)', () => {
  it('nur reguläre Dateien, keine Symlinks, keine Punktdateien, Fassungen ohne eigenen Eintrag', () => {
    const d = leseDateien(web);
    assert.deepEqual([...d.keys()].sort(), [
      'assets/daten.unbekannt',
      'assets/schrift.woff2',
      'assets/start-1a2b.js',
      'assets/zeit:stempel.js',
      'hilfe/admin/index.html',
      'index.html',
    ]);
    const js = d.get('assets/start-1a2b.js')!;
    assert.equal(js.typ, 'application/javascript; charset=utf-8');
    assert.equal(js.cache, 'public, max-age=31536000, immutable');
    assert.ok(js.fassungen.gzip && !js.fassungen.br);
    assert.equal(d.get('index.html')!.cache, 'no-cache');
    assert.equal(d.get('assets/schrift.woff2')!.typ, 'font/woff2');
    assert.equal(d.get('assets/daten.unbekannt')!.typ, 'application/octet-stream');
  });

  it('Adresse → Eintrag: nur exakte Einträge, Ordner mit Schrägstrich → index.html', () => {
    const d = leseDateien(web);
    assert.equal(eintragZurAdresse(d, '/'), 'index.html');
    assert.equal(eintragZurAdresse(d, '/hilfe/admin/'), 'hilfe/admin/index.html');
    assert.equal(eintragZurAdresse(d, '/hilfe/admin'), null);
    assert.equal(eintragZurAdresse(d, '/assets/start-1a2b.js?v=2'), 'assets/start-1a2b.js');
    assert.equal(eintragZurAdresse(d, '/assets/zeit%3Astempel.js'), 'assets/zeit:stempel.js');
    for (const url of ['/assets/../index.html', '/assets/%2e%2e/index.html', '//index.html', '/%E0', 'index.html', '/assets/link.txt'])
      assert.equal(eintragZurAdresse(d, url), null, url);
  });

  it('Accept-Encoding: Gewichte, q=0, *, nur vorhandene Fassungen', () => {
    const beide = { br: { pfad: '', groesse: 0, etag: '' }, gzip: { pfad: '', groesse: 0, etag: '' } };
    assert.equal(waehleKodierung('gzip, deflate, br', beide), 'br');
    assert.equal(waehleKodierung('br;q=0.5, gzip', beide), 'gzip');
    assert.equal(waehleKodierung('br;q=0, gzip;q=0', beide), null);
    assert.equal(waehleKodierung('*', beide), 'gzip');
    assert.equal(waehleKodierung('identity', beide), null);
    assert.equal(waehleKodierung(undefined, beide), null);
    assert.equal(waehleKodierung('br', { gzip: beide.gzip }), null);
  });
});

describe('Ausliefern (#1468)', { skip: ohneFastify }, () => {
  let app: App;
  before(async () => {
    const { default: Fastify } = await import('fastify');
    const f = Fastify();
    oberflaeche(f);
    app = f as unknown as App;
    await app.ready();
  });
  after(async () => {
    await app?.close();
  });

  it('Kopfzeilen, Länge, Inhalt; / und /ordner/ liefern index.html', async () => {
    const r = await app.inject({ method: 'GET', url: '/assets/start-1a2b.js' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body, 'console.log("klar")');
    assert.equal(r.headers['content-type'], 'application/javascript; charset=utf-8');
    assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(r.headers['content-length'], String('console.log("klar")'.length));
    assert.match(r.headers.etag ?? '', /^W\/"/);
    assert.ok(r.headers['last-modified']);
    assert.equal(r.headers.vary, 'accept-encoding');
    assert.equal(r.headers['accept-ranges'], undefined);
    assert.match((await app.inject({ method: 'GET', url: '/' })).body, /OBERFLAECHE/);
    assert.equal((await app.inject({ method: 'GET', url: '/hilfe/admin/' })).body, 'ADMIN');
    assert.equal((await app.inject({ method: 'GET', url: '/assets/zeit:stempel.js' })).body, 'Z', 'auch mit Doppelpunkt im Namen');
    assert.equal((await app.inject({ method: 'POST', url: '/index.html' })).statusCode, 404, 'nur GET und HEAD');
  });

  it('vorkomprimiert nach Accept-Encoding, eigenes ETag je Fassung', async () => {
    const klar = await app.inject({ method: 'GET', url: '/assets/start-1a2b.js' });
    const gz = await app.inject({ method: 'GET', url: '/assets/start-1a2b.js', headers: { 'accept-encoding': 'br, gzip' } });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.notEqual(gz.headers.etag, klar.headers.etag);
    assert.equal(gz.headers['content-type'], 'application/javascript; charset=utf-8');
  });

  it('304 bei passendem If-None-Match oder If-Modified-Since, sonst 200', async () => {
    const erst = await app.inject({ method: 'GET', url: '/index.html' });
    const etag = erst.headers.etag!;
    const nochmal = await app.inject({ method: 'GET', url: '/index.html', headers: { 'if-none-match': etag } });
    assert.equal(nochmal.statusCode, 304);
    assert.equal(nochmal.body, '');
    assert.equal(nochmal.headers.etag, etag);
    assert.equal(nochmal.headers['cache-control'], 'no-cache');
    const liste = await app.inject({ method: 'GET', url: '/index.html', headers: { 'if-none-match': `"x", ${etag.slice(2)}` } });
    assert.equal(liste.statusCode, 304, 'schwacher Vergleich in einer Liste');
    const anders = await app.inject({ method: 'GET', url: '/index.html', headers: { 'if-none-match': 'W/"anders"' } });
    assert.equal(anders.statusCode, 200);
    const seit = await app.inject({ method: 'GET', url: '/index.html', headers: { 'if-modified-since': erst.headers['last-modified']! } });
    assert.equal(seit.statusCode, 304);
    // Das ETag der unkomprimierten Fassung passt nicht zur gzip-Fassung.
    const gz = await app.inject({
      method: 'GET',
      url: '/assets/start-1a2b.js',
      headers: {
        'accept-encoding': 'gzip',
        'if-none-match': (await app.inject({ method: 'GET', url: '/assets/start-1a2b.js' })).headers.etag!,
      },
    });
    assert.equal(gz.statusCode, 200);
  });

  it('HEAD wie GET ohne Inhalt (über echtes HTTP – inject zählt die Länge selbst)', async () => {
    const { default: Fastify } = await import('fastify');
    const f = Fastify();
    oberflaeche(f);
    await f.listen({ port: 0, host: '127.0.0.1' });
    const port = (f.server.address() as { port: number }).port;
    const r = await new Promise<{ status: number; koepfe: Record<string, unknown>; laenge: number }>((ok, fehler) =>
      request({ host: '127.0.0.1', port, method: 'HEAD', path: '/assets/start-1a2b.js' }, (x) => {
        let laenge = 0;
        x.on('data', (b: Buffer) => (laenge += b.length));
        x.on('end', () => ok({ status: x.statusCode ?? 0, koepfe: x.headers, laenge }));
      })
        .on('error', fehler)
        .end(),
    );
    await f.close();
    assert.equal(r.status, 200);
    assert.equal(r.laenge, 0);
    assert.equal(r.koepfe['content-length'], String('console.log("klar")'.length));
    assert.equal(r.koepfe['content-type'], 'application/javascript; charset=utf-8');
  });

  it('nichts außerhalb der Liste: Symlinks, Punktdateien, Fassungen, Pfad-Tricks', async () => {
    for (const url of [
      '/assets/link.txt',
      '/assets/ordner/auch.txt',
      '/.versteckt',
      '/assets/start-1a2b.js.gz',
      '/assets/zeit',
      '/../geheim.txt',
      '/%2e%2e/geheim.txt',
      '/%252e%252e/geheim.txt',
      '/assets/%2E%2E/%2E%2E/geheim.txt',
      '/assets%2F..%2F..%2Fgeheim.txt',
      '/assets/..%5C..%5Cgeheim.txt',
      '/..\\geheim.txt',
      '//geheim.txt',
      '/assets//start-1a2b.js/../../../geheim.txt',
      '/ASSETS/START-1A2B.JS',
    ]) {
      const r = await app.inject({ method: 'GET', url });
      assert.equal(r.statusCode, 404, url);
      assert.doesNotMatch(r.body, /GEHEIM|PUNKT/, url);
    }
  });

  it('sendFile nur für Einträge der Liste', async () => {
    const { default: Fastify } = await import('fastify');
    const f = Fastify();
    richteOberflaecheEin(f, web);
    f.get('/probe', (q, r) => r.sendFile((q.query as { d: string }).d));
    await f.ready();
    const hole = (d: string) => f.inject({ method: 'GET', url: `/probe?d=${encodeURIComponent(d)}` });
    assert.equal((await hole('hilfe/admin/index.html')).body, 'ADMIN');
    assert.equal((await hole(join('hilfe', 'admin', 'index.html'))).body, 'ADMIN');
    for (const d of ['../geheim.txt', 'assets/link.txt', 'assets/ordner/auch.txt', '/etc/passwd', 'assets/start-1a2b.js.gz'])
      assert.equal((await hole(d)).statusCode, 404, d);
    // Ohne Ausweichregel keine eigene Adresse: Der Auslieferer legt keine Routen an.
    assert.equal((await f.inject({ method: 'GET', url: '/index.html' })).statusCode, 404);
    await f.close();
  });
});
