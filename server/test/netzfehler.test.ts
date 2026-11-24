/**
 * KI-Assistent „fetch failed“ (#1588): Ursache in Worten (Code, Zieladresse, Verdacht „Netz ohne IPv6“), IPv4 zuerst
 * beim sicheren Abruf (jede Adresse weiter geprüft) und Netz für den Paket-Läufer unter dem Berechtigungsmodell von
 * Node (seit Node 25 sperrt `--permission` ohne `--allow-net` jeden Abruf).
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { sichererAbruf } from '../src/automatisierung';
import { mitNetzUrsache, netzUrsache } from '../src/grundlagen/fehler';
import { laeuferRechte } from '../src/laeufer/modul';

let server: Server;
let port = 0;
before(async () => {
  server = createServer((_q, r) => r.end('ok'));
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as { port: number }).port;
});
after(() => server.close());

const fehler = (code: string, address?: string) => Object.assign(new Error(`connect ${code}`), { code, ...(address ? { address } : {}) });

describe('Ursache eines Netzfehlers (#1588)', () => {
  it('aus cause und aus allen Einzelfehlern (Happy Eyeballs), mit Verdacht „Netz ohne IPv6“', () => {
    const fetchFehler = new TypeError('fetch failed', { cause: fehler('ENETUNREACH', '2001:db8::1') });
    assert.equal(mitNetzUrsache(fetchFehler), 'fetch failed (Keine Verbindung zu 2001:db8::1 – Netz ohne IPv6?)');
    const alle = new TypeError('fetch failed', {
      cause: Object.assign(new AggregateError([fehler('ETIMEDOUT', '2001:db8::1'), fehler('ECONNREFUSED', '192.0.2.1')]), {
        code: 'ETIMEDOUT',
      }),
    });
    assert.equal(netzUrsache(alle), 'Keine Verbindung zu 2001:db8::1 – Netz ohne IPv6? ECONNREFUSED bei 192.0.2.1');
    assert.match(mitNetzUrsache(new TypeError('fetch failed', { cause: fehler('ERR_ACCESS_DENIED') })), /verweigert den Netzzugriff/);
    assert.match(
      mitNetzUrsache(new TypeError('fetch failed', { cause: fehler('ENOTFOUND') })),
      /Name lässt sich nicht auflösen \(ENOTFOUND\)/,
    );
    assert.equal(mitNetzUrsache(new Error('Zeitgrenze erreicht')), 'Zeitgrenze erreicht', 'ohne Code bleibt die Meldung');
  });
});

describe('Sicherer Abruf: IPv4 zuerst, jede Adresse geprüft (#1588)', () => {
  const aufloesen = (ips: string[]) => (_h: string, cb: (e: Error | null, a: Array<{ address: string; family: number }>) => void) =>
    cb(
      null,
      ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    );
  it('nennt der Name zuerst IPv6, verbindet Ablago trotzdem über IPv4', async () => {
    const r = await sichererAbruf(
      { adresse: `http://ha.home.arpa:${port}/`, methode: 'GET', koepfe: {}, heimnetz: true },
      { aufloesen: aufloesen(['2001:db8::1', '127.0.0.1']), zeitlimitMs: 5000 },
    );
    assert.equal(r.ok, true, r.fehler ?? '');
  });
  it('die Sperre gegen private Adressen gilt weiter für jede Adresse', async () => {
    const r = await sichererAbruf(
      { adresse: `https://hooks.example.org:${port}/`, methode: 'GET', koepfe: {}, heimnetz: false },
      { aufloesen: aufloesen(['2606:4700::1111', '127.0.0.1']) },
    );
    assert.match(r.fehler ?? '', /SSRF/);
    assert.equal(r.dauerhaft, true);
  });
});

describe('Paket-Läufer: Netz unter dem Berechtigungsmodell (#1588)', () => {
  it('mit --allow-net, wo Node es kennt; ohne nicht', () => {
    assert.deepEqual(laeuferRechte('/app/dist', new Set()), [
      '--permission',
      '--allow-worker',
      '--allow-fs-read=/app/dist',
      '--disable-warning=SecurityWarning',
    ]);
    assert.ok(laeuferRechte('/app/dist', new Set(['--allow-net'])).includes('--allow-net'));
  });

  it('ein Abruf gelingt mit den Rechten des Läufers', async (t) => {
    if (!process.allowedNodeEnvironmentFlags.has('--allow-net')) {
      t.skip('Node ohne --allow-net: das Berechtigungsmodell sperrt das Netz hier nicht');
      return;
    }
    const ordner = await mkdtemp(join(tmpdir(), 'dms-laeufer-netz-'));
    const ausgabe = await new Promise<string>((fertig, fehler) =>
      execFile(
        process.execPath,
        [
          ...laeuferRechte(ordner),
          '-e',
          `fetch('http://127.0.0.1:${port}/').then((r) => console.log(r.status), (e) => console.log(e.cause?.code ?? e.message))`,
        ],
        { timeout: 20_000 },
        (e, aus, err) => (e ? fehler(new Error(`${e.message}\n${err}`)) : fertig(aus.trim())),
      ),
    );
    assert.equal(ausgabe, '200');
  });
});
