/**
 * Kern (#961): Transaktion, Repo der Transaktion und Systemtypen nachschlagen. Pakete schreiben über `kern.repo` –
 * in einer Transaktion des Kerns also in deren Repo und nicht daneben.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { InstalliertesPaket } from '../../shared/src/pakete';
import { Dienst } from '../src/dienst';
import { speicherDateien } from '../src/dateispeicher';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { paketSpeicher, setzePaketSpeicher } from '../src/pakete/pakete.einstellungen';
import { eigeneDatenbank } from './hilfe-db';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const paket = (id: string): InstalliertesPaket => ({
  id, name: id, version: '1.0.0', beschreibung: '', lizenz: 'MIT', autor: { name: 'Lena', github: 'lena' }, herkunft: { art: 'hochgeladen', von: null, am: new Date().toISOString() },
  installiert: new Date().toISOString(), installiertVon: null, aktualisiert: null, aktualisiertVon: null, typen: {}, sichten: {}, abhaengigkeiten: {},
}) as InstalliertesPaket;

describe('Kern (#961)', () => {
  it('kennt seine Transaktion; „danach“ läuft erst nach dem Speichern, beim Zurückrollen nie', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), {});
    const k = d.kern;
    const spur: string[] = [];
    assert.equal(k.inEigenerTransaktion(), false);
    await k.inTransaktion(async () => {
      assert.equal(k.inEigenerTransaktion(), true);
      // Ein anderer Kern sieht diese Transaktion nicht.
      assert.equal(new Dienst(speicherRepo(), speicherDateien(), {}).kern.inEigenerTransaktion(), false);
      k.danach(() => spur.push('danach'));
      spur.push('drin');
    });
    await assert.rejects(k.inTransaktion(async () => { k.danach(() => spur.push('nie')); throw new Error('weg'); }), /weg/);
    assert.deepEqual(spur, ['drin', 'danach']);
  });

  it('system(): gleichzeitige Aufrufe teilen sich einen Lauf; die Fassade schlägt dasselbe nach', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), {});
    const [a, b] = await Promise.all([d.kern.system(), d.kern.system()]);
    assert.equal(a.benutzer.id, b.benutzer.id);
    assert.equal((await d.sichereSystem()).post.id, a.post.id, 'die Fassade schlägt dasselbe nach');
    assert.equal((await d.kern.typen()).get(a.rolle.id)?.system, 'rolle');
  });

  it('Pakete schreiben in einer Transaktion des Kerns in deren Repo und rollen mit zurück (PostgreSQL)', { skip: process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
    const db = await eigeneDatenbank('kern');
    const { pgRepo } = await import('../src/repo-pg');
    const d = new Dienst(pgRepo(db.sql, HAUSHALT), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const k = d.kern;
    await assert.rejects(k.inTransaktion(async () => {
      await k.repo.speicherePaket(paket('weg'));
      assert.ok((await k.repo.listePakete()).some((p) => p.id === 'weg'), 'in der Transaktion sichtbar');
      throw new Error('zurück');
    }), /zurück/);
    assert.equal((await k.repo.listePakete()).some((p) => p.id === 'weg'), false, 'zurückgerollt');
    await k.inTransaktion(() => k.repo.speicherePaket(paket('bleibt')));
    assert.ok((await k.repo.listePakete()).some((p) => p.id === 'bleibt'));
    // Paket-Einstellungen laufen über die Einstellungen des Kerns.
    await setzePaketSpeicher(k, 'bleibt', { a: '1' });
    assert.deepEqual(await paketSpeicher(k, 'bleibt'), { a: '1' });
    await db.ende();
  });
});
