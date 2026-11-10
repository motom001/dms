# Decisions {#entscheidungen}

Briefly recorded so that later changes know why something is the way it is.

## Domain model {#fachmodell}

- **The folder as the only basic concept.** Contract partner, contract, invoice, item are folders of different folder types. A folder type defines fields; a folder stores values per field key.
- **Links instead of a filing location.** Connections arise via link fields (invoice → contract → contract partner). Back-links are not maintained but derived.
- **Two kinds of link.** *Belonging* ("belongs to") later counts for "everything about X" and in evaluations; *reference* (e.g. issuer) is just a link. That way not every invoice from the same tradesperson ends up in "everything about the house".
- **Hierarchy via a link to the folder's own folder type.** House → heating → heat pump needs no special logic.
- **Fixed field keys.** A field's label can be changed, its key not after the first save – stored values and later API matches stay valid.
- **Removed fields don't delete values.** The values stay on the folder and are shown as "values without a field definition".
- **Definition changes don't silently make folders invalid.** If a folder no longer fits (new required field, removed choice value), it is marked; it is corrected on the next save.

## Technology {#technik}

- **PostgreSQL** instead of SQLite: JSON fields with an index, full-text search with German stemming, row-level security for separating households, parallel writes.
- **`haushalt_id` in every table** from the start. One installation is one Library (in the code *Mandant*); its id has been in the database connection since 0.24.
- **Links additionally in a table of their own** (`verweise`): fast back-links and deletion protection in the database itself.
- **SQL migrations as files, no ORM.** The open question "Prisma or Drizzle" is thereby postponed, not decided: for the generic folder model (JSON values, dynamic fields) an ORM brings little, and plain SQL stays easiest to follow and port. Migrations run at start-up in one transaction.
- **One image** for server and interface (modular monolith): `dms` with its own database container (recommended) and `dms-komplett` with PostgreSQL in the same container, for interfaces and providers with only one container.

## Sign-in {#anmeldung}

- **Setup assistant with a setup code** (#119, before: first visit without a code). The code is in the container's log and in `/data/geheim/EINRICHTUNGSCODE`; it protects setup and the database test (which could otherwise probe computers in the network). On trial – whether the code makes getting started too cumbersome will be shown by feedback from practice.
- **Database connection as a file under `/data/geheim`**, leading over `DATABASE_URL` (#119): that way Ablago can be put into operation without editing environment variables; without a reachable database it starts in setup mode and afterwards the actual Ablago in the same process.
- **Mandant instead of household** in the interface and manual (#119; from 0.73 it was "household" again, #305; since 04.11.2026 neutrally "Library" – "name of your Library", "Library id" –, #700), so that Ablago fits at home as at work. Internally it is still called `haushalt_id`; a rebuild would bring no visible benefit. Fresh installations use the Mandant that the first migration creates (with themes and settings).
- **Administrators don't work in the Library:** that's why the assistant immediately creates a first normal user.
- **System roles:** Administrator (setup, users) and Member (Library). Who sees which folders is governed by the [permissions](berechtigungen.md) (#123).
- **Passwords** with scrypt from Node (no native library). **Sessions** as an HttpOnly cookie, in the database only as a SHA-256 hash. The same applies to invitation and password links (invitation 7 days, reset 1 hour, each usable only once).
- **Protection against outside pages:** changing requests need the header `X-DMS`, which only Ablago's own interface sets; plus `SameSite=Lax`.
- **Email optional:** without SMTP, user management shows the links to copy.
- **Routes per subject area** in `server/src/<fach>/<fach>.routen.ts`, brought together in one place in `server/src/routen.ts` (#960), each with an access level (open, signed in, admin).

## Library {#ablage}

- **Three columns:** views → list → folder. At first there was only the inbox and one view per folder type; since 0.10 views can be set up freely (see below, #38).
- **Inbox** (today "To do"): folders that don't fit the current definition, with their creator; without a known creator with the administrator. Today it is the list of all open tasks, "Doesn't fit" being one of them.
- **Index values** (created/changed on/by) are fixed columns, not fields of a folder type.

- **Page by page instead of everything:** the interface no longer loads a complete list of folders. A view fetches 100 folders at a time, sorted by title, and the next ones when scrolling; the server computes search, counters and "To do". Links are chosen via a search instead of a drop-down list.
- **Result list** as a list of column keys on the folder type (`mappentypen.trefferliste`); system columns begin with `_` and so never collide with field keys. Compact or table is decided by the list's own width (ResizeObserver), not the screen width.
- **Sorting on the server** (because of page-by-page loading), empty values always last; not by links and long texts. Saved per user and view in `benutzer_einstellungen`.
- **Fit stored** (`mappen.passt`, `mappen.problem`): whether a folder fits the definition is checked by the server when the folder type changes, for all folders of this folder type (unique values in memory instead of per folder in the database), and after saving for folders of the same folder type that didn't fit so far.
- **Long jobs in the background:** demo data runs as a job with progress so that a reverse proxy doesn't cancel after its waiting time.

## Tabs and documents {#register-und-dokumente}

- **Three kinds of tab** on the folder type: field, documents and links tabs. Every field is on exactly one field tab; unassigned fields automatically land on the first.
- **Tabs have fixed keys** so that documents keep their tab when it is renamed. A documents tab with documents can't be removed.
- **Links tabs** show all back-links or only chosen sources (folder type + link field).
- **Title template** with placeholders `{feld}`; server and interface use the same function (`titelAus`).
- **Title stored** (column `mappen.titel`) so that the server can sort and load page by page. Recalculated when a folder is saved, when the folder type changes and – passed on via the links – for folders whose title contains a changed title (with links in a circle at most six rounds). The server calculates missing titles at start-up.
- **Index values in the title:** `{angelegt}`, `{geaendert}` as a date in the time zone Europe/Berlin; these keys are blocked for fields.
- **Files** immutable under their SHA-256 in the files folder, the same content only once; notice on upload if the content is already in another folder.
- **Display in the browser only for PDF and images**, recognised by content (not by extension or stated type). Everything else is delivered as a download, with `nosniff` and a sandbox CSP – an uploaded HTML file thus can't run code in the session.
- **Deleting a folder** first puts it with its documents into the [bin](papierkorb.md) (#43); only on final deletion does a file disappear, as soon as no document points to it any more.

## Themes {#designs}

- **Colours are derived, not maintained individually:** all CSS variables arise from base, primary and secondary colour (`design.ts`). Colours are lightened or darkened as needed until they are readable on the background (WCAG 4.5:1, with the contrast theme 7:1).
- **Theme per account, font size per device** (`benutzer_einstellungen` and localStorage respectively). Font sizes scale via `--skala`.
- **Own CSS** only by administrators, without `<style>` tags; way out `?design=standard`.

## Interface {#schnittstelle}

- **Own namespace `/api/v1`** with fixed addresses; internally it uses the same functions as the user interface. API keys only apply there, not at the interface's internal addresses.
- **Keys** `dms_…` (240 bits of randomness), stored only as SHA-256; the beginning stays visible. Permissions: at most those of the user, plus "read only" (only GET). Since 0.26 (#128), administrators no longer get keys: a normal user works via the API.
- **OpenAPI from the same table** as the routes (`api-v1.ts`), therefore always matching the installed version; the readable page renders it itself, without an outside library.

## Operation and troubleshooting {#betrieb-und-fehlersuche}

- **Own log** (`server/src/protokoll.ts`) instead of Fastify/pino directly: every message with module, user and request id (via AsyncLocalStorage), readable in the container logs, plus a ring buffer (24 h, 10,000 entries) for the Workbench. Fastify writes into it via a pino-compatible adapter.
- **Live display by polling every two seconds** instead of server-sent events: works behind every reverse proxy without special configuration (nginx otherwise buffers SSE).
- **Measurement per database access:** every method of the repos is counted and timed via a proxy (one access can comprise several SQL statements). The sum per request goes to the interface in the header `Server-Timing`; the browser measures the remaining steps (Resource Timing). "Network" is an approximation here.
- **Long-running accesses** are in the database (table `langlaeufer`), threshold and retention in `einstellungen`. Writing is collected, at most once per second (#615): under load, many accesses take longer than the threshold, and a write of its own per long-running access then slowed things down additionally. A crash loses at most the long-running accesses of the last second; they are in the log anyway.
- **Debug mode** only in memory and at most one hour; after a restart it is off.
- **Signing in as another user:** the user's own session with a reference to the impersonation; the user sees next time who acted as them and when. A tamper-proof log is deliberately not part of it (#16).

## Users and roles as folders (#26, #27) {#benutzer-und-rollen-als-mappen-26-27}

- **System folder types** *User*, *Role* and *Post* (up to 0.40 *E-Mail*; column `mappentypen.system`): extensible, never deletable. The server creates them at start-up if they are missing; if one of your own folder types already has that name, the system type gets the addition "(System)".
- **System fields** (`Feld.system`) are fixed: key, field kind and properties are set by the server; the administrator may only change label, help text and tab.
- **The account leads, the folder mirrors it.** A user's folder has the same id as their account. Accounts report every change to name, email, role and "active" to the folder; at start-up all users are reconciled (also after an update).
- **Security:** the system fields of a user folder are read-only in the Library – the server rejects changes. Otherwise a member could change an administrator's email address and take over their account via "Forgotten password", or give themselves a system role.
- **System roles** *Administrator* and *Member* are role folders with a fixed key (`mappen.system_kennung`, e.g. `rolle:admin`). Who has them follows the account's system role; they can be neither deleted nor renamed. That way the [permissions](berechtigungen.md) attach permissions to role folders without rebuilding the sign-in.
- **Assignment user ↔ role** is the system field `rollen` of the user folder (multiple link). The role shows its users as back-links. It is only set via user management; invalid roles are checked before anything changes.
- **Roles are folders** of the system folder type *Role*. Who may create, rename and delete them is governed by the permissions on this folder type (without rules: everyone). No nested roles.
- **Deleting a role:** allowed even if users have it – their assignment goes. Links from normal fields (e.g. "responsible role") prevent deletion as with every folder.
- **Deactivating instead of deleting:** whoever has already signed in is deactivated; their folder keeps the name, which appears everywhere in italics and struck through, and links stay valid. Deleting only works for invitations never accepted.
- **Allow new folders / deleting** as a property of every folder type (`erstellen_erlaubt`, `loeschen_erlaubt`); the interface hides the buttons, the server checks it. For the folder type *User* both are fixed off. *Replaced since 0.32 (#146): creating and deleting are governed by the permissions (C, D); only the system rules for user folders remain fixed (since 0.41, #192, the normal permission C applies to post).*
- Demo data and examples leave out the system types.

## Manual and releases (#25) {#handbuch-und-releases-25}

- **Two separate manuals** (MkDocs Material, each a site of its own with its own search): users should concentrate on their possibilities and not have to search through technology. They link to each other instead of maintaining content twice. Technology and decisions belong to the Administrator manual.
- **German search** via MkDocs' search plugin (`lang: de`, with stemming); runs in the browser, without a server. The English manuals (#730) use `lang: en`.
- **Screenshots are generated, not maintained:** the workflow *Handbuch* starts Ablago with an empty database, creates examples and demo data and records the pages with Playwright (`docs/handbuch/screenshots/aufnehmen.mjs`). That way the images always match the version on `main`. The images are not in the repository.
- **GitHub Pages** via GitHub Actions; pull requests only build and store the screenshots as an artefact.
- **Changelog = GitHub Releases.** The text comes from `docs/releases/<tag>.md` or, if the file doesn't exist, from the commit subjects since the previous tag.
- **Release on a new version number (#34).** If a version is on `main` in `package.json` for which there is no tag yet, "Prüfen und Image bauen" creates the image with the version number after passed checks, then tag and release (`release.yml` as a reusable workflow). Not with every commit: that way the version number stays meaningful, and several requests can be bundled.
- **Image tag in the same run**, because a tag created with the workflow token starts no further workflows; so no additional token is needed. Manually pushed tags and manually published releases keep working.
- **Help link** in the user menu to the User manual, for administrators additionally to the Administrator manual.

## Email and address in the Workbench (#37) {#e-mail-und-adresse-in-der-werkbank-37}

- **No more environment variables** for email sending and address: maintained in the Workbench, stored in `einstellungen` (`mail`, `adresse`), effective without a restart – accounts fetch the mailer and the address every time they use them (`Betrieb` in `server/src/betrieb.ts`).
- **One-off takeover** of the former variables `SMTP_*` and `APP_URL` at the first start, only as long as nothing is stored; ignored afterwards, with a notice in the log. That way sending doesn't fail on the update.
- **Without a maintained address**, the address of the current request applies (`req.protocol` and `req.host`, behind a proxy via `X-Forwarded-*`, see below). It is in the request context so that accounts find it without an additional parameter.
- **Password encrypted** (since #39), never returned to the interface; an empty field keeps it.
- **Testing with unsaved values:** check and test email take the values from the form, so that you see before saving whether it works.

## Views (#38, #40, #41) {#ansichten-38-40-41}

- **View = saved query**: folder types and conditions that all apply together (AND). Operable filters above the list are deliberately a later step.
- **Tree via `eltern_id`**; a view shows its own hits and those of all descendants. Technically every view with its own folder types is a **clause** (folder types + filter); a view with subviews is the OR of its clauses – so there are no duplicates, and counters, search, sorting and page-by-page loading work unchanged on the server.
- **Dynamic values are resolved per query** (today in Europe/Berlin, current user, their roles from the user folder). The repo only gets fixed values (`Filter`); `shared/src/sichten.ts` translates conditions → filter, `repo-pg.ts` filter → SQL. The same test cases run in memory and against PostgreSQL.
- **Invalid conditions are ignored, not evaluated**: a removed field doesn't empty the view; the Workbench marks it.
- **Moving without a break**: the previous views per folder type became managed views with the folder type's id (migration 013). Bookmarks `/ablage/<id>` and remembered sort orders `sortierung:<id>` stay valid. A type id without a view still shows all folders of the folder type, so that links to folders never lead nowhere.
- **`typ:<id>`** returns all folders of a folder type without conditions – for choosing links, the title preview and the API. Otherwise a view with conditions that happens to carry the folder type's id would restrict the choice.
- **User and role** get their views at the end of the first level in new installations.

## Encrypted passwords (#39, #46) {#verschlusselte-passworter-39-46}

- **Key as a file, never in the database**: 32 bytes, created at the push of a button in the Workbench (`/data/geheim/dms.schluessel`, permissions 0600, its own volume). The database only contains the fingerprint – that way Ablago recognises a missing or foreign key and shows which values have to be entered again. A database backup alone thus reveals no passwords.
- **AES-256-GCM per value** with its own random number, stored as `dms1$<nonce>:<ciphertext>`; the prefix allows another method and the key change later (#47).
- **No ciphertext leaves the server**: every answer runs through a mask that replaces encrypted values with `{gesetzt, lesbar}` – regardless of which route delivers them. Plain text only comes individually (eye, logged) or via the API with a permission of its own.
- Without a key no password can be saved. A plain-text password from older versions (SMTP) keeps working and is encrypted as soon as there is a key.

## Bin (#43) {#papierkorb-43}

- **Own table instead of a deletion mark**: deleted folders move with their links and documents as JSON into `papierkorb`. All queries on `mappen` stay unchanged; unique values become free; the bin turns up nowhere else.
- **Restoring** creates the rows again. Links to folders that no longer exist are dropped; if the folder then doesn't fit (e.g. a unique value already taken), "To do" shows it – only it, not the other one.
- **Files stay** until the bin is emptied; only then does Ablago check whether a document (also in the bin) still depends on the file.
- **User invitations** in the bin are deactivated; the account is only finally deleted when emptying. 0 days of retention switches the bin off.

## Text recognition (#45) {#texterkennung-45}

- **In its own process, queue in the database** (`dokumente.ocr_stand`): no additional container; after a restart it continues. Simultaneous jobs are configurable (default 1, for small NAS).
- **Text layer first**: `pdftotext` per page; only pages with hardly any text go through text recognition. That keeps it fast where it isn't needed.
- **Text recognition as a package (#458, #459, since 0.134):** Tesseract is no longer in the image. The core only reads the text layer and reports every document with the event "Full text ready"; scans and photos are recognised by the package **Text recognition** (Tesseract as WebAssembly in the package runner). Reasons: a slimmer image for everyone who has no scans, updates of Tesseract and language data independent of Ablago, further languages as additional packages instead of images of their own. The price: the package is about a third slower than native Tesseract (one thread) (see [Text recognition](texterkennung.md#texterkennung-als-paket)). Redacting only finds words in the text layer now; scanned pages are redacted with areas.
- **Same content, same text**: files are known by their checksum; an already recognised text is taken over.
- **PostgreSQL's German full-text search** (`to_tsvector('german', …)`, GIN index, `websearch_to_tsquery`): finds word forms; the match comes from `ts_headline` with control characters as markers – never as HTML.
- Office documents are now read by packages such as "Office and email". Text recognition still only runs on your own device – an external service is not planned ("Thinks along, on your device").

## Recognising the language automatically (#395) {#sprache-automatisch-erkennen-395}

- **Own small language recognition instead of a library:** new npm dependencies (franc, CLD) were not to go into the image. For letters, invoices and receipts, counting typical function words and special characters per language is enough (self-compiled lists, `shared/src/textsprache.ts`), offline and without measurable computing effort. With very little text the language deliberately stays open.
- **Second pass only in case of doubt:** only with another, clearly recognised language with an installed language package and an uncertain first pass (average Tesseract confidence below 85 %); it is decided after the first page read, the better result applies to the whole document. Since 0.134 the package Text recognition does this – there also with a certain first pass, because it first only reads German.
- **Orientation via Tesseract OSD:** scanned pages are rendered as a greyscale image (PGM) and rotated if needed – without an additional image tool in the image. Since 0.134 in the package Text recognition (Leptonica rotates in the package).
- **Language in the text recognition note** (`ocr_info`, "· Sprache: fra (87 %)") instead of a new column: no migration needed; a later column can take over the value from there. The full-text search therefore still uses the German stemming configuration for all documents.

## Building the image natively per architecture (#88) {#image-je-architektur-nativ-bauen-88}

- **No more QEMU:** the arm64 image used to be created emulated on Intel computers; the emulation crashed several times during `npm install` with error 132 (0.8.1, 0.13.0), and with it image, tag and release failed to appear. Now every architecture builds on a matching GitHub machine (`ubuntu-24.04` or `ubuntu-24.04-arm`, free for public repos).
- **Upload only under the digest, then merge:** every part is uploaded without a tag; `image-zusammen` creates the common image with all tags from them with `docker buildx imagetools create` and checks that both architectures are included. The release only arises afterwards.
- **Pull requests** also build both architectures natively as a test (without publishing).

## Permissions (#123–#127, #137) {#berechtigungen-123127-137}

- **Rules only on the folder type**, with a default (since 0.32 ✓/✗ per permission, before granted/withdrawn) and ordered rules "if … then ✓/✗/– per permission" with Stop – like a firewall. No permissions on individual folders: what makes a folder special is in its fields, and the conditions target those.
- **CRUDP**: create, read, edit (fields and documents), delete, see passwords. Notes, tasks and email only need reading. Without reading nothing works except creating.
- **One expression, two evaluations**: conditions about the user are already decided at sign-in; what remains are filters about the folder – in memory for a single folder and as SQL for lists, search and counters. That way list and folder always agree, and pages stay fast.
- **Administrators** are not subject to rules but don't work in the Library either (#128). Since 0.32 (#146) there are no more ticks as an upper limit: admins shouldn't work in the Library, but if they have to, without unnecessary hurdles. The ticks were transferred into the default (✗ C/D) without extra permissions for users; only the system rule (User: no C/D) applies to everyone. For *Post*, C governs who may create new post; Ablago always creates sent emails. The test run is directly on the folder type, also for unsaved rules; "What does a user see?" is on the user.
- **Choosing users only among visible users** (#137): that way a program can be cleanly limited to its section via the API.
- **Field permissions** (hiding individual fields) will come later if needed.

## Deadlines (#129–#133) {#fristen-129133}

- **Deadlines are tasks** – no list of their own: "To do", summary, absence, stand-in and passing on apply without special routes. An additional due-date email deliberately doesn't exist.
- **Created only from "date − advance notice"**, once per folder, field and date (unique index). That way "To do" stays the list of what is to be done now; month and year give the outlook.
- **The date never changes by itself**: recurring dates only suggest the next one.
- **Free reminders** are in a table of their own until their day and then become tasks; in the bin they move along.
- **Calendar in "To do"** (#528, #725): no entry "Calendar" of its own but a switch list · month · year in *To do*; the former view *Upcoming* with its "soon" preview is gone – automations create the task at the right time, nobody has to calculate lead times backwards. Month and year show the dates of the deadline fields on all readable folders ("may read" instead of "for me", because #712 removes the recipient from the field; filter "favourites only"), one's own tasks with a date and reminders. Read only (no dragging, no free dates without a folder) – whoever wants to plan routines creates a folder type with a recurring deadline. Future dates of recurring deadlines are calculated (date + k · interval) and never stored; a month or year comes in one request and, like the views' numbers (#512), is in the cache. A calendar subscription (ICS, #529) is a topic of its own.

## Key change (#47) {#schlusselwechsel-47}

- **One transaction** for all encrypted values (folders, bin, settings) including fingerprint and check word; the new key file is next to it as `dms.schluessel.neu` until then and only replaces the old one afterwards. A restart in between is recognised at start-up and completed.
- **No keeping of the old key**: older backups name their fingerprint; for restoring, the old emergency sheet serves.

## Proxy information automatically (#234) {#proxy-angaben-automatisch-234}

- **Default "private networks"** instead of `false`: Fastify gets `trustProxy: ['loopback', 'linklocal', 'uniquelocal']`. Without a setting, IP addresses and the block after failed attempts (per email and IP) were wrong behind a proxy – and hardly anyone set the variable because everything else worked.
- **Residual risk deliberately accepted:** a device in the home network that reaches Ablago directly could fake an IP. Whoever wants to rule that out sets `false` or a list. From the internet it doesn't work as long as there is no port forwarding with a disguised sender address (e.g. Docker userland proxy) in between.
- **Wrong values** don't stop the start: `auto` applies, with a warning in the log.

## Customising the Workbench (#281) {#werkbank-anpassen-281}

- **Hiding doesn't mean switching off.** The templates *Household*, *Business* (up to 0.73 "Organisation") and *Everything* only determine which areas are on the left of the Workbench. What is hidden keeps running (e.g. mailboxes, log) and stays reachable via the address and the overview. New installations start with *Household* so that the Workbench stays clear for families; businesses choose *Business*.
- **Areas in one place:** `shared/src/werkbankansicht.ts` lists all areas with group and templates; the manual generates its tables from it. A later regrouping and graded administrator permissions start there.
- **Graded administrator permissions** (#282) – for instance an administrator only for users – are postponed: at home there is usually one administrator, and every additional level makes the Workbench harder to understand. Since the self-employed and small businesses became part of the focus (03.11.2026), this is an **open point**: in a business there may be several administrators with different tasks.

## Deliberately not in yet {#bewusst-noch-nicht-drin}

Field permissions (hiding individual fields), text recognition for Office documents, a calendar subscription for deadlines, graded administrator permissions (#282; open since small businesses became part of the focus). Backup (#48), two-factor sign-in and the calendar export in the full export are there by now.
