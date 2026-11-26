/**
 * Plausibilität der Felder (#1693, Teil 2): IBAN-Prüfziffer, Datum im Rahmen, „Bis“ nicht vor „Von“, Netto + Steuer =
 * Gesamtbetrag. Texte erfunden (Personas, example.org).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findeAngaben, vorschlaegeAus } from '../src/erkennung';
import type { Feld } from '../src/model';

const f = (key: string, label: string, typ: Feld['typ'], erkennung: Feld['erkennung'] = {}): Feld => ({ key, label, typ, erkennung });
const HEUTE = new Date(Date.UTC(2026, 10, 26));
const opt = { heute: HEUTE };

const RECHNUNG = {
  name: 'Rechnung',
  felder: [
    f('betrag', 'Betrag', 'betrag', { art: 'betrag' }),
    f('datum', 'Rechnungsdatum', 'datum', { art: 'datum' }),
    f('netto_gesamt', 'Netto gesamt', 'betrag'),
    f('ust_gesamt', 'Umsatzsteuer gesamt', 'betrag'),
  ],
};
const kopf = `Beispiel Handwerk GmbH · Werkstraße 1 · 01067 Musterstadt
Musterstadt, 02.12.2026
Rechnung R-2026-0815`;

describe('Plausibilität der Felder (#1693, Teil 2)', () => {
  it('IBAN mit falscher Prüfziffer: nie vorgeschlagen – weder gefunden noch über ein Muster', () => {
    const richtig = 'DE89 3704 0044 0532 0130 00';
    const falsch = 'DE88 3704 0044 0532 0130 00';
    assert.equal(findeAngaben(`IBAN ${falsch}`).ibans.length, 0, 'istIban filtert schon beim Finden');
    const typ = { felder: [f('iban', 'IBAN', 'text')] };
    assert.equal(vorschlaegeAus(typ, `IBAN ${falsch}`, undefined, opt).iban, undefined);
    assert.equal(vorschlaegeAus(typ, `IBAN ${richtig}`, undefined, opt).iban?.wert, richtig);
    const mitMuster = { felder: [f('iban', 'IBAN', 'text', { hinweis: `Muster DE${'#'.repeat(20)}` })] };
    const ohne = (s: string) => s.replace(/ /g, '');
    assert.equal(vorschlaegeAus(mitMuster, `IBAN ${ohne(falsch)}`, undefined, opt).iban, undefined);
    assert.equal(vorschlaegeAus(mitMuster, `IBAN ${ohne(richtig)}`, undefined, opt).iban?.sicherheit, 'hoch');
  });

  it('Netto + Steuer = Gesamtbetrag: Netto und Steuer werden sicher', () => {
    const v = vorschlaegeAus(RECHNUNG, `${kopf}\nNettobetrag 100,00 €\nMwSt 19 % 19,00 €\nGesamtbetrag 119,00 €`, undefined, opt);
    assert.deepEqual(v.netto_gesamt?.wert, { betrag: 100, waehrung: 'EUR' });
    assert.equal(v.netto_gesamt?.sicherheit, 'hoch');
    assert.equal(v.ust_gesamt?.sicherheit, 'hoch');
    assert.equal(v.betrag?.sicherheit, 'hoch');
    assert.equal(v.netto_gesamt?.hinweis, undefined);
  });

  it('passt es nicht zusammen: alle drei unsicher mit Hinweis', () => {
    const v = vorschlaegeAus(RECHNUNG, `${kopf}\nNettobetrag 100,00 €\nMwSt 19 % 19,00 €\nGesamtbetrag 191,00 €`, undefined, opt);
    for (const k of ['betrag', 'netto_gesamt', 'ust_gesamt']) {
      assert.equal(v[k]?.sicherheit, 'niedrig', k);
      assert.match(v[k]?.hinweis ?? '', /passen nicht zusammen/, k);
    }
  });

  it('Widerspruch: der stimmige Betrag aus dem Text gewinnt, wenn der Gesamtbetrag nicht sicher war', () => {
    // „Betrag“ ist schwächer beschriftet; 119,00 € steht ohne Beschriftung, passt aber zu Netto + Steuer.
    const v = vorschlaegeAus(RECHNUNG, `${kopf}\nNettobetrag 100,00 €\nMwSt 19,00 €\n119,00 €\nBetrag 150,00 €`, undefined, opt);
    assert.deepEqual(v.betrag?.wert, { betrag: 119, waehrung: 'EUR' });
    assert.equal(v.betrag?.sicherheit, 'mittel');
    assert.match(v.betrag?.fundstelle ?? '', /119,00/);
    assert.equal(v.netto_gesamt?.sicherheit, 'hoch');
    assert.equal(v.ust_gesamt?.sicherheit, 'hoch');
  });

  it('Rundung bis 2 Cent zählt als stimmig; nur zwei von drei Beträgen: keine Prüfung', () => {
    const v = vorschlaegeAus(RECHNUNG, `${kopf}\nNettobetrag 84,03 €\nMwSt 15,96 €\nGesamtbetrag 100,00 €`, undefined, opt);
    assert.equal(v.netto_gesamt?.sicherheit, 'hoch');
    const zwei = vorschlaegeAus(RECHNUNG, `${kopf}\nNettobetrag 100,00 €\nGesamtbetrag 191,00 €`, undefined, opt);
    assert.equal(zwei.netto_gesamt?.sicherheit, 'mittel');
    assert.equal(zwei.betrag?.hinweis, undefined);
  });

  it('Netto und Steuer an den Wörtern des Felds, auch über Gruppen aus der Werkbank – nicht an der Kennung', () => {
    const typ = {
      felder: [f('summe', 'Zu zahlen', 'betrag', { art: 'betrag' }), f('b1', 'Warenwert', 'betrag'), f('b2', 'Abgabe', 'betrag')],
    };
    const text = `${kopf}\nWarenwert 100,00 €\nAbgabe 19,00 €\nzu zahlen 191,00 €`;
    assert.equal(vorschlaegeAus(typ, text, undefined, opt).b1?.sicherheit, 'mittel', 'ohne Netto-/Steuerwort keine Prüfung');
    const gruppen = [
      ['warenwert', 'netto'],
      ['abgabe', 'steuer'],
    ];
    const v = vorschlaegeAus(typ, text, undefined, { ...opt, gruppen });
    assert.equal(v.b1?.sicherheit, 'niedrig');
    assert.equal(v.summe?.sicherheit, 'niedrig');
  });

  it('Datum weit in der Zukunft oder vor 1950: höchstens unsicher, mit Hinweis', () => {
    const typ = { felder: [f('datum', 'Datum', 'datum', { art: 'datum' })] };
    const zukunft = vorschlaegeAus(typ, 'Musterstadt, 02.12.2031\nVertrag', undefined, opt).datum;
    assert.equal(zukunft?.wert, '2031-12-02');
    assert.equal(zukunft?.sicherheit, 'niedrig');
    assert.match(zukunft?.hinweis ?? '', /Zukunft/);
    const frueh = vorschlaegeAus(typ, 'Musterstadt, 02.12.1949\nVertrag', undefined, opt).datum;
    assert.equal(frueh?.sicherheit, 'niedrig');
    assert.match(frueh?.hinweis ?? '', /zurück/);
    const nah = vorschlaegeAus(typ, 'Musterstadt, 02.11.2028\nVertrag', undefined, opt).datum;
    assert.equal(nah?.sicherheit, 'hoch', 'innerhalb von zwei Jahren bleibt es');
    assert.equal(nah?.hinweis, undefined);
  });

  it('„Bis“ vor „Von“: beide höchstens unsicher, mit Hinweis', () => {
    const typ = { felder: [f('beginn', 'Beginn', 'datum'), f('ende', 'Ende', 'datum')] };
    const v = vorschlaegeAus(typ, 'Beginn: 01.07.2026\nEnde: 30.06.2026', undefined, opt);
    assert.equal(v.beginn?.wert, '2026-07-01');
    assert.equal(v.ende?.wert, '2026-06-30');
    assert.equal(v.beginn?.sicherheit, 'niedrig');
    assert.equal(v.ende?.sicherheit, 'niedrig');
    assert.equal(v.ende?.hinweis, '„Ende“ liegt vor „Beginn“ – bitte prüfen');
    const gut = vorschlaegeAus(typ, 'vom 01.07.2026 – 31.07.2026', undefined, opt);
    assert.equal(gut.beginn?.sicherheit, 'hoch');
    assert.equal(gut.ende?.hinweis, undefined);
  });
});
