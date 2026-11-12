# Ablago's technology {#technik-von-ablago}

An overview for operation and support. Which versions actually run on a system is shown by the workbench under **Technology** – there the overview can also be copied for a GitHub issue.

## Building blocks {#bausteine}

```
Browser ── HTTP ──▶ Ablago container (Node.js) ──▶ PostgreSQL container
   React interface         Fastify API              Folders, types, users,
   (included in image)     files under /data/…      sessions, logs
```

| Building block | Technology | What for |
| --- | --- | --- |
| Interface | React 19, built with Vite | Library, workbench, My account – everything in the browser |
| Server | Node.js 24, Fastify 5, TypeScript (bundled with esbuild) | Interface under `/api`, also delivers the user interface |
| Database | PostgreSQL 17, access with postgres.js, SQL migrations in `server/migrations` | All data except the files |
| Files | Fixed folders `/data/files`, `/data/geheim`, `/data/sicherung` (volumes, see [Installation](installation.md#ordner-und-volumes)); each file named by its SHA-256; optionally the [Intake folder](eingangsordner.md) `/eingang` | Uploaded documents, the same content only once; key; backups; scans to collect |
| Email | nodemailer via SMTP for sending; imapflow and mailparser via IMAP for collecting (both optional, set in the workbench) | Invitations, password links, notices, sending folders; collecting emails from [mailboxes](postfaecher.md) as post |
| Full text and text recognition | poppler (pdftotext, pdftoppm) in the image for the text layer of PDFs; text recognition of scans and images as the package **Text recognition** (Tesseract as WebAssembly in the package runner, #459); PostgreSQL's full-text search | Full text of PDFs, scans and images (#45, #458) |
| Shrinking PDFs | pdf-lib, pdftoppm (poppler) for the images and qpdf (Apache-2.0) for the structure, both in the image; no Ghostscript | Making large scans smaller (#393) |
| Redacting | pdftoppm and pdftotext (poppler) for rendering and word positions (text layer only, #459), pdf-lib for rebuilding; no MuPDF, no Ghostscript (both AGPL) | Removing passages for good, the original stays (#392) |
| Editing PDFs | pdf-lib (MIT), encapsulated only via one shared place in the server (#541); evaluation of the alternatives in the [Developer manual](https://help.ablago.app/entwickler/aktuell/en/aufbau/#pdf-stelle) | Stamps, export, editing pages, redacting, shrinking, preview, access copy, labels |
| Font in our own PDFs | Noto Sans and Noto Sans Mono (SIL Open Font License 1.1, licence in `server/schriften/OFL.txt` and `NOTICE`), embedded as a subset with `@pdf-lib/fontkit` (MIT); 1.4 MB in the image ([#826](https://help.ablago.app/entwickler/aktuell/en/aufbau/#pdf-schriften)) | Latin (including Turkish, Polish, Czech, Vietnamese), Greek and Cyrillic shown correctly in stamps, letters, export, labels, text documents and the emergency sheet |
| Workers | `node:worker_threads`, without an additional library: a small pool next to the main thread (#542), see [System health](speicherplatz.md#arbeiter-fur-pdf-und-exporte) | PDF work and large exports without other users waiting |
| Encryption | AES-256-GCM (Node.js crypto), key as a file under `/data/geheim` | Stored passwords (#39, #46) |
| Passkeys | WebAuthn; verified with `@simplewebauthn/server` (MIT), in the browser the built-in interface; only public keys in the database | Signing in without a password, second factor, signing in again ([Passkeys](anmeldeschutz.md#passkeys), #811) |
| Image | `node:24-alpine`, multi-stage build, for amd64 and arm64 – each architecture on its own matching GitHub machine (without emulation), then merged into one image | Runs on the NAS next to the PostgreSQL image |
| dms-komplett | The same image with PostgreSQL 17 (Alpine package) in the same container; database in the folder `/data/postgres` | Ablago and database in one container |
| Checks | GitHub Actions: type check, tests against PostgreSQL, image build | Every push to `main`, every pull request, every version tag and once a week |

## Limits { #grenzen }

How large something may be at most. Ablago checks every limit before it processes the data; anything larger is rejected with a message (usually “413 – too large”). In the source code all limits are in one place: `server/src/grenzen.ts`.

| What | At most |
| --- | --- |
| Uploading, replacing or photographing a document | 100 MB |
| File for “Fill in from document” without filing | 30 MB |
| Text recognition and preview of Office files | 100 MB per file; larger ones get no full text or preview |
| Attachments of an e-mail together | 50 MB |
| Package (archive and all files under `code/` together) | 128 MB |
| Bundle file | 256 MB, at most 50 packages |
| Catalogue, signature and key of a package source | 10 MB |
| Uploaded packages not yet installed | 30 minutes; 512 MB together in memory, beyond that the oldest are dropped |
| Converted version, archive version and preview image from packages | 50 MB, 100 MB, 5 MB |
| Error report (with screenshot and attachments) | 30 MB, the screenshot 10 MB |
| Logo of a design | 1 MB |
| Setup file | 64 KB |
| Passkeys | 20 per person, name 60 characters, device response 16 KB; signing in without email address: 20 challenges per IP address or IPv6 /64 in 5 minutes, 20,000 open in total |
| E-invoice (XML as a file or from the PDF attachment) | 4 MB, at most 64 levels deep, 200,000 elements, 500 items are taken over; without DTD and entities. Ablago doesn't read anything larger as an e-invoice |
| All other requests (forms, settings) | 2 MB; they do not accept a file at all |

A reverse proxy in front needs its own limit slightly above that, for nginx `client_max_body_size 260m;` (with bundle files) or `130m` (without), see [Installation](installation.md#hinter-einem-reverse-proxy).

## Many simultaneous requests { #last }

A household has 2–6 users, a small business 10–20. A single user already triggers several requests at once (opening the Library is 6–10), plus WebDAV programs, packages and scripts. **100 simultaneous requests** – about 10–15 people clicking at the same moment – are the realistic upper limit; Ablago is designed for this and it is measured regularly (load test in three levels, #544, #563). What each device copes with is under [What Ablago copes with](verkraftet.md); you can measure yourself with the [load test](lasttest.md). More hardly ever happens in operation, for instance with a wrongly configured WebDAV program.

- **Overload protection:** if **250** requests are already running at once (`DMS_MAX_ANFRAGEN`), every further one immediately gets the answer "Ablago is very busy right now. Please try again in a few seconds." (HTTP 503 with `Retry-After: 5`) – instead of hanging in an ever longer queue until browsers and programs give up. That keeps response times and memory limited, and Ablago recovers by itself as soon as the load eases. The container's health check is never rejected. When the protection kicks in, "Überlast: …" (overload) appears in the [log](fehlersuche.md#protokoll) at most once a minute – as a notice with the number of rejections, not as an error (#920); the individual requests with 503 no longer appear there.
- **Database connections:** at most **10** at once. In the load test with 100 simultaneous requests, 5, 10 and 20 connections were level: the bottleneck is the computing time that server and PostgreSQL share, not the number of connections. Each connection costs PostgreSQL about 5–10 MB of memory. Only with clearly more cores (or PostgreSQL on a computer of its own) can more help: `DMS_DB_VERBINDUNGEN` (2–100; PostgreSQL allows 100 connections in total by default). With [several processes](#mehrere-prozesse), the number applies to all of them together. How long queries wait for a free connection is shown by **Workbench → Database connection** under *Server load*.
- **Heavy work** such as PDF editing and large exports runs in separate [workers](speicherplatz.md#arbeiter-fur-pdf-und-exporte) so that other users don't wait.
- **People come first** (#893): background work – the workers, the package runner (e.g. text recognition) and the programs Ablago starts (`pdftoppm`, `qpdf` …) – runs at lower priority (nice 10, adjustable with `DMS_HINTERGRUND_NICE`, `0` = off); requests from people and PostgreSQL get the cores first. If the container doesn't allow this, everything carries on at normal priority and the [log](fehlersuche.md#protokoll) says so once.
- **Several processes** ([below](#mehrere-prozesse)): with `DMS_PROZESSE`, several processes answer the requests together and so use several cores. The default is one process as before.
- The current values of `DMS_PROZESSE`, `DMS_ARBEITER`, `DMS_DB_VERBINDUNGEN` and `DMS_MAX_ANFRAGEN` and where they come from are shown by **Workbench → system health**; if something gets tight, the notice there names the variable that can help ([Settings and bottlenecks](speicherplatz.md#einstellungen-und-engpasse)).
- **Sign-in protection** counts every failed attempt even under load; a rejected sign-in (503) checks no password and therefore doesn't count.

### Several processes {#mehrere-prozesse}

Ablago answers requests with Node.js in **one** thread per process. With one process, one core works on the requests, even if the server has more. With `DMS_PROZESSE` (#745), several processes answer the requests together:

| Value | Meaning |
| --- | --- |
| not set or `1` | one process – as before (default; an update doesn't change that) |
| `2` to `16` | that many processes |
| `auto` | the container's cores − 1, **at most 2** (#874; before 4) – and only as many as the memory allows (1 GB reserve plus about 1 GB per process, the container's limit, otherwise the computer's: so below 3 GB, 1) |

**Recommendation:** one process as long as things run smoothly; with many simultaneous people (small business) and at least 4 cores **2 processes** – that's what `auto` does. For now `auto` doesn't take more: on a NAS with 6 threads, 4 processes only made the median faster, not the slow requests (p95) when saving – with PostgreSQL in the same container as well as in a container of its own; the load limit even dropped, and memory rose to 3.5 GB (with saving 5.8 GB). It stays at 2 until a measurement shows that more helps (with `dms-komplett` at most 2 later too, because there Ablago and PostgreSQL share the cores). A fixed number (e.g. `DMS_PROZESSE=4`) still applies as it is. For a household, a Raspberry Pi or a small NAS it stays at one process – there a second one brings nothing but costs memory. Measurements under [What Ablago copes with](verkraftet.md).

This is how the processes work together:

- A slim **main process** starts the processes, distributes the connections to them in turn and restarts a crashed process after 1 second (with repeated crashes with a growing pause up to 1 minute). Sign-ins are kept; they are in the database.
- **Process 1 leads:** at start-up it shows the page "Ablago is starting …", brings the database up to date and does all the **background work** – text recognition, thumbnails, schedules, automations, the package runner (exactly once), intake folders, mailboxes, backup and restore. Besides that, it answers requests like all the others. The remaining processes only start once it is ready.
- **Maintenance mode, sign-in protection, workbench jobs** and settings apply in all processes (after a few seconds at the latest). The lock against a downgrade stops Ablago as with one process. The container's health check stays unchanged; the command `dms` in the container works as before.
- **Memory:** every process needs its own memory. When idle it is about 250–300 MB per process, under load clearly more: Node.js only tidies up memory bit by bit. Plan about **1 GB** per process (that's also how `auto` calculates) and adjust `mem_limit`; the main process itself only needs about 40 MB. So that not every process acts as if it had the container to itself, Ablago limits Node.js's heap in every process: in the further processes (process 2 onwards) to 60 % of their share, 1–1.5 GB, in process 1 to 512 MB more, because it also does the work in the background (1.5–2 GB). In the load test, a further process then needed about 720 instead of 1,050 MB; on a NAS, process 1 without a limit grew to 2.6 GB (heap 2.3 GB) at `gross` with saving, process 2 with a limit only to 1.3 GB. The main process stays without a limit; both values are in the log at start-up (`haldeLeiterMb`, `haldeMb`). If you set `--max-old-space-size` in `NODE_OPTIONS` yourself, your value is kept. The processes share the caches for the PDF display, page images and stamped WebDAV versions: together they take at most as much as with one process.
- **Crashes** of a process are counted by the main process (with number and code or signal); the [load test](lasttest.md) shows them for each run, together with the kinds of errors (e.g. broken connections).
- **When it is worth it:** only with free cores. On a computer with 2 cores (Ablago, PostgreSQL and the load share them), a second process was slower than one at level medium; at level large it moved the limit from 100 to 150 simultaneous requests. That's why `auto` takes one process with 2 cores. Details: Developer manual → Performance.

**Database connections – for all together:** `DMS_DB_VERBINDUNGEN` applies to **all processes together** (#874; before: per process). Process 1 permanently holds 4 connections for locks (sign of life, intake folder, mailboxes and one spare) and gets them first; all processes share the rest equally (each further one at least 2, process 1 at least 6 in total). Without the variable it is 10 as before with one process and 4 more for each further process (2 processes 14: process 1 has 9, process 2 has 5; 4 processes 22 instead of 40 before). If the number is too small for the processes, Ablago raises it to the minimum; if it were more than the database allows (`max_connections`, minus 10 for others), Ablago reduces it – both are written to the log.

**Why together:** more connections don't make a database faster that shares the cores with Ablago. If more queries run at once than PostgreSQL has cores, each waits longer for computing time and for other people's locks – which hits saving in particular. With 4 processes, Ablago used to open 40 connections, on a NAS with 6 threads.

**When updating:** with one process nothing changes. If you have set several processes **and** `DMS_DB_VERBINDUNGEN`, you now get this number for all together instead of per process. For the previous behaviour, multiply the value by the number of processes (e.g. 3 processes with 20 per process: `DMS_DB_VERBINDUNGEN=60`).

**What applies per process:** `DMS_MAX_ANFRAGEN` and `DMS_ARBEITER` apply **per process**. The default number of workers is divided among the processes (at least 1 per process) so that together no more threads compute than with one process. **Workbench → system health** shows the values with "per process, together …" or, for the connections, the division ("together for 2 processes: leader 9, each further one 5") and below them one line per process with memory, computing time, waiting time and running requests. Where things get stuck under load – waiting for connections, locks, computing time of PostgreSQL and Ablago, restarts and memory per process – is shown by the [load test](lasttest.md) for each run.

## Interface {#schnittstelle}

`/api/v1` for other programs (API keys), description under `/api/openapi.json`. The user interface itself uses internal addresses under `/api/…` that may change.

## Help without internet {#hilfe-ohne-internet}

The image brings the manuals of its version with it, in German and English: start page, How do I get a DMS?, User, Administrator and Developer manual, reachable under `/hilfe/` of your own installation (e.g. `http://<NAS>:8080/hilfe/`, in English under `/hilfe/en/`), without signing in and already in the setup assistant. The question mark next to a heading and the links to the manual open this version, in the language of the person signed in. It works without internet; only the screenshots are missing – in their place is a link to the same page online. In the footer of every page you get to the online help and to the newest version.

## Modules {#module}

Every line in the [log](fehlersuche.md#protokoll) belongs to a module. For every request to the server, Ablago writes a line with method, path, status, duration and database accesses – in the module of the area the request belongs to (e.g. `ablage` for folders). Requests that only read – including previews, counts and test runs that the interface sends by POST – are only at level `debug`, i.e. only in debug mode.

The filter of **Workbench → Log** lists all modules with their name – including those for which nothing is in the log right now ("(no entries)").

| Name in the filter | Module | What |
| --- | --- | --- |
| System | `system` | Start, settings, debug mode |
| Requests (HTTP) | `http` | Requests that belong to no other module (e.g. pages of the interface) |
| User accounts and sign-in | `konto` | Sign-in, **sign-in protection** (blocked accounts and IP addresses), sessions, users, roles, stand-ins |
| Library | `ablage` | Creating, changing, deleting folders; views, bin, notes, tasks |
| Documents | `dokumente` | Uploading, displaying, deleting |
| Workbench | `werkbank` | Folder types, packages, demo data, settings, version check |
| Data protection | `datenschutz` | Access requests, retrieval links, deletion concept |
| Text recognition | `texterkennung` | completed, skipped, failed, restarted, cancelled; settings |
| Converting files | `umwandlung` | Versions from packages (e.g. TIFF → PDF) |
| Archive version | `archivfassung` | PDF/A from packages |
| Thumbnails | `vorschau` | Creating thumbnails |
| Database | `datenbank` | Migrations, connection, long accesses |
| Email | `mail` | Sending and errors when sending |
| Backup | `sicherung` | Backup, emergency sheet, restore and test |
| Events | `ereignisse` | Distributing events to packages and automations |
| Automations | `automatisierung` | Runs of the automations |

Sign-in and sign-in protection deliberately stay in one module: a block results from failed sign-in attempts – whoever looks for a block sees both together.

## Where things are {#wo-was-steht}

| What | Where |
| --- | --- |
| Permanent log | Container logs: `docker logs <app-container>` |
| Log of the last 24 hours | Workbench → Log |
| Long database accesses | Workbench → Database connection (table `langlaeufer`) |
| Backing up the database | best via **Workbench → Backup**; additionally with two containers `docker exec <db-container> pg_dump -U dms dms > dms.sql`, with dms-komplett `docker exec <container> pg_dump -h 127.0.0.1 -U dms dms > dms.sql` |
| Backing up files | Folder `files` from the Compose template |

## Versions and updating {#versionen-und-aktualisierung}

The image contains Node.js, Alpine Linux and all libraries; you update by pulling `ghcr.io/motom001/dms:stabil` again and restarting (see [Which image tag?](aktualisieren.md#image-tag)). `:stabil` moves once a week (early on Tuesday) to the newest tested version, urgent fixes (label `sofort-stabil`) right after the release; `:main` gets every state at once.

- **Two containers (recommended):** PostgreSQL is an image of its own (`postgres:17`): minor versions (17.x) by pulling again, independently of Ablago.
- **dms-komplett:** PostgreSQL (Alpine package) is in the image `ghcr.io/motom001/dms-komplett` and comes with its updates. Both images are rebuilt with every change and at least every week, with the Alpine packages of the same day (tag `main`); fixed version numbers get new Alpine packages with the next release, `:stabil` with the next stable version (once a week).
- Changing the major version (e.g. 17 → 18) needs a backup and restore in both cases, see [Growing and moving](wachsen.md#neue-hauptversion-von-postgresql).

The version check in the workbench only asks at the push of a button (by itself once a day only with a switched-on [automation “New version available”](automatisierungen.md#neue-version), and then only GitHub for the stable version): GitHub for Ablago's state, [endoflife.date](https://endoflife.date) for Node.js, PostgreSQL and Alpine, the npm registry for the libraries. It separates what you **update yourself** (Ablago image, with two containers PostgreSQL) from what **comes with Ablago** (Node.js, Alpine, libraries – with dms-komplett also PostgreSQL). For Ablago itself, the yardstick is the stable version – the release marked “Latest” on GitHub, which moves with `:stabil` once a week; the releases in between are not “Latest”.

The decisions behind the design are in [entscheidungen.md](entscheidungen.md).
