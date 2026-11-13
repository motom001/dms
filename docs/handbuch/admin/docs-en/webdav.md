# WebDAV drive {#webdav-laufwerk}

With the **WebDAV drive**, users connect Ablago's Library like a network drive – in Windows Explorer, in the Finder on the Mac and in the Files app on iPhone and iPad. They browse through views, folders and tabs, open documents and simply put new files into it. How users connect the drive is described in the User manual under [Connect as a network drive](https://help.ablago.app/benutzer/aktuell/en/laufwerk/). Once it is switched on, users find the address, username, a suitable key and a short guide themselves – their name at the top right → **Connect as a network drive** (under My account → Network drive). When it is switched off, their interface doesn't mention the drive anywhere.

This is **stage 1: reading and filing**. Deleting, renaming, moving and editing Office files directly come later. The drive is a way out like downloading, export and email: opening needs the export permission **E**, and documents come out stamped if you wish.

## Switching on {#einschalten}

Under **Workbench → WebDAV drive**:

- **WebDAV drive** (switch) – default: **off**. When switched off, Ablago answers under `/webdav/` with "not found", as if the drive didn't exist.
- **Stamp when reading** – *No stamp* or a [stamp template](stempel.md). Default: the built-in template *From Ablago (drive)*. See [below](#stempel-beim-lesen).
- **Read only** – for all users: browsing and opening yes, filing, changing and deleting no. See [below](#nur-lesend).
- **Status** – the address for connecting (Ablago's address from *Email and address* plus `/webdav/`), the number of requests since the start and the limit per user.
- **Recent accesses** – at the very bottom of the page the last 50 requests with method, path, time, user and result (HTTP status, errors in red), newest at the top. The section has a fixed height for about ten entries; you reach older ones by scrolling. The accesses are only held in memory; after a restart the list is empty.

## Stamp when reading { #stempel-beim-lesen }

As when downloading in the interface, documents can also come out of the drive with a [stamp](stempel.md). The stored original stays unchanged; only the copy that Explorer or Finder opens is stamped.

- **Default:** Ablago brings the template **From Ablago (drive)** – a quiet footer "From Ablago · 04.11.2026" on every page. It is switched on for new and existing installations. Whoever doesn't want a stamp chooses **No stamp**; any other template works too. `{empfänger}` and `{benutzer}` are, for the drive, the user who opens the file.
- The chosen template stamps **PDFs**. Other files (images, Word …) come unchanged, as does a PDF that can't be stamped (e.g. encrypted).
- **A requirement always wins:** if a folder type requires a stamp, every one of its files comes out with the folder type's stamp – even with *No stamp*. Details under [Requirement also applies to the drive](stempel.md#pflicht-gilt-auch-fur-das-laufwerk).
- **Size and ETag** in the drive refer to the stamped version. If the stamp changes (such as the date the next day), Explorer and Finder see a changed file and reload it.
- **Documents delivered stamped can't be overwritten via the drive** (*suggestion implemented*, issue #722): otherwise the stamp would arrive in Ablago as a new version when saving back. Putting new files into the same folder still works; you upload a new version of such a document in Ablago itself. Explorer and Finder show these files as read-only.

Because Ablago stamps the copy on retrieval, opening a large folder with many PDFs takes a little longer the first time; Ablago remembers the stamped versions in memory for a while.

## Read only { #nur-lesend }

With **Read only**, the drive is a pure read-only drive for **all users**: Ablago refuses filing (including in *New post*), changing, renaming, copying, deleting, locking (`LOCK`) and setting properties with a short message. macOS then connects the drive read-only by itself; Windows reports "Access denied" when trying to save. Browsing and opening (with export permission) work as usual.

There is no distinction per user or role in this stage.

## Requirements { #voraussetzungen }

!!! warning "Only via HTTPS"
    Only switch on the drive if Ablago can be reached via **HTTPS**. Username and API key go along with every request (HTTP Basic) – without HTTPS, readable in the open on the network. **Windows** doesn't connect a drive with sign-in via plain HTTP anyway. The workbench warns if Ablago's address doesn't begin with `https://`.

- **Sign-in with an API key:** every user creates their own key under **My account → Security → API keys** (click your name at the top right), ideally one per device ("Thomas's laptop"). The username is the email address, the password the key. The **user's password is never accepted** – that way two-factor sign-in stays effective, and you lock out a lost device by deleting only its key.
- For **filing**, the key needs the permission **read and write**; with **read only** you can browse and open, but not put anything in.
- **Administrators** don't get API keys and therefore can't use the drive. For daily work they have a normal user account anyway.

## Behind a reverse proxy { #hinter-einem-reverse-proxy }

Besides GET and PUT, WebDAV uses its own HTTP methods: **OPTIONS, PROPFIND, PROPPATCH, LOCK, UNLOCK** (and MKCOL, DELETE, MOVE, COPY, which Ablago politely refuses in stage 1). The reverse proxy must pass them on to Ablago unchanged, as well as the headers `Authorization`, `Depth`, `Destination`, `If`, `Lock-Token` and `Overwrite`.

- **Nginx Proxy Manager, nginx, Caddy, Traefik:** pass any methods through by themselves. Only check that no rule restricts methods (e.g. `limit_except` in nginx) and that the allowed request size fits uploading – Ablago accepts files up to **100 MB** (`client_max_body_size 100m;` in nginx).
- **The NAS's proxy:** some devices have a setting for "WebDAV" or allowed methods. If the drive answers with 405 or 501, the proxy is usually blocking.
- A **web application firewall** (e.g. with tunnel or cloud services) sometimes blocks PROPFIND. Then set up an exception for the path `/webdav/`.

## What can be seen in the drive { #was-im-laufwerk-zu-sehen-ist }

```
Neue Post/                      putting something in = new post
Ablage/
  <view>/
    <folder>/
      <tab>/                    the tab's documents; putting something in = new document
      Verknüpft/
        <linked folder>/         with its tabs, but without a further "Verknüpft"
```

- **Permissions as in the interface:** only views and folders the user may read. **Downloading** (opening a document) only with the **export permission E** on a view that shows the folder – exactly like downloading in the interface, exporting and sending; the same place checks all ways. Without the export permission, you see the file with size and date but can't open it.
- **Folder types with a required stamp** can only be read via the drive; their files come out stamped – see [Requirement also applies to the drive](stempel.md#pflicht-gilt-auch-fur-das-laufwerk).
- **All views** are side by side under `Ablage/`, including sub-views.
- **Folder and file names** come from the folders' titles and the names of tabs and documents. Characters that Windows or macOS don't like (`\ / : * ? " < > |`, control characters, a dot or space at the end) become `_`. If a title occurs several times, every folder gets its short code added, e.g. `V-1 (3fa85f)` – so the name stays stable even when further folders are added.
- **At most 1000 folders** per view folder. For very large views better create a narrower sub-view.
- **"Verknüpft"** (linked) shows folders the folder links to and that link to it – only **one level** deep. That way search and backup programs don't run endlessly in circles.

## What happens when filing { #was-beim-ablegen-passiert }

- **Into "New post":** every file becomes a separate post with channel *WebDAV*, direction incoming, status *New*. The subject is the file name without the extension; the user created it. Whether they may create post is governed by the [permissions](berechtigungen.md).
- **Into a tab folder:** the file becomes a document in this tab (permission *Change* on the folder needed). Not in tabs of folder types with a required stamp and not with *Read only* switched on. If there is already a document with the **same name** there, a **new version** is created when [versioning](mappentypen.md) is switched on – always of exactly the document behind the file name in the drive, even if two documents have similar names; without versioning Ablago refuses, so that nothing is overwritten. If the document comes out stamped, it can't be overwritten via the drive (see [Stamp when reading](#stempel-beim-lesen)).
- **Elsewhere** (e.g. directly into a folder or under `Ablage/`) nothing can be filed. Creating new folders isn't possible.
- **Helper files** of the operating systems (`desktop.ini`, `Thumbs.db`, `.DS_Store`, `._…`, `~$…`) are silently accepted and discarded by Ablago without caching them – except with *Read only*.
- **At most three uploads at the same time** per user; on the fourth Ablago briefly answers with 503, and Explorer or Finder try again straight away.
- Size up to **100 MB** per file; the [storage space](speicherplatz.md) limit applies as when uploading.
- In [maintenance mode](wartungsmodus.md) the drive answers with 503, like the interface.

## Protection { #schutz }

- **Failed attempts** when signing in count in [sign-in protection](anmeldeschutz.md) like wrong passwords: too many, and account or IP address are locked. If the email address belongs to a user, an account lock also triggers the instant notification by e-mail.
- **Service accounts** of packages do have API keys, but never get into the drive.
- **Rate limit:** at most 600 requests per user per minute; above that Ablago briefly answers with 429. Explorer and Finder ask a lot when browsing, preview and search services even more – the limit only slows down outliers.
- **Only one level per request:** Ablago refuses requests across the whole tree (`Depth: infinity`).
- **Locks:** Windows and macOS "lock" a file before they upload it, and macOS only connects a drive without locks read-only. Ablago only pretends to answer such locks in stage 1 – and only where filing is allowed. Real locks against simultaneous overwriting come with editing Office files.
- **Log:** filed files and new post are recorded at level *Info* in the [log](fehlersuche.md#protokoll), as are refused sign-ins; pure read accesses only at level *Debug*.
- **History** (#800): every read of a file via the drive is recorded in the folder's history – as *retrieved via the drive* with person, file and the key's name. Explorer, Finder and Office often read a file many times (also for thumbnails); per person, file and day it stays one entry. Folder queries, `HEAD` and "not modified" (304) don't count. Which [history tab](mappentypen.md#register) shows the retrievals is set on the folder type.
- Documents are always delivered as a **download** (never executed in the browser). A document's **ETag** is not the checksum of its content – whoever may only read can't use it to check whether a file has a particular content. For stamped documents it belongs to the stamped version.

!!! warning "An expired or deleted key can block the IP address"
    If an API key expires or you delete it, Explorer and Finder don't notice: they keep trying in the background with the old key. Every attempt is a failed attempt in [sign-in protection](anmeldeschutz.md) – after a while first the account from this IP address and then the **whole IP address** is blocked. If all devices at home or in the office come via the same public address (NAT, router), nobody can then sign in **with a password** in the browser for a while either.

    - Before a key expires or you delete it: disconnect the drive on the device (Windows: *Disconnect network drive*; Mac: *Eject*) and reconnect with a new key.
    - If it has already happened: disconnect the device or connect with a new key, then **unblock** the address under **Workbench → Sign-in protection** (see [Blocked addresses](anmeldeschutz.md#gesperrte-adressen)). For the home network an [exception](anmeldeschutz.md#ausnahmen) can be entered there – but it only works for addresses that Ablago sees directly, not for a shared public address from outside.

!!! tip "Rather not on the internet?"
    If you only need the drive at home, you can restrict `/webdav/` to the home network in the reverse proxy (e.g. in Nginx Proxy Manager with an access list).
