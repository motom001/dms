import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { PRIVATE_NETZE, proxyVertrauen } from '../src/proxy';

test('TRUST_PROXY: auto als Standard, true/false, Listen, Fehler', () => {
  assert.deepEqual(proxyVertrauen(undefined).trust, PRIVATE_NETZE);
  assert.deepEqual(proxyVertrauen('').trust, PRIVATE_NETZE);
  assert.deepEqual(proxyVertrauen('auto').trust, PRIVATE_NETZE);
  assert.equal(proxyVertrauen('false').trust, false);
  assert.equal(proxyVertrauen('TRUE').trust, true);
  assert.deepEqual(proxyVertrauen('172.18.0.0/16, 10.0.0.5').trust, ['172.18.0.0/16', '10.0.0.5']);
  assert.deepEqual(proxyVertrauen('fd00::/8').trust, ['fd00::/8']);
  const f = proxyVertrauen('ja bitte');
  assert.deepEqual(f.trust, PRIVATE_NETZE);
  assert.match(f.fehler ?? '', /ja bitte/);
  assert.ok(proxyVertrauen('10.0.0.0/33').fehler);
});

async function frage(trust: ReturnType<typeof proxyVertrauen>['trust'], remoteAddress: string) {
  const app = Fastify({ trustProxy: trust });
  app.get('/', async (req) => ({ ip: req.ip, protokoll: req.protocol }));
  const r = await app.inject({ url: '/', remoteAddress, headers: { 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https' } });
  await app.close();
  return r.json() as { ip: string; protokoll: string };
}

test('auto: Proxy im Heimnetz oder Docker-Netz wird geglaubt, Absender aus dem Internet nicht', async () => {
  const auto = proxyVertrauen(undefined).trust;
  for (const proxy of ['172.18.0.2', '192.168.1.20', '10.0.0.3', '127.0.0.1', '::1', 'fd12::5']) {
    assert.deepEqual(await frage(auto, proxy), { ip: '203.0.113.7', protokoll: 'https' }, proxy);
  }
  assert.deepEqual(await frage(auto, '198.51.100.9'), { ip: '198.51.100.9', protokoll: 'http' });
  assert.deepEqual(await frage(false, '172.18.0.2'), { ip: '172.18.0.2', protokoll: 'http' });
});
