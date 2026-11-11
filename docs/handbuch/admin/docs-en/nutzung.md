# Use: private or for work {#nutzung-privat-oder-beruflich}

**Workbench → Build the Library → Use** sets once for the whole Library whether it is **also used for work** – for example by Katrin as a self-employed person, in a club or in the joinery. The default is *no*: a new Library counts as private.

This is deliberately **only this one attribute**. Everything else follows from the folders’ field values or from the installed [packages](pakete.md).

## What the attribute does {#was-das-merkmal-bewirkt}

- **Folder types** use it to show their work-related fields and sections – via [Show if …](mappentypen.md#anzeigen-wenn) with the condition *Library is also used for work*. In a purely private Library Lena sees none of it; the folder type is the same.
- **Conditions** of [permissions](berechtigungen.md), [views](sichten.md#bedingungen) and [automations](automatisierungen.md) can look at it (“Library is also used for work”, reversible). It applies to all folders alike.
- The **Workbench template** (which areas are listed on the left) follows it: for work → *Business*, otherwise *Household*. It follows the attribute as long as nobody has adjusted the sidebar. The template stays a Workbench setting; the attribute applies to the Library.
- **Packages** can suggest a longer [retention when used for work](archiv.md#archivmodus-aus-einem-paket) for their new folder types; it applies if the attribute is set when installing. If you switch it later, the archive mode stays as it is – you can change it on the folder type.

Hiding is **for tidiness, not protection**: values of hidden fields stay saved and appear in the [API](api.md), the [full export](export.md) and [data access requests](datenschutz.md). Who may see what is set by the permissions.

## Good to know {#gut-zu-wissen}

- Only people with **Full administration** may change the attribute ([Who may administer Ablago?](verwalten.md)); the area can’t be granted on its own. Everyone signed in may read it – the folder form needs it.
- When you switch it, Ablago checks right away which folders now have required fields left open (for example in a section only shown for work) and shows them as “doesn’t fit” as usual.
- The [setup file](einrichtungsdatei.md) knows it as `optionales: beruflich: true`. The setup assistant will ask about it itself later.
- The attribute is stored in the database and is therefore in every [backup](sicherung.md). The [full export](export.md) stores it as `struktur/merkmale.json`, and the API returns it read-only at `GET /api/v1/merkmale`.
