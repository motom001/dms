/**
 * Auslieferung der Oberfläche (#215, @fastify/static): Dateien aus web/dist, Browser-Routen bekommen
 * index.html, nichts außerhalb des Ordners ist erreichbar – auch nicht mit Pfad-Tricks.
 * Braucht das echte Fastify; läuft in der CI (lokal ohne installierte Pakete übersprungen).
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

const echtesFastify = await import('fastify').then((m) => typeof m.default === 'function', () => false);

describe('Oberfläche ausliefern (#215)', { skip: echtesFastify ? false : 'Fastify nicht installiert' }, () => {
  let app: { inject(o: { method: string; url: string }): Promise<{ statusCode: number; body: string }>; close(): Promise<unknown> };
  before(async () => {
    const wurzel = await mkdtemp(join(tmpdir(), 'dms-statisch-'));
    const web = join(wurzel, 'web');
    await mkdir(join(web, 'assets'), { recursive: true });
    await writeFile(join(web, 'index.html'), '<!doctype html><title>DMS</title>OBERFLAECHE');
    await writeFile(join(web, 'assets', 'app.js'), 'console.log("app")');
    // Daneben, außerhalb von web/: darf nie ausgeliefert werden.
    await writeFile(join(wurzel, 'geheim.txt'), 'GEHEIM');
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const dienst = new Dienst(speicherRepo(), speicherDateien());
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.benutzerspiegel());
    app = await baueApp(dienst, konten, { webDir: web }) as unknown as typeof app;
  });
  after(async () => { await app?.close(); });

  it('liefert Dateien und index.html für Browser-Routen', async () => {
    const js = await app.inject({ method: 'GET', url: '/assets/app.js' });
    assert.equal(js.statusCode, 200);
    assert.match(js.body, /console\.log/);
    const route = await app.inject({ method: 'GET', url: '/ablage/eingang' });
    assert.equal(route.statusCode, 200);
    assert.match(route.body, /OBERFLAECHE/);
    assert.equal((await app.inject({ method: 'GET', url: '/api/gibtsnicht' })).statusCode, 404);
  });

  it('nichts außerhalb von web/, auch mit Pfad-Tricks', async () => {
    for (const url of ['/../geheim.txt', '/assets/../../geheim.txt', '/%2e%2e/geheim.txt', '/assets/%2E%2E/%2E%2E/geheim.txt', '/assets%2F..%2F..%2Fgeheim.txt', '//geheim.txt', '/assets//../../geheim.txt', '/..%5Cgeheim.txt']) {
      const r = await app.inject({ method: 'GET', url });
      assert.doesNotMatch(r.body, /GEHEIM/, url);
    }
  });
});
