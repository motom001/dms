/**
 * Eigene ESLint-Regeln für Ablago (#899). Beide verwenden eingebaute Regeln von ESLint wieder, damit Messung und
 * Meldung genau gleich bleiben – sie ändern nur, *was* gemessen wird bzw. mit welcher Stufe.
 *
 * - `ablago/komplexitaet-hinweis`: dieselbe Regel wie `complexity`, aber als zweite Schwelle. Eine Regel hat in
 *   ESLint nur eine Stufe; so gilt `complexity` 20 als Fehler und zusätzlich diese Regel mit 15 als Warnung.
 * - `ablago/handler-laenge`: `max-lines-per-function` für Routendateien (`*.routen.ts`, #960). Gemessen wird jede
 *   Funktion **außer** der äußeren Registrierfunktion – das ist eine Funktion auf oberster Ebene, die exportiert
 *   wird (`export function bereichRouten(app) { app.get(…, async () => {…}) }`). Jeder Handler darin zählt für
 *   sich, ebenso nicht exportierte Hilfsfunktionen der Datei.
 */
import { builtinRules } from 'eslint/use-at-your-own-risk';

const complexity = builtinRules.get('complexity');
const maxLinesPerFunction = builtinRules.get('max-lines-per-function');

/** Ist `knoten` eine exportierte Funktion auf oberster Ebene (die Registrierfunktion einer Routendatei)? */
function istRegistrierfunktion(knoten) {
  let p = knoten.parent;
  // const bereichRouten = (app) => { … } bzw. = function (app) { … }
  if (p?.type === 'VariableDeclarator') p = p.parent?.parent;
  return p?.type === 'ExportNamedDeclaration' || p?.type === 'ExportDefaultDeclaration';
}

const handlerLaenge = {
  meta: { ...maxLinesPerFunction.meta, docs: { description: 'max-lines-per-function je Handler in Routendateien (Registrierfunktion ausgenommen)' } },
  create(context) {
    const lauscher = maxLinesPerFunction.create(context);
    const gefiltert = {};
    for (const [art, f] of Object.entries(lauscher)) {
      gefiltert[art] = (knoten) => (istRegistrierfunktion(knoten) ? undefined : f(knoten));
    }
    return gefiltert;
  },
};

export default {
  meta: { name: 'ablago' },
  rules: {
    'komplexitaet-hinweis': complexity,
    'handler-laenge': handlerLaenge,
  },
};
