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

/** Alle Zähler ohne Zahl (null); die Tests setzen nur, was sie prüfen. */
const OHNE = Object.fromEntries(ZAEHLER.map((z) => [z, null])) as Record<(typeof ZAEHLER)[number], number | null>;

describe('Werkbank-Zahlen (#375)', () => {
  it('zählt Nummernkreise, Pakete, aktive Benutzer, Postfächer und Darf weg', async () => {
    const z = await werkbankZahlen({
      nummernkreise: async () => [{}, {}],
      pakete: async () => [{ id: 'haushalt' }],
      benutzer: async () => [{ aktiv: true }, { aktiv: false }, { aktiv: true }],
      postfaecher: async () => [],
      darfWeg: async () => [{}, {}, {}],
    });
    assert.deepEqual(z, { ...OHNE, nummernkreise: 2, pakete: 1, benutzer: 2, postfaecher: 0, darfWeg: 3 });
  });

  it('fehlende oder fehlschlagende Quellen ergeben null statt eines Fehlers', async () => {
    const z = await werkbankZahlen({
      nummernkreise: async () => {
        throw new Error('kaputt');
      },
    });
    assert.deepEqual(z, OHNE);
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

  it('zählt auch Automatisierungen, Vorlagen, Rundgänge, Tipps, Stempel, offene Auskünfte, Wörter und Sperren (#1585)', async () => {
    const z = await werkbankZahlen({
      automatisierungen: async () => [{}, {}],
      ablaufvorlagen: async () => [{}, {}, {}],
      rundgaenge: async () => [{}],
      tipps: async () => [{}, {}, {}, {}],
      stempel: async () => [],
      auskuenfte: async () => [{ zustand: 'angefragt' }, { zustand: 'zugestellt' }, { zustand: 'bereit' }],
      woerter: async () => [{}],
      anmeldeschutz: async () => [{}, {}],
    });
    assert.deepEqual(z, {
      ...OHNE,
      automatisierungen: 2,
      ablaufvorlagen: 3,
      rundgaenge: 1,
      tipps: 4,
      stempel: 0,
      auskuenfte: 2,
      woerter: 1,
      anmeldeschutz: 2,
    });
    // Jeder Bereich, der links eine Zahl zeigt, hat einen Zähler aus der Übersicht – sonst stünde die Zahl erst nach dem
    // Öffnen da (#1585).
    for (const b of ['automatisierungen', 'ablaufvorlagen', 'rundgaenge', 'tipps', 'stempel', 'auskuenfte', 'woerter', 'anmeldeschutz'])
      assert.ok(Object.values(ZAEHLER_BEREICH).includes(b as never), b);
  });

  it('Übersicht: jede Zahl nur für Personen mit dem zugehörigen Bereich', () => {
    const alle: Record<(typeof ZAEHLER)[number], number> = {
      ...(Object.fromEntries(ZAEHLER.map((z, i) => [z, 10 + i])) as Record<(typeof ZAEHLER)[number], number>),
      nummernkreise: 2,
      pakete: 1,
      benutzer: 3,
      postfaecher: 4,
      darfWeg: 5,
    };
    const fuer = (verwaltung: string[]) =>
      nurEigeneBereiche({ id: 'p', email: 'jonas@example.org', name: 'Jonas', rolle: 'mitglied', aktiv: true, verwaltung } as Benutzer, {
        zahlen: { ...alle },
      }).zahlen;
    assert.deepEqual(fuer(['*']), alle, 'Gesamte Verwaltung: alle Zahlen');
    assert.deepEqual(fuer(['benutzer']), { ...OHNE, benutzer: 3 });
    assert.deepEqual(fuer(['pakete', 'aufbewahrung']), { ...OHNE, pakete: 1, darfWeg: 5 });
    // Jede Zahl der Liste hat einen Bereich – eine neue Zahl ohne Bereich fiele hier auf.
    for (const z of ZAEHLER) assert.equal(fuer([ZAEHLER_BEREICH[z]])![z], alle[z], z);
  });

  it('Übersicht: fehlende eingebaute Werkzeuge (#1312) nur mit dem Bereich Systemzustand, dort Folge und „Erneut prüfen“', () => {
    const fuer = (verwaltung: string[]) =>
      nurEigeneBereiche({ id: 'p', email: 'jonas@example.org', name: 'Jonas', rolle: 'mitglied', aktiv: true, verwaltung } as Benutzer, {
        werkzeugeFehlen: ['poppler'],
        schriftenFehlen: true,
      });
    assert.deepEqual(fuer(['*']), { werkzeugeFehlen: ['poppler'], schriftenFehlen: true });
    assert.deepEqual(fuer(['systemzustand']), { werkzeugeFehlen: ['poppler'], schriftenFehlen: true });
    assert.deepEqual(fuer(['benutzer']), { werkzeugeFehlen: [], schriftenFehlen: false });
  });
});
