import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { STARTBILD_PLATZHALTER, startbildAusTexten } from '../shared/src/startbild';

/** Startbild (#1198) in index.html: HTML und CSS ohne Skript, Texte aus den Sprachdateien (Deutsch und Englisch). */
function startbild(): Plugin {
  const texte = (sprache: string) => JSON.parse(readFileSync(new URL(`../shared/src/sprachen/${sprache}/oberflaeche.json`, import.meta.url), 'utf8')) as Record<string, string>;
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
  const dateien = (ordner: string): string[] => readdirSync(ordner, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? dateien(join(ordner, e.name)) : [join(ordner, e.name)]);
  return {
    name: 'ablago-vorkomprimieren',
    apply: 'build',
    configResolved: (c) => { ziel = resolve(c.root, c.build.outDir); },
    closeBundle() {
      let vorher = 0;
      let nachher = 0;
      for (const datei of dateien(ziel)) {
        if (!KOMPRIMIERBAR.test(datei) || statSync(datei).size < MINDESTGROESSE) continue;
        const inhalt = readFileSync(datei);
        const br = brotliCompressSync(inhalt, { params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY, [zlib.BROTLI_PARAM_SIZE_HINT]: inhalt.length } });
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

export default defineConfig({
  plugins: [react(), startbild(), vorkomprimieren()],
  server: {
    port: 5173,
    // Gemeinsamer Code liegt in ../shared
    fs: { allow: ['..'] },
    // /hilfe (#219): Handbücher liefert der Server aus bzw. leitet ohne gebaute Handbücher online weiter.
    proxy: { '/api': 'http://localhost:3000', '/hilfe': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
