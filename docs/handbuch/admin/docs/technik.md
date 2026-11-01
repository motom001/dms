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
| Server | Node.js 24, Fastify 5, TypeScript (mit esbuild gebündelt) | Schnittstelle unter `/api`, liefert auch die Oberfläche aus |
| Datenbank | PostgreSQL 17, Zugriff mit postgres.js, SQL-Migrationen in `server/migrations` | Alle Daten außer den Dateien |
| Dateien | Feste Ordner `/data/files`, `/data/geheim`, `/data/sicherung` (Volumes, siehe [Installation](installation.md#ordner-und-volumes)); je Datei ihr SHA-256 als Name; optional der [Eingangsordner](eingangsordner.md) `/eingang` | Hochgeladene Dokumente, gleicher Inhalt nur einmal; Schlüssel; Sicherungen; Scans zum Abholen |
| E-Mail | nodemailer über SMTP zum Versenden; imapflow und mailparser über IMAP zum Abholen (beides optional, eingestellt in der Werkbank) | Einladungen, Passwort-Links, Hinweise, Mappen versenden; Mails aus [Postfächern](postfaecher.md) als Post abholen |
| Texterkennung | Tesseract (deu, eng) und poppler (pdftotext, pdftoppm) im Image; deutsche Volltextsuche von PostgreSQL | Volltext von PDFs, Scans und Bildern (#45) |
| PDF verkleinern | pdf-lib, pdftoppm (poppler) für die Bilder und qpdf (Apache-2.0) für die Struktur, beides im Image; kein Ghostscript | Große Scans kleiner machen (#393) |
| Verschlüsselung | AES-256-GCM (Node.js crypto), Schlüssel als Datei unter `/data/geheim` | Gespeicherte Passwörter (#39, #46) |
| Image | `node:24-alpine`, mehrstufig gebaut, für amd64 und arm64 – jede Architektur auf einem eigenen, passenden Rechner von GitHub (ohne Emulation), danach zu einem Image zusammengeführt | Läuft auf dem NAS neben dem PostgreSQL-Image |
| dms-komplett | Dasselbe Image mit PostgreSQL 17 (Alpine-Paket) im selben Container; Datenbank im Ordner `/data/postgres` | DMS und Datenbank in einem Container |
| Prüfungen | GitHub Actions: Typprüfung, Tests gegen PostgreSQL, Image-Bau | Jeder Push auf `main`, jeder Pull Request, jedes Versions-Tag und einmal pro Woche |

## Schnittstelle

`/api/v1` für andere Programme (API-Schlüssel), Beschreibung unter `/api/openapi.json`. Die Oberfläche selbst nutzt interne Adressen unter `/api/…`, die sich ändern dürfen.

## Hilfe ohne Internet

Das Image bringt die Handbücher seiner Version mit: Startseite, Wie komme ich an ein DMS?, Benutzer-, Administrator- und Entwicklerhandbuch, erreichbar unter `/hilfe/` der eigenen Installation (z. B. `http://<NAS>:8080/hilfe/`), ohne Anmeldung und schon im Einrichtungsassistenten. Das Fragezeichen neben einer Überschrift und die Links auf das Handbuch öffnen diese Version. Sie kommt ohne Internet aus; nur die Bildschirmfotos fehlen – an ihrer Stelle steht ein Link auf dieselbe Seite online. Im Fuß jeder Seite geht es zur Online-Hilfe und zur neuesten Version.

## Module

Jede Zeile im [Protokoll](fehlersuche.md#protokoll) gehört zu einem Modul. Für jede Anfrage an den Server schreibt das DMS eine Zeile mit Methode, Pfad, Status, Dauer und Datenbankzugriffen – im Modul des Bereichs, zu dem die Anfrage gehört (z. B. `ablage` für Mappen). Anfragen, die nur lesen – auch Vorschauen, Zählungen und Testläufe, die die Oberfläche per POST schickt –, stehen nur auf Stufe `debug`, also nur im Debug-Modus.

| Modul | Was |
| --- | --- |
| `system` | Start, Einstellungen, Debug-Modus |
| `http` | Anfragen, die zu keinem anderen Modul gehören (z. B. Seiten der Oberfläche) |
| `konto` | Anmeldung, Sitzungen, Benutzer, Rollen, Vertretung |
| `ablage` | Mappen anlegen, ändern, löschen; Ansichten, Papierkorb, Notizen, Aufgaben |
| `werkbank` | Mappentypen, Demo-Daten, Einstellungen, Versionsabgleich |
| `dokumente` | Hochladen, Anzeigen, Löschen |
| `texterkennung` | Texterkennung: abgeschlossen, ausgelassen, fehlgeschlagen, neu gestartet, abgebrochen; Einstellungen |
| `sicherung` | Sicherung, Notfallblatt, Wiederherstellung und Probe |
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
