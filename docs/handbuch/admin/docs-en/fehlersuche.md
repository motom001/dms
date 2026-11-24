# Troubleshooting and support {#fehlersuche-und-support}

Everything about this is in the workbench under **Maintenance and troubleshooting**. The group contains system health, Log, Reported problems, Maintenance mode, Maintenance operations and Load test data. This page describes the troubleshooting tools and *Technology* (version and updates), which is under **Settings**; [System health](speicherplatz.md), [Maintenance mode](wartungsmodus.md), [Maintenance operations](texterkennung.md#wartungsoperationen) and [Load test data](demo.md) have their own pages. Backup, Restore and Full export are under **Protecting your data**.

*Log* and *Reported problems* are in the bar from the level **Household**. *Technology* is in every level.

--8<-- "ausgeblendet-schritt.md"

## Reported problems { #gemeldete-fehler }

Users report problems via **Report a problem** in their menu or under *My account* – with their own description, up to two screenshots and technical details (version, browser, screen size, language, time zone, the last 25 pages visited, the last 10 errors in the browser and failed requests). Passwords, contents of folders and cookies are not sent along. The report stays in your Ablago – it never goes to the project. Whoever wants to make a GitHub issue out of it does so themselves.

If a page cannot be displayed because the interface runs into an error while drawing it, you see “Something went wrong here” with **Reload** and **Report an error** instead of a blank page. When signed in, the button leads to **Report an error**; without signing in (for example in the setup assistant) it copies the technical details to the clipboard, and the message itself is under “Technical details”.

![Workbench → Reported problems](bilder/werkbank-fehlermeldung.png)

Under **Workbench → Reported problems** are the reports, newest first; the counter in the sidebar and in the overview names the open ones. The search field above the list searches the text of the reports and the person who reported; the tick box **Show completed** below it adds the completed ones (they carry the mark *done*). In the report you see description, screenshots and details and can **mark it as done** (and reopen it) or **delete** it – permanently, including text, images and details. Whoever reported sees only the status under *My account → Report a problem → My reports*: **open** or **done on …**; a deleted report appears there as *done*, with its date only. If you delete the person (only possible for invitations that were never accepted), these remnants go too; reports you have not deleted stay, without a reporter. Deliberately, there is no further reply in Ablago – no answers, no “read”; you clarify questions your own way.

## Log { #protokoll }

**Workbench → Log** shows what is happening in Ablago – the last 24 hours, at most 10,000 entries, the newest at the top. After a restart the list starts empty; permanently, everything is in the container logs.

![Log](bilder/werkbank-protokoll.png)

Every entry belongs to a **module**, such as *User accounts and sign-in* (`konto`) for sign-ins and locked accounts or *Backup* (`sicherung`). Which modules exist is listed under [Technology → Modules](technik.md#module).

You can filter by level, module, user and text; **Live** updates the list every two seconds. A click on an entry shows all its data, including user and request id.

If Ablago runs with [several processes](technik.md#mehrere-prozesse) (`DMS_PROZESSE`), each process has its own log. The workbench fetches the entries of all processes and merges them by time; each entry then names its process (*Process 1*, *Process 2*). The “stored” count adds them all up. Output and errors of the package runner and of package code are in the module *Packages* (`pakete`).

### Debug mode {#debug-modus}

Switches on additional, detailed messages for **24 hours** – such as every single database query –, with several processes in all of them. There are two ways:

- **Switch in the workbench** under **Workbench → Log**: applies immediately to all processes, also to one that restarts in between. **Switch off** ends it immediately.
- **`LOG_LEVEL=debug`** in the Compose file (see [Installation](installation.md#einstellungen)): Ablago then writes in detail from the very first line of the start, in all processes – useful when an error occurs during start. After 24 hours Ablago switches back to the normal level by itself and writes a note to the log that you should remove the variable again. If you remove it and set it again later, the 24 hours start over.

Whether debug mode is running, where it comes from (variable or workbench) and until when is shown under **Workbench → Log** above the entries and in [System health](speicherplatz.md) under **Settings**, with date and time. A long debug mode fills the log quickly and costs computing time; that is why it always ends by itself.

### Container logs { #container-logs }

Every message appears as a readable line in the container's logs (the log texts are German):

```text
2026-10-28T09:12:33.120Z INFO  [ablage] folder angelegt benutzer=lena@example.org typ=Rechnung titel="R-17 vom 01.10.2026"
```

```sh
docker logs <app-container>
```

## Database { #datenbank }

Long database accesses and requests, the **server load** and what is currently running in the database are shown under **Workbench → Settings → Database connection**, below the connection – see [Long database accesses](installation.md#lange-datenbankzugriffe). If Ablago seems slow, look there first – and under **Maintenance and troubleshooting → [System health](speicherplatz.md#auslastung)** to see how busy CPU, memory and network are.

Entries beginning with **Anfrage:** (request) concern a whole request; expanded, they show the **breakdown**: waiting before the handler, database (with the number of accesses), permissions, preparation and JSON. Details at the same time are in the [log](#protokoll) (module *datenbank*).

**Server load:** Ablago handles requests on one thread. If one request calculates for a long time, all others wait that long. The values show how long waiting typically took in the last minute, in 99 % of cases and at most. Below 50 ms is unremarkable; from 100 ms (99 %) a notice appears.

## Timing (developer mode) { #zeitmessung-entwicklermodus }

If a page seems slow, switch on **developer mode** under **My account**. Then Ablago shows at the bottom right for every page request, per request, where the time went, and at the top the total over all requests of the page. It only applies to your account.

| Section | What it is |
|---|---|
| Waiting (browser) | The request is waiting in the browser. It sends at most about 6 requests at the same time to one server; the rest wait. |
| Line | The way there and back without the time in the server – an approximation. It also contains the waiting before the server accepts the request at all; if it is busy, the **load** under Workbench → Database shows it. |
| Waiting (server) | From arrival in the server until processing, e.g. reading the request body. |
| Permissions | Evaluating permissions (building access, read filters, permissions per folder), without the database accesses in it. |
| Database | Number and duration of the database accesses. |
| Preparation | The remaining time in the server. |
| JSON | Converting the answer into text in the server. |
| Transfer, parsing, rendering | Sending the answer, reading and drawing it in the browser. |
| External services | What the server waited for in this request: AI service (with package), mailbox, sending, sign-in provider or a package's network – per call the time to first response, the total duration, the size and whether it was an error or a timeout. The time is part of *Preparation*. For "Ask your library" it appears as a line of its own once the answer is complete. |

The values come from the server in the header `Server-Timing` (`vor`, `app`, `db`, `rechte`, `json`, `gesamt`, for external services `extern` with total and number and per call `extern-1` …) and from the browser's timing. What went to external services in the last hour or 24 hours is shown under [System health → External services](speicherplatz.md#externe-dienste). For the views' numbers (`/api/sichten`) there is additionally `zs`: `treffer` if they came from the cache, `neu` if they were counted – counting happens after every change in the household, otherwise at the latest after 5 minutes (views with a date reference) or 30 minutes and at midnight.

### Is it the cache? { #zwischenspeicher }

So that Ablago stays smooth even with many folders and many simultaneous changes, it remembers expensive results: the counts per folder type and view, the number of results in a list and the dates in *To do* and on the start page (#918). The principle: **lagging behind is fine, wrong never.**

- What you change yourself you see straight away – also when Ablago runs with [several processes](technik.md#mehrere-prozesse).
- If someone else changes something, the counts in your Library may catch up a few seconds later. The number of results in a list is always exact.
- A star (favourite), a note, the history and "seen" do not recalculate the counts per folder type and view.
- Ablago calculates the dates of recurring deadlines on every request from the date and the rhythm of the folder type; a pre-filter in the database only picks out the folders that can have a date in the period. There is no nightly run the dates depend on.

If Ablago shows a count or a date that stays wrong, set the variable `DMS_ZWISCHENSPEICHER=aus` in the container and restart. Ablago then calculates everything afresh on every request – slower, but without caches. **Workbench → Maintenance and troubleshooting → System health** then shows a notice, and so does the load test report. If it is right now, the cache was the cause: please report it as an [issue](https://github.com/motom001/dms/issues/new?template=fehler.md), with what you did and what you saw. Remove the variable again afterwards.

## Technology { #technik }

**Workbench → Maintenance and troubleshooting → system health → Version and updates** shows in the section **Installed** (below *Newer versions*) what is installed: version and state of Ablago, runtime (Node.js, operating system), database, libraries, [built-in tools](#werkzeuge) and interface.

![Technology and versions](bilder/werkbank-technik.png)

- **For support:** copy the overview and paste it into a [GitHub issue](https://github.com/motom001/dms/issues/new?template=wunsch.md). Passwords and credentials are not in it.
- **Newer versions:** one push of a button asks whether there are newer versions – at GitHub for Ablago, at endoflife.date for Node.js, PostgreSQL and Alpine, at npm for the libraries. Without a push of the button, Ablago asks nowhere. For Ablago itself, *Current* shows the newest stable version with its date – the one `:stabil` points to (it moves once a week, see [Which image tag?](aktualisieren.md#image-tag)); it only says “newer” once there is a new stable version. If you already run a newer state (`:main` or a higher fixed number) and there are further changes on `main`, the notice names them.

How the building blocks fit together is described under [Technology](technik.md).

### Built-in tools { #werkzeuge }

Some work Ablago does with programs that the official image includes. Here they are called **built-in tools**:

| Tool | Programs | what for | if it is missing |
| --- | --- | --- | --- |
| Reading PDFs (Poppler) | `pdftotext`, `pdftoppm` | text from PDFs for the search (text layer), page images and thumbnails, redacting, images when [shrinking](speicherplatz.md#grosse-pdfs-verkleinern) | PDFs get no full text, page images and thumbnails are missing |
| Editing PDFs (qpdf) | `qpdf` | recognising and [unlocking](https://help.ablago.app/benutzer/aktuell/en/dokumente/#passwortgeschuetzte-pdfs) protected PDFs, structure of PDFs when shrinking | protected PDFs can't be unlocked, shrunk PDFs get a little less small |
| Substitute fonts (Liberation, DejaVu) | fonts in the image | text of PDFs that don't embed their fonts (often Helvetica or Arial in invoices) in page images, thumbnails and the [archive version](https://help.ablago.app/benutzer/aktuell/en/dokumente/#archivfassung-pdfa) | such PDFs appear there without text; the original and the search are not affected. No archive version is created then either – the previous one stays, the reason is shown at the document |

If all are there, there is nothing to do: they only appear as a line under **Installed** ("available"). **If one is missing**, a notice at the top of **Text from PDF and text recognition** (under *Packages → Included with Ablago*) and in **System health** says what doesn't work because of it – e.g. "A tool for reading PDFs is missing. So Ablago can't read text from PDFs and can't show page images." – with **Check again** and **More about this** (this section). Ablago checks at start-up; **Check again** checks once more straight away, for example after you have changed the image. For the fonts Ablago renders a small PDF with non-embedded Helvetica and Arial; if rendering a document reports a missing font, that counts too.

In addition, each missing tool appears as a message on the start page of the workbench, the [Overview](uebersicht.md#meldungen) – exactly once per tool, with what follows and what helps: red if the tool for reading PDFs is missing (`werkzeug.fehlt:poppler`), otherwise yellow (`werkzeug.fehlt:qpdf`, `schriften.fehlen`). The button **View and check again** leads to the notice in system health with **Check again**. Everyone who manages the area *System health* sees the message. If everything is there, nothing appears.

**Remedy:** with the official image (`ghcr.io/motom001/dms` or `dms-komplett`) nothing is missing. A tool can practically only be missing with your own, incomplete image or an installation without a container. Then the programs belong in it: on Alpine `apk add poppler-utils qpdf fontconfig font-liberation font-dejavu`, on Debian and Ubuntu `apt install poppler-utils qpdf fonts-liberation fonts-dejavu-core`. Then restart Ablago or press **Check again**.

## Start page: "Ablago could not start" { #start-datenbank }

If the start fails, the page at Ablago's address gives the reason in plain language and below it what you can do. The exact message is in the [container log](#container-logs). After about 5 minutes the container exits and Docker restarts it (`restart: unless-stopped`) – a temporary problem thus resolves itself.

| Reason on the page | What you can do |
| --- | --- |
| The database cannot be reached or does not accept connections. | With your own database container: check that it is running, restart it, then Ablago's container. With dms-komplett: restart the container. |
| The database is blocked: a lock took too long. | Is a second Ablago running on the same database, e.g. an old container? Stop it, then restart. |
| The database can no longer write: the storage is full. | Free up space on the database's storage (old backups or exports), then restart. |
| The database does not accept any more connections. | Stop other programs on the same database or raise `max_connections` in PostgreSQL, then restart. |
| The database cannot write to its folder (dms-komplett only). | Check the permissions of the database folder on the NAS or use a named volume, see [The container doesn't start](https://help.ablago.app/installieren/aktuell/en/komplett/#container-startet-nicht). |
| Ablago cannot write to one of its folders. | Since Ablago runs without administrator rights, its user must be allowed to write to `/data`. Ablago already runs as the owner of the folders; if they belong to different users, a folder is mounted read-only, or root in the container may not change anything (`root_squash`), it cannot fix this by itself. The start page and the container log name who owns which folder and give the fix as ready-made lines (`PUID`/`PGID` or `chown` on the NAS), see [Without administrator rights](aktualisieren.md#ohne-root). |
| The database comes from another major version of PostgreSQL (dms-komplett only). | Set the image back to the version the database was created with; switch via backup and restore. |
| The database could not be created or was stopped (dms-komplett only). | Usually the storage is full or the container has too little memory. Free up space and restart; the lines in the container log give the reason. |

## Typical problems {#typische-probleme}

??? question "After the update the container doesn't start."
    The container log says why, usually a migration or a missing database connection. The migrations run in a transaction – the database has stayed unchanged. If necessary, go back to the previous version (image tag) and create an issue with the log.

??? question "dms-komplett doesn't start; the log says “kann nicht in /data/postgres/daten schreiben” (cannot write)."
    The container fixes the permissions of the database folder itself on start, even with `000` on the NAS. If that doesn't work (network share, ACLs), it stops with this message. What to do is described under [The container doesn't start](https://help.ablago.app/installieren/aktuell/en/komplett/#container-startet-nicht) in the installation manual – including why `stop_grace_period: 60s` must not be missing from the Compose file.

??? question "Red message: “The database is only stored inside the container …”"
    With dms-komplett, the line for `/data/postgres` is missing from the Compose file. Rescue the data first (`docker compose stop`, not `down`, then `docker cp`), then add the line – step by step under [Rescue the database from the container](https://help.ablago.app/installieren/aktuell/en/komplett/#datenbank-retten).

??? question "After the update the page is blank or shows errors that were fixed long ago."
    The browser is still running the interface of the old version against the new server. Ablago detects this on every page – including sign-in and the setup assistant – and shows “A new version is available” at the top with **Reload page**; the setup assistant reloads itself (you then need to enter any passwords again). If a file of the interface is missing, Ablago answers with “not found” (404). If that doesn’t help, reload the page without the cache (usually Ctrl+Shift+R or Cmd+Shift+R).

??? question "Emails don't arrive."
    Under **Workbench → email and address**, first **Check connection**, then **Send test email** – the mail server's message is shown below. Typical: wrong password (many providers need an app password), connection type doesn't match the port (STARTTLS ↔ 587, SSL/TLS ↔ 465), port blocked by the network. The log (module `mail`) records every sending with an error. Also look in the spam folder.

??? question "Ablago is sluggish while someone is exporting or editing many PDFs."
    Heavy work runs in separate [workers](speicherplatz.md#arbeiter-fur-pdf-und-exporte) (#542); other users should hardly notice. Under **Workbench → system health → Load** you see whether the workers are busy, how many jobs are waiting and how high the **server's waiting time** is. If the container's CPU is permanently at the limit, cores are missing – give the container more (`cpus:`) or set `DMS_ARBEITER` lower, so that requests and database get more computing time. If the log says "Hohe Wartezeit des Servers" (high server waiting time) although the workers are idle, something is calculating in the main thread: please report it as an issue, with the log entry.

??? question "A PDF edit or an export aborts with "took longer than 10 minutes" or "more memory than allowed"."
    A job in the worker may take at most 10 minutes and use 1.5 GB of memory – so that a single huge PDF doesn't paralyse Ablago. Export fewer folders at once or split a large PDF beforehand ("Pages"). If the worker runs at the container's limit (`mem_limit`), more memory for the container helps.

??? question "Links in emails point to localhost."
    Under **Workbench → email and address**, enter the address under which users open Ablago.

??? question "Sign-in doesn't work behind the proxy."
    If Ablago's address (Workbench → email and address) is an `https://` address, the session cookie is only set via HTTPS. Then also open Ablago via HTTPS. If `TRUST_PROXY` is set to `false` or to a list that doesn't contain the proxy, Ablago doesn't believe the proxy that the connection is HTTPS – then remove the variable. See [Behind a reverse proxy](installation.md#hinter-einem-reverse-proxy).

??? question "The log and the sessions always show the same IP address."
    That is the reverse proxy's address: Ablago doesn't believe its information. Look under **Technology** at what `TRUST_PROXY` says. If the proxy has a public address, `TRUST_PROXY` can be set to this address or to `true` – more under [What the proxy tells Ablago](installation.md#was-der-proxy-dem-dms-mitteilt).

??? question "Uploading large files aborts."
    Allow larger requests in the reverse proxy, e.g. for nginx `client_max_body_size 260m;`. Ablago accepts documents up to 100 MB, packages up to 128 MB and bundle files up to 256 MB; the limit in the proxy should be a little higher. All limits: [Technology → Limits](technik.md#grenzen).

??? question "The interface is unusable after a design change."
    Append `?design=standard` to the address, see [Themes](designs.md#eigenes-css).

??? question "A user reports a problem that I can't reproduce."
    [Sign in as this user](benutzer.md#fehler-nachstellen) and reproduce it there.
