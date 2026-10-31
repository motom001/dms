import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Gemeinsamer Code liegt in ../shared
    fs: { allow: ['..'] },
    // /hilfe (#219): Handbücher liefert der Server aus bzw. leitet ohne gebaute Handbücher online weiter.
    proxy: { '/api': 'http://localhost:3000', '/hilfe': 'http://localhost:3000' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
