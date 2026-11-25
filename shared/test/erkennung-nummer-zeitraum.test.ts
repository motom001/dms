/**
 * Erkennung (KW49): Nummer direkt hinter dem Wort des Felds (#1657) und Datumspaare als Zeitraum (#1646).
 * Alle Briefe, Firmen, Nummern und Daten sind erfunden (Personas Lena und Jonas Muster, example.org).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { datumsPaare, findeZeitraeume, liesFeldErkennung, nummernWoerter, vorschlaegeAus } from '../../shared/src/erkennung';
import { titelAus, type Feld, type Mappentyp } from '../../shared/src/model';

const typ = (felder: Array<Partial<Feld> & Pick<Feld, 'key' | 'label' | 'typ'>>) => ({ felder }) as unknown as Pick<Mappentyp, 'felder'>;

const RECHNUNG = typ([
  { key: 'von', label: 'Rechnungssteller', typ: 'text' },
  {
    key: 'rechnungsnummer',
    label: 'Rechnungsnummer',
    typ: 'text',
    erkennung: { art: 'nummer' },
    beschriftungen: { en: { label: 'Invoice number' } },
  },
  { key: 'datum', label: 'Rechnungsdatum', typ: 'datum', erkennung: {} },
]);
const nummer = (text: string, gruppen: string[][] = []) => vorschlaegeAus(RECHNUNG, text, undefined, { gruppen }).rechnungsnummer;

describe('Rechnungsnummer direkt hinter dem Wort (#1657)', () => {
  it('„Rechnung R-2026-1120“ als Überschrift – der Fund aus dem Testbericht', () => {
    const v = nummer(`Motorrad Musterstadt GmbH · Hauptstraße 7 · 01067 Musterstadt
Lena Muster
Lindenweg 4
01234 Beispielort

Rechnung R-2026-1120
Datum 20.11.2026
Kundennummer 100-4711
Gesamtbetrag 588,20 €`);
    assert.equal(v?.wert, 'R-2026-1120');
    assert.equal(v?.sicherheit, 'mittel');
    assert.match(v!.fundstelle, /Rechnung R-2026-1120/);
  });

  it('mit „Nr.“, mit Doppelpunkt, auf Englisch', () => {
    assert.equal(nummer('Rechnung Nr. 4711 vom 20.11.2026')?.wert, '4711');
    assert.equal(nummer('Rechnung Nr. 4711 vom 20.11.2026')?.sicherheit, 'hoch');
    assert.equal(nummer('Rechnungsnummer: 2026/0815')?.wert, '2026/0815');
    assert.equal(nummer('Rechnungs-Nr. R-2026-0042')?.wert, 'R-2026-0042');
    assert.equal(nummer('Invoice INV-123\nDate 2026-11-20')?.wert, 'INV-123');
  });

  it('Wortformen aus Feld und gleichbedeutenden Wörtern', () => {
    assert.deepEqual(nummernWoerter(RECHNUNG.felder[1]), ['rechnungs', 'rechnung', 'invoice']);
    assert.ok(nummernWoerter(RECHNUNG.felder[1], [['Rechnung', 'Beleg-Nr.']]).includes('beleg'));
    assert.equal(nummer('Beleg-Nr. B-77', [['Rechnung', 'Beleg-Nr.']])?.wert, 'B-77');
    assert.equal(nummer('Beleg-Nr. B-77'), undefined, 'ohne Gruppe kein „Beleg“');
    // Gruppen, die keine Form des Felds enthalten, zählen nicht.
    assert.deepEqual(nummernWoerter(RECHNUNG.felder[1], [['Auto', 'Kfz']]), ['rechnungs', 'rechnung', 'invoice']);
  });

  it('kein Datum, keine Kundennummer, keine IBAN, kein Betrag', () => {
    assert.equal(nummer('Rechnung 20.11.2026'), undefined);
    assert.equal(nummer('Rechnung vom 20.11.2026\nKunden-Nr. 55'), undefined);
    assert.equal(nummer('Rechnung\nKundennummer 100-4711'), undefined, 'nicht über den Zeilenumbruch');
    assert.equal(nummer('Rechnung DE89 3704 0044 0532 0130 00'), undefined);
    assert.equal(nummer('Rechnung 588,20 €'), undefined);
    assert.equal(nummer('Rechnung 2026'), undefined, 'eine Jahreszahl allein ist keine Nummer');
    assert.equal(nummer('Kontorechnung R-77'), undefined, 'nur am Wortanfang');
  });

  it('eine Nummer mit Beschriftung geht weiter vor', () => {
    assert.equal(nummer('Rechnung R-1\nRechnungsnummer: R-2026-0042')?.wert, 'R-2026-0042');
  });

  it('Titel ohne Leerzeichen vor dem Doppelpunkt, wenn die Nummer fehlt', () => {
    const t = { felder: RECHNUNG.felder, titelVorlage: '{von|kurz:25} {rechnungsnummer}: {datum}' };
    assert.equal(titelAus(t, { von: 'Motorrad Musterstadt GmbH', datum: '2026-11-20' }), 'Motorrad Musterstadt GmbH: 20.11.2026');
    assert.equal(titelAus(t, { datum: '2026-11-20' }), '20.11.2026');
    assert.equal(
      titelAus(t, { von: 'Motorrad Musterstadt GmbH', rechnungsnummer: 'R-2026-1120', datum: '2026-11-20' }),
      'Motorrad Musterstadt GmbH R-2026-1120: 20.11.2026',
    );
  });
});

const KONTOAUSZUG = typ([
  { key: 'nummer', label: 'Auszugsnummer', typ: 'text', erkennung: { art: 'nummer' } },
  { key: 'beginn', label: 'Von', typ: 'datum', erkennung: { art: 'datum' } },
  { key: 'ende', label: 'Bis', typ: 'datum', erkennung: { art: 'datum' } },
]);

describe('Datumspaare als Zeitraum (#1646)', () => {
  it('Kontoauszug: „vom 01.07.2012 -“ und „31.07.2012“ in der nächsten Zeile – der Fund aus dem Testbericht', () => {
    const v = vorschlaegeAus(
      KONTOAUSZUG,
      `Sparkasse Musterstadt
F I N A N Z S T A T U S vom 01.07.2012 -
31.07.2012
Kontoinhaber Lena Muster
IBAN DE89 3704 0044 0532 0130 00
Kontostand 1.234,56 EUR`,
    );
    assert.equal(v.beginn?.wert, '2012-07-01');
    assert.equal(v.ende?.wert, '2012-07-31');
    assert.equal(v.beginn?.sicherheit, 'hoch');
    assert.equal(v.beginn?.fundstelle, v.ende?.fundstelle, 'dieselbe Fundstelle, aber verschiedene Werte');
  });

  it('Nebenkostenabrechnung, Versicherungsjahr, Gehaltsabrechnung', () => {
    const z = (text: string) => findeZeitraeume(text).map((x) => `${x.von}/${x.bis}`);
    assert.deepEqual(z('Nebenkostenabrechnung für den Zeitraum 01.01.2025 bis 31.12.2025\nWohnung Lindenweg 4'), ['2025-01-01/2025-12-31']);
    assert.deepEqual(z('Ihre Hausratversicherung\nVersicherungszeitraum: 01.04.2026 – 31.03.2027'), ['2026-04-01/2027-03-31']);
    assert.deepEqual(z('Entgeltabrechnung Oktober 2026\nAbrechnungszeitraum 01.10.2026 - 31.10.2026\nJonas Muster'), [
      '2026-10-01/2026-10-31',
    ]);
    assert.deepEqual(z('Leistung 01.07. – 31.07.2012'), ['2012-07-01/2012-07-31'], 'ohne Jahr beim Beginn');
    assert.deepEqual(z('vom 1. Januar 2026 bis 31. März 2026'), ['2026-01-01/2026-03-31']);
    assert.deepEqual(z('2026-01-01 – 2026-03-31'), ['2026-01-01/2026-03-31']);
    assert.deepEqual(z('31.12.2025 - 01.01.2025'), [], 'Beginn nach dem Ende ist kein Zeitraum');
    assert.deepEqual(z('Tel. 0351 12345 - 31.07.2012'), []);
  });

  it('ein Zeitraum mit „vom“ oder „Zeitraum“ geht vor', () => {
    const v = vorschlaegeAus(KONTOAUSZUG, 'Buchung 03.07.2012 - 05.07.2012\nAuszug für den Zeitraum 01.07.2012 bis 31.07.2012');
    assert.equal(v.beginn?.wert, '2012-07-01');
    assert.equal(v.ende?.wert, '2012-07-31');
  });

  it('Paare aus Kennung und Bezeichnung, eingestellt am Ende', () => {
    const paare = (t: Pick<Mappentyp, 'felder'>) => datumsPaare(t).map((p) => `${p.beginn.key}/${p.ende.key}`);
    assert.deepEqual(paare(KONTOAUSZUG), ['beginn/ende']);
    assert.deepEqual(
      paare(
        typ([
          { key: 'mietbeginn', label: 'Mietbeginn', typ: 'datum' },
          { key: 'mietende', label: 'Mietende', typ: 'datum' },
          { key: 'zeitraum_von', label: 'Zeitraum von', typ: 'datum' },
          { key: 'zeitraum_bis', label: 'Zeitraum bis', typ: 'datum' },
          { key: 'datum', label: 'Datum', typ: 'datum' },
        ]),
      ),
      ['mietbeginn/mietende', 'zeitraum_von/zeitraum_bis'],
    );
    // „Ende des Zeitraums ab …“: ohne passende Namen.
    assert.deepEqual(
      paare(
        typ([
          { key: 'ausgestellt', label: 'Ausgestellt', typ: 'datum' },
          { key: 'gueltig', label: 'Gültig', typ: 'datum', erkennung: { endeVon: 'ausgestellt' } },
        ]),
      ),
      ['ausgestellt/gueltig'],
    );
    assert.deepEqual(liesFeldErkennung({ endeVon: 'beginn' }, 'datum'), { endeVon: 'beginn' });
    assert.deepEqual(liesFeldErkennung({ endeVon: 'beginn' }, 'text'), {}, 'nur an Datumsfeldern');
    assert.deepEqual(liesFeldErkennung({ endeVon: 'Beginn!' }, 'datum'), {});
  });

  it('ohne Zeitraum nicht derselbe Wert aus einer Stelle mit zwei Daten', () => {
    const v = vorschlaegeAus(KONTOAUSZUG, 'Datum: 01.07.2012 und 31.07.2012');
    assert.equal(v.beginn?.wert, '2012-07-01');
    assert.equal(v.ende, undefined);
    // Felder ohne Paar bekommen das Datum des Schreibens wie bisher.
    const brief = typ([
      { key: 'datum', label: 'Datum', typ: 'datum', erkennung: {} },
      { key: 'eingang', label: 'Eingang', typ: 'datum', erkennung: {} },
    ]);
    const b = vorschlaegeAus(brief, 'Musterstadt, 12.03.2026\nVerbrauch vom 01.01.2026 bis 28.02.2026');
    assert.equal(b.datum?.wert, '2026-03-12');
    assert.equal(b.eingang?.wert, '2026-03-12');
  });
});

describe('Zeitraum „vom … bis einschl. …“ (#1669)', () => {
  const z = (text: string) => findeZeitraeume(text).map((x) => `${x.von}/${x.bis}`);

  it('der Satz aus dem Kartenauszug: Von und Bis, Fundstelle am ganzen Zeitraum', () => {
    const v = vorschlaegeAus(
      KONTOAUSZUG,
      'Musterbank Kartenabrechnung\nLena Muster\nDiese Abrechnung enthält alle Umsätze vom 20.11.2026 bis einschl. 19.12.2026.',
    );
    assert.equal(v.beginn?.wert, '2026-11-20');
    assert.equal(v.ende?.wert, '2026-12-19');
    assert.match(v.beginn!.fundstelle, /20\.11\.2026 bis einschl\. 19\.12\.2026/);
    assert.equal(v.beginn?.fundstelle, v.ende?.fundstelle);
  });

  it('einschließlich, inkl., inklusive, incl., „bis zum … einschließlich“ und über einen Zeilenumbruch', () => {
    for (const zusatz of ['einschl.', 'einschließlich', 'inkl.', 'inklusive', 'incl.', 'zum'])
      assert.deepEqual(z(`vom 01.01.2026 bis ${zusatz} 31.03.2026`), ['2026-01-01/2026-03-31'], zusatz);
    assert.deepEqual(z('vom 01.01.2026 bis zum einschl. 31.03.2026'), ['2026-01-01/2026-03-31']);
    assert.deepEqual(z('vom 01.01.2026 bis zum 31.03.2026 einschließlich'), ['2026-01-01/2026-03-31']);
    assert.deepEqual(z('Umsätze vom 20.11.2026 bis einschl.\n19.12.2026'), ['2026-11-20/2026-12-19']);
    assert.deepEqual(z('Umsätze vom 20.11.2026 bis\neinschließlich 19.12.2026'), ['2026-11-20/2026-12-19']);
  });

  it('„bis ausschließlich“ ist kein Zeitraum und füllt kein falsches Datum – „Von“ bleibt leer', () => {
    assert.deepEqual(z('vom 01.01.2026 bis ausschließlich 31.03.2026'), []);
    assert.deepEqual(z('vom 01.01.2026 bis ausschl. 31.03.2026'), []);
    const v = vorschlaegeAus(KONTOAUSZUG, 'Musterbank\nAlle Umsätze vom 01.01.2026 bis ausschl. 31.03.2026.');
    assert.equal(v.beginn, undefined, 'kein Enddatum in „Von“');
    assert.equal(v.ende, undefined);
  });
});
