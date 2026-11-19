/**
 * Heimnetz nicht bestimmbar (#1355): Kommen Anfragen mit der Gateway-Adresse des eigenen Netzes an (Docker-Userland-Proxy,
 * Docker Desktop, Rootless Docker), kann Ablago Heimnetz und Internet nicht unterscheiden. Solche Anfragen gelten nicht
 * als Heimnetz, die Werkbank nennt den Grund. Sicherheitsregel: Die Erkennung macht die Prüfung nur strenger – keine
 * Anfrage wird dadurch zum Heimnetz, die es vorher nicht war.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { GATEWAY_HINWEIS_MS, GATEWAY_MELDEN_MS, GatewayBeobachtung, Gateways, gatewaysIpv4, gatewaysIpv6 } from '../src/http/gateway';
import { heimnetzStand, istHeimnetz } from '../src/notfall/notfallcode';
import { pgKurzzustand, speicherKurzzustand, type Kurzzustand } from '../src/zwischenspeicher/kurzzustand';

const kopf = (k: Record<string, string>) => (n: string) => k[n];
const AUTO = ['loopback', 'linklocal', 'uniquelocal'];
const fest = (...a: string[]) => new Gateways(() => a);
const KEINE = fest();
const DOCKER = fest('172.17.0.1', 'fe80::1');

// So sieht /proc/net/route in einem Container im Standard-Bridge-Netz aus (Gateway 172.17.0.1, Little Endian).
const ROUTE = `Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT
eth0\t00000000\t010011AC\t0003\t0\t0\t0\t00000000\t0\t0\t0
eth0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0
`;
const ROUTE6 = `00000000000000000000000000000000 00 00000000000000000000000000000000 00 fe800000000000000000000000000001 00000400 00000001 00000000 00450003     eth0
fd000000000000000000000000000000 40 00000000000000000000000000000000 00 00000000000000000000000000000000 00000100 00000001 00000000 00000001     eth0
`;

describe('Heimnetz nicht bestimmbar (#1355): Gateways aus der Routing-Tabelle', () => {
  it('liest das Gateway aus /proc/net/route und /proc/net/ipv6_route, nur Routen über ein Gateway', () => {
    assert.deepEqual(gatewaysIpv4(ROUTE), ['172.17.0.1']);
    assert.deepEqual(gatewaysIpv6(ROUTE6), ['fe80:0000:0000:0000:0000:0000:0000:0001']);
    assert.deepEqual(gatewaysIpv4(''), []);
    assert.deepEqual(gatewaysIpv6('kaputt'), []);
  });

  it('erkennt das Gateway auch als IPv4 in IPv6, mit Zonenangabe und in anderer Schreibweise', () => {
    const g = new Gateways(() => [...gatewaysIpv4(ROUTE), ...gatewaysIpv6(ROUTE6)]);
    for (const ip of ['172.17.0.1', '::ffff:172.17.0.1', 'fe80::1', 'fe80::1%eth0', 'FE80:0:0:0:0:0:0:1']) assert.ok(g.ist(ip), ip);
    for (const ip of ['172.17.0.2', '192.168.1.20', '', 'kaputt', undefined]) assert.ok(!g.ist(ip), String(ip));
  });

  it('ohne lesbare Routing-Tabelle gibt es keine Gateways (dann ändert sich nichts); sie wird nach einer Minute neu gelesen', () => {
    const kaputt = new Gateways(() => {
      throw new Error('kein /proc');
    });
    assert.deepEqual(kaputt.alle(), []);
    let jetzt = 0;
    let liste = ['172.17.0.1'];
    const g = new Gateways(
      () => liste,
      () => jetzt,
    );
    assert.ok(g.ist('172.17.0.1'));
    liste = ['172.18.0.1'];
    jetzt = 30_000;
    assert.ok(g.ist('172.17.0.1'), 'noch zwischengespeichert');
    jetzt = 61_000;
    assert.ok(!g.ist('172.17.0.1') && g.ist('172.18.0.1'), 'neu gelesen');
  });
});

describe('Heimnetz nicht bestimmbar (#1355): Anfragen vom Gateway gelten nicht als Heimnetz', () => {
  it('ohne Proxy-Angabe: die Gateway-Adresse ist nicht Heimnetz, mit dem Grund „gateway“', () => {
    for (const ip of ['172.17.0.1', '::ffff:172.17.0.1', 'fe80::1']) {
      assert.equal(istHeimnetz({ ip, kopf: kopf({}) }, AUTO, DOCKER), false, ip);
      assert.deepEqual(heimnetzStand({ ip, kopf: kopf({}) }, AUTO, DOCKER), { heimnetz: false, grund: 'gateway' }, ip);
    }
    // Andere Adressen im selben Netz und im Heimnetz bleiben, wie sie waren.
    assert.equal(istHeimnetz({ ip: '172.17.0.5', kopf: kopf({}) }, AUTO, DOCKER), true);
    assert.equal(istHeimnetz({ ip: '192.168.1.20', kopf: kopf({}) }, false, DOCKER), true);
  });

  it('hinter einem vertrauenswürdigen Proxy zählt die weitergegebene Adresse – ist sie das Gateway, ebenfalls nicht Heimnetz', () => {
    // Ein Proxy auf dem Rechner spricht über das Gateway mit Ablago; Fastify hat a.ip schon aus X-Forwarded-For bestimmt.
    assert.deepEqual(heimnetzStand({ ip: '192.168.1.20', kopf: kopf({ 'x-forwarded-for': '192.168.1.20' }) }, AUTO, DOCKER), {
      heimnetz: true,
    });
    assert.deepEqual(heimnetzStand({ ip: '172.17.0.1', kopf: kopf({ 'x-forwarded-for': '172.17.0.1' }) }, AUTO, DOCKER), {
      heimnetz: false,
      grund: 'gateway',
    });
    // Nicht geglaubte Proxy-Angaben behalten ihren Grund (#885).
    assert.deepEqual(heimnetzStand({ ip: '172.17.0.1', kopf: kopf({ 'x-forwarded-for': '192.168.1.20' }) }, false, DOCKER), {
      heimnetz: false,
      grund: 'proxy',
    });
  });

  it('Sicherheitsregel: mit Gateways ist eine Anfrage nie Heimnetz, die es ohne nicht war – und ohne Gateways ändert sich nichts', () => {
    const adressen = ['172.17.0.1', '::ffff:172.17.0.1', 'fe80::1', '172.17.0.5', '192.168.1.20', '10.0.0.2', '::1', '203.0.113.7', ''];
    const koepfe: Array<Record<string, string>> = [
      {},
      { 'x-forwarded-for': '192.168.1.20' },
      { 'x-real-ip': '192.168.1.20' },
      { forwarded: 'for=192.0.2.9' },
    ];
    const vertrauen = [AUTO, false, true, undefined, ['172.17.0.1']] as const;
    const gatewaylisten = [DOCKER, fest('192.168.1.20'), fest('203.0.113.7', '::1'), fest('kein gateway')];
    let faelle = 0;
    for (const ip of adressen)
      for (const k of koepfe)
        for (const v of vertrauen) {
          const a = { ip, kopf: kopf(k) };
          const vorher = istHeimnetz(a, v as never, KEINE);
          for (const g of gatewaylisten) {
            const nachher = istHeimnetz(a, v as never, g);
            assert.ok(!nachher || vorher, `lockerer: ${ip} ${JSON.stringify(k)} ${JSON.stringify(v)}`);
            assert.equal(heimnetzStand(a, v as never, g).heimnetz, nachher, 'heimnetzStand folgt istHeimnetz');
            faelle++;
          }
        }
    assert.ok(faelle > 500);
  });
});

describe('Heimnetz nicht bestimmbar (#1355): Hinweis in der Werkbank', () => {
  it('merkt sich die letzte Anfrage vom Gateway für 24 Stunden; andere Adressen ändern nichts', async () => {
    let jetzt = Date.parse('2026-11-19T10:00:00Z');
    const b = new GatewayBeobachtung(DOCKER, () => jetzt);
    assert.equal(await b.stand(), null);
    b.notiere('192.168.1.20');
    b.notiere('127.0.0.1');
    assert.equal(await b.stand(), null);
    b.notiere('::ffff:172.17.0.1');
    assert.deepEqual(await b.stand(), { adresse: '172.17.0.1', zuletzt: '2026-11-19T10:00:00.000Z' });
    jetzt += GATEWAY_HINWEIS_MS;
    b.notiere('192.168.1.20');
    assert.deepEqual((await b.stand())?.adresse, '172.17.0.1', 'genau 24 Stunden: noch da');
    jetzt += 1;
    assert.equal(await b.stand(), null, 'danach weg');
  });

  it('meldet höchstens einmal je Minute in den Kurzzustand, nur Anfragen vom Gateway, ohne auf die Datenbank zu warten', async () => {
    let jetzt = Date.parse('2026-11-19T10:00:00Z');
    const echt = speicherKurzzustand(() => jetzt);
    const geschrieben: unknown[] = [];
    const zustand: Kurzzustand = {
      ...echt,
      setze: async (...x) => {
        geschrieben.push(x);
        await echt.setze(...x);
      },
    };
    const b = new GatewayBeobachtung(DOCKER, () => jetzt);
    for (let i = 0; i < 100; i++) b.notiere(i % 2 ? '172.17.0.1' : '192.168.1.20', zustand);
    assert.equal(geschrieben.length, 1, '100 Anfragen in derselben Sekunde: eine Meldung');
    jetzt += GATEWAY_MELDEN_MS - 1;
    b.notiere('172.17.0.1', zustand);
    assert.equal(geschrieben.length, 1);
    jetzt += 1;
    b.notiere('172.17.0.1', zustand);
    assert.equal(geschrieben.length, 2, 'nach einer Minute die nächste');
    // Schreiben scheitert: die Anfrage merkt nichts davon.
    jetzt += GATEWAY_MELDEN_MS;
    b.notiere('172.17.0.1', { ...zustand, setze: async () => Promise.reject(new Error('Datenbank weg')) });
    await new Promise((ok) => setImmediate(ok));
    // Lesen scheitert: der eigene Stand bleibt.
    assert.equal((await b.stand({ ...zustand, liste: async () => Promise.reject(new Error('weg')) }))?.adresse, '172.17.0.1');
  });
});

describe(
  'Heimnetz nicht bestimmbar (#1355): zwei Prozesse an derselben Datenbank',
  { skip: !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL' },
  () => {
    it('sieht ein Prozess Anfragen vom Gateway, zeigt die Werkbank sie auch beim anderen', async () => {
      const { eigeneDatenbank } = await import('./hilfe-db');
      const db = await eigeneDatenbank('heimnetz_gateway');
      const H = randomUUID();
      await db.sql`INSERT INTO haushalte (id, name) VALUES (${H}, 'Test')`;
      // Zwei Prozesse: je eigene Beobachtung und eigener Kurzzustand, dieselbe Datenbank.
      const [za, zb] = [pgKurzzustand(db.sql, H), pgKurzzustand(db.sql, H)];
      const [a, b] = [new GatewayBeobachtung(DOCKER), new GatewayBeobachtung(DOCKER)];
      assert.equal(await b.stand(zb), null);
      a.notiere('192.168.1.20', za);
      assert.equal(await b.stand(zb), null, 'Heimnetz-Adresse: nichts gemeldet');
      a.notiere('172.17.0.1', za);
      // Die Meldung läuft ohne Warten; kurz nachsehen, bis sie in der Datenbank steht.
      let s = null;
      for (let i = 0; i < 50 && !s; i++) {
        s = await b.stand(zb);
        if (!s) await new Promise((ok) => setTimeout(ok, 20));
      }
      assert.equal(s?.adresse, '172.17.0.1', 'Prozess B sieht, was Prozess A gesehen hat');
      // Ein anderer Haushalt sieht es nicht.
      assert.equal(await new GatewayBeobachtung(DOCKER).stand(pgKurzzustand(db.sql, randomUUID())), null);
      // Beide melden: die jüngste Anfrage zählt.
      await zb.setze('heimnetz-gateway', 'fe80::1', Date.now() + 1000, Date.now() + GATEWAY_HINWEIS_MS);
      assert.equal((await a.stand(za))?.adresse, 'fe80::1');
      await db.ende();
    });
  },
);
