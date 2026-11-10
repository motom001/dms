# Text recognition and maintenance {#texterkennung-und-wartung}

So that the search also finds the text of documents, Ablago creates a **full text** for every new document – in the background, without anyone having to wait:

The settings are under **Workbench → Post and intake → Search and full text** – together with the [search](suche.md) (typos, synonyms) and "Shrink new PDFs automatically". The area belongs to the template **Business**; in a household it appears in expert mode. The *maintenance operations* are under **Workbench → Maintenance and troubleshooting → Maintenance**.

--8<-- "ausgeblendet-schritt.md"

- **PDFs:** Ablago reads the existing **text layer** itself (poppler) – immediately. PDFs that a program or a scanner created with text are thus searchable straight away.
- **Scans and photos** (scanned PDF pages, JPEG, PNG) have no text layer. Their text is recognised by the package **Text recognition (German and English)** (identifier `texterkennung`) from the [catalogue](pakete.md). It runs on your own device; no document goes outside for it.
- **Other files** (e.g. Word, Excel, TIFF) get no full text for now.

!!! warning "Since version 0.134: text recognition is a package"
    Up to version 0.133, text recognition (Tesseract) was in the image. Since 0.134 the image is slimmer, and scans only get their text with the package **Text recognition**. After the update, the [Workbench overview](uebersicht.md) shows the notice **"Text recognition is now a package"** with **Install now** – this leads directly to the package under **Workbench → Packages**. Existing full text stays unchanged. Documents that were still waiting for their text recognition show "waiting for text recognition – no package installed"; as soon as the package is installed, they go to the package by themselves. Without internet you install it from a [bundle file](pakete.md).

## Text recognition as a package {#texterkennung-als-paket}

The package **Text recognition** (from 2.0, Tesseract as WebAssembly in the [package runner](pakete.md)) takes over text recognition. For this it needs the permission [Take over text recognition](pakete.md#recht-texterkennung). This is how it works:

1. For PDFs, Ablago reads the **text layer** – immediately, without waiting. If a PDF has text, it is searchable straight away.
2. Ablago reports every document to the package (event [Full text ready](pakete.md#ereignis-volltext-fertig)) – even if it found no text.
3. Documents **without text** (scans, photos) – and PDFs containing scanned pages besides text pages – show **"waiting for text recognition (package …)"** until the package writes the full text. Afterwards the document says "Text recognition by package …". For long documents the package shows there how far it is (e.g. "page 20 of 64").
4. What the package recognises (language, straightening pages, whether it also re-recognises PDFs with text, resolution) you set **at the package**: **Workbench → Packages → Text recognition → Settings**.

Without the package, scans and photos stay without text ("waiting for text recognition – no package installed"); PDFs with text are still searchable.

**How fast?** The package is somewhat slower than the former built-in text recognition because it runs sealed off as WebAssembly: on a computer with 2 cores (amd64) it needed about 31–35 seconds for 10 scanned pages, the built-in one 25–26 seconds there; a single page takes about 4–6 seconds from uploading to text. It recognised just as well. It recognises long documents in sections; the package runner's time limit doesn't apply. More measurements are in the package's README.

![Workbench → Search and full text](bilder/werkbank-texterkennung.png)

## Other file types {#andere-dateitypen}

Ablago itself only reads **PDF, JPEG and PNG**. For other file types there is a thumbnail and full text if a **package for converting** is installed (permission [Convert files](pakete.md#recht-umwandeln), since version 0.137): the package makes a **converted version** (PDF, PNG or JPEG) of the file, from which the thumbnail and the full text are created – for a scan via the package Text recognition. The document stays the original file; downloading, passing on and versions always concern the original.

| File type | Preview and full text with | Version |
| --- | --- | --- |
| PDF, JPEG, PNG | Ablago itself (scans and photos: package **Text recognition**) | – |
| TIFF (also multi-page, e.g. from the scanner), WebP, GIF (first image), BMP | package **Image formats** (plus for the text: package **Text recognition**) | TIFF → PDF, WebP → JPEG, GIF and BMP → PNG |
| HEIC/HEIF (photos from the iPhone) | no package yet – see below | – |
| Word, Excel, PowerPoint, OpenDocument, RTF, text, emails (`.eml`, `.msg`) | full text: package **Office and email** (no preview yet, dms-registry #72) | – (the package reads the original) |

For Office files and emails, the package makes no version but **only supplies the full text** (permission [Supply full text](pakete.md#recht-volltext), since version 0.145). It reads the original file for this. Until it writes the text, the document says "Full text: waiting for package · waiting for full text (package Office and email)". Ablago gives it every such file – on upload, with a new version, with **Regenerate full text**, with **Try again** and **Regenerate** on the document and on installation for all existing files without text. If the package can't read a file, its reason is shown on the document, e.g. "Full text by package Office and email: Word can't be read: encrypted with a password". Up to 5 million characters per document go into the full text (as for all documents).

This is what it looks like:

1. Without a matching package, the document says "Full text: skipped" with the notice which package helps (e.g. "TIFF files get preview and full text with the package "Image formats""); next to the document is the file icon.
2. If you install the package, **all existing files** of these types go to the package – new ones straight away on upload. Until the version is there, the document says "waiting for conversion (package …)".
3. With the version, the thumbnail (notice on hovering: "Preview from a package's converted version") and the full text are created. The document then says, e.g., "Text from the PDF · from the converted version (Image formats 1.0.0)" with the link **View version**; the folder's history says "converted version created".
4. If the package can't read a file (e.g. damaged), its reason is shown on the document ("Conversion by package Image formats: …"). **Try again** gives the file to the package once more.

**Workbench → Search and full text → Other file types** shows per file type how many documents there are and which package converts them or supplies their full text – or which package from the catalogue could, with **Install package**.

**Backup:** since version 0.140.1 the versions are with the documents in the Library's folder (`/data/files/<Library id>/fassungen`) and go into the [backup](sicherung.md#was-eine-sicherung-enthalt) and the [full export](export.md) (there as `<file>.fassung.pdf` next to the original). After a restore everything is as before – view version, full text and preview –, even **without** the package or with a newer version that would convert differently today. Versions from the former location (`/data/files/fassungen`, versions 0.137 to 0.140.0) are moved by Ablago by itself at the first start. Older backups without versions can still be restored; then **Workbench → Maintenance operations → Catch up thumbnails** fetches the versions from the package, provided it is installed (the full text is part of every backup and stays).

**Why no package for HEIC yet?** HEIC photos are compressed with HEVC (H.265). The free libraries for it (libheif, libde265) are under LGPL, and for HEVC there are patent pools that also want to license software decoders – we are clarifying this before a package goes into the official catalogue. Until then: on the iPhone, choose "Most Compatible" under *Settings → Camera → Formats* (then it saves JPEG), or upload via the browser – Safari usually already converts photos from the library to JPEG.

## Archive version (PDF/A) { #archivfassung-pdfa }

With a package such as **PDF/A** (permission [Store archive version](pakete.md#recht-archivfassung)), every document additionally gets an **archive version**: a searchable PDF/A, a format for long-term retention with an invisible text layer exactly on the words. The original stays unchanged as the document.

- **When:** only once the full text is settled – for scans, therefore, after text recognition. For this, Ablago gives the package the **word positions** from the text layer or from text recognition. For TIFF and co., the package takes the readable version from [Other file types](#andere-dateitypen).
- **Which:** in the package's settings you tick what gets an archive version: **PDFs with text**, **scanned PDFs**, **photos and images** (with the file extensions) and – if the package can do it – **emails** (`.eml`, Outlook `.msg`) – default all. Whoever deselects PDFs with text saves space (for PDFs the storage requirement roughly doubles). If you tick a kind later, Ablago catches up the documents. If a PDF is already valid PDF/A, it counts as its own archive version. **Encrypted PDFs** get none; the reason is shown on the document. **Digitally signed PDFs** get one for display; the signature is checked on the original.
- **Emails** (since 0.221): a package that can do it (e.g. PDF/A from 1.2.0) sets a filed email as pages like a letter – sender, date (in the time zone under Workbench → Region) and subject at the top, the text below; attachments are listed at the end. It never loads images from the internet. This lets you **view** the email in Ablago ("View: archive version (PDF/A)"); **Show original** downloads the `.eml` or `.msg` file. It doesn't need the full text for this: without a package such as *Office and email* the email still gets its archive version; with one it waits until the text is there. An email filed by hand stays **one** document – its attachments aren't split off (in the [mailbox](postfaecher.md) they become separate documents as before). An email is a file of type `message/rfc822` or `application/vnd.ms-outlook`, and one without an exact type (`application/octet-stream`) ending in `.eml` or `.msg`.
- **Never loading anything:** the archive version only contains what is in the file itself. It doesn't take over links to content on the internet, JavaScript and actions on opening – Ablago rejects an archive version with such content. If the original had any, the document says "Contained links to external content that were not taken over"; the addresses are only in the log (module *archivfassung*).
- **Check:** Ablago only accepts a PDF with a PDF/A identifier (XMP metadata, unfiltered), unencrypted, up to 100 MB and 1000 pages. The full conformance check is done by the package itself (e.g. with veraPDF in its CI).
- **Workbench → Search and full text → Archive version (PDF/A)** shows the package, how many archive versions there are, how many are waiting, skipped or rejected – and the documents with the reason.
- **Backup and full export:** the archive version belongs to the backup (with test restore) and is in the full export as `<file>.pdfa.pdf` next to the original. The [access copy under Art. 15](datenschutz.md) stays as it is: documents as filed.
- **After changes to the original** (new version, rotating, deleting pages, splitting, redacting), the old archive version no longer applies; the original is shown until the package has created a new one.

## Workbench → Search and full text { #werkbank-suche-und-volltext }

The page is an **overview**; recognition settings are no longer here (they are at the package):

- **Text recognition for scans and images:** which package takes over text recognition, with a link to its settings, and how many documents are waiting for it right now. If the package is missing, the notice with **Install now** is shown here.
- **Where the text comes from:** how many documents have their text from the PDF, from the package, from the former built-in text recognition (up to 0.133), are without text, are waiting for text recognition or had an error.
- **Other file types:** TIFF, WebP, Word, emails and co. – how many there are and which package converts them or supplies their full text (see [Other file types](#andere-dateitypen)).
- **Recognised languages** with the notice if the package lacks language data (see [Further languages](#weitere-sprachen)).
- **Queue**, **tools** (poppler) and **jobs** (see below).

Whether a documents tab creates a full text at all you set on the [Folder type](mappentypen.md#register) (*Create full text*, default: on).

If the queue is stopped, a notice at the top of the page and at *Regenerate full text* says why: **switched off** (with **Switch on**) or **paused while maintenance mode is on** (with **End maintenance mode**). A maintenance mode that is only announced doesn't stop the queue.

## Recognising the language automatically {#sprache-automatisch-erkennen}

Ablago recognises from the text itself which language a document is written in – offline and without outside services: it counts typical short words (articles, prepositions, greetings) and special characters. It distinguishes German, English, French, Spanish, Italian, Dutch, Turkish, Polish, Portuguese, Russian, Ukrainian and Arabic. With very little text (e.g. only numbers) the language stays open.

The recognised language is shown **on the document** next to the status of the full text (e.g. "Full text: ready · 2 pages · French"), also for PDFs with a text layer. It is a field of its own of the document, and the **full-text search uses the word stems of this language**: in the French letter "cheval" also finds "chevaux", in the English one "invoice" also "invoices". Without a recognised language, German applies.

The package **Text recognition** uses the same recognition with *Language: Automatic* – since 2.1.0 for every page individually: it first reads a page in the language of the page before (at the start German), recognises the language and reads the page a second time in the recognised language if it is a different one and the package has its language data – the better result applies. It straightens pages lying sideways or upside down beforehand.

### Documents in several languages { #mehrere-sprachen }

Since 0.139.0 a document doesn't just have one language: the language is fixed **per page**, on a mixed page also two (for instance a German letter with an enclosed French letter, or a bilingual confirmation). The document then shows the language with the most text and the others: "Full text: ready · 3 pages · German, also contains French". The search uses **per page the word stems of its language** – "Beglaubigung" finds the German page, "ambassades" the French one.

- For **PDFs with a text layer**, Ablago recognises each page's language itself (paragraph by paragraph; a second language counts from about a fifth of the page's text).
- For **scans**, the package **Text recognition** from 2.1.0 reports the languages per page: it reads every page in its language (second pass when the language changes) and a mixed page with both languages at once if that is clearly more reliable. For this it needs the language data (e.g. the additional language French); without it, it reads the page in German, and the search still uses the word stems of the recognised language.
- If the language changes completely between two pages, the **post** shows the notice "A separate letter probably begins from page 2 – split post?". Splitting **never happens by itself**: the button only opens the page view with the suggestion; the notice can be hidden for everyone.
- **Existing stock:** existing documents keep their one language and their search index; the update rebuilds nothing (migration 053 in fractions of a second). Whoever wants older scans read per page too starts **Regenerate full text → For all documents** (see below; depending on the amount, this takes hours). PDFs with a text layer get their page languages this way within seconds.

Packages and the [interface](api.md) state the language with the full text (`PUT /dokumente/{id}/volltext` with `sprache`) or set it individually (`PUT /dokumente/{id}/sprache`, e.g. `{ "sprache": "fra" }`, `null` = not stated; since 0.139.0 with `weitere` also the further languages). This is recorded in the folder's history. How packages report languages per page is described in the Developer manual (packages with code → languages per page).

## Further languages {#weitere-sprachen}

The package **Text recognition (German and English)** contains German, English and orientation detection. Further languages come from the catalogue as **additional languages**, one package per language, e.g. **Text recognition – additional language French** (`texterkennung.fra`). They exist for French, Spanish, Italian, Dutch, Portuguese, Polish, Turkish, Russian, Ukrainian and Arabic (identifier `texterkennung.` and the language code: `fra`, `spa`, `ita`, `nld`, `por`, `pol`, `tur`, `rus`, `ukr`, `ara`). Your own image or mounted language files are no longer needed. Up to Ablago 0.228 the additional languages were called `texterkennung_fra` etc.; an update moves them to the new identifier – the same installation, no second package (#1084).

**Installing:** when installing text recognition – under **Workbench → Packages** or in the setup assistant – Ablago asks right below it **Further languages?** and installs the ticked languages in the same step, with one confirmation for all permissions. Later this works under **Workbench → Packages → Text recognition → Further languages → Choose …** (see [Several packages in one step](pakete.md#mehrere-pakete-in-einem-schritt-installieren)). Every language stays a package of its own with its own version and its own update.

**Whether more languages slow down recognition:** which language a page has, the package recognises from the text read, using short word lists for all the languages named above – always for all, whether their language data is installed or not. More additional languages therefore make this recognition neither slower nor less accurate. An additional language only costs time where it is needed: if the package recognises a page as French and French is installed, it reads the page a second time in French and takes the more reliable reading.

Under **Workbench → Search and full text → Recognised languages** you see how many documents exist in which language and whether the package has their language data. If it is missing, the page makes a suggestion, e.g. "12 documents in French – the package Text recognition reads them better with 'Text recognition – additional language French' (texterkennung.fra)", with a link to this package. The package also names missing language data in the result and in the package runner's log ("Language data missing: fra (additional package texterkennung.fra)").

After installing an additional language, **Regenerate full text → For all documents** (see below) re-recognises the existing documents – or you restart individual ones under **Jobs → ready**.

## Jobs {#auftrage}

Under **Jobs** you see, in a list of fixed height, the documents per status (*error*, *waiting*, *running*, *waiting for text recognition*, *skipped*, *ready*) – with folder (as a link), size, time and the **reason** for errors or skipped documents.

- Select documents and **Restart**: they go back into the queue.
- **Remove** waiting ones **from the queue** or **cancel** running ones: they then count as *skipped* ("Cancelled by the administrator"); a running process (pdftotext) is ended. With *waiting for text recognition*, Ablago discards the not yet delivered message to the package; text from the PDF stays.
- **Restart** explicitly has the full text regenerated: a package then also re-recognises documents that already have text.
- **Restart all errors** queues all documents with errors again.

**If the database is at capacity:** if many processes save at once (a stack of scans, demo data, an import), the database may exceptionally cancel saving a result. Ablago then tries again a few more times by itself with a short pause. If that doesn't work either, the document shows *error* with the reason "Text recognised but not saved – the database was at capacity" and an entry in the log – never silently without full text. **Restart** or **Restart all errors** catches up. This also applies when a package writes the text: it then gets the answer 503 and sends again.

**Password-protected PDFs** are recognised by Ablago and skipped with the reason "The PDF is protected with a password" instead of reporting an error – a new attempt wouldn't change anything.

All text recognition messages are in the [log](fehlersuche.md) under the module `texterkennung`.

On the document, all users see the status (*waiting*, *running*, *waiting for text recognition*, *ready*, *error*, *skipped*) and where the text comes from ("Text from the PDF", "Text recognition by package …"); with an error, text recognition can be **tried again** there, and a ready text can be displayed. Whoever may edit the folder can explicitly have a document's full text regenerated with **Regenerate**. If the same file is already in another folder with full text, Ablago takes over this text.

## Maintenance operations {#wartungsoperationen}

**Workbench → Maintenance → Maintenance operations** collects work on the whole stock that you start when needed:

- **Regenerate full text** – for documents without text or for all, see below.
- **Catch up thumbnails** creates, for older PDFs and images, the small image of the first page shown next to every document. New documents get it straight after upload, older ones otherwise on first display. The images are created one after the other with `pdftoppm` (poppler, included in the image). Files of other types without a version (e.g. TIFF) are given to the [package for converting](#andere-dateitypen), if one is installed.
- **Check all files** reads every stored file, including older versions, and compares it with its checksum. That way it becomes apparent if a file was changed on the storage or is missing. More under [Check all files](archiv.md#alle-dateien-prufen).
- **Assign numbers afterwards** gives a number to folders created before their field got a number sequence. More under [Assign numbers afterwards](nummernkreise.md#nummern-nachtraglich-vergeben).
- **Clean up senders** clears wrong senders on older post, see below.
- **Values that don't fit the format** lists stored values that don't fit a format or date limits, see below.

All run in the background; Ablago stays usable meanwhile.

### Regenerating full text { #volltext-neu-erzeugen }

Runs as for a new document: Ablago reads the text layer again and gives the document to the package for text recognition.

- **For documents without text** – all documents whose full text is empty: never read (e.g. uploaded before version 0.11), scans for which there was no package yet, or after an error. This includes [other file types](#andere-dateitypen) such as TIFF: without a version they go to the package for converting, with a version that is read. Replaces the former "Catch up full text".
- **For all documents** – after a confirmation with the number. This is an **explicit renewal**: the package then also re-recognises documents that already have text – even if "Discard existing full text and recognise anew" is off for it. Useful, for instance, after a new language package. Until the package is finished, the previous text remains for the search.

Only documents in tabs that create a full text. It runs as a **job with progress** ("Reading text layer and passing to text recognition: 120 of 800") and can be **cancelled**; Ablago stays usable. The job itself is fast – the time is needed by text recognition afterwards: the package **Text recognition** manages about **10 pages in 35 seconds** (amd64, 2 cores), so 1,000 pages in about an hour. How far it is you see under **Workbench → Search and full text** ("waiting for text recognition").

If no package for text recognition is installed, the page says so with the way to **Workbench → Packages**.

### Cleaning up senders { #absender-bereinigen }

Up to version 0.99, for uploaded post without a sender, Ablago entered the **name of whoever created it** – for post from the intake folder "Intake folder". But the sender is whoever sent the letter. Since then, new post gets no sender as long as nobody enters one.

For the existing stock, **Clean up senders** shows a preview: incoming post with channel *Uploaded*, *API*, *WebDAV* or *Folder* whose sender is exactly the creator's name (or "Intake folder"). Post from mailboxes and sent emails are never included. Remove the tick where the sender is right after all, and tap **Clear sender**. Afterwards the history of every post says what was in the field before and who cleaned up.

### Values that don't fit the format { #angaben-die-nicht-zum-format-passen }

If a field gets a [format or date limits](mappentypen.md#formate-und-datumsgrenzen) – set by yourself or with a package update –, stored values stay valid. This list shows them per folder type and field: the folder (a click opens it in the Library), the value and what doesn't fit, e.g. "A German postcode has exactly 5 digits" or "The date may not be in the future". At most 200 folders are shown per field.

You don't have to correct anything immediately: as soon as someone changes the field in the folder, the value must fit. Other fields of the folder can be saved as before.
