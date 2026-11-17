/**
 * Sprachdateien von der Platte lesen – für die Prüfungen unter shared/test. Ein Bereich ist entweder eine Datei
 * `<sprache>/<bereich>.json` oder ein Ordner `<sprache>/<bereich>/` mit Teildateien (#1279, z. B. `werkbank/pakete.json`);
 * die Teildateien ergeben zusammen den Bereich, wie `index.ts` im Ordner sie für den Code zusammenführt.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Sprachstand } from '../../shared/src/sprachpruefung';

export const SPRACHEN = new URL('../src/sprachen', import.meta.url).pathname;

/** Eine Teildatei eines Bereichs: Name ohne `.json` und ihre Texte. */
export interface Teildatei {
  name: string;
  texte: Record<string, unknown>;
}

const json = (datei: string) => JSON.parse(readFileSync(datei, 'utf8')) as Record<string, unknown>;

/** Sprache → Bereich → Teildateien; ein Bereich als eine Datei hat genau eine Teildatei mit seinem Namen. */
export function sprachteile(wurzel = SPRACHEN): Record<string, Record<string, Teildatei[]>> {
  const aus: Record<string, Record<string, Teildatei[]>> = {};
  for (const spr of readdirSync(wurzel)) {
    if (!statSync(join(wurzel, spr)).isDirectory()) continue;
    aus[spr] = {};
    for (const e of readdirSync(join(wurzel, spr), { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.json'))
        aus[spr][e.name.slice(0, -5)] = [{ name: e.name.slice(0, -5), texte: json(join(wurzel, spr, e.name)) }];
      else if (e.isDirectory())
        aus[spr][e.name] = readdirSync(join(wurzel, spr, e.name))
          .filter((n) => n.endsWith('.json'))
          .sort()
          .map((n) => ({ name: n.slice(0, -5), texte: json(join(wurzel, spr, e.name, n)) }));
    }
  }
  return aus;
}

/** Schlüssel, die in mehr als einer Teildatei stehen – beim Zusammenführen gewänne still die letzte. */
export function doppelteSchluessel(ort: string, teile: readonly Teildatei[]): string[] {
  const wo = new Map<string, string>();
  const maengel: string[] = [];
  for (const t of teile)
    for (const k of Object.keys(t.texte)) {
      const vorher = wo.get(k);
      if (vorher) maengel.push(`${ort}: Schlüssel „${k}“ steht in ${vorher}.json und in ${t.name}.json.`);
      else wo.set(k, t.name);
    }
  return maengel;
}

/** Sprache → Bereich → Schlüssel → Text, Teildateien zusammengeführt (für `pruefeSprachdateien`). */
export function sprachstand(wurzel = SPRACHEN): Sprachstand {
  const stand: Sprachstand = {};
  for (const [spr, bereiche] of Object.entries(sprachteile(wurzel))) {
    stand[spr] = {};
    for (const [bereich, teile] of Object.entries(bereiche)) stand[spr][bereich] = Object.assign({}, ...teile.map((t) => t.texte));
  }
  return stand;
}
