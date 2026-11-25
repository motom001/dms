/**
 * ESLint für Server, Oberfläche und gemeinsamen Code (#899). Aufruf: `npm run lint`.
 *
 * Bestand: Alles, was beim Einführen schon gegen eine Regel verstieß, steht in `eslint-suppressions.json` und
 * meldet sich nicht. Neuer Code ist voll streng. Die Zahl der Einträge darf nie steigen – umtragen ja, hinzufügen
 * nein (.github/werkzeuge/ausnahmen-zaehlen.mjs). Einzelne Ausnahmen im Code brauchen eine Begründung
 * (`// eslint-disable-next-line regel -- Grund`). Mehr im Entwicklerhandbuch unter „Stil und Abhängigkeiten“.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import kommentare from '@eslint-community/eslint-plugin-eslint-comments';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import ablago from './.github/werkzeuge/eslint-ablago.mjs';

// Tests (#1282): server/test für den Server, web/test für die Oberfläche, shared/test für Sprachdateien und Gemeinsames.
const TESTS = ['server/test/**/*.ts', 'web/test/**/*.ts', 'shared/test/**/*.ts'];
const CODE = ['server/src/**/*.ts', 'web/src/**/*.{ts,tsx}', 'shared/src/**/*.ts', ...TESTS];
const WERKZEUGE = [
  '.github/werkzeuge/*.mjs',
  'server/test/*.mjs',
  // Prüfstand Erkennung (#1679): Node-Skripte ohne Typen, auch außerhalb von Ablago lauffähig.
  'server/werkzeuge/**/*.mjs',
  'web/test/*.mjs',
  'web/rauchtest/**/*.mjs',
  'eslint.config.js',
  '.dependency-cruiser.cjs',
];
// Leerzeilen und Kommentare zählen bei den Längen nicht mit: Erklärungen im Code sollen nichts kosten.
// Längen ×1,75 wegen Formatierer (#1280): gleiche Strenge in formatierten Zeilen (vorher 400 je Datei, 60 je Funktion,
// 150 je Komponente, 60 je Handler; Prettier bricht dichten Code auf rund das 1,8-Fache der Zeilen um).
const ZEILEN = { skipBlankLines: true, skipComments: true };

export default defineConfig([
  { ignores: ['**/node_modules/', '**/dist/', 'docs/', 'site/'] },
  { linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' } },

  // Werkzeug-Skripte (.mjs/.js/.cjs): Grundregeln, ohne Typinformation.
  {
    files: WERKZEUGE,
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.node } },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
  { files: ['web/rauchtest/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  // Rauchtests (#1234): je Bereich eine Datei unter web/rauchtest/bereiche/ – höchstens 700 Zeilen wie Code.
  { files: ['web/rauchtest/**/*.mjs'], rules: { 'max-lines': ['error', { max: 700, ...ZEILEN }] } },

  // Server, Oberfläche, gemeinsamer Code: mit Typinformation (je Datei das passende tsconfig.json).
  {
    files: CODE,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks, '@eslint-community/eslint-comments': kommentare, ablago },
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Startwerte (Ziel in Klammern): max-params 5 (4), complexity 20 als Fehler und 15 als Warnung (10).
      'max-params': ['error', 5],
      complexity: ['error', 20],
      'ablago/komplexitaet-hinweis': ['warn', 15],
      'max-lines-per-function': ['error', { max: 105, ...ZEILEN }],
      'max-lines': ['error', { max: 700, ...ZEILEN }],
      'max-depth': ['error', 4],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Ungenutztes fällt auf (#1273). Absichtlich ungenutzt beginnt mit „_“: ein Parameter, der zur Signatur gehört,
      // oder ein Feld, das beim Auspacken mit „...rest“ wegfallen soll; „_“ allein für eine Schleife, die nur leert.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_$', ignoreRestSiblings: true }],
      // Ausnahmen im Code nur mit Begründung („-- Grund“), und nur, wo sie auch etwas abschalten.
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: ['eslint-enable'] }],
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
    },
  },
  { files: ['server/src/**/*.ts', 'shared/src/**/*.ts', ...TESTS], languageOptions: { globals: { ...globals.node } } },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Erzeugte Daten (#1519): die Formen der 259 Ansichtssymbole aus lucide-static (.github/werkzeuge/ansichtsymbole-formen.mjs)
  // – eine Tabelle ohne Logik, die nie von Hand geändert wird; aufgeteilt wäre sie nur schwerer neu zu erzeugen.
  { files: ['web/src/ansichtsymbol-formen.ts'], rules: { 'max-lines': 'off' } },
  // Bausteinregeln (#968, „Neues streng“): rohe Knöpfe und Eingaben nur in den Bausteinen selbst. Der Bestand beim
  // Einführen steht in eslint-suppressions.json (Regel ablago/bausteine).
  { files: ['web/src/**/*.tsx'], ignores: ['web/src/bausteine/**'], rules: { 'ablago/bausteine': 'error' } },
  // Keine Farbklassen über className am Knopf (#1210): Die Farbe kommt aus der Art. Bestand beim Einführen in
  // eslint-suppressions.json (Regel ablago/knopf-farben), abgebaut in #1211–#1215.
  { files: ['web/src/**/*.tsx'], rules: { 'ablago/knopf-farben': 'error' } },
  // Gemerkte Formate (#1335): auf dem Server und im gemeinsamen Code kein toLocaleString(…, {…}) und kein
  // new Intl.DateTimeFormat/NumberFormat – dafür datumsformat, zahlformat, zeitText aus shared/src/region.ts (die
  // Datei selbst baut sie). Bestand beim Einführen in eslint-suppressions.json (Regel ablago/gemerkte-formate).
  {
    files: ['server/src/**/*.ts', 'shared/src/**/*.ts'],
    ignores: ['shared/src/region.ts'],
    rules: { 'ablago/gemerkte-formate': 'error' },
  },
  // Komponenten sind länger als Funktionen im Server: 260 Zeilen je Funktion.
  { files: ['web/src/**/*.tsx'], rules: { 'max-lines-per-function': ['error', { max: 260, ...ZEILEN }] } },
  // Routendateien (#960): 105 Zeilen je Handler, die äußere Registrierfunktion ist ausgenommen.
  {
    files: ['server/src/**/*.routen.ts'],
    rules: { 'max-lines-per-function': 'off', 'ablago/handler-laenge': ['error', { max: 105, ...ZEILEN }] },
  },
  // Tests: keine Größenregeln (lange Testdateien und Fälle sind gewollt), sonst dieselben Regeln. test(), describe()
  // und it() aus node:test geben ein Promise zurück, auf das der Testläufer selbst wartet – kein Fehler.
  {
    files: TESTS,
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            {
              from: 'package',
              package: 'node:test',
              name: ['test', 'it', 'describe', 'suite', 'before', 'after', 'beforeEach', 'afterEach'],
            },
          ],
        },
      ],
    },
  },
  // Formatierung macht Prettier (#1280, `npm run format`): Regeln, die mit ihm kollidieren, sind aus – wie in
  // eslint-config-prettier, ohne zusätzliche Abhängigkeit. Aus den eingeschalteten Regelsätzen betrifft das nur
  // no-unexpected-multiline (Prettier bricht lange Ketten so um, dass sie anschlägt, ohne dass sich etwas ändert).
  { rules: { 'no-unexpected-multiline': 'off' } },
]);
