# Loslegen

## Voraussetzungen

- **Node.js 24** (LTS) und npm
- **Docker** (für PostgreSQL 17; oder eine eigene PostgreSQL-Installation)
- optional **poppler-utils** für die Textebene von PDFs, Vorschaubilder und Schwärzen (die Texterkennung ist ein Paket, siehe [Pakete mit Code](pakete-code.md#texterkennung))
- optional **Python 3** mit `mkdocs-material` für die Handbücher

## Projekt holen und starten

```sh
git clone https://github.com/motom001/dms.git && cd dms
npm install
docker compose up -d db         # nur die Datenbank
DATABASE_URL=postgres://dms:dms@localhost:5432/dms npm run dev
```

`npm run dev` im Wurzelordner startet Server (Port 3000) und Oberfläche zusammen; die Oberfläche läuft auf http://localhost:5173 und leitet `/api` und `/hilfe` an den Server weiter. Einzeln geht es mit `npm run dev -w server` und `npm run dev -w web`.

Ohne Docker für Ablago selbst legt der Server seine festen Ordner (`files`, `geheim`, `sicherung`) unter `./data` im Projekt an. `DMS_DATENWURZEL=/anderer/ordner` verlegt sie. Beim ersten Start mit funktionierender Verbindung übernimmt der Server `DATABASE_URL` in die Datei `./data/geheim/datenbank.json`. Danach gilt die Datei; die Variable ist nicht mehr nötig. Für eine andere Datenbank die Datei löschen oder unter **Werkbank → Datenbank-Anbindung** ändern.

Beim ersten Aufruf führt der Einrichtungsassistent durch die Einrichtung. Den Einrichtungscode gibt der Server im Terminal aus; er steht auch in einer Datei unter `./data/geheim`.

Die [Konsole](https://help.ablago.app/benutzer/aktuell/begriffe/#konsole) (`dms` im Container) gibt es auch lokal: Nach `npm run build -w server` zeigt `node server/dist/dms.js` die Befehle. Sie spricht mit dem laufenden Server.

Alles zusammen als Container: `docker compose up --build`, dann http://localhost:8080.

### Zwei Images aus einem Dockerfile

Das `Dockerfile` hat zwei Ziele (#208):

| Ziel | Image | Inhalt |
| --- | --- | --- |
| `dms` (Standard) | `ghcr.io/motom001/dms` | nur Ablago; PostgreSQL läuft daneben (empfohlen) |
| `komplett` | `ghcr.io/motom001/dms-komplett` | Ablago und PostgreSQL 17 in einem Container, Start über `deploy/komplett/start.sh` (tini) |

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
| `TEST_DATABASE_URL=postgres://… npm test` | zusätzlich die Tests gegen PostgreSQL – jede Testdatei legt daneben ihre eigene Datenbank an (siehe unten); die Rolle braucht das Recht, Datenbanken anzulegen |
| `npm run typecheck` | TypeScript für `shared`, `server` und `web` |
| `npm run lint`, `npm run lint:abh` | ESLint und Abhängigkeiten prüfen – siehe [Stil und Abhängigkeiten](stil.md) |
| `npm run build` | Oberfläche und Server bauen wie im Image |

Die CI auf GitHub führt all das aus, dazu die [Rauchtests der Oberfläche](#rauchtests-der-oberflache), baut beide Images (`dms`, `dms-komplett`) für amd64 und arm64, nimmt die Screenshots der Handbücher auf und prüft die Oberfläche in iPhone-Größe.

### Tests mit PostgreSQL: eigene Datenbank

`npm test` startet alle Testdateien gleichzeitig. Teilten sie sich die Datenbank aus `TEST_DATABASE_URL`, könnte eine Datei der anderen die Tabellen wegnehmen – rote Läufe ohne echten Fehler. Darum legt jede Testdatei mit PostgreSQL ihre **eigene Datenbank** an, über den Helfer `server/test/hilfe-db.ts`:

```ts
import { eigeneDatenbank } from './hilfe-db';

const db = await eigeneDatenbank('meine_datei');            // dms_test_meine_datei_<pid>_<n>, migriert
const leer = await eigeneDatenbank('alt', { migrieren: false }); // leer, z. B. für den Stand vor einer Migration
// db.sql (höchstens 4 Verbindungen), db.url, db.ende()
```

Die Datenbank entsteht neben der aus `TEST_DATABASE_URL` und wird mit `ende()` gelöscht, spätestens nach dem letzten Test der Datei von selbst. Auf der gemeinsamen Datenbank selbst schreibt kein Test; `test/eigene-datenbank.test.ts` lässt die CI scheitern, sobald eine Testdatei wieder ein Schema leert. Die Pools bleiben klein, damit viele Dateien gleichzeitig unter `max_connections` (Vorgabe 100) bleiben.

### Quarantäne für wackelnde Tests

Ein Test, der ohne Änderung mal rot, mal grün ist, kommt mit Issue und Fälligkeit in `server/test/quarantaene.json`:

```json
{ "name": "Name wie in it(…)", "datei": "beispiel.test.ts", "issue": 900, "faellig": "2026-12-06", "grund": "warum er wackelt" }
```

Er läuft weiter, bricht die CI aber nicht ab; sein Ergebnis (bestanden, fehlgeschlagen, nicht gefunden) steht in der Zusammenfassung des Laufs. Ein Name kann auch ein ganzer Abschnitt (`describe`) sein. Ist die Fälligkeit überschritten, scheitert die CI – dann den Test beheben und den Eintrag entfernen oder die Fälligkeit bewusst verlängern (höchstens 90 Tage). Ausgewertet wird das TAP-Protokoll mit `node --import tsx server/test/quarantaene.ts test.log <Exit-Code>`. Vor der Quarantäne lohnt der Blick auf die Ursache: Meist ist es eine feste Wartezeit, wo der Test auf ein Ereignis warten sollte.

### Rauchtests der Oberfläche

Die Rauchtests in `web/rauchtest/rauchtest.mjs` gehen die wichtigsten Wege einmal im Browser (Chromium mit Playwright): Einrichtung im Assistenten, Anmelden und Startseite, „Dokument übernehmen“ (Neue Post öffnen, Mappentyp wählen, Werte vom Dokument übernehmen; am Ende Folgedokument abtrennen und Post in eine neue bzw. vorhandene Mappe auflösen), „+ Neu“, Mappe ändern und speichern, Suche, Verwaltungsmodus mit Werkbank → Pakete, Mappentyp bearbeiten, Rundgang und „Ablago entdecken“ für ein neues Konto, Abmelden – und drei Wege in Handy-Größe. Jeder Test prüft das sichtbare Ergebnis und dass es dabei keine Fehler in der Konsole, keine fehlgeschlagene Anfrage und keine Antwort ab 400 gab (außer den erwarteten). Sie laufen im Job `pruefen` nach dem Bauen und dauern zusammen unter einer Minute.

Lokal brauchen sie ein frisch gebautes Ablago **ohne** Datenbank-Anbindung, eine eigene Datenwurzel und ein PostgreSQL, in dem die Rolle Datenbanken anlegen darf – der erste Test geht den Assistenten durch und legt die Datenbank selbst an:

```bash
npm run build
DMS_DATENWURZEL=/tmp/rauchtest PORT=3000 node server/dist/index.js &
cd web/rauchtest && npm install --no-save playwright@1.64.1 && npx playwright install chromium && cd ../..
DMS_URL=http://localhost:3000 DMS_DATENWURZEL=/tmp/rauchtest DB_HOST=localhost DB_PASSWORT=dms node web/rauchtest/rauchtest.mjs
```

Für einen zweiten Lauf Ablago beenden, die Datenwurzel und die Datenbank `dms_rauchtest` löschen (oder `DB_NAME` ändern). Bei einem Fehler liegt ein Bild der Seite in `rauchtest-fehler/` (in der CI als Artefakt `rauchtest-fehler`).

**Wann ein Rauchtest dazukommt:** Ein neuer Ablauf in der Oberfläche – eine neue Seite, ein neuer Weg zu einem Ergebnis – bekommt seinen Rauchtest im selben PR; ebenso ein Weg, der bei einem Umbau leicht unbemerkt kaputtgeht. Ein Ziel für die Abdeckung gibt es nicht, Einzelheiten prüfen die Tests des Servers. So sieht ein Test aus:

```js
rauchtest('Favorit merken', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  // … klicken und ausfüllen wie eine Person: getByRole, getByLabel, sichtbare Texte
  await s.getByRole('button', { name: 'Aus den Favoriten entfernen' }).waitFor(); // sichtbares Ergebnis
});
```

Die Tests suchen die deutschen Texte der Oberfläche. `{ handy: true }` öffnet den Test in Handy-Größe, `erwartet: [{ status: 404, pfad: /…/ }]` erlaubt Antworten, die zu diesem Weg gehören. Gewartet wird immer auf ein Element oder Ereignis, nie eine feste Zeit – sonst wackelt der Test. Daten, die mehrere Tests brauchen, legt `vorbereiten()` über die Schnittstelle an.

## Handbücher

```sh
pip install -r docs/handbuch/requirements.txt   # dieselben Versionen wie CI und Image
mkdocs serve -f docs/handbuch/benutzer/mkdocs.yml
```

Die Bilder (`bilder/*.png`) entstehen in der CI mit `docs/handbuch/screenshots/aufnehmen.mjs` und liegen nicht im Repository. Lokal fehlen sie deshalb; die Warnungen dazu kannst du ignorieren.

### Offline-Hilfe im Image

Das Dockerfile baut im Abschnitt `hilfe` alle vier Handbücher und die Startseite mit `docs/handbuch/werkzeuge/offline.py` und legt sie nach `web/dist/hilfe`; der Server liefert sie unter `/hilfe/` aus. Je Handbuch gibt es dafür `mkdocs.offline.yml` (erbt von `mkdocs.yml`) mit dem Hook `werkzeuge/offline_hook.py`:

- Bildschirmfotos (`bilder/…`) werden zu einem Hinweis mit Link auf dieselbe Seite online (`/dms/<handbuch>/vX.Y/…`).
- Verweise `https://help.ablago.app/<handbuch>/aktuell/…` zeigen auf `/hilfe/<handbuch>/…`; Vorlagen bleiben online, `api/openapi.json` zeigt auf die eigene Installation.
- Keine Versionsauswahl, keine Schriften aus dem Internet, keine Quellkarten.
- Englisch (#730): `mkdocs.en.offline.yml` baut die englische Fassung aus `docs-en/` nach `/hilfe/<handbuch>/en/`, mit englischer Suche. Fehlende englische Seiten und Bilder kommen über `werkzeuge/sprache_hook.py` aus dem deutschen Ordner.

Lokal: `python3 docs/handbuch/werkzeuge/offline.py /tmp/hilfe`. Das Skript prüft am Ende, dass jeder Verweis auf `/hilfe/…` eine Seite trifft; die CI prüft zusätzlich alle Ziele der kontextbezogenen Hilfe. Ohne gebaute Handbücher (`npm run dev`) leitet der Server `/hilfe/…` auf die Online-Fassung der Version um.
