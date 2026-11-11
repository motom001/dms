# Folder types {#mappentypen}

A **folder type** decides which kind of folder exists – *Contract*, *Invoice*, *Insurance*, *Appliance* … – and what goes in it. A new folder type gets a view of its own in the Library; this can be deselected when creating it (see [Basics](#grunddaten)).

You maintain folder types under **Workbench → Folder types**. With **+ New** you create one; a click on an existing one opens it for editing.

![Folder type Contract in the Workbench](bilder/werkbank-mappentyp.png)

How users work with the folders is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/mappen/).

## How the editor is built {#aufbau-des-editors}

The editor is built in the order in which you create a folder type: **Basics → Fields → Title → Result lists → Tabs → Archive mode → Stamp when handing over → Recognition → Permissions → Test run → Packages → AI services**.

- Every area can be **expanded and collapsed** with a click on its heading. Collapsed, it shows the essentials in one line, e.g. "8 fields, 2 required, 1 deadline", the title template with an example or "Default: R · 3 rules".
- A **new** folder type is fully expanded, an **existing** one starts collapsed. Your device remembers per folder type what you expand or collapse.
- The **jump bar** at the top leads to every area and expands it; **Expand all** or **Collapse all** switches all at once.
- Areas with an **error** are marked red in the jump bar and at the edge. An unknown placeholder in the title or an incomplete rule is noticed while typing; what is only noticed on saving expands its area by itself.
- **Editing at the same time:** If someone else saves the folder type while you're editing it, Ablago doesn't overwrite anything. It reports "Someone has changed this folder type in the meantime …"; **Discard** loads the new state, then you apply your changes again. Without changes of your own, the editor shows the new state by itself.

## Basics {#grunddaten}

- **Name** – this is what the view in the Library is called, e.g. "Contract". It can be changed at any time.
- **Key** – a fixed, technical name, e.g. `vertrag`. It is suggested from the name, can be changed when creating and is **fixed** after the first save. [Links via folder type and field values](direktlinks.md) and scripts via the [interface](api.md) can use it – so they stay valid even if the folder type is renamed. The system types are called `benutzer`, `rolle` and `post` (up to 0.40, *Post* was still *E-Mail* with the key `email`). Folder types from [packages](pakete.md) have the identifier `package:key`, e.g. `basis:person` (up to 0.228 `basis_person`, #1084); your own folder types one without a colon, at most 60 characters.
- **Description** – is shown above the list and helps with classification.
- **Can be created from post** – then the folder type can be chosen when someone takes over a document from the post and is asked: *Where does this belong?* More under [Taking over documents](#dokument-ubernehmen).
- **How to recognise it** – a short sentence, at most 300 characters. More under [Taking over documents](#dokument-ubernehmen).
- **Is part of another folder** – folders of this type always belong to another folder, e.g. invoice items to their invoice, and only appear there. More under [Is part of another folder](#ist-teil-einer-anderen-mappe).

When **creating** there is additionally **Create its own view in the Library** (on by default): then the new folder type appears in the Library as a view of its own. Deselect it if its folders should only appear in an existing [view](sichten.md).

Who may create or delete folders is governed by the [permissions](berechtigungen.md) (permissions C and D). The former ticks *Allow new folders* and *Allow deleting* no longer exist since version 0.32; they were taken over into the permissions on the update.

### Taking over documents {#dokument-ubernehmen}

Post first lands under *Post*. From there, a document is taken over into a folder. Two entries in the basics tell Ablago which folder types are possible for this:

- **Can be created from post** – only folder types with this tick can be chosen under *Where does this belong?*, and only for people who may create folders there ([permissions](berechtigungen.md), permission C). Default: on for folder types with a documents tab, otherwise off. Remove the tick if post never belongs to this type, e.g. for *Storage location*.
- **How to recognise it** – a short sentence that helps to assign a document to the right folder type, e.g. for *Invoice*: "Contains invoice number, amount and payment deadline; the sender is a contract partner". The description is meant for people; this sentence is for recognition and may be brief. A package that suggests the folder type (such as the *AI assistant*) gets it together with the name and short description – only for folder types allowed for [AI services](pakete.md#ki-dienste) (see [Where does this belong? by packages](pakete.md#wohin-gehoert-das)). Like name and description, it can be given in [further languages](#beschriftungen-je-sprache).

The **system folder types** User, Role and Post can never be chosen; they don't have either entry. Packages can set both. On an update, Ablago only takes over the entries if you haven't set them yet.

**Used in** (for saved folder types) shows where the folder type is used, each with a link: views that show it, link fields of other folder types that link to it, and links tabs of other folder types that use its fields as a source. That way you see before a change what it affects. If it says "Not used anywhere", nothing depends on it.

### Is part of another folder { #ist-teil-einer-anderen-mappe }

Some folders only make sense as part of another one – an **invoice item** belongs to its **invoice**. So that hundreds of items don't show up in views and search, tick **Is part of another folder** in the basics of the *Invoice item* and choose under **Belongs to it through** the link field through which it belongs (here *Invoice*). The folders of this type are then called **parts**, the other one the **parent folder**.

- **The field** is a link to exactly one other folder type that holds one folder. It becomes **required** and always stays visible (not hidden, without *Show if …*). System folder types never belong to another folder. **No chains:** the parent type is not a part itself, and a type that has parts of its own cannot become one.
- **Where they appear:** only at the parent folder – in a [table](#tabelle) (such as *Items* with "+ Item") or a [links tab](#register) – and through a direct link. Not in [views](sichten.md) (not even in those with "all folder types"), results lists across several types, on the start page under *Recently opened*, in search and advanced search, not under **+ New** and not under *Where does this belong?*. The type gets **no view of its own**; if you switch the setting on for an existing type, it disappears from the views (a view that only showed it goes with it). If you switch it off again, it gets its own view back.
- **Search:** what is in a part finds the parent folder – the results list then says "found in Invoice item "3. Drill"". This only applies if the person may read **both**, the part and the parent folder; otherwise search gives no hint of the part's content.
- **Read permissions:** if the type has no [permissions](berechtigungen.md) of its own yet, it takes over the read permissions of the parent type **once** when you switch this on (the default for "Read" and the rules about reading; a rule whose field the part doesn't have is not carried over – the editor says so). After that they are its own: if you later change the permissions of the invoice, that does **not** apply to the items by itself – adjust them there too, otherwise items are readable more widely than their invoice.
- **Deleting and bin:** if the parent folder is deleted, its parts go with it – as one operation in the [Bin](papierkorb.md), in the deletion log with the way "with its parts"; restored the same way, and deleted permanently the same way. If the person may not read and delete every part, Ablago refuses and only names the number – it never quietly deletes along with system permissions. A single part can be deleted like any folder; while its parent folder is in the Bin, it only comes back with it.

**No protection.** Hiding is about order, not access control: through the [interface](api.md), the [export](export.md), the [backup](sicherung.md) and direct links, parts remain reachable and are not lost; a direct link checks the normal permissions. Who may see what is governed by the [permissions](berechtigungen.md). Packages can bring the setting along (`gehoertZu` in the package format, see the developer manual).

## Fields {#felder}

Every field has a **label** (changeable), a **key** (fixed once saved) and a **field kind**. A click on a field opens it. You change the order with the arrows or by **drag and drop** at the handle **⠿** (see [Dragging instead of clicking](#ziehen-statt-klicken)).

![Editing a field](bilder/werkbank-feld.png)

| Field kind | Properties |
| --- | --- |
| Text | minimum and maximum length, pattern (regular expression, must match the whole text), unique, [format](#formate-und-datumsgrenzen) |
| Long text | minimum and maximum length |
| Formatted text | minimum and maximum length (see below) |
| Number | minimum, maximum, decimal places, unique |
| Amount | minimum, maximum, default currency, [allow negative amounts](#zeitraum-prozent-negativ) |
| Period | – (number and unit, see [below](#zeitraum-prozent-negativ)) |
| Percentage | minimum, maximum, decimal places |
| Date | [earliest, latest](#formate-und-datumsgrenzen) (fixed or "today"), Is a deadline |
| Yes/No | – |
| Choice list | the choice values (one per line), multiple choice, [labels of the values](#beschriftungen-je-sprache) |
| Link | target folder types (one or several), kind of link, several folders allowed, all of the same type |
| Password | – (stored encrypted, see below) |
| Table | shows folders of the type … that link here through field …; columns from results list …; label of "+ New" (see [below](#tabelle)) |
| Combined | template made of placeholders, unique as a combination (see [below](#zusammengesetzt)) |

For all of them: **Required field** and a **help text** that is shown below the field when filling it in (in the field editor right next to the label); most folder types also have a **default value** for new folders. **Unique** means: the value may exist only once in this folder type – upper and lower case don't count. If two fields are unique, this applies to each on its own; if a **combination** should exist only once (invoice number per sender), use a [combined field](#zusammengesetzt).

If the default value of a text field contains `{nummernkreis:<key>}`, every new folder gets a consecutive number from this [number sequence](nummernkreise.md); the field is then read-only.

### Period, percentage and negative amounts { #zeitraum-prozent-negativ }

For contracts and invoices there are three things you enter just as they are on paper:

- **Period** – a whole number (0 to 9999) and a unit: days, weeks, months or years. Good for a *notice period* of "3 months" or a *term* of "24 months". Ablago shows singular and plural correctly ("1 month", "3 months") – in the [title template](#titel-einer-mappe) too, and in German. The unit stays as entered; sorting and comparing go by length (a month counts as 30.4375 days, a year as 365.25 – so 12 months equal 1 year). The default value can be entered as "3 months".
- **Percentage** – a number with decimals, freely chosen (foreign tax rates too). "19", "19%" and "19.0" mean the same; it is shown as "19%". Minimum, maximum and decimal places as for a number.
- **Negative amounts** – tick **Allow negative amounts** on the amount field, e.g. for a *credit note* or *refund*. The default is off: the amount may then not be below 0. With the tick, the form shows "Credit note or refund? Enter it with a minus." below the field, and lists show a clear minus sign (−£25.00). Amount fields that already held a negative amount at the update have the tick set automatically.

All three work with [conditions](sichten.md), the advanced search, direct links, export and packages. In the [full export](export.md) a period is written as `P3M` (ISO 8601), a percentage as a number.

### Table: linking folders between the fields { #tabelle }

A **table** shows, in the middle of a fields tab, the folders of another type that link to this folder – for example the *items* of an *invoice*, or the *tasks* of a *project*. It has the same source as a [links tab](#register), but sits between the fields instead of on a tab of its own.

![Invoice with the table Items](bilder/mappe-tabelle.png)

On the field you set:

- **Shows folders of the type** and **that link here through this field** – only link fields pointing to this folder type can be chosen (on the *invoice item*, for example, *Invoice*). If there is none yet, add it to the other type first.
- **Columns from results list** – the columns and their order come from a [results list](#trefferlisten) of the other type; without a choice from its default results list. Password fields are never a column.
- **Label of "+ New"** – e.g. "+ Item", translatable per language; empty means "+ Invoice item".
- Label (e.g. *Items*), help text, tab, **Hide** and **Show when …** as for any field; with a [section](#abschnitte) before it the table gets a row of its own with a heading.

In the folder the rows are sorted as in the results list of the other type, 50 at a time with **Show more**; a click opens the folder. Without rows there is a quiet sentence ("No Items yet"). On a phone the table is a list with the first two columns. **+ Item** below the table opens the new folder in a window, with the link to this folder already set; after saving it appears in the table.

**Permissions.** The rows are folders: everybody sees only the rows they may read – the count ("Show more") does not include any others either. Links in the columns to folders they may not read show as "folder not visible". Only people who may create the other type see **+ New**; when saving, Ablago checks the create permission and that the person may read this folder, also via the [API](api.md).

**No value of its own.** A table is pure presentation like a section: it is not part of the folder's values, not in the [export](export.md) and full export, not in conditions, columns or the title template, and never required. It does not add up totals – that is up to packages, such as *Invoices*, which checks whether the items match the amount. Editing values directly in the table is not possible; open the folder for that.

As long as a table shows folders of a type, that type cannot be deleted and its link field cannot be removed; Ablago then names the table. Packages can include tables (`typ: tabelle` with `quelle`, see the developer manual).

### Combined: unique as a combination { #zusammengesetzt }

A **combined field** is made up of other fields of the same folder – following a **template** with placeholders and filters like the [title template](#titel-einer-mappe). Nobody maintains the value by hand: Ablago sets it when saving, the folder only shows it. Usually it is **unique** – that way Ablago prevents duplicates through a combination of values.

**Example: invoice number per sender.** Different companies issue the same invoice numbers, so *Invoice number* alone can't be unique. Add a field *Identifier* to the *Invoice*:

1. Field kind **Combined**, template `{von} · {rechnungsnummer}` – the buttons below the template insert the placeholders of the fields.
2. Tick **Unique**.
3. Save.

If someone adds the same invoice a second time, the field *Sender* says: "This combination of Sender and Invoice number already exists in “RE-2026-17 from Stadtwerke Musterstadt”." – Ablago names the title of the existing folder only if the person may read it. The message is on the first field involved, because that's where you change something, not on the combined field.

- **Links count by the folder itself**, not by its title: two organisations with the same name are two combinations. The title is shown – to each person only if they may read the linked folder, otherwise "folder not visible".
- **Placeholders:** text, number, amount, percentage, date, period, yes/no, choice list and link. Not: passwords (as in the title template), long text and formatted text, tables, other combined fields and fields with a number sequence (they are unique anyway). Filters such as `{rechnungsdatum|jahr}` work as in the title – `{bereich} · {datum|jahr}` means "per area and year".
- **Compared** without language: date as `2026-11-30`, choices as their fixed value, upper and lower case don't count. Empty parts disappear together with their separator; if all are empty, the field has no value and doesn't count.
- **In the folder** the field is read-only with the note "combined from Sender and Invoice number" – in the same frame as a [calculated field](#berechnete-felder). It changes at once when you change a part. Never required.
- **Changing the template:** Ablago then recalculates all folders of the type. If several folders would then have the same combination, the editor asks first with the number ("2 folders in “Identifier”") and doesn't save silently. If you save anyway, these folders don't match the definition until someone changes them – as when switching on *unique*.
- **Usable everywhere:** as a column, in [conditions](sichten.md) and the advanced search (like text), in the search, in the title template, with [Use to find existing folders](#zum-wiederfinden-nutzen), in the [export](export.md) and [full export](export.md), in [packages](pakete.md) and through the [API](api.md) – there read-only. Conditions and the search compare the stored value; links are in it as the folder's key, a name doesn't find them there – use the condition on the link field for that.
- **Not in the history:** the changes of the parts are there.

### Hiding fields instead of deleting them { #felder-ausblenden }

If you don't need a field – say *Commercial register* on the *Organisation* from the *Basis* package – tick **Hide** on the field instead of removing it. A hidden field

- isn't shown in the form or in the folder, nor when printing the folder;
- isn't offered when you choose a new column, a new condition of a [view](sichten.md) or a field in the advanced search – whatever already uses it stays as it is;
- keeps all its **values**: they stay in the [backup](sicherung.md), in the [full export](export.md), in exported PDFs with the details and in the API (where the field is marked `ausgeblendet: true`);
- is **never required** – otherwise no folder could be saved any more. When you hide it, Ablago removes “required” and tells you; showing it again doesn’t bring “required” back on its own.

If the field is still used – in the **title**, in a **result list** or **view**, by **Fill from document** or **Use to find existing folders**, for a **deadline**, as the reference date in **archive mode** or in a **permission** – Ablago lists that before hiding and asks. Hidden, it keeps working there; you just don’t see it in the folder any more. You can show it again at any time: untick and save. The summary above the fields counts the hidden ones (“11 fields, 2 hidden”), and they are marked *hidden* in the list.

For folder types from a **package**, an update doesn’t change what you hid – “updates don’t change anything behind your back”. If an update brings a new field, it is visible. System fields (for example on *User* or *Post*) can’t be hidden.

If a hidden field holds a value that no longer fits after a later change to the field, it doesn’t stop the folder from being saved – it can’t be changed in the folder after all. Anyone changing it through the API has to follow the field’s rules.

### Show if … { #anzeigen-wenn }

A folder type should stay simple for Lena and still do everything in a business – without a second folder type for the same thing. For this, set on a **field** or a **section** (under the field tab, **Show if …**) when it is shown. Examples: section *Rent* only for contract type *Rent*, section *Accounting* only if the Library is [used for work](nutzung.md).

Conditions come from the same toolkit as for [views](sichten.md#bedingungen):

- **Library is also used for work** – the [Library attribute](nutzung.md);
- **Field value of the folder** – equal, is one of, empty, not empty and the other comparisons of the field type, with fixed values (for dates also “today”);
- **Reference points to a particular folder** – a reference field with “points to”, e.g. contract type *Rent*;
- **Reference points to a folder of type …** – e.g. “*concerns* is a vehicle”; useful for references to folders of different types.
- **Reference points to an own organisation** – e.g. section *Outgoing invoice* if *From* is the [own organisation](organisation.md).

Each condition can be reversed (**does not apply**); with several you choose **all apply** or **one of them applies**. Without a condition everything is shown. A condition never looks at its own field or at fields of its own section – otherwise it could never be shown again. Conditions on the signed-in user don’t exist here: what is shown doesn’t depend on who is looking at the folder.

- **Section hidden** → all fields up to the next section are hidden; the next section appears normally again.
- The folder reacts **immediately while filling in**: when someone picks contract type *Rent*, the section *Rent* appears. This applies in the folder, when creating one and in **Take over document**.
- **Values stay saved.** If the contract type changes from *Rent* to *Electricity*, the section disappears, its values don’t. In its place there is a quiet line: “Section Rent is hidden – 3 values stay saved · show”. **show** brings it back for this folder (marked “currently hidden”).
- A field is **required** only while it is shown. The server checks this itself when saving, with the same evaluation as the interface – also through the [API](api.md).

**Hiding is for tidiness, not protection.** Conditions only apply to what the form shows. API, [full export](export.md), [backup](sicherung.md) and [data access requests](datenschutz.md) show all values, as do columns in views and result lists and the folder’s title. [Permissions](berechtigungen.md), the approval for [AI services](#ki-dienste), [recognition](#erkennung) and [automations](automatisierungen.md) never depend on whether a field is currently shown. What must stay secret is set by the permissions.

In the editor, a field or section with a condition carries an eye and the sentence “only if …” – so you won’t wonder why a field is missing in a folder. Conditions that no longer fit – for example because their field was removed – are shown in red; saving only works once they are right. Packages bring the setting along (`anzeigen` on the field and the section); “points to a particular folder” only works in packages once they can name bundled folders by a fixed key – until then **Create package** leaves such conditions out with a note.

### Calculated fields { #berechnete-felder }

Some packages work out themselves what follows from the details – the package *Verträge* (contracts), for example, works out *Cancel by*, *Status* or *Per month*. The package brings such fields in its folder type as **calculated** (in the package format `berechnet: true`).

- **Read-only in the folder:** The value sits in the frame of a field that cannot be changed, with "calculated by Verträge" underneath. So nobody overwrites a worked-out value by accident.
- **Only the package writes:** Ablago only lets the package that calculates the value change it – through the interface, with the rights you confirmed when installing it, and with the same checks as any other change. Anyone else who writes – the interface in the browser, a script through the [API](api.md), another package, an [automation](automatisierungen.md) "Change field" – gets an error message with the name of the package. **Fill in from document**, [recognition](#erkennung), "follows from" and the demo generator leave calculated fields out.
- **Never required:** The package writes the value, not whoever creates the folder.
- **Rights preview:** When installing, the confirmation names the fields the package calculates and that everyone who may read the folder sees the values (see [Calculated fields](pakete.md#recht-berechnet)).
- **History without noise:** Changes the package makes to calculated fields appear in **one** entry per folder and day ("Calculated by the package Verträge – all changes of a day in one entry"). A status that only changes because of the date therefore appears at most once a day; what is back to the morning's value in the evening drops out of the entry. Changes made by people still appear one by one.

**No longer calculated.** If you remove the package or it no longer calculates (an update without code or without write access to the folder type), the last value stays. The field shows "no longer calculated" and remains read-only, so nobody thinks the value is still kept up to date. In the editor the field then offers **Release field again**: after saving, the value can be changed by hand in the folder again. Only someone who may change folder types can release it. If a later update of the package brings the field as calculated again, it calculates again; if an update drops it, the field is free.

You cannot make a field calculated yourself – that only works with a package that brings code. A package made with **Create package** takes calculated fields along as ordinary fields.

### Labels per language { #beschriftungen-je-sprache }

Name and description of the folder type, label and help text of every field, and the names of tabs and result lists can be maintained in several languages. Next to each of these texts is a small language switch (**DE · EN**). Under **DE** you edit the source text, under another language the label for it. If it stays empty, the German text is shown there. A dot on the switch shows that a label is still missing. Below the name it says, for example, "12 of 14 labels in English" – that is only a notice; saving still works.

With a **choice list**, the choice values are the **fixed values**: exactly they are stored in every folder. Under **Labels of the values** you state per language how a value is displayed, for example "Electricity" for "Strom". Changing the label leaves all saved folders, views and automations unchanged – they work with the fixed value. Changing or removing the value itself, on the other hand, works as before: folders with the old value then no longer fit. The search also finds a value via its label. The values of system fields such as **Status** or **Channel** of the post can be labelled this way too.

Views have the same for name and description. Which languages there are is set under [Workbench → Languages](sprachen.md).

### Formats and date limits { #formate-und-datumsgrenzen }

A **text field** can have a **format**. Then Ablago checks the entry, and on the phone the matching keyboard appears:

| Format | What fits | Display |
| --- | --- | --- |
| Email | `name@example.org` – with @ and an ending such as .de or .org | next to it a button for writing (`mailto:`) |
| Phone | digits, + at the start, spaces, `/`, `-` and brackets – no letters, e.g. `+49 30 123456` | next to it a button for calling (`tel:`) |
| Website | `www.example.org` or `https://www.example.org`; without `https://` Ablago adds it | next to it a button that opens the page in a new tab |
| IBAN | the country's length and check digit are right, e.g. `DE89 3704 0044 0532 0130 00` | in groups of four |
| Postcode | in Germany exactly 5 digits, otherwise free (up to the maximum length) | – |

With **Postcode** you choose the **field with the country** (a text or choice field of the same folder type). If it says Germany (also "DE") or nothing, and the field's default is Germany, the German rule applies. With any other country the postcode is free. Without a country field, Germany always applies.

A **date field** can have **Earliest** and **Latest** – a fixed date or **today**. Typical is *Latest: today* for a birthday or a first registration.

The error messages say what to do, e.g. "A phone number only contains digits, + at the start, spaces, /, - and brackets." The same checks apply to the [interface](api.md), to packages and their examples; the message names the fields.

**Saved entries stay valid.** If a field gets a format or limits later, Ablago doesn't change any values, and the folders don't land under *To do*. Only whoever changes the field has to enter a fitting value; other fields of the folder can be saved as before. Which entries don't fit is shown by [Workbench → Maintenance → Maintenance operations](texterkennung.md#angaben-die-nicht-zum-format-passen).

Recognition uses the format: a field with format Phone counts as a phone number even if it is called something else, and it only suggests values that fit.

### Fill from document {#aus-dokument-fullen}

With the tick **Fill from document** on a field, the button [Fill in from document](#erkennung) in a folder may fill this field from a photo or document as a suggestion. Up to version 0.216, the tick was called **Use for recognition**; the settings have stayed the same. Recognition runs in Ablago itself, without AI and without internet.

If a folder type has no field with this tick at all, it fills all fields whose kind it recognises from the label. Link fields suggest an existing folder of the target type that is in the text – by its fields with [Use to find existing folders](#zum-wiederfinden-nutzen), otherwise by its title.

Suitable are text, long text, number, amount, date, choice list, link, period and percentage – password fields never. Recognition looks for a period next to the field's label first ("Notice period: 3 months"), otherwise it takes the first one in the text (with low confidence); the same for a percentage ("19% VAT"). If the tick is on, you optionally choose **What is in the field?** (name or company, number, IBAN, email address, phone, street, postcode, town …). Without an entry, Ablago infers it from field kind, key and label ("Kundennummer" → number, "E-Mail" → email address); what it recognised is shown in the selection after *automatic*. The **recognition hint** is a free text, e.g. "Customer number at the top right, pattern 100-####" – a pattern after the word *pattern* (`#` = digit, `A` = capital letter) is searched for specifically by recognition.

The registry's packages (e.g. *Basis*) set the tick themselves. On an update, Ablago only takes it over on fields where you haven't set anything yet; the preview names them under "Fill from document".

### Use to find existing folders {#zum-wiederfinden-nutzen}

With the tick **Use to find existing folders** you tell Ablago which values it uses to find **existing folders** again in a document. Typical fields:

| Folder type | Field |
| --- | --- |
| Contract partner | Customer number, IBAN, email, name |
| Contract | Contract number, contract partner (link) |
| Invoice | Invoice number |
| Vehicle | Registration number |

Suitable are text (also with format IBAN, email or phone), number, link and [combined](#zusammengesetzt). For a combined field only the whole combination counts: every number and text in it is in the document, and every linked folder has been found itself – *invoice number per sender* thus finds only the invoice of the sender named in the letter. The tick is independent of **Unique**: a customer number doesn't have to be unique to help find a folder again.

This is how Ablago uses it, without AI and only with the folders the person may read:

- **How Ablago recognises it:** if the value of such a field is in the document, that is a piece of **evidence** – with field and place in the text, e.g. "Contract number WV-1043, found: … contract WV-1043 of …". Spaces, dots and hyphens in numbers don't count, so `100-4711` also finds `100 4711`.
- **Via links:** if a **link field** has the tick, the evidence for the folder it points to also counts for this folder. That way Ablago also finds the contract via its contract partner if the partner's customer number is in the letter.
- **Several pieces of evidence** make a suggestion certain. A single weak piece – for instance just the name – counts as **uncertain**.
- **Already there:** if all values for finding an existing folder are in the document, for instance the same invoice number, Ablago warns before a second folder is created.
- **Suggestions when assigning post:** a type with the tick on name or contact details counts as a possible **sender** (organisation, branch, person); a type with it only on numbers (e.g. contract number) as a possible **target folder**.

With the update that brought the tick, Ablago set it on the fields it used to find folders again before: fields with *Use for recognition* that contain numbers, IBAN, VAT id, email, website, phone or a name. Ablago treats packages without this entry the same way.

### The key { #die-kennung }

Ablago stores the values under the key, and the [interface](api.md) uses it. That's why it is fixed after the first save. You can change the label at any time.

### Links: connecting folders { #verweise-mappen-verbinden }

A field of the field kind **Link** points to folders of another folder type (or the same one – that's how hierarchies such as house → heating → heat pump arise). Choose:

- **Target folder types** – what is linked to, e.g. *Contract partner*. *User* and *Role* are possible too, e.g. for a field "Responsible". You can choose **several** folder types: an invoice then *concerns* the car, the heating, the flat or a contract in **one** field, instead of having a field of its own for each kind. Choose the types one after another in the field; **Remove** takes one out again.
- **Multiple** – whether several folders can be chosen.
- **All of the same type** – only with *Several folders allowed* and several target types: if the first folder chosen is a vehicle, the others may only be vehicles. Ablago checks this when saving, also via the [interface](api.md).
- **Kind of link:**
    - **Belonging** – "belongs to": the invoice belongs to the contract. Counts later in evaluations such as "everything about the house".
    - **Reference** – "has to do with": the invoice comes from this issuer. Just a link.

    The kind of link also decides when **deleting with linked folders** and for the **access copy** ([Data protection in Ablago](datenschutz.md#mit-verknupften-mappen-loschen)): only what hangs on via **belonging** is deleted along with it and handed over completely. If, for example, a contract is to go with its contract partner, set the field *Contract partner* in the contract to belonging (that is the case with the sample folder types).

#### Several target types { #mehrere-zieltypen }

- **When filling in**, the folders are offered grouped by type, the search covers all target types, and within each group the folders the person opened most recently come first. Chosen folders show their type with a symbol (that of the type's view), so that "Golf" (vehicle) and "Golf" (contract) can be told apart. **+ Create …** is there for each type the person may create folders in.
- **Folders that aren't visible** appear as "(not visible)", as with one target type – without title and without type; the groups give no count.
- **When saving**, Ablago checks that every linked folder has one of the target types (and that *All of the same type* holds). Existing fields with one target type stay as they are.
- **In views, permissions, the advanced search and "Show if …"** such fields have the condition **points to a folder of type …**, e.g. "*concerns* points to a folder of type vehicle" ([views](sichten.md), [permissions](berechtigungen.md#zeigt-auf-mappe-vom-typ)).
- **Choice filters** (next section) work on the fields all target types have in common (same key and field kind). **Follows from** and converting from a text field ([packages](pakete.md)) only work with exactly one target type. **Copy when selected** applies per target type that has the field ([below](#vorbelegen)).
- **Deleting a target type:** if it is one of several, Ablago takes it out of the field when deleting it. If it is the only one, the field prevents the deletion as before.
- **From packages**, target types can come that the package doesn't depend on (*optional*, e.g. *Invoice › concerns* → vehicle when the package Vehicles is installed). Ablago adds such a type as soon as it exists – also when the other package only comes later. The editor shows "Added as soon as it is installed: …" below. If the type is missing, the field stays anyway; if it has no target type at all yet, the form says the types come with another package.

#### Restricting the choice { #auswahl-einschranken }

In the line below target folder type, kind of link and *Several folders allowed* you decide with **Only folders that …** which folders the field offers – for instance for the field *Doctor* in the medical report only contract partners with *Kind = Doctor*. The conditions work as with [views](sichten.md): fields of the target type and system values (created, changed, by whom), fixed and dynamic values (today ± n, current user, their roles). Several conditions apply together. Below it says how many folders fit, e.g. "12 of 85 contract partners fit".

- In the folder, the search in the field only offers fitting folders – and only those the user may read. **+ Create …** opens a window for the new folder and pre-fills it with whatever follows unambiguously from the filter (e.g. *Kind = Doctor*).
- **Strict:** a new or changed value must fit, otherwise Ablago refuses to save – also via the [interface](api.md).
- **Existing values stay valid**, even if the target folder no longer fits later or you change the filter. The field then says in yellow what it doesn't match: "doesn't match “Organisation”" if the filter takes a value of this folder (see below), otherwise "doesn't match this field’s selection rule". Whoever may edit the folder also sees the line "Note: Branch doesn't match “Organisation”." above the tabs – a click jumps to the field; it disappears as soon as it fits. Saving stays possible. Via the [interface](api.md) the folder returns the same under `konflikte`.
- When saving the folder type, Ablago reports conditions on fields that don't exist (any more) in the target type.
- Not for fields that point to any folder.

**Values from this folder:** instead of a fixed value, a condition can take a value of the folder itself – tick **Value from this folder** and choose the field. Examples: *Speciality* (on the doctor) *is one of* **speciality of this folder**; *Contract partner* (on the contract) *points to* **contract partner of this folder**.

- Only fields with a matching field kind are offered: text to text, number to number, date to date, a choice field whose values also exist on the target, a link field to the same folder type. The link field itself doesn't work.
- If you change the field of your own in the folder, the choice filters anew immediately. If an already chosen folder no longer fits, the notice with the name of the folder's own field appears on the field even before saving.
- **If the folder's own field is empty**, the condition doesn't apply – then all that meet the remaining conditions are offered.
- Ablago checks on saving with the values that are to be saved – even if both fields are changed in the same go.
- Values from folders this folder links to (one level further) don't exist – that's what **Follows from** is for (next section).

#### Follows from { #folgt-aus }

Some links follow from another one: a branch belongs to exactly one organisation, a flat to one property, a contract to its contract partner. Under **Follows from** you choose another link field of this folder and below it which **value** of the folder there is taken over – for a person, for instance: *Organisation* follows from *Branch*, value *Organisation*. Together with a selection filter (branch *Organisation* points to **Organisation of this folder**) it works both ways: branch chosen → the organisation fills in; organisation chosen → only its branches.

- **Only an empty field** fills in, marked "from Branch". If something else is already there, Ablago asks: "Change Organisation?" – nothing is ever overwritten silently.
- **A pre-fill, not a lock:** you can always enter something else by hand. If the source then no longer fits, Ablago asks whether to clear it ("Clear Branch?") – with **Keep** everything stays as it is and the field shows the yellow notice. A selection filter on the other field stays strict: Ablago still doesn't accept a **newly** chosen folder that doesn't match.
- **If the target has no value** (a branch without an organisation), nothing happens.
- **Only what you may read:** if the person may not read the organisation, nothing fills in.
- **Existing folders** aren't rewritten. If their details don't match, the folder shows the yellow line above the tabs.
- **The same everywhere:** in the interface, via the [API](api.md) (Ablago fills in on saving if the request doesn't name the field itself) and with **Fill in from document** – if Ablago recognises the branch, the organisation comes along as a suggestion.
- When saving the folder type Ablago checks: both fields exist, the source is a link field with **one** folder, the value points to the same folder type as this field, and no field follows from another in a circle. Chains work (contact → organisation, contract → contact).
- In [packages](pakete.md) the property is called `folgtAus: { feld: niederlassung, zielFeld: organisation }` (from Ablago 0.225).

#### Copy when selected { #vorbelegen }

Some folders carry typical details: a *contract type* "Mobile" knows the usual notice period, an *insurance type* the payment interval. Under **Copy when selected** you set pairs on the link field – *field of the referenced folder* → *into this field*, for instance *Notice period* → *Notice period*. **+ Copy a field** suggests fields with the same key first. The field then shows the chip "copies 3 fields".

- **Empty fields only:** when someone chooses a contract type, Ablago suggests its values in the empty fields, marked "suggested from Contract type Mobile" (as in the setup assistant). Anything already there stays – nothing is ever overwritten silently. Every suggestion can be changed or cleared again with **Take back**.
- **Another folder chosen before saving:** suggestions of the folder chosen before that are still unchanged are replaced by those of the new one – so no mobile notice period sticks to an electricity contract. Whatever the person typed or changed stays.
- **Wherever you choose:** when creating and editing, with "+ New" from the referenced folder, with **Fill in from document** and on the page **Take over document**. If Ablago recognises the contract type in the document, its values come along as suggestions; if a value is in the document itself (such as the notice period), the document wins.
- **Only what the person may read:** Ablago fetches the values with the person's rights – if they may not read the contract type, nothing comes; a copied link to a folder they may not read is left out. **Password fields** can be neither source nor target, **calculated fields** ([above](#berechnete-felder)) never get a suggestion. Values from the contract type never go to an [AI package](pakete.md#ki-dienste), not even during recognition.
- **Matching fields:** both fields have the same field kind (text also into long text); multiple values only into fields with several values; for choices every option of the source must exist in the target, for links every target type. A value that would not be valid in the target (too long, unknown option) is not suggested. "Show if …" applies: a field that would be hidden with the new values gets nothing.
- **Several target types:** a pair applies to every target type that has the field (same key); types without it skip it. You can choose from the fields of all target types.
- **Saving fills nothing by itself:** these are suggestions in the interface. Folders saved via the [API](api.md) stay as the request sends them.
- When saving the folder type Ablago checks: the fields exist, they fit together, none is a password field, each target field appears only once.
- In [packages](pakete.md) the property is called `vorbelegen: [{ von: kuendigungsfrist, nach: kuendigungsfrist }]` (from Ablago 0.234).

Nobody can delete a folder that is still linked to.

### Password fields { #passwortfelder }

A field of the field kind **Password** takes, for example, the password of an online account. Ablago stores it encrypted with the key from **Workbench → [Encryption](verschluesselung.md)**; as long as there is none, no value can be saved, and the field points this out.

- In the folder it only says "••••••••". The eye shows the password – and every display is in the [log](fehlersuche.md) with user, folder and field, never with the value.
- Password fields never appear in the title, in the result list, in the search, in conditions of views or in demo data.
- Via the [API](api.md) there are passwords only with a key that has the permission "Read passwords".

### Formatted text { #formatierter-text }

A field of the field kind **Formatted text** takes longer texts with simple formatting: bold, italics, headings, lists, quotes and links. Users write with a small toolbar and see a preview; the text is stored as Markdown.

- There is no raw HTML, and links are only possible with `http(s)` or `mailto` – a text thus can't execute anything in the browser.
- In title, result list and search the text appears without formatting, shortened in lists.
- With **@** a user can be mentioned; they then get a [task](aufgaben.md).
- You can switch an existing long text field to *Formatted text*; the texts stay as they are.

### Deadlines on date fields { #fristen-erinnerungen-an-datumsfeldern }

On a **date field** such as "Cancel by" or "MOT due" you can switch on **Is a deadline**. Then the date appears under "To do" and in the calendar, and it triggers the event *Date reached*.

**When and whom Ablago reminds you set in an [automation](automatisierungen.md)** – If card *Date reached*:

- **Advance notice** – how long before, in days, weeks or months. With 4 weeks and 30/09, the deadline appears on 02/09.
- **Recipient** – for example the user in a field that links to users (e.g. "Responsible"), otherwise whoever created the folder. Absence and stand-ins apply as with all [tasks](aufgaben.md).
- **Text** with placeholders such as the date and the folder's title.
- **Recurring** – monthly, quarterly, half-yearly, yearly or every few years. Whoever completes the deadline gets the suggestion "Set date to 30/09/2028"; the date **never changes by itself**, and the change is in the folder's history like any other.

Packages bring matching automations, for example "Cancellation due soon". When installing, Ablago asks which should be switched on straight away (default: all). For a folder type of your own you create the automation yourself.

**Since version 0.177 only the automation reminds.** Formerly, advance notice, recipient and text were set directly on the field. On the update, Ablago took over each of these reminders **once** as a switched-on automation *Reminder: field (folder type)* – with the same advance notice, the same recipient (if the field is empty: the creator), the same text and the same recurrence. So everything reminds as before; the Workbench overview says once what has moved. A taken-over automation that you delete doesn't come back. If a package update later brings its own automation for the same field, it replaces the taken-over one as long as you haven't changed it – nothing ever reminds twice.

This is how deadlines behave:

- The automation checks every day at the set time (default 07:00) and when a folder is saved: if the date is already within the advance notice, the deadline comes immediately. **At most one** deadline arises per person, folder, field and date – not again after completing it either.
- If the date is **changed or cleared**, an open deadline completes itself (with an entry in the folder's history); for the new date a new one arises at the right time.
- Dates that are already past no longer create a deadline.
- If the recipient may not read the folder according to the [permissions](berechtigungen.md), they still get the deadline; *Workbench → Notifications and tasks* then shows a notice.
- There is no additional email on the due date – the deadlines are in the daily summary.

## When a folder type changes { #wenn-sich-ein-mappentyp-andert }

You can change folder types at any time, even if folders already exist:

- **Hiding fields** instead of removing them: the field disappears from the folder, everything else stays (see [Hiding fields](#felder-ausblenden)).
- **Removing fields** deletes no values. They stay on the folder and appear there as "values without a field definition". If you add the field again with the same key, they are back.
- **Formats and date limits** don't make saved entries invalid (see [above](#formate-und-datumsgrenzen)).
- **New required fields, stricter rules, removed choice values:** folders that no longer fit are marked and get a [task](aufgaben.md) "Doesn't fit" for their creator; that way they land under [To do](https://help.ablago.app/benutzer/aktuell/en/eingang/) for them. The task completes itself as soon as the folder fits again. Nothing is changed silently. Above the folder type it says how many folders are affected.

![To do in the Library](bilder/eingang.png)

## A folder's title { #titel-einer-mappe }

The **template** determines what a folder is called in lists and links, e.g. `{rechnungsnummer} of {rechnungsdatum}`. Fields in curly brackets are inserted, everything else stays. There are also `{angelegt}` and `{geaendert}` (the date in each case). The preview shows the result with sample values or with the values of a real folder.

If the title refers to another folder (`{vertragspartner}`), the title is updated when the contract partner changes.

Without a template, Ablago uses the first text field.

### Formatting placeholders { #platzhalter-formatieren }

After a vertical bar `|` you can **format** a placeholder without creating an additional field. Several filters can be written one after another, for example `{partner|kurz:20|gross}`.

| Filter | Effect | Example | Result |
| --- | --- | --- | --- |
| `jahr`, `monat` | part of a date | `{rechnungsdatum|jahr}` | 2026 |
| `datum:"…"` | date in your own format with `TT`, `MM`, `JJJJ`, `JJ` | `{rechnungsdatum|datum:"MM/JJJJ"}` | 10/2026 |
| `ohne_waehrung` | amount without currency symbol | `{betrag|ohne_waehrung}` | 1,234.50 |
| `gross`, `klein` | upper or lower case | `{kennzeichen|gross}` | DD-AB 123 |
| `kurz:n` | shorten to n characters, with "…" | `{betreff|kurz:30}` | Your invoice for contract 12… |
| `sonst:"…"` | replacement if the field is empty | `{nummer|sonst:"no no."}` | no no. |

`jahr`, `monat` and `datum` work with date fields and with `{angelegt}` and `{geaendert}`, `ohne_waehrung` only with amounts. The filter names are the same in every language.

**Empty parts are dropped.** If a field is empty, it disappears together with its separator (` – `, ` · `, ` | `, ` / `, `, `, ` › `). With a missing contract number, `{bezeichnung} – {vertragsnummer} – {beginn|jahr}` becomes "Electricity – 2026" instead of "Electricity –  – 2026".

Deliberately there are **no** conditions, loops or calculations in the title. The editor immediately reports unknown filters or a filter on the wrong field; the preview shows the result.

!!! note "Existing titles"
    Old templates without filters apply unchanged. The only new thing is that empty parts are dropped together with their separator. That takes effect as soon as a title is formed anew, i.e. on the next save of the folder or the folder type.

## Result lists { #trefferlisten }

A **result list** decides which details appear as columns in a list, and in which order – fields and system values (title, created/changed on/by).

- If the list is **wide**, it becomes a sortable table with these columns.
- If it is **narrow**, the first three columns form the compact entry: the first in bold, the second and third below it.

If a result list has no columns, the Library shows the title and two more fields.

A folder type can have **several** result lists, e.g. *Standard* with all details and *Short* with title, amount and *paid*. With **+ Result list** you create another one (it starts with the columns of the default list).

- Every list has a **name** and a fixed **key**; [views](sichten.md#trefferliste) and links tabs choose the list by it.
- **Exactly one** is the **default**: it applies wherever no other is chosen. At least one list always remains.
- Below every list it says **where it is used** (views, tabs). If you remove a list that is in use, the default list applies there.

![Two result lists on the folder type Invoice](bilder/werkbank-trefferlisten.png)

![The result list as a table in the Library](bilder/tabelle.png)

## Tabs { #register }

Tabs are a folder's dividers, in the given order:

| Kind | Content |
| --- | --- |
| **Field tab** | a group of fields; which field is on which tab you set on the field |
| **Documents tab** | uploaded files; PDFs and images can be viewed directly. **Create full text** (default: on) sends new documents through [text recognition](texterkennung.md) |
| **Links tab** | folders that link to this folder – all or only certain ones (e.g. "Invoices" only via the field *Contract*). *Post › Assigned to* can also be chosen as a source: then the post assigned to this folder is shown here, e.g. sent emails and incoming letters |
| **History tab** | the folder's history: who changed what and when, with old and new value; plus documents, bin, notes, tasks, emails, displayed passwords (without the value) and retrievals. Under **Shows** you tick which kinds of entries it shows (see below). Several per folder type possible |

**Switch on versioning** (default: off) on a documents tab: when replacing, the old version is kept and can be brought back. With **Only keep the last … versions**, Ablago tidies up older versions including their files (empty = keep all). If you switch versioning on, every existing document counts as version 1; if you switch it off, existing older versions stay visible, no new ones arise. Without versioning there is no replacing – via the interface an understandable error message comes. Switching on and off is in the [log](fehlersuche.md#protokoll) when the folder type is saved. What it looks like for users is in the User manual under [Understanding versions](https://help.ablago.app/benutzer/aktuell/en/versionen/).

!!! tip "Why switch on versioning?"
    Whoever has filed in the file manager so far expects a new file to overwrite the old one – and therefore adds `_v2` or `_final` to the name. With versioning you simply file the new version, the old one stays below it and can be brought back. For tabs such as *Contract documents* or *Receipts* it is almost always worth it. You only need **Only keep the last … versions** if storage space is tight: Ablago then deletes older versions by itself, and they can no longer be brought back.

**What a history tab shows** (*suggestion implemented*, issue #800): Ablago **always records everything** in the history – no checkbox switches recording off, not even in [archive mode](archiv.md). On the tab you only set what it **shows**: *Creation, bin and post*, *Fields changed*, *Documents*, *Notes*, *Tasks*, *Email, passing on and information requests*, *Temporary rights*, *Downloads*, *Retrievals via the API* and *Retrievals via the drive (WebDAV)*. **Ablago's preselection** is everything except the three kinds of retrievals – so the history looks as before in everyday use. Entries **in administration mode** are shown by every history tab, however it is set. With several tabs you separate what belongs together, for example *History* (preselection) and *Retrievals* (only downloads, API and drive). Anyone who may read the folder can, for now, choose **Show everything** on the tab.

A **retrieval** is a real retrieval of a file's content: downloading in the interface (also with a stamp, as an older version, archive or converted version, as an export with documents), every retrieval with a person's API key (also page images) and every read via the [drive](webdav.md). Viewing in the browser, folder queries of the drive and packages that process files in Ablago (such as text recognition) don't count. So that Explorer, Finder and Office don't fill the history, the same retrieval – the same person, file and version the same way – appears **once per calendar day** (time zone of the [region](region.md)); a retrieval on a later day gets its own entry. The history stays complete as long as the folder exists, for all kinds of entries; it goes with [backup](sicherung.md), [full export](export.md) and [information request](datenschutz.md).

Tabs have fixed keys so that documents keep their tab when it is renamed. A documents tab that already contains documents can't be removed.

**Hiding tabs** (#655): with **Hide** ticked on a tab, the folder no longer shows it. The fields on it count as hidden – with everything described under [Hiding fields](#felder-ausblenden): values stay, never required, a question if they are still used. Documents tabs can’t be hidden (uploaded files and assigned post go there), nor can tabs with system fields; one tab has to stay visible. A package update doesn’t show anything again.

### Sections in a field tab { #abschnitte }

Without sections the folder puts the fields of a tab into a grid – as many side by side as fit. With **+ Section** on a field tab you decide where a new row starts and which fields belong together. Below the tab you see its fields in their order, with the sections in between:

- **With a heading**: the folder shows a thin line and the heading, and the next field starts on a new row. For a person, for example, *Salutation, Title, First name, Last name* sit on one row, with *Contact* and *Address* below – in **one** tab instead of several. If you prefer to keep the tabs, keep them.
- **Without a heading**: just the line break, no line – for example so that the *Birthday* starts below the name.
- **collapsed** (only with a heading): the section is closed when a folder is opened – good for things rarely needed, such as *Bank details*. The heading shows what is inside (“Bank details · 2 of 3 filled in”); a click or **Enter** opens it. Whatever someone opens or closes, Ablago remembers **per person** in their personal settings, on every device; the setting on the folder type is only the default. A section opens on its own if a **required field** in it is **empty** or the **search** or a **link to a field** points into it (both when opening), if saving finds an **error** in it or **Fill in from document** makes suggestions there.

Move a section with the arrows, with **Alt+↑/↓** on the handle **⠿** or by dragging it onto a field – it then starts before that field. A section is tied to its first field: if you move the field under **Fields**, the section moves with it; if you drag the field to another tab, the section starts at the next field. The heading can be translated like names ([labels per language](#beschriftungen-je-sprache)).

Sections are **display only**: the list of fields stays; export, the PDF with the details, printing and the API always show everything, including what is in collapsed sections. In a narrow view (phone) there is one field per row; sections only show their heading there, and a break without a heading has no effect. The API returns the sections on the tab (`abschnitte: [{ vor, titel, eingeklappt }]`) so apps can show them as a grouped list. Packages bring them along; an update only adds sections to tabs that have none yet. Whether a section is shown can depend on a condition: [Show if …](#anzeigen-wenn).

**Links tab as a table:** if you tick a source, you can choose a [result list](#trefferlisten) of the source type next to it. The tab then shows the linking folders as a table with its columns (e.g. for the contract partner the invoices with amount, date and *paid*). Without a choice – or if the list no longer exists – it stays a simple list of titles.

## Dragging instead of clicking { #ziehen-statt-klicken }

Fields, tabs, [sections](#abschnitte) and the columns of every result list have a **handle ⠿**. By it you drag an entry to another place; a line shows where it lands. You can also drag a **field** onto a **field tab** – it is then on this tab.

This only changes the draft; it is taken over like everything else with **Save folder type**. By keyboard: reach the handle and **Alt+↑/↓**. On a smartphone, long-press the handle, then drag. The arrow buttons still exist.

## System folder types: User, Role and Post { #systemmappentypen-benutzer-rolle-und-post }

*User*, *Role* and *Post* are **system folder types**, recognisable by the mark *System*. They come about by themselves and can't be deleted.

![System folder type User](bilder/werkbank-systemtyp.png)

- You can extend them with your own fields and tabs, e.g. a telephone number.
- Their **system fields** (name, email address, roles, active, or the role's name) are fixed: you may change label, help text and tab, but not field kind and properties.
- Folders of the folder type *User* can neither be created nor deleted in the Library (system rule) – users come about in user management.
- **Post** is everything that comes into Ablago or goes out ([User manual: Post](https://help.ablago.app/benutzer/aktuell/en/post/)). System fields: *Subject*, *Status* (New, Assigned, Done), *Channel* (Uploaded, Email, Scan, Folder, Import, API, WebDAV), *Direction*, *Date*, *Sender*, *Recipient*, *For*, *Assigned to* and *Message*.
    - Post arises via **+ Post** in the views with post, via the [interface](api.md) (`POST /api/v1/post`) and when [sending by email](https://help.ablago.app/benutzer/aktuell/en/versenden/). No post is created via the general form "+ New". Who may create post is governed by the [permissions](berechtigungen.md) (C) as with every folder type.
    - Ablago records *Channel*; **Assign** sets *Assigned to*. For sent emails, subject, recipient, sender, date, message and direction are fixed too.
    - *Assigned to* is the only field allowed to point to folders of *any* folder type, also to several. If one of these folders is deleted, the post stays; only the link goes.
    - *For* links to a user: as long as the post is new, they have the task *Post for you* under "To do".
    - At the first start, Ablago creates the views **New post** (at the very top, status *New*) and under **Post** the views **Incoming** and **Sent**. You can change, move or delete them; deleted ones don't come back.
    - **Email becomes post (0.41):** the former system type *E-Mail* becomes *Post* on the update. Existing emails get channel *Email*, direction *Outgoing* and status *Done*. Fields, documents and links stay; your own fields and labels too. Links with `typ=email` keep working.

More on this in [Users and roles](benutzer.md).

## Storage location: where the originals are { #ablageort-wo-die-originale-liegen }

The folder type **Storage location** comes with the **Basis** package (from Basis 1.6.0, alongside organisation, branch and person). With it you record where the paper for a scanned document is – or that it has been destroyed. It is a normal folder type from a package: you can rename it, extend it with fields and tabs and change its permissions as with every folder type.

- **Without Basis there is no storage location** – that is intended. A new Library only brings the [system folder types](#systemmappentypen-benutzer-rolle-und-post); everything subject-specific you choose via [packages](pakete.md). Packages such as Household, House, Letting and Vehicles need Basis anyway and refer to Basis's storage location in the field *Whereabouts of original documents*.
- **Older Libraries** (before 0.212) still have the storage location that Ablago used to create itself (key `ablageort`). When you install Basis or update it to 1.6.0, Basis **takes it over**: same folder type ID, all storage locations, links and the view stay; only the origin is "Basis" afterwards. No second storage location is created; the preview mentions the takeover. Until then you can edit it like any folder type of your own and – without folders and links – delete it too.
- **For package authors:** references are written `basis:ablageort` (dependency `basis: ">=1.6.0"`). The former `dms:ablageort` still applies until Ablago 1.0 and points to the same folder type; the package check gives a notice about it.

- **Fields:** *Name*, *Is in* (a link to another storage location) and *Description*.
- **Tabs:** *General*, *Contains* (the storage locations that are in here), *Kept here* (all folders that link to this location) and *Photos*.
- **Title:** `{liegt_in} › {name}`. The red binder is then called, e.g., "at home › study cupboard › red binder". At the very top (without *Is in*) only the name remains.
- **Moving in one step:** if the cupboard goes into the living room, you only change *Is in* on the cupboard. Ablago updates the titles of the locations below and of all folders that show the location in their title – over at most six levels.

**Whereabouts in your folder types:** give folder types with paper (contract, invoice, insurance, certificate …) a link field to *Storage location* with the key **`verbleib_original`** and the label *Whereabouts of original documents*. The same key in all folder types is important: only then is there the column in shared result lists and the condition in views across several folder types. If there is a storage location, the [examples](demo.md) bring the field for *Contract* and *Invoice*, plus a few storage locations and the view *Originals by location*.

!!! note "Deliberately simple"
    The whereabouts apply to the whole folder, not to every single scan. *Kept here* only shows what is directly at this location; what is in locations below you see via *Contains* level by level. When you should keep the paper at all is in the User manual under [Keep or destroy the original?](https://help.ablago.app/benutzer/aktuell/en/original/).

## Recognition { #erkennung }

Under **Recognition** (not for system folder types) you set up the button **Fill in from document** that users see at the top of every folder of this type:

- **Show button** (default: on) – deselecting hides it, e.g. for folder types without paper.
- **Label** – e.g. "Scan business card" for the folder type *Person* or "Photograph receipt"; empty it is called "Fill in from document".
- **Recognition** – only if a package with the permission [Suggest fields from documents](pakete.md#recht-erkennen) is installed: **Default from the Workbench** (default), **built in (without AI)** or a **package**, for instance an AI assistant. A package that may go to the network is listed with "sends text over the network"; if you choose it, Ablago asks, and you confirm the data outflow. More under [Recognition by a package](pakete.md#erkennung-durch-ein-paket).
- **Assign post automatically if recognition is certain** (default: off) – for folder types that post belongs to, e.g. *Contract*. Certain means: sender recognised unambiguously by a strong feature (customer number, IBAN, VAT id, email, website, phone) **and** exactly one fitting folder of this type (it links to the sender, earlier post went there or its number is in the letter; if exactly one number is in the letter, this folder wins). Ablago never creates new folders in the process, never assigns if the recipient may not read the folder, and never for folder types in [archive mode](archiv.md) (the tick is locked there). The recipient (*For*, otherwise whoever brought the post) gets the task **Assigned automatically – please check** with **Fits** and **Undo**; the reason is in the history of post and folder. At most once per post, and only after new full text – existing post stays as it is.

Below it, it says which fields *Fill in from document* fills and which fields Ablago uses to find existing folders of this type again; you set this on each field under [Fill from document](#aus-dokument-fullen) and [Use to find existing folders](#zum-wiederfinden-nutzen). Recognition is built in and works without AI: patterns for email, phone, website, IBAN, date, amount, postcode/town, letterhead and business card as well as vCards (`.vcf`); photos and PDFs are read immediately by [text recognition](texterkennung.md) (at most 5 pages, with the languages of its settings). Every value is checked against the field kind before it appears; it is only saved with *Save folder*. It can't read QR codes yet (e.g. vCard QR on business cards). Instead of the built-in recognition, a package can recognise, for instance with AI on your own computer – see [Recognition by a package](pakete.md#erkennung-durch-ein-paket).

## Archive mode { #archivmodus }

Between tabs and permissions you switch on **archive mode**: folders and documents of this folder type can then not be deleted until the end of a retention period, and documents only change as a new version. Period, reference date and what applies meanwhile are under [Archive mode and retention](archiv.md).

## Stamp when handing over { #stempel-beim-weitergeben }

After archive mode you set whether a stamp is **suggested** or **required** when downloading, exporting and sending documents of this folder type, and with which template – e.g. for ID documents "Copy for {empfänger} – {datum}". Everything else is under [Stamps when handing over](stempel.md#stempel-je-mappentyp).

## Permissions { #berechtigungen }

Below tabs and archive mode you decide who may create, read, edit, delete folders of this folder type and see passwords in them – with the row **Default** and rules. They are saved with **Save folder type**; below them you try out the rules in the **test run** – also unsaved ones. Everything else is under [Permissions](berechtigungen.md).

## AI services { #ki-dienste }

At the very bottom you decide whether the folder type **may go to AI services** – packages that can send content over the network (for instance for *Ask your library* or *Fill in from document*). Without the tick no such package gets anything from this folder type. The tick takes effect immediately, independently of **Save folder type**. **New folder types – copies too – are blocked until you allow them.** More under [Packages → AI services and folder types](pakete.md#ki-dienste).

## Copying a folder type { #mappentyp-kopieren }

**Copy folder type** at the top right creates a new folder type as a **draft** – with the same fields, title, result lists, tabs and permissions. It is called "Copy of …" and gets a key of its own; you can change both before saving. It is only created with **Create folder type**; **Discard draft** cancels. Folders are not copied. Fields that link to the folder type itself point to the copy in the copy. System types can't be copied.

## Deleting a folder type { #mappentyp-loschen }

**Delete folder type** only works as long as there are no folders of this folder type – including none in the [bin](papierkorb.md) – and no other folder type links to it alone (if it is one of [several target types](#mehrere-zieltypen), Ablago takes it out there). Otherwise Ablago names the reasons. [System folder types](#systemmappentypen-benutzer-rolle-und-post) can never be deleted.
