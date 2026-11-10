#!/usr/bin/env node
/**
 * Fachordner haben eine Tür und eine Beschreibung (#1072): Jeder Ordner direkt unter server/src/ mit einer Datei
 * `*.dienst.ts` braucht `index.ts` (die einzige Tür, geprüft von `npm run lint:abh`, Regel `fachordner`) und eine
 * von Hand geschriebene `README.md` (20–40 Zeilen; was darin steht, prüft niemand – nur, dass es sie gibt).
 *
 * `node .github/werkzeuge/fachordner-pruefen.mjs [wurzel]` (Standard: server/src)
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Was jeder Fachordner mit Dienst haben muss. */
export const PFLICHT = ['index.ts', 'README.md'];

/** Fehlende Dateien je Fachordner unter `wurzel`: [{ ordner, fehlt: [...] }]. */
export function pruefe(wurzel = 'server/src') {
  const funde = [];
  for (const d of readdirSync(wurzel, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const ordner = join(wurzel, d.name);
    if (!readdirSync(ordner).some((n) => n.endsWith('.dienst.ts'))) continue;
    const fehlt = PFLICHT.filter((n) => !existsSync(join(ordner, n)));
    if (fehlt.length) funde.push({ ordner: relative(process.cwd(), ordner).split(sep).join('/'), fehlt });
  }
  return funde;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const funde = pruefe(process.argv[2]);
  for (const f of funde) {
    for (const n of f.fehlt) console.log(`::error file=${f.ordner}/${n},title=Fachordner::${f.ordner}/ hat einen Dienst, aber keine ${n} – jeder Fachordner mit *.dienst.ts braucht index.ts und README.md`);
  }
  console.log(funde.length ? `${funde.length} Fachordner unvollständig.` : 'Alle Fachordner mit Dienst haben index.ts und README.md.');
  process.exitCode = funde.length ? 1 : 0;
}
