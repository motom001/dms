# Loslegen

## Voraussetzungen

- **Node.js 22** und npm
- **Docker** (für PostgreSQL 17; oder eine eigene PostgreSQL-Installation)
- optional **Tesseract** mit deutschen Sprachdaten und **poppler-utils** für die Texterkennung
- optional **Python 3** mit `mkdocs-material` für die Handbücher

## Projekt holen und starten

```sh
git clone https://github.com/motom001/dms.git && cd dms
npm install
docker compose up db            # nur die Datenbank
DATABASE_URL=postgres://dms:dms@localhost:5432/dms npm run dev -w server
npm run dev -w web              # Oberfläche auf http://localhost:5173
```

Ohne Docker für das DMS selbst legt der Server seine festen Ordner (`files`, `geheim`, `sicherung`) unter `./data` im Projekt an. `DMS_DATENWURZEL=/anderer/ordner` verlegt sie. Beim ersten Aufruf führt der Einrichtungsassistent durch die Einrichtung. Den Einrichtungscode zeigt die Konsole des Servers.

Alles zusammen als Container: `docker compose up --build`, dann http://localhost:8080.

## Prüfen

| Befehl | Was |
| --- | --- |
| `npm test` | alle Tests des Servers (Node-Testrunner) |
| `TEST_DATABASE_URL=postgres://… npm test` | zusätzlich die Tests gegen PostgreSQL – **leert das Schema der angegebenen Datenbank**, also nur eine Wegwerf-Datenbank nehmen |
| `npm run typecheck` | TypeScript für `shared`, `server` und `web` |
| `npm run build` | Oberfläche und Server bauen wie im Image |

Die CI auf GitHub führt all das aus, baut das Image für amd64 und arm64, nimmt die Screenshots der Handbücher auf und prüft die Oberfläche in iPhone-Größe.

## Handbücher

```sh
pip install 'mkdocs-material>=9.5,<10'
mkdocs serve -f docs/handbuch/benutzer/mkdocs.yml
```

Die Bilder (`bilder/*.png`) entstehen in der CI mit `docs/handbuch/screenshots/aufnehmen.mjs` und liegen nicht im Repository. Lokal fehlen sie deshalb; die Warnungen dazu kannst du ignorieren.
