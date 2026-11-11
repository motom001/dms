# Terms

<!-- Erzeugt aus docs/glossar.yml und docs/glossar.en.yml mit docs/handbuch/werkzeuge/glossar.py – bitte dort ändern. -->

This page explains what the words in Ablago mean. Each term is followed by the German word in *italics* – that is how it appears in the German interface and on the screenshots in this manual.

Each term also says how well someone understands it who is working with a DMS for the first time:

- **✓ everyday word**: understood straight away.
- **~ with explanation**: the interface explains it briefly, for example with **?**.
- **✗ technical term**: there is no better word, or it only concerns advanced users.

It also says who comes across the term: everyone, only administrators or only advanced users (expert mode, technology).

## Basic terms {#grundbegriffe}

<a id="ablago"></a>**Ablago** · ✓ everyday word · everyone  
The name of the program – document filing for home and small businesses. One word, only the A in capitals. When the kind of program is meant, it is still called a "DMS" (document management system).  
See also: [Library](#ablage), [Workbench](#werkbank).

<a id="darstellung"></a>**Appearance** (*Darstellung*) · ✓ everyday word · everyone  
The area under My account in which everyone sets how Ablago looks for them – the design (for their account), the font size and the width of the areas (per device).  
See also: [Design](#design), [My account](#mein-konto).

<a id="archivnummer"></a>**Archive number** (*Archivnummer*) · ✓ everyday word · everyone  
The number on a sticker on the paper original (e.g. A-000123); the same number is on the document in Ablago. Unique per Library; comes from the number sequence "Archive number". Connects paper and document in both directions.  
See also: [Storage location](#ablageort), [Number sequence](#nummernkreis), [Document](#dokument).

<a id="papierkorb"></a>**Bin** (*Papierkorb*) · ✓ everyday word · everyone  
Deleted folders. They can be restored until the set number of days has passed.

<a id="niederlassung"></a>**Branch** (*Niederlassung*) · ✓ everyday word · everyone  
A branch, office, practice or outpost of an organisation – with its own address and phone. Folder type from the package Basis (from 1.1.0); belongs to exactly one organisation.  
See also: [Organisation](#organisation), [Person](#person).

<a id="berechnetes-feld"></a>**Calculated field** (*Berechnetes Feld*) · ~ with explanation · everyone  
A field whose value a package works out, e.g. "Cancel by" or the status of a contract. In the folder it is read-only, with "calculated by …" and the name of the package underneath. If the package no longer calculates it, the last value stays ("no longer calculated") until the administrator releases the field again.  
See also: [Field](#feld), [Package](#paket), [Note from a package](#hinweis-von-paketen).

<a id="bedingung"></a>**Condition** (*Bedingung*) · ~ with explanation · administrators  
A view's filter on field values, counts, deadlines, personal things or the Library attribute, e.g. a field equal to "current user", "is my favourite" or "Library is also used for work".

<a id="standardwert"></a>**Default value** (*Standardwert*) · ~ with explanation · administrators  
The prefilled value of a field when creating a folder, also with placeholders such as a number sequence.

<a id="ablago-entdecken"></a>**Discover Ablago** (*Ablago entdecken*) · ✓ everyday word · everyone  
Page in the user menu (next to Help) with everything else Ablago can do – what is new since the last visit, tours and all tips by area. Hidden tips stay visible there.  
See also: [Tour](#rundgang), [Tip](#tipp).

<a id="dokument"></a>**Document** (*Dokument*) · ✓ everyday word · everyone  
A file that lies in a document tab of a folder in Ablago. A file is uploaded; in Ablago it is a document. On an email it is called an attachment.  
See also: [Version](#version).

<a id="favoriten"></a>**Favourites** (*Favoriten*) · ✓ everyday word · everyone  
Folders a user has marked with the star. The view "Favourites" shows them. A favourite is also a subscription – if others change the folder, there is a bundled notification "Changed" (can be switched off per favourite).

<a id="feld"></a>**Field** (*Feld*) · ~ with explanation · everyone  
A detail in a folder, e.g. the contract number. Every field has a field kind – text, long text, formatted text, number, amount, date, yes/no, choice list, link or password.  
See also: [Field kind](#feldart), [Required field](#pflichtfeld), [Default value](#standardwert).

<a id="feldart"></a>**Field kind** (*Feldart*) · ~ with explanation · administrators  
What kind of detail a field takes, e.g. date or amount.

<a id="filter-titel"></a>**Filter (title)** (*Filter (Titel)*) · ~ with explanation · administrators  
Formats a placeholder in the title template, e.g. only the year of a date or shortened text. Comes after a vertical bar, e.g. {datum|jahr}.  
See also: [Title](#titel).

<a id="mappe"></a>**Folder** (*Mappe*) · ✓ everyday word · everyone  
The basic unit of Ablago, like a cardboard folder on the shelf. It brings together details, documents and links about one thing, e.g. a contract, an invoice or a contract partner. A folder in Ablago is not a directory on a disk – it has fields and tabs, and other folders can link to it.  
See also: [Folder type](#mappentyp), [Tab](#register), [Document](#dokument).

<a id="mappentyp"></a>**Folder type** (*Mappentyp*) · ~ with explanation · administrators  
The blueprint of a folder – which fields and tabs it has, how its title is formed and who may do what.  
See also: [Folder](#mappe), [Field](#feld), [System folder type](#systemmappentyp).

<a id="format"></a>**Format** · ✓ everyday word · administrators  
What may be in a text field – email, phone, website, IBAN or postcode. New and changed details must match; on the phone the matching keyboard appears; email and phone can be tapped. Saved details remain valid. Date fields have limits instead (earliest, latest, also "today").  
See also: [Field](#feld), [Field kind](#feldart).

<a id="kennung"></a>**Identifier** (*Kennung*) · ✗ technical term · administrators  
The fixed, technical name of a field, tab, folder type or number sequence, e.g. vertragsnummer (up to 60 characters). After saving it stays the same, so that saved values, links and packages fit. Folder types from packages have the identifier package:identifier, e.g. basis:person (#1084); your own folder types one without a colon.

<a id="ablage"></a>**Library** (*Ablage*) · ✓ everyday word · everyone  
The work area for all users – with views, lists and folders. At the same time the word for the whole installation, at home as at work ("name of your Library", "Library id"); one installation is one Library.  
See also: [Workbench](#werkbank), [View](#ansicht).

<a id="verweis"></a>**Link (field)** (*Verweis*) · ~ with explanation · everyone  
A field that points to other folders, e.g. from an invoice to the contract. It can point to folders of one or several folder types (e.g. "concerns" to vehicle, flat or contract).  
See also: [Links (tab)](#verknupfungen), [Link kind](#verweisart), [Target type](#zieltyp).

<a id="verweisart"></a>**Link kind** (*Verweisart*) · ~ with explanation · administrators  
Whether a link is a belonging ("belongs to", e.g. an invoice to the contract) or only a reference (e.g. the issuer). The folder shows the kind on the link and in the links tab.  
See also: [Link (field)](#verweis).

<a id="verknupfungen"></a>**Links (tab)** (*Verknüpfungen*) · ~ with explanation · everyone  
The tab that shows all folders linking to this folder – the opposite direction of the link.  
See also: [Link (field)](#verweis).

<a id="mein-konto"></a>**My account** (*Mein Konto*) · ✓ everyday word · everyone  
The personal settings of the signed-in user – one click on your own name at the top right, then "My account". We describe paths the way you click, e.g. "My account → Security → API keys".

<a id="hinweis-von-paketen"></a>**Note from a package** (*Hinweis von Paketen*) · ✓ everyday word · everyone  
A short sentence that a package sets on a folder, e.g. "The items add up to €118.40, the invoice says €120.80". It appears in yellow in the notes line above the tabs, always with the name of the package, and never stops you saving.  
See also: [Calculated field](#berechnetes-feld), [Package](#paket).

<a id="organisation"></a>**Organisation** · ✓ everyday word · everyone  
A company, authority, bank, practice, club or other body you deal with. Folder type from the package Basis; other packages link to it (contract partner, insurer, bank …).  
See also: [Branch](#niederlassung), [Person](#person).

<a id="prozent"></a>**Percentage** (*Prozent*) · ✓ everyday word · everyone  
Field kind for a percentage, e.g. the tax rate "19%" – with decimals, freely chosen (foreign rates too). "19", "19%" and "19.0" mean the same.  
See also: [Field kind](#feldart).

<a id="zeitraum"></a>**Period** (*Zeitraum*) · ✓ everyday word · everyone  
Field kind for a length of time made of a whole number and a unit – days, weeks, months or years, e.g. the notice period "3 months" or the term "1 year". Sorted and compared by length. Not to be confused with "in period" in date conditions (year, month).  
See also: [Field kind](#feldart), [Deadline](#frist).

<a id="person"></a>**Person** · ✓ everyday word · everyone  
A human you deal with – contact person, doctor, landlord, relatives. Folder type from the package Basis (from 1.1.0). A person is **not a user** and can't sign in.  
See also: [User](#benutzer), [Organisation](#organisation), [Branch](#niederlassung).

<a id="pflichtfeld"></a>**Required field** (*Pflichtfeld*) · ✓ everyday word · everyone  
A field that must be filled in before the folder can be saved.  
See also: [Unique](#eindeutig).

<a id="trefferliste"></a>**Result list** (*Trefferliste*) · ✗ technical term · administrators  
Sets which columns a list shows. A folder type has one or more result lists; one of them is the default. A view or a links tab chooses one of them, otherwise the default applies. If a view shows several folder types, only result lists with the same identifier in all of them can be chosen, with the common columns.

<a id="anzeigen-wenn"></a>**Show if …** (*Anzeigen, wenn …*) · ~ with explanation · administrators  
Setting on a field or section of a folder type – the folder only shows it when the conditions apply, e.g. section "Rent" only for contract type rent. A hidden section hides all fields up to the next section. Hiding is for tidiness, not protection – values stay saved and appear in the API, exports and data access requests; a field is only required while it is shown.  
See also: [Condition](#bedingung), [Used for work](#beruflich-genutzt), [Folder type](#mappentyp).

<a id="ablageort"></a>**Storage location** (*Ablageort*) · ✓ everyday word · everyone  
A place where paper is kept – e.g. a binder, a box, a safe deposit box or "destroyed". Storage locations lie inside each other ("at home › study cupboard › red binder"). The folder type comes with the Basis package.  
See also: [Whereabouts of original documents](#verbleib-originaldokumente), [Folder type](#mappentyp).

<a id="unteransicht"></a>**Sub-view** (*Unteransicht*) · ~ with explanation · administrators  
A view below another one. It inherits its permissions.

<a id="systemmappentyp"></a>**System folder type** (*Systemmappentyp*) · ~ with explanation · administrators  
A folder type that Ablago brings itself – User, Role and Post.  
See also: [Folder type](#mappentyp).

<a id="register"></a>**Tab** (*Register*) · ~ with explanation · everyone  
A divider in a folder, e.g. General (with fields), Documents, Links or History. Notes and History are fixed tabs of every folder.

<a id="tabelle"></a>**Table** (*Tabelle*) · ✓ everyday word · everyone  
Field kind without a value of its own – shows, between the fields of a folder, the folders of another type that link to it, with the columns of a results list, e.g. the items of an invoice; below it "+ New" (such as "+ Item"). Only folders you may read; no totals.  
See also: [Field kind](#feldart), [Tab](#register), [Result list](#trefferliste), [Link (field)](#verweis).

<a id="zieltyp"></a>**Target type** (*Zieltyp*) · ~ with explanation · administrators  
A folder type whose folders a link may point to; a link has one or several. With "all of the same type", several chosen folders stay with the type of the first one. Packages can also bring optional target types – types of another package that Ablago adds as soon as it is installed.  
See also: [Link (field)](#verweis), [Folder type](#mappentyp).

<a id="tipp"></a>**Tip** (*Tipp*) · ✓ everyday word · everyone  
One sentence showing what else you can do in Ablago – at most one a day as a quiet line on the start page; the sentence leads to the place or starts a tour. Hide it with ×, switch it off completely in My account.  
See also: [Tour](#rundgang), [Discover Ablago](#ablago-entdecken).

<a id="titel"></a>**Title** (*Titel*) · ✓ everyday word · everyone  
The display name of a folder. It is formed from a template with field values.

<a id="rundgang"></a>**Tour** (*Rundgang*) · ✓ everyday word · everyone  
A short guided walk on the real interface in a few steps; each step highlights one place. Ablago's own tour starts the first time a new account signs in; everyone finds it under "Discover Ablago".  
See also: [Tip](#tipp), [Discover Ablago](#ablago-entdecken).

<a id="eindeutig"></a>**Unique** (*Eindeutig*) · ~ with explanation · administrators  
A field value that may occur only once in this folder type, e.g. an invoice number.

<a id="beruflich-genutzt"></a>**Used for work** (*Beruflich genutzt*) · ✓ everyday word · administrators  
The one attribute of the Library – the Library is also used for work (self-employed, club, business). Default no. Folder types then show their work-related fields and sections; permissions, views and automations can look at it. Applies to the whole Library, not per person; set it in Workbench → Use.  
See also: [Show if …](#anzeigen-wenn), [Condition](#bedingung).

<a id="version"></a>**Version** · ✓ everyday word · everyone  
A document can have several versions. Replacing creates a new version; the older ones stay underneath and can be restored. Only in tabs with versioning. Not to be confused with the version of Ablago.  
See also: [Document](#dokument), [Archive mode](#archivmodus), [Version of Ablago](#version-von-ablago).

<a id="ansicht"></a>**View** (*Ansicht*) · ~ with explanation · everyone  
A saved selection of folders – which folder types, with which conditions. Views are in the tree on the left of the Library. How something looks, on the other hand, is called "appearance".  
See also: [Sub-view](#unteransicht), [Condition](#bedingung), [Result list](#trefferliste).

<a id="verbleib-originaldokumente"></a>**Whereabouts of original documents** (*Verbleib Originaldokumente*) · ✓ everyday word · everyone  
The field on a folder that points to the paper's storage location. In all folder types with the same identifier, so that common lists and views work.  
See also: [Storage location](#ablageort).

<a id="werkbank"></a>**Workbench** (*Werkbank*) · ~ with explanation · administrators  
The administrators' work area. Folder types, views, users and settings are maintained and Ablago is operated here.  
See also: [Library](#ablage), [Administrator](#administrator), [Customise the workbench](#werkbank-anpassen).

## Working in the Library {#arbeiten-in-der-ablage}

<a id="abwesenheit"></a>**Absence** (*Abwesenheit*) · ✓ everyday word · everyone  
A period in which a user is not there – with a stand-in who takes over their tasks.

<a id="aktionen"></a>**Actions** (*Aktionen*) · ✓ everyday word · everyone  
The menu "Folder ▾" next to a folder's title – assign task, remind, send, export and more. It used to be called "Actions" itself.

<a id="erweiterte-suche"></a>**Advanced search** (*Erweiterte Suche*) · ✓ everyday word · everyone  
A search form across the fields of several folder types and the text in documents.

<a id="archivfassung"></a>**Archive version** (*Archivfassung*) · ~ with explanation · everyone  
A searchable PDF/A that a package such as PDF/A stores in addition to a document – a format that can still be opened in many years and without Ablago. The original stays unchanged. If there is one, Ablago shows it ("View: archive version (PDF/A)"). PDFs, scans, photos and emails (.eml, .msg) can get one; you read an email in it like a letter.  
See also: [Document](#dokument), [Version](#version).

<a id="zuordnen"></a>**Assign** (*Zuordnen*) · ✓ everyday word · everyone  
Assigning post to an existing or new folder. The documents move into the folder's tab in the process.

<a id="kanal"></a>**Channel** (*Kanal*) · ✗ technical term · everyone  
How post came into Ablago or went out. Ablago sets Uploaded, email, Folder (intake folder) and API itself; Scan, Import and WebDAV can be chosen by hand in the list.

<a id="gutschrift"></a>**Credit note** (*Gutschrift*) · ✓ everyday word · everyone  
An amount you get back (also a refund) – in Ablago an amount with a minus, e.g. "−£25.00". This only works for amount fields where the administrator has ticked "Allow negative amounts"; the field then says "Enter it with a minus".  
See also: [Field](#feld).

<a id="frist"></a>**Deadline** (*Frist*) · ✓ everyday word · everyone  
A task that arises from a date field with a lead time, e.g. "Cancel by …".  
See also: [Reminder](#erinnerung), [To do](#zu-erledigen).

<a id="richtung-post"></a>**Direction (post)** (*Richtung (Post)*) · ✓ everyday word · everyone  
Whether post is incoming or outgoing. "Send by email" creates outgoing post.  
See also: [Post](#post).

<a id="export"></a>**Export** · ~ with explanation · everyone  
Downloading selected folders of a view as Excel, CSV, ZIP or PDF.  
See also: [Full export](#vollexport), [Export my data](#meine-daten-exportieren), [Backup](#sicherung).

<a id="formatierter-text"></a>**Formatted text** (*Formatierter Text*) · ~ with explanation · everyone  
Text with headings, lists and emphasis (Markdown) – as a field kind and in notes.

<a id="volltext"></a>**Full text** (*Volltext*) · ✗ technical term · everyone  
The searchable text in the documents – from the file's text layer or from text recognition.  
See also: [Text recognition](#texterkennung), [Advanced search](#erweiterte-suche).

<a id="historie"></a>**History** (*Historie*) · ✓ everyday word · everyone  
The story of a folder – changes before and after, documents, bin, notes, tasks. The technical operating log, on the other hand, is called "log".

<a id="link"></a>**Link (address)** (*Link*) · ✓ everyday word · everyone  
An address of a view or folder, e.g. via "Copy link" – also readable via folder type and field values. In the German interface, "Link" only stands for addresses; fields that point to folders are called Verweis.

<a id="erwahnung"></a>**Mention** (*Erwähnung*) · ✓ everyday word · everyone  
Naming a user with @ in formatted text. It creates a task for them.

<a id="neue-post"></a>**New post** (*Neue Post*) · ✓ everyday word · everyone  
The view with post that has not yet been assigned or completed. Whoever is given post additionally has the task "Post for you".

<a id="notiz"></a>**Note** (*Notiz*) · ✓ everyday word · everyone  
A comment on a folder.

<a id="ubergeordnete-mappe"></a>**Parent folder** (*Übergeordnete Mappe*) · ✓ everyday word · everyone  
The folder a part belongs to – such as the invoice of its items (#1031). The parts are shown at it (usually as a table), new ones are created there, and they go with it when it is deleted and restored.  
See also: [Part](#teil).

<a id="teil"></a>**Part** (*Teil*) · ✓ everyday word · everyone  
A folder that always belongs to another one and only appears there – such as an invoice item at its invoice (#1031). Parts are not shown in views, search and "Recently opened"; what is in a part finds the parent folder ("found in …") if you may read both. If you open a part directly, "Part of …" is shown at the top. Deleted and restored with the parent folder. No protection – it remains reachable through the API, export and links.  
See also: [Parent folder](#ubergeordnete-mappe), [Is part of another folder](#ist-teil-einer-anderen-mappe), [Table](#tabelle).

<a id="weitergeben"></a>**Pass on** (*Weitergeben*) · ✓ everyday word · everyone  
Transferring a task to another user.

<a id="post"></a>**Post** · ✓ everyday word · everyone  
Everything that comes into Ablago or goes out – scan, upload, email. Post is a system folder type with channel, direction and status.  
See also: [New post](#neue-post), [Assign](#zuordnen), [Channel](#kanal), [Direction (post)](#richtung-post), [Status (post)](#stand-post).

<a id="vorschaubild"></a>**Preview** (*Vorschaubild*) · ✓ everyday word · everyone  
A small image of the first page next to a PDF or image in the document list; created in the background and not backed up.  
See also: [Document](#dokument).

<a id="erinnerung"></a>**Reminder** (*Erinnerung*) · ✓ everyday word · everyone  
A task set by hand for a particular day (folder ▾ → Remind).

<a id="vertretung"></a>**Stand-in** (*Vertretung*) · ✓ everyday word · everyone  
A user takes over another's tasks during an absence. The stand-in gets a task of the kind "Stand-in" for this.

<a id="stand-post"></a>**Status (post)** (*Stand (Post)*) · ✓ everyday word · everyone  
How far post has been handled – New (not yet handled), Assigned (is with a matching folder) or Done (nothing more to do).  
See also: [Post](#post), [New post](#neue-post).

<a id="aufgabe"></a>**Task** (*Aufgabe*) · ✓ everyday word · everyone  
Something a person should do on a folder. Kinds are Doesn't fit, Mention, Assigned (given by hand), Post for you, Deadline, Reminder, stand-in and Access request.  
See also: [To do](#zu-erledigen), [Deadline](#frist), [Reminder](#erinnerung), [Job](#auftrag).

<a id="zu-erledigen"></a>**To do** (*Zu erledigen*) · ✓ everyday word · everyone  
The top view – as a list, the folders where I should do something (my open tasks); as month and year, my dates in a calendar.  
See also: [Task](#aufgabe), [Deadline](#frist).

## Administration (workbench) {#verwaltung-werkbank}

<a id="administrator"></a>**Administrator** · ✓ everyday word · everyone  
A user with access to the workbench. Permissions don't restrict them.

<a id="archivmodus"></a>**Archive mode** (*Archivmodus*) · ~ with explanation · administrators  
A setting per folder type for retention obligations – with versions and a deletion lock until the end of the period.

<a id="betrieb"></a>**Business** (*Betrieb*) · ✓ everyday word · administrators  
The template under "Customise the workbench" for the self-employed and small businesses – with number sequences, archive mode, mailboxes and further areas. Its counterpart is the template "Household".  
See also: [Customise the workbench](#werkbank-anpassen), [Household](#haushalt).

<a id="kann-aus-post-angelegt-werden"></a>**Can be created from post** (*Kann aus Post angelegt werden*) · ~ with explanation · administrators  
Tick in the basics of a folder type (#937). Only folder types with it can be chosen under "Where does this belong?" when a document is taken over from the post – for everyone who may create folders there. On by default for folder types with a documents tab; never for system folder types.  
See also: [Folder type](#mappentyp), [Post](#post), [How to recognise it](#woran-man-ihn-erkennt).

<a id="beim-auswahlen-ubernehmen"></a>**Copy when selected** (*Beim Auswählen übernehmen*) · ~ with explanation · administrators  
Setting on a link field (#1037) – pairs "field of the referenced folder → field of this folder". When a folder is chosen, Ablago suggests its values in empty fields, marked "suggested from …" (e.g. the notice period from the contract type). Never overwrites, never passwords, only values you may read.  
See also: [Fill from document](#aus-dokument-fullen).

<a id="werkbank-anpassen"></a>**Customise the workbench** (*Werkbank anpassen*) · ~ with explanation · administrators  
Sets which areas are on the left of the workbench – following a template ("Household", "Business" or "Everything") and with exceptions. Hiding doesn't switch anything off. New installations start with "Household"; installations from before this setting show everything.  
See also: [Workbench](#werkbank), [Overview](#ubersicht), [Business](#betrieb).

<a id="tagliche-zusammenfassung"></a>**Daily summary** (*Tägliche Zusammenfassung*) · ✓ everyday word · everyone  
An email that lists a user's open tasks once a day – only if they have some and aren't absent. Administrators switch it on under Workbench → Settings → Notifications and tasks; everyone chooses the time and weekdays under My account.  
See also: [Task](#aufgabe), [To do](#zu-erledigen).

<a id="design"></a>**Design** · ✓ everyday word · administrators  
What the interface looks like – logo, lettering, colours (light, dark, high contrast or following the device) and your own CSS. Administrators create designs under Workbench → Designs and set the default; every user chooses theirs under My account in "Appearance".  
See also: [Appearance](#darstellung).

<a id="expertenmodus"></a>**Expert mode** (*Expertenmodus*) · ✗ technical term · advanced users  
An expandable section under Workbench → Packages, directly below the buttons. Expanded, it shows "Further sources" and "Upload package" – for package developers and Ablago without the internet. Collapsed at first; the browser remembers per user whether it is open.  
See also: [Package](#paket), [Package catalogue](#paketkatalog).

<a id="aus-dokument-fullen"></a>**Fill from document** (*Aus Dokument füllen*) · ~ with explanation · administrators  
Tick on a field (#938, formerly "Use for recognition") – the button "Fill in from document" may fill this field from a photo or document as a suggestion. With kind ("What is in the field?") and recognition hint.  
See also: [Use to find existing folders](#zum-wiederfinden-nutzen).

<a id="woran-man-ihn-erkennt"></a>**How to recognise it** (*Woran man ihn erkennt*) · ~ with explanation · administrators  
Short sentence in the basics of a folder type (#937, at most 300 characters), e.g. "Contains invoice number, amount and payment deadline". Helps recognition assign a document to the right folder type. The description is for people, this sentence for recognition.  
See also: [Can be created from post](#kann-aus-post-angelegt-werden).

<a id="eingangsordner"></a>**Intake folder** (*Eingangsordner*) · ~ with explanation · administrators  
A folder that Ablago watches, e.g. for "Scan to Folder". Every file in it becomes post.

<a id="ist-teil-einer-anderen-mappe"></a>**Is part of another folder** (*Ist Teil einer anderen Mappe*) · ~ with explanation · administrators  
Tick in the basics of a folder type with the link field through which the folder belongs ("Belongs to it through",  
See also: [Part](#teil), [Parent folder](#ubergeordnete-mappe), [Table](#tabelle), [Folder type](#mappentyp).

<a id="postfach"></a>**Mailbox** (*Postfach*) · ~ with explanation · administrators  
A connected email account (IMAP) from which Ablago fetches post.

<a id="nummernkreis"></a>**Number sequence** (*Nummernkreis*) · ✗ technical term · administrators  
Sequential numbers following a pattern such as {jjjj}-R{zaehler:4} (giving e.g. 2026-R0001), for instance for invoice numbers.

<a id="ubersicht"></a>**Overview** (*Übersicht*) · ✓ everyday word · administrators  
The first page of the workbench – what needs doing in Ablago right now, with notices, status and inventory.  
See also: [Workbench](#werkbank).

<a id="paket"></a>**Package** (*Paket*) · ~ with explanation · administrators  
An installable bundle of folder types, views and examples from a package catalogue, e.g. "Basis". An update only adds; it removes and changes nothing.  
See also: [Package catalogue](#paketkatalog), [Expert mode](#expertenmodus), [Package runner](#paket-laufer), [Publisher](#herausgeber).

<a id="paketkatalog"></a>**Package catalogue** (*Paketkatalog*) · ~ with explanation · administrators  
The list of packages a DMS can install (a file katalog.json on the internet). Ablago only queries the official catalogue at the push of a button ("Fetch catalogue"). Further catalogues are entered in expert mode under "Further sources".  
See also: [Package](#paket), [Expert mode](#expertenmodus).

<a id="paket-laufer"></a>**Package runner** (*Paket-Läufer*) · ✗ technical term · advanced users  
The part of Ablago that runs the code of packages – isolated in its own process, with limits for memory and time and only with the permissions an administrator confirmed during installation. The code only reaches the network and the internet at the addresses the package names – the preview shows this as "no access to network and internet" or "access to network/internet only to …". Its status is shown under Workbench → Packages → package in the section "Package runner".  
See also: [Package](#paket), [Service account](#dienstkonto).

<a id="berechtigungen"></a>**Permissions** (*Berechtigungen*) · ✓ everyday word · administrators  
Who may do what. On the folder type – create, read, edit, delete, see passwords – with a default plus rules; on the view – see, create, export – inherited by the sub-views. They don't apply to administrators.

<a id="herausgeber"></a>**Publisher** (*Herausgeber*) · ~ with explanation · administrators  
Who publishes a package, as a reversed domain, e.g. app.ablago for the official packages (#1084). It is shown next to the name, e.g. "Contracts · app.ablago". Ablago never replaces an installed package with one of the same ID from a different publisher.  
See also: [Package](#paket), [Package catalogue](#paketkatalog).

<a id="region"></a>**Region** · ~ with explanation · administrators  
Where the Library is at home – country, state and time zone (Workbench → Settings → Region). Public holidays, "today" for deadlines and all times of reminders, schedules and the Daily summary follow it.  
See also: [Daily summary](#tagliche-zusammenfassung).

<a id="fehler-nachstellen"></a>**Reproduce a problem** (*Fehler nachstellen*) · ~ with explanation · administrators  
An administrator temporarily works under another user's account to see a problem. "Back to your own account" returns.

<a id="aufbewahrung-abgelaufen"></a>**Retention expired** (*Aufbewahrung abgelaufen*) · ✓ everyday word · administrators  
The list of folders whose retention period has expired (Workbench → Users and security). Formerly "May go".

<a id="rolle"></a>**Role** (*Rolle*) · ~ with explanation · administrators  
A group of users, e.g. "Parents". The basis for permission rules. Not to be confused with the system role.  
See also: [System role](#systemrolle).

<a id="regel"></a>**Rule** (*Regel*) · ~ with explanation · administrators  
An if-then building block of the permissions – a condition, then grant or withdraw a permission, optionally with stop.

<a id="paket-nach-zeitplan-ausfuhren"></a>**Run package on schedule** (*Paket nach Zeitplan ausführen*) · ~ with explanation · administrators  
Then card of an automation with the trigger "Schedule" – it tells a package that its time has been reached (e.g. "Check contracts daily" at 5 a.m.) so that it recalculates something that depends only on the date. The package works with its own rights; an automation supplied with a package only calls its own package.  
See also: [Package](#paket), [Calculated field](#berechnetes-feld), [Switched on straight away](#gleich-eingeschaltet).

<a id="suche-und-volltext"></a>**Search and full text** (*Suche und Volltext*) · ~ with explanation · administrators  
The workbench area under Post and incoming for text recognition, archive version, automatic shrinking, typos and synonyms. Combines the former areas "Text recognition" and "Search".

<a id="dienstkonto"></a>**Service account** (*Dienstkonto*) · ~ with explanation · administrators  
The account with which a package with code works in Ablago, e.g. "Package Text recognition". It never signs in, isn't listed under Users, never deletes and only has the permissions from the package. In the history it appears where the package changed something.  
See also: [Package runner](#paket-laufer), [User](#benutzer).

<a id="anmeldeschutz"></a>**Sign-in protection** (*Anmeldeschutz*) · ~ with explanation · administrators  
Lock after failed attempts, blocked IP addresses, requirements for two-factor sign-in and sign-in via a provider.

<a id="anmeldung-uber-einen-anbieter"></a>**Sign-in via a provider** (*Anmeldung über einen Anbieter*) · ~ with explanation · everyone  
Signing in with someone else's account, e.g. Microsoft 365 (OpenID Connect).

<a id="gleich-eingeschaltet"></a>**Switched on straight away** (*Gleich eingeschaltet*) · ~ with explanation · administrators  
An automation supplied with a package that the package offers ticked when installing. The administrator can untick it; an update never changes on or off afterwards.  
See also: [Package](#paket), [Run package on schedule](#paket-nach-zeitplan-ausfuhren).

<a id="systemrolle"></a>**System role** (*Systemrolle*) · ~ with explanation · administrators  
Whether a user is an administrator or a member. Only administrators get into the workbench.  
See also: [Role](#rolle), [Administrator](#administrator).

<a id="testlauf"></a>**Test run** (*Testlauf*) · ~ with explanation · administrators  
Checks which permissions a particular user ends up with.

<a id="texterkennung"></a>**Text recognition** (*Texterkennung*) · ~ with explanation · administrators  
Recognises text in images and scanned PDFs so that it becomes searchable.

<a id="probelauf"></a>**Trial run** (*Probelauf*) · ~ with explanation · administrators  
Trying out an automation with a chosen folder without anything being changed or anyone being notified – Ablago only shows what would happen.  
See also: [Test run](#testlauf).

<a id="zwei-faktor-anmeldung"></a>**Two-factor sign-in** (*Zwei-Faktor-Anmeldung*) · ~ with explanation · everyone  
An additional code from an app when signing in.

<a id="zum-wiederfinden-nutzen"></a>**Use to find existing folders** (*Zum Wiederfinden nutzen*) · ~ with explanation · administrators  
Tick on a field (#938) – Ablago uses this value to find existing folders again in a document, e.g. customer number, contract number, invoice number or registration number. This results in suggestions with evidence ("How Ablago recognises it") and the warning if a folder already exists. Independent of "Unique".  
See also: [Fill from document](#aus-dokument-fullen).

<a id="benutzer"></a>**User** (*Benutzer*) · ✓ everyday word · everyone  
An account with which someone signs in. Stored as a system folder in Ablago. People and companies you deal with (contacts) are not users, but ordinary folders of the folder type "Person" or "Organisation" from the package Basis.

## Operation and security {#betrieb-und-sicherheit}

<a id="api"></a>**API** · ✗ technical term · advanced users  
The interface through which programs work with Ablago. Access with a personal API key.

<a id="sicherung"></a>**Backup** (*Sicherung*) · ✓ everyday word · administrators  
An encrypted complete backup that can be restored in Ablago. Not an export – not readable without Ablago.  
See also: [Restore](#wiederherstellen), [Test restore](#probe-wiederherstellung), [Full export](#vollexport).

<a id="konsole"></a>**Console** (*Konsole*) · ✗ technical term · advanced users  
The command "dms" in the container for emergencies and operation.

<a id="debug-modus"></a>**Debug mode** (*Debug-Modus*) · ✗ technical term · advanced users  
A more detailed technical log for troubleshooting.

<a id="demo-daten"></a>**Demo data** (*Demo-Daten*) · ✓ everyday word · administrators  
Generated sample folders for trying out and for load tests.

<a id="notfallblatt"></a>**Emergency sheet** (*Notfallblatt*) · ✓ everyday word · administrators  
A PDF with the key and instructions for restoring.

<a id="meine-daten-exportieren"></a>**Export my data** (*Meine Daten exportieren*) · ✓ everyday word · everyone  
A user downloads their own data under My account.

<a id="fingerabdruck"></a>**Fingerprint** (*Fingerabdruck*) · ~ with explanation · administrators  
A short check code by which you recognise a key.

<a id="vollexport"></a>**Full export** (*Vollexport*) · ~ with explanation · administrators  
All data in open formats, readable even without Ablago – so that nobody is tied to Ablago.

<a id="haushalt"></a>**Household** (*Haushalt*) · ✓ everyday word · administrators  
The template under "Customise the workbench" for home – lean, only what a family needs for setting up and backing up. Since 04.11.2026 the whole installation is neutrally called "Library" (Ablage); "Mandant" only appears in the code.  
See also: [Business](#betrieb), [Customise the workbench](#werkbank-anpassen), [Library](#ablage).

<a id="auftrag"></a>**Job** (*Auftrag*) · ✗ technical term · administrators  
Work that Ablago does in the background and whose progress you can see, e.g. creating demo data, full export, assigning numbers retrospectively. Only one job runs at a time. Work for people is called a task.

<a id="schlussel"></a>**Key** (*Schlüssel*) · ~ with explanation · administrators  
The secret key with which password fields and backups are encrypted. It is never in the database. The fixed name of a field, on the other hand, is called identifier.  
See also: [Fingerprint](#fingerabdruck), [Emergency sheet](#notfallblatt).

<a id="protokoll"></a>**Log** (*Protokoll*) · ~ with explanation · advanced users  
The server's running operating log with modules and levels (Workbench → Log). A folder's story, on the other hand, is called history.  
See also: [History](#historie).

<a id="wartungsmodus"></a>**Maintenance mode** (*Wartungsmodus*) · ~ with explanation · administrators  
A temporary lock for users with an announcement, e.g. during a restore.

<a id="wartungsoperationen"></a>**Maintenance operations** (*Wartungsoperationen*) · ✗ technical term · administrators  
One-off upkeep work, e.g. assigning numbers retrospectively.

<a id="gemeldete-fehler"></a>**Reported problems** (*Gemeldete Fehler*) · ✓ everyday word · administrators  
Problems that users have submitted via "Report a problem" (Workbench → Reported problems).

<a id="wiederherstellen"></a>**Restore** (*Wiederherstellen*) · ✓ everyday word · administrators  
Restoring a backup in Ablago.

<a id="einrichtungscode"></a>**Setup code** (*Einrichtungscode*) · ~ with explanation · administrators  
The code from the container's log that unlocks the setup.

<a id="einrichtungsassistent"></a>**Setup wizard** (*Einrichtungsassistent*) · ✓ everyday word · administrators  
The steps when Ablago is started for the first time.  
See also: [Setup code](#einrichtungscode).

<a id="speicherplatz"></a>**Storage space** (*Speicherplatz*) · ✓ everyday word · administrators  
How full the data folders are, with thresholds for warnings (under system health).  
See also: [System health](#systemzustand).

<a id="systemzustand"></a>**System health** (*Systemzustand*) · ~ with explanation · administrators  
How the server is doing right now – storage space with warning thresholds and the load of CPU, memory and network (Workbench → Maintenance and troubleshooting → system health). It means the state in operation, not the configuration.  
See also: [Storage space](#speicherplatz).

<a id="probe-wiederherstellung"></a>**Test restore** (*Probe-Wiederherstellung*) · ~ with explanation · administrators  
Checks a backup without touching the real data.

<a id="version-von-ablago"></a>**Version of Ablago** (*Version von Ablago*) · ✓ everyday word · everyone  
The state of the program, e.g. 0.73. An update brings a new version of Ablago; it changes nothing about documents and their versions. What's new is listed under "New in this version".  
See also: [Version](#version).

## Open questions and words to avoid {#noch-offen}

Which German words are still being discussed, which questions have been decided and which words the German texts avoid is listed on the [German page](../../begriffe/). It concerns the German wording.

*As of: 2026-11-10*
