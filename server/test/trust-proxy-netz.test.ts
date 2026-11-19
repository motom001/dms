/**
 * TRUST_PROXY mit einem ganzen Netz statt der Adresse des Proxys (#1465): Kommen Anfragen direkt vom Gateway und deckt
 * ein Netz in `TRUST_PROXY` es ab, zeigt die Werkbank (Übersicht, Anmeldeschutz) einen Hinweis. Eine einzeln
 * eingetragene Adresse und ein Netz ohne Anfragen vom Gateway bleiben ohne Hinweis. Wem Ablago glaubt, ändert sich nicht.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InjectOptions } from 'fastify';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Gateways } from '../src/http/gateway';
import { baueApp } from '../src/http/http';
import { netzStattAdresse, proxyNetzHinweis, proxyVertrauen } from '../src/http/proxy';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { Notfallcode } from '../src/notfall/notfallcode';
import { speicherRepo } from '../src/repo/speicher';

const DOCKER = new Gateways(() => ['172.17.0.1']);
const PW = 'ein-langes-passwort';
const ZEIT = '2026-11-19T10:00:00.000Z';

describe('TRUST_PROXY: Netz statt Adresse des Proxys (#1465)', () => {
  it('erkennt ein Netz, das das Gateway abdeckt – nicht die einzelne Adresse', () => {
    const liste = (w: string) => proxyVertrauen(w, DOCKER).trust;
    assert.equal(netzStattAdresse(liste('172.16.0.0/12'), '172.17.0.1'), '172.16.0.0/12');
    assert.equal(netzStattAdresse(liste('172.18.0.5, 172.17.0.0/16'), '172.17.0.1'), '172.17.0.0/16');
    assert.equal(netzStattAdresse(liste('172.17.0.1'), '172.17.0.1'), null, 'einzelne Adresse');
    assert.equal(netzStattAdresse(liste('172.17.0.1/32'), '172.17.0.1'), null, '/32 ist eine Adresse');
    assert.equal(netzStattAdresse(liste('172.18.0.0/16'), '172.17.0.1'), null, 'Netz ohne das Gateway');
    assert.equal(netzStattAdresse(liste('uniquelocal'), '172.17.0.1'), 'uniquelocal', 'benanntes Netz wie Fastify');
    assert.equal(netzStattAdresse(liste('172.16.0.0/12'), '::ffff:172.17.0.1'), '172.16.0.0/12');
    assert.equal(netzStattAdresse(liste('fd00::/8'), 'fd00::1'), 'fd00::/8');
    assert.equal(netzStattAdresse(liste('fd00::1/128'), 'fd00::1'), null);
    // auto, false, true: keine Liste, kein Hinweis.
    for (const w of [undefined, 'auto', 'false', 'true'])
      assert.equal(netzStattAdresse(proxyVertrauen(w, DOCKER).trust, '172.17.0.1'), null);
    // Ohne Anfragen vom Gateway kein Hinweis.
    assert.equal(proxyNetzHinweis(liste('172.16.0.0/12'), null), null);
    assert.deepEqual(proxyNetzHinweis(liste('172.16.0.0/12'), { adresse: '172.17.0.1', zuletzt: ZEIT }), {
      netz: '172.16.0.0/12',
      adresse: '172.17.0.1',
      zuletzt: ZEIT,
    });
  });

  /** Ablago mit diesem TRUST_PROXY; Anfragen kommen von `gegenstelle` mit Angaben eines Proxys. */
  async function ablago(trustProxy: string, gegenstelle: string) {
    const dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    const proxy = proxyVertrauen(trustProxy, DOCKER).trust;
    const notfallcode = new Notfallcode({ konten, einstellungen: speicherEinstellungen(), mailer: () => null, proxy, gateways: DOCKER });
    const app = await baueApp(dienst, konten, { proxy, gateways: DOCKER, notfallcode });
    let cookie = '';
    const rufe = async (method: InjectOptions['method'], url: string, payload?: unknown) => {
      const r = await app.inject({
        method,
        url,
        remoteAddress: gegenstelle,
        headers: { 'x-forwarded-for': '192.168.1.5', 'x-dms': '1', ...(cookie ? { cookie } : {}) },
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
      assert.ok(r.statusCode < 300, `${method} ${url}: ${r.statusCode} ${r.body}`);
      return r;
    };
    const e = await rufe('POST', '/api/konto/einrichten', { email: 'markus@example.org', name: 'Markus', passwort: PW });
    cookie = String(e.headers['set-cookie']).split(';')[0];
    await rufe('POST', '/api/konto/verwaltung', {});
    /** Hinweise der Übersicht und des Notfallzugangs; die Meldung in den Kurzzustand läuft ohne Warten. */
    const hinweise = async (warten: boolean) => {
      let u: { netz: string; adresse: string } | null = null;
      for (let i = 0; i < (warten ? 50 : 3) && !u; i++) {
        u = (await rufe('GET', '/api/werkbank/uebersicht')).json().trustProxyNetz ?? null;
        if (!u) await new Promise((ok) => setTimeout(ok, 10));
      }
      const n = (await rufe('GET', '/api/werkbank/anmeldeschutz/notfallzugang')).json().proxyNetz ?? null;
      return { u, n, deineIp: (await rufe('GET', '/api/werkbank/anmeldeschutz')).json().deineIp as string };
    };
    return { app, hinweise };
  }

  it('Netz mit Gateway → Hinweis in Übersicht und Anmeldeschutz; das Vertrauen bleibt wie eingestellt', async () => {
    const x = await ablago('172.16.0.0/12', '172.17.0.1');
    const h = await x.hinweise(true);
    assert.deepEqual(h.u && { netz: h.u.netz, adresse: h.u.adresse }, { netz: '172.16.0.0/12', adresse: '172.17.0.1' });
    assert.deepEqual(h.n && { netz: h.n.netz, adresse: h.n.adresse }, { netz: '172.16.0.0/12', adresse: '172.17.0.1' });
    assert.equal(h.deineIp, '192.168.1.5', 'das Netz glaubt dem Gateway weiter – nur ein Hinweis');
    await x.app.close();
  });

  it('einzelne Adresse → kein Hinweis', async () => {
    const x = await ablago('172.17.0.1', '172.17.0.1');
    const h = await x.hinweise(false);
    assert.deepEqual([h.u, h.n], [null, null]);
    assert.equal(h.deineIp, '192.168.1.5');
    await x.app.close();
  });

  it('Netz ohne Anfragen vom Gateway → kein Hinweis', async () => {
    const x = await ablago('172.16.0.0/12', '172.18.0.5');
    const h = await x.hinweise(false);
    assert.deepEqual([h.u, h.n], [null, null]);
    await x.app.close();
  });
});
