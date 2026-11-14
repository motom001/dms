# Archive mode and retention {#archivmodus-und-aufbewahrung}

Some receipts you have to keep: in Germany, tradespeople's invoices privately for 2 years (§ 14b UStG); with bookkeeping or a cash-basis accounting, accounting receipts for 8 years (since 2025), books for 10 years, business letters for 6 years – each from the end of the calendar year. **Archive mode** keeps such folders unchangeable until the end of their period and tells you afterwards what may go.

--8<-- "ausgeblendet-organisation.md"

!!! tip "Readable over many years"
    Three things help documents stay readable throughout the whole period: the [archive version (PDF/A)](texterkennung.md#archivfassung-pdfa), a format that any program will still open in many years; [Check all files](#alle-dateien-prufen), which compares every file with its checksum; and the [full export](export.md), a copy in open formats that you can read without Ablago.

!!! warning "Supports – replaces nothing"
    Archive mode **supports retention in line with the GoBD**. There is no official "GoBD certificate" for software: it only becomes proper through software, procedure and a **procedure documentation** together (you'll find a template under [Procedure documentation](verfahrensdokumentation.md)). It replaces neither this nor tax advice.

## Switching on {#einschalten}

In the folder type under **Archive mode**:

- **Switch on archive mode** (default: off).
- **Retention period** in years: suggestions 2, 6, 8, 10 or your own number (up to 30).
- **Reference date:** which date field counts, e.g. *Invoice date*; without a field, the folder's creation date. The period runs until **31.12.** of the reference year plus the years – an invoice of 2 March 2026 with 8 years thus until 31.12.2034.
- **If ‹reference date› is empty** (only with a date field): **from the creation date (as before)** or **doesn't expire yet** – see [below](#ist-der-stichtag-leer).

This also applies immediately to existing folders. When switching on and changing, Ablago shows how many folders are affected, how many of them would already "may go" and for how many the date field is empty. Switching on, changing and switching off are recorded in the [log](fehlersuche.md#protokoll) – only when **saving** the folder type, with the state before and after (on/off, period, reference date, and "if the reference date is empty" as soon as one side is "doesn't expire yet"); trying things out in the editor without saving leaves no entry. Switching off asks first.

### If the reference date is empty { #ist-der-stichtag-leer }

For some things the reference date is only known later: a contract runs until it is ended; a documentation version applies until it is replaced. You set what applies while a folder's date field is empty:

- **from the creation date (as before)** – the default. The period runs from the folder's creation date; existing folder types stay like this.
- **doesn't expire yet** – the folder is locked as within the period, but there is no end yet. The folder shows **Archive · keep, period starts with ‹reference date field›**, and it doesn't appear under "Retention expired". Once the field is filled in, the period starts from that date (31.12. of the year plus the years, as above) – this is recorded in the folder's history, as is emptying it again.

Example: a tenancy agreement with the reference date *Ended on* and 6 years is kept while it runs; if it ends on 30.6.2027, it must be kept until 31.12.2033.

## During the period {#wahrend-der-frist}

- Every folder shows **Archive · keep until 31.12.YYYY**, the list a note **Archive**. If the date field changes, the period changes – this is recorded in the folder's history.
- **No deletion before the end of the period:** neither the folder nor individual documents, not even by administrators, via multiple selection, bin or the [interface](api.md) (409 with the date, with "doesn't expire yet" with the reference date field). Folders that were already in the bin before switching on stay there until the end of the period and are not emptied automatically.
- **Documents only change as a new version:** [versioning](mappentypen.md#register) is mandatory for all document tabs of the folder type; older versions remain until the end of the period ("only the last N" doesn't apply here).
- **Field changes** remain possible and are recorded in the history as always. The history of these folders is never cleaned up.

<a id="nach-der-frist-darf-weg"></a>

## After the period: "Retention expired" { #nach-der-frist-aufbewahrung-abgelaufen }

Under **Workbench → Retention expired** are all folders from folder types in archive mode whose period has expired, with the date. You choose individual ones or all and delete them – with the bin into it, otherwise permanently. **Nothing is ever deleted automatically.** How archive mode, "Retention expired" and the bin fit together into a locking and deletion concept under the GDPR is described under [Data protection in Ablago](datenschutz.md#sperr-und-loschkonzept-aufsetzen), with a [deletion concept template](loeschkonzept.md).

## Archive mode from a package { #archivmodus-aus-einem-paket }

A [package](pakete.md) can suggest an archive mode for the folder types it **newly creates** – for example "2 years, 10 years when used for work, from *Replaced on*, if it is empty: doesn't expire yet". The preview when installing names it per folder type; with the attribute ["used for work"](organisation.md#nutzung) the longer period applies. Afterwards it is your archive mode: you change it on the folder type like any other.

A package never changes the archive mode of an **existing** folder type – neither installing nor an update shortens the period, switches archive mode off or on, or changes what you have set. Switching on by a package is recorded in the [log](fehlersuche.md#protokoll) with the package.

## Check all files { #alle-dateien-prufen }

Under **Workbench → Maintenance → Maintenance operations → Check all files**, Ablago reads every stored file – including older versions – and compares it with its checksum (SHA-256). Deviations ("content changed", "file missing") are listed with document and folder and in the log. Check this, for example, after moving the storage and before destroying paper.

## Backup {#sicherung}

The archive settings belong to the folder type and are part of every [backup](sicherung.md); after a restore they apply unchanged.
