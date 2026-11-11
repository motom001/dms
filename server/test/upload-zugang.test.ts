/** Große Uploads (#683): Ohne Anmeldung liest Ablago den Körper gar nicht erst ein – 401, bevor Bytes im Speicher liegen. */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';

describe('Upload ohne Anmeldung (#683)', () => {
  let schliessen: (() => Promise<unknown>) | undefined;
  after(async () => { await schliessen?.(); });

  it('Paket hochladen und Dokument ablegen: 401, ohne den Körper zu lesen', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    await konten.einrichten({ email: 'admin@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const { baueApp } = await import('../src/http');
    const app = await baueApp(d, konten, {});
    schliessen = () => app.close();
    for (const url of ['/api/werkbank/pakete/hochladen', '/api/mappen/00000000-0000-4000-8000-000000000009/dokumente?register=dokumente&name=x.pdf']) {
      let gelesen = 0;
      const MB = Buffer.alloc(1024 * 1024);
      const koerper = Readable.from((function* () { for (let i = 0; i < 64; i++) { gelesen += MB.length; yield MB; } })());
      const r = await app.inject({ method: 'POST', url, payload: koerper, headers: { 'content-type': 'application/octet-stream', 'x-dms': '1' } });
      assert.equal(r.statusCode, 401, `${url}: ${r.body}`);
      assert.ok(gelesen < 8 * MB.length, `${url}: ${gelesen / MB.length} MB gelesen`);
    }
  });
});
