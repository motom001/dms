/**
 * Übernahme aus Markierung: Satzzeichen und Leerraum am Rand abschneiden (#1606) und – mit Feldmuster – nur den
 * passenden Teil übernehmen (#1607). Reine Funktionen; die Oberfläche nimmt markierten Text über `wertAusText`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { musterTeil, saeubereMarkierung, wertAusText } from '../../shared/src/uebernehmen';

describe('Übernahme aus Markierung: Rand säubern (#1606)', () => {
  const text = { typ: 'text' } as const;
  it('Komma, Semikolon, Doppelpunkt, Leerzeichen und Zeilenumbruch am Rand fallen weg', () => {
    assert.equal(wertAusText(text, '12,'), '12');
    assert.equal(wertAusText(text, ' Hauptstraße;'), 'Hauptstraße');
    assert.equal(wertAusText(text, 'Kundennummer:'), 'Kundennummer');
    assert.equal(wertAusText(text, ': 4711 ,\n'), '4711');
    assert.equal(wertAusText(text, '\n\tMusterstadt \n'), 'Musterstadt');
    assert.equal(wertAusText({ typ: 'langtext' }, 'Zeile 1\nZeile 2,\n'), 'Zeile 1\nZeile 2');
    assert.equal(wertAusText(text, ' ,; '), null, 'nur Satzzeichen: nichts');
  });

  it('Punkt am Ende bleibt bei Text („Str.“, „e. V.“)', () => {
    assert.equal(wertAusText(text, 'Hauptstr.'), 'Hauptstr.');
    assert.equal(wertAusText(text, 'Musterverein e. V.,'), 'Musterverein e. V.');
  });

  it('Punkt am Ende fällt bei Zahl, Datum, Betrag, PLZ und IBAN weg', () => {
    assert.equal(wertAusText({ typ: 'zahl' }, '12.'), 12);
    assert.equal(wertAusText({ typ: 'datum' }, '24.11.2026.'), '2026-11-24');
    assert.deepEqual(wertAusText({ typ: 'betrag' }, '84,20 €.'), { betrag: 84.2, waehrung: 'EUR' });
    assert.equal(wertAusText({ typ: 'text', format: 'plz' }, '01069.'), '01069');
    assert.equal(wertAusText({ typ: 'text', format: 'iban' }, 'DE02 1203 0000 0000 2020 51.'), 'DE02 1203 0000 0000 2020 51');
    assert.equal(wertAusText({ typ: 'text', key: 'plz', label: 'PLZ' }, '01069.'), '01069', 'PLZ auch nach Kennung und Bezeichnung');
  });

  it('Klammern und Anführungszeichen nur ohne Gegenstück', () => {
    assert.equal(saeubereMarkierung('(030) 1234', text), '(030) 1234', 'mit Gegenstück bleibt sie');
    assert.equal(saeubereMarkierung('12a)', text), '12a');
    assert.equal(saeubereMarkierung('(Musterstadt', text), 'Musterstadt');
    assert.equal(saeubereMarkierung('„Musterverein“', text), '„Musterverein“');
    assert.equal(saeubereMarkierung('Musterverein“,', text), 'Musterverein');
    assert.equal(saeubereMarkierung('"Musterverein', text), 'Musterverein');
    assert.equal(saeubereMarkierung('»Muster«', text), '»Muster«');
  });
});

describe('Übernahme aus Markierung: Feldmuster schneidet den passenden Teil heraus (#1607)', () => {
  const hausnummer = { typ: 'text', muster: '[0-9]{1,4}[a-zA-Z]?' } as const;
  it('der erste passende Teil: „Nr. 12a,“ → „12a“', () => {
    assert.equal(wertAusText(hausnummer, 'Nr. 12a,'), '12a');
    assert.equal(wertAusText(hausnummer, 'Hauptstraße 5'), '5');
    assert.equal(wertAusText({ typ: 'text', muster: '[0-9]{5}' }, '01069 Dresden'), '01069');
  });

  it('passt nichts: der Text wie bisher (die Oberfläche zeigt den Musterhinweis)', () => {
    assert.equal(wertAusText(hausnummer, 'Hinterhaus'), 'Hinterhaus');
    assert.equal(musterTeil(hausnummer.muster, 'Hinterhaus'), null);
  });

  it('der ganze Text, wenn er passt; freistehende Teile vor angrenzenden; ungültiges Muster stört nicht', () => {
    assert.equal(musterTeil('a|ab', 'ab'), 'ab');
    assert.equal(musterTeil('[0-9]{5}', 'Tel. 0351123456, PLZ 01069'), '01069');
    assert.equal(musterTeil('[0-9]{5}', 'Tel. 0351123456'), '03511', 'ohne freistehenden Teil der erste');
    assert.equal(musterTeil('(', 'x'), null);
    assert.equal(wertAusText({ typ: 'text', muster: '(' }, 'Nr. 5,'), 'Nr. 5');
  });
});
