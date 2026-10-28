/** Logo und Schriftzug je Design (#72). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Designs, pruefeLogo, speicherDesignRepo } from '../src/designs';
import { Fachfehler } from '../src/fehler';

const status = (s: number) => (e: unknown) => e instanceof Fachfehler && e.status === s;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('Logo und Schriftzug (#72)', () => {
  it('prüft SVGs streng', () => {
    assert.equal(pruefeLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123"/><use href="#a"/></svg>')), 'image/svg+xml');
    for (const boese of [
      '<svg><script>alert(1)</script></svg>', '<svg onload="alert(1)"></svg>', '<svg><image href="https://x/y.png"/></svg>',
      '<svg><foreignObject><div/></foreignObject></svg>', '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg/>', '<svg><a xlink:href="javascript:alert(1)"/></svg>',
      '<svg><style>@import url(https://x)</style></svg>',
    ]) assert.throws(() => pruefeLogo(Buffer.from(boese)), status(422), boese);
    assert.throws(() => pruefeLogo(Buffer.from('kein Bild')), status(422));
    assert.equal(pruefeLogo(PNG), 'image/png');
  });

  it('setzt Logo und Schriftzug je Design; ohne Anmeldung nur das Logo des Standards', async () => {
    const dateien = speicherDateien();
    const d = new Designs(speicherDesignRepo(), dateien);
    const { designs, standard } = await d.liste();
    const anderes = designs.find((x) => x.id !== standard)!;
    const s = designs.find((x) => x.id === standard)!;
    await d.aendere(s.id, { ...s, schriftzug: 'Familie Muster' });
    await assert.rejects(d.aendere(s.id, { ...s, schriftzug: 'x'.repeat(31) }), status(422));
    await d.setzeLogo(s.id, PNG);
    await d.setzeLogo(anderes.id, PNG);
    assert.equal(dateien.anzahl(), 1, 'gleiche Datei nur einmal');
    const m = await d.marke();
    assert.equal(m.schriftzug, 'Familie Muster');
    assert.match(m.logo ?? '', new RegExp(`/api/designs/${s.id}/logo`));
    assert.equal((await d.logo(s.id, false)).logo.mime, 'image/png');
    await assert.rejects(d.logo(anderes.id, false), status(404), 'fremdes Logo ohne Anmeldung');
    assert.equal((await d.logo(anderes.id, true)).logo.mime, 'image/png');
    // Bearbeiten behält das Logo; Entfernen räumt erst auf, wenn keiner es mehr nutzt.
    await d.aendere(s.id, { ...s, schriftzug: '' });
    assert.ok((await d.liste()).designs.find((x) => x.id === s.id)!.logo);
    await d.entferneLogo(s.id);
    assert.equal(dateien.anzahl(), 1);
    await d.entferneLogo(anderes.id);
    assert.equal(dateien.anzahl(), 0);
  });
});
