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
| `npm test` | alle Tests (Node-Testrunner): Server (`server/test/`), Oberfläche (`web/test/`) und Gemeinsames samt Sprachdateien (`shared/test/`) |
| `npm test -w server`, `npm test -w web`, `npm test --prefix shared` | nur die Tests eines Teils (#1282); `shared` ist kein eigener Workspace, daher `--prefix` |
| `npm run test:datei -w server -- test/<datei>.test.ts` | eine einzelne Testdatei, ebenso mit `-w web` oder `--prefix shared`; im Ordner `web` gleichwertig `node --import tsx --import ./test/lader.mjs --test test/<datei>.test.ts`. Der Lader `web/test/lader.mjs` lässt Tests Module der Oberfläche laden, die CSS importieren (`*.css?raw`, `*.module.css`) – ohne ihn scheitern diese Tests mit „Unknown file extension .css“. Die Skripte des Servers laden `server/test/schnell.ts` (#1358): schnelle scrypt-Parameter, damit Tests mit Passwörtern nicht länger laufen; ohne ihn (etwa `node --import tsx --test …` direkt) gelten die Parameter des Betriebs – richtig, nur langsamer |
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

Die Rauchtests unter `web/rauchtest/` gehen die wichtigsten Wege einmal im Browser (Chromium mit Playwright): Einrichtung im Assistenten, Anmelden und Startseite, „Dokument übernehmen“ (Neue Post öffnen, Mappentyp wählen, Werte vom Dokument übernehmen; am Ende Folgedokument abtrennen, Post in eine neue bzw. vorhandene Mappe auflösen und nur erledigen), „+ Neu“, Mappe ändern und speichern, Suche, Verwaltungsmodus mit Werkbank → Pakete, Mappentyp bearbeiten, Rundgang und „Ablago entdecken“ für ein neues Konto, Abmelden – und drei Wege in Handy-Größe. Jeder Test prüft das sichtbare Ergebnis und dass es dabei keine Fehler in der Konsole, keine fehlgeschlagene Anfrage und keine Antwort ab 400 gab (außer den erwarteten). Sie laufen im Job `rauchtests` nach dem Bauen, nacheinander gegen ein Ablago, und dauern zusammen gut eine Viertelstunde (im November 2026 knapp 200 Tests). Beim Arbeiten an einer Stelle lohnt darum meist [ein Bereich allein](#ein-bereich-allein).

**Aufbau der CI (#1056):** Die Server-Tests laufen in drei parallelen Jobs `tests (1/3)` bis `tests (3/3)` (`npm run test:teil -w server` mit `TEST_TEIL=1/3` usw., `node --test --test-shard`), jeder mit eigener PostgreSQL. Parallel dazu prüft `rauchtests` Release-Notiz, Sicherheitslücken der Abhängigkeiten, Typen, Bau und Oberfläche. Der kleine Sammel-Job `pruefen` wird nur grün, wenn alle Teile grün sind – er ist die Pflichtprüfung im Ruleset, auf ihn warten `version` und `image`. Die Tests der Oberfläche (`npm test -w web`) und über Gemeinsames (`npm test --prefix shared`) laufen in `rauchtests` als eigene Schritte (#1282). Lokal läuft `npm test` wie bisher alle Tests. In `image-probe` laufen die Probe-Installationen (Vorlagen, dms-komplett, Update vom bisherigen Stand) gleichzeitig, je mit eigenem Protokoll als Gruppe im Lauf; die Browser für Rauchtests und Handbuchbilder kommen aus dem Zwischenspeicher je Playwright-Version, Systembibliotheken nur, wenn ein Browser sonst nicht startet (#1059).

Lokal brauchen sie ein frisch gebautes Ablago **ohne** Datenbank-Anbindung, eine eigene Datenwurzel und ein PostgreSQL, in dem die Rolle Datenbanken anlegen darf – der erste Test geht den Assistenten durch und legt die Datenbank selbst an:

```bash
VITE_MUSTER=1 npm run build                       # Testbau mit der Musterseite /muster
DMS_DATENWURZEL=/tmp/rauchtest DMS_PROZESSE=1 PORT=3000 node server/dist/index.js &
cd web/rauchtest && npm ci && npx playwright install chromium && cd ../..
DMS_URL=http://localhost:3000 DMS_DATENWURZEL=/tmp/rauchtest DB_HOST=localhost DB_PASSWORT=dms node web/rauchtest/rauchtest.mjs
```

Playwright steht mit fester Version in `web/rauchtest/package.json` und hat dort ein eigenes Lockfile (#1272) – `npm ci` in diesem Ordner, nicht im Wurzelordner. Es ist kein Workspace: So landet es weder im Abhängigkeitsbaum der App noch im Image. Die Werkzeuge der Handbuchbilder (`docs/handbuch/screenshots/`) nutzen dieselbe Installation über `web/rauchtest/playwright.mjs`. Neue Versionen bringt Dependabot. Startet Chromium unter Linux nicht, weil Systembibliotheken fehlen, holt `npx playwright install-deps chromium` (im Ordner `web/rauchtest`, mit Administratorrechten) sie nach – so macht es auch die CI. Ohne `VITE_MUSTER=1` fehlt die Musterseite, und die Tests, die sie öffnen (in `bausteine-und-knoepfe.mjs`), schlagen fehl. `DMS_PROZESSE=1` hält Ablago wie in der CI bei einem Prozess.

Für einen zweiten Lauf Ablago beenden, die Datenwurzel und die Datenbank `dms_rauchtest` löschen (oder `DB_NAME` ändern). Bei einem Fehler liegt ein Bild der Seite in `rauchtest-fehler/` (in der CI als Artefakt `rauchtest-fehler`).

<span id="ein-bereich-allein"></span>**Ein Bereich allein (#1234):** `web/rauchtest/rauchtest.mjs` startet nur die Einrichtung und danach die Bereiche unter `web/rauchtest/bereiche/` in fester Reihenfolge. Jeder Bereich bindet die Einrichtung selbst zuerst ein (Assistent und die Daten aus `vorbereiten()`) und läuft so auch allein gegen ein frisch gestartetes Ablago, z. B. `node web/rauchtest/bereiche/werkbank-post.mjs` mit denselben Variablen wie oben – das dauert Sekunden bis wenige Minuten statt einer Viertelstunde. Im Gesamtlauf teilen sich alle Bereiche ein Ablago: Ein Test verlässt sich deshalb nicht darauf, was ein anderer Bereich angelegt oder geändert hat; Daten, die er braucht, legt `vorbereiten()` an oder er selbst. Schlägt ein Bereich nur im Gesamtlauf fehl, hängt er am Zustand eines früheren – dann genau das beheben. Für einen weiteren Bereich danach Ablago neu starten, mit leerer Datenwurzel und ohne die Datenbank `dms_rauchtest`. Nicht `node --test` über den Ordner: Das startet die Dateien parallel gegen dasselbe Ablago.

<span id="zwei-prozesse"></span>**Mit zwei Prozessen (QS-Runde 11/2026):** `web/rauchtest/zwei-prozesse.mjs` ist eine schnelle Teilmenge (Einrichtung, Start und Suche, Werkbank, Post, Erwähnen; etwa eine Minute) für ein Ablago mit `DMS_PROZESSE=2`. Sie prüft zuerst, dass wirklich zwei Prozesse laufen; danach geht jede Anfrage reihum an einen davon, und was einer schreibt, muss der andere sehen. In der CI läuft sie im eigenen Job `rauchtests-zwei-prozesse` parallel zum vollen Lauf, der bei `DMS_PROZESSE=1` bleibt. Lokal: Ablago mit `DMS_PROZESSE=2` frisch starten, dann `node web/rauchtest/zwei-prozesse.mjs` mit denselben Variablen wie oben.

**Wann ein Rauchtest dazukommt:** Ein neuer Ablauf in der Oberfläche – eine neue Seite, ein neuer Weg zu einem Ergebnis – bekommt seinen Rauchtest im selben PR (in der Datei seines Bereichs unter `web/rauchtest/bereiche/`); ebenso ein Weg, der bei einem Umbau leicht unbemerkt kaputtgeht. Ein Ziel für die Abdeckung gibt es nicht, Einzelheiten prüfen die Tests des Servers. So sieht ein Test aus:

```js
rauchtest('Favorit merken', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  // … klicken und ausfüllen wie eine Person: getByRole, getByLabel, sichtbare Texte
  await s.getByRole('button', { name: 'Aus den Favoriten entfernen' }).waitFor(); // sichtbares Ergebnis
});
```

Die Tests suchen die deutschen Texte der Oberfläche. `{ handy: true }` öffnet den Test in Handy-Größe, `erwartet: [{ status: 404, pfad: /…/ }]` erlaubt Antworten, die zu diesem Weg gehören. Gewartet wird immer auf ein Element oder Ereignis, nie eine feste Zeit – sonst wackelt der Test. Daten, die mehrere Tests brauchen, legt `vorbereiten()` in `web/rauchtest/einrichtung.mjs` über die Schnittstelle an.

**axe und Tippflächen erst auf einer ruhigen Seite (#1266):** Die Prüfungen messen Farben und Lagen – was gerade noch überblendet oder nachrückt, misst falsch. Früher scheiterten so Läufe ohne echten Fehler (Kontrast 2,4:1 eines Knopfs mitten im Farbübergang nach dem Wechsel auf dunkel, eine Tippfläche „bewegt um 1 px“, weil der Systemzustand nachlud). Darum:

- `axePruefen` und `tippflaechenPruefen` (`web/rauchtest/muster.mjs`) warten selbst mit `seiteRuhig`: Maus weg (Hover ändert Farben), keine junge offene Anfrage (Anfragen, die schon 2 s offen sind, zählen nicht: dauerhafte Verbindungen und Enden, die Playwright nie meldet), Schriften geladen, keine endliche Animation und kein Übergang mehr (`document.getAnimations()`), Layout über zwei Animationsbilder gleich. Rückt die Seite während einer Tippflächen-Messung trotzdem, wird das Element nach erneuter Ruhe noch einmal gemessen.
- Hell/dunkel immer mit `schemaWechseln(s, 'dark')` aus `hilfen.mjs` umschalten, nie `emulateMedia` direkt, keine feste Wartezeit (`waitForTimeout`), kein Neuladen und kein `mouse.move(0, 0)` nur für axe.
- Offene Anfragen kennt `seiteRuhig` nur für Kontexte, die `anfragenZaehlen(kontext)` beobachtet – `rauchtest()` und `musterAufnehmen` tun das selbst; eigene Kontexte (z. B. in Bildskripten) rufen es nach `newContext` auf.
- Ein Ladekreis (Endlos-Animation) hält das Warten nicht auf; wird eine Seite in 3 s nicht ruhig, steht im Testprotokoll eine Zeile `# seiteRuhig: … nicht ruhig …` mit der offenen Bedingung, und es wird trotzdem gemessen.

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
