/** Zahlen der Werkbank-Navigation aus der Übersicht (#375). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherEinstellungen } from '../src/einstellungen';
import { speicherRepo } from '../src/repo-speicher';
import { werkbankZahlen } from '../src/werkbankzahlen';

describe('Werkbank-Zahlen (#375)', () => {
  it('zählt Nummernkreise, Pakete, aktive Benutzer, Postfächer und Darf weg', async () => {
    const z = await werkbankZahlen({
      nummernkreise: async () => [{}, {}],
      pakete: async () => [{ id: 'haushalt' }],
      benutzer: async () => [{ aktiv: true }, { aktiv: false }, { aktiv: true }],
      postfaecher: async () => [],
      darfWeg: async () => [{}, {}, {}],
    });
    assert.deepEqual(z, { nummernkreise: 2, pakete: 1, benutzer: 2, postfaecher: 0, darfWeg: 3 });
  });

  it('fehlende oder fehlschlagende Quellen ergeben null statt eines Fehlers', async () => {
    const z = await werkbankZahlen({ nummernkreise: async () => { throw new Error('kaputt'); } });
    assert.deepEqual(z, { nummernkreise: null, pakete: null, benutzer: null, postfaecher: null, darfWeg: null });
  });

  it('folgt Anlegen und Löschen eines Nummernkreises ohne eigenen Abruf des Bereichs', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const zahlen = () => werkbankZahlen({ nummernkreise: () => d.listeNummernkreise(), darfWeg: () => d.darfWeg() });
    const vorher = (await zahlen()).nummernkreise!;
    assert.equal(vorher, (await d.listeNummernkreise()).length, 'gleiche Zahl wie im Bereich');
    await d.speichereNummernkreis({ neu: true, schluessel: 'rechnung', name: 'Rechnungsnummern', muster: 'R{zaehler:4}', start: 1 }, 'test');
    assert.equal((await zahlen()).nummernkreise, vorher + 1);
    await d.loescheNummernkreis('rechnung', 'test');
    assert.equal((await zahlen()).nummernkreise, vorher);
    assert.equal((await zahlen()).darfWeg, 0);
  });
});
