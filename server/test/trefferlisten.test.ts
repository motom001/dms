/** Mehrere Trefferlisten je Mappentyp (#75): Bereinigen, Rückfall und Auswahl in Sichten. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { standardliste, trefferlistenVon, type Mappentyp } from '../../shared/src/model';
import { gemeinsameTrefferlisten, spaltenDerSicht, trefferlistenProblem } from '../../shared/src/sichten';
import { ladeBeispiele } from '../src/beispiele';
import { speicherDateien } from '../src/dateispeicher';
import { Dienst } from '../src/dienst';
import { speicherRepo } from '../src/repo-speicher';

const felder = [
  { key: 'nr', label: 'Nummer', typ: 'text' as const },
  { key: 'betrag', label: 'Betrag', typ: 'betrag' as const },
  { key: 'pw', label: 'Kennwort', typ: 'passwort' as const },
];

describe('Trefferlisten (#75)', () => {
  it('macht aus der alten Trefferliste die Standardliste', () => {
    assert.deepEqual(trefferlistenVon({ trefferliste: ['nr'] }), [{ key: 'standard', name: 'Standard', spalten: ['nr'], standard: true }]);
    assert.equal(standardliste({ trefferliste: [] }).key, 'standard');
  });

  it('bereinigt Listen: eindeutige Schlüssel, genau ein Standard, nur gültige Spalten', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    const t = await d.legeTypAn({ name: 'Beleg', felder, trefferlisten: [
      { key: 'kurz', name: 'Kurz', spalten: ['nr', 'pw', 'gibtsnicht', 'nr', '_typ', '_titel'] },
      { key: 'kurz', name: 'Noch eine', spalten: ['betrag'], standard: true },
      { name: 'Ohne Schlüssel', spalten: ['_geaendert'], standard: true },
    ] });
    assert.deepEqual(t.trefferlisten!.map((l) => [l.key, l.spalten, !!l.standard]), [
      ['kurz', ['nr', '_titel'], false], ['kurz_2', ['betrag'], true], ['ohne_schluessel', ['_geaendert'], false],
    ]);
    assert.deepEqual(t.trefferliste, ['betrag'], 'ältere Form = Spalten der Standardliste');
    const leer = await d.legeTypAn({ name: 'Leer', felder });
    assert.deepEqual(leer.trefferlisten, [{ key: 'standard', name: 'Standard', spalten: [], standard: true }], 'mindestens eine Liste');
    // Ältere Clients schicken nur trefferliste: sie ersetzt die Spalten der Standardliste.
    const alt = await d.aendereTyp(t.id, { ...t, trefferliste: ['_titel', 'nr'] });
    assert.deepEqual(alt.trefferlisten!.find((l) => l.standard)!.spalten, ['_titel', 'nr']);
    assert.equal(alt.trefferlisten!.length, 3);
  });

  it('wählt die Liste einer Sicht, fällt bei ungültiger Wahl auf den Standard zurück und nimmt bei mehreren Typen nur Gemeinsames', async () => {
    const d = new Dienst(speicherRepo(), speicherDateien());
    await ladeBeispiele(d, null);
    const typen = await d.listeTypen();
    const typ = (n: string) => typen.find((t) => t.name === n)!;
    const r = await d.aendereTyp(typ('Rechnung').id, { ...typ('Rechnung'), trefferliste: undefined, trefferlisten: [
      ...trefferlistenVon(typ('Rechnung')), { key: 'kurz', name: 'Kurz', spalten: ['_titel', 'betrag', 'bezahlt'] },
    ] });
    const z = await d.aendereTyp(typ('Zahlung').id, { ...typ('Zahlung'), trefferliste: undefined, trefferlisten: [
      ...trefferlistenVon(typ('Zahlung')), { key: 'kurz', name: 'Knapp', spalten: ['betrag', '_titel', '_geaendert'] },
    ] });
    assert.deepEqual(spaltenDerSicht([r], 'kurz'), { key: 'kurz', name: 'Kurz', spalten: ['_titel', 'betrag', 'bezahlt'], ungueltig: false });
    assert.deepEqual(spaltenDerSicht([r]).spalten, standardliste(r).spalten);
    const falsch = spaltenDerSicht([r], 'gibtsnicht');
    assert.equal(falsch.ungueltig, true); assert.equal(falsch.key, 'standard');
    assert.match(trefferlistenProblem('gibtsnicht', [r])!, /Standardliste/);
    assert.equal(trefferlistenProblem('kurz', [r]), null);
    const gemeinsam = gemeinsameTrefferlisten([r, z as Mappentyp]);
    assert.deepEqual(gemeinsam.map((l) => [l.key, l.name, l.spalten, l.standard]), [
      ['standard', 'Standard', ['betrag'], true], ['kurz', 'Kurz / Knapp', ['_titel', 'betrag'], false],
    ]);
    assert.deepEqual(spaltenDerSicht([r, z], 'kurz').spalten, ['_titel', '_typ', 'betrag'], 'bei mehreren Typen Titel und Typ vorn');
    assert.deepEqual(spaltenDerSicht([r, z]).spalten, ['_titel', '_typ', 'betrag'], 'gemeinsamer Standard');
    // Verknüpfungsregister: verweisende Mappen vollständig, für die Tabelle.
    const mappen = await d.listeMappen();
    const partner = mappen.find((m) => m.werte.name === 'Stadtwerke Musterstadt')!;
    const v = await d.verweisende(partner.id, r.id, 'aussteller');
    assert.equal(v.gesamt, 1); assert.equal(v.mappen[0].typId, r.id); assert.ok(Object.keys(v.bezuege).length > 0);
    assert.equal((await d.verweisende(partner.id, r.id, 'gibtsnicht')).gesamt, 0);
    // Gespeichert wird nur der Schlüssel.
    const s = await d.legeSichtAn({ name: 'Kurz', typen: [r.id, z.id], bedingungen: [], trefferliste: 'kurz' });
    assert.equal(s.trefferliste, 'kurz');
    assert.equal((await d.aendereSicht(s.id, { ...s, trefferliste: '' })).trefferliste, null);
  });
});
