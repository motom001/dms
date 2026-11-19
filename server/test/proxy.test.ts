import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Gateways } from '../src/http/gateway';
import { ausdruecklichVertraut, proxyVertrauen } from '../src/http/proxy';

/** Feste Gateways statt der Routing-Tabelle des Testrechners (#1355). */
const DOCKER = new Gateways(() => ['172.17.0.1', 'fe80::1']);

test('TRUST_PROXY: auto als Standard, true/false, Listen, Fehler', () => {
  // auto (#1355): eine Funktion – private Gegenstellen, aber kein Gateway.
  for (const w of [undefined, '', 'auto', ' AUTO ']) {
    const f = proxyVertrauen(w, DOCKER).trust as (a: string, hop: number) => boolean;
    assert.equal(typeof f, 'function', String(w));
    assert.ok(f('172.18.0.2', 0) && f('192.168.1.20', 0) && f('::1', 0) && f('::ffff:10.0.0.3', 0), String(w));
    assert.ok(!f('172.17.0.1', 0) && !f('::ffff:172.17.0.1', 0) && !f('fe80::1', 0) && !f('203.0.113.7', 0), String(w));
  }
  assert.equal(proxyVertrauen('false').trust, false);
  assert.equal(proxyVertrauen('TRUE').trust, true);
  assert.deepEqual(proxyVertrauen('172.18.0.0/16, 10.0.0.5').trust, ['172.18.0.0/16', '10.0.0.5']);
  assert.deepEqual(proxyVertrauen('fd00::/8').trust, ['fd00::/8']);
  // „aus“ in üblichen Schreibweisen (#1350).
  for (const w of ['0', 'no', 'OFF', 'nein', ' False ']) {
    const r = proxyVertrauen(w);
    assert.equal(r.trust, false, w);
    assert.equal(r.fehler, undefined, w);
  }
  // Ungültiger Wert (#1350): niemandem glauben statt „auto“, mit Meldung.
  for (const w of ['ja bitte', 'flase', '10.0.0.0/33', '172.18.0.0/16, quatsch']) {
    const f = proxyVertrauen(w);
    assert.equal(f.trust, false, w);
    assert.ok(f.fehler, w);
  }
  assert.match(proxyVertrauen('ja bitte').fehler ?? '', /ja bitte/);
});

async function frage(trust: ReturnType<typeof proxyVertrauen>['trust'], remoteAddress: string) {
  // Fastify (proxy-addr) ruft die Funktion mit Adresse und Stufe auf; Listen und true/false nimmt es direkt.
  const app = Fastify({ trustProxy: trust });
  app.get('/', async (req) => ({ ip: req.ip, protokoll: req.protocol }));
  const r = await app.inject({ url: '/', remoteAddress, headers: { 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https' } });
  await app.close();
  return r.json() as { ip: string; protokoll: string };
}

test('auto: Proxy im Heimnetz oder Docker-Netz wird geglaubt, Absender aus dem Internet nicht', async () => {
  const auto = proxyVertrauen(undefined, DOCKER).trust;
  for (const proxy of ['172.18.0.2', '192.168.1.20', '10.0.0.3', '127.0.0.1', '::1', 'fd12::5']) {
    assert.deepEqual(await frage(auto, proxy), { ip: '203.0.113.7', protokoll: 'https' }, proxy);
  }
  assert.deepEqual(await frage(auto, '198.51.100.9'), { ip: '198.51.100.9', protokoll: 'http' });
  assert.deepEqual(await frage(false, '172.18.0.2'), { ip: '172.18.0.2', protokoll: 'http' });
});

test('auto (#1355): das Gateway des eigenen Netzes gilt nicht von selbst als Proxy – ausdrücklich eingetragen schon', async () => {
  const auto = proxyVertrauen(undefined, DOCKER).trust;
  for (const gw of ['172.17.0.1', '::ffff:172.17.0.1', 'fe80::1'])
    assert.deepEqual(await frage(auto, gw), { ip: gw, protokoll: 'http' }, gw);
  // Ein Proxy auf einem anderen Rechner im Heimnetz und ein Proxy-Container daneben bleiben automatisch vertraut.
  assert.deepEqual(await frage(auto, '192.168.1.10'), { ip: '203.0.113.7', protokoll: 'https' });
  assert.deepEqual(await frage(auto, '172.18.0.5'), { ip: '203.0.113.7', protokoll: 'https' });
  // Reverse-Proxy auf dem Rechner selbst: TRUST_PROXY ausdrücklich auf die Gateway-Adresse.
  assert.deepEqual(await frage(proxyVertrauen('172.17.0.1', DOCKER).trust, '172.17.0.1'), { ip: '203.0.113.7', protokoll: 'https' });
});

test('ausdrücklich in TRUST_PROXY (#1355): Adresse oder Netz – benannte Netze, auto, true und false nicht', () => {
  assert.ok(ausdruecklichVertraut(['172.17.0.1'], '172.17.0.1'));
  assert.ok(ausdruecklichVertraut(['172.16.0.0/12'], '::ffff:172.17.0.1'));
  assert.ok(ausdruecklichVertraut(['fe80::/10'], 'fe80::1%eth0'));
  assert.ok(!ausdruecklichVertraut(['uniquelocal', 'linklocal'], '172.17.0.1'), 'benannte Netze nennen das Gateway nicht');
  assert.ok(!ausdruecklichVertraut(['172.18.0.5'], '172.17.0.1'));
  assert.ok(!ausdruecklichVertraut(['172.17.0.1'], undefined));
  for (const v of [proxyVertrauen(undefined, DOCKER).trust, true, false, undefined])
    assert.ok(!ausdruecklichVertraut(v, '172.17.0.1'), String(v));
});
