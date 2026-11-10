/**
 * Lader für Tests, die Module der Oberfläche zeichnen (#966): Vite liefert `import x from './datei.css?raw'` als Text,
 * Node kennt `.css` nicht. Dieser Lader macht daraus ein Modul mit dem Dateiinhalt als `default`.
 * Einbinden: `register(new URL('./css-roh-lader.mjs', import.meta.url))` aus `node:module`, vor dem ersten Import.
 */
import { readFile } from 'node:fs/promises';

export async function resolve(spezifizierer, kontext, weiter) {
  if (/\.css\?raw$/.test(spezifizierer)) {
    const url = new URL(spezifizierer, kontext.parentURL);
    return { url: url.href, shortCircuit: true };
  }
  return weiter(spezifizierer, kontext);
}

export async function load(url, kontext, weiter) {
  if (/\.css\?raw$/.test(url)) {
    const pfad = new URL(url); pfad.search = '';
    const text = await readFile(pfad, 'utf8');
    return { format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  }
  return weiter(url, kontext);
}
