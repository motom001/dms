/** Kopf und Register einer Mappe (#427): Notizen als System-Register, Startregister, Banner-Beschriftung. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aufgabenBeschriftung, mitNotizen, NOTIZEN_REGISTER, startRegister } from '../../shared/src/mappenansicht';
import { standardRegister, type Aufgabe, type Register } from '../../shared/src/model';

const aufgabe = (x: Partial<Aufgabe>): Aufgabe => ({ id: 'a', mappeId: 'm', empfaengerId: 'ich', art: 'manuell', text: 't', erstellt: '', erstelltVon: null, erledigt: null, erledigtVon: null, ...x });

describe('Mappenansicht (#427)', () => {
  it('Notizen stehen vor der Historie, ohne Historie am Ende', () => {
    const mitHistorie: Register[] = [{ key: 'a', name: 'Allgemein', art: 'felder', felder: [] }, { key: 'h', name: 'Historie', art: 'protokoll' }, { key: 'd', name: 'Dokumente', art: 'dokumente' }];
    assert.deepEqual(mitNotizen(mitHistorie).map((r) => r.key), ['a', NOTIZEN_REGISTER, 'h', 'd']);
    assert.deepEqual(mitNotizen(standardRegister([])).map((r) => r.key), ['allgemein', 'dokumente', 'verknuepfungen', NOTIZEN_REGISTER]);
  });

  it('Startregister: Adresse, sonst Notizen bei offener Erwähnung in einer Notiz, sonst das erste', () => {
    const reg = mitNotizen(standardRegister([]));
    assert.equal(startRegister(reg, 'dokumente'), 'dokumente');
    assert.equal(startRegister(reg, 'gibtsnicht'), 'allgemein');
    assert.equal(startRegister(reg, null, [aufgabe({ art: 'erwaehnung', feldKey: 'notiz:1' })], 'ich'), NOTIZEN_REGISTER);
    // Erwähnung in einem Feld, erledigt oder für jemand anderen: kein Sprung.
    assert.equal(startRegister(reg, null, [aufgabe({ art: 'erwaehnung', feldKey: 'bemerkung' })], 'ich'), 'allgemein');
    assert.equal(startRegister(reg, null, [aufgabe({ art: 'erwaehnung', feldKey: 'notiz:1', erledigt: '2026-11-01' })], 'ich'), 'allgemein');
    assert.equal(startRegister(reg, null, [aufgabe({ art: 'erwaehnung', feldKey: 'notiz:1', empfaengerId: 'du' })], 'ich'), 'allgemein');
    assert.equal(startRegister(reg, 'dokumente', [aufgabe({ art: 'erwaehnung', feldKey: 'notiz:1' })], 'ich'), 'dokumente');
  });

  it('Banner-Beschriftung passt zur Aufgabenart', () => {
    assert.equal(aufgabenBeschriftung('manuell', true), 'Deine Aufgabe');
    assert.equal(aufgabenBeschriftung('frist', true), 'Deine Aufgabe');
    assert.equal(aufgabenBeschriftung('post', true), 'Post für dich');
    assert.equal(aufgabenBeschriftung('erwaehnung', true), 'Du wurdest erwähnt');
    assert.equal(aufgabenBeschriftung('erinnerung', true), 'Deine Erinnerung');
    assert.equal(aufgabenBeschriftung('manuell', false), 'Aufgabe für');
    assert.equal(aufgabenBeschriftung('post', false), 'Post für');
  });
});
