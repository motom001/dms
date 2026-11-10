#!/usr/bin/env node
/**
 * Abhängigkeitsbild fürs Entwicklerhandbuch (#899): `npm run abhaengigkeitsbild`.
 *
 * Fasst die Importe aus dependency-cruiser auf Ordner-Ebene zusammen (server/src/pdf, web/src/ablage, …; Dateien direkt
 * unter src/ zählen als „… (Wurzel)“) und schreibt docs/handbuch/entwickler/docs/grafiken/abhaengigkeiten.mmd. Reine
 * Typ-Importe zählen mit, Tests nicht. Ist mmdc (Mermaid-CLI) da, entsteht daneben das Bild abhaengigkeiten.png – wie
 * bei den übrigen Grafiken (`mmdc -s 2`); das Handbuch lädt kein Mermaid aus dem Netz (#698).
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cruise } from 'dependency-cruiser';

const ZIEL = 'docs/handbuch/entwickler/docs/grafiken/abhaengigkeiten';
const require = createRequire(import.meta.url);
const einstellungen = require('../../.dependency-cruiser.cjs');

/** server/src/pdf/laden.ts → server/src/pdf; server/src/dienst.ts → server/src */
export function ordnerVon(pfad) {
  const m = /^(server\/src|web\/src|shared\/src)\/(?:([^/]+)\/)?/.exec(pfad);
  if (!m) return null;
  return m[2] ? `${m[1]}/${m[2]}` : m[1];
}

const knotenId = (o) => o.replace(/[^a-z0-9]/gi, '_');
const beschriftung = (o) => (/^(server|web|shared)\/src$/.test(o) ? `${o} (Wurzel)` : o);

export function mermaid(module) {
  const kanten = new Map();
  const ordner = new Set();
  for (const m of module) {
    const von = ordnerVon(m.source);
    if (!von) continue;
    ordner.add(von);
    for (const d of m.dependencies) {
      const nach = ordnerVon(d.resolved);
      if (!nach || nach === von) continue;
      const k = `${von}\t${nach}`;
      kanten.set(k, (kanten.get(k) ?? 0) + 1);
    }
  }
  const zeilen = ['%% Erzeugt mit `npm run abhaengigkeitsbild` (#899) – nicht von Hand ändern.', 'flowchart LR'];
  for (const teil of ['server', 'web', 'shared']) {
    const drin = [...ordner].filter((o) => o.startsWith(`${teil}/`)).sort();
    if (!drin.length) continue;
    zeilen.push(`  subgraph ${teil}`);
    for (const o of drin) zeilen.push(`    ${knotenId(o)}["${beschriftung(o)}"]`);
    zeilen.push('  end');
  }
  for (const [k, n] of [...kanten].sort(([a], [b]) => a.localeCompare(b))) {
    const [von, nach] = k.split('\t');
    zeilen.push(`  ${knotenId(von)} -->|${n}| ${knotenId(nach)}`);
  }
  return `${zeilen.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { output } = await cruise(['server/src', 'web/src', 'shared/src'], { ...einstellungen.options, ruleSet: { forbidden: [] } });
  writeFileSync(`${ZIEL}.mmd`, mermaid(output.modules));
  console.log(`${ZIEL}.mmd geschrieben`);
  try {
    execFileSync('mmdc', ['-i', `${ZIEL}.mmd`, '-o', `${ZIEL}.png`, '-s', '2', '-b', 'white'], { stdio: 'inherit' });
    console.log(`${ZIEL}.png geschrieben`);
  } catch {
    console.log('mmdc (Mermaid-CLI) nicht gefunden oder fehlgeschlagen – nur die .mmd-Datei. Bild: npx -p @mermaid-js/mermaid-cli mmdc -i … -s 2');
  }
}
