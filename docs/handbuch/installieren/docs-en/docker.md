# Any server with Docker {#jeder-server-mit-docker}

!!! info "Tested: image automatically, device not yet"
    GitHub's machines test the image with every change on amd64 and arm64. There is no report from a particular device here yet. What that means is described under [Tested platforms](plattformen.md).

This page applies to every device without its own guide; there are separate pages for a [PC with Linux](linux.md), the [Raspberry Pi](raspberry-pi.md), [Windows](windows.md) and [Proxmox and co.](proxmox.md). Ablago needs **Docker with Docker Compose**. The images are public (amd64 and arm64); signing in to the registry is not necessary.

**Two containers** (Ablago and PostgreSQL) are recommended; the comparison is under [One or two containers?](index.md#ein-oder-zwei-container). If you only want to try it out or can only run one container, take [dms-komplett](komplett.md).

## With the command line {#mit-der-kommandozeile}

```sh
mkdir -p ~/dms && cd ~/dms
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/motom001/dms/main/deploy/nas/docker-compose.yml
echo "DB_PASSWORD=$(openssl rand -hex 24)" > .env
# Adjust the paths under /volume1/docker/dms in docker-compose.yml to your server, e.g. ./daten
docker compose up -d
docker compose logs app | grep -A1 Einrichtungscode
```

Then open `http://<server>:8080`. The wizard asks for the setup code from the log and for the database: server `db`, port `5432`, database and user `dms`, password from `.env`.

--8<-- "assistent-weiter.md"

## With a Docker interface (Portainer, Dockge, Komodo …) {#mit-einer-docker-oberflache-portainer-dockge-komodo}

Take the template [`deploy/synology/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/synology/docker-compose.yml) as a new stack, enter the password at the top and adjust the paths. This template doesn't need a `.env`, and the wizard doesn't ask for the database.

## Good to know {#gut-zu-wissen}

- **Folders:** `files`, `geheim`, `sicherung` and `postgres` must be on the server (volumes). Otherwise they are gone with the next update. More under [Folders and volumes](https://help.ablago.app/admin/aktuell/en/installation/#ordner-und-volumes).
- **Updates:** `docker compose pull && docker compose up -d` – this fetches Ablago and PostgreSQL (`postgres:18`) anew. With a version number instead of `main`, i.e. `ghcr.io/motom001/dms:<version>` with a number from the [releases](https://github.com/motom001/dms/releases), the installation stays on that release. See [Updating](https://help.ablago.app/admin/aktuell/en/aktualisieren/).
- **Database service with another name:** the templates without `DATABASE_URL` expect the database at `db:5432`. If your service is called something else or runs on another port, set `DMS_DB_HOST` and `DMS_DB_PORT`.
- **Console:** for emergencies and operation, the container has the command `dms`, e.g. `docker compose exec app dms hilfe`. See [Console](https://help.ablago.app/admin/aktuell/en/konsole/).
- **Reachable from outside** only after the setup, ideally with HTTPS via a reverse proxy: [Behind a reverse proxy](https://help.ablago.app/admin/aktuell/en/installation/#hinter-einem-reverse-proxy).
