/** Testlauf (#371): Ergebnis gehört zu (Benutzer, Mappe, Regelstand) und verschwindet beim Wechsel. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { passendesErgebnis, testlaufSchluessel, type TestlaufErgebnis } from '../../shared/src/testlauf';

describe('Testlauf: Ergebnis passt zur Auswahl', () => {
  const karlFitness = testlaufSchluessel({ benutzerId: 'karl', mappeId: 'fitness', stand: 'r1' });
  const erg: TestlaufErgebnis<string> = { schluessel: karlFitness, wert: 'Karl an „Fitnessstudio Auto“' };

  it('zeigt das Ergebnis bei unveränderter Auswahl', () => {
    assert.equal(passendesErgebnis(erg, testlaufSchluessel({ benutzerId: 'karl', mappeId: 'fitness', stand: 'r1' })), erg.wert);
  });

  it('leert das Ergebnis, sobald die Mappe wechselt', () => {
    assert.equal(passendesErgebnis(erg, testlaufSchluessel({ benutzerId: 'karl', mappeId: 'haftpflicht', stand: 'r1' })), undefined);
  });

  it('leert das Ergebnis, sobald der Benutzer wechselt', () => {
    assert.equal(passendesErgebnis(erg, testlaufSchluessel({ benutzerId: 'ben', mappeId: 'fitness', stand: 'r1' })), undefined);
  });

  it('leert das Ergebnis, sobald sich die Regeln ändern', () => {
    assert.equal(passendesErgebnis(erg, testlaufSchluessel({ benutzerId: 'karl', mappeId: 'fitness', stand: 'r2' })), undefined);
  });

  it('ohne vollständige Auswahl gibt es keinen Schlüssel und kein Ergebnis', () => {
    assert.equal(testlaufSchluessel({ benutzerId: '', mappeId: 'fitness' }), '');
    assert.equal(testlaufSchluessel({ benutzerId: 'karl' }), '');
    assert.equal(passendesErgebnis(erg, ''), undefined);
    assert.equal(passendesErgebnis(undefined, karlFitness), undefined);
  });

  it('Ansichten: ohne Mappe, nur Benutzer und Regeln', () => {
    const k = testlaufSchluessel({ benutzerId: 'karl', stand: 's' }, false);
    assert.notEqual(k, '');
    assert.equal(passendesErgebnis({ schluessel: k, wert: 1 }, testlaufSchluessel({ benutzerId: 'ben', stand: 's' }, false)), undefined);
    assert.equal(passendesErgebnis({ schluessel: k, wert: 1 }, testlaufSchluessel({ benutzerId: 'karl', stand: 's' }, false)), 1);
  });

  it('eine verspätete Antwort zur alten Auswahl wird nicht angezeigt', () => {
    // Anfrage für Fitnessstudio läuft, inzwischen ist Haftpflicht gewählt; die Antwort trägt den alten Schlüssel.
    const spaet: TestlaufErgebnis<string> = { schluessel: karlFitness, wert: 'alt' };
    assert.equal(passendesErgebnis(spaet, testlaufSchluessel({ benutzerId: 'karl', mappeId: 'haftpflicht', stand: 'r1' })), undefined);
  });
});
