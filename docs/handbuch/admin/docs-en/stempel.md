# Stamps when sharing {#stempel-beim-weitergeben}

When downloading, exporting (ZIP, PDF) and sending by email, users can have a **stamp** or a **watermark** put on the copy, e.g. "Copy for Müller Property Management – 01.11.2026", "Only for presentation to the tax office" or "DRAFT". The **stored original always stays unchanged**, as does its [archive version](#archivfassung-bleibt-unverandert); the stamp only arises in the copy passed out – on the pages of the document itself, never on a separate cover sheet. How users do this is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/versenden/#weitergeben-mit-stempel).

You set two things: the **templates** users choose from, and per folder type whether a stamp is **suggested** or **required**.

## Stamp templates { #stempel-vorlagen }

The templates are under **Workbench → Stamps**. At the start there are five (their texts are German):

| Template | Text | Position |
| --- | --- | --- |
| Kopie für … (copy for …) | `Kopie für {empfänger} – {datum}` | diagonal (watermark) |
| Nur zur Vorlage bei … (only for presentation to …) | `Nur zur Vorlage bei {empfänger}` | header |
| Entwurf (draft) | `ENTWURF` | diagonal |
| Vertraulich (confidential) | `VERTRAULICH` | top right corner, first page only |
| Aus Ablago (Laufwerk) (from Ablago, drive) | `Aus Ablago · {datum}` | footer – for the [WebDAV drive](webdav.md#stempel-beim-lesen) |

![Workbench → Stamps](bilder/werkbank-stempel.png)

Like folder types or number ranges, the templates are listed **in the middle** – each with name, text with placeholders and position, followed by the folder types that use it. A click opens the template **on the right** with all settings and the [preview](#vorschau); at the bottom you save or discard the changes, and **Delete template** is at the bottom left. With **+ New** at the top of the middle column you create one:

| Detail | Meaning |
| --- | --- |
| **Name** | what the template is called in the selection; unique |
| **Text** | up to 6 lines and 300 characters, with [placeholders](#platzhalter). The text is in **one** place – it isn't split across header and footer. |
| **Position** | diagonally across the page (watermark), header, footer, top right corner with frame or **stamp**: a small stamp with a double frame, freely placeable on the page |
| **Pages** | all pages or only the first |
| **Colour** | red, blue, green or black |
| **Size** | 50 % to 200 % of the usual size |
| **Opacity** | 10 % (barely visible) to 100 % (full colour); new templates start with **70 %** |
| **Rotate** | 0° to 359°, with a slider or number – also upside down. The diagonal always follows the page and can't be rotated. |
| **Like ink – text underneath stays readable** | see [below](#deckkraft-und-wie-tinte); new templates have it switched on |

### Placeholders { #platzhalter }

With the buttons below the text you insert placeholders. When passing out, Ablago fills in:

| Placeholder | becomes |
| --- | --- |
| `{datum}` | today's date |
| `{empfänger}` | the recipient entered when sharing (for emails without one, the addresses) |
| `{benutzer}` | the name of whoever passes it out |
| `{mappe}` | the folder's title |
| `{seite}` | the number of the page the stamp is on |
| `{seiten}` | the number of pages of the document |
| `{archivnummer}` | the document's [archive number](nummernkreise.md#archivnummern-und-aufkleber) (empty if it has none) |

All placeholders work with **All pages** as with **Only the first page**. An example for page 1 only: "Export from Ablago – this document has {seiten} pages". For page numbers on every page: "Page {seite} of {seiten}" with **All pages**.

### Preview { #vorschau }

Below the details, the preview shows the stamp on four made-up sample receipts side by side (on the phone one below the other): an invoice with text, a table with amounts, a coloured form and a grey scan of a till receipt. Every change to text, position, colour, size, opacity and "like ink" shows up immediately in all four images. You see page 1 as it would be passed out; with **All pages** the same setting applies to every page.

You can edit the stamp directly in the preview:

- **Move** (position *Stamp*): drag with the mouse or your finger, or select it with the Tab key and move it with the arrow keys (with Shift in larger steps). The other positions are fixed.
- **Rotate**: drag the round handle above the stamp (with Shift in 15° steps), with Page Up and Page Down or with the degrees under **Rotate**.
- **Change text**: double-click or press Enter. A text field opens with the buttons for the placeholders.

### Opacity and "like ink" { #deckkraft-und-wie-tinte }

A stamp should be easy to see without making amounts, dates or file references underneath unreadable. There are two adjustments for this:

- **Opacity**: the higher, the stronger the colour – and the more an ordinary stamp covers what is underneath. From 80 % the workbench points out: *"Please bear in mind: the stamp can cover information on the receipt and make it unreadable."* Higher values remain allowed.
- **Like ink – text underneath stays readable**: the stamp is laid on the paper like real stamp ink (in the PDF the blend mode "Multiply"). It only tints: white becomes red, black stays black. So even full colour works without covering anything. On coloured areas the stamp becomes darker, as on paper. New templates have "like ink" switched on; you can switch it off per template and when sharing.

Templates that existed before this setting (including the built-in ones) keep their previous appearance: their opacity and "like ink" off. You can switch it on there at any time.

### Page numbers and archive number formerly as ticks { #seitenzahlen-und-archivnummer-fruher-als-haken }

There used to be the ticks **Page numbers "Page x of y" as a footer** and **Document's archive number in the footer**. They have been dropped; instead there are the placeholders `{seite}`, `{seiten}` and `{archivnummer}`. If a template had one of the ticks set, Ablago added a line to its text, e.g. "{archivnummer} · Seite {seite} von {seiten}". This line is now in the stamp itself, at its position and in its colour, instead of small at the bottom right – and with **Only the first page** only on page 1. So that nothing changes unnoticed, the workbench shows a notice when opening such a template until you save it or choose **Leave as is**.

Users can still change text, position, opacity, pages and "like ink" when sharing; the template is the starting point. A template that a folder type uses can't be deleted – **Used in** says which. The same applies to the template with which the [WebDAV drive](webdav.md#stempel-beim-lesen) stamps when reading.

The templates are in the database settings and are thus part of the [backup](sicherung.md).

## Stamp per folder type { #stempel-je-mappentyp }

In the [Folder type](mappentypen.md) there is the area **Stamp when sharing**:

- **No stamp** (default): users can choose a stamp when sharing but don't have to.
- **Suggest**: **With stamp** is already ticked when downloading, exporting and sending, with the chosen template – e.g. for "ID & certificate": "Copy – only for {empfänger} – {datum}". Users can deselect it.
- **Required**: documents of this folder type only leave Ablago stamped – when downloading (including older versions), in the export as ZIP or PDF, by email (including the folder's PDF "Details"), via the [API](api.md) and via the [WebDAV drive](webdav.md#stempel-beim-lesen). If someone doesn't give their own stamp, Ablago uses the folder type's template. If it uses `{empfänger}`, a recipient must be given (for emails without one, the addresses). Documents that aren't PDFs or images can then not be passed on.

The setting is saved with **Save folder type**.

## What is stamped { #was-gestempelt-wird }

- **PDFs** and **images** (JPEG, PNG). Images become a PDF in the process (A4, portrait or landscape like the image). Encrypted PDFs can't be stamped.
- In the **export as PDF**, the included documents get the stamp, not the pages with the folder's details.
- With **Emails** (one and several folders), the PDF **"Details"** with the folder's fields also gets the stamp – it goes out too. The stamped version is then in the post.
- In the **export as ZIP** and with emails, other files (e.g. Word) go along unstamped – unless the folder type requires the stamp; then Ablago aborts with a message.
- **Viewing** in Ablago, the preview, text recognition and packages always get the original.

## Archive version stays unchanged { #archivfassung-bleibt-unverandert }

The stored [archive version](texterkennung.md#archivfassung-pdfa) (PDF/A) is **never** stamped or otherwise changed. It is the version that should stay readable unchanged over years; a stamp belongs to a single sharing, not to the document. That's why it arises anew in a copy every time:

- **Packages** (e.g. text recognition, PDF/A) work within Ablago and always get original and archive version unchanged.
- **Retrievals via an API key** (scripts, other programs) count as passing out: they need the export permission, and if the folder type requires a stamp, the **copy** passed out gets it – on the pages of the document itself, so **no separate cover sheet** that could simply be removed. The template's choice **All pages** / **Only the first page** applies as always.
- This applies to the document, older versions, the archive version, the converted version and the **page images** (page view, preview, greyscale and colour image, image for redacting): with an API key and a stamp they arise from the stamped copy.

Every such sharing is recorded in the folder's history.

## Requirement also applies to the drive { #pflicht-gilt-auch-fur-das-laufwerk }

Via the [WebDAV drive](webdav.md), documents of a folder type with **Required** always come out with its stamp – even if "Stamp when reading: No stamp" is set under **Workbench → WebDAV drive**. Images come out there as PDF and are also called that in the drive (`foto.pdf`); the drive doesn't open files that can't be stamped at all.

The tabs of such folders are **read-only** via the drive: nothing can be filed, changed, renamed, copied or deleted. Otherwise the stamp would arrive in Ablago as a new version when saving back. Explorer and Finder show these folders and files as read-only. Filing there still works in Ablago itself.

Without a requirement, the drive stamps with the template from its own setting (default: *From Ablago (drive)*) – see [Stamp when reading](webdav.md#stempel-beim-lesen).

Every sharing with a stamp is recorded in the folder's **history** ("shared: with stamp "…" to …", with documents and kind of sharing); for emails in the email's entry, and the stamped copy is in the post.

## How safe is the stamp? { #wie-sicher-ist-der-stempel }

The stamp is **order and proof**, not a security boundary: it marks a deliberate sharing, and the history records it. Whoever may read a document can always photograph or save it while viewing; the real boundary is the read permission.

The stamp is **content of the page**, not an annotation (comment) that could be deleted with one click in any PDF program. Ablago draws it as text over the existing content and afterwards merges all contents of the page into **one** data stream, so that it doesn't remain as a separate building block.

The limit: anyone familiar with PDF tools can still remove text commands from a page. The stamp isn't burned into the pixels. It is a clear sign of whom a copy is intended for and makes misuse harder – it is not copy protection.

## Via the API { #uber-die-api }

`GET /api/v1/dokumente/{id}/inhalt` takes stamp parameters: `vorlage`, `stempel` (text, lines separated with `%0A`), `empfaenger`, `lage` (also `stempel`), `deckkraft`, `tinte`, `drehung`, `x` and `y` (centre for the position *Stamp*, 0 to 1), `farbe`, `groesse`, `seiten`. The former parameters `seitenzahlen` and `archivnummer` still work: they append the matching line with placeholders to the text. A retrieval with an API key always counts as sharing, so the folder type's requirement applies here too – also for archive version, converted version and page images. The templates are delivered by `GET /api/v1/stempel/vorlagen`, the setting per folder type is on `GET /api/v1/typen` under `stempel`. Details are in the [API description](api.md).
