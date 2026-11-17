/**
 * Geteilte Sprachdateien (#1279): Große Bereiche wie `werkbank` und `meldungen` stehen je Sprache in einem Ordner mit
 * Teildateien (`werkbank/pakete.json`, `meldungen/dienst.json` …); `index.ts` im Ordner führt sie zu einem Bereich
 * zusammen, die Schlüssel im Code bleiben gleich. Diese Prüfung läuft in der CI mit `sprachdateien.test.ts` und meldet:
 *
 * - einen Schlüssel in zwei Teildateien (beim Zusammenführen gewänne still die letzte),
 * - eine Gruppe (erster Teil des Schlüssels, z. B. `pakete` in `pakete.dazu.titel`), die über mehrere Teildateien
 *   verstreut ist – jede Gruppe hat genau eine Datei, so findet man jeden Text an einer Stelle,
 * - eine Sprache, die anders teilt als Deutsch,
 * - Texte, die der Code anders bekommt, als sie in den Dateien stehen (z. B. eine Teildatei fehlt in `index.ts`).
 *
 * Regel für neue Texte: Entwicklerhandbuch → Aufbau → Texte und Sprachdateien.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEUTSCH } from '../../shared/src/deutsch';
import { ENGLISCH } from '../../shared/src/englisch';
import { doppelteSchluessel, sprachstand, sprachteile, type Teildatei } from './sprachdateien-lesen';

/** Gruppen, die in mehr als einer Teildatei vorkommen. */
function verstreuteGruppen(ort: string, teile: readonly Teildatei[]): string[] {
  const wo = new Map<string, Set<string>>();
  for (const t of teile)
    for (const k of Object.keys(t.texte)) {
      const g = k.split('.')[0];
      wo.set(g, (wo.get(g) ?? new Set()).add(t.name));
    }
  return [...wo]
    .filter(([, d]) => d.size > 1)
    .map(([g, d]) => `${ort}: Gruppe „${g}“ steht in ${[...d].map((n) => `${n}.json`).join(', ')} – bitte in eine Datei.`);
}

/** Schlüssel → Teildatei. */
const dateiJeSchluessel = (teile: readonly Teildatei[]) => new Map(teile.flatMap((t) => Object.keys(t.texte).map((k) => [k, t.name])));

describe('Geteilte Sprachdateien (#1279)', () => {
  const alle = sprachteile();
  const geteilt = Object.entries(alle).flatMap(([spr, bereiche]) =>
    Object.entries(bereiche)
      .filter(([, teile]) => teile.length > 1)
      .map(([bereich, teile]) => ({ spr, bereich, teile, ort: `${spr}/${bereich}/` })),
  );

  it('werkbank und meldungen sind geteilt, in jeder eingebauten Sprache', () => {
    for (const spr of ['de', 'en'])
      for (const bereich of ['werkbank', 'meldungen'])
        assert.ok((alle[spr][bereich]?.length ?? 0) > 5, `${spr}/${bereich}/ hat zu wenige Teildateien`);
  });

  it('kein Schlüssel steht in zwei Teildateien', () => {
    const maengel = geteilt.flatMap((g) => doppelteSchluessel(g.ort, g.teile));
    assert.deepEqual(maengel, [], `\n${maengel.join('\n')}`);
  });

  it('jede Gruppe steht ganz in einer Teildatei', () => {
    const maengel = geteilt.flatMap((g) => verstreuteGruppen(g.ort, g.teile));
    assert.deepEqual(maengel, [], `\n${maengel.join('\n')}`);
  });

  it('jede Sprache teilt wie Deutsch: dieselben Dateien, jeder Schlüssel in derselben', () => {
    const maengel: string[] = [];
    for (const g of geteilt) {
      if (g.spr === 'de') continue;
      const de = alle.de[g.bereich] ?? [];
      const namen = (t: readonly Teildatei[]) => t.map((x) => x.name).join(', ');
      if (namen(de) !== namen(g.teile)) maengel.push(`${g.ort}: Dateien ${namen(g.teile)}, in de/${g.bereich}/: ${namen(de)}.`);
      const soll = dateiJeSchluessel(de);
      for (const [k, datei] of dateiJeSchluessel(g.teile))
        if (soll.has(k) && soll.get(k) !== datei)
          maengel.push(`${g.ort}${datei}.json: „${k}“ steht in de/${g.bereich}/${soll.get(k)}.json.`);
    }
    assert.deepEqual(maengel, [], `\n${maengel.join('\n')}`);
  });

  it('der Code bekommt genau die Texte der Dateien (jede Teildatei steht in index.ts)', () => {
    const stand = sprachstand();
    for (const [spr, eingebaut] of [
      ['de', DEUTSCH],
      ['en', ENGLISCH],
    ] as const) {
      assert.deepEqual(Object.keys(eingebaut).sort(), Object.keys(stand[spr]).sort(), `${spr}: Bereiche`);
      for (const bereich of Object.keys(eingebaut)) assert.deepEqual(eingebaut[bereich], stand[spr][bereich], `${spr}/${bereich}`);
    }
  });

  it('die Prüfungen erkennen doppelte Schlüssel und verstreute Gruppen', () => {
    const teile: Teildatei[] = [
      { name: 'a', texte: { 'pakete.titel': 'Pakete', 'sicherung.titel': 'Sicherung' } },
      { name: 'b', texte: { 'pakete.titel': 'Pakete!', 'pakete.text': 'Text' } },
    ];
    assert.deepEqual(doppelteSchluessel('de/probe/', teile), ['de/probe/: Schlüssel „pakete.titel“ steht in a.json und in b.json.']);
    assert.deepEqual(verstreuteGruppen('de/probe/', teile), ['de/probe/: Gruppe „pakete“ steht in a.json, b.json – bitte in eine Datei.']);
    assert.deepEqual(doppelteSchluessel('de/probe/', [teile[0]]), []);
  });
});
