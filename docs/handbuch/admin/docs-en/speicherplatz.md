# System health {#systemzustand}

How is the server doing right now? That is shown by **Workbench → Maintenance and troubleshooting → system health**: the **storage space** and the **load** of CPU, memory and network. (The area used to be called *Storage space* and was under *Settings*; old links and bookmarks lead here.)

Since the workbench was tidied up, the same page also shows the **long database accesses** and what is running in the database right now (formerly under *Database connection*), the [external services](#externe-dienste) with the [AI costs](#ki-kosten) as well as **Version and updates** (formerly an area of its own, *Technology*, see [Troubleshooting](fehlersuche.md#technik)).

So that nothing ever gets lost when saving and uploading, Ablago measures itself how much space is free, warns in good time and stops itself at the limit. At the top of the page are the **thresholds**, below them the [load](#auslastung), then the **folders** with their usage, at the very bottom **Shrinking large PDFs**.

--8<-- "ausgeblendet-schritt.md"

![Workbench → system health](bilder/werkbank-speicherplatz.png)

## Warning threshold and limit {#warnschwelle-und-grenze}

At the very top of the page. You set both in **GB free** or **% free**; percentages refer to the size of the respective disk. They apply to every folder individually.

| Level | Default | What happens |
| --- | --- | --- |
| **Warning threshold** | below 10 % free | Notice in the [overview](uebersicht.md) and on this page, **one email** to all administrators (once per dropping below – only when enough was free again is there a new one next time). Everyone keeps working normally. |
| **Limit** | below 2 GB free | **Uploading blocked immediately** (new documents, logos); saving values still works. Email to all administrators, and [maintenance mode](wartungsmodus.md) starts with **5 minutes' notice** and the text **"Storage limit reached"**. |

The warning threshold must require more free space than the limit – otherwise the warning would only come afterwards.

## Load {#auslastung}

If Ablago is slow, you see here what the cause is – without the NAS's console. Ablago measures the load of **its container** **every minute**; the small curves show the last hour, next to them is the value **now**. The values are only in memory; after a restart the curves begin anew.

![Workbench → system health → Load](bilder/werkbank-auslastung.png)

| Value | What it means |
| --- | --- |
| **CPU** | Share of computing time on the cores the container may use (limit from `cpus:` in the Compose file). Without a limit, the share refers to all cores. Below it the **system load** of the whole computer (1, 5, 15 minutes) – if it is permanently above the number of cores, the NAS as a whole is at capacity, not just Ablago. |
| **Memory** | Used out of the container's limit (`mem_limit:`); without a limit compared with the whole computer. Below it the shares of **Ablago**, the **package runner** (only runs with installed packages with code) and – with dms-komplett – **PostgreSQL**. |
| **Network** | Received and sent per second, over all the container's network interfaces. |
| **Server waiting time** | How long a request had to wait because Ablago was computing something else (event loop). The details are under **Settings → [Database connection](installation.md#lange-datenbankzugriffe)**, together with the long database accesses. |
| **Workers for PDF and exports** | How many [workers](#arbeiter-fur-pdf-und-exporte) are busy right now, how many jobs are waiting, how long a job takes and waits on average, what failed. |

**Warning:** if CPU or memory is **above 90 % for 5 minutes**, a notice is shown here, in the [overview](uebersicht.md) and as **high** next to *System health* in the bar – even if the area is hidden. Ablago warns in the same way when the **server waiting time** is **above 100 ms** for 99 % of measurements (p99) in **5 consecutive minute windows**; then there is additionally an entry in the [log](fehlersuche.md#protokoll) (module `datenbank`, "High server waiting time") and one as soon as it is normal again. You just about notice 100 ms when clicking; if almost every request waits that long in the queue, Ablago is noticeably sluggish.

**Typical causes and what helps:**

- **Text recognition** is working through many new scans – that passes; the queue is under [Text recognition](texterkennung.md).
- **Demo data** is being created or removed – also temporary.
- A **package with code** is computing a lot – the share *package runner* shows this; load per package follows in a later version.
- Memory is permanently tight – raise `mem_limit` in the Compose file (at home and in small businesses 1–2 GB is usually enough, with text recognition rather 2 GB; measurements under [What Ablago copes with](verkraftet.md)) or give the NAS more memory.
- The computer's system load is high, but Ablago's CPU isn't – then another service on the NAS is slowing things down.
- The **server waiting time** is high although CPU and memory are free – then Ablago is computing something big in the main thread. Please report this as an [issue](https://github.com/motom001/dms/issues) with the entry from the log; heavy work belongs in a [worker](#arbeiter-fur-pdf-und-exporte).

### Workers for PDF and exports { #arbeiter-fur-pdf-und-exporte }

Ablago answers all requests in **one** thread. If it is computing something big, all others wait. That's why the heavy work runs in separate **workers** next to the main thread: stamping and watermarks when passing on, editing and merging pages, redacting, shrinking, thumbnails of photos, PDF exports, access copies, labels, deletion concept and deletion log as PDF, demo documents as well as Excel and CSV tables of large exports. Text recognition and thumbnails of PDFs always ran as separate programs; the [package runner](pakete.md) is a separate process and has nothing to do with the workers.

- **Number of workers:** the default is half of the cores the container may use (limit `cpus:` in the Compose file, otherwise all cores of the computer) – at least 1, at most 4. The main thread and PostgreSQL need the remaining cores. It can be changed with the environment variable `DMS_ARBEITER` (1–16, see [Installation](installation.md#einstellungen)); `DMS_ARBEITER=0` switches the workers off – then everything runs in the main thread as before (only for troubleshooting).
- **Queue:** if all workers are busy, a job waits. If 50 are already waiting, Ablago answers immediately with "A great many PDF jobs and exports are running right now. Please try again in a minute." (HTTP 503) instead of endlessly.
- **Time limit:** a job may take at most **10 minutes**. After that the worker is ended, and the user reads "Processing took longer than 10 minutes and was cancelled."
- **Memory:** a worker may occupy at most 1.5 GB. If a huge PDF needs more, only this job fails ("… more memory than allowed …"), not Ablago.
- A worker is created when needed and ends itself again after two minutes without work; one is ready from the start.

More workers only help if enough cores are free: with 2 cores it stays at one worker so that requests and the database don't go short.

### Settings and bottlenecks { #einstellungen-und-engpasse }

Below the values is **Settings for many simultaneous requests** – only for viewing, with the current value and where it comes from (*default* or *from the environment*):

| Line | Variable | allowed | Default |
| --- | --- | --- | --- |
| Processes for requests | `DMS_PROZESSE` | 1–16 or `auto` | 1 |
| Workers for PDF and exports | `DMS_ARBEITER` | 0–16 | half of the cores, 1 to 4 |
| Database connections (all processes together) | `DMS_DB_VERBINDUNGEN` | 2–100 | 10, 4 more for each further process |
| Simultaneous requests at most | `DMS_MAX_ANFRAGEN` | 20–10,000 | 250 |

With [several processes](technik.md#mehrere-prozesse), workers and simultaneous requests apply **per process**; the value is then followed by "per process, together …". The connections apply to all processes together (#874); after them it says how they are divided ("leader 9, each further one 5"). Above it, the table **Processes** shows per process its task (process 1 leads and does the background work), memory, computing time, waiting time and running requests; *Ablago* under memory is then the sum of all processes.

They can only be changed as an environment variable in the Compose file (see [Installation](installation.md#einstellungen)); they apply as soon as the container has been recreated. An invalid value is ignored at start-up (notice in the log); then the default is shown here. Why the defaults are as they are is under [Technology → Many simultaneous requests](technik.md#last).

If something gets tight, a **bottleneck** notice appears above the values with the variable that can help (also as a notice in the overview):

| Bottleneck | when | Variable |
| --- | --- | --- |
| Server waiting time | often above 100 ms for 5 minutes (see above) | `DMS_ARBEITER` – the workers take PDF work and exports off the main thread. If the CPU is full anyway, only more computing time for the container helps. |
| Waiting for a database connection | usually above 50 ms in the last minute | `DMS_DB_VERBINDUNGEN` – only sensible if CPU and database aren't at capacity |
| Workers' queue full | a job was rejected in the last 15 minutes | `DMS_ARBEITER` – only sensible with free cores |
| Overload protection | "very busy right now" (503) in the last 15 minutes | `DMS_MAX_ANFRAGEN` – first check whether a program (e.g. via WebDAV) is sending unusually many requests; a higher limit doesn't make Ablago faster |

**Not available** is shown where the container can't read a value – Ablago doesn't estimate anything and needs no additional permissions (no privileged container, no Docker socket). If the database runs in a container of its own or on another server, Ablago doesn't see **its** load; that is noted below the memory.

## What is measured {#was-gemessen-wird}

The three fixed folders in the container are measured (see [Folders and volumes](installation.md#ordner-und-volumes)) – every minute and additionally before every upload:

| Folder | Content |
| --- | --- |
| `/data/files` | Documents, logos, images of reported errors |
| `/data/geheim` | Key and emergency access |
| `/data/sicherung` | Backups |

Per folder, the page shows used, free and the size of the disk, as a bar with marks for warning threshold and limit. If all three are on the same disk (the usual case on the NAS), the page shows **one** bar "One disk for files, key and backups" with the folders below it – and the notice that the backups are thus on the same disk as the documents. If only some are on the same disk, that is noted at the respective folder. Below it, it says how much of it the documents' **thumbnails** occupy (folder `/data/files/vorschau`, usually a few kilobytes per document). They are **not backed up** – after a restore they are created anew on display or via **Maintenance operations → Catch up thumbnails**. **Workbench → system health → Version and updates** shows the same numbers in the overview for support.

!!! note "The database is not measured"
    With two containers, PostgreSQL runs in a container of its own; Ablago can't see its volume. With [dms-komplett](https://help.ablago.app/installieren/aktuell/en/komplett/) the database is in the fourth folder `/data/postgres` – Ablago doesn't measure that either. If all folders are on the same disk of the NAS (the usual case), the measurement is still enough. If the database is on another disk, keep an eye on its space in the NAS's storage manager.

## External services { #externe-dienste }

Some things Ablago doesn't do itself but waits for another service: a package's **AI service** (e.g. "Ask your library" with a model on the NAS, see [Running AI locally](ki-lokal.md)), the mail server for **mailbox retrieval** (IMAP) and **sending** (SMTP), the provider for **sign-in through a provider** (OIDC) and the network access of other **packages**. The section **External services** shows per service – for packages per package – for the **last hour** or the **last 24 hours**:

| Column | What it means |
| --- | --- |
| **Calls** | How often Ablago called the service. A mailbox retrieval is one session (sign in, fetch mails, sign out); for packages all network accesses of one call count together. |
| **Mean, p50, p95** | Total duration on average, as the median (half were faster) and for 95 % of the calls. p95 shows the slow outliers. |
| **First response** | Until the service started to answer (response header, sign-in at the mail server, mail accepted). If the first response is quick but the total duration long, the service is computing – e.g. a language model writing word by word. |
| **Errors, timeouts** | Calls without a usable answer (no connection, error of the service, response 5xx) and calls that stopped at a time limit. |
| **Data out / in** | Bytes that went out and came in (as far as known: for sending the size of the mail, for the provider the stated size of the response). |
| **Tokens in / out** | Only for AI services: the tokens the service reports in its response (`usage`). |

Below are the **latest calls** with time, service, function and duration. The same figures for a single package are under **Workbench → Packages → package** with the package runner.

**Where is the time going?** If a page is slow and the time is here, it is the service or the network, not Ablago: for an AI service a smaller model or better hardware helps (see [How fast is it?](ki-lokal.md#geschwindigkeit)), for a mail server a look at its availability. In [developer mode](fehlersuche.md#zeitmessung-entwicklermodus) the timing shows the same values per request.

**What is stored:** only service, package, function (e.g. "Ask your library" or the kind of an event), the person who triggered the call, duration, data volume, result and tokens – **never** questions, answers, emails, subjects, addresses or links. None of it leaves Ablago. Individual calls are kept for **35 days**, after that only monthly totals, which are kept for **24 months**. If an account is deleted, its figures remain without the person. The measurements are part of the [backup](sicherung.md) but not of the [full export](export.md).

## AI costs and budget { #ki-kosten }

An AI package with a provider on the internet costs money per token. The section **AI costs and budget** shows where the money went – per **month**, per **package**, per **person**, per **function** and the **most expensive requests** (time, person, function, tokens, duration, cost; without content).

- **Price per 1 million tokens:** For each installed AI package you enter the price for input and output tokens as given in the provider's price list, plus the **currency**. Ablago uses it to calculate each response; the provider's invoice may differ (rounding, discounts, taxes). A new price applies to calls from now on.
- **Local service:** Without a price a package costs nothing – the tokens are still counted and show how much work the device does (e.g. Ollama on the NAS).
- **Monthly budget:** From **80 %** a notice appears here and under *External services*, and the [log](fehlersuche.md#protokoll) gets a warning once a month (module `system`), likewise when it is reached.
- **Hard limit:** If it is on and the budget is reached, **paid AI features pause** (packages with a price) until the start of next month. Anyone using them reads "AI features paused until 1 December 2026 …"; *Fill in from document* and *Where does this belong?* then use the built-in recognition, search runs without similar documents, package actions in the *Folder* menu report the pause, events for the package wait and are delivered afterwards. A higher budget lifts the pause at once. A local service without a price keeps running.

The figures are based on the tokens the service itself reports (OpenAI, Anthropic, Ollama, Gemini and compatible services). If a service reports none, Ablago counts duration and bytes but no tokens and no costs. The most expensive requests are only available for the last 35 days, older months only as totals.

## Shrinking large PDFs {#grosse-pdfs-verkleinern}

Scanned and photographed PDFs are often much larger than necessary: a scanner at 600 dpi or a photo PDF from a phone stores images of which 150 dpi are enough for reading and printing. Below the folders, **Shrinking large PDFs** lists the PDF documents above a size (1 to 20 MB, default 2 MB), **largest first**, with the estimated size afterwards. The list has a fixed height and shows at most the 200 largest; the first 60 are estimated.

1. Choose the **level**: **Screen** (≈ 100 dpi), **Standard** (≈ 150 dpi, default) or **Print** (≈ 300 dpi).
2. Tick documents – preselected are all where it is worth it (at least 10 % smaller). At the bottom it says how much space will be freed by estimate.
3. If you like, tick **Don't keep originals as an older version** (see below).
4. **Shrink … PDFs** – after a confirmation, the work runs in the background; the page shows the progress ("Shrinking PDFs: 12 of 40") and at the end the result, e.g. "38 PDFs shrunk from 812.4 MB to 141.0 MB (−83 %)".

Every document is shrunk as with [Shrink PDF](https://help.ablago.app/benutzer/aktuell/en/dokumente/#pdf-verkleinern) on the document:

- **With versioning**, the result becomes the new version, the original stays as an older version. **Space is only freed when the older version goes** – hence the box **Don't keep originals as an older version**: it removes exactly this one version again straight away (older versions before it stay). In folder types with [archive mode](archiv.md) the original still stays during the retention period.
- **Without versioning**, the shrunk PDF replaces the previous one; the previous one goes to the [Bin](papierkorb.md) and frees its space when the bin is emptied.
- Text layer and full text stay; text recognition doesn't run again. If it brings less than 10 % for a document, it stays unchanged. PDFs that can't be read (e.g. encrypted) are listed in the result with the reason.

Every shrunk document has the entry "PDF edited: shrunk from … to …" in its folder's history, the [log](fehlersuche.md#protokoll) (module *werkbank*) the summary.

### Shrinking new PDFs automatically {#neue-pdfs-automatisch-verkleinern}

Below it: **Shrink new PDFs when filing** above a size (default 5 MB) at a level. **The default is off.** Switched on, it applies to new PDFs from outside – uploading, [Intake folder](eingangsordner.md), [mailboxes](postfaecher.md), interface and [WebDAV](webdav.md) –, not to PDFs edited in Ablago. Then **only the shrunk PDF** is stored; the original doesn't go into Ablago. If it brings less than 10 % or the file can't be read, it is filed as it came. The entry "Document uploaded" in the history then says "Shrunk: automatically from … to …".

!!! note "Technology: no Ghostscript"
    Ablago shrinks without Ghostscript (whose licence is AGPL). The images are recalculated by **pdftoppm** from poppler (in the image anyway for text recognition and thumbnails), the PDF's structure is optimised by **qpdf** (Apache-2.0, in the image since version 0.93.0). Whoever builds their own image includes `apk add qpdf` – without qpdf shrinking also works, the files just get a little less small.

## In an emergency {#im-ernstfall}

1. The email "Storage limit reached" arrives; after 5 minutes everyone except the administrators is signed out.
2. As an administrator you stay able to act in the workbench and make space:
    - delete old backups under **Workbench → [Backup](sicherung.md)** or reduce retention,
    - empty the **[Bin](papierkorb.md)** or shorten its retention,
    - [shrink large PDFs](#grosse-pdfs-verkleinern) (with "Don't keep originals as an older version"),
    - tidy up other data on the NAS or enlarge the volume.
3. **Measure again** (in the section *Folders*, next to the time of the last measurement). If the space is enough again, this page and the overview show: "… free again – end maintenance?"
4. **End maintenance** – the mode does **not end by itself**, so that Ablago doesn't jump back and forth at the limit.

If you end maintenance although the space is still below the limit, it doesn't start again by itself; uploading stays blocked, though, until enough space is free again. If a maintenance you switched on yourself is running, Ablago leaves it unchanged.

All transitions – warning threshold undercut, limit reached, enough space again – are in the [log](fehlersuche.md#protokoll) (module *system*).
