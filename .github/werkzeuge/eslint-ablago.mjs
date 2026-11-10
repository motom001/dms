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
 * - `ablago/bausteine`: rohe Bedienelemente in der Oberfläche (#968, „Neues streng“). `<button>` ist ein Fehler –
 *   dafür gibt es `Knopf`; `<input>`, `<select>` und `<textarea>` sind es, wenn sie nicht in einem Feldrahmen stehen
 *   (`Feld`, `HakenFeld`, `FeldGruppe`). Ausgenommen sind unsichtbare Eingaben (`type="hidden"`, `type="file"` – der
 *   Dateiwähler öffnet sich über einen Knopf) und alles unter `web/src/bausteine/` (dort entstehen die Bausteine).
 *   Der Bestand beim Einführen steht in `eslint-suppressions.json`; begründete Ausnahmen im Code wie sonst
 *   (`// eslint-disable-next-line ablago/bausteine -- Suchfeld ohne sichtbare Beschriftung`).
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

const ROH = new Set(['button', 'input', 'select', 'textarea']);
const RAHMEN = new Set(['Feld', 'HakenFeld', 'FeldGruppe']);
const UNSICHTBAR = new Set(['hidden', 'file']);

/** Wert eines festen JSX-Attributs (`type="file"`), sonst undefined. */
function attributWert(oeffnend, name) {
  const a = oeffnend.attributes.find((x) => x.type === 'JSXAttribute' && x.name.name === name);
  return a?.value?.type === 'Literal' ? a.value.value : undefined;
}

/** Steht das Element (irgendwo) in einem Feldrahmen? Auch über eine Funktion als Kind: {(v) => <input {...v} />}. */
function imRahmen(knoten) {
  for (let p = knoten.parent; p; p = p.parent) {
    if (p.type === 'JSXElement' && p.openingElement.name.type === 'JSXIdentifier' && RAHMEN.has(p.openingElement.name.name)) return true;
  }
  return false;
}

const bausteine = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Bedienelemente nur über die Bausteine (Knopf, Feld, HakenFeld, FeldGruppe), #968' },
    schema: [],
    messages: {
      knopf: '<button> direkt: Bitte den Baustein Knopf nehmen (web/src/bausteine, Entwicklerhandbuch „Gestaltung und Bausteine“).',
      feld: '<{{name}}> ohne Feldrahmen: Bitte in Feld, HakenFeld oder FeldGruppe setzen (Entwicklerhandbuch „Gestaltung und Bausteine“).',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(knoten) {
        const name = knoten.name.type === 'JSXIdentifier' ? knoten.name.name : null;
        if (!name || !ROH.has(name)) return;
        if (name === 'button') { context.report({ node: knoten, messageId: 'knopf' }); return; }
        if (name === 'input' && UNSICHTBAR.has(attributWert(knoten, 'type'))) return;
        if (!imRahmen(knoten.parent)) context.report({ node: knoten, messageId: 'feld', data: { name } });
      },
    };
  },
};

export default {
  meta: { name: 'ablago' },
  rules: {
    'komplexitaet-hinweis': complexity,
    'handler-laenge': handlerLaenge,
    bausteine,
  },
};
