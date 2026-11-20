# Backing up with snapshots { #sichern-mit-snapshots }

If you already back up servers and storage with **snapshots** (e.g. Btrfs or ZFS snapshots on the NAS, snapshots of a virtual machine, backup software with images), Ablago can be part of them. This page says what belongs together, what to watch out for when protecting them and how to practise a restore.

The simpler way remains [Ablago's own backup](sicherung.md): encrypted, independent of the PostgreSQL version and [test-restored](wiederherstellen.md#probe-wiederherstellung) every week. A snapshot complements it; it does not necessarily replace it – see [Snapshot or Ablago's backup?](#snapshot-oder-sicherung).

## What belongs together { #was-zusammengehort }

Ablago consists of the **database** and the folder **`files`** with the documents. The database refers to every file; both must therefore come **from the same moment**. A snapshot of the database from 2:00 and one of `files` from 2:15 do not fit together: documents uploaded in between are missing from the database, and deleted ones are still listed there without a file.

| Folder in the container | Content | In the snapshot? |
| --- | --- | --- |
| Database (volume of the PostgreSQL container, with `dms-komplett` `/data/postgres`) | folders, values, history, settings, users | **yes**, together with `files` |
| `/data/files` | documents, converted versions, logos | **yes**, together with the database |
| `/data/geheim` | key `dms.schluessel`, database connection `datenbank.json` (with password) | decide deliberately, see [The key](#der-schlussel) |
| `/data/sicherung` | Ablago's encrypted backups | may be included, but is already a backup |
| `/data/export` | full exports and data access reports, unencrypted, short-lived | not needed |

How to get both from the same moment:

- **Database and `files` on the same storage** (e.g. both folders under `/volume1/docker/dms`, also with `dms-komplett`): **one common snapshot** of that storage. It captures everything at the same moment; PostgreSQL starts from it as after a power failure and brings itself into a clean state.
- **Database on a server of its own:** there, PostgreSQL's own backup – a **base backup with WAL archive** that can be restored to a point in time (*point-in-time recovery*) – plus a snapshot of `files`. When restoring, bring the database to the **time of the `files` snapshot**.
- **Separate snapshots without point-in-time recovery** only in [maintenance mode](wartungsmodus.md) or with the container stopped: then nothing changes between the two.

## The key { #der-schlussel }

Password fields and the credentials of mailboxes and backup targets are encrypted in the database with Ablago's key (see [Encryption](verschluesselung.md)). **Without this key a snapshot cannot be restored completely:** folders and documents are there, but stored passwords can no longer be read – Ablago then reports that the key for credentials is missing.

There are two ways for the folder `/data/geheim`; choose deliberately:

1. **Exclude it** (recommended when the snapshots end up somewhere less protected): `geheim` is not in the snapshot. When restoring, put the key file from your copy or from the [emergency sheet](verschluesselung.md#notfallblatt) into `geheim/` and write `datenbank.json` anew (or let the setup assistant create it).
2. **Include it**: the snapshot is then complete – but it also contains all stored credentials **in decryptable form** and the database password. It then needs the same protection as the server itself.

In both cases keep the [emergency sheet](verschluesselung.md#notfallblatt) separate from the snapshots.

## Protecting the snapshot { #schutz }

**A snapshot is not encrypted.** Ablago's backup is an encrypted file; the database and `files`, however, are stored in plain text – and so is a snapshot of them. It needs the same protection as the server: access only for those who also administer the server. Into a cloud or onto third-party storage only with **encryption by the backup software** (with Synology *Hyper Backup* the client-side encryption).

## Version { #version }

A snapshot fits the **Ablago version** it was made with – and the PostgreSQL major version that wrote the database. When restoring, start **the same version** (the image with the same version number, see **Workbench → System status → Version and updates** or the log) and update afterwards as usual (see [Updating](aktualisieren.md)). A newer Ablago brings an older database up to its level when it starts; the other way round is not possible.

## Restoring and checking { #prufen }

Practise the restore regularly on a **test system** – not on the running system:

1. **Start the test system without access to the outside network.** Otherwise it fetches real post from the mailboxes, sends reminders and calls packages. Ablago has no switch of its own for this; start the container in a Docker network without internet (`internal: true`) and turn on [maintenance mode](wartungsmodus.md) after logging in – it pauses mailbox fetching, automations and deadlines.
2. **Adjust `datenbank.json`** if `geheim` was in the snapshot: otherwise it points to the **real database** – the test system would write into the live filing system. Change the database (and host) to the restored copy.
3. **Start the same version**, log in and check:
    - open folders and documents, download a document;
    - show a password field – this shows that the key fits (**Workbench → Encryption** shows the status);
    - **Workbench → System status** and **Workbench → Overview** without errors.
4. **Old things come back.** An older state also makes revoked things valid again: deleted API keys, old passwords, removed people, withdrawn shares and logged-in sessions. If you restore a snapshot on the **real system**:
    - end all sessions (`dms abmelden --alle`, see [Console](konsole.md)),
    - review API keys and users and block revoked ones again,
    - redo permission changes made since the snapshot,
    - if a password or the key has changed since then (key change), use the newer one.

## Snapshot or Ablago's backup? { #snapshot-oder-sicherung }

| | Snapshot | [Ablago's backup](sicherung.md) |
| --- | --- | --- |
| Encrypted | no (only by the backup software) | yes, with Ablago's key |
| Moving to other hardware or PostgreSQL version | only the same PostgreSQL major version | yes, version-independent ([Growing and moving](wachsen.md)) |
| Restore checked | by you, on a test system | automatically every week ([test restore](wiederherstellen.md#probe-wiederherstellung)) |
| Evidence for the process documentation | log of the backup software | metadata with checksum per backup, traffic light in the overview |
| Points in time | as often as the snapshots | on schedule, e.g. daily |
| Good for | quickly rolling back the whole server | moving, off-site copy, evidence |

Both together make a good pair: snapshots for quick rollback, Ablago's backup as a version-independent, encrypted off-site copy.

## For the process documentation { #verfahrensdokumentation }

- State **what** is in the snapshot (database, `files`, whether `geheim`), **how often** it is made and **how long** it is kept.
- **Deletion and retention:** what is deleted in Ablago (according to the [deletion concept](loeschkonzept.md), for a GDPR erasure) remains in older snapshots until they expire. Align the retention of the snapshots with the deletion periods and state it there.
- Record when the restore was last practised and with what result.
- Template: [Process documentation](verfahrensdokumentation.md).
