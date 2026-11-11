# Views {#ansichten}

A **view** decides what the Library offers on the left: which folders a list shows and how the views are arranged into a tree. A view is a saved query – users only see the result.

You maintain views under **Workbench → Views**. On the left is the tree, on the right the chosen view. Above the tree, the search field searches name and description, the folder types, the columns of the result list and the fields of the conditions, and the name of the package; the filter **Package** shows only the views of one package or your own ([Searching and filtering](uebersicht.md#suchen-und-filtern)). While you search or filter, the results stand without indentation and without handle – arranging happens in the whole tree. How users work with views is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/ablage/).

![A view with a condition in the workbench](bilder/werkbank-sichten.png)

As with the [Folder type](mappentypen.md#aufbau-des-editors), the editor is divided into areas: **Basics → folder types → Result list → Conditions → Permissions → Test run**. Every area can be collapsed and then shows a short summary, e.g. the parent view, the folder types or "inherits from "House" · 1 own rule". A new view is fully expanded, an existing one starts collapsed; your device remembers what you expand. The jump bar at the top leads to every area and marks areas with errors.

## Basics {#grunddaten}

- **Name** and **description** – appear in the Library on the left and above the list respectively.
- <span id="symbol"></span>**Icon** – a small picture in front of the name so that views are found again faster, also on the phone and on the start page. You choose it from a fixed selection (house, car, money, health, family, post, deadlines …) with a search; **Remove icon** restores "without icon". The supplied view *New post* already has one. Packages can bring an icon; if a package update doesn't change a view, your icon stays as it is.
- **Sits under** – the parent view in the tree, as deep as you like. A view can't sit under itself or one of its subviews.
- **Order** – with **↑ up** and **↓ down** among the views of the same level.
- **Editing at the same time:** If someone else saves the view or moves it under another view while you're editing it, Ablago doesn't overwrite anything and reports "Someone has changed this view in the meantime …". **Discard** loads the new state; then you apply your changes again. Changing the order within a level doesn't disturb an open edit.

### Arranging by drag and drop {#ordnen-per-drag-drop}

It is faster in the tree on the left: every view has a **handle ⠿**. By it you drag it

- **between two views** – a line shows the insertion point, also on another level;
- **onto a view** – the target view is outlined, your view becomes its **subview**.

Subviews move along. A view can't be dragged into its own subview. The new order applies **immediately**, without saving – also in the Library. The fixed entries at the top – *Advanced search*, *To do*, *Favourites* and *Bin* (only while it is on or something is in it) – are not views in this tree.

- **Keyboard:** reach the handle with Tab, then **Alt+↑/↓** moves within the level, **Alt+→** makes the view a subview of the view above, **Alt+←** hangs it one level higher (behind the previous parent view).
- **Smartphone/tablet:** **long-press** the handle, then drag. The buttons ↑/↓ in the opened view still exist.
- **Esc** cancels dragging.

## Folder types {#mappentypen}

The view shows folders of the ticked folder types, provided they meet all conditions. In addition, it **always** shows the folders of its subviews – each with its own conditions, without duplicates.

- A view **without a folder type** only serves for grouping, for instance *Finance* above *Open invoices* and *Payments this year*.
- **All folder types** (tick above the list) shows folders of all folder types, including those added later. This is how the supplied view **Favourites** is built: all folder types and the condition *is my favourite*. It is created once at the start; if you delete it, it doesn't come back (users' favourites stay). In packages this is written `typen: ["*"]`.
- If a view (with subviews) shows **exactly one** folder type, the list behaves as usual: the folder type's result list, sorting by its fields and **+ New**. The button only exists if the user has the permission **C** (create) on the folder type ([permissions](berechtigungen.md)) **and** on the view ([permissions](#berechtigungen)). In views with post it is called **+ Post**.
- If it shows **several** folder types, there is no **+ New**; sorting is possible by the system columns.

## Result list {#trefferliste}

Which columns the list shows you choose under **Result list**. A folder type can have [several result lists](mappentypen.md#trefferlisten), one of which is the default.

- **Without a choice**, the folder type's default list applies.
- With **several** folder types, only result lists that **all** folder types have (same identifier) are offered, and in them only the **common** columns – fields with the same identifier and field kind. *Title* and *Folder type* are then always at the front. If the folder types have no common default, the view shows the system columns (title, folder type, created, changed).
- If the chosen list no longer exists (deleted, or a folder type was added that doesn't have it), the view shows the **default list**. The workbench then says "Result list missing – showing the default list".

## Conditions {#bedingungen}

Conditions apply to the view's own folder types, and **all together** (AND). Below every condition it says how Ablago understands it, e.g. "Cancel by between today and today + 12 months". At the bottom, the **preview** shows how many folders the view would show with the current draft – also before saving.

### On field values {#auf-feldwerte}

| Field kind | Comparisons |
| --- | --- |
| Text | is equal to (ignoring case), contains, is empty, is not empty |
| Long text, formatted text | contains, is empty, is not empty |
| Number, amount, percentage | is equal to, less than, greater than, between, outside of, is empty, is not empty |
| Period | like number; the value to compare is a number and unit (e.g. *greater than 2 months*), compared by length |
| Date | like number, plus **in the period** (year or month) |
| Yes/No | yes, no (empty counts as no) |
| Choice list | is one of, is empty, is not empty |
| Link | points to (one or more specific folders), is empty, is not empty; with [several target types](mappentypen.md#mehrere-zieltypen) also *points to a folder of type …* (one or more of the target types) |

Plus the **system values**: *created on* and *last changed on* (like date) as well as *created by* and *last changed by* (points to a user).

In a view with **several** folder types, only fields that all folder types have with the same identifier and the same field kind (for links also with the same target) are offered, plus the system values.

### Dynamic values {#dynamische-werte}

Instead of a fixed value you can take one that Ablago recalculates **every time it is opened**:

| Value | What for | Example |
| --- | --- | --- |
| **today ± n** days, weeks, months, years | date fields | Cancel by between today and today + 3 months |
| **Year** / **month** (current ± n), with "in the period" | date fields | Payment date in the period current year; invoice date in the last month (− 1) |
| **current user** | links to users, created/changed by | Responsible points to current user → "My contracts" |
| **roles of the current user** | links to roles | Responsible role points to roles of the current user |

That way **one** view "My tasks" can show something different for every user.

### On counts {#auf-anzahlen}

Under **Count** there are – each more than, fewer than or exactly *n*:

- **Documents in total** – all documents of the folder, no matter in which tab. Example: *Folders without a document* = documents in total exactly 0.
- **Links in total** – how many other folders link to this one, over all link fields. Every linking folder counts once, even if it links via several fields; links of the folder to itself and folders in the bin don't count, emails do.
- **Documents in "…"** – documents in a specific documents tab. Example: *Invoices without a receipt* = documents in "Invoice documents" exactly 0.
- **Links in "…"** – folders in a Links tab, counted as in the tab (so only via the sources chosen there). Example: *Contracts without an invoice* = links in "Invoices" exactly 0.

Tabs can be chosen if **all** folder types of the view have a tab with **the same identifier and the same kind** – with one folder type, therefore, all its documents and Links tabs. With several folder types, every tab counts via its own folder type's **own** sources; the name appears as "Invoices / Receipts" if it differs per folder type.

### Deadlines {#fristen}

- **has a deadline in the next n days** – folders where a date field lies within the next n days: either a specific date field or **all date fields that are a deadline** (see [Deadlines](mappentypen.md#fristen-erinnerungen-an-datumsfeldern)). With **only mine**, only deadlines that the signed-in user gets count. That way, for instance, *Contracts with a deadline in the next quarter* (contract + has a deadline in the next 90 days) shows exactly the matching contracts.

### Personal {#personlich}

- **is my favourite** – folders that the **currently signed-in** user has marked with the star. That way, for instance, a view *My important contracts* (contract + is my favourite) shows everyone their own. The fixed view *Favourites* in the Library exists for everyone anyway.

### When a folder type changes {#wenn-sich-ein-mappentyp-andert}

If you remove a field or tab that a condition targets, the view doesn't become empty: the condition is **ignored** until you correct it. In the workbench it is marked red, and the list of views shows "Condition without effect – please check".

## Permissions {#berechtigungen}

With permissions you decide **who sees a view**, **who can create new folders there** and **who can export from it** – for instance so that the view *House* with everything under it only appears in the tree for the parents.

| Permission | Meaning |
|---|---|
| **R** See | The view appears in the Library's tree and can be opened. |
| **C** Create | The view has "+ New". You must additionally be allowed to create on the [Folder type](berechtigungen.md) – both must allow it. |
| **E** Export | **Taking** files and data **along**: downloading documents (also older versions, archive version, via the API), sharing, sending by email, exporting as Excel, CSV, ZIP or PDF and opening via the [WebDAV drive](webdav.md) – everything that gives data out of Ablago. You must additionally be able to read every folder on the folder type. Outside a view (folder, advanced search, drive), a folder may go out if it would be in at least one view with E. |

!!! info "R means viewing, E means taking along"
    With the read permission, users look at folders and documents **in Ablago** – including PDFs and images in the browser. Downloading, sharing, sending, exporting and the drive additionally need **E**. All these ways are checked by the same place; they can't drift apart. Saving while viewing can never be prevented entirely, though: a browser can save or print a displayed page, and a screenshot always works. E doesn't make taking things along impossible, but it doesn't make it easy either.

!!! info "View rules govern the view, not the folders"
    Whether someone may read a **folder** is decided solely by the [permissions on the folder type](berechtigungen.md). A folder from a hidden view can therefore still turn up via the search, another view or a link. Whoever wants to hide folders does so on the folder type. The rules on views don't apply to administrators.

- **Default** – on a top-level view, one row with ✓/✗ per permission; without rules everyone may do everything.
- **Rules** – as on the folder type: *if* the user has a role or is a specific user (each also with *not*), *then* ✓ grant or ✗ withdraw; from top to bottom, with **Stop**. Conditions on fields don't exist on views. Rules can be collapsed and sorted by the handle ⠿.

### Inheritance to subviews {#vererbung-an-unteransichten}

- A subview **inherits** the rules of its parent view and its parents. They are at the top under **Inherited**, read-only and with the name of the view they come from; they can only be changed there.
- **Own rules** of a subview can only **restrict** further (✗). A permission only applies on the subview if it applies on the parent view **and** no own rule withdraws it. A subview has no default of its own.
- **If a subview is hidden for someone, its folders are also missing in the parent view**, and the numbers in the tree match.
- **Moving** (dragging in the tree or changing *Sits under*): the rules of the new parents apply immediately. On dropping, Ablago says whom the view now inherits from. If it moves to the top level, the inherited rules go, and its own default applies again.

### Test run {#testlauf}

Below the permissions you check what a user may do on the view – with the rules as they currently are in the editor, also unsaved and with a changed parent view. You choose the **user** as in a link field of a folder; the result appears immediately. The table shows per view of the chain which rule applied and what the state was afterwards. If you change the user, it is checked again; if you change rules or the parent view, the old result disappears until you click **Check** again – so a result never stands next to a different selection.

### Example: "House" only for the parents {#beispiel-haus-nur-fur-die-eltern}

1. Create a role **Children** and give it to the children.
2. View *House* (top level): rule **Children don't see this** – if *User has role Children* → ✗ R C E.
3. *Heating*, *Garden* etc. under *House* inherit the rule – the whole branch is missing for the children.
4. If the children should see *Garden* after all, put *Garden* on the top level or under another view: subviews can only restrict.

## Views and folder types {#ansichten-und-mappentypen}

- A **new folder type** gets a view of its own – unless you untick **Create its own view in the Library** when creating it. It is at the top of the first level, before *User* and *Role*.
- **Renaming** a folder type renames its own view too, as long as it is still called exactly like it.
- **Deleting** a folder type removes it from all views; a view that only had it and no subviews disappears with it.
- The views from version 0.9 and earlier (one per folder type) were taken over on the update. They have the same address as before, so bookmarks and remembered sort orders stay valid.

## Deleting a view {#ansicht-loschen}

**Delete view** only removes the view, no folders. Its subviews move up one level, into its place. Without a view, folders are still reachable via "To do", links and the search in other views.

!!! info "Views and permissions"
    A view never gives access to folders that a user otherwise couldn't see. Who sees a view, may create there and export from it is at the top under [Permissions](#berechtigungen).

!!! tip "Showing folders without a view"
    The same conditions also work in a [link by folder type and field values](direktlinks.md), e.g. `/ablage/link?typ=rechnung&bezahlt=nein` – without setting up any view at all.
