# Synology NAS (Container Manager)

!!! info "Tested: template automatically, device not yet"
    The template on this page is started as a trial on GitHub's machines with every change (Linux with Docker, amd64). There is no report from a real device yet. What that means is described under [Tested platforms](plattformen.md).

This is how you set up Ablago on a Synology NAS with DSM 7.2 or newer, entirely without the command line. You need a model with **Container Manager**, which means most Plus models with an Intel or AMD processor. The Package Center shows whether your model is one of them: if Container Manager is there, it fits.

--8<-- "ausgeblendet-schritt.md"

!!! note "Alternative: one container"
    The project with two containers below is recommended. For a quick try, **one container** from the image `ghcr.io/motom001/dms-komplett:stabil` also works – without a project and password, see [One container: dms-komplett](komplett.md#in-der-oberflache-eines-nas) and [One or two containers?](index.md#ein-oder-zwei-container).

## 1. Install Container Manager {#1-container-manager-installieren}

Open the **Package Center**, search for *Container Manager* and choose **Install**. This creates the shared folder `docker`.

## 2. Create folders {#2-ordner-anlegen}

In **File Station**, create a folder `dms` in the folder `docker`. Inside it, four folders:

```
docker/dms/postgres
docker/dms/files
docker/dms/geheim
docker/dms/sicherung
```

!!! tip "Backups on another disk"
    If your NAS has several storage pools, it is better to put `sicherung` on another one. Then later change only this one line in the template, e.g. to `/volume2/sicherung/dms`.

!!! tip "Intake folder for the scanner"
    Also create a fifth folder `eingang` next to them. The template mounts it, and some NAS abort on start if a mounted folder is missing. It becomes the [Intake folder](https://help.ablago.app/admin/aktuell/en/eingangsordner/): every file your scanner or the NAS puts there becomes new post. Share it on the NAS for the scanner. If you don't need a scanner, it simply stays empty.

## 3. Create the project {#3-projekt-anlegen}

1. **Container Manager → Project → Create**.
2. **Project name:** `dms`. **Path:** choose the folder `docker/dms`.
3. **Source:** *Create docker-compose.yml*.
4. Paste the content of the template [`deploy/synology/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/synology/docker-compose.yml). On GitHub you copy it with the button *Copy raw file* at the top right.
5. **Enter the password at the very top:** in the line `x-passwort:`, replace `HIER-EIN-LANGES-PASSWORT-EINTRAGEN` with a long password made of letters and numbers. You don't need to remember it; it stays in this file.
6. If your Docker folder is not on `volume1`, adjust the paths `/volume1/docker/dms/…`.
7. **Next** and **Done**. You can skip the note about *Web Station*. The NAS downloads the images and starts both containers.

!!! warning "Change the password before the first start"
    The database takes over the password only on the very first start. If you change it later in the template, it no longer matches the database.

## 4. Set up {#4-einrichten}

1. Open `http://<NAS>:8080` in your browser, e.g. `http://192.168.1.20:8080`.
2. The wizard asks for the **setup code**. It is shown under **Container Manager → Container → `dms-app-1` → Log** (a conspicuous line *Einrichtungscode für Ablago*, the setup code). It is also in the file `docker/dms/geheim/EINRICHTUNGSCODE`, which you can open in File Station.
3. The wizard does not ask for the database; it is already connected.

--8<-- "assistent-weiter.md"

## Updates

**Container Manager → Project → `dms` → Action → Build**. This downloads the latest image and restarts Ablago. The data stays in the folders. What has changed is shown under **Workbench → system health → Version and updates**. Beforehand you can switch on maintenance mode, see [Updating](https://help.ablago.app/admin/aktuell/en/aktualisieren/).

## Off-site backup {#sicherung-auer-haus}

Ablago backs itself up into the `sicherung` folder (**Workbench → Backup**). With **Hyper Backup** you additionally copy this folder to a USB disk, a second NAS or cloud storage. The backups are encrypted, so cloud storage only sees unreadable files. Exports are not included: a [full export](https://help.ablago.app/admin/aktuell/en/export/) is unencrypted and is therefore kept in its own [export folder](https://help.ablago.app/admin/aktuell/en/export/#export-ordner), never with the backups.

## Reachable on the go {#von-unterwegs-erreichbar}

Only **after** the setup: in DSM under **Control Panel → Login Portal → Advanced → Reverse Proxy**, create an entry from `https://dms.<your-domain>` to `http://localhost:8080`. You get a certificate under **Security → Certificate**. Then, in Ablago under **Workbench → email and address**, enter the public address.

DSM's reverse proxy runs on the NAS itself and reaches Ablago via the gateway of the Docker network. Ablago doesn't believe it by itself; the Workbench then reports "Ablago can't tell the home network from the internet" and names the address. Enter it in the template under `environment`, e.g. `TRUST_PROXY: "172.18.0.1"`, and rebuild the project. Signing in works before that too; only afterwards, though, does Ablago see the devices' real addresses, for example for sign-in protection. Background: [Behind a reverse proxy](https://help.ablago.app/admin/aktuell/en/installation/#hinter-einem-reverse-proxy).

!!! info "Pictures to follow"
    This guide has no screenshots yet. The menu items correspond to DSM 7.2. If something looks different for you, feel free to write it in an [issue](https://github.com/motom001/dms/issues).
