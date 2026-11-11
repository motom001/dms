/** Laufwerk unter Mein Konto (#720): nur bei eingeschaltetem Laufwerk, Adresse und Benutzername. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { Fachfehler } from '../src/fehler';
import { Konten } from '../src/konten';
import { speicherKontoRepo } from '../src/konto-repo';
import { speicherRepo } from '../src/repo-speicher';
import { routen } from '../src/routen';

describe('Laufwerk unter Mein Konto (#720)', () => {
  it('ausgeschaltet: kein Hinweis im Status, Bereich gibt 404; eingeschaltet: Adresse und Benutzername', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const konten = new Konten(speicherKontoRepo(), null, 'http://nas', d.systemtypen.benutzerspiegel());
    await konten.einrichten({ email: 'anna@example.org', name: 'Anna', passwort: 'ein-langes-passwort' });
    const { benutzer: lena } = await konten.legeBenutzerAn({ email: 'lena@example.org', name: 'Lena' });
    let aktiv = false;
    const webdav = { einstellung: async () => ({ aktiv }), stand: async () => ({ einstellung: { aktiv }, adresse: 'https://ablage.example.org/webdav/', https: true, grenze: 0, anfragen: 0, zugriffe: [] }) };
    const r = routen(d, konten, { webdav: webdav as never });
    const rufe = (pfad: string) => r.find((x) => x.methode === 'GET' && x.pfad === pfad)!.handler({ body: {}, params: {}, query: {}, ip: '1', benutzer: lena });
    assert.equal(((await rufe('/api/konto/status')).body as { laufwerk: boolean }).laufwerk, false);
    await assert.rejects(rufe('/api/konto/laufwerk'), (e) => e instanceof Fachfehler && e.status === 404);
    aktiv = true;
    assert.equal(((await rufe('/api/konto/status')).body as { laufwerk: boolean }).laufwerk, true);
    assert.deepEqual((await rufe('/api/konto/laufwerk')).body, { adresse: 'https://ablage.example.org/webdav/', https: true, benutzername: 'lena@example.org' });
  });
});
