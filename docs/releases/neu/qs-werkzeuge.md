art: keine

## Geändert

- **Playwright mit eigenem Lockfile** (#1272): Rauchtests und Handbuchbilder holen Playwright in fester Version aus `web/rauchtest/` mit `npm ci` (Prüfsumme im Lockfile, Dependabot hält es aktuell) – nicht mehr per `npm install --no-save` in den Workflows. Nur für die Entwicklung, ohne Wirkung auf Ablago selbst.
