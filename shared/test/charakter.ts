/**
 * Charakterisierung gemeinsamer Funktionen (#1278, Schritt 6b-3): Ergebnisse vieler Eingaben als JSON unter
 * `shared/test/charakter/<name>.json`. Neu schreiben nur, wenn sich das Verhalten bewusst ändert:
 * `CHARAKTER_SCHREIBEN=1 npm test --prefix shared` – dann den Unterschied prüfen.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Vergleicht `ist` (Fall → Ergebnis) mit der festgehaltenen Erwartung; Reihenfolge der Fälle zählt mit. */
export function wieFestgehalten(name: string, ist: Record<string, unknown>): void {
  const datei = join(import.meta.dirname, 'charakter', `${name}.json`);
  const roh = JSON.parse(JSON.stringify(ist)) as Record<string, unknown>;
  if (process.env.CHARAKTER_SCHREIBEN) {
    mkdirSync(dirname(datei), { recursive: true });
    writeFileSync(datei, `${JSON.stringify(roh, null, 2)}\n`);
  }
  assert.ok(existsSync(datei), `Erwartung fehlt: ${datei}`);
  const soll = JSON.parse(readFileSync(datei, 'utf8')) as Record<string, unknown>;
  for (const k of Object.keys(soll)) assert.deepEqual(roh[k], soll[k], k);
  assert.deepEqual(Object.keys(roh), Object.keys(soll));
}
