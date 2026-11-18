/** Fehler melden (#70). */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Fachfehler } from '../src/grundlagen/fehler';
import { Konten } from '../src/konten';
import { pgKontoRepo, speicherKontoRepo } from '../src/konten/konto-repo';
import { Fehlermeldungen, pgFehlerRepo, speicherFehlerRepo, type FehlerRepo } from '../src/system/fehlermeldungen';
import { eigeneDatenbank, type EigeneDatenbank } from './hilfe-db';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
// 1×1-PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Fehlermeldungen (#70)', () => {
  it('nimmt Beschreibung, Bilder und Angaben an; Admin erledigt und löscht', async () => {
    const dateien = speicherDateien();
    const f = new Fehlermeldungen(speicherFehlerRepo(), dateien);
    await assert.rejects(f.melde('u1', { text: '' }), status(422));
    await assert.rejects(f.melde('u1', { text: 'x', bilder: [{ daten: Buffer.from('kein Bild').toString('base64') }] }), status(422));
    await assert.rejects(f.melde('u1', { text: 'x', bilder: [{ daten: PNG }, { daten: PNG }, { daten: PNG }] }), status(422));
    const { id } = await f.melde('u1', {
      text: 'Knopf geht nicht',
      bilder: [{ name: 'a.png', daten: `data:image/png;base64,${PNG}` }],
      angaben: { bildschirm: { breite: 402 }, riesig: 'x'.repeat(5000) },
    });
    assert.equal(await f.offen(), 1);
    const m = await f.hole(id);
    assert.equal(m.bilder[0].mime, 'image/png');
    assert.equal((m.angaben.riesig as string).length, 2000, 'Angaben werden begrenzt');
    assert.equal(dateien.anzahl(), 1);
    await f.erledigt(id, true, 'admin');
    assert.equal(await f.offen(), 0);
    assert.equal((await f.liste(true)).length, 1);
    await f.erledigt(id, false, 'admin');
    assert.equal((await f.liste(false)).length, 1);
    await f.loesche(id);
    assert.equal(dateien.anzahl(), 0, 'Bild mit gelöscht');
    await assert.rejects(f.hole(id), status(404));
  });

  /** Jonas und Lena als echte Konten (in Postgres verweist benutzer_id auf benutzer). */
  const offen: EigeneDatenbank[] = [];
  after(async () => {
    for (const d of offen) await d.ende();
  });
  async function aufbauMeine(pg: boolean) {
    const H = '00000000-0000-4000-8000-000000000001';
    let repo: FehlerRepo = speicherFehlerRepo();
    let konten = new Konten(speicherKontoRepo(), null, 'http://nas');
    if (pg) {
      const db = await eigeneDatenbank('fehler');
      offen.push(db);
      repo = pgFehlerRepo(db.sql, H);
      konten = new Konten(pgKontoRepo(db.sql, H), null, 'http://nas');
    }
    const { benutzer: lena } = await konten.einrichten({ email: 'lena@example.org', name: 'Lena', passwort: 'ein-langes-passwort' });
    const jonas = (await konten.legeBenutzerAn({ email: 'jonas@example.org', name: 'Jonas' }, lena.id)).benutzer;
    const dateien = speicherDateien();
    return { f: new Fehlermeldungen(repo, dateien), dateien, lena: lena.id, jonas: jonas.id };
  }

  for (const pg of [false, true])
    it(
      `Meine Meldungen (#1331): nur die eigenen, neueste zuerst, gelöschte als erledigt ohne Inhalt${pg ? ' (Postgres)' : ''}`,
      {
        skip: pg && !process.env.TEST_DATABASE_URL && 'ohne TEST_DATABASE_URL',
      },
      async () => {
        const { f, dateien, lena, jonas } = await aufbauMeine(pg);
        const a = await f.melde(jonas, { text: 'Erste Meldung', bilder: [{ name: 'a.png', daten: PNG }] });
        // Neueste zuerst: in Postgres setzt die Datenbank die Zeit – die zweite Meldung kommt hörbar später.
        await new Promise((r) => setTimeout(r, 15));
        const lang = await f.melde(jonas, { text: `Zweite  Meldung\nmit ${'sehr '.repeat(60)}langem Text` });
        await f.melde(lena, { text: 'Fremde Meldung' });
        await f.melde(null, { text: 'Ohne Person' });
        const m = await f.meine(jonas);
        assert.deepEqual(
          m.map((x) => x.id),
          [lang.id, a.id],
        );
        assert.ok(m[0].anfang!.startsWith('Zweite Meldung mit sehr'), 'Leerraum zusammengefasst');
        assert.ok(m[0].anfang!.length <= 120 && m[0].anfang!.endsWith('…'), 'nur der Anfang');
        assert.equal(m[1].erledigt, null);
        assert.deepEqual(await f.meine(null), [], 'ohne Person keine Liste');
        assert.ok(!JSON.stringify(await f.meine(lena)).includes('Erste'), 'keine fremden');
        await f.erledigt(a.id, true, lena);
        assert.ok((await f.meine(jonas))[1].erledigt, 'erledigt mit Datum');
        // Löschen: wirklich weg (Text, Bild, Werkbank), für den Melder bleibt „erledigt“ mit Datum.
        await f.erledigt(lang.id, false, lena);
        await f.loesche(lang.id);
        await f.loesche(a.id);
        assert.equal(dateien.anzahl(), 0, 'Bild gelöscht');
        await assert.rejects(f.hole(lang.id), status(404));
        assert.equal([...(await f.liste(false)), ...(await f.liste(true))].filter((x) => x.benutzerId === jonas).length, 0);
        assert.equal(await f.offen(), 2, 'nur die Meldungen von Lena und ohne Person');
        const rest = await f.meine(jonas);
        assert.equal(rest.length, 2);
        for (const x of rest) {
          assert.equal(x.anfang, null);
          assert.ok(x.erledigt);
          assert.deepEqual(Object.keys(x).sort(), ['anfang', 'erledigt', 'erstellt', 'id']);
        }
      },
    );
});
