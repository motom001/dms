# Encryption {#verschlusselung}

Passwords and other secrets that Ablago stores are encrypted in the database. Ablago keeps the key for this in a **separate file**, never in the database. A database backup alone therefore reveals no secrets.

What exactly is encrypted is shown on the page under [What is encrypted](#was-verschlusselt-ist) with the number per kind. This is also – and only – where you download the [emergency sheet](#notfallblatt) with the key and the emergency code.

![Workbench → Encryption](bilder/werkbank-verschluesselung.png)

## What is encrypted { #was-verschlusselt-ist }

The section **What is encrypted** counts every kind of encrypted value – also with 0, so you see what belongs to it:

| Kind | Where you enter it |
| --- | --- |
| **Password fields in folders** | [password fields](mappentypen.md#passwortfelder) in the Library |
| **Password fields in the bin** | deleted folders in the [Bin](papierkorb.md) |
| **Email sending** (password of the mail server) | **Workbench → email and address** |
| **Mailboxes (IMAP password)** | [mailboxes](postfaecher.md) with password sign-in |
| **Mailboxes (OAuth: app secret)** | the client secret of the app at the provider, under [Mailboxes](postfaecher.md) |
| **Mailboxes (OAuth sign-in)** | access and refresh tokens after signing in at the provider |
| **Sign-in via a provider (OIDC)** | the client secret under [Sign-in protection](anmeldeschutz.md#anmeldung-uber-einen-anbieter-openid-connect) |
| **Two-factor sign-in** | the secret of every user who has set up [two-factor sign-in](anmeldeschutz.md#zwei-faktor-anmeldung) |
| **Package settings (secrets)** | fields of type secret in the settings of [packages](pakete.md) |
| **Calls from outside (secret for the signature)** | the secret of every address for a [call from outside](automatisierungen.md#aufruf-von-aussen); if it is not readable, choose **New secret** in the automation and enter it at the caller |
| **Call URL (secret for the signature)** | the secret of a [Call URL](automatisierungen.md#url-aufrufen) card; if it is not readable, choose **New secret** on the card and enter it at the receiver |

If a value can't be read with the existing key, "… not readable" appears next to it; which one it is appears below under *Unreadable or unencrypted values*. If a row **Further settings** turns up, the display doesn't know this kind yet – it is still encrypted and taken along when changing; feel free to report it as a bug.

Ablago encrypts the [backups](sicherung.md) with a key derived from this one; they aren't in the list.

## Creating the key { #schlussel-erzeugen }

1. In the Compose file, the folder `/data/geheim` must be a separate volume (see [Installation](installation.md)), e.g.
   ```yaml
   - /volume1/docker/dms/geheim:/data/geheim
   ```
2. **Workbench → Encryption → Create key.** A restart is not necessary.

Afterwards the page shows the state **present** and the key's **fingerprint** (e.g. `5E27-9473-05C5-D6A0`). As long as there is no key, a notice appears above the whole workbench, and no passwords can be saved.

!!! warning "Back up the key separately"
    Copy the file `geheim/dms.schluessel` to a safe place, separately from the database backup. A database can only be fully restored with this key – without it, the passwords in it can no longer be read.

The page also checks whether the folder really is a separate volume. If not, it points this out: without a volume, the file would be gone as soon as the container is recreated (e.g. on an update).

## Changing the key { #schlussel-wechseln }

If the key could have become known – for instance because a printed emergency sheet was lost – or you want to renew it regularly: **Workbench → Encryption → Change key.** In case of a security incident, first lock everyone else out with [Lock right now](wartungsmodus.md#jetzt-sofort-sperren).

![Key changed](bilder/werkbank-schluesselwechsel.png)

After a confirmation – for safety you type the word **wechseln** there –

1. Ablago creates a new key,
2. re-encrypts all secrets in the database **completely or not at all**; if something aborts, the previous key stays valid. This includes everything under [What is encrypted](#was-verschlusselt-ist): password fields in folders and in the bin, mail server, mailboxes (IMAP password, OAuth app and OAuth sign-in), the provider's client secret, two-factor secrets and package secrets,
3. sets the check word anew and
4. replaces the key file. The old key is not kept.

Values that were already unreadable before stay as they are; Ablago says how many there are. The change is recorded in the log with old and new fingerprint (without the key). The key can't be changed during a backup.

**Afterwards:**

The page shows the next two steps with a button each; a completed step gets a tick:

- **Download a new emergency sheet** – the button **Download emergency sheet** downloads the PDF directly (like the button in the section [Emergency sheet](#notfallblatt) below). Until then, overview and backup point this out.
- **Create a new backup** – with **Back up now**.
- **Older backups** remain encrypted with the old key. The list under [Backup](sicherung.md) marks them with "earlier key". To [restore](wiederherstellen.md) such a backup, Ablago asks for the key from the old emergency sheet. Keep it as long as you need these backups – or delete them with **Delete backups with an earlier key**.

!!! warning "Copies of the key file"
    If you copied the file `geheim/dms.schluessel` somewhere, replace the copy with the new file.

## Emergency sheet { #notfallblatt }

In the section **Emergency sheet** on this page, **Download emergency sheet** creates a PDF with everything you need after a failure – on **one A4 page** in Ablago's look, easily readable in black and white too. The sheet is in German:

1. **Header:** logo, name of your Library, date and Ablago version.
2. **Key:** large in groups of four for typing, plus its **fingerprint**. The zero is struck through, and below easily confused characters (`0` and `O`, `l`, `I` and `1`, `-` and `_`) it says in small print which one is meant. There is deliberately no QR code with the key – that would be one more way to get at it.
3. **This Library:** address, **Library id** and, in one sentence, where the backups are – since 0.142 also the target of the [off-site copy](sicherung-ausser-haus.md) (package and address, without user and password). If automations accept [calls from outside](automatisierungen.md#aufruf-von-aussen), **Calls from outside** is listed here with name and shortened address (up to five, then "and N more") – never the secret. If there are [destinations outside](automatisierungen.md#ziele-nach-aussen), the sheet names their hosts (in the same line as the calls). If the sheet gets too full, calls and destinations are only counted.
4. **Whom to ask?** Your [emergency contacts](#notfallkontakte) with name, phone, email and note – without contacts, lines in which you enter by hand who helps you in an emergency. If many contacts with long details no longer fit on the page, they go on a second page and this section points there.
5. **Something has happened?** The links to the help page [What has happened to you?](was-ist-passiert.md) – clickable and always written out with `https://`: `https://help.ablago.app/notfall` (English `https://help.ablago.app/emergency`) – and a **QR code** for it. Scan it with your phone, read there and work on the computer at the same time.
6. **Locked out?** The **emergency code**: 28 characters in groups of four and your Library's address with `/notfall`. With it you get back in if you have locked yourself out – see [Getting back in with the emergency code](was-ist-passiert.md#notfallcode). It isn't the key and opens no backup.

The section also shows when and by whom it was last downloaded. If it is missing, belongs to an earlier key or its emergency code has been used, a notice appears here – as well as in the [overview](uebersicht.md) and under [Backup](sicherung.md#notfallblatt), both of which lead here with **Go to emergency sheet**. You can only download it here.

![Workbench → Encryption, section Emergency sheet](bilder/werkbank-notfallblatt.png)

**Every emergency sheet has a new emergency code.** Ablago only stores a hash of it; the code of a sheet downloaded earlier no longer works afterwards. So always print the most recently downloaded sheet. If the code has been used, it no longer works either – the overview then reminds you of a new sheet, as it does for a sheet from the time before the emergency code.

Folders, file names and the steps for restoring are not on the sheet but here in the manual under [Restoring](wiederherstellen.md) – they stay up to date there. An address without `https://` appears on the sheet without `http://` in front and isn't clickable.

![Emergency sheet](bilder/notfallblatt.png)

Where the database password is depends on the template:

| Template | Database password |
| --- | --- |
| general template (`deploy/nas`) | in the file `.env` next to the Compose file (`DB_PASSWORD`) |
| Synology, UGREEN, QNAP, TrueNAS, Unraid | at the top of the Compose file (`x-passwort`) |
| dms-komplett | none – the database can only be reached inside the container |

It isn't on the emergency sheet. For a new system a new password is enough anyway.

**Keeping it:** printed in a safe place (e.g. with the family documents or in the business's safe) or as a PDF in a password safe – in any case **separately from the NAS** and not next to the backups. Whoever has the sheet can read the backups.

Every download is recorded in the log (without the key). If the key changes ([Changing the key](#schlussel-wechseln)), the workbench points out that a new emergency sheet should be created; older backups still need the old one – keep it as long as there are such backups. How to spot them under [Backup](sicherung.md#notfallblatt) is described there.

## Emergency contacts { #notfallkontakte }

Below the emergency sheet you add **people you trust** who should be asked in an emergency – someone from the family who helped with the setup, for example. They then know that your Library exists **without getting access**: no account, no rights, no link.

- **Add, edit, delete** with **+ Emergency contact**, **Edit** and **Delete**: name and email, optionally phone and a **note** (e.g. "my brother, helped with the setup"). The note only appears on the emergency sheet, never in the email. At most **10** contacts per Library.
- **Info email:** Ablago sends the contact a short email, text only, without a link, without an attachment and without your Library's address. It names you, the Library and the contact, says that they have **no access** and that they should tell you if they don't want to be listed. A mistyped address is harmless this way: whoever doesn't know you ignores the email.
- **When an email goes out:** when adding, for a new address (to the new one) and when deleting (only if the contact received the info email). A changed name, phone or note sends nothing. **Send again** works once per contact and day. Without [email sending](e-mail-versand.md) set up, it says "Info email will be sent as soon as email is set up" – Ablago catches up within a few minutes once sending works.
- **Replies to my email address:** with this tick (off by default) the contact's replies go to your address. Without it your address isn't in the email. Only the person who added the contact can switch it on.
- **Names:** a name with `://`, `www.` or `@` is rejected – otherwise an email program would turn it into a link. This also applies to your own name and the Library name, because both appear in the email.
- **Limits:** at most 20 of these emails per Library and day. Above that, Ablago refuses adding, a new address and send again for today. Deleting always works; the notice is then skipped.
- **Print the emergency sheet again:** if the contacts change after the last emergency sheet, both sections remind you.

Whoever manages the **Encryption** area (or has full administration) may manage the contacts, not while acting on someone's behalf. Each contact records who added it – the email names that person. The [log](fehlersuche.md#protokoll) records adding, editing, deleting and every info email with the contact's name and a **shortened address** (`j***@example.org`). You can also add emergency contacts in the [setup assistant](installation.md#optionales).

![Workbench → Encryption, section Emergency contacts](bilder/werkbank-notfallkontakte.png)

**Data protection:** emergency contacts are third-party data. They are in every [backup](sicherung.md) and in the [full export](export.md) (`struktur/notfallkontakte.json`), in the personal export of the person who added them, and in an [access copy](datenschutz.md#auskunft-nach-art-15-dsgvo) if the contact's address appears in the included folders. If you delete a contact, it's gone; backups keep it until they expire.

## States {#zustande}

| State | Meaning | What to do |
| --- | --- | --- |
| **missing** | There has never been a key. | Create a key. |
| **present** | Everything is fine. | – |
| **lost** | There was a key, but the file is missing. | Put the file from your copy back into `geheim/` and restart Ablago. If it is lost, create a new key and enter the secrets anew – see [Key lost](#schlussel-verloren). |
| **doesn't match** | Under `geheim/` there is a different key from the one the passwords are encrypted with. | Put the right file there and restart – or remove the wrong one, restart and create a new key. |

Under **Unreadable or unencrypted values**, the page lists which passwords and secrets can't be read with the existing key (e.g. after a new key) and where you enter them anew – also mailboxes, OAuth sign-ins, the provider's client secret, two-factor secrets and package secrets. An SMTP password from a version before 0.11 appears there as "unencrypted" until there is a key; then it is encrypted automatically.

## Key lost { #schlussel-verloren }

Your folders and documents aren't affected – only stored secrets such as mailbox passwords can no longer be read by Ablago without the key file. If you create a new key, you enter them again like this:

- **Password fields and mail server:** the values are listed under *Unreadable or unencrypted values*. Enter them anew.
- **Mailboxes:** fetching fails until you enter the password anew under **Workbench → Mailboxes**. With OAuth you enter the app's client secret anew and sign the mailboxes in again at the provider.
- **Sign-in via a provider:** sign-in fails until you enter the client secret anew under **Workbench → Sign-in protection**.
- **Two-factor sign-in:** codes from the authenticator app no longer match. Users only get in with their recovery codes. Reset two-factor sign-in under **Workbench → Users**; the user then sets it up anew.
- **Package secrets:** enter them anew in the package's settings.
- **Backups:** older backups can only be restored with the old key from the [emergency sheet](#notfallblatt).
