/**
 * Bereich im Dokument markieren (#1597), Stufe 1: Blöcke aus den Zeilen eines Rechtecks lesen und den Feldern eines
 * Mappentyps zuordnen – Anschrift (ohne Rücksendezeile), Bank, Kontakt, Rechnungskopf; Werte gesäubert wie bei #1606.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felderAusBlock, liesAnschrift, liesBlock, zeilenImBereich } from '../../shared/src/bereichsmuster';
import type { Feld } from '../../shared/src/model';

const text = (key: string, label: string, mehr: Partial<Feld> = {}) => ({ key, label, typ: 'text', ...mehr }) as Feld;

describe('Bereich markieren: Blöcke erkennen (#1597)', () => {
  it('Anschrift mit Name, Straße und Nummer, PLZ und Ort; die Rücksendezeile darüber zählt nicht', () => {
    const b = liesBlock(['Heizungsbau Muster KG · Musterweg 9 · 01234 Musterstadt', 'Lena Beispiel', 'Musterweg 1', '01234 Musterstadt']);
    assert.equal(b?.art, 'anschrift');
    assert.equal(b?.text, 'Musterweg 1, 01234 Musterstadt');
    assert.deepEqual(b?.werte, { name: 'Lena Beispiel', strasse: 'Musterweg', hausnummer: '1', plz: '01234', ort: 'Musterstadt' });
  });
  it('Hausnummern wie „12a“ und „12-14“, Anrede fällt weg', () => {
    assert.equal(liesAnschrift(['Herrn', 'Jonas Beispiel', 'Hauptstr. 12a', '01234 Musterstadt'])?.werte.hausnummer, '12a');
    assert.equal(liesAnschrift(['Herrn', 'Jonas Beispiel', 'Hauptstr. 12a', '01234 Musterstadt'])?.werte.name, 'Jonas Beispiel');
    assert.equal(liesAnschrift(['Am Hang 12-14', '01234 Musterstadt'])?.werte.hausnummer, '12-14');
  });
  it('Nur die Rücksendezeile ist keine Anschrift', () => {
    assert.equal(liesBlock(['Heizungsbau Muster KG · Musterweg 1 · 01234 Musterstadt']), null);
  });
  it('Bank, Kontakt und Rechnungskopf', () => {
    const bank = liesBlock(['Bank: Musterbank eG', 'IBAN DE02 1203 0000 0000 2020 51', 'BIC: BYLADEM1001']);
    assert.equal(bank?.art, 'bank');
    assert.deepEqual(bank?.werte, { iban: 'DE02 1203 0000 0000 2020 51', bic: 'BYLADEM1001', bank: 'Musterbank eG' });
    const kontakt = liesBlock(['Telefon: 0351 123456', 'Fax: 0351 123457', 'E-Mail: info@example.org']);
    assert.deepEqual(kontakt?.werte, { telefon: '0351 123456', fax: '0351 123457', email: 'info@example.org' });
    const kopf = liesBlock(['Rechnung R-2027-55', 'Kundennummer: K-4711,', 'Datum: 03.11.2026']);
    assert.deepEqual(kopf?.werte, { rechnungsnummer: 'R-2027-55', kundennummer: 'K-4711', datum: '03.11.2026' });
  });
  it('Wörter im Rechteck werden Zeilen, von oben nach unten und links nach rechts', () => {
    const s = {
      breite: 1,
      hoehe: 1,
      woerter: [
        ['Musterweg', 0.1, 0.2, 0.1, 0.02],
        ['1', 0.21, 0.2, 0.01, 0.02],
        ['01234', 0.1, 0.23, 0.05, 0.02],
        ['Musterstadt', 0.16, 0.23, 0.1, 0.02],
        ['außerhalb', 0.6, 0.2, 0.1, 0.02],
      ] as Array<[string, number, number, number, number]>,
    };
    assert.deepEqual(zeilenImBereich(s, { x: 0.05, y: 0.15, b: 0.3, h: 0.15 }), ['Musterweg 1', '01234 Musterstadt']);
  });
});

describe('Bereich markieren: Block in die Felder (#1597)', () => {
  const block = liesBlock(['Lena Beispiel', 'Musterweg 1', '01234 Musterstadt'])!;
  it('Nur passende Felder; Name, Straße, Hausnummer, PLZ und Ort', () => {
    const felder = [
      text('name', 'Name'),
      text('strasse', 'Straße'),
      text('hausnummer', 'Nr.'),
      text('plz', 'PLZ'),
      text('ort', 'Ort'),
      text('notiz', 'Notiz'),
    ];
    assert.deepEqual(
      felderAusBlock(block, felder).map((x) => [x.feld.key, x.wert]),
      [
        ['name', 'Lena Beispiel'],
        ['strasse', 'Musterweg'],
        ['hausnummer', '1'],
        ['plz', '01234'],
        ['ort', 'Musterstadt'],
      ],
    );
  });
  it('Keine passenden Felder: leer (z. B. Rechnung ohne Anschrift)', () => {
    assert.deepEqual(
      felderAusBlock(block, [text('rechnungsnummer', 'Rechnungsnummer'), { key: 'betrag', label: 'Betrag', typ: 'betrag' } as Feld]),
      [],
    );
  });
  it('Ein Feld „Anschrift“ (Langtext) bekommt die ganze Anschrift', () => {
    const [x] = felderAusBlock(block, [{ key: 'anschrift', label: 'Anschrift', typ: 'langtext' } as Feld]);
    assert.equal(x.wert, 'Lena Beispiel\nMusterweg 1\n01234 Musterstadt');
  });
  it('Gesäubert nach #1606: Komma am Ende fällt weg; Nummern nach ihrer Beschriftung', () => {
    const anschrift = liesBlock(['Heizungsbau Muster KG,', 'Musterweg 1', '01234 Musterstadt'])!;
    assert.deepEqual(felderAusBlock(anschrift, [text('name', 'Name')])[0].wert, 'Heizungsbau Muster KG');
    const kopf = liesBlock(['Rechnung R-2027-55', 'Kundennummer: K-4711'])!;
    const felder = [text('rechnungsnummer', 'Rechnungsnummer'), text('kundennummer', 'Kundennummer')];
    assert.deepEqual(
      felderAusBlock(kopf, felder).map((x) => [x.feld.key, x.wert]),
      [
        ['rechnungsnummer', 'R-2027-55'],
        ['kundennummer', 'K-4711'],
      ],
    );
  });
});
