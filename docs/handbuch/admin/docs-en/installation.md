# Setup and operation {#einrichtung-und-betrieb}

How to install Ablago – on Synology, UGREEN, QNAP, TrueNAS, Unraid, umbrelOS, ZimaOS, CasaOS or any server with Docker – is described in its own section **[How do I get a DMS?](https://help.ablago.app/installieren/aktuell/en/)**. This page describes what comes afterwards: the setup assistant, the database connection, folders, settings and operation behind a reverse proxy.

--8<-- "ausgeblendet-schritt.md"

Ablago runs – **recommended** – as two containers: the application (`ghcr.io/motom001/dms`) and PostgreSQL (`postgres:17`). Alternatively there is **`ghcr.io/motom001/dms-komplett`**, in which both run in one container (comparison under [One or two containers?](https://help.ablago.app/installieren/aktuell/en/#ein-oder-zwei-container)). With every push to `main`, GitHub Actions rebuilds both images (tag `main`, additionally a short hash per commit and the version number per release).

!!! warning "Set up first, then open up"
    Only make Ablago reachable via a reverse proxy or port forwarding once setup is complete. The setup code does protect against a stranger taking it over – it's still safer.

## The setup assistant {#der-einrichtungsassistent}

On the first visit, an assistant guides you through setup in eleven steps. Every step has a **?** at the top that opens exactly the matching section here.

**First collect, then set up:** language, code, database and "New or backup" take effect immediately because they are technically necessary. From "Library" onwards the assistant only collects: name of the Library, your account, what you use Ablago for, packages and optional items. **Nothing** is created in the process. With **Back** or a click in the step bar you can get to each of these steps at any time. At the end the [summary](#zusammenfassung) shows everything on one page, and only **Set up now** gets going. If you cancel before that or reload the page, no half-finished setup remains. The browser remembers your entries until then, but not passwords.

**No individual save buttons:** in every step, **Next** takes over everything in the fields, including suggestions you haven't changed (they carry the notice "suggested – taken over with "Next""). Fields left empty stay empty, and there are no hidden defaults. **Back** and **Next** are in the same place at the bottom of every step.

**Load from configuration file:** at the top right, small next to the help, you load a saved setup. Ablago then pre-fills all steps and jumps to the summary, or to the first step that doesn't fit (with the reason). Passwords are never in the file; the assistant asks for them. Structure, schema and example: [Setup as a file](einrichtungsdatei.md).

### Language { #sprache }

![Language](bilder/einrichtung-sprache.png)

The first step asks in which language Ablago talks to you: **Deutsch** or **English**. Your browser's language is suggested. The choice applies immediately to the assistant and, with **Set up now**, becomes the installation's language and your own. Later you change it under [Workbench → Languages](sprachen.md), and every person their own under My account.

### Setup code {#einrichtungscode}

![Setup code](bilder/einrichtung-code.png)

So that nobody else in the network sets up Ablago, it first asks for a code like `K7PX-3MNA-Q9TR`. It is in two places:

- in the **container's log** – in the NAS's Docker interface, open the project's container `app` and look at the log (on UGREEN *Docker → Container → dms-app → Log*, on Synology *Container Manager → Container → Details → Log*) or `docker compose logs app` (with [dms-komplett](https://help.ablago.app/installieren/aktuell/en/komplett/): `docker compose logs dms`). You are looking for the line `Einrichtungscode für Ablago: XXXX-XXXX-XXXX`;
- in the file **`EINRICHTUNGSCODE`** in the folder `geheim` (in the template `/volume1/docker/dms/geheim`).

Where exactly that is on your device is shown by the guide for your platform under [How do I get a DMS?](https://help.ablago.app/installieren/aktuell/en/) – for Synology, UGREEN, QNAP, Unraid, TrueNAS, umbrelOS, ZimaOS, CasaOS and others.

After "Set up now" the code is worthless; Ablago deletes the file. After ten wrong attempts it blocks input for ten minutes.

### Database {#datenbank}

![Database](bilder/einrichtung-datenbank.png)

Server (in the template `db`), port `5432`, database and user `dms` and the password from the `.env`. **Check connection** reports clearly what's wrong – server can't be reached, wrong password, database missing (with a button to create it if the user may). **Take over and continue** saves the connection and starts Ablago – without restarting the container; it creates the tables itself. The step is skipped if a connection already works (see [Database connection](#datenbank-anbindung)).

### Set up anew or restore {#neu-einrichten-oder-wiederherstellen}

![Set up anew or restore](bilder/einrichtung-wahl.png)

With an empty database, Ablago asks whether you are starting anew or bringing back a backup. **Restore** leads into the process under [Restoring](wiederherstellen.md#neues-nas-alte-sicherung) with its own progress and ends at the sign-in with the previous credentials. **Set up anew** leads to collecting.

### Name of your Library { #haushalt }

![Name of your Library](bilder/einrichtung-mandant.png)

The name of your Library, usually the family's name ("The Example family") or your business's ("Example office"). It appears as the lettering in the header, in the browser tab and on the sign-in page (can be changed under **Workbench → [Themes](designs.md)**).

### Your account { #dein-konto }

![Your account](bilder/einrichtung-konto.png)

Name, email address and password of **your own account** – with your one email address. You set the password directly here; there is no invitation link for yourself. There is no separate "Administrator" account and no "first user" next to it: your account gets **Full administration** and works quite normally in the Library (see [Who may manage Ablago?](verwalten.md)).

> In everyday life you work without administration permissions. For setting things up you switch via "Administer Ablago". That way nothing important can break by mistake.

**Next** checks address and password straight away, but the account is only created with **Set up now**. Afterwards you are signed in, straight into [administration mode](verwalten.md#der-verwaltungsmodus). The assistant offers you **two-factor sign-in** at the end ([Done](#fertig)). You invite further people after setup under **Workbench → Users** – the overview reminds you that a second person should be able to manage.

### Use { #nutzung }

![Use](bilder/einrichtung-nutzung.png)

**What will you use Ablago for?** Three answers: **For home**, **For my work or my business** or **Both**. You can only continue with an answer; you can change it later under **Workbench → [Use](organisation.md#nutzung)**.

- **For my work or my business** and **Both** set the attribute [used for work](organisation.md#nutzung): folder types then show their work-related fields, and packages that keep records longer for work use set this up straight away when installed.
- The answer **preselects packages in the next step**: for home Basis, Household, Contracts and Invoices; for work Basis, Contracts, Invoices and Compliance; for "Both" all of them. Only what exists in the catalogue is preselected – you can deselect everything.
- The **Workbench** starts with the *Household* template for home use, with *Business* for work (see [Overview](uebersicht.md)).

**Your organisation:** for work use, the step asks right below for your own organisation – name, address, email and phone. Only the name is required, everything else is optional. With **Set up now**, Ablago creates an organisation with the attribute [own organisation](organisation.md) from it, so Ablago knows who "we" are, for example for GDPR access requests. This needs the **Basis** package (1.7.0 or later) – once an organisation is entered, Basis is required, and the summary tells you if it is missing. If you leave all fields empty, Ablago creates none; you can do that later in the library.

### Adding packages {#pakete-dazuholen}

![Adding packages](bilder/einrichtung-pakete.png)

Installation only happens with **Set up now**; here you only choose. Only in this step does Ablago query the [official package catalogue](pakete.md) – before that it opens no connection for it. The request goes to catalog.ablago.app (served by GitHub Pages); only the request itself goes out, no data from your Library. The list shows per package name, description and what it creates; packages with code are marked "with code".

- **Preselected is what fits your answer in the [Use](#nutzung) step, plus Text recognition and Notifications** – without text recognition scanned documents can't be searched, without Notifications no daily summary and no “Post for you” task come. Below that, **Further languages?** asks for additional languages (German and English are always included). You tick everything else. Language packages for the interface are not in the first list but under the filter **Languages**.
- **Dependencies come along**, e.g. "Basis" for "Household"; they are marked "comes along – needed by …".
- **Next** leads to **one** page with all questions: the [permissions](pakete.md#rechte-eines-pakets) of all packages with code (one tick for all), names only in case of conflicts, sample folders, supplied automations and required settings, then **Take over packages and continue**. See [Installing several packages in one step](pakete.md#mehrere-pakete-in-einem-schritt-installieren).
- **Skip** is possible at any time; you add packages later under **Workbench → [Packages](pakete.md)**.

If the catalogue can't be reached (no internet), the step says so clearly: then the packages are missing, for instance text recognition. Skip the step and add the packages after setup under **Workbench → Packages**, there also with a **bundle file** that you put together on another device on the catalogue's website (see [Installing packages without internet](pakete.md#pakete-ohne-internet-installieren)).

### Optional items {#optionales}

![Optional items](bilder/einrichtung-optional.png)

Five sections of the same structure, without save buttons of their own:

- **Ablago's address**, suggested with the address in the browser. Clear the field if Ablago is not to have a fixed address.
- **Region:** the state for public holidays, at first *none*. You set country and time zone under [Workbench → Settings → Region](region.md).
- **Examples:** load sample folder types (only without packages that bring their own folder types).
- **Email sending:** only after the tick "Set up email sending now". For [email sending](e-mail-versand.md) your address and password are usually enough; the assistant suggests server, user and sender and marks them, **Next** takes them over into the summary. Sending is only set up with **Set up now**. You can test it after setup under **Workbench → Email and address**.
- **Emergency contacts:** people you trust for an emergency, with name, email and optionally phone and note. They get no access, only a short info email without a link once sending is set up, and appear on the emergency sheet under "Whom to ask?". They are added with **Set up now**; later you manage them under [Workbench → Encryption](verschluesselung.md#notfallkontakte). They are deliberately not in the configuration file – it's third-party data.

Everything can also be set later in the Workbench.

### Summary {#zusammenfassung}

![Summary](bilder/einrichtung-zusammenfassung.png)

Everything on one page, each section with **Change**: Library, your account (with "Full administration"), use (with the Workbench template and your organisation), packages (with the number of switched-on automations) and optional items. Passwords are only shown as "set". After **Change**, **Next** leads back to the summary; everything else stays as it was.

**Save as file** stores the setup as a [configuration file](einrichtungsdatei.md), without passwords and without the key.

**Set up now** checks everything once more and then carries it out, with progress: creating the Library and your account, creating the key, saving address, state, use and email sending, loading examples, installing packages, creating your organisation. If something doesn't work, it says what and why. What is already done stays; with **Change** you correct the entry, with **Try again** it continues at this point. Nothing is created twice.

### Done: emergency sheet { #fertig }

![Done](bilder/einrichtung-fertig.png)

During setup, Ablago created a new **key**. It encrypts stored passwords and all backups (see [Encryption](verschluesselung.md)); the [emergency sheet](verschluesselung.md#notfallblatt) contains it for printing, plus the **emergency code** with which you get back in if you have locked yourself out ([I can't get in any more](was-ist-passiert.md#kein-zugang)). **Complete setup** only works once you have downloaded the emergency sheet. Print it and put it with your important documents, because without the key no backup can be brought back.

Downloading the emergency sheet is a [sensitive action](verwalten.md#frische-anmeldung): if "Set up now" took longer than 10 minutes (for instance with many packages), Ablago asks for your password once more beforehand.

Below it, the assistant offers **two-factor sign-in** – with **Set up now** (authenticator app on the phone, then keep the recovery codes safe) or **Later**. It is voluntary; it can be set up at any time under **My account → Security**. If you set it up now, Ablago asks for password and code once when completing, because your sign-in has changed.

If the assistant runs over **HTTPS** (or on `localhost`), it then offers a **passkey**: **Add now** creates it on this device (fingerprint, face or PIN); **Later** works too – at any time under **My account → Security**. Without HTTPS the offer is missing, because passkeys do not work there (see [Passkeys](anmeldeschutz.md#passkeys)).

Plus links to both manuals, "Report a problem" as a prepared GitHub issue and the note about GitHub Sponsors.

Afterwards: how to continue is summarised under [Setting up in five steps](fuenf-schritte.md) – switch on the schedule under **Workbench → [Backup](sicherung.md)**, create your own [folder types](mappentypen.md) and [invite more users](benutzer.md) – ideally also a second person who may manage.

**For the self-employed and small businesses:** if you chose "For my work or my business" or "Both" in the [Use](#nutzung) step, the Workbench starts with the **Business** template – with number sequences, archive mode, mailboxes, data protection and the other areas a business needs. Otherwise it starts with the slim template *Household*; you can switch at any time under **Workbench → Customise workbench** (see [Overview](uebersicht.md)).

## Database connection {#datenbank-anbindung}

The connection to PostgreSQL is in the file `datenbank.json` in the folder `/data/geheim` (only readable for the container, with password). It **leads**:

- **If the file exists**, Ablago uses it – even if `DATABASE_URL` is set in the Compose file. If the variable differs, the Workbench overview points this out; it is ignored and can be removed.
- **If it doesn't exist but `DATABASE_URL` does** (existing installations), Ablago checks the variable at start-up and takes it over into the file. Afterwards the variable is superfluous.
- **If it doesn't exist but `DMS_DB_PASSWORT` does** (templates for Synology, UGREEN, QNAP, TrueNAS, Unraid), Ablago uses the standard connection – server `db` (or `DMS_DB_HOST`), port 5432, database and user `dms` – with this password and takes it over likewise. That way the password is only in the Compose file once, without having to escape special characters for a URL.
- **If neither exists** – or the connection doesn't work –, Ablago starts in **setup mode**: it only delivers the assistant and asks for the connection (with setup code). All other interfaces answer with 503 until then. A saved connection whose database just can't be reached yet (the database container is still starting) it keeps trying every ten seconds.

Under **Workbench → Database connection** you see and change the connection. The section *Connection* says what Ablago is connected to right now ("Currently connected: dms@postgres:5432/dms · in operation"). To change: first **Check connection**, then **Take over**. The new connection applies after a restart (**Restart now** – in the container, Docker starts Ablago again straight away). The data doesn't move along; for moving to another database use a [backup](sicherung.md).

The file also contains the **Library id** (formerly the environment variable `HAUSHALT_ID`). Existing installations take it over at the first start; the variable can be removed afterwards.

Below the connection, the page shows how the database is doing in operation: the **long database accesses** and **what is running right now**. This used to be under *Maintenance and troubleshooting → System health*; old links and bookmarks lead here.

![Database connection: long database accesses](bilder/werkbank-datenbank.png)

### Long database accesses {#lange-datenbankzugriffe}

Every database access is timed. Whatever takes longer than a threshold lands in the list and as a warning in the [log](fehlersuche.md#protokoll) (module *datenbank*) – there, since #920, as one line per minute and kind (route pattern or access) with count, highest and average duration; the list still shows each one. Directly above the list you set:

- **Long from** – the threshold in milliseconds (default 500),
- **Keep** – how many days the entries stay (default 30).

The list shows the newest at the top, about ten entries; you scroll within it. A click on an entry expands it: query, caller (request and user), duration and time. A database access is a method of the data access layer (e.g. `mappen.seite` for one page of a view) and can comprise several SQL statements.

### What is running right now {#was-lauft-gerade}

The queries running in the database right now, with duration, state and process – updated every five seconds. If any have been running longer than the threshold, a notice points this out.

## Email and address {#e-mail-und-adresse}

Under **Workbench → Email and address** you set what used to be environment variables. Changes apply immediately, without a restart.

Only emails that someone triggers or switches on go via the mail server: sent folders including documents, the [daily summary](aufgaben.md#tagliche-zusammenfassung) (folder titles and links), invitations and password links as well as [access copies](datenschutz.md) and retrieval links. An overview of all ways is under [What leaves your Library](datenschutz.md#was-deine-ablage-verlasst).

![Email and address in the Workbench](bilder/werkbank-betrieb.png)

- **Ablago's address** – at this address users open Ablago, e.g. `http://nas.home.arpa:8080` or `https://ablage.example.org`. It is in the links in the emails. As long as none is maintained, Ablago takes the address under which it is currently being called; **Take over this address** saves it. If it begins with `https://`, sign-in then only works via HTTPS. [Passkeys](anmeldeschutz.md#passkeys) are bound to this name as well: if it changes, existing passkeys no longer fit – the Workbench points this out when you change it.
- **Email sending** – your own address and password; Ablago suggests server, port, user and sender, all fields are under *Advanced*. Also sign-in via OAuth for Microsoft 365 and Google. **Check connection** signs in to the server without sending anything; **Send test email** sends an email to an address of your choice – both with the values in the form, also before you save. If something fails, Ablago names the cause, with the server's answer below. Everything about it, with notes per provider: [Email sending](e-mail-versand.md).
- **Allow self-signed certificate** – only for your own mail server in the home network.
- The **sender** is also the sender when users [send a folder by email](https://help.ablago.app/benutzer/aktuell/en/versenden/). Ablago enters the user's address as **Reply-To** – so replies reach them without Ablago faking outside senders (many recipients would classify that as spam). The [daily summary of tasks](aufgaben.md#tagliche-zusammenfassung) needs the same setting.
- Without email sending (switch "Sending emails" off), user management shows the invitation and password links to copy; "Forgotten password" is then reset by the administrator.

!!! note "Password encrypted"
    Ablago stores the SMTP password encrypted; you create the key for this once under **Workbench → [Encryption](verschluesselung.md)**. As long as there is none, no password can be saved. The password is never returned to the interface. Still, best use a password of its own just for sending, for instance an app password from your mail provider.

!!! note "From an older version"
    Up to version 0.8 these were the environment variables `APP_URL` and `SMTP_*`. At the first start of 0.9, Ablago takes over their values once into the Workbench; afterwards they are ignored, and the log points out that they can be removed from the Compose file.

## Folders and volumes {#ordner-und-volumes}

The folders in the container are fixed. Where they point on the NAS you decide solely via the volumes of the Compose file – there are no environment variables for this.

| Folder in the container | Content | Volume in the template |
| --- | --- | --- |
| `/data/files` | uploaded documents, logos, images of reported errors | `/volume1/docker/dms/files` |
| `/data/geheim` | key for stored passwords (`dms.schluessel`), [database connection](#datenbank-anbindung) (`datenbank.json`), setup code (`EINRICHTUNGSCODE`, only until setup), [RESCUE file](notfall.md) | `/volume1/docker/dms/geheim` |
| `/data/sicherung` | [backups](sicherung.md), encrypted | `/volume1/docker/dms/sicherung` |
| `/data/export` (optional) | [exports](export.md#export-ordner): full export, Export my data, access copies – **unencrypted**, deleted after downloading or after 7 days. Never put it in the backup folder | commented out: `/volume1/docker/dms/export` |
| `/eingang` (optional) | [intake folder](eingangsordner.md) for scanner and NAS | `/volume1/docker/dms/eingang` |

Each of the three folders `/data/files`, `/data/geheim` and `/data/sicherung` must be a volume of its own; otherwise its content is gone as soon as the container is recreated (e.g. on an update). `/data/export` needs no volume of its own – without one it is inside the container, and exports in it are gone after an update. The database is in the PostgreSQL container's volume – with the image [dms-komplett](https://help.ablago.app/installieren/aktuell/en/komplett/) in the fourth folder `/data/postgres`. How much space is free in each folder is shown by **Workbench → [System health](speicherplatz.md)** and **Workbench → System health → Version and updates**.

```yaml
    volumes:
      - /volume1/docker/dms/files:/data/files
      - /volume1/docker/dms/geheim:/data/geheim
      - /volume1/docker/dms/sicherung:/data/sicherung
```

!!! note "From an older version (up to 0.22)"
    Formerly `FILES_DIR`, `DMS_SCHLUESSEL_DATEI` and `DMS_SICHERUNG_DIR` set the folders. If one of them is still in the Compose file with the fixed value (e.g. `FILES_DIR: /data/files`), everything keeps running; the log and the Workbench overview point out that you can remove them. If it points to **another** folder, Ablago doesn't start – otherwise it would suddenly see an empty files folder. The message in the container's log then names which volume must point to the fixed folder instead. See [Updating](aktualisieren.md#feste-ordner-ab-023).

## Settings {#einstellungen}

These settings are environment variables in the Compose project:

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Only for switching over: taken over into the [database connection](#datenbank-anbindung) at the first start and ignored afterwards |
| `DMS_DB_PASSWORT`, `DMS_DB_HOST`, `DMS_DB_PORT` | Instead of `DATABASE_URL`: password (and server, default `db`, and port, default `5432`) of the standard connection; likewise only for the first start |
| `DMS_EINRICHTUNGSCODE` | `aus`: setup assistant without a code – for app stores in which the container log can't be read without a command line. Until the administrator is created, anyone in the network can then take over setup |
| `TRUST_PROXY` | Whom Ablago believes a reverse proxy's information from. Not set or `auto`: your own computer and private networks – fits almost always. `false`: nobody, `true`: everyone, or a list like `172.18.0.0/16`. See [Behind a reverse proxy](#hinter-einem-reverse-proxy) |
| `DMS_EINBETTEN` | Pages that may embed Ablago (e.g. a dashboard), such as `https://ha.example.org http://nas.home.arpa:8123`. Not set: only Ablago itself. See [Security headers](#sicherheits-header) |
| `LOG_LEVEL` | Base level of the log: `debug`, `info` (default), `warn`, `error` |
| `PORT`, `HOST` | Port (default `3000`) and address (default `0.0.0.0`, all) on which Ablago listens in the container. Normally you do **not** change `PORT` but the port to the outside in the Compose file (in the template `8080:3000`, e.g. `8090:3000`). The image's built-in health check follows `PORT`; if you set `HOST` to a single address, it must include `127.0.0.1`, otherwise the container counts as *unhealthy* |
| `DMS_PROZESSE` | Number of processes for requests, 1–16 or `auto` (cores − 1, at most 2; about 1 GB of memory per process plus 1 GB reserve, so below 3 GB 1). Default 1 as before. Recommended from about 4 cores, see [Technology → Several processes](technik.md#mehrere-prozesse) |
| `DMS_DB_VERBINDUNGEN` | Maximum number of database connections for **all processes together** (#874; before: per process), 2–100 (default 10, 4 more for each further process). With one process as before. Since #1198 Ablago uses one of them only for locks (schedules, installing packages), the rest for requests and work. Only for larger installations with more cores, see [Technology → Many simultaneous requests](technik.md#last) |
| `DMS_MAX_ANFRAGEN` | From this many simultaneous requests (**per process**), Ablago immediately answers with "very busy right now" (HTTP 503), 20–10,000 (default 250), see [Technology](technik.md#last) |
| `DMS_ARBEITER` | Number of [workers for PDF and exports](speicherplatz.md#arbeiter-fur-pdf-und-exporte) **per process**, 1–16. Not set: half of the container's cores, at least 1, at most 4 – divided up with several processes. `0` switches them off (only for troubleshooting) |
| `DMS_HINTERGRUND_NICE` | How much lower the priority of [background work](technik.md#last) is than that of requests (nice value, 0–19). Not set: `10`. `0` switches it off |
| `DMS_ZWISCHENSPEICHER` | Only for troubleshooting: `aus` switches off the caches for counts, numbers of results and dates – everything is calculated afresh on every request, Ablago gets slower. System health and the load test report point this out. See [Troubleshooting → Is it the cache?](fehlersuche.md#zwischenspeicher) |
| `DMS_EINGANG` | Only for special cases: another location of the [intake folder](eingangsordner.md) in the container (default `/eingang`). The usual way is to mount the NAS's folder on `/eingang` |

## Behind a reverse proxy {#hinter-einem-reverse-proxy}

If Ablago runs behind a reverse proxy (Nginx Proxy Manager, nginx, Caddy, Traefik, your NAS's proxy …), only **one** thing needs doing: enter the public address in the Workbench under **Email and address**, e.g. `https://dms.example.org`. If it begins with `https://`, Ablago only sets the session cookie via HTTPS, and links in emails lead to this address.

### HTTPS and certificates {#https-und-zertifikate}

Ablago itself only speaks HTTP and manages no certificates. The reverse proxy takes care of that: it accepts the HTTPS connection, looks after the certificate and its renewal and passes the request on to Ablago. Common ways:

- **Nginx Proxy Manager** as an additional container: certificate from Let's Encrypt at the click of a mouse. This is how it runs at the developer's, see [Example setup](https://help.ablago.app/installieren/aktuell/en/beispiel/).
- **Your NAS's proxy:** Synology, UGREEN and QNAP bring a reverse proxy including Let's Encrypt certificates.
- **Caddy:** fetches and renews certificates by itself; the configuration is a few lines long.

Let's Encrypt needs a domain of your own that points to your connection. If Ablago is only to be reachable at home, HTTP in the home network is enough.

If you use the [WebDAV drive](webdav.md), you need **HTTPS** even at home (Windows requires it), and the proxy must let the WebDAV methods such as `PROPFIND` and `LOCK` through – see [Behind a reverse proxy](webdav.md#hinter-einem-reverse-proxy).

### What the proxy tells Ablago { #was-der-proxy-dem-dms-mitteilt }

The proxy forwards every request to Ablago. For Ablago it therefore looks as if it came from the proxy. What the device behind it is, the proxy writes into additional headers (`X-Forwarded-For`, `X-Forwarded-Proto`). Ablago needs them for:

| What for | With the proxy's information | Without it |
|---|---|---|
| **IP addresses** in the log and in a user's sessions | the address of the phone or laptop | always the proxy's address |
| **Block after wrong passwords** ([sign-in protection](anmeldeschutz.md), per email address and IP and per IP) | only hits the device the failed attempts came from | hits all devices: failed attempts from outside also block sign-in at home |
| **Recognising HTTPS** as long as no address is maintained | cookie only via HTTPS, links with `https://` | cookie also via HTTP, links with the internal `http://` address |

Since version 0.43.0, Ablago accepts this information **by itself** if the proxy sits on your own computer or in a private network (`127.0.0.1`, `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x` and the corresponding IPv6 networks). That practically always applies to a proxy container next to Ablago and to a NAS's proxy. Requests directly from the internet thus can't fake an outside IP or HTTPS. Under **Maintenance and troubleshooting → System health → Version and updates**, `TRUST_PROXY` shows what applies right now.

!!! note "When to set `TRUST_PROXY` after all?"
    - `TRUST_PROXY: "false"`: if you want to rule out completely that a device **in your home network** that reaches Ablago directly via port 8080 fakes another IP address. The IP addresses and the block then behave as in the right-hand column above.
    - A list, e.g. `TRUST_PROXY: "172.18.0.5"`: only believe exactly this proxy.
    - `TRUST_PROXY: "true"`: if the proxy has a public address, such as a tunnel or cloud service that forwards directly to Ablago. Then Ablago itself must not be reachable from the internet.

    Before version 0.43.0, `false` was the default. Whoever has already set `TRUST_PROXY: "true"` can leave it or remove it.

!!! tip "Maintain the address anyway"
    The address in the Workbench is more reliable than any detection: emails from the background (reminders, summary) have no request from which Ablago could read the address.

### Security headers {#sicherheits-header}

Ablago sets the usual security headers itself – your reverse proxy does **not** need to set them again (duplicate headers do no harm but confuse troubleshooting):

- `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` – no outside page can embed Ablago invisibly,
- a strict `Content-Security-Policy` for the interface (only its own scripts),
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`,
- `Strict-Transport-Security` as soon as Ablago is called via HTTPS.

If Ablago is to appear in another page, for instance in a Home Assistant dashboard, enter its origin in `DMS_EINBETTEN` (several separated by spaces). Ablago ignores invalid entries and names them in the log.

An example for nginx:

```nginx
server {
    listen 443 ssl;
    server_name dms.example.org;
    # ssl_certificate …; ssl_certificate_key …;

    client_max_body_size 260m;          # documents up to 100 MB, packages up to 128 MB, bundle files up to 256 MB

    location / {
        proxy_pass http://<NAS>:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Long jobs such as creating thousands of demo folders run in the background so that the proxy doesn't cancel because of a timeout. The live display of the log asks every two seconds and needs no special proxy setting.
