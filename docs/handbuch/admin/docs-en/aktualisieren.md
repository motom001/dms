# Updating and backing up { #aktualisieren-und-sichern }

--8<-- "ausgeblendet-schritt.md"

## Updating { #aktualisieren }

1. **Back up first:** **Workbench → [Backup](sicherung.md) → Back up now.** This is your way back if something isn't right after the update – it usually only takes minutes.
2. Read under [Releases](https://github.com/motom001/dms/releases) what has changed.
3. Switch on [maintenance mode](wartungsmodus.md) so that nobody is working in the middle of the update.
4. Pull the image again and restart the project – on the command line:
   ```sh
   docker compose pull && docker compose up -d
   ```
   or "Rebuild project" in the NAS's container manager. With [dms-komplett](https://help.ablago.app/installieren/aktuell/en/komplett/) it is just one container; database and Ablago come with the same image. If a new image brings a new major version of PostgreSQL, see [Growing and moving](wachsen.md#neue-hauptversion-von-postgresql).
5. Database migrations run automatically at start-up and in one transaction: if one fails, the database stays unchanged and Ablago doesn't start. The page at the usual address shows the reason (see below); the exact message is in the container log.
6. Briefly check that everything runs, then end maintenance mode.

### What you see after the start { #nach-dem-start }

Right after the container starts, the address can be reached. As long as Ablago is still running migrations or getting ready, it shows the page **"Ablago is starting …"** with the current step, e.g. "Updating the database – migration 3 of 5". You haven't done anything wrong: on the first start and with large libraries this takes a few minutes. The page reloads by itself and then shows the sign-in, the setup assistant or – in load test mode – the load test page.

![The page "Ablago is starting …" with the migration step, a progress bar and the note that you haven't done anything wrong](grafiken/ablago-startet.en.svg){ .grafik }

The steps in the order in which they come:

| Step on the page | What happens |
| --- | --- |
| Creating the database (first start only) | dms-komplett only: PostgreSQL creates its database in the folder `/data/postgres`. On a NAS this can take a minute. |
| Starting the database | dms-komplett only: PostgreSQL inside the container starts. |
| Starting Ablago | dms-komplett only: the database is running, Ablago itself starts. |
| Connecting to the database | Ablago connects to the database. |
| The database is not reachable yet – new attempt n of 30 | The database doesn't answer yet, e.g. because its own container is still starting. Ablago tries every 2 seconds for about a minute; after that the setup assistant shows the reason. |
| The database is locked … | A second Ablago on the same database is updating it right now. Ablago waits until it is done. |
| Updating the database – migration n of m | The migrations after an update, with a progress bar. |
| Loading keys …, search index …, folders …, titles …, users …, folder types …, background work … | Ablago gets ready, partly with a count ("120 of 200"). |

In dms-komplett a small pre-start shows the page from the very first moment, even before PostgreSQL is created or started. As soon as Ablago itself runs, it takes over the port without interruption.

- The page only shows steps and numbers, no data from the Library – and before sign-in no version, no paths and no host names either. It loads nothing from other servers and appears in German or English, depending on the browser's language. Until then, sign-in, API and WebDAV answer with `503` and `Retry-After`; programs and packages simply wait.
- `/api/gesundheit` reports `503` with `"zustand": "startet"` until the end, then `200` with `"zustand": "laeuft"`. The image's health check, a NAS or a reverse proxy thus only see the container as ready when Ablago is. Since #1198 it also checks the database: if it doesn't answer or no connection is free, it reports `503` with `"zustand": "datenbank"` (see [Ablago doesn't load or stays black](was-ist-passiert.md#laedt-nicht)).
- **If something goes wrong at start-up**, the same page says "Ablago could not start" with the reason in plain language, e.g. which migration step failed, below it **What you can do** and the pointer to the container log and [Troubleshooting](fehlersuche.md#start-datenbank). `/api/gesundheit` then reports `"zustand": "fehler"`. After a few minutes Ablago exits so that Docker restarts the container and tries again.
- **If the database is unreachable or blocked** (connection refused, lock, storage full, too many connections), the page says exactly that and the way out, e.g. restarting the container or the database's container. In dms-komplett this also applies to errors before Ablago itself runs: permissions of the database folder, another major version of PostgreSQL, the database can't be created or was stopped. The overview is under [Troubleshooting](fehlersuche.md#start-datenbank).
- **If the database comes from a newer version** (lock against going back), the page says so too and stays there – a restart doesn't help. Set the image back to the newer version.
- Ablago only does the first reconciliation of deadlines in the background after the start; the address doesn't wait for it.

During the restart, Ablago is briefly unreachable or not yet ready. Open pages then show "Ablago can't be reached right now" at the top and ask again at growing intervals (2 to 30 seconds) until it answers again. Entries stay; nothing is saved automatically. If another version runs afterwards, the bar asks you to reload the page – otherwise the browser keeps working with the old interface against the new server. This is recognised via `/api/gesundheit`, which returns, besides `ok`, an identifier of the running build (a hash of version, commit and build time, so that no version is visible without signing in).

Which version is running and whether there are newer ones is shown in **Workbench → system health → Version and updates** (see [Troubleshooting](fehlersuche.md#technik)).

### Which image tag? { #image-tag }

The templates use **`:stabil`**. That way, when updating you only get versions with a number and release notes – nothing that isn't described anywhere.

| Tag | What you get | For whom |
|---|---|---|
| `ghcr.io/motom001/dms:stabil` (or `dms-komplett:stabil`) | once a week, the newest tested version with number and release notes | **Recommended** for everyone |
| `ghcr.io/motom001/dms:latest` (or `dms-komplett:latest`) | the most recently released version with number and release notes, right after each release | anyone who always wants the newest |
| `ghcr.io/motom001/dms:0.158.0` (a fixed number) | exactly this version, until you raise the number yourself | whoever wants to start every update themselves |
| `ghcr.io/motom001/dms:main` | every state on `main`, right after each change – including unreleased ones without number and release notes | for the curious and for testing |

Without a tag (e.g. `docker pull ghcr.io/motom001/dms`), Docker uses `:latest`. Many NAS interfaces do the same if you don't enter a tag. You then get the newest version, not the tested one: enter `:stabil` if you want the version tested once a week.

!!! note "Two different “Latest”"
    - The **image tag `:latest`** points to the **most recently released** version. It moves with every release.
    - The **“Latest” marker on the [releases on GitHub](https://github.com/motom001/dms/releases)** is on the **stable** version, the same as `:stabil`. The notice about a new version in the workbench follows it.

    Between two weekly runs, the two therefore usually point to different versions.

`:stabil` moves on **once a week**, early on Tuesday: to the newest version that has been released for at least 24 hours and has passed all checks – release with number and release notes, both images built for amd64 and arm64 with provenance, and an **update test** from the previous `:stabil` to the new version (with sample data, all migrations and a test restore of the old backup). New versions still appear with every new number on `main`; with `:stabil` they come bundled, and the release of the new stable version lists every version added since then under *Seit der letzten stabilen Version* (since the last stable version) – the week's changes at a glance. The maintainer can hold back a version; then `:stabil` moves to the one before.

**Urgent fixes** (for example for a security vulnerability) don't wait for the week: with the label `sofort-stabil` on the pull request, `:stabil` moves along right after the release – with the same checks.

If you want new versions earlier, use `:latest`; if you want to see every state before the release, `:main`. The notice about a new version under **Workbench → System health → Version and updates** follows the stable version: with `:stabil` it appears once a week. With `:latest` or `:main` you usually run a version above the stable one; then it names newer states on `main` as before.

With two containers, `postgres:17` stays open for security updates of the 17 series – independently of Ablago's tag.

!!! note "If a stable version has a serious bug"
    The maintainer then sets `:stabil` back to the previous version (workflow *:stabil zurücksetzen*, which also works forwards) and holds back the faulty version so that the next weekly run doesn't pick it again. What happened is in the [Releases](https://github.com/motom001/dms/releases).

    - **Not yet updated:** on the next update you get the previous, proven version.
    - **Already updated:** stay on the newer version and wait for the fix – enter the fixed number in the tag for that (e.g. `:0.160.0`). An older version doesn't start on your database: Ablago notices that a newer version has already set up the database and stops with a notice instead of overlooking new data. The only way back is the backup from before the update (see [Backing up](#sichern)).
    - **Newly set up from 0.158.3:** such libraries and their backups can't be opened with versions up to 0.158.2 – not via a backup either.

    If the container starts with *This database comes from a newer version of Ablago*, the tag contains an older version than last time – or `:stabil` was set back. Enter the number used last.

!!! info "Where does the image come from?"
    Every Ablago image carries **provenance**: a signature proving that it was built by GitHub from exactly this repository, and a **bill of materials** (SBOM) of all packages it contains. Both are public and can be checked with the GitHub command line:

    ```sh
    gh attestation verify oci://ghcr.io/motom001/dms:stabil -R motom001/dms
    ```

    Before every release, CI also checks the images for known security vulnerabilities. In addition, the project checks the delivered images `:stabil` and `:latest` against new security reports once a week, with a second database and, for important programs such as poppler, also directly against the public NVD database – even if Alpine does not list a case yet. How quickly a fix arrives depends on the severity; the target times are in the [security policy](https://github.com/motom001/dms/blob/main/SECURITY.en.md#responsibility-and-response-times). You get the fix like any update: through `:stabil`, in urgent cases without waiting for the week.

### Without administrator rights (root) { #ohne-root }

Ablago no longer runs as administrator (root) inside the container but as its own user: like the owner of your folders, otherwise `ablago` (ID 1000, group 1000). The programs Ablago uses to read and rasterise PDFs (poppler and qpdf) run separately again, as user `ablago-werkzeug` (61000) – with a limit for memory (default 1024 MB per call), CPU time and file size. They may only write to their own working folder and can reach neither the files Ablago creates under `/data` (readable only by Ablago) nor the database. If a PDF needs more, only that one step fails with a message (for example when redacting); Ablago keeps running. The image needs no additional rights from Docker for this.

**Which user Ablago runs as:** Ablago follows the owner of your folders. If the mounted folders (`/data/files`, `/data/geheim`, `/data/sicherung`, where present `/data/export` or `/data` itself) belong to a user of your NAS, for example `1026` with group `100` on a Synology, Ablago runs as exactly that user. You can then keep reaching backups and exports through the file share without entering anything. If the folders belong to root (for example a fresh Docker volume or folders Docker created itself), the default `1000:1000` applies. Ablago never takes root (0) or the ID of the document tools (61000), not even as a group. The log says so in one sentence, e.g. `Ablago läuft als Benutzer 1026 und Gruppe 100 – wie der Besitzer des Datenordners (/data/files).` The start page and **Workbench → System status → Runtime** ("Ablago’s user", "Ablago’s group", each with its origin) show the same.

**What the start changes – as little as possible:**

- Whatever already belongs to Ablago’s user stays as it is: owner, group and the permissions of others.
- Whatever still belongs to **root** (created by Docker or by a version before 0.299.0) the script takes over once for Ablago’s user. The log then shows for each folder `Ohne root (#1354): übernehme /data/files für Benutzer 1000 und Gruppe 1000 (was root gehört) – einmalig …`, and the start page shows **"Setting up folders for Ablago (once)"**. With many files this takes a few minutes.
- Any of the four folders that the script creates or takes over in the process is closed to other users in the container (`o-rwx`). Folders of your NAS user stay untouched.
- `/data/geheim` holds the keys. If the group or anyone else can read a file there, it can only be read by Ablago afterwards (`go-rwx`). Ablago creates them that way anyway.
- Entries that belong to another user stay as they are; the log names them.
- Folders that only live inside the container (without a volume of their own, e.g. `/data/export` in the templates) belong to Ablago’s user afterwards. Nothing changes on your NAS because of this.

Every change to your folders appears in the log, on the start page (while Ablago starts) and in the system status under "Changed on …". The container remembers the choice: a restart changes nothing more and does not search again.

- **`PUID` and `PGID` only as an exception:** If Ablago should explicitly run as a different user than the one owning the folders, set both in the compose file. Values you set always take precedence. The script then takes over, as before, everything that does not belong to exactly this user and group. If one of the two is missing, `1000` applies to it.
  ```yaml
      environment:
        PUID: "1026"
        PGID: "100"
  ```
- **Inbox folder:** What the scanner puts into `/eingang` usually belongs to a NAS user. Ablago only takes over what belongs to root there. If it cannot move anything in the folder, the log shows a warning with the folder’s owner.
- **`dms` command:** `docker exec <container> dms …` runs as the same user as Ablago by itself, even without `PUID` in the compose file.
- **Back to the previous version:** Versions before 0.299.0 run as root and keep reading the folders. 0.299.0 itself does not yet follow the owner: without `PUID`/`PGID` it takes the folders over for `1000:1000`.

**Already updated to 0.299.0?** Then your folders now belong to `1000:1000`, and Ablago stays with that. If there is nothing to rewrite, nothing changes. If the folders should belong to your NAS user again so that you can reach them through the file share: run `sudo chown -R 1026:100 /volume1/docker/dms/files /volume1/docker/dms/geheim /volume1/docker/dms/sicherung` once on the NAS (numbers and paths adapted to your NAS) and restart the container. Ablago then runs as that user by itself.

**If the container does not start:** If Ablago cannot write to one of its folders, the start page shows what Ablago saw and the fix as ready-made lines to paste. Example: `/data/files` belongs to `1026:100`, but `/data/geheim` to `1027:101`. The page then says which folder belongs to whom, followed by:

```yaml
    environment:
      PUID: "1027"
      PGID: "101"
```

Or the other way round on the NAS: `sudo chown -R 1026:100 <folder on your NAS, mounted as /data/geheim>`. If a folder is mounted read-only (`:ro`), the page says so and how to fix it. With a network share using `root_squash`, root in the container may not change permissions; then only the `chown` on the NAS or server helps. The log has the same lines (`FEHLER: Ablago (Benutzer …) kann nicht in /data/… schreiben. Der Ordner gehört …`). After a few minutes the container stops.

**More settings:**

- `DMS_WERKZEUG_SPEICHER_MB`: memory per call of a document tool in MB (128–65536, default `1024`, `0` = no limit). Raise it only for unusually large pages such as building plans, posters or very large scans; when the limit hits, the message names the setting.
- `docker run --user …` or `user:` in the compose file still works. The container then takes over no folders, and the document tools run as the same user as Ablago (with the same limits).
- The templates also contain `security_opt: [no-new-privileges:true]`: no process in the container can regain rights afterwards. For an existing compose file the line is optional.

**dms-komplett:** The `dms` role of the database inside the container is no longer a superuser. Over `127.0.0.1` it signs in with a password that the container sets anew on every start and hands only to Ablago – there is nothing to enter. To get in by hand, use the socket as root: `docker exec -it <container> psql -h /run/postgresql -U dms -d dms`.

### Text recognition as a package (from 0.134) { #texterkennung-als-paket-ab-0134 }

Text recognition (Tesseract) is no longer in the image; this makes the image smaller (when it was added in 0.11, about 50 MB came on top). Scans and photos are now recognised by the package **Text recognition (German and English)** (identifier `texterkennung`) from the catalogue:

- **Existing full text stays** unchanged – including what the built-in text recognition recognised. Ablago still reads PDFs with text itself.
- After the update, the [Workbench overview](uebersicht.md) says **"Text recognition is now a package"** with **Install now**. Until the package is installed, new scans stay without text ("waiting for text recognition – no package installed"); afterwards they go to the package by themselves.
- Languages that you had added via your own image (`tesseract-ocr-data-…`) or mounted files now come as **additional languages** (e.g. *Text recognition – additional language French*); you can replace your own image with the official one again. See [Further languages](texterkennung.md#weitere-sprachen).
- Text recognition's settings (language, pages, file types) are now with the package; TIFF, WebP, GIF and BMP images no longer get full text.

### Database connection and household (from 0.24) { #datenbank-anbindung-und-haushalt-ab-024 }

At the first start, Ablago takes over `DATABASE_URL` and – if set – `HAUSHALT_ID` into the file `/data/geheim/datenbank.json` (see [Database connection](installation.md#datenbank-anbindung)). It keeps running without you doing anything. Afterwards both variables are superfluous; the Workbench overview points this out, and you can remove them from the Compose file on the next update. The connection can then be changed under **Workbench → Database connection**.

### Fixed folders (from 0.23) { #feste-ordner-ab-023 }

The folders in the container are now fixed: `/data/files`, `/data/geheim` and `/data/sicherung` (see [Folders and volumes](installation.md#ordner-und-volumes)). The variables `FILES_DIR`, `DMS_SCHLUESSEL_DATEI` and `DMS_SICHERUNG_DIR` are dropped.

- **If your Compose file contains `FILES_DIR: /data/files`** (as in the template), everything keeps running. Remove the line on the next update; until then the Workbench overview reminds you.
- **If one of the variables pointed to another folder**, Ablago doesn't start and names in the container's log the volume that must point to the fixed folder instead. Example: if it previously said `FILES_DIR: /dokumente` with the volume `/volume1/dms-daten:/dokumente`, this becomes `/volume1/dms-daten:/data/files` – and the variable goes. The files themselves stay where they are.
- After the start, check under **Workbench → system health → Version and updates** that all three folders are on a volume of their own.

### Updating to 0.11 { #auf-011-aktualisieren }

- Add a volume for the key in the Compose file (see [template](https://github.com/motom001/dms/blob/main/deploy/nas/docker-compose.yml)):
  ```yaml
  volumes:
    - /volume1/docker/dms/files:/data/files
    - /volume1/docker/dms/geheim:/data/geheim
  ```
  Then create the key under **Workbench → Encryption**. An SMTP password already saved is encrypted in the process; until then sending works as before.
- The image now contains text recognition and is about 50 MB larger as a result.
- Existing documents only get their full text when you start "Regenerate full text → For documents without text" under **Workbench → [Maintenance operations](texterkennung.md#wartungsoperationen)**.

### PostgreSQL { #postgresql }

You get minor versions (17.x) by pulling the image `postgres:17` again. Changing the major version (e.g. 17 → 18) needs a backup and restore – PostgreSQL can't open the data of an older major version directly.

## How new versions come about { #wie-neue-versionen-entstehen }

Every version of Ablago has a number like `0.8.1`. As soon as a new number is on `main` and all checks have passed, these arise automatically:

- a **release** on GitHub with the changelog – [Releases](https://github.com/motom001/dms/releases),
- an **image** with this number, e.g. `ghcr.io/motom001/dms:0.8.1`,
- right after that, the tag **`:latest`** on this version (for `dms` and `dms-komplett`, amd64 and arm64),
- with the next weekly run (early on Tuesday), once the update test has passed, the tag **`:stabil`** on the newest version that is at least 24 hours old – for an urgent fix (label `sofort-stabil`) right after the release.

Changes without a new number (small fixes, docs) and the weekly rebuild with fresh Alpine packages only land in the image `main`, never in `:stabil` or `:latest`. Several requests can thus be bundled into one release: the number is only raised with the last one.

## Backing up { #sichern }

The easiest way is for Ablago to back itself up: **Workbench → [Backup](sicherung.md)** – database and files at the same point in time, encrypted, on a schedule if you like. The rest of this section describes the manual way, e.g. for an additional copy.

The backup is a format of its own, encrypted – to restore it you need Ablago. A copy you can read **even without Ablago** is the [full export](export.md) in open formats (CSV, JSON, files in folders).

These folders from the Compose template are to be backed up by hand:

| Folder | Content |
| --- | --- |
| `postgres` | the database: folder types, folders, users, settings (with dms-komplett in the container under `/data/postgres`) |
| `files` | the uploaded files, each under its SHA-256 checksum |
| `geheim` | the key `dms.schluessel` for all stored secrets (see [Encryption](verschluesselung.md)) and backups, the database connection `datenbank.json` (with password), until setup the setup code, and if needed the [RESCUE file](notfall.md) – keep it **separate** from the others |
| `sicherung` | Ablago's backups (encrypted) |

For a consistent database backup during operation, create a dump first:

```sh
docker exec <db-container> pg_dump -U dms dms > dms.sql
```

With dms-komplett the command is `docker exec <container> pg_dump -h 127.0.0.1 -U dms dms > dms.sql`. Back up `dms.sql` together with the folder `files`.

### Restoring { #wiederherstellen }

You restore Ablago's backups in the workbench: [Restoring](wiederherstellen.md). For a manual dump:

1. Stop the project, copy the folder `files` back.
2. Empty the database and import:
   ```sh
   docker compose up -d db
   docker exec -i <db-container> psql -U dms -d dms < dms.sql
   ```
3. Start the project.

This way applies to two containers: there the database can be started on its own. With dms-komplett, Ablago and database run in the same container and always start together. There, bring back an earlier state with an Ablago backup, as described under [Restoring](wiederherstellen.md).

!!! warning "Files and database belong together"
    The database knows every file by its checksum. Always back up and restore both from the same point in time.

!!! warning "No passwords without the key"
    Stored passwords can only be read with the key file from `geheim`. If it is missing after a restore, **Workbench → [Encryption](verschluesselung.md)** shows which passwords have to be entered again. Keep the key file separate from the database backup – if both are together, encryption doesn't protect the backup.
