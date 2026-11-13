import { readFileSync } from 'node:fs';
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

export default defineConfig({
  plugins: [react(), startbild()],
  server: {
    port: 5173,
    // Gemeinsamer Code liegt in ../shared
    fs: { allow: ['..'] },
    // /hilfe (#219): Handbücher liefert der Server aus bzw. leitet ohne gebaute Handbücher online weiter.
    proxy: { '/api': 'http://localhost:3000', '/hilfe': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
