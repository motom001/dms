# Views and lists {#ansichten-und-listen}

## Views {#ansichten}

On the left are the **views**. At the very top are fixed entries, each with an icon: [Advanced search](#erweiterte-suche), [Start](startseite.md), [To do](eingang.md), [New post](post.md), your [favourites](#favoriten) and the [Bin](#papierkorb) (as long as it is on or something is in it). Below the divider – without icons – are the views an administrator has set up, for example *Contract*, *Invoice*, *Contract partner* or *Notice within the next 12 months*. The number after it says how many folders the view currently shows. The Library doesn't wait for the numbers: until they're there, "…" briefly appears in their place.

A click on a view shows its folders in the list. An administrator can set which views you see; a view that is hidden for you is also missing, together with its folders, from the parent view. You still find folders via the search if you may read them.

![Views as a tree: Finances with sub-views](bilder/sichten-baum.png)

If there are many views, the small field **Search views …** above the list filters by name.

### Choosing a view on the phone {#ansicht-wahlen-am-handy}

On the phone, instead of the list there is a button with the current view, e.g. **View Invoice ▾**. It opens a sheet from the bottom:

- at the top a search field **Search views …** – it filters as you type (including views you have hidden);
- the fixed entries in the same order as on the computer, with icons;
- **My views**: views you have pinned with the star;
- **Recently used**: the last five views you opened (also on the computer);
- then all views by group – one group per top-level view with sub-views (e.g. *Vehicles*, *House*), the rest under *More views*. You expand and collapse groups with a tap; the group of the current view is open. The number on the right says how many folders the view shows.

**Hide views …** at the very bottom: remove the tick for views you rarely need. This only applies to you and only to this selection; the view itself remains for everyone, and you still find it via the search.

The list is also more compact on the phone: the header fits in one line; you search with the magnifier at the top of the header ([Search](#suchen)).

- **Views can have sub-views.** An arrow ▸ in front shows this; a click on it expands or collapses them. Your device remembers what is collapsed.
- **A view with sub-views shows everything together:** *Finances*, for example, shows all open invoices *and* this year's payments.
- **Some views filter:** *Open invoices* only shows invoices that are not yet paid. Ablago recalculates values like "today" or "yourself" every time it is opened – so a view *Notice within the next 12 months* is always up to date.
- **If a view shows several folder types**, *Title* and *Folder type* are in front, and there is no button for creating. You then create new folders in the view of the individual folder type.

Which views exist is set by an administrator. If you'd like one, let them know.

## The list {#die-liste}

The list shows the view's folders, sorted by title. It first loads 100 folders and automatically the next ones when you scroll down.

With **+** and the name of the folder type at the top right, e.g. **+ Invoice**, you create a new folder of this folder type (see [Folders](mappen.md)). If the button is missing, folders of this folder type may not be created in the Library – that is the case for *User*, for example. Exporting and deleting work through the selection (see below); administrators edit the view itself in the Workbench under *Views*.

### Compact or as a table {#kompakt-oder-als-tabelle}

What the list looks like depends on its width:

- **Narrow:** every folder is a compact entry – the first detail in bold, two more below it.
- **Wide:** the list becomes a **table** with one column per detail.

Simply drag the list wider at the handle between list and folder, or collapse the folder with a short click on the handle. When collapsed, a narrow bar with the folder's title remains on the right; a click on it brings it back (see [Adjusting columns](erste-schritte.md#spalten-anpassen)).

![Wide list as a table](bilder/tabelle.png)

Which details appear as columns is set by the administrator – per folder type, and a view can show its own selection (e.g. a short list).

### Sorting { #sortieren }

In the table, a click on a column heading sorts by this column, a second click reverses the order; an arrow in the column heading shows what is sorted by and in which direction. Empty values are always at the end.

Ablago remembers your sorting per view – on all devices. If the list is sorted differently, this is shown next to the number of folders; **Sort by title again** beside it restores the default – also in the narrow list, which has no column headings.

Links and long texts can't be sorted by; these columns have no arrow.

## Search { #suchen }

You search in the **search box at the top, in the header**. It is in the same place on every page of the Library: "Search your library …". The **/** key takes you into it from anywhere (not while you are typing in another field); **Esc** clears it.

- **Enter** shows all hits in the [advanced search](#erweiterte-suche): your term is in the full text there and the hits come straight away – it searches titles and fields, the text of documents and notes of all folders you may read. There you refine further, for example with a folder type or a period. There is only this one list of hits.
- An **archive number** and Enter opens the document directly.

![Search box at the top in a view](bilder/suche.png)

### Searching in a view {#in-einer-ansicht-suchen}

When a view is open, such as *Contracts*, the box at the top shows the scope as a chip **in: Contracts ×**, and it says "Search Contracts …". What you type **filters the list in the middle straight away**. The search finds folders whose **title or details** contain the text entered – upper and lower case don't matter, and neither do umlauts and hyphens: "Gebuhr" finds "Gebühr", "Strasse" finds "Straße", "Kfzversicherung" finds "Kfz-Versicherung".

Above the list it says how many hits there are. If the box is empty, you see all folders again.

- **×** on the chip or **Backspace** in the empty box removes the scope: the box then searches everything again, the list shows everything, and **Enter** leads to the advanced search.
- **Search in ▾** on the right of the box sets what is searched: **Titles and fields** (always), **Text of documents** and **Notes**. Ablago remembers the two ticks for you. Below them, **More filters …** leads to the advanced search with the view's folder type already chosen.
- If you change the view, the box starts empty.

**On the phone** there is only a magnifier at the top. Tapping it opens the box across the full width of the header, with the chip and **Search in**; **×** on the right closes it again.

[Parts of a folder](mappen.md#teile) – such as invoice items – are not in the list themselves: if the term is in a part, you find the parent folder with "found in …", provided you may see both.

### Searching in the text of documents {#im-text-der-dokumente-suchen}

If you tick **Text of documents** under **Search in ▾**, Ablago also searches the text of uploaded documents – in PDFs and, thanks to text recognition, also in scans and photos. Below each hit it says in which document the passage is, with the word found highlighted. Ablago remembers the tick for you.

![Full-text search: hit in a document](bilder/volltext-suche.png)

The full-text search understands word forms in the document's language: "invoices" also finds "invoice", in a German letter "Rechnungen" also "Rechnung" – Ablago recognises the language itself with text recognition. Several words must all occur. It also finds a term **as part of a word**: "oven" finds "ovenproof" and "microwave oven" – without you having to enter an asterisk or similar. This applies to terms of three letters or more.

With quotation marks you only search for **whole words** or an exact phrase, e.g. `"oven"` or `"Musterstadt public utilities"`; a minus excludes a word, e.g. `electricity -gas`.

### Typos and other words {#tippfehler-und-andere-worter}

If the search finds **nothing**, it continues with similarly spelled words from your Library – "washing machien" then finds the washing machine. Above the hits there is a notice about this, plus **Did you mean "washing machine"?** – a click searches for exactly this word. If there are exact hits, you only see those.

If an administrator has set up **synonyms** (e.g. *car, auto, vehicle* – some packages bring such lists), searching for one word also finds the others. With quotation marks or a minus, on the other hand, you search for exactly what you entered.

### Searching in notes {#in-notizen-suchen}

With the tick **Notes** under **Search in ▾**, Ablago also searches the folders' [notes](zusammenarbeit.md#notizen). Below a hit, the passage from the note is then shown.

!!! note "What the search can't do (yet)"
    - It only finds freshly uploaded documents once their text has been recognised – usually after seconds, for long scans after a few minutes (see [Documents](dokumente.md#volltext)).
    - Links are not searched by the name of the other folder: you don't find the local utility's invoices by searching for "utility" in the invoices. Instead, open the utility – its tab *Invoices* shows all of them – or use the [advanced search](#erweiterte-suche).

## Advanced search {#erweiterte-suche}

If you can only roughly describe a folder, the **advanced search** helps. You find it at the very top of the views; **Enter** in the [search box at the top](#suchen) leads here with your term, and so does **More filters …** under **Search in ▾** in a view (then the view's folder type is already chosen).

The search form is **at the top in the middle**, the hits below it; the views stay on the left. As long as you haven't opened a folder, the search uses the full width up to the right edge. When you open a hit, it appears on the right and the middle becomes narrower.

![Advanced search: form at the top in the middle](bilder/erweiterte-suche.png)

**An example:** you are looking for an invoice for an oven. It arrived between March and November last year, probably from Musterstadt Kitchen World, Sommer Electrics or the Nordlicht mail-order company.

1. Under **Folder types**, type "Inv" and choose "Invoice".
2. Choose **+ Condition** → "Invoice date" and enter 01.03. to 30.11. of last year.
3. Choose **+ Condition** → "Contract partner" (or issuer) and there Musterstadt Kitchen World, Sommer Electrics and Nordlicht.
4. Under **Full text**, enter "oven".
5. Click **Search**.

This is how the form works:

- **Folder types**: you choose them in the same way as several folders in a [link field](mappen.md#auf-andere-mappen-verweisen) – type, choose a suggestion (or **Enter** for the first one). The chosen folder types appear **below** the search field, each with **Remove**; the search field stays level with *Full text* next to it. Only folder types you may read are offered. If you choose none, Ablago searches all of them – then there are only the general fields (created on/by, changed on/by). Folder types that the administrators have taken out of the general search (such as pure choice lists like “Contract type”) are then not included; they are listed below the field (“Not included: …”) and are found as soon as you choose them.
- **Conditions**: at first there is no field. With **+ Condition** you choose a field; the fields that **all chosen folder types have in common** are offered. The cross on the right removes the condition again. Each field gets the matching input:
    - **Date**: from–to in one line; either may stay empty. Under **Period …** there are "this year", "last year", "last 12 months", "this month" and "last month".
    - **Number, amount, percentage**: from–to.
    - **Period**: from–to as text, e.g. "1 month" to "6 months"; compared by length.
    - **Link** (e.g. contract partner): several folders – the folder must point to **one of them**. If the field points to folders of different types (e.g. *concerns*), tick below under **points to a folder of type** which types count – for instance all invoices that concern a vehicle.
    - **Choice list**: several values – one of them must match.
    - **Yes/no**: yes, no or either.
    - **Text**: the value contains the text entered.
    - Next to the field name you can choose **is empty** or **is not empty** instead of a value.
- Conditions without input don't apply. **Between fields AND applies, within a field OR.**
- If you change the folder types, values in fields that still exist are kept. For the others, a notice says that they are dropped.

### Full text in documents and notes { #volltext-in-dokumenten-und-notizen }

Under **Full text** you enter a term that should appear in the folder. With the ticks **in titles and fields**, **in documents** and **in notes** (all three preselected) you set where: if the term appears in one of them, the folder counts as a hit. So Enter in the search box at the top finds the same folders as the search in a view – and more. The search in the text understands word forms in the document's language and finds parts of words like the [full-text search](#im-text-der-dokumente-suchen). Below each hit is the passage found.

### The result {#das-ergebnis}

After **Search**, the form collapses. Above the hits there is then the **summary** of the conditions as chips, e.g. "Invoice · Invoice date 01.03.2025–30.11.2025 · "oven" in documents or notes", plus the number of hits. A click on a chip opens the form exactly at this condition; **Change search** opens it fully. The **cross** on a chip removes the condition and searches again straight away – handy if there are no hits. Sorting, selecting several folders and [exporting](#exportieren) work as in a view.

![Advanced search: summary and hits](bilder/erweiterte-suche-treffer.png)

**On the phone** the form is a separate step: first you set the conditions, after **Search** you see the hits. With **Filter** you return to the form – your entries are kept.

The search is in the browser's **address**: back and forward work, you can save it as a bookmark or pass on the link. Whoever opens the link only sees the folders they may read.

On the phone, the form comes first, after **Search** the list of hits; with **← Change search** you return to the form with your entries.

If a package such as **AI local – similarity** is installed and the full text also applies to documents, without further conditions **"Similar results"** appear below the hits as well: folders that don't contain your term but whose document matches it – "invoice for the heating" thus also finds "gas boiler service". They carry the label **similar**; below them is the matching document. More under [Similar documents](dokumente.md#aehnliche-dokumente).

## Selecting several folders { #mehrere-mappen-auswahlen }

In a view's list you select several folders to handle them in one step.

- Tick the box in front of a folder; holding the **Shift** key, the next tick selects everything in between too. In the table, the tick in the header selects all loaded folders.
- As soon as something is selected, an **action bar** appears above the list: "3 of 120 selected", the actions and **Clear selection**.
- **Select all 120** takes all hits of the view – including those not loaded yet, and with your search.
- The selection stays while you open folders; if you change the view or the search, it's gone.
- **On the phone** you hold a folder briefly to start the selection; after that, tapping toggles the tick.

### Deleting several folders {#mehrere-mappen-loschen}

**Delete …** in the action bar asks first, e.g. "Put 12 folders with 30 documents in the bin?", including a [reason](mappen.md#loschen), and then puts them into the [Bin](#papierkorb) – with one entry each in the folder's history. Folders you may not delete or that another folder still links to are skipped; the confirmation says beforehand how many there are, and afterwards each is listed with the reason. If none of the selected folders can be deleted, the button is locked, and the **ⓘ** next to it says why. If selected folders only link to each other, that doesn't stop it.

### Send by email {#per-e-mail-versenden}

**By email …** in the action bar sends the selected folders in **one** email – with their details as PDF and, if you want, their documents. How that works: [Several folders by email](versenden.md#mehrere-mappen-per-e-mail).

### Export { #exportieren }

**Export …** in the action bar passes the selection out of the view – with **Select all …** first, all hits (with your search and sorting):

- **Excel (.xlsx)** – a table in which dates, amounts and percentages are real values: Excel can sort and calculate with them afterwards. A period is written as text ("3 months").
- **CSV** – the same table for any spreadsheet program, in German format (semicolon, date DD.MM.YYYY, amounts with a decimal comma).
- **ZIP with documents** – the table as Excel and CSV and one folder per folder with its documents.
- **PDF** – one page per folder with its fields and the list of documents, optionally with an overview table at the front. PDF documents are then included, images (JPEG, PNG) as a separate page; other files are only named.

As columns you take those of the list or all fields. Links appear with the folder's title. **Passwords are never exported.** Every export is recorded in the log. Whether you may export from a view is set by the administrator; without the permission, the button isn't there. In the advanced search and with **Export as PDF** on a folder, the same applies: only folders you would see in at least one view with the export permission are exported. The export leaves out hits without this permission and names their number.

## Favourites { #favoriten }

You mark folders you need often with the **star** – at the top right of the folder or directly in the list (on the right of the entry or at the front of the table row). The star is filled yellow, and the folder appears in the view **Favourites** at the top among the fixed entries; the number after it shows how many there are. A second click removes it again.

![The view Favourites with an open folder](bilder/favoriten.png)

- Favourites are **personal**: every user has their own. Marking changes neither "last changed" nor the folder's history.
- *Favourites* is a **built-in view** across all folder types with the condition **is my favourite** – like *New post*, it is at the top among the fixed entries. An administrator can rename it like any view, give it columns or delete it; then the simple list of your favourites appears there again.
- If you delete a folder, it disappears from the favourites; if you restore it from the bin, it is a favourite again.
- An administrator can set up views with the condition **is my favourite**, such as *My important contracts*. Everyone sees their own favourites in them.

### Favourites as a subscription { #favoriten-als-abo }

A star also means: **tell me when something happens here.** If someone else changes one of your favourites – fields, documents, notes, tabs or tasks –, you get **one** notification of the kind **Changed** under [To do](eingang.md), such as "3 changes by Anna and Paul since 01.11.". Further changes only count up as long as you haven't seen them. As soon as you open the folder (or click **Done** on the notification), it's gone; the next change brings a new one. Your own changes never notify you.

- **Highlighting:** in all lists, a **dot** appears in front of the title of favourites and of folders you created yourself if others have changed them since you last opened them – like "unread" in your email program. Your own folders are only highlighted; you only get a notification for them if they are also favourites. Above the list it then says "2 changed" with the button **All seen**.
- **Muting:** in the view *Favourites*, below each entry, there is **Notify on changes**. Switch it off for folders you need often but which change constantly – the star stays. If the switch is missing, an administrator has switched off the notification for your role; your setting stays saved.
- **Switching off completely:** under My account → [Notifications](profil.md#benachrichtigungen) – notification and highlighting separately.
- Only those who may read the folder are notified; the notification reveals nothing you may not see. If someone has retrieved an [access copy](https://help.ablago.app/admin/aktuell/en/datenschutz/) for a person whose folder is your favourite, you get a separate notification *Access request* about it – likewise only as long as the notification for this favourite is on.

![Favourites: changed folder with a dot, switch per favourite](bilder/favoriten-geaendert.png){ loading=lazy }

## Opening a folder {#eine-mappe-offnen}

A click on an entry opens the folder on the right. Every folder has its own address – you can save it as a bookmark or send it to another user.

## Bin { #papierkorb }

Deleted folders and individually deleted documents go into the **Bin** below "To do". You only see there what **you** deleted – folders with their documents and links, and below under **Documents** the individually deleted ones with folder and tab.

![Bin](bilder/papierkorb.png)

- **Restore** brings a folder back into its view. If another folder has meanwhile got the same unique value (e.g. the same invoice number), it lands under [To do](eingang.md); there you see what to change.
- **Documents:** *Restore* puts a document with all versions back into the same tab of the same folder – for this you must be allowed to edit the folder. If the folder itself is in the bin, restore the folder first. If a folder is deleted permanently, its individually deleted documents go too.
- **Deleted with linked folders** ([how it works](mappen.md#mit-verknupften-mappen-loschen)): these folders carry the note *with … linked* or *linked*. If you open one of them, **Restore all** brings back the whole operation – including the links that were removed from other folders in the process. **Restore only this one** brings back only that one folder.
- **Post turned into a folder** ([how it works](post.md#post-auflosen)): a post that became a new folder shows "Turned into *Invoice* “…”", with a link to the folder when you open the post. Its documents and history are there; this post can’t be restored. To undo it, delete the new folder.
- **Delete permanently** removes it forever, **Empty bin** all at once – folders and documents.
- **Search and filter:** above the list you search by title or file name and filter by *Kind* (folders or documents), *Folder type* and when deleted (*today*, *in the last 7 days* …).
- **Several at once:** tick the entries or **Select all** (selects everything currently shown). **Restore (n)** and **Delete for good (n)** then apply to all selected ones, one after the other; whatever didn't work stays selected and is listed with the reason above.
- After a period set by the administrator (usually 30 days), Ablago permanently deletes deleted folders by itself. How long is shown above the list.
- Under My account you can set that your bin is **emptied on sign-out**.

If the bin is switched off, it is missing on the left, and deleting is permanent immediately.
