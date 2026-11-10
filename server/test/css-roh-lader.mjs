/**
 * Lader für Tests, die Module der Oberfläche zeichnen (#966): Vite liefert `import x from './datei.css?raw'` als Text,
 * Node kennt `.css` nicht. Dieser Lader macht daraus ein Modul mit dem Dateiinhalt als `default`.
 * Eingebunden für alle Tests über test/lader.mjs (`--import` in server/package.json).
 *
 * CSS Modules (`import s from './x.module.css'`, Bausteine #967): `s.name` ist hier einfach „name“ – Vite macht
 * daraus beim Bauen einen eindeutigen Namen; für Tests genügt der lesbare.
 */
import { readFile } from 'node:fs/promises';

const MODUL = /\.module\.css$/;

export async function resolve(spezifizierer, kontext, weiter) {
  if (/\.css\?raw$/.test(spezifizierer) || MODUL.test(spezifizierer)) {
    const url = new URL(spezifizierer, kontext.parentURL);
    return { url: url.href, shortCircuit: true };
  }
  return weiter(spezifizierer, kontext);
}

export async function load(url, kontext, weiter) {
  if (MODUL.test(url)) {
    return { format: 'module', source: 'export default new Proxy({}, { get: (_, k) => (typeof k === "string" ? k : undefined) });', shortCircuit: true };
  }
  if (/\.css\?raw$/.test(url)) {
    const pfad = new URL(url); pfad.search = '';
    const text = await readFile(pfad, 'utf8');
    return { format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  }
  return weiter(url, kontext);
}
