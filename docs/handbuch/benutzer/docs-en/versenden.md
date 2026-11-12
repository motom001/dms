# Email, PDF, link and stamp {#e-mail-pdf-link-und-stempel}

To the right of a folder's title, next to the star, is the menu **Folder ▾** (formerly "Actions").

![The folder menu](bilder/aktionen.png)

## Send by email {#per-e-mail-versenden}

1. **Folder ▾ → Send by email**.
2. Under **To**, enter one or more addresses (separated by commas).
3. Check the **subject** – folder type and title are suggested – and write a **message** if needed.
4. Under **Attachments**, choose which documents of the folder go along. Below it, it says how large they are together; from 20 MB Ablago warns, because many mail servers don't accept larger emails; more than 50 MB cannot be sent.
5. **Send**.

If the [original email](post.md#original-e-mail) hangs on a document, it is listed with its label and goes along – one click on its box unticks it. **The original email contains all attachments of the email. If not all of them belong in this folder, free it first or delete it.**

![Email from a folder](bilder/email.png)

The sender is Ablago's address; the recipient's **replies** go to your email address.

Ablago files every email sent as [post](post.md#versendete-e-mails) – with recipients, subject, message, date and the attachments, assigned to the folder it came from. You find it under **Post → Sent**. The folder's [history](zusammenarbeit.md#historie) lists it with a link. The attachments don't take up any extra storage space.

If it says "Sending email is not set up", an administrator first has to set it up in the workbench.

Sending passes data out of Ablago like an export or a download. That's why **Send by email** and **Export as PDF** are only available for folders you see in at least one view with the export permission. If both are missing from the menu, the administrator hasn't given you this permission – then you can't download the documents either (see [Without the export permission](dokumente.md#ohne-exportrecht)).

## Several folders by email {#mehrere-mappen-per-e-mail}

All receipts of a year to the tax adviser, the car documents to the insurance: that works in **one** e-mail.

1. Select the folders in a view – with the boxes in the list or **Select all …** (see [Selecting several folders](ablage.md#mehrere-mappen-auswahlen)).
2. In the bar above the list: **By email …**.
3. **To**, **Subject** and **Message** as for one folder.
4. Under **Attachments** you choose:
    - **Details per folder as PDF** – one file "Title.pdf" per folder with all fields (never passwords). Preselected. If the folder type requires a stamp, this PDF is stamped too.
    - **Documents:** **all** documents of the folders, **none** or **Choose …** – then the documents are listed per folder with boxes. With **all**, an [original email](post.md#original-e-mail) is listed below with its own box **Include original email**.
5. **Send**.

Below it, it again says how large the attachments are together (warning from 20 MB, at most 50 MB – the PDFs with the details count too). The same rules as for one folder apply to stamps, archive versions and shrinking. At most 100 folders fit in one e-mail.

Afterwards there is **one** [post](post.md#versendete-e-mails) under **Post → Sent**. Under "Assigned to" it links to all folders sent and contains what was sent – the documents and the PDFs with the details. The [history](zusammenarbeit.md#historie) of **every** folder sent lists the email with a link.

The permission is the same as for a single folder: you must see **every** folder in a view with the export permission. If it is missing for one, Ablago sends nothing at all and says for how many folders it is missing – there is no email with silent gaps. That's why the button **By email …** only exists in views you may export from.

## Sharing with a stamp {#weitergeben-mit-stempel}

A copy of your ID for the landlord, documents for the property management, an offer as a "Draft": when sharing, Ablago can put a **stamp** or a **watermark** on the copy – for instance "Copy for Müller Property Management – 01.11.2026". That way it is clear for whom and for what the copy is intended, and misuse is made harder.

**The stored original always stays unchanged.** The stamp is only created in the copy that Ablago passes out.

The stamp is available in three places:

- **Download:** in the list of documents, next to **Download**, the button **With stamp …**.
- **Send by email** (one or several folders): below the attachments, the box **With stamp**.
- **Export** as ZIP or PDF: in the export dialog, the box **With stamp**.

In all these places you can additionally [share PDFs shrunk](#verkleinert-weitergeben).

![Download with stamp](bilder/stempel-herunterladen.png)

This is how you do it:

1. Choose a **template**, e.g. "Copy for …", "Only for presentation to …", "Draft" or "Confidential". The administrator sets the templates.
2. Enter the **recipient** – they appear where `{empfänger}` is in the text. When sending by email without this, the addresses under **To** are the recipient.
3. If needed, change the **text** (also multi-line), the **position** (diagonally across the page as a watermark, header, footer, top right corner or a small **stamp** with a frame), the **opacity** and whether the stamp goes on **all pages** or **only the first**. From 80 % opacity, Ablago points out that the stamp may cover content.
4. **Like ink – text underneath stays readable** (usually already switched on): the stamp only tints, black stays black – so amounts and dates underneath stay readable. You add page numbers and the archive number as placeholders in the text, e.g. "Page {seite} of {seiten}" or "{archivnummer}".
5. **Download** (or **Send**, **Export**).

Placeholders in the text:

| Placeholder | becomes |
| --- | --- |
| `{datum}` | today's date, e.g. 01.11.2026 |
| `{empfänger}` | the recipient you enter |
| `{benutzer}` | your name |
| `{mappe}` | the folder's title |
| `{seite}` | number of the page the stamp is on |
| `{seiten}` | number of pages of the document |
| `{archivnummer}` | the document's archive number (empty if it has none) |

Good to know:

- **PDFs** and **images** (JPEG, PNG) can be stamped. An image becomes a PDF with one page ("ID.jpg" → "ID.pdf"). Other files (e.g. Word) go along unstamped when sending and in the export; downloading them individually with a stamp is not possible.
- Encrypted PDFs cannot be stamped.
- The folder's [history](zusammenarbeit.md#historie) records every sharing with a stamp, e.g. "shared: with stamp "Copy for Müller Property Management – 01.11.2026" to Müller Property Management (downloaded: ID.pdf)". That way you can later prove who received which copy. For emails, the stamp is noted in the email's entry; the stamped copy is in the [post](post.md#versendete-e-mails).
- **Suggestion and requirement:** for some folder types the administrator suggests a stamp – then **With stamp** is already ticked. If the stamp is **required**, it can't be deselected: documents of this folder type are then only available via **Download with stamp**; downloading several documents at once is switched off there.
- **Viewing** in Ablago always shows the original.

!!! note "How safe is the stamp?"
    The stamp is drawn as content of the page, not as a comment or annotation that can be deleted with one click. It sits in the same content as the rest of the page's text. Anyone familiar with PDF tools can still remove it – a stamp is a clear sign and makes misuse harder, but it is no copy protection. So only send what the recipient really needs.

## Share shrunk { #verkleinert-weitergeben }

Many email providers don't accept attachments over 10 to 25 MB. When sending by email (one or several folders), when **exporting** as ZIP or PDF and when **downloading with a stamp**, there is therefore the box **Send PDFs shrunk** (or *export*, *download*) with the level **Screen**, **Standard** (default) or **Print** – the same levels as for [Shrink PDF](dokumente.md#pdf-verkleinern).

- Only the **copy** that goes out is shrunk. **The stored document stays unchanged.**
- Only PDFs are shrunk; images and other files go along unchanged. If it saves less than 10 % for a PDF, the original goes.
- With a stamp, it is **shrunk first, then stamped** – the stamp stays sharp.
- The size of the attachments shown is that before shrinking; whether the email is small enough afterwards, Ablago checks when sending. If the box is ticked, the selection may therefore be larger than 50 MB.
- The [history](zusammenarbeit.md#historie) records it, e.g. "shared: shrunk (18.4 MB → 2.1 MB) (downloaded: Scan.pdf)" or "…, shrunk (…)" in the email's entry. The shrunk copy is in the [post](post.md#versendete-e-mails).

## Export as PDF {#als-pdf-exportieren}

**Folder ▾ → Export as PDF** opens the browser's print dialog with the folder's **print view**: title, all details, the list of documents and the notes. As the printer, choose **Save as PDF** (or "Microsoft Print to PDF" on Windows) – or print it straight onto paper.

Passwords only appear as "••••••••" there too.

## Letter from template { #brief-aus-vorlage }

For letters that always look the same – a **cancellation**, for instance – packages bring **text templates**, e.g. the Contracts package on every contract type. **Folder ▾ → Letter from template …** shows the templates that fit this folder: on the folder itself and on folders it refers to (for a contract, on its contract type).

- **See what is missing first:** The dialog shows letterhead and recipient and the details that are still missing, e.g. "2 details are missing: Contract number, Customer number". Clicking a detail jumps to the field in the folder. You can also create the letter anyway – it then shows a visible gap such as **[Contract number]**.
- **File as document** puts the letter as a PDF into the chosen tab of the folder (without a choice, into the "Documents" tab), next to it the filled-in text as `.md`. This needs the right to edit the folder. The template itself stays as it is.
- **Download PDF** only gives you the PDF. Like downloading a document, this is [sharing](#weitergeben-mit-stempel) and needs the export right (E) in a view that shows the folder.

**What the letter looks like:** A4, laid out similar to DIN 5008 – the **letterhead** top right, below it the small sender line and the **address** (fits window envelopes), on the right **place and date**, then the **subject** in bold and the text. The letterhead comes from the person or organisation in the *Customer* field (key `an`) – if it is empty, from your [own organisation](https://help.ablago.app/admin/aktuell/en/organisation/) (only name, address, phone and email). The address comes from the folder in the *Provider* or *Issuer* field (key `von`). Dates and amounts use the format of the template's language, e.g. 31.12.2026 and 650,00 € for German. The PDF is tagged (headings, paragraphs, lists in reading order, language and title) so screen readers can read it well. The font is Noto Sans: names such as “Şahin”, “Łódź” or “Nguyễn” and Greek or Cyrillic letters appear correctly in the letter – just as in the stamp, the export and on labels. Characters the font doesn't know (e.g. Arabic, Chinese, emoji) appear as “�”.

**Only what you may see:** Only details you are allowed to read are filled in. If, say, you may not see the provider's organisation, its address and customer number stay gaps. **Passwords** never go into a letter. Values appear exactly as they are in the folder – asterisks or curly brackets in a field do not turn into formatting.

You can also write your own templates: as a Markdown file (`.md`) in the **Templates** tab of a folder your folders refer to (e.g. a contract type). The developer handbook explains placeholders under [Text templates](https://help.ablago.app/entwickler/aktuell/en/pakete/#text-vorlagen-schreiben).

## Actions from packages { #aktionen-von-paketen }

Packages can add their own entries to the **Folder ▾** menu, e.g. **Add template** on a contract (Contracts package) or **Mark as paid** on an invoice. You can recognise them by the package icon and the package name after them; they appear below the built-in entries.

- **Only what you may do:** An action is only in the menu if you have exactly the rights it needs on this folder – "Export as XML" works without edit rights, "Mark as paid" does not.
- **Locked with a reason:** If the folder still lacks something, the action is greyed out with the reason below it, e.g. "Choose a contract type first".
- **The package's dialog:** If the package asks for something (at most twice), a sheet with a dashed border and **"Action from …"** in its header appears – so you always see which package is asking. A package **never asks for your password** there; if it seems to, something is wrong.
- **Result:** Afterwards you see what happened, e.g. "Cancellation added as a document", with **Open document** or **Download**. Downloading is [sharing](#weitergeben-mit-stempel) and needs the export right (E); a mandatory stamp of the folder type applies here too.
- **Traceable:** Every run is listed in the folder's **history** – with you and the package.

The package acts on your behalf: it can never do more than you can do with the folder yourself, and never more than it announced when it was installed. If a package is not responding, you see "The package … is not responding right now" – try again later.

**Add template** (Contracts package) opens [Letter from template](#brief-aus-vorlage) with the package's templates – styled like a package action.

## Copy link {#link-kopieren}

**Folder ▾ → Copy link** puts a link to the folder on the clipboard, which you can send by email or chat to someone with their own access to Ablago. The link doesn't name the folder by a number but by its details, e.g.

```
http://nas.home.arpa:8080/ablage/link?typ=vertrag&vertragsnummer=SV-4711
```

![Link copied](bilder/link-kopieren.png)

- Ablago uses a detail for this that exists only once (e.g. the contract number). If there is none, it uses the details the title is made from. If several folders then match, the link shows the list and opens the first one.
- If copying isn't possible (some browsers don't allow it without HTTPS), the link is shown for selecting.
- Whoever opens the link and isn't signed in signs in and then lands directly at the folder.
- If the menu item is missing, the folder has no detail from which a link can be built. The address in the browser always works.

You can also write such links yourself, for instance for "all open invoices". How is described in the [Administrator manual](https://help.ablago.app/admin/aktuell/en/direktlinks/).
