/**
 * Kern (#961): Transaktion, Repo der Transaktion und Systemtypen nachschlagen (#963: nur nachschlagen, Anlegen in der
 * Systemausstattung). Pakete schreiben über `kern.repo` –
 * in einer Transaktion des Kerns also in deren Repo und nicht daneben.
 */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
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

  it('system() schlägt nur nach (#963): ist alles da, legt es nichts an und ändert nichts', async () => {
    const repo = speicherRepo();
    const d = new Dienst(repo, speicherDateien(), {});
    const vorher = await d.sichereSystem();
    const spur: string[] = [];
    const neu = new Dienst(new Proxy(repo, {
      get(ziel, prop, e) {
        const w = Reflect.get(ziel, prop, e);
        if (typeof w !== 'function' || typeof prop !== 'string') return w;
        if (/^(lege|aendere|setze|schreibe|loesche)/.test(prop)) spur.push(prop);
        return w.bind(ziel);
      },
    }), speicherDateien(), {});
    const anlegen = mock.method(neu.systemausstattung, 'anlegen');
    const s = await neu.kern.system();
    assert.equal(s.benutzer.id, vorher.benutzer.id);
    assert.equal(s.post.id, vorher.post.id);
    assert.deepEqual([...s.systemrollen], [...vorher.systemrollen]);
    assert.deepEqual([...s.kontorollen], [...vorher.kontorollen]);
    assert.equal(anlegen.mock.callCount(), 0, 'kein Rückfall');
    assert.deepEqual(spur, [], 'nichts geschrieben');
  });

  it('Rückfall (#963): fehlt etwas, legt system() die Ausstattung einmal an – Schritte in fester Reihenfolge', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), {});
    const spur: string[] = [];
    const a = d.systemausstattung as unknown as { schritte: Record<string, Record<string, (...x: unknown[]) => Promise<unknown>>> };
    for (const [bereich, schritte] of Object.entries(a.schritte)) {
      for (const [name, f] of Object.entries(schritte)) schritte[name] = async (...x: unknown[]) => { spur.push(`${bereich}.${name}`); return f(...x); };
    }
    const [x, y] = await Promise.all([d.kern.system(), d.kern.system()]);
    assert.equal(x.rolle.id, y.rolle.id);
    assert.deepEqual(spur, [
      'mappentypen.sichereSystemtypen', 'sichten.sichtFuerTyp', 'sichten.sichtFuerTyp', 'sichten.sichtFuerTyp',
      'post.sicherePostSichten', 'sichten.sichereFavoritenSicht',
    ]);
    // Die eigenen Ansichten der Systemtypen gibt es; ein zweites Sicherstellen legt keine neuen an.
    const sichten = (await d.listeSichten()).length;
    spur.length = 0;
    await d.systemausstattung.sicherstellen();
    assert.deepEqual(spur, ['mappentypen.sichereSystemtypen', 'post.sicherePostSichten', 'sichten.sichereFavoritenSicht']);
    assert.equal((await d.listeSichten()).length, sichten);
  });

  it('sicherstellen() (#963): eine gelöschte Ansicht eines Systemtyps kommt nicht wieder; system() merkt sich nichts aus einer Transaktion', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), {});
    const s = await d.sichereSystem();
    await d.kern.repo.loescheSicht(s.benutzer.id);
    await d.systemausstattung.sicherstellen();
    assert.equal((await d.listeSichten()).some((x) => x.id === s.benutzer.id), false);
    // In einer Transaktion nachgeschlagen: nicht gemerkt (sie könnte zurückgerollt werden).
    const frisch = new Dienst(d.kern.repo, speicherDateien(), {});
    await frisch.kern.inTransaktion(() => frisch.kern.system());
    assert.equal((frisch.kern as unknown as { systemIds?: unknown }).systemIds, undefined);
    await frisch.kern.system();
    assert.ok((frisch.kern as unknown as { systemIds?: unknown }).systemIds);
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
