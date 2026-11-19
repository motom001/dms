# One container: dms-komplett {#ein-container-dms-komplett}

!!! info "Tested: automatically on amd64 and arm64"
    `dms-komplett` is started as a trial on GitHub's machines with every change, on amd64 and arm64. There is no report from a particular device yet. What that means is described under [Tested platforms](plattformen.md).

The alternative to two containers: **one container** in which Ablago and its database (PostgreSQL 17) run together. There is no password to enter, no database container and no Compose project unless you want one. The image is called `ghcr.io/motom001/dms-komplett` and runs on amd64 and arm64.

!!! info "Two containers are recommended"
    For long-term operation we recommend two containers (`dms` and `postgres:17`): PostgreSQL then gets security updates independently of Ablago, and both can be run separately. `dms-komplett` is a good fit for **trying out and testing**, for interfaces that can only **"create container from image"**, and for **providers that allow only one container**. The comparison is under [One or two containers?](index.md#ein-oder-zwei-container). You can move between the two at any time via backup and restore, see [Growing and moving](https://help.ablago.app/admin/aktuell/en/wachsen/).

## With Docker Compose {#mit-docker-compose}

```sh
mkdir -p ~/dms && cd ~/dms
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/motom001/dms/main/deploy/komplett/docker-compose.yml
docker compose up -d
docker compose logs dms | grep -A1 Einrichtungscode
```

Docker creates the folders `files`, `geheim`, `sicherung`, `postgres` and – optionally for the scanner – `eingang` ([Intake folder](https://help.ablago.app/admin/aktuell/en/eingangsordner/)) next to the file. On a NAS, replace `./` with the path of your folder, e.g. `/volume1/docker/dms/`.

## With `docker run` {#mit-docker-run}

```sh
docker run -d --name dms --restart unless-stopped --stop-timeout 60 -p 8080:3000 \
  -v /path/to/dms/files:/data/files \
  -v /path/to/dms/geheim:/data/geheim \
  -v /path/to/dms/sicherung:/data/sicherung \
  -v /path/to/dms/postgres:/data/postgres \
  ghcr.io/motom001/dms-komplett:stabil
```

## In a NAS's interface {#in-der-oberflache-eines-nas}

Synology (Container Manager), UGREEN (Docker), QNAP (Container Station) and Unraid can create a container directly from an image:

1. Download the image **`ghcr.io/motom001/dms-komplett:stabil`** or create a container from it.
2. **Port:** local `8080` → container `3000`.
3. **Folders:** create four folders on the NAS and map them – `files` → `/data/files`, `geheim` → `/data/geheim`, `sicherung` → `/data/sicherung`, `postgres` → `/data/postgres`. Optionally a fifth one for the scanner: `eingang` → `/eingang` ([Intake folder](https://help.ablago.app/admin/aktuell/en/eingangsordner/)).
4. **Restart policy:** "always" or "unless-stopped".
5. Start it.

## Set up {#einrichten}

Open `http://<device>:8080`. The wizard asks for the **setup code**. It is in the container's log and in the file `geheim/EINRICHTUNGSCODE`. It does **not** ask for the database; it is already connected.

--8<-- "assistent-weiter.md"

If Ablago already runs with two containers for you, choose **Restore from a backup** in the wizard and restore a backup from there. This way you move without losing anything.

## Database on the SSD {#datenbank-auf-der-ssd}

The database lives in the folder you enter for `/data/postgres`. It doesn't have to sit next to the other folders: if your NAS has an SSD, put it there – PostgreSQL benefits noticeably, and the files (`files`) can stay on the hard drives.

```yaml
    volumes:
      - /volume1/docker/dms/files:/data/files
      # Database on the SSD
      - /volume2/ssd/dms/postgres:/data/postgres
```

- **Permissions:** on start, the container hands the folder to the user `postgres` (number 70) and sets the permissions to `700` – even if the folder was created on the NAS with `000` (`d---------`). You don't need to set anything by hand.
- **Named volume as an alternative:** if the NAS causes trouble with permissions (network shares, ACLs), use a named Docker volume. Docker creates it on the disk Docker itself lives on:

    ```yaml
    services:
      dms:
        volumes:
          - dms-postgres:/data/postgres
    volumes:
      dms-postgres:
    ```

    A named volume survives `docker compose down` and updates. It is only deleted with `docker compose down -v` or `docker volume rm`.
- **Don't forget it:** if the line for `/data/postgres` is missing, the database is only stored inside the container. Ablago shows this in red under **Workbench → Overview** and **Database connection** and writes it to the log on start. How to rescue the data is described [below](#datenbank-retten).

## What you see at start-up {#beim-start}

From the first second after the start, the address answers with the page **"Ablago is starting …"**, even if PostgreSQL isn't running yet. It shows the step: **Creating the database (first start only)**, **Starting the database**, **Starting Ablago**, after an update **Updating the database – migration n of m**. On the first start this can take a few minutes on a NAS. The page reloads itself and moves on by itself to the setup assistant, the sign-in or the load test page. All steps are in the [Administrator manual](https://help.ablago.app/admin/aktuell/en/aktualisieren/#nach-dem-start).

## The container doesn't start {#container-startet-nicht}

If the start fails, the page at the address gives the reason and the way out (without paths and versions) and stays for about 5 minutes. Then the container exits and Docker restarts it. The details are in the container's log (`docker compose logs dms` or "Log" in your NAS interface). The lines start with `[dms-komplett]`. The messages are in German:

| Message | What to do |
| --- | --- |
| `FEHLER: PostgreSQL (Benutzer 70) kann nicht in /data/postgres/daten schreiben. …` (PostgreSQL, user 70, cannot write to /data/postgres/daten) | The container couldn't fix the permissions itself, usually because of a network share (NFS with `root_squash`, SMB) or ACLs that override the normal permissions. Check the folder on the NAS with `ls -la` and `getfacl`. User 70 needs read, write and enter (`rwx`) on the folder and on `daten`. Easier: use a local folder on the NAS or a [named volume](#datenbank-auf-der-ssd). |
| `FEHLER: Die Datenbank in /data/postgres stammt von PostgreSQL …` (database from another PostgreSQL version) | The database comes from another major version. Switch via backup and restore, see [Growing and moving](https://help.ablago.app/admin/aktuell/en/wachsen/#neue-hauptversion-von-postgresql). |
| `FEHLER: /data/postgres/daten ist nicht leer, enthält aber keine Datenbank.` (not empty, but no database) | The `daten` folder contains something other than a database, e.g. leftovers from an aborted first start. If nothing has been set up yet, empty the folder and start again. |
| `FEHLER: Die Datenbank ließ sich nicht anlegen (siehe oben).` (database could not be created) | `initdb` failed. The lines above give the reason; usually the storage is full or the folder isn't writable. |
| `FEHLER: PostgreSQL ist beim Start beendet worden (siehe oben).` (PostgreSQL stopped during start) or `FEHLER: PostgreSQL wurde beendet` (PostgreSQL stopped) | The lines above give the reason. If the container was previously killed, PostgreSQL usually cleans up by itself on the next start – see `stop_grace_period` below. |
| `FEHLER: Ablago (Benutzer 1000, Gruppe 1000) kann nicht in /data/… schreiben, und die Rechte ließen sich nicht übernehmen …` (Ablago cannot write to a folder) | Ablago runs without administrator rights and could not take over a mounted folder, for example on a network share. Set `PUID`/`PGID` to the owner of the folders or give the folders to Ablago once on the NAS, see [Without administrator rights](https://help.ablago.app/admin/aktuell/aktualisieren/#ohne-root). |

**Don't leave out `stop_grace_period: 60s`.** When stopping, the container first shuts down Ablago and then PostgreSQL cleanly. Without this line Docker only waits 10 seconds and then kills the container. PostgreSQL then has to clean up on the next start, and in the worst case it doesn't start. The template contains the line; with `docker run` it is `--stop-timeout 60`. In a NAS interface without this setting, stop the container through the interface (not "Force") and wait until it is off.

## Rescue the database from the container {#datenbank-retten}

If the line `/data/postgres` is missing, the database is only stored inside the container. A restart does no harm. But once the container is recreated – `docker compose down`, an update or "Recreate" in your NAS interface – it is gone. This is how you rescue it first:

1. **Stop, don't remove:** `docker compose stop` (not `down`). The container and its data are kept.
2. **Copy it out:** `docker cp <container>:/data/postgres ./postgres` – `docker ps -a` shows the container's name, with the template usually `dms-dms-1`.
3. **Add the line:** in the Compose file under `volumes:`, add `- ./postgres:/data/postgres`.
4. **Start again:** `docker compose up -d`. The container takes over the copied folder and sets the permissions itself. The red message in the Workbench disappears.

Safer on top: create and download a backup under **Workbench → Backup** beforehand.

## Good to know {#gut-zu-wissen}

- **No password:** the database can only be reached inside the container. There is no database port to the outside.
- **Folders:** all four must be on the device (volumes), otherwise they are gone with the next update. The container sets the permissions of `postgres` itself on start, see [Database on the SSD](#datenbank-auf-der-ssd).
- **Stopping:** when stopping, the container first shuts down Ablago and then the database cleanly. Give it up to a minute for this (`stop_grace_period: 60s` or `--stop-timeout 60`) – don't leave the line out, otherwise Docker kills PostgreSQL after 10 seconds (see [The container doesn't start](#container-startet-nicht)). If one of the two parts ends unexpectedly, the whole container ends, and Docker restarts it.
- **Updates:** `docker compose pull && docker compose up -d`, or pull the image again and recreate the container. PostgreSQL updates come with the Ablago image; **Workbench → system health → Version and updates** shows whether there is one. With a version number instead of `main`, i.e. `ghcr.io/motom001/dms-komplett:<version>` with a number from the [releases](https://github.com/motom001/dms/releases), the installation stays on that release. With `main`, PostgreSQL is rebuilt weekly; with a fixed version only with the next release.
- **New major version of PostgreSQL:** if a future image brings a new major version (e.g. 18), the container deliberately does not start with the old database and says so in the log. The switch then works via backup and restore, see [Growing and moving](https://help.ablago.app/admin/aktuell/en/wachsen/#neue-hauptversion-von-postgresql).
- **Workbench → system health → Version and updates** shows "dms-komplett (with PostgreSQL in the container)" for the image and "in the container (dms-komplett)" as the location of the database.
- **Without administrator rights:** Ablago, the start page and the document tools do not run as root, the database runs as `postgres`. The `dms` role is not a superuser; only Ablago knows its password, which the container sets anew on every start. See [Without administrator rights](https://help.ablago.app/admin/aktuell/aktualisieren/#ohne-root).
- **Console:** for emergencies and operation, the container has the command `dms`, e.g. `docker compose exec dms dms hilfe`. See [Console](https://help.ablago.app/admin/aktuell/en/konsole/).
