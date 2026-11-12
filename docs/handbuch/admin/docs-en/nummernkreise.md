# Number sequences {#nummernkreise}

A number sequence assigns sequential numbers, e.g. invoice numbers like `202610-R0000001`. You create it under **Workbench → number sequences** and use it in a text field of a folder type.

The search field above the list searches name, identifier and pattern, the folder type and field that use the sequence, and the name of the package ([Searching and filtering](uebersicht.md#suchen-und-filtern)). Number sequences themselves don't belong to a package: the filter **Package** assigns a sequence to the package of the folder type whose field uses it; without such a field it counts as your own.

--8<-- "ausgeblendet-organisation.md"

## How the editor is built { #aufbau-des-editors }

On the right, a saved number sequence is organised like a [folder type](mappentypen.md#aufbau-des-editors): the **jump bar** with **Expand all / Collapse all** at the top, below it the areas **Basic details → Status → Print stickers** (only for the archive number) **→ Used in → Versions** ([who changed what](fassungen.md); counter states are not part of it). Collapsed, each area shows a summary, such as the pattern or the next number; your device remembers what you expand. A new number sequence only has the basic details – without a jump bar.

Only what is in the basic details is saved (**Save number sequence** at the bottom); an error in the pattern marks the basic details red. **Set counter** and **Stickers as PDF** take effect immediately.

![The number sequence “Archive number” on the phone](bilder/werkbank-nummernkreis-handy.png){ width="320" }

## Creating {#anlegen}

| Detail | Meaning |
| --- | --- |
| **Name** | e.g. "Invoice numbers" |
| **Identifier** | e.g. `rechnungsnummer`; fixed after creation |
| **Pattern** | text with placeholders, e.g. `{jjjj}{mm}-R{zaehler:7}` |
| **Start value** | first counter of a period, usually 1 or 0 |

Placeholders in the pattern:

| Placeholder | becomes |
| --- | --- |
| `{jjjj}` / `{jj}` | year, four digits / two digits |
| `{mm}` | month, two digits |
| `{tt}` | day, two digits |
| `{zaehler}` | counter, as long as needed |
| `{zaehler:7}` | counter with leading zeros to 7 digits |

Everything else stays as it is. The date is the day on which the number is assigned (time zone Europe/Berlin).

**When the counter starts again** follows from the pattern: with `{tt}` daily, with `{mm}` monthly, with `{jjjj}` or `{jj}` yearly, without a date never. Every period has its own counter.

A changed pattern only applies to new numbers. The counters are part of the [backup](sicherung.md).

## Using it in the folder type {#im-mappentyp-verwenden}

Enter `{nummernkreis:rechnungsnummer}` in the **default value** of a text field. Then:

- every new folder gets the next number on the **first save** – also via the [interface](api.md). When creating, the form shows "Assigned on saving".
- the field is **read-only**: nobody can change the number, not even via the interface.
- a save that fails (e.g. because a required field is missing) doesn't use up a number. Saving at the same time never results in the same number.
- a deleted folder keeps its number, also in the bin; it is not assigned again.

**Unique** on the field doesn't hurt and is an additional safeguard.

## Status and counter {#stand-und-zahlerstand}

The area *Status* shows the **next number** and the numbers assigned last, *Used in* the fields that use it. With **Set counter** you set the counter of the next number in the current period – for instance when switching from another program. This is recorded in the [log](fehlersuche.md#protokoll).

Deleting only works if no field uses the number sequence any more.

## Assigning numbers retrospectively { #nummern-nachtraglich-vergeben }

Folders that existed before the field got the number sequence have no number. Under **Workbench → Maintenance → Maintenance operations → Assign numbers retrospectively** you choose the field; Ablago shows how many folders are affected and which numbers will result (from … to …), and then assigns them in the order of creation. Today's date applies. The work runs in the background and is recorded in the log.

## Archive numbers and stickers {#archivnummern-und-aufkleber}

The number sequence **Archive number** exists in every Ablago installation. It assigns the numbers for stickers on paper originals (pattern at the start `A-{zaehler:6}`, i.e. `A-000001`). How users enter the number on the document and find it again is described in the User manual under *Documents → Archive number*.

Under **Workbench → number sequences → Archive number → Print stickers**:

1. **Number** (up to 500).
2. **Label format** (A4): 48.5 × 25.4 mm (40 per sheet), 38.1 × 21.2 mm (65 per sheet) or 70 × 37 mm (24 per sheet).
3. **Start at label** – for a partly used sheet: 1 is top left, counted row by row.
4. **Stickers as PDF** downloads the file.

![Print stickers](bilder/werkbank-aufkleber.png)

Every sticker carries a **barcode (Code 128)** with `DMS-ASN:` in front of the number and the number below it for reading. Print at **100 %**, not "fit to page", otherwise the stickers won't fit the labels.

**Printed numbers count as assigned** – even if you don't use the sheet. The range simply keeps counting; gaps are no problem. You may change pattern and start value (e.g. `ASN-{jjjj}-{zaehler:4}`); this number sequence can't be deleted.

The log records who created which numbers when.
