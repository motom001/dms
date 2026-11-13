/**
 * Fehlende Dateien der Oberfläche (#932): `/assets/…` und Pfade mit Dateiendung bekommen 404, nicht index.html – in
 * allen Betriebsarten (normal, Einrichtungsmodus, Lasttestmodus). Seiten ohne Endung bekommen weiter index.html,
 * das Handbuch unter /hilfe/ behält seine eigenen Regeln.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import { istDateipfad } from '../src/oberflaeche';

const echtesFastify = await import('fastify').then((m) => typeof m.default === 'function', () => false);
const ohneFastify = echtesFastify ? false : 'Fastify nicht installiert';

const freierPort = () => new Promise<number>((r) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const a = s.address(); s.close(() => r(typeof a === 'object' && a ? a.port : 0)); }); });

let wurzel = '';
let web = '';
before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), 'dms-oberflaeche-'));
  web = join(wurzel, 'web');
  await mkdir(join(web, 'assets'), { recursive: true });
  await mkdir(join(web, 'hilfe', 'admin'), { recursive: true });
  await writeFile(join(web, 'index.html'), '<!doctype html><title>Ablago</title>OBERFLAECHE');
  await writeFile(join(web, 'assets', 'start-neu.js'), 'console.log("neu")');
  await writeFile(join(web, 'hilfe', 'index.html'), 'HILFE-START');
  await writeFile(join(web, 'hilfe', 'admin', 'index.html'), 'ADMIN-HANDBUCH');
});
after(async () => { if (wurzel) await rm(wurzel, { recursive: true, force: true }); });

type Hole = (pfad: string) => Promise<{ status: number; typ: string; text: string; cache?: string }>;

/** Dieselben Erwartungen für jede Betriebsart. */
async function pruefeBetriebsart(hole: Hole) {
  for (const pfad of ['/assets/start-gibtsnicht.js', '/assets/index-gibtsnicht.css', '/assets/start-gibtsnicht.js.map', '/assets/bild.png', '/assets/ohne-endung', '/favicon-alt.svg', '/manifest.webmanifest', '/ablage/x/skript.js?v=1']) {
    const r = await hole(pfad);
    assert.equal(r.status, 404, pfad);
    assert.doesNotMatch(r.typ, /text\/html/, pfad);
    assert.doesNotMatch(r.text, /OBERFLAECHE/, pfad);
  }
  // Vorhandene Dateien weiter wie bisher.
  const js = await hole('/assets/start-neu.js');
  assert.equal(js.status, 200);
  assert.match(js.text, /console\.log/);
  // Zwischenspeichern (#1198): Dateien unter /assets/ lange, index.html nie ohne Nachfrage.
  assert.equal(js.cache, 'public, max-age=31536000, immutable');
  assert.equal((await hole('/')).cache, 'no-cache');
  assert.equal((await hole('/ablage/eingang')).cache, 'no-cache');
  assert.equal((await hole('/index.html')).cache, 'no-cache');
  // Seiten der Oberfläche (auch mit Punkt, etwa eine E-Mail-Adresse) bekommen index.html.
  for (const pfad of ['/', '/ablage/eingang', '/werkbank/pakete/ablago.steuer', '/ablage/email/lena@example.org', '/anmelden/code', '/passwort/abc']) {
    const r = await hole(pfad);
    assert.equal(r.status, 200, pfad);
    assert.match(r.typ, /text\/html/, pfad);
    assert.match(r.text, /OBERFLAECHE/, pfad);
  }
  // Handbuch: eigene Regeln.
  const hilfe = await hole('/hilfe/admin/');
  assert.equal(hilfe.status, 200);
  assert.match(hilfe.text, /ADMIN-HANDBUCH/);
  const fehlt = await hole('/hilfe/admin/gibtsnicht/');
  assert.equal(fehlt.status, 404);
  assert.doesNotMatch(fehlt.text, /OBERFLAECHE/);
}

const ueberHttp = (port: number): Hole => async (pfad) => {
  const r = await fetch(`http://127.0.0.1:${port}${pfad}`, { redirect: 'manual' });
  return { status: r.status, typ: r.headers.get('content-type') ?? '', text: await r.text(), cache: r.headers.get('cache-control') ?? undefined };
};

describe('Fehlende Dateien der Oberfläche (#932)', () => {
  it('erkennt Dateipfade an /assets/ und an Endungen der Oberfläche', () => {
    for (const p of ['/assets/a.js', '/assets/a', '/assets/', '/x.css', '/a/b/c.map', '/favicon.ICO', '/manifest.webmanifest', '/assets/a.js?x=1', '/sw.js#a']) assert.equal(istDateipfad(p), true, p);
    for (const p of ['/', '/ablage', '/ablage/eingang', '/ablage/email/lena@example.org', '/werkbank/pakete/ablago.steuer', '/ablage/x?datei=a.js', '/assetsx/a', '/hilfe/admin/']) assert.equal(istDateipfad(p), false, p);
  });

  it('normaler Betrieb: 404 für fehlende Dateien, index.html für Seiten', { skip: ohneFastify }, async () => {
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const dienst = new Dienst(speicherRepo(), speicherDateien());
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    const app = await baueApp(dienst, konten, { webDir: web }) as unknown as { inject(o: { method: string; url: string }): Promise<{ statusCode: number; body: string; headers: Record<string, string> }>; close(): Promise<unknown> };
    try {
      await pruefeBetriebsart(async (pfad) => {
        const r = await app.inject({ method: 'GET', url: pfad });
        return { status: r.statusCode, typ: String(r.headers['content-type'] ?? ''), text: r.body, cache: r.headers['cache-control'] };
      });
      assert.equal((await app.inject({ method: 'GET', url: '/api/gibtsnicht' })).statusCode, 404);
    } finally { await app.close(); }
  });

  it('Einrichtungsmodus: dieselbe Regel', { skip: ohneFastify }, async () => {
    const { einrichtungsmodus } = await import('../src/einrichtungsmodus');
    const { Einrichtungscode } = await import('../src/einrichtungscode');
    const geheim = await mkdtemp(join(wurzel, 'geheim-'));
    const code = new Einrichtungscode(geheim);
    const port = await freierPort();
    const fertig = einrichtungsmodus({
      geheim, code, vorbelegt: null, quelle: null, fehler: null, port, host: '127.0.0.1', webDir: web,
      pruefe: async () => ({ ok: true, postgres: '17', eingerichtet: false, benutzer: 0 }), anlegen: async () => {},
    });
    let bereit = false;
    for (let i = 0; i < 100 && !bereit; i++) {
      bereit = await fetch(`http://127.0.0.1:${port}/api/gesundheit`).then((r) => r.ok, () => false);
      if (!bereit) await new Promise((r) => setTimeout(r, 30));
    }
    assert.ok(bereit, 'Einrichtungsmodus antwortet');
    try {
      await pruefeBetriebsart(ueberHttp(port));
    } finally {
      // Modus beenden: Anbindung übernehmen (geprüft wird nur zum Schein).
      const gelesen = (await readFile(join(geheim, 'EINRICHTUNGSCODE'), 'utf8')).trim();
      await fetch(`http://127.0.0.1:${port}/api/einrichtung/datenbank/uebernehmen`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-dms': '1', 'x-einrichtungscode': gelesen },
        body: JSON.stringify({ anbindung: { host: 'db', port: 5432, datenbank: 'dms', benutzer: 'dms', passwort: 'x' } }),
      });
      await fertig;
    }
  });

  it('Lasttestmodus: dieselbe Regel', { skip: ohneFastify }, async () => {
    const { Lasttestmodus } = await import('../src/lasttestmodus');
    class FalschesKind extends EventEmitter { kill() { setImmediate(() => this.emit('exit', null)); return true; } }
    const port = await freierPort();
    const m = new Lasttestmodus({
      wahl: 'klein', dauer: 5, skript: '/x/lasttest.mjs', ziel: 'http://127.0.0.1:1', ergebnisOrdner: join(wurzel, 'ergebnis'), env: {}, speicherart: 'SSD',
      port, host: '127.0.0.1', webDir: web, beenden: () => {},
      starte: () => new FalschesKind() as unknown as ChildProcess,
    });
    await m.start();
    try {
      await pruefeBetriebsart(ueberHttp(port));
    } finally { await m.stop(); }
  });
});
