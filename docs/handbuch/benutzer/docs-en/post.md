# Post

Everything that comes into Ablago or goes out is **post**: a scanned letter, an uploaded PDF, an email sent, a scan from the intake folder, an email fetched from a mailbox. So you don't have to look for the right folder and choose the right tab first: file the document as post and **assign it** when you have time.

![New post on the page “Take over document”](bilder/post-zuordnen.png)

## New post {#neue-post}

In the Library, the view **New post** is above the other views (an administrator can move it). It shows all post that nobody has assigned or completed yet. If there is any, the number next to it is highlighted in colour, as with [To do](eingang.md).

### Creating new post – from anywhere {#neue-post-anlegen-von-uberall}

- **Drag files into the window:** drag one or more files **anywhere** into Ablago's browser window, no matter which page. The area **"Drop new documents here"** appears. When you let go, all files go **together into one new post**, which opens straight away.
- **+ New** in the header → **Post**: choose files. On the phone and tablet the entry is called **Post – choose file or photo**; above it is **Photograph post** (see [Capturing post with your phone](#post-erfassen-am-handy)).
- **+ Post** at the top of the views with post does the same.

![Dropping files](bilder/post-ablegen.png)

**Does a file already exist?** Before the post is created, Ablago checks every file. If one is already in a folder you may see, it asks: for each file it says where it is (with a link), and you tick **file anyway** or leave it out. **Continue** creates the post with the remaining files, **Cancel** creates nothing at all, a click on the link takes you to the existing folder.

Ablago takes the subject from the first file name; you can change it at any time. **From** stays empty until you enter the sender – after all, you only captured the letter, you didn't send it (who captured it is shown under "Created" and in the history). The list *New post* then shows "–". The channel is called *Uploaded*. Files over 100 MB or when the storage limit is reached are reported with a reason; the others are filed anyway.

**On an open folder** with a document tab, the area splits: **Into this folder** puts the files into the tab as before (taken over with *Save folder*), **As new post** makes a new post from them.

![Two targets on a folder](bilder/post-ablegen-mappe.png)

The area only appears when dragging files, not text or links, and only if you may create post. With Esc or when you leave the window, it disappears. In maintenance mode and while Ablago can't be reached, a short notice appears instead.

**+ New → folder …** creates a new, empty folder of a folder type you may create.

### Capturing post with your phone { #post-erfassen-am-handy }

The quickest way to photograph letters is **Photograph post** – as a large button at the top of the [home page](startseite.md) and as the first entry under **+ New**. It opens **the camera directly**, without the choice "Photo Library / Take Photo / Choose File".

1. Photograph the first page and confirm the photo.
2. At the bottom, the sheet with the pages taken appears. **Another page** photographs the next page **of the same letter** (e.g. the back). With **×** on a thumbnail you discard a page.
3. **Done – save as post**: all pages become **one PDF** and from it **one post** with the subject "Post from 01.11.2026, 20:52" (instead of "image"). You change the subject later when assigning.
4. **✓ Post saved** – tap **Photograph next receipt** to capture the next letter straight away as a separate post. **Assign now** opens the post, **Done** shows how many receipts you captured; they are under *New post*.

This way you capture several letters one after another without opening a folder – you can assign them later on the computer or via *To do*. If you close the camera without a photo (or accidentally hit the library), the sheet stays open: **Take photo** or **Choose photo from library** – you don't start from the beginning. The phone shrinks every photo before uploading (longest side 2400 pixels); that saves time and space.

**Forgot a page?** In a post, the phone shows **Add page**: the camera opens, and the new pages go **at the end of the PDF** of this post.

**Merging two posts:** if the back ended up as a separate post, open the post with the front and tap **Merge with another post …** (also on the computer). Choose the other post – its pages (PDFs and photos) go at the end of the PDF, and the other post goes into the bin. Files that are neither PDF nor photo can't be appended this way; assign such post instead.

### Into Ablago by email { #per-e-mail-ins-dms }

If your administrator has set up a [mailbox](https://help.ablago.app/admin/aktuell/en/postfaecher/) (e.g. `dms@…`), **you simply forward emails there** – or have invoices sent there right away. Every email becomes new post with the channel *Email*: subject, sender (under *From*) and date from the email, the attachments as documents, the text of the email on the post and, if desired, the whole email as `.eml`.

**Scan to email:** many scanners and multifunction devices send scans by e-mail. Enter the mailbox's address as the target – every scan becomes new post.

### Scanning into the intake folder {#scannen-in-den-eingangsordner}

If your administrator has set up an [Intake folder](https://help.ablago.app/admin/aktuell/en/eingangsordner/), you simply scan into this folder ("Scan to Folder" on the scanner). **Every file becomes a separate new post** with the channel *Folder*; Ablago takes the subject from the file name. If you scan into your own subfolder, e.g. `eingang/thomas/`, the post is **for you** straight away and appears under "To do" for you. The file then disappears from the folder: depending on the setting, it is in `erledigt/` or deleted. What Ablago can't take over (e.g. an empty or too large file) ends up in `fehler/`.

![+ New](bilder/neu-knopf.png)

Under the view **Post** you find all post, including assigned and completed post, with the sub-views **Received** and **Sent**.

## What a post shows {#was-an-einer-post-steht}

| Field | Meaning |
| --- | --- |
| **Subject** | title of the post |
| **Status** | *New* – not yet handled · *Assigned* – belongs to a folder · *Done* – nothing more to do |
| **Channel** | how it came into Ablago: *Uploaded*, *Email*, *Scan*, *Folder*, *Import*, *API*, *WebDAV* |
| **Direction** | *Incoming* or *Outgoing* |
| **Date, From, message** | as far as known; **From** is who sent the post |
| **To** | who in the household the post is for – a person who takes care of it |
| **To (address)** | only for sent emails: the addresses it went to |
| **Assigned to** | the folders the post belongs to |

Ablago sets channel and *Assigned to* itself. You can change everything else as with any folder.

**From** and **To** are called the same as on contracts and invoices (the same keys `von` and `an`). Up to version 0.240 the fields were called **Sender** and **For**.

## To someone { #fur-jemanden }

If you enter a user under **To**, the post appears under [To do](eingang.md) for them with the task **Post for you**. When it is assigned, completed or given to someone else, the task completes itself. If the user is absent, their stand-in gets it.

## Take over document { #zuordnen }

When you click a post in **New post**, the page **Take over document** opens – no matter whether the post was filed, photographed, scanned, emailed or came via the network drive. **Assign …** in a post and [Fill in from document](mappen.md#aus-dokument-ausfullen) in a folder open the same page. It always looks the same:

- **On the left** the usual views, with *New post* highlighted.
- **In the middle** the document; if the post has several, they are shown one below the other. At the top right you browse through *New post* with **‹ Post 1 of 3 ›**. If there is an [archive version](dokumente.md#archivfassung-pdfa) (PDF/A), **Original | PDF/A** appears above the document and the archive version is shown. At the very bottom there is the area **Drag more documents here**: what you drop there (or anywhere in the window, target *Into this post*) is added to this post as a further document.
- **On the right** the folder the document goes into – as everywhere else with type, title (as it will be called after saving), tabs, fields and save bar. The star and **Folder ▾** work after saving.

### Where does this belong? { #wohin-gehort-das }

Above the folder you choose the **folder type**, e.g. *Invoice*. Ablago suggests one and says below it how it recognises it – with a confidence in per cent:

- The name of the folder type appears as a **heading** in the document (say "Invoice" at the top of the letter or in the subject line).
- An **existing folder** that this folder type links to appears in the document – such as the contract number of your maintenance contract on an invoice.
- With an **AI package** that your administrator has set up: a reason and a quote from the document.
- With **Local AI – similarity**: which folder types similar documents you may read are in.

If several folder types come into question, the others are listed under **Also possible:** – one click chooses one of them. If Ablago finds nothing, it shows **Choose folder type …**. **Change** opens the list with a search. Only folder types that can be created from post and in which you may create folders are offered – never users, roles or post. Choosing another type replaces the folder below.

Below that:

- **Keep a copy in the post** – the documents also stay in the post (see below).
- **Put it into an existing folder "…" …** – instead of a new folder, search for an existing one of this type and **Put it into "…"**.
- **Done, without a folder** – for advertising or things already dealt with: the post stays with status *Done*.
- **Open as post** – the post itself, e.g. to change *To* or write a note.

### Taking values from the document { #werte-ubernehmen }

The folder is already filled in: dates, amounts, numbers and links (e.g. the issuer) that Ablago found in the text, plus the post's date. Ablago only suggests the post's subject for the first field of the title, and only if free text belongs there (e.g. *Description* for a contract) – never for a number such as the invoice number. Each value is marked as a **Suggestion** at the field, with how certain it is and where it was found; **Take back** empties the field again. If a link follows from another one (such as the issuer from the contract), it comes along with "from Contract".

- **Frames:** where a recognised value appears in the document, it has a coloured, numbered frame; the same number appears at the field. When you move the mouse over a frame, the field lights up – and the other way round.
- **Drag:** you can drag a frame into any field, including a link field.
- **Choose a field, then click:** click into a field and then on a frame – the field takes the value.
- **Select:** if the document has text (a PDF with text or text from text recognition), you select words with the mouse. The field you chose last takes them; Ablago reads dates and amounts correctly, e.g. "03.11.2026" or "1.284,20 €".

If a folder for a link field is missing, **+ Create …** opens the [window for a new folder](mappen.md#auf-andere-mappen-verweisen) – here already filled with what Ablago recognised in the document, such as name, address and customer number from the letterhead. Dragging, clicking and selecting also work into the window: click into a field of the window and then onto the document. After **Save folder** the new folder is in the field and you carry on with the post.

Below a **link field** you see **How Ablago recognises "…"**, e.g. "Contract number WV-1043" or "Customer number 100-4711 (via contract partner)" – values from fields with *Use to find existing folders*, with frames in the document. If Ablago finds several matching folders, **Also found: "…" take this instead** appears below.

**Does the folder exist already?** If all values used to find an existing folder of the chosen type appear in the document, e.g. the same invoice number, the page warns: "Invoice number R-2026-0815 already exists: "…"". **Put it there instead** puts the post into that folder.

**Several documents:** what was filed in one go is one post and becomes **one** folder; parent folders such as the contract are added as links. If a following document clearly belongs elsewhere, it is preceded by ""…" fits … better" with **Split off from here and put it into "New post" as new post**: this and the following documents go to *New post* as a new post "… (split off)"; the history of both says where they came from.

**Save folder** creates the folder, and the post becomes the folder – see below. The page then shows the next post.

### The post becomes the folder { #post-auflosen }

If you create a folder from a post – or put it into an **existing** one –, the post does not stay behind as a second place to find the documents: it becomes this folder. Before you save, the save bar says so: "When you save, the post’s documents and history move here and the post goes to the Bin." Afterwards:

- The **documents** are in the folder's documents tab.
- The **whole history of the post** is in the folder's [history](zusammenarbeit.md#historie) – receipt, origin (mailbox, inbox folder, filing …), changes, notes and tasks, each marked *from post*. On top comes the entry "Created from post “…”", or "Post “…” moved in" for an existing folder. Notes, tasks and reminders of the post now belong to the folder; the task *Post for you* is done.
- The post itself goes to the [Bin](ablage.md#papierkorb). There it says "Turned into *Invoice* “…”" with a link to the folder. It **can’t be restored** – if the folder was newly created, delete it to undo this. If the Bin is switched off, the empty post is deleted straight away.
- The page then shows the **next post** from *New post*, with a link to the folder at the top; the number next to *New post* goes down by one. If there is no more post, the folder opens.

If only some of the documents go along via the interface (API), the rest go to *New post* as a **new post** – subject with "(split off)", date, *From* and *To* as before, with a link to its origin in its history.

It stays with assigning (the post stays with status *Assigned* and links to the folder):

- if you may **not delete** the post – the save bar says so before you save: "You may not delete the post: it stays and is assigned to this folder." The same applies if only some documents go along and you may not create post; then a notice tells you after saving;
- with **Keep a copy in the post**;
- when [assigned automatically](#automatisch-zugeordnet) – otherwise **Undo** would no longer work;
- for sent emails – they stay as proof of what was sent.

### Suggestions when assigning {#vorschlage-beim-zuordnen}

As soon as a post's text is available (from text recognition, a PDF's text layer or an email's text), Ablago searches it – without AI and without the internet, only with patterns and by matching against your folders. On the page *Take over document* this goes into the folder's suggestions. In the post itself (**Open as post**) it appears in the box **Recognised**:

- **From:** the sender – an organisation (or branch, person) whose customer number, IBAN, email address, website, phone number or name appears in the letter – with a reason, e.g. "found: customer number 100-4711". **Enter under “From”** writes the name into the post's field *From*. If none matches but the letterhead can be recognised reliably (e.g. the small sender line above the address field), it shows **Create as new organisation** – with name and address prefilled.
- **Date** of the letter (not the service period or due date) – **Enter as date of the post** takes it over.
- **Amount** (the total amount) and **numbers** such as customer, invoice or contract number.
- **Outgoing?** If your own organisation or someone in your household is in the sender line, it is probably your own post. Ablago only says so – you change the direction of the post yourself, and Ablago never assigns such post automatically. Ablago never suggests your own organisation as the sender, even if it is in the address field.
- **Credit note:** if "Gutschrift", "Erstattung" or "Rückzahlung" (credit note, refund, repayment) is on the document, the amount arrives in the new folder with a minus sign – where the field allows negative amounts.

What Ablago uses to recognise senders and other folders is set by the folder type: fields where an administrator has set "Use to find existing folders" (the packages *Basis* & co. come with this). If you have just created an organisation or added a customer number, click **Recognise again** in the box. Only folders you may see are suggested.

### Assigned automatically {#automatisch-zugeordnet}

If the recognition is **certain**, Ablago can assign post itself – but only if an administrator has switched this on for the target folder's type (default: off). Certain means: the sender is clearly recognised (e.g. by customer number or IBAN) **and** there is exactly one matching folder of this type – or exactly one whose number (e.g. contract number) appears in the letter. Ablago never creates new folders in doing so.

Afterwards, the task **Assigned automatically to "…" – please check** appears under [To do](eingang.md) – for the person under *To*, otherwise for the person who brought the post into Ablago (if they are absent, their stand-in). The same task appears at the top of the post with two buttons:

- **Fits** confirms the assignment.
- **Undo** takes the documents back into the post, removes the link and sets the status back to *New*. Ablago then no longer assigns this post by itself.

Why it was assigned ("Sender … clearly recognised (customer number 100-4711), only matching folder …") is shown in the box **Recognised** and in the [history](zusammenarbeit.md#historie) of the post and the folder. Post whose recipient may not read the target folder and post to folder types in archive mode are never assigned automatically.

### Keep a copy in the post {#kopie-in-der-post-behalten}

**Keep a copy in the post** (under *Where does this belong?*) additionally leaves the documents in the post. That costs no space, because Ablago stores every file only once. This is handy when a letter belongs to **several** folders, e.g. to the invoice and the contract. The post is then not [turned into the folder](#post-auflosen), only assigned, and you can assign it to a further folder via **Assign …**.

It also works without assigning: **Done, without a folder** for advertising or things already dealt with; in the post itself (**Open as post**) there are **Done** and **New again** if there is something to do after all. You delete unnecessary post like any folder.

### Blank pages { #leerseiten }

![Page strip with blank pages on the page “Take over document”](bilder/post-leerseiten.png)

Letters scanned on both sides often have blank backs. If the package **Leerseiten** is installed (an administrator sets that up), it checks every page of new post and marks blank pages. On the page *Take over document* a line like **"3 blank pages detected · 3 left out when filing"** then appears above the document, and to the left of the pages a **page strip** with small pictures of all pages (on a phone horizontally above the document). The marked pages are faded and say **"Blank page – left out when filing"**.

- **Keep after all:** the page is not blank after all, say because of a pencil note? Then it stays.
- **Leave out too:** a page the package did not mark should go anyway – e.g. a cover sheet.

This applies at once, but nothing is deleted yet. Only when you take the post over into a folder is the document created there **without** these pages. The original PDF stays as an **earlier version** of the document (as with [Edit PDF](dokumente.md#pdf-bearbeiten)), the folder's history says "3 blank pages removed", and text recognition, archive version and recognition work with the version without blank pages. Nothing is left out:

- as long as the post stays post – even with *Done, without a folder* everything stays as it is;
- with [automatic assignment](#automatisch-zugeordnet) – nobody has looked yet;
- if all pages are marked – a document never disappears completely.

In the post itself (**Open as post**) the same strip appears below the document.

## Splitting a batch scan {#sammelscan-teilen}

If you scanned several letters at once, they arrive as **one post** with a long PDF. This is how you make separate posts from it:

1. Open the post and the tab with the PDF.
2. Next to the PDF, click **Pages**.
3. At the first page of each further letter, click **Split from here**. You can **delete** blank backs straight away and **rotate** crooked pages.
4. **Apply** and confirm the question.

For each part, a **new post** with status *New* is created: subject "Batch scan (part 1)", "Batch scan (part 2)" …, date, “From” and “To” as in the original post. You can then [assign](#zuordnen) each one as usual. The original post keeps the whole PDF, is *Done* and links to the new ones under "Assigned to" – nothing is lost. At the top there is a notice with links to the new posts.

It also works the other way round: if two posts belong together (e.g. front and back scanned separately), open the first one, choose its PDFs and **Merge** – see [Edit PDF](dokumente.md#pdf-bearbeiten). Via the interface (API), a program can also merge PDFs from several posts; a post that becomes empty as a result is completed.

## Emails sent { #versendete-e-mails }

When you send a folder [by email](versenden.md), Ablago files the email as post: channel *Email*, direction *Outgoing*, status *Done*, assigned to the folder. Subject, recipients (under *To (address)*), sender (under *From*), date and message stay as they were sent. You can change status and *To*.

If a folder is deleted, the post is kept. Only the link to this folder is removed.

## Who may do what? {#wer-darf-was}

Who sees, creates, edits and deletes post is governed by the [permissions](mappen.md#was-du-sehen-und-andern-darfst) of the folder type *Post*. To assign, you need the permission to edit the post **and** the target folder. For the post to [become](#post-auflosen) the folder – a new or an existing one –, you also need the permission to delete the post. To **split off** documents you need the permission to create post.
