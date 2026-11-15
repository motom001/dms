/** Mappentyp-Editor (#144): Prüfmeldungen nennen ihren Bereich. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pruefeMappentyp, type MappentypDaten } from '../../shared/src/model';

const ctx = { namenAndererTypen: ['Vertrag'], schluesselAndererTypen: ['vertrag'], existiertTyp: () => false };

describe('Bereiche der Prüfmeldungen (#144)', () => {
  it('ordnet jede allgemeine Meldung einem Bereich zu', () => {
    const t = {
      name: 'Vertrag', schluessel: 'vertrag', beschreibung: '', titelVorlage: '{fehlt}',
      felder: [{ key: 'nr', label: 'Nr', typ: 'text' }],
      register: [{ key: 'allgemein', name: '', art: 'felder', felder: ['nr'] }],
    } as unknown as MappentypDaten;
    const p = pruefeMappentyp(t, ctx);
    assert.equal(p.orte?.length, p.allgemein.length);
    assert.deepEqual([...new Set(p.orte)].sort(), ['grunddaten', 'register', 'titel']);
  });
  it('ohne Fehler keine Orte', () => {
    const t = { name: 'Neu', schluessel: 'neu', beschreibung: '', felder: [], register: [{ key: 'dok', name: 'Dokumente', art: 'dokumente' }] } as unknown as MappentypDaten;
    const p = pruefeMappentyp(t, ctx);
    assert.deepEqual(p.allgemein, []);
    assert.equal(p.orte, undefined);
  });
});
