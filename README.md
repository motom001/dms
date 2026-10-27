# DMS

Ein selbst gehostetes, persönliches Informations- und Dokumentenmanagementsystem für Haushalte. Statt loser Dokumente in Ordnern ordnet es **Mappen**: Vertragspartner, Verträge, Rechnungen, Gegenstände – verbunden über Verweise, so dass man von jeder Mappe aus zu allem Zugehörigen findet.

> **Stand: Grundgerüst (v0.1).** Mappentypen mit Feldern definieren und Mappen erfassen. Dokumente, Register, Suche, Benutzer und Rechte folgen.

## Die zwei Bereiche

- **Ablage** – hier wird gearbeitet: Mappen anlegen, ausfüllen, über Verweise navigieren. Rückverweise erscheinen automatisch: Die Mappe eines Vertragspartners zeigt alle Verträge und Rechnungen, die auf ihn verweisen.
- **Einrichtung** – hier wird festgelegt, welche Mappentypen es gibt und welche Felder sie haben (Datentyp, Pflichtfeld, eindeutig, Längen, Wertebereiche, Auswahllisten, Referenzen).

Die Feldregeln gelten in der Oberfläche **und** auf dem Server (`shared/src/model.ts`), damit nichts Ungültiges in die Datenbank gelangt.

## Betrieb auf dem NAS

Bei jedem Push auf `main` baut GitHub Actions ein Image und legt es unter `ghcr.io/motom001/dms` ab (Tag `main`, zusätzlich je Commit ein Kurz-Hash).

1. Auf GitHub ein Token anlegen (*Settings → Developer settings → Personal access tokens → Tokens (classic)*), nur mit dem Recht `read:packages`.
2. Das NAS einmalig bei der Registry anmelden: `docker login ghcr.io -u motom001` und das Token als Passwort eingeben.
3. Die Vorlage [`deploy/nas/docker-compose.yml`](deploy/nas/docker-compose.yml) als Projekt anlegen, Pfade anpassen und daneben eine `.env` mit `DB_PASSWORD=…` ablegen.
4. Starten. Die Oberfläche läuft unter `http://<NAS>:8080`. Beim ersten Start legt der Server die Tabellen selbst an.

**Aktualisieren:** Image neu ziehen und das Projekt neu starten. Datenbank-Migrationen laufen beim Start automatisch.

**Sichern:** die Ordner `postgres` und `files` aus der Vorlage. Für eine konsistente Datenbanksicherung im laufenden Betrieb vorher `docker exec <db-container> pg_dump -U dms dms > dms.sql`.

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
