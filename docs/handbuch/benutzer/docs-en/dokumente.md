# Documents {#dokumente}

Documents are in a folder's **document tabs** – for a contract, for example, under "Contract documents".

![A folder's documents](bilder/dokumente.png)

## Uploading {#hochladen}

1. Open the folder and the document tab.
2. Drag files into the field **Drag files here** or click **choose**.
3. The files now appear in the list with the note "will be uploaded on saving".
4. Click **Save folder**.

The files are only uploaded on saving – just like the other details. If you discard the changes, nothing is uploaded either.

A file may be up to 100 MB in size.

!!! tip "May the paper go now?"
    What you may destroy after scanning and what you'd better keep in the original: [Keep or destroy the original?](original.md)

!!! tip "Same file already filed?"
    If exactly this file is already in another folder you may see, that is shown **immediately** at the new file – even before saving: "This file is already in *Electricity contract house* (Contract, tab Documents, "Scan.pdf", uploaded on …)", with a link there. You decide: **Save folder** files it anyway, **Don't upload** leaves it out, the link leads to the existing folder. In any case, the content is stored only once.

    Ablago compares the file's **checksum** – only exactly identical files count, not a second scan of the same letter. If the file is only in folders you may not see, there is no notice: Ablago reveals nothing about folders hidden from you.

## Viewing and downloading {#ansehen-und-herunterladen}

Next to every PDF and image (JPEG, PNG) there is a **small preview of the first page**. That way you recognise at a glance, even with meaningless names like "Scan_2026-10-12.pdf" or "IMG_4711.jpg", which is the invoice and which the photo of the meter. The image is created in the background shortly after uploading; until then – and for other files such as Word or Excel – the file extension is shown there. If a file has an archive version (PDF/A, e.g. an **email**), the image shows its first page once it is ready; on hovering it then says "Preview from a package's converted version". Only those who may see the document see the preview. The previews also appear next to the documents when **assigning a post**.

- **PDFs and images:** a click anywhere on the row shows the document **directly below it**, a second click closes it. Only one document is ever open. By keyboard: Tab to the name, then Enter. The icon **↗** opens it in a new browser tab.
- **All other files** (e.g. Word, Excel) can only be downloaded and then opened in their program.

**When viewing, Ablago doesn't run anything from the PDF and doesn't load anything.** A PDF can contain scripts, automatic actions, forms that send data and attached files – the viewer shows a cleaned copy without any of that. Links in the PDF only open when you click them. If a PDF can't be cleaned (e.g. encrypted or damaged), a short notice appears instead of the viewer; you can still download it.

**Download** saves every file unchanged on your device. Next to every document it says how large it is and who uploaded it when.

### Without the export permission { #ohne-exportrecht }

In Ablago the rule is: **reading means viewing, exporting means taking along.** Downloading, sharing, copies with a stamp, sending by email, exporting and the [network drive](laufwerk.md) therefore need the permission **Export (E)**, which an administrator grants on the views. If you lack it for a folder, you can still view its documents here; instead of **Download** there is a locked button with **Why not?**, and sharing and **With stamp …** are missing. Word or Excel files that the browser can't display then can't be opened.

Saving while viewing can never be prevented entirely – a browser can save a displayed page, and a screenshot always works. The permission ensures that documents can't be taken along with one click.

![Document directly below its row](bilder/dokumente.png)

### Archive version (PDF/A) { #archivfassung-pdfa }

If a package such as **PDF/A** is installed (an administrator does this), every document additionally gets an **archive version**: a searchable PDF/A that can still be opened and searched in many years and without Ablago – handy when you pass documents on to a tax adviser or an authority. The original stays unchanged.

- **Display:** if there is an archive version, Ablago shows it. Above the viewer it says **"View: archive version (PDF/A)"**, next to it **Show original** (and back **Show archive version**). Without an archive version you see the reading version (for TIFF and co.) or the original; while the package is still working, it says "Archive version being created".
- **Download:** with an archive version you have the choice – in front is what you are currently seeing (**Download**), next to it **Download original** or **Download as PDF/A**. For **e-invoices** (ZUGFeRD, Factur-X) the original is always in front – only there is the invoice included as XML.
- **Emails** (`.eml`, Outlook `.msg`): if the package can do it, filed emails get an archive version too – you then read them in Ablago like a letter, with sender, date and subject at the top. **Show original** downloads the email file; you can open it with your email program.
- **Passing on:** when downloading with a stamp, sending one or several folders by email and exporting as ZIP or PDF, you choose **Archive version (PDF/A) where available** (default) or **Original**. Documents without an archive version and e-invoices always go out as the original – without a question; the dialog says so.
- **On the document** the status is shown: *Archive version: PDF/A-2b* (done), *being created*, *none* (with a reason, e.g. for encrypted PDFs) or *error*. Plus notes:
  - "The original is digitally signed – open the original to check the signature." The archive version doesn't carry the signature.
  - "Contained references to external content that were not taken over." The archive version only contains what is in the file – nothing is loaded from the internet (that would tell the sender when you open the document).
  - "The original is already PDF/A and counts as the archive version itself."
- **After changes** to the original (new version, rotating or deleting pages, splitting, redacting), Ablago shows the original until the new archive version is there. The folder's history records every new archive version.

### Password-protected PDFs { #passwortgeschuetzte-pdfs }

Payslips, medical reports or bank statements often come as a PDF with a password. Ablago files them like any other document and recognises the protection – no matter whether the post was uploaded or came from the mailbox, the intake folder or via the network drive.

- **On the document** it then says: "This PDF is protected with a password. Enter the password so that Ablago can display and search it." Below it you enter the password and click **Unlock**.
- Ablago then creates an **unlocked version**. Preview and full text are created from it; stamp and archive version use it too. Above the viewer it says "View: unlocked version", on the document "Password protection removed".
- The **original is kept unchanged** – with its password. **Download** still delivers the original. The folder's history records "Password protection removed" with person and time.
- **Ablago doesn't store your password**, neither in the database nor in the log nor in the backup. It only goes to the program qpdf for this one operation. Unless you tick **Remember for further documents** (see below).
- **Wrong password:** Ablago says how many attempts are left. After five wrong attempts you wait 15 minutes.
- **Only printing or copying locked:** some PDFs open without a password but forbid printing or copying. Ablago treats such PDFs like normal PDFs for preview and full text without asking. Here too, the original stays unchanged.

**Remember for further documents:** if such PDFs regularly come with the same password (for instance the payslip every month), tick the box when unlocking and give the password a short name. Ablago suggests the subject for it. If new post then arrives **for you** (from your mailbox or with you under "For"), Ablago tries your remembered passwords itself. If one fits, the document is unlocked straight away, and the history names it ("unlocked with remembered password 'Payslip'"). For post for everyone Ablago doesn't try anything; then whoever opens the document enters the password. You find your remembered passwords under [My account → Security](profil.md#passwoerter-fuer-dokumente).

!!! warning "What protects it afterwards"
    After unlocking, it is no longer the PDF password that protects the document but Ablago: the permissions on the folder and the encryption of the Library and the backup. Whoever may read the folder sees the document without a password – for your parents' doctors' letters, for example, your siblings, as far as their permissions allow. So think beforehand about where the document is and who may read it. The unlocked version goes into the backup and the full export too.

### On the phone: showing a document {#am-handy-dokument-vorzeigen}

On the phone, Ablago doesn't show documents **embedded** in the folder – that way the page doesn't get stuck in the document when swiping. Instead, every card has large buttons:

- **Open** shows the document with one tap **in full screen** in your browser's viewer. There you zoom with two fingers; **Back** in the browser takes you back to the folder with one tap. A tap on the (larger) preview or the name also opens it.
- **Share** (where the browser can, e.g. Safari on the iPhone) sends the file via "Send to …" – for instance by email or message when someone at the counter asks you for it. On the first tap Ablago loads the file; if that takes too long, tap **Share now** afterwards.
- **⋯** opens all further actions as a sheet from the bottom: download, with stamp …, pages, redact, archive number, replace and – only here – **delete**.

All buttons are at least 44 points large on the phone. If the document needs to be visible for a long time, briefly set the phone's auto-lock to longer – in the browser's viewer Ablago can't keep the screen awake.

## Sorting { #sortieren }

Above the list you choose the order: **Name A–Z** (default), **Name Z–A**, **Newest first**, **Oldest first** (by upload) or **Largest first**. Names are sorted "naturally" – "Invoice 2" before "Invoice 10", regardless of upper and lower case. The choice applies to all document tabs and for you on all devices. Files not yet saved are always at the top. In a **post** there is no choice: documents stand **as received** – for an [email](post.md#per-e-mail-ins-dms) in the order of its attachments, otherwise by upload.

## Several at once { #mehrere-auf-einmal }

Every row has a box; **Select all** above the list selects all (and deselects again). With **Shift + click** you select a whole range. For the selection there are then:

- **Download** – downloads the documents one after another under their names. The first time, the browser may ask whether the page may download several files – allow it.
- **Merge** – only for two or more PDFs: appends them to a new PDF (see [Edit PDF](#pdf-bearbeiten)).
- **Delete** – marks them for deletion, as with a single document (see below).

The selection only applies to the tab you are currently in.

## Enclosures { #anlagen }

![Garage invoice with three enclosures in the post](bilder/dokumente-anlagen.png)

Some letters consist of a **main document** and **enclosures**: the garage invoice at the front, behind it the MOT report, the list of work done and the parts order. In Ablago each enclosure is a **PDF (or image) of its own** that belongs to the main document – as **enclosure 1, 2, 3**. In post, in a folder and on *Take over document* the main document is at the top, below it every enclosure as a collapsed row **"Enclosure 1 · MOT report · 2 pages"**. A click shows it in the preview. Wherever documents are listed (bin, email attachments, Workbench), an enclosure carries the mark **Enclosure**.

- **As enclosure to …** – on a document: choose the document it belongs to as the next enclosure (only documents of the same folder). If it has enclosures itself, they come right behind it. You need this for documents uploaded without a [separator sheet](post.md#sammelscan-teilen), or to correct things.
- **Make it a document of its own** – on an enclosure: it stays in the folder and tab but no longer belongs to a document; the others move up.
- **Rename** and **Move up** – the default name "Garage invoice – Enclosure 1.pdf" is only a suggestion; you decide the order.

Every step is recorded in the folder's [history](mappen.md).

**What happens to enclosures:**

- They **go with** their main document: when post is taken over into a folder, when splitting off, into the bin and back out. An enclosure alone cannot be taken over into another folder – make it a document of its own first.
- They are **documents like any other**: with [versions](versionen.md), full text and text recognition, archive version (PDF/A), stamps and the folder's retention. Whoever may see the folder also sees its enclosures; the same rights apply.
- **Recognition, "Where does this belong?" and AI** only read the main document – terms and conditions, price lists and reports do not get in the way of reading out values.
- **Search** also finds text in enclosures; the hit names it with "in enclosure 2".
- **Download** and **passing on** ask **"with enclosures?"** – *yes* is preselected. With enclosures, downloading gives a ZIP file "Garage invoice with enclosures.zip"; in an email every enclosure follows its document. Without the [export right](#ohne-exportrecht) neither works – as with a single document. The folder history records the download for the document and for each enclosure separately (with the route and, where applicable, the name of the API key); when sending, the email with all attachments. If the [original email](post.md#original-e-mail) hangs on it, it is listed below with its label (**Include original email**, preselected) and can be unticked with one click: it contains all attachments of the email.
- In the [drive](laufwerk.md) enclosures come right after their document with the suffix "– Enclosure 1".

## Edit PDF { #pdf-bearbeiten }

Scanned crookedly, one blank back too many, three letters in one scan? You fix that directly in Ablago – without another program.

**Pages** next to a PDF opens the page view below it with a small image of every page. For each page there is:

- **↺ / ↻** – rotate 90 degrees left or right
- **Delete** – the page is dropped (**Keep** brings it back)
- **← / →** – move forwards or backwards. You can also **drag** pages to another place with the mouse, or by keyboard: select the page with Tab, then **Alt + arrow key**.
- **Split from here** – a new part begins with this page

![Editing a PDF's pages: page 2 rotated, a new part from page 3](bilder/pdf-bearbeiten.png)

At the bottom it says what will come out ("3 of 5 pages · 1 rotated · 2 parts"). Only **Apply** saves – immediately, without "Save folder". **Cancel** leaves everything as it was.

What happens on applying:

| What | With versioning | Without versioning |
| --- | --- | --- |
| Rotate, delete, reorder | new **version** of the document; the previous one is kept as an older version | after a confirmation, the result replaces the document; the previous one goes into the [Bin](ablage.md#papierkorb) |
| Splitting in a folder | part 1 becomes the new version ("Scan (part 1).pdf"), the further parts become separate documents in the same tab ("Scan (part 2).pdf" …) | likewise, part 1 after a confirmation |
| Splitting for [post](post.md#sammelscan-teilen) | one **new post** per part – the original post stays unchanged and is completed | likewise |

In **archive mode** versioning is always on – so the original is kept there too. The [full text](#volltext) is created anew for the result, and so is the preview. The folder's history says "PDF edited" with what changed.

**Merge:** choose two or more PDFs with the boxes and click **Merge**. Ablago appends them in the order of the list (sort beforehand if necessary) and files the result as a **new document** in this tab; you can change the name. The original documents stay unless you tick **Put the original documents in the bin**.

Only PDFs can be edited, not images or Word files, and only with the permission "Edit" on the folder. Ablago leaves a PDF with password protection unchanged. Images are available for the first 400 pages; for very long PDFs only the page numbers appear after that.

## Shrink PDF { #pdf-verkleinern }

A scan at 600 dpi or a photo PDF from the phone quickly reaches 20 MB – too large for many email providers (often 10 to 25 MB) and unnecessarily much for storage and backup. **Shrink** next to a PDF (from about 0.5 MB) recalculates the images in it to a sensible resolution and compresses them anew.

![Shrink PDF: three levels with estimated size](bilder/pdf-verkleinern.png)

You choose one of three **levels**; next to each is the estimated size afterwards:

| Level | Images at about | What for |
| --- | --- | --- |
| **Screen** | 100 dpi | reading on screen, sending – the smallest |
| **Standard** (default) | 150 dpi | easily readable and decently printable |
| **Print** | 300 dpi | for printing; only very finely scanned pages get smaller |

- **Save as new version** – the shrunk PDF becomes the document's new [version](#versionen), the original is kept as an older version. Without versioning, the button is called **Shrink and replace**: after a confirmation, the shrunk PDF replaces the previous one, which goes into the [Bin](ablage.md#papierkorb) – as with [Edit PDF](#pdf-bearbeiten).
- **Download shrunk** – only a shrunk copy onto your computer; the document in Ablago stays as it is. This also works with the permission "Read".

Afterwards it says how much it saved, e.g. "shrunk from 18.4 MB to 2.1 MB (−89 %)". The folder's history records it under "PDF edited".

Good to know:

- **Text stays text.** Only the images are recalculated. A text layer (from the scanner or text recognition) stays unchanged, and so does the [full text](#volltext) – text recognition doesn't run again for it.
- **If it saves less than 10 %**, the document stays unchanged, and you get a message. That is normal for PDFs without large images (e.g. invoices straight from a program).
- Black-and-white scans (1 bit) and images with special colours stay as they are – a JPEG would be larger or blurrier there.
- Encrypted PDFs can't be shrunk.
- When **passing on** (email, export, download with stamp) there is additionally the box **Send PDFs shrunk** – see [Share shrunk](versenden.md#verkleinert-weitergeben). The administrator shrinks large PDFs in bulk in the workbench.

## Redact {#schwaerzen}

Before you give a bank statement to the child benefit office, a payslip to the landlord or a receipt to a customer, you want to make some things unrecognisable: account number, salary, health details, other people's names. **Redact** next to a PDF or image (JPEG, PNG) creates a **redacted copy** in which these passages are really missing – not just covered in black.

![Redact: search term and IBAN suggestion, preview of the black areas](bilder/schwaerzen.png)

This is how you choose what turns black:

- **Draw areas** – drag a rectangle over the passage with the mouse (or your finger). **Tapping a word** redacts exactly this word; tapping your own area again removes it. On the phone you switch between drawing and scrolling with **✎ Draw on/off**.
- **Redact everywhere** – enter a search term, e.g. a name or an IBAN, and **Add**: it is redacted on all pages, regardless of upper or lower case and also with or without spaces ("DE89 3704" finds "DE893704"). Next to it, it says how often it occurs.
- **Suggestions** – Ablago itself looks for **IBAN**, **tax ID**, **date of birth** (a date preceded by "geb."), **Email** and **phone** and lists the places found for ticking. This happens on your computer or in Ablago, without the internet. IBAN and tax ID are checked with their check digit; phone numbers can occasionally be off – look through the list.
- **Preview** shows the pages as they will look afterwards. **Show text positions** shows where Ablago has recognised text – so you see whether the text layer lies exactly over the visible text.

With **Save redacted**, a confirmation comes: redacting can't be undone. Afterwards there is a new document **"… (redacted)"** in the same tab; the original stays unchanged in the folder. If [versioning](#versionen) is on for the tab, you can choose **New version** instead – then the unredacted version is kept as an older version and can still be seen by everyone with read permission. For passing on, the copy is usually better.

What happens:

- **All pages** are rebuilt as images (150 dpi), and the areas are filled black in the pixels. Nothing comes along from the original: no text layer underneath, no annotations, form fields, bookmarks, embedded files, author, title or other metadata. Images stay images of the same type, without EXIF data (e.g. location).
- The **text layer** is created anew – without the redacted words. So the copy stays searchable and copyable, just not those passages; the copy's [full text](#volltext) doesn't contain them, and the search doesn't find them there.
- Scanned pages don't get their own text layer. The redacted copy gets its full text like every new document from text recognition – which only sees the redacted copy, not the original.
- A word that an area touches even partly is missing from the text layer entirely.
- The folder's history records "redacted version created" with the number of passages – never the search terms or the redacted text.

Good to know:

- For **scans and photos without a text layer**, Ablago doesn't know the position of the words: there only **drawing areas** works, no search terms and suggestions. For PDFs with text and scanned pages, this applies to the scanned pages.
- Vector text becomes an image in the process – the copy is usually somewhat larger and not quite as sharp as a PDF straight from a program.
- Redacting works with the permission "Edit" on the folder, for at most 300 pages at once (split longer PDFs [beforehand](#pdf-bearbeiten)), not for PDFs with password protection.
- The **original** still contains everything. Pass on the redacted copy – by [Email, export or link](versenden.md).
- **Redacting protects when passing out, not within Ablago:** whoever may read the folder also sees the original (or, with "New version", the older version). If a person in the household shouldn't see the passages, the original belongs in a folder they may not read – or you delete it after redacting.
- **Search terms** also find a word across a hyphenation at the end of a line ("Mül-" / "ler"), with a soft hyphen and in capital letters with "SS" instead of "ß". Still check the preview: wrongly recognised text in a text layer (e.g. from someone else's text recognition) isn't found – there only a drawn area helps.
- If a PDF doesn't state a page's rotation unambiguously, redacting aborts with a message instead of placing boxes next to the words. Then save the PDF once anew (e.g. "Print as PDF") and redact again.

## Full text { #volltext }

So that the [full-text search](ablage.md#im-text-der-dokumente-suchen) finds a document, Ablago reads its text in the background after uploading: for PDFs the text layer; for scans and photos, the package **Text recognition** recognises it. Next to the document it says how far it has got:

| Display | Meaning |
| --- | --- |
| *Full text: waiting* / *running* | The text is being read; it usually takes seconds. |
| *Full text: waiting for text recognition* | The document has no readable text (e.g. a scan or photo); text recognition – a package – is recognising it. For long scans this takes a few minutes; next to it, it says how far it has got. If it says "no package installed", ask your administrator to install the package "Text recognition (German and English)". |
| *Full text: done* | The document is searchable. **Show text** shows what was recognised. |
| *Full text: error* | Something went wrong, e.g. a damaged file. **Try again** starts it once more. |
| *Full text: waiting for package* | Ablago doesn't read the file type itself; a package is on it. Next to it, it says what it is doing: "waiting for conversion (package …)" – it makes a version of the file (e.g. TIFF) from which preview and text are created –, or "waiting for full text (package …)" – it reads the text from the file (e.g. Word, Excel, email). A text from before remains for the search in the meantime. |
| *Full text: skipped* | There is no full text for this file type or this size. If there is a package that can read it (e.g. "Office and email" for Word), its name is shown next to it – ask your administrator. If the package couldn't read the file, its reason is shown, e.g. "Word can't be read: encrypted with a password". |

Next to it, it says **where the text comes from**: "Text from the PDF" (the text layer that e.g. a program or the scanner supplied), "Text recognition by package …" (recognised from the image) or "Full text by package …" (read out of a file such as Word or email). For files Ablago doesn't read itself (e.g. TIFF scans), it additionally says "from the converted version (package …)": a package has made a PDF or image from it, from which preview and text come. **View version** opens this version; the document itself remains the original file. With **Generate again** you have a document's text read and recognised once more – for instance if the recognition was poor.

Recognised text from scans isn't always error-free – the better the original, the better the result.

### Documents in several languages { #mehrere-sprachen }

Not every document is in one language – for instance a German letter from the municipality, followed by a French letter from an embassy, or a package leaflet in German and English. Ablago therefore reads **every page in its language**; text recognition reads a page that has both with both languages at the same time.

Next to the full text, the language with the most text and the others are then shown, for example *Full text: done · 3 pages · German, also contains French*. The [full-text search](ablage.md#im-text-der-dokumente-suchen) thus finds both parts, including inflected words: "Botschaft" as well as "ambassade" or "ambassades".

If the language changes completely in the middle of the document – page 1 German, from page 2 only French –, that is often an enclosed second letter. A [post](post.md) then shows the notice **"A separate letter probably begins from page 2 (the language changes) – split the post?"**:

- **Split post …** opens the [page view](#pdf-bearbeiten) with "Split from here" at this page. Check the pages and click **Apply** – only then are the new posts created. You can also change the suggestion there or **Cancel**.
- **Hide notice** – the notice disappears, for everyone and on all devices. If the document later gets a new full text (e.g. "Generate again"), Ablago checks the change again.

Ablago **never splits by itself**. The notice only exists for PDFs and only if you may edit the post. A page with both languages (such as a German letter with a French paragraph) doesn't count as a change.

How well the languages are recognised depends on the package Text recognition and its languages: German and English are always included; for further languages your administrator installs additional languages (such as "Text recognition – additional language French"). For PDFs with a text layer, Ablago recognises the language per page itself.

## Similar documents { #aehnliche-dokumente }

If your administrator has installed a package such as **AI local – similarity**, **"Similar documents"** appears below a folder's documents: up to five other folders whose documents are similar in content – for example, for the heating engineer's invoice, the folder with the gas boiler's maintenance contract. After each folder are the similar document and how similar it is (in per cent). You only see folders you may read.

The package calculates the similarity from the [full text](#volltext), in Ablago and without data leaving it. If it says "not calculated yet", the package is catching up in the background. Without such a package, the section doesn't exist.

## Versions { #versionen }

Why you no longer have to rename anything to `_v2` or `_final` in Ablago is explained with pictures on the page [Understanding versions](versionen.md). In short:

If **versioning** is switched on for a document tab (an administrator does this), the old edition is kept when replacing:

- **Replace** next to a document uploads a new file as a **new version** – immediately, without "Save folder". Name and file type may change, e.g. `receipt.jpg` → `receipt.pdf`. The folder then only shows the newest version.
- The document shows **Version 3**. A click on it shows all versions with date, who saved them, origin, file name and size. Every older version can be viewed (↗) and downloaded.
- **Restore** takes over an older version as the new, highest version – version 1 becomes e.g. version 4. The previous versions remain.
- The full-text search only finds the current version.
- If the administrator has set **only keep the last … versions**, Ablago deletes older versions beyond that by itself – they can then no longer be restored.
- The folder's history records every new version, e.g. "Version 3 (replaces receipt.jpg)" or "Version 1 restored".

**Same file name when uploading:** if the tab already has a document with the same name, Ablago asks in the list:

- with versioning: save **as a new version** (preselected) or **as a separate document with a counter**, e.g. `Invoice (2).pdf`
- without versioning: **as a separate document with a counter** (preselected) or **delete the old document and upload the new one** – the deletion is permanent

## Archive number { #archivnummer }

If you keep paper originals, the **archive number** connects the paper with the document in Ablago: the sheet gets a sticker with a barcode and number (e.g. `A-000123`), and the document shows the same number. That way you find the paper from the document – and the document from the paper.

- **Enter:** **Archive number** next to the document, type the number or scan it with a hand scanner, **Apply**. It applies immediately, without "Save folder". Afterwards "Archive number A-000123" appears below the name; **change** – also emptying – works there.
- **Every number exists only once.** If another document already has it, Ablago says so and enters nothing – then a wrong sticker is probably stuck on.
- **Find:** type the number into the **search field** of a list and press ++enter++ – or scan the sticker with a hand scanner (it types like a keyboard and presses ++enter++ itself). Ablago opens the folder with the tab and shows the document. If it is a folder you may not see, it continues searching normally.
- The folder's [history](zusammenarbeit.md#historie) records every change of the archive number.

An administrator prints the stickers (Workbench → number sequences → *Archive number*). The number's field belongs to the **document**, not to the folder: a folder can have several papers.

!!! tip "Together with the storage location"
    The [storage location](original.md) says **where** the paper is ("Box 2026"), the archive number **which** sheet. Write on the box which numbers are in it – e.g. "Box 2026: A-000100 to A-000180" – then you find every original in one go.

## Removing { #entfernen }

A click on **Delete** next to a document marks it with "will be deleted on saving". Only **Save folder** deletes it; **Keep** or **Discard changes** brings it back. Files not yet saved you take out of the list again with **Don't upload**.

A deleted document goes on saving with all its versions into the [Bin](ablage.md#papierkorb) – so a wrong click isn't immediately final. There it is listed under **Documents** with the folder and the tab it came from; **Restore** puts it back exactly there. If it has older versions, Ablago asks first and names their number. If you delete a whole folder, its documents go into the bin with it.

If the bin is switched off (workbench), a deleted document is gone for good immediately – the row then says "will be deleted permanently on saving".
