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

### Zwei Images aus einem Dockerfile

Das `Dockerfile` hat zwei Ziele (#208):

| Ziel | Image | Inhalt |
| --- | --- | --- |
| `dms` (Standard) | `ghcr.io/motom001/dms` | nur das DMS; PostgreSQL läuft daneben (empfohlen) |
| `komplett` | `ghcr.io/motom001/dms-komplett` | DMS und PostgreSQL 17 in einem Container, Start über `deploy/komplett/start.sh` (tini) |

```sh
docker build -t dms .                                  # schlank
docker build --target komplett -t dms-komplett .       # mit PostgreSQL
deploy/komplett-probe.sh dms-komplett                  # Probe wie in der CI: Einrichten, Neustart, Stopp, Absturz, Versionsprüfung
deploy/vorlagen-probe.sh dms                           # NAS-Vorlagen mit dem schlanken Image
```

`deploy/` ist bis auf `deploy/komplett/start.sh` vom Docker-Build ausgeschlossen (`.dockerignore`). Die CI baut beide Images für amd64 und arm64, bei jedem Pull Request mit Probe; auf `main` und jede Woche (neue Alpine-Pakete) werden beide veröffentlicht.

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

### Offline-Hilfe im Image

Das Dockerfile baut im Abschnitt `hilfe` alle vier Handbücher und die Startseite mit `docs/handbuch/werkzeuge/offline.py` und legt sie nach `web/dist/hilfe`; der Server liefert sie unter `/hilfe/` aus. Je Handbuch gibt es dafür `mkdocs.offline.yml` (erbt von `mkdocs.yml`) mit dem Hook `werkzeuge/offline_hook.py`:

- Bildschirmfotos (`bilder/…`) werden zu einem Hinweis mit Link auf dieselbe Seite online (`/dms/<handbuch>/vX.Y/…`).
- Verweise `https://motom001.github.io/dms/<handbuch>/aktuell/…` zeigen auf `/hilfe/<handbuch>/…`; Vorlagen bleiben online, `api/openapi.json` zeigt auf die eigene Installation.
- Keine Versionsauswahl, keine Schriften aus dem Internet, keine Quellkarten, Suche nur auf Deutsch.

Lokal: `python3 docs/handbuch/werkzeuge/offline.py /tmp/hilfe`. Das Skript prüft am Ende, dass jeder Verweis auf `/hilfe/…` eine Seite trifft; die CI prüft zusätzlich alle Ziele der kontextbezogenen Hilfe. Ohne gebaute Handbücher (`npm run dev`) leitet der Server `/hilfe/…` auf die Online-Fassung der Version um.
