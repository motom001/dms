import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { STARTBILD_PLATZHALTER, startbildAusTexten } from '../shared/src/startbild';

/** Startbild (#1198) in index.html: HTML und CSS ohne Skript, Texte aus den Sprachdateien (Deutsch und Englisch). */
function startbild(): Plugin {
  const texte = (sprache: string) =>
    JSON.parse(readFileSync(new URL(`../shared/src/sprachen/${sprache}/oberflaeche.json`, import.meta.url), 'utf8')) as Record<
      string,
      string
    >;
  return {
    name: 'ablago-startbild',
    transformIndexHtml: (html) => html.replace(STARTBILD_PLATZHALTER, startbildAusTexten({ de: texte('de'), en: texte('en') })),
  };
}

/** Endungen, die sich lohnen (#1236): Text und unkomprimierte Schriften. woff2, Bilder und PDF-Hilfsdateien sind schon dicht. */
const KOMPRIMIERBAR = /\.(?:js|mjs|cjs|css|html|svg|json|webmanifest|wasm|txt|xml|ttf|otf)$/i;
/** Darunter lohnt es nicht: ein Paket im Netz ist ohnehin so groß. */
const MINDESTGROESSE = 1024;

/**
 * Vorkomprimieren (#1236): legt nach dem Bau neben jede passende Datei in dist eine `.br`- und eine `.gz`-Fassung.
 * Der Server liefert sie über @fastify/static (`preCompressed`) passend zu Accept-Encoding aus und komprimiert selbst
 * nichts. Nur zlib aus Node, keine weitere Abhängigkeit. Eine Fassung, die nicht kleiner wird, entfällt.
 */
function vorkomprimieren(): Plugin {
  let ziel = '';
  const dateien = (ordner: string): string[] =>
    readdirSync(ordner, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? dateien(join(ordner, e.name)) : [join(ordner, e.name)]));
  return {
    name: 'ablago-vorkomprimieren',
    apply: 'build',
    configResolved: (c) => {
      ziel = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      let vorher = 0;
      let nachher = 0;
      for (const datei of dateien(ziel)) {
        if (!KOMPRIMIERBAR.test(datei) || statSync(datei).size < MINDESTGROESSE) continue;
        const inhalt = readFileSync(datei);
        const br = brotliCompressSync(inhalt, {
          params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY, [zlib.BROTLI_PARAM_SIZE_HINT]: inhalt.length },
        });
        const gz = gzipSync(inhalt, { level: 9 });
        if (br.length < inhalt.length) writeFileSync(`${datei}.br`, br);
        if (gz.length < inhalt.length) writeFileSync(`${datei}.gz`, gz);
        vorher += inhalt.length;
        nachher += Math.min(br.length, inhalt.length);
      }
      this.info(`vorkomprimiert: ${Math.round(vorher / 1024)} KiB -> ${Math.round(nachher / 1024)} KiB (brotli)`);
    },
  };
}

/**
 * Bestandteile der Oberfläche (#1470): welche npm-Pakete wirklich im Bündel landen. Rollup kennt je Teil die Module
 * samt der Länge, die nach dem Tree-Shaking übrig bleibt; Module mit Länge 0 sind weggefallen. Ein Paket zählt, wenn
 * mindestens ein Modul von ihm Code beiträgt. Geschrieben wird neben `dist` (nicht hinein, damit es nicht
 * ausgeliefert wird): `web/bestandteile-buendel.json` mit Name und Version je Paket. Die CI legt die Datei aus dem
 * Produktivbau als Artefakt ab, `.github/werkzeuge/bestandteile.mjs` liest sie fürs Release.
 */
const BUENDEL_DATEI = 'bestandteile-buendel.json';
function bestandteileDesBuendels(): Plugin {
  let wurzel = '';
  const pakete = new Map<string, { name: string; version: string }>();
  /** „…/node_modules/@a/b/lib/x.js?commonjs“ → Ordner und Name des Pakets, das die Datei enthält. */
  const paketVon = (id: string) => {
    const pfad = id.replace(/^\0/, '').replace(/\?.*$/, '').replace(/\\/g, '/');
    const i = pfad.lastIndexOf('/node_modules/');
    if (i < 0) return null;
    const teile = pfad.slice(i + '/node_modules/'.length).split('/');
    const name = teile[0].startsWith('@') ? `${teile[0]}/${teile[1]}` : teile[0];
    return { ordner: `${pfad.slice(0, i)}/node_modules/${name}`, name };
  };
  return {
    name: 'ablago-bestandteile-buendel',
    apply: 'build',
    configResolved: (c) => {
      wurzel = c.root;
    },
    generateBundle(_, bundle) {
      for (const teil of Object.values(bundle)) {
        if (teil.type !== 'chunk') continue;
        for (const [id, m] of Object.entries(teil.modules)) {
          const p = m.renderedLength > 0 ? paketVon(id) : null;
          if (!p || pakete.has(p.ordner)) continue;
          const pj = JSON.parse(readFileSync(join(p.ordner, 'package.json'), 'utf8')) as { name?: string; version?: string };
          pakete.set(p.ordner, { name: pj.name ?? p.name, version: pj.version ?? '' });
        }
      }
    },
    closeBundle() {
      const liste = [...new Map([...pakete.values()].map((p) => [`${p.name}@${p.version}`, p])).values()];
      liste.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
      writeFileSync(resolve(wurzel, BUENDEL_DATEI), `${JSON.stringify({ quelle: 'vite', pakete: liste }, null, 1)}\n`);
      this.info(`Bestandteile im Bündel: ${liste.length} npm-Pakete -> ${BUENDEL_DATEI}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), startbild(), vorkomprimieren(), bestandteileDesBuendels()],
  server: {
    port: 5173,
    // Gemeinsamer Code liegt in ../shared
    fs: { allow: ['..'] },
    // /hilfe (#219): Handbücher liefert der Server aus bzw. leitet ohne gebaute Handbücher online weiter.
    proxy: { '/api': 'http://localhost:3000', '/hilfe': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
