#!/usr/bin/env node
/**
 * Keine festen Farben in der Oberfläche (#966): Farben kommen aus den Tokens in web/src/tokens.css.
 *
 * `node .github/werkzeuge/farben-pruefen.mjs` durchsucht
 * - web/src/**\/*.css außer tokens.css nach Hex-Werten, rgb()/rgba()/hsl()/hsla()/hwb()/lab()/lch()/oklab()/oklch()
 *   und benannten Farben (white, black, red …) in Deklarationen,
 * - web/src/**\/*.ts(x) nach Farbwerten in Zeichenketten ('#abc', 'rgb(…)').
 * `transparent`, `currentColor`, `inherit` & Co. sind keine festen Farben.
 *
 * Ausnahmen: in der Zeile ein Kommentar `farbe-erlaubt: Grund` (CSS `/* farbe-erlaubt: … *\/`, TS `// farbe-erlaubt: …`)
 * oder die ganze Datei in AUSNAHMEN unten – immer mit Grund.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Ganze Dateien, deren Farben bewusst fest sind. */
export const AUSNAHMEN = {
  'web/src/tokens.css': 'Hier stehen die Tokens selbst.',
  'web/src/design.ts': 'Designs (#21): Grundpaletten und Mischrechnung für eigene Primär-/Sekundärfarben; Werte gleich tokens.css.',
  'web/src/ablage/StempelVorschau.tsx': 'Beispielbelege der Stempel-Vorschau zeigen Papier, nicht Oberfläche – bleiben hell wie ein echter Beleg.',
};

// Benannte CSS-Farben (Level 4), ohne transparent/currentcolor.
const NAMEN = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen';
const FUNKTIONEN = 'rgba?|hsla?|hwb|lab|lch|oklab|oklch|color';
const HEX = /#[0-9a-fA-F]{3,8}(?![\w-])/g;
const FUNK = new RegExp(`(?<![\\w-])(?:${FUNKTIONEN})\\([^()]*\\)`, 'gi');
const NAME = new RegExp(`(?<![\\w-])(?:${NAMEN.split(' ').join('|')})(?![\\w-])`, 'gi');
const ERLAUBT = /farbe-erlaubt:\s*[^\s*]/;

/** Kommentare durch Leerzeichen ersetzen (Zeilen bleiben erhalten). */
function ohneKommentare(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (k) => k.replace(/[^\n]/g, ' '));
}

/** Feste Farben in CSS: nur in Werten von Deklarationen (nach „:“ bis „;“ oder „}“), url(…) und Zeichenketten ausgenommen. */
export function farbenInCss(css) {
  const roh = css.split('\n');
  const ohne = ohneKommentare(css);
  const funde = [];
  // Deklaration: Eigenschaft: Wert – Selektoren mit Pseudoklassen enden auf „{“ und werden übersprungen.
  const DEKL = /(?:^|[;{])\s*(--?[\w-]+|[a-z-]+)\s*:([^;{}]*)(?=[;}])/g;
  for (const m of ohne.matchAll(DEKL)) {
    // url(…) und Zeichenketten („grid-template-areas: "red"“, content) enthalten keine Farbwerte.
    const wert = m[2].replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, (u) => ' '.repeat(u.length));
    const start = m.index + m[0].length - m[2].length;
    for (const re of [HEX, FUNK, NAME]) {
      for (const f of wert.matchAll(re)) {
        const zeile = ohne.slice(0, start + f.index).split('\n').length;
        if (ERLAUBT.test(roh[zeile - 1])) continue;
        funde.push({ zeile, wert: f[0], eigenschaft: m[1] });
      }
    }
  }
  return funde.sort((a, b) => a.zeile - b.zeile);
}

/** Feste Farben in TypeScript: Farbwerte als ganze Zeichenkette ('#fff', "rgb(0 0 0)"). */
export function farbenInTs(ts) {
  const funde = [];
  const STR = new RegExp(`(['"\`])(#[0-9a-fA-F]{3,8}|(?:${FUNKTIONEN})\\([^()'"\`]*\\))\\1`, 'g');
  ts.split('\n').forEach((z, i) => {
    if (ERLAUBT.test(z)) return;
    for (const m of z.matchAll(STR)) funde.push({ zeile: i + 1, wert: m[2] });
  });
  return funde;
}

function dateien(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && /\.(css|tsx?)$/.test(d.name))
    .map((d) => join(d.parentPath, d.name));
}

/** Alle Funde unter `wurzel` (Standard: web/src), ohne die Dateien in AUSNAHMEN. */
export function pruefe(wurzel = 'web/src', ausnahmen = AUSNAHMEN) {
  const alle = [];
  for (const d of dateien(wurzel)) {
    const name = relative(process.cwd(), d).split(sep).join('/');
    if (ausnahmen[name]) continue;
    const text = readFileSync(d, 'utf8');
    const funde = d.endsWith('.css') ? farbenInCss(text) : farbenInTs(text);
    for (const f of funde) alle.push({ datei: name, ...f });
  }
  return alle;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const funde = pruefe(process.argv[2]);
  for (const f of funde) {
    console.log(`::error file=${f.datei},line=${f.zeile},title=Feste Farbe::${f.wert} – bitte ein Token aus web/src/tokens.css nehmen (oder begründen: farbe-erlaubt: Grund)`);
  }
  if (process.argv.includes('--liste')) for (const f of funde) console.error(`${f.datei}:${f.zeile}\t${f.eigenschaft ?? ''}\t${f.wert}`);
  console.log(funde.length ? `${funde.length} feste Farbe(n) gefunden.` : 'Keine festen Farben außerhalb von tokens.css.');
  process.exitCode = funde.length ? 1 : 0;
}
