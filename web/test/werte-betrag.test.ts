/**
 * Betrag im Formular (#1608): Der Rohwert im Eingabefeld hat die Nachkommastellen der Währung – „12,50“, nicht „12,5“;
 * so auch die Vorgabe eines Mappentyps. Angezeigt wird ein Betrag über `formatiere` (server/test/feldarten.test.ts).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Feld, Mappentyp } from '../../shared/src/model';
import { setzeSprache } from '../../shared/src/sprache';

const g = globalThis as Record<string, unknown>;
g.document = { documentElement: { lang: 'de', dataset: {} } };
const { ausRoh, standardRoh, zuRoh } = await import('../src/werte');

describe('Betrag im Formular (#1608)', () => {
  setzeSprache('de');
  const f = { key: 'b', label: 'Betrag', typ: 'betrag', waehrung: 'EUR' } as Feld;

  it('zeigt gespeicherte Beträge mit den Nachkommastellen der Währung', () => {
    assert.deepEqual(zuRoh(f, { betrag: 12.5, waehrung: 'EUR' }), { betrag: '12,50', waehrung: 'EUR' });
    assert.deepEqual(zuRoh(f, { betrag: 189, waehrung: 'EUR' }), { betrag: '189,00', waehrung: 'EUR' });
    assert.deepEqual(zuRoh(f, { betrag: 1500, waehrung: 'JPY' }), { betrag: '1500', waehrung: 'JPY' });
    assert.deepEqual(zuRoh(f, null), { betrag: '', waehrung: 'EUR' });
  });

  it('liest den Rohwert unverändert zurück', () => {
    for (const x of [12.5, 189, 0.1, -3.25])
      assert.deepEqual(ausRoh(f, zuRoh(f, { betrag: x, waehrung: 'EUR' })), { betrag: x, waehrung: 'EUR' });
  });

  it('Vorgabe des Mappentyps ebenso', () => {
    const typ = { felder: [{ ...f, standard: 10.5 }] } as unknown as Mappentyp;
    assert.deepEqual(standardRoh(typ).b, { betrag: '10,50', waehrung: 'EUR' });
  });
});
