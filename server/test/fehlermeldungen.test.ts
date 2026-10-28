/** Fehler melden (#70). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Fachfehler } from '../src/fehler';
import { Fehlermeldungen, speicherFehlerRepo } from '../src/fehlermeldungen';

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
    const { id } = await f.melde('u1', { text: 'Knopf geht nicht', bilder: [{ name: 'a.png', daten: `data:image/png;base64,${PNG}` }], angaben: { bildschirm: { breite: 402 }, riesig: 'x'.repeat(5000) } });
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
});
