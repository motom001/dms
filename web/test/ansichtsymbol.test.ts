/**
 * Symbol je Ansicht (#428), Oberfläche: feste Auswahl aus Lucide, zu jedem Namen eine Form. Speichern, Paketformat
 * und Migration prüft server/test/ansichtsymbol.test.ts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ANSICHT_SYMBOLE, ANSICHT_SYMBOL_NAMEN, ansichtSymbol } from '../../shared/src/ansichtsymbole';
import { ANSICHT_FORMEN } from '../../web/src/ansichtsymbol-formen';

/** Die 76 Namen vor #1519. */
const BISHER =
  'house sofa key-round lamp plug zap droplet flame hammer wrench trees car bike bus plane fuel map-pin globe umbrella euro wallet piggy-bank credit-card receipt landmark signature file-signature scale shield-check percent calculator heart heart-pulse pill stethoscope hospital users user baby dog cat gift graduation-cap school music book-open utensils shopping-cart leaf sun briefcase building-2 factory laptop mail inbox send phone message-square newspaper calendar clock bell alarm-clock list-checks timer folder archive tag star bookmark file-text files box image camera'.split(
    ' ',
  );

/** Symbole des Paketkatalogs (dms-registry werkzeuge/symbole/, Stand 20.11.2026). */
const KATALOG =
  'car cloud-upload contact file-signature file-text files house image key-round languages mail message-circle-question-mark network receipt-text scan-barcode scan-text wallet'.split(
    ' ',
  );

describe('Symbol je Ansicht (#428)', () => {
  it('Auswahl: eindeutige Namen, zu jedem Namen eine Form, Lucide-Namen', () => {
    const alle = ANSICHT_SYMBOLE.flatMap((g) => g.symbole.map((s) => s.name));
    assert.equal(new Set(alle).size, alle.length, 'keine doppelten Namen');
    // #1519: 259 Symbole in 16 Gruppen; die 76 bisherigen Namen bleiben (nie umbenennen oder entfernen).
    assert.equal(alle.length, 259);
    assert.equal(ANSICHT_SYMBOLE.length, 16);
    for (const n of BISHER) assert.ok(ANSICHT_SYMBOL_NAMEN.has(n), `bisheriger Name ${n}`);
    // Alle Symbole des Paketkatalogs (dms-registry werkzeuge/symbole/) sind dabei.
    for (const n of KATALOG) assert.ok(ANSICHT_SYMBOL_NAMEN.has(n), `Katalogsymbol ${n}`);
    // Gruppen und Bedeutungen kommen über t(): auf Englisch englisch.
    for (const g of ANSICHT_SYMBOLE) assert.ok(g.gruppe && !/^gemeinsam\./.test(g.gruppe), g.gruppe);
    for (const n of alle) {
      assert.match(n, /^[a-z0-9]+(-[a-z0-9]+)*$/, n);
      assert.ok(ANSICHT_FORMEN[n]?.length, `Form für ${n}`);
    }
    assert.deepEqual(Object.keys(ANSICHT_FORMEN).sort(), [...ANSICHT_SYMBOL_NAMEN].sort());
    assert.equal(ansichtSymbol('house'), 'house');
    assert.equal(ansichtSymbol(' car '), 'car');
    assert.equal(ansichtSymbol('house-plus'), 'house-plus', 'seit #1519 gültig');
    // Unbekannte Namen (Paket für eine neuere Version) heißen „ohne Symbol“ – nichts bricht.
    for (const x of ['haus', '', null, 3, 'rocket', 'package']) assert.equal(ansichtSymbol(x), null, String(x));
  });
});
