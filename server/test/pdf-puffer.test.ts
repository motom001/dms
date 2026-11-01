import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { eigenerPuffer } from '../src/pdf-puffer';

// Kleinstes JPEG, das pdf-lib einbettet: SOI, SOF0 (8 Bit, 1×1, 3 Kanäle), EOI.
const JPEG = Buffer.from('ffd8ffc00011080001000103011100021100031100ffd9', 'hex');

describe('Bilder für pdf-lib (Buffer mit Versatz)', () => {
  // So liegt ein kleiner Buffer oft im Node-Pool: nicht am Anfang seines ArrayBuffers.
  const versetzt = Buffer.concat([Buffer.from([0, 0, 0]), JPEG]).subarray(3);

  it('pdf-lib allein scheitert am Versatz („SOI not found“)', async () => {
    assert.ok(versetzt.byteOffset > 0);
    await assert.rejects((await PDFDocument.create()).embedJpg(versetzt), /SOI/);
  });

  it('mit eigenerPuffer lässt sich das Bild einbetten', async () => {
    const bild = await (await PDFDocument.create()).embedJpg(eigenerPuffer(versetzt));
    assert.equal(bild.width, 1);
    assert.equal(bild.height, 1);
  });

  it('bündige Buffer werden nicht kopiert', () => {
    const b = new Uint8Array(JPEG);
    assert.equal(eigenerPuffer(b), b);
  });
});
