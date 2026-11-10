# umbrelOS

!!! info "Tested: no report yet"
    There is no report from a device for this way yet. GitHub's machines test the image itself with every change on amd64 and arm64. What that means is described under [Tested platforms](plattformen.md).

This is how you install Ablago on a home server with **umbrelOS**, e.g. an Umbrel Home or a mini PC with umbrelOS. You need neither a Compose file nor the command line. The app brings its own database and is already connected to it.

## 1. Add the DMS store {#1-dms-store-hinzufugen}

Ablago is not (yet) in the official Umbrel App Store. You add the DMS store once as an additional source:

1. Open the **App Store**.
2. Click **⋯** at the top right and choose **Community App Stores**.
3. Enter this address and add it:
   ```
   https://github.com/motom001/dms-appstore
   ```

After that, the App Store has the section **Ablago App Store**.

## 2. Install {#2-installieren}

In the **Ablago App Store**, open the app **Ablago** and choose **Install**. umbrelOS downloads Ablago and its database and starts both.

## 3. Set up {#3-einrichten}

1. Open the app **right after the installation**, via the icon on the home screen or at `http://umbrel.local:8478`.
2. There is no setup code here, and the database is already filled in.

--8<-- "assistent-weiter.md"

!!! warning "Set up right after the installation"
    Set up Ablago straight away – then you are the first to create the administrator.

!!! info "No Umbrel sign-in in front of Ablago"
    umbrelOS puts **no** Umbrel sign-in in front of Ablago, because only the owner of the device has one. Family members sign in with their own Ablago account. Links from emails and the [interface (API)](https://help.ablago.app/admin/aktuell/en/api/) work this way too.

## Data {#daten}

The data is stored under `~/umbrel/app-data/motom001-dms/data/`:

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
- The backups are stored on the same device. Copy them to another place now and then, e.g. to a USB stick or to cloud storage. The backups are encrypted, so cloud storage only sees unreadable files. Exports are not included: a [full export](https://help.ablago.app/admin/aktuell/en/export/) is unencrypted and is therefore kept in its own [export folder](https://help.ablago.app/admin/aktuell/en/export/#export-ordner), never with the backups.
- If you have switched on **Backups** in umbrelOS, umbrelOS also backs up the app data.

## Update {#aktualisieren}

When there is a new version, the App Store shows an update for **Ablago**. One click is enough; the data is kept. What's new is shown under **Workbench → system health → Version and updates**.

## Moving to a new device {#auf-ein-neues-gerat-umziehen}

Install Ablago on the new device from the store, put the backup files into its `sicherung` folder and choose **Restore from a backup** in the wizard. In detail under [Restoring](https://help.ablago.app/admin/aktuell/en/wiederherstellen/).
