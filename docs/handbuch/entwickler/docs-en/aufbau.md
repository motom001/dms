# Architecture {#aufbau}

```
shared/           domain model, validation rules, help table – used by server and interface
server/           Fastify API, PostgreSQL (postgres.js), SQL migrations, tests
web/              React interface (Vite)
deploy/           Compose templates for NAS and server, start script and test for dms-komplett
docs/             manuals (MkDocs), screenshot script, release notes
docs/glossar.yml  glossary – the one source for all terms (the page "Terms" is made from it)
.github/          workflows (check, images, release, manual …), Dependabot, templates for issues and PRs
```

Ablago is a **modular monolith**: one process, one database. Server and interface are together in one image – as `dms` or, with PostgreSQL in the same container, as `dms-komplett`. The identifiers in the code are German. Important patterns:

- **Repos twice:** every data access interface exists for PostgreSQL (`repo-pg.ts`, `pg…` functions) and for memory (`repo-speicher.ts`, `speicher…`). Most tests run quickly in memory; the tests with `TEST_DATABASE_URL` cover PostgreSQL. New functions need both, and both must behave the same.
- **Routes** are kept per subject area in `server/src/<fach>/<fach>.routen.ts` (#960, e.g. `dokumente/dokumente.routen.ts`), each with `zugang: 'offen' | 'angemeldet' | 'admin'`. Each file exports functions `…Routen(k)` that receive the services and shared helpers via the parameter `k` (`http/routen-kontext.ts`; helpers without services in `http/routen-hilfen.ts`). `routen()` in `server/src/routen.ts` calls them in a fixed order (`BEREICHE`) and still holds the types (`Route`, `Anfrage`, `Antwort`), `pruefeZugang` and the check of package permissions; the test `routen-liste.test.ts` counts the routes and checks `zugang` and duplicates. **Routes without sign-in** (`zugang: 'offen'`) are also kept there in a fixed list (`OFFEN`, each with a reason, #1029): a new open route – or one that changes to `offen` – goes into this list on purpose and gets a one-sentence justification in the pull request; otherwise the test fails. The helpers in `http/routen-hilfen.ts` and `http/routen-kontext.ts` may only be imported by route files (`*.routen.ts`, `routen.ts`) (`npm run lint:abh`, rule `routen-hilfen-nur-in-routen`). Two features are added: `api: true` makes a route part of the public API (sign-in also with an API key); `konsole: true` only allows it via the command `dms` in the container. The public API for programs is under `/api/v1` (`api-v1.ts`, OpenAPI).

| Folder in `server/src/` | Routes for |
|---|---|
| `anmeldung/` | sign-in, two-factor, passkeys, password, setup, emergency access |
| `konten/` | users, roles, deputies, API keys |
| `mappentypen/` | folder types, their archive, permissions |
| `werkbank/` | Workbench overview, designs, region, languages, log, admin mode |
| `ausgang/` | export (Workbench and My account); since #1077 the [routes to the outside](#ausgang) |
| `datenschutz/` | data subject requests, deletion concept, retrieval page; since #1078 [data protection](#datenschutz) |
| `pakete/` | packages, catalogue, package settings |
| `suche/` | search, Ask your archive |
| `wartung/` | maintenance mode |
| `sicherung/` | backup, restore, emergency sheet, keys |
| `system/` | operation, system status, connection, sign-in protection, inbox folder, WebDAV, error reports |
| `post/` | mailboxes and other inbound channels; since #1077 [post](#post) |
| `automatisierung/` | automations |
| `sichten/` | views, folder lists, start page |
| `aufgaben/` | tasks; since #1078 the [tasks](#aufgaben) |
| `mappen/` | folders, history, recycle bin |
| `dokumente/` | documents, versions, contents |
| `textsatz/` | set text (#1040): templates of a folder, letter from template as PDF (`pdf/brief.ts`, tagged, in the worker) |
| `notfallkontakte/` | emergency contacts (#812): Workbench → Encryption, info email to trusted people (limits in the short-lived state), “Whom to ask?” on the emergency sheet |
| `paketaktionen/` | package actions in the “Folder” menu (#1039): offer per person, run with dialog and result, the package's restricted access, Workbench switches |

The folders are named after the service modules of the target structure; their `*.dienst.ts` files join them when each one moves – first `suche/suche.dienst.ts` ([search](#suche), #964). Every subject folder with a `*.dienst.ts` has an `index.ts` as its door and a hand-written `README.md` (20–40 lines); CI checks this in the **stil** job (`.github/werkzeuge/fachordner-pruefen.mjs`). Which folders may import what is set by the [layers](#schichten). `pakete/` also holds `pakete.einstellungen.ts` (#961): catalogue sources, package settings, package storage, drafts and conversions in the settings – from outside via `pakete/index.ts` (imported as `./pakete/index` next to `pakete.ts`).

Alongside, without routes:

| Folder in `server/src/` | Contents |
|---|---|
| `kern/` | the [core](#kern) (#961) |
| `zugriff/` | [checking permissions](#zugriff) (#1072) |
| `systemausstattung/` | the [system setup](#systemausstattung) (#963) |
| `http/` | helpers of the HTTP layer – for routes only (checked with `npm run lint:abh`) |
| `pdf-bearbeiten/` | [editing PDFs](#pdf-bearbeiten) (#1077): pages, shrinking, redacting, stamp templates |
| `pdf/`, `arbeit/` | [PDF module](#pdf-stelle), [worker pool](#arbeiter-pool) |
| `laeufer/` | package runner |
- **Workbench routes** (`zugang: 'admin'`, #818/#819) only work in **administration mode** (state of the session, `Konten.modusPruefen`) and only with permission for their area. Every new route needs an entry in `server/src/verwaltungsbereiche.ts` (`bereicheDerRoute`) – otherwise only people with "Full administration" may use it, and the test `verwaltungsmodus.test.ts` fails. Sensitive actions that require a fresh sign-in are listed there in `heikleHandlung`. `benutzer.rolle` is the request's **effective** role (`admin` only in the mode); the stored permission is in `benutzer.verwaltung` (`shared/src/verwaltungsrecht.ts`). API keys never get `admin`.
- **Public links without sign-in** so far only exist for an access copy's retrieval page (#455, `server/src/abruf.ts`, `web/src/abruf.tsx`): key only in the fragment (`/abruf#…`), in the database only hashes (SHA-256 for the key, scrypt for the code), failed attempts in sign-in protection per IP and on the link, download via a one-time ticket. Further sharing links should follow this pattern. In addition there is the **emergency access** `/notfall` (#815, `server/src/notfallcode.ts`, `web/src/notfall.tsx`): emergency code from the emergency sheet only as a scrypt hash (table `notfallcode`), redeemed in one transaction with the new password, default "home network only" with the real address behind a proxy (`istHeimnetz`), 30 s lock per address range, accounts only after the right code, notification before every change.
- **Migrations** are numbered SQL files in `server/migrations/`. They run at start-up in one transaction and are never changed afterwards, always supplemented by a new one.
- **Start** (#802, `server/src/startmodus.ts`): right after creating the folders, `ablago.ts` opens the port (with several processes only the leader at the first start, see [Several processes](#mehrere-prozesse)) with the page "Ablago is starting …". It knows no database, only the state in memory (`start.schritt('migration', { nr, von, datei })`, `start.menge(fertig, gesamt)`): pages of the interface show step and numbers (reloading via `meta refresh`, no script), `/api/*` and `/webdav` answer `503` with `Retry-After` and `startet: true` (the interface counts that as an outage and waits), `/api/gesundheit` reports `503` with `zustand: startet|fehler`. It only releases the port immediately before `app.listen` (and in between for setup mode). An error at start-up lands on the page via `uncaughtException` – only kind, step, migration file and SQLSTATE, never the message itself (it can contain values); after 5 minutes the process ends, except with the lock against a downgrade. New long preparations get a `Startschritt` of their own (text in `shared/src/sprachen/de/start.json`) or run in the background after the start, like the first deadline reconciliation.
- **Uploads as a stream** (#746, `server/src/hochladen.ts`): routes with `strom: true` (upload document, new version, also via `/api/v1`) are in a Fastify scope of their own whose parser writes the body into a temporary file under `files/hochladen/` (0600, checksum and header while reading); `body` is then a `Hochgeladen`. Via `Eingang.aus()` the service treats upload or buffer alike; filing happens by renaming (`Dateispeicher.uebernimm`). WebDAV PUT uses `nimmAuf` directly. Other uploads (logo, photo stack, packages) still read into memory because they need the whole content anyway.
- **Settings** are stored as JSON per key in the table `einstellungen`. `null` deletes an entry.
- **Recognising the home network** (#595): whether an address is in the home network is decided only by `shared/src/heimnetz.ts` (`imHeimnetz`, list `HEIMNETZ_ENDUNGEN` with `.local`, `.lan`, `.internal`, `.home.arpa`). Kind `ausnahme` (strict) allows `http://` without TLS – sign-in via a provider, endpoints of mailboxes with an own provider; kind `hinweis` (wider, e.g. also `.fritz.box`, 100.64/10) only serves suggestions such as "retrieval link or email", never a security exception. New places use this function instead of a list of their own. "Same computer" (only `localhost`) is a different question and stays at its places.
- **Help:** every ? symbol in the interface points to a place in the manual. The table for this is in `shared/src/hilfe.ts`, and CI checks that every anchor exists – since #730 in the German and the English manual. The functions take the person's language as an optional last parameter (`handbuchOnlineUrl(handbuch, seite, sprache?)`); without it, the interface's current language applies (`sprache()` from `shared/src/sprache.ts`).
- **Rows written by many and deadlocks** (#575): triggers that make many transactions write into the same rows (e.g. counters per word with `INSERT … ON CONFLICT DO UPDATE`) deadlock under load – every transaction locks its rows in a different order, PostgreSQL cancels one (deadlock). Pattern: the trigger only appends to an inbox without a unique key, a background run takes it over under a lock and in a fixed order (word index: `suchwoerter_eingang`, `dms_woerter_einarbeiten`, `SucheDienst.woerterEinarbeiten`, migration 052). What can still be cancelled and mustn't get lost runs via `beiVerklemmungWiederholen` (`server/src/db.ts`, repeats on 40P01/40001) – as a transaction of its own or `sql.begin` (inside a transaction a savepoint). Test: `server/test/verklemmung.test.ts`.
- **Backup and restore** back up all tables except the content of `sitzungen` and `schema_migrationen` (`OHNE_INHALT` in `server/src/datenbankabzug.ts`). A new table is automatically included. Data outside the database needs a thought: where is it, and does it come along?


## Core (#961) { #kern }

`server/src/kern/` holds what **all** subject areas need, with one door (`kern/index.ts`). The service builds it and passes it on as `dienst.kern`; building blocks such as packages will in future take only the core instead of the whole service.

- `kern.repo` – the repo; inside a transaction of the core, that transaction's repo. Fetch it on every call, never keep it – otherwise a package writes past the transaction.
- `kern.repoOhneTransaktion` – the repo outside any transaction (#1072, previously `grundRepo` via hooks). Only for what is valid across transactions and never belongs to a change: caches (the search's vectors), the event dispatcher, background follow-up work.
- `inTransaktion`, `inEinemZug` (retries on deadlock), `danach`, `nachDerAntwort`, `inEigenerTransaktion()`.
- `ereignis(art, daten, von?)` into the outbox, `mitAusloeser`, `ohneEreignisse`.
- `anlaesse` – the [hook points](#anschlusspunkte) for what happens immediately (#962, `kern/anlaesse.ts`).
- `system()` – **only looks up** the user, role and post folder types and the system roles (#963; if something is missing, the fallback creates the [system setup](#systemausstattung)), `typen()`, `zugriff(ich)`, `name(id)`, `papierkorbTage()`, `paketVerwehrt()`, `ablageortId()`, `liesGanz(sha)`.
- `historie.schreibe(…)` (`kern/historie.ts`) and `loeschprotokoll.schreibe(…)` (`kern/loeschprotokoll.ts`). **Reading** stays with folders and deletion respectively.
- `einstellungen`, `dateien`, `stand`.

**Rule:** only what everyone needs goes into the core – anything new only with a reason in the pull request. The core imports nothing from `dienst.ts`, routes or subject folders, only `shared/` and the base (repo, database, log, texts, settings, files, counters); `npm run lint:abh` checks this ([rules](stil.md#abhaengigkeiten-pruefen)). Since #1079 the service is only the assembly: routes, modules and tests call the subject services on its fields ([what stays](#dienst-rest)). What the core does not build itself (access – that is [checking permissions](#zugriff), one layer above –, the fallback of the system setup), it gets from the service when it is assembled.

### System setup (#963) { #systemausstattung }

`server/src/systemausstattung/` creates what every library needs: the system folder types “Role”, “User” and “Post” with their system fields and labels, the system roles and the views that ship with Ablago. It is a flow **above** the subject areas: `sicherstellen()` calls, one after the other, folder types (types and roles), views (own view of a type just created), post (the post views) and views (“Favourites”); it gets these steps from the service when it is assembled. Each step only creates what is missing.

- **At start-up** (`dienst.postSystemmappen.gleicheBenutzerAb`, leader only) and so after every restore, which restarts.
- **As a fallback**: if `kern.system()` does not find everything, it calls `systemausstattung.anlegen()` – for paths without a start (tests, restore, removing demo data). Concurrent calls share one run.
- Whoever only needs ids uses `kern.system()`; start-up calls `dienst.systemausstattung.sicherstellen()`. The core keeps the ids only if it looked them up outside a transaction.

### Hook points (#962) { #anschlusspunkte }

What belongs to a change **immediately** – in the same transaction, an error rolls everything back – runs through the typed hook points in `server/src/kern/anlaesse.ts`: `kern.anlaesse.mappeGeaendert`, `typGeaendert`, `typAngelegt`, `benutzerGespiegelt`. Whoever changes something calls `melde(…)`; what may happen **later** (at least once, with retries, errors only in the log) still goes into the outbox with `kern.ereignis(…)`.

- **Registered in one place:** `Dienst.schliesseEmpfaengerAn()` when assembling, in a fixed order; after that the list is closed. A different order is a pull request of its own (test `server/test/anlaesse.test.ts`).
- **One after the other:** the `EventEmitter` only serves as the list of receivers; `melde()` awaits each with `for … await`. `emit()` is forbidden and throws.
- **Only inside a transaction:** `melde()` throws outside `inTransaktion`/`inEinemZug`. A receiver may report another occasion (depth at most 2), never the one whose receiver is running.
- **Receivers** only do database work via `kern.repo` and `kern.danach(…)` – on a deadlock `inEinemZug` repeats the whole change including the receivers. No caches, mails or files directly.
- **Immediate** are only the receivers that were already called directly before. Anything new goes into the outbox.

Occasion → receivers (in order; subject area.task):

<!-- anlaesse:anfang (erzeugt von server/test/anlaesse.test.ts) -->
- `mappeGeaendert` → 1. `mappentypen.passung` 2. `aufgaben.erwaehnungen` 3. `aufgaben.fristen` 4. `post.aufgaben`
- `typGeaendert` → 1. `sichten.umbenennen` 2. `sichten.teile` 3. `mappen.titel` 4. `mappentypen.passung` 5. `aufgaben.fristen`
- `typAngelegt` → 1. `sichten.eigeneSicht`
- `benutzerGespiegelt` → 1. `aufgaben.abwesenheit`
<!-- anlaesse:ende -->

## Search (#964) { #suche }

The first subject area with its own business logic in its subject folder (trial run of the target structure): `server/src/suche/suche.dienst.ts` with the class `SucheDienst` – fuzzy search (typos, words with the same meaning, word index), vectors for documents and similar documents. The service builds it as `dienst.suche`; whoever searches calls it there (also `dienst.suche.vektorAnbieter`).

- **Door:** `suche/index.ts`; only `routen.ts` fetches the routes (`suche.routen.ts`) directly.
- **Gets the core**, not the whole service (`kern.repoOhneTransaktion` for the vector cache), plus [permission checking](#zugriff) (`lesbare`, `pruefeRecht`) and a `SucheAnschluss` with `konten` (service account of a package).
- **Downwards only:** search (layer 3) imports itself, lower subject folders and the core (each via `index.ts`), `shared/`, the base and `vektoren.ts` – checked with the rule `fachordner` ([rules](stil.md#abhaengigkeiten-pruefen)). `vektoren.ts` stays outside `suche/` because the package runner also reads a package's vectors with it.
- **Still in the service:** the search in the folder list (`listeMappen`). Since #1078 `vektorNachlauf` lives with the [events](#ereignisse).


## Checking permissions (#1072) { #zugriff }

`server/src/zugriff/zugriff.dienst.ts` with the class `ZugriffDienst` checks who may do what – in one place: `zugriff(ich)` once per request (people by the rules on the folder type, package service accounts by their confirmed permissions, system accounts by their role, read access for a limited time), `rechteAn`, `rechteAnVielen`, `pruefeRecht`, `lesbare`, `mitPasswortRecht`, `sichtbarFuer`, `kannLesen`, `wasSieht`, `mappeVon`. The service builds it as `dienst.rechtepruefung`; routes and modules call it there.

- **Door:** `zugriff/index.ts` (plus `maskiert` and `NICHT_SICHTBAR` for titles of folders the user cannot read).
- **Gets the core** and a `ZugriffAnschluss` from the service: `kiSperre` (AI setting of packages) and `konten`.
- **Layer 1:** imports only itself, the core, `shared/`, the base and `messung.ts`. Subject folders above get the `ZugriffDienst` when assembled (like search) and import it via `zugriff/index.ts`. The core does not import it; `kern.zugriff(ich)` calls what the service passes in.
- Since #1078 `regulaerSichtbarFuer` lives with the [tasks](#aufgaben) (`ohne-leserecht.ts`). Since #1076 the Workbench pages for permissions live in [permissions](#berechtigungen). Since #1073 `paketSiehtNicht` lives with the [folder types](#mappentypen) (`pakete-am-typ.ts`).

## Folder types (#1073) { #mappentypen }

`server/src/mappentypen/` (layer 2) gathers what makes up a folder type – one class per topic, each getting the core; the service builds them and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `mappentypen.dienst.ts` | `MappentypenDienst` (`dienst.mappentypen`) | `listeTypen`, `typenFuer`, `rechteUebersicht`, `legeTypAn`, `aendereTyp`, `loescheTyp`, `belegteTypen`, `ausDokumentVon`, `typErkennungen` |
| `eingabe.ts` | – | cleaning input: `bereinigeTyp`, `bereinigeFeld`, `behalte…`, `liesStand` |
| `passung.ts` | `Passung` (`dienst.passung`) | `pruefePassung`, `passungFuer`, `pruefeUnpassende`, `passungNachziehen` |
| `nummernkreise.ts` | `Nummernkreise` (`dienst.nummernkreise`) | number ranges (#171), `ARCHIV_KREIS` |
| `systemtypen.ts` | `Systemtypen` (`dienst.systemtypen`) | `sichereSystemtypen` (step of the [system setup](#systemausstattung)), `benutzerspiegel`, `weitereRollen`, `ablageortTyp`, trail in administration mode |
| `pakete-am-typ.ts` | `TypPakete` (`dienst.typpakete`) | `paketeAmTyp`, `setzePaketVerwehrt`, `paketSiehtNicht` |

- **Door:** `mappentypen/index.ts`; only `routen.ts` loads the routes (`mappentypen.routen.ts`) directly.
- **Gets the core**, `TypPakete` and `Systemtypen` also the [permission check](#zugriff), and per class a connector for what is still in the service (stamp, recognition and permissions on the type, tasks, titles, jobs, writing system folders).
- Since #1078 `ausPostZiele` (#937) lives in `mappentypen.dienst.ts`, the AI approval of folder types (#796) in `ki-typen.ts` (`KiTypen`, `dienst.ki`). Since #1077 the stamp on the type (`mitStempel`) is worked out by [outgoing](#ausgang), checking and saving it by the stamp templates in [editing PDFs](#pdf-bearbeiten) – both through the connector. Since #1076 `berechtigungenAusEingabe` lives in [permissions](#berechtigungen) and still comes through the connector. Since #1074 `titel` lives with the [folders](#mappen) (`titel.ts`).

## Folders (#1074) { #mappen }

`server/src/mappen/` (layer 2) gathers what makes up a single folder – one class per topic, each getting the core; the service builds them and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `mappen.dienst.ts` | `MappenDienst` (`dienst.mappen`) | `holeMappe`, `legeMappeAn`, `aendereMappe`, `verweisende`, `listeMappen`, `notizen`, `setzeFavorit`, `gesehen`, `persoenlicheEinstellungen` |
| `eingaben.ts` | `MappenEingaben` (`dienst.mappenEingaben`) | `pruefeWerte`, `unpassendeFormate`, selection filters, “follows from” (`folgen`, `folgeVorschlaege`), `rechteVorschau`, `feldkonflikte`; `bereinigeWerte` |
| `titel.ts` | `MappenTitel` (`dienst.mappenTitel`) | `aktualisiereTitel`, `titelVorab`, `titelNachziehen` and further maintenance at start-up, `absenderBereinigen` |
| `historie.ts` | `MappenHistorie` (`dienst.mappenHistorie`) | `historie`, `notiereAbruf`, `historieTage`; `notiere` writes via `kern.historie` |
| `passwortfelder.ts` | `Passwortfelder` (`dienst.passwortfelder`) | `zeigePasswort`, `entschluesselePasswoerter`, `unlesbarePasswoerter` |
| `archiv.ts` | `MappenArchiv` (`dienst.mappenArchiv`) | archive number (#345), archive mode (#212: `darfWeg`, `archivVorschau`), `pruefeDateien` |

- **Door:** `mappen/index.ts`; only `routen.ts` loads the routes (`mappen.routen.ts`) directly. The input helpers for folder types stay in `mappentypen/eingabe.ts`.
- **Gets the core**, `MappenDienst`, `MappenEingaben` and `MappenArchiv` also the [permission check](#zugriff), and per class a connector for what is still in the service or comes through it (accounts, tasks without read permission, archive version and PDF protection from the [documents](#dokumente), data protection, `loeschPruefung`, `meldeVerknuepft`, key, labels, jobs).
- **Immediate work:** `legeMappeAn` and `aendereMappe` report `kern.anlaesse.mappeGeaendert` at the end of their transaction – the [hook points](#anschlusspunkte) and their order are unchanged.
- Since #1078 writing notes lives in `notizen.ts` (`MappenNotizen`, `dienst.mappenNotizen`; mentions and translations through the connector). Deleting and the Bin live in [deleting](#loeschen), tasks and deadlines in [tasks](#aufgaben), `meldeVerknuepft` with the [events](#ereignisse) – all still through the connector.

## Documents (#1075) { #dokumente }

`server/src/dokumente/` (layer 2) gathers everything about the files in a folder – one class per topic, each getting the core; the service builds them (`baueDokumente()`) and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `dokumente.dienst.ts` | `DokumenteDienst` (`dienst.dokumente`) | `ladeHoch`, `loescheDokument`, `holeDokument`, `dokumentInhalt`, `textAusDatei`, connecting text recognition and previews, `neueDateien`, `raeumeAuf`; `dateiname`, `erkenneAnzeigbar` |
| `versionen.ts` | `DokumentVersionen` (`dienst.dokumentVersionen`) | `ersetzeDokument`, `holeVersionZurueck`, `nachNeuerVersion`, `versionen`, `versionInhalt`, `beruehre` |
| `umwandeln.ts` | `DokumentUmwandlung` (`dienst.dokumentUmwandlung`) | converting files (#577): `nachFassung`, `umwandelPaketDa`, `setzeFassung`, `fassungVon`, `umwandlungStand` |
| `archivfassung.ts` | `DokumentArchivfassung` (`dienst.dokumentArchiv`) | archive version (#631): `archivNachVolltext`, `archivPaketDa`, `setzeArchivfassung`, `wortpositionen`, `archivStand` |
| `geschuetzte-pdf.ts` | `GeschuetztePdfs` (`dienst.geschuetztePdfs`) | protected PDFs (#827): `entsperreDokument`, `nachEntsperren`, `mitPdfSchutz` |
| `fehlende-dateien.ts` | `FehlendeDateien` (`dienst.dateienFehlen`) | missing files (#877): `merkeFehlendeDatei`, `fehlendeDateien`, `dokumenteOhneDatei`, `pruefeVorhanden` |

- **Door:** `dokumente/index.ts`; only `routen.ts` loads the routes (`dokumente.routen.ts`) directly. The technology of the versions (`dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`) stays outside and is a tool for subject folders (see [layers](#schichten)).
- **Gets the core** and the classes of this folder it calls, and per class a connector for what is still in the service or would run in a circle (event and titles – `kern.ereignis`, `mappenTitel` –, archive mode, shrinking, full text, jobs for packages, package settings, folder types, text recognition).
- **Order:** `ladeHoch` writes history, “last changed”, document, full text and `dokument.hochgeladen` in one transaction; preview, converting and unlocking run afterwards. `nachFassung`, `nachEntsperren`, `archivNachVolltext` and `nachNeuerVersion` are unchanged and called from the same places.
- Since #1078 `entsperrtZu` lives in `geschuetzte-pdf.ts`. Since #1077 editing PDFs, shrinking and redacting live in [editing PDFs](#pdf-bearbeiten). Since #1076 the documents call the [full text](#volltext) (`volltextFertig`, `volltextAn`) through their connector on the service.

## Views (#1076) { #sichten }

`server/src/sichten/` (layer 3) gathers the views of the Library – one class per topic, each getting the core; the service builds them (`baueSichtenUndVolltext()`) and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `sichten.dienst.ts` | `SichtenDienst` (`dienst.sichten`) | `seite`, `trefferIds`, `zaehler`, `zaehlerRahmen`, `zaehlerAbruf` (#625), `ablageStand` (#919), `beiAenderung`, `aktualisiereStatistik`; the caches of the counts, `sortierungAus` |
| `verwalten.ts` | `SichtenVerwaltung` (`dienst.sichtenVerwaltung`) | `listeSichten`, `verborgeneSichten` (#148), `sichtTestlauf`, create, change (#917), delete, order, move, `sichtVorschau`, `sichtFuerTyp`, `belegung` |
| `systemsichten.ts` | `Systemsichten` (`dienst.systemsichten`) | creating and looking up “New post”, “Received”, “Sent” (#192) and “Favourites” (#725) |

- **Door:** `sichten/index.ts`; only `routen.ts` loads the routes (`sichten.routen.ts`) directly.
- **Gets the core**, `SichtenDienst` also the [permission check](#zugriff), the [folders](#mappen) and the [search](#suche), and a connector for what is still in the service (validity of the counts – `mindestensMs` stays on the service –, tasks without recipient and without read permission, dates, accounts).
- **Counts:** the caches hang on the same states as before (folder state or household state, #742, #918); the caches of the dates stay with the tasks in the service.
- **Immediate:** the service still registers the receivers `sichten.umbenennen` and `sichten.eigeneSicht` at the [connection points](#anschlusspunkte), in unchanged order; `sichten.teile` (#1031) takes a type out of the views when "Is part of another folder" is switched on and gives it its view back when it is switched off.
- **Parts (#1031, `shared/src/teile.ts`):** `klauselnFuer` leaves out part types – so they are missing from every view and its counts; the advanced search likewise. With a search, `SichtenDienst.seite` first searches the part types (same term, same variants, **same read filter**, at most `TEIL_TREFFER_MAX`) and hands the parent folders to the repo as `auchIds`: they count as hits there, while type, conditions and read filter still apply. The hit is in `ausschnitte[id].teil`.

## Permissions (#1076) { #berechtigungen }

`server/src/berechtigungen/berechtigungen.dienst.ts` with the class `BerechtigungenDienst` (`dienst.berechtigungen`) is the Workbench page for permissions (#123–#127): `berechtigungenListe`, `niemandLesbar`, `setzeBerechtigungen` (with `pruefeBerechtigungen` and `protokolliereBerechtigungen`), `berechtigungenAusEingabe` (#142), `kopiereRegel`, `testlauf` (#125, #710, #798) and `laufwerkMappe` (#346). What someone may do is still worked out by the [permission check](#zugriff).

- **Door:** `berechtigungen/index.ts`; there are no own routes.
- **Gets the core**, the permission check and a connector with the accounts.
- **Layer 2:** needs only the core and the permission check; the [folder types](#mappentypen) (also layer 2) check the rules with it when a type is saved – today still through their connector on the service.

## Full text (#1076) { #volltext }

`server/src/volltext/` (layer 3, above the [documents](#dokumente)):

| File | Class (in the service) | Content |
|---|---|---|
| `volltext.dienst.ts` | `VolltextDienst` (`dienst.volltexte`) | `beiVolltextFertig`, `volltextFertig`, `volltextAusgelassen` (#946), `volltextAn`, catching up and recreating (#458), text recognition as a package (#459), `nachEreignisAufruf`, `nachTexterkennungsEreignis`, `volltext`, `schreibeVolltext`, `setzeDokumentSprache`, `teilenHinweisAus`; `VOLLTEXT_MAX`, `VolltextMeldung`, `EreignisAufruf` |
| `aus-paketen.ts` | `VolltextAusPaketen` (`dienst.volltextAusPaketen`) | full text from packages (#614): `volltextPaketDa`, `paketWegFuerDateien`, `pruefeVolltextRecht`, `nachVolltextEreignis` |

- **Door:** `volltext/index.ts`. Which package is responsible for a file type is still worked out by `paketvolltext.ts` (a tool, also for the documents).
- **Gets the core** and the documents (text recognition, converting, archive version), plus a connector for the event (`kern.ereignis`), jobs, `paketVolltext` and the off-site backup.
- **Order:** `volltextFertig` first puts `volltext.fertig` into the outbox, then reports to the archive version and only with text calls the listeners (recognition) one after the other; `nachTexterkennungsEreignis` hands on as before to converting, archive version, full text from packages and backup.

## Post (#1077) { #post }

`server/src/post/` (layer 3) groups everything that comes in – one class per topic that gets the core; the service builds them (`bauePdfPostAusgang()`) and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `post.dienst.ts` | `PostDienst` (`dienst.post`) | `legePostAn`, `ordneZu` (#192), `automatischZuordnen`, `automatikRueckgaengig` (#337), `postAufgaben` (completes “post for you”; since #1001 the automation creates it) |
| `aufloesen.ts` | `PostAufloesen` (`dienst.postAufloesen`) | dissolving and splitting off post (#934, #936): `loesePostAuf`, `trennePostAb`, `verschiebeInRegister` |
| `systemmappen.ts` | `PostSystemmappen` (`dienst.postSystemmappen`) | `schreibeSystemMappe`, `spiegleBenutzer`, `gleicheBenutzerAb`, roles, system accounts (#673); `SystemkontoEintrag` |
| `eingangskanaele.ts` | `Eingangskanaele` (`dienst.eingangskanaele`) | what inbox folders and mailboxes need (#195, #196), identical files and `fundstellen` (#333); `Fundstelle` |
| `foto.ts` | `PostFotos` (`dienst.postFotos`) | photographing post (#490): `postAusFotos`, `fotosAnMappe`, `legePostZusammen` |
| `leerseiten.ts` | `PostLeerseiten` (`dienst.postLeerseiten`) | blank pages (#997): `lies`, `markiere` (packages with `dms:leerseiten` only), `waehleSeite` (people only); when taking over `plane` (before moving) and `lasseWeg` (new version, original kept as an earlier version) |

- **Door:** `post/index.ts`; only `routen.ts` loads the mailbox routes (`post.routen.ts`) directly. Since #1073 `wandleZuPost` and `ergaenzeSystemfelder` live with the [folder types](#mappentypen).
- **Gets the core**, [checking permissions](#zugriff), [folder types](#mappentypen), [folders](#mappen), [documents](#dokumente) and the classes of this folder, `PostFotos` also [editing PDFs](#pdf-bearbeiten). Through the connector: event (`kern.ereignis`), `meldeVerknuepft`, tasks, accounts, fit, system setup, deleting folders and `sichereZuordnung` from `erkennung.ts` (recognition still gets the whole service and so does not sit below layer 3).
- **Order:** `legePostAn` writes folder, history, title, `post.angelegt` and the links in one transaction (since #1001 the automation creates the “post for you” task afterwards – When `mappe.geaendert` with `angelegt`); the receiver `post.aufgaben` at the connection point `mappeGeaendert` stays last in line and calls `post.postAufgaben`.

## Outgoing (#1077) { #ausgang }

`server/src/ausgang/` (layer 3) groups the [routes to the outside](#wege-nach-draussen) on which files and data leave Ablago – download, email, export, WebDAV drive – and their **shared checkpoint** (#723):

| File | Class (in the service) | Content |
|---|---|---|
| `pruefstelle.ts` | – | the rule “R means view, E means take along” (formerly `ausgang.ts`): `mitnehmbar`, `pruefeAlle`, messages |
| `ausgang.dienst.ts` | `AusgangDienst` (`dienst.ausgang`) | `exportierbar` (#294), `mitnehmbar`, `pruefeAusgang`; stamps (`mitStempel`, `stempelPlan`, `laufwerkStempel`, `laufwerkAusgabe`), `notiereWeitergabe`, original or archive version, `dokumentFuerAusgabe`, `fassungFuerAusgabe`, `gestempelteSeiten` (#799) |
| `email.ts` | `AusgangEmail` (`dienst.ausgangEmail`) | `versendeMappen`, `versendeMappe` (#58, #151), `emailKopf` (also for access requests) |
| `export.ts` | `AusgangExport` (`dienst.ausgangExport`) | `exportiere` (#152, #153) |

- **Door:** `ausgang/index.ts`; only `routen.ts` loads the routes (`ausgang.routen.ts`) directly.
- **One checkpoint:** every route asks `dienst.ausgang.pruefeAusgang` or `dienst.ausgang.mitnehmbar` – routes (`http/routen-kontext.ts`, `sichten.routen.ts`), `webdav.ts` and also email and export in this folder (through their connector). `ausgang.test.ts` replaces both on `dienst.ausgang` and checks that download, email (one, several), export and drive ask them. A new route to the outside asks them before anything else happens.
- **Gets the core**, checking permissions, folder types, folders, documents, the [views](#sichten), the stamp templates ([editing PDFs](#pdf-bearbeiten)) and – for email – the system folders of [post](#post); `entsperrtZu` through the connector.

## Editing PDFs (#1077) { #pdf-bearbeiten }

`server/src/pdf-bearbeiten/` (layer 3) is the business logic around PDFs; the [PDF place](#pdf-stelle) `pdf/` with pdf-lib stays technology and unchanged:

| File | Class (in the service) | Content |
|---|---|---|
| `pdf-bearbeiten.dienst.ts` | `PdfBearbeiten` (`dienst.pdfBearbeiten`) | page images, `seiteAlsGraubild` (#338), `pdfSeiten`, `bearbeitePdf` (split, for post one post per part, #335), `fuegePdfZusammen` |
| `verkleinern.ts` | `PdfVerkleinern` (`dienst.pdfVerkleinern`) | shrinking PDFs (#393): preview, on a document, automatically, large documents; `VERKLEINERN_STANDARD`, `GROSSE_MAX` |
| `schwaerzen.ts` | `Schwaerzen` (`dienst.schwaerzen`) | redacting (#392, #459), page images also of the archive version (#934) |
| `stempelvorlagen.ts` | `Stempelvorlagen` (`dienst.stempelvorlagen`) | stamp templates and the stamp per folder type (#394) |

- **Door:** `pdf-bearbeiten/index.ts`; the routes live with the documents.
- **Why a folder of its own:** `pdf/` is exempt from the `fachordner` rule (`TECHNIK`), runs in the worker pool and is imported by the documents (layer 2). Classes with core, folders and documents there would have weakened the rule and built a cycle through `pdf/index.ts`.
- **Gets the core**, checking permissions, folders and documents. Post (new post when splitting, system folder, “post for you”) comes through the connector on the service – `post/` appends photos with `pdfVon`, the other way round would run in a circle.

## Events (#1078) { #ereignisse }

`server/src/ereignisse/` (**layer 2**) passes on what the core raises – the outbox itself (`kern.ereignis`) belongs to the core:

| File | Class (in the service) | Content |
|---|---|---|
| `ereignisse.dienst.ts` | `EreignisseDienst` (`dienst.ereignisseDienst`) | `neueAufgabe`, `meldeVerknuepft` (#670), `ereignisAnPakete` (#686 only with read permission, #796 AI block), `auftrag`, `vektorNachlauf` (#442) |
| `automatisierung.ts` | `Automatisierungshilfen` (`dienst.automatisierungshilfen`) | `automatisierungKontext`, `mitgliederDerRolle`, `trifftTeile`, `lesbareTitel`, `datumVon`, `mappenMitDatum` (#674, #712) |

- **Why layer 2:** many need the events, folders and documents too; they themselves need only the core, the [permission check](#zugriff) and the packages on the folder type including the AI approval ([folder types](#mappentypen)). Text recognition ([full text](#volltext)) and roles ([post](#post)) come through the connector.
- The service registers the `pakete` consumer with the distributor; raising events (`kern.ereignis`) and the package runner's wake-up (`ereignisWecker`) come through the connector.
- **Door:** `ereignisse/index.ts`, imported as `ereignisse/index` – next to the folder lies `ereignisse.ts` (the catalogue's distributor), as with `pakete/index`.

## Tasks (#1078) { #aufgaben }

`server/src/aufgaben/` (layer 3) bundles everything around To dos; the service builds the classes (`baueAufgaben()`) and keeps them as fields on the service; that is where they are called (#1079):

| File | Class (in the service) | Content |
|---|---|---|
| `aufgaben.dienst.ts` | `AufgabenDienst` (`dienst.aufgaben`) | `pruefeEmpfaenger`, mentions (#56, #81), approval for favourites (#506), `aufgabeAusAutomatisierung` (#676, #724), `erledigeNachAnlass` |
| `vertretung.ts` | `AufgabenVertretung` (`dienst.vertretung`) | deputies (#78), assign, complete, pass on (also in bulk, #415), `abwesenheitGeaendert`, `meineAufgaben` |
| `ohne-leserecht.ts` | `OhneLeserecht` (`dienst.ohneLeserecht`) | tasks for people without read permission, cases, temporary read permission (#798, #958) |
| `fristen.ts` | `Fristen` (`dienst.fristen`) | deadlines, dates with their cache, follow-up date (#129–#133, #528, #725); the daily run calls the due folder runs |
| `ohne-empfaenger.ts` | `OhneEmpfaenger` (`dienst.ohneEmpfaenger`) | everyday user (#719), notifying favourites (#422) |
| `ablaeufe.ts` | `MappenAblaeufe` (`dienst.ablaeufe`) | [automation templates and folder runs](#ablaufvorlagen) (#1044): apply, run planned ones (rights at run time), workbench, templates from packages |

- **Gets the core** and `AufgabenTeile` (permission check, history and folders, events, roles from [post](#post) and each other); through the connector the event (`kern.ereignis`), accounts and the validity of the counts.
- The receivers at the [connection points](#anschlusspunkte) are unchanged; they call `aufgaben.pruefeErwaehnungen`, `fristen.fristenAbgleichen` and `vertretung.abwesenheitGeaendert` only when triggered – tests replace them there.

## Deleting (#1078) { #loeschen }

`server/src/loeschen/` (layer 3); the service builds the classes (`baueLoeschen()`):

| File | Class (in the service) | Content |
|---|---|---|
| `loeschen.dienst.ts` | `LoeschenDienst` (`dienst.loeschen`) | `loeschPruefung` (#79), `loescheMappe`, `loescheMappen` (#150), `entferneMappenEndgueltig` |
| `papierkorb.ts` | `Papierkorb` (`dienst.papierkorbVerwaltung`) | Bin (#43, #344, #936): restore, delete permanently, empty, clean up |
| `loeschprotokoll.ts` | `LoeschprotokollVerwaltung` (`dienst.loeschprotokollVerwaltung`) | reading and managing the deletion log (#470); it is **written** in the [core](#kern) |
| `mit-verknuepften.ts` | `MitVerknuepften` (`dienst.mitVerknuepften`) | [tree](#baum-uber-verweise) and deleting with linked folders (#396, #424) |
| `beispiele.ts` | `BeispielMappen` (`dienst.beispielMappen`) | example folders from packages (#878) |

- **Gets the core** and `LoeschenTeile` (permission check, fit, history, documents, outgoing, views, system folders and each other); event (`kern.ereignis`), `aktualisiereTitel` (`mappenTitel`) and accounts through the connector.
- **Parts (#1031):** `loescheMappe` takes the parts of a folder along (`loescheMitTeilen`: R and D on every part, otherwise 403 with the number; bin, history, events and deletion log with the way `teile` in one transaction, operation = id of the folder). The bin restores them with it and deletes them permanently with it; "with linked folders" refuses if a part of a deleted folder would remain.

## Data protection (#1078) { #datenschutz }

`server/src/datenschutz/` (layer 3); the service builds the classes (`baueDatenschutz()`):

| File | Class (in the service) | Content |
|---|---|---|
| `datenschutz.dienst.ts` | `DatenschutzDienst` (`dienst.datenschutzDienst`) | subject access request under Art. 15 GDPR (#396, #472, #668), demo data (#248) |
| `vollexport.ts` | `VollexportQuellen` (`dienst.vollexport`) | data sources for the full export (#254) and personal export (#255) |
| `zustellen.ts` | `AuskunftZustellen` (`dienst.auskunftZustellen`) | e-mail and retrieval links with retrieval code (#455), "Export my data" |

- **Gets the core** and `DatenschutzTeile` (permission check, folders, documents, views, events, tasks, deleting and each other); accounts, short-term state, vault and the export of automations through the connector.

## Workbench (#1078) { #werkbank }

`server/src/werkbank/werkbank.dienst.ts` with `WerkbankDienst` (`dienst.werkbank`, layer 3, only the core): the Workbench view (#281, `werkbankAnsicht`, `setzeWerkbankAnsicht`) and the Library attributes (#1032, `merkmale`, `setzeMerkmale`; setting `merkmale`). They are read everywhere via `kern.merkmale()` – also in `zugriff.aufloesung` for the conditions of permissions, views and automations.

**Display conditions (#1033):** the evaluation lives in `shared/src/anzeige.ts` (`anzeigestand`, `pruefeMitAnzeige`) and is the same for the interface and the server – `mappen/eingaben.ts` (saving) and `mappentypen/passung.ts` (fit) check required fields with it, the form uses it via `web/src/ablage/anzeige.ts`. The conditions build on the views’ toolkit (`sichten.ts`); nothing but what the form shows depends on them.

## What stays in dienst.ts (#1078, #1079) { #dienst-rest }

Since #1079 `dienst.ts` contains no forwards any more, only the assembly: the fields of the classes, the constructor with the `baue…()` methods, `schliesseEmpfaengerAn()`, the `verbinde…` methods, the fields set by start-up or tests (`mindestensMs`, `sicherungAufgegeben`, `systemkonten`, `ereignisWecker` …), the event distributor and the vault (`schluesselWechseln`, `verschluesselePaketGeheimnis`, `entschluessele`).

Routes, modules and tests call the subject services on the fields of the service (`dienst.mappen.holeMappe(…)`, `dienst.kern.ereignis(…)`, `dienst.ausgang.pruefeAusgang(…)`); constants, helpers and types come from the subject folder's `index.ts`, not through `dienst.ts`. Permission checks stay where they were: in the subject services and in the route wrappers (`dokumentRecht`, `maskiere` …). One forward remains: `listeDokumente` reads the documents of a folder from the repo without a permission check (creating a package with sample documents, administrators only) – the repo does not belong in the routes. New code calls the subject service directly and adds no new forward.

### Layers { #schichten }

Subject folders only call downwards; within the same layer they may use each other (`kein-kreislauf` forbids cycles). The list is kept in one place in `.dependency-cruiser.cjs` (`SCHICHTEN`) – a folder that does not exist yet is already placed:

| Layer | Subject folders |
|---|---|
| 0 | `kern/` – only itself, `shared/` and the base |
| 1 | `zugriff/` |
| 2 | `mappentypen/`, `mappen/`, `dokumente/`, `berechtigungen/`, `ereignisse/` (#1078) |
| 3 | all other subject folders (`suche/`, `sichten/`, `volltext/`, `post/`, `ausgang/`, `pdf-bearbeiten/`, `aufgaben/`, `loeschen/`, `datenschutz/`, `werkbank/` …) |

Without business logic and outside the layers (`TECHNIK`): `http/`, `pdf/`, `arbeit/`, `laeufer/`. Subject folders from layer 1 up may import, besides the core and the base, the tools `messung.ts`, `vektoren.ts`, the file technology (`hochladen.ts`, `verkleinern.ts`, `dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`, `paketvolltext.ts`, #1075), the technology for post, outgoing and editing PDFs (`pdfseiten.ts`, `graubild.ts`, `schwaerzen.ts`, `ausgabe.ts`, `export.ts`, `xlsx.ts`, `zip.ts`, `mail.ts`, #1077), the technology for deleting and data protection (`baum.ts`, `schriftstueck.ts`, `auskunft.ts`, `vollexport.ts`, `abruf.ts`, `passwort.ts`, `tresor.ts` – only `istVerschluesselt`, the service passes the key in –, #1078), `pdf/` and `arbeit/` – never `dienst.ts`. Routes (`*.routen.ts`) belong to the HTTP layer: they may import the service and their own subject folder; `routen.ts` fetches them directly.

## Dependencies { #abhaengigkeiten }

Ablago gets by with **little outside code**: 8 npm packages in the server, 3 in the interface, plus a handful of Alpine packages in the image. That is the best protection against supply-chain attacks and keeps security updates rare and manageable – and one of the main reasons why Node.js fits well here. It should stay like this.

**Rule (#543):** a new **runtime dependency** – npm under `dependencies` or an Alpine package via `apk add` in the `Dockerfile` – only comes with a justification in the pull request (section "Neue Abhängigkeiten" of the template):

- **What** is it needed for?
- **Why not** with Node.js's built-in means or the existing dependencies and tools? Often a small implementation of our own is enough, as with the [language files](#texte-und-sprachdateien) instead of i18next.
- **Licence:** compatible with Apache-2.0? Deliberately not in the image are, for example, Ghostscript and MuPDF (AGPL).
- **Maintenance:** latest version, number of maintainers.
- **Its own dependencies:** what it brings into the image.

The check **Abhängigkeiten** (`.github/workflows/abhaengigkeiten.yml`) reports new runtime dependencies in the PR as a warning, removed and new build and test tools as a note and changed versions in the run's summary – nothing is blocked. The script `.github/werkzeuge/abhaengigkeiten-hinweis.py` (only Python and git) does this; locally: `python3 .github/werkzeuge/abhaengigkeiten-hinweis.py main HEAD`. GitHub's Dependency Review checks known vulnerabilities and incompatible licences in the same run.

**In the image today** (as of 0.122):

| Package | Where | Licence | What for |
| --- | --- | --- | --- |
| `fastify` | server | MIT | HTTP server, routes, checking requests |
| `@fastify/static` | server | MIT | delivering the interface as files |
| `postgres` (postgres.js) | server | Unlicense | access to PostgreSQL |
| `nodemailer` | server | MIT-0 | sending emails via SMTP (invitations, notices, sending folders) |
| `imapflow` | server | MIT | collecting post from mailboxes via IMAP |
| `mailparser` | server | MIT | splitting collected emails into text and attachments |
| `pdf-lib` | server | MIT | assembling, shrinking, redacting, stamping PDFs – only via the [PDF place](#pdf-stelle) |
| `@pdf-lib/fontkit` (fixed 1.1.1) | server | MIT | embedding fonts of our own in PDFs (Noto Sans as a subset, [#826](#pdf-schriften)); its only dependency `pako` already comes with pdf-lib |
| `yaml` | server | ISC | reading and writing packages in YAML format |
| `@simplewebauthn/server` | server | MIT | verifying [passkeys](#passkeys) (WebAuthn: CBOR, COSE keys, signatures, counters) – pinned version; brings `@peculiar/*` and `asn1js` (MIT/BSD-3-Clause), `@levischuck/tiny-cbor`, `@hexagon/base64`, `tsyringe` (MIT), `reflect-metadata` (Apache-2.0) and `tslib` (0BSD) |
| `react`, `react-dom` | interface | MIT | interface |
| `qrcode` | interface | MIT | QR code for two-factor sign-in |
| `poppler-utils` | image (Alpine) | GPL-2.0-or-later, called as a separate program | `pdftotext`, `pdftoppm`: text and images from PDFs |
| `qpdf` | image (Alpine) | Apache-2.0 | optimising the structure of PDFs when shrinking |
| `postgresql17`, `postgresql17-contrib` | only `dms-komplett` | PostgreSQL | database in the same container; `contrib` for `pg_trgm` |
| `tini`, `su-exec` | only `dms-komplett` | MIT | starting and cleanly ending processes, PostgreSQL without root |

Only for build and tests (not in the image): `typescript`, `tsx`, `esbuild`, `vite` with `@vitejs/plugin-react` and the types under `@types/…`; for [style and dependencies](stil.md) (#899) `eslint` with `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@eslint-community/eslint-plugin-eslint-comments` and `globals`, plus `dependency-cruiser`. Here too: rather built-in means – the tests run with Node.js's test runner (`node --test`), without a test framework of their own.

## dms-komplett: database folder { #komplett-datenbankordner }

`deploy/komplett/start.sh` starts PostgreSQL and Ablago in the `dms-komplett` image. For the folder `/data/postgres` (#943):

- **Permissions:** the script hands `/data/postgres` and `/data/postgres/daten` to the user `postgres` (70) and sets both to `700`. The parent folder matters: without `x` on it, `postgres` can't reach `daten`, even though root can create everything there (NAS folders with `000`). `chown`/`chmod` don't abort the start, because they often fail on network shares. Afterwards the script creates a probe file in `daten` as `postgres` and deletes it again. If that fails, the start ends before `initdb` with a message including a link to the installation manual. This is checked in `deploy/komplett-probe.sh` (step 5b).
- **Not mounted:** `datenbankOhneVolume()` (`server/src/anbindung.ts`) uses `aufVolume` (like the key file, backup and exports) to check whether `/data/postgres` is a mount point of its own. If not: an error in the log on start, a red message in the overview (`anbindung.ohneVolume`, can't be accepted) and under Database connection.
- **Deliberately no `VOLUME /data/postgres` in the image.** An anonymous volume would look like protection, but it doesn't help in exactly the cases that matter: `docker run` and "recreate container" in a NAS interface create a new, empty anonymous volume each time. The old database then lingers under a hash name, and Ablago starts empty. Only Compose carries anonymous volumes over when recreating. On top of that the database silently ends up where Docker lives (on a NAS often the small system partition), and the check above could no longer tell it from a real folder – the warning would be lost. `/data/files`, `/data/geheim` and `/data/sicherung` have no `VOLUME` either (#115), and a `VOLUME` can't be undone in derived images. Hence: no `VOLUME`, but a loud warning and instructions for rescuing the data.
- **Stopping:** the template `deploy/komplett/docker-compose.yml` sets `stop_grace_period: 60s` so that Ablago and PostgreSQL shut down cleanly. The two-container templates don't need it: the `postgres` image stops with `SIGINT` ("fast shutdown") within the usual 10 seconds.

## PDF place { #pdf-stelle }

All work on PDFs with **pdf-lib** is in one folder: `server/src/pdf/` (#541). Only there is pdf-lib included; the check `server/test/pdf-stelle.test.ts` (runs with `npm test` in CI) fails as soon as server, interface or `shared` import pdf-lib elsewhere – also via `import()` or `require()`. Tests may still use pdf-lib to examine generated PDFs.

```
server/src/pdf/index.ts          public interface – all modules import from './pdf'
server/src/pdf/seiten.ts         counting, rotating, deleting, reordering, splitting, merging pages, photos as pages
server/src/pdf/stempel.ts        stamp and footer when passing on, image as an A4 page
server/src/pdf/verkleinern.ts    downscaling images (via pdftoppm), tidying up the structure (qpdf)
server/src/pdf/schwaerzen.ts     rebuilding pages, redacting, text layer without redacted words
server/src/pdf/schreiber.ts      text documents by plan (access copy, deletion concept, deletion log)
server/src/pdf/export.ts         PDF of several folders
server/src/pdf/aufkleber.ts      label sheet with barcode
server/src/pdf/anzeige.ts        cleaned copy for display in the browser (#639)
server/src/pdf/demo-dokumente.ts demo documents
server/src/pdf/schrift.ts        Noto Sans as an embedded subset for all PDFs of our own, replacement character (#826)
server/src/pdf/bild.ts, puffer.ts, text.ts   image kind, JPEG dimensions, EXIF; workaround #456; file size
```

**Rules for new code**

- Domain matters stay outside: what goes on a PDF (texts, fields without passwords, permissions, placeholders) is decided by the respective module (`export.ts`, `auskunft.ts`, `ausgabe.ts` …). Only **how** something is drawn or rebuilt goes into the PDF place.
- The operations take and return **simple data** – bytes (`Buffer`/`Uint8Array`), numbers, texts, lists –, never pdf-lib objects. The caller describes text documents as a plan (`Anweisung[]`: text, line, spacing, table, new page) and has them drawn with `textdokumentPdf()`. That way all operations run in the [worker pool](#arbeiter-pool) (#542): `pdf/index.ts` passes them there; a new operation additionally goes into `arbeit/vorgaenge.ts`.
- The PDF place only loads PDFs via `ladePdf()` (`pdf/laden.ts`, #823), never directly with `PDFDocument.load`: it first checks how large the object and cross-reference streams unpack (at most 64 MB per stream, 256 MB together) – otherwise a crafted PDF of a few MB occupies several GB when loading, bypassing the workers' memory limit. In addition, their entries (`/W`, `/Index`, `/Size`, `/N`, `/First`) must match the stream's length; otherwise pdf-lib would run almost endlessly when loading.
- Images only go to pdf-lib via `eigenerPuffer()` (#456: pdf-lib overlooks a Buffer's offset in shared memory and reports "SOI not found" for JPEGs).
- Text only goes onto a PDF via `schriften()` and `pdfText()` from `pdf/schrift.ts` (#826): Noto Sans as a subset, text in NFC, missing characters as “�”. No standard fonts (`StandardFonts`) for new text; the only exception is the codes on the emergency sheet (Courier, plain ASCII). More under [Fonts of our own PDFs](#pdf-schriften).
- The PDF place writes nothing into the log and reads no settings. What the caller is to know is in the result (e.g. `hinweise` when shrinking). The only exception is the note on missing characters: the worker returns it next to the result (`zeichen` in the answer), and the pool writes it into the log.
- Domain errors with an understandable message (`Fachfehler(422, …)`) may come from the PDF place, for instance for encrypted or broken PDFs.

### Assessment of the PDF libraries (#822) { #pdf-bibliotheken }

**pdf-lib (MIT) is the only widespread library in pure JavaScript that can edit existing PDFs and create new ones.** pdfkit, pdfmake and jsPDF only create new PDFs; PDF.js only reads and displays. The last version 1.17.1 dates from the end of 2021; there has been no further development since. We already work around one bug in it (#456). Replacing it is **not** part of #541 – but the encapsulation makes it manageable.

**What Ablago needs and what the tools can do** (as of 04/11/2026):

| Tool | A | B | C | D | E | F | G | H | I |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **pdf-lib 1.17.1** (today) | yes | yes | yes | yes | yes (workaround #456) | partly | yes | yes (MIT) | **no** (2021) |
| **@cantoo/pdf-lib** 2.11.1 | yes | yes | yes | yes | yes | partly | yes | yes (MIT) | yes (15/09/2026) |
| **@pdfme/pdf-lib** 6.2.8 | yes | yes | yes | yes | yes | partly | yes | yes (MIT) | yes (23/10/2026) |
| pdfkit | no | no | only in new PDFs | yes | yes | no | yes | yes (MIT) | yes |
| pdfmake (on pdfkit) | no | no | partly, only new | yes (from a description) | yes | no | yes | yes (MIT) | yes |
| jsPDF | no | no | only in new PDFs | yes | yes | no | yes | yes (MIT) | yes |
| PDF.js | no | no | no | no | no | partly (reading, text) | yes | yes (Apache-2.0) | yes |
| qpdf (in the image) | partly (structure, objects, decrypting) | yes | partly (overlaying, rotating; no text) | no | no | yes (`--check`, JSON) | **no** (separate program) | yes (Apache-2.0) | yes |
| PDFium as WebAssembly (e.g. `@embedpdf/pdfium`) | yes | yes | yes (via the C interface) | yes | yes | partly | yes (WebAssembly) | yes (Apache-2.0/BSD) | engine yes, wrapper young |
| MuPDF.js | yes | yes | yes | yes | yes | yes | yes (WebAssembly) | **no** (AGPL-3.0) | yes |

The columns – what Ablago needs them for and where they come from:

- **A – editing existing PDFs internally:** repacking images and tidying up structures ([#393](https://github.com/motom001/dms/issues/393)), the cleaned copy for display without scripts and actions ([#639](https://github.com/motom001/dms/issues/639)), stamps into existing pages ([#394](https://github.com/motom001/dms/issues/394)).
- **B – pages:** rotating, deleting, reordering, splitting ([#335](https://github.com/motom001/dms/issues/335)), photos as pages ([#490](https://github.com/motom001/dms/issues/490)), merging pages of several folders ([#152](https://github.com/motom001/dms/issues/152)).
- **C – drawing on pages, also opacity, rotation and blend mode:** stamps and watermarks ([#394](https://github.com/motom001/dms/issues/394)), colours and blend mode ([#799](https://github.com/motom001/dms/issues/799)).
- **D – creating new PDFs:** text documents by plan ([#541](https://github.com/motom001/dms/issues/541)), export of several folders ([#152](https://github.com/motom001/dms/issues/152)), label sheet ([#345](https://github.com/motom001/dms/issues/345)), demo documents ([#248](https://github.com/motom001/dms/issues/248)).
- **E – embedding images:** photos as PDF ([#490](https://github.com/motom001/dms/issues/490)), rebuilding when redacting ([#392](https://github.com/motom001/dms/issues/392)), JPEG from shared memory ([#456](https://github.com/motom001/dms/issues/456)).
- **F – checking:** PDF/A identifier, encryption, signature and text layer for the archive version ([#631](https://github.com/motom001/dms/issues/631)).
- **G – without native parts:** the operations run in the worker pool ([#542](https://github.com/motom001/dms/issues/542)); native modules contradict the slim dependency list. qpdf and poppler are separate programs in the image, not modules.
- **H – licence fits Apache-2.0:** MIT, BSD and Apache-2.0 yes; AGPL no (that's why MuPDF and Ghostscript are deliberately not in the image).
- **I – maintained:** new versions in the last twelve months and answers to reports.

**Several small packages don't replace pdf-lib.** For A, B and C – editing existing PDFs – in pure JavaScript there is only the pdf-lib family (the original and its forks). A generator such as pdfkit would only come in addition.

**Ways** (the decision is prepared by [#823](https://github.com/motom001/dms/issues/823), see [below](#pdf-entscheidung)):

| Way | For it | Against it |
| --- | --- | --- |
| **a) pdf-lib stays** (today) | runs stably, all functions and tests build on it; MIT; four small dependencies of its own (`pako`, `tslib`, standard fonts, `upng`) | no more bug fixes and no security updates; workarounds such as #456 stay our business |
| **b) `@cantoo/pdf-lib`** (maintained fork) | same interface, regular versions (21 versions in 2026), MIT; fixes in parsing; `crypto-js` removed since 2.9.0 | almost all changes since 2025 by one person; since 2.11 only minified builds; packaging regressions (ESM build, `prepare: husky`); HTML parser and colours as dependencies |
| **c) A copy of our own** in `server/src/pdf/` | no new dependency; only the fixes that concern us | we become maintainers ourselves; Dependabot and OSV no longer cover the copy |
| `@pdfme/pdf-lib` (fork by the pdfme project) | same interface, maintained (6.2.8 of 23/10/2026), MIT | a single maintainer; also additional dependencies (HTML parser, colours) |
| More via qpdf (already in the image, Apache-2.0) | robust and maintained (C++); can rotate, select, reorder, split, merge, overlay, decrypt pages (#827) and optimise structures – without a new dependency; a process of its own | draws no texts and embeds no images: stamps, export pages, labels, text documents and the rebuild when redacting would need a writer of their own (approach in the test helper `server/test/hilfen-einfach-pdf.ts`); every call writes files |
| PDFium as WebAssembly (Apache-2.0, Chrome's engine) | very capable: reads, edits, draws and renders; no native modules | the JavaScript wrapper is young and aimed at the browser; large (several MB of WebAssembly); interface close to C, so a lot of code of our own |
| MuPDF, Ghostscript | very capable | AGPL – deliberately not in the image |

**State and sources** (04/11/2026): versions, dates, dependencies and sizes from the npm registry (`npm view <package> time dependencies dist.unpackedSize`); functionality from the projects' documentation (pdf-lib.js.org, github.com/cantoo-scribe/pdf-lib, github.com/pdfme/pdfme, pdfkit.org, pdfmake.org, github.com/parallax/jsPDF, mozilla.github.io/pdf.js, qpdf.readthedocs.io, pdfium.googlesource.com, github.com/embedpdf, mupdf.readthedocs.io); preliminary review of the fork in the comment on #823. Whoever renews the assessment changes the date and above all checks column I.

### Basis for the decision: stay, cantoo, own copy (#823) { #pdf-entscheidung }

**Decided (11/11/2026, maintainer): way a – pdf-lib 1.17.1 stays** and is only extended by the functions needed: `@pdf-lib/fontkit` 1.1.1 for embedded fonts, with three mandatory precautions (prepare the font, `ccmp: false`, NFC; see [Fonts of our own PDFs](#pdf-schriften)). `@cantoo/pdf-lib` will be reassessed as soon as Chinese, Japanese or Korean is needed in PDFs of our own. The basis for this:

**Trial run (11/11/2026, comment in #826)** – test text in six languages, Noto Sans as a subset in letter and stamp:

| | before | a: + `@pdf-lib/fontkit` 1.1.1 | b: cantoo + `@cantoo/fontkit` |
| --- | --- | --- | --- |
| runtime modules in the image | 21.8 MB | 26.1 MB | 42.8 MB |
| “?” in the result | 229 | 0 | 0 |
| Chinese, Japanese, Korean | – | doesn't work (subset of the CFF font invalid) | works |
| Arabic mixed with digits | – | digits reversed (no bidi ordering) | likewise |
| `npm audit` | 0 | 0 | 0 |

With cantoo, 473 of 474 PDF tests ran green (the difference: #456 is fixed there), the bombs still fail at `ladePdf()`, but every import loads `culori`, an HTML parser and `html-entities`, and `@pdf-lib/fontkit` crashes with cantoo.

What had been checked before the decision (as of 04/11/2026):

**Signs of life** (npm registry): `pdf-lib` last 1.17.1, package last changed on 12/05/2022. `@cantoo/pdf-lib`: versions per year 2021: 20, 2022: 9, 2023: 39, 2024: 20, 2025: 13, 2026: 21; last 2.11.1 of 15/09/2026; six people may publish on npm; according to the preliminary review, the commits since 2025 almost all come from one person. `@pdfme/pdf-lib` last 6.2.8 of 23/10/2026. A revival of the original isn't known.

**Dependencies of cantoo 2.11.1:** `tslib`, `culori`, `fflate`, `node-html-better-parser`, plus `html-entities` as a peer. According to the CHANGELOG, `crypto-js`, `pako`, `color`, `@pdf-lib/upng` and `@pdf-lib/standard-fonts` have been removed or embedded. HTML parser and `culori` serve drawing SVG and HTML; whether they are loaded with our calls only the trial run will show. Package size unpacked: 26.3 MB (pdf-lib 1.17.1: 19.5 MB) – most of it is several builds.

**Scope of a copy of our own (way c):** pdf-lib 1.17.1 has 139 source files with 22,740 lines of TypeScript. Of these we don't use the forms (`api/form`, `core/acroform`, annotations: together about 6,900 lines); what remains is about 15,800 lines for parser, objects, streams, writer, embedding and the page API. Plus standard fonts, `upng` and `pako` (or `node:zlib`). Operation would need a fixed routine: compare cantoo's and the original's releases and security advisories monthly, a note in `SECURITY.md` that we maintain the code ourselves, and the fuzz tests below as a requirement. Estimated effort: a few hours a month, more with a report.

**What the tests show today (independent of the way):**

- All load points of the PDF place run in the worker pool and load via `ladePdf()` – the check `pdf-stelle.test.ts` records this (below).
- The fuzz tests (below) found two kinds of errors, both fixed:
    - **Hangs and memory:** cross-reference streams with impossible widths (`/W [1 2 2147483647]`) or ranges (`/Index [0 2147483647]`) made pdf-lib 1.17.1 run billions of steps when loading – a PDF of a good 1 KB held a worker until the time limit of 10 minutes or filled its memory. `ladePdf()` now checks these entries against the stream's unpacked length (also `/N` and `/First` for object streams, at most 10 million entries) and rejects the impossible with 422. The examples are in the corpus (`querverweis-*.pdf`). Whether cantoo is more robust here belongs to the trial run.
    - **Messages:** broken structures (circular page tree, wrong object kinds) ended with errors from pdf-lib when stamping, with the pages and when shrinking. Now "can't be read as a PDF" or "couldn't be read and therefore not stamped" comes.

**Open at the time, since answered by the trial run above:** the trial run with `@cantoo/pdf-lib` – do all PDF tests stay green unchanged, is #456 fixed there, how big does the image get, how much memory does it need, does the bomb PDF also fail at `ladePdf()` there (it should: the check runs before the library) and which dependencies does it load with our calls. This is how it can be caught up without a change to the repository: install cantoo into an empty directory and start the tests with a load hook that redirects `pdf-lib` to this directory (`node --import <hook> --import tsx --test test/pdf*.test.ts test/stempel.test.ts …`). The list of changes compared with 1.17.1 (parsing, new functions, other) is in the preliminary review in #823 and is not re-checked here.

**Criteria from a security perspective** (comment on #823): a) only with the protective measures around pdf-lib; b) the main objection `crypto-js` is gone; minified builds, packaging and a single maintainer remain open – with a fixed version and checked lockfile; c) fixed comparison, note in `SECURITY.md`, fuzzing required. Workers, time limit, `ladePdf()` and the fuzz tests stay with every way.

### Fonts of our own PDFs (#826) { #pdf-schriften }

All PDFs Ablago creates itself – stamp, letter, folder export, labels, text documents (access request, deletion concept, deletion log), emergency sheet, demo documents and the invisible text layer when redacting – embed **Noto Sans** (SIL Open Font License 1.1) as a **subset**: only the characters that occur. Before, these were the standard fonts Helvetica and Courier with WinAnsi; everything outside Western Europe silently became “?”.

- **Styles:** regular, bold, italic, bold italic and Noto Sans Mono for `code` in the letter. The emergency sheet keeps Courier bold for key, codes and library ID – they consist of ASCII only.
- **Character range:** Latin with extensions (Turkish, Polish, Czech, Romanian …) and Vietnamese, Greek, Cyrillic, plus punctuation, currency and some special characters. The list is in `BEREICHE` of the script below.
- **Files:** `server/schriften/` (five styles, 1.4 MB together, with `OFL.txt`) in the repository and in the image. That way the Docker build doesn't need Python.
- **Once per worker:** `pdf/schrift.ts` reads the files once, fontkit parses each once and remembers shaped texts. After that, each PDF only embeds its subset. When saving, the name of the subset gets the usual tag of six capital letters (`ABCDEF+NotoSans-Regular`, from the characters used). The same characters give the same files, so the demo documents stay the same for the same seed.

**Three mandatory precautions** – without them the result is wrong, although at first glance it looks right:

1. **Prepare the font:** `server/werkzeuge/schriften/aufbereiten.py` (fontTools) cuts the font down to the ranges above, removes the hinting and writes it anew with `glyf.padding = 4`. With the original files, `@pdf-lib/fontkit` 1.1.1 damages the subset: in the trial run about 60 % of the characters were invisible, while `pdftotext` still reported everything correctly. New version of Noto Sans: `python3 server/werkzeuge/schriften/aufbereiten.py <source folder> server/schriften`, then `schriften.test.ts`.
2. **`features: { ccmp: false }` when embedding:** otherwise fontkit combines characters, and copying or searching gives wrong text (“Thị Liste office” becomes “Thị Lịste offịce”). The features for spacing (`kern`, `mark`, `mkmk`) are off as well. pdf-lib doesn't use them, switching them off only saves time.
3. **Text in NFC:** pdf-lib places combining characters without their offset. `pdfText()` converts every text first, so “ễ” is one character in the PDF.

Plus a workaround in `schrift.ts`: fontkit remembers each glyph with the characters of its first use. Because the font is parsed only once per worker, `schrift.ts` adds the characters as soon as they are known. Otherwise, in the second PDF, the “u” (part of “ü”), for example, would lack its mapping, and copying would give “�”.

**If a character is missing** from the font (Arabic, Hebrew, Chinese, emoji …), the PDF shows the replacement character “�”. Invisible characters such as variation selectors are dropped. The worker returns the missing characters next to the result, and the pool writes a warning into the log **once per job** (module “Documents”, with operation and Unicode numbers).

**Measurement** (11/11/2026, letter with sample texts in six languages and all five styles from `server/test/hilfen-schriften.ts`, average over ten letters with changed text):

| | before (Helvetica, WinAnsi) | Noto Sans as a subset |
| --- | --- | --- |
| size | 13.6 KB, 217 “?” | 41.9 KB, no “?” |
| time per letter | 14 ms | 36–41 ms (first letter in the worker: 170 ms, reads and parses the fonts) |
| stamp on an empty page (PDF 0.6 KB before) | 1.7 KB, 5 ms | 4.8 KB, 20 ms |

**Standard fonts do not stay for plain WinAnsi text**, although they would be smaller and faster. Reasons: the archive version (PDF/A) requires embedded fonts. With two ways, a letter would look and wrap differently depending on its content. And the differences (around 30 KB, around 25 ms per PDF) hardly matter next to the documents themselves.

**Limits:** right-to-left scripts (Arabic, Hebrew) and Chinese, Japanese, Korean are **not** included:

- The CJK fonts are CFF fonts. fontkit 1.1.1 builds their subset invalid.
- Arabic and Hebrew lack the bidi ordering, digits would be reversed.
- A CJK font alone has a good 16 MB (Noto Sans CJK SC, one style). That doesn't fit the limit for the image size and mission 2 (“fast even on small hardware”).

If such languages are added, the fonts belong in **language packs** ([#731](https://github.com/motom001/dms/issues/731)), and `@cantoo/pdf-lib` will be reassessed (see above). Until then, “�” appears with a note in the log.

**Tests:** `server/test/schriften.test.ts`. It reads the sample texts back out of the letter, checks `ccmp` and NFC, embeds the subset with ToUnicode and tag and covers all generators. Above all it checks the **display**: each character of the samples is rendered individually per style with `pdftoppm` and must show ink, in the second PDF of the same worker. With an unprepared font, exactly this test fails.

### Tests with broken PDFs (#823) { #pdf-fuzz }

`server/test/pdf-fuzz.test.ts` feeds deliberately damaged and randomly altered PDFs into all read points – via the worker pool as in operation: pages, shrinking (estimate), stamp, display, archive check and text layer. Expected: no crash of the worker (500), no memory abort (507), no hang (504, and every case under 30 seconds) and, with pages, shrinking and stamp, an understandable message (422). Display and archive check catch errors themselves (download only or "not readable").

- **Corpus:** `server/test/pdf-korpus/*.pdf` – small, broken examples (circular page tree, deep nesting, wrong cross-references and lengths, truncated, references into nothing, broken encryption, no header). The test generates the object stream bomb itself.
- **Randomness:** a small mutator of our own (flipping bytes, truncating, deleting or duplicating ranges, falsifying numbers, swapping streams, sprinkling in syntax, bending `startxref`) with a fixed seed – without a new dependency.
- **Running it:** `cd server && node --import tsx --test test/pdf-fuzz.test.ts`. In the normal CI 120 cases (default). More: `DMS_FUZZ_FAELLE=5000`, another seed: `DMS_FUZZ_SEED=7`. On a schedule, `.github/workflows/fuzz.yml` (weekly and by hand) runs with 5,000 cases and a changing seed.
- **Reproducing a finding:** the message names seed, case and starting PDF. With `DMS_FUZZ_AUSGABE=/tmp/funde` the triggering PDF is there afterwards.
- **Adding a new broken example:** put the file (keep it small, a few KB) under a telling name into `server/test/pdf-korpus/` – it is then automatically part of the corpus and goes into all read points. Only examples without real data, with persona names.
- **Errors found:** vulnerabilities with a security aspect (crash, memory, hang) only get a public issue with details once the fix is merged; before that, report to security (`SECURITY.md`).

**Scorecard "Fuzzing":** the check recognises OSS-Fuzz, ClusterFuzzLite and fuzz functions of some languages, for JavaScript and TypeScript property-based tests with `fast-check`. It doesn't recognise our own mutator; so the check stays unmet as long as `fast-check` (only `devDependencies`) isn't added. The maintainer decides that, as well as the details at Scorecard and for the OpenSSF Best Practices badge.

### Limits of the read points (#542, #823) { #pdf-grenzen }

- Every place that opens an outside PDF with pdf-lib is in `server/src/pdf/` and runs via `arbeite()` in the worker pool. `pdf-stelle.test.ts` checks: `PDFDocument.load` is only in `pdf/laden.ts`; outside the PDF place there are only types from its modules; `pdf/index.ts` only passes on directly helpers that load no PDF; the worker knows every module with `ladePdf()` (`arbeit/vorgaenge.ts`). With `DMS_ARBEITER=0` the operations deliberately run in the main thread.
- poppler (`pdftotext`, `pdftoppm`, `pdfinfo`) and qpdf run as processes of their own with a time limit.
- **Memory:** the limit of 1.5 GB applies **per worker** and only covers the JS heap; the unpacking limit in `ladePdf()` protects against large `ArrayBuffer`s. With N workers, the requirement can in the extreme case be N × 1.5 GB. On small devices (Raspberry Pi with 2–4 GB) therefore set `DMS_ARBEITER=1`.

### Protected PDFs (#827) { #pdf-geschuetzt }

`server/src/entsperren.ts` recognises protected PDFs (`qpdf --requires-password`, only if `/Encrypt` is in the content) and creates an **unlocked version** with `qpdf --decrypt`. Like the converted versions (#577) it is under `<household>/fassungen/` at the original's checksum, with `entsperrt` in the details (`FassungInfo`). Preview (`vorschau.ts`), full text (`texterkennung.ts`), stamp and shrinking (`ausgabe.ts`, via `Ausgabekontext.entsperrt`), archive version (`archivfassung.ts`, source `lesefassung`) and the display (`GET /dokumente/{id}/inhalt` without `herunterladen`) take it; downloading returns the original.

- **Password:** only via standard input (`--password-file=-`), never on the command line; never in database, log or history. A test checks qpdf's arguments.
- **Limits:** five wrong passwords per person and document in 15 minutes, then 429; qpdf with a time limit (60 s, remembered passwords 20 s per attempt, 2 minutes per document).
- **Remembered passwords:** setting `dokpasswoerter_<account>`, every password individually encrypted with the vault (kind "Remembered passwords for documents" in Workbench → Encryption, re-encrypted on a key change). Routes `/api/konto/dokument-passwoerter…` only in one's own session (no API key, no impersonation); displaying and changing the password only after `…/bestaetigen` (5 minutes per session). New post with "For" tries this person's passwords (`DokumenteDienst.neueDateien` → `PdfEntsperren.neu`).

### Displaying PDFs in the browser (#639) { #pdf-anzeige }

The server delivers files with `dateiKoepfe` (`routen.ts`): everything except PDF with a strict Content-Security-Policy including `sandbox`. PDFs need the browser's built-in viewer and don't get this policy – that's why the browser **never sees the original** when it displays a PDF:

- `fuerAnzeige()` in `http/routen-kontext.ts` takes effect for every answer with `anzeigen: true` and `application/pdf` without an API key – i.e. when viewing in the interface: `GET /api/dokumente/:id/inhalt`, `…/versionen/:nummer/inhalt`, `…/fassung` and `…/archivfassung` (each without `herunterladen`).
- `pdfanzeige.ts` fetches the cleaned copy from the PDF place (`pdf/anzeige.ts`, in the worker pool) and keeps it in memory per SHA-256 of the content (at most 256 MB, oldest out first; failures aren't remembered).
- Removed are JavaScript (`/JS`, name tree `JavaScript`), automatic actions (`/OpenAction`, `/AA`), the actions `SubmitForm`, `Launch`, `ImportData`, `GoToR`, `GoToE`, media actions, XFA forms, embedded files (`/EF`, `EmbeddedFiles`, streams `/EmbeddedFile`) and annotations for file attachments and media. Links (`URI`) and jumps within the document stay.
- If the PDF can't be cleaned (encrypted, damaged), a short text comes (`text/plain`, with sandbox) with `X-DMS-Anzeige: nur-herunterladen`; otherwise `X-DMS-Anzeige: bereinigt` is in the header.
- **Downloading, passing on, export, email and API keys** (also packages) still get the original or the stamped output.

## Worker pool { #arbeiter-pool }

The server answers all requests in **one** thread. Heavy computing work therefore runs in a small pool of worker threads (`node:worker_threads`, #542), without a new dependency:

```
server/src/arbeit/index.ts        arbeite(vorgang, ...args), setting (DMS_ARBEITER), state for system health
server/src/arbeit/pool.ts         worker pool: queue, time limit, memory limit, crash, idle
server/src/arbeit/vorgaenge.ts    what a worker can do: all operations of the PDF place, tables of large exports, demo documents
server/src/arbeit/arbeitsfaden.ts the worker's entry point (built as dist/arbeitsfaden.mjs)
server/src/arbeit/nachricht.ts    messages, Buffers and errors across the boundary
```

- **Calling:** the PDF place passes its operations to the pool itself (`pdf/index.ts`); for everything else `await arbeite('exportTabellen', …)`. The types of parameters and results come from `VORGAENGE`.
- **New operation:** enter a function with simple data as parameters and result (bytes, numbers, texts, lists, simple objects, `Map` – no classes, no functions, no repo, no database) in `vorgaenge.ts`. A `Buffer` arrives in the worker as a `Uint8Array` and `alsBuffer` turns it back into a `Buffer` – also in lists and simple objects. `Fachfehler` arrive at the caller with status and details. The worker writes nothing into the log; notices are in the result.
- **What doesn't belong in it:** small requests (the handover itself costs something: data is copied, with 20,000 table rows about 0.1–0.3 s) and everything that needs database or files – the main thread fetches the data beforehand.
- **Setting:** `DMS_ARBEITER` (0–16; 0 = off, everything in the main thread), default half of the cores from the cgroup's `cpu.max` or `availableParallelism()`, 1 to 4. Time limit 10 minutes, queue at most 50 (above that 503), heap per worker 1.5 GB, idle 2 minutes. Without calling `richteArbeiterEin()` (tests, command `dms`) the pool is created with the first job.
- **Tests:** `server/test/arbeiter.test.ts` checks the pool (result, error, time limit, full queue, crash), the setting, the warning on high waiting time and that the Library loads quickly during a large PDF export (values without and with pool are in the output). In tests the worker runs with `tsx` (load arguments from `ladeArgumente`).
- The **package runner** (`laeufer/`) is a process of its own with a permission model and stays separate from this.

**Warning on high waiting time:** `Auslastung` (`messung.ts`) remembers the p99 of the event loop delay per minute window. If it is above 100 ms in 5 consecutive windows (`SCHLEIFE_GRENZE_MS`, `SCHLEIFE_MINUTEN` in `shared/src/systemlast.ts`), it writes a warning into the log, and `Systemlast.warnung()` reports `schleife` to system health, overview and the Workbench's bar.

**External services (#565):** One measuring point for everything Ablago waits for at other services: `extern` in `server/src/externmessung.ts` (one instance per process like the log; `ablago.ts` sets store and settings). The connectors only report there: `extern.messe({ dienst, funktion }, f)` times a call (measuring point with `erste()`, `bytes()`, `token()`, `ergebnis()`), `extern.erfasse(aufruf)` takes one already measured – OIDC in `Oidc.abruf`, SMTP in the `transport` of `betrieb.ts` (`gemessen`), IMAP per session via `imapGemessen` (when `Postfaecher` is built), packages in the runner (`netzMesser` in `laeufer/prozess.ts`, total as `messung` in the result, recorded in `Paketlaeufer.rufe`; AI service is `istKiPaket`). Only `ExternAufruf` (`shared/src/extern.ts`) is stored, with person and estimated cost: raw data in `extern_aufrufe` (35 days, `ROH_TAGE`), then condensed into `extern_monate` (24 months, `MONATE`; migration 100). Per request the calls go into `Kontext.extern` and from there into the header `Server-Timing` (`extern`, `extern-1` …, `externTiming`); streamed responses ("Ask your library") carry them in the last line (`externDerAnfrage`). Prices and budget are in the setting `extern_kosten`; `extern.pruefePause(paket)` throws 429 "AI features paused until …" before an AI call, `extern.pausiertBis(paket)` holds back the delivery of events. New connectors only call `extern.messe` – never content, addresses or URLs in `funktion`. Test: `server/test/extern.test.ts` (also: no content in tables, evaluation, log, Server-Timing).

## Texts and language files { #texte-und-sprachdateien }

Texts for users are not in the code but in **language files** (#473, #727, part of #357). Built in are German (source language) and English (since #729); Ablago addresses everyone informally ("du" in German), and every language takes the familiar form of address (in English simply "you"). Since #727 all areas have been converted: interface, the server's error messages and notices, emails, history and emergency sheet.

**Rule:** a text that people read belongs in the language file – never as words in the code. CI doesn't let new fixed texts in the interface through (see below).

```
shared/src/sprachen/de/<area>.json            source language German (du), always complete
shared/src/sprachen/de-formal/dritte.json     texts for third parties with "Sie" (see below)
shared/src/sprachen/en/<area>.json            English, British spelling, complete
shared/src/englisch.ts                        loads all English files (a chunk of its own in the interface)
shared/src/sprachwahl.ts                      setting "sprachen", effective language, header X-Sprache
shared/src/sprache.ts                         uebersetzer(), placeholders, plurals, gebietsschema()
web/src/sprache.ts                            t() and tn() with the interface's areas
server/src/sprache.ts                         t() with the server's areas
shared/src/texte.ts                           t() for shared code (area gemeinsam)
```

**Areas** follow the folders:

| Code | Area |
|---|---|
| `web/src/ablage/*` | `ablage` |
| `web/src/werkbank/*` | `werkbank` (plus older Workbench keys) |
| `web/src/profil/*` (My account) | `profil` |
| `web/src/einrichtung/*` (folder type editor) | `mappentypen` |
| `web/src/einrichtung.tsx`, `web/src/assistent/*` | `einrichtung` |
| other files in `web/src` | `oberflaeche` |
| `server/src/**` (errors, notices, history) | `meldungen` |
| emails | `mail` |
| emergency sheet and emergency access | `notfall` |
| `shared/src/*` | `gemeinsam` |

In addition there are domain areas from earlier issues (`anmeldung`, `automatisierung`, `pakete`, `suche` …); their texts stay there.

**Creating a text**

1. Choose the matching area (table above). A new area is entered in `web/src/sprache.ts` or `server/src/sprache.ts`; file name = area, lower case, without a dot.
2. Write the key into the JSON file – flat, parts with a dot or hyphen, starting in lower case: `"vergessen.knopf": "Link anfordern"`.
3. Retrieve it in the code: `t('anmeldung.vergessen.knopf')`. The type check knows all keys and reports typos.

**Naming:** first the component or file, then place and purpose – `vergessen.titel`, `vergessen.knopf`, `fehler.link.abgelaufen`. During the move in #727 the keys arose from file and beginning of the text (`wartungsmodus.alle-jetzt-abmelden`); whoever changes a text may rename the key accordingly. Recurring words ("Save", "Cancel") don't get a shared key – that way every translation stays in context.

**Placeholders** are in single curly brackets: `"passwort.zugang": "Für den Zugang {email}"` → `t('anmeldung.passwort.zugang', { email })`. Names only of letters, digits and `_`. Always store the **whole sentence** with placeholders, never string together parts of sentences – otherwise a translation can't change the order. If a value is missing, `{email}` remains and stands out.

**Building blocks in the sentence** (link, bold, help button) go with `tn()` from `web/src/sprache.ts`: the placeholder gets an element as its value.

```tsx
// "hinweis": "Mehr dazu im {link}.", "hinweis.link": "Administratorhandbuch"
<p>{tn('werkbank.uebersicht.hinweis', { link: <a href={url}>{t('werkbank.uebersicht.hinweis.link')}</a> })}</p>
```

**Plurals** via keys with `_one` and `_other` and the value `anzahl` – instead of `n === 1 ? … : …` in the code:

```json
"dauer.stunden_one": "{anzahl} Stunde",
"dauer.stunden_other": "{anzahl} Stunden"
```

`t('mail.dauer.stunden', { anzahl: 2 })` gives "2 Stunden". The forms follow the language's `Intl.PluralRules` (English needs `one`/`other`, other languages also `few`, `many` …); if one is missing, `_other` applies. A text for exactly one may do without a number ("One folder").

**Dates, numbers, amounts** never format with a fixed `'de-DE'`, but with `gebietsschema()` from `shared/src/sprache.ts` (`de-DE` or `en-GB`, depending on the request's language), e.g. `n.toLocaleString(gebietsschema())`. Fixed formats only remain where a file requires a format (ISO date, CSV for tables).

**Composite keys** (`werkbank.gruppe.${g}`) go through `t.frei(…)` instead of `t(…)`. They escape the type check; the check in CI counts every key with the fixed prefix (`werkbank.gruppe.`) as used. Where you can, write keys out in full.

**Checks in CI** (run with `npm test`, locally in the `server` folder with `node --import tsx --import ./test/lader.mjs --test test/<file>`, see [Getting started](loslegen.md)):

- `sprachdateien.test.ts`: keys the code asks for but that don't exist; keys nobody uses; languages that leave out keys or have extra ones; placeholders that differ between languages; **placeholders a call doesn't supply** (`t('…', { nam })` for `{name}`); plurals without `_other`; empty texts.
- `sprachdateien-fest.test.ts`: **fixed texts in the interface** – text between tags, in visible attributes (`title`, `aria-label`, `placeholder`, `titel` …) and as a value in curly braces. What stays the same in every language (product names, commands in `<code>`, example addresses) is allowed; further exceptions are listed with a reason in `AUSNAHMEN` in the test file.
- `symbole.test.ts`: no coloured emoji and no text characters used as symbols – in the language files too.

**Deliberately still in the code** (#727): log lines (`log.*`, Workbench → Log) stay German so that error messages remain comparable and searchable; the description of the interface (OpenAPI in `server/src/api-v1.ts`) is developer documentation like this handbook; licence texts; sample data and demo content; the titles of the handbook sections in `shared/src/hilfe.ts` (they follow the headings in the handbook and come with its translation, #730); the fixed values of the post choice fields (`POST_STAND`, `POST_KANAL`, `POST_RICHTUNG` in `shared/src/model.ts`) – they are stored like that in every folder; what is shown is their label (see below). Names, fields and help texts of the system folder types have come from `gemeinsam.json` since #728 (`model.systemtyp.*`, `model.systemfeld.*`, `model.systemhilfe.*`).

**Labels per language** (#728, `shared/src/beschriftung.ts`): what administrators create themselves – names of folder types, fields, tabs, result lists and views, help texts and the options of a choice field – is not in language files but on the entry under `beschriftungen`: language → texts, e.g. `{ en: { label: 'Kind', optionen: { Strom: 'Electricity' } } }`. The source text (`label`, `name` …) is German; if a label is missing, it applies. An option is its **fixed value** (`optionen`), and exactly that is stored in the folder; its label comes from `beschriftungen.<language>.optionen`, otherwise from `beschriftungen.de.optionen`, otherwise it is the value itself. It follows that:

- **Always compare with the fixed value** – conditions, automations, API, full export (CSV, JSON), checking the folder. Inputs that may be a label (direct link, advanced search, the answer of a recognition engine) go through `wertZuOption()`. The simple search also finds a value by its label (`optionsGruppen()`, like synonyms).
- **Always show the label:** `formatiere()` returns the label for choice fields (result list, title, export to Excel and PDF, history); names via `feldLabel()`, `feldHilfe()`, `typName()`, `registerName()`, `listenName()`, `sichtName()`, options via `optionText()`.
- **Saving:** the server cleans up `beschriftungen` (valid language codes, only known parts, options only for existing values). If the field is missing entirely when saving, the existing labels stay – an older program using the API deletes nothing that way; `null` or `{}` removes them. Folder types and views store name and description per language in the `beschriftungen` column (migration 080), fields, tabs and result lists in the folder type's JSON.
- **Allowed languages** come from `erlaubteSprachen()`, based on the `sprachen` setting (Workbench → Languages, #729); the server sets them with `setzeErlaubteSprachen()` at start-up and again every minute. Labels in other languages (from a package, say) stay stored.

**Translating:** a new language gets a folder `shared/src/sprachen/<language>/` with the same files and keys as `de`, e.g. `en/ablage.json`. Placeholders stay the same (CI compares them), plural forms follow the language. If you change or add a German text, you maintain the English one too – CI reports missing keys in `en`. Language packs (#731) register their texts via `registriereSprache()`.

**Choosing the language** (#729):

- **Fallback:** `t()` looks in the chosen language, then in English, then in German; an empty text counts as missing. So no place is ever left blank.
- **Which language applies:** that of the signed-in person (`benutzer.sprache`, migration 081), if allowed; otherwise the one the interface sends in the `X-Sprache` header (the one last used, or the browser's); otherwise the installation's (`sprachen.standard`). `GET /api/sprache` names it, the interface loads it before all other modules (`web/src/main.tsx`) and reloads after a change.
- **Server:** every request runs in `mitSprache()` (AsyncLocalStorage in `server/src/sprache.ts`); error messages thus come in the person's language. Emails to one person are built by `mitSpracheVon(person, …)` in their language; emails to all administrators (`anVerwaltende`) pass subject and text as a function (`MailText`) so that every recipient gets their own language.
- **Log lines** go through `tDe()` – always German, regardless of the request.
- **Texts for third parties** (`textDritte`, data protection request, retrieval link) and values the server builds once for everyone (module-level constants, titles and names of the system folder types, texts of the administration items) are in the installation's language – computed at start-up or on creation. System folder types and system fields also carry `beschriftungen` from the language files (`systemBeschriftung()`) so that the interface shows them in every language.
- **Machine-translated languages** (later from packages) show the note "Machine-translated – improvements welcome" in My account; the link leads here.

**Library:** a small implementation of its own in `shared/src/sprache.ts` instead of i18next – no new dependency, offline, the same rules in interface and server. The format (flat JSON, `_one`/`_other`) matches i18next; a later switch remains possible.

## Documents for third parties: informal or formal address { #unterlagen-fur-dritte }

The interface always uses the informal German "du". Texts that go to people **outside** Ablago, on the other hand, follow the setting **Form of address in documents for third parties** (#474, Workbench → Data protection requests → Settings, `Datenschutz.anrede`, default `du`). All these texts are in the `dritte` area of the [language files](#texte-und-sprachdateien): the du version in `shared/src/sprachen/de/dritte.json`, the Sie version in `shared/src/sprachen/de-formal/dritte.json`, each with the same keys and placeholders. They are fetched with `textDritte(anrede, schluessel, werte)` from `shared/src/anrede.ts`. The language file check compares both versions; a test additionally checks that the Sie version contains no "du".

New texts for third parties go as keys into both `dritte.json` files – no `anrede === 'sie' ? … : …` in the code – and into this list:

| Output | Code | Keys |
| --- | --- | --- |
| Data protection request: Deckblatt.pdf, Uebersicht.html, LIESMICH.md (#396) | `server/src/auskunft.ts` | `auskunft.*` (suggested rights: `rechteStandard`) |
| Email with the request as a ZIP, email with the retrieval link (#455) | `auskunftMail` in `shared/src/auskunft.ts` | `mail.*` |
| Retrieval page `/abruf` and its messages (#455) | `web/src/abruf.tsx`, `GET /api/abruf/anrede`, `/api/abruf` in `datenschutz/datenschutz.routen.ts` | `abruf.*` |
| Emergency access `/notfall` (#815) | `web/src/notfall.tsx`, `/api/notfall*` in `anmeldung/anmeldung.routen.ts`, `server/src/notfallcode.ts` | `konten.notfall.*` |
| Emails with folders and documents (#58, #151) | – | none: the user writes the text, only the subject without a form of address is preset |

## Tree via links {#baum-uber-verweise}

Everything that hangs off a folder via links is collected by **one** module – used by the data protection request under Art. 15 GDPR (#396) and by "Delete folder with all linked folders" (#424). New functions that need "everything about this folder" use it instead of their own loops.

- **Types and options:** `shared/src/baum.ts` – `BaumOptionen` (`richtungen`: `verwiesenVon` = folders that link to the node, "downwards"; `verweistAuf` = folders it links to; `tiefe` 1–10; `max` up to 5000; `seitwaerts`; `ohneTypen`; `nurZugehoerigkeit`), `bereinigeBaumOptionen(eingabe, standard)`, `Baum`, `BaumKnoten`, helpers `kinderVon`, `haengtAuchAnderswo`, `wirdAnderswoGebraucht`, `baumZahlen`.
- **Algorithm:** `server/src/baum.ts` – `sammleBaum(quelle, startId, optionen)`: breadth-first search, one access per level for links (`Repo.kantenVon`), folders and readability. Without `seitwaerts` a node only continues in the direction it was reached from (the start folder in all chosen ones). Cycles and multiple paths end up in `auchUeber` and `kreise`; every node appears once. Beyond `max`: `abgeschnitten`. With `nurZugehoerigkeit` it only continues via link fields of the kind membership (`verweisartVon(typ, feldKey)`, default reference); nodes that only hang on via a reference are leaves with `nurBezug` – if the search later reaches them via a membership, they are attached there and followed further (within a level, memberships take precedence).
- **Rights:** the `BaumQuelle` is built by `MitVerknuepften.baumQuelle(zugriff)`; only readable folders are included **and** followed, unreadable ones only count in `verborgen`. To call it: `await dienst.mitVerknuepften.baum(startId, eingabe, zugriff)` (users and roles are excluded unless `ohneTypen` says otherwise), over HTTP `GET /api/v1/mappen/{id}/baum`.
- **Per node:** `typ`, `titel`, `ebene`, `ueber` (parent node, direction, field, `verweisart`), `nurBezug`, `dokumente`, `aussen` (links to folders outside the tree per direction, unreadable ones without a title), `aufbewahrenBis`/`gesperrt` (archive mode #212) and `rechte` (the caller's CRUDP).

The data protection request (`DatenschutzDienst.auskunftVorschau`) and deletion both collect with `nurZugehoerigkeit` (#472, #424): reference nodes only go out as a mention in the request (`AuskunftAuswahl.erwaehnungen`, `erwaehnungText` in `shared/src/auskunft.ts`); when deleting, only their link is removed. Full-text suggestions are no longer part of the request.

Tests: `server/test/auskunft.test.ts` (cycles, rights, upper limit, sideways, membership/reference).

### Deleting with linked folders (#424) { #mit-verknupften-mappen-loschen-424 }

- **Preview and plan** (pure functions, server and interface): `shared/src/loeschbaum.ts`. `MitVerknuepften.loeschVorschau(startId, { tiefe, max }, zugriff)` collects the tree only `verwiesenVon` with `nurZugehoerigkeit` (default depth 5) and adds `kanten` (all links between nodes, not just the tree paths), `geteilt` and `nichtLoeschbar`. Markers (`kennzeichen(v, k)`): 🔒 = `gesperrt`, 📎 = `nurBezug` (never deleted, `loeschen` counts as `entkoppeln`), ⛔ = `!rechte.D` or `nichtLoeschbar`, 🔗 = `geteilt` – narrower than `haengtAuchAnderswo(k)`: only counts outward links of the kind membership via a field the node hangs on in the tree, or to a folder of the same type as in the tree; links to master data (storage location, category) and users don't count, otherwise almost everything would be 🔗.
- **Plan:** `planeLoeschung(vorschau, auswahl)` – a choice per id of `loeschen | entkoppeln | behalten` (missing ids stay). Fixed point: a folder stays if `wirdAnderswoGebraucht(k)` or a remaining folder in the tree links to it without `entkoppeln`. Locked folders are never unlinked.
- **Running it:** `MitVerknuepften.loescheMitVerknuepften` collects again, plans, checks every folder as for a single deletion (`loeschPruefung` with all back-links), cuts the links (`entkoppeln`, right U) and puts everything into the Bin with `Repo.legeVorgangInPapierkorb` in **one** transaction (links among each other first – that way cycles work too). Columns `papierkorb.vorgang` and `papierkorb.entkoppelt` (migration 042). `stelleVorgangWiederHer` and `Repo.stelleMehrereWiederHer` first create all folders, then the links, and restore the unlinked links. Tests: `server/test/loeschbaum.test.ts`.

## Writing folders, even at the same time (#609) { #mappen-schreiben }

Whoever saves last must not reset fields they didn't touch. So for **every** writer of folder values:

- **Write only what changed.** `Repo.aendereMappe(id, werte, [], von, { basis, verweise })` only sets the fields that differ from `basis` (the values read) to the current state – with the row locked (`SELECT … FOR UPDATE`), and the same in memory (`feldweise` in `server/src/repo.ts`). `verweise(w)` computes the links from the result. Internal writers (`schreibeSystemMappe`, `schreibeVerweisWerte`, `absenderBereinigen`, renaming fields) use this; `schreibeSystemMappe` also only gets the fields to change, never `{ ...mappe.werte, … }` from an older read.
- **Version.** `mappen.geaendert` is accurate to the millisecond and increases with every write (`greatest(clock_timestamp(), geaendert + 1 ms)`) so it works as a version counter; no migration needed. With `stand` the repo only writes if the row still has that version, otherwise `StandVeraltet` – `MappenDienst.aendereMappe` then reads again and retries up to five times.
- **Conflict.** `MappenDienst.aendereMappe(id, { werte, stand })`: if `stand` differs from the current one, `feldkonflikte` looks in the history for `geaendert` entries with `daten.stand` > `stand` (each entry remembers the version its write produced). A submitted field that appears there and should now have a different value results in 409 with `Mappenkonflikt` (`shared/src/model.ts`). Without `stand` there is no check, only field-by-field writing – so old API calls stay valid.
- **Form.** `MappeFormular` only sends the fields whose raw value differs from `basis`, and `stand` = `mappe.geaendert` when `basis` was loaded. On 409, `Konfliktfrage` shows the choice per field; "Mine" goes along again with the new version from the response, "Theirs" takes over the value and is left out.

Tests: `server/test/gleichzeitig.test.ts` (memory and PostgreSQL), in the browser `docs/handbuch/screenshots/gleichzeitig-pruefen.mjs` (two windows, workflow "Handbuch").

## System accounts and account roles (#673) { #systemkonten }

Besides people (`benutzer.art = 'person'`) there are two kinds of accounts that never sign in:

| Kind | Example | System role | Rights to folders |
|---|---|---|---|
| `dienst` (#338) | "Paket Texterkennung", one per package with code | **Package** (`rolle:paket`) | confirmed rights from the manifest, restricted by rules for the Package role |
| `system` (#673) | "Automatisierung" (`systemkonto = 'automatisierung'`) | **System account** (`rolle:systemkonto`) | everything except `P`, restricted by rules for the System account role |

- **Creation:** `Konten.systemkonto(kennung)` at start-up (`ablago.ts`), idempotent; in PostgreSQL the index `benutzer_systemkonto` prevents a second account, even with two servers (migration 059).
- **Never usable:** `holeHash`, `listeBenutzer`, `anzahlBenutzer` only see people; `benutzerZu` (session) and `benutzerMitId` (API key) reject system accounts; user management and "Sign in as user" don't know them (`person()`). `personen()` only returns them for names (`aktiv: false`, `art`).
- **Roles:** the role folders `rolle:systemkonto` and `rolle:paket` are created by the [system setup](#systemausstattung) (`kontorollen` in `kern.system()`). `listeRollen()` only returns them with `mitKonten`, `pruefeRollen()` rejects them.
- **Access:** `ZugriffDienst.zugriff(konto)` sets `wer.rollen = [account role]` and trims the folder types with `kontoRegelwerk(typ, rolleId)` (`shared/src/rechte.ts`): default "everything", only rules that name the role (`nenntRolle`). So a strict default for members doesn't lock out an automation, but an administrator can restrict it on purpose. For packages the result is intersected with the confirmed rights. `PostSystemmappen.systemZugriff('automatisierung')` returns the system account's access (for the automation engine, #674).
- **Workbench:** system accounts are never `admin`; which Workbench actions a card allows is up to the card itself (#677).
- **Interface:** Workbench → Users, section "System accounts" (`GET /api/benutzer/systemkonten`, administrators only).

## Passkeys (#811) { #passkeys }

Sign-in with WebAuthn – as a way of its own, as a second factor and for signing in again (#819). The cryptography (CBOR, COSE keys, signatures, counters) is verified by `@simplewebauthn/server` in a pinned version ([dependencies](#abhaengigkeiten)); in the browser Ablago uses the built-in `navigator.credentials` interface without a library (`web/src/passkey.ts`).

- **Where:** `server/src/passkeys.ts` (class `Passkeys`, next to `zweifaktor.ts`), connected to `Konten` with `verbindePasskeys` like two-factor sign-in. The requirement per role uses the same `RollenPflicht` as two-factor sign-in (keys `passkey_pflicht`, `passkey_pflicht_seit`). Routes in `anmeldung/anmeldung.routen.ts`.
- **RP ID and origin** from `betrieb.adresseFuerLinks()` (maintained address, otherwise the request's): only `https://` with a name or `http://localhost` (`relyingParty`). Each passkey remembers its RP ID; if it does not match the current address, it does not count (`passt: false` in the list).
- **Challenge** in the [short-lived state](#kurzzustand): when adding, per account (`passkey-neu`); when signing in, under the hash of a random identifier (`passkey-anmeldung`), with purpose (`anmelden`, `zweiter-schritt`, `bestaetigen`, `dokumentpasswoerter`) and – except when signing in without an email address – the account. 5 minutes; `nimm` redeems it once, also on errors. At most 2000 open.
- **Verification:** `userVerification: 'required'` when creating and signing in, attestation `none`, origin and RP ID from the challenge, counter must increase (otherwise warning "possibly copied"). The counter is saved with `Einstellungen.tausche`.
- **Stored** in the settings under `passkeys_<account>`: `{ liste: [{ nr, id, oeffentlich, zaehler, name, rpId, erstellt, zuletzt, transports, mehrgeraete }] }` – only public data, hence part of the backup and unchanged by `ohneGeheimnisse`. `nr` is Ablago's own identifier for routes and interface; the authenticator's identifier only leaves the server in `allowCredentials`/`excludeCredentials`. The `userID` when creating is the account id (not an email address); signing in without an email address finds the account by it.
- **Decisions only by the maintained address** (security review): `pflichtRp()`/`fuerPflicht()` read `betrieb.gepflegteAdresse()`, never the request's address. The passkey requirement can only be switched on with a maintained HTTPS address (409); if it goes missing later, the requirement keeps applying, closed. If the requirement is on and the person has passkeys but none for the maintained address, or the request comes via another address, `zweiteWege` requires the code or answers 409.
- **Limits:** challenges without an account (`passkey-anmeldung-offen`) per address range (`adressbereich`: IPv4 or IPv6 /64) at most `PASSKEY_OPTIONEN_JE_ADRESSE` in 5 minutes (counter `passkey-optionen-adresse`), plus the emergency brake `PASSKEY_OPTIONEN_GESAMT` (`grenzen.ts`); second step and confirmations (`passkey-anmeldung`) do not count.
- **Requirements:** a passkey for the maintained address also fulfils the two-factor requirement (`Zweifaktor.alternative`, connected by `Konten`); `zweiteWege` then requires it when signing in with a password, and `passkeyNoetig` blocks removing the last one. The passkey requirement stays separate.
- **Purposes:** `bestaetigen` for administration mode and sensitive actions, `dokumentpasswoerter` for "passwords for documents" (`POST …/passkeys/bestaetigen/optionen` with `{ fuer: 'dokumentpasswoerter' }`, then `POST /api/konto/dokument-passwoerter/bestaetigen` with `{ passkey }`) – a challenge is only valid for its purpose.
- **Sign-in protection:** `Konten.anmeldenMitPasskey` counts beforehand with `sperre.versuch` (email of the named account, otherwise empty, and IP); a failure with `fehlschlag`, a success resets – as with the password (#956).

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /api/konto/passkey/optionen` | open | `{ zweiterSchritt? }` → `{ kennung, optionen }` (request options in WebAuthn's JSON format) |
| `POST /api/konto/passkey/anmelden` | open | `{ kennung, antwort, zweiterSchritt? }` → session |
| `GET /api/konto/passkeys` | signed in | own passkeys, `moeglich`, `adresse` (RP ID), `pflicht`, `hoechstens` |
| `POST /api/konto/passkeys/beginnen` | signed in | creation options |
| `POST /api/konto/passkeys` | signed in | `{ antwort, name }` → new passkey (201) |
| `PUT /api/konto/passkeys/:nr` | signed in | `{ name }` rename |
| `DELETE /api/konto/passkeys/:nr` | signed in | remove – only with a fresh sign-in (otherwise 403 with `details.frisch`) |
| `POST /api/konto/passkeys/bestaetigen/optionen` | signed in | options for signing in again; then `POST /api/konto/verwaltung` or `…/verwaltung/bestaetigen` with `{ passkey: { kennung, antwort } }` |
| `GET`/`PUT /api/werkbank/passkeys` | Workbench (sign-in protection) | requirement per role `{ admin, mitglied }`, plus `moeglich` |
| `GET /api/benutzer/:id/passkeys`, `POST …/zuruecksetzen` | Workbench (users) | number, remove all (also `dms passkeys-zuruecksetzen`) |

`POST /api/konto/anmelden` and `…/passwort-setzen` additionally return `wege: { code, passkey }` for the second step; after a provider this is in the address of `/anmelden/code` as `#<kennung>.<c|p>`. `/api/konto/status` contains `passkey: { moeglich, aktiv?, fehlt?, ausstehend? }`, the administration state `passkey`.

**Tests:** `server/test/passkeys.test.ts` with a simulated authenticator (`server/test/hilfen-authenticator.ts`: P-256, attestation `none`, small CBOR) – adding, signing in, wrong origin, reused challenge, counter going backwards, without user verification, sign-in protection, removing without a fresh sign-in, requirement, changed address, administration mode. The smoke test creates a passkey in Chromium with a virtual authenticator (DevTools protocol) and signs in with it.

## State between requests (#744) { #kurzzustand }

Build rule "keep several servers possible later": whatever applies between two requests lives in PostgreSQL – not in a `Map` inside one process. Otherwise an attacker with two processes would get twice as many attempts, and the second sign-in step would end up at the wrong process.

- **Building block:** `Kurzzustand` (`server/src/kurzzustand.ts`, table `kurzzustand`, migration 078): per entry a kind, key, counter, value and expiry. `pgKurzzustand(sql, haushalt)` in operation, `speicherKurzzustand()` in tests and building blocks without a database (same rules, one process). Not in the backup, like the sessions.
- **Counting atomically:** `zaehle` is an `INSERT … ON CONFLICT … DO UPDATE … RETURNING` with a fixed or sliding window – never read-then-write.
- **Exactly once:** `nimm` (`DELETE … RETURNING`) for tickets and identifiers; `belege`/`belegeAlle` for markers "only once in quick succession" and for claims with a deadline ("at most one check at a time" – if a process ends halfway through, the deadline releases it).
- **Secrets:** if the key itself is secret (ticket, `state`, identifier, session), only its hash is stored (`hashe`). Secret values (TOTP draft, PKCE verifier, device code, new emergency sheet) are encrypted by the caller with the vault.
- **Schedules:** `exklusiv(name, f)` takes `pg_try_advisory_lock(744, hashtext(haushalt:name))` on a connection of its own; if another process holds it, the run doesn't happen here (there is never any waiting). In `ablago.ts` as `nurEiner(…)` for the Bin, absences, deadlines (day of the last run also in the short-term state), technical tasks, test restore, RESCUE file, storage transitions and cleaning up the short-term state (every 10 minutes). Daily runs with `laufeFaellige` (backup, summary, automations) were already safe via the marker in the settings.
- **Sign of life:** `lebenszeichen(sql, haushalt)` holds a shared lock per process – since #745 only the leader (the process for background work). Only a process that is alone at start-up resets "running" text recognition to interrupted.
- **Compare and swap** instead of overwriting where two processes change the same value: last TOTP step and used recovery codes (`zweifaktor.ts`), passkey counters (`passkeys.ts`), renewed token of the mailbox sign-in (`postfach-oauth.ts`), toggling maintenance mode (`wartung.ts`, now reads the state from the database at every check).

| What | Kind(s) in the short-term state |
|---|---|
| Sign-in protection: failed attempts per account and IP, per IP, IP blocks, collective and immediate notification | `anmeldung-konto`, `anmeldung-ip`, `anmeldung-ip-sperre`, `anmeldung-meldung`, `anmeldung-sammelmeldung`, `anmeldung-sofortmeldung` |
| Second sign-in step, setting up two-factor | `zweiter-schritt`, `zweifaktor-entwurf` |
| Passkeys (#811): challenge when adding and when signing in, counter per address | `passkey-neu`, `passkey-anmeldung`, `passkey-anmeldung-offen`, `passkey-optionen-adresse` |
| Retrieval page: tickets, failed attempts per scope, one check per link | `abruf-ticket`, `abruf-fehler`, `abruf-pruefung` |
| OIDC, mailbox OAuth (callback, device code) | `oidc-anmeldung`, `postfach-oauth-code`, `postfach-oauth-geraet` |
| WebDAV: counting windows, pending files | `webdav-fenster`, `webdav-schwebend` |
| Protected PDFs: failed attempts, confirmation for document passwords | `pdf-passwort-fehler`, `dokumentpasswort-bestaetigt`, `dokumentpasswort-fehler` |
| Emergency access: block and claim per scope, notification, new sheet | `notfall-sperre`, `notfall-pruefung`, `notfall-fehlversuche`, `notfall-gemeldet`, `notfall-blatt`, `notfall-blatt-erzeugen` |
| Trail in administration mode, personal export, deadline run | `modusspur`, `eigener-export-laeuft`, `eigener-export-fehler`, `fristen-tag` |
| Workbench jobs (#745): claim with deadline, progress, cancelling; own changes to the counters (#742, #745) | `auftrag` (`lauf`, `stand`, `abbruch:<id>`), `eigene-aenderung` |

**May stay per process** (at most makes things slower, never wrong): caches for page images and PDF display, stamped WebDAV versions (#722: at most 64 MB or 2000 entries; since #874 several processes share the bytes, `zwischenspeicher.ts`), protection type per PDF, the provider's discovery and keys (OIDC), settings read with a short lifetime (sign-in protection 10 s, WebDAV 5 s, OIDC 30 s), requests to packages "already requested", limits on concurrent work that protect this process's computing time (scrypt on the retrieval page, uploads per user, questions), metrics and load. What #744 left open for several processes is solved by #745 ([Several processes](#mehrere-prozesse)).

## Tours, tips and anchor points (#831, #832) { #entdecken }

Tours and tips are **data, not code**. Ablago's own live in `shared/entdecken/` – in the same format that packages will later bring as `inhalt/rundgaenge.yaml` and `inhalt/tipps.yaml` (stage 2, checks in [dms-registry #132](https://github.com/motom001/dms-registry/issues/132)). There is one mechanism for everything: a source supplies raw entries, `pruefeRundgaenge` and `pruefeTipps` (`shared/src/entdecken.ts`) check them, and the server filters them per person (`server/src/entdecken.ts`). A package will later only add another source.

| File | Content |
| --- | --- |
| `shared/entdecken/anker.yaml` | fixed anchor points of the interface (machine-readable, also for the registry) |
| `shared/entdecken/rundgaenge.yaml` | Ablago's tour |
| `shared/entdecken/tipps.yaml` | Ablago's tips (order = order of the tip of the day) |
| `shared/src/sprachen/<language>/entdecken.json` | their texts |

The server reads the YAML files at runtime (in the image under `/app/shared/entdecken`, see the Dockerfile). Faulty entries are dropped and logged once; nothing changes for the person.

### Tour {#rundgang}

```yaml
- schluessel: ablago            # lower case, digits, _
  start: erste_anmeldung        # manuell | erste_anmeldung (Ablago itself only)
  fuer: lesen                   # lesen (everyone) | verwalten (only with the right to administer)
  oeffne: { seite: start }      # open this page before the first step
  schritte:                     # at most 8
    - schluessel: dreiteilung
      bild: dreiteilung         # built-in picture
    - schluessel: erledigen
      ziel: [navigation.zu-erledigen, startseite.zu-erledigen]   # the first visible anchor wins
      fuer: lesen               # verwalten: step only for administrators (e.g. Workbench)
```

Texts: title, description and closing sentence under `rundgang.<tour>.titel | .beschreibung | .ende`, per step `rundgang.<tour>.<step>.titel | .text | .text-handy | .text-verwalten | .ort` (underscores in the key become hyphens in the language file). `text-handy` applies on a phone, `text-verwalten` for people who may administer, `ort` tells screen readers where the highlighted element is – it is required for every `ziel`. Packages will write the texts directly into the file (`titel`, `text`, `text_handy`, `text_verwalten`, `ort`). Limits: title 60, texts 200 characters.

At runtime a step is dropped silently if none of its anchors is visible (for example on a phone) – with a note in the console (`console.debug`), without a message for the person.

### Tip {#tipp}

```yaml
- schluessel: suche_in_dokumenten
  bereich: suche                # suche | post | fristen | mappen | konto | verwalten
  ziel: startseite.suche        # anchor with a fixed page …
  # rundgang: ablago            # … or a tour (exactly one of the two)
  fuer: lesen                   # lesen | verwalten
  funktion: fragen              # optional: fragen | laufwerk | mail – only if switched on
  ab_version: 0.216.0           # optional: "New since your last visit"
```

Text under `tipp.<key>`: at most 160 characters and two sentences, addressing the reader as “du”/“you”, only terms from the [glossary](https://github.com/motom001/dms/blob/main/docs/glossar.yml). **Every visible new feature brings its tip in the same PR** (with `ab_version` of the version in which it appears); the wording is checked in the ongoing quality control. At most 20 tips per package.

### Anchor points { #anker }

Targets are fixed anchor points, not HTML ids: the element carries `data-anker="<anchor>"` (on `Link` the property `anker`). The list is in `shared/entdecken/anker.yaml` with page, description, `handy` (also visible on a phone) and `clients` (also exists in clients). Patterns such as `mappe.register:<key>`, `mappe.feld:<key>` and `werkbank.bereich:<route>` match any key. Today they include:

`neu`, `benutzermenue`, `navigation.ansichten`, `navigation.ansicht-waehlen`, `navigation.erweiterte-suche`, `navigation.zu-erledigen`, `navigation.neue-post`, `navigation.favoriten`, `liste`, `mappe`, `startseite.suche`, `startseite.fragen`, `startseite.feld-art`, `startseite.tipp`, `startseite.zu-erledigen`, `startseite.neue-post`, `startseite.termin`, `startseite.zuletzt`, `zu-erledigen.ansicht`, `mappe.aktionen`, `mappe.stern`, `mappe.register:<key>`, `mappe.feld:<key>`, `konto.abwesenheit`, `konto.schrift`, `konto.startseite`, `konto.tipps`, `konto.zusammenfassung`, `entdecken.rundgaenge`, `werkbank.bereich:<route>`, `werkbank.typen.suche`, `werkbank.sichten.suche`, `werkbank.nummernkreise.suche`, `werkbank.auskuenfte.suche`, `werkbank.auskuenfte.nur-offene`, `werkbank.fehlermeldungen.suche`.

`server/test/entdecken.test.ts` checks during the build: every anchor appears in the interface's source, format, targets and tours exist, lengths are right, and every text is there in German and English. Whoever rebuilds an element keeps the attribute; new anchors are added, existing ones are not renamed.

**Behind a toggle (#1002):** if an anchor is not visible yet, `warteAufAnker` (`web/src/entdecken/stand.ts`) announces it with `ankerGesucht`. A page that only shows the spot after switching listens with `beiAnkerGesucht` and switches – only for the moment, nothing is remembered. This way the box on the start page with “Ask · Search” shows the search for `startseite.suche` and the question for `startseite.fragen`.

### Interface and what is remembered {#schnittstelle-und-merker}

- `GET /api/entdecken` – tours and tips for the signed-in person in their language (filtered by the right to administer and by switched-on features), plus the tip of the day (`tipp`), whether the tip line is on (`tippsAn`) and which tour starts by itself now (`starten`). Per tip: anchor and page or tour, origin (`ablago`, later `paket:<id>`), `neu`, `ausgeblendet` and `clients` (suitable for clients: no tour, the anchor exists there too).
- `POST /api/entdecken/tipps/:schluessel` with `aktion`: `gezeigt`, `erledigt`, `ausblenden`, `einblenden`.
- `POST /api/entdecken/rundgaenge/:schluessel` with `stand`: `gesehen` or `spaeter`.

This is stored per person in their settings (`entdecken_rundgaenge`, `entdecken_tipps`, `entdecken_version`; tip line off: `tipps` = false) – no telemetry. While standing in for someone, nothing starts by itself and nothing is remembered. Migration 088 sets Ablago's tour to “seen” for accounts that had signed in before the update. The manual's screenshot and timing scripts mark their accounts the same way (`aufnehmen.mjs`, `ladezeiten.mjs`).

**Packages follow:** `inhalt.rundgaenge` and `inhalt.tipps` in the manifest, the check on installation, Workbench → managing tips (own tips, adjustments) and the export in “Create package” come in a later stage; so do the entries in `/api/v1`.

## Several processes (#745) { #mehrere-prozesse }

`DMS_PROZESSE` (default 1, `auto` = cores − 1, at most 2 (`PROZESSE_EMPFOHLEN_MAX`; with PostgreSQL in the same container at most 2 in future too), 1 GB of memory per process plus 1 GB reserve, and no more than `DMS_DB_VERBINDUNGEN` carries; `prozesseAus`/`empfohleneProzesse` in `server/src/prozesse.ts`, #874). With 1, everything runs in one process as before.

- **Entry point:** `server/src/index.ts` is now only the switch. With more than one process it becomes the lean **main process** (`leite`, doesn't load Ablago) and uses `node:cluster` to start the processes, which begin in `index.ts` again and load `ablago.ts` (the former `index.ts`). In the build, `dist/ablago.js` is a separate file; the import in `index.ts` therefore has no fixed path.
- **Roles:** process 1 is the **leader**. It starts first – `verbund.erster`: start page (#802), migrations, one-off work at start-up – and reports "ready"; only then does the main process start the others (without start page and migrations). If the leader doesn't come up before its first "ready", the main process ends with its code (as before: Docker restarts; the downgrade lock stays in place). After that the main process restarts crashed processes (`neustartWarten`: 1 s, doubled up to 60 s, back to 1 s after 5 minutes of running), the leader too (then without start page). The main process's log only contains number, code and signal.
- **Group** (`Verbund` in `prozesse.ts`): `rufe` (call to the leader with result, parts and domain errors including status), `melde` (to the leader, to all, to the others), `frageAlle` (e.g. `prozess.stand`), `bereit`, `beendeAlle` (restart after a restore, changed database connection, end of the load test). The main process only passes things on (IPC with `serialization: 'advanced'`, so buffers and `Float32Array` too). With one process, `einzeln()` does everything in its own.
- **What the leader does for the others** (`server/src/aufteilung.ts`): triggers for text recognition, thumbnails and the event dispatcher go to it as a message – the others process none of that themselves (a dispatcher without the automations' consumers would have marked events as dispatched). Starting backup, checksum, test and restore, fetching the mailbox, checking intake folders and catching up on thumbnails are calls to the leader; it mirrors running backups and restores to all every second so that `laeuft()` and `aktuellerLauf()` are right everywhere without waiting.
- **Package runner** exactly once, in the leader – it holds the packages' API keys. The others use `Fernlaeufer` (`server/src/laeufer/fern.ts`): actions, vectors, "Ask your library" (parts of the answer come as parts of the call), "Fill in from document", overview. What they need without waiting (which package offers what, the packages' service accounts) the leader sends as a snapshot on every change.
- **Workbench jobs** (`Auftraege.teile`): the job runs in the process that accepted it. "Only one at a time" is a claim in the short-term state with a 60 s deadline that the running process extends every second; it also writes the progress, and `stand()` reads it everywhere. Cancelling from another process sets a marker. Routes with 202 wait with `angemeldet()` until the progress is visible to all. If the process dies, the progress shows "Interrupted".
- **Uploaded packages** are kept until installation (30 minutes) under `files/hochladen/pakete/` (archive and details, `0600`, name from the hash of the identifier) and are read again by the other process with the same checks.
- **Own changes to the counters** (#742): after the household version is incremented, the new version per person is briefly kept in the short-term state (`eigene-aenderung`); another process only asks for it if the minimum validity would otherwise apply.
- **Settings in memory** (encryption key, email sending, OIDC, timing threshold): every process reads the household version `lesen` every 2 seconds; if it changes, `Tresor.nachladen`, `Betrieb.nachladen`, `Oidc.vergiss` and `Messung.start` reload. If key file and fingerprint don't match at that moment (a change in another process), the next tick tries again.
- **Per process:** overload protection, workers (default divided by the number of processes). **Shared** (#874): connections – `DMS_DB_VERBINDUNGEN` applies to all together (default `verbindungenVorgabe`: 10 + 4 per further process), `verbindungsaufteilung` first gives the leader the 4 connections it permanently reserves for session locks (`lebenszeichen`, intake folder, mailboxes and one spare since webhooks were removed, #991 – without them its queries waited forever, and with them everything the others call on it), all share the rest equally (each further one at least 2, the leader at least 6 in total), together at most `max_connections` − 10; caches – `teileZwischenspeicher(anzahl)` gives each process `1/anzahl` of the limits of PDF display, WebDAV stamps and page images. **Heap:** the main process starts every process with `--max-old-space-size` (`haldeJeProzess`: the further ones with 60 % of their share of the memory, 1024–1536 MB; `haldeLeiter`, #891: the leader with 512 MB more, because it also does the work in the background) unless it is already set or only one process runs; the main process itself stays without a limit. The start-up log names both values (`haldeLeiterMb`, `haldeMb`). **Restarts** are counted by the main process (`Verbund.neustarts()`: number and the last ten with number, code, signal) and sent to all with the list of processes. The `dms` command uses a shared key from the main process; the leader writes the file. At start-up, a process only deletes temporary uploads next to others if they are older than 6 hours.
- **System health:** `frageAlle('prozess.stand')` returns RSS, CPU time, event loop delay and running requests per process; plus Pss from `/proc`. For the load test, `/api/werkbank/last` asks `prozess.last`: the same plus the waiting time for connections (`Poolmessung`, #874), which this switches on; plus the restarts. `/api/werkbank/last` reports the memory of all processes together (including the main process) and the delay of the slowest, per process under `engpass.speicher`. Since #920 the load test limit (1.5 GB) applies per process; it compares the sum with the limit × processes.
- **Load test mode:** if the leader is measuring, the others also only listen on the internal port (`listen(0)` shares the same port under `cluster`).
- **Tests:** `prozesse.test.ts` (setting, group with a real `cluster` via `test/hilfen-prozesse.ts`, triggers, remote runner, uploads, counters, jobs, keys), `prozesse-e2e.test.ts` (all of Ablago with two processes: start page, migration once, system health, console, job, crash with restart without signing out, shutdown, downgrade).

## Event catalogue (#670) { #ereigniskatalog }

What happens in Ablago is defined in **one** place: `shared/src/ereignisse.ts` (`EREIGNISKATALOG`), the texts in `shared/src/sprachen/de/ereignisse.json` (`name.<art>`, `text.<art>` – underscore as hyphen –, `gruppe.<gruppe>`). Packages (`code.ereignisse`, exactly the entries with `paket: true` plus the outdated names in `VERALTETE_EREIGNISSE`) and automations (#674) take their events from this catalogue. **The core reports every occurrence exactly once** (#724) – with `kern.ereignis(…)` (in the service `dienst.kern.ereignis(…)`) into the one outbox; there is no longer a second route for packages. The list for reference is in the Workbench with the package under **Which events exist**.

**Rules**

- **Only ids, kind, field keys and date** in `daten` – never values, titles or names. Anyone who wants to know more reads up with their own rights.
- **At least once, in the same transaction:** `dienst.kern.ereignis(art, daten, von)` writes to the outbox (table `ereignisse`, migration 060). If a transaction is running (`inTransaktion`), the event belongs to the change – if one fails, neither is saved. Every event has a fixed id; a consumer recognises a repetition by it.
- **Several servers:** the `Ereignisverteiler` (`server/src/ereignisse.ts`) fetches open events with `FOR UPDATE SKIP LOCKED` and a lock (`gesperrt_bis`, 120 s). Only when **all** consumers have accepted it does an event count as dispatched; otherwise it is retried after 1, 5, 30, 120 and 360 minutes, then given up (log). Dispatched events are kept for 7 days.
- **One rule for retries:** `wiederholungNach(versuche)` in `shared/src/ereignisse.ts` (1, 5, 30, 120, 360 minutes) applies to the outbox and delivery to packages.
- **Consumers in the core:** `automatisierungen`, `pakete` (every subscribed event; ends up with a fixed id per package in the package runner's delivery, `paket_ereignisse`). **Jobs** for exactly one package (`datei.umwandeln`, `datei.volltext`, `datei.archivfassung`, `paket.einstellungen_geaendert`, group `auftrag`) are not an occurrence for others: `dienst.ereignisseDienst.auftrag(paket, art, daten)` puts them straight into delivery.
- **Outdated names:** the core no longer reports `texterkennung.fertig`. A package that subscribed to it gets `volltext.fertig` with `quelle: kern` under the old name (transition, `VERALTETE_EREIGNISSE`, dropped with 1.0.0). **All transitional exceptions** are listed with the version that drops them in `server/src/uebergaenge.ts` (#902); `uebergaenge.test.ts` fails as soon as Ablago reaches that version. New special paths for old packages or files only with an entry there.
- **Bundling:** entries with `buendelS` (today `mappe.geaendert`, 5 s) combine quick successions for the same folder as long as the event hasn't been dispatched yet; the field keys are merged (`mischeFelder`).
- **Deadline reached** exactly once: `frist_meldungen` (folder, field, date, time) as the primary key; remembering and event in one transaction.
- **Silent:** `dienst.kern.ohneEreignisse(f)` – examples, demo data (creating and removing). Only events in which packages process files (full text, vectors, post) go into the outbox with `ausloeser.still` – automations skip them, folder events aren't created at all. A restore marks all open events as dispatched; during maintenance and a restore the dispatcher rests.

**Consumers**

```ts
dienst.ereignisse.abonniere('mein-abnehmer', async (e: KatalogEreignis) => {
  // e.id, e.art, e.daten, e.ausloeser, e.erstellt – throwing an error means: try again later
});
```

The `pakete` consumer passes folder events and `frist.erreicht` on to packages that have subscribed to them, name the type under `code.mappentypen` (their own, others', `*`) and are currently allowed to read the folder with their service account's rights (#686: confirmed rights, setting `paket_verwehrt` per folder type, rules for the role *Package*; otherwise a log entry instead of delivery) – with an id computed from event and package id so that a retry doesn't arrive twice at the package.

**Trigger** (`e.ausloeser`): `{ art: 'benutzer' | 'paket' | 'automatisierung' | 'system', id, konto, kette }`. `dienst.kern.ereignis` takes the trigger from the account (`von`: user or a package's service account) or from `dienst.kern.mitAusloeser(a, f)`. An automation (#674) runs its actions like this:

```ts
await dienst.kern.mitAusloeser({ art: 'automatisierung', id: regel.id, konto: systemkonto.id, kette: e.ausloeser.kette ? e.ausloeser.kette + 1 : 1 }, () => aktion());
```

That way it recognises its own changes and can limit chains. A package isn't notified of its own changes.

**New event:** an entry in `EREIGNISKATALOG` (group, fields, if needed `paket`, `mappentyp`, `buendelS`), texts in `ereignisse.json`, and `await this.ereignis(...)` where the change happens – inside the transaction if possible. If packages should be able to subscribe to it, also in `EREIGNISSE` (`shared/src/pakete.ts`) and in the registry (`schema`, `pruefen.py`).

## Automations (#674) { #automatisierungen }

Small routines without code: **When · And · Then** (Otherwise comes with stage 2). Model and checks in `shared/src/automatisierung.ts`, engine and storage in `server/src/automatisierung.ts` (tables `automatisierungen` and `automatisierung_laeufe`, migration 061; versions since #1006 in `fassungen`, migration 103), texts in `shared/src/sprachen/de/automatisierung.json`.

**Model**

- **Exactly one When card:** an event from the catalogue (all groups except `zaehler`, optionally only one folder type, for `mappe.geaendert` optionally only certain fields and with `angelegt` also on creation – the engine then also listens to `mappe.angelegt`, #1001) or `datum` – "date field reached in N days" (negative: N days ago), daily from a time of day in the household's time zone. The When card sets the **context**: the event's folder (`daten.mappe`, for user events the user folder) and its folder type.
- **And:** conditions from the views' toolkit (`Bedingung` from `sichten.ts`), plus "folder is in view …" and "folder is in the favourites of …" (person, role, field). Each can be inverted (`nicht`), groups `alle`/`eine` one level deep. Evaluated in the database (`Automatisierungshilfen.trifftTeile` → `repo.inKlauseln`); "me" is the system account.
- **Then:** cards in their order; they are carried out by the entries in `DANN_AUSFUEHRER` (`(karte, kontext) => Promise<string>` – the line for the log; in a dry run (`trocken`) they only describe). "Don't run any further automations afterwards" (`stopp`) is handled by the engine itself.
- **Placeholders** as for the folder title (`{feld}`, `{feld|filter}`), plus `{titel}`, `{mappentyp}`, `{heute}`, `{automatisierung}`, for `datum` also `{datum}` and `{tage}`. Values with the system account's rights; titles of linked folders it may not read appear as "(not visible)"; passwords never.

**Sequence**

1. The event catalogue's `automatisierungen` consumer looks for switched-on, non-paused automations with a matching When card and runs them **one after another** by `reihenfolge` (1–99, then name). Each reads the current state.
2. Per automation and event there is **exactly one run** (`UNIQUE (automatisierung_id, ereignis_id)`) – if an event comes again or two servers check the same day, nothing runs twice. For the schedule, the event id is computed from the automation trigger, folder and date; `letzter_tag` is the schedule building block's marker (missed days up to 31 back are caught up).
3. It runs under the system account "Automatisierung" (`dienst.postSystemmappen.systemZugriff('automatisierung')`) and with `dienst.kern.mitAusloeser({ art: 'automatisierung', id, konto, kette })` – history and events show who acted. If the system account may not read the folder, the run is skipped.
4. Every step (When, And, each Then card) is recorded with its state in the run (`schritte`) – the interface shows progress live. A card error ends the run as `fehlgeschlagen` (can be retried); the following automations still run.

**Schedule building block** (`server/src/zeitplan.ts`, #724): `faelligeTage(zuletzt, jetzt, takt)` is the one rule – due is every day after the last one run on which the rhythm applies (`an(tag)`, e.g. weekday, public holiday), as soon as its time of day is reached, at most `nachholenTage` back (0 = only today); a new one begins today. `laufeFaellige(merker, jetzt, takt, lauf)` first records the day (compare and swap, `Einstellungen.tausche`) and then runs – with several servers exactly one does it. Backup, test restore, daily summary (per user) and "date reached" (catch up 31 days) use it; the marker keys in the settings are the same as before.

**Date reached** (`art: 'datum'`): `vorlauf` with `einheit` (`tage`, `wochen`, `monate`), `uhrzeit`, `wiederholung` (months). `erreichteDaten(tag, vorlauf, einheit)` returns the field dates reached on `tag` – for months all D with D − lead time = tag (end of month capped). Old cards (`tage`, `frist.erreicht`) are translated by `bereinigeWenn`.

**One route for to-dos** (`AufgabenDienst.aufgabeAusAutomatisierung`, #724): `aufgabenEmpfaenger` resolves absence and deactivation via `empfaengerAufloesen`; if no active person can be reached, they go to the administrators (`null`). `aufgaben.anlass` (migration 062, `AufgabenAnlass`): `datum` (resolves itself in `fristenAbgleichen` when the date no longer matches; `wiederholung` → next date), `post` (in `postAufgaben` when the post is no longer new), `abwesenheit` (when the absence ends). From "date reached" the to-do becomes a **deadline** (`art: 'frist'`, field, date); the unique index `aufgaben_frist_idx` applies per folder, field, date and recipient – the same person never gets two.

**Then cards** (`server/src/automatisierung-karten.ts`, #676)

- **Change field** (`feld`): `werte` per field key – fixed, text with placeholders (text, long text, formatted text), for date fields also `heute`, `heute+7`, `heute-3`. Writing goes through `MappenDienst.aendereMappe` with the system account's access and only the chosen fields (#609): field formats, required fields, choice lists and link targets are checked as in the form; archive mode and deadline lock are never bypassed. The history carries `automatisierung: { id, name, eingerichtetVon }`.
- **To do / notification** (`aufgabe`): recipient a person, role (all active members), field of the folder (link to a user) or `ersteller` (whoever created the folder); `als: 'aufgabe'` creates a to-do every time (due `faellig` days from today → appears under "Upcoming"), `als: 'benachrichtigung'` bundles per automation, folder and recipient (one open, the text is updated). Anyone who may not read the folder gets it on their own user folder – without a link. Stage 1 fills placeholders with the system account's rights (recipient rights: #683).

**Interface** (`web/src/werkbank/Automatisierungen.tsx`, #675): Workbench → Build the Library → Automations, in three parts. Cards from the supply come in via `useZiehen` (drop zones `wenn`/`und`/`dann`) or via "+ Card" (choice field, keyboard); Then cards and the list "by trigger" are sorted by dragging or Alt+↑/↓ (order is reassigned in steps of ten). **Live progress by polling:** as long as the editor is open, it fetches `GET …/:id/laeufe` every 2 s – the steps are in the database, so this works with several servers, without SSE and without session affinity. The list asks every 15 s. At start-up, `legeBeispiele()` creates three switched-off examples (origin `dms`, fixed ids from `uuidAus`) if they don't exist yet.

**Protection and limits** (`AUTOMATISIERUNG_GRENZEN`)

- No self-triggering (own changes don't trigger the same automation), chains at most 3 deep, brake at 30 runs per minute (then paused), run time 60 s, 200 automations, 20 cards per area, history of 200 runs or 30 days.
- **Working comes before automating:** if something is missing (folder type, field, view), that never blocks work – the automation turns red and is paused (`angehalten.grund = 'fehlerhaft'`), at the latest on the next run or schedule pass. Saving only works with a valid state.
- Demo data and examples trigger nothing (`ohneEreignisse`); during maintenance and restore the dispatcher rests. After a restore all switched-on automations are paused until an admin switches them on again.
- Saving with `version` (outdated state → 409). Versions as for all Workbench settings (#1006, `server/src/fassungen/`, table `fassungen`): restoring goes through the normal save. In the full export: `struktur/automatisierungen.json` (each automation with its versions, `version` = number of the version) and `struktur/fassungen.json`; all tables in the backup.

## Automation templates and folder runs (#1044) { #ablaufvorlagen }

An **automation template** is an automation with gaps that you apply to one folder; an applied one is a **folder run**. “Assign task” and “Remind” are such templates – there is no separate path for reminders and tasks assigned by hand any more. Model and checks in `shared/src/ablaufvorlagen.ts`, the flow in `server/src/aufgaben/ablaeufe.ts` (`MappenAblaeufe`, `dienst.ablaeufe`), routes in `aufgaben.routen.ts`, UI in `web/src/werkbank/Ablaufvorlagen.tsx` and `web/src/ablage/Aufgaben.tsx` (`Geplant`, `NeueAufgabe`, `ErinnerungFormular`, `AblaufFormular`). Migration 105.

**Model**

- **Template** (`Ablaufvorlage`): `wann` (`sofort`, `datum` – asked when applying –, `in` with `anzahl` and `einheit`), `fragen` (`empfaenger`, `datum`, `text`), `karten` – only `aufgabe` (`VORLAGEN_KARTEN`, task or notification) with recipients `frage` (the answer), `selbst` (who applies), `ersteller` (who created the folder) or `feld` (reference to users; only with fixed `typen`). `vorlagenEingabeFehler` rejects anything else (no silent clean-up), `vorlagenProbleme` checks the structure.
- **Key** instead of id: core defaults `aufgabe_vergeben`, `erinnern` (`KERN_VORLAGEN`, `kernVorlage()`), from packages `paket:schluessel`, own ones `eigen:<uuid>`. A core default is only stored (`ablaufvorlagen`; versions like all Workbench settings in `fassungen`, kind `ablaufvorlage`, since migration 107) once an admin changes it or a package **overlays** it with `ersetzt` – then under its key; without a row the core default applies. Runs name the key (`mappen_ablaeufe.vorlage`) and stay valid whoever delivers the template.
- **Folder run** (`MappenAblauf`, table `mappen_ablaeufe`, formerly `erinnerungen`): template, folder, answers (`empfaengerId`, `text`), `datum` (when it runs), `erstelltVon` (the person) and `angehalten`. “Straight away” creates none.

**Flow**

1. `anwenden(folder, key, answers, person)` – the route has checked read access and recipient (`darf`, `empfaengerSichtbar`). Answers as the dialogs did before (same messages), **brake** `ABLAEUFE_JE_PERSON_UND_MAPPE` (open per person and folder) and `ABLAEUFE_JE_MINUTE` (applied per person and minute, via `ablauf_verlauf`) from `grenzen.ts` – otherwise 429.
2. **Straight away** runs in the same request: as fast as before (without further placeholders no engine, no recipient access). Otherwise the run is created; if its date is today or earlier it runs at once.
3. The daily run (`Fristen.fristenLauf` → `ablaeufe.faellige`) takes each due run out of the table in **one transaction** (`loescheAblauf` returns true to exactly one caller – several servers) and executes its cards.
4. **Rights at run time** (`pruefePerson`): the person is an active user (no package or system account) and may read the folder **now**. Otherwise `angehalten` (`person`, `deaktiviert`, `leserecht`, `vorlage`) – note in the workbench overview and in the email to the administrators; `fortsetzen` checks again.
5. **Cards** go the to-do way: straight away `manuell`, otherwise `erinnerung` with date, creator = person, the same history entries (for `erinnern` word for word as before), deputy (`leiteUm`), case without read access (`faelleNach`, #798); notifications bundled (`benachrichtigeGebuendelt`, key `ablauf:<key>`). The **engine** fills placeholders (`dienst.ablaufPlatzhalter` → `Automatisierungen.fuelleMit`) with the rights of the person and the recipient (#795); `MappenAblaeufe` inserts `{eingabe}`, `{person}`, `{empfaenger}` afterwards so an input never becomes a placeholder itself. Hand-written text stays visible to recipients without read access (no `anlass`).
6. **History** per template in `ablauf_verlauf` (applied, planned, ran, paused, deleted, resumed), cleaned up like the runs of automations.

**Templates from packages** (`inhalt.ablaufvorlagen`, from `DMS_ABLAUFVORLAGEN_AB` = 0.256.0): `pakete.ts` reads and checks them (only allowed cards, `ersetzt` only for core defaults, types of the package or its dependencies); the permissions preview lists each with its cards (on an update “new” or “different cards”). `MappenAblaeufe.ausPaket` creates or replaces unchanged ones; on removal overlays return the core default, templates with open runs stay as own ones.

**Conversion** (migration 105): `erinnerungen` → `mappen_ablaeufe` with `vorlage = 'erinnern'`; `erstellt_von` stays; if it is empty or not a human, it becomes the recipient. The bin reads older entries as runs of “Remind”. `AufgabenVertretung.legeAufgabeAn` is now just the template “Assign task”.

**API:** `GET`/`POST /api/v1/mappen/{id}/ablaeufe`, `PUT`/`DELETE /api/v1/ablaeufe/{id}`; the endpoints for tasks and reminders stay and go through the same templates. In the full export `struktur/ablaufvorlagen.json` and `daten/ablaeufe.jsonl`.

## Routes to the outside { #wege-nach-draussen }

Ablago **never opens a connection** to the internet on its own. Every route to the outside is switched off until a person triggers it or an administrator switches it on. The overview for users is in the administrator handbook under [What leaves your library](https://help.ablago.app/admin/aktuell/en/datenschutz/#was-deine-ablage-verlasst).

| Route | Who switches it on | What goes out | Where in the code |
| --- | --- | --- | --- |
| Package catalogue | Administrator at the push of a button, setup assistant in the "Packages" step | only the request to the catalogue | `server/src/pakete.ts`, `katalogsignatur.ts` |
| Version check | Administrator at the push of a button (Workbench → Technology) | commit identifier, no data from the Library | `server/src/system.ts` |
| Email | Administrator sets up the mail server; users send | sent folders and documents, daily summary (titles, links), invitations, data protection requests, info email to emergency contacts (#812: text only, no link, only three names; at most 20 per day) | `server/src/mail.ts`, `aufgabenmail.ts`, `notfallkontakte/` |
| Mailbox | Administrator sets it up | fetching from your own mail server | `server/src/postfach.ts`, `postfach-oauth.ts` |
| Sign-in via a provider | Administrator | sign-in process with the provider | `server/src/oidc.ts` |
| Package network | Administrator confirms on installation | only to the addresses from the manifest or service address | package runner, right `netzwerk` |
| Retrieval links (data protection request) | Administrator creates the link | the request, only after the retrieval code | `server/src/abruf.ts` |

Download (also a letter from template, #1040), email, export and the WebDAV drive ask one **shared checkpoint** in `server/src/ausgang/` (#723, [outgoing](#ausgang)): read and export permission per folder, through `dienst.ausgang.pruefeAusgang` or `dienst.ausgang.mitnehmbar`.

**Rule for new routes:** a new route to the outside needs an approved issue, is **switched off** until someone explicitly switches it on, sends as little as possible (numbers instead of content where that's enough), is listed in this table and in the overview in the administrator handbook, and is reviewed by security.

## Counter endpoint and key levels (#625) { #zaehler-endpunkt }

Other programs (home automation, wall tablet, clients) often only want to know **whether there is something new**. For that there is `GET /api/v1/ich/zaehler` (internally `/api/ich/zaehler`, `SichtenDienst.zaehlerAbruf`):

```sh
curl -i -H "Authorization: Bearer dms_…" https://dms.example.org/api/v1/ich/zaehler
# HTTP/1.1 200 OK
# ETag: "z42-mJ3x0Qe7Kq9VZ1aB2cD3eF"
# {"neuePost":2,"zuErledigen":5,"ueberfaellig":1,"stand":42,"geaendert":"2026-11-03T07:15:00.000Z"}

curl -i -H "Authorization: Bearer dms_…" -H 'If-None-Match: "z42-mJ3x0Qe7Kq9VZ1aB2cD3eF"' https://dms.example.org/api/v1/ich/zaehler
# HTTP/1.1 304 Not Modified   (no content)
```

- **Numbers only.** The response never contains titles, names, senders or content – not even in future fields. The OpenAPI schema `Zaehlerstand` has `additionalProperties: false`; the test `server/test/zaehler-api.test.ts` checks the keys and that no texts slip through.
- **Where the numbers come from.** `zuErledigen` is `eingang` from `SichtenDienst.zaehler` (#512), `ueberfaellig` counts your own overdue entries from `Fristen.termine` (#528, #725; `anstehend` was dropped with #725), `neuePost` counts post with the status "New" and "For" = me or empty via `zaehleKlauseln` – with its own `Zaehlerspeicher` keyed to the household version. All within the user's rights (read filter); nothing is recomputed for the endpoint as long as nothing in the household changes.
- **Version in the database** (table `zaehlerstaende`, migration 056). For each request the server builds a hash of the numbers (`fingerabdruck`), compares it with the stored one and only increments `stand` if they differ (`Repo.setzeZaehlerstand`, an `INSERT … ON CONFLICT DO UPDATE … WHERE abdruck IS DISTINCT FROM …`: concurrent requests count a change once). Unchanged means: read only. The household version from #512 only lives in memory and starts at 0 after every restart – so it isn't suitable as an ETag. The ETag is `"z<stand>-<hash>"`: the same ETag means the same numbers, even after a restart or a restore.
- **ETag and 304.** `passtEtag` (`http/routen-hilfen.ts`) understands lists, `W/…` and `*`. A route sets its own headers via `Antwort.koepfe`; it reads request headers via `Anfrage.kopf(name)`. `Cache-Control: private, no-cache` instead of `no-store`, so that programs may revalidate.
- **Key level "counters only"** (`recht = 'zaehler'`, `NUR_ZAEHLER` and `ZAEHLER_PFAD` in `apischluessel.ts`). `pruefeZugang` only lets it through to `GET /api/v1/ich/zaehler`; every other route under `/api/v1` and – explicitly – every internal route with such a key in the header gets `403` (`api.schluessel.nur-zaehler`), and so does the drive (`webdav.ts`). "Read passwords" doesn't exist for this level. A new interface that accepts API keys must reject this level in the same way.
- **Limits.** The overload protection (#544) counts these requests too. There is no limit per key; a request answered from the cache costs a few milliseconds. If Ablago runs on several servers, each has its own cache (as with #512, at most 5 or 30 minutes old) – until then two servers may briefly return different numbers, and the version then increments more often than necessary.

**Adding another number:** add a field to `Zaehlerzahlen` (`dienst.ts`) and to the OpenAPI schema, and to `ZAHLEN` in the test – and only numbers. If the meaning of an existing number changes, increase `v` in the hash so that every client reads once more.

## Reporting to the outside { #nach-aussen-melden }

Ablago does **not** report changed numbers on its own: clients query `GET /api/v1/ich/zaehler` with `If-None-Match` (see above). The separate counter webhook (#627: `server/src/webhook.ts`, tables `webhooks` and `webhook_meldungen`, setting `webhook_ziele`, Workbench → Webhooks, My account) was removed with #991 – two ways for the same thing contradict "the same thing in one place" (pattern C9). Migration 106 drops the tables and the setting; old backups can still be restored, because the restore runs the migrations afterwards.

Whoever wants to report something to the outside in future uses an [automation](#automatisierungen) with the Then card "Call URL" (#671). It brings its own protection for destinations; nothing from the old webhook (destination list, signature, outbox) is reused for it.

More background in the administrator handbook: [Technology](https://help.ablago.app/admin/aktuell/en/technik/) and [Decisions](https://help.ablago.app/admin/aktuell/en/entscheidungen/).
