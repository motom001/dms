# Folders {#mappen}

A folder collects everything about one thing: the details, the documents and the connections to other folders.

![Open folder with tabs](bilder/ablage.png)

## Structure of a folder {#aufbau-einer-mappe}

At the top is the folder's **title**. You don't have to write it yourself: Ablago puts it together from the details, for example from the invoice number and date – "R-2026-117 of 02.03.2026". If a detail changes, the title changes with it.

Below it are the **index values** every folder has: when and by whom it was created and last changed. Uploaded and removed documents count as changes too, but notes and tasks don't. A click on a name opens that user's folder. With the **star** to the right of the title you remember the folder as a [favourite](ablage.md#favoriten).

Then come the **tabs** – the folder's dividers. There are four kinds:

| Tab | What it contains |
| --- | --- |
| **Details** (e.g. "Contract", "Master data") | fields to fill in |
| **Documents** (e.g. "Contract documents") | uploaded files, see [Documents](dokumente.md) |
| **Links** (e.g. "Invoices") | other folders that link to this folder |
| **History** | who changed what on the folder when, see [History](zusammenarbeit.md#historie) |

After document and link tabs it says how much is in them. A red dot shows on which tab a field isn't right yet.

## Creating a folder {#eine-mappe-anlegen}

1. On the left, choose the view of the folder type, for example *Invoice*.
2. Click **+ New**.
3. Fill in the fields. Fields with **\*** are required. Below some fields there is a hint about what belongs in them.
4. Click **Save folder**.

!!! info "Archive – keep until"
    If a folder shows **Archive · keep until 31.12.YYYY**, it must be kept until then: until that day, neither the folder nor its documents can be deleted; you replace documents as a new version. After that, whoever has the permission may delete it; administrators find all expired folders collected under **Workbench → Retention expired**.

    If it says **Archive · keep, period starts with ‹field›** (for example *Ended on*), the period isn't running yet: the folder is locked while the field is empty – for example for a running contract. Once you enter the date, the period starts; this is recorded in the history.

!!! info "Only matching folders"
    Some link fields only offer certain folders, e.g. for the field *Doctor* only contract partners who are doctors, or for a person only the branches of the chosen organisation. If a chosen folder shows in yellow what it doesn't match – such as "doesn’t match “Organisation”" or "doesn’t match this field’s selection rule" –, it remains valid and you can still save; you can only newly choose what matches. If you may edit the folder, "Note: Branch doesn’t match “Organisation”." also appears above the tabs – a click takes you to the field.

!!! info "Suggested from …"
    Some link fields bring details along: if you choose the *Contract type* "Mobile" for a contract, the usual notice periods are already in empty fields, marked **suggested from Contract type Mobile**. Check them and change whatever is different for you; **Take back** clears the field again. Anything you have already entered always stays. If you choose another contract type before saving, Ablago replaces the suggestions you haven't touched with those of the new one. The same applies with **Fill in from document** and on the page **Take over document**. You only see values you may read.

!!! info "Sequential numbers"
    If a field says "Assigned on saving", the folder automatically gets the next number there when saved, e.g. an invoice number. The number can't be changed afterwards.

![Creating a new invoice](bilder/mappe-neu.png)

If something isn't right – a required field is empty, a number too large, a number already taken –, the reason appears directly at the field, and nothing is saved.

### Fill in from document { #aus-dokument-ausfullen }

If you have a **business card**, a till receipt or a letter in front of you, you don't have to type it out: at the top of the folder (new or existing) there is **Fill in from document** – for some folder types with its own name, e.g. **Scan business card**.

**If the folder already contains a document with text**, the button opens the page [Take over document](post.md#zuordnen): the document in the middle (with several, you choose which one at the top), this folder on the right, **Back to the folder** at the top. Suggestions, coloured frames at the places found, dragging, clicking and selecting work there as for post; you save with **Save folder**. For a new photo or file, **Photo or file …** is next to it – then it works as follows:

1. Tap the button. On the phone, **Take photo** opens the camera directly; **Another photo** adds e.g. the back. On the computer you choose a file – a photo, a PDF or a vCard (`.vcf`). In an existing folder, a document already in it works too.
2. **Recognise details.** Ablago reads the text (offline, without AI) and looks for matching details: name, position, phone, mobile, email, website, address, date, amount, numbers.
3. **Understood – please check and save.** Empty fields are now filled in as a **suggestion**; below it, it says how certain the value is and at which passage of text it was. **Undo** empties the field again. If a field is already filled in, your value stays – below it, **In the document** shows the other value with **Take over**; **Take over all alternatives** does this for all of them.
4. **Links**, e.g. *Organisation* for a person: if the company already exists (recognised by name, website or email domain), it is suggested. If it doesn't exist yet, **Create "Organisation" with these details** creates it after a confirmation.
5. **Save folder.** Only now is anything saved. The photo or file is then in the folder's document tab – unless you have unticked "file in the tab …".

Which fields recognition fills in is set by the administrator on the folder type; it never fills in password fields. If they have chosen a package for it, such as an AI assistant, "Recognised with "…"." appears below the result – even then these are only suggestions. The document's text then goes to the package's AI service – on the home network it stays with you; whether it is a provider your administrator sees at the package's service address. If the package doesn't respond, the built-in recognition takes over, and a sentence tells you so. If something goes wrong (blurry photo, no text), the reason is in the box – try again with more light and the card held straight.

**Business card with a QR code:** many cards carry a QR code with all contact details (vCard). If the administrator has chosen the package **Read QR code**, Ablago takes the details from this code instead of from the recognised text – phone numbers and names are then correct character for character. Below the result, "Recognised with "Read QR code"." appears; the passage names the line from the vCard. The package reads documents that are already in the folder or in a post: so first file the photo of the card (or open the post it arrived in) and then click **Fill in from document** with this document. If the card has no QR code or something else is in it (a web address, a GiroCode), Ablago reads the text as usual, and a sentence tells you so.

### The fields {#die-felder}

| Field | How to enter it |
| --- | --- |
| Text, long text | freely; some texts have a maximum length or must be unique |
| Formatted text | with a toolbar: bold, italic, heading, list, numbered list, quote, link; **@** mentions someone (see below) |
| Number | with a decimal separator, e.g. `12,5` |
| Amount | number and currency, e.g. `98,00 EUR`; a credit note or refund with a minus (`-25,00`) – this works where the field says "Enter it with a minus" |
| Period | number and unit, e.g. `3` and *months* for a notice period |
| Percentage | the number, e.g. `19` or `7,5` – "19%" works too |
| Date | via the calendar or as a date |
| Yes/no | tick the box |
| Choice list | choose a value (or several) from the list |
| Link | search for and choose another folder (see below) |
| Password | type it in; it is stored encrypted (see below) |
| Table | nothing to enter – it shows folders that belong here, such as the items of an invoice (see below) |

Some text fields have a **format**: email, phone, website, IBAN or postcode. On the phone the matching keyboard then appears, and Ablago rejects obviously wrong entries – such as letters in a phone number – with a hint about what to do. Next to an email address, phone number or website there is a button with which you write, call or open the page straight away. An IBAN is shown in groups of four; a German postcode has exactly 5 digits; for other countries you enter the country. Some date fields have limits; a birthday, for example, may not be in the future. What is already saved stays until you change the field.

**Fields that grow with you:** some fields and sections only appear when they fit – if you choose the contract type *Rent*, for example, the section *Rent* appears straight away. If you later choose something else, it disappears again, but the values you entered don’t: in its place it says “Section Rent is hidden – 3 values stay saved · **show**”. A click on *show* brings it back. Hidden fields are not required. This is only tidiness in the form: exports and data access requests contain all values. What is shown when is set by the administration on the folder type.

**Calculated fields:** A package works out some values itself, for example *Cancel by* or the *status* of a contract. You cannot change such fields; underneath it says "calculated by Verträge". Change the details they come from instead (start, term, notice period …) – the package then calculates again. If it says "no longer calculated", the package no longer calculates it; the value stays until the administration releases the field.

**Tables between the fields:** Some folders show a table in the middle of their fields, for example the *items* of an invoice. Each row is a folder of its own; a click opens it. With **+ Item** below the table you add a new one – it opens in a small window and already belongs to this invoice; after saving it appears in the table. With many rows, **Show more** fetches the next 50. On a phone there is a list with the first two columns instead of the table. You only see the rows you may read, and **+ Item** only if you may create such folders. The table does not add up totals; for a new invoice you add items after saving.

![Invoice with the table Items and "+ Item"](bilder/mappe-tabelle.png)

**Notes from packages:** Above the tabs there may be a yellow note from a package, for example "Rechnungen · The items add up to €118.40, the invoice says €120.80". The name of the package is always in front. Such a note never stops you saving; the package removes it again as soon as it no longer applies.

### Formatted text {#formatierter-text}

Some longer texts can be formatted. Above the field there is a small **toolbar**: select text and click **B** (bold), *I* (italic), a heading, a list, a numbered list, a quote or a link. With **Write** and **Preview** you switch between input and the finished view. The field then contains a simple notation, e.g. `**bold**` – that's correct. **Preview** shows what it looks like.

![Formatted text with toolbar](bilder/formatiert.png)

If you type **@** and the first letters of a name, you choose a user. They then get a [task](eingang.md) on this folder.

In lists and in the search, the text appears without formatting.

### Passwords {#passworter}

In a **password field** (e.g. the password of a customer portal), only "••••••••" appears after saving. The **eye** shows the password; Ablago records every display in the folder's history (who, when, which folder – not the password). **Change** takes a new password, **Remove password** deletes it on saving (until then **Undo** works).

![Password field](bilder/passwortfeld.png)

Passwords never appear in the title, in lists or in the search. If the field says "not possible", an administrator hasn't set up a key for passwords yet.

### Linking to other folders { #auf-andere-mappen-verweisen }

A **link** connects two folders – the invoice with its contract, the contract with the contract partner. Type a few letters of the title into the field and choose the matching folder from the suggestions. With the keyboard, **Enter** takes the first suggestion, **Esc** closes the list.

For fields that allow **several links** (e.g. *For invoices* on a payment), you repeat this. The search field stays at the top directly below the label; the chosen folders appear **below it**, each with **Remove**. This is how you choose several entries from a list everywhere, including the folder types in the [advanced search](ablage.md#erweiterte-suche).

If the folder doesn't exist yet, **+ Create …** below the field opens a small window over the page – with header, tabs, fields and save bar like any folder. Drag it aside by its header to see what's behind it. **Save folder** creates the new folder, closes the window and fills it into the field; the folder you are working on stays open and unsaved. **Cancel**, ✕ or **Esc** close the window without changes, and the cursor is back at the field. The entry is only there if you may create folders of this type.

**Fields that follow from another one:** some links follow from another – if you choose the branch for a person, the organisation it belongs to fills in, with "from Branch" below it. That only happens if the field is empty; if another organisation is already there, Ablago asks "Change Organisation?". If you enter a different organisation by hand, Ablago asks whether to clear the branch – with **Keep** it stays and the field shows the yellow notice. Which fields are connected like this is set by the administrator.

**Fields with several folder types:** some fields link to folders of different types – for instance *concerns* on an invoice to the car, the heating, the flat or a contract. The suggestions are then grouped by type (e.g. *Vehicle*, *Flat*), and within each group the folders you opened most recently come first. Next to each chosen folder you see its type with a symbol, so you can tell "Golf" (vehicle) from "Golf" (contract). **+ Create …** is there for every type you may create folders in. If the field says *all of the same type*, Ablago only offers folders of the first folder's type after the first one. Folders you may not see appear, as everywhere, only as "(not visible)" – without title and without type.

A click on a link that has been set opens the other folder.

## Changing {#andern}

Open the folder, change the details and click **Save folder**. As long as something isn't saved, "Unsaved changes" appears at the bottom. **Discard changes** restores the saved state.

If you want to leave the folder with unsaved changes, Ablago asks.

Next to the title are the star for the [favourites](ablage.md#favoriten) and the menu **Folder ▾** (assign task, remind, send by email, export as PDF, copy link). Every folder also has the tabs **Notes** (with a number) and **History** – see [Notes, mentions, history](zusammenarbeit.md) and [Email, PDF and link](versenden.md). On the phone, the row of tabs scrolls horizontally; a shadow at the edge shows that more follow. Menus such as **Folder ▾**, **+ New** and your user menu open on the phone as a sheet from the bottom with large entries; tapping next to it closes it. On the phone, **Delete folder …** is there too. The bar with **Discard** and **Save** only appears on the phone once you have changed something.

Some details are only for reading and have a dashed border – for example name and email address in a user's folder. Next to them it says where they are changed.

### Editing at the same time {#gleichzeitig-bearbeiten}

The same folder may be open in several places at the same time – on the laptop and on the phone, in two windows or for two people in the household. When saving, Ablago only sends the fields you **changed in this window**. Everything else stays as it is currently saved.

**Example:** Lena has the folder "Car insurance" open on her laptop. On her phone she changes the **premium** and saves. Afterwards she changes only the **note** on the laptop and saves. Both are kept – the laptop doesn't set the premium back to the old value, and no question comes.

If you both changed **the same field**, Ablago asks before overwriting anything:

> Jonas changed "Premium" at 17:04 to "412,00 €". You wanted to enter "398,00 €".

For each field choose **Take mine** or **Keep Jonas's value** and click **Save like this**. If it was you yourself on another device, it says **Take the value from here** or **Keep the other value**. Your other changes and those of the others are merged without a question. **Back to editing** doesn't save anything yet – your entries stay. What applied is recorded in the [history](zusammenarbeit.md#historie) like every change.

This applies to all fields, including links and multiple selections (there the whole field counts) and the fields the title is made from. There is no lock ("being edited"); Ablago only asks when two changes really concern the same field. Automatic processes such as automatically assigning post or packages don't reset fields you have changed in the meantime either.

## Translate content { #inhalte-ubersetzen }

If a letter, a note or a field is in another language, press **Show translation** below it – the button appears on long text fields (on single-line ones only from a few words on), on notes and on a document's full text as soon as your library has a translation package. It translates into your language from [My account](profil.md#sprache), only when you press the button.

- **Marked:** Above the translation it says **Machine-translated – not binding** (with the original's language, if known). For long texts you see the progress section by section.
- **Original:** If you move the mouse over the translation or tap it on your phone, the stored original text appears. With the keyboard you reach it via **Show original**. **Back to the original** hides the translation.
- **For reading only:** Only the original is ever stored and edited. The translation can't be taken over as a value; the field still contains the original.
- **Where the text goes:** If the package translates on your library's device, the text doesn't leave it. If your administrator uses a service on the network, the translation says where the text went.
- Only what you may read is translated. If you don't need the button, switch it off under [My account](profil.md#ubersetzung-anzeigen).

## Links { #verknupfungen }

The tab **Links** shows all folders that link to this folder. For the contract partner you thus see their contracts and invoices, for the contract its invoices – without having to enter them there.

![A contract partner's contracts](bilder/verknuepfungen.png)

Depending on the setup, the folders of a group appear as a simple list of titles or as a **table** with columns, such as the invoices with amount, date and *paid*. A click on a row opens the folder.

![A contract partner's invoices as a table](bilder/verknuepfungen-tabelle.png)

With **+ Create …** in the heading of a group you directly create a new folder that already links to this folder – for example a new invoice for this contract.

For a new folder the tab is still empty: links only arise once the folder is saved and others link to it.

### Parts of a folder { #teile }

Some folders always belong to another one – such as the **items** of an invoice. Such **parts** only appear at their **parent folder** (usually as a table with "+ Item"), not in the views, under *Recently opened* or in search. If you search for something that is in an item, you find the invoice; the results list then says "found in Invoice item "3. Drill"". If you open a part directly, **Part of …** is shown at the top with a link back to the parent folder. You create new parts at the parent folder. If you delete it, its parts go with it – and come back with it when you restore it from the Bin. Which folder types are parts is set by your administrator.

!!! info "Belonging or reference"
    Next to every link it says what kind it is. **Belonging** means: belongs to it (the invoice belongs to the contract). **Reference** means: only has to do with it (the invoice comes from this issuer). This helps with evaluations such as "everything about the house", so that not every invoice from the same tradesperson turns up there – and when [deleting with linked folders](#mit-verknupften-mappen-loschen): only what belongs to it is deleted along with it.

## Deleting { #loschen }

At the bottom left of the folder is **Delete folder**. After a confirmation, the folder goes with its documents into the [Bin](ablage.md#papierkorb); there it can be restored for a while. If the bin is switched off, it is gone for good immediately.

In the confirmation you choose the **reason** – *No longer needed*, *Period expired*, *At the request of the data subject* or *Other* – and can add a short remark. Both are recorded in the deletion log, with which your administrator can prove that and why something was deleted; the folder's title and contents are not in it. So don't write any names in the remark.

If deleting isn't possible right now, the button is locked (dimmed, with a padlock), and the reason is given in one sentence next to it. **Why is deleting locked?** expands the detailed reason right at the button:

- **Other folders still link to it.** The explanation lists them – with links there (for many, the first eight and "and … more"). Remove the link there first. That way no contract can disappear that still has invoices. Sent emails and other [post](post.md) don't prevent deleting.
- **Archive mode:** the retention period is still running; before that, the folder can't be deleted by anyone.
- **Permissions:** you may not delete folders of this folder type. An administrator sets this.
- **Parts you may not delete:** if the folder has [parts](#teile), they go with it when you delete it. If you may not delete one of them, everything stays, and Ablago says how many there are.

![Locked button "Delete folder" with a padlock and the expanded explanation](bilder/mappe-loeschen-warum.png)

Users and system roles can't be deleted in the Library at all; the button is missing there.

### Delete with linked folders { #mit-verknupften-mappen-loschen }

If you want to get rid of a folder **with everything attached to it** – such as a contract partner you haven't had anything to do with for years, including contracts, invoices and documents –, use **Folder ▾ → Delete with linked folders …** (at the bottom of the menu, red). If the folder can't be deleted on its own because others still link to it, the same way is also available under **Why is deleting locked?** at the delete button. You need the permission to delete the folder.

![Preview as a tree: what goes along and what stays](bilder/mit-verknuepften-loeschen.png)

1. **Preview as a tree:** Ablago collects all folders that belong to this folder, and the folders that in turn belong to those (contract partner → contracts → invoices → delivery notes …), with the number of their documents. You set the **depth** (default 5 levels); you expand and collapse branches with ▸/▾. Every folder appears only once, even with circles.
    - **Only downwards:** only what links to the deleted folder is deleted along with it. Folders it links to itself (e.g. a category, a storage location or, when deleting an invoice, the contract partner) never belong to it – not even via a folder deleted along with it: an invoice's delivery note goes along, but its link to the contract partner is not followed.
    - **Only via belonging:** only links of the [link kind](begriffe.md#verweisart) **Belonging** lead to deletion (the invoice belongs to the contract). If a folder is only attached via a **reference** – e.g. a contract with this contract partner as *contact person*, post with *For* or *Assigned to* –, it stays; only the link is removed. Ablago doesn't collect what is attached to it.
2. **Markings** per folder:
    - ✅ **will be deleted**.
    - 📎 **only connected via reference** – always stays, only the link is removed (with the field, e.g. "via contact person (reference)"). If you remove the tick, the link stays too – and with it the folder it points to.
    - 🔗 **also attached to other folders** – e.g. an invoice that also links to another contract. Suggestion: **only remove the link, keep the folder**; in the selection field you can choose to **delete it along** instead.
    - 🔒 **retention period still running** ([archive mode](begriffe.md#archivmodus)) – is **never** deleted; next to it, it says from when it may go.
    - ⛔ **no delete permission** – is never deleted.
3. **Selecting:** every folder has a box (default: on). If you remove the tick, it stays. **What stays holds on to what it links to:** if an invoice stays (deselected, locked or without permission), its contract and the contract partner stay too – with the reason why. The same applies if a folder outside the preview (too deep, not visible) still links to it. Links are only removed where you chose "only remove link".
4. **Summary:** at the bottom it says what will happen, e.g. "37 folders and 112 documents will be put in the bin; 3 stay because of the retention period; 2 links will be removed."
5. **Confirm:** to confirm, you type the folder's name.

**Reminder at the end of the period:** if the folder stays because folders below it are still in their retention period, Ablago creates a [reminder](begriffe.md#erinnerung) on it for the day after the latest end of the period – "Müller GmbH can be deleted from 01.01.2032 – run "Delete with linked folders" again". On that day it appears under "To do"; a click opens the folder, and you delete again.

Everything goes into the [Bin](ablage.md#papierkorb) as **one operation**: there, **Restore all** restores all folders and documents together – including the links between them and the links that were removed from folders that stay. The history of every folder says "put in the bin – deleted with linked folders" with the number of folders and documents. If the bin is switched off, deleting is permanent immediately; the confirmation says so.

If the button is missing, folders of this folder type may not be deleted.

## What you may see and change { #was-du-sehen-und-andern-darfst }

An administrator can set per folder type who may create, read, edit and delete folders and see passwords in them – for example, that only the accounts team edits invoices or that confidential folders are only seen by those responsible. What applies to you is shown under My account in [My permissions](profil.md#meine-rechte).

They can also set permissions on every **view**: who **sees** it, who may **create** there with **+ New** and who may **export** from it. But a view never shows you folders you may not read on the folder type.

This is how you notice it:

- **Folders you may not read** don't appear in lists, search, counters and favourites. If a folder links to one of them, it says *Folder not visible* without a link.
- **Without edit permission**, a folder only displays its fields and documents; "Read only" appears at the bottom. Notes and tasks still work.
- **Without delete permission**, "Delete folder" is locked (with a padlock and "Why is deleting locked?"), **without create permission** "+ New" is missing, **without see-passwords permission** the eye on password fields is missing.
- **Without export permission**, the export buttons are missing in a view; views you may not see are missing from the tree.
- If your permissions depend on a field (such as "Responsible") and you would take away your own read or edit permission with a change, Ablago asks before saving.
- When choosing users (responsible, mentions, stand-in, tasks), only those you may see appear.
- You always see your **Bin**; but what you restore from it you only see afterwards if you may read the folder.
