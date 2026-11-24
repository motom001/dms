#!/usr/bin/env node
/**
 * Formen der Ansichtssymbole erzeugen (#1519): liest die Namen aus shared/src/ansichtsymbole.ts und die SVG-Dateien einer
 * festen Version von lucide-static und schreibt web/src/ansichtsymbol-formen.ts neu – nie von Hand abtippen.
 *
 *   npm pack lucide-static@1.76.0 && tar -xzf lucide-static-1.76.0.tgz
 *   node .github/werkzeuge/ansichtsymbole-formen.mjs package/icons
 *   npx prettier --write web/src/ansichtsymbol-formen.ts
 *
 * Jeder Name braucht eine Datei `<name>.svg` (auch Aliasnamen wie `file-signature` haben eine). Danach prüft
 * web/test/ansichtsymbol.test.ts, dass jeder Name eine Form hat und umgekehrt.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSION = '1.76.0';
const TEILE = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);

const ordner = process.argv[2];
if (!ordner) {
  console.error('Aufruf: node .github/werkzeuge/ansichtsymbole-formen.mjs <lucide-static>/icons');
  process.exit(2);
}
const wurzel = new URL('../../', import.meta.url).pathname;
const quelle = readFileSync(join(wurzel, 'shared/src/ansichtsymbole.ts'), 'utf8');
const namen = [...quelle.matchAll(/\{ name: '([a-z0-9-]+)', titel:/g)].map((m) => m[1]);

const formen = namen.map((name) => {
  const svg = readFileSync(join(ordner, `${name}.svg`), 'utf8');
  if (!svg.includes(`lucide-static v${VERSION}`)) throw new Error(`${name}.svg ist nicht aus lucide-static ${VERSION}`);
  const innen = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  const teile = [...innen.matchAll(/<([a-z]+)\s([^>]*?)\/>/g)].map(([, tag, attr]) => {
    if (!TEILE.has(tag)) throw new Error(`${name}: unbekannter Teil <${tag}>`);
    const werte = Object.fromEntries([...attr.matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    return `[${JSON.stringify(tag)}, ${JSON.stringify(werte)}]`;
  });
  if (!teile.length) throw new Error(`${name}: keine Form`);
  return `  ${JSON.stringify(name)}: [${teile.join(', ')}],`;
});

writeFileSync(
  join(wurzel, 'web/src/ansichtsymbol-formen.ts'),
  `/**
 * Formen der Ansichtssymbole (#428, #1519), erzeugt aus lucide-static ${VERSION} (ISC-Lizenz, Copyright Lucide
 * Contributors; Hinweis in Symbol.tsx und NOTICE) – nicht von Hand ändern. Neues Symbol: in shared/src/ansichtsymbole.ts
 * eintragen und die Formen mit .github/werkzeuge/ansichtsymbole-formen.mjs aus derselben Version neu erzeugen;
 * web/test/ansichtsymbol.test.ts prüft, dass jeder Name eine Form hat.
 */
export type FormTeil = ['path' | 'circle' | 'rect' | 'line' | 'polyline' | 'polygon' | 'ellipse', Record<string, string>];

export const ANSICHT_FORMEN: Record<string, FormTeil[]> = {
${formen.join('\n')}
};
`,
);
console.log(`${formen.length} Formen aus lucide-static ${VERSION} geschrieben.`);
