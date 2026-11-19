/**
 * Reverse-Proxy auf demselben Rechner, `TRUST_PROXY` nicht gesetzt (#1355): Der Proxy kommt über das Gateway des
 * Docker-Netzes, dem Ablago nicht von selbst glaubt. Trotzdem darf niemand ausgesperrt werden oder in eine
 * Weiterleitungsschleife geraten: Einrichten, Anmelden, Verwaltungsmodus und Werkbank gehen; Cookie `Secure` und HSTS
 * folgen dem HTTPS des Proxys; Links, OIDC-Rückleitung und Passkey-RP bekommen die öffentliche Adresse. Adresse,
 * Heimnetz und Sperre je IP bleiben beim Gateway – und die Werkbank nennt es.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InjectOptions } from 'fastify';
import { relyingParty } from '../src/anmeldung/passkeys';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Gateways } from '../src/http/gateway';
import { baueApp } from '../src/http/http';
import { proxyVertrauen, ursprungAus } from '../src/http/proxy';
import { Konten } from '../src/konten';
import { Notfallcode } from '../src/notfall/notfallcode';
import { speicherKontoRepo } from '../src/konten/konto-repo';
import { kontext } from '../src/protokoll/protokoll';
import { speicherRepo } from '../src/repo/speicher';

const DOCKER = new Gateways(() => ['172.17.0.1']);
const PW = 'ein-langes-passwort';
/** So schickt ein Reverse-Proxy auf dem Rechner (z. B. DSM auf `localhost:8080`) die Anfrage weiter. */
const VOM_PROXY = {
  host: 'localhost:8080',
  'x-forwarded-for': '192.168.1.5',
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'dms.example.org',
  'x-dms': '1',
};

describe('Reverse-Proxy auf demselben Rechner ohne TRUST_PROXY (#1355): Anmeldung bis zur Werkbank', () => {
  it('einrichten, anmelden, Verwaltungsmodus, Werkbank – ohne Weiterleitung, mit Secure und HSTS, Hinweis mit Adresse', async () => {
    const dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    dienst.verbindeKonten(konten.papierkorbHaken());
    // Wie Betrieb ohne gepflegte Adresse: Secure nach dem Ursprung der Anfrage (betrieb.cookieNurHttps).
    const sicher = () => (kontext.getStore()?.ursprung ?? '').startsWith('https://');
    const proxy = proxyVertrauen(undefined, DOCKER).trust;
    const notfallcode = new Notfallcode({ konten, einstellungen: speicherEinstellungen(), mailer: () => null, proxy, gateways: DOCKER });
    const app = await baueApp(dienst, konten, { proxy, gateways: DOCKER, sicher, notfallcode });
    let cookie = '';
    const rufe = async (method: InjectOptions['method'], url: string, payload?: unknown) => {
      const r = await app.inject({
        method,
        url,
        remoteAddress: '172.17.0.1',
        headers: { ...VOM_PROXY, ...(cookie ? { cookie } : {}) },
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
      assert.ok(r.statusCode < 300, `${method} ${url}: ${r.statusCode} ${r.body}`);
      assert.equal(r.headers.location, undefined, `${url}: keine Weiterleitung`);
      return r;
    };

    const e = await rufe('POST', '/api/konto/einrichten', { email: 'markus@example.org', name: 'Markus', passwort: PW });
    assert.match(String(e.headers['set-cookie']), /; Secure/, 'HTTPS des Proxys erkannt: Cookie Secure');
    assert.match(String(e.headers['strict-transport-security']), /max-age/, 'HSTS wie hinter jedem HTTPS-Proxy');
    await rufe('POST', '/api/konto/abmelden');
    cookie = '';
    const a = await rufe('POST', '/api/konto/anmelden', { email: 'markus@example.org', passwort: PW });
    cookie = String(a.headers['set-cookie']).split(';')[0];
    assert.match(String(a.headers['set-cookie']), /; Secure/);
    await rufe('POST', '/api/konto/verwaltung', {});

    // Adresse und Anmeldeschutz: das Gateway, nicht die Angabe des Proxys.
    assert.equal((await rufe('GET', '/api/werkbank/anmeldeschutz')).json().deineIp, '172.17.0.1');
    assert.deepEqual(
      (({ heimnetz, grund }) => ({ heimnetz, grund }))((await rufe('GET', '/api/werkbank/anmeldeschutz/notfallzugang')).json()),
      { heimnetz: false, grund: 'gateway' },
    );
    // Die Übersicht nennt die Gateway-Adresse (die Meldung in den Kurzzustand läuft ohne Warten).
    let hinweis: { adresse?: string } | null = null;
    for (let i = 0; i < 50 && !hinweis; i++) {
      hinweis = (await rufe('GET', '/api/werkbank/uebersicht')).json().heimnetzGateway;
      if (!hinweis) await new Promise((ok) => setTimeout(ok, 10));
    }
    assert.equal(hinweis?.adresse, '172.17.0.1');
    // Die Seite /notfall: von hier nicht erlaubt (Heimnetz nicht bestimmbar), aber erreichbar.
    assert.equal((await rufe('GET', '/api/notfall')).json().erlaubt, false);
    await app.close();
  });

  it('Ursprung: öffentliche Adresse für Links, OIDC und Passkeys – aber nur bei auto und Gateway-Gegenstelle', () => {
    const req = (remoteAddress: string, protocol = 'http', host = 'localhost:8080') => ({
      protocol,
      host,
      socket: { remoteAddress },
      headers: VOM_PROXY,
    });
    const auto = proxyVertrauen(undefined, DOCKER).trust;
    const u = ursprungAus(req('172.17.0.1'), auto, DOCKER);
    assert.deepEqual(u, { https: true, ursprung: 'https://dms.example.org' });
    assert.equal(relyingParty(u.ursprung)?.rpId, 'dms.example.org', 'Passkeys gehen');
    // TRUST_PROXY=false oder eine Liste: allein, was Fastify bestimmt hat.
    assert.deepEqual(ursprungAus(req('172.17.0.1'), false, DOCKER), { https: false, ursprung: 'http://localhost:8080' });
    assert.deepEqual(ursprungAus(req('172.17.0.1'), ['172.18.0.5'], DOCKER), { https: false, ursprung: 'http://localhost:8080' });
    // Andere Gegenstelle: Fastify hat schon entschieden (hier: vertraut, Werte übernommen).
    assert.deepEqual(ursprungAus(req('192.168.1.10', 'https', 'dms.example.org'), auto, DOCKER), {
      https: true,
      ursprung: 'https://dms.example.org',
    });
    // Unsinniger Host-Kopf wird nicht übernommen.
    const kaputt = { ...req('172.17.0.1'), headers: { ...VOM_PROXY, 'x-forwarded-host': 'evil.example/pfad' } };
    assert.equal(ursprungAus(kaputt, auto, DOCKER).ursprung, 'https://localhost:8080');
  });
});
