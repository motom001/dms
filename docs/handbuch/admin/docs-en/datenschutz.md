# Data protection in Ablago {#datenschutz-in-ablago}

Ablago is **designed for data protection** – "data protection by design and by default" is what Art. 25 GDPR calls it. It runs at your place, sends nothing home and brings tools with which you give access, keep to retention periods and delete. That way you can store data of family, tenants and customers in it with a clear conscience. This page shows what there is for this and where you find it, what you have to arrange yourself and how to proceed step by step with a request.

!!! note "Supports – replaces nothing. No legal advice."
    Software alone is never "GDPR-compliant", and Ablago has no seal for it. Data protection only comes from **software, your processes and your documentation together** – as with the [procedure documentation](verfahrensdokumentation.md) under GoBD. Ablago compiles data, locks and deletes and records what happened. Whether and what you have to hand over, keep or delete is your decision – in case of doubt with your data protection officer or legal advice. This page is not legal advice.

## Data protection built in { #datenschutz-eingebaut }

| GDPR | What Ablago has for it | Where |
| --- | --- | --- |
| Art. 5(1)(c) and Art. 25 – data minimisation, privacy by default | **Self-hosted:** the data is only on your device – or with a [provider](https://help.ablago.app/installieren/aktuell/en/anbieter/) you choose yourself. [No telemetry](#keine-telemetrie), no tracking, no advertising, no AI in the core; text recognition runs locally. AI functions come as packages. They can run entirely on your device ([AI locally](ki-lokal.md)); they only ask an outside service if you set up its address and confirm it at installation. Who may see what is governed by permissions per folder type with rules. | Workbench → Folder types → [Permissions](berechtigungen.md) |
| Art. 5(1)(e) – storage limitation; Art. 17 – erasure | [Archive mode](archiv.md) with retention period and the list **Retention expired**; [bin](papierkorb.md) for folders and documents with final deletion; the history of deleted folders goes after a configurable time | Workbench → Folder types → Archive mode, Workbench → Retention expired, Workbench → Bin |
| Art. 18 – restriction (locking) | **Deletion lock until the end of the period** in archive mode – the first building block of a [locking and deletion concept](#sperr-und-loschkonzept-aufsetzen); you restrict access via permissions | Workbench → Folder types |
| Art. 15 – access | [Access copy](#auskunft-nach-art-15-dsgvo) as a ZIP with cover sheet, checklist and proof; [deliver](#auskunft-zustellen) via retrieval link or email | Workbench → Data protection requests |
| Art. 20 – data portability | **Personal export** for every user, **full export** of all data – both in open formats (CSV, JSON, Excel, documents in the original) | My account → Account → Export my data (off by default, switch on under Workbench → Full export); Workbench → Full export ([Exporting data](export.md)) |
| Art. 5(2) – accountability; Art. 30 – records | **History** of every folder (who changed or retrieved what and when – also via API and drive, #800), [log](fehlersuche.md#protokoll), proof of every access copy in the person's history, [deletion log](#loschprotokoll) with checksums without content; create the [deletion concept](loeschkonzept.md) from Ablago and the template [procedure documentation](verfahrensdokumentation.md) | Tab *History* on every folder, Workbench → Log, Workbench → Data protection requests |
| Art. 32 – security | [Encrypted](verschluesselung.md) password fields and credentials, encrypted [backup](sicherung.md) with [test restore](wiederherstellen.md#probe-wiederherstellung), [sign-in protection and two-factor sign-in](anmeldeschutz.md), checksums for every file, notes on [HTTPS](installation.md#https-und-zertifikate) | Workbench → Encryption, Backup, Sign-in protection |

## No telemetry { #keine-telemetrie }

Ablago sends **no usage data** – neither to the project nor to anyone else: no anonymous statistics, no regular "signs of life", no crash reports, no tracking in the interface. Out of the box, the interface loads nothing from outside servers – no fonts, scripts or images.

### What leaves your Library – and when { #was-deine-ablage-verlasst }

**Ablago doesn't open any connection to the internet by itself.** There is no automatic search for new versions – so nothing to switch off either. Things only go outside when you trigger or set them up. This table is the one place to look things up; the linked pages say more in each case:

| Connection | When | Where to, what |
| --- | --- | --- |
| **Version check** | only at the push of a button under **Workbench → System health → Version and updates** | GitHub (Ablago's state), endoflife.date (Node.js, PostgreSQL, Alpine), npm registry (libraries). The request to GitHub contains the commit id of your version so that the changes since then can be counted – no data from your Library. See [Technology](technik.md#versionen-und-aktualisierung). |
| **Package catalogue** | at the push of a button under **Workbench → Packages** (fetch catalogue, check for new versions) and when you open an installation link from the catalogue | GitHub ([Packages](pakete.md)); further catalogues only if you enter them |
| **Email** | when you set up email sending or [mailboxes](postfaecher.md) | your mail server. Going out: folders and documents that someone sends (also via the [interface](api.md)), the [daily summary](aufgaben.md#tagliche-zusammenfassung) (folder titles and links, on by default, everyone unsubscribes themselves), invitations, password links, [access copies](#auskunft-erteilen) and retrieval links |
| **Finding the mail server** | when setting up [email sending](e-mail-versand.md#server-und-port-finden), if the domain isn't in the built-in list | only the domain: as a DNS query to the device's DNS server and as an HTTPS request to your own provider's domain; to the Thunderbird database (Mozilla) only at the push of a button. Never address and password |
| **AI service** | only if you install a package such as the AI assistant and confirm its [service address](pakete.md#dienst-adresse) | exactly this address: with "Ask your library" excerpts from documents, with "Fill in from document" the document text, with "Where does this belong?" the start of the document and the name, short description and "How to recognise it" of the allowed folder types. In the home network ([AI locally](ki-lokal.md)) everything stays with you |
| **Translation service** | only if you **explicitly choose and confirm** a translation package with network access under [Workbench → Languages → Translate content](sprachen.md#inhalte-ubersetzen); a package that translates on the device sends nothing out | for each press of "Show translation" exactly that one text (field, note or full text) to the package's address; whoever translates sees it on the result |
| **Off-site backup** | when you set up a backup target package | the encrypted backup, without the key ([Off-site copy](sicherung-ausser-haus.md)) |
| **Access from outside** | when you make Ablago reachable via a tunnel (e.g. Cloudflare Tunnel, Tailscale Funnel) | all traffic runs via this provider ([Reachability from the internet](#erreichbarkeit-aus-dem-internet)) |
| **Passing on links** | when someone sends a [link via field values](direktlinks.md) by email or chat | the field values in the link (e.g. a contract number) can be read in it |
| **Sign-in via a provider** | when you [set it up](anmeldeschutz.md#anmeldung-uber-einen-anbieter-openid-connect) | your provider (OpenID Connect) |
| **Webhooks** | when you approve a target under **Workbench → Webhooks** and a user creates a webhook there | only the approved targets, only numbers (new post, to do, deadlines) without titles or content ([Webhooks](webhooks.md)) |
| **Packages with code** | only if a package needs it and you confirm it at installation | only the addresses the package states ([A package's permissions](pakete.md#recht-netzwerk-und-internet)) |
| **Manual** | when you click **Help** or a **?** | the supplied manual under `/hilfe/` works without internet ([Help without internet](technik.md#hilfe-ohne-internet)); your browser opens links to the online manual. |

**The online manual** at help.ablago.app is served by GitHub Pages; as with every website, GitHub sees your IP address. The manual itself loads nothing from third parties – no fonts from Google, no scripts, no badges from outside services. CI checks this with every build, for the help in the program as well.

Whoever wants to tell the project that and how they use Ablago does so deliberately and themselves – via the page [Who uses Ablago?](https://github.com/motom001/dms/issues?q=label%3Anutzt-das-dms) with the form [I use Ablago](https://github.com/motom001/dms/issues/new?template=ich-nutze-das-dms.yml). Ablago reports nothing.

## What you have to arrange yourself { #grenzen }

Ablago gives you tools. These points stay with you as the controller:

- **Record of processing activities** (Art. 30), **legal bases and information obligations** (Art. 13, 14) – for instance the privacy notice in the tenancy agreement. The details for this are in Ablago: folder types, purposes from the [settings](#einstellungen), periods from archive mode.
- **Which period applies:** you clarify retention periods with your tax adviser; Ablago implements what you enter.
- **Deleting after the period ends:** Ablago never deletes by itself. You check **Retention expired** regularly.
- **Copies outside the Library:** deleted data is still in older [backups](sicherung.md#zeitplan-und-aufbewahrung) until they go according to your retention (default: up to 12 months; manually created ones stay until you delete them), in full exports and personal exports in the [export folder](export.md#export-ordner) (deleted after downloading or after 7 days), in off-site copies, downloaded files and printouts.
- **Who has access:** administrators see everything. You set up roles and permissions; you [deactivate](benutzer.md#zugang-sperren) accounts of people who leave.
- **The environment:** device and disks, network, HTTPS, updates, off-site copy of the backups – and data processing agreements with service providers, for instance the mail provider. If your Ablago runs [with a provider](https://help.ablago.app/installieren/aktuell/en/anbieter/), as a landlord or business you need a **data processing agreement** with them; that page also says what to look out for when choosing.
- Reporting **data breaches** (Art. 33, 34) and, where required, appointing a data protection officer.

## Step by step { #schritt-fur-schritt }

### Access for a user { #auskunft-an-einen-benutzer }

A family member or someone from the business who has an account in Ablago wants to know what is stored about them.

1. **Let them export it themselves:** under **My account → Account → Export my data** (click your name at the top right) they get everything they may read – folders with documents, their tasks, reminders, favourites and their bin, their user account without password ([Export my data](export.md#meine-daten-exportieren)). This only works if you have switched on the personal export under **Workbench → Full export** – **it is off by default**. If you leave it off, you put the information together yourself: from a [full export](export.md) as for former users (step 3) or as an [access copy as for a person who isn't a user](#auskunft-an-eine-person-die-kein-benutzer-ist).
2. **You add what is missing:** folders about them that they may not read (e.g. a personnel file), and entries in the [log](fehlersuche.md#protokoll) (sign-ins, errors). If they are also recorded as a person – for instance as a folder *Employee* –, give access for that [as for a person who isn't a user](#auskunft-an-eine-person-die-kein-benutzer-ist).
3. **Former users** can no longer sign in and so can't export themselves. Then take the details from a [full export](export.md): the user account under `struktur/`, their entries in `daten/historie.jsonl` and the folders concerning them.
4. **Deadline:** answer within one month (Art. 12(3) GDPR).

### Access for a person who isn't a user { #auskunft-an-eine-person-die-kein-benutzer-ist }

A tenant, customer or contact asks for their data. **Workbench → Data protection requests** takes care of this; the details are [further below](#auskunft-nach-art-15-dsgvo).

1. **Set up once:** controller, recipients and the folder types that concern a person, each with a purpose ([Settings](#einstellungen)).
2. **Choose the person** – or on their folder **Folder ▾ → Create access copy …** – and enter when the request came in. **Create deadline as a task** reminds you under "To do".
3. **Collect:** Ablago follows the links from the person's folder (tenancy agreement, statements, flat) – completely only what belongs to them via **belonging**. Folders in which they are only named via a **reference** (e.g. as contact person) appear without their content ([Belonging or reference](#zugehorigkeit-oder-bezug)).
4. **Keep searching** if the person also occurs elsewhere: Ablago deliberately doesn't do a full-text search ([why](#warum-keine-volltext-suche)). Search yourself in the Library with the [advanced search](https://help.ablago.app/benutzer/aktuell/en/ablage/#erweiterte-suche) without a chosen folder type, with **full text** also in documents and notes. What really belongs to the person you link with their folder (as belonging) and collect again.
5. **Check and redact:** only what is ticked goes out; you redact details about other people beforehand.
6. **Create and deliver:** best with a password, then by [retrieval link or email](#auskunft-zustellen). The proof is in the person's history.

### Deletion on request { #loschen-auf-verlangen }

Someone demands that their data be deleted (Art. 17 GDPR).

1. **Find what belongs to the person:** as with the access copy – the checklist under **Workbench → Data protection requests** shows all folders that belong to the person and those in which they are only named. You don't need to create anything for this.
2. **Check whether a retention period stands in the way** (Art. 17(3)): folders of a folder type in [archive mode](archiv.md) carry **Archive · keep until …** and can't be deleted before the end of the period anyway – not even by administrators. Also check folders without archive mode: invoices or contracts can have periods that you haven't entered (yet).
3. **A period stands in the way → lock instead of deleting.** The folder stays until the end of the period; only use it for what you have to keep it for.
    - **Restrict access:** give the folder type a yes/no field such as *Locked* and create a rule in the [permissions](berechtigungen.md#bedingungen): if "Locked is yes", then reading and editing only for a role such as *Data protection*. Administrators still see everything.
    - **Note it:** a note on the folder, e.g. "Locked on request of 03/11/2026 – delete after the end of the period".
    - **After the end of the period** the folder is under **Workbench → Retention expired**; then you delete it as below.
    - Tell the person that, and until when, their data stays locked and why.
4. **No period → delete:**
    - Delete the folders in the Library – individually or via [multiple selection](https://help.ablago.app/benutzer/aktuell/en/ablage/#mehrere-mappen-loschen); individual documents on the document line. When deleting, choose the reason **At the request of the data subject** – it is in the [deletion log](#loschprotokoll). A folder that others still link to can't be deleted: first remove the link or delete the linking folder too if it is to go as well.
    - Under **Workbench → Bin**, choose the folders and documents and **delete for good** (or empty the whole bin). Only then are files and full text gone too.
5. **What still remains afterwards** – tell the person if they ask:
    - the **history of deleted folders** for the set time (default 365 days, [configurable](papierkorb.md#historie-endgultig-geloschter-mappen); 0 deletes it immediately along with them – that then applies to all folders),
    - older **backups** until they go according to retention,
    - **exports** in the [export folder](export.md#export-ordner) (at most 7 days), **access copies** waiting (at most 7 days or until a retrieval link expires) and copies outside Ablago.
6. **Recording that deletion took place:** the [deletion log](#loschprotokoll) does that – with reason, folder type, number and the documents' checksums, without the data itself. Filter by the day and the reason *At the request of the data subject* and output it as a PDF if the person or a supervisory authority wants proof.

If the person has a **user account** that has already been used, you [deactivate](benutzer.md#zugang-sperren) it: Ablago doesn't delete such accounts so that "created by" and links stay right. Their name remains there.

### Setting up a locking and deletion concept { #sperr-und-loschkonzept-aufsetzen }

For landlords, the self-employed and businesses: decide once how long which data stays, and set up Ablago so that it keeps you to it.

1. **Record kinds of data:** every folder type is a kind of data – tenant, tenancy agreement, invoice, customer, application … Mark under **Workbench → Deletion concept → Personal data in folder types** which concern a person, and enter the purpose per folder type. From this [Ablago creates the deletion concept](loeschkonzept.md#aus-dem-dms-erzeugen) with a filled-in table "Kinds of data and periods" – or you fill in the [template](loeschkonzept.md#die-vorlage) by hand.
2. **Set periods** – with your tax adviser: e.g. accounting records 8 years, business letters 6 years, applications without acceptance 6 months.
3. **Switch on archive mode** for every folder type with a statutory period: period in years and reference date (e.g. invoice date). Until the end of the period the folder is locked against deletion; afterwards it is under **Retention expired**. See [Archive mode](archiv.md#einschalten).
4. **Shorter periods without archive mode** (e.g. prospects, applications): create a [view](sichten.md) that shows the due folders by a date field, and go through it regularly.
5. **How long deleted data has an after-effect:** set the retention of the [bin](papierkorb.md#aufbewahrung) (default 30 days), the history of deleted folders (default 365 days) and the retention of [backups](sicherung.md#zeitplan-und-aufbewahrung) to fit your concept.
6. **Check regularly:** e.g. every year in January go through **Workbench → Retention expired** and delete what may go – a customer or contract partner with everything that hangs on it with [Delete with linked folders](#mit-verknupften-mappen-loschen). Nothing is ever deleted automatically.
7. **Lock on request** as described under [Deletion on request](#loschen-auf-verlangen).
8. **Document it:** create the deletion concept under **Workbench → Deletion concept** (PDF or Word), complete the [square brackets] and store it as a folder in Ablago. If folder types or periods change, create it again.

## Giving access: Workbench → Data protection requests { #auskunft-erteilen }

Whoever manages data of customers, tenants or contacts must be able to say on request what they have stored about them – and in a form the person can take along. Under **Workbench → Data protection requests**, Ablago does this in a few minutes.

--8<-- "ausgeblendet-organisation.md"

![Workbench → Data protection requests](bilder/werkbank-datenschutz.png)

Data protection is in the Workbench under **Users and security** in two entries: **Data protection requests** (everything about requests under Art. 15) and **[Deletion concept](loeschkonzept.md)** (deletion concept, [personal data in folder types](#einstellungen) and [deletion log](#loschprotokoll)). The old address `/werkbank/datenschutz` leads to the requests.

### The list of access copies { #liste }

In the middle are all access copies with person, date and **status**:

| Status | Meaning |
| --- | --- |
| *requested* | A [response deadline](#auskunft-nach-art-15-dsgvo) has been created as a task for the person, but no access copy yet. **Create access copy …** opens the assistant with the person. |
| *in progress* | The ZIP file is being created right now. |
| *ready* | The ZIP file is ready for delivery or download. |
| *delivered* | Sent by email, offered as a retrieval link or downloaded. |
| *retrieved* | The person has fetched the access copy via the retrieval link. |
| *deleted* | The file is gone (downloaded, expired or deleted). The entry stays as **proof** – without the file. |

As long as an access copy is open (requested, in progress, ready), the **response deadline** is shown with it ("12 days left", overdue in red). The default is the filter **Open**; **All** also shows delivered and deleted ones, and the search field filters by person. At the top right is **+ New**: the assistant opens on the right (see [below](#auskunft-nach-art-15-dsgvo)).

If you choose an access copy, everything is in one place on the right: **Details** (person, created, response deadline, content), **Deliver …**, **Download** and **Delete** (the proof stays), the **retrieval links** with status and **Withdraw**, and the **history** – created, delivered, retrieved, wrong code. The history comes from the person's history and only contains numbers, no content.

### Settings { #einstellungen }

Set up once. Controller, recipients, rights and form of address are above the list under **Settings**; which folder types concern a person is under **[Deletion concept](loeschkonzept.md) → Personal data in folder types**, because the deletion concept is made from it:

- **Controller:** name and address – shown as the sender on the cover sheet.
- **Recipients:** to whom you pass on data (e.g. tax adviser, caretaker service). This is the suggestion for every access copy; you can change it per access copy.
- **The person's rights:** the text on the cover sheet (rectification, erasure, restriction, data portability, objection, complaint). A suggestion is already filled in – in the set [form of address](#anrede). You can adjust the text here; Ablago doesn't change a text of your own when the form of address changes.
- **Form of address in documents for third parties:** see [below](#anrede).
- **Personal data in folder types** (at the deletion concept): tick which folder types **concern a person** – e.g. tenant, customer, contract partner, contact. Only folders of these types can be chosen as data subjects. Per folder type you enter the **purpose** (e.g. "Performance of the tenancy"); it is shown on the cover sheet for every kind of data that goes out.

The **storage period** on the cover sheet comes from [archive mode](archiv.md): if a folder type has a retention period, it is shown there with the latest "keep until"; otherwise "as long as necessary for the purpose".

### Form of address in documents for third parties: du or Sie { #anrede }

In German, Ablago addresses you with the informal "du" – and by default also the people to whom an access copy goes. If you otherwise write to your tenants or customers with the formal "Sie", switch to **Sie** under **Settings → Form of address in documents for third parties**. An example sentence shows both forms side by side; the choice takes effect with **Save**. It applies to the whole installation and to everything that goes to people **outside** Ablago. In English there is only "you"; the setting only makes a difference to German documents (texts for third parties are in the installation's language, see [Languages](sprachen.md)).

| What | Where |
| --- | --- |
| Cover sheet, overview and README of the access copy | in the ZIP file, on the next creation |
| Template for the email with the ZIP file and the email with the retrieval link | [Delivering the access copy](#auskunft-zustellen) |
| Retrieval page with its messages (wrong code, link expired …) | `/abruf` |

**The interface stays with "du" in any case** – also for you as an administrator. If the form of address changes, it applies to all access copies created and emails sent afterwards; ZIP files already created and emails already sent stay as they are. The retrieval page always shows the current setting.

Emails with folders and documents (*Send by email*) you write yourself – Ablago only sets the subject "Folder type: title" there, without a form of address.

## Access under Art. 15 GDPR { #auskunft-nach-art-15-dsgvo }

1. **Choose the person:** as in a link field – type a name; Ablago searches all folder types that concern a person and shows the folder type per hit (and the field if it isn't the name that matches, e.g. "Company: Example Ltd"). The chosen person then appears as an entry with **Remove**. Or directly on the folder under **Folder ▾ → Create access copy …** (only for administrators and only for folder types that concern a person).
2. **Deadline:** enter when the request came in, and with **Create deadline as a task** create a task for yourself – "Access under Art. 15 GDPR for … by …", due one month after receipt (Art. 12(3) GDPR). Like every task it appears under "To do", and in the [list](#liste) the person appears as *requested* with the response deadline – even if you close the assistant now.
3. **Collect:** Ablago follows the links from the person's folder – **folders that link to it** (tenancy agreement → service charge statements) and **folders it links to** (flat, employer). You set the **depth** (default 2: contract and its invoices). Circles (two contracts linking to each other) are recognised; every folder appears only once. Users and roles are never included.
    - **Direction:** downwards (folders that belong to the person), Ablago collects everything, over several levels. Upwards (person → company → parent company) it only continues upwards, **never back down**: from the flat it doesn't collect the other tenants, from the company not its contracts.
    - <a id="zugehorigkeit-oder-bezug"></a>**Belonging or reference:** only what is connected via a link of the [kind](mappentypen.md#verweise-mappen-verbinden) **belonging** comes completely – with documents, notes and all details. If the person is only entered in a folder via a **reference** – e.g. a maintenance contract with them as *contact person*, post with *Assigned to* –, the folder appears in the checklist as "entered as contact person in maintenance contract "W-1"": only that goes into the access copy – kind, title and field –, **without its documents, notes and other details**, and Ablago doesn't collect any further via it. If it does belong entirely, you set **include completely** (default: off). So check the kind of link of your fields: if post about the person is to go out completely, include it deliberately or link it via a field of the kind belonging.
4. **Check:** the list shows the tree with ticks per **folder**, **document**, **note** and **history**. Only what is ticked goes out, and only once you confirm **"I have checked the selection"** can the access copy be created.
    - **Data of third parties?** If a folder is still connected to other people (folders of a type that concerns a person – e.g. a flat in which other tenants also live), that is noted. If a document contains details about other people, open it via **redact …** in a new tab, redact the passages ([Redacting](https://help.ablago.app/benutzer/aktuell/en/dokumente/)) and collect again: the **redacted version** is then ticked, not the original.
    - **Notes** are preselected. If you hold one back (e.g. an internal assessment), a **reason is required**; it is in the proof, not in the access copy.
5. **Create:** recipients and a remark for the cover sheet, optionally a **password** (at least 10 characters, "Suggest" creates one). The access copy is created in the background. Afterwards, in place of the button, it says **"Access copy is ready"** with its size, below that **Deliver …** (email or retrieval link) and **Download**. Another access copy begins with **Create new access copy**; the finished one is in the [list](#liste) as *ready*.

### Why no full-text search? { #warum-keine-volltext-suche }

Formerly the checklist also suggested folders in which name, email address, customer number or IBAN occurred anywhere in the text. That no longer exists, not even to switch on: too often the search hits the wrong people ("Meissner" and "Meißner"), and too easily outside content went out – for instance internal meeting minutes in which the person is merely mentioned. Only what is connected to the person via links goes into the access copy. If they occur elsewhere, you search yourself and link what belongs.

### What the ZIP file contains { #was-die-zip-datei-enthalt }

| File/folder | Content |
| --- | --- |
| `Deckblatt.pdf` | "Access under Art. 15 GDPR" with sender: which data (kinds and fields), purposes, origin (post channels: email, scan …), recipients, storage period, the person's rights |
| `Uebersicht.html` | all folders with their details and links to the documents, plus "You are named here" with the reference folders (only kind, title and field) – to open in the browser |
| `Uebersicht.csv` | the same as a table |
| `ablage/<kind>/<title>/` | per folder the documents in the original (or redacted), plus `mappe.pdf` and `mappe.json` |
| `daten/`, `struktur/`, `manifest.json` | machine-readable in the format of the [full export](export.md) (CSV, JSON Lines, Excel) – also covers data portability (Art. 20) |

**Never included** are password fields (neither value nor field) and other encrypted values, older versions of documents (they could be unredacted), tasks, user accounts and permissions. If you hold back a note, the entries about notes are also missing from this folder's history (they name its text).

**With a password**, the access copy is `Auskunft.zip` inside a ZIP file encrypted with AES-256 – that way the file names (e.g. the person's name) can't be seen either. It can be opened with 7-Zip, WinZip or Keka (macOS), for example, **not** with Windows' built-in unzipping. Share the password separately from the file, e.g. by phone or text message.

### Proof and retention { #nachweis-und-aufbewahrung }

- The **person's history** says "Access copy given" with time, who created it, number of folders, documents and notes, whether with password and the reasons for notes held back – **without content**. The same, without the reasons, is in the [log](fehlersuche.md#protokoll) (module "datenschutz").
- The ZIP file is in the [list](#liste) as *ready* until you **download** it – it is deleted afterwards –, at most **7 days**. With a valid [retrieval link](#auskunft-zustellen) it stays until the person has retrieved it as often as intended or the link expires. It is stored unencrypted (except with a password) in the [export folder](export.md#export-ordner) under `auskunft/`, not in the backup folder; it is not part of the backup.
- If you need it again, create it again.

### Who may do this? { #wer-darf-das }

Only **administrators**. A permission of its own "Give access" doesn't exist (yet): the [permissions](berechtigungen.md) govern create, read, edit, delete and passwords per folder type – an access copy reaches across all folder types. Graded permissions for administrators will come later.

## Delivering the access copy { #auskunft-zustellen }

You send the finished access copy directly from Ablago – choose the access copy in the [list](#liste), on the right **Deliver …** (or straight after creating it). Two ways:

| | Retrieval link with retrieval code | ZIP by email |
| --- | --- | --- |
| **How** | The person gets a link to a plain page of your Ablago and downloads the file there with a retrieval code. | The ZIP file goes as an attachment via Ablago's [email sending](installation.md#e-mail-und-adresse). |
| **Prerequisite** | Your Ablago **can be reached from the internet**. | The access copy was created **with a password**; at most 50 MB (many mail servers only accept 10–25 MB). |
| **Proof** | Every retrieval with time, "retrieved on …", notification | "sent by email to … on …" |
| **Second channel** | retrieval code by letter, phone or text message | password by phone, text message or letter |

The retrieval link is suggested if [Ablago's address](installation.md#e-mail-und-adresse) looks like the internet – otherwise (e.g. `http://192.168.…`, `localhost`, `nas.home.arpa`) email.

### Way 1: by email { #weg-1-per-e-mail }

Only for access copies **with a password** – no access copy goes out by email unencrypted. Enter the address; subject and text are prepared (in the set [form of address](#anrede)) and can be changed. **The password is never in the email** – Ablago doesn't even know it any more after creation. Share it via another channel. Replies go to your address. The person's history says "Access copy sent by email to …".

### Way 2: retrieval link with retrieval code { #weg-2-abruf-link-mit-abrufcode }

1. **The person's email address** (optional): without the tick it only serves as proof in the history – you copy the link and send it yourself. With the tick **Send link by email** (default: off), Ablago sends the link – without the code –; then the address is required. The message afterwards says unambiguously whether an email went out.
2. **Valid** (default 30 days, at most 90) and **retrievals** (default 3, at most 10).
3. **Retrieval code:** best **let Ablago create it** (8 characters without confusables such as 0/O and 1/I). Alternatively **your own code** that only the person knows – e.g. the contract number (at least 6 characters). Ablago shows it exactly as you enter it. On retrieval, upper/lower case, spaces and hyphens don't matter – "KD-12345" and "kd12345" count as the same; the retrieval page says so too. **A customer number alone is weak**: it is often on letters and invoices.
4. **Create retrieval link:** link and code are on screen **only now**. Share the code via another channel – by letter, phone or text message, **never in the same email as the link**. If it gets lost, create a new link; the old one then no longer applies.

The person opens the link and only sees: "You have requested access under Art. 15 GDPR to the data stored here. For security, please enter your retrieval code." – no menu, no logo, no name of the Library, no sign-in. With the right code the download starts.

![Public retrieval page of an access copy](bilder/abrufseite.png)

Under **Retrieval links** are all links with status (*active*, *expired*, *all retrievals used up*, *locked after failed attempts*, *withdrawn*), retrievals, "last retrieved on …" and wrong codes – even if the ZIP file has long been deleted. **Withdraw** makes a link invalid immediately; for the ZIP file the end 7 days after creation then applies again.

![Delivering an access copy that is ready](bilder/werkbank-datenschutz-zustellen.png)

**Proof and notification:** every retrieval and every wrong code is in the **person's history** (time, successful or not – **without IP address**, without code). Whoever created the link or the access copy, and whoever has the person as a **favourite** (★) – unless they have switched off the notification for this favourite ([favourite = subscription](https://help.ablago.app/benutzer/aktuell/en/ablage/#favoriten-als-abo)) –, gets the task **Access request** under "To do" – "Access copy for … was retrieved". As long as it is open, no second one comes for the same link. When all retrievals are used up, the ZIP file is deleted.

### Security of the retrieval page { #sicherheit-der-abrufseite }

The retrieval page is the **only** way to get at data in Ablago without signing in. Therefore:

- **Can't be guessed:** the link only contains a random key with 256 bits, nothing else – no id, no name. It is after the `#` (`/abruf#…`): the browser never sends this part, so it lands in no access log (not at the reverse proxy either) and in no referer.
- **Two factors:** link (email) and retrieval code (another channel). Only hashes are stored – the key as SHA-256, the code like a password (scrypt); it is compared in constant time.
- **No information about links:** an unknown link, a wrong code and a locked link give the same message in the same time. Only with the right code does the person learn that their link has expired, been used up or withdrawn.
- **Lock:** after **10 wrong codes** the link is locked – then even the right one no longer helps; you learn about it via the task *Access request*. In addition, the retrieval page has its own brake per IP address (with IPv6 per /64): after **5 wrong codes** across all links a 15-minute pause. It is separate from [sign-in protection](anmeldeschutz.md) – failed attempts on the retrieval page thus never block sign-in, not even behind a reverse proxy. At most two code checks run at the same time; a download isn't stored in the browser cache.
- **Download via a one-time ticket:** after the right code there is a ticket for exactly one download, valid for two minutes. It is counted at the start of the download; a cancelled download appears as *cancelled* in the history.
- **Log without secrets:** the [log](fehlersuche.md#protokoll) (module "datenschutz") contains retrievals and failed attempts with a **shortened IP** (e.g. `203.0.113.0`), never key or code.
- The request with the code needs the identifier of Ablago's own interface (protection against outside pages, CSRF); otherwise the page only loads the set [form of address](#anrede) from Ablago (no account status, no theme).

### Reachability from the internet { #erreichbarkeit-aus-dem-internet }

The retrieval link only works if the person can reach your Ablago from outside. Many installations at home can't be reached – then use the way by email. If Ablago is to be reachable, that works via a [reverse proxy](installation.md#hinter-einem-reverse-proxy) with HTTPS (e.g. on the NAS with port forwarding), a tunnel (e.g. Cloudflare Tunnel, Tailscale Funnel) or [with a provider](https://help.ablago.app/installieren/aktuell/en/anbieter/). Enter under [Email and address](installation.md#e-mail-und-adresse) the address under which it can be reached from outside – it is in the link. Whoever only wants to expose the retrieval page opens `/abruf`, `/api/abruf`, `/api/abruf/anrede`, `/api/abruf/datei` and the interface's files (`/assets/`) at the proxy.

## Deleting with linked folders { #mit-verknupften-mappen-loschen }

The third building block of a [locking and deletion concept](#sperr-und-loschkonzept-aufsetzen) besides archive mode and **Retention expired**: on a folder, e.g. a customer or contract partner without activity for years, **Folder ▾ → Delete with linked folders …** deletes the folder with contracts, invoices, post and documents – after a preview as a tree ([User manual](https://help.ablago.app/benutzer/aktuell/en/mappen/#mit-verknupften-mappen-loschen)).

The following applies:

- **Only downwards:** folders that link to the deleted one are deleted along with it (invoice → contract → contract partner: whoever deletes the contract partner deletes contracts and invoices with it). What points upwards stays – also not via a child sideways to its other parents: if you delete an invoice, the delivery note that links to it goes along; its link to the contract partner isn't followed. Every folder counts only once (circles).
- **Only via belonging:** only link fields of the [kind](mappentypen.md#verweise-mappen-verbinden) **belonging** are deleted along and collected further. If a folder only hangs on via a **reference** (📎, e.g. *contact person*, *For*, *Assigned to*), only the link is removed; the folder stays, and what hangs on it isn't collected. So check the kind of link of your fields: if a contract is to go with the contract partner, its field *Contract partner* must be a belonging.
- **Periods are never overridden.** A folder within its retention period (🔒) stays – and with it everything it links to (its contract, the contract partner), so that it stays traceable. Links of a locked folder are not removed.
- **Reminder at the end of the period:** if the starting folder therefore stays, whoever deleted gets a reminder on it for the day after the latest end of period ("… can be deleted from … – run Delete with linked folders again"). It then appears under "To do"; until then the data stays normally visible. Locking instead of deleting (Art. 18 GDPR) will come later.
- **Only within the permissions:** folders without the permission to delete (⛔) stay, as do folders the user may not see or that still link to it from outside the preview.
- **Shared folders are only decoupled:** if a folder also hangs on another one (🔗, e.g. an invoice for two contracts), only the link is removed; the folder stays.
- **Everything via the bin:** as one operation, restorable together. It is gone for good after the [bin's retention](papierkorb.md#aufbewahrung) or with *Empty bin*; if the bin is switched off, immediately.
- **Traceable, without content:** the history of every folder records "put in the bin – deleted with linked folders" with the number of folders and documents; the starting folder also records how many stayed for which reason. The [log](fehlersuche.md#protokoll) (module "ablage") names who, starting folder and operation (as an id), number of folders, documents, removed links and what stayed and why – no titles or field values. After final deletion the history stays as long as set under [History of finally deleted folders](papierkorb.md#historie-endgultig-geloschter-mappen).

!!! tip "Documenting the deletion concept"
    Record in your [procedure documentation](verfahrensdokumentation.md) which periods apply per folder type, who checks when what may go (e.g. once a year via *Retention expired*), and that "Delete with linked folders" is used for it.

## Deletion log { #loschprotokoll }

**Workbench → Deletion concept → Deletion log** proves **that** and **when** you deleted (accountability, Art. 5(2) GDPR) – without the log itself containing the deleted data again. A folder's history isn't enough for this: it goes with the folder, and the technical [log](fehlersuche.md#protokoll) expires after 24 hours.

### What it contains { #was-drinsteht }

Every step is an entry of its own: **into the bin**, **deleted for good**, **restored** – connected via the id of the folder or document.

| Per folder | Per document (also older versions) |
| --- | --- |
| folder type, folder id, **number** from the [number sequence](nummernkreise.md) (if any) | **checksum (SHA-256)**, size, file type, page count, archive number |
| number of documents, older versions, notes, removed links | which folder it belongs to (id, number, folder type) |

Plus for every entry: **when**, **by whom** (user; *interface* for an API key, *package* for a package's service account, *Ablago* for automatic deletion), **how** (individually, several, with linked folders, from the bin, bin emptied, retention expired …), **why** and the **operation** for [deleting with linked folders](#mit-verknupften-mappen-loschen) – all folders of an operation with a common id and the starting folder.

**Never in it:** titles, field values, file names, notes – they are personal and are supposed to be gone.

**Why:** when deleting, Ablago asks for the reason – *Period expired ("Retention expired")*, *At the request of the data subject*, *No longer needed* or *Other* – and optionally for a short remark. Write **no names** there: the deletion log stays when the data is gone. On final deletion from the bin, Ablago takes over the reason from the step "into the bin". Via the interface you state it with `grund` and `grundText`.

### When is "deleted" really deleted? { #wann-ist-geloscht-wirklich-geloscht }

- **Into the bin:** the folder has disappeared from Library, search and interface, but is completely in the bin – with field values, documents, full text and notes – and can be restored.
- **Deleted for good:** after the [bin's retention](papierkorb.md#aufbewahrung), with *Delete for good* or *Empty bin*, immediately with the bin switched off. Then folder, documents, full text and notes are removed from the database, and the **file** is deleted from storage – unless another document has exactly the same file (same checksum); it is only stored once, after all.
- **What still remains afterwards:** the history of deleted folders for its set time, older backups until their retention, exports and copies outside Ablago (see [Deletion on request](#loschen-auf-verlangen)). The deletion log records the time of final deletion; you add these periods in the [deletion concept](loeschkonzept.md).

All ways are covered: individually, several selected, with linked folders, "Retention expired", individual documents (also when replacing, editing and merging PDFs), older versions beyond the set number, the bin (by hand, emptied, emptied on sign-out, retention expired, switched off), post that was turned into a folder – a new or an existing one (way *post turned into a folder*, with folder type and id of the folder as the note – its documents are not deleted, they are in the folder), interface and packages. [Demo folders](demo.md) are not covered – they contain no real data.

### Viewing and output { #ansehen-und-ausgeben }

![Workbench → Deletion concept → Deletion log with filters, search by file and entries](bilder/werkbank-loeschprotokoll.png)

- **Filters:** period, folder type, reason, step; a click on an operation shows all folders and documents of this operation.
- **Search by number** (number sequence or archive number) or **checksum**.
- **"Was this document deleted?"** Drag the file onto the field: your browser calculates the checksum, Ablago searches for it. The file itself isn't uploaded.
- **As PDF** (proof, with filter and date in the header) or **as CSV** – each with the chosen filter.

!!! info "Checksum and data protection"
    The checksum (SHA-256) is a fingerprint of the file: the content can't be recovered from it. But whoever still has the file can show that exactly it was in Ablago and when it was deleted – that is precisely the purpose. The checksum is therefore **pseudonymous** data; treat the deletion log as confidentially as other proof.

### Unchangeable, its own retention { #nicht-anderbar-eigene-aufbewahrung }

- Entries can be **neither changed nor deleted** – not by administrators or via the interface either; the database itself prevents it.
- Its own **retention**: default **10 years**, configurable from 1 to 30 years below the deletion log. Older entries go automatically during the hourly tidy-up.
- The deletion log is included in every [backup](sicherung.md) and in the [full export](export.md) (`daten/loeschprotokoll.csv`).
- Section 8 "Proof" of the [deletion concept](loeschkonzept.md#aus-dem-dms-erzeugen) refers to it.

## Interface { #schnittstelle }

Everything also works via the [API](api.md): `POST /api/v1/werkbank/auskunft/vorschau` (checklist), `POST /api/v1/werkbank/auskunft` (create, background job), `GET /api/v1/werkbank/auskunft/{id}/zip`, `POST /api/v1/werkbank/auskunft/frist`, `GET`/`PUT /api/v1/werkbank/datenschutz` and `GET /api/v1/werkbank/datenschutz/loeschkonzept?format=pdf|docx` (deletion concept), `GET /api/v1/werkbank/loeschprotokoll` with the same filters as in the Workbench, `GET /api/v1/werkbank/loeschprotokoll/datei?format=pdf|csv` and `PUT /api/v1/werkbank/loeschprotokoll/einstellungen` (retention); for delivering `POST /api/v1/werkbank/auskunft/{id}/email`, `POST /api/v1/werkbank/auskunft/{id}/link` and `POST /api/v1/werkbank/auskunft/link/{id}/widerrufen`. The retrieval page itself (`POST /api/abruf`, `GET /api/abruf/datei`) doesn't belong to the API. The collection via links itself is available to every user with their permissions under `GET /api/v1/mappen/{id}/baum`. For the deletion concept: `GET /api/v1/mappen/{id}/loeschvorschau` (preview with suggestion), `POST /api/v1/mappen/{id}/mit-verknuepften-loeschen` (carry out, with the same checks) and `POST /api/v1/papierkorb/vorgang/{id}/wiederherstellen`.
