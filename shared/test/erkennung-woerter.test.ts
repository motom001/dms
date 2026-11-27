/**
 * Auswahl nach Stelle und Erkennungswörter am Feld (#1714): früheste Stelle statt Listenreihenfolge, Wörter je Option
 * und Wörter vor dem Wert – mit Prüfung, ob der Wert zur Feldart passt. Texte erfunden (Prüforganisation „Prüfdienst
 * Muster“, Personas).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { liesFeldErkennung, vorschlaegeAus } from '../src/erkennung';
import type { Feld, Mappentyp } from '../src/model';

type Typ = Pick<Mappentyp, 'felder'>;
const feld = (key: string, label: string, typ: Feld['typ'], x: Partial<Feld> = {}): Feld => ({ key, label, typ, ...x });
const OPTIONEN = ['ohne Mängel', 'geringe Mängel', 'erhebliche Mängel', 'gefährliche Mängel', 'verkehrsunsicher'];

/** Hauptuntersuchung wie im Paket fahrzeuge, mit Erkennungswörtern wie in dms-registry #277. */
const HU = (mitWoertern = true): Typ => ({
  felder: [
    feld('geprueft_am', 'Geprüft am', 'datum', { erkennung: {} }),
    feld('kilometerstand', 'Kilometerstand', 'zahl', {
      min: 0,
      erkennung: mitWoertern ? { woerter: { vor: ['(4)', 'km-St.', 'km-Stand'] } } : {},
    }),
    feld('ergebnis', 'Ergebnis', 'auswahl', {
      optionen: OPTIONEN,
      erkennung: mitWoertern
        ? {
            art: 'auswahl',
            woerter: {
              vor: ['(7)', 'Ergebnis'],
              jeOption: { 'ohne Mängel': ['ohne festgestellte Mängel', 'ohne erkennbare Mängel', 'keine Mängel'] },
            },
          }
        : { art: 'auswahl' },
    }),
    feld('naechste_hu', 'Nächste HU', 'datum', {
      erkennung: mitWoertern ? { woerter: { vor: ['(8)', 'Nächste HU', 'nächste HU fällig'] } } : {},
    }),
  ],
});

const SEITE_1 = `Prüfdienst Muster · Musterstraße 1 · 12345 Musterstadt
Bericht über die Hauptuntersuchung
Halterin: Lena Muster
Datum: 14.01.2026
Ergebnis: ohne festgestellte Mängel`;
const SEITE_2 = `Allgemeine Erläuterungen
Weist das Prüfungsergebnis geringe Mängel (GM) aus, sind diese unverzüglich zu beheben.
Erhebliche Mängel sind innerhalb eines Monats zu beheben.`;

describe('Auswahl: früheste Stelle statt Reihenfolge der Liste (#1714)', () => {
  it('„ohne festgestellte Mängel“ auf Seite 1 schlägt „geringe Mängel“ auf Seite 2 (Seitenvorschub und Leerzeile)', () => {
    for (const trenner of ['\f', '\n\n']) {
      const v = vorschlaegeAus(HU(), `${SEITE_1}${trenner}${SEITE_2}`);
      assert.equal(v.ergebnis?.wert, 'ohne Mängel', JSON.stringify(trenner));
      assert.match(v.ergebnis!.fundstelle, /ohne festgestellte Mängel/);
    }
  });

  it('ohne Erkennungswörter zählt der bedingte Satz auf Seite 2 nicht – lieber kein Vorschlag als „geringe Mängel“', () => {
    // Nur der bedingte Satz: Erläuterungen ohne Bedingung („Erhebliche Mängel sind … zu beheben“) zählten weiter – dagegen
    // helfen die Erkennungswörter des Pakets und die früheste Stelle.
    const v = vorschlaegeAus(HU(false), `${SEITE_1}\f${SEITE_2.split('\n').slice(0, 2).join('\n')}`);
    assert.equal(v.ergebnis, undefined);
  });

  it('zwei Optionen auf derselben Seite: die frühere Stelle gewinnt, gleich in welcher Reihenfolge die Liste steht', () => {
    const text = 'Prüfdienst Muster\nErgebnis: erhebliche Mängel\nHinweis: geringe Mängel wurden ebenfalls notiert.';
    for (const optionen of [OPTIONEN, [...OPTIONEN].reverse()]) {
      const t: Typ = { felder: [feld('ergebnis', 'Ergebnis', 'auswahl', { optionen, erkennung: {} })] };
      assert.equal(vorschlaegeAus(t, text).ergebnis?.wert, 'erhebliche Mängel', optionen.join());
    }
  });

  it('an derselben Stelle gewinnt der längere Text; gesetzt wird der feste Wert, auch bei mehrfach', () => {
    const t: Typ = {
      felder: [
        feld('art', 'Art', 'auswahl', {
          optionen: ['gas', 'strom'],
          mehrfach: true,
          erkennung: { woerter: { jeOption: { gas: ['Gas'], strom: ['Gas und Strom'] } } },
        }),
      ],
    };
    assert.deepEqual(vorschlaegeAus(t, 'Ihr Vertrag: Gas und Strom').art?.wert, ['strom']);
  });

  it('bedingte Sätze zählen nicht – „Bei der Untersuchung wurden … festgestellt“ ist aber ein Ergebnis', () => {
    const t: Typ = { felder: [feld('ergebnis', 'Ergebnis', 'auswahl', { optionen: OPTIONEN, erkennung: {} })] };
    const bedingt = 'Wurden erhebliche Mängel festgestellt, ist eine Nachprüfung nötig. Falls gefährliche Mängel vorliegen, gilt mehr.';
    assert.equal(vorschlaegeAus(t, bedingt).ergebnis, undefined);
    assert.equal(
      vorschlaegeAus(t, `${bedingt}\nBei der Untersuchung wurden geringe Mängel festgestellt.`).ergebnis?.wert,
      'geringe Mängel',
    );
  });

  it('Wörter vor dem Wert gewinnen auch bei Optionen: „(7) Ergebnis: Geringe Mängel“ trotz Legende weiter oben', () => {
    const text = 'Legende: OM = ohne Mängel · GM = geringe Mängel\n(4) km-St. 9363\n(7) Ergebnis: Geringe Mängel';
    const v = vorschlaegeAus(HU(), text);
    assert.equal(v.ergebnis?.wert, 'geringe Mängel');
    assert.equal(v.ergebnis?.sicherheit, 'hoch');
    assert.equal(vorschlaegeAus(HU(false), text).ergebnis?.wert, 'ohne Mängel', 'ohne Wörter: früheste Stelle');
  });
});

describe('Erkennungswörter vor dem Wert (#1714)', () => {
  it('„(4) km-St. 9363“ und „(4) km-Stand: 65884 km“ → Kilometerstand', () => {
    assert.equal(vorschlaegeAus(HU(), 'Prüfdienst Muster\n(4) km-St. 9363 (7) Ergebnis: OM').kilometerstand?.wert, 9363);
    const v = vorschlaegeAus(HU(), 'Prüfdienst Muster\n(4) km-Stand: 65884 km\n(7) Ergebnis: Ohne erkennbare Mängel');
    assert.equal(v.kilometerstand?.wert, 65884);
    assert.equal(v.kilometerstand?.sicherheit, 'hoch');
    assert.match(v.kilometerstand!.fundstelle, /km-Stand: 65884 km/);
    assert.equal(v.ergebnis?.wert, 'ohne Mängel');
    assert.equal(vorschlaegeAus(HU(), 'km-Stand 65.884 km').kilometerstand?.wert, 65884, 'mit Tausenderpunkt');
  });

  it('„(4) km-Stand: 8867 Betriebsstunden“ → kein Vorschlag; „(4) km-Stand: –“ bleibt leer', () => {
    const sonst = '\nAuftrag 4711\nKilometerstand 12000';
    assert.equal(vorschlaegeAus(HU(), `(4) km-Stand: 8867 Betriebsstunden${sonst}`).kilometerstand, undefined);
    assert.equal(vorschlaegeAus(HU(), `(4) km-Stand: –${sonst}`).kilometerstand, undefined);
    // Eine Einheit, die zum Feld passt, schon: Betriebsstunden in „h“.
    const t: Typ = { felder: [feld('stunden', 'Betriebsstunden', 'zahl', { erkennung: { woerter: { vor: ['(4)'] } } })] };
    assert.equal(vorschlaegeAus(t, '(4) km-Stand: 8867 Betriebsstunden').stunden?.wert, 8867);
    assert.equal(vorschlaegeAus(t, '(4) 8867 h').stunden?.wert, 8867);
  });

  it('das Erkennungswort schlägt einen gleichartigen Wert an anderer Stelle (andere Zahl, anderes Datum weiter oben)', () => {
    const text =
      'Prüfdienst Muster\nDatum: 14.01.2026\nKilometerstand 12000 laut Auftrag\nNächste HU-Erinnerung am 01.12.2027\n(4) km-St. 9363\n(8) 01.01.2028';
    const v = vorschlaegeAus(HU(), text);
    assert.equal(v.kilometerstand?.wert, 9363);
    assert.equal(v.naechste_hu?.wert, '2028-01-01');
    assert.equal(v.geprueft_am?.wert, '2026-01-14');
    // Ohne Wörter: das Datum neben der Bezeichnung „Nächste HU“ weiter oben.
    assert.equal(vorschlaegeAus(HU(false), text).naechste_hu?.wert, '2027-12-01');
  });

  it('Datum: Monat ohne Tag („nächste HU fällig April 2028“) bleibt leer, statt einen Tag zu erfinden oder das Briefdatum zu nehmen', () => {
    const text = 'Datum: 14.01.2026\nnächste HU fällig April 2028';
    assert.equal(vorschlaegeAus(HU(), text).naechste_hu, undefined);
    assert.equal(vorschlaegeAus(HU(), 'Datum: 14.01.2026\n(8) Nächste HU / Plakette: Oktober 2028 / ja').naechste_hu, undefined);
    assert.equal(vorschlaegeAus(HU(), 'Datum: 14.01.2026\n(8) Nächste HU / Plakette: 15.10.2028').naechste_hu?.wert, '2028-10-15');
  });

  it('Nummer am Textfeld und Betrag hinter dem Wort', () => {
    const t: Typ = {
      felder: [
        feld('konto', 'Kundenkonto', 'text', { erkennung: { woerter: { vor: ['Vertragskonto', 'Kd.-Nr.'] } } }),
        feld('betrag', 'Betrag', 'betrag', { erkennung: {} }),
        feld('abschlag', 'Abschlag', 'betrag', { erkennung: { woerter: { vor: ['monatlich'] } } }),
      ],
    };
    const v = vorschlaegeAus(t, 'Rechnungsnummer 2026-77\nVertragskonto: 4000123456\nmonatlich 89,00 EUR\nGesamtbetrag 1.068,00 EUR');
    assert.equal(v.konto?.wert, '4000123456');
    assert.deepEqual(v.abschlag?.wert, { betrag: 89, waehrung: 'EUR' });
    assert.deepEqual(v.betrag?.wert, { betrag: 1068, waehrung: 'EUR' });
    assert.equal(vorschlaegeAus(t, 'Kd.-Nr. 4711-0815').konto?.wert, '4711-0815');
  });

  it('nur ganze Wörter: „km-Standort 500“ ist kein „km-Stand“', () => {
    assert.equal(vorschlaegeAus(HU(), 'km-Standort 500').kilometerstand, undefined);
  });
});

describe('Erkennungswörter lesen (#1714)', () => {
  it('vor und jeOption: getrimmt, ohne Doppelte, nur bekannte Optionen, in den Grenzen', () => {
    const e = liesFeldErkennung(
      {
        art: 'auswahl',
        woerter: {
          vor: [' (7) ', '(7)', 'GM', 'x'.repeat(61), 42, 'Ergebnis'],
          jeOption: { 'ohne Mängel': ['keine  Mängel', 'OM'], unbekannt: ['irgendwas'], 'geringe Mängel': 'kein Array' },
        },
      },
      'auswahl',
      OPTIONEN,
    );
    assert.deepEqual(e, { art: 'auswahl', woerter: { vor: ['(7)', 'Ergebnis'], jeOption: { 'ohne Mängel': ['keine Mängel'] } } });
    const viele = liesFeldErkennung({ woerter: { vor: Array.from({ length: 30 }, (_, i) => `Wort ${i}`) } }, 'zahl');
    assert.equal(viele?.woerter?.vor?.length, 20);
  });

  it('jeOption nur bei Auswahl und nur mit Optionen; vor nicht an Verweisfeldern; leer fällt weg', () => {
    assert.deepEqual(liesFeldErkennung({ woerter: { jeOption: { a: ['abc'] } } }, 'auswahl'), {});
    assert.deepEqual(liesFeldErkennung({ woerter: { jeOption: { abc: ['abcd'] } } }, 'text', ['abc']), {});
    assert.deepEqual(liesFeldErkennung({ woerter: { vor: ['Kunde'] } }, 'referenz'), {});
    assert.deepEqual(liesFeldErkennung({ woerter: ['Kunde'] }, 'text'), {});
    assert.deepEqual(liesFeldErkennung({ woerter: { vor: ['Kd.-Nr.'] } }, 'text'), { woerter: { vor: ['Kd.-Nr.'] } });
  });
});
