# Bin {#papierkorb}

Deleted folders go into the bin – including documents and links. Individually deleted **documents** too, with all versions and the full text. After the set retention, Ablago deletes them permanently.

- In the **Library**, every user sees under *Bin* only what **they themselves** deleted, and can restore it or delete it permanently. The entry is at the top among the fixed entries below *Favourites* – but only as long as the bin is switched on or something is still in it.
- Under **Workbench → bin** you as an administrator see everything, with "deleted by": in the middle at the top the **retention** with **Empty bin**, below it the deleted folders and documents. If you choose a folder, it appears on the right – there you restore it or delete it permanently.

![Workbench → bin](bilder/werkbank-papierkorb.png)

## Retention { #aufbewahrung }

At the top in the middle under **Retention** you set how many days deleted folders and documents stay (default: 30). Next to it, **Empty bin** empties everything at once. Only removing the [demo data](demo.md) is permanent immediately. Ablago tidies up hourly.

**0 days switches the bin off:** deleting is then permanent immediately, as before version 0.11. What is currently in the bin is deleted permanently on saving – the workbench asks first.

Every user can set under My account that their bin is **emptied on sign-out**.

### History of permanently deleted folders {#historie-endgultig-geloschter-mappen}

Every folder has a **history** (who changed what when). If a folder is deleted permanently, its history stays in the database for a while, so that it can be traced what happened to it. How long you set below under **Keep history of permanently deleted folders** (default: 365 days; 0 deletes it immediately too). The history of living folders always stays – with all kinds of entries, including retrievals; no kind is deleted earlier (#800).

## What applies in the bin {#was-im-papierkorb-gilt}

- Folders in the bin appear nowhere else: not in views, counters, search, link selection or the API.
- They don't block **unique values**: a new folder may get the same invoice number.
- As before, a folder that others still link to can't be deleted in the first place.
- **Restore** brings back documents and links. Links to folders that no longer exist in the meantime are dropped. If a unique value has been taken in the meantime, the folder lands under **To do** for whoever created it.
- **Delete with linked folders** ([User manual](https://help.ablago.app/benutzer/aktuell/en/mappen/#mit-verknupften-mappen-loschen)) puts all folders into the bin as **one operation**. They can be restored together (**Restore all**) – with the links between them (also in a circle) and the links that were removed from folders that stay. Individually works too; then only this one folder's links come back.
- **Post turned into a folder** (#936, #934): if someone creates a new folder from a post or puts it into an existing one, the post's documents, history, notes, tasks and reminders move into the folder, and the empty post goes to the bin – with "Turned into *type* “title”" and a link to the folder ([User manual](https://help.ablago.app/benutzer/aktuell/en/post/#post-auflosen)). It can't be restored (not in the Workbench either); if the folder was newly created, the way back is to delete it. Only someone who may also delete the post can do this (permission *Delete* on the folder type *Post*); otherwise the post stays assigned as before. It is also only assigned via the interface with `kopieren` (the user interface no longer offers "Keep a copy in the post" since #1217), when assigned automatically and for sent emails.
- A folder type can't be deleted as long as folders of it are in the bin.
- Folders of a folder type in [archive mode](archiv.md) stay in the bin until their retention period ends – even if the bin's retention expires earlier. They can't be deleted permanently before that, not even as an administrator.
- The files stay in the file folder until the bin is emptied.
- Every step – into the bin, restored, deleted permanently (by hand, emptied or after expiry) – is recorded in the [deletion log](datenschutz.md#loschprotokoll), without titles and contents.

## Individual documents {#einzelne-dokumente}

- A document deleted from a tab moves into the bin with **all versions** and **full text**. It no longer appears in the folder, in the search or in the API – until it is restored.
- The list shows it under **Documents** with folder, tab, size and who deleted it when.
- **Restore** puts it back into the same tab of the same folder; the folder's history records "Document into the bin" and "Document restored". In the Library, whoever deleted it and may still edit the folder may do this; in the workbench every administrator.
- If the folder itself is in the bin, the folder comes back first; if it no longer exists, the document can only be deleted permanently. If a folder is deleted permanently, its individually deleted documents go too.
- Retention, **Empty bin** and 0 days apply to documents in the same way. [Archive mode](archiv.md) blocks deleting a document beforehand, as before.
- Backup and restore contain the bin; the [full export](export.md) lists the documents in the bin in `papierkorb-dokumente.jsonl`.

!!! note "Permanent immediately"
    **Workbench → Demo data → remove** doesn't go via the bin.

## Users and roles {#benutzer-und-rollen}

Roles go into the bin like other folders; their assignment to users is dropped when deleted.

Whoever deletes an **invitation** (a user who has never signed in) puts their folder into the bin; the user is **deactivated** until then. Only on emptying is the account deleted; **Restore** activates it again.
