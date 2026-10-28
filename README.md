# DMS

[![Projekt unterstützen](https://img.shields.io/badge/Projekt_unterst%C3%BCtzen-GitHub_Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/motom001)

Ein selbst gehostetes, persönliches Informations- und Dokumentenmanagementsystem für Haushalte. Statt loser Dokumente in Ordnern ordnet es **Mappen**: Vertragspartner, Verträge, Rechnungen, Gegenstände – verbunden über Verweise, so dass man von jeder Mappe aus zu allem Zugehörigen findet.

> **Stand: v0.4.** Anmeldung und Benutzer, Mappentypen mit Feldern und Registern, Dokumente, Mappen in drei Spalten mit Eingang. Suche, Texterkennung und feinere Rechte folgen.

## Bereiche

- **Ablage** – hier wird gearbeitet, in drei Spalten von groß nach klein: Sichten, Mappen der Sicht, die geöffnete Mappe. Die Sicht **Eingang** sammelt Mappen, die nicht (mehr) zur Definition ihres Mappentyps passen, beim Ersteller der Mappe. Rückverweise erscheinen automatisch: Die Mappe eines Vertragspartners zeigt alle Verträge und Rechnungen, die auf ihn verweisen.
- **Werkbank** (Administratoren), ebenfalls dreigeteilt:
  - *Mappentypen* – Felder (Datentyp, Pflichtfeld, eindeutig, Längen, Wertebereiche, Auswahllisten, Referenzen), Register und Titel-Vorlage,
  - *Benutzer* – anlegen, Rollen vergeben, Einladungs- und Passwort-Links,
  - *Demo-Daten* – Beispiel-Mappentypen laden, beliebig viele Demo-Mappen für die vorhandenen Typen erzeugen und gesammelt wieder entfernen.
- **Profil** – jeder Benutzer ändert Name, E-Mail-Adresse und Passwort selbst (mit dem aktuellen Passwort).

Jede Mappe trägt feste Indexwerte: angelegt am/von, zuletzt geändert am/von.

**Register** sind die Trennblätter einer Mappe und werden je Mappentyp festgelegt:
- *Feldregister* – eine Gruppe von Feldern (jedes Feld liegt auf genau einem Feldregister),
- *Dokumentenregister* – hochgeladene Dateien; PDFs und Bilder lassen sich direkt ansehen, alles andere wird nur heruntergeladen,
- *Verknüpfungsregister* – Mappen, die hierher verweisen, auf Wunsch eingeschränkt (z. B. „Rechnungen“ nur über das Feld *Vertrag*).

Der **Titel** einer Mappe entsteht aus einer Vorlage wie `{verwendungszweck} vom {zahlungsdatum}`; die Einrichtung zeigt dazu eine Vorschau.

Dateien liegen unverändert im Dateiordner (`FILES_DIR`) unter ihrem SHA-256-Prüfwert. Gleicher Inhalt wird nur einmal gespeichert.

Die Feldregeln gelten in der Oberfläche **und** auf dem Server (`shared/src/model.ts`), damit nichts Ungültiges in die Datenbank gelangt.

## Betrieb auf dem NAS

Bei jedem Push auf `main` baut GitHub Actions ein Image und legt es unter `ghcr.io/motom001/dms` ab (Tag `main`, zusätzlich je Commit ein Kurz-Hash).

1. Auf GitHub ein Token anlegen (*Settings → Developer settings → Personal access tokens → Tokens (classic)*), nur mit dem Recht `read:packages`.
2. Das NAS einmalig bei der Registry anmelden: `docker login ghcr.io -u motom001` und das Token als Passwort eingeben.
3. Die Vorlage [`deploy/nas/docker-compose.yml`](deploy/nas/docker-compose.yml) als Projekt anlegen, Pfade anpassen und daneben eine `.env` mit `DB_PASSWORD=…` ablegen.
4. Starten. Die Oberfläche läuft unter `http://<NAS>:8080`. Beim ersten Start legt der Server die Tabellen selbst an.
5. **Erster Aufruf:** Wer die Seite als Erstes öffnet, legt das Administrator-Konto an. Deshalb direkt nach dem ersten Start selbst aufrufen.

### Einstellungen

| Variable | Bedeutung |
| --- | --- |
| `DATABASE_URL` | Verbindung zu PostgreSQL (Pflicht) |
| `APP_URL` | Adresse, unter der Benutzer das DMS öffnen; steht in den Links der E-Mails |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | E-Mail-Versand (optional). Ohne `SMTP_HOST` zeigt die Benutzerverwaltung Einladungs- und Passwort-Links zum Kopieren an; „Passwort vergessen“ setzt dann der Administrator zurück. |
| `TRUST_PROXY` | `true`, wenn ein Reverse-Proxy davor sitzt |

**Aktualisieren:** Image neu ziehen und das Projekt neu starten. Datenbank-Migrationen laufen beim Start automatisch.

**Sichern:** die Ordner `postgres` und `files` aus der Vorlage. Für eine konsistente Datenbanksicherung im laufenden Betrieb vorher `docker exec <db-container> pg_dump -U dms dms > dms.sql`.

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

Oder alles zusammen als Container: `docker compose up --build` → http://localhost:8080

Tests: `npm test`. Mit `TEST_DATABASE_URL` laufen zusätzlich die Tests gegen PostgreSQL (**leert das Schema der angegebenen Datenbank**).

## Aufbau

```
shared/   Fachmodell und Prüfregeln (Server und Oberfläche)
server/   Fastify-API, PostgreSQL (postgres.js), SQL-Migrationen
web/      React-Oberfläche (Vite)
deploy/   Vorlagen für den Betrieb
docs/     Entscheidungen und Konzept
```

Wichtig: **Keine echten Dokumente oder persönlichen Daten committen** – nur Code und Beispieldaten.

## Unterstützen

Das DMS ist und bleibt frei nutzbar. Wer die Entwicklung freiwillig unterstützen möchte, kann das über [GitHub Sponsors](https://github.com/sponsors/motom001) tun – einmalig oder monatlich, mit frei gewähltem Betrag. Spenden von persönlichen GitHub-Konten kommen ohne Abzüge an. In der Anwendung steht der Hinweis nur in der Werkbank, nicht in der Ablage.

## Lizenz

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

Jeder darf das DMS nutzen, verändern und weitergeben. Wer eine veränderte Fassung weitergibt oder anderen über ein Netzwerk zur Nutzung anbietet, muss deren Quellcode unter derselben Lizenz zugänglich machen.
