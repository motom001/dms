# Exporting data {#daten-exportieren}

**Your data belongs to you.** Under **Workbench → Full export**, Ablago writes all data in open formats into a folder that you can read without Ablago and process further with other programs – you are never tied to Ablago.

| | What for | Format |
| --- | --- | --- |
| [Backup](sicherung.md) | restoring *into a DMS* | its own format, encrypted |
| Export of a view ([Library](https://help.ablago.app/benutzer/aktuell/en/ablage/)) | passing on selected folders | Excel, CSV, ZIP, PDF |
| **Full export** | taking everything along, leaving, further processing | open formats, readable without Ablago |

## Starting the export {#export-starten}

1. **Workbench → Full export** shows how many folders and files there are, how much space is needed and how much is free.
2. Choose whether **technical logs** and **passwords** should be included (see below), and confirm the **contacts**.
3. **Start export** – the work runs in the background; Ablago stays usable.

The export lands in the [export folder](#export-ordner), e.g. `/data/export/dms-export-2026-10-31-14-05-00/`. Download it with **Download as ZIP** (up to 4 GB) – or copy it directly from the folder. **Check** compares every file with its checksum from `manifest.json`. **Delete** removes it.

**After downloading, Ablago deletes the export**, at the latest after **7 days** – as with the [access copy](datenschutz.md). Under **Existing exports** it says per export until when it is available. If you need it longer, keep the downloaded ZIP file.

!!! warning "Unencrypted"
    The full export is deliberately **not encrypted** – that is its purpose. Keep it as safe as the paper files.

## Export folder { #export-ordner }

Full exports, [Export my data](#meine-daten-exportieren) and the [access copies under Art. 15](datenschutz.md) are stored **unencrypted** in their own folder: in the container `/data/export`, next to `files/`. It is **never in the backup folder** – you copy that one to the cloud, and the exports shouldn't travel along (they used to be under `sicherung/export/`; on the update, Ablago moves them, shows a notice in the workbench, and the 7 days only begin for them with the update).

```
/data/export/
  dms-export-…/                 full exports
  persoenlich/<user id>/…       Export my data
  auskunft/<id>.zip             access copies under Art. 15 GDPR
```

- **Without its own line in the Compose file** (default), the folder is inside the container. That is enough for downloading as a ZIP. After a container update, exports stored there are gone – they are deleted after downloading or after 7 days anyway.
- **Your own location:** if you want to copy large exports (over 4 GB) directly from the folder or determine the location yourself, use the prepared, commented-out line from the [Compose templates](https://github.com/motom001/dms/tree/main/deploy) and create the folder **outside the backup folder**:

    ```yaml
    volumes:
      - /volume1/docker/dms/export:/data/export
    ```

    There is no environment variable for this – as with the other folders, only the volume determines where it is.

- **If the export folder is in the backup folder after all** (also via a volume onto a subfolder of it), the workbench overview and **Workbench → Full export** warn, and the administrators get it with the daily email about [technical matters for the admin account](benutzer.md#aufgaben-ohne-empfanger). Then put the volume somewhere else.

## Structure { #aufbau }

The folder and file names in the export are German:

```
dms-export-2026-10-31-14-05-00/
  LIESMICH.md            structure, formats, check script
  manifest.json          format version, counts, size and SHA-256 of every file, where every table is
  struktur/              Folder types, views, number sequences, packages (pakete.json), designs, users (without passwords)
  daten/
    <typ>.csv  .jsonl  .xlsx   per folder type (identifier, from packages package.key): one row per folder, one column per field identifier
    verweise.csv           folder → field → folder
    dokumente.csv          all documents and older versions with path in the export
    notizen.jsonl, aufgaben.jsonl, erinnerungen.jsonl, historie.jsonl,
    papierkorb.jsonl, papierkorb-dokumente.jsonl, vertretungen.jsonl, favoriten.csv,
    loeschprotokoll.csv  (deletion log, without contents)
  ablage/<type>/<title> [id]/
    mappe.json  mappe.pdf  <tab>/<file>  <file>.txt  <file>.fassung.pdf  <file>.pdfa.pdf  <tab>/Versionen/
  uebersicht/<typ>.pdf   all folders of a type
  kalender/fristen.ics   open deadlines, tasks with a date, reminders
  kontakte/<typ>.vcf     contacts (vCard 4.0)
  passwoerter.csv        only with explicit confirmation
  protokolle/            only if chosen
```

## Formats {#formate}

- **Text** UTF-8; **CSV** according to RFC 4180 with comma and BOM (Excel recognises UTF-8); multiple values separated by ` | `.
- **Date** `YYYY-MM-DD`, points in time ISO 8601 in UTC; **numbers** with a point; **amounts** as columns `<field>` and `<field>_waehrung`; **periods** as ISO 8601 (`P3M` = 3 months; in JSON `{ "anzahl": 3, "einheit": "monate" }`); **percentages** as a number (`19` for 19%).
- **Ids** as UUID; **links** twice: as id (`<field>`) and as title (`<field>_titel`).
- **JSON Lines**: one folder or one entry per line, lossless.
- **Documents in the original**, not converted; older versions under `Versionen/` (`v1 Rechnung.pdf`). If a package has [converted](texterkennung.md#andere-dateitypen) a file (e.g. a TIFF scan into a PDF), the version lies next to it as `<file>.fassung.pdf` (or `.png`, `.jpg`); `dokumente.csv` names it in the column `fassung` (since 0.140.1).
- **Archive version (PDF/A)** (since 0.149): if a package has stored an [archive version](texterkennung.md#archivfassung-pdfa) for a document, it lies next to it as `<file>.pdfa.pdf`; in `daten/dokumente.csv` its path is in the last column `archivfassung` (`original` if the original is already PDF/A). The access copy under Art. 15 contains no archive versions.
- **Format version** is in the manifest; changes to the format are in the release notes.

`manifest.json` names under `tabellen`, for every table of the database, where it is in the export – or why not (e.g. sessions, API keys, credentials for mail and mailboxes). A test makes sure that no new table goes missing unnoticed.

## Passwords {#passworter}

Password fields never appear in the data – only "set". If you choose **Password fields in plain text** and confirm explicitly, `passwoerter.csv` is added, in **Bitwarden**'s CSV format (can also be imported into KeePassXC). This is recorded in the log. Import the file and delete it afterwards – under **Existing exports**, such an export is marked red ("Contains passwords in plain text"), because it is stored unencrypted in the export folder (until it is downloaded or deleted after 7 days). Keys, credentials (database, mail, mailboxes), API keys and sessions are never included.

## Contacts as vCard { #kontakte-als-vcard }

Ablago suggests folder types that look like contacts (fields such as name, email, phone, address) and maps the fields. Check the mapping before exporting; deselected folder types get no vCard.

## Export my data { #meine-daten-exportieren }

Every user can start their own export under **My account → Account → Export my data** (click your name at the top right) – in the same structure, but only with the folders they may read, their own tasks, reminders, favourites and bin entries. Views, number sequences and other users are missing; passwords only from folders in which they may see passwords, and only with confirmation. It is stored in the [export folder](#export-ordner) under `persoenlich/<user id>/`; a new export replaces the old one. After downloading it is deleted, at the latest after 7 days. **It is off by default.** You can switch it on under **Workbench → Full export** in the section *Export my data* with the tick **Users may export their own data**; untick it and it is off again. While it is off, users only see a note under *Export my data* that they can ask you for information about their data – you provide it as described under [Access for a user](datenschutz.md#auskunft-an-einen-benutzer). While an administrator is working as a user via [Reproduce a problem](benutzer.md#fehler-nachstellen), there is no own export for this user.

## Processing further {#weiterverarbeiten}

- **Excel/LibreOffice:** open `daten/<typ>.xlsx` – or the `.csv`.
- **Python:** `pandas.read_csv("daten/rechnung.csv")`; JSON Lines line by line with `json.loads`.
- **Calendar:** import `kalender/fristen.ics` into Outlook, Google, Apple or Thunderbird.
- **Another DMS:** `ablage/` contains all files in readable folders, the metadata in `mappe.json`.
- **Complete?** The script in `LIESMICH.md` checks all files against the manifest – without Ablago.
