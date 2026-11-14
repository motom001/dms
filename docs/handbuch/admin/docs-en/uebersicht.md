# Workbench and overview {#werkbank-und-ubersicht}

The **workbench** only exists in [Administration mode](verwalten.md#der-verwaltungsmodus): user menu → **Administer Ablago**. Afterwards you land on the **overview** – it shows the messages of your own areas. If a link leads you into the workbench (e.g. from an email "Backup failed"), you land exactly there after "Administer Ablago". You can reach the **Library** in this mode at any time via **Library** at the top, for instance to check what a folder contains. On the left are the areas you may manage, in six groups, ordered by what you want to do right now – build the Library, manage users, bring in post, back up data, change basic settings or track down an error. Which areas you see depends on the [Template](#werkbank-anpassen):

<!-- bereiche:gruppen -->
| Group | Areas |
| --- | --- |
| **Build the Library** | [Use](nutzung.md), [Packages](pakete.md), [Folder types](mappentypen.md), [Views](sichten.md), [Number sequences](nummernkreise.md), [Automations](automatisierungen.md), [Automation templates](automatisierungsvorlagen.md) |
| **Users and security** | [Users](benutzer.md), [Encryption](verschluesselung.md), [Own organisation](organisation.md), [Data protection requests](datenschutz.md#auskunft-erteilen), [Deletion concept](loeschkonzept.md#aus-dem-dms-erzeugen), [Retention expired](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) (only with archive mode), [Stamps](stempel.md) |
| **Post and intake** | [Mailboxes](postfaecher.md), [Intake folder](eingangsordner.md) (only if the folder is mounted), [WebDAV drive](webdav.md), [Search and full text](texterkennung.md), [Synonyms](suche.md#gleichbedeutende-worter) |
| **Back up data** | [Backup](sicherung.md), [Full export](export.md), [Bin](papierkorb.md), [Settings](daten-einstellungen.md) |
| **Settings** | [Email and address](installation.md#e-mail-und-adresse), [Region](region.md), [Languages](sprachen.md), [Tasks](aufgaben.md), [Sign-in protection](anmeldeschutz.md), [Themes](designs.md), [Database connection](installation.md#datenbank-anbindung) |
| **Maintenance and troubleshooting** | [System health](speicherplatz.md), [Log](fehlersuche.md#protokoll), [Reported errors](fehlersuche.md#gemeldete-fehler), [Maintenance](wartungsmodus.md), [Demo data](demo.md) |
<!-- /bereiche:gruppen -->

Every setting has exactly one place. The areas' addresses (`/werkbank/sicherung` …) stayed the same when they were re-sorted in version 0.116; bookmarks and a saved selection under *Customise workbench* still apply.

When the workbench was tidied up, some areas were merged: **Restore** is a section under *Backup*, **Technology** is *Version and updates* and the long database accesses are under *System health*, **Maintenance mode** and **Maintenance operations** together under *Maintenance*, **Search** under *Search and full text*, and "Can go" is now called **Retention expired**. Old addresses such as `/werkbank/darfweg`, `/werkbank/technik` or `/werkbank/wartungsmodus` lead to the new place. The search field at the top of the bar also finds an area by its old name.

Which areas are there you decide under [Customise workbench](#werkbank-anpassen). On a smartphone you go in steps: choose the group at the top, below it the area, with large collections then the entry – with **← Areas** or **← To the list** you go back. At the very bottom of the bar are *Support the project* and the link to this manual.

Next to the areas it says how much is set up there – for instance the number of folder types, number sequences, installed packages, active users or open tasks. The numbers are there immediately when you open the workbench and change as soon as you create or delete something in the area. If nothing is set up, no number is shown.

## How you work in the workbench {#so-arbeitest-du-in-der-werkbank}

Areas in which you create and edit something – whether there are many entries or few: folder types, views, number sequences, automations, packages, users, data protection requests, stamps, tasks, designs, mailboxes – and lists you look through – bin, log and reported errors – have **three parts**: if you choose an area on the left, its list is in the middle and the form of the chosen entry on the right; with **+ New** you create one.

### Searching and filtering in the middle { #suchen-und-filtern }

Above the lists in the middle is the same **search field as in the Library**, below it the list's filters and the number of results – for folder types, views, number sequences, data protection requests and reported problems; tasks and the log use the search field with their filters. The search runs as you type, ignores upper and lower case and knows umlaut variants: “kuendigen” and “kundigen” find “kündigen”. Several words must all occur. The **×** in the field or **Esc** clears it.

Under every result it says **where** Ablago found the word – the area in bold, then the passage with the word highlighted, e.g. “Field “Cancel by” · help text: … the date by which you have to **cancel** …”. More than two places are summed up as “+ 3 more”. A match in the name is highlighted in the name itself. If the search finds nothing, **Reset search and filters** resets everything.

Where entries come from [packages](pakete.md), there is the filter **Package**: *All*, *Own (no package)* or one package, e.g. only *Household*. You can choose the packages that occur in the list. Search and filter work together; the number of results shows the outcome.

The Library's **search box at the top, in the header** does not exist in the Workbench – here you search in the lists in the middle. The **assistant** at the bottom right is here too: under **Manual** it searches the **admin manual** in the Workbench (the user manual in the Library), without the internet, in the manual your installation brings along; plus **Tips** and, with an answering package, **Ask** ([User manual: Assistant](https://help.ablago.app/benutzer/aktuell/en/assistent/)).

All other areas have **two parts**: the areas on the left, the whole page on the right. Small or read-only lists – for instance the long database accesses, the blocked addresses, the existing exports or the latest accesses to the WebDAV drive – are there as a section of their own with a fixed height that you scroll. On a smartphone, **← Areas** leads from such a page directly back to the choice of areas.

Every form ends with the same bar, which stays visible at the bottom when scrolling: on the right the main button with the subject in its name – for instance **Create number sequence** or **Save mailbox** –, to its left **Discard**:

- **Creating:** **Discard draft** closes the form without creating anything, and you are back in the list.
- **Editing:** **Discard changes** resets all fields to the saved state. Both buttons only work once you have changed something; until then the bar says "Unsaved changes".
- **Esc** in the form acts like Discard. If you have changed something, Ablago asks first.
- If you click another entry or area with unsaved changes or close the tab, Ablago asks whether you want to discard the changes.

Buttons such as **Test connection** or **Check now** are above it in the form; on the left of the bar, where it exists, is **Delete** or **Remove**. While such a button is working it shows “Working …”; the result appears right below it, not at the top of the page.

To **create** something, every list has the green **+ New** button at the top right – in the Workbench as in the Library.

## Overview {#ubersicht}

The workbench begins with the **overview**. At the top are the **tiles**: open tasks, text recognition queue, bin, reported errors, stock (folders, documents, storage, users) and version. That way you first see everything that is pending.

Below them are the **messages**, each with a button into the matching area. **This also applies to areas that are hidden in your template.** They are sorted by severity:

1. **Red – critical:** something isn't working here or data is at risk. You have to deal with it.
2. **Yellow – warning:** something is missing or set up in a risky way.
3. **Notice:** a recommendation or something to catch up on.

Within a level, messages with a date (e.g. a failed backup) come first, newest first. If everything is set up, it says "Everything set up".

![Workbench → Overview](bilder/werkbank-uebersicht.png)

The number after *Overview* in the bar names the red and yellow messages still open – without notices and without deliberately accepted ones.

### Deliberately accepting warnings { #bewusst-akzeptieren }

Some warnings you accept deliberately, for instance "The backup folder is not a volume of its own" in a test installation. So that it doesn't stay at the top forever, choose **Acknowledge** on the message, with a short reason if you like, and then **Accept**.

- The message moves into the collapsed section **Deliberately accepted (…)** at the very bottom. There it says who accepted it when and with what reason. With **Show again** you bring it back to the top.
- The [log](fehlersuche.md#protokoll) records every accepting and showing again (module *werkbank*, with the message's identifier from the table below).
- **If the situation changes, the message is back at the top:** when it becomes more severe (a notice becomes yellow, yellow becomes red) or when it was fixed and the same cause occurs again.
- **Red messages can't be accepted.** They have to be dealt with.

Accepted messages apply to everyone who manages this installation.

Two notices you close with a button of their own instead – they don't come back afterwards (both only with "Full administration", in the log with your name):

- **"Good if someone else can manage, in case you're not around."** After setup, Ablago recommends a second person with management permission as long as only one person may manage. **Invite person** leads to *Users → New*; the person gets an invitation link, then you tick **May manage Ablago** for them (see [Who may manage Ablago?](verwalten.md)). If you don't want that, choose **No, thanks** – then the notice stays away for good.
- **"Emergency access was used …"** is shown in red at the top after someone set a new password with the emergency code from the emergency sheet ([I can't get in any more](was-ist-passiert.md#kein-zugang)). With **Read** it disappears.

### All messages of the overview { #meldungen }

| Message | Severity | Identifier in the log |
| --- | --- | --- |
| Emergency access is active (RESCUE file) | red | `notfallzugang` |
| Emergency access was used with the emergency code – until "Read" | red | `notfallzugang.benutzt` |
| Storage limit reached | red | `speicherplatz.grenze` |
| Storage space is getting tight | yellow | `speicherplatz.knapp` |
| Enough space again – end maintenance? | yellow | `speicherplatz.wartung-beenden` |
| Automations paused | red | `automatisierung.angehalten` |
| Planned runs paused (the person may no longer carry them out) | yellow | `ablaeufe.angehalten` |
| Automations with failed runs | yellow | `automatisierung.fehlgeschlagen` |
| Reminders taken over on the update | notice | `automatisierung.umgezogen` |
| No daily summary, favourite reports or “Post for you” without the package "Notifications" | notice | `automatisierung.ohne-benachrichtigungen` |
| No switched-on automation “Post for you” (package older than 1.3.0 or switched off) | notice | `automatisierung.ohne-post-fuer-dich` |
| Addresses accept [calls from outside](automatisierungen.md#aufruf-von-aussen) – with **Switch all off** instead of “Acknowledge” | notice | `automatisierung.aufrufe` |
| CPU or memory above 90 % for 5 minutes | yellow | `auslastung` |
| Bottleneck (waiting time, connections, workers, overload) | yellow | `engpass` |
| Search extensions missing or in the wrong place | yellow | `erweiterungen` |
| Maintenance mode announced or active | yellow | `wartung` |
| No key for passwords yet | yellow | `tresor.fehlt` |
| The key for passwords is missing | red | `tresor.verloren` |
| The key file doesn't match | red | `tresor.falsch` |
| The key file is not on a volume of its own | yellow | `tresor.volume` |
| Passwords unreadable or unencrypted | yellow | `tresor.betroffen` |
| Mailbox: sign-in expired or revoked | red | `postfach.abgelaufen` |
| Mailbox not signed in yet | yellow | `postfach.anmelden` |
| The last backup failed | red | `sicherung.fehler` |
| There is no backup yet | yellow | `sicherung.keine` |
| The last backup is older than 2 days | yellow | `sicherung.alt` |
| The emergency sheet is missing, belongs to an earlier key, has no emergency code yet or its emergency code was used (button **Go to emergency sheet** leads to [Encryption](verschluesselung.md#notfallblatt)) | yellow | `sicherung.notfallblatt` |
| The last test restore failed | red | `sicherung.probe-fehler` |
| Test restore missing or old | notice | `sicherung.probe` |
| The backup folder is not a volume of its own | yellow | `sicherung.volume` |
| Backups on the same disk as the documents | notice | `sicherung.gleiche-platte` |
| Off-site backup failed | red | `sicherung.extern-fehler` |
| Off-site backup more than 2 days behind | yellow | `sicherung.extern-alt` |
| The [export folder](export.md#export-ordner) is inside the backup folder | red | `export.im-sicherungsordner` |
| Exports moved out of the backup folder on the update | notice (red if something was left behind) | `export.umzug` |
| dms-komplett: the database is only stored inside the container (`/data/postgres` without a volume) and would be lost with the next update – [rescue the data](https://help.ablago.app/installieren/aktuell/en/komplett/#datenbank-retten) | red | `datenbank.ohne-volume` |
| DATABASE_URL differs from the database connection | yellow | `anbindung.abweichend` |
| Database connection changed, restart needed | yellow | `anbindung.neustart` |
| DMS_LASTTEST in a real installation | yellow | `lasttest` |
| Package still needs settings | yellow | `paket-einstellungen` |
| New: exclude folder types from AI services (once after the update, with AI packages; “Got it”) | notice | `ki.typen` |
| Skipped during setup | notice | `einrichtung` |
| Good if someone else can manage – only one person may manage | notice | `verwaltung.zweite-person` |
| Environment variables that are no longer needed (each with a reason) | notice | `variablen` |
| Email sending is not set up | yellow | `mail` |
| Open reported errors | yellow | `fehlermeldungen` |
| Intake folder: files older than the limit (default 180 days) | yellow | `eingangsordner.alt` |
| Intake folder: all files together above the limit (default 2 GB) | yellow | `eingangsordner.groesse` |
| Intake folder: files in `fehler/` | yellow | `eingangsordner.fehler` |
| Intake folder: more files than the limit (default 100) | yellow | `eingangsordner.anzahl` |
| Intake folder: folder belongs to no user (post without “To”) | yellow | `eingangsordner.ohne-person` |
| Intake folder: a person’s folder could not be renamed after the e-mail address changed | yellow | `eingangsordner.umbenennen` |
| Text recognition is now a package | notice (yellow as soon as scans are waiting) | `texterkennung.paket` |
| Documents with an error in text recognition | yellow | `texterkennung.fehler` |
| Document files are missing from the storage folder (e.g. `/data/files` without a volume) – details in the log, module *Documents* | red | `dateien.fehlen` |
| Nobody gets the tasks without a recipient | notice | `aufgabenempfaenger` |
| Tasks with people without read permission | yellow | `aufgaben.ohne-leserecht` |
| Tasks without a recipient | notice | `aufgaben.ohne-empfaenger` |
| Folders that don't fit the definition | notice | `mappen.unpassend` |

For messages that exist per mailbox, package, emergency access, used emergency code, intake folder subfolder or skipped step, the identifier in the log is followed by a colon and the id, e.g. `postfach.anmelden:…`.

## Customising the workbench { #werkbank-anpassen }

Not everyone needs every area. A household may never touch number sequences, mailboxes or the technical log. Under **Customise workbench** (at the very bottom of the bar) you decide which areas are on the left.

!!! info "Hiding doesn't switch anything off"
    A hidden area keeps running. A mailbox keeps collecting post, the backup keeps running. Direct links, the help and the overview's buttons still lead there. **Notices always get through:** if a hidden area has a problem, for example "Backup too old", it is in the overview, and the area appears with its notice in the bar.

**Templates** for everyone who manages:

- **Household**: slim, only what a family needs for setting up and backing up. New installations start with it. **The self-employed and small businesses** choose **Business** right after setup.
<!-- bereiche:organisation -->
- **Business**: additionally Number sequences, Automations, Automation templates, Own organisation, Data protection requests, Deletion concept, Retention expired, Mailboxes, Intake folder, Search and full text, Synonyms, Sign-in protection, Themes, Log, Reported errors, Maintenance.
<!-- /bereiche:organisation -->
- **Everything**: every area. It stays like this for installations set up before version 0.70 until you choose something else.

Afterwards you can deviate per area:

- **for everyone**: the area is in the bar for every person who may manage it.
- **only for me**: the area is additionally only in your bar, for example *Log* if you like to check it but the others don't.

**Expert mode:** a household rarely needs some areas, but they are useful if you want to dig deeper – currently the [search](suche.md) with typos and synonyms. The template **Household** hides them; with the tick **Expert mode – only for me** they appear in your bar. That only applies to you and is not a permission – the others who manage see their own bar. In the list of areas they are marked "in expert mode". With **Business** and **Everything** they are visible anyway.

If a hidden area is set up, for instance a mailbox or sign-in via a provider, it says "set up, but hidden". At the bottom of the bar it says how many areas are hidden. A click on it shows them all temporarily.

![Workbench → Customise workbench](bilder/werkbank-anpassen.png)

### Which area do I need for what? {#welchen-bereich-brauche-ich-wofur}

<!-- bereiche:wofuer -->
| Area | What for | In the preset |
| --- | --- | --- |
| [Use](nutzung.md) | Whether the Library is also used for work – folder types then show their work-related fields and sections | Household, Business |
| [Packages](pakete.md) | Install ready-made folder types and views | Household, Business |
| [Folder types](mappentypen.md) | Build your own kinds of folders | Household, Business |
| [Views](sichten.md) | Arrange the collections on the left in the library | Household, Business |
| [Number sequences](nummernkreise.md) | Sequential numbers, e.g. for invoices | Business |
| [Automations](automatisierungen.md) | Set up procedures following the pattern When – And – Then: on an event or date set fields or give someone a task | Business, Household in expert mode |
| [Automation templates](automatisierungsvorlagen.md) | Templates for runs on a folder: “Assign task”, “Remind”, follow-up – when they run, who gets the task and what is asked when applying them | Business, Household in expert mode |
| [Users](benutzer.md) | Create users and roles | Household, Business |
| [Encryption](verschluesselung.md) | The key for passwords and backups | Household, Business |
| [Own organisation](organisation.md) | Name, address and controllers of your own business – kept at the organisation in the Library | Business |
| [Data protection requests](datenschutz.md#auskunft-erteilen) | Access requests under Art. 15 GDPR for customers, tenants and contacts: request, create, deliver, evidence | Business |
| [Deletion concept](loeschkonzept.md#aus-dem-dms-erzeugen) | Create a deletion concept, deletion log and which folder types contain personal data | Business |
| [Retention expired](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) | Check and delete folders whose retention period has expired (only with archive mode) | Business |
| [Stamps](stempel.md) | Templates for stamps and watermarks when passing on | Household, Business |
| [Mailboxes](postfaecher.md) | Fetch post from an email account | Business |
| [Intake folder](eingangsordner.md) | Take over scans from a folder | Business |
| [WebDAV drive](webdav.md) | Connect the library in Explorer, Finder or the Files app and drop files into it | Household, Business |
| [Search and full text](texterkennung.md) | Recognise text in scanned documents, archive version, shrink PDFs, typos and the word index for the search | Business, Household in expert mode |
| [Synonyms](suche.md#gleichbedeutende-worter) | Groups of words the search treats alike (e.g. car, vehicle, auto): add your own, view those from packages | Business, Household in expert mode |
| [Backup](sicherung.md) | Set up, check and restore backups | Household, Business |
| [Full export](export.md) | Take all data with you in open formats | Household, Business |
| [Bin](papierkorb.md) | Bring back deleted folders | Household, Business |
| [Settings](daten-einstellungen.md) | How long deleted items stay in the bin and whether users may export their own data | Household, Business |
| [Email and address](installation.md#e-mail-und-adresse) | Email sending and Ablago’s address | Household, Business |
| [Region](region.md) | Country, federal state and time zone – for public holidays, “today” and the times of reminders and summaries | Household, Business |
| [Languages](sprachen.md) | If English or another language is also spoken in your library. | Household, Business |
| [Tasks](aufgaben.md) | Keep an eye on all open tasks of all users | Household, Business |
| [Sign-in protection](anmeldeschutz.md) | Require two-factor, sign-in through a provider, locked addresses | Business |
| [Themes](designs.md) | Logo, colours and custom CSS | Business |
| [Database connection](installation.md#datenbank-anbindung) | The connection to the database | Everything only |
| [System health](speicherplatz.md) | See how the server is doing: storage, load of CPU, memory, network and database, version and updates | Household, Business |
| [Log](fehlersuche.md#protokoll) | Read the technical log | Business |
| [Reported errors](fehlersuche.md#gemeldete-fehler) | Errors users have reported | Business |
| [Maintenance](wartungsmodus.md) | Temporarily lock users out (maintenance mode) and one-off upkeep work | Business |
| [Demo data](demo.md) | Example folders to try things out | Everything only |
<!-- /bereiche:wofuer -->
