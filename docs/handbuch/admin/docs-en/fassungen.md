# Versions: who changed what?

Every save in the Workbench creates a **version** – for **folder types** (with their permission rules, the stamp and recognition on the type), **views** (with permissions), **number sequences**, **stamp templates**, **mailboxes**, the **settings of a package**, **automations** and **automation templates**. Each version says **when** it was saved, **who** it was and **what** changed – in sentences, not technical data:

> Field “Notice period” added · “Amount” is no longer required · Results list “Standard”: column “Place” removed

So you can see why a view suddenly looks different, compare two states and bring back an earlier one.

![“Versions” section of the folder type “Post”: the first version by Ablago, the second by the administrator, expanded](bilder/werkbank-fassungen.png)

## Where to find them { #wo }

At the bottom of the editor of each of these entries there is the **Versions** section – in the [jump bar](mappentypen.md#aufbau-des-editors) like all other sections, collapsed with a short summary (“5 versions · last 12/11/26, 10:14, Markus”). A new entry only has it once it has been created. For the settings of a package it sits below the status.

One line per version, like the history of a folder: date and time, who, the first changes; the newest is marked **Current**. Expanded, it shows all changes and the buttons **Select for comparison** and **Restore this version**.

## Who saved { #wer }

| It says | Meaning |
| --- | --- |
| a name, e.g. **Markus** | someone saved in the Workbench (also via the `dms` command) |
| **Package Household 1.4.0 (by Markus)** | the package changed something while being installed, updated or removed; Markus started it |
| **Package Household 1.4.0** | the package itself, via its service account |
| **Automation “…”** | an automation |
| **Update to Ablago 0.255.0** | at start-up after an update – Ablago changed something along the way |
| **Ablago** | Ablago itself, e.g. it paused an automation because its field is missing |

The first version of an entry that existed before versions were introduced is called **First version – as it was before versions were introduced**; it carries the update that brought versions.

## Combining { #zusammenfassen }

So that not every small save becomes a version of its own: if **the same person saves the same entry again within 10 minutes** of the start of their last version, Ablago continues that version (“Saved from 10:04 to 10:12”). This is measured from the start, not from the last save – someone working on an entry for an hour leaves several versions. What one operation saves in several steps (such as installing a package) is always one version. A restore is never combined. Saving without a change creates no version, and changing something and taking it straight back leaves none either.

## Comparing { #vergleichen }

**Select for comparison** on two versions: above the list it then says what changed **from the older to the newer one** – across several versions too. **Close comparison** clears the selection.

## Restoring { #wiederherstellen }

**Restore this version** asks first and tells you **what changes compared with now** and **what to look out for**, for example:

- “Field ‘Serial number’ is removed – 3 folders have a value there.” (The values stay stored in the folders but are no longer visible.)
- “2 folders will no longer match the folder type.” (Their creators get a to do, as with a normal save.)
- “Tab ‘Receipts’ is removed – it holds 4 documents.” (Then restoring only works once the tab is empty.)

Restoring goes through the **normal save**: the same checks and questions apply (e.g. “Afterwards nobody could read folders any more”). The result is **a new version** (“Version 2 restored”) – the state before stays, nothing is lost.

If someone else has saved in the meantime, Ablago restores nothing and shows the new list – look at the newest version and then decide. Secrets (the password of a mailbox, secret settings of a package) are never part of a version; when restoring, the current ones stay.

## Deleted entries { #geloescht }

Versions stay as long as the entry exists. If you delete it, its **last version with a deletion note** (when, who) remains – as a record, for example for the [procedure documentation](verfahrensdokumentation.md). Below the list of folder types, views, number sequences, stamp templates, mailboxes, automations and automation templates it then says **Deleted: 2 entries**; expanded with name, time and person. A deleted entry cannot be restored from there.

## Permissions, export and backup { #rechte }

- Whoever may administer the **area** can see, compare and restore its versions ([Who may administer Ablago?](verwalten.md)) – the versions of a folder type, for example, whoever may administer folder types. Deleted entries are only shown from the areas you administer.
- The [full export](export.md) contains all versions including deletion notes in `struktur/fassungen.json`. The list in the editor shows the newest 50.
- The [backup](sicherung.md) includes the versions. Older backups without versions can still be restored; automations and automation templates bring their earlier change history along as versions.
