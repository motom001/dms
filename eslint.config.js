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

const CODE = ['server/src/**/*.ts', 'server/test/**/*.ts', 'web/src/**/*.{ts,tsx}', 'shared/src/**/*.ts'];
const WERKZEUGE = ['.github/werkzeuge/*.mjs', 'server/test/*.mjs', 'web/rauchtest/*.mjs', 'eslint.config.js', '.dependency-cruiser.cjs'];
// Leerzeilen und Kommentare zählen bei den Längen nicht mit: Erklärungen im Code sollen nichts kosten.
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
  { files: ['web/rauchtest/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },

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
      'max-lines-per-function': ['error', { max: 60, ...ZEILEN }],
      'max-lines': ['error', { max: 400, ...ZEILEN }],
      'max-depth': ['error', 4],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Ausnahmen im Code nur mit Begründung („-- Grund“), und nur, wo sie auch etwas abschalten.
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: ['eslint-enable'] }],
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
    },
  },
  { files: ['server/src/**/*.ts', 'server/test/**/*.ts', 'shared/src/**/*.ts'], languageOptions: { globals: { ...globals.node } } },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Bausteinregeln (#968, „Neues streng“): rohe Knöpfe und Eingaben nur in den Bausteinen selbst. Der Bestand beim
  // Einführen steht in eslint-suppressions.json (Regel ablago/bausteine).
  { files: ['web/src/**/*.tsx'], ignores: ['web/src/bausteine/**'], rules: { 'ablago/bausteine': 'error' } },
  // Komponenten sind länger als Funktionen im Server: 150 Zeilen je Funktion.
  { files: ['web/src/**/*.tsx'], rules: { 'max-lines-per-function': ['error', { max: 150, ...ZEILEN }] } },
  // Routendateien (#960): 60 Zeilen je Handler, die äußere Registrierfunktion ist ausgenommen.
  {
    files: ['server/src/**/*.routen.ts'],
    rules: { 'max-lines-per-function': 'off', 'ablago/handler-laenge': ['error', { max: 60, ...ZEILEN }] },
  },
  // Reine Daten (Lizenztexte, #374): die Länge der Datei ist kein Maß für ihre Verständlichkeit.
  { files: ['server/src/lizenztexte.ts'], rules: { 'max-lines': 'off' } },
  // Tests: keine Größenregeln (lange Testdateien und Fälle sind gewollt), sonst dieselben Regeln. test(), describe()
  // und it() aus node:test geben ein Promise zurück, auf das der Testläufer selbst wartet – kein Fehler.
  {
    files: ['server/test/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-floating-promises': ['error', {
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'suite', 'before', 'after', 'beforeEach', 'afterEach'] }],
      }],
    },
  },
]);
