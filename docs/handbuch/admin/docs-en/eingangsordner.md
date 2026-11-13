# Intake folder {#eingangsordner}

Ablago can watch a folder and **take over every file that lands there as new [post](https://help.ablago.app/benutzer/aktuell/en/post/)**. That way scanners ("Scan to Folder"), the NAS or any other program bring documents into Ablago without anyone opening the browser.

--8<-- "ausgeblendet-organisation.md"

## Mounting {#einbinden}

The intake folder is a separate folder in the container: **`/eingang`**. The templates for Synology, UGREEN, QNAP, TrueNAS, Unraid and `dms-komplett` already mount it, e.g.

```yaml
      # Intake folder (optional): scanner and NAS put files here → new post
      - /volume1/docker/dms/eingang:/eingang
```

If the line is missing, there is no intake folder and the workbench doesn't show it – existing installations keep running unchanged. After adding it, recreate the project.

You share the folder `eingang` on the NAS for the scanner (SMB), e.g. as a subfolder of an existing share. In the scanner you enter this share as the target for "Scan to Folder".

!!! warning "Changed in this version: only the full e-mail address"
    Until now a folder with the name, first name or the part of the e-mail address before the @ (e.g. `eingang/thomas/`) also set **To**. That no longer applies: only a folder that matches **exactly the e-mail address** of an active user, e.g. `eingang/thomas@example.org/`, sets "To". Post from a previous folder arrives without "To", and the workbench overview points the folder out ("Folder “thomas” does not belong to any user"). Rename such folders or create them anew with **Create folders for all users**, and change the scanner's target.

## Settings {#einstellungen}

Under **Workbench → intake folder**:

- **Intake folder** (switch) – on or off (default: on).
- **Check interval** – how often Ablago looks, 5 to 3600 seconds (default: 30).
- **After taking over** – delete the file or move it to `erledigt/`. Whoever sets up the intake folder anew is offered **delete**: the file is in the post afterwards anyway. If there already is an `erledigt/` and nothing was ever saved, moving stays as before.
- **Skip duplicate files** – if exactly this file (same checksum) is already in Ablago, no post is created; the file is tidied away like one taken over and listed as "duplicate – skipped" (default: off).
- **Create folders for new users automatically** – every new person gets their [folder](#ordner-je-person) (default: off).
- **Warn when files pile up** – limits for the [monitoring](#uberwachung): files older than **180** days, all together larger than **2** GB, more than **100** files. 0 turns a warning off.
- **Check now** – look immediately.

Below that are the folders per person, the monitoring, the last check, files still being written, the files taken over most recently with a link to the post, and errors.

## One folder per person {#ordner-je-person}

A folder that matches **exactly the e-mail address** of an active user (ignoring upper and lower case) enters that user under **To**, e.g. `eingang/lena@example.org/`. The post appears under "To do" for them. Name, first name or the part before the @ deliberately do not count – only the e-mail address is unique, and a document must never end up with the wrong person.

- **Create folders for all users** (Workbench → intake folder) creates a folder for every active person that does not have one yet. With **Create folders for new users automatically** this happens for every new person.
- **If the e-mail address changes**, Ablago renames a folder it created itself. If that is not possible – e.g. because the new folder already exists – it shows up as a warning in the workbench overview. Ablago does not touch folders created by hand.
- **Subfolders** below a person's folder, e.g. date folders some scanners create (`eingang/lena@example.org/2026/11/`), belong to the same person. The nearest person's folder above the file counts.
- **Other subfolders** (e.g. `eingang/scanner/`) count like the main folder: post without "To". The workbench overview names every such folder post came from ("Folder “scanner” does not belong to any user"); if that is intended, you acknowledge the warning.
- **`erledigt/` per person:** files taken over from a person's folder move to `eingang/<e-mail>/erledigt/`, not to a shared `erledigt/`. That way nobody sees the others' post via the NAS.

### Shares on the NAS per folder {#freigaben-im-nas-je-ordner}

On the NAS, share each person's folder only with **that person and Ablago** (read and write). The main folder `eingang/` is only needed by the scanner, Ablago and whoever drops in post without a recipient. That way everyone can save straight into their folder from the iPhone via SMB ([Use as a drive](https://help.ablago.app/benutzer/aktuell/en/laufwerk/#iphone-und-ipad-dateien-app)) without seeing anyone else's post. Ablago itself needs read, write and delete in the whole intake folder.

## "To" is not a read permission {#fuer-ist-kein-leserecht}

**To** says who the post is meant for – it appears under "To do" for that person. Who may **read** the post is set only by the [permissions](berechtigungen.md) of the folder type *Post*. Without rules of your own, everyone who may read post also sees post for others.

If every person should only see their own post, set up the following under **Workbench → Folder types → Post → Permissions**:

1. **Default:** read off (create on as needed, so that everyone can still capture post).
2. **Rule "My post":** *If* **Field of the folder** · **To** · **points to** · **current user** → read and edit allowed.
3. **Rule "Sort post without recipient":** *If* **User has role** · *Post intake* (a role of your own, e.g. for Lena or the office management) *and* **Field of the folder** · **To** · **is empty** → read and edit allowed. That way nothing ends up in no man's land.
4. **Rule "Deputy":** *If* **Open task for the user** → read allowed. Deputies get the task via the [deputy arrangement](https://help.ablago.app/benutzer/aktuell/en/profil/#abwesenheit) and so see the post.
5. Check with the **Test run** per person: Jonas only sees his post, Lena also the post without a recipient.
6. **Note:** this changes the visibility of **all** existing post, not just new post.

## Monitoring {#uberwachung}

So that nothing piles up unnoticed in the intake folder, the workbench overview shows yellow warnings when

- files **older than 180 days** are there,
- all files together are **larger than 2 GB**,
- **`fehler/`** contains files (could not be processed),
- there are **more than 100 files** in total.

All files under `/eingang` count, including those in `erledigt/` and `fehler/` – only the NAS systems' folders (`@eaDir`, `#recycle` …) do not. You set the limits under Workbench → intake folder; like other warnings they can be [acknowledged](uebersicht.md#bewusst-akzeptieren).

A click on **View folders** shows a tree under **Monitoring**: per folder the number of files, the space used and the date of the oldest file. The cause of the warning is highlighted – the date that is too old, the folders with the largest share, the row `fehler/`. Files lying deeper than 5 levels, which are therefore not taken over, are shown there too ("too deep").

Ablago recalculates the overview with the normal check, but at most every five minutes – so it does not slow the intake folder down. **Check now** recalculates at once. Monitoring also runs when checking is switched off.

## What happens when taking over {#was-beim-ubernehmen-passiert}

- **Every file becomes a separate post** with channel *Folder*, direction incoming, status *New*. The subject is the file name without the extension. The history says "taken over from the intake folder (eingang/…)"; it was created by the *Intake folder*, not by a user.
- **One folder per person:** if the file is in a folder named after a user's full e-mail address (e.g. `eingang/thomas@example.org/`) or below it, this user is entered under **To** – see [One folder per person](#ordner-je-person). That way everyone chooses their own target on the scanner. Other subfolders count like the main folder. Ablago looks up to **5 levels** deep into subfolders; files in deeper folders stay where they are and appear in the [monitoring](#uberwachung).
- **Only finished files:** a file is only taken over once its size and modification time haven't changed over two checks – scanners write slowly.
- **Skipped** are hidden and temporary files (`.*`, `~*`, `*.tmp`, `*.part`, `*.crdownload`, `*.partial`, `Thumbs.db`, `desktop.ini`), the NAS systems' folders (`@eaDir`, `#recycle`, `.@__thumb`, `@Recycle`, `.Trash*`) as well as `erledigt/` (also `<e-mail>/erledigt/`) and `fehler/`.
- **Rejected** are empty files and files over 100 MB: they move to **`fehler/`**, with a text file stating the reason next to them; the workbench shows a message. If the [storage space](speicherplatz.md) limit is reached, the file stays and gets its turn as soon as there is space again.
- **Same content:** if folders with the same file already exist, a new post is created anyway (except with *Skip duplicate files*). Its history says "This file is already in Ablago" – without a title, because the post is often seen by more people than the other folder. Where the file is, **Assign** shows to everyone who may read the folder.
- **No double takeover**, not even after a restart or crash in the middle of taking over: the file is only moved or deleted once the post is saved.
- In [maintenance mode](wartungsmodus.md) and during a [restore](wiederherstellen.md), the intake folder rests. If several instances of Ablago run with the same database, only one takes over.

!!! tip "Doesn't watch, but polls"
    Ablago looks regularly instead of waiting for messages from the file system. Such messages don't arrive reliably via SMB/NFS and some Docker mounts.
