#!/usr/bin/env node
/**
 * Bestandslisten dürfen nicht wachsen (#899): „Umtragen ja, Hinzufügen nein“.
 *
 * `node .github/werkzeuge/ausnahmen-zaehlen.mjs [basis]` vergleicht die Zahl der Einträge mit dem Stand der Basis
 * (im Pull Request dessen Basis, sonst `git merge-base origin/main HEAD`):
 * - eslint-suppressions.json: Summe der `count` über alle Dateien und Regeln,
 * - .dependency-cruiser-known-violations.json: Zahl der bekannten Verstöße.
 * Steigt eine der beiden Zahlen, schlägt der Aufruf fehl. Zieht Code in eine andere Datei um, dürfen die Einträge
 * mitwandern – solange die Summe gleich bleibt oder sinkt. Gibt es die Datei in der Basis noch nicht, gilt der
 * jetzige Stand als Ausgangspunkt.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const LISTEN = [
  { datei: 'eslint-suppressions.json', name: 'ESLint-Bestand', zaehle: zaehleEslint },
  { datei: '.dependency-cruiser-known-violations.json', name: 'Bestand dependency-cruiser', zaehle: (j) => j.length },
];

/** Summe der Einträge in eslint-suppressions.json, gesamt und je Regel. */
export function zaehleEslint(j) {
  return Object.values(j).reduce((s, regeln) => s + Object.values(regeln).reduce((t, r) => t + (r.count ?? 0), 0), 0);
}

export function jeRegel(j) {
  const z = {};
  for (const regeln of Object.values(j)) for (const [regel, r] of Object.entries(regeln)) z[regel] = (z[regel] ?? 0) + (r.count ?? 0);
  return z;
}

/** Vergleich zweier Stände; `vorher` null = Datei gab es in der Basis nicht. */
export function vergleiche(vorher, jetzt) {
  if (vorher === null) return { ok: true, text: `neu: ${jetzt} Einträge (Ausgangspunkt)` };
  if (jetzt > vorher) return { ok: false, text: `${vorher} → ${jetzt} (+${jetzt - vorher})` };
  return { ok: true, text: jetzt < vorher ? `${vorher} → ${jetzt} (−${vorher - jetzt}, danke!)` : `${jetzt} (unverändert)` };
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

function ausBasis(basis, datei) {
  try { return JSON.parse(git('show', `${basis}:${datei}`)); } catch { return null; }
}

function main() {
  const basis = process.argv[2] || git('merge-base', 'origin/main', 'HEAD').trim();
  let fehler = false;
  for (const l of LISTEN) {
    const jetzt = existsSync(l.datei) ? JSON.parse(readFileSync(l.datei, 'utf8')) : null;
    if (!jetzt) { console.log(`::error title=${l.name}::${l.datei} fehlt`); fehler = true; continue; }
    const vorherJ = ausBasis(basis, l.datei);
    const v = vergleiche(vorherJ === null ? null : l.zaehle(vorherJ), l.zaehle(jetzt));
    console.log(`${l.name} (${l.datei}): ${v.text}`);
    if (!v.ok) {
      fehler = true;
      let mehr = '';
      if (l.datei === 'eslint-suppressions.json') {
        const a = jeRegel(vorherJ), b = jeRegel(jetzt);
        mehr = ' Mehr bei: ' + Object.keys(b).filter((r) => b[r] > (a[r] ?? 0)).map((r) => `${r} +${b[r] - (a[r] ?? 0)}`).join(', ') + '.';
      }
      console.log(`::error title=${l.name} gewachsen (#899)::${l.datei}: ${v.text}.${mehr} Neuer Code muss die Regeln einhalten; Einträge umtragen ja, hinzufügen nein (Entwicklerhandbuch → Stil und Abhängigkeiten).`);
    }
  }
  if (fehler) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
