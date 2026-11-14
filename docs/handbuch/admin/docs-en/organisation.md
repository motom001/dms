# Own organisation {#eigene-organisation}

**Workbench → Settings → Own organisation** brings together two things that belong together: at the top the [use](#nutzung) of the Library (private or also for work), below it your **own organisation**. You tick “for work” once and then set up the organisation – after that you are done. The area is in every Workbench preset; the former address */werkbank/nutzung* leads here.

You keep name, address, contact and the controllers under the GDPR **once** – at the organisation in the Library that carries the attribute **“own organisation”**. Every place in Ablago that needs these details takes them from there. Katrin creates the joinery Brandt as an organisation, ticks “Own organisation” and enters address and contact – done. The Workbench page is only a slim link to it.

!!! note "No legal advice"
    Whether and whom you must name as controller or data protection officer should be checked by an expert if in doubt.

![Workbench → Settings → Own organisation](bilder/werkbank-organisation.png)

## Use: private or for work { #nutzung }

At the very top of the page you set once for the whole Library whether it is **also used for work** – for example by Katrin as a self-employed person, in a club or in the joinery. The default is *no*: a new Library counts as private. It is saved with the save bar at the bottom of the page.

This is deliberately **only this one attribute**. Everything else follows from the folders’ field values or from the installed [packages](pakete.md).

### What the attribute does

- **Folder types** use it to show their work-related fields and sections – via [Show if …](mappentypen.md#anzeigen-wenn) with the condition *Library is also used for work*. In a purely private Library Lena sees none of it; the folder type is the same. This is also how the Basis package shows the tick *Own organisation* on an organisation only when the Library is used for work.
- **Own organisation:** without “for work”, Ablago does **not** use an own organisation that is still saved – not in [data access requests](datenschutz.md), the [deletion concept](loeschkonzept.md), the letterhead or recognition. The part below stays visible but faded, with the sentence “Only needed if the Library is also used for work”. If you switch “for work” off, the page says: “Your own organisation … stays saved but is not used.” Nothing is deleted; with the tick it applies again.
- **Conditions** of [permissions](berechtigungen.md), [views](sichten.md#bedingungen) and [automations](automatisierungen.md) can look at it (“Library is also used for work”, reversible). It applies to all folders alike.
- The **Workbench template** (which areas are listed on the left) follows it: for work → *Business*, otherwise *Household*. It follows the attribute as long as nobody has adjusted the sidebar. The template stays a Workbench setting; the attribute applies to the Library.
- **Packages** can suggest a longer [retention when used for work](archiv.md#archivmodus-aus-einem-paket) for their new folder types; it applies if the attribute is set when installing. If you switch it later, the archive mode stays as it is – you can change it on the folder type.

Hiding is **for tidiness, not protection**: values of hidden fields stay saved and appear in the [API](api.md), the [full export](export.md) and [data access requests](datenschutz.md). Who may see what is set by the permissions.

### Good to know about the use

- Only people with **Full administration** may change the attribute ([Who may administer Ablago?](verwalten.md)); someone who only manages the area *Own organisation* sees the tick locked with this reason. Everyone signed in may read it – the folder form needs it.
- When you switch it, Ablago checks right away which folders now have required fields left open (for example in a section only shown for work) and shows them as “doesn’t fit” as usual.
- The setup assistant asks for it in the [Use](installation.md#nutzung) step ("What will you use Ablago for?") and, for work use, can create your own organisation straight away. The [setup file](einrichtungsdatei.md) knows it as `nutzung: beruflich` or `beides` (older files: `optionales: beruflich: true`). Setup, this page and the folder use the same attribute.
- The attribute is stored in the database and is therefore in every [backup](sicherung.md). The [full export](export.md) stores it as `struktur/merkmale.json`, and the API returns it read-only at `GET /api/v1/merkmale`.

## Setting up

1. The attribute comes with the package **Basis from 1.7.0** (folder type *Organisation*, field *Own organisation*). If it is missing, the Workbench says so and leads to the [packages](pakete.md).
2. In the Library open or create your own organisation and tick **Own organisation**. The tab *Basic data* then shows the section **Data protection**:
    - **Controller** – usually the organisation itself (leave it empty or point it to itself), otherwise a person, for example the owner.
    - **Data protection officer** – only if you have one.
3. Several own organisations are possible (private and business, two companies) – this is only an assignment, not a separate accounting unit. You then choose in the Workbench **which one applies to requests and documents**.

If there already was a controller in the [request](datenschutz.md) settings, the Workbench shows it under *Previous entry for requests*. **Create as own organisation** turns it into an organisation with the attribute (name, street, postcode and town, email and phone as far as Ablago recognises them in the text; the rest goes into the description). Until then the previous entry still applies.

The **setup wizard** makes it even simpler: if you choose work or both under "What will you use Ablago for?", it asks for **Your organisation** (only the name is required) and creates it with "Set up now", including the attribute, with itself as controller ([Use](installation.md#nutzung)).

## Who may set the attribute

The attribute decides who appears as controller on requests and in the deletion concept. That is why the field is protected:

- It may be changed by whoever may manage the area *Own organisation* **in administration mode** (or has *Full administration*) – see [Who may administer Ablago?](verwalten.md).
- In addition anyone with a role you release under **Which roles may set “own organisation”** – provided they may edit the organisation anyway. The field is a reference field with multiple selection as in folders: search a role, pick it, take it out again with “Remove”. Anyone who administers Ablago may always do this; you create new roles via **Manage roles** ([Users and roles](benutzer.md)).
- Everyone else sees the field read-only. Through the [interface](api.md), from packages and automations the answer is **403** – administration rights never apply through an API key.

Every change to the attribute, the controller or the data protection officer is written to the **system log** (module data protection), shown as a **note** at the top of the page (with “Acknowledged”) and – with email sending set up – mailed to everyone who manages the area. The choice “applies to requests” and the released roles are logged as well.

## What Ablago reads – and what not

Ablago reads the details **by the meaning of the fields**, not by fixed keys – so it keeps working when you adapt the folder type. It reads with system rights, so even if you may not see the folder yourself, but **only this fixed list**:

| Detail | From |
| --- | --- |
| Name, street, house number, postcode, town, email, phone | per meaning the **first** text field with “Fill from document” and this kind, in tab order (so *Name* comes before *Short name*) |
| Controller, data protection officer | the link fields of the section *Data protection* – for the person or organisation referred to, again only the list above |

Ablago never reads passwords, customer number, IBAN, description, documents or anything else for this. The Workbench does not show the folder’s title either (the title template could contain other fields). Changes are only possible in the Library with your normal rights; **Edit in the Library** takes you there.

## Data access requests { #auskunft-vorgaben }

Below the roles are the **defaults for every access request**: first the form of address (du or Sie), then the text **The person’s rights**, which follows the form of address until you change it (with **Reset to suggestion**), and the **recipients** as a suggestion for every request. So you set up the organisation and the requests in one go; the requests page points here. Details under [Defaults for every access request](datenschutz.md#einstellungen). They may be changed by whoever may manage data access requests or the deletion concept; otherwise only a sentence about it appears here.

## Where Ablago uses the details

The Workbench lists this under **Where Ablago uses these details**; places with their own Workbench area (data access requests, deletion concept, folder types) are links there:

| Place | Result of the inventory (#995) |
| --- | --- |
| [Data protection request](datenschutz.md): sender on the cover sheet, email to the person | refers here |
| [Deletion concept](loeschkonzept.md): controller, data protection contact | refers here |
| Recognition: sender of incoming post | the own organisation is **never** the sender – even if its letterhead is in the text |
| Folder types with [Show if …](mappentypen.md#anzeigen-wenn) “refers to an own organisation” (e.g. outgoing invoice) | refers here |
| Sender name for sending email ([Operation](installation.md#e-mail-und-adresse)) | deliberately stays separate – Ablago’s technical sender, also without a business |
| Cover sheets of exports and requests: name of the installation | deliberately stays separate (name of the Library); the controller comes from here |
| [Letter from template](https://help.ablago.app/benutzer/aktuell/en/versenden/#brief-aus-vorlage) (#1040): letterhead | refers here – when the letter is not for a particular person (*Customer* field empty); only name, address, phone, email |
| [Emergency sheet](verschluesselung.md) “Whom to ask?” (#812) | deliberately stays separate – it lists trusted people, not the business |

## Good to know

- The whole page saves through **one save bar** at the bottom (use, “applies to requests and documents”, roles, defaults for requests); it is highlighted as soon as you change something, “Discard changes” takes everything back.
- The choice, the released roles and the notes are stored in the database and thus in every [backup](sicherung.md); the [full export](export.md) stores them as `struktur/organisation.json`. The details themselves are in the folder.
- If several organisations are ticked and none is chosen, Ablago takes none of them – the previous request entry applies, otherwise the controller stays empty. The Workbench asks for a choice, the [deletion concept](loeschkonzept.md) reports the gap.
