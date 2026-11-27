/**
 * Datumsfeld mit Genauigkeit „Monat“ (#1722): gespeichert als Monatsletzter, angezeigt als „04/2028“, eingegeben als
 * Monat und Jahr; die Erkennung liest „April 2028“, „Apr. 2028“, „04/2028“, „04.2028“ und – hinter einem Erkennungswort
 * – „042028“. Felder mit Genauigkeit „Tag“ bekommen aus einem bloßen Monat weiter keinen Vorschlag. Texte erfunden
 * (Prüfdienst Muster, Lena Muster).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pruefeVorschlaege, vorschlaegeAus } from '../src/erkennung';
import { formatiere, pruefeMappe, type Feld, type Mappentyp } from '../src/model';
import { leseMonat, monatsletzter, monatText, nurMonat } from '../src/monatsdatum';

type Typ = Pick<Mappentyp, 'felder'>;
const feld = (key: string, label: string, typ: Feld['typ'], x: Partial<Feld> = {}): Feld => ({ key, label, typ, ...x });
const HEUTE = new Date(Date.UTC(2026, 10, 27));

/** Hauptuntersuchung wie im Paket fahrzeuge (dms-registry #278): „Nächste HU“ nur mit Monat. */
const HU = (genauigkeit: Feld['genauigkeit'] | null, woerter = true): Typ => ({
  felder: [
    feld('geprueft_am', 'Geprüft am', 'datum', { erkennung: {} }),
    feld('naechste_hu', 'Nächste HU', 'datum', {
      ...(genauigkeit ? { genauigkeit } : {}),
      erkennung: woerter ? { woerter: { vor: ['(8)', 'Nächste HU', 'nächste HU fällig'] } } : {},
    }),
  ],
});
/** null = ohne Angabe (wie bisher, also Tag). */
const hu = (text: string, genauigkeit: Feld['genauigkeit'] | null = 'monat', woerter = true) =>
  vorschlaegeAus(HU(genauigkeit, woerter), text, undefined, { heute: HEUTE }).naechste_hu;

describe('Genauigkeit Monat: Speichern, Anzeige, Eingabe (#1722)', () => {
  it('gespeichert wird der Monatsletzte – auch im Februar eines Schaltjahrs', () => {
    assert.equal(monatsletzter('2028-04'), '2028-04-30');
    assert.equal(monatsletzter('2028-04-15'), '2028-04-30');
    assert.equal(monatsletzter('2028-02'), '2028-02-29');
    assert.equal(monatsletzter('2027-02-01'), '2027-02-28');
    assert.equal(monatsletzter('2027-12'), '2027-12-31');
    for (const x of ['2028-13', '2028-04-31', '04/2028', '', '2028']) assert.equal(monatsletzter(x), null, x);
  });

  it('Eingabe: Monat und Jahr genügen, ein ganzes Datum zählt für seinen Monat', () => {
    for (const x of ['04/2028', '4/2028', '04.2028', '4.2028', '04 2028', '042028', '2028-04', ' 04/2028 ', '15.04.2028', '2028-04-15'])
      assert.equal(leseMonat(x), '2028-04-30', x);
    for (const x of ['', '04/20', '13/2028', '00/2028', 'April', '4711', '1234567']) assert.equal(leseMonat(x), null, x);
  });

  it('Anzeige „04/2028“, Feld mit Genauigkeit Tag unverändert „30.04.2028“', () => {
    const monat = feld('naechste_hu', 'Nächste HU', 'datum', { genauigkeit: 'monat' });
    assert.equal(monatText('2028-04-30'), '04/2028');
    assert.equal(formatiere(monat, '2028-04-30'), '04/2028');
    assert.equal(formatiere(feld('d', 'Datum', 'datum'), '2028-04-30'), '30.04.2028');
    assert.equal(formatiere(feld('d', 'Datum', 'datum', { genauigkeit: 'tag' }), '2028-04-30'), '30.04.2028');
    assert.equal(formatiere(monat, ''), '');
  });

  it('nur am Datumsfeld', () => {
    assert.ok(nurMonat({ typ: 'datum', genauigkeit: 'monat' }));
    assert.ok(!nurMonat({ typ: 'datum' }));
    assert.ok(!nurMonat({ typ: 'text', genauigkeit: 'monat' }));
  });

  it('Prüfung: der Monatsletzte ist ein gültiges Datum, Text wie „04/20“ nicht', () => {
    const t: Typ = { felder: [feld('naechste_hu', 'Nächste HU', 'datum', { genauigkeit: 'monat' })] };
    const ctx = { typVon: () => undefined, doppelt: () => undefined };
    assert.deepEqual(pruefeMappe(t, { naechste_hu: '2028-04-30' }, ctx).felder, {});
    assert.equal(pruefeMappe(t, { naechste_hu: '04/20' }, ctx).felder.naechste_hu?.length, 1);
  });
});

describe('Genauigkeit Monat: Erkennung (#1722)', () => {
  const BRIEF = 'Prüfdienst Muster · Musterstraße 1 · 12345 Musterstadt\nHalterin: Lena Muster\nDatum: 14.01.2026\n';

  it('„nächste HU fällig April 2028“, „04/2028“, „042028“ → 2028-04-30', () => {
    for (const zeile of ['nächste HU fällig April 2028', '(8) Nächste HU: 04/2028', '(8) Nächste HU 042028']) {
      const v = hu(BRIEF + zeile);
      assert.equal(v?.wert, '2028-04-30', zeile);
      assert.equal(v?.sicherheit, 'hoch', zeile);
    }
  });

  it('weitere Schreibweisen hinter dem Erkennungswort: „Apr. 2028“, „April 2028“, „04.2028“, „4/2028“, „MÄRZ 2027“', () => {
    for (const [zeile, wert] of [
      ['(8) Nächste HU: Apr. 2028', '2028-04-30'],
      ['(8) Nächste HU / Plakette: April 2028 / ja', '2028-04-30'],
      ['(8) Nächste HU 04.2028', '2028-04-30'],
      ['(8) Nächste HU 4/2028', '2028-04-30'],
      ['(8) Nächste HU: MÄRZ 2027', '2027-03-31'],
      ['(8) Nächste HU: Maerz 2027', '2027-03-31'],
      ['(8) Nächste HU: Feb 2028', '2028-02-29'],
      // Ein ganzes Datum zählt für seinen Monat.
      ['(8) Nächste HU / Plakette: 15.10.2028', '2028-10-31'],
    ])
      assert.equal(hu(BRIEF + zeile)?.wert, wert, zeile);
  });

  it('ohne Erkennungswörter: neben der Bezeichnung („Nächste HU“), aber nie „042028“ und nie das Briefdatum', () => {
    assert.equal(hu(BRIEF + 'Nächste HU fällig April 2028', 'monat', false)?.wert, '2028-04-30');
    assert.equal(hu(BRIEF + 'Nächste HU: 04/2028', 'monat', false)?.wert, '2028-04-30');
    assert.equal(hu(BRIEF + 'Nächste HU 042028', 'monat', false), undefined);
    assert.equal(hu(BRIEF + 'Bitte vormerken.', 'monat', false), undefined);
    // Das Datum von „Geprüft am“ bleibt tagesgenau.
    const v = vorschlaegeAus(HU('monat', false), BRIEF + 'Nächste HU: 04/2028', undefined, { heute: HEUTE });
    assert.equal(v.geprueft_am?.wert, '2026-01-14');
  });

  it('Feld mit Genauigkeit Tag bekommt aus einem bloßen Monat keinen Vorschlag', () => {
    for (const zeile of ['nächste HU fällig April 2028', '(8) Nächste HU: 04/2028', '(8) Nächste HU 042028', '(8) Nächste HU: Apr. 2028']) {
      assert.equal(hu(zeile, null), undefined, zeile);
      assert.equal(hu(zeile, 'tag'), undefined, zeile);
      assert.equal(hu(zeile, null, false), undefined, `${zeile} (ohne Wörter)`);
    }
    // Ein ganzes Datum bleibt dort, wie es ist.
    assert.equal(hu('(8) Nächste HU: 15.10.2028', null)?.wert, '2028-10-15');
  });

  it('keine Monate aus Telefonnummern, Daten oder langen Zahlen', () => {
    const t = (text: string) => hu(text, 'monat', false);
    assert.equal(t('Nächste HU 01/04/2028 Uhr'), undefined, 'kein Datum mit Schrägstrich, kein Monat daraus');
    assert.equal(t('Nächste HU Tel. 0351/20284711'), undefined);
    assert.equal(t('Nächste HU 13/2028'), undefined);
  });

  it('Plausibilität (#1709): der Monat in zwei Jahren zählt ganz – „11/2028“ im November 2026 bleibt sicher', () => {
    assert.equal(hu('(8) Nächste HU: 11/2028')?.sicherheit, 'hoch');
    assert.equal(hu('(8) Nächste HU: 12/2028')?.sicherheit, 'niedrig');
  });

  it('Antworten aus Paketen (dms:erkennen) werden zum Monatsletzten', () => {
    const typ = HU('monat');
    const { vorschlaege } = pruefeVorschlaege(typ as Mappentyp, {
      naechste_hu: { wert: '2028-04-01', sicherheit: 'hoch', fundstelle: 'x' },
    });
    assert.equal(vorschlaege.naechste_hu?.wert, '2028-04-30');
    const tag = pruefeVorschlaege(HU(null) as Mappentyp, { naechste_hu: '2028-04-01' });
    assert.equal(tag.vorschlaege.naechste_hu?.wert, '2028-04-01');
  });
});
