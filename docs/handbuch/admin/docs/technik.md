# Technik des DMS

Überblick für Betrieb und Support. Welche Versionen auf einem System tatsächlich laufen, zeigt die Werkbank unter **Technik** – dort lässt sich die Übersicht auch für ein GitHub-Issue kopieren.

## Bausteine

```
Browser ── HTTP ──▶ DMS-Container (Node.js) ──▶ PostgreSQL-Container
   React-Oberfläche        Fastify-API              Mappen, Typen, Benutzer,
   (im Image enthalten)    Dateien unter /data/…    Sitzungen, Protokolle
```

| Baustein | Technik | Wozu |
| --- | --- | --- |
| Oberfläche | React 19, gebaut mit Vite | Ablage, Werkbank, Profil – alles im Browser |
| Server | Node.js 22, Fastify 5, TypeScript (mit esbuild gebündelt) | Schnittstelle unter `/api`, liefert auch die Oberfläche aus |
| Datenbank | PostgreSQL 17, Zugriff mit postgres.js, SQL-Migrationen in `server/migrations` | Alle Daten außer den Dateien |
| Dateien | Feste Ordner `/data/files`, `/data/geheim`, `/data/sicherung` (Volumes, siehe [Installation](installation.md#ordner-und-volumes)); je Datei ihr SHA-256 als Name | Hochgeladene Dokumente, gleicher Inhalt nur einmal; Schlüssel; Sicherungen |
| E-Mail | nodemailer über SMTP (optional, eingestellt in der Werkbank) | Einladungen, Passwort-Links, Hinweise |
| Texterkennung | Tesseract (deu, eng) und poppler (pdftotext, pdftoppm) im Image; deutsche Volltextsuche von PostgreSQL | Volltext von PDFs, Scans und Bildern (#45) |
| Verschlüsselung | AES-256-GCM (Node.js crypto), Schlüssel als Datei unter `/data/geheim` | Gespeicherte Passwörter (#39, #46) |
| Image | `node:22-alpine`, mehrstufig gebaut, für amd64 und arm64 – jede Architektur auf einem eigenen, passenden Rechner von GitHub (ohne Emulation), danach zu einem Image zusammengeführt | Läuft auf dem NAS neben dem PostgreSQL-Image |
| Prüfungen | GitHub Actions: Typprüfung, Tests gegen PostgreSQL, Image-Bau | Jeder Push auf `main` |

## Schnittstelle

`/api/v1` für andere Programme (API-Schlüssel), Beschreibung unter `/api/openapi.json`. Die Oberfläche selbst nutzt interne Adressen unter `/api/…`, die sich ändern dürfen.

## Module

Jede Protokollzeile gehört zu einem Modul:

| Modul | Was |
| --- | --- |
| `system` | Start, Einstellungen, Debug-Modus |
| `http` | eine Zeile je Anfrage: Methode, Pfad, Status, Dauer, Datenbankzugriffe |
| `konto` | Anmeldung, Sitzungen, Benutzer, Vertretung |
| `ablage` | Mappen anlegen, ändern, löschen; Sichten |
| `werkbank` | Mappentypen, Demo-Daten, Einstellungen, Versionsabgleich |
| `dokumente` | Hochladen, Anzeigen, Löschen |
| `datenbank` | Migrationen, Verbindung, lange Zugriffe |
| `mail` | Versand und Fehler beim Versand |

## Wo was steht

| Was | Wo |
| --- | --- |
| Protokoll dauerhaft | Container-Logs: `docker logs <app-container>` |
| Protokoll der letzten 24 Stunden | Werkbank → Protokoll |
| Lange Datenbankzugriffe | Werkbank → Datenbank (Tabelle `langlaeufer`) |
| Datenbank sichern | am besten über **Werkbank → Sicherung**; zusätzlich mit zwei Containern `docker exec <db-container> pg_dump -U dms dms > dms.sql`, bei dms-komplett `docker exec <container> pg_dump -h 127.0.0.1 -U dms dms > dms.sql` |
| Dateien sichern | Ordner `files` aus der Compose-Vorlage |

## Versionen und Aktualisierung

Das Image enthält Node.js, Alpine Linux und alle Bibliotheken; aktualisiert wird durch Neuziehen von `ghcr.io/motom001/dms:main` und Neustart.

- **Zwei Container (empfohlen):** PostgreSQL ist ein eigenes Image (`postgres:17`): kleinere Versionen (17.x) durch Neuziehen, unabhängig vom DMS.
- **dms-komplett:** PostgreSQL (Alpine-Paket) steckt im Image `ghcr.io/motom001/dms-komplett` und kommt mit dessen Updates. Beide Images werden jede Woche neu gebaut, mit den aktuellen Alpine-Paketen (Tag `main`); feste Versionsnummern ändern sich dabei nicht.
- Ein Wechsel der Hauptversion (z. B. 17 → 18) braucht in beiden Fällen eine Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](wachsen.md#neue-hauptversion-von-postgresql).

Der Versionsabgleich in der Werkbank fragt nur auf Knopfdruck: GitHub für den Stand des DMS, [endoflife.date](https://endoflife.date) für Node.js, PostgreSQL und Alpine, die npm-Registry für die Bibliotheken. Er trennt, was du **selbst aktualisierst** (das DMS-Image, bei zwei Containern PostgreSQL), von dem, was **mit dem DMS kommt** (Node.js, Alpine, Bibliotheken – bei dms-komplett auch PostgreSQL).

Die Entscheidungen hinter dem Aufbau stehen in [entscheidungen.md](entscheidungen.md).
