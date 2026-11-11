# Own organisation {#eigene-organisation}

You keep name, address, contact and the controllers under the GDPR **once** – at the organisation in the Library that carries the attribute **“own organisation”**. Every place in Ablago that needs these details takes them from there. Katrin creates the joinery Brandt as an organisation, ticks “Own organisation” and enters address and contact – done.

**Workbench → Users and security → Own organisation** is only a slim link to it. The area belongs to the Workbench preset *Business* (so with [Use](nutzung.md) “for work”); in a household you can show it through the Workbench view if needed.

!!! note "No legal advice"
    Whether and whom you must name as controller or data protection officer should be checked by an expert if in doubt.

## Setting up

1. The attribute comes with the package **Basis from 1.7.0** (folder type *Organisation*, field *Own organisation*). If it is missing, the Workbench says so and leads to the [packages](pakete.md).
2. In the Library open or create your own organisation and tick **Own organisation**. The tab *Basic data* then shows the section **Data protection**:
    - **Controller** – usually the organisation itself (leave it empty or point it to itself), otherwise a person, for example the owner.
    - **Data protection officer** – only if you have one.
3. Several own organisations are possible (private and business, two companies) – this is only an assignment, not a separate accounting unit. You then choose in the Workbench **which one applies to requests and documents**.

If there already was a controller in the [request](datenschutz.md) settings, the Workbench shows it under *Previous entry for requests*. **Create as own organisation** turns it into an organisation with the attribute (name, street, postcode and town, email and phone as far as Ablago recognises them in the text; the rest goes into the description). Until then the previous entry still applies.

## Who may set the attribute

The attribute decides who appears as controller on requests and in the deletion concept. That is why the field is protected:

- It may be changed by whoever may manage the area *Own organisation* **in administration mode** (or has *Full administration*) – see [Who may administer Ablago?](verwalten.md).
- In addition anyone with a role you release under **Who may set “own organisation”** – provided they may edit the organisation anyway.
- Everyone else sees the field read-only. Through the [interface](api.md), from packages and automations the answer is **403** – administration rights never apply through an API key.

Every change to the attribute, the controller or the data protection officer is written to the **system log** (module data protection), shown as a **note** at the top of the page (with “Acknowledged”) and – with email sending set up – mailed to everyone who manages the area. The choice “applies to requests” and the released roles are logged as well.

## What Ablago reads – and what not

Ablago reads the details **by the meaning of the fields**, not by fixed keys – so it keeps working when you adapt the folder type. It reads with system rights, so even if you may not see the folder yourself, but **only this fixed list**:

| Detail | From |
| --- | --- |
| Name, street, house number, postcode, town, email, phone | per meaning the **first** text field with “Fill from document” and this kind, in tab order (so *Name* comes before *Short name*) |
| Controller, data protection officer | the link fields of the section *Data protection* – for the person or organisation referred to, again only the list above |

Ablago never reads passwords, customer number, IBAN, description, documents or anything else for this. The Workbench does not show the folder’s title either (the title template could contain other fields). Changes are only possible in the Library with your normal rights; **Edit in the Library** takes you there.

## Where Ablago uses the details

The Workbench lists this under **Where Ablago uses these details**:

| Place | Result of the inventory (#995) |
| --- | --- |
| [Data protection request](datenschutz.md): sender on the cover sheet, email to the person | refers here |
| [Deletion concept](loeschkonzept.md): controller, data protection contact | refers here |
| Recognition: sender of incoming post | the own organisation is **never** the sender – even if its letterhead is in the text |
| Folder types with [Show if …](mappentypen.md#anzeigen-wenn) “refers to an own organisation” (e.g. outgoing invoice) | refers here |
| Sender name for sending email ([Operation](installation.md#e-mail-und-adresse)) | deliberately stays separate – Ablago’s technical sender, also without a business |
| Cover sheets of exports and requests: name of the installation | deliberately stays separate (name of the Library); the controller comes from here |
| Letterhead of text templates (#1040) | is to refer here once text templates exist as PDF |
| [Emergency sheet](verschluesselung.md) “Whom to ask?” (#812) | deliberately stays separate – it lists trusted people, not the business |

## Good to know

- The choice, the released roles and the notes are stored in the database and thus in every [backup](sicherung.md); the [full export](export.md) stores them as `struktur/organisation.json`. The details themselves are in the folder.
- If several organisations are ticked and none is chosen, Ablago takes none of them – the previous request entry applies, otherwise the controller stays empty. The Workbench asks for a choice, the [deletion concept](loeschkonzept.md) reports the gap.
