/**
 * Playwright für Rauchtests und Handbuch-Werkzeuge (#1272): eine feste Version in web/rauchtest/package.json mit
 * eigenem Lockfile, installiert mit `npm ci` in diesem Ordner (kein Workspace – nicht im Abhängigkeitsbaum der App
 * und nicht im Image). Skripte außerhalb dieses Ordners (docs/handbuch/screenshots/) importieren von hier, damit sie
 * dieselbe Installation nutzen.
 */
export { chromium, devices, webkit } from 'playwright';
