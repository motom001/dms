/**
 * Symbol je Ansicht (#428), Oberfläche: feste Auswahl aus Lucide, zu jedem Namen eine Form. Speichern, Paketformat
 * und Migration prüft server/test/ansichtsymbol.test.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ANSICHT_SYMBOLE, ANSICHT_SYMBOL_NAMEN, ansichtSymbol } from '../../shared/src/ansichtsymbole';
import { ANSICHT_FORMEN } from '../../web/src/ansichtsymbol-formen';

describe('Symbol je Ansicht (#428)', () => {
  it('Auswahl: eindeutige Namen, zu jedem Namen eine Form, Lucide-Namen', () => {
    const alle = ANSICHT_SYMBOLE.flatMap((g) => g.symbole.map((s) => s.name));
    assert.equal(new Set(alle).size, alle.length, 'keine doppelten Namen');
    assert.ok(alle.length >= 60, 'mindestens 60 Symbole');
    for (const n of alle) {
      assert.match(n, /^[a-z0-9]+(-[a-z0-9]+)*$/, n);
      assert.ok(ANSICHT_FORMEN[n]?.length, `Form für ${n}`);
    }
    assert.deepEqual(Object.keys(ANSICHT_FORMEN).sort(), [...ANSICHT_SYMBOL_NAMEN].sort());
    assert.equal(ansichtSymbol('house'), 'house');
    assert.equal(ansichtSymbol(' car '), 'car');
    for (const x of ['haus', '', null, 3, 'house-plus']) assert.equal(ansichtSymbol(x), null, String(x));
  });
});
