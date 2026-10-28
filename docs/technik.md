# Technik des DMS

Überblick für Betrieb und Support. Welche Versionen auf einem System tatsächlich laufen, zeigt die Werkbank unter **Technik** – dort lässt sich die Übersicht auch für ein GitHub-Issue kopieren.

## Bausteine

```
Browser ── HTTP ──▶ DMS-Container (Node.js) ──▶ PostgreSQL-Container
   React-Oberfläche        Fastify-API              Mappen, Typen, Benutzer,
   (im Image enthalten)    Dateien unter FILES_DIR  Sitzungen, Protokolle
```

| Baustein | Technik | Wozu |
| --- | --- | --- |
| Oberfläche | React 19, gebaut mit Vite | Ablage, Werkbank, Profil – alles im Browser |
| Server | Node.js 22, Fastify 5, TypeScript (mit esbuild gebündelt) | Schnittstelle unter `/api`, liefert auch die Oberfläche aus |
| Datenbank | PostgreSQL 17, Zugriff mit postgres.js, SQL-Migrationen in `server/migrations` | Alle Daten außer den Dateien |
| Dateien | Ordner `FILES_DIR`, je Datei ihr SHA-256 als Name | Hochgeladene Dokumente, gleicher Inhalt nur einmal |
| E-Mail | nodemailer über SMTP (optional) | Einladungen, Passwort-Links, Hinweise |
| Image | `node:22-alpine`, mehrstufig gebaut, für amd64 und arm64 | Läuft auf dem NAS neben dem PostgreSQL-Image |
| Prüfungen | GitHub Actions: Typprüfung, Tests gegen PostgreSQL, Image-Bau | Jeder Push auf `main` |

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
| Datenbank sichern | `docker exec <db-container> pg_dump -U dms dms > dms.sql` |
| Dateien sichern | Ordner `files` aus der Compose-Vorlage |

## Versionen und Aktualisierung

Das Image enthält Node.js, Alpine Linux und alle Bibliotheken; aktualisiert wird durch Neuziehen von `ghcr.io/motom001/dms:main` und Neustart. PostgreSQL ist ein eigenes Image (`postgres:17`): kleinere Versionen (17.x) durch Neuziehen, ein Wechsel der Hauptversion (z. B. 17 → 18) braucht eine Sicherung und Wiederherstellung.

Der Versionsabgleich in der Werkbank fragt nur auf Knopfdruck: GitHub für den Stand des DMS, [endoflife.date](https://endoflife.date) für Node.js, PostgreSQL und Alpine, die npm-Registry für die Bibliotheken.

Die Entscheidungen hinter dem Aufbau stehen in [entscheidungen.md](entscheidungen.md).
