# Connect as a network drive {#als-laufwerk-einbinden}

You prefer working with Explorer, Finder or the Files app? Then connect Ablago's Library as a **network drive**. You browse through views, folders and tabs like folders, open documents with any program and put new post simply into it – by dragging or "Save as".

!!! note "Have it switched on first"
    The network drive is initially **switched off** in Ablago; your administrator switches it on in the workbench. Once it is on, you'll find everything you need yourself: click your name at the top right → **Connect as a network drive**. If it is off, this entry doesn't exist.

## What you need {#was-du-brauchst}

Under **My account → Network drive** (click your name at the top right → **Connect as a network drive**) everything is in one place:

1. **The address** of your Ablago with `/webdav/` at the end, e.g. `https://dms.example.org/webdav/` – **Copy** takes it over.
2. **The username:** your email address.
3. **A key:** **Create key for the network drive** generates an API key that may read and write. Copy it straight away – it is only shown in full now. It then also appears under **My account → Security → API keys**. When connecting, it is the **password** (begins with `dms_`); your normal password deliberately doesn't work here.

Below that, there is a short guide to expand for Windows, Mac and iPhone/iPad – the same as here.

!!! tip "One key per device"
    Create a separate key for every device. If a device is lost, you only delete its key – all others keep working.

## Windows

1. Open **Explorer** and click **This PC** on the left.
2. In the menu at the top (on Windows 11 under **…**), choose **Map network drive**.
3. Choose a free drive letter, e.g. `D:`, and enter the address under **Folder**: `https://dms.example.org/webdav/`.
4. Tick **Reconnect at sign-in** if the drive should always be there.
5. Click **Finish**. Enter your email address as the username and the API key as the password, and tick **Remember my credentials**.

The drive appears under **This PC**.

!!! info "Only via HTTPS"
    Windows only connects with sign-in via an address with `https://`. If the connection doesn't work, ask your administrator. Windows doesn't download files over **50 MB** without a change in the registry – open large files in the browser then.

## Mac (Finder)

1. In **Finder**, choose the menu **Go → Connect to Server …** (or ++cmd+k++).
2. Enter the address: `https://dms.example.org/webdav/` and click **Connect**.
3. Choose **Registered User**, enter your email address as the name and the API key as the password. With **Remember this password in my keychain** you only have to do this once.

The drive appears on the left in the sidebar under **Locations**. With the **+** in the window "Connect to Server" you remember the address as a favourite.

## iPhone and iPad (Files app) {#iphone-und-ipad-dateien-app}

!!! warning "The Files app cannot do WebDAV"
    Under **Browse → … → Connect to Server** the Files app only connects to **SMB** shares, not to WebDAV. The address with `/webdav/` does not work there. There are two ways:

**Just filing post – on your home network via SMB to the intake folder.** If your administrator has set up the [intake folder](https://help.ablago.app/admin/aktuell/en/eingangsordner/), there is a folder named after your e-mail address, e.g. `eingang/lena@example.org/`. Connect to it via SMB:

1. Open the app **Files**, tap **Browse** at the bottom, **…** at the top right and then **Connect to Server**.
2. Enter your NAS's address, e.g. `smb://nas.example.org`, tap **Connect** and sign in with your account **on the NAS** (not with the Ablago key).
3. Open the share with the intake folder and your folder in it.

From any app you now save into this folder with **Share → Save to Files** – Ablago turns it into new post with you under **To**. This only works on your home network (or via a VPN to it).

**The whole drive – with a WebDAV app.** For views, folders and documents you need an app from the App Store that can do WebDAV and plugs into the Files app (as a "location"). Which one is up to you.

1. Install such a WebDAV app and add a WebDAV connection in it.
2. Enter the address: `https://dms.example.org/webdav/`.
3. The user name is your e-mail address, the password the API key.
4. Turn the app on in the Files app under **Browse → … → Edit** if it does not appear by itself.

The drive is then listed in the Files app under **Locations**. With **Share → Save to Files** you then file directly into "New post".

## What you see in the drive {#was-du-im-laufwerk-siehst}

```
Neue Post/
Ablage/
  Verträge/                     a view
    Stromvertrag/               a folder
      Dokumente/                a tab with documents
      Verknüpft/                Folders linked to this one
```

- **New post** – put a file in here, and it becomes new [post](post.md) (channel "WebDAV"). You then find it in the view *New post* and assign it as usual.
- **Filing** – all [views](ablage.md) you see in the Library, side by side. Inside them the folders, and in each of them one folder per **tab** with the documents.
- **Linked** – the folders this folder links to or that link to it. There it only goes one level deeper.
- You see exactly what you may also see in the browser.

The folder names follow the language of your Library; the example above shows a German one.

## Opening documents {#dokumente-offnen}

A double click opens the document with the matching program. This only works for folders you may also **export** (like downloading, exporting and sending by email) – otherwise Ablago refuses, and your program reports an error. In the browser you can still view such documents.

PDFs usually come out of the network drive with a small footer "From Ablago" and the date – so a printed or forwarded sheet shows where it comes from. If a folder type requires a stamp, all its files carry this stamp; images then come as PDF. The original in Ablago always stays unchanged. What exactly is stamped is set by your administrator.

## Filing files {#dateien-ablegen}

- **Into "New post"** you put everything that newly arrives – also many files at once. Every file becomes a separate post.
- **Into a tab folder** of a folder you put a file that already belongs to this folder. It becomes a document in the tab. If there is already a document with the **same name** there and the tab has [versions](versionen.md), a **new version** is created. Without versions, Ablago refuses – then give the file a different name.
- Nothing can be put directly into a folder, into a view or under "Filing", and new folders aren't possible.
- **Deleting, renaming and moving** don't work via the network drive (yet). You do that in the browser.
- **Stamped documents** cannot be overwritten via the network drive – otherwise the stamp would come back as a new version. Save your change under a new name or upload the new version in the browser. Folders whose type requires a stamp are completely read-only in the network drive.
- If your administrator has set the network drive to **read only**, you can't file anything at all; Explorer and Finder then report "Access denied" or show the drive as read-only.
- Files like `desktop.ini`, `Thumbs.db` or `.DS_Store`, which Windows and macOS create themselves, are silently accepted and thrown away by Ablago.

## If something doesn't work {#wenn-etwas-nicht-klappt}

- **Sign-in fails:** the username is the email address, the password is the API key (not your password). If the key has expired or been deleted, create a new one. After several failed attempts, sign-in protection blocks briefly.
- **Filing doesn't work:** does the key only have **read only**? May you change the folder or create post? Is the file in "New post" or a tab folder?
- **Folder missing:** the network drive shows at most 1000 folders per view. Use a narrower view or the search in the browser.
- **"Too many requests":** some programs search a drive very eagerly. Waiting briefly is enough.
