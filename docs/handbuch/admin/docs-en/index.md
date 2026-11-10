# Administrator manual {#administratorhandbuch}

This manual is for everyone who **installs, sets up and runs** Ablago. How to work with folders day to day is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/) – this manual refers to it instead of repeating it.

!!! tip "Just installed?"
    What you should still do now is summarised under [Set up in five steps](fuenf-schritte.md). The table below is the reference for later.

![Workbench: editing a folder type](bilder/werkbank-mappentyp.png)

## An administrator's tasks {#aufgaben-eines-administrators}

| Task | Where | Chapter |
| --- | --- | --- |
| Install Ablago | NAS, home server, app store | [How do I get a DMS?](https://help.ablago.app/installieren/aktuell/en/) |
| Set up after the installation | setup wizard, database, reverse proxy | [Setup and operation](installation.md) |
| Install a new version, back up data | NAS | [Updating and backing up](aktualisieren.md) |
| Set which folders exist and what's in them | Workbench → folder types | [Folder types](mappentypen.md) |
| Set which views the Library offers | Workbench → Views | [Views](sichten.md) |
| Invite users, assign roles, block accounts | Workbench → Users | [Users and roles](benutzer.md) |
| Adjust colours, logo and lettering | Workbench → Designs | [Themes](designs.md) |
| Try things out with sample data | Workbench → Demo data | [Demo data](demo.md) |
| Overview of what needs doing | Workbench → Overview | [Workbench and overview](uebersicht.md) |
| Set which areas the workbench shows | Workbench → Customise the workbench (at the bottom of the sidebar) | [Customise the workbench](uebersicht.md#werkbank-anpassen) |
| Set who may see and change what | Workbench → folder types → Permissions, Workbench → Views | [Permissions](berechtigungen.md) |
| Provide access copies, delete on request, keep periods (GDPR) | Workbench → Data protection requests, Retention expired, bin | [Data protection in Ablago](datenschutz.md) |
| Back up and restore data | Workbench → Backup, Restore | [Backup](sicherung.md), [Restoring](wiederherstellen.md) |
| Take all data along, readable even without Ablago | Workbench → Full export | [Exporting data](export.md) |
| Find errors, handle users' reports | Workbench → Maintenance and troubleshooting | [Troubleshooting](fehlersuche.md) |
| Connect other programs | create a separate user for the program, sign in as that user, then My account → Security → API keys (administrators don't get keys) | [Interface](api.md) |

How Ablago is built technically and why is described in [Technology](technik.md) and [Decisions](entscheidungen.md).

## Roles in Ablago { #rollen-im-dms }

- **Administrator** – additionally sees the **workbench** and may set up everything. There is always at least one active administrator.
- **Member** – works in the Library.

This is a user's **system role**. In addition there are freely creatable **roles** (such as "Parents" or "Taxes and finances"). They give no permissions by themselves – but via rules in the [permissions](berechtigungen.md) they do. See [Users and roles](benutzer.md).

!!! info "Who may see what?"
    - **Without rules, everyone may do everything.** Every Ablago installation starts this way; for a family that is often enough.
    - **Per folder type**, you set in the [permissions](berechtigungen.md) who may create, read, edit and delete folders and see passwords – with rules, e.g. via roles, and a test run.
    - **Per view**, you set on the view who sees it, may create there and may export from it ([Views → Permissions](sichten.md#berechtigungen)).
    - **The rules don't apply to administrators:** they always see and may do everything in the Library.
    - What applies to a user in the end is shown to them under "My account" in **My permissions**.

## New versions {#neue-versionen}

What has changed in which version is listed under [New in this version](neu.md) and on GitHub under [Releases (changelog)](https://github.com/motom001/dms/releases). The workbench shows the installed version under **Technology**; there is also a link to all changes since your version.

### The manual for your version {#das-handbuch-zu-deiner-version}

Every installation brings the manual of its version – even without the internet. The help in the menu, the link in the workbench and every **?** open it. Online at `https://help.ablago.app/admin/aktuell/en/` there is always the manual for the newest version. Older addresses with a version number (e.g. `…/admin/v0.22/sicherung/`) lead to the same page there.

!!! tip "The ? next to headings"
    In the workbench, every area and many subheadings have a small **?** – always directly after the heading, never at the end of the text below it. It opens exactly the matching section of this manual in a new tab. A **?** on a single field or checkbox sits at its label and explains just that field.

Please submit wishes and bugs as an [issue](https://github.com/motom001/dms/issues/new?template=wunsch.md) – describe briefly what you want to do and how you notice that it works; what carries the label `freigegeben` gets built.

## Support the project {#projekt-unterstutzen}

Ablago is free software (Apache-2.0). Support is possible via GitHub Sponsors:

[Support the project (GitHub Sponsors)](https://github.com/sponsors/motom001)
