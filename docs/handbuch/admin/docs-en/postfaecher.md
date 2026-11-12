# Mailboxes {#postfacher}

Ablago can **fetch one or more email mailboxes via IMAP** and take over **every email as new [post](https://help.ablago.app/benutzer/aktuell/en/post/)**. Invoices, notices and scans ("Scan to email") that arrive by email thus land in Ablago without downloading and uploading.

--8<-- "ausgeblendet-organisation.md"

!!! tip "A separate mailbox"
    Use a **separate mailbox** (e.g. `dms@…`) or a forwarding – not your private main mailbox. Ablago moves or deletes emails it has taken over.

## Setting up a mailbox { #postfach-einrichten }

**Workbench → Mailboxes → + New**. On the right, the mailbox is organised like a [folder type](mappentypen.md#aufbau-des-editors): the **jump bar** with **Expand all / Collapse all** at the top, below it the areas **Basic details** (fetch automatically, name, for) **→ Connection** (server to password, with **Test connection**) **→ Sign-in via OAuth 2.0** (only with OAuth, right after the choice in *Connection*) **→ Fetching** (folder to original email) **→ Status** (after creating). Collapsed, each area shows a summary, such as "Folder INBOX · every 5 minutes"; your device remembers what you expand per mailbox. **Save mailbox** at the bottom saves basic details, connection and fetching at once; if Ablago rejects a detail, its area is marked red and expanded.

![A mailbox on the phone: jump bar and areas](bilder/werkbank-postfach-handy.png){ width="320" }

| Detail | Meaning |
| --- | --- |
| Fetch | ticked: Ablago fetches the mailbox regularly (default). Unticked: the mailbox stays set up but isn't fetched |
| Name | e.g. "Invoices"; appears in the post's history |
| Server, encryption, port | usually SSL/TLS and port 993; STARTTLS usually port 143. Without encryption only after explicit confirmation |
| Sign-in | **Password (or app password)** – default, as with all older mailboxes – or **OAuth 2.0** with the provider *Microsoft 365 / Outlook.com*, *Gmail / Google Workspace* or *other provider*, see [Sign-in with OAuth](#anmeldung-mit-oauth) |
| Username, password | the password is stored encrypted with the [key](verschluesselung.md) and never shown again; leaving it empty keeps it. With OAuth there is no password; the username is the account's email address |
| Folder | default `INBOX` |
| Fetch interval | in minutes, 1 to 1440 (one day), default 5 |
| For | optional: this user appears on every post and has it under "To do" |
| Only from these senders | optional: addresses (`rechnung@stadtwerke.example`) or domains (`bank.example`, including subdomains) |
| After taking over | **move to a folder** (default `DMS`, created), **only mark as read** or **delete** |
| Only emails with attachments | others stay unchanged in the mailbox |
| Original email as .eml | default on: the whole email is additionally attached to the post as a document |

**Test connection** signs in, names the number of emails in the folder and says in case of errors what the cause is: sign-in refused, server unreachable, certificate invalid. A stored password (or the OAuth sign-in) only goes to the stored server, port and encryption: if you change one of them, enter the password anew (or save and sign in anew). **Fetch now** (area *Status*) fetches immediately. **Remove mailbox** (bottom left) deletes the mailbox from Ablago after a confirmation; the emails in the mailbox stay as they are.

Under *Status* are the last fetch, the emails taken over most recently with a link to the post, and errors. If fetching fails several times in a row, Ablago waits longer and longer between attempts (up to 6 hours) and writes an email to the administrators after the third error.

## App passwords { #app-passworter }

Many providers don't let programs like Ablago into the mailbox with the normal password but require a separate **app password** – often only once two-factor sign-in is on.

| Provider | Server | Note |
| --- | --- | --- |
| Gmail | `imap.gmail.com`, 993 | Google account → Security → switch on 2-Step Verification → **App passwords** |
| GMX | `imap.gmx.net`, 993 | allow access in the settings under *POP3/IMAP retrieval*; with two-factor an app password |
| WEB.DE | `imap.web.de`, 993 | allow *POP3/IMAP retrieval* in the settings; with two-factor an app password |
| T-Online | `secureimap.t-online.de`, 993 | create a separate **Email password** in the customer centre (not the login password) |
| iCloud | `imap.mail.me.com`, 993 | create an **app-specific password** at account.apple.com; the username is the iCloud email address |
| Outlook.com / Hotmail, Microsoft 365 | `outlook.office365.com`, 993 | Microsoft no longer accepts username and password for IMAP – use [sign-in with OAuth](#anmeldung-mit-oauth) |

## Sign-in with OAuth { #anmeldung-mit-oauth }

With **Microsoft 365, Outlook.com** and, if you wish, with **Gmail**, Ablago signs in with **OAuth 2.0** (IMAP with XOAUTH2): you sign in once at the provider and allow Ablago access to the mailbox. Ablago gets tokens for this instead of a password and renews them itself.

For this you need **your own app registration** at the provider – the Ablago project doesn't run a shared service. The app applies to all mailboxes of this provider in your Ablago.

### How it works { #so-geht-es }

1. Under [Email and address](installation.md#e-mail-und-adresse), enter **Ablago's address** (e.g. `https://dms.example.org`). From it the **redirect URI** `https://dms.example.org/api/oauth/postfach/rueckruf` results; the workbench shows it. Signing in in the browser needs an **https address** (http only via `localhost`); without one, the **device code** works with Microsoft (see below).
2. Create the app at the provider (guides below).
3. **Workbench → Mailboxes → + New**: *Sign-in* **OAuth 2.0**, choose the *provider* – server, port and encryption are prefilled (`outlook.office365.com` or `imap.gmail.com`, 993, SSL/TLS). The *username* is the mailbox's email address. **Save**.
4. In the area *Sign-in via OAuth 2.0* under *App at the provider*, enter **client ID** and **client secret**, for Microsoft the **tenant**, **Save app**. The app has a save of its own because it applies to all mailboxes of this provider (and to [email sending](e-mail-versand.md)).
5. **Sign in in the browser**: Ablago redirects you to the provider; after signing in and consenting you come back to the workbench. Or **Sign in with device code**: Ablago shows a code and an address; there you sign in on any device, and the workbench waits meanwhile.
6. **Test connection**.

![Workbench → Mailboxes: sign-in with OAuth 2.0](bilder/werkbank-postfach-oauth.png)

The *State* shows when and by whom the sign-in happened. **Sign out** deletes the stored tokens (with Google, Ablago additionally revokes them at the provider); after that Ablago fetches nothing more there. If you change the mailbox's server, port or encryption, or the app's tenant or token endpoint, Ablago signs the affected mailboxes out too – sign them in anew afterwards. OAuth only works with encryption (SSL/TLS or STARTTLS).

!!! note "Security"
    Ablago only stores tokens and client secret encrypted with the [key](verschluesselung.md). They never appear in the interface, not in the [full export](export.md) and not in the log; in the [backup](sicherung.md) only encrypted. Signing in in the browser is protected with PKCE and a one-time value valid for 10 minutes and only applies to the administrator and the browser that started it.

### Expired sign-in { #abgelaufene-anmeldung }

Ablago renews the sign-in itself before it expires. If the provider refuses – the sign-in has expired, was revoked at the provider or the account's password was changed –, then

- the mailbox shows *expired or revoked* with the reason,
- the **overview** and the workbench sidebar warn (*Mailboxes* with "!"),
- the administrators get **one** email (not again with every attempt),
- fetching this mailbox rests until you **sign in anew**.

### Microsoft Entra (Microsoft 365, Outlook.com)

1. In the [Microsoft Entra admin center](https://entra.microsoft.com) → *Applications* → **App registrations** → *New registration*.
2. *Name* e.g. "Ablago mailboxes". *Supported account types*: only your directory (Microsoft 365), or **Accounts in any organizational directory and personal Microsoft accounts** if Outlook.com mailboxes belong to it too.
3. *Redirect URI*: platform **Web**, address from the workbench (`https://<dms>/api/oauth/postfach/rueckruf`). Without a public address leave it empty and use the device code.
4. After creating it: take over the **Application (client) ID** from the *Overview* into the workbench; the **Directory (tenant) ID** as *tenant* – or `common` (any accounts), `consumers` (Outlook.com only), `organizations`.
5. **Certificates & secrets** → *New client secret* → enter the **value** (not the ID) as the client secret. If the secret expires, create a new one here and replace it in the workbench.
6. **API permissions** → *Add a permission* → *APIs my organization uses* → **Office 365 Exchange Online** (or under *Microsoft Graph*) → *Delegated permissions* → **IMAP.AccessAsUser.All**; plus **offline_access**. In Microsoft 365, *Grant admin consent*.
7. For the **device code**: *Authentication* → *Advanced settings* → **Allow public client flows** to *Yes*.
8. In Microsoft 365, **IMAP must be switched on for the mailbox** (Microsoft 365 admin center → Users → *Mail* → *Manage email apps* → IMAP).

### Google Cloud (Gmail, Google Workspace)

!!! warning "Private Gmail account: better an app password"
    For Gmail, OAuth needs the restricted scope `https://mail.google.com/`. A self-created app with the status **"Testing"** gets sign-ins that **expire after 7 days** – you would have to sign in anew every week. Without this limit it only works with an app of type **"Internal"** in Google Workspace or after Google's verification (hardly feasible for private individuals). For private accounts an [app password](#app-passworter) is therefore the better choice.

1. In the [Google Cloud Console](https://console.cloud.google.com) create a project; under *APIs & Services* → *Library*, enable the **Gmail API**.
2. *OAuth consent screen*: user type **Internal** (Workspace) or **External**; with *External* in status *Testing*, add yourself as a **test user**. Add the scope `https://mail.google.com/`.
3. *Credentials* → *Create credentials* → **OAuth client ID**, type **Web application**; *Authorized redirect URIs*: the address from the workbench.
4. Enter **client ID** and **client secret** in the workbench.

Google doesn't offer a device code for Gmail; Ablago therefore needs an address your browser reaches (https).

### Other provider {#anderer-anbieter}

For other providers with IMAP and OAuth 2.0 you enter the *authorization endpoint*, *token endpoint*, optionally the *device code endpoint* and the *scope* (usually with `offline_access`) yourself – they are in the provider's documentation. There is one such setting per Ablago. The endpoints need `https://`; `http://` only works on your own network – which addresses count as such (e.g. `.lan` or `.home.arpa`) is described under [Sign-in via a provider](anmeldeschutz.md#anmeldung-uber-einen-anbieter-openid-connect).

## What happens when taking over { #was-beim-ubernehmen-passiert }

- **Every email becomes a post**: channel *Email*, direction incoming, status *New*; subject, date and sender (name and address, under *From*) from the email; *To* from the mailbox. It was created by the *mailbox*, not by a user. The history names mailbox, sender and time.
- **Attachments** become individual documents. Small embedded images (logos, signatures) are skipped; attached emails stay an `.eml` document.
- **Duplicate attachments:** if an attachment is already in Ablago (same checksum), it is taken over anyway; the post's history says "Duplicate: "Invoice.pdf" is already in Ablago – check before assigning." Where, **Assign** shows to everyone who may read the other folder.
- The **Email's text** appears as plain text on the post. HTML is converted into text; Ablago never loads images or other content from the internet.
- The same limits as for uploading apply. A too-large attachment is recorded with the reason in the history; the others are taken over. If the [storage space](speicherplatz.md) limit is reached, the email stays in the mailbox.
- **No double takeover** – not even after a restart, a crash in the middle of fetching or if the server starts its numbering anew (UIDVALIDITY). The email is only moved, marked or deleted once the post is saved.
- In [maintenance mode](wartungsmodus.md) and during a [restore](wiederherstellen.md), fetching rests. If several instances run, only one fetches. The settings are part of the [backup](sicherung.md); password and tokens stay encrypted.
