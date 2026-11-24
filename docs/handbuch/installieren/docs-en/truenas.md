# TrueNAS

!!! info "Tested: template automatically, device not yet"
    The template for the *Custom App* is started as a trial on GitHub's machines with every change (Linux with Docker, amd64). The app in the catalogue is maintained by TrueNAS; it uses the same images. There is no report from a real device yet. What that means is described under [Tested platforms](plattformen.md).

This is how you set up Ablago on **TrueNAS Community Edition 24.10 or newer**. These versions run apps with Docker. There are two ways:

- **[From the app catalogue](#aus-dem-app-katalog)** (recommended): Ablago is in TrueNAS's community catalogue. Installing and updates go through the TrueNAS interface.
- **[As a Custom App with the template](#als-custom-app)**: if you want to choose settings yourself, e.g. [dms-komplett](komplett.md) or your own paths.

The two ways differ in a few points:

| | App catalogue | Custom App (template) |
| --- | --- | --- |
| Address | `http://<TrueNAS>:30607` (port can be changed) | `http://<TrueNAS>:8080` |
| Folders or datasets | `files`, `keys`, `backups`, `postgres_data` | `files`, `geheim`, `sicherung`, `postgres` |
| Database | PostgreSQL 18 | PostgreSQL 18 (up to Ablago 0.305: 17) |
| Setup code | none – setup only works from your home network | yes, in the log and in `geheim/EINRICHTUNGSCODE` |
| Owner of the files | 568:568 (*apps*) | the owner of the folders |
| Updates | **Apps → Ablago → Update** | *Pull Images* and restart |

Where the manual otherwise says `geheim` and `sicherung`, the folders of the catalogue app are called `keys` and `backups`.

## From the app catalogue { #aus-dem-app-katalog }

1. **Apps → Discover Apps**, search for **Ablago** and choose **Install**. The app is in the *Community* train; its page in the catalogue: [apps.truenas.com/catalog/ablago_community](https://apps.truenas.com/catalog/ablago_community/).
2. **Database password:** enter a long password made of letters and numbers. The database takes it over only on the very first start.
3. **Port:** the default is `30607`. Change it only if it is already in use on your system.
4. **Storage:** for `files`, `keys`, `backups` and `postgres_data`, choose an *ixVolume* each (TrueNAS creates the dataset itself) or your own path (*Host Path*) in a dataset you created beforehand. With your own paths you find the folders more easily later, for example for the off-site backup.
    - `files`: your documents,
    - `keys`: the key – keep it separate from the backups,
    - `backups`: Ablago's backups,
    - `postgres_data`: the database.
5. **User:** the app stores the files as user and group **568** (*apps*). With your own paths, the datasets must belong to this user (choose the template *Apps* when creating them). Ablago starts as root, takes over the folders and then keeps running without administrator rights.
6. **Install.** After one or two minutes the app shows *Running* under **Apps → Installed**.

!!! warning "Finish the setup right away"
    The app from the catalogue has **no setup code**. Until the first administrator account exists, any device in your home network could therefore take over the setup (from the internet this is not possible). Open `http://<TrueNAS>:30607` right after installing and finish the setup before you leave the app running unattended for long.

Then open `http://<TrueNAS>:30607` in your browser. The wizard does not ask for the database; it is already connected. There is no setup code.

--8<-- "assistent-weiter.md"

### Updates (app catalogue) { #katalog-updates-und-sicherung }

- **Updates:** **Apps → Ablago → Update**, as soon as TrueNAS has the new version in its catalogue. That is usually a few days after Ablago's stable release, because TrueNAS updates the versions in its catalogue itself. The data stays in the datasets.
- **Off-site backup:** copy the dataset or folder `backups` to another place with a **Cloud Sync Task** or **Replication**. Keep the content of `keys` separately (e.g. with the [emergency sheet](https://help.ablago.app/admin/aktuell/en/notfall/)). More under [Off-site backup](#sicherung-ausser-haus).

## As a Custom App with the template { #als-custom-app }

### 1. Create a dataset and folders {#1-datensatz-und-ordner-anlegen}

1. **Datasets:** in the pool that holds your apps (`tank` in the template), create a dataset `apps/dms` with the template *Apps*.
2. In this dataset, create four folders: `postgres`, `files`, `geheim`, `sicherung`. You can do this e.g. via an SMB share or the shell under **System → Shell**:
   ```sh
   mkdir -p /mnt/tank/apps/dms/{postgres,files,geheim,sicherung}
   ```

!!! tip "Intake folder for the scanner"
    Also create a fifth folder `eingang` next to them. The template mounts it, and some NAS abort on start if a mounted folder is missing. It becomes the [Intake folder](https://help.ablago.app/admin/aktuell/en/eingangsordner/): every file your scanner or the NAS puts there becomes new post. Share it on the NAS for the scanner. If you don't need a scanner, it simply stays empty.

### 2. Create the app {#2-app-anlegen}

1. **Apps → Discover Apps → ⋮ → Install via YAML**.
2. **Name:** `dms`.
3. Paste the content of the template [`deploy/truenas/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/truenas/docker-compose.yml).
4. **Enter the password:** in the line `x-passwort:`, replace `HIER-EIN-LANGES-PASSWORT-EINTRAGEN` with a long password made of letters and numbers. If your pool is not called `tank`, replace `/mnt/tank/` in the paths.
5. **Save**.

!!! warning "Change the password before the first start"
    The database takes over the password only on the very first start.

### 3. Set up {#3-einrichten}

1. Open `http://<TrueNAS>:8080` in your browser.
2. The **setup code** is shown under **Apps → `dms` → Workloads → `app` → Logs**. It is also in `/mnt/tank/apps/dms/geheim/EINRICHTUNGSCODE`.
3. The wizard does not ask for the database; it is already connected.

--8<-- "assistent-weiter.md"

### Updates (Custom App) {#updates-und-sicherung}

- **Updates:** **Apps → `dms` → Update** (or *Pull Images* and restart). The data stays in the dataset.
- **Off-site backup:** copy the `sicherung` folder to another place, as described below.

!!! note "From PostgreSQL 17 to 18"
    Up to Ablago 0.305 the template had `postgres:17`. An existing installation keeps running with it. Moving to 18 works via a backup: [Updating → PostgreSQL 18](https://help.ablago.app/admin/aktuell/en/aktualisieren/#postgresql-18).

## Off-site backup { #sicherung-ausser-haus }

Copy the folder with the backups (`backups` for the catalogue app, `sicherung` for the Custom App) to another place with a **Cloud Sync Task** or **Replication**. The backups are encrypted, so cloud storage only sees unreadable files. Exports are not included: a [full export](https://help.ablago.app/admin/aktuell/en/export/) is unencrypted and is therefore kept in its own [export folder](https://help.ablago.app/admin/aktuell/en/export/#export-ordner), never with the backups. Snapshots of the dataset are extra protection, but don't replace a copy off site.

!!! info "Pictures to follow"
    This guide has no screenshots yet. If a menu item looks different for you, feel free to write it in an [issue](https://github.com/motom001/dms/issues).
