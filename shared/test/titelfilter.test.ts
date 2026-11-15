/** Titel-Vorlage mit Filtern (#170). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pruefeMappentyp, pruefeTitelFilter, titelAus, vorlageFelder, type Feld } from '../../shared/src/model';
import { liesFilter, ohneLeereTeile, LEER } from '../../shared/src/titelfilter';

const felder = [
  { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text' },
  { key: 'nummer', label: 'Nummer', typ: 'text' },
  { key: 'datum', label: 'Datum', typ: 'datum' },
  { key: 'betrag', label: 'Betrag', typ: 'betrag' },
  { key: 'kennzeichen', label: 'Kennzeichen', typ: 'text' },
  { key: 'geheim', label: 'Geheim', typ: 'passwort' },
] as unknown as Feld[];
const titel = (titelVorlage: string, werte: Record<string, unknown>, index = {}) => titelAus({ felder, titelVorlage }, werte as never, (id) => id, index);

describe('Titel-Filter', () => {
  it('alte Vorlagen bleiben gültig', () => {
    assert.equal(titel('{bezeichnung} vom {datum}', { bezeichnung: 'Strom', datum: '2026-10-15' }), 'Strom vom 15.10.2026');
    assert.deepEqual(vorlageFelder('{a|jahr} und {b}'), ['a', 'b']);
  });

  it('Datum: jahr, monat, eigenes Format', () => {
    const w = { datum: '2026-03-07' };
    assert.equal(titel('{datum|jahr}', w), '2026');
    assert.equal(titel('{datum|monat}', w), '03');
    assert.equal(titel('{datum|datum:"MM/JJJJ"}', w), '03/2026');
    assert.equal(titel('{datum|datum:"T.M.JJ"}', w), '7.3.26');
    assert.equal(titel('{datum|datum:„TT-MM“}', w), '07-03');
  });

  it('angelegt und geaendert kennen die Datumsfilter', () => {
    assert.equal(titel('{angelegt|jahr}', {}, { erstellt: '2025-12-31T23:30:00Z' }), '2026', 'Zeitzone des Haushalts');
  });

  it('Betrag ohne Währung, groß, klein, kurz, sonst', () => {
    assert.equal(titel('{betrag|ohne_waehrung}', { betrag: { betrag: 1234.5, waehrung: 'EUR' } }), '1.234,50');
    assert.equal(titel('{kennzeichen|gross}', { kennzeichen: 'dd-ab 123' }), 'DD-AB 123');
    assert.equal(titel('{bezeichnung|klein}', { bezeichnung: 'STROM' }), 'strom');
    assert.equal(titel('{bezeichnung|kurz:5}', { bezeichnung: 'Stromvertrag' }), 'Stro…');
    assert.equal(titel('{bezeichnung|kurz:30}', { bezeichnung: 'Strom' }), 'Strom');
    assert.equal(titel('{nummer|sonst:"ohne Nr."}', {}), 'ohne Nr.');
    assert.equal(titel('{bezeichnung|kurz:8|gross}', { bezeichnung: 'Stromvertrag' }), 'STROMVE…', 'verkettet');
  });

  it('leere Teile fallen samt Trenner weg', () => {
    const v = '{bezeichnung} – {nummer} – {datum|jahr}';
    assert.equal(titel(v, { bezeichnung: 'Strom', datum: '2026-01-01' }), 'Strom – 2026');
    assert.equal(titel(v, { nummer: '42', datum: '2026-01-01' }), '42 – 2026');
    assert.equal(titel(v, { bezeichnung: 'Strom' }), 'Strom');
    assert.equal(titel('{bezeichnung} · {nummer}', { nummer: 'A1' }), 'A1');
    assert.equal(titel('{bezeichnung}, {nummer}', { bezeichnung: 'Strom' }), 'Strom');
    assert.equal(titel('{nummer} vom {datum}', { nummer: '7' }), '7 vom', 'Wörter bleiben stehen');
    assert.equal(titel('E-Mail {nummer}', {}), 'E-Mail', 'Bindestrich im Wort ist kein Trenner');
    assert.equal(ohneLeereTeile(`a – ${LEER} – ${LEER} – b`), 'a – b');
  });

  it('Passwörter bleiben draußen, auch mit sonst', () => {
    assert.equal(titel('{geheim|sonst:"x"}', { geheim: { gesetzt: true } }), 'x');
  });

  it('liest Filter mit Argumenten', () => {
    assert.deepEqual(liesFilter('|jahr|kurz:20|sonst:"a: b"'), [{ name: 'jahr' }, { name: 'kurz', arg: '20' }, { name: 'sonst', arg: 'a: b' }]);
  });

  it('prüft unbekannte Filter und falsche Feldarten', () => {
    const p = (v: string) => pruefeTitelFilter({ felder, titelVorlage: v });
    assert.deepEqual(p('{bezeichnung|gross} {datum|jahr} {angelegt|monat}'), []);
    assert.match(p('{bezeichnung|fett}')[0], /unbekannter Filter „fett“/);
    assert.match(p('{bezeichnung|jahr}')[0], /nur bei Datumsfeldern/);
    assert.match(p('{datum|ohne_waehrung}')[0], /nur bei Betragsfeldern/);
    assert.match(p('{bezeichnung|kurz}')[0], /Zahl/);
    assert.match(p('{bezeichnung|kurz:viel}')[0], /Zahl/);
    assert.match(p('{nummer|sonst}')[0], /Anführungszeichen/);
    assert.match(p('{nummer|gross:1}')[0], /keinen Zusatz/);
    const typ = { name: 'T', beschreibung: '', titelVorlage: '{bezeichnung|fett}', felder, register: [] };
    assert.ok(pruefeMappentyp(typ as never, { namenAndererTypen: [], existiertTyp: () => true }).allgemein.some((m) => /unbekannter Filter/.test(m)), 'auch beim Speichern');
  });
});
