/** Ansicht wählen am Handy (#498): Abschnitte, Anheften, Ausblenden, zuletzt benutzt, Suche. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ansichtAbschnitte, merkeZuletzt, umschalten, ZULETZT_MAX } from '../../shared/src/ansichtwahl';
import type { Sicht } from '../../shared/src/sichten';

let pos = 0;
const s = (id: string, name: string, elternId: string | null = null) => ({ id, name, elternId, position: (pos += 10), typen: [], bedingungen: [], beschreibung: '', erstellt: '', geaendert: '' }) as unknown as Sicht;
const SICHTEN = [
  s('post', 'Neue Post'), s('fz', 'Fahrzeuge'), s('fz1', 'Alle Fahrzeuge', 'fz'), s('fz2', 'TÜV fällig', 'fz'),
  s('haus', 'Haus'), s('h1', 'Handwerker', 'haus'), s('vers', 'Versicherungen'),
];

describe('Ansicht wählen (#498)', () => {
  it('gruppiert nach oberster Ebene, Einzelne unter „Weitere Ansichten“', () => {
    const a = ansichtAbschnitte(SICHTEN, {});
    assert.deepEqual(a.gruppen.map((g) => [g.name, g.eintraege.map((e) => `${e.sicht.id}:${e.tiefe}`)]), [
      ['Fahrzeuge', ['fz:0', 'fz1:1', 'fz2:1']], ['Haus', ['haus:0', 'h1:1']], ['Weitere Ansichten', ['post:0', 'vers:0']],
    ]);
    assert.equal(a.treffer, null);
  });

  it('Meine Ansichten, zuletzt benutzt (ohne Doppelte), Ausgeblendete fehlen', () => {
    const a = ansichtAbschnitte(SICHTEN, { angeheftet: ['fz2', 'weg'], zuletzt: ['fz2', 'h1', 'vers'], ausgeblendet: ['vers', 'fz1'] });
    assert.deepEqual(a.meine.map((x) => x.id), ['fz2']);
    assert.deepEqual(a.zuletzt.map((x) => x.id), ['h1']);
    assert.equal(a.ausgeblendet, 2);
    assert.ok(!a.gruppen.flatMap((g) => g.eintraege).some((e) => e.sicht.id === 'vers' || e.sicht.id === 'fz1'));
  });

  it('Suche findet auch Ausgeblendete, mit Pfad, Wortanfang zuerst', () => {
    const a = ansichtAbschnitte(SICHTEN, { suche: 'fa', ausgeblendet: ['fz2'] });
    assert.deepEqual(a.treffer!.map((t) => [t.sicht.name, t.pfad]), [['Fahrzeuge', ''], ['Alle Fahrzeuge', 'Fahrzeuge']]);
    assert.deepEqual(ansichtAbschnitte(SICHTEN, { suche: 'TÜV', ausgeblendet: ['fz2'] }).treffer!.map((t) => t.sicht.id), ['fz2']);
  });

  it('feste Einträge (Neue Post, #507) erscheinen nicht noch einmal', () => {
    const a = ansichtAbschnitte(SICHTEN, { ohne: ['post'], angeheftet: ['post'], zuletzt: ['post'] });
    assert.ok(!a.gruppen.flatMap((g) => g.eintraege).some((e) => e.sicht.id === 'post'));
    assert.deepEqual([a.meine.length, a.zuletzt.length], [0, 0]);
    // Mit Unteransichten bleibt sie in den Gruppen (sonst gingen die Unteransichten verloren).
    assert.ok(ansichtAbschnitte(SICHTEN, { ohne: ['fz'] }).gruppen.some((g) => g.schluessel === 'fz'));
  });

  it('merkeZuletzt und umschalten', () => {
    assert.deepEqual(merkeZuletzt(['a', 'b'], 'b'), ['b', 'a']);
    assert.equal(merkeZuletzt(['1', '2', '3', '4', '5', '6'], 'x').length, ZULETZT_MAX);
    assert.deepEqual(merkeZuletzt('kaputt', 'a'), ['a']);
    assert.deepEqual(umschalten(['a'], 'b'), ['a', 'b']);
    assert.deepEqual(umschalten(['a', 'b'], 'a'), ['b']);
  });
});
