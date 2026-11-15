art: keine

## Geändert

- **Playwright mit eigenem Lockfile** (#1272): Rauchtests und Handbuchbilder holen Playwright in fester Version aus `web/rauchtest/` mit `npm ci` (Prüfsumme im Lockfile, Dependabot hält es aktuell) – nicht mehr per `npm install --no-save` in den Workflows. Nur für die Entwicklung, ohne Wirkung auf Ablago selbst.
- **Toter Code wird gemeldet** (#1286): knip prüft in der CI auf ungenutzte Dateien, Exporte und Abhängigkeiten; Pakete, die nur zufällig über andere Pakete mitkamen, stehen jetzt mit genauer Version in der eigenen `package.json`. Ungenutzter Code ist entfernt. Nur für die Entwicklung, ohne Wirkung auf Ablago selbst.
