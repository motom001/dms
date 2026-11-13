# Performance {#leistung}

Ablago should stay fluent even after years with many folders. For this there is a benchmark, a test that checks it in CI, and a measuring script for more precise measurements (#367).

## Benchmark { #messlatte }

With **10,000 folders and 20,000–30,000 documents** (full text 5–50 KB per document), the median must stay within:

| Operation | Limit |
|---|---:|
| Opening a folder (`MappenDienst.holeMappe`) | 200 ms |
| A folder's document list (`listeDokumente`) | 200 ms |

That also applies **while** demo data with documents is being created and text recognition is running in the same process. Measured on an ordinary computer, the values today are in the single-digit millisecond range; the limit leaves room for a slow NAS.

**Small hardware:** Ablago promises to be quick even on small hardware. The yardstick for this are the devices under [Tested platforms](https://help.ablago.app/installieren/aktuell/en/plattformen/) and the values under [What Ablago copes with](https://help.ablago.app/admin/aktuell/en/verkraftet/): the target is p95 below 0.3 s at the load-test level "klein" and below 1 s at "mittel" – also on a NAS such as the UGREEN DXP4800 Plus tested by the project. Measurements on a Raspberry Pi 5 will follow ([#578](https://github.com/motom001/dms/issues/578)).

The values are in `MESSLATTE_MS` in `server/test/leistung-messen.ts`.

## Test in CI { #test-in-der-ci }

`server/test/leistung.test.ts` runs with `TEST_DATABASE_URL` (automatically in GitHub Actions, otherwise skipped). It creates a database of its own with 1,200 demo folders and their documents and

- measures "opening a folder" and the document list – exceeding the benchmark is only a **warning** (`t.diagnostic` and `console.warn`), because run times vary between computers;
- checks **strictly** that document lists don't read the full text (`DOKUMENT_SPALTEN` in `repo-pg.ts` without `volltext`, but with every other column of the table – a new column must be added there);
- checks **strictly** that the export reads in bundles: no accesses per folder or document (no N+1 queries).

The test takes about 20 seconds.

## Measuring script { #mess-skript }

For measurements with the full data stock and before/after comparisons (from `server/`):

```bash
MESS_DATABASE_URL=postgres://postgres:dms@127.0.0.1:5432/dmsmessung \
  node --import tsx test/leistungsmessung.ts --neu --mappen 10000 --export 2000 --explain --last
```

- `--neu` creates the database **anew** (an existing one of the same name is deleted) and generates the data with a fixed seed – the same data on every run. That takes a few minutes (the full-text search indexes).
- Without `--neu`, the existing stock is measured, e.g. before and after a change.
- `--export N` measures the export (like "Export my data") over the first N folders: total time, time in the database and accesses per method.
- `--explain` outputs the plans (`EXPLAIN (ANALYZE, BUFFERS)`) of the most important queries.
- `--last` measures the same accesses again **while** demo data with documents is being created and text recognition is running in the same process (on a copy of the database), plus the event loop delay.

## Timing a request { #zeitmessung-einer-anfrage }

Every route's answer carries the header `Server-Timing` (#11, #477):

```
vor;dur=0.1, app;dur=211.5, db;dur=154.7;desc="8", rechte;dur=2.6, json;dur=0.7, gesamt;dur=212.4
```

| Part | Measured |
|---|---|
| `vor` | arrival of the request (hook `onRequest`) until the handler starts |
| `app` | handler, contains `db` and `rechte` |
| `db` | sum of database accesses (`Messung.umhuelle`), in `desc` their number |
| `rechte` | evaluating permissions (`ZugriffDienst.zugriff`, `rechteAn`, `rechteAnVielen`, `lesbare`), overlapping calls once, without the database accesses in them (`rechteMessen` in `messung.ts`) |
| `json` | `reply.send` until the hook `onSend` – converting the answer into text |
| `gesamt` | arrival until `onSend` |
| `zs` | only for requests that need the views' numbers (#512): duration and in `desc` `treffer` (cache) or `neu` (counted) |

If a request waits because Node.js's one thread is computing for another one, the server only accepts it afterwards – that is then not in `vor` but in the "line" part of the browser's timing. For this, `Auslastung` (`perf_hooks.monitorEventLoopDelay`) measures the event loop delay; Workbench → Database shows it. Whole requests over the threshold for long accesses land with their breakdown among the long-running accesses (`zugriff` begins with `Anfrage:`).

In the browser, `shared/src/zeitmessung.ts` splits up the time further with Resource Timing: "Waiting (browser)" (`startTime` to `requestStart` without connection set-up – the browser sends at most about 6 requests at once) and "Line" (round trip minus `gesamt`).

## Loading times of the interface { #ladezeiten-der-oberflache }

`server/test/ladezeiten.mjs` loads start page, a list and a folder in Chromium as an administrator, as a member with a role and as a member without a role (with rules that produce a read filter in SQL) and summarises Server-Timing per page. Against a running Ablago with a fresh database:

```bash
DMS_URL=http://localhost:3100 CODE=<setup code> node server/test/ladezeiten.mjs --einrichten --mappen 50000
DMS_URL=http://localhost:3100 N=5 node server/test/ladezeiten.mjs
```

**Measurement for #477** (50,000 demo folders without documents, local computer, median of 5 loads, mean of two alternating runs; server = sum of all requests of the page, which partly run at the same time):

| Page | Who | Load before ms | Load after ms | Server before ms | Server after ms | of which permissions ms |
|---|---|---:|---:|---:|---:|---:|
| Start page | Administrator | 562 | 360 | 659 | 464 | 2 |
| Start page | Member with role | 452 | 306 | 585 | 393 | 4 |
| Start page | Member without role | 492 | 288 | 583 | 339 | 4 |
| List (4,120 invoices) | Administrator | 636 | 401 | 770 | 520 | 2 |
| List (4,120 invoices) | Member with role | 504 | 328 | 687 | 385 | 4 |
| List (4,120 invoices) | Member without role | 450 | 332 | 617 | 379 | 3 |
| Opening a folder | Administrator | 570 | 414 | 717 | 527 | 6 |
| Opening a folder | Member with role | 584 | 362 | 890 | 470 | 5 |
| Opening a folder | Member without role | 441 | 325 | 650 | 443 | 4 |

Finding: evaluating permissions in memory only costs a few milliseconds per page (below 1 %); the suspicion from the issue wasn't confirmed. The time was in the database, in two requests that every page of the Library makes:

- `/api/anstehend` (today `/api/termine`) loaded **all** folders of every type with deadline fields and filtered the date in memory. Now `mappenMitDatum` only fetches folders with a date in the period (measured individually about 250 → 30 ms).
- `/api/sichten` counted the inbox with an `EXISTS` per folder; for members with a read filter the whole counter ran **a second time** without the filter for this. Now one query over the open tasks counts the inbox, once for everyone.

Target value: with the same data, a member loads start page and Library at most 10 % more slowly than the administrator – met (even faster, because for the administrator deadlines without a recipient are also pending). The event loop delay stayed below 16 ms at 99 %. The biggest item now is `/api/sichten` (counters per type and view, 150–230 ms with 50,000 folders, the same for all users). #512 fixes this (next section).

## The views' numbers (#512) { #zahlen-der-ansichten-512 }

The numbers next to the views (`GET /api/sichten` → `SichtenDienst.zaehler`) count all visible views with **one** query per `count(*) FILTER (WHERE …)` over all folders of the household, plus types, inbox, favourites and bin – 120–150 ms alone with 50,000 folders, 150–260 ms under the page's load. Two remedies:

1. **Don't block.** The interface (`web/src/daten.tsx`) loads types, people, views and the frame (`GET /api/sichten/rahmen`: bin days, view "New post" – without counting) and shows the Library; the numbers come afterwards (`zahlenDa`). Until then "…" stands in their place (`ZahlWarte`, likewise the start page's tiles); nothing jumps. When reloading, the old numbers stay until the new ones are there. What derives something from the numbers (the list's search field, usage when removing a field) doesn't wait for them.
2. **Cache** (`server/src/zaehlerspeicher.ts`). The **household state** (`Haushaltsstand`) counts up as soon as a changing method of the repo has finished – the `Dienst` wraps its repo with this (`transaktion` counts as a whole). Reading and inconsequential methods (history, events, text recognition, "seen" …) are in `OHNE_FOLGEN`; a new method counts until it is listed there. The key per entry: user, role and a fingerprint of read filter, hidden views and own roles (since #742 a fingerprint of the permissions without the person, see [below](#sparsam-gemerkt)); valid with the same state and the same `heute`, so at most until midnight. Views with a date reference (`heute`, month, year, deadline) are valid for at most 5 minutes (`ZEITABHAENGIG_MS`), all others for at most 30 minutes (`HOECHSTENS_MS`, safety net for changes bypassing Ablago in the database, for instance by hand). Simultaneous requests with the same key wait for the same count. A hit costs about 7 ms (session, permissions, loading views), counting anew 110–150 ms.

**Measurement for #512** (the same data as #477, `server/test/ladezeiten.mjs`, median of 5 loads, of which the median of three alternating runs; within the run, the cache hits for all loads after the first):

| Page | Who | Visible before | Visible after | Numbers there before | Numbers there after | `/api/sichten` before | `/api/sichten` after | Load before | Load after |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Start page | Administrator | 388 | 273 | 337 | 176 | 213 | 56 | 460 | 312 |
| Start page | Member with role | 381 | 269 | 310 | 182 | 185 | 60 | 388 | 255 |
| Start page | Member without role | 344 | 247 | 263 | 165 | 144 | 54 | 335 | 219 |
| List of invoices | Administrator | 392 | 277 | 303 | 237 | 201 | 80 | 427 | 396 |
| List of invoices | Member with role | 385 | 263 | 302 | 141 | 189 | 36 | 405 | 226 |
| List of invoices | Member without role | 312 | 271 | 264 | 155 | 146 | 36 | 374 | 261 |
| Opening a folder | Administrator | 875 | 284 | 305 | 134 | 201 | 30 | 445 | 282 |
| Opening a folder | Member with role | 882 | 324 | 302 | 165 | 179 | 43 | 409 | 282 |
| Opening a folder | Member without role | 487 | 283 | 293 | 153 | 173 | 33 | 439 | 268 |

*Visible* = until tiles, the list's first line or the folder's header can be seen; *Numbers there* = until the answer of `/api/sichten` is in the browser; `/api/sichten` = server time of this request (under the page's load; alone 6–9 ms with a hit); *Load* = until no request is running any more. All values in ms, local computer. "Visible" varies a lot for "Opening a folder" (individual runs around 870 ms in both versions).

Not implemented: **only counting what can be seen** (collapsed groups, closed view selection on the phone) – with 1 and 2 the Library no longer waits for the numbers, and a hit costs single-digit milliseconds; partial counting would only split up the cache. An **index** for individual conditions isn't worth it either: the one query reads all of the household's folders once anyway (seq scan), and it only runs after changes now.

## Fewer queries per request, remembered sparingly (#741, #742) { #sparsam-gemerkt }

With many simultaneous users, the round trips to the database are the real queue (10 connections). So first **ask less**, then only **remember what is rare and the same for everyone** – the brief: "don't overdo it and don't write too much into the cache".

**Household state in the database** (migration 077, part of #744): two numbers.

- `lesen` (table `haushaltsstand`, per household) counts up via trigger with every change to `mappentypen`, `sichten`, `pakete` and `einstellungen` – in the same transaction, at commit (`DEFERRABLE INITIALLY DEFERRED`). Whoever sees the new state also sees the new data; that also applies to changes bypassing Ablago. A new entry starts at the time in microseconds so that no remembered old state hits after a new schema. The backup takes the table along without content (`OHNE_INHALT`).
- `zahlen` (sequence `haushaltsstand_zahlen`) is counted up by the server after every changing method of the repo (`Haushaltsstand` in `zaehlerspeicher.ts`, `OHNE_FOLGEN` as before) – after the change has been committed, simultaneous changes together, without the request waiting for it. A sequence instead of a row: with a row, the simultaneous changes in the load test "with saving" waited for their lock.
- Sign-in reads **session, person and both states in one query** (`KontoRepo.holeAnmeldung`): validity of the session, household, "active" and kind of person are in the same `WHERE`. A second process or server is thus at most slower, never wrong.

**What is remembered** (`server/src/lesespeicher.ts`):

| What | Where | Why | Expiry |
|---|---|---|---|
| Folder types (`listeTypen`) | `pgRepo`, `Lesespeicher` | every request needs them for access; large JSONB fields; rarely change | state `lesen` different |
| Views (`listeSichten`) | likewise | several times per request (numbers, list, permissions) | state `lesen` different |
| Packages (`listePakete`) | likewise | with every notice and every event | state `lesen` different |
| Settings from `GEMERKTE_EINSTELLUNGEN` (among others two-factor requirement, post, bin, favourites, stamps, storage location, data protection) | `pgEinstellungen` | the same for everyone, without secrets; the two-factor requirement with every request | state `lesen` different |
| The Library's numbers per type and view | `Dienst.bestand` (`Zaehlerspeicher`) | one count over all folders, 100–200 ms with 50,000 | state `zahlen` different, after the minimum validity; time-dependent ones after 5 minutes, otherwise 30 minutes, at midnight |
| The person's numbers (inbox, favourites, bin, views with "me") | `Dienst.persoenlich` | small counts, but with every load of the Library | as above |

Every retrieval from the `Lesespeicher` gets a copy of its own (`structuredClone`); within a transaction the repo never reads from it (`imTx`). The keys are fixed – the store doesn't grow with the number of people (at most 64 entries per connection; the numbers at most 500 per store). **Never remembered beyond the request:** sessions, people, roles, access and read filters. Access, roles and the everyday recipient for tasks (#719) are formed by `jeAnfrage` once per request (before, twice in 16 handlers); anew after a change in the same request, in a transaction and after 10 seconds (background work from a request). A request likewise only uses the state from the sign-in until its first own change.

**Numbers by permission fingerprint** (#742): the key of the shared numbers is a hash of exactly the count's inputs – read filter (permissions including roles and temporary read permission), clauses of the visible views and administration mode. The same inputs give the same query and the same number; whoever may read something else has a different key – also in and after administration mode. Views whose conditions mean the person themselves ("is my favourite", "For me") count among the person's numbers. Types and views are counted by **one** run (`zaehleBestand`, before two). **Minimum validity** `MINDESTENS_MS` (3 s): after other people's changes, the previous value briefly stays for requests; one's own changes (`Kontext.benutzerId`) show immediately, background work (summary) always counts afresh. Only the process that saved them knows about one's own changes. In Server-Timing, `zs` shows the shared count.

**"Opening a folder"** reads independent things at the same time (folder and tasks; after checking read permission back-links, references, documents, notes, reminders, unfitting links) and only writes "last opened" and "seen" after the answer (`Antwort.danach`, `Nachlauf` in `http.ts`). Nobody waits for it: waiting per person lined up the requests of the same session one after another in the load test (three sessions, 100 requests at once). `danach` is therefore only for memos that may arrive a moment later.

**Measurement for #741 and #742** (local, 2 cores, PostgreSQL 16, load-test data mittel: 50,000 folders; before = `main` with #740, #743 and #746, after = this state). *Queries per request* = SQL statements of a request after the first load (counted via postgres.js's `debug`, only for the measurement); the number `db` in Server-Timing counts accesses to the repo and therefore also hits in the read cache.

| Request | Administrator in the mode | Member with role | Member without role |
|---|---:|---:|---:|
| Start page (`/api/startseite`) | 10 → 5 | 10 → 5 | 12 → 7 |
| Numbers (`/api/sichten`) | 12 → 2 | 15 → 4 | 16 → 5 |
| Next date (`/api/termine/naechster`) | 5 → 2 | 8 → 4 | 9 → 5 |
| Folder types (`/api/typen`) | 7 → 2 | 7 → 2 | 8 → 3 |
| List of a view | 9 → 5 | 9 → 5 | 10 → 6 |
| Opening a folder | 20 → 12 | 17 → 11 | 20 → 14 |
| Numbers after a change by the administrator | 16 queries, 421 ms → 4, 128 ms (own change: counted anew) | 21, 364 ms → 4, 3 ms | 22, 126 ms → 5, 4 ms |

Load test mittel (`server/test/lasttest.mjs mittel --dauer 30`, three runs each, alternating before and after):

| Run | p50 before | p50 after | p95 before | p95 after | Requests/s before | Requests/s after | Memory at most before | after |
|---|---|---|---|---|---|---|---|---|
| mittel (read only) | 510 / 462 / 508 | 469 / 463 / 485 | 1,002 / 889 / 995 | 790 / 812 / 819 | 167 / 178 / 169 | 195 / 197 / 189 | 629 / 692 / 646 MB | 789 / 832 / 838 MB |
| mittel + saving | 1,540 / 1,276 / 1,445 | 1,239 / 1,059 / 1,254 | 3,258 / 3,062 / 3,051 | 2,679 / 2,270 / 2,598 | 55 / 63 / 61 | 71 / 79 / 72 | 1,136 / 1,228 / 1,224 MB | 1,138 / 1,264 / 1,236 MB |
| of which writing | 1,957 / 2,061 / 1,787 | 2,065 / 1,696 / 1,867 | 4,399 / 4,766 / 4,316 | 4,662 / 4,319 / 5,117 | | | | |

Times in ms. Reading gets faster (p95 −18 %, 15 % more requests per second), and so does saving; saving itself stays the same. Memory rises higher in the first run (more requests, copies from the read cache); at the end of both runs it is the same – the caches don't grow with the load (fixed keys, at most 64 or 500 entries). Waiting for a free connection increases (p95 50–110 ms → 75–255 ms, with saving up to 590 ms): "Opening a folder" now asks at the same time, and more requests get through.

## Calendar in "To do" (#528, #725) { #kalender-in-zu-erledigen-528-725 }

Month and year in "To do" load their period with **one** request: `GET /api/termine?von=…&bis=…` (optionally `&favoriten=1`) (at most 400 days, `zeitraumProblem` in `shared/src/kalender.ts`). The server only fetches folders with a date in the period (`mappenMitDatum`, #477); for fields with a **recurring** deadline additionally all folders with a date until the end of the period, because their future dates (`folgetermine` in `shared/src/fristen.ts`, date + k · interval) can fall into it – since #918 only those for which this is possible ([pre-filter](#vorfilter-918)). These dates are never stored. Like the views' numbers, the answer is in the cache (`Zaehlerspeicher`), per user, permissions and period; the `Haushaltsstand` also counts with changed reminders (`ZAEHLT_FUER_TERMINE`), because they are otherwise in `OHNE_FOLGEN` (since #742 a shared state in the database instead of a `fristenstand` of its own).

**Measurement for #528** (the same data as #477: 50,000 demo folders, local computer; median of 5 requests; *cold* = a new period per request, *hit* = the same period from the cache; time until the complete answer):

| Query | Who | Entries | of which future dates | cold ms | hit ms |
|---|---|---:|---:|---:|---:|
| List 30 days | Administrator | 545 | – | 32 | 9 |
| Month | Administrator | 934 | 377 | 160 | 9 |
| Year | Administrator | 11,863 | 11,863 | 381 | 81 |
| Month | Member with role | 0 | 0 | 74 | 6 |
| Year | Member with role | 0 | 0 | 141 | 6 |
| Month | Member without role | 0 | 0 | 81 | 6 |
| Year | Member without role | 0 | 0 | 120 | 7 |

The administrator is the worst case: all deadlines without a recipient belong to them, in the demo data almost all contracts with a yearly notice period. The year is then 3.2 MB of JSON (without compression); in the browser the year view still stands after about 0.1–0.2 s, the month after 0.1–0.3 s. The members have no deadlines of their own in the demo data; their time is spent searching for candidates. In a household with a few dozen deadlines everything is in the range of the list.

### Pre-filter, folder state and number of results (#918) { #vorfilter-918 }

Principle: **lagging behind is fine, wrong never** – what is shown may be a few seconds old but is never wrong; your own change is visible straight away. Every shortcut returns the same as a fresh calculation (`server/test/zwischenspeicher-termine.test.ts` compares it).

- **Pre-filter `fristtermine`** (migration 086): per folder and field every value that looks like a date (text `JJJJ-MM-TT`), plus its month as a number (year · 12 + month − 1). Maintained by a trigger in the same transaction as the folder – so it is right on every path: interface, API, import, demo data, Bin, restoring a backup (COPY fires the triggers; the table itself is in `OHNE_INHALT`), changes by hand. It does **not** depend on the fields of the type: which fields are deadlines and their rhythm come from the type on every query, so a change to the type needs no maintenance. The migration fills the existing data.
- **Recurring deadlines** (`fristKandidaten`, `kannTerminHaben` in `shared/src/fristen.ts`): a follow-up date date + k · n months always lies in the month (month of the date + k · n); only the day is capped at the end of the month. So a folder is a candidate if a month of the period lies a multiple of n (k ≥ 1) after the month of the date – integer arithmetic in SQL. Yearly deadlines in one month: about a twelfth of the folders; monthly: almost all, but then only id, type, title and the date values instead of the whole folder. Values for which calculating with months is not safe (day 00, month 13, year before 0100) are always candidates. The date itself is then calculated by `folgetermine` as before – no nightly run.
- **Start page** (`naechsterTermin`): first the next 31 days, only without a date there the whole year (same result; the order for the same date is unambiguous).
- **Folder state** (sequence `haushaltsstand_mappen`): counts like the household state, but not for `NUR_FAVORITEN` (star). The counts per type and view, the number of results and the dates without "favourites only" depend on it; whatever refers to favourites (`mitFavoriten`) stays with the household state. Note, history and "seen" are in `OHNE_FOLGEN` anyway. Your own changes apply straight away, also across processes (a kind of its own in the short-term state), and in the same process even before the database has counted up (`lokal`).
- **Number of results** (`seiteMitZahl`): per request without page and order, only with the same state and without minimum validity – it stays exact. With a known number, `seite` only fetches the page (`zahl`), also without `count(*) OVER ()` for a search. Searches in documents and notes always count: their texts don't change any state.
- **Switch** `DMS_ZWISCHENSPEICHER=aus`: every `Zaehlerspeicher` calculates afresh on every call (counts, number of results, dates, new post). The read cache for folder types, views and settings (#741) stays – it depends on the state `lesen`, which a trigger counts in the same transaction. Notice in system health (`/api/werkbank/systemlast`, `zwischenspeicher`) and in the load test report.

### Saving a task and a note (#928) { #speichern-928 }

In the load test "+ saving", creating a task or a note was the slowest operation. **Finding** (local, 2 cores, 50,000 folders, 40,000 tasks, 25 concurrent + saving; repository accesses per request summed up from the measurement): no single query was expensive – under load **every** round trip to the database costs 10–12 ms (waiting for a connection and CPU time), and `POST /api/mappen/:id/aufgaben` made 31 of them before answering, the note 12. Not part of the answer were: reconciling the cases without read permission (#798, 6 accesses) and the dispatcher of the outbox (automations, packages, webhooks – it started straight away in the context of the request and shared connections and CPU time with it), plus the folder's type, the system folder types (three `holeTyp`) and names read twice. The transaction and the household state play no part when creating: task and note run without `mappen.transaktion`; household and folder state count up after the answer (sequence, 1 ms). The `mappen.transaktion` in the log belongs to "change folder" (mean 190 ms). Its `SELECT … FOR UPDATE` on the folder, however, held up every new task, note, history entry and star of the **same** folder until the end of its transaction: the foreign key checks with `FOR KEY SHARE`, which waits for `FOR UPDATE`.

**Changed:**

- **After the answer** (`Dienst.nachDerAntwort`, `Kontext.nachAntwort`, via the `Nachlauf` of #741): reconciling the cases (`faelleNach`), as long as no temporary read permission is attached to the folders – if one is, straight away, because it ends with the task ("wrong never"); the overview in the Workbench reconciles by itself before showing anything anyway. Likewise waking the dispatcher; the event is already in the outbox. Without a request (tests, background, automations) both run straight away as before. Whatever the follow-up work itself triggers runs along with it.
- **Reading less:** the folder's type from the check at the start, the recipient's name once, `holeTyp` from the remembered folder types (`Lesespeicher`, state `lesen`; inside a transaction still from the table).
- **`FOR NO KEY UPDATE`** instead of `FOR UPDATE` when changing field by field and when assigning a number: two changes of the same folder still wait for each other, new tasks, notes, history entries and favourites no longer do.
- **Number in "To do"** (`eingangSql`): `empfaenger_id = $me OR ($admin AND empfaenger_id IS NULL)` turned the generic plan of the prepared statement into a hash join over all folders of the household (50,000 folders: 16 ms, growing with the stock). Now two branches (`UNION`) over the partial index `aufgaben_offen_empfaenger_idx (empfaenger_id, mappe_id) WHERE erledigt IS NULL` (migration 087), the folder per hit via its key: 3 ms, independent of the number of folders. It counts exactly as before.
- **Views with favourites only** ("is my favourite") among the person's numbers start from the favourites (`nurFavoritenVon`): if every clause of a view requires a favourite of the same person, a run of its own counts only over their favourites instead of over all folders of the types (50,000 folders: 34 ms → 0.2 ms). Altogether the person's count (`zaehlePersoenlich`) costs 1.5–2 ms instead of 34 ms.
- Recalculating only on task changes was not needed: a note does not count up any state (`legeNotizAn`, `historieSchreibe`, `legeKatalogEreignisAn` are in `OHNE_FOLGEN`), a star only the household state (#918). Each person then recounts their own numbers – at 2 ms instead of 34 ms a third state is not worth it.

**Measurement** (`server/test/lasttest.mjs --gleichzeitig 25 --mit-speichern --ohne-export --dauer 60 --mappen 50000`, own accounts, 2 cores, PostgreSQL 16; p50 / p95 in ms):

| Operation | before | after |
|---|---:|---:|
| Task (create or complete) | 233 / 439 | 164 / 301 |
| Note | 156 / 255 | 139 / 210 |
| Star | 84 / 168 | 72 / 155 |
| Home page | 76 / 200 | 74 / 156 |
| Change folder | 304 / 452 | 307 / 453 |
| all requests | 99 / 252 | 99 / 228 |

On the server (handler, median): creating a task 304 → 204 ms with 31 → 22 accesses before the answer, note 142 → 118 ms with 12 → 11. "Change folder" remains the slowest writing operation (transaction); that is a topic of its own. `server/test/aufgaben-zaehler.test.ts` records: the same numbers as the previous query, with and without cache, with deputy, temporary read permission, tasks without recipient and from automations; your own task and note are visible in the next request; temporary read permission ends with completing the task straight away.

## Load test { #lasttest }

`server/test/lasttest.mjs` (#544, #563) sends many **simultaneous HTTP requests** to a running Ablago – the counterpart to the measuring script, which measures individual database accesses. Without dependencies, only with Node.js's `fetch`. In the image it is the command `dms-lasttest` (operators: Administrator manual → [Running the load test yourself](https://help.ablago.app/admin/aktuell/en/lasttest/)).

**Load-test mode** (#612): with `DMS_LASTTEST=klein|mittel|gross|extrem|alle`, Ablago only listens on 127.0.0.1 (free port) and starts the script as a child process (`fork`, IPC) against this address; under the actual port there is only the page with progress and result (`server/src/lasttestmodus.ts`, `web/src/lasttest.tsx`, shared types in `shared/src/lasttest.ts`). The script reports its steps with `process.send` (only with an IPC channel; nothing changes on the console) and at the end sends report and result block with the placeholders `{{geraet}}` and `{{speicher}}`, which the page fills in. Beforehand, `lasttest.mjs --pruefen` checks the lock protecting the real Library without creating anything; if it triggers, Ablago starts normally and reports the reason in the Workbench overview (`lasttestAbbruch`). `DMS_LASTTEST_DAUER` corresponds to `--dauer`, `DMS_LASTTEST_MAPPEN` (only extrem, 500000 or 1000000) to `--mappen`, `DMS_LASTTEST_SPEICHERN=nein` to `--ohne-speichern` (#739). Tests: `lasttestmodus.test.ts`, with PostgreSQL `lasttestmodus-e2e.test.ts` (level klein with 3 s measuring time, about one minute).

```bash
# start a fresh DMS (own, empty database), then one level or all – the script sets up by itself
# and adds the demo folders per level (5,000, 50,000, 200,000; 2 % with a letter as PDF) and 30 accounts for the people (#920)
node server/test/lasttest.mjs klein --ziel http://127.0.0.1:3100 --grenzen
node server/test/lasttest.mjs alle --ziel http://127.0.0.1:3100 --dauer 120 --bericht bericht.md --json lasttest.json --grenzen
# extrem (#739) only by hand; locally for trying out with fewer folders (the report names the stock)
node server/test/lasttest.mjs extrem --mappen 1000000 --ziel http://127.0.0.1:3100 --bericht bericht.md
node server/test/lasttest.mjs extrem --mappen 60000 --ziel http://127.0.0.1:3100 --dauer 10 --schritt-dauer 10 --bis 50
```

You start a matching Ablago from `server/` with an own, empty database (e.g. `dmslast`): `NODE_ENV=production DMS_DATENWURZEL=/tmp/dmslast DMS_EINRICHTUNGSCODE=aus DATABASE_URL=postgres://…/dmslast PORT=3100 node dist/index.js` after `npm run build -w server`. Delete the database again afterwards.

**Protecting the real Library:** if Ablago is fresh, the test sets it up (household "Lasttest", accounts with persona names under `example.org`, examples, a role, rules as in a household). If it is already set up, it only measures if it can sign in with its administrator account and at most 200 folders aren't demo folders – otherwise it stops with exit code 2 without creating anything. After new demo folders it waits until the background work (text recognition, thumbnails) is over.

**Profile:** every "person" sends one request after another, mixed as in everyday life – start page (`/api/startseite`, `/api/sichten`, `/api/termine/naechster`, `/api/typen`) 15 %, list of a view 25 %, opening a folder 25 %, search 15 %, thumbnail 10 %, downloading a document 10 %. "100 at once" means: 100 requests are constantly under way. If a person gets 503, they wait as `Retry-After` says.

**Accounts of their own** (#920): person *i* sends its requests with account *i mod `PERSONEN_MAX`* (30, `personKonto`): `lasttest-person-NN@example.org`, "Person NN (Lasttest)"; every third without a role like Petra, the others with the role "Steuern und Finanzen" like Jonas. The test creates missing accounts while preparing, as administrator (`POST /api/benutzer`, roles taken from Jonas; an account without a password gets a new link), signs them all in without administration mode (five at a time) and signs them out again at the end of the level or the run. Thumbnail, download and history used to go as administrator; now with the person's own account – people without a role only in folder types they see completely (`gesamt` equal to the administrator's), so there is no 404 for them. Workbench queries (`/api/werkbank/last`, `/system`, `/systemlast`), the export alongside and tidying up stay with the administrator's measuring session in administration mode (#873). All sign-ins happen before measuring and only with the right password – sign-in protection only counts failed attempts, and the sign-in protection probe (own account, own address via `X-Forwarded-For`) is unaffected. Reason: with three shared accounts, simultaneous changes waited for the same row in `kurzzustand` ("own change" marker, `zaehlerspeicher.ts`) and for `UPDATE sitzungen SET zuletzt_aktiv` – real users don't. The report (`personenText`) and the result block (`Personen: …`) mark measurements with accounts of their own; earlier ones aren't directly comparable, above all for "+ Speichern".

**With saving** (#739): after the previous run of each level follows a second one with the same concurrency (and with mittel with an export alongside) according to `PROFIL_SPEICHERN`: the read shares × 0.85, plus 5 % history (`HISTORIE_LESEN`, #800: first page with 100 entries, `GET /api/mappen/:id/historie?max=100`, since #920 with the person's own account; with its own p50/p95 in the report) and 10 % writing (`SCHREIBEN`) – changing a folder 4 % (`PUT /api/mappen/:id` on a text or long text field, not unique, without pattern), star 2 % (`PUT`/`DELETE …/favorit`), note 2 % (create or delete one's own), task 2 % (create for oneself, complete it next time). Targets are, per view, up to 50 of the first 200 folders that the member without a role sees – all accounts may read and change them; the run fetches the targets itself, so the previous one starts unchanged. With gross and extrem it runs after recovery with as many at once as the limit (otherwise like the first step). Afterwards `aufraeumen`: stars and notes gone, values back, open tasks from the run completed (own ones and "Changed" for favourites, #422); what remains are entries in the history and completed tasks. Measurement without target and without CI limit; writing requests with 4xx are in the report ("Rejected") – then the test isn't right. The old lines of the result block (also memory and event loop) only count the previous runs; new are `… + Speichern` per level and `Mit Speichern: Arbeitsspeicher …`.

**Levels** (#563; the levels "normal" and "Überlast" from #544 are merged into them; `--stufe normal` and `ueberlast` run as `mittel` and `gross` respectively)

| Level | What | Data | Checked (`--grenzen`) |
| --- | --- | --- | --- |
| klein | 25 at once, `--dauer` seconds | 5,000 folders | **Target:** p95 < 300 ms. **CI limit:** p95 300 ms, no errors (no 5xx, no request without an answer), no 503 |
| mittel | 100 at once, alongside one large export after another: PDF of up to 1000 folders with overview, PDF of the folders with documents, ZIP of the largest view | 50,000 folders | **Target:** p95 < 1 s. **CI limit:** p95 1,000 ms (equal to the target), error rate < 0.1 %, no 503, every export succeeds |
| klein/mittel/gross + saving (#739) | like the level (gross: limit), 10 % writing, tidying up afterwards | like the level | **Measurement**, no target, no CI limit, no influence on the exit code |
| gross | 5, 10, then from 25 at once 25 more every `--schritt-dauer` (120) seconds (`--start` begins exactly there), until p95 > 3 s, error rate > 1 % or the overload protection kicks in (503); then 1000 at once (at most 60 s) with a sign-in protection probe, then recovery | 200,000 folders | **Measurement:** limit = highest level without stopping; with `--vorher` a warning if it is more than 20 % below that of the last run. **Required:** no request without an answer after 60 s, Ablago's memory ≤ 1.5 GB **per process** (#920, `speicherVerfehlt`: highest process from `engpass.speicherJeProzess`, without per-process figures the sum against 1.5 GB × 1), server stays reachable, recovery (20 requests in a row with p95 ≤ 1 s) within 30 s, sign-in protection blocks even the right password after wrong ones (429) |
| extrem (#739) | like gross; only by hand, not in `alle` and not in the schedule | 500,000 (default) or 1,000,000 folders (`--mappen`) | **Measurement** like gross; in the workflow without `--grenzen`. In report and result block additionally: duration of creating the demo data (runs of 50,000 each via the Workbench, then background work) and size of database and documents (`GET /api/werkbank/system`) |

Output per run: requests, per second, median, p95, p99, error rate (5xx and without an answer), rejected (503, with `Retry-After`), event loop delay (p99 and maximum), waiting for a database connection, Ablago's memory (start, maximum, end), plus duration and size of every export and median/p95 per kind and the **bottleneck** across all processes (#874: waiting for connections, connections in use, locks, CPU of PostgreSQL and Ablago, memory per process; [Several processes](#mehrere-prozesse)). The test reads the server's values every 2 seconds via `GET /api/werkbank/last`. At the end is the **result block** to copy – without the target's address, without names; the CPU model only if the test runs on the same computer. With `--json` everything as a file (also input for `--vorher`); with `--gleichzeitig <n>` (and `--ohne-export`) a single run.

**Why these limits:** klein and mittel are a **quality promise** (Thomas, #563): a household should experience Ablago as fluent, a small business also with an export alongside. The **targets** (p95 < 0.3 s and < 1 s respectively) are clearly stricter than the generous limits from #544 (p95 ≤ 5 s and 6 s respectively, error rate ≤ 1 %). Because the very first run on GitHub's computers missed the target of mittel, a **CI limit** of its own applies to the exit code (Thomas's decision, #563): first GitHub run + 20 % (run 41448183378, Ablago 0.139.0: klein p95 95 ms → stays at the target 300 ms; mittel p95 2384 ms → 2860 ms). It only gets stricter, never looser, until it reaches the target – after the speed-up (#615; run 41549943703, Ablago 0.146.0: mittel p95 586 ms) that has happened: CI limit = target for klein and mittel. A missed target is in the report (section "Target missed", in the workflow as a notice) and leads to a follow-up issue "Speed up"; the run only turns red above the CI limit. Both are in `STUFEN` (`ziel`, `ciGrenze`) in `server/test/lasttest.mjs`, checked by `server/test/lasttest-grenzen.test.ts`. Gross, on the other hand, is a **measurement**: where the limit lies depends on the hardware; the run reports it and warns on clear deterioration instead of turning red. Locally, on a loaded computer with 2 cores, klein was at p95 525 ms and mittel at p95 4.7 s – not meaningful, but a hint that a computer with 2 cores doesn't meet the promise for mittel.

**Overload protection** (`server/src/ueberlast.ts`): more than `DMS_MAX_ANFRAGEN` (250) simultaneous requests to `/api/` and `/webdav` are answered immediately with 503 and `Retry-After: 5` by a hook before anything else. Counting runs from arrival until the answer is finished or the connection is closed (`close`). Exempt: `/api/gesundheit` and `/api/werkbank/last`. In addition the server accepts new connections with a longer queue (`backlog: 2048` instead of 511). Programs that don't respect `Retry-After` and ask again immediately also immediately get their 503; on the test computer with 2 cores, with 1000 at once, about 1–2 % of requests then stayed without an answer after 60 s, although the server didn't process any request longer than 15 s – the load test itself (on the same computer) could no longer keep up with setting up connections.

**Database connections** (`server/src/db.ts`): default 10, configurable with `DMS_DB_VERBINDUNGEN` (2–100; since #874 for all processes together, default then 10 + 4 for each further process). Measured with 100 at once without export, two rounds each: 5 connections 3,894–4,117 requests per minute (p95 2.7–2.9 s), 10 connections 3,516–3,726 (p95 2.9–3.1 s), 20 connections 3,512–3,517 (p95 2.9 s) – level within the variation. `Verbindungswarten` measures every 5 seconds with `SELECT 1` how long a query waits for a free connection (including round trip and event loop waiting time); Workbench → Database connection shows median and maximum of the last minute. Since #1198 at most one measurement runs at a time; if it waits longer than `VERBINDUNG_WARNUNG_MS` (10 s), the log warns with `belegung()` (in use, reserved, waiting from `sql.stats` of postgres.js 4, locks held). The pool has `queue_timeout` = `VERBINDUNG_WARTEN_S` (30 s): after that `QUEUE_TIMEOUT`, which `http.ts` answers with 503 and `datenbank: true`. `Datenbankpruefung` (for `/api/gesundheit`): `SELECT 1` with a 2 s limit, cached for 5 s, never two waiting checks at once.

**Workflow** `.github/workflows/lasttest.yml`: weekly (Wednesday nights) and by hand ("Run workflow", optionally level, duration and for extrem the number of folders) – not on every pull request, because GitHub's computers vary and a run takes a good hour. It starts PostgreSQL 17 as a service, builds the server, measures all three levels with `--grenzen` (CI limit of klein or mittel or a requirement missed → run red; target missed → notice) and attaches the report to the run (summary; report, JSON and Ablago's log as an artefact). It remembers the limit of gross in the cache (`lasttest-gross-…`) for the warning on the next run. After gross (so also with `alle`) and extrem it restarts Ablago with the whole stock: `server/test/startzeit.mjs` measures the time until **reachable** (start page "Ablago is starting …") and until **ready** (`/api/gesundheit` 200) and attaches it to the report (#802; `startzeit.json` in the artefact). Start it by hand before a bigger release.

**extrem in CI** (#739): level `extrem` only via "Run workflow"; the job's time limit is then 350 instead of 180 minutes (GitHub allows 6 hours). The demo data arises as with gross via the Workbench (`POST /api/werkbank/demo`, 50,000 per run) – no separate route directly into SQL, so that the same checks apply and the load-test mode in the browser measures the same. On GitHub's computers, 50,000 folders with 50,000–200,000 existing took 54–72 s; for 1 million about 20 runs of 1–3 minutes are therefore to be expected (roughly 30–60 minutes), plus the background work (waited for at most 15 minutes) and the steps of the limit. Space: locally 60,000 folders occupied 125 MB in the database and 3 MB of documents (about 2 KB per folder); 1 million folders thus need roughly 2–3 GB plus WAL – far below the computers' 14 GB. The run's summary names the free space afterwards.

**Sped up in #615** (search and "opening a folder" under load): measured with samples from `pg_stat_activity` during the run, `EXPLAIN ANALYZE`, Server-Timing and a CPU profile of the server (`--cpu-prof`). The causes, in order of their weight:

1. **Search folded every folder anew.** Title and every value went through `dms_falte` (unaccent) and `jsonb_each_text` with every search – roughly 200 ms of database computing time per query with 20,000 folders, and a search needs two to five queries (counting, page, without hits once more with similar words). Now the folded text is in `mappen.suchtext` (migration 055, trigger); the search pre-filters with it and afterwards compares exactly per title and value as before – the same hits, 10–15 ms per query. With a search, PostgreSQL only sorts after filtering (sub-query with `OFFSET 0`): otherwise the generic plan of a prepared query went through the whole title index for rare terms (over 100 ms).
2. **Writing under load.** Every long-running access was an INSERT of its own with its own commit – under load almost every second request; that slowed the database down exactly then (waiting for `WALWrite`/`WALSync`). Now collected. "Opening a folder" writes "last opened" and "seen": both are now one statement each without waiting for the disk (`ohneWarten` in `repo-pg.ts`); before, the commits kept the user's row locked so long that simultaneous requests of the same user waited for each other (`Lock:transactionid`).
3. **Lists sorted all folders of a view.** With `typ_id = ANY(…)`, PostgreSQL 16 doesn't use the index `(haushalt_id, typ_id, lower(titel))` for the order; a single type is therefore an equality in the query (`typIn`): one page of the largest view 1 ms instead of 45 ms.
4. **Duplicate accesses per request.** The access already reads folder types and the user's roles (`z.typen`, `z.a`); list and "opening a folder" don't read them again. "Opening a folder" reads the folder's tasks once (for the rule "with task", the answer and "seen") and checks back-links and references in one access: 15 instead of 19 accesses (member 18 instead of 24), the list 10 instead of 12. The start page only asks whether there is a folder of one's own instead of counting all folders per type; `heuteIn` only creates its `Intl.DateTimeFormat` once (before, a good 3 % of the server's computing time).

Load test mittel on the test computer (2 cores, load test on the same computer, PostgreSQL 16): p95 before 3.9 s, after 0.75 s (120 s per run); numbers per action in the release notes of #615. Afterwards Node.js's one thread is the bottleneck (converting answers into JSON, masks for passwords, socket writing by postgres.js), no longer the database.

**Sped up in #740 and #743** (search, lists, saving; migration 075):

1. **Search via indexes.** `mappen.suchtext` is never empty (NOT NULL) and has a trigram index. The hits come as one set of ids (`UNION` of folder, notes and documents, each via its index); only afterwards does the query check type, conditions and read filter; total and page in one query (`count(*) OVER ()`). Whether "Did you mean …?" finds something is asked by `gibtTreffer` (`EXISTS … LIMIT 1`).
2. **Sorting via indexes.** `(haushalt_id, lower(titel), id)` for views over several types, `(haushalt_id, typ_id, erstellt|geaendert)` and `(haushalt_id, erstellt|geaendert)`. Descending, PostgreSQL reads the same index backwards; for this there is no `NULLS LAST` in the query for title, created and changed (the columns are NOT NULL; a title is only missing briefly before it is first calculated). Without a search only the first page counts; when paging, the interface sends the number along (`gesamt`).
3. **Duplicate check via an index.** `dms_gleichwerte(werte)` returns a fingerprint of field key and `lower(trim(value))` (md5 as uuid) per text and number value; the GIN index over it finds equal values, afterwards they are compared exactly. `findeDoppelte` checks many folders in one query (fit after saving).
4. **Saving in one go.** Creating and changing run in one transaction (starting over on deadlock); the title is in the same UPDATE as the values. The event distributor sets "distributed" per fetch in one statement.

Measured with 50,000 demo folders and 25,000 documents (measuring script, median of 7 runs, `SichtenDienst.seite` and `aendereMappe` respectively, 2 cores, PostgreSQL 16):

| Case | before | after |
|---|---:|---:|
| All types, title ↑ | 98 ms | 14 ms |
| All types, created ↓ | 141 ms | 9 ms |
| Invoice, title ↓ | 61 ms | 8 ms |
| Invoice, created ↓ | 50 ms | 7 ms |
| Search "Strom" across all types | 88 ms | 14 ms |
| Search "Strom" with notes and full text | 381 ms | 164 ms |
| Search without hits | 56 ms | 2 ms |
| Saving a contract (unique field) | 33 ms | 12 ms |

Individual queries (`EXPLAIN ANALYZE`): page over all types by title 49 → 0.6 ms, by created descending 54 → 0.5 ms, invoice by created descending 33 → 0.3 ms, duplicate contract number 17 → 0.2 ms. Load test mittel (30 s per run, load test on the same computer): p95 1274 → 693 ms; with saving p95 3.8 → 3.2 s, writing requests p50 2.3 → 1.7 s. With the indexes, the table `mappen` grows from 46 to 76 MB; the migration took 4 s.

**Measurement for #542** (worker pool, measured alternately before/after): with 10 simultaneous requests with export, p95 fell from 2,172 to 786 ms and the event loop delay (p99) from 1,373 to 135 ms; details in the release notes of #542.

## History with large amounts (#800) { #historie }

Since #800 retrievals also go into the history (download, API, WebDAV). So that it stays fast with many folders and years:

- **Only when the tab is opened** and **page by page**: the interface loads 100 entries (`?max=100`), "Load more" the next ones after the last (`?vor=<id>`, keyset over `(zeit, id)`, no `OFFSET`). Opening a folder doesn't read the history. Without `max` the interface delivers everything as before.
- **Index** `historie_mappe_idx (mappe_id, zeit DESC, id DESC)` (since #57) carries both: the pages and the look "same retrieval already today?" (only the folder's entries of the last 26 hours). An index of its own for the kinds isn't worth it (see measurement); #800 needs no migration.
- **Suppressing noise:** the same retrieval (person, file, version, route) once per calendar day in the installation's time zone; simultaneous retrievals of the same file are checked and written one after the other within a process. A day instead of a "WebDAV session", because Explorer, Finder and Office have no recognisable session (they keep connections open and read again in the background) and because a day is equally understandable for all routes – "on Tuesday Jonas retrieved the contract".
- **No partitions per year:** reading is always per folder via the index – partitions by time don't help there (every query would have to look into every partition), and deletion never happens by age, only with the folder according to the deletion concept. Only if retention by time came would this need checking again.

**Measurement** (development machine, PostgreSQL 16, warm, 2.1 million entries across 200,000 folders, plus one folder with 100,000 entries – retrievals every 26 minutes for five years):

| Query | Time |
| --- | --- |
| First page (100) of an ordinary folder | 0.4 ms |
| First page of the folder with 100,000 entries | 2.6 ms |
| … WebDAV only, second page | 2.5 ms |
| … preselection when only 200 of the 100,000 entries match (worst case: the index reads all) | 54 ms |
| "Same retrieval already today?" in this folder | 0.3 ms |
| Whole history of this folder without pages (interface without `max`) | 964 ms |

**Storage:** about 320 bytes per entry including the indexes (table 230 bytes, `historie_mappe_idx` 65 bytes, primary key 22 bytes). For estimating: 1 million folders with 20 entries each are about 6 GB; 50 people who retrieve 200 different files each on 250 days a year reach 12.5 million retrievals in five years, about 4 GB. Without combining the same retrievals on the same day it would easily be a hundred times that with Explorer and Office. Under load the first page is measured in the "with saving" run of every level of the [load test](#lasttest), also in *extrem*.

## Several processes (#745) { #mehrere-prozesse }

`DMS_PROZESSE` (default 1, `auto` = cores − 1, at most 2, about 1 GB per process plus 1 GB reserve; #874) distributes the requests in turn to several processes with `node:cluster`; process 1 leads and does the background work (architecture: [Several processes](aufbau.md#mehrere-prozesse)). `GET /api/werkbank/last` then reports the memory of **all** processes together (Pss, so that shared code doesn't count several times; the sum of the RSS is under `rssMb`), the event loop waiting time of the slowest process and one line per process under `prozesse`; the database connections together. Since #920 the requirement "Ablago's memory ≤ 1.5 GB" applies **per process**: the load test checks the highest process from `engpass.speicherJeProzess` and names the sum alongside with the limit × processes (until then it compared the sum with 1.5 GB and wrongly reported "verfehlt" (missed) from "groß 350" with two processes). The result block names `DMS_PROZESSE` among the settings.

**Measurement for #745** (local, 2 cores, PostgreSQL 16, load test on the same computer, server from `dist/`; 30 s per run or 20 s per step of gross; alternating 1 and 2 processes):

| Run | 1 process | 2 processes |
|---|---|---|
| mittel (50,000 folders), p95 | 963 / 1,049 ms | 1,338 / 1,320 ms |
| mittel, requests per s | 178 / 160 | 152 / 150 |
| mittel + saving, p95 | 3,568 / 3,237 ms | 4,592 / 5,502 ms |
| mittel + saving, requests per s | 56 / 55 | 50 / 39 |
| mittel, event loop p99 at most | 156 / 161 ms | 303 / 274 ms |
| mittel, memory at most (2 processes: sum of RSS) | 944 / 953 MB | 1,217 / 1,229 MB |
| mittel + saving, memory at most | 1,219 / 1,156 MB | 1,819 / 1,874 MB |
| mittel on 200,000 folders, p95 (saving) | 4,741 ms (11,208 ms) | 6,023 ms (19,362 ms) |
| mittel on 200,000 folders, memory Pss (saving) | 908 MB (1,573 MB) | 1,324 MB (2,300 MB) |
| gross (200,000 folders): limit | 100 at once, 67/s, p95 2,476 ms | 150 at once, 88/s, p95 2,564 ms |
| gross: memory at most (2 processes: Pss) | 1,010 MB | 1,134 MB |
| gross: recovery after 1000 at once | 0.3 s | 0.3 s |

**Result:** with 2 cores, on which PostgreSQL and the load test also compute, there is no free core for a second process: at level mittel it gets slower (more switching between processes, two event loops fight for the same core); only the limit of level gross rises (100 → 150 at once). Memory rises by 30–50 %: every process has its own caches, buffers and heap. Hence the recommendation cores − 1 and `auto` = 1 with 2 cores; a meaningful measurement with 3 and 4 processes needs a computer with at least 4–6 cores (to be added for #576 from the maintainer's NAS or by the workflow). The overload probe with 1000 at once left requests without an answer locally (1 process 211, 2 processes 551) – as described under "Overload protection", the load test on the same computer can't keep up with setting up connections.

**Measurement for #874** (bottleneck with several processes): on the maintainer's NAS (Pentium Gold 8505, 6 threads, `dms-komplett`, #576), 4 processes halved the median when saving, but p95 got worse (gross + saving 7.2 → 8.1 s), and memory rose from 1.3 to 3.3 GB. Suspicion: the shared bottleneck PostgreSQL in the same container, with 4 × 10 connections. A second measurement there (0.204.0, `dms` with PostgreSQL in a container **of its own**, 4 processes, 200,013 folders): mittel p95 378 ms, with saving 1,658 ms; gross: limit only 25 at once (stopped: error rate 1.10 %, with one process formerly 225), with saving p95 3,226 ms; memory 3.5 GB, with saving 5.8 GB; event loop p99 up to 1.5 s. So the bottleneck isn't only the database in the same container.

So that this can be shown, `GET /api/werkbank/last` reports under `engpass`, across **all** processes:

- `pool`: waiting time for a free connection (`server/src/poolmessung.ts`). postgres.js 4 reports via `node:diagnostics_channel` per query when it entered the queue and when it went to a connection (`postgres:query`, `queued` → `sent`), and when lending a connection for a transaction the waiting time (`postgres:pool`, `lease`, `waited`). Counting is in fixed classes (`KLASSEN_MS`, cumulative), plus the maximum of the last 10 s, connections in use (`sql.stats`, every 250 ms) and waiting queries. The measurement only switches on with the first question (`prozess.last`) and off again after 3 minutes without one – in everyday use it costs nothing.
- `sitzungen`: from `pg_stat_activity` (this database, without the own query) waiting for a lock (`wait_event_type = 'Lock'`), active, open; the longest lock from `pg_locks.waitstart` (PostgreSQL 14 and later).
- `cpu`: computing time, cumulative in seconds, from `/proc/<pid>/stat` – PostgreSQL (all processes `postgres`, only with `DMS_VARIANTE=komplett`), Ablago (main process and all processes) and the container (cgroup).
- `speicher`: per process Pss and V8's heap (`heapUsed`).
- `neustarts`: crashed and restarted processes since the start, with number and code or signal (from the main process).

The report and the result block also show the **kinds of errors** per run (`fehlerText`: status 5xx except 503, codes of broken connections from `fehlerJe`, without an answer per kind), for gross also bottleneck and errors of the step at which it stopped.

From this the load test forms per run the p95 of the waiting time (difference of the classes between the first and last reading, as the class's upper bound), maxima and the CPU in per cent of one core over the run (`engpassAus`), and writes them as an indented line "Engpass …" under the level in the result block (for gross for the step at the limit) and as a list in the report.

**Most expensive queries (#894)** (`server/src/abfragestatistik.ts`): before each run the test calls `POST /api/werkbank/last/abfragen-zuruecksetzen` (`pg_stat_statements_reset` only for its own database; creates the extension in the schema `erweiterungen_dms` if the module is loaded and the role may), afterwards once `GET /api/werkbank/last?abfragen=10`. Without the parameter the route doesn't read `pg_stat_statements` – the query every 2 seconds stays as cheap as before. Both need the permission *systemzustand*. Only normalised queries are output (without those on `pg_stat_statements` itself), whitespace collapsed, comments and strings removed, shortened to 120 characters; share of the computing time of all of the database's queries. Without the module (`55000`) or without permission (`42501`) the answer is `verfuegbar: false` with reason and remedy, and the run goes on. `dms-komplett` starts PostgreSQL with `-c shared_preload_libraries=pg_stat_statements` (command line, so it also applies to existing databases) and creates the extension in `deploy/komplett/start.sh`; `deploy/komplett-probe.sh` checks both. Locally: an instance of your own with `-c shared_preload_libraries=pg_stat_statements` and `TEST_DATABASE_URL` pointing to it, then `test/abfragestatistik.test.ts` also checks the case with the module (otherwise only the one without).

**Log and CPU per group (#895)** (`server/src/protokollsammlung.ts`, `server/src/prozessgruppen.ts`): `engpass.protokoll` – warnings and errors of all processes, grouped by level, module, text and kind of exception (at most 100 kinds). Every further process sends them in batches (warnings after 1 s, errors at once) over IPC to the main process (`art: 'protokoll'`), which keeps them for all, even across a crash; before exiting after an unexpected error a process reports the kind of exception (`absturz`), which then appears with the restart. Only the text is counted, without the context object; `ohneEinzelheiten` replaces paths, addresses, checksums, ids, numbers and anything in quotation marks. `engpass.gruppen` – running computing time per group from `/proc/<pid>/stat` and RSS from `/proc/<pid>/status`, measured only in the leader (`prozessgruppen.stand`) and only when someone asks; the verbund knows Ablago's process ids, load test mode knows the load generator's, the rest is assigned by program name. Computing time of exited children (the parent's cutime/cstime) not counted yet goes to the group of the exited children, otherwise to "other programs". From this the test builds `gruppenAus`/`protokollAus` per run, `protokollGesamt` for the whole run (starting after preparing the first level), and with every poll every 2 s sends `liveAus` to the load test page – the page doesn't poll anything extra. Since #1117 `vorlaufStarten` measures the same way from setup onwards (demo folders, full text, preparation) with the administrator's session, only in load test mode and without `name`/`n`/p95; the first run ends it (`vorlaufStoppen`).

Locally (2 cores, PostgreSQL 16 on the same computer as Ablago and the load test, `mittel` with 50,000 folders, 30 s per run, server from `dist/`; for PostgreSQL's CPU with `DMS_VARIANTE=komplett`; single runs, the variation of p95 with saving is a good ±20 %). "12" was an interim state of this build (leader 6, of them 4 permanently taken for locks, process 2 6); "14, new" is the default (leader 9, process 2 5, heap of process 2 limited to 1536 MB); "heap 1024" with `NODE_OPTIONS=--max-old-space-size=1024` for both:

| Run | 1 process (10) | 2 processes, 12 | 2 processes, 20 (as before 2 × 10) | 2 processes, 14, heap 1024 | 2 processes, 14, new |
|---|---|---|---|---|---|
| mittel p50 / p95 | 587 / 1,213, 623 / 1,433 ms | 504 / 1,532 ms | 537 / 1,488 ms | 622 / 1,610 ms | 552 / 1,305 ms |
| mittel, requests per s | 149, 134 | 153 | 142 | – | 140 |
| mittel + saving p50 / p95 | 1,556 / 3,411, 1,571 / 3,220 ms | 1,192 / 2,956 ms | 1,216 / 4,077 ms | 1,670 / 4,084 ms | 1,456 / 4,256 ms |
| … writing requests p95 | 5,389, 7,065 ms | 5,099 ms | 6,505 ms | 7,266 ms | 6,438 ms |
| … waiting for a connection p95 / at most | ≤ 200 / 679, ≤ 300 / 1,190 ms | ≤ 150 / 984 ms | ≤ 150 / 1,450 ms | ≤ 300 / 1,809 ms | ≤ 200 / 1,271 ms |
| … queue at most | 58, 108 | 106 | 74 | 113 | 87 |
| … locks (samples) | none | none | 1 session, 1.3 s | none | none |
| … CPU PostgreSQL / Ablago / container (% of one core) | – / 91 / 171, 82 / 89 / 178 | 83 / 104 / 194 | 90 / 100 / 197 | 91 / 116 / 214 | 96 / 123 / 227 |
| memory per process at most, mittel (heap) | 816, 888 MB (424) | 657 (304), 624 (347) | 718, 723 | 418 (253), 565 (261) | 592 (331), 597 (264) |
| … mittel + saving | 1,387, 1,396 MB (808) | 985 (564), 1,056 (689) | 1,103, 1,125 | 647 (327), 766 (306) | 988 (614), 724 (327) |
| Ablago's memory together (with saving) | 843 (1,410), 915 (1,423) MB | 1,314 (2,075) MB | 1,473 (2,261) MB | 1,017 (1,446) MB | 1,222 (1,746) MB |

In addition, with the default and `NODE_OPTIONS=--max-old-space-size=1024`, one run with 250 at once with saving (40 s, without export): no errors, no restart, waiting for a connection p95 ≤ 700 ms (queue up to 305), per process at most 709 and 783 MB.

**Result:**

- Without saving, queries hardly wait for a connection (p95 ≤ 1–3 ms); with saving they pile up (over 100 waiting, p95 up to 300 ms) – transactions borrow a connection for their whole duration. The container is fully used (about 200 % with 2 cores); PostgreSQL needs almost one core, Ablago a little more than one. On 2 cores computing time is thus the bottleneck; between 12, 14 and 20 connections there is no difference beyond the variation (p95 with saving 3.0 / 4.3 / 4.1 s). Locks appeared only once, with 20 connections. Whether fewer connections help on the NAS has to be shown by the measurement there; in any case the total stops more processes from automatically bringing more connections to the same database (4 processes: 22 instead of 40).
- **The leader permanently needs 4 connections** for session locks (sign of life, intake folder, mailboxes; the fourth was held by webhooks until #991 and stays as a spare). With only 6 connections for it, all requests it was meant to answer hung in a fresh installation (schedules took the rest) – that's why it gets them in advance (`VERBINDUNGEN_LEITER_RESERVIERT`).
- **Memory:** when idle, a process needs about 250–290 MB (heap a little over 120 MB), the main process 38 MB. Under load mainly the **heap** grows (up to 690 MB per process); after a full garbage collection (forced via the inspector) it was back at 187 MB, the RSS at 472 MB. So it isn't data held twice but garbage that V8 collects late – each process on its own, and every process sizes its heap by the memory of the whole container. With a heap limit, the memory per process dropped by about a third (1,024 MB: 650–770 instead of 990–1,060 MB, heap at most 330 instead of 690 MB), without errors or restarts, also with 250 at once. That's why the main process limits the heap of the further processes (`haldeJeProzess`: 60 % of their share, 1024–1536 MB). #874 at first left the leader without a limit because it does backup, text recognition and packages; on the maintainer's NAS (0.206.0, `DMS_PROZESSE=2`, `DMS_DB_VERBINDUNGEN=24`), however, it grew to 2.6 GB (heap 2.3 GB) at `gross` with saving, process 2 with a limit only to 1.3 GB – after all, it answers requests just the same. Since #891 it therefore gets 512 MB more than the others (`haldeLeiter`, 1536–2048 MB); only the main process stays without a limit. The start-up log names both values (`haldeLeiterMb`, `haldeMb`). The caches held twice hardly occur in the load test (PDF display up to 256 MB, stamped WebDAV versions up to 64 MB, page images of 4 documents – per process); since #874 the processes share their limits (`server/src/zwischenspeicher.ts`). Per process, because they are small or every process needs all of them: the read cache for folder types, views, packages and frequently read settings (#741, at most 64 entries, only valid with the same household state), the numbers of the views (at most 500 entries) and the vector index.
- **Crashes:** with 2 processes no process crashed locally (not even with 250 at once). On the NAS with 4 processes (#874, PostgreSQL in its own container), gross stopped after just 25 at once with 1.1 % errors, at 3.5 GB (with saving 5.8 GB) of memory – whether a process crashed there is now shown by the lines "Neustarts" and "Fehler".
- **`auto`** therefore takes at most 2 processes (cores − 1, about 1 GB per process plus 1 GB reserve, no more than `DMS_DB_VERBINDUNGEN` carries; `empfohleneProzesse` in `server/src/prozesse.ts`) – with PostgreSQL in the same container even if a measurement later allows more.

**Measuring again on the NAS** (≥ 4 cores, for #576): load test mode with `DMS_LASTTEST=alle` once each with `DMS_PROZESSE=1`, `2` and `4` (fixed number, not `auto`), without `DMS_DB_VERBINDUNGEN` – once with `dms-komplett`, once `dms` with PostgreSQL in a container of its own; plus once 4 processes with `DMS_DB_VERBINDUNGEN=40` (as before #874). The lines "Engpass …" and "Fehler …" matter: if there are restarts (SIGKILL: too little memory for the container), less memory per process or a larger `mem_limit` helps; if PostgreSQL's CPU is close to the number of cores, the database is the bottleneck; if queries wait long for connections although PostgreSQL has room, connections are missing; if locks appear, saves are waiting for each other.

## Background work at lower priority (#893) { #hintergrund }

In everyday use, what slows Ablago down is rarely many people at once but large batches of scans: text recognition and page images occupy the cores. So background work computes with a higher nice value (`server/src/hintergrund.ts`, `DMS_HINTERGRUND_NICE`, default 10, `0` = off; on top of the main thread's priority, at most 19):

- **Worker threads** (`arbeit/arbeitsfaden.ts`): each thread lowers itself on start with `os.setPriority(0, n)` – on Linux the priority applies per thread (TID), the main thread keeps its own.
- **Package runner** (`laeufer/verwaltung.ts`, where e.g. text recognition runs): right after `fork` its main thread, on "ready" all threads from `/proc/<pid>/task` (the runner itself may not read `/proc` because of the permission model). The threads of the calls inherit the priority.
- **Programs** (`pdftoppm`, `pdftotext`, `pdfinfo`, `qpdf`, Ghostscript …): `execFile` and `spawn` come from `hintergrund.ts` instead of `node:child_process` and lower the priority right after the start. Otherwise a child process inherits the priority of the thread that starts it – in Ablago usually the main thread.
- Ablago never sets a higher priority than the current one (needs no rights). If it fails (EACCES, ENOSYS, e.g. with seccomp), the log says so once (`meldungen.hintergrund.ohne-nice`) and everything carries on normally. `nice` as a program in front of the command would leave no gap, but would need `nice` in the image; the gap between start and lowering is shorter than a program takes to start its first child of its own.

**Measurement for #893** (local, 2 cores, PostgreSQL 16 and the load test on the same computer, server from `dist/`, level small with 5,013 folders, `--dauer 30 --ohne-speichern`, three runs each, alternating): as text recognition alongside, two loops "page images with `pdftoppm -r 300`, then `tesseract` per page" ran – started via `hintergrund.ts` in the **same session** as the server, like Ablago's child processes.

| Run | p50 | p95 | p99 | CPU Ablago | Container |
|---|---|---|---|---|---|
| without text recognition | 107 / 102 / 81 ms | 206 / 211 / 145 ms | 270 / 300 / 176 ms | 69–84 % | 167–193 % |
| text recognition at nice 0 (as before) | 229 / 163 / 135 ms | **441 / 371 / 232 ms** | 557 / 509 / 276 ms | 37–50 % | 199 % |
| text recognition at nice 10 (new) | 102 / 105 / 89 ms | **196 / 202 / 156 ms** | 260 / 262 / 189 ms | 63–74 % | 198 % |

**Result:** at nice 0, text recognition took half of the server's computing time; p95 doubled and missed the CI limit of 300 ms twice. At nice 10, p95 is as good as without text recognition, and text recognition still gets everything that is left (the container stays fully loaded). A load-test run of its own "with text recognition alongside" is still missing: it would need a text recognition package in the test Library; the measurement above covers the criterion.

**Note – autogroup:** Linux with `kernel.sched_autogroup_enabled=1` (many desktop systems, this computer too) first divides computing time between sessions (`setsid`) and only within them by nice. When the load ran in a session of its own, there was no difference between nice 0 and 10 (p95 204 / 167 and 204 / 170 ms, without load 243 / 127 ms) – the session only got its share anyway. For Ablago that makes no difference: child processes and threads are in the server's session, exactly where nice works. PostgreSQL in a container (or session) of its own, on the other hand, shares the cores according to the host's rules.

## Rules { #regeln }

- **No `SELECT *` on tables with large columns.** Documents always with `DOKUMENT_SPALTEN`, folders with `MAPPEN_SPALTEN` (without `suchtext`, #615); read the full text only via `volltext(id)` or in bundles via `volltexte(ids)`. EXPLAIN doesn't show this: the full text is stored out of line (TOAST) and only unpacked when it is sent to the server.
- **Don't load all folders to filter in memory.** What can be narrowed down in SQL (date in the period, open tasks), the query narrows down (#477: `mappenMitDatum`, inbox in the counter).
- **No accesses in loops over folders or documents.** For bulk work there are bundled methods (`dokumenteVon`, `volltexte`, `versionenVonDokumenten`, `notizenVon`, `aufgabenVonMappen`, `historieVon`). Even locally, one access costs about half a millisecond – with 10,000 folders that is seconds.
- **Refresh the statistics after bulk runs:** `SichtenDienst.aktualisiereStatistik()` (creating and removing demo data; restoring does it itself). For `dokumente` only via the columns in `STATISTIK_SPALTEN`: without a column list, PostgreSQL also calculates the statistics of the index `to_tsvector('german', volltext)` – over a minute with 20,000 documents instead of 0.1 seconds.
- **Long computing work yields.** Server and interface share one Node process: whatever blocks the event loop delays every request – and appears in the measurement of database accesses as a "long access" although the database was fast. Loops over many elements yield with `takt()` (`server/src/demo.ts`) or `setImmediate`; large data is compressed with the asynchronous `zlib` instead of in the main thread.
- **Large files as a stream** (#746): uploads up to 100 MB go into a temporary file; the checksum arises while reading (`strom: true` on the route, `nimmAuf`). The full export writes long lists (CSV, JSON Lines) line by line with back-pressure and pauses by computing time (`Zeilen` in `vollexport.ts`) instead of building them as one text. Large tables don't go to the worker as a message (the copy holds the main thread) but as a file the worker reads itself (`exportTabelleAusDatei`).
- **Heavy work into the worker.** What computes for seconds (PDF, large tables) belongs in the [worker pool](aufbau.md#arbeiter-pool) (#542), not in the main thread – not even with pauses.
- **Don't read again what the access already knows** (#615): folder types (`z.typen`, except for service accounts – they only see theirs) and the resolution with roles and date (`z.a`).
- **Only remember with a state from the database** (#741): a new cache beyond the request depends on the household state (`lesespeicher.ts`), applies to everyone alike and goes into the table above. Never for sessions, people, roles or permissions – they exist at most once per request (`jeAnfrage`).
- **Memos without waiting for the disk** (#615): what may get lost in a crash ("last opened", "seen") a single statement writes with `ohneWarten(sql)` in `FROM`. Never for data the user entered, and not in a transaction (it has no effect there).
- **No `indexOf` in sorts over many elements.** `liste.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))` is quadratic: with 20,000 folders that is seconds up to over half a minute in the main thread (#542). Build an index first (`inReihenfolge` in `dienst.ts`).
