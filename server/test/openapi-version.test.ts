/**
 * openapi.json nennt die genaue Version von Ablago nur angemeldet (#1067), wie /api/konto/status. Ohne Anmeldung steht
 * in `info.version` nur die Version der API – sonst ließe sich von außen ablesen, welche Version läuft.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { API_VERSION_OHNE_ANMELDUNG } from '../src/api-v1';
import { eigeneVersion } from '../src/system';

interface App { inject(o: { method: string; url: string; headers?: Record<string, string>; payload?: unknown }): Promise<{ statusCode: number; body: string; headers: Record<string, string | string[] | undefined> }>; close(): Promise<unknown> }

describe('openapi.json ohne genaue Version ohne Anmeldung (#1067)', () => {
  let app: App;
  let cookie = '';
  let schluessel = '';
  before(async () => {
    const { baueApp } = await import('../src/http');
    const { Dienst } = await import('../src/dienst');
    const { speicherRepo } = await import('../src/repo-speicher');
    const { speicherDateien } = await import('../src/dateispeicher');
    const { speicherEinstellungen } = await import('../src/einstellungen');
    const { Konten } = await import('../src/konten');
    const { speicherKontoRepo } = await import('../src/konto-repo');
    const { ApiSchluesselDienst, speicherApiSchluesselRepo } = await import('../src/apischluessel');
    const dienst = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', dienst.systemtypen.benutzerspiegel());
    const api = new ApiSchluesselDienst(speicherApiSchluesselRepo());
    app = await baueApp(dienst, konten, { apiSchluessel: api }) as unknown as App;
    const e = await app.inject({ method: 'POST', url: '/api/konto/einrichten', headers: { 'x-dms': '1' }, payload: { email: 'markus@example.org', name: 'Markus', passwort: 'ein-langes-passwort' } });
    assert.equal(e.statusCode, 201, e.body);
    cookie = String(e.headers['set-cookie']).split(';')[0];
    const markus = (await konten.listeBenutzer()).find((b) => b.email === 'markus@example.org')!;
    schluessel = (await api.lege(markus, { name: 'Lesen', recht: 'lesen' })).schluessel;
  });
  after(async () => { await app?.close(); });

  const version = async (url: string, headers: Record<string, string> = {}) => {
    const r = await app.inject({ method: 'GET', url, headers });
    assert.equal(r.statusCode, 200, r.body);
    return { info: (JSON.parse(r.body) as { info: { version: string } }).info.version, body: r.body };
  };

  for (const url of ['/api/openapi.json', '/api/v1/openapi.json']) {
    it(`${url}: ohne Anmeldung nur die Version der API`, async () => {
      const r = await version(url);
      assert.equal(r.info, API_VERSION_OHNE_ANMELDUNG);
      assert.ok(!r.body.includes(`"${eigeneVersion()}"`), 'die Version von Ablago steht nirgends als Wert');
    });
    it(`${url}: angemeldet (Sitzung oder API-Schlüssel) mit der genauen Version`, async () => {
      assert.equal((await version(url, { cookie })).info, eigeneVersion());
      assert.equal((await version(url, { authorization: `Bearer ${schluessel}` })).info, eigeneVersion());
    });
  }
});
