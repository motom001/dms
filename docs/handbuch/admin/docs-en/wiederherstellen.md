# Restoring {#wiederherstellen}

You restore a [backup](sicherung.md) in the workbench – without a command line, with every step in view. This works on a **fresh system** (new NAS, old backup) and on the **running system** (back to an earlier state).

--8<-- "ausgeblendet-schritt.md"

## How Ablago proceeds { #so-geht-das-dms-vor }

- The backup is first restored into a **separate, empty area** of the database and a folder next to the documents. It only switches over once everything has worked. If something aborts – error, wrong key, too little space –, the previous state stays **unchanged**.
- Checked are: the file's checksum, the decryption (at the end of the file there is a check value; if the file has been changed, Ablago notices), the [check word](sicherung.md#was-eine-sicherung-enthalt), the number of folders, documents, users and files.
- An **older** backup in a newer Ablago works: afterwards the missing database changes run. Ablago refuses a **newer** backup in an older Ablago with a clear message – then update Ablago first.
- Finally Ablago checks the **database extensions** the search needs (`pg_trgm` for typos and parts of words, `unaccent` for umlauts). They are in their own schema `erweiterungen_dms`, which a restore doesn't touch. If one is missing, this appears as a **notice** in the process and in the final message – the data is complete anyway; remedy under [Search → Database extensions](suche.md#erweiterungen-der-datenbank).
- A switch to a new **major version of PostgreSQL** also works this way: start the new PostgreSQL empty, restore the backup.
- After switching over, **Ablago restarts** (Docker starts it again immediately with `restart: unless-stopped`). Then the final message appears, and everyone signs in anew – with the credentials from the time of the backup.
- Every step is recorded in the [log](fehlersuche.md#protokoll), module *sicherung*.

## New NAS, old backup { #neues-nas-alte-sicherung }

You need: the two backup files (`.dms-sicherung` and `.json`) and the [emergency sheet](verschluesselung.md#notfallblatt). If the old device still runs, you [download](sicherung.md#sicherung-herunterladen) both in the Workbench.

1. On the new NAS, create the folder for Ablago, inside it `postgres`, `files`, `geheim` and `sicherung` (see [Installation](installation.md)).
2. Install Ablago anew, as described under [How do I get a DMS?](https://help.ablago.app/installieren/aktuell/en/) – recommended with two containers (e.g. the [Compose template](https://github.com/motom001/dms/blob/main/deploy/nas/docker-compose.yml) with a `.env` with a new `DB_PASSWORD`), or with [dms-komplett](https://help.ablago.app/installieren/aktuell/en/komplett/) without a password.
3. Copy the two backup files into the `sicherung` folder.
4. Start the project and open Ablago in the browser. The [setup wizard](installation.md#der-einrichtungsassistent) asks for the **setup code** and – if needed – the database. Then choose **Restore from a backup**; you don't need a "throwaway admin".
5. Choose the backup. The **comparison** shows which version it was made with and what is running today (Ablago, database state, PostgreSQL, architecture, Library id). If the backup belongs to another tenant, Ablago takes over its id.
6. Enter the **key from the emergency sheet** (spaces don't count) and **Check key** – Ablago compares it with the fingerprint from the metadata.
7. **Restore**. The screen shows every step; you can reload the page. At the end Ablago restarts.
8. **Continue to sign-in** and sign in with the previous credentials. Ablago created the key file itself in the process.

This way is only open as long as there is no user yet, and only with the setup code – just like the setup.

### From an off-site copy { #aus-einer-kopie-ausser-haus }

If Ablago is running (again) and the destination's package can fetch backups back, no manual work is needed: in **Workbench → Backup**, choose **Check** or **Download** on the *off-site only* backup – afterwards it is in the backup folder with its `.json` (see [Backups that only exist off-site](sicherung-ausser-haus.md#nur-ausser-haus)). Otherwise:

If the device is gone, you fetch both files from the [off-site target](sicherung-ausser-haus.md) – the `.dms-sicherung` and the `.json` next to it – and put them into the `sicherung` folder. The `.json` there is the **slim** version (without versions, counters and Library id). The list shows the backup as *Off-site copy*; as soon as you enter the **key from the emergency sheet**, Ablago reads database state, Library id and the number of folders, documents and users from the backup itself. The Ablago version it was made with is then shown as "unknown" in the comparison – the database state is what counts. When restoring, Ablago checks every file against its checksum and at the end the whole backup (GCM check value); only then does it switch over.

## Restoring without internet { #ohne-internet }

Ablago does **not need internet access** for a restore – neither the [package catalogue](pakete.md) nor a download. Without a network, though, you cannot fetch anything you have not put aside beforehand. So keep these in a safe place:

1. **the backup file** (`.dms-sicherung`) with the **`.json` next to it**,
2. **the key**: the key file from the `geheim` folder (in the container `/data/geheim`) or the [emergency sheet](verschluesselung.md#notfallblatt) – it is never in the backup,
3. **the Ablago image** in the same or a newer version than the backup, saved beforehand e.g. with `docker save ghcr.io/motom001/dms:stabil -o ablago.tar` and loaded on the new device with `docker load -i ablago.tar`. Without internet it cannot be pulled. With [dms-komplett](https://help.ablago.app/installieren/aktuell/komplett/) the same with `ghcr.io/motom001/dms-komplett:stabil`; with two containers also the database image (e.g. `postgres:18`),
4. **your Compose file** and the `.env` or your environment variables.

Then proceed as described under [New NAS, old backup](#neues-nas-alte-sicherung).

**What happens afterwards by itself:**

- **Packages do not need to be reinstalled.** The backup contains the installed packages including their code, their settings, system accounts, confirmed rights and language packs. They come back together with folder types and folders as one state; the package runner then loads the code from the database.
- The **search index** and the **previews** are rebuilt – depending on the number of documents this takes a while; search and previews fill up gradually in the meantime.
- **Everyone signs in anew** – with the credentials from the time of the backup.
- **Automations are paused** until you have checked them and switched them back on under **Workbench → Automations**.

Whatever a package itself fetches from the internet (such as a sync with a service) only works again once the network is back – this does not affect the restore.

## On the running system {#auf-dem-laufenden-system}

![Restoring in the workbench](bilder/werkbank-wiederherstellen.png)

1. Switch on [maintenance mode](wartungsmodus.md) and let it become active (or **Sign everyone out now**).
2. **Workbench → Backup → Restore**, choose the backup, check the comparison. If this installation's key doesn't match the backup, enter the one from the matching emergency sheet.
3. Confirm that the current state will be replaced, and **Restore**. In the confirmation you type the word **wiederherstellen** for safety.
4. Beforehand, Ablago backs up the **current state** (kind "before a restore") – so you can go back if you picked the wrong backup. If the key is missing for this, a notice appears in the process. Then the previous state of the database stays in the database as a separate area (schema `dms_alt_behalten_…`) for **7 days**; after that Ablago removes it on the next start. The final message names it.
5. After the restart, maintenance mode is off; everyone signs in anew.

If the backup has a different key from the current one, Ablago puts the previous key file next to it as `dms.schluessel.alt-…` and takes the backup's.

## Test restore { #probe-wiederherstellung }

A backup is only good if it can be restored. That's why Ablago restores the newest backup as a trial **on Sundays at 04:00** (adjustable under *Backup → Test restore*) – into a temporary area; the running Ablago stays untouched – and checks it as above, plus the checksums of up to 20 files and every [converted version](texterkennung.md#andere-dateitypen) against the checksum in its details. The step *Decrypt and restore* names how many versions are included. If one doesn't match (for instance because the package recreated it exactly during the backup), Ablago doesn't take it over – the package then converts the file anew, as with an older backup without versions. **Test restore now** starts it immediately.

![Test restore](bilder/werkbank-sicherung-probe.png)

The test also checks the database extensions (see above); if one is missing, the step *Database extensions* shows a notice, and the test still counts as successful.

The result is shown per backup in the list and as a traffic light in the overview: **green** = last test successful and at most 8 days old, **yellow** = older or never, **red** = failed. If a test fails, all administrators get an e-mail. In active maintenance mode and with too little free space, the test pauses. The test needs this installation's **current key**: a backup with an earlier key (after a [key change](verschluesselung.md#schlussel-wechseln)) can't be test-restored; the test then fails with a notice about the key.

## How long it takes { #dauer }

Measured with the data of the [load test](lasttest.md) level *groß* (#1464): **200,000 folders**, almost 4,000 documents, database 461 MB, PostgreSQL 18, computer with 2 cores, Ablago 0.305:

| Step | Duration |
| --- | ---: |
| Create the backup (70 MB) | 8 s |
| Restore into an empty database, total | 102 s |
| of which *Decrypting and restoring* (tables, indexes, statistics) | 98 s |
| of which refreshing the database statistics (`ANALYZE`) | just over 2 s |

After importing, Ablago refreshes the statistics of all tables (`ANALYZE`). Without them PostgreSQL wouldn't know how big the tables are and would choose slow paths in the first minutes – with them the collection is as fast as before right after the restart. On a NAS with slower storage everything takes correspondingly longer; with a hard disk instead of an SSD expect several times as long.

## Not provided for {#nicht-vorgesehen}

Getting individual folders or documents back from a backup isn't possible directly. The way for this: restore the backup on a second, temporary Ablago (its own Compose project with another port) and pick them out there. A restore by command on the NAS deliberately doesn't exist.
