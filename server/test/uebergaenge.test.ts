/** Übergangsausnahmen mit Ablaufdatum (#902). */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { UEBERGAENGE } from '../src/uebergaenge';
import { vergleicheVersion } from '../src/system';

const WURZEL = new URL('../../', import.meta.url);

describe('Übergangsausnahmen (#902)', () => {
  it('jede Ausnahme entfällt spätestens mit 1.0.0', () => {
    assert.ok(UEBERGAENGE.length > 0);
    for (const u of UEBERGAENGE) {
      assert.match(u.entfaelltMit, /^\d+\.\d+\.\d+$/, u.was);
      assert.ok(vergleicheVersion(u.entfaelltMit, '1.0.0') <= 0, `${u.was}: spätestens 1.0.0`);
    }
  });

  it('keine Ausnahme ist abgelaufen (Version in package.json)', async () => {
    const { version } = JSON.parse(await readFile(new URL('package.json', WURZEL), 'utf8')) as { version: string };
    const abgelaufen = UEBERGAENGE.filter((u) => vergleicheVersion(version, u.entfaelltMit) >= 0).map((u) => `${u.was} (entfällt mit ${u.entfaelltMit})`);
    assert.deepEqual(abgelaufen, [], `Ablago ${version}: diese Ausnahmen entfernen, aus uebergaenge.ts streichen und im Änderungsprotokoll der API nennen`);
  });

  it('jede Fundstelle steht noch im Code', async () => {
    for (const u of UEBERGAENGE) {
      assert.ok(u.fundstellen.length > 0, `${u.was}: ohne Fundstelle`);
      for (const f of u.fundstellen) {
        const inhalt = await readFile(new URL(f.datei, WURZEL), 'utf8');
        assert.ok(inhalt.includes(f.text), `${u.was}: „${f.text}“ fehlt in ${f.datei} – entfernt? Dann den Eintrag streichen.`);
      }
    }
  });
});
