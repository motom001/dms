/** Zahlen der Werkbank-Navigation aus der Übersicht (#375). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { speicherDateien } from '../src/dateien/dateispeicher';
import { Dienst } from '../src/dienst/dienst';
import { speicherEinstellungen } from '../src/einstellungen/einstellungen';
import { speicherRepo } from '../src/repo/speicher';
import { werkbankZahlen } from '../src/werkbank/werkbankzahlen';
import { nurEigeneBereiche } from '../src/http/routen';
import { ZAEHLER, ZAEHLER_BEREICH } from '../../shared/src/werkbankansicht';
import type { Benutzer } from '../../shared/src/model';

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
    const z = await werkbankZahlen({
      nummernkreise: async () => {
        throw new Error('kaputt');
      },
    });
    assert.deepEqual(z, { nummernkreise: null, pakete: null, benutzer: null, postfaecher: null, darfWeg: null });
  });

  it('folgt Anlegen und Löschen eines Nummernkreises ohne eigenen Abruf des Bereichs', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien(), { einstellungen: speicherEinstellungen() });
    const zahlen = () =>
      werkbankZahlen({ nummernkreise: () => d.nummernkreise.listeNummernkreise(), darfWeg: () => d.mappenArchiv.darfWeg() });
    const vorher = (await zahlen()).nummernkreise!;
    assert.equal(vorher, (await d.nummernkreise.listeNummernkreise()).length, 'gleiche Zahl wie im Bereich');
    await d.nummernkreise.speichereNummernkreis(
      { neu: true, schluessel: 'rechnung', name: 'Rechnungsnummern', muster: 'R{zaehler:4}', start: 1 },
      'test',
    );
    assert.equal((await zahlen()).nummernkreise, vorher + 1);
    await d.nummernkreise.loescheNummernkreis('rechnung', 'test');
    assert.equal((await zahlen()).nummernkreise, vorher);
    assert.equal((await zahlen()).darfWeg, 0);
  });

  it('Übersicht: jede Zahl nur für Personen mit dem zugehörigen Bereich', () => {
    const alle = { nummernkreise: 2, pakete: 1, benutzer: 3, postfaecher: 4, darfWeg: 5 };
    const fuer = (verwaltung: string[]) =>
      nurEigeneBereiche({ id: 'p', email: 'jonas@example.org', name: 'Jonas', rolle: 'mitglied', aktiv: true, verwaltung } as Benutzer, {
        zahlen: { ...alle },
      }).zahlen;
    assert.deepEqual(fuer(['*']), alle, 'Gesamte Verwaltung: alle Zahlen');
    assert.deepEqual(fuer(['benutzer']), { nummernkreise: null, pakete: null, benutzer: 3, postfaecher: null, darfWeg: null });
    assert.deepEqual(fuer(['pakete', 'aufbewahrung']), { nummernkreise: null, pakete: 1, benutzer: null, postfaecher: null, darfWeg: 5 });
    // Jede Zahl der Liste hat einen Bereich – eine neue Zahl ohne Bereich fiele hier auf.
    for (const z of ZAEHLER) assert.equal(fuer([ZAEHLER_BEREICH[z]])![z], alle[z], z);
  });
});
