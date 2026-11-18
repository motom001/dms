# Architecture {#aufbau}

This page is the **map** of Ablago: what lives where, which way a request takes and who may call whom. The details are on pages of their own, linked below. Why something is built the way it is can be found under [decisions](entscheidungen/index.md).

New here? Then start with [Getting started](loslegen.md) (start and check the project), then this page. If you are adding something new, the steps are under [Adding something new](checklisten.md).

## At a glance { #auf-einen-blick }

```
server/           Fastify API, PostgreSQL (postgres.js), SQL migrations (server/migrations/), tests (server/test/)
web/              React interface (Vite), tests (web/test/), smoke tests in the browser (web/rauchtest/)
shared/           domain model, validation rules, texts (src/sprachen/), tours and anchors (entdecken/) – used by server and interface
deploy/           Compose templates for NAS and server, start script and test for dms-komplett
docs/             manuals (MkDocs), screenshot scripts, release notes (releases/, snippets in releases/neu/), measurements (messungen/)
docs/glossar.yml  glossary – the one source for all terms (the page "Terms" is made from it)
.github/          workflows (check, images, release, manual …), check scripts (werkzeuge/), templates for issues and PRs
```

Ablago is a **modular monolith**: one program, one database. Server and interface are together in one image – as `dms` or, with PostgreSQL in the same container, as `dms-komplett`. If needed, several processes of the same program run ([several processes](server.md#mehrere-prozesse)). Server, interface and shared code are TypeScript; identifiers are German ([style](beitrag.md#stil)).

## The way of a request { #weg-einer-anfrage }

Using "change a folder and save" as the example – almost every request looks like this:

| Step | Where | What happens |
| --- | --- | --- |
| 1. Interface | `web/src/ablage/mappe-formular/…` → `mappenApi.mappeAendern` in `web/src/api/mappen.ts` | The form only sends the changed fields and the state at loading time. |
| 2. Request | `anfrage()` in `web/src/api/anfrage.ts` | `PUT /api/mappen/:id`, with language and error handling (`ApiFehler`). |
| 3. HTTP | `server/src/http/http.ts`, `pruefeZugang` in `http/routen.ts` | Fastify finds the route, checks sign-in and `zugang` (`offen`, `angemeldet`, `admin`). |
| 4. Route | `server/src/mappen/mappen.routen.ts` | The handler gets the person's access (`zg(a)`) and calls the subject service. No business logic here. |
| 5. Subject service | `dienst.mappen.aendereMappe` in `server/src/mappen/mappen.dienst.ts` | Checks permissions (via [checking permissions](fachbereiche.md#zugriff)) and values, all in one transaction of the core. |
| 6. Core | `server/src/kern/` | Transaction, history, event into the outbox (`kern.ereignis`), immediate receivers (`kern.anlaesse.mappeGeaendert`). |
| 7. Repo | `kern.repo.aendereMappe` → `server/src/repo/pg/mappen.ts` | SQL against PostgreSQL. In tests the same interface in memory (`repo/speicher/`). |
| 8. Afterwards | event distributor, automations, packages | Whatever may happen later runs from the outbox ([events](ereignisse.md#ereigniskatalog)). |

Texts for people come from the [language files](texte.md#texte-und-sprachdateien) on every step (`t('…')`), never as words in the code.

## Server: `server/src` { #server }

Every file lives in a folder. Directly in `server/src/` there are only the entry points `index.ts`, `ablago.ts`, `vorstart.ts`, `dms.ts` (console) and `pakete-pruefen.ts`.

| Kind | Folders |
| --- | --- |
| Assembly | `dienst/` – puts the subject folders together; routes call the subject services in its fields (`dienst.mappen`, `dienst.ausgang` …) |
| HTTP | `http/` – Fastify, list of routes (`BEREICHE` in `routen.ts`), helpers only for routes, public API `/api/v1` (`api-v1/`) |
| Core and permissions | `kern/` (layer 0), `zugriff/` (layer 1) |
| Subject folders | with `*.dienst.ts`, `index.ts` as door and `README.md`: `mappentypen/`, `mappen/`, `dokumente/`, `berechtigungen/`, `ereignisse/` (layer 2); `suche/`, `sichten/`, `volltext/`, `post/`, `ausgang/`, `pdf-bearbeiten/`, `aufgaben/`, `loeschen/`, `datenschutz/`, `werkbank/`, `fassungen/`, `organisation/`, `notfallkontakte/`, `paketaktionen/`, `textsatz/` (layer 3) |
| Further areas with routes | `anmeldung/`, `konten/`, `pakete/`, `paketdaten/`, `automatisierung/`, `sicherung/`, `system/`, `wartung/` |
| Data | `repo/` (interface, `pg/`, `speicher/`), `datenbank/` (connection, migrations, database connection settings) |
| Technology | `pdf/` ([PDF place](pdf.md#pdf-stelle)), `arbeit/` ([worker pool](server.md#arbeiter-pool)), `laeufer/` (package runner), `dateien/`, `formate/`, `export/`, `mail/`, `erkennung/`, `webdav/` |
| Operation | `start/`, `prozesse/`, `zeitplan/`, `zwischenspeicher/`, `protokoll/`, `einstellungen/`, `geheimnisse/`, `sprache/`, `grundlagen/`, `lasttest/` |
| Other | `einrichtung/`, `notfall/`, `oberflaeche/`, `entdecken/`, `beispiele/`, `demo/`, `systemausstattung/` |

More: [Server: folders and patterns](server.md) (repos twice, routes, migrations, start, uploads, short-term state, several processes) and [Subject areas of the server](fachbereiche.md) (per subject folder: classes, door, what it gets).

## Layers { #schichten }

Subject folders only call downwards; within the same layer they may use each other (`kein-kreislauf` forbids cycles). The list is kept in one place in `.dependency-cruiser.cjs` (`SCHICHTEN`) – a folder that does not exist yet is already placed:

| Layer | Subject folders |
|---|---|
| 0 | `kern/` – only itself, `shared/` and the base |
| 1 | `zugriff/` |
| 2 | `mappentypen/`, `mappen/`, `dokumente/`, `berechtigungen/`, `ereignisse/` (#1078) |
| 3 | all other subject folders (`suche/`, `sichten/`, `volltext/`, `post/`, `ausgang/`, `pdf-bearbeiten/`, `aufgaben/`, `loeschen/`, `datenschutz/`, `werkbank/` …) |

Without business logic and outside the layers (`TECHNIK`): `http/`, `pdf/`, `arbeit/`, `laeufer/`, `start/` and the repo `repo/` (#1278) – it belongs to the base that every layer may import (`BASIS_ORDNER`). Subject folders from layer 1 up may import, besides the core and the base, the tools named in `.dependency-cruiser.cjs` (`WERKZEUGE`: for example `messung.ts`, the file technology, page images, redaction, export, `pdf/` and `arbeit/`), never `dienst.ts`. Routes (`*.routen.ts`) belong to the HTTP layer: they may import the service and their own subject folder; `routen.ts` fetches them directly. All rules with examples of how to break a cycle: [Dependencies between the parts](stil.md#abhaengigkeiten-pruefen).

## Interface: `web/src` { #oberflaeche }

The interface has no third-party router: `ort.tsx` keeps the path as state, `App.tsx` picks the area by the first part of the path.

| Folder or file | What |
| --- | --- |
| `main.tsx`, `App.tsx`, `ort.tsx` | start (load the language first), header and areas, small router with protection against unsaved changes |
| `ablage/` | the library: start page, lists, folder (`mappe-formular/`), documents and page viewer, taking over post, tasks, search |
| `werkbank/` | the workbench: frame and sidebar (`rahmen/`, table of pages in `rahmen/seiten.ts`), one page or subfolder per area |
| `profil/` | My account |
| `einrichtung/` | the folder type editor (Workbench → Folder types) |
| `einrichtung.tsx`, `assistent/` | setup wizard on first start |
| `begleiter/` | the assistant at the edge: questions, tips, manual |
| `entdecken/` | tours and "Discover Ablago" ([tours and tips](entdecken.md)) |
| `bausteine/` | building blocks such as `Knopf`, `Feld`, `Etikett`, `Reiter`, `Aufklapper`, `Zahl`, `Kachel` – import only via `bausteine/index.ts` ([design and building blocks](bausteine.md)) |
| `api/` | requests to the server, one module per subject area |
| `stile/`, `tokens.css` | styles: entry point, shared classes, colours and layers |
| `sprache.ts` | `t()` and `tn()` for texts from `shared/src/sprachen/` |

The interface is split into small files by area – you read and change only the place that matters, and parallel work collides less often. A file has at most 700 lines, a function in `*.tsx` at most 260 (ESLint, without blank lines and comments), a CSS file at most 400 (`npm run lint:farben`).

| What | Where | Note |
|---|---|---|
| Styles | `web/src/stile/`, per area `web/src/<area>/<area>*.css` | `stile/index.css` is the entry point and the only stylesheet that `main.tsx` includes. It loads `tokens.css` (colours, layers `--ebene-…`), `basis.css` (elements without a class), the shared classes (`stile/gemeinsam-*.css`, `stile/bausteine.css`, `stile/rahmen.css`), the files of the areas (`ablage/ablage-*.css`, `werkbank/werkbank*.css`, `einrichtung/einrichtung.css` …) and finally `startbild.css`. Every class sits at the top level in exactly one file, that of its owner (#1270): if only one area sets it, in its file; if several set it, in `stile/gemeinsam-*.css`; if it belongs to a building block, in its module. The order is fixed: with equal specificity the later rule wins. `npm run lint:klassen` checks duplicate and unused classes and `z-index`, `npm run lint:farben` colours and lines per CSS file ([style](stil.md#klassen)). |
| Web API | `web/src/api/` | `anfrage.ts` is the core (request with error handling, `ApiFehler`, setup code, confirmation in administration mode, loading and sending files). One module per subject area with one object and its types, modelled on the server's subject folders: `konto.ts` (`kontoApi`), `einrichtung.ts`, `betrieb.ts`, `mappen.ts`, `dokumente.ts`, `fassungen.ts`, `aufgaben.ts`, `pakete.ts`, `automatisierung.ts`, `rundgaenge.ts`, `suche.ts`, `eingaenge.ts`, `datenschutz.ts`, `werkbank.ts`. Callers import directly from the subject module (`import { mappenApi, type Seite } from '../api/mappen'`); there is deliberately no collective file. |
| Smoke tests | `web/rauchtest/` | `rauchtest.mjs` starts everything in a fixed order, `einrichtung.mjs` first walks through the wizard and creates the data, `hilfen.mjs` holds the frame `rauchtest(…)`, signing in, the button guard and administration mode, `muster.mjs` axe, touch targets and waiting for a calm page, `pdf.mjs` sample PDFs. The tests are per area under `bereiche/` – see [Getting started](loslegen.md#rauchtests-der-oberflache). Under `messen/` is the interface measurement (#1276, [performance](leistung.md#oberflaeche-messen)), its results under `docs/messungen/oberflaeche/`. |

In CI the smoke tests run one after another in a single job: all areas share one Ablago including its database, and some restart Ablago. Running in parallel would need a separate Ablago with its own setup for every part.

## Shared: `shared` { #gemeinsam }

What server and interface must compute the same way is written once in `shared/src/` – so the interface checks up front with the same rules the server applies when saving. `shared/` imports neither `server/` nor `web/`.

| Folder or file | What |
| --- | --- |
| `model/`, `sichten/`, `erkennung/`, `pakete/` | domain model (field, folder type, folder, validation rules), conditions and views, recognition, packages – import only via their `index.ts` |
| `sprachen/de/`, `sprachen/en/` | all texts; large areas (`werkbank/`, `meldungen/`) as folders with `index.ts` ([texts and language files](texte.md#texte-und-sprachdateien)) |
| `sprache.ts`, `texte.ts`, `region.ts` | translator, placeholders, plurals; remembered formats for dates and numbers |
| `werkbankansicht.ts` | the list of workbench pages (`EINTRAEGE`), levels, phone focus (`HANDY_SCHWERPUNKT`, `HANDY_BEQUEMER`) |
| `hilfe.ts` | where every ? symbol points in the manual (`HILFE`); CI checks that every target exists |
| `ereignisse.ts`, `automatisierung*.ts` | event catalogue and model of the automations |
| `shared/entdecken/` | tours, tips and the fixed anchor points (`anker.yaml`) of the interface |
| other files | one topic each, mostly named after the function (`heimnetz.ts`, `fristen.ts`, `loeschkonzept.ts` …) |

Tests live in `server/test/`, `web/test/` and `shared/test/` ([checking](loslegen.md#prufen)). Characterisation tests record what a part outputs today (`server/test/charakter/*.json`, for example the route table, the package preview `plane.json` and the anchors `anker.json`); if that changes on purpose, `CHARAKTER_SCHREIBEN=1` with the respective test rewrites them – then check the difference.

## Pages in detail { #seiten }

| Page | Content |
| --- | --- |
| [Server: folders and patterns](server.md) | all folders, patterns (repos, routes, migrations, start, uploads, home network, deadlocks), dms-komplett, worker pool, short-term state, several processes |
| [Subject areas of the server](fachbereiche.md) | core, system setup, hook points and every subject folder; tree via links, writing folders at the same time, system accounts, passkeys |
| [PDFs](pdf.md) | PDF place, fonts, tests with broken PDFs, limits, protected PDFs, display in the browser |
| [Texts and languages](texte.md) | language files, areas, placeholders, plurals, labels, documents for third parties |
| [Tours and tips](entdecken.md) | tours, tips, anchor points, also from packages |
| [Events and automations](ereignisse.md) | event catalogue, automations, automation templates |
| [Data to the outside](nach-draussen.md) | routes to the outside, counter endpoint, cards to the outside, triggering from outside |
| [Dependencies](abhaengigkeiten.md) | third-party code in the image and the rule for new dependencies |
| [Decisions](entscheidungen/index.md) | one page per decision, with reasons |

## Earlier sections of this page { #fruehere-abschnitte }

Until #1273 everything was on this one page. Old links with an anchor land here:

| Earlier | Now |
| --- | --- |
| <span id="abhaengigkeiten"></span>Dependencies | [Dependencies](abhaengigkeiten.md) |
| <span id="pdf-stelle"></span><span id="pdf-schriften"></span><span id="pdf-bibliotheken"></span><span id="pdf-entscheidung"></span>PDF place, fonts, assessment of the PDF libraries | [PDFs](pdf.md), [PDF library](entscheidungen/pdf-bibliothek.md) |
| <span id="texte-und-sprachdateien"></span><span id="unterlagen-fur-dritte"></span>Texts and language files | [Texts and languages](texte.md) |
| <span id="entdecken"></span><span id="paket-rundgaenge"></span><span id="paket-tipps"></span><span id="anker"></span>Tours, tips and anchor points | [Tours and tips](entdecken.md) |
| <span id="kurzzustand"></span><span id="mehrere-prozesse"></span><span id="arbeiter-pool"></span>Short-term state, several processes, worker pool | [Server: folders and patterns](server.md) |
| <span id="kern"></span><span id="werkbank"></span><span id="zugriff"></span>Core, subject areas, workbench | [Subject areas of the server](fachbereiche.md) |
| <span id="ereigniskatalog"></span><span id="automatisierungen"></span>Event catalogue, automations | [Events and automations](ereignisse.md) |
| <span id="wege-nach-draussen"></span><span id="zaehler-endpunkt"></span><span id="nach-aussen-melden"></span>Routes to the outside, counter endpoint | [Data to the outside](nach-draussen.md) |
| <span id="oberflaeche-dateien"></span>Interface: styles, web API and smoke tests | [above](#oberflaeche) |
