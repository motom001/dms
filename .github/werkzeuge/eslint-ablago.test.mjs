/**
 * Eigene ESLint-Regeln `ablago/knopf-farben` (#1210): keine Farbklassen über `className` am Baustein Knopf; `ablago/bausteine`
 * (#968, #1215): unsichtbare Eingaben ohne Feldrahmen; Links und andere Elemente mit Knopf-Klasse (#1269).
 * Aufruf: `node --test .github/werkzeuge/eslint-ablago.test.mjs` (CI-Job „pruefen“, Schritt ESLint).
 */
import { test } from 'node:test';
import { RuleTester } from 'eslint';
import ablago from './eslint-ablago.mjs';

const pruefer = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
});
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
      { code: '<Knopf art="eigen" className="gefahr">Löschen</Knopf>', errors: [fehler('gefahr')] },
      { code: '<KnopfLink to="/x" className="klein gruen">+ Neu</KnopfLink>', errors: [fehler('gruen')] },
      { code: '<Knopf className={weg ? undefined : "gefahr"}>x</Knopf>', errors: [fehler('gefahr')] },
      { code: '<Knopf className={`breit ${a ? "primaer" : ""}`}>x</Knopf>', errors: [fehler('primaer')] },
      { code: 'knopfAussehen({ art: "neben", className: "gefahr" })', errors: [fehler('gefahr')] },
    ],
  });
});

test('ablago/bausteine: unsichtbare Eingaben brauchen keinen Feldrahmen (#1215)', () => {
  pruefer.run('bausteine', ablago.rules.bausteine, {
    valid: [
      '<input type="hidden" value="x" />',
      '<input type="file" hidden />',
      // Benutzername für den Passwortmanager neben einem Passwortfeld.
      '<input type="email" value={e} autoComplete="username" readOnly hidden />',
      '<input type="email" hidden={true} />',
      '<Feld beschriftung="Name"><input /></Feld>',
    ],
    invalid: [
      { code: '<input type="email" />', errors: [{ messageId: 'feld', data: { name: 'input' } }] },
      { code: '<input hidden={versteckt} />', errors: [{ messageId: 'feld', data: { name: 'input' } }] },
      { code: '<button>x</button>', errors: [{ messageId: 'knopf' }] },
    ],
  });
});

test('ablago/bausteine: Links und andere Elemente mit Knopf-Klasse (#1269)', () => {
  const klasse = (name, k) => ({ messageId: 'klasse', data: { name, klasse: k } });
  pruefer.run('bausteine', ablago.rules.bausteine, {
    valid: [
      '<KnopfLink href="/api/x" download>PDF</KnopfLink>',
      '<a className="verweis" href="/x">x</a>',
      // Eigene Klassen, die „knopf“ nur enthalten, sind keine Knopf-Klasse.
      '<span className="ka-mt-knopf uebersetzen-knopf">x</span>',
      '<div className="knoepfe">x</div>',
    ],
    invalid: [
      { code: '<a className="knopf">x</a>', errors: [klasse('a', 'knopf')] },
      { code: '<a className="knopf klein" href="/api/x" download>PDF</a>', errors: [klasse('a', 'knopf')] },
      { code: '<Link to="/x" className="textknopf klein">x</Link>', errors: [klasse('Link', 'textknopf')] },
      { code: '<label className={`knopf${a ? " primaer" : ""}`}>x</label>', errors: [klasse('label', 'knopf')] },
      { code: '<span className="knopf">Datei wählen</span>', errors: [klasse('span', 'knopf')] },
    ],
  });
});

test('ablago/gemerkte-formate: Formate gemerkt statt je Aufruf neu (#1335)', () => {
  pruefer.run('gemerkte-formate', ablago.rules['gemerkte-formate'], {
    valid: [
      // Ohne Optionen merkt sich V8 das Format selbst.
      'n.toLocaleString(gebietsschema())',
      'd.toLocaleDateString("de-DE")',
      'zahlformat("de-DE", { minimumFractionDigits: 2 }).format(n)',
      'datumsformat("sv-SE").format(d)',
      's.toLocaleUpperCase("de-DE")',
      'new Intl.ListFormat("de", { type: "unit" })',
      'Intl.DateTimeFormat.supportedLocalesOf(["de"])',
    ],
    invalid: [
      {
        code: 'n.toLocaleString("de-DE", { minimumFractionDigits: 2 })',
        errors: [{ messageId: 'toLocale', data: { name: 'toLocaleString' } }],
      },
      { code: 'd.toLocaleDateString(l, o)', errors: [{ messageId: 'toLocale', data: { name: 'toLocaleDateString' } }] },
      { code: 'd["toLocaleTimeString"]("de", {})', errors: [{ messageId: 'toLocale', data: { name: 'toLocaleTimeString' } }] },
      { code: 'new Intl.DateTimeFormat("sv-SE", { timeZone: z })', errors: [{ messageId: 'intl', data: { name: 'DateTimeFormat' } }] },
      { code: 'new Intl.NumberFormat("de", { style: "percent" })', errors: [{ messageId: 'intl', data: { name: 'NumberFormat' } }] },
    ],
  });
});
