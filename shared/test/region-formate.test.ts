/**
 * Formate der Region (#1610) und Telefonnummern (#1609): Datum, Uhrzeit, Zahlen, Beträge, Wochenbeginn, Arbeitstage;
 * Nummern lesen, zeigen (kanonisch, DIN 5008), Durchwahl, nicht erkannt, Suche in jeder Schreibweise.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { istArbeitstag, kwDerZeile, monatsraster, tagNachTaste, wochenanfang } from '../../shared/src/kalender';
import { formatiere, type Feld } from '../../shared/src/model';
import {
  FORMATE_STANDARD,
  liesFormate,
  liesRegion,
  mitFormaten,
  regionDatum,
  regionZahl,
  zeitText,
  type Formate,
} from '../../shared/src/region';
import { liesTelefon, telefonAnzeige, telefonFindet, telefonSuchformen, telefonText, telefonWahl } from '../../shared/src/telefon';
import { telefonLink } from '../../shared/src/feldformate';

const mit = (f: Partial<Formate>) => ({ ...FORMATE_STANDARD, ...f });
const d = new Date('2026-11-24T13:05:00Z');

describe('Formate der Region (#1610)', () => {
  it('ohne eigene Wahl wie bisher (Sprache)', () => {
    assert.equal(regionDatum(d, { day: '2-digit', month: '2-digit', year: 'numeric' }), '24.11.2026');
    assert.equal(regionZahl(1234567.89, { maximumFractionDigits: 2 }), '1.234.567,89');
    assert.equal(regionZahl(12.5, { style: 'currency', currency: 'EUR' }), '12,50\u00a0€');
    assert.deepEqual(liesRegion(null).formate, FORMATE_STANDARD, 'eine ältere Einstellung ohne Formate bekommt die Vorgaben');
  });

  it('Datum, Uhrzeit, Zahlen und Währung nach eigener Wahl', () => {
    mitFormaten(mit({ datum: 'jjjj-mm-tt', uhrzeit: '12', zahlen: '1,234.56', waehrungStellung: 'vorne' }), () => {
      assert.equal(regionDatum(d, { day: '2-digit', month: '2-digit', year: 'numeric' }), '2026-11-24');
      assert.match(regionDatum(d, { hour: '2-digit', minute: '2-digit' }), /^02:05\s?PM$/i);
      assert.equal(regionZahl(1234567.89, { maximumFractionDigits: 2 }), '1,234,567.89');
      assert.equal(regionZahl(12.5, { style: 'currency', currency: 'EUR' }), '€ 12.50');
      assert.match(zeitText(d, { dateStyle: 'short', timeStyle: 'short' }), /^2026-11-24, 02:05\s?PM$/i);
      assert.equal(zeitText(d, {}, 'sv-SE'), '2026-11-24 14:05:00', 'feste Formate bleiben');
      assert.equal(regionDatum(d, { weekday: 'long', day: 'numeric', month: 'long' }), 'Dienstag, 24. November', 'Text bleibt');
    });
    mitFormaten(mit({ datum: 'mm/tt/jjjj', zahlen: '1 234,56', waehrungStellung: 'hinten' }), () => {
      const f = { key: 'f', label: 'F', typ: 'datum' } as Feld;
      assert.equal(formatiere(f, '2026-03-05'), '03/05/2026');
      assert.equal(formatiere({ ...f, typ: 'betrag' }, { betrag: 1234.5, waehrung: 'USD' }), '1 234,50 $');
    });
  });

  it('liest nur Bekanntes; Arbeitstage ohne Dubletten', () => {
    const f = liesFormate({ datum: 'xx', zahlen: '1.234,56', arbeitstage: [5, 1, 1, 9], waehrung: 'eur', vorwahl: '+49', wochenbeginn: 7 });
    assert.equal(f.datum, null);
    assert.equal(f.zahlen, '1.234,56');
    assert.deepEqual(f.arbeitstage, [1, 5]);
    assert.equal(f.waehrung, 'EUR', 'ungültig: Vorgabe');
    assert.equal(f.vorwahl, '49');
    assert.equal(f.wochenbeginn, 7);
  });

  it('Wochenbeginn: Raster, Pos1/Ende und Kalenderwoche nach ISO', () => {
    assert.equal(wochenanfang('2026-11-26', 1), '2026-11-23');
    assert.equal(wochenanfang('2026-11-26', 7), '2026-11-22');
    assert.equal(wochenanfang('2026-11-26', 6), '2026-11-21');
    mitFormaten(mit({ wochenbeginn: 7 }), () => {
      const r = monatsraster('2026-11');
      assert.equal(r[0][0], '2026-11-01', 'der 1.11.2026 ist ein Sonntag');
      assert.equal(kwDerZeile(r[0]), 45, 'KW der Zeile: die ISO-Woche ihres Montags (02.11.)');
      assert.equal(tagNachTaste('Home', '2026-11-26'), '2026-11-22');
      assert.equal(tagNachTaste('End', '2026-11-26'), '2026-11-28');
    });
    assert.equal(monatsraster('2026-11')[0][0], '2026-10-26', 'Vorgabe Deutsch: Montag');
    assert.equal(istArbeitstag('2026-11-28', [1, 2, 3, 4, 5, 6]), true);
    assert.equal(istArbeitstag('2026-11-29', [1, 2, 3, 4, 5, 6]), false);
  });
});

describe('Telefonnummern (#1609)', () => {
  it('liest verschiedene Schreibweisen als dieselbe Nummer (E.164), Ländervorwahl aus der Region', () => {
    for (const s of ['0351/123 45 67', '+49 351 1234567', '0049 351 1234567', '(0351) 1234567', '0351-1234567'])
      assert.equal(liesTelefon(s)?.e164, '+493511234567', s);
    assert.equal(liesTelefon('044 123 45 67', '41')?.e164, '+41441234567', 'Ländervorwahl der Region');
  });

  it('zeigt kanonisch und nach DIN 5008; Durchwahl bleibt; anderes Land international', () => {
    const n = liesTelefon('(0351) 12345-67')!;
    assert.equal(n.durchwahl, '67');
    assert.equal(n.e164, '+493511234567');
    assert.equal(telefonText(n, 'kanonisch'), '+49 (351) 12345-67');
    assert.equal(telefonText(n, 'din-international'), '+49 351 12345-67');
    assert.equal(telefonText(n, 'din-national'), '0351 12345-67');
    assert.equal(telefonText(liesTelefon('+41 44 123 45 67')!, 'din-national'), '+41 44 1234567');
    assert.equal(telefonText(liesTelefon('030 1234567')!, 'din-national'), '030 1234567');
  });

  it('nicht erkannt: bleibt, wie eingegeben; tel:-Link mit E.164', () => {
    assert.deepEqual(telefonAnzeige('beim Pförtner'), { text: 'beim Pförtner', erkannt: false });
    assert.deepEqual(telefonAnzeige('123'), { text: '123', erkannt: false });
    assert.equal(telefonWahl('0351/123 45 67'), '+493511234567');
    assert.equal(telefonLink('(0351) 12345-67'), 'tel:+493511234567');
    const f = { key: 'tel', label: 'Telefon', typ: 'text', format: 'telefon' } as Feld;
    assert.equal(formatiere(f, '0351/123 45 67'), '0351 1234567');
    assert.equal(
      mitFormaten(mit({ telefon: 'kanonisch' }), () => formatiere(f, '0351/123 45 67')),
      '+49 (351) 1234567',
    );
  });

  it('Suche in jeder Schreibweise', () => {
    const formen = telefonSuchformen('0351 1234567');
    assert.deepEqual(formen.sort(), ['+493511234567', '00493511234567', '03511234567'].sort());
    for (const gespeichert of ['(0351) 123 45 67', '+49 351 1234567', '0049-351-1234567', 'Tel. 0351/1234567'])
      assert.ok(telefonFindet(gespeichert, formen), gespeichert);
    assert.ok(!telefonFindet('0351 7654321', formen));
    assert.deepEqual(telefonSuchformen('Strom'), []);
    assert.deepEqual(telefonSuchformen('2026'), [], 'zu kurz');
    assert.ok(telefonFindet('0351 123 45 67', telefonSuchformen('1234567')), 'Rufnummer ohne Vorwahl');
  });
});
