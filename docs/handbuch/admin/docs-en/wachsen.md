# Growing and moving {#wachsen-und-umziehen}

Ablago starts small and can grow with you. All moves follow the same path: **create a backup, start the new system, restore the backup**. Ablago's backup doesn't depend on a particular PostgreSQL version or a particular device. It contains the whole database and all files, encrypted with your key.

--8<-- "ausgeblendet-schritt.md"

## Which variant? {#welche-variante}

| | **dms-komplett** (one container) | **dms** + its own database (two containers or more) |
| --- | --- | --- |
| Setup | one image, four folders, done | Compose project or app store, database password |
| Database | PostgreSQL 17 in the container, only reachable from inside | its own container or server, freely chosen |
| PostgreSQL updates | with the next Ablago image | immediately (pull `postgres:17` again) |
| Good for | trying out, testing, environments with only one container | long-term operation (recommended), your own database management, a database on another device |
| App stores | – | umbrelOS, ZimaOS, CasaOS, TrueNAS, Unraid |

**We recommend two containers** for long-term operation: PostgreSQL gets security updates independently of Ablago, both can be restarted and examined separately, and it is the usual Docker way. `dms-komplett` is the alternative for trying out and for environments that only allow one container. A switch is possible at any time, in both directions.

## Moving, step by step {#umziehen-schritt-fur-schritt}

This applies to every move: from two containers to `dms-komplett` and back, from a NAS to a server, to new hardware.

1. **On the old system:** switch on [maintenance mode](wartungsmodus.md), create a backup under **Workbench → Backup**. Have the [emergency sheet](verschluesselung.md#notfallblatt) with the key ready.
2. Copy the two backup files (`.dms-sicherung` and `.json`) from the `sicherung` folder.
3. Start **the new system**, e.g. [dms-komplett](https://help.ablago.app/installieren/aktuell/en/komplett/) or one of the [templates](https://help.ablago.app/installieren/aktuell/en/). Put the two files into its `sicherung` folder.
4. Open the setup wizard in the browser, choose **Restore from a backup** and follow the steps under [Restoring → New NAS, old backup](wiederherstellen.md#neues-nas-alte-sicherung).
5. Sign in with the previous credentials and check briefly: folders, documents, **Workbench → system health → Version and updates**.
6. Only switch off the old system once the new one is running. Keep the old system's folders until you're sure.

If the address changes (new device, new port), enter it anew under **Workbench → email and address** so that links in emails are correct.

## New major version of PostgreSQL {#neue-hauptversion-von-postgresql}

A database of an older major version (e.g. 17) can't simply be started with a newer one (e.g. 18).

- **dms-komplett:** if a future image brings a new major version, the container deliberately doesn't start with the old `postgres` folder. The log says which version the database has and which the image has. Then:
  1. Start the previous image (with the old version number) once more and create a backup.
  2. Rename the `postgres` folder (e.g. `postgres-17`) and create an empty one.
  3. Start the new image and restore the backup in the wizard.
  4. Once everything works, delete the old folder.
- **Your own database:** the same. Start a new, empty PostgreSQL container in the new version, point Ablago to it, restore the backup.

## When it grows {#wenn-es-mehr-wird}

- **Many documents:** the `files` folder grows with the documents, the database much more slowly. Put `files` and `sicherung` where there is space. The folders can be moved individually, as long as the volume afterwards points to the same folder in the container again. **Workbench → system health** shows what takes up how much.
- **More performance:** text recognition and full-text search benefit from more processor cores and memory. A move to a more powerful computer works as above.
- **Database on its own server:** move from `dms-komplett` to the lean image `dms` with its own database, as described above.

If you keep receipts for an activity (freelance work, small business, letting), also record a move in your [procedure documentation](verfahrensdokumentation.md) (sections 1 and 10).
