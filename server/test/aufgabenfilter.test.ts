/** Werkbank → Aufgaben: Filter (#366). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { faelligkeit, filterAktiv, filterAusAdresse, filterInAdresse, filtereAufgaben } from '../../shared/src/aufgabenfilter';
import type { Aufgabe } from '../../shared/src/model';

const a = (x: Partial<Aufgabe> & { id: string }): Aufgabe => ({
  mappeId: 'm', empfaengerId: 'u1', art: 'manuell', text: '', erstellt: '2026-10-01T08:00:00Z', erstelltVon: null, erledigt: null, erledigtVon: null, ...x,
});
// Mittwoch, 4. November 2026
const jetzt = new Date(2026, 10, 4, 10, 0);
const umfeld = { jetzt, ohneVertretung: (id: string) => id === 'u2' };

describe('Aufgabenfilter (#366)', () => {
  it('Fälligkeit: überfällig, diese Woche (bis Sonntag), später, ohne Datum', () => {
    assert.equal(faelligkeit('2026-11-03', jetzt), 'ueberfaellig');
    assert.equal(faelligkeit('2026-11-04', jetzt), 'woche');
    assert.equal(faelligkeit('2026-11-08', jetzt), 'woche');
    assert.equal(faelligkeit('2026-11-09', jetzt), 'spaeter');
    assert.equal(faelligkeit(null, jetzt), 'ohne');
    assert.equal(faelligkeit('2026-11-08', new Date(2026, 10, 8, 23, 0)), 'woche', 'am Sonntag selbst');
  });

  it('filtert nach Empfänger, Art, Mappentyp, Fälligkeit und Text', () => {
    const liste = [
      a({ id: '1', empfaengerId: null, art: 'passung', typId: 't1', mappeTitel: 'Stromvertrag' }),
      a({ id: '2', empfaengerId: 'u2', art: 'frist', datum: '2026-11-01', typId: 't2', mappeTitel: 'Kfz-Versicherung', text: 'kündigen' }),
      a({ id: '3', empfaengerId: 'u1', art: 'frist', datum: '2026-12-01', typId: 't2', mappeTitel: 'Hausrat' }),
      a({ id: '4', empfaengerId: 'u1', art: 'erwaehnung', typId: 't1', mappeTitel: 'Notiz zum Strom' }),
    ];
    const ids = (f: Parameters<typeof filtereAufgaben>[1]) => filtereAufgaben(liste, f, umfeld).map((x) => x.id);
    assert.deepEqual(ids({}), ['1', '2', '3', '4']);
    assert.deepEqual(ids({ empfaenger: 'admins' }), ['1']);
    assert.deepEqual(ids({ empfaenger: 'ohne-vertretung' }), ['2']);
    assert.deepEqual(ids({ empfaenger: 'u1' }), ['3', '4']);
    assert.deepEqual(ids({ art: 'frist' }), ['2', '3']);
    assert.deepEqual(ids({ typ: 't1' }), ['1', '4']);
    assert.deepEqual(ids({ faellig: 'ueberfaellig' }), ['2']);
    assert.deepEqual(ids({ faellig: 'spaeter' }), ['3']);
    assert.deepEqual(ids({ text: 'strom' }), ['1', '4']);
    assert.deepEqual(ids({ text: 'KÜNDIGEN' }), ['2'], 'auch im Text der Aufgabe, ohne Groß/klein');
    assert.deepEqual(ids({ art: 'frist', empfaenger: 'u1' }), ['3']);
  });

  it('steht in der Adresse und kommt unverändert zurück', () => {
    const f = { empfaenger: 'ohne-vertretung', art: 'frist' as const, typ: 't2', faellig: 'woche' as const, text: 'Strom', erledigt: true };
    const s = filterInAdresse(f);
    assert.equal(s, '?empfaenger=ohne-vertretung&art=frist&typ=t2&faellig=woche&text=Strom&erledigt=1');
    assert.deepEqual(filterAusAdresse(new URLSearchParams(s)), f);
    assert.equal(filterInAdresse({}), '');
    assert.ok(filterAktiv(f) && !filterAktiv({ erledigt: true }));
  });

  it('ignoriert Unbekanntes in der Adresse', () => {
    assert.deepEqual(filterAusAdresse(new URLSearchParams('art=quatsch&faellig=nie&text=%20%20')), {});
  });
});
