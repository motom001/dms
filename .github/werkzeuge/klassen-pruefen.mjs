#!/usr/bin/env node
/**
 * Jede Klasse einmal und beim Besitzer, keine toten Klassen (#1270).
 *
 * `node .github/werkzeuge/klassen-pruefen.mjs` liest alle CSS-Dateien unter web/src und meldet
 * - **doppelt:** eine globale Klasse, die in mehr als einer Datei auf oberster Ebene steht. „Auf oberster Ebene“ heißt:
 *   Sie ist die erste Klasse eines Selektors (`.kachel`, `.kachel:hover`, `.kachel .zahl` gehören `.kachel`; in
 *   `.blatt .kachel` gehört die Regel `.blatt`). Regeln in `@media` zählen zur Datei, in der sie stehen – die
 *   Handy-Regeln einer Klasse stehen also in derselben Datei wie die Klasse.
 * - **tot:** eine Klasse, die in keinem Selektor einer Datei vorkommt, ohne dass die Oberfläche sie setzt. Global: das
 *   Wort steht in keiner Zeichenkette unter web/src (TS/TSX) und keinem Muster `vorsilbe-${…}`. Modul (`*.module.css`):
 *   keine Datei, die das Modul einbindet, liest `s.name` bzw. `s['name']`.
 * - **z-index:** jeder Wert außer einer Stufe `var(--ebene-…)` (auch `calc(var(--ebene-…) + n)` für ein Teil über seiner
 *   eigenen Stufe), 0, -1 und `auto` (die Stufen stehen in tokens.css).
 *
 * Ausnahmen: AUSNAHMEN unten, immer mit Grund. `--liste` gibt alle Funde und Zahlen aus, ohne Fehlercode.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';

/** Klassen, die nicht aus der Oberfläche kommen, aber gesetzt werden. */
export const AUSNAHMEN = {
  // Wird von außen gesetzt: Design „Hoher Kontrast“ und Ansichten über <html>.
  'hoher-kontrast': 'Design über data-Attribute und Klasse an <html> (design.ts setzt sie über classList).',
};

/** Erlaubte z-index-Werte außer den Stufen aus tokens.css (`var(--ebene-…)`). */
const Z_ERLAUBT = new Set(['0', '-1', 'auto']);

/** Kommentare entfernen (Zeilen bleiben erhalten). */
function ohneKommentare(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (k) => k.replace(/[^\n]/g, ' '));
}

/**
 * CSS in Regeln zerlegen: `{ selektor, koerper, zeile, kontext }`, `kontext` = umgebende At-Regeln (z. B. `@media …`).
 * `@keyframes` und `@font-face` liefern keine Regeln. Reicht für die Gestaltung von Ablago (keine Zeichenketten mit
 * Klammern in Selektoren).
 */
export function regeln(css) {
  const text = ohneKommentare(css);
  const aus = [];
  let i = 0;
  const zeileBei = (p) => text.slice(0, p).split('\n').length;
  function block(ende, kontext) {
    while (i < ende) {
      const auf = text.indexOf('{', i);
      const zu = text.indexOf('}', i);
      if (auf === -1 || (zu !== -1 && zu < auf)) {
        i = zu === -1 ? ende : zu + 1;
        return;
      }
      const kopf = text.slice(i, auf).trim();
      // Ende des Blocks suchen (verschachtelt).
      let tiefe = 1;
      let j = auf + 1;
      for (; j < text.length && tiefe; j++) {
        if (text[j] === '{') tiefe++;
        else if (text[j] === '}') tiefe--;
      }
      const koerperEnde = j - 1;
      const start = i + (text.slice(i, auf).length - text.slice(i, auf).trimStart().length);
      if (kopf.startsWith('@')) {
        if (/^@(media|supports|container|layer)\b/.test(kopf)) {
          i = auf + 1;
          block(koerperEnde, [...kontext, kopf.replace(/\s+/g, ' ')]);
        }
        i = j;
        continue;
      }
      // Kopf kann mit „;“ einer At-Regel ohne Block beginnen (@import …;).
      const selektor = kopf.slice(kopf.lastIndexOf(';') + 1).trim();
      aus.push({ selektor, koerper: text.slice(auf + 1, koerperEnde), zeile: zeileBei(start), kontext });
      i = j;
    }
  }
  block(text.length, []);
  return aus;
}

/** Selektorliste an Kommas der obersten Ebene teilen. */
export function teile(selektor) {
  const teile = [];
  let tiefe = 0;
  let akt = '';
  for (const c of selektor) {
    if (c === '(') tiefe++;
    if (c === ')') tiefe--;
    if (c === ',' && !tiefe) {
      teile.push(akt.trim());
      akt = '';
    } else akt += c;
  }
  if (akt.trim()) teile.push(akt.trim());
  return teile;
}

/** Alle Klassen eines Selektors in Reihenfolge (ohne `:global(...)`-Hülle). */
export function klassenIn(selektor) {
  return [...selektor.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

/** Besitzer eines Selektors: seine erste Klasse (oder null bei reinen Element-Selektoren). */
export function besitzer(selektor) {
  return klassenIn(selektor)[0] ?? null;
}

function dateien(dir, re) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && re.test(d.name))
    .map((d) => join(d.parentPath, d.name));
}

const name = (d) => relative(process.cwd(), d).split(sep).join('/');

/**
 * Zeichenketten einer TS-Datei: '…', "…" und die festen Teile von `…` (auch verschachtelt in `${…}`), ohne
 * Kommentare. Ein Teil einer Vorlage, auf den direkt `${` folgt, endet mit „§“ (Vorsilbe, z. B. `stufe-${n}`).
 */
export function zeichenketten(ts) {
  const aus = [];
  let i = 0;
  const n = ts.length;
  // Stapel: 'code' bis zur passenden „}“ einer `${…}`-Stelle, Tiefe der Klammern darin.
  const stapel = [];
  let tiefe = 0;
  function vorlage() {
    // i steht hinter dem öffnenden `
    let teil = '';
    while (i < n) {
      const c = ts[i];
      if (c === '\\') {
        teil += ts.slice(i, i + 2);
        i += 2;
      } else if (c === '`') {
        aus.push(teil);
        i++;
        return;
      } else if (c === '$' && ts[i + 1] === '{') {
        aus.push(teil + '§');
        teil = '';
        i += 2;
        stapel.push(tiefe);
        tiefe = 0;
        code(true);
      } else {
        teil += c;
        i++;
      }
    }
  }
  function code(inVorlage) {
    while (i < n) {
      const c = ts[i];
      if (c === '/' && ts[i + 1] === '/') {
        i = ts.indexOf('\n', i);
        if (i === -1) i = n;
      } else if (c === '/' && ts[i + 1] === '*') {
        i = ts.indexOf('*/', i + 2);
        i = i === -1 ? n : i + 2;
      } else if (c === "'" || c === '"') {
        let j = i + 1;
        while (j < n && ts[j] !== c && ts[j] !== '\n') j += ts[j] === '\\' ? 2 : 1;
        aus.push(ts.slice(i + 1, j));
        i = j + 1;
      } else if (c === '`') {
        i++;
        vorlage();
      } else if (c === '{') {
        tiefe++;
        i++;
      } else if (c === '}') {
        i++;
        if (inVorlage && tiefe === 0) {
          tiefe = stapel.pop();
          return;
        }
        tiefe--;
      } else i++;
    }
  }
  code(false);
  return aus;
}

/** Wörter aus Zeichenketten und Vorsilben vor `${` bzw. vor `'…-' +`. */
export function woerterInTs(ts) {
  const woerter = new Set();
  const vorsilben = new Set();
  for (const s of zeichenketten(ts)) {
    for (const w of s.split(/[\s'"`,;()[\]{}<>=:+*!?|&§]+/)) {
      if (/^-?[_a-zA-Z][\w-]*$/.test(w)) woerter.add(w);
    }
    const v = s.match(/(?:^|\s)([_a-zA-Z][\w-]*-)§$/);
    if (v) vorsilben.add(v[1]);
  }
  // 'vorsilbe-' + x
  for (const v of ts.matchAll(/['"`]([_a-zA-Z][\w-]*-)['"`]\s*\+/g)) vorsilben.add(v[1]);
  return { woerter, vorsilben };
}

/** Dateien außerhalb von web/src, die HTML mit Klassen der Gestaltung schreiben (Startbild, #1198). */
const WEITERE_QUELLEN = ['shared/src/startbild.ts', 'server/src/einrichtung/startmodus.ts'];

/** Alle Funde unter `wurzel`. */
export function pruefe(wurzel = 'web/src', ausnahmen = AUSNAHMEN, weitere = WEITERE_QUELLEN.filter((d) => existsSync(d))) {
  const css = dateien(wurzel, /\.css$/);
  const ts = dateien(wurzel, /\.tsx?$/);
  const woerter = new Set();
  const vorsilben = new Set();
  const tsText = new Map();
  for (const d of [...ts, ...weitere]) {
    const t = readFileSync(d, 'utf8');
    if (ts.includes(d)) tsText.set(d, t);
    const w = woerterInTs(t);
    w.woerter.forEach((x) => woerter.add(x));
    w.vorsilben.forEach((x) => vorsilben.add(x));
  }
  const globalGenutzt = (k) => woerter.has(k) || ausnahmen[k] || [...vorsilben].some((v) => k.startsWith(v));

  const besitz = new Map(); // Klasse -> Set(Datei)
  const tot = [];
  const zIndex = [];
  let regelzahl = 0;
  for (const d of css) {
    const datei = name(d);
    const modul = d.endsWith('.module.css');
    const text = readFileSync(d, 'utf8');
    let leser = null;
    let dynamisch = null;
    if (modul) {
      const nutzer = [...tsText].filter(([, t]) => t.includes(`/${basename(d)}'`) || t.includes(`/${basename(d)}"`));
      leser = nutzer.map(([, t]) => t).join('\n');
      // `s[wert.art]`: Dann zählt der Name auch als Zeichenkette in den einbindenden Dateien.
      dynamisch = /\b(?:s|stil|styles)\[(?!['"])/.test(leser) ? woerterInTs(leser).woerter : new Set();
    }
    const gesehen = new Set();
    for (const r of regeln(text)) {
      regelzahl++;
      for (const z of r.koerper.matchAll(/(?:^|;)\s*z-index\s*:\s*([^;!]+)/g)) {
        const wert = z[1].trim();
        if (!Z_ERLAUBT.has(wert) && !/^(?:var\(--ebene-[\w-]+\)|calc\(var\(--ebene-[\w-]+\) \+ \d+\))$/.test(wert))
          zIndex.push({ datei, zeile: r.zeile, wert });
      }
      for (const teil of teile(r.selektor)) {
        // In Modulen: lokale Klassen; was in :global(...) steht, gehört nicht dem Modul.
        const lokal = modul ? teil.replace(/:global\([^)]*\)/g, '') : teil;
        if (!modul) {
          const b = besitzer(teil);
          if (b) {
            if (!besitz.has(b)) besitz.set(b, new Set());
            besitz.get(b).add(datei);
          }
        }
        for (const k of klassenIn(lokal)) {
          if (gesehen.has(k)) continue;
          gesehen.add(k);
          const genutzt = modul
            ? new RegExp(`\\.${k}(?![\\w-])|\\[['"]${k}['"]\\]`).test(leser) || dynamisch.has(k) || ausnahmen[k]
            : globalGenutzt(k);
          if (!genutzt) tot.push({ datei, zeile: r.zeile, klasse: k });
        }
      }
    }
  }
  const doppelt = [...besitz]
    .filter(([, s]) => s.size > 1)
    .map(([klasse, s]) => ({ klasse, dateien: [...s].sort() }))
    .sort((a, b) => a.klasse.localeCompare(b.klasse));
  return { doppelt, tot, zIndex, regelzahl, klassen: besitz.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const liste = process.argv.includes('--liste');
  const wurzel = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'web/src';
  const { doppelt, tot, zIndex, regelzahl, klassen } = pruefe(wurzel);
  for (const f of doppelt) {
    console.log(
      `::error file=${f.dateien[0]},title=Klasse doppelt::.${f.klasse} steht in ${f.dateien.join(', ')} – eine Klasse gehört in genau eine Datei, die ihres Besitzers (#1270)`,
    );
  }
  for (const f of tot) {
    console.log(
      `::error file=${f.datei},line=${f.zeile},title=Klasse ungenutzt::.${f.klasse} setzt die Oberfläche nirgends – entfernen (#1270)`,
    );
  }
  for (const f of zIndex) {
    console.log(
      `::error file=${f.datei},line=${f.zeile},title=z-index ohne Stufe::z-index: ${f.wert} – eine Stufe aus tokens.css nehmen (var(--ebene-…))`,
    );
  }
  console.log(
    `${regelzahl} Regeln, ${klassen} Klassen: ${doppelt.length} doppelt, ${tot.length} ungenutzt, ${zIndex.length} z-index ohne Stufe.`,
  );
  if (!liste && (doppelt.length || tot.length || zIndex.length)) process.exit(1);
}
