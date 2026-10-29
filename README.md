# DMS

[![Neuestes Release](https://img.shields.io/github/v/release/motom001/dms?label=Release&sort=semver)](https://github.com/motom001/dms/releases/latest)
[![Prüfen und Image bauen](https://github.com/motom001/dms/actions/workflows/image.yml/badge.svg?branch=main)](https://github.com/motom001/dms/actions/workflows/image.yml)
[![Handbuch](https://github.com/motom001/dms/actions/workflows/handbuch.yml/badge.svg?branch=main)](https://github.com/motom001/dms/actions/workflows/handbuch.yml)
[![Lizenz: AGPL-3.0](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)](LICENSE)
[![Projekt unterstützen](https://img.shields.io/badge/Projekt_unterst%C3%BCtzen-GitHub_Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/motom001)

Ein selbst gehostetes, persönliches Informations- und Dokumentenmanagementsystem für Haushalte. Statt loser Dokumente in Ordnern ordnet es **Mappen**: Vertragspartner, Verträge, Rechnungen, Gegenstände – verbunden über Verweise, so dass man von jeder Mappe aus zu allem Zugehörigen findet.

Was das DMS kann, steht in den Handbüchern; was in welcher Version dazukam, in den **[Releases](https://github.com/motom001/dms/releases)**.

## Was es kann – in Kürze

- **Mappentypen selbst gestalten:** Felder mit Prüfregeln, Verweise auf andere Mappen, Register, Titel-Vorlagen und Trefferlisten – alles in der Werkbank, ohne Programmieren.
- **Ablage in drei Spalten:** Sichten als Baum mit Bedingungen wie „Kündigung in den nächsten 12 Monaten“, Favoriten, Eingang mit Aufgaben, Papierkorb.
- **Dokumente** direkt in der Mappe ansehen; **Volltextsuche** auch in Scans dank Texterkennung.
- **Zusammenarbeit:** Benutzer und Rollen, Notizen, Erwähnungen, Aufgaben mit täglicher Zusammenfassung, Abwesenheit mit Vertretung, Protokoll jeder Änderung.
- **Weitergeben:** Mappen per E-Mail versenden, als PDF exportieren, sprechende Links wie `/ablage/link?typ=Rechnung&rechnungsnummer=R-17`.
- **Passwortfelder**, verschlüsselt gespeichert; eigene **Designs** mit Logo; **Schnittstelle** `/api/v1` mit API-Schlüsseln.

## Handbücher

- **[Wofür ein DMS?](https://motom001.github.io/dms/benutzer/aktuell/wofuer/)** – wann es im Alltag hilft, mit Selbstcheck.
- **[Benutzerhandbuch](https://motom001.github.io/dms/benutzer/)** – arbeiten in der Ablage: Mappen, Dokumente, Suche, Aufgaben, Profil.
- **[Administratorhandbuch](https://motom001.github.io/dms/admin/)** – Installation, Aktualisieren und Sichern, Werkbank, Fehlersuche, API, Technik und Entscheidungen.

Im DMS führt **Hilfe** im Menü unter dem eigenen Namen dorthin.

## Schnellstart auf dem NAS

Das Image `ghcr.io/motom001/dms` ist öffentlich (amd64 und arm64) – eine Anmeldung bei der Registry ist nicht nötig.

1. Die Vorlage [`deploy/nas/docker-compose.yml`](deploy/nas/docker-compose.yml) als Compose-Projekt anlegen und die Pfade anpassen (Ordner `postgres`, `files`, `geheim` und `sicherung`).
2. Daneben eine Datei `.env` mit `DB_PASSWORD=<langes zufälliges Passwort>` ablegen.
3. Starten und `http://<NAS>:8080` aufrufen. Ein Assistent führt durch die Einrichtung: Einrichtungscode (steht im Protokoll des Containers und in `geheim/EINRICHTUNGSCODE`), Datenbank, Mandant, Administrator, erster Benutzer, Schlüssel und Notfallblatt.

Alles Weitere – Einstellungen, Reverse-Proxy, Aktualisieren, **Sichern** – steht im Administratorhandbuch unter [Installation](https://motom001.github.io/dms/admin/installation/) und [Aktualisieren und Sichern](https://motom001.github.io/dms/admin/aktualisieren/).

`ghcr.io/motom001/dms:main` folgt jedem Stand auf `main`; mit einer Versionsnummer wie `ghcr.io/motom001/dms:0.18.0` bleibt die Installation auf einem Release.

## Wünsche und Fehler

Als [Issue](https://github.com/motom001/dms/issues/new?template=wunsch.md) im Format einer User Story mit Abnahmekriterien. Mit dem Label `freigegeben` wird es umgesetzt.

## Entwicklung

Voraussetzungen: Node.js 22, Docker.

```sh
npm install
docker compose up db            # nur die Datenbank
DATABASE_URL=postgres://dms:dms@localhost:5432/dms npm run dev -w server
npm run dev -w web              # Oberfläche auf http://localhost:5173
```

Ohne Docker legt der Server seine festen Ordner (`files`, `geheim`, `sicherung`) unter `./data` im Projekt an; `DMS_DATENWURZEL=/anderer/ordner` verlegt sie (z. B. für Tests oder die CI). Im Image sind es immer `/data/…`, zugeordnet über Volumes.

Oder alles zusammen als Container: `docker compose up --build` → http://localhost:8080

Tests: `npm test`. Mit `TEST_DATABASE_URL` laufen zusätzlich die Tests gegen PostgreSQL (**leert das Schema der angegebenen Datenbank**).

```
shared/   Fachmodell und Prüfregeln (Server und Oberfläche)
server/   Fastify-API, PostgreSQL (postgres.js), SQL-Migrationen
web/      React-Oberfläche (Vite)
deploy/   Vorlagen für den Betrieb
docs/     Handbücher (MkDocs) mit Screenshot-Skript, Release-Notizen
```

Technik und Entscheidungen: [Administratorhandbuch → Technik](https://motom001.github.io/dms/admin/technik/) und [Entscheidungen](https://motom001.github.io/dms/admin/entscheidungen/).

**Neue Version:** Versionsnummer in den drei `package.json` erhöhen und `docs/releases/v<version>.md` schreiben – Release und Image entstehen nach dem Merge automatisch. Dabei kurz prüfen, ob „Was es kann – in Kürze“ und der Schnellstart noch stimmen; alles Ausführliche gehört ins Handbuch, nicht hierher.

Wichtig: **Keine echten Dokumente oder persönlichen Daten committen** – nur Code und Beispieldaten.

## Unterstützen

Das DMS ist und bleibt frei nutzbar. Wer die Entwicklung freiwillig unterstützen möchte, kann das über [GitHub Sponsors](https://github.com/sponsors/motom001) tun – einmalig oder monatlich, mit frei gewähltem Betrag. Spenden von persönlichen GitHub-Konten kommen ohne Abzüge an. In der Anwendung steht der Hinweis nur in der Werkbank, nicht in der Ablage.

## Lizenz

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

Jeder darf das DMS nutzen, verändern und weitergeben. Wer eine veränderte Fassung weitergibt oder anderen über ein Netzwerk zur Nutzung anbietet, muss deren Quellcode unter derselben Lizenz zugänglich machen.
