#!/usr/bin/env node
/**
 * knip in der CI (#1286): ungenutzte Dateien, Exporte und Abhängigkeiten melden.
 *
 * `node .github/werkzeuge/knip-pruefen.mjs` startet knip (Einstellung knip.jsonc) und vergleicht mit dem Bestand
 * in knip-bestand.json:
 * - Ungenutzte Dateien, Abhängigkeiten, nicht aufgeführte oder nicht auflösbare Pakete und Programme gibt es keine
 *   im Bestand – jeder Fund macht den Lauf rot. Bewusste Ausnahmen stehen mit Begründung in knip.jsonc.
 * - Ungenutzte Exporte, Typen, Enum- und Namensraum-Mitglieder und doppelte Exporte von heute stehen im Bestand
 *   (je Datei die Namen). Neue Funde machen den Lauf rot, Einträge ohne Fund werden nur gemeldet.
 * Der Bestand darf nie wachsen (ausnahmen-zaehlen.mjs, „Umtragen ja, Hinzufügen nein“).
 *
 * `--umtragen` schreibt den Bestand neu (z. B. nach einem Umzug oder wenn Einträge weggefallen sind); es gilt dasselbe
 * wie bei eslint-suppressions.json: Der Pull Request zeigt, was dazukommt, und die Summe darf nicht steigen.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const BESTAND_DATEI = 'knip-bestand.json';

/** Arten, die im Bestand stehen dürfen (Name je Datei). */
export const BESTANDSARTEN = ['exports', 'types', 'enumMembers', 'namespaceMembers', 'duplicates'];
/** Arten ohne Bestand: Jeder Fund ist ein Fehler (oder eine begründete Ausnahme in knip.jsonc). */
export const STRENGE_ARTEN = ['files', 'dependencies', 'devDependencies', 'optionalPeerDependencies', 'unlisted', 'binaries', 'unresolved', 'catalog'];

const TEXTE = {
  files: 'Datei wird nirgends eingebunden',
  dependencies: 'Abhängigkeit wird nicht genutzt',
  devDependencies: 'Werkzeug (devDependency) wird nicht genutzt',
  optionalPeerDependencies: 'optionale Peer-Abhängigkeit wird nicht genutzt',
  unlisted: 'Paket wird genutzt, steht aber nicht in der package.json dieses Bereichs',
  binaries: 'Programm wird aufgerufen, steht aber in keiner package.json',
  unresolved: 'Import lässt sich nicht auflösen',
  catalog: 'Katalog-Eintrag wird nicht genutzt',
  exports: 'Export wird nirgends genutzt',
  types: 'exportierter Typ wird nirgends genutzt',
  enumMembers: 'Enum-Mitglied wird nirgends genutzt',
  namespaceMembers: 'Namensraum-Mitglied wird nirgends genutzt',
  duplicates: 'derselbe Wert unter mehreren Namen exportiert',
};

/** Name eines Fundes: bei doppelten Exporten alle Namen, sonst der eine. */
function nameVon(eintrag) {
  return Array.isArray(eintrag) ? eintrag.map((e) => e.name).join(' = ') : eintrag.name;
}

/**
 * Funde aus der JSON-Ausgabe von knip als flache Liste.
 * @param issues `issues` aus `knip --reporter json`
 * @returns [{ art, datei, name, zeile }]
 */
export function funde(issues) {
  const liste = [];
  for (const eintrag of issues) {
    for (const art of [...STRENGE_ARTEN, ...BESTANDSARTEN]) {
      const werte = eintrag[art];
      if (!Array.isArray(werte)) continue;
      for (const w of werte) {
        const erster = Array.isArray(w) ? w[0] : w;
        liste.push({ art, datei: eintrag.file, name: nameVon(w), zeile: erster?.line });
      }
    }
  }
  return liste;
}

/** Bestand aus den Funden: { datei: { art: [namen] } }, sortiert. Strenge Arten kommen nie hinein. */
export function bestandAus(liste) {
  const b = {};
  for (const f of liste) {
    if (!BESTANDSARTEN.includes(f.art)) continue;
    ((b[f.datei] ??= {})[f.art] ??= []).push(f.name);
  }
  const sortiert = {};
  for (const datei of Object.keys(b).sort()) {
    sortiert[datei] = {};
    for (const art of Object.keys(b[datei]).sort()) sortiert[datei][art] = [...new Set(b[datei][art])].sort();
  }
  return sortiert;
}

/** Zahl der Einträge im Bestand (für ausnahmen-zaehlen.mjs). */
export function zaehleKnip(bestand) {
  return Object.values(bestand).reduce((s, arten) => s + Object.values(arten).reduce((t, n) => t + n.length, 0), 0);
}

/**
 * Vergleich mit dem Bestand.
 * @returns { neu: Funde, die weder streng erlaubt noch im Bestand sind; weg: Bestandseinträge ohne Fund }
 */
export function vergleiche(liste, bestand) {
  const neu = liste.filter((f) => !BESTANDSARTEN.includes(f.art) || !bestand[f.datei]?.[f.art]?.includes(f.name));
  const da = new Set(liste.map((f) => `${f.datei}\0${f.art}\0${f.name}`));
  const weg = [];
  for (const [datei, arten] of Object.entries(bestand)) {
    for (const [art, namen] of Object.entries(arten)) for (const name of namen) if (!da.has(`${datei}\0${art}\0${name}`)) weg.push({ art, datei, name });
  }
  return { neu, weg };
}

function knipStarten() {
  let ausgabe;
  try {
    ausgabe = execFileSync('node_modules/.bin/knip', ['--no-progress', '--reporter', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // knip endet mit 1, sobald es etwas findet; die JSON-Ausgabe steht trotzdem in stdout.
    if (!e.stdout) throw e;
    ausgabe = e.stdout;
  }
  return JSON.parse(ausgabe).issues;
}

function main() {
  const umtragen = process.argv.includes('--umtragen');
  const liste = funde(knipStarten());
  const imCi = Boolean(process.env.GITHUB_ACTIONS);
  if (umtragen) {
    const streng = liste.filter((f) => STRENGE_ARTEN.includes(f.art));
    writeFileSync(BESTAND_DATEI, `${JSON.stringify(bestandAus(liste), null, 2)}\n`);
    console.log(`${BESTAND_DATEI} neu geschrieben (${zaehleKnip(bestandAus(liste))} Einträge).`);
    if (streng.length) {
      for (const f of streng) console.error(`${f.datei}: ${TEXTE[f.art]} – ${f.name}`);
      console.error(`${streng.length} Funde ohne Bestand: beheben oder mit Begründung in knip.jsonc ausnehmen.`);
      process.exitCode = 1;
    }
    return;
  }
  const bestand = existsSync(BESTAND_DATEI) ? JSON.parse(readFileSync(BESTAND_DATEI, 'utf8')) : {};
  const { neu, weg } = vergleiche(liste, bestand);
  for (const f of neu) {
    const text = `${TEXTE[f.art]}: ${f.name}`;
    if (imCi) console.log(`::error file=${f.datei}${f.zeile ? `,line=${f.zeile}` : ''},title=knip::${text}`);
    else console.error(`${f.datei}${f.zeile ? `:${f.zeile}` : ''}  ${text}`);
  }
  if (weg.length) {
    const hinweis = `${weg.length} Einträge in ${BESTAND_DATEI} haben keinen Fund mehr – mit \`npm run lint:tot -- --umtragen\` abräumen.`;
    console.log(imCi ? `::notice title=knip::${hinweis}` : hinweis);
  }
  if (neu.length) {
    console.error(`knip: ${neu.length} neue Funde. Toten Code entfernen; ist er gewollt, Begründung in knip.jsonc (Entwicklerhandbuch „Stil und Abhängigkeiten“).`);
    process.exitCode = 1;
  } else {
    console.log(`knip: keine neuen Funde (Bestand ${zaehleKnip(bestand)} Einträge).`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
