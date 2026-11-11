# Packages {#pakete}

A **package** brings ready-made folder types, views and, if you like, sample folders – for instance the Basis package with the folder type "Organisation" for companies, authorities, doctors and insurers. Instead of building field by field in the Workbench, you install it with a few clicks under **Workbench → Packages**.

Packages come from the **official catalogue** of the Ablago project ([dms-registry](https://github.com/motom001/dms-registry)). Every package there is open source and has been approved by the maintainer. Most are **configuration packages** (folder types, views, examples). Packages with code can be installed and configured, but their code only runs with the package runner.

## Fetching the catalogue { #katalog-abrufen }

Ablago only queries the catalogue **at the push of a button**, never in the background: click **Fetch catalogue**. The page then shows two lists:

- **Installed** – packages in this installation, with version and origin
- **Available** – packages from the catalogue that aren't installed yet

A click on a package shows name, description, version, licence, author, the required Ablago version, dependencies, the folder types and views it contains as well as links to the README and the changes.

Ablago loads the catalogue from `https://catalog.ablago.app/katalog.json` and checks its **signature** (see [Origin](#herkunft-signiert-oder-nicht)). It only follows redirects to `https://` addresses. For this, Ablago itself must be able to reach the internet. Ablago can't configure a proxy for outgoing requests. Without internet access you upload a package as a file (see [Expert mode](#expertenmodus-weitere-kataloge-und-hochladen)).

If you only let Ablago reach certain addresses (firewall list, outgoing filter on the NAS), it needs these three:

- `catalog.ablago.app`: catalogue and signature
- `github.com`: package files are release files on GitHub; GitHub redirects once from there
- `release-assets.githubusercontent.com`: target of that redirect

GitHub may change the redirect target. In that case, the address Ablago names in the error message when loading is what counts. Each package's checksum is in the signed catalogue; where the file lives doesn't change the check.

GitHub counts how often a release file is downloaded; the numbers in the catalogue come from there. Ablago sends nothing for this: no identifier, no version, only a fixed user agent.

## Installing { #installieren }

1. Choose a package under **Available** and, if needed, an older version.
2. Click **Install …**. The [common process](#mehrere-pakete-in-einem-schritt-installieren) opens: at the top the package, below it what it needs ("Needs: …"), and its **add-ons** as ticks – for text recognition, for instance, **Further languages?** with French, Spanish, Turkish …
3. Click **Continue with … packages**. On **one page**, Ablago now asks everything that is necessary, and only that:
    - for packages with code **what the code may do** – per package as a list, events as a sub-list, with **?** for an explanation (see [A package's permissions](#rechte-eines-pakets)). Below it **one** tick for all, otherwise **Install** stays grey
    - **names** that already exist: if there is already a folder type or a view (at the top level) with the same name, Ablago suggests another, e.g. "Organisation (Basis)". Everything else gets the name from the package, without asking. Who already has the name (a package, created yourself, a package earlier in the run) is listed before **Install** under **Names already in use**; if a conversion takes over the existing type, that is not a conflict (#1123)
    - **sample folders** – only if you set the tick; if they bring **example documents**, their number and size are shown (see [Examples](#beispiele))
    - **settings** without which a package doesn't run – or **Fill in later** (see [Settings](#einstellungen))
4. At the bottom is the **summary**: which packages in which order, how many folder types and views, examples, packages with code. Below that the package's notes, e.g. whether it brings **synonyms** for the search (word lists, see [Search](suche.md#gleichbedeutende-worter)) or uses folder types from Ablago.
5. Click **Install**.

Before creating anything, Ablago checks:

- whether **its own version** fits (otherwise [update](aktualisieren.md) Ablago first),
- whether all **dependencies** are installed and in a fitting version,
- whether a **name** is already taken – also by a folder type of a dependency that would be installed along (#1123). This already shows in the preview; you change names of the package itself there, a dependency you install on its own first,
- whether the downloaded archive matches the **checksum (SHA-256)** in the catalogue. If it doesn't, Ablago installs nothing.

Creation uses the same functions as in the Workbench, with all validation rules. Folder types from packages have the [identifier](mappentypen.md) `package:key`, e.g. `basis:person` – so packages don't get in each other's way, even if the package ID and the key contain an underscore themselves (up to Ablago 0.228 it was `basis_person`; during the update Ablago converted all identifiers, #1084). Your own folder types have an identifier without a colon. Ablago resolves links to other packages' folder types. **If something fails, Ablago undoes everything** – nothing is left half-created.

### Installing several packages in one step { #mehrere-pakete-in-einem-schritt-installieren }

Whether a package with its dependencies, text recognition with three languages or ten packages in the [setup assistant](installation.md#pakete-dazuholen) or from a [bundle file](#pakete-ohne-internet-installieren): Ablago installs everything in **one process** – without a chain of questions per package.

1. **Selection:** the packages as tiles like in the catalogue – with icon, short description and download size; at the top you can filter by **category** (what you have already chosen stays visible). The selection looks the same in the setup assistant. What a package needs comes along automatically and is marked "comes along – needed by …" – **also packages with code**. A package's **add-ons** (packages that extend it, e.g. the additional languages of text recognition) appear as ticks directly below it as soon as you choose the package; every add-on stays a package of its own with its own version and its own update.
2. **Every question once, with an exception per package:**
    - **Origin** (only outside the official catalogue or without a valid signature): one tick for all.
    - **Permissions:** all packages with code one below the other, each with its permissions, and **one** tick "I allow these packages these permissions respectively". Every package still only gets its **own** permissions and its own service account.
    - **Names:** only folder types and views whose name is already taken.
    - **Sample folders:** one tick for all packages with examples; under **Deselect per package** you take out individual ones.
    - **Settings:** the required fields of all packages, one box per package. A service address is never preset – **Take over example** enters the package's example, and you confirm the addresses with a tick. With **Fill in later** the package is still installed but shows **Settings needed**, and the [Workbench overview](uebersicht.md) shows you the task "… still needs settings" until you have filled them in.
3. **Summary** and **one** button "Install … packages".

Ablago checks everything **before the first package**: origin, permissions, names, settings and service addresses. If anything is missing, it installs **nothing**. Then it proceeds package by package, dependencies first. If a package still fails (e.g. an invalid example), **this package is completely undone**; the others continue to be installed. Only packages that need the failed one drop out, with a reason. If a package can't be loaded at all (e.g. no connection), Ablago shows this before installing, with **Try again** – you can still install the others. At the end the result names what is installed and what isn't, each with a reason; you add what is missing later under **Workbench → Packages**.

Your confirmation only applies to **exactly the permissions you saw**. If they change before the click (e.g. because the catalogue now has a new version with more permissions), Ablago shows the new permissions and asks again. While an installation is running, other installations, updates and removing packages wait – also on a second server with the same database.

**Later on:** under **Workbench → Packages → *package*** are the add-ons that exist for it in the catalogue (e.g. **Further languages** for text recognition), with **Choose …** – then the same process. The [text recognition](texterkennung.md#weitere-sprachen) page suggests languages that occur in your documents.

Folder types from packages carry the notice **Package …** in **Workbench → Folder types**. You can then adjust them like any other folder type.

### Via the catalogue website { #uber-die-katalog-webseite }

The catalogue also exists as a website: [Package catalogue](https://catalog.ablago.app/) (also on the manuals' start page). There you see per package the description, what is created, permissions, changes and older versions.

1. Click **Install in my Ablago** at the package.
2. The first time, the page asks for the **address of your Ablago**, e.g. `https://dms.example.org`. It only remembers it in your browser; you change it via **Ablago address** at the top. The website sends nothing to your Ablago and stores no credentials.
3. Your Ablago opens **Workbench → Packages** with the **preview** of exactly this package (address `…/werkbank/pakete?installieren=<package>@<version>`). If you aren't signed in, you sign in first and then land there again. Other users see a notice that only administrators install packages.
4. Ablago fetches package and checksum **itself from the official catalogue** – details in the link pointing to other sources don't count. If the package or the version doesn't exist there, Ablago says so.
5. Installation only happens **when you click "Install"**. The link alone changes nothing. If the package is already installed, the preview shows this; it offers an update if the link names a newer version.

### Viewing in the catalogue { #im-katalog-ansehen }

Under **Workbench → Packages**, above the list **Available**, is the link **View in catalogue**; for every package from the official catalogue it is additionally under **More** for exactly this package's page. The link opens the catalogue website in a new tab and gives it **your Ablago's version**. The website then immediately shows which packages fit your Ablago and filters by this if you like – you don't have to look up and type in the version.

**What is transmitted:** nothing except the page request itself, as with any other website. The version is in the address's **fragment**, i.e. after the `#`, e.g. `https://catalog.ablago.app/#dms=0.146.0`. The browser never sends this part to the server; it is in no access log. Only the catalogue page's script reads it in your browser, remembers the version there and immediately removes the fragment from the address again, so that it doesn't travel along with a shared link.

- The fragment contains **only the version** – no address of your Ablago, no household name, no list of your packages, no identifier.
- The link opens without a **referrer** (`rel="noopener noreferrer"`): the catalogue page doesn't learn which address you come from and has no access to your Ablago's tab.
- If the official catalogue can't be reached right now (after **Fetch catalogue**), instead of the link there is a notice about [packages without internet](#pakete-ohne-internet-installieren).
- Further catalogues from [expert mode](#expertenmodus-weitere-kataloge-und-hochladen) have no known website; the link only exists for the official catalogue.

## Origin: signed or not { #herkunft-signiert-oder-nicht }

The Ablago project **signs** the official catalogue (from Ablago 0.141.0). Because the catalogue contains every package's checksum, a single signature proves that all packages in it come from the Ablago project. The **preview** therefore shows a line **Origin** before every installation:

| Origin | Meaning | What you do |
| --- | --- | --- |
| **signed by the Ablago project** (catalogue of …) | Catalogue and package demonstrably come from the Ablago project and are unchanged. | Nothing – install. |
| **signed by the provider of this catalogue** | A [further catalogue](#expertenmodus-weitere-kataloge-und-hochladen) with its own key whose fingerprint you have confirmed. | Nothing – you trusted the provider when adding it. |
| **not signed** | Nobody proves where the package comes from. | Only install if you know the source; you confirm the origin with a tick. |
| **Signature invalid** | The catalogue has been changed or isn't from the Ablago project. Ablago records this in the log. | In case of doubt don't install, and fetch again later. Installing only works with explicit confirmation. |

**Transition:** in this version, for the official catalogue **without** a signature there is only a notice. One minor version later Ablago requires the signature; packages from further sources, uploaded packages and bundle files without a signature then still work with confirmation.

**Older catalogue:** Ablago remembers which state of the catalogue it last saw signed. If it then gets an **older** signed catalogue online, it doesn't accept it – that way nobody can slip in an old catalogue with a package version that has since been corrected. The message names both times. Usually fetching again later helps; if it stays like this, report it to the Ablago project.

**Older versions:** Ablago 0.141.0 to 0.144.1 only know test keys. As soon as the Ablago project signs the catalogue with its real keys, they show "Signature invalid" for the official catalogue – then update Ablago. The fingerprints of the real keys are in the [security policy](https://github.com/motom001/dms/blob/main/SECURITY.md).

### Publisher { #herausgeber }

Next to a package's name is its **publisher** (#1084), e.g. "Contracts · app.ablago" – in the list, in the catalogue, in the preview and in the installation flow. The publisher is a reversed domain: the official packages have `app.ablago`, packages from other providers their domain, e.g. `org.example`.

- **No replacement by others:** if a package is already installed, Ablago doesn't accept a package with the same ID from a **different** publisher – neither as installation nor as update, not even uploaded. The message reads something like "Another package “vertraege” from app.ablago is already installed …". If you really want to switch, remove the installed package first.
- **`app.ablago` only official:** Ablago only installs a package that claims to be `app.ablago` (or `app.ablago.…`) from the official catalogue, from a bundle file with its signature or as a file whose checksum is listed there.
- **Other publishers are not verified:** Ablago shows them as "Publisher according to the package: org.example – not verified" – only the package itself says so. For a further catalogue with its own key, Ablago binds the publisher to that key; it won't take an update with a different key. The publisher is always shown in full.
- **Add-ons and dependencies:** a package with a dot in its ID (e.g. `texterkennung.fra`) must come from the same publisher as the package before the dot. A dependency only counts if the installed package comes from the same publisher or from the Ablago project – a foreign "basis" never replaces the official one.
- **Older packages** don't name a publisher yet. Then the publisher of their catalogue applies: from the official catalogue that's `app.ablago` – the Ablago project publishes all packages there, and only its signature proves it. For other sources it is unknown; then, as before, the protection is that updates only come from the same source. If such a package names a publisher for the first time with an update, the preview asks explicitly ("From this update on, … counts as the publisher of this package"); without the tick there is no update. After that this publisher applies.

## Installed packages { #installierte-pakete }

Per package Ablago remembers version, **origin** (the catalogue), **publisher**, when and by whom it was installed or updated and which folder types and views belong to it. These details are part of the [backup](sicherung.md) and of the [full export](export.md) (`struktur/pakete.json`). Installing, updating and removing are in the log.

## Examples { #beispiele }

Many packages bring **sample folders** with invented data so that you can see what belongs in a folder. Since Ablago 0.223.0 they can also bring **example documents** – for instance a maintenance contract and two invoices for the folder "Heating". Both are only created if you set the tick **Sample folders** when installing; an update creates no examples.

- **As if uploaded:** the documents land in the tab the package names and get a preview, full text (text recognition) and – if you have switched it on – an archive version, exactly like a document you upload yourself. Origin: *from a package*; the date is the date from the package.
- **Only safe file types:** PDF, PNG and JPEG, each at most as large as when uploading. All of them together count towards a package's size limit (128 MB).
- **Quiet:** sample folders and their documents trigger no [automations](automatisierungen.md) and no folder events. Packages that process files (such as text recognition or *Local AI – similarity*) still get the documents – otherwise they would lack the text.
- **Removing again:** under **Workbench → Packages → *package***, **Remove examples** permanently deletes all of the package's sample folders **together with their documents**, without the Bin – as long as they are **unchanged**. Examples you have changed (fields, documents, notes) or that one of your folders refers to **stay** as normal folders; Ablago names them. When you [remove](#entfernen) the package, the same happens automatically. The deletion log records the removed examples as "package examples removed".
- **Backup:** example documents are normal documents – they are in the [backup](sicherung.md) and the export until you remove them.

For packages installed before 0.223.0, Ablago doesn't know the examples as such; you delete them like other folders.

## Presets { #vorgaben }

Some packages bring **presets**: folders to **keep**, not to try out. The *Contracts* package, for instance, creates the usual **contract types** – electricity, gas, mobile, rent, insurance … – with typical periods and templates such as a cancellation letter. Unlike [examples](#beispiele), presets **always** come along (no tick) and are real data of your Library.

- **In the preview:** under **Presets** you see per folder type what will be created. If the package supplies presets in folder types of **another package** or attaches templates to its presets (for instance *Vehicles* the contract type "Car purchase contract" in *Contracts*), the box **Adds to folders of other packages** says so as well – with the package's name. If that package comes from another publisher, the preview says so explicitly.
- **Marking:** a preset shows "Preset from the package *Contracts*" above the tabs – the same badge as for notes from packages. Otherwise it is an ordinary folder: you can change it, delete it and attach documents; permissions apply as for every folder of its folder type. The history names the package's account ("Package Contracts") as creator.
- **Language:** if the package brings texts in several languages, Ablago creates the presets in the **installation's language** (see [Languages](sprachen.md)) – "Electricity" instead of "Strom" when it is English.
- **Templates:** presets can bring **text templates** (plain Markdown, e.g. "Cancel tenancy.md"). They are stored as documents in the preset's tab, origin *from a package*. Templates are plain text: no HTML, no images, links only `https://`, at most 256 KB per template – Ablago checks this again when installing. Users turn them into a PDF letter via **Folder ▾ → Letter from template …** ([user handbook](https://help.ablago.app/benutzer/aktuell/en/versenden/#brief-aus-vorlage), #1040); the template itself stays unchanged.
- **Quiet:** presets trigger no [automations](automatisierungen.md) and no folder events when installing – like examples.

**Updates** add new presets and templates. A preset that is still exactly as the package created it gets the new version. **If you changed it, it stays as it is** – the preview then says "changed by you – stays as it is; the new version in the package is not applied". **If you deleted a preset, it stays deleted**; an update doesn't create it again. Nothing is created twice: every preset has a fixed key by which Ablago finds it again.

**Removing** the package:

- Presets that are **in use** – another folder refers to them, they have notes or documents that don't come from the package – **stay**. In the package's own folder types they prevent the removal; Ablago names them ("The preset "Rent" is still in use").
- Unused presets in the package's own folder types go with the package.
- Unused presets in folder types of **other** packages: Ablago **asks** – **Remove them too** or **Keep** (then they stay as ordinary folders).
- Templates the package attached to presets of other packages go with it – **only those**; whatever you or other packages put there stays.
- Presets that stay keep their key: if you install the package again later, it takes them back in instead of creating them twice (preview: "already exists – taken back in without changes"). It doesn't change them.

The deletion log records removed presets as "unused package presets removed".

## Updating { #aktualisieren }

**Check for new versions** queries the catalogue (at the push of a button) and marks packages for which there is something newer. In the package, **Update to … …** shows a preview of what is added and a link to the changes.

An update **only adds** – unless it [converts](#umbau); then the preview says so explicitly:

- new folder types and views,
- new fields and tabs on existing folder types,
- new [presets](#vorgaben) and templates; unchanged presets get the new version.

It **deletes nothing** and **overwrites nothing** you have changed yourself: if you renamed a folder type, added fields or deleted a view, that stays so. An update never changes the [archive mode](archiv.md#archivmodus-aus-einem-paket) of an existing folder type – neither shorter nor longer, neither on nor off.

**New ID (move, #1084):** if a package renames its ID – for instance the additional languages of text recognition from `texterkennung_fra` to `texterkennung.fra` –, this appears as an ordinary update of the installed package. The preview says "The package is now called …". Afterwards it is there under the new ID, with all folder types, folders, settings and data; no second package is created. This only works from the same source and the same publisher. By the way, an ID with a dot always means: the package **extends** the package before the dot.


## Conversion: folder types move to another package { #umbau }

Some updates **convert** (#1041): folder types move to another package, with all folders and values. Example: Household 2.0 hands over *Contract* and *Insurance* to the *Contracts* package – afterwards your contracts and insurance policies are in the one folder type *Contract*, an insurance policy with the contract type "Insurance". Such updates are **major versions** (the first number goes up) and are listed in the CHANGELOG.

Under **Conversion**, the preview shows for each step:

- whether a folder type is **taken over** ("Contract becomes Contract" – the same folder type with the same folders, permissions, views and direct links, only now from the new package) or **merged** into another ("Insurance is merged into Contract"), and how many folders move,
- which values go into which fields and how many of them do not fit exactly – for instance a notice period "3 months to the end of the term", which becomes the period "3 months",
- what goes **into the note**: values without a matching field are kept in a note on the folder afterwards. **Nothing is lost.**
- **questions** about fields **you** created or changed on the old folder type: keep as own field, into the note or into a field of the new type. A suggestion is preselected; an update never silently overrides your changes.
- what changes in **permissions**: the permission rules of the old folder type still apply to the moved folders (afterwards they are at the top of the new type's rules, "Insurance: …", for folders with "Taken over from = haushalt:versicherung"). If the old folder type was not allowed for [AI services](#ki-dienste), the new one is not either afterwards. **A conversion never makes folders readable for more people or services.**

Only someone with **Full administration** can confirm, after signing in again. **Back up first** is preselected: Ablago starts a [backup](sicherung.md) and only converts afterwards. The conversion runs **completely or not at all** – if it stops, nothing has changed, and the message says so. Afterwards:

- Each folder has the history entry "Converted by package Contracts 1.0.0" with before and after; the system log names every step.
- Reference fields, views, permission rules and automations point to the new folder type, direct links to folders keep working (folders keep their ID).
- [Archive mode](archiv.md) and deadlines stay. If the conversion would make archive mode less strict, the preview refuses it – then turn it on for the new folder type first, at least as strictly.
- If folders of the old type are in the bin, it stays as your own folder type.

Update several packages with conversions **one by one**, each with its own preview – Ablago refuses them in a combined flow.

## Converting text into links { #text-in-verweise-umwandeln }

Some packages used to have a **text field** where a **link** really belongs – for example "Keeper: Lena Muster" on the vehicle instead of a link to the **person** Lena Muster. A newer version of the package brings a link field for this and says from which text field it can be filled. **Updates change nothing secretly:**

- The update creates the link field **in addition**. The old text field stays with all values; nothing is rewritten. The update's preview already says how many entries can be converted afterwards.
- Afterwards the package shows under **Convert text into links** what is open, for instance "Vehicle – Keeper: 3 entries in "Keeper" (text) can become links to Person".

**Preview …** shows a suggestion per name that you can change in every line:

- **existing person:** same name, ignoring upper and lower case and spaces ("lena muster" = "Lena Muster", also "Muster Lena"). If several fit, that is noted – then choose the right one.
- **Create new:** creates a person with first and last name. Suggested if the text looks like a name.
- **Skip:** the text stays, e.g. for "Family" or "Car MU-ST 123".

If a field may have several links (holders of an account, insured persons), Ablago splits the text at "and", comma, slash or "&" (also the German "und"): "Lena and Tom Muster" becomes "Lena Muster" and "Tom Muster". A folder is only converted if **each** of its names gets a person.

**Left out** are folders you may not edit, folders in [archive mode](archiv.md) within the retention period and folders whose link is already set. The preview names each with the reason.

**Convert** sets the link and clears the text field. Every change is in the folder's **history** ("Package update: text converted into link"). In addition:

- The old text field is no longer required. If it is empty, the Library no longer shows it in the folder.
- Title template and result lists show the link instead of the text; the link field moves into the text field's place. Folders you skipped still show their text there.

**Undo …** under "Previous conversions" takes back a whole operation: text back, link empty, newly created people into the bin, provided nothing else links to them any more, folder type as before. What someone has changed since the conversion stays and is named. The operations are part of the [backup](sicherung.md).

For package authors, the format (`aus_text`) is in the [registry's rules](https://github.com/motom001/dms-registry/blob/main/REGELN.md#text-in-verweis-umwandeln).

## Removing { #entfernen }

**Remove** deletes the package's folder types, views and word lists and its entry – and **unchanged sample folders** together with their documents (see [Examples](#beispiele)) as well as unused [presets](#vorgaben). That only works

- as long as there are **no other folders** of these folder types (not in the bin either) and
- **no other package** depends on it.

Otherwise Ablago names the reasons – including every example you have changed; delete it yourself beforehand if you no longer need it. Changed examples in folder types of other packages (such as an "Organisation" from *Basis*) stay; Ablago names them after removing.

If the package supplies full text or converts files (e.g. **Office and email**, **Image formats**), no documents wait for it any more afterwards: without text, the document again says that there is no package for this file type; if it already had text, the text stays.

## Settings { #einstellungen }

Some packages need settings – for instance rules by which they assign post, or an access key for a service. The package only **describes** them; Ablago builds a form from them, checks the values and stores them. You find it under **Workbench → Packages → *package* → tab "Settings"** – the tab only exists for packages that have settings.

- **Sections** with fields and **lists** of entries with the same structure (e.g. one rule per entry) with **+ Entry**, deleting and – if the package allows it – sorting with ↑/↓.
- **Fields** as with folder types: text, multi-line text, number, yes/no, date, choice, multiple choice and **links** to a folder type, a field of a folder type, a user, a role or a view. You choose links from lists; the fixed id is stored, not the name – so renaming does no harm.
- **Service address** (e.g. of an AI service): the only address, apart from the fixed addresses from its manifest, to which the package may go on the network – see [Service address](#dienst-adresse). It is never preset; the empty field at most shows an example. When saving a new or changed address, Ablago asks and shows where data goes.
- **Secrets** (e.g. credentials) Ablago encrypts with its key (see [Encryption](verschluesselung.md)). After saving it never shows them again, only **set** with **Change** and **Delete**.
- On **saving**, Ablago checks folder type, required fields, choice values and whether links exist, and shows errors at the field.
- The package's **actions** appear as buttons (e.g. "Apply rules now"); the package's answer is shown above. A time limit prevents a button from hanging.
- The **status** (last run, messages) comes from the package itself and is read-only.

**Life cycle:**

- **Installing** sets the defaults. Required fields without a default are asked for directly in the [process](#mehrere-pakete-in-einem-schritt-installieren); if you choose **Fill in later**, the package shows **Settings needed**, the Workbench overview names it as a task, and it only runs afterwards.
- **Updating:** new fields get their default, existing values stay. Fields that the new version no longer knows are removed – the preview before the update names them.
- **Removing** asks whether the settings are to **stay** for a later reinstallation (default: no).

The settings are **part of the backup**; secrets stay encrypted in it and are re-encrypted on a key change. They can't be read via API v1; the package itself gets them via the package runner. The log records "Settings of package … changed (fields …)" – never the values of secrets. Only administrators see and change settings.

## Actions in the “Folder” menu { #aktionen-im-menue-mappe }

Packages can add actions to the **Folder ▾** menu of matching folders, e.g. **Add template** on a contract or **Mark as paid** on an invoice. In its manifest, each action names the folder types it appears on and **which rights it needs in the end**: read, add document, edit, create folders, hand out (like downloading, right E).

- **Before installing:** The preview lists every action with its folder types and rights under “Actions in the “Folder” menu”. If an update adds an action or one needs different rights, it is marked **new**, and the code's rights must be confirmed again.
- **Who sees them:** Only people who have exactly these rights on the folder – and only if the package has them too (its confirmed rights, rules for the “Package” role, “Packages” on the folder type). A package with network access (AI service) offers no action on folder types that are not approved for AI services.
- **On behalf of the person:** The package only acts within the intersection of announced rights, the person's rights and the package's rights; Ablago checks them again at every step. During an action, the package only sees this folder (and its documents, if it may read documents) – not via its service account. Dialogs are data only (text, choice, tick box, text field, date), never with password input; the package name is always shown in the header.
- **Switching off:** **Workbench → Packages → *package*** lists every action with its rights under “Actions in the “Folder” menu”; without a tick it is in nobody's menu. You hide the **built-in** actions (Assign a to do, Remind, Send by email, Export as PDF, Copy link) in one place: **Workbench → Packages**, section **“Folder” menu**. Hiding is about tidiness, not rights – the API routes remain.
- **Traceable:** Every run is listed in the folder's history (person and package, group “Package actions”) and in the package runner's history (“Action “…” for …, step 1”); the log names package, action and folder, never contents.

At most one action per person and package runs at a time; a step waits at most 30 seconds for the package. The switches are part of the backup (setting `mappenaktionen`).

## Packages with code { #pakete-mit-code }

Some packages bring **code** – for instance their own text recognition or rules that assign new post. The code reacts to events (new post, uploaded document, finished text recognition, finished full text, changed settings) and to the **actions** in the tab "Settings". Ablago runs it in the **package runner**:

- **Sealed off:** the code is WebAssembly and runs in a separate process of Ablago, without access to files, keys or database. It only reaches the network and the internet at the addresses the package states and at the [service address](#dienst-adresse) you enter in its settings – usually not at all.
- **Only confirmed permissions:** before installation Ablago shows what the code may do – which folder types it may read or create and change, whether it may read or write documents, whether it may access the network or internet and which events it reacts to (see [A package's permissions](#rechte-eines-pakets) and [Events](#ereignisse)). Only once you confirm this does Ablago install. If several packages with code come together (for instance an additional language together with text recognition), all permissions of all packages are on one page and you confirm them **once** (see [Several packages in one step](#mehrere-pakete-in-einem-schritt-installieren)). If an **update** wants more permissions or other addresses, Ablago asks again.
- **Service account:** for every package with code Ablago creates a service account "Package *name*". The code works via the API with it; the history therefore shows what a package has changed. Service accounts don't appear under **Users**, never sign in and can **never delete** – not even with permissions on all folder types. They don't see users and passwords.
- **Limits:** every call has at most 256 MB of memory and 2 minutes of time; at most two calls run at the same time. Whatever breaks the limits is cancelled without disturbing Ablago.
- **Retrying:** Ablago remembers events. If a call fails, the runner tries again after 1, 5, 30, 120 and 360 minutes and then gives up. During maintenance (e.g. when restoring) the runner rests.

**Workbench → Packages → *package*** shows in the section **Package runner** the state, the latest calls with duration and memory, open and given-up events and the package's log – with its [network calls](#netzaufrufe). Messages are additionally in Ablago's [log](fehlersuche.md#protokoll). The **state** is one of these:

| State | Meaning |
|---|---|
| **starting …** | The runner is starting or loading the package's module – for instance directly after installation. The page asks again by itself. |
| **ready – waiting for the first event** | The module is loaded, but the package has never been called yet. It runs as soon as an event comes that it reacts to, or you trigger an action. |
| **ready** | The module is loaded and has already been called. |
| **crashed at … – restarting …** | The runner process has crashed. Ablago restarts it by itself after a short pause (with repeated crashes it waits longer, at most one minute). Events aren't lost in the process. |
| **restarted after crash at …** | The runner is running again; the time names the last crash. The cause is in Ablago's log. |
| **paused (maintenance mode)** | During maintenance the runner rests. |
| *error message in red* | The module couldn't be loaded (e.g. the code is missing after a restore) – reinstall the package. |

If an **update** fails, the old version stays installed with its old code. A package may be at most **128 MB** in size – that applies to the archive when downloading, uploading and in the bundle file as well as to all files under `code/` together. If a package is larger, Ablago names size and limit and doesn't even download it.

**Removing** ends the code, deletes its open events and its storage and switches off the service account.

!!! note "Full text from a package"
    If a package sets a document's full text (e.g. the package **Text recognition**), the history records "Full text set" with the package's name, and Ablago doesn't overwrite this text.

### A package's permissions { #rechte-eines-pakets }

Before installation, the preview shows a list of the permissions under **"The package contains code."**. Behind every item a **?** leads to the matching place here. **Below the list**, on the left, is the tick **"I allow the package these permissions."** – first read the list, then set the tick. Without it **Install** stays locked. With an **update** with changed permissions the tick is called **"The permissions have changed. I allow them."**; if the permissions have stayed the same, it only says "The permissions are the same as before."

What isn't on the list, the code may not do. A package never sees users and passwords, and it may delete nothing. **Passwords and other secrets** (password fields, credentials of mailboxes and services, keys, tokens) a package gets with no permission and no tick – where one is set up, it only sees "set up: yes/no". There is no setting for this. Only the package's own settings (such as the password of its backup target) reach it so it can work.

#### Reading folders { #recht-mappen-lesen }

**"Read folders: *folder types*"** – the code may read folders of these folder types, with all fields and links. **"all folder types"** means every folder (except users). If a folder type comes from another package, its identifier is in brackets after it, e.g. "Organisation (basis)"; **Post**, **Storage location** and **Role** are brought by Ablago itself.

#### Creating and changing folders { #recht-mappen-anlegen-und-andern }

**"Create and change folders: *folder types*"** – the code may create folders of these folder types and change their fields; with this it may also read them. A package may never delete. Every change is in the folder's history with the service account "Package *name*".

#### Reading documents or writing full text { #recht-dokumente }

- **"Read documents"** – the code may read the documents in the folders it may read: the file, the full text and the pages as images.
- **"Read documents and write full text"** – additionally it may upload and replace documents there and set the full text, for instance for its own text recognition.

If a package only needs the full text of certain file types (e.g. Word or emails), since version 0.145 **"Read documents"** together with the permission [Supply full text](#recht-volltext) is enough – without write permission on documents.

If neither is on the list, the code sees no documents.

#### Vectors for documents { #recht-vektoren }

**"Store vectors for documents and find similar documents (dms:vektoren)"** – the code may store a **vector** for documents it may read: a list of numbers that describes the content of the full text. Ablago compares these vectors and with them shows [similar documents](#aehnlichkeit) on the folder and in the search. In addition, the search asks the package for the vector of the search term. Ablago itself computes nothing in the process – it only stores and compares what the package supplies. With this permission the code may not change documents, folders and full text; everyone only sees similar documents from folders they may read.

#### Access to network and internet { #recht-netzwerk-und-internet }

- **"no access to network and internet"** – the code reaches neither devices in your home network nor the internet. That is the normal case: the data stays in Ablago.
- **"Access to network/internet only to: *addresses*"** – the code may only reach these addresses (always `https://`, also paths below), e.g. a service on the internet or a device in your network. The package runner blocks everything else, including redirects. What the package needs the addresses for is explained in its README – what you send there leaves your Ablago.

If an update wants other addresses, Ablago asks again.

- **"… to: the address from the setting "*name*" (you enter and confirm it)"** – the package brings no fixed address but asks for a [service address](#dienst-adresse), for instance that of your AI service. Only once you enter and confirm it in the settings does the code reach exactly this address.

#### Answering questions about the Library { #recht-antworten }

**"Answer questions about the Library ("Ask your library") – only from excerpts that Ablago passes along (dms:antworten)"** – with this permission the field [Ask your library](#frag-deine-ablage) appears in the Library. Per question the package only gets the question, the chat so far and a few excerpts that Ablago itself has picked out – **with the permissions of the person asking**. It reads nothing from the Library itself (for that it would need the permissions above) and can't change anything: Ablago only shows its text and checks the sources.

#### Suggesting fields from documents { #recht-erkennen }

**"Suggest fields from documents ("Fill in from document") – only from the text that Ablago passes along (dms:erkennen)"** – instead of the built-in recognition, the package can suggest the fields for the button **Fill in from document** if you choose it (see [Recognition by a package](#erkennung-durch-ein-paket)). It only gets the document's text and the description of the fields – no permissions on folders or documents. Ablago checks what it supplies and only shows it as a suggestion.

#### Suggest a folder type { #recht-klassifizieren }

**"Suggest a folder type ("Where does this belong?") – only from the start of the document and the list of folder types that Ablago provides (dms:klassifizieren)"** – on the page *Take over document*, the package suggests which folder type new post belongs to (see [Where does this belong? by packages](#wohin-gehoert-das)). It only gets the start of the document and the name, short description and "How to recognise it" of the folder types that come into question and are allowed for AI services – no folders. Ablago checks what it supplies and only shows it as a suggestion.

#### Set notes on folders { #recht-hinweise }

**"Sets notes on folders it may change (e.g. "The items add up to €118.40") – text only, always with the package's name; they never stop you saving (dms:hinweise)"** – Since version 0.231. The package can set and remove short notes on folders it may [create and change](#recht-mappen-anlegen-und-andern), for example when the items of an invoice do not match the amount. They appear in yellow in the notes line above the tabs, always with the name of the package in front – never in red and never so that they look like a message from Ablago. Ablago only accepts text: no HTML, no Markdown, no links, at most 300 characters and at most 3 notes per package and folder. A note does not change the folder (no "last changed", no history entry) and never stops anyone saving. If you remove the package, its notes go with it.

#### Calculated fields { #recht-berechnet }

**"Calculates fields that only this package writes (read-only in Ablago): *folder type: fields*"** – Since version 0.231. The fields named are read-only in the folder; only the package writes their value (see [Calculated fields](mappentypen.md#berechnete-felder)). For that it needs the right [create and change folders](#recht-mappen-anlegen-und-andern) on its own folder type.

If a package has calculated fields or sets notes, the confirmation also says: **"Writes values and notes that everyone who can read the folder sees – even if the package works them out from folders not everyone may see"**. A package with read access to other folder types could in this way write something from folders a person may not see onto a folder that person may see. Technically this cannot be prevented – that applies to every write right. So only confirm such packages if you trust them with that; which folders a package reads is listed under [Read folders](#recht-mappen-lesen).

#### Translate content { #recht-uebersetzen }

**"Translate content – at the press of a button the package gets a single text (field, note or full text) the person may read and returns the translation; it can’t change or store anything (dms:uebersetzen)"** – since version 0.204. The package translates when someone presses **Show translation** (see [Languages → Translate content](sprachen.md#inhalte-ubersetzen)). It only gets this one text and the languages – no permissions on folders or documents. If the package may also access the network, Ablago only uses it if you choose it explicitly and confirm the data transfer.

#### Taking over text recognition { #recht-texterkennung }

**"Take over text recognition for scans and images – Ablago reports documents without text and shows "waiting for text recognition" until the package writes the full text (dms:texterkennung)"** – the package is then Ablago's [text recognition](texterkennung.md): the core itself only reads the text layer of PDFs and gives scans and images to the package. Meanwhile the document says "waiting for text recognition (package …)". The permission alone gives no access to documents; the package may only write the full text with [Read documents and write full text](#recht-dokumente).

#### Converting files { #recht-umwandeln }

**"Convert files that Ablago can't read itself – the package reads the original file and supplies a version (PDF, PNG or JPEG) for thumbnail and full text; the original stays unchanged (dms:umwandeln): TIFF, WebP, …"** – since version 0.137, Ablago itself only reads PDF, JPEG and PNG. For other file types – the permission is followed by those the package wants to be responsible for – the package gets the file (event [Convert file](#ereignis-datei-umwandeln)) and returns a **converted version**, e.g. a multi-page TIFF as a PDF. From it Ablago makes the thumbnail and the full text as with a PDF or photo (see [Other file types](texterkennung.md#andere-dateitypen)). The document itself stays the original file; the package can't change, replace or delete anything with this. For this it additionally needs [Read documents](#recht-dokumente) (the original file).

#### Supplying full text { #recht-volltext }

**"Supply full text for files that Ablago can't read itself – the package reads the file and only writes its full text; it can't change, replace or delete documents (dms:volltext): Word, Excel, email, …"** – since version 0.145. The permission is followed by the file types for which the package supplies the full text. For every such file it gets the event [File needs full text](#ereignis-datei-volltext), reads the file and writes its text – for **exactly these file types**, not for other documents. Meanwhile the document says **"waiting for full text (package …)"**; if the package can't read a file (e.g. because it is encrypted with a password), its reason is shown on the document. For this it additionally needs [Read documents](#recht-dokumente); it doesn't need write permission on documents. The package **Office and email** uses this permission (from 1.1.0). Ablago reads PDF, JPEG and PNG itself; scans are recognised via the permission [Take over text recognition](#recht-texterkennung).

#### Storing an archive version { #recht-archivfassung }

**"Store archive version (PDF/A) – the package reads documents with their full text and word positions and stores a searchable PDF/A next to them; the original stays unchanged, it can't change, replace or delete anything (dms:archivfassung): PDF, JPEG, PNG, TIFF, …"** – since version 0.149. The permission is followed by the file types for which the package makes an archive version. For every such document it gets the event [Create archive version](#ereignis-datei-archivfassung) – **only once the full text is settled** –, reads the file (for TIFF and co. the readable version from [Converting files](#recht-umwandeln)), the full text and the **word positions** (where each word is on the page) and stores a PDF/A. Ablago only accepts a PDF with a PDF/A identifier that loads nothing from the network (no JavaScript, no actions, no external links); otherwise the reason is shown on the document and under [Workbench → Search and full text → Archive version](texterkennung.md#archivfassung-pdfa). For this it additionally needs [Read documents](#recht-dokumente). The archive version goes into backup and full export (see [Backup](sicherung.md)).

#### Reading the backup { #recht-sicherung-lesen }

**"Read the encrypted backup in order to copy it off-site – can't open it (no key, no content) (dms:sicherung-lesen)"** – since version 0.142. After every backup the package gets the event [Backup finished](#ereignis-sicherung-fertig) and may read **exactly this** backup file in pieces – encrypted, as it is in the backup folder – and its slim metadata (size, checksum, time, fingerprint of the key). It never gets the key, the content or other files of the backup folder. Per backup it reports back whether the copy has arrived and been checked; **Workbench → Backup** shows this. Since version 0.158.1 its API key may only read – it reports the state in its answer to the event. It doesn't see folders and documents with this permission. See [Off-site backup](sicherung-ausser-haus.md).

### Service address { #dienst-adresse }

A package such as **AI assistant** doesn't compute itself but asks a service that you run or choose – e.g. **Ollama** on your home server (ready-made example and guide: [Running AI locally](ki-lokal.md)). You enter this service's address in the package's **settings** (Workbench → Packages → *package* → tab "Settings"):

- **Never preset.** The empty field at most shows an example such as `http://ollama:11434/v1` – nothing is stored until you enter an address.
- **Confirm.** When saving a new or changed address, Ablago asks **"Send data to this address?"** and names it. Only with **Confirm address and save** does it apply; the log records "Service address of package … confirmed" with the address.
- **Only there.** The package runner only allows network access to this address and paths below it (same computer, same port), without redirects. Because services in the home network rarely speak HTTPS, `http://` is also allowed here. Credentials don't belong in the address but in a field of their own (secret).
- **Operating and hosting this service is outside Ablago.** If it runs at your place in your own network, the data doesn't leave the house. If it belongs to another provider, that is a **relationship of trust with this service provider** – as with hosting Ablago itself: location, data processing, storage, use for training. You make this decision by entering and confirming; Ablago has no further switch for it. It already shows the notice in the preview before installation.

### AI services and folder types { #ki-dienste }

An **AI package** – Ablago also says *AI service* – is a package with code that **may use the network** (a fixed address or a [service address](#dienst-adresse)) and **can receive content**: read folders or documents, get excerpts, text and files from the core (e.g. *Ask your library*, *Fill in from document*, *Show translation*, vectors, full text) **or subscribe to events about folders, documents or post** – even without further permissions, since an event alone names file names, ids or “For”. Only the events *Backup finished* and *Settings changed* carry no content. Packages that compute in the house **without network** – such as *KI lokal – Ähnlichkeit* or *Texterkennung* – are not AI packages. Neither is the *off-site copy*: it only gets the encrypted backup.

An AI package **only receives content from folder types that are allowed for AI services**:

- **Per folder type:** Workbench → Folder types → *folder type* → section **AI services** → **May go to AI services**. Without the tick no AI package gets anything from this folder type – no folders, no documents, no excerpts, no events. This takes effect immediately and for all AI packages.
- **On the package's page:** Workbench → Packages → *AI package* → **AI service: folder types** shows which folder types the package receives content from, and below all folder types to allow or block. For packages that read folders themselves, their permissions and [Packages on the folder type](berechtigungen.md#pakete-am-mappentyp) also count.
- **New folder types are blocked until you allow them.** That way sensitive folder types such as *Health* never go out unintentionally – not even when a package brings them or you copy a folder type. A **new installation** has nothing allowed yet; after installing an AI package you allow on its page what it should receive.
- **After the update** your existing folder types stay allowed as before, so nothing quietly stops working. The [Overview](uebersicht.md) points this out once (*New: exclude folder types from AI services*) as long as AI packages are installed; **Got it** hides the notice.
- **Users** never go to a package.

**What blocked means, per path:**

| Path | Blocked folder type |
|---|---|
| Reading via the API (folders, documents, full text, search, similar) | The package doesn't see the folder type – as with [Packages on the folder type](berechtigungen.md#pakete-am-mappentyp). |
| Events (e.g. *Full text finished*, *Document uploaded*, folder events) | Don't go to the package, not even ids or file names; the log records "Ereignis nicht an Paket zugestellt". |
| Jobs (full text, conversion, archive version) and recalculating vectors | Don't go to the package; the document doesn't wait but is skipped. If the same file is also in an allowed folder type, the job (conversion, archive version) goes via that document – the package learns nothing about the blocked one. |
| Ask your library | No excerpts from this folder type, nor titles of linked folders from it. |
| Fill in from document | If the target folder type or that of a source document is blocked, nothing goes to the package; the built-in recognition takes over with a notice. |
| Show translation | Refused with a notice – nothing goes to the package. |
| Where does this belong? (suggest a folder type) | A blocked folder type is not in the list that goes to the package – neither name nor description – and a suggestion for it is refused. If the document itself is in a blocked folder type (such as *Post*), nothing goes to any package – here not even to packages without network access such as *Local AI – similarity*. |

Not affected: search terms sent to a vector package for the similarity search don't belong to any folder type.

### Network calls in the log { #netzaufrufe }

The package runner writes every call a package makes to the network into the **package's log** (Workbench → Packages → *package* → Package runner → **Log: output and network calls**): time, method, **host** (with port, without path, query and credentials), bytes **sent** and **received** and the status, e.g. "Network: 12 × PUT cloud.example.org – 201, 3.4 MB sent, 2 KB received". Identical calls in quick succession (within one minute) share one entry, so that e.g. chunked uploads of the off-site copy don't flood the log.

- **Blocked** calls (address neither in the package nor confirmed as service address, or a method that isn't only capital letters – shown as “?”) appear as a **warning** – nothing went out.
- Ablago's [log](fehlersuche.md#protokoll) gets **one line** per event or action, "Paket *id*: Netzaufrufe" (level *info*), with the totals: number, blocked, hosts, bytes sent and received.
- **Never content and no headers:** neither what was sent nor the response, no paths, no query, no keys.

This is how you check a package you trusted: when it sent how much to which service.

How **long** the network calls take is shown below under **External services** (last hour or 24 hours): mean, p50, p95, time to first response, errors, timeouts, data and – for an AI service – tokens. The runner measures this itself and returns it with the result; more under [System health → External services](speicherplatz.md#externe-dienste), costs and budget under [AI costs](speicherplatz.md#ki-kosten).

### Recognition by a package { #erkennung-durch-ein-paket }

**Fill in from document** (button in the folder) normally uses the **built-in recognition** – patterns for email, phone, date, amount and the like, without AI. A package with the permission [Suggest fields from documents](#recht-erkennen) – for instance an AI assistant via Ollama – also recognises free text, letterheads and difficult receipts. The package **Read QR code** takes over the details from the QR code (vCard) on business cards and, without a code, lets the built-in recognition work; for this it reads the page images of documents that have already been filed (permission *Read documents*) and needs no network.

- **Default for all folder types:** Workbench → Packages → *package* → section **Fill in from document** → **Use this package as the default for all folder types**. Without the tick, the built-in recognition stays the default.
- **Per folder type:** in the [folder type's recognition](mappentypen.md#erkennung) you choose *Default from the Workbench*, *built in* or a specific package.
- **Data outflow:** if the package may go on the network (fixed address or [service address](#dienst-adresse)), it sends the documents' text there. This choice only works explicitly: Ablago asks **"Send the documents' text to a service?"**, and only with **Confirm and choose** does it apply.

**What the package gets:** the text from which it fills in (at most 50,000 characters), the name of the folder type and a description of the fields as JSON Schema – **never password fields** and never fields the user may not edit. Ablago itself still matches **links** (e.g. *Organisation*) with existing folders.

**What Ablago does with the answer:** it checks every value against the field kind as with the built-in recognition. Wrong types, unknown fields and values outside a choice it discards and records in the [log](fehlersuche.md#protokoll) (field and reason, without values). The values only appear as a **suggestion**; they are only saved with *Save folder*. Below the result it says "Recognised with "*package*"."

**If the package doesn't answer** (not running, service can't be reached, no answer after 60 seconds, answer unusable), the built-in recognition takes over; the user sees a notice about this. If it answers, but without any value that passes the check, the notice says "*package* returned nothing usable" – then too the built-in recognition takes over.

**Shortened text:** if the package only reads part of the text – because Ablago passes at most 50,000 characters or the package shortens for its AI service (with the AI assistant: setting *Context length*, see [Running AI locally](ki-lokal.md#kontext-speicher)) –, below the result it says "Document text shortened". Details further back in the document may then be missing.

**Where it was found:** a package names, for each value, the place in the text where it found it. Ablago only takes it over if it **appears word for word in the document** (apart from spacing and upper/lower case), and searches for it in the text layer or the text recognition – this produces the coloured frames on the page *Take over document*. If the place is not in the document, it is dropped; the value stays, only without a frame (log: "Fundstellen aus Paket verworfen", with the number, without values). Packages without these places keep working as before.

### Where does this belong? by packages { #wohin-gehoert-das }

On the page *Take over document*, Ablago suggests a folder type under **Where does this belong?**. To do so it combines up to four sources into **one** suggestion and shows the evidence of each ("How Ablago recognises it"):

| Source | From | What goes out? |
|---|---|---|
| **AI** (language model) | a package with [Suggest a folder type](#recht-klassifizieren) **and network access**, e.g. *AI assistant* – only if it is chosen as the **standard for all folder types** under [Recognition by a package](#erkennung-durch-ein-paket) and the data transfer is confirmed | the start of the document (at most 6,000 characters) and the list of folder types (see below) |
| **Similar documents** | a package with *Suggest a folder type* **without network access** that also supplies the [vectors](#recht-vektoren), e.g. *Local AI – similarity* | in addition, which folder types the most similar filed documents are in – **only the type and a measure of similarity**, no titles, no content. Only folders that the person **and** the package may read count. |
| **Heading** | built in: the name of a folder type is a heading in the text ("Invoice") | nothing |
| **Matching** | built in: an existing folder is found in the text via [Use to find existing folders](mappentypen.md#zum-wiederfinden-nutzen), and a link field of the folder type points to its type (an *Invoice* for *Contract* WV-1043) | nothing |

**The list of folder types** for packages only contains folder types with [Can be created from post](mappentypen.md#dokument-ubernehmen) in which the person may create folders, **and that are allowed for [AI services](#ki-dienste)** – per folder type the key, name and the first 200 characters of the description and of "How to recognise it". Folders, fields or values never go along.

**What Ablago does with the answer:** the answer has a fixed format (JSON schema): at most three folder types with a confidence (0–1), a short reason and a quote. Ablago checks it strictly – a folder type that wasn't in the list is refused; a quote that isn't in the document is dropped. If the answer is invalid or nothing is left, below the suggestion it says "*Package* didn’t deliver anything usable"; if a package doesn't answer (45 seconds), "*Package* didn’t answer". In both cases the other sources apply. What was refused is in the [log](fehlersuche.md#protokoll) with the reason, without values; the package's network calls are in the [package's log](#netzaufrufe).

**Only a suggestion:** Ablago stores nothing and the package writes nothing. If the person changes the folder type, Ablago only asks for the fields of the new type ([recognition](#erkennung-durch-ein-paket)), not for the type again.

### Ask your library { #frag-deine-ablage }

If a package with the permission [Answer questions about the Library](#recht-antworten) is installed and loaded, the Library's start page shows the field **"Ask your library"** (see [User manual](https://help.ablago.app/benutzer/aktuell/en/startseite/#frag-deine-ablage)). This is how a question runs:

1. The browser sends the question and the chat so far to Ablago.
2. Ablago **itself** looks for matching passages – in the documents' full text, in the folders' titles and fields and, if a package with [vectors](#recht-vektoren) is there, by similarity –, **only in folders the person asking may read**. Password fields and users are never included.
3. It cuts out at most as many **excerpts** as set below and gives them with the question to the package – **marked as data**, with the instruction to the AI service not to follow any instructions in them.
4. The package asks the service at the [service address](#dienst-adresse) and returns the answer piece by piece.
5. Ablago shows the answer as **text** (nothing of it is executed or stored) and below it the named **sources** – only folders from the excerpts passed along, checked once more for readability. Below every answer there is an expandable **"Sent to the AI: n excerpts from m folders"** with exactly these passages.

**Workbench → Packages → *package*** shows in the section **Ask your library** the **maximum per question**:

| Setting | Range | Default |
|---|---|---|
| **Excerpts per question at most** | 1 to 20 | 8 |
| **Characters per question at most** (all excerpts together) | 500 to 30,000 | 6,000 |

A single excerpt is at most 1,500 characters long. Less means: less data to the service and faster answers, but more often "isn't in the excerpts".

**No log of the content:** only the browser keeps the chat (until reloading); the server stores neither questions nor excerpts nor answers. Ablago's log only records "Question about the Library asked" with the number of excerpts and duration, the Workbench at the package only "Question answered" with the length of the answer. One question runs per user at a time, at most four in the whole of Ablago.

### Events { #ereignisse }

Under **"Reacts to these events:"** the preview names when the code runs by itself – one line per event with **?**. Without events it only runs when you trigger an action in the tab **Settings**. An event gives the package no further permissions: it only learns *that* something has happened (e.g. the id of the new post) and then works with the permissions above. If an update only adds events, Ablago therefore doesn't ask again. What a package changes itself isn't reported back to it.

#### New post has been created { #ereignis-post-angelegt }

**When:** as soon as new post arises – with **+ Post** in the Library, via the API, from an intake folder or mailbox and, with **Split post**, for every new post.

**Typical:** checking, assigning or counting post – the sample package **Hello post**, for instance, counts new post.

#### A document has been uploaded { #ereignis-dokument-hochgeladen }

**When:** with every new document – uploading in the interface or via the API, from intake folder and mailbox, and for the new documents when **splitting a PDF**, **merging**, **splitting post** and **redacting** (as a copy). A new version of an existing document is not a new document.

**Typical:** looking at the document and doing something with it – the package **Separator sheet** splits post at separator sheets, **Text recognition** recognises text in scans.

#### A document's text recognition is finished { #ereignis-texterkennung-fertig }

**Deprecated** – still exists for packages created before version 0.133. **When:** at the same time as [Full text ready](#ereignis-volltext-fertig), when Ablago has read a document itself (text layer).

**Typical:** older versions of the package **Text recognition** (1.x) recognise scans without text with it. Since version 0.134 there is no built-in text recognition any more – update the package to 2.0 so that Ablago knows it as text recognition.

#### A document's full text is ready { #ereignis-volltext-fertig }

**When:** as soon as a document's full text is settled – no matter where it comes from: from a PDF's text layer, from a package such as **Text recognition** or via the API. Since version 0.133 also when Ablago has found **no text** (e.g. with a scan) – exactly what a package that [takes over text recognition](#recht-texterkennung) needs. Packages from before 0.133 still only get it with text. For a package with the permission [Vectors for documents](#recht-vektoren), Ablago also sends this event afterwards for the **existing stock** (see [Similarity](#aehnlichkeit)).

**Typical:** recognising scans – the package **Text recognition** (from 2.0); computing something from the full text – the package **Local AI – similarity** computes the document's vector from it.

#### A file is to be converted { #ereignis-datei-umwandeln }

**When:** since version 0.137 for every file of a type that Ablago doesn't read itself and for which the package with the permission [Convert files](#recht-umwandeln) is responsible – on upload and with a new version, when the package is newly installed (for the existing files), with **Catch up thumbnails** and with **Regenerate full text** (for files without a version). Ablago doesn't report files over 50 MB. Only the responsible package gets it (with several for the same type, the first by id).

**Typical:** the package **Image formats** makes a PDF from a TIFF scan, a JPEG from WebP and a PNG from GIF and BMP.

#### A file needs its full text { #ereignis-datei-volltext }

**When:** since version 0.145 for every file of a type that Ablago doesn't read itself and for which the package with the permission [Supply full text](#recht-volltext) is responsible – on **upload**, with a **new version**, when the package is **newly installed** (for the existing files without text), with **Regenerate full text** and with **Try again** or **Regenerate** on the document. Ablago doesn't report files over 50 MB. Only the responsible package gets it (with several for the same type, the first by id). Until the package writes, an existing text remains for the search.

**Typical:** the package **Office and email** reads the text from Word, Excel and PowerPoint files, OpenDocument, RTF, text files and emails.

#### Create archive version { #ereignis-datei-archivfassung }

**When:** since version 0.149 for every document of a type for which the package with the permission [Store archive version](#recht-archivfassung) is responsible – **as soon as its full text is settled**: after upload (with scans, therefore, only after text recognition), with a **new version** or a change to the PDF (rotating, deleting pages, splitting, redacting), with **Regenerate full text** and when the package is **newly installed** (for all existing documents with finished full text). Which documents get one you tick in the package's settings: **PDFs with text** (online invoices, bank statements), **scanned PDFs**, **photos and images** and since 0.221 **emails** (`.eml`, `.msg`) – default all. Ablago reports emails even without full text: if no package supplies it, it counts as settled (empty). What you deselect is shown on the document as "skipped – according to settings"; if you tick a kind later, Ablago catches up the matching documents. Not reported are: encrypted PDFs (reason on the document), PDFs that are already valid PDF/A (the original then counts as the archive version), and files over 50 MB. Only the responsible package gets it (with several, the first by id).

**Typical:** the package **PDF/A** stores a searchable PDF/A-2b for every scan, photo and PDF.

#### A backup is finished { #ereignis-sicherung-fertig }

**When:** since version 0.142 after every successful backup – by hand, automatically or before a restore –, as soon as it is completely in the backup folder. Only packages with the permission [Read the backup](#recht-sicherung-lesen) get it. If the copy fails, Ablago repeats the event (after 1, 5, 30 minutes, 2 and 6 hours); afterwards it counts as failed and the administrators get an email.

**Typical:** the package **Backup target WebDAV** uploads the encrypted backup to Nextcloud, a NAS or the hoster and checks it there.

#### The package's settings have been changed { #ereignis-einstellungen-geandert }

**When:** when an administrator saves the [package's settings](#einstellungen). Only the package itself gets this event.

**Typical:** taking over the new values, e.g. checking a connection again or updating the status.

#### Events about folders { #ereignis-mappe }

**When:** since version 0.153 – a folder has been **created**, **saved** (and changed in the process), **deleted** (into the bin) or **restored**. A package only gets these events for the folder types it names in its manifest – its own and, since version 0.166, also folder types of other packages or "all it may read"; the preview shows them as "– to: *types*" (other packages' types with the package in brackets). Only what the package **may read right now** is delivered: if you have denied it a folder type under [Packages on the folder type](berechtigungen.md#pakete-am-mappentyp) or a rule for the role *Package* restricts it, it gets nothing about it – the reason is in the log. Many quick changes to the same folder come as **one** event (within about 5 seconds), with the keys of all changed fields. The package only learns id, type and field keys – never values – and reads up with its permissions. Sample folders, demo data and a restore trigger nothing.

**Typical:** recalculating something from a changed folder or passing a state on to another service.

#### Deadline reached { #ereignis-frist-erreicht }

**When:** since version 0.153 for every date field with a [deadline](mappentypen.md#fristen-erinnerungen-an-datumsfeldern) – at the **reminder time** (as many days before as the deadline provides) and **on the day itself**, **exactly once** per folder, field, date and time, also with several servers and after a restart. As with the folder events, only for the folder types from the manifest. If someone changes the date, the new day counts as open again.

**Typical:** preparing something for a notice period, sending a reminder to another service.

#### Run on schedule { #ereignis-zeitplan-ausgefuehrt }

**When:** when an automation with the card [Run package on schedule](automatisierungen.md#paket-nach-zeitplan) runs – only to the package the card names, **exactly once** per automation and day. The package learns the date, the planned time and the task (e.g. `taeglich`), no content of the library. You decide time, days and on/off at the automation; the package gets **no additional rights** from it.

**Typical:** every morning recalculating the status of all contracts or invoices, which changes only with the date.

### Similarity { #aehnlichkeit }

A package with the permission [Vectors for documents](#recht-vektoren) – for instance **Local AI – similarity** – computes a vector for every document with full text. With it Ablago shows:

- on the folder below the documents **"Similar documents"** from other folders,
- in the search on the [start page](https://help.ablago.app/benutzer/aktuell/en/startseite/#schnell-finden) with **"also in documents"** additionally **similar results** – folders without a matching word whose document is similar to the search term, marked **"similar"**.

Everyone only sees folders they may read. The package supplies the vector of the search term; if it doesn't answer within 1.5 seconds, Ablago searches as before without similarity.

**Workbench → Packages → *package*** shows in the section **Similarity**:

| Detail | Meaning |
|---|---|
| **Model** | what the package computes with (reported by the package itself) |
| **State** | for how many documents with full text there is already a vector |
| **Cache** | how much memory the vectors occupy in Ablago |
| **Show similar results in the search** | setting, default: on. Off: the search no longer asks the package; "Similar documents" on the folder remain. |
| **Recalculate** | deletes all vectors; the package recalculates them in the background |

**Existing stock and change of model:** after installation the package first only computes new documents. Ablago catches up the existing stock at a throttled pace: when the package has nothing open any more, it gets up to 50 documents without a vector every 30 seconds (event [Full text ready](#ereignis-volltext-fertig)). If the package reports **another model** after an update, the old vectors are invalid: Ablago deletes them and has them recalculated in the same way. Until then, similar documents are missing for the documents still open.

**Data:** vectors are derived. They are in the database (table `vektoren`), not in the [full export](export.md), and disappear with their document. After a restore the package recalculates them.

**Memory and response time** (256 numbers per vector, measured on a computer with 2 cores, PostgreSQL 16):

| Documents | Database | Cache | first load | Similar documents | for comparison: cosine in SQL |
|---|---|---|---|---|---|
| 10,000 | 12 MB | 4 MB | 0.4 s | 4 ms | 0.3 s |
| 100,000 | 118 MB | 33 MB | 3.2 s | 37 ms | 3.0 s |

Ablago needs no database extension for this (such as pgvector, which is missing in the image `postgres:17`). It compares in its own memory with 8 bits per number; it loads the cache in the background after the start – until it is there, the search works without similarity. Measured with `server/test/vektoren-messen.ts`.

## Expert mode: further catalogues and uploading { #expertenmodus-weitere-kataloge-und-hochladen }

For package developers and for Ablago without internet access, under **Workbench → Packages**, directly below the buttons, there is the section **Expert mode**. It is collapsed; a click on **▸ Expert mode** (or Enter or space) expands it in place. Your browser remembers for you whether it is expanded or collapsed – that is only a convenience, not a permission: all administrators may use what is there.

![Workbench → Packages with expanded expert mode](bilder/werkbank-pakete.png)

In expert mode you can:

- **Further sources** – add, switch off and remove catalogue addresses, at most 20. Only HTTPS is allowed; the format is the same as for the official catalogue (the registry's `katalog.json`). How a catalogue with **its own key** is treated is described [below](#katalog-mit-eigenem-schlussel). **Fetch catalogue** queries all **switched-on** further catalogues besides the official one – no matter whether the section is currently expanded or collapsed; their packages carry the address as a mark. If you no longer want to use a source, switch it off or remove it. Without further sources there is only the official catalogue.
- **Upload a package as a file** (`.zip` in the registry's format, e.g. the package folder zipped, at most 128 MB). Ablago checks it just like a catalogue package, only without a checksum from the catalogue, and shows the preview. It recognises a [bundle file](#pakete-ohne-internet-installieren) by itself.

!!! warning "Not checked by the Ablago project"
    Nobody from the Ablago project has looked at packages from a source other than the official catalogue. Before installation Ablago therefore clearly shows the origin, and you must confirm explicitly that you know where the package comes from.

The list of installed packages shows the **origin** for each: "official catalogue", the catalogue address or "uploaded by … on …". **Ablago only looks for updates in the source the package comes from.** You update an uploaded package by uploading a higher version; then the same rules apply as with every update (only add). If a package's source is switched off or removed, there are no updates for it.

If you upload a single package whose checksum is exactly like this in the (already fetched) official catalogue, the preview shows "matches catalogue version …". You still confirm the origin, as with every uploaded package.

The log records who added, switched off or removed which source and who uploaded which package.

### Catalogue with its own key { #katalog-mit-eigenem-schlussel }

A further catalogue can have **its own key** (file `katalog.schluessel` next to `katalog.json`; how a provider sets this up is in the [Developer manual](https://help.ablago.app/entwickler/aktuell/en/pakete/#eigener-katalog-mit-eigenem-schluessel)). Ablago handles it like SSH on first contact:

1. **Adding:** if the catalogue has a key, Ablago shows its **fingerprint** – 64 characters in groups of four, e.g. `3f9a 0c12 …`. Compare it with the one the provider names on their website. Only when you click **Fingerprint matches** does Ablago remember the key. If even a single character doesn't match, click **Cancel**.
2. **Afterwards** every fetch of this catalogue must be validly signed; in return Ablago no longer asks about the origin when installing. If the signature is missing or doesn't fit, Ablago doesn't accept the catalogue and records it in the log.
3. **Orderly key change:** if the provider has signed their new key with the old one, Ablago takes it over by itself. The preview shows a notice, the log the change.
4. **Key changed without this proof:** Ablago **locks** the catalogue. The list of sources says "Locked since …" with the new fingerprint, and the log records it. Packages from it can't be installed or updated.

**What to do with a locked catalogue?**

- Ask the provider (not via a link from the catalogue itself) whether they really changed the key, and compare the new fingerprint with their website.
- If it matches, click **Check key …** at the source and confirm the fingerprint. The lock is then lifted.
- If it doesn't match or you can't reach the provider: switch the source off or remove it. Packages already installed stay but no longer get updates.

A catalogue **without** a key works as before: with every installation you confirm the origin. If the provider later publishes a key, you take it over with **Check key …**.

## Installing packages without internet { #pakete-ohne-internet-installieren }

If your Ablago can't reach the internet, you fetch several packages at once as a **bundle file**:

1. On a device with internet, open the catalogue's page **[Packages without internet](https://catalog.ablago.app/sammeldatei.html)**. Fastest via **Workbench → Packages → Without internet …** and the link there – then your Ablago's version is already filled in. As with [View in catalogue](#im-katalog-ansehen), it is only in the address's **fragment** (`…/sammeldatei.html#dms=0.147.0`): the browser sends it to no server; the page only remembers it in your browser and immediately removes the fragment from the address again.
2. Tick the packages. The **Ablago version** determines which package versions fit (default: the version your browser has remembered, otherwise the newest). **Dependencies** such as "Basis" come along automatically and are marked "comes along – needed by …". Text recognition and Notifications are preselected.
3. **Download bundle file.** The page fetches the packages from the catalogue, checks each against its checksum and packs them together – with a copy of the signed catalogue. It shows the **SHA-256** of the finished file.
4. Take the file to Ablago (USB stick, network drive) and upload it under **Workbench → Packages → Without internet …** – or in the [setup assistant](installation.md#pakete-dazuholen) if the catalogue can't be reached there. **Upload package** in expert mode also accepts a single package or a bundle file.
5. Ablago shows the content: per package the version and whether it is **new**, an **update**, **already installed** or **older than installed** and whether it fits the Ablago version. Add-ons (e.g. additional languages) are under their package. If the file contains the signed catalogue, it says **Origin: from the official catalogue of …**; otherwise you confirm once in the process that you know where the file comes from. You can deselect every package that no other chosen package needs. Then it continues as under [Several packages in one step](#mehrere-pakete-in-einem-schritt-installieren): one permission confirmation, names only in case of conflicts, examples, settings, one button.

### How Ablago trusts a bundle file { #wie-das-dms-einer-sammeldatei-traut }

The bundle file is a ZIP with the directory `sammeldatei.json` (per package id, version, size and SHA-256), a short `LIESMICH.txt`, the package archives from the catalogue, byte for byte unchanged, and – with bundle files from the signed catalogue – a copy of `katalog.json` with `katalog.sig`. Ablago only accepts it **completely or not at all**:

- Every archive must have exactly the **size and checksum (SHA-256)** from the directory. If Ablago has already fetched the official catalogue in this session, the checksum must **also match the catalogue** – otherwise it rejects the file.
- There must be **no other files** in it; Ablago rejects file names with `..` or `/` at the start, encrypted entries and duplicate names.
- **Limits against ZIP bombs:** at most 256 MB per bundle file, 50 packages, 128 MB per package archive, unpacked 20 MB per package (plus 128 MB for code) and 512 MB for all packages together. A large package needs about twice as much memory as its size when installing. Ablago never unpacks more than is stated in the archive.
- Every package goes through **the same checks as a single uploaded one**; id and version in the package must match the directory. If one is invalid, nothing is taken over.
- If the file contains the **signed catalogue**, Ablago checks the signature – without internet – and compares every archive with the checksum in it. If one doesn't match, it rejects the whole file.

**With a validly signed catalogue** in which every archive is listed with its checksum, Ablago shows "from the official catalogue of …, signed by the Ablago project", and you **don't need to confirm** the origin. If the catalogue state is older than **90 days**, Ablago points this out: newer package versions may be missing from it – put together a new bundle file when you get the chance. If a package isn't in the signed catalogue, Ablago names it; for this one you confirm the origin as before.

**Without a signature** (older bundle files) or with an **invalid signature**, the checksums only prove that the file is complete and **unchanged** since it was put together – not **who** put it together. Then, like an uploaded package, it counts as "not checked by the Ablago project": you confirm the origin. An invalid signature is also in the log. In every case the installed packages carry the origin "uploaded by … on …". In case of doubt, compare the SHA-256 that Ablago shows after uploading with the one on the catalogue page. You get updates of these packages with a new bundle file; a bundle file doesn't update packages installed from the catalogue.

## Creating a package from your Ablago { #paket-aus-deinem-dms-erstellen }

If you have built your own folder types and views – for instance for contracts with payments –, you take them as a package into another Library, for instance to another family or another business, without writing YAML by hand. Under **Workbench → Packages → Create package** an assistant guides you in four steps – **Choose · Check · Details · Create**; at the bottom are **Back** and **Next**, at the end **Create package** and **Create and download as ZIP**.

If you have already created packages, the first step first asks: **New package** (without a selection, without details) or **New version of …** (takes over selection and details of an earlier package and suggests the next version; folder types and views that no longer exist drop out with a notice, your own types created since then you add yourself).

1. **Choose** – folder types, views and **word lists** (your own groups of synonyms from Workbench → Search) with ticks, a search at the top. Word lists from installed packages are greyed out and don't come along; a package with only word lists works too (from Ablago 0.127.0 at the recipient, there under "from packages"). Optionally **sample folders**: without a choice the package contains not a single folder. If you choose folders of the chosen types, their field values come along as examples – only take folders with invented data, e.g. demo folders. With the tick **Include their documents**, these folders' documents come along too (only PDF, PNG and JPEG, under `inhalt/beispiele/`; the package then needs Ablago from 0.223.0) – only use documents with invented content for this, never real invoices, contracts or letters.
2. **Check** – Ablago checks automatically and says what it makes of it:
    - **From a package:** a folder type or a view that an installed package brought (for instance "Organisation" from *Basis*) is **not copied** but entered as a **dependency**, e.g. `basis: ">=1.1.0"` with the version installed here. If you have changed such a type here afterwards, Ablago points this out: your changes don't belong to your package – create a type of your own for them. The type then shows **"changed"** with a summary (e.g. "+2 fields · 1 field changed"); expanded you see every field and tab that differs from the package's state. Saving without a change doesn't count. For packages installed before this version, Ablago only knows the details after the package's next update.
    - **User, role:** links to them become `dms:benutzer` and `dms:rolle` – every Ablago installation brings these.
    - **Storage location:** links to it become `basis:ablageort` with the dependency `basis: ">=1.6.0"` – even if your Library still has Ablago's earlier storage location (issue #883).
    - **Not chosen:** if a chosen type (field, links tab) links to a type **of your own** that you haven't chosen, it is listed under "Not chosen but needed" with **Include**. Until then the export doesn't work. A view whose parent view is missing goes to the top level.
    - **Only views** you may export explicitly – for instance views for someone who already has the folder types. If a view points to a type of your own that doesn't go into the package, the check says "Caution" and offers **Include**; the export still works. The type stays in the view via its key. At the recipient, Ablago assigns it to the type with the same key; if it doesn't exist there, the view is skipped and the preview says so beforehand – the rest of the package is installed. If the type comes from a package, it is listed as a dependency in the check.
    - **What doesn't fit into the package** the check names as a notice: further result lists (only the default result list comes along), permissions, number sequences on fields, conditions on counts, favourites or deadlines and everything that points to specific folders or users of this installation. The [archive mode](archiv.md#archivmodus-aus-einem-paket) comes along – for the recipient as a default for the newly created folder type.
3. **Details** – name, id (lower-case letters, digits and `_`, suggested from the name), description (one or two sentences; the README is also made from it), author and optionally your GitHub name. Under "What's new" is what goes into the CHANGELOG. Plus:
    - **Version** – you choose it instead of typing it. A new package starts with **1.0.0**. For every further version you choose the kind of change: **Small fix** (e.g. 1.0.1 – texts, descriptions), **New content** (e.g. 1.1.0 – new fields, views, folder types) or **Bigger change** (e.g. 2.0.0 – fields removed or rebuilt). Ablago suggests the kind if it recognises it, and says why. A version that isn't higher than the one last passed on can't be chosen – otherwise the recipient doesn't recognise an update. If you created the package on another device, use **Upload the package's latest version**: Ablago only reads id, name and version from it and counts on from there.
    - **Required Ablago version** – Ablago determines the **minimum version** from what the package uses (e.g. field formats from 0.121.0) and suggests it. You can choose versions from there up to your own ("only from my version"); lower isn't possible. It is always stored as `>=X.Y.0`.
    - **Licence** – three ways: a **free licence** from the list (default Apache-2.0 like Ablago itself; type abbreviation or name, e.g. "apa" or "gnu", the list is alphabetical, one sentence per licence on what it requires), **your own licence** (name and text, e.g. for packages that an IT service provider only gives to its customers – the text goes into the package as LICENSE) or **no licence** (then all rights stay with you). With your own licence or none, the package can be installed anywhere but doesn't get into the official catalogue – only free licences apply there. The installation preview always shows the licence, with your own or a missing one with a notice.
    - **Expert mode** (under **Workbench → Customise workbench**): version and Ablago version can then also be entered by hand – Ablago still checks that the version is higher and the minimum version is enough. For a package that isn't finished yet, 0.1.0 is also available there.
4. **Create** – Ablago checks the finished archive just as when uploading. **Create package** then creates it: it is listed under **Workbench → Packages → Installed** with the mark **self-made**. **Create and download as ZIP** additionally gives you the file `<id>-<version>.zip` straight away (registry format with `manifest.yaml`, `inhalt/…`, README, CHANGELOG, LICENSE).

In the other Ablago installation you first install the dependencies (e.g. *Basis* from the catalogue) and then upload the file under **Expert mode → Upload package**.

**Self-made packages** are shown by package management under **Installed** with the mark **self-made** and the most recently created version. A click shows what was created then – folder types, views, examples, details, version and date –, and marks folder types you have changed since. There you have:

- **Create new version** – opens "Create package" with this selection and suggests the next version,
- **Download as ZIP** – every stored version exactly as it was created (the last ten, each up to 5 MB; they are part of the backup),
- **Remove from list** – only forgets the details and the stored archives. A **Remove** that deletes folder types or views doesn't exist: they are the original in this Ablago, stay types of your own and can be exported again.

There are no updates from a catalogue for self-made packages. If a catalogue has a package with the same id, package management points this out.

**Next version:** Ablago remembers id, version, author, licence, selection and the fields of every created package. With **New version of …** the assistant suggests the same id with a higher version (default according to the recognised kind of change). If the other Library uploads the higher version, its Ablago **updates** the package like every update: it adds new fields, tabs and views and deletes nothing.

!!! note "No data in the package"
    A package only contains the structure – folder types and views. Notes, users and passwords never come along; from explicitly chosen sample folders only field values without passwords and – only with the tick **Include their documents** – their documents. Only administrators may create packages; the log records every export.

## Your own packages { #eigene-pakete }

You can also submit a self-made package to the registry. How a package is built and how it gets into the catalogue is in the [Developer manual](https://help.ablago.app/entwickler/aktuell/en/pakete/).
