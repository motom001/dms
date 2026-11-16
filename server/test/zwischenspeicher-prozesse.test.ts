/** Zwischenspeicher mit mehreren Prozessen (#874): jeder bekommt seinen Anteil, zusammen wie mit einem Prozess. */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Seitenbilder } from '../src/dateien/pdfseiten';
import { anteilVon, teileZwischenspeicher, zwischenspeicherAnteil } from '../src/zwischenspeicher/zwischenspeicher';

describe('Zwischenspeicher je Prozess (#874)', () => {
  after(() => teileZwischenspeicher(1));

  it('ein Prozess: volle Grenze; mehrere: geteilt, mindestens das Mindestmaß', () => {
    teileZwischenspeicher(1);
    assert.equal(zwischenspeicherAnteil(), 1);
    assert.equal(anteilVon(256 << 20), 256 << 20);
    teileZwischenspeicher(4);
    assert.equal(anteilVon(256 << 20), 64 << 20);
    assert.equal(anteilVon(4), 1);
    assert.equal(anteilVon(1), 1, 'mindestens eins');
    teileZwischenspeicher(0);
    assert.equal(zwischenspeicherAnteil(), 1, 'Unsinn zählt als ein Prozess');
  });

  it('Seitenbilder: mit 2 Prozessen behält jeder 2 der 4 Dokumente', async () => {
    let erzeugt = 0;
    const s = new Seitenbilder(4, async () => {
      erzeugt++;
      return [Buffer.from('x')];
    });
    teileZwischenspeicher(2);
    for (const sha of ['a', 'b', 'c']) await s.bild(sha, 1, async () => Buffer.alloc(0));
    assert.equal(erzeugt, 3);
    await s.bild('c', 1, async () => Buffer.alloc(0));
    await s.bild('b', 1, async () => Buffer.alloc(0));
    assert.equal(erzeugt, 3, 'b und c sind noch da');
    await s.bild('a', 1, async () => Buffer.alloc(0));
    assert.equal(erzeugt, 4, 'a ist schon hinausgefallen');
    teileZwischenspeicher(1);
  });
});
