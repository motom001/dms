/**
 * Paket-Läufer (#1628): Abrufe auf Adressen aus dem Manifest nur zu öffentlichen Zielen, geprüft beim Verbinden wie
 * „URL aufrufen“. Bestätigte Dienst-Adressen dürfen weiter ins Heimnetz.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { manifestHostGesperrt, netzErlaubt, netzZiel, oeffentlichesNetz } from '../src/laeufer/prozess';
import { AdresseGesperrt } from '../src/grundlagen/netzadressen';

let server: Server;
let port = 0;
before(async () => {
  server = createServer((_q, r) => r.end('INTERN'));
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as { port: number }).port;
});
after(() => server.close());

const aufloesenNach = (ips: string[]) => (_h: string, cb: (e: Error | null, a: Array<{ address: string; family: number }>) => void) =>
  cb(
    null,
    ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
  );

describe('Manifest-Adressen nur öffentlich (#1628)', () => {
  it('Dienst-Adresse vor Manifest, sonst Manifest, sonst nichts', () => {
    const manifest = ['https://api.example.org/v1'];
    assert.equal(netzZiel('https://api.example.org/v1/x', manifest), 'manifest');
    assert.equal(netzZiel('http://192.168.1.20:11434/api/x', manifest, ['http://192.168.1.20:11434']), 'dienst');
    assert.equal(netzZiel('https://api.example.org/v1/x', manifest, ['https://api.example.org']), 'dienst', 'bestätigt gilt');
    assert.equal(netzZiel('https://anders.example.org/', manifest), null);
    assert.equal(netzErlaubt('https://api.example.org/v1/x', manifest), true, 'netzErlaubt bleibt gleich');
  });

  it('IP im Host einer Manifest-Adresse wird gleich geprüft', () => {
    for (const url of [
      'https://127.0.0.1/',
      'https://[::1]/',
      'https://10.0.0.5:8443/x',
      'https://192.168.178.1/',
      'https://169.254.169.254/latest',
      'https://[::ffff:127.0.0.1]/',
    ])
      assert.equal(manifestHostGesperrt(url), true, url);
    for (const url of ['https://api.example.org/', 'https://1.1.1.1/', 'https://[2606:4700::1111]/'])
      assert.equal(manifestHostGesperrt(url), false, url);
  });

  it('Node bringt den Dispatcher mit (sonst wäre das Netz für Manifest-Adressen zu)', async () => {
    assert.ok(await oeffentlichesNetz());
  });

  it('Name zeigt aufs Heimnetz oder auf diesen Rechner → gesperrt, nichts geht hinaus', async () => {
    for (const ips of [['127.0.0.1'], ['192.168.1.5'], ['93.184.215.14', '127.0.0.1'], ['::1']]) {
      const dispatcher = await oeffentlichesNetz(aufloesenNach(ips));
      const fehler = await fetch(`http://dienst.example.org:${port}/`, { dispatcher } as RequestInit).then(
        () => null,
        (e: unknown) => e as { cause?: unknown },
      );
      assert.ok(fehler, ips.join());
      assert.ok(fehler.cause instanceof AdresseGesperrt, `${ips.join()}: ${String(fehler.cause)}`);
    }
  });

  it('ohne den geprüften Dispatcher erreicht derselbe Abruf das Ziel (Gegenprobe)', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await r.text(), 'INTERN');
  });
});
