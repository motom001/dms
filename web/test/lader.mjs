/**
 * Lader für alle Tests der Oberfläche (web/test, #1282), zentral eingebunden: `npm test` startet die Tests mit
 * `--import ./test/lader.mjs` (web/package.json). Damit lädt jede Testdatei Module der Oberfläche, die
 * `*.css?raw` oder `*.module.css` importieren (css-roh-lader.mjs) – kein `register(...)` mehr je Testdatei.
 *
 * Eine einzelne Testdatei startet man im Ordner `web` deshalb so:
 *   node --import tsx --import ./test/lader.mjs --test test/<datei>.test.ts
 * oder kürzer `npm run test:datei -- test/<datei>.test.ts`.
 */
import { register } from 'node:module';

register('./css-roh-lader.mjs', import.meta.url);
