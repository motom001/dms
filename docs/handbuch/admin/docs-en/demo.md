# Demo data {#demo-daten}

Under **Workbench → Demo data** you fill Ablago with content for trying out or testing.

--8<-- "ausgeblendet-alles.md"

![Demo data](bilder/werkbank-demo.png)

## Sample folder types {#beispiel-mappentypen}

**Load examples** creates the folder types *Contract partner*, *Contract*, *Invoice* and *Payment* with fields, tabs, title templates and result lists – plus a few folders. That is a good starting point for basing your own folder types on.

This only works as long as there are no folder types yet apart from the system folder types *User*, *Role* and *Post* (and an earlier [storage location](mappentypen.md#ablageort-wo-die-originale-liegen)). If there is a storage location, *Contract* and *Invoice* get the field *Whereabouts of original documents*; in addition come a few storage locations (at home › study cupboard › red binder, safe in the hallway, at the notary's, destroyed) and the view *Originals by location*. A new Library has none – the examples then come without this field.

## Creating demo folders {#demo-mappen-erzeugen}

Creates up to **50,000 folders per run** for the existing folder types – with matching values per field and links to existing folders. That way you can check how lists, search, sorting, text recognition, storage space and backup behave with many folders and documents. Several runs one after another are possible; new folders also link to the existing ones.

This runs in the background; you can leave the page. The progress is shown on this page – per phase with what is being counted, e.g. "Creating folders: 1,000 of 1,000 ✓ · Creating documents: 1,326 of 1,907". The number of folders matches your input. Only if no matching values can be created for a folder type are there fewer:

- **Already before starting**, the estimate names folder types that can't be created, with number and reason – e.g. a required password (demo data never has passwords) or a required link for which there are no folders of the target type and the target type doesn't get any in the same run either. Ablago creates target types that get demo folders themselves first.
- **As soon as the folders are created**, the progress shows instead of the tick e.g. "Creating folders: 1,415 of 1,500 – 85 skipped"; under *Why were folders skipped?* the reasons per folder type are listed. This can also be a unique field whose possible values are taken.
- The result at the end names the reasons once more.

Demo folders are marked. The system folder types *User*, *Role* and *Post* don't get demo folders.

### Seed {#startwert}

A **seed** (e.g. `messung-1`) makes a run repeatable: the same seed, the same folder types and the same starting state result in the same values and the same documents. That way you can compare measurements before and after an update. Without a seed, Ablago chooses one and names it in the result.

### Creating documents {#dokumente-erzeugen}

With **Create documents**, the new folders also get documents – only folder types with a document tab. You set everything with **sliders**; the number next to them shows the value. The sliders can also be operated with the keyboard (arrow keys in small steps, Page Up/Down in large steps); impossible values can't be set in the first place:

- **Folders with documents:** 0 to 100 %.
- **Documents per folder from … to:** 1 to 250. The steps get coarser upwards (1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 75, 100, 150, 200, 250), so that small values stay easy to set. If you drag "from" beyond "to", "to" goes along – and vice versa.
- **Intended duplicates:** 0 to 50 %.
- **Mix** of the kinds: five sliders that together **always add up to 100 %**. If you move one, the others adjust in their previous ratio.

The kinds:

| Kind | What | What for |
| --- | --- | --- |
| Letter/invoice | one-page PDF with letterhead, address, subject, items and total; the **folder's values** (e.g. invoice number, amount, contract partner) are in the text | full-text search finds the document by the folder's values |
| Multi-page PDF | 2–50 pages (rarely up to 300) with headings, paragraphs, lists and tables | preview, full text of long documents |
| "Scanned" PDF | pages only as images, slightly crooked, without a text layer | text recognition under load |
| Image | JPEG or PNG, from a screenshot to a phone photo (12 MP), partly a photo of a receipt with readable text | preview, text recognition, storage space |
| Large file | PDF of 20–100 MB | uploading, preview, export, backup |

The templates **light**, **realistic** and **heavy** are ready-made mixes; if you move a slider afterwards, it says *own mix*. Every file is unique. A share of **intended duplicates** puts the same file into several folders – it is then stored only once on the disk.

Before starting, an **estimate** appears on the page and changes immediately when sliding: folders, documents, pages, size, pages for text recognition and free space – e.g. "≈ 1,000 folders, ≈ 600 documents with ≈ 4,224 pages, together ≈ 559 MB; ≈ 348 pages for text recognition". For very large amounts (from about 20,000 documents or 20 GB) it warns clearly, because that takes hours on a NAS. More than 250,000 documents per run aren't possible – then better several runs. If the space isn't enough – the *minimum storage space* of the [backup](sicherung.md) and the limit under [System health](speicherplatz.md) must stay free –, the run can't be started. If space runs low during the run, it stops cleanly and says so in the result.

!!! warning "Text recognition takes time"
    Text recognition of many "scanned" PDFs and images takes days rather than hours on a NAS; it keeps running in the background after creating. Backups get correspondingly larger. The package **Text recognition** does the text recognition – without the package, the "scans" stay without text (see [Text recognition](texterkennung.md)).

### Observing {#beobachten}

The result of every run names duration, number, size, pages and seed (also in the [log](fehlersuche.md#protokoll)), so that runs are comparable. How Ablago behaves meanwhile is shown by the existing tools: **Workbench → [Database connection](installation.md#lange-datenbankzugriffe)** (long accesses), **Text recognition** (queue), **System health** (storage space) and the times in the browser under *Server-Timing*.

So that you can keep working normally alongside, the run takes a short break after every document and every batch of folders and then refreshes the database statistics (`ANALYZE`). It takes a little longer as a result. Text recognition still runs in parallel and needs a lot of computing time on a NAS – individual long accesses under **Workbench → Database connection** are possible during this time.

## Removing {#entfernen}

Below the button it says per folder type how many folders there are and how many of them are demo folders, with a total.

**Remove all demo folders** deletes all demo folders including their documents – in batches of 1,000 with progress, even with many files. Real folders stay untouched. If a real folder links to a demo folder, nothing is deleted – then remove that link first.

!!! tip "Trying out without risk"
    For experiments with larger changes to folder types, a second installation with its own database is better suited than the real one.
