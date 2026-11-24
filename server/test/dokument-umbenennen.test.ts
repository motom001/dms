/**
 * Dokument umbenennen (#1594): Endung bleibt, ursprünglicher Name bleibt, Historie, Archivmodus, leerer Name.
 * Arbeitsspeicher und – mit TEST_DATABASE_URL – PostgreSQL. Namen sind erfunden.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { mitEndungVon } from '../../shared/src/anlagen';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { Fachfehler } from '../src/grundlagen/fehler';
import { openapi } from '../src/http/api-v1';
import type { Repo } from '../src/repo';
import { speicherRepo } from '../src/repo/speicher';
import { eigeneDatenbank } from './hilfe-db';

const HAUSHALT = '00000000-0000-4000-8000-000000000001';
const ANNA = '00000000-0000-4000-8000-0000000000bb';
const status = (s: number, text?: RegExp) => (e: unknown) => e instanceof Fachfehler && e.status === s && (!text || text.test(e.message));

describe('Endung beim Umbenennen (#1594)', () => {
  it('bleibt, wird nicht doppelt angehängt, eine andere kommt davor; ohne Stamm leer', () => {
    assert.equal(mitEndungVon('Stromrechnung März', 'scan_0042.pdf'), 'Stromrechnung März.pdf');
    assert.equal(mitEndungVon('Stromrechnung März.PDF', 'scan_0042.pdf'), 'Stromrechnung März.pdf');
    assert.equal(mitEndungVon('Strom.txt', 'scan_0042.pdf'), 'Strom.txt.pdf');
    assert.equal(mitEndungVon('Notizen', 'README'), 'Notizen', 'ohne Endung bleibt es ohne');
    assert.equal(mitEndungVon('.pdf', 'a.pdf'), '');
    assert.equal(mitEndungVon('x'.repeat(250), 'a.pdf').length, 200);
  });
  it('steht in der API (PUT /dokumente/{id}/name, nameOriginal, verkleinertDpi)', () => {
    const o = openapi('0.0.0') as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    };
    assert.ok(o.paths['/dokumente/{id}/name']?.put);
    assert.ok(o.components.schemas.Dokument.properties.nameOriginal);
    assert.ok(o.components.schemas.Dokument.properties.verkleinertDpi);
  });
});

const offen: Array<{ end(): Promise<void> }> = [];
after(async () => {
  for (const s of offen) await s.end();
});
async function repo(pg: boolean): Promise<Repo> {
  if (!pg) return speicherRepo();
  const { pgRepo } = await import('../src/repo/pg');
  const { sql } = await eigeneDatenbank('umbenennen');
  offen.push(sql);
  await sql`INSERT INTO haushalte (id, name) VALUES (${HAUSHALT}, 'Test') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO benutzer (id, haushalt_id, email, name, rolle) VALUES (${ANNA}, ${HAUSHALT}, 'anna@example.org', 'Anna', 'mitglied') ON CONFLICT DO NOTHING`;
  return pgRepo(sql, HAUSHALT) as never;
}

async function aufbau(pg: boolean, archiv = false) {
  const d = new Dienst(await repo(pg), speicherDateien(), { einstellungen: speicherEinstellungen() });
  const typ = await d.mappentypen.legeTypAn({
    name: archiv ? 'Vertrag' : 'Beleg',
    ...(archiv ? { archiv: { jahre: 6, stichtag: 'ende' } } : {}),
    felder: [
      { key: 'nr', label: 'Nr', typ: 'text' },
      { key: 'ende', label: 'Beendet am', typ: 'datum' },
    ],
    register: [
      { key: 'allgemein', name: 'Allgemein', art: 'felder', felder: ['nr', 'ende'] },
      { key: 'dokumente', name: 'Dokumente', art: 'dokumente', ...(archiv ? { versioniert: true } : {}) },
    ],
  } as never);
  const heute = new Date().toISOString().slice(0, 10);
  const m = await d.mappen.legeMappeAn({ typId: typ.id, werte: { nr: '1', ende: heute } }, ANNA);
  const x = (await d.dokumente.ladeHoch(m.id, { register: 'dokumente', name: 'scan_0042.pdf' }, Buffer.from('%PDF-1.4 a'), ANNA)).dokument;
  return { d, m, x };
}

for (const pg of [false, ...(process.env.TEST_DATABASE_URL ? [true] : [])]) {
  describe(`Dokument umbenennen (#1594, ${pg ? 'PostgreSQL' : 'Arbeitsspeicher'})`, () => {
    it('neuer Name mit alter Endung; der ursprüngliche bleibt über weitere Umbenennungen; Historie', async () => {
      const { d, m, x } = await aufbau(pg);
      const a = await d.dokumente.benenneDokument(x.id, { name: 'Stromrechnung März' }, ANNA);
      assert.equal(a.name, 'Stromrechnung März.pdf');
      assert.equal(a.nameOriginal, 'scan_0042.pdf');
      const b = await d.dokumente.benenneDokument(x.id, { name: 'Strom 2026.pdf' }, ANNA);
      assert.equal(b.name, 'Strom 2026.pdf');
      assert.equal(b.nameOriginal, 'scan_0042.pdf', 'bleibt der Name vor der ersten Umbenennung');
      assert.equal(b.sha256, x.sha256, 'die Datei bleibt');
      const h = (await d.kern.repo.historie(m.id)).filter((e) => e.art === 'dokument_umbenannt');
      assert.equal(h.length, 2);
      assert.deepEqual(
        h.map((e) => [e.daten.vorher, e.daten.dokument]).sort(),
        [
          ['Stromrechnung März.pdf', 'Strom 2026.pdf'],
          ['scan_0042.pdf', 'Stromrechnung März.pdf'],
        ].sort(),
      );
      // Gleicher Name: nichts geschieht, keine Historie.
      await d.dokumente.benenneDokument(x.id, { name: 'Strom 2026' }, ANNA);
      assert.equal((await d.kern.repo.historie(m.id)).filter((e) => e.art === 'dokument_umbenannt').length, 2);
    });

    it('leerer Name 422, unbekanntes Dokument 404, nie umbenannt: kein ursprünglicher Name', async () => {
      const { d, x } = await aufbau(pg);
      await assert.rejects(d.dokumente.benenneDokument(x.id, { name: '  ' }, ANNA), status(422));
      await assert.rejects(d.dokumente.benenneDokument(x.id, { name: '.pdf' }, ANNA), status(422));
      await assert.rejects(d.dokumente.benenneDokument(x.id, null, ANNA), status(422));
      await assert.rejects(d.dokumente.benenneDokument('00000000-0000-4000-8000-0000000000ff', { name: 'a' }, ANNA), status(404));
      assert.equal((await d.kern.repo.holeDokument(x.id))!.nameOriginal, undefined);
    });

    it('Archivmodus: während der Frist gesperrt (409), der Name bleibt', async () => {
      const { d, x } = await aufbau(pg, true);
      await assert.rejects(d.dokumente.benenneDokument(x.id, { name: 'Vertrag' }, ANNA), status(409, /umbenennen/));
      assert.equal((await d.kern.repo.holeDokument(x.id))!.name, 'scan_0042.pdf');
    });
  });
}
