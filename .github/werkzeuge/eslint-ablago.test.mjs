/**
 * Eigene ESLint-Regel `ablago/knopf-farben` (#1210): keine Farbklassen über `className` am Baustein Knopf.
 * Aufruf: `node --test .github/werkzeuge/eslint-ablago.test.mjs` (CI-Job „pruefen“, Schritt ESLint).
 */
import { test } from 'node:test';
import { RuleTester } from 'eslint';
import ablago from './eslint-ablago.mjs';

const pruefer = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } } });
const fehler = (klasse) => ({ messageId: 'farbe', data: { klasse } });

test('ablago/knopf-farben: Farbe nur über die Art', () => {
  pruefer.run('knopf-farben', ablago.rules['knopf-farben'], {
    valid: [
      '<Knopf art="haupt">Speichern</Knopf>',
      '<Knopf className="breit">Los</Knopf>',
      '<Knopf className={k.vorschauhover}>Los</Knopf>',
      // Rohe Knöpfe meldet ablago/bausteine, nicht diese Regel; fremde Elemente ebenso nicht.
      '<button className="knopf gefahr">Löschen</button>',
      '<a className="primaer">x</a>',
      'knopfAussehen({ art: "anlegen", className: "breit" })',
      // Teile eines Worts sind keine Farbklasse.
      '<Knopf className="gefahrlos primaer-text">x</Knopf>',
    ],
    invalid: [
      { code: '<Knopf className="gefahr-rand">Entfernen</Knopf>', errors: [fehler('gefahr-rand')] },
      { code: '<Knopf art="link" className="gefahr">Löschen</Knopf>', errors: [fehler('gefahr')] },
      { code: '<KnopfLink to="/x" className="klein gruen">+ Neu</KnopfLink>', errors: [fehler('gruen')] },
      { code: '<Knopf className={weg ? undefined : "gefahr"}>x</Knopf>', errors: [fehler('gefahr')] },
      { code: '<Knopf className={`breit ${a ? "primaer" : ""}`}>x</Knopf>', errors: [fehler('primaer')] },
      { code: 'knopfAussehen({ art: "neben", className: "gefahr" })', errors: [fehler('gefahr')] },
    ],
  });
});
