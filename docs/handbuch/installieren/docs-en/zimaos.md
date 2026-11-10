# ZimaOS

!!! info "Tested: no report yet"
    There is no report from a device for this way yet. GitHub's machines test the image itself with every change on amd64 and arm64. What that means is described under [Tested platforms](plattformen.md).

This is how you install Ablago on a device with **ZimaOS**, e.g. a ZimaCube or ZimaBoard. You need neither a Compose file nor the command line. The app brings its own database: it runs in the same container and is already connected.

!!! tip "CasaOS instead of ZimaOS?"
    The steps for CasaOS are on a [page of their own](casaos.md).

## 1. Add the DMS store {#1-dms-store-hinzufugen}

Ablago is not (yet) in the official ZimaOS App Store. You add the DMS store once as an additional source:

1. Open the **App Store**.
2. Choose **Manage sources** (depending on the version also *Add source* or a **+** next to the store selection).
3. Enter this address and add it:
   ```
   https://cdn.jsdelivr.net/gh/motom001/dms-appstore@gh-pages
   ```

After that, you can choose the **Ablago App Store** in the store selection.

## 2. Install {#2-installieren}

In the **Ablago App Store**, open the app **Ablago** and choose **Install**. ZimaOS downloads Ablago as **one** container (image `dms-komplett`) and starts it. The database runs inside it – without a password and without a port to the outside. There is no separate "database" container.

## 3. Set up {#3-einrichten}

1. Open the app **right after the installation**, via its icon or at `http://<device>:8478`.
2. There is no setup code here, and the database is already filled in.

--8<-- "assistent-weiter.md"

!!! warning "Set up right after the installation"
    Set up Ablago straight away – then you are the first to create the administrator.

## Data {#daten}

The data is stored under `/DATA/AppData/dms/`:

| Folder | Contents |
| --- | --- |
| `files` | uploaded documents |
| `geheim` | keys for passwords and backups |
| `sicherung` | Ablago's backups |
| `postgres` | the database |

!!! note "No intake folder"
    When installed from the app store, there is no [Intake folder](https://help.ablago.app/admin/aktuell/en/eingangsordner/) for scanners. Documents arrive by uploading in the Library, by email via a [mailbox](https://help.ablago.app/admin/aktuell/en/postfaecher/) or via Ablago's interface.

## Back up {#sichern}

- Under **Workbench → [Backup](https://help.ablago.app/admin/aktuell/en/sicherung/)**, switch on a schedule, and under **Workbench → [Encryption](https://help.ablago.app/admin/aktuell/en/verschluesselung/#notfallblatt)** print the emergency sheet.
- The backups are stored on the same device. Copy the `sicherung` folder to another place now and then, e.g. with ZimaOS's backup function to a USB disk or to cloud storage. The backups are encrypted, so cloud storage only sees unreadable files. Exports are not included: a [full export](https://help.ablago.app/admin/aktuell/en/export/) is unencrypted and is therefore kept in its own [export folder](https://help.ablago.app/admin/aktuell/en/export/#export-ordner), never with the backups.

## Update {#aktualisieren}

When there is a new version, the App Store shows an update for **Ablago**. The data is kept. What's new is shown under **Workbench → system health → Version and updates**.

!!! warning "Still installed with two containers?"
    If you installed Ablago from the store before version 0.73.10, you have two containers: Ablago and the database. Your data is still there. After the update to the single container, Ablago first starts with an empty database – this is how you get it back:

    1. **Before** the update, create a backup under **Workbench → Backup** (or use the last automatic one).
    2. Install the update in the App Store.
    3. In the wizard, choose **Restore from a backup** and restore this backup.

    The old database files stay in the `postgres/` folder until you delete them yourself.

## Moving to a new device {#auf-ein-neues-gerat-umziehen}

Install Ablago on the new device from the store, put the backup files into its `sicherung` folder and choose **Restore from a backup** in the wizard. In detail under [Restoring](https://help.ablago.app/admin/aktuell/en/wiederherstellen/).
