# Getting started {#loslegen}

## Prerequisites { #voraussetzungen }

- **Node.js 24** (LTS) and npm
- **Docker** (for PostgreSQL 17; or your own PostgreSQL installation)
- optionally **poppler-utils** for the text layer of PDFs, thumbnails and redacting (text recognition is a package, see [Packages with code](pakete-code.md#texterkennung))
- optionally **Python 3** with `mkdocs-material` for the manuals

## Fetching and starting the project { #projekt-holen-und-starten }

```sh
git clone https://github.com/motom001/dms.git && cd dms
npm install
docker compose up -d db         # only the database
DATABASE_URL=postgres://dms:dms@localhost:5432/dms npm run dev
```

`npm run dev` in the root folder starts server (port 3000) and interface together; the interface runs on http://localhost:5173 and forwards `/api` and `/hilfe` to the server. Individually it works with `npm run dev -w server` and `npm run dev -w web`.

Without Docker for Ablago itself, the server creates its fixed folders (`files`, `geheim`, `sicherung`) under `./data` in the project. `DMS_DATENWURZEL=/other/folder` moves them. At the first start with a working connection, the server takes over `DATABASE_URL` into the file `./data/geheim/datenbank.json`. Afterwards the file applies; the variable is no longer needed. For another database, delete the file or change it under **Workbench → Database connection**.

On the first visit, the setup assistant guides you through setup. The server prints the setup code in the terminal; it is also in a file under `./data/geheim`.

The [console](https://help.ablago.app/benutzer/aktuell/en/begriffe/#konsole) (`dms` in the container) also exists locally: after `npm run build -w server`, `node server/dist/dms.js` shows the commands. It talks to the running server.

Everything together as a container: `docker compose up --build`, then http://localhost:8080.

### Two images from one Dockerfile { #zwei-images-aus-einem-dockerfile }

The `Dockerfile` has two targets (#208):

| Target | Image | Content |
| --- | --- | --- |
| `dms` (default) | `ghcr.io/motom001/dms` | only Ablago; PostgreSQL runs next to it (recommended) |
| `komplett` | `ghcr.io/motom001/dms-komplett` | Ablago and PostgreSQL 17 in one container, started via `deploy/komplett/start.sh` (tini) |

```sh
docker build -t dms .                                  # slim
docker build --target komplett -t dms-komplett .       # with PostgreSQL
deploy/komplett-probe.sh dms-komplett                  # test as in CI: setup, restart, stop, crash, version check
deploy/vorlagen-probe.sh dms                           # NAS templates with the slim image
```

Apart from `deploy/komplett/start.sh`, `deploy/` is excluded from the Docker build (`.dockerignore`). CI builds both images for amd64 and arm64, with a test on every pull request; on `main` and every week (new Alpine packages) both are published.

## Checking { #prufen }

| Command | What |
| --- | --- |
| `npm test` | all server tests (Node test runner) |
| `npm run test:datei -w server -- test/<file>.test.ts` | a single test file; in the `server` folder equivalently `node --import tsx --import ./test/lader.mjs --test test/<file>.test.ts`. The loader `test/lader.mjs` lets tests load interface modules that import CSS (`*.css?raw`, `*.module.css`) – without it these tests fail with “Unknown file extension .css” |
| `TEST_DATABASE_URL=postgres://… npm test` | additionally the tests against PostgreSQL – every test file creates its own database next to it (see below); the role needs the right to create databases |
| `npm run typecheck` | TypeScript for `shared`, `server` and `web` |
| `npm run lint`, `npm run lint:abh` | check ESLint and dependencies – see [Style and dependencies](stil.md) |
| `npm run build` | build interface and server as in the image |

CI on GitHub runs all of this plus the [smoke tests of the interface](#rauchtests-der-oberflache), builds both images (`dms`, `dms-komplett`) for amd64 and arm64, records the manuals' screenshots and checks the interface at iPhone size.

### Tests with PostgreSQL: own database { #tests-mit-postgresql-eigene-datenbank }

`npm test` starts all test files at the same time. If they shared the database from `TEST_DATABASE_URL`, one file could take the tables away from another – red runs without a real fault. So every test file with PostgreSQL creates its **own database**, using the helper `server/test/hilfe-db.ts`:

```ts
import { eigeneDatenbank } from './hilfe-db';

const db = await eigeneDatenbank('my_file');                // dms_test_my_file_<pid>_<n>, migrated
const leer = await eigeneDatenbank('old', { migrieren: false }); // empty, e.g. for the state before a migration
// db.sql (at most 4 connections), db.url, db.ende()
```

The database is created next to the one from `TEST_DATABASE_URL` and dropped with `ende()`, at the latest after the file's last test. No test writes to the shared database itself; `test/eigene-datenbank.test.ts` fails CI as soon as a test file empties a schema again. Pools stay small so that many files at once stay below `max_connections` (default 100).

### Quarantine for flaky tests { #quarantane-fur-wackelnde-tests }

A test that is sometimes red and sometimes green without any change goes into `server/test/quarantaene.json` with an issue and a due date:

```json
{ "name": "Name as in it(…)", "datei": "example.test.ts", "issue": 900, "faellig": "2026-12-06", "grund": "why it is flaky" }
```

It keeps running but does not fail CI; its result (passed, failed, not found) appears in the run summary. A name can also be a whole section (`describe`). Once the due date has passed, CI fails – then fix the test and remove the entry, or extend the date deliberately (90 days at most). The TAP log is evaluated with `node --import tsx server/test/quarantaene.ts test.log <exit code>`. Before quarantining, look for the cause: usually it is a fixed wait where the test should wait for an event.

### Smoke tests of the interface { #rauchtests-der-oberflache }

The smoke tests in `web/rauchtest/rauchtest.mjs` walk through the most important paths once in the browser (Chromium with Playwright): setup in the wizard, signing in and the start page, “Take over document” (opening new post, choosing a folder type, taking values from the document; at the end splitting off a following document and turning post into a new or existing folder and just marking it as done), “+ New”, changing and saving a folder, search, admin mode with Workbench → Packages, editing a folder type, the tour and “Discover Ablago” for a new account, signing out – and three paths at phone size. Each test checks the visible result and that there were no errors in the console, no failed request and no response of 400 or above (apart from expected ones). They run in the `rauchtests` job after the build and take about a minute altogether.

**CI layout (#1056):** The server tests run in three parallel jobs `tests (1/3)` to `tests (3/3)` (`npm run test:teil -w server` with `TEST_TEIL=1/3` etc., `node --test --test-shard`), each with its own PostgreSQL. Alongside, `rauchtests` checks the release note, vulnerable dependencies, types, the build and the user interface. The small collecting job `pruefen` only turns green when all parts are green – it is the required check in the ruleset, and `version` and `image` wait for it. Locally `npm test` still runs all tests at once. In `image-probe` the trial installations (templates, dms-komplett, update from the previous state) run at the same time, each with its own log as a group in the run; the browsers for smoke tests and handbook screenshots come from the cache per Playwright version, system libraries only if a browser would not start otherwise (#1059).

Locally they need a freshly built Ablago **without** a database connection, its own data root and a PostgreSQL in which the role may create databases – the first test goes through the wizard and creates the database itself:

```bash
npm run build
DMS_DATENWURZEL=/tmp/rauchtest PORT=3000 node server/dist/index.js &
cd web/rauchtest && npm install --no-save playwright@1.64.1 && npx playwright install chromium && cd ../..
DMS_URL=http://localhost:3000 DMS_DATENWURZEL=/tmp/rauchtest DB_HOST=localhost DB_PASSWORT=dms node web/rauchtest/rauchtest.mjs
```

For a second run, stop Ablago and delete the data root and the database `dms_rauchtest` (or change `DB_NAME`). If a test fails, a picture of the page is in `rauchtest-fehler/` (in CI as the artefact `rauchtest-fehler`).

**When to add a smoke test:** a new flow in the interface – a new page, a new path to a result – gets its smoke test in the same PR; so does a path that easily breaks unnoticed during a rework. There is no coverage target; the server tests check the details. A test looks like this:

```js
rauchtest('Favorit merken', { als: LENA }, async (s) => {
  await s.goto(BASIS + '/ablage/start');
  // … click and fill in like a person would: getByRole, getByLabel, visible texts
  await s.getByRole('button', { name: 'Aus den Favoriten entfernen' }).waitFor(); // visible result
});
```

The tests search for the German texts of the interface. `{ handy: true }` opens the test at phone size, `erwartet: [{ status: 404, pfad: /…/ }]` allows responses that belong to this path. Always wait for an element or event, never a fixed time – otherwise the test becomes flaky. Data that several tests need is created by `vorbereiten()` through the API.

## Manuals { #handbucher }

```sh
pip install -r docs/handbuch/requirements.txt   # the same versions as CI and image
mkdocs serve -f docs/handbuch/benutzer/mkdocs.yml
mkdocs serve -f docs/handbuch/benutzer/mkdocs.en.yml   # the English version (#730)
```

The images (`bilder/*.png`) are created in CI with `docs/handbuch/screenshots/aufnehmen.mjs` and aren't in the repository. So they are missing locally; you can ignore the warnings about them. English screenshots go to `bilder/en/` (`DMS_SPRACHE=en`); until they exist, English pages show the German ones with a notice.

### Offline help in the image { #offline-hilfe-im-image }

In the section `hilfe`, the Dockerfile builds all four manuals and the start page with `docs/handbuch/werkzeuge/offline.py` and puts them into `web/dist/hilfe`; the server delivers them under `/hilfe/`. For this, every manual has `mkdocs.offline.yml` (inherits from `mkdocs.yml`) with the hook `werkzeuge/offline_hook.py`:

- Screenshots (`bilder/…`) become a notice with a link to the same page online (`/dms/<handbuch>/vX.Y/…`).
- Links `https://help.ablago.app/<handbuch>/aktuell/…` point to `/hilfe/<handbuch>/…`; templates stay online, `api/openapi.json` points to your own installation.
- No version selection, no fonts from the internet, no source maps.
- English (#730): `mkdocs.en.offline.yml` builds the English version from `docs-en/` into `/hilfe/<handbuch>/en/`, with English search. Missing English pages and images come from the German folder via `werkzeuge/sprache_hook.py`.

Locally: `python3 docs/handbuch/werkzeuge/offline.py /tmp/hilfe`. At the end the script checks that every link to `/hilfe/…` hits a page; CI additionally checks all targets of the context help. Without built manuals (`npm run dev`), the server redirects `/hilfe/…` to the online version of the release.
