# Off-site backup {#sicherung-auer-haus}

A backup in your own backup folder protects against accidental deletion and against a broken update. Only a copy in another place helps against **fire, theft or a disk failure** – the "1" of the [3-2-1 rule](sicherung.md#speicherort). Since version 0.142, Ablago brings every backup there **itself** if you wish and **checks** that it arrived intact.

## Which way suits you? {#welcher-weg-passt}

| You run Ablago … | Off-site copy via … |
|---|---|
| on a **NAS with a backup app** (Synology *Hyper Backup*, QNAP *Hybrid Backup Sync* …) | the NAS's app – it copies the backup folder, see [Storage location](sicherung.md#speicherort). You don't need a package. |
| with a **network share** (SMB/NFS) of another device in the house | a Docker volume: mount the share as the backup folder (`/data/sicherung`). That is a second disk, but not yet off site. |
| on a **Raspberry Pi, a rented server or at a provider** | a package: **Backup target WebDAV** for Nextcloud, many NAS and many hosting providers. |

A package for S3-compatible storage (stage 2) is planned; SFTP and FTPS don't exist (SFTP would need direct network access for packages, FTPS is outdated – targets with FTPS can usually also do WebDAV).

## How it works {#so-lauft-es-ab}

1. **Locally first:** Ablago backs up into the backup folder as always – fast and independent of the network. It never writes directly to the target; a slow or missing network doesn't prevent a backup.
2. **Then in the background:** the package gets the event *Backup finished*, reads the **encrypted** file in pieces and uploads it in parts. If the network breaks off, it continues at the last point on the next attempt (retries after 1, 5, 30 minutes, 2 and 6 hours). The local backup stays unaffected.
3. **Checking:** the package compares the copy with the backup's checksum (SHA-256) – depending on the target via the server's checksum or by reading it back – and reports the result.

Next to the file, the package puts a **slim metadata file** (`.json`): file name, size, checksum, time and the key's fingerprint – without names, versions or counters. With it, the copy can be [restored](wiederherstellen.md#aus-einer-kopie-ausser-haus).

**Nothing is deleted locally because the copy has arrived.** Local means fast restoring, off site means protection if the device is lost – both have their own retention. If space is tight, choose **Keep only the newest locally** under *Schedule and retention*. "None locally" deliberately doesn't exist: otherwise every restore would depend on the external storage – cancelled, full, blocked or the network gone. A backup whose copy is currently running stays until it has arrived (at most 2 days).

## Display and notices {#anzeige-und-hinweise}

Under **Workbench → Backup**, the column **Where** shows per backup what exists of it:

| Display | Meaning |
|---|---|
| local · external waiting / running (… %) | The copy has been triggered or is on its way. |
| local · external **checked** | Arrived at the target, checksum confirmed (by the server or by reading it back completely). |
| local · external checked (sample) | Size and samples read back – for large backups; once a month the package reads completely. |
| local · external uploaded, size confirmed | The target only confirms the size; reading back isn't possible (e.g. a [file drop](#loschschutz)). |
| local · external failed | With a reason in the title, e.g. "password wrong" or "storage full". |

The section **Off site** names the target and the last copy. The workbench overview shows a notice, and all administrators get **one email per incident** if

- a copy has **finally failed** (checksum at the target wrong, sign-in refused, given up after all retries) or
- no newer backup has arrived off site for more than **2 days**.

The email only names the target, never credentials. A single failed attempt that the next retry fixes is only shown in the workbench.

The [emergency sheet](verschluesselung.md#notfallblatt) names the target (package and address) **without a password**, plus the sentence: *The workbench's key is not on the target. You only open the copy with the key from this sheet.* Download it anew after setting up.

## Setting up with "Backup target WebDAV" { #einrichten-mit-sicherungsziel-webdav }

1. **Workbench → Packages**, install *Backup target WebDAV*. The preview shows the permissions: *Read the encrypted backup in order to copy it off site – can't open it* and *Reacts to: A backup is finished*.
2. In the package's **settings**, enter address, user, password and folder and save; you confirm the address – the package may only go onto the network there. Ablago stores the password encrypted and no longer displays it.
3. **Test connection** – with the stored details, never with an address from the request.
4. **Back up now** and watch in the column *Where* how the copy arrives.

Details on Nextcloud, hosting providers and NAS are in the package's README.

## Deletion protection against ransomware { #loschschutz }

If someone takes over your Ablago, they also know the stored credentials of the target. So that they **can't delete or overwrite** the off-site copies, give Ablago as few permissions as possible – and tidy up at the target itself:

- **Nextcloud – file drop (recommended):** create a folder and share it as a **file drop** (*Share link → Upload only / File drop*). A file drop can upload, but not list, read or delete. Enter the link as the address and the share's password (if set) as the password. Disadvantage: reading back isn't possible – the display then honestly says "uploaded" instead of "checked". The bin and versions of a normal Nextcloud, on the other hand, **don't** protect: the same account can empty them.
- **Normal WebDAV account (Nextcloud user, hosting provider, NAS):** can always delete too. Use a **separate user** just for the backups, with access only to this folder, and activate at the target – where available – **versioning or snapshots** that this user can't delete (e.g. NAS snapshots, snapshots at the hosting provider).
- **Delete old backups externally** is **off** in the package. If you switch it on, the account needs delete permissions – and that is exactly what removes the protection. Better: set up retention at the target (lifecycle rule, the NAS's clean-up rule) or tidy up by hand now and then.
- **S3-compatible storage (once the package exists):** a separate access key with only `PutObject` (and `HeadObject`/`GetObjectAttributes` for checking), **without** `DeleteObject`; on the bucket **Object Lock** with a retention time and a **lifecycle rule** for tidying up. Checking is done via `x-amz-checksum-sha256` – the target recalculates itself. That is the cleanest deletion protection.

What the package sees and may do:

- only the **encrypted** file of the backup from its event and the slim metadata – never the key, never contents, never other files of the backup folder;
- onto the network only to the confirmed address, without redirects to other hosts;
- at the target it doesn't list or tidy up anything as long as you don't switch on *Delete old backups externally*.

The backup is encrypted with AES-256-GCM and checked as a whole: whoever only has the file can neither read it nor change it unnoticed.
