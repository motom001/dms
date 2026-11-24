# Workbench and overview {#werkbank-und-ubersicht}

The **workbench** only exists in [Administration mode](verwalten.md#der-verwaltungsmodus): user menu → **Administer Ablago**. Afterwards you land on the **overview** – it shows the messages of your own areas. If a link leads you into the workbench (e.g. from an email "Backup failed"), you land exactly there after "Administer Ablago". You can reach the **Library** in this mode at any time via **Library** at the top, for instance to check what a folder contains. On the left are the areas you may manage, in groups, ordered by what you want to do right now – build the Library, manage users, data protection, bring in post, back up data, change basic settings or track down an error. Which areas you see depends on the [Template](#werkbank-anpassen):

<!-- bereiche:gruppen -->
| Group | Areas |
| --- | --- |
| **Build the Library** | [Packages](pakete.md), [Example Library](beispielablage.md), [Folder types](mappentypen.md), [Views](sichten.md), [Number sequences](nummernkreise.md), [Automations](automatisierungen.md), [Automation templates](automatisierungsvorlagen.md), [Tours](rundgaenge.md), [Tips](tipps.md) |
| **Users and security** | [Users](benutzer.md), [Encryption](verschluesselung.md), [Retention expired](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) (only with archive mode), [Stamps](stempel.md) |
| **Data protection** | [Data protection requests](datenschutz.md#auskunft-erteilen), [Deletion concept](loeschkonzept.md#aus-dem-dms-erzeugen), [Deletion log](datenschutz.md#loschprotokoll) |
| **Post and intake** | [Mailboxes](postfaecher.md), [Intake folder](eingangsordner.md) (only if the folder is mounted), [WebDAV drive](webdav.md), [Search and full text](texterkennung.md), [Synonyms](suche.md#gleichbedeutende-worter) |
| **Back up data** | [Backup](sicherung.md), [Full export](export.md), [Bin](papierkorb.md), [Back up data → Settings](daten-einstellungen.md) |
| **Settings** | [Email and address](installation.md#e-mail-und-adresse), [Region](region.md), [Languages](sprachen.md), [Own organisation](organisation.md), [Tasks](aufgaben.md#werkbank-aufgaben), [Sign-in protection](anmeldeschutz.md), [Themes](designs.md), [Database connection](installation.md#datenbank-anbindung) |
| **Maintenance and troubleshooting** | [System health](speicherplatz.md), [Log](fehlersuche.md#protokoll), [Reported errors](fehlersuche.md#gemeldete-fehler), [Maintenance](wartungsmodus.md), [Load test data](demo.md) |
<!-- /bereiche:gruppen -->

Every setting has exactly one place. The areas' addresses (`/werkbank/sicherung` …) stayed the same when they were re-sorted in version 0.116; bookmarks and a saved selection under *Customise workbench* still apply.

When the workbench was tidied up, some areas were merged: **Restore** is a section under *Backup*, **Technology** is *Version and updates* and the long database accesses are under *System health*, **Maintenance mode** and **Maintenance operations** together under *Maintenance*, **Search** under *Search and full text*, and "Can go" is now called **Retention expired**. Old addresses such as `/werkbank/darfweg`, `/werkbank/technik` or `/werkbank/wartungsmodus` lead to the new place. The search field at the top of the bar also finds an area by its old name.

Which areas are there you decide under [Customise workbench](#werkbank-anpassen). At the very bottom of the bar are *Support the project* and the link to this manual. On a phone you go in steps, see [The workbench on a phone](#am-handy).

Next to the areas it says how much is set up there – for instance the number of folder types, number sequences, installed packages, active users or open tasks. The numbers are there immediately when you open the workbench and change as soon as you create or delete something in the area. If nothing is set up, no number is shown.

## How you work in the workbench {#so-arbeitest-du-in-der-werkbank}

Areas in which you create and edit something – whether there are many entries or few: folder types, views, number sequences, automations, packages, users, data protection requests, stamps, tasks, designs, mailboxes – and lists you look through – bin, log and reported errors – have **three parts**: if you choose an area on the left, its list is in the middle and the form of the chosen entry on the right; the green button at the top of the list creates one – it names what you create (**+ Folder type**, **+ View**, **+ User** …).

### Searching and filtering in the middle { #suchen-und-filtern }

Above the lists in the middle is the same **search field as in the Library**, below it the list's filters and the number of results – for folder types, views, number sequences, data protection requests and reported problems; tasks and the log use the search field with their filters. The search runs as you type, ignores upper and lower case and knows umlaut variants: “kuendigen” and “kundigen” find “kündigen”. Several words must all occur. The **×** in the field or **Esc** clears it.

Under every result it says **where** Ablago found the word – the area in bold, then the passage with the word highlighted, e.g. “Field “Cancel by” · help text: … the date by which you have to **cancel** …”. More than two places are summed up as “+ 3 more”. A match in the name is highlighted in the name itself. If the search finds nothing, **Reset search and filters** resets everything.

Where entries come from [packages](pakete.md), there is the filter **Package**: *All*, *Own (no package)* or one package, e.g. only *Household*. Built-in entries such as the folder types *User*, *Post* and *Role* are under *Ablago (built in)*, not among your own. You can choose the packages that occur in the list. Search and filter work together; the number of results shows the outcome.

The Library's **search box at the top, in the header** does not exist in the Workbench – here you search in the lists in the middle. The **assistant** is here too, at the bottom right in the same place as in the library – on a phone as well, with its own strip at the bottom: under **Manual** it searches the **admin manual** in the Workbench (the user manual in the Library), without the internet, in the manual your installation brings along; plus **Tips** and, with an answering package, **Ask** ([User manual: Assistant](https://help.ablago.app/benutzer/aktuell/en/assistent/)).

All other areas have **two parts**: the areas on the left, the whole page on the right. Small or read-only lists – for instance the long database accesses, the blocked addresses, the existing exports or the latest accesses to the WebDAV drive – are there as a section of their own with a fixed height that you scroll.

Every form ends with the same bar, which stays visible at the bottom when scrolling: on the right the main button with the subject in its name – for instance **Create number sequence** or **Save mailbox** –, to its left **Discard**:

- **Creating:** **Discard draft** closes the form without creating anything, and you are back in the list.
- **Editing:** **Discard changes** resets all fields to the saved state. Both buttons only work once you have changed something; until then the bar says "Unsaved changes".
- **Esc** in the form acts like Discard. If you have changed something, Ablago asks first.
- If you click another entry or area with unsaved changes or close the tab, Ablago asks whether you want to discard the changes.

Buttons such as **Test connection** or **Check now** are above it in the form; on the left of the bar, where it exists, is **Delete** or **Remove**. While such a button is working it shows “Working …”; the result appears right below it, not at the top of the page.

To **create** something, every list has a green button at the top right that names the item – in the Workbench **+ Folder type**, **+ Number sequence**, **+ Template** …, in the Library for example **+ Contract**.

## The workbench on a phone { #am-handy }

On a phone the workbench uses the screen for the content. What it looks like depends on the **width**, not on the device: up to 767 pixels – any phone – you get the phone view; an **iPad in portrait** (from 768 pixels) and in landscape shows the full workbench as on a computer. Turn the device and the view changes with it. On an iPad in portrait (768 to 820 pixels) the bar with the areas starts collapsed so that the list and the page have room; the narrow tab on the left expands it, and it then stays that way. There is no separate template for the phone: your [template](#werkbank-anpassen) applies on all devices.

You go in steps, as in the settings of a phone:

1. **Areas** – on the overview via **Areas ›** at the top. Below the search field come the areas **on the go** first: overview, system status, backup, mailboxes, maintenance, users, encryption (with the emergency sheet) and packages – what you need when something is stuck while you are out. Below that, **All areas** holds the rest, by group: tap a group, for instance *Build the Library*, and its areas appear below. At the very bottom are hidden areas to expand, *Customise workbench*, *Support the project* and the link to this manual.
2. **List or page** – without the areas above it, the content starts at the top. Above it there is only the way back: **‹ Build the Library** leads to the areas with this group, for the areas on the go **‹ Areas**.
3. **Entry** – in collections such as folder types or users; **‹ To the list** leads back.

On a phone **nothing is locked**: every area stays reachable, also through the search field. Setting up folder types, automations or packages works on a phone too, but is easier on a computer or tablet. At the top, as on a computer, is the quiet line of [administration mode](verwalten.md#der-verwaltungsmodus).

### What works on a phone { #was-am-handy-geht }

What you need on the go when something is wrong is **fully usable** on a phone – every field reachable, large touch targets, nothing wider than the screen, the result right next to the button:

| Task | Where |
|---|---|
| Check that everything is running | **Overview**; on a phone **System status** shows load and storage first, the thresholds after that |
| React to a message | **Overview**, e.g. after “Backup failed” back up again under **Backup** |
| Act right away | **Backup** → **Back up now**; **Mailboxes** → **Fetch now**; **Maintenance** → **Lock immediately** or **End maintenance**, on a phone right below the status |
| Users | create; **Lock access** (for instance when a phone is lost) and **Sign out everywhere** at the top of the user; **Create password link** under *Sign-in and security* |
| Emergency | **Encryption** with the emergency sheet; emergency access under **Sign-in protection**; confirm administration |
| Packages | **install** from the catalogue – preview, confirm permissions, done, with the package's defaults |

**Protected just as on a computer:** sensitive actions ask the same question on a phone – the focus starts on **Cancel** – and need the same fresh sign-in as on a computer, for instance when you allow emergency access from the internet. With a passkey (such as Face ID) that takes one tap; a phone is never checked less.

On a phone the introduction of a page is a single line; **More** shows the whole text.

Pages for building – folder types, views, number sequences, automations and their templates, tours, tips, stamps and designs – work on a phone too. At the top a quiet line then says “Easier on a computer or tablet.”; nothing is locked or redirected.

## Overview {#ubersicht}

The workbench begins with the **overview**. It is split in two like the start page of the Library: the areas on the left, the overview itself wide on the right – on a phone the overview alone, where **Areas ›** at the top leads to the areas. At the very top is the card **[What Ablago may do](was-ablago-darf.md)** with your two answers and **Change …**. Below it are the **tiles**: open tasks, text recognition queue, bin, reported errors, stock (folders, documents, storage, users) and version. That way you first see everything that is pending.

Below them, under **Notes**, are the **messages**, each exactly once: one or two sentences, below them a button with the action (such as **Set up email**) and next to it **Acknowledge** – **No, thanks** only where the note really asks a question. **This also applies to areas that are hidden in your template.** They are sorted by severity:

1. **Red – critical:** something isn't working here or data is at risk. You have to deal with it.
2. **Yellow – warning:** something is missing or set up in a risky way.
3. **Notice:** a recommendation or something to catch up on.

Within a level, messages with a date (e.g. a failed backup) come first, newest first. If everything is set up, it says "Everything set up".

![Workbench → Overview](bilder/werkbank-uebersicht.png)

When you come back to the overview after an action – or bring the tab to the front again – it reloads its notes by itself; whatever is done disappears. You no longer need **Reload** at the top right for that; it stays for the impatient.

**Recommended packages** appear as **one** note: one row per missing package with a sentence on what it is for (text recognition: so scans become searchable; notifications: daily summary, post for you) and **Install**; below that **View all packages**. Installed packages disappear from the list; once all are there, the note disappears. Migration notes such as "Text recognition is now a package" only appear in installations that come from an older version, not after a fresh setup.

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
| Ablago can't tell the home network from the internet: requests arrive with the gateway address of the Docker network ([Home network can't be determined](anmeldeschutz.md#heimnetz-nicht-bestimmbar)) | yellow | `heimnetz.gateway` |
| TRUST_PROXY names a whole network instead of your proxy's address: requests come directly from the gateway, and the network covers it ([Home network can't be determined](anmeldeschutz.md#heimnetz-nicht-bestimmbar)) | yellow | `proxy.netz` |
| PUID and PGID are missing – data folders on a NAS folder now belong to the default 1000:1000 ([Without administrator rights](aktualisieren.md#ohne-root)) | yellow | `kennung.puid` |
| Storage limit reached | red | `speicherplatz.grenze` |
| Storage space is getting tight | yellow | `speicherplatz.knapp` |
| Enough space again – end maintenance? | yellow | `speicherplatz.wartung-beenden` |
| Automations paused | red | `automatisierung.angehalten` |
| Planned runs paused (the person may no longer carry them out) | yellow | `ablaeufe.angehalten` |
| Automations with failed runs | yellow | `automatisierung.fehlgeschlagen` |
| Reminders taken over on the update | notice | `automatisierung.umgezogen` |
| Package "Notifications" installed, but no daily summary switched on (if the package is missing, it is under "Recommended packages") | notice | `automatisierung.ohne-benachrichtigungen` |
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
| After a new setup: next step, set up an off-site copy ([First backup](sicherung.md#erste-sicherung); then replaces the "same disk" notice) | notice (yellow on the same disk) | `sicherung.ausser-haus` |
| The first backup after setup or its test failed – the cause is shown under Workbench → Backup | red | `sicherung.erste-fehler` |
| Off-site backup failed | red | `sicherung.extern-fehler` |
| Off-site backup more than 2 days behind | yellow | `sicherung.extern-alt` |
| “Keep only the newest locally” currently not in effect | yellow | `sicherung.nur-neueste` |
| The [export folder](export.md#export-ordner) is inside the backup folder | red | `export.im-sicherungsordner` |
| Exports moved out of the backup folder on the update | notice (red if something was left behind) | `export.umzug` |
| dms-komplett: the database is only stored inside the container (`/data/postgres` without a volume) and would be lost with the next update – [rescue the data](https://help.ablago.app/installieren/aktuell/en/komplett/#datenbank-retten) | red | `datenbank.ohne-volume` |
| DATABASE_URL differs from the database connection | yellow | `anbindung.abweichend` |
| Database connection changed, restart needed | yellow | `anbindung.neustart` |
| DMS_LASTTEST in a real installation | yellow | `lasttest` |
| The [Example Library](beispielablage.md) is set up (until you remove it) | notice | `beispielablage` |
| Package still needs settings | yellow | `paket-einstellungen` |
| New: exclude folder types from AI services (once after the update, with AI packages; “Acknowledge”) | notice | `ki.typen` |
| New: What Ablago may do – please take a look once (once after the update; “Acknowledge”) | notice | `darf.neu` |
| Skipped during setup (address and email sending; packages are under "Recommended packages") | notice | `einrichtung` |
| Good if someone else can manage – only one person may manage | notice | `verwaltung.zweite-person` |
| Environment variables that are no longer needed (each with a reason) | notice | `variablen` |
| Email sending is not set up | yellow | `mail` |
| Recommended packages: text recognition, notifications – **Install** per row | notice (yellow as soon as scans wait for text recognition) | `pakete.empfohlen` |
| Open reported errors | yellow | `fehlermeldungen` |
| Intake folder: files older than the limit (default 180 days) | yellow | `eingangsordner.alt` |
| Intake folder: all files together above the limit (default 2 GB) | yellow | `eingangsordner.groesse` |
| Intake folder: files in `fehler/` | yellow | `eingangsordner.fehler` |
| Intake folder: more files than the limit (default 100) | yellow | `eingangsordner.anzahl` |
| Intake folder: folder belongs to no user (post without “To”) | yellow | `eingangsordner.ohne-person` |
| Intake folder: a person’s folder could not be renamed after the e-mail address changed | yellow | `eingangsordner.umbenennen` |
| Text recognition is now a package (only after an update from an older version) | notice (yellow as soon as scans are waiting) | `texterkennung.paket` |
| Documents with an error in text recognition | yellow | `texterkennung.fehler` |
| A tool for reading PDFs is missing: no text from PDFs, no page images ([Built-in tools](fehlersuche.md#werkzeuge); button **View and check again**) | red | `werkzeug.fehlt:poppler` |
| A tool for editing PDFs is missing: protected PDFs can't be unlocked, shrinking works less well ([Built-in tools](fehlersuche.md#werkzeuge)) | yellow | `werkzeug.fehlt:qpdf` |
| Fonts for PDFs are missing: PDFs without embedded fonts show no text in page images, thumbnails and the archive version ([Built-in tools](fehlersuche.md#werkzeuge)) | yellow | `schriften.fehlen` |
| Document files are missing from the storage folder (e.g. `/data/files` without a volume) – details in the log, module *Documents* | red | `dateien.fehlen` |
| "Check all files" (by hand or [on a schedule](archiv.md#alle-dateien-prufen-zeitplan)) found deviations | red | `dateien.befund` |
| Nobody gets the tasks without a recipient | notice | `aufgabenempfaenger` |
| Tasks with people without read permission | yellow | `aufgaben.ohne-leserecht` |
| Tasks without a recipient | notice | `aufgaben.ohne-empfaenger` |
| Folders that don't fit the definition | notice | `mappen.unpassend` |

For messages that exist per mailbox, package, emergency access, used emergency code, intake folder subfolder or skipped step, the identifier in the log is followed by a colon and the id, e.g. `postfach.anmelden:…`.

## Customising the workbench { #werkbank-anpassen }

Not everyone needs every area. A household may never touch number sequences, mailboxes or the technical log. Under **Customise workbench** (at the very bottom of the bar) you decide which areas are on the left.

!!! info "Hiding doesn't switch anything off"
    A hidden area keeps running. A mailbox keeps collecting post, the backup keeps running. Direct links, the help and the overview's buttons still lead there. **Notices always get through:** if a hidden area has a problem, for example "Backup too old", it is in the overview, and the area appears with its notice in the bar.

**Levels** for everyone who manages – five, ascending; each includes the previous one:

- **Beginner**: only the essentials for setting up and backing up. Default for purely private use.
- **Household**: adds what a household sets up itself – folder types, views, automations, post and intake, search, log and maintenance.
- **Self-employed**: adds number sequences, retention expired and data protection – for the self-employed and landlords. Default for use at work.
- **Business**: adds themes and tours – for businesses with several people. If you have already written your own tours or switched off an included one, “Tours” stays in the bar at a smaller level too.
- **Everything**: every area, including the database connection and data for measurements. It stays like this for installations set up before version 0.70 until you choose something else.

You choose the level in the setup wizard in the step “Use” and later here. Existing installations keep their template (Household, Business or Everything).

<!-- bereiche:stufen -->
| Area | Beginner | Household | Self-employed | Business | Everything |
| --- | :-: | :-: | :-: | :-: | :-: |
| Overview | ● | ● | ● | ● | ● |
| [Packages](pakete.md) | ● | ● | ● | ● | ● |
| [Example Library](beispielablage.md) | ● | ● | ● | ● | ● |
| [Folder types](mappentypen.md) |   | ● | ● | ● | ● |
| [Views](sichten.md) |   | ● | ● | ● | ● |
| [Number sequences](nummernkreise.md) |   |   | ● | ● | ● |
| [Automations](automatisierungen.md) |   | ● | ● | ● | ● |
| [Automation templates](automatisierungsvorlagen.md) |   | ● | ● | ● | ● |
| [Tours](rundgaenge.md) |   |   |   | ● | ● |
| [Tips](tipps.md) |   | ● | ● | ● | ● |
| [Users](benutzer.md) | ● | ● | ● | ● | ● |
| [Encryption](verschluesselung.md) | ● | ● | ● | ● | ● |
| [Retention expired](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) |   |   | ● | ● | ● |
| [Stamps](stempel.md) |   | ● | ● | ● | ● |
| [Data protection requests](datenschutz.md#auskunft-erteilen) |   |   | ● | ● | ● |
| [Deletion concept](loeschkonzept.md#aus-dem-dms-erzeugen) |   |   | ● | ● | ● |
| [Deletion log](datenschutz.md#loschprotokoll) |   |   | ● | ● | ● |
| [Mailboxes](postfaecher.md) |   | ● | ● | ● | ● |
| [Intake folder](eingangsordner.md) |   | ● | ● | ● | ● |
| [WebDAV drive](webdav.md) |   | ● | ● | ● | ● |
| [Search and full text](texterkennung.md) |   | ● | ● | ● | ● |
| [Synonyms](suche.md#gleichbedeutende-worter) |   | ● | ● | ● | ● |
| [Backup](sicherung.md) | ● | ● | ● | ● | ● |
| [Full export](export.md) |   | ● | ● | ● | ● |
| [Bin](papierkorb.md) | ● | ● | ● | ● | ● |
| [Back up data → Settings](daten-einstellungen.md) |   | ● | ● | ● | ● |
| [Email and address](installation.md#e-mail-und-adresse) | ● | ● | ● | ● | ● |
| [Region](region.md) | ● | ● | ● | ● | ● |
| [Languages](sprachen.md) |   | ● | ● | ● | ● |
| [Own organisation](organisation.md) |   | ● | ● | ● | ● |
| [Tasks](aufgaben.md#werkbank-aufgaben) |   | ● | ● | ● | ● |
| [Sign-in protection](anmeldeschutz.md) |   | ● | ● | ● | ● |
| [Themes](designs.md) |   |   |   | ● | ● |
| [Database connection](installation.md#datenbank-anbindung) |   |   |   |   | ● |
| [System health](speicherplatz.md) | ● | ● | ● | ● | ● |
| [Log](fehlersuche.md#protokoll) |   | ● | ● | ● | ● |
| [Reported errors](fehlersuche.md#gemeldete-fehler) |   | ● | ● | ● | ● |
| [Maintenance](wartungsmodus.md) |   | ● | ● | ● | ● |
| [Load test data](demo.md) |   |   |   |   | ● |
| **Number** | **10** | **30** | **35** | **37** | **39** |
<!-- /bereiche:stufen -->

The data protection areas also follow only the level (from Self-employed) and your own shows and hides – whether Ablago is used for work does not matter for the bar. It still decides whether your own organisation appears in disclosures.

Afterwards you can deviate per area:

- **for everyone**: the area is in the bar for every person who may manage it.
- **only for me**: the area is additionally only in your bar, for example *Log* if you like to check it but the others don't.

**My sidebar:** everyone who manages can choose a different level for themselves – for instance **Everything** if you want to dig deeper while the others stay with **Beginner**. Without your own choice the level for everyone applies; what is shown or hidden for everyone applies here too. The level only orders the bar and is not a permission – what someone may manage is set by the [management rights](verwalten.md#der-verwaltungsmodus). **Expert mode** no longer exists: whoever had it switched on keeps its areas as “only for me”.

If a hidden area is set up, for instance a mailbox or sign-in via a provider, it says "set up, but hidden". At the bottom of the bar it says how many areas are hidden. A click on it shows them all temporarily.

![Workbench → Customise workbench](bilder/werkbank-anpassen.png)

### Which area do I need for what? {#welchen-bereich-brauche-ich-wofur}

<!-- bereiche:wofuer -->
| Area | What for | Level |
| --- | --- | --- |
| [Packages](pakete.md) | Install ready-made folder types and views | from Beginner |
| [Example Library](beispielablage.md) | Create a filled Library to look around in and remove it again | from Beginner |
| [Folder types](mappentypen.md) | Build your own kinds of folders | from Household |
| [Views](sichten.md) | Arrange the collections on the left in the library | from Household |
| [Number sequences](nummernkreise.md) | Sequential numbers, e.g. for invoices | from Self-employed |
| [Automations](automatisierungen.md) | Set up procedures following the pattern When – And – Then: on an event or date set fields or give someone a task | from Household |
| [Automation templates](automatisierungsvorlagen.md) | Templates for runs on a folder: “Assign task”, “Remind”, follow-up – when they run, who gets the task and what is asked when applying them | from Household |
| [Tours](rundgaenge.md) | When your business wants to write its own tours or switch tours on or off – short guided tours of the real interface. | from Business |
| [Tips](tipps.md) | When you want to adapt tips to the way you work, write your own or switch some off. | from Household |
| [Users](benutzer.md) | Create users and roles | from Beginner |
| [Encryption](verschluesselung.md) | The key for passwords and backups | from Beginner |
| [Retention expired](archiv.md#nach-der-frist-aufbewahrung-abgelaufen) | Check and delete folders whose retention period has expired (only with archive mode) | from Self-employed |
| [Stamps](stempel.md) | Templates for stamps and watermarks when passing on | from Household |
| [Data protection requests](datenschutz.md#auskunft-erteilen) | Access requests under Art. 15 GDPR for customers, tenants and contacts: request, create, deliver, evidence | from Self-employed |
| [Deletion concept](loeschkonzept.md#aus-dem-dms-erzeugen) | Create a deletion concept: close gaps and set which folder types contain personal data | from Self-employed |
| [Deletion log](datenschutz.md#loschprotokoll) | Evidence of what was deleted when – view, filter, export as PDF or CSV | from Self-employed |
| [Mailboxes](postfaecher.md) | Fetch post from an email account | from Household |
| [Intake folder](eingangsordner.md) | Take over scans from a folder | from Household |
| [WebDAV drive](webdav.md) | Connect the library in Explorer, Finder or the Files app and drop files into it | from Household |
| [Search and full text](texterkennung.md) | Recognise text in scanned documents, archive version, typos and “Did you mean …?” in the search | from Household |
| [Synonyms](suche.md#gleichbedeutende-worter) | Groups of words the search treats alike (e.g. car, vehicle, auto): add your own, view those from packages | from Household |
| [Backup](sicherung.md) | Set up, check and restore backups | from Beginner |
| [Full export](export.md) | Take all data with you in open formats | from Household |
| [Bin](papierkorb.md) | Bring back deleted folders | from Beginner |
| [Back up data → Settings](daten-einstellungen.md) | How long deleted items stay in the bin and whether users may export their own data | from Household |
| [Email and address](installation.md#e-mail-und-adresse) | Email sending and Ablago’s address | from Beginner |
| [Region](region.md) | Country, federal state and time zone – for public holidays, “today” and the times of reminders and summaries | from Beginner |
| [Languages](sprachen.md) | If English or another language is also spoken in your library. | from Household |
| [Own organisation](organisation.md) | Whether the Library is also used for work, plus name, address and controllers of your own business – kept at the organisation in the Library | from Household |
| [Tasks](aufgaben.md#werkbank-aufgaben) | Keep an eye on all open tasks of all users | from Household |
| [Sign-in protection](anmeldeschutz.md) | Require two-factor, sign-in through a provider, locked addresses | from Household |
| [Themes](designs.md) | Logo, colours and custom CSS | from Business |
| [Database connection](installation.md#datenbank-anbindung) | The connection to the database | Everything only |
| [System health](speicherplatz.md) | See how the server is doing: storage, shrink PDFs, load of CPU, memory, network and database, version and updates | from Beginner |
| [Log](fehlersuche.md#protokoll) | Read the technical log | from Household |
| [Reported errors](fehlersuche.md#gemeldete-fehler) | Errors users have reported | from Household |
| [Maintenance](wartungsmodus.md) | Temporarily lock users out (maintenance mode) and one-off upkeep work | from Household |
| [Load test data](demo.md) | Many folders for load tests and measurements | Everything only |
<!-- /bereiche:wofuer -->
