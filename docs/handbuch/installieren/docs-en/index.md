# How do I get a DMS? {#wie-komme-ich-an-ein-dms}

[Latest version and changes](https://github.com/motom001/dms/releases) · Images for amd64 and arm64 · [Licence Apache-2.0](https://github.com/motom001/dms/blob/main/LICENSE) · [Source code on GitHub](https://github.com/motom001/dms)

Ablago runs at your home: on a NAS, a small home server or any computer with Docker. Your paperwork stays with you. Without a device of your own, it also works [at a provider](anbieter.md). Which way is right depends on what you already have.

## What do you have? {#was-hast-du}

| Device or system | Way | Effort |
| --- | --- | --- |
| **umbrelOS** | [App store with one click](umbrel.md) | ☆ very low: add the store, install, done |
| **ZimaOS** | [App store with one click](zimaos.md) | ☆ very low: as with umbrelOS |
| **CasaOS** | [App store with one click](casaos.md) | ☆ very low: as with umbrelOS |
| **Synology NAS** | [Container Manager](synology.md) | ☆☆ low: create folders, paste the template, enter a password |
| **UGREEN NAS** (UGOS Pro) | [Docker → Project](ugreen.md) | ☆☆ low: as with Synology |
| **QNAP NAS** | [Container Station](qnap.md) | ☆☆ low: as with Synology |
| **TrueNAS** | [Apps → Custom App](truenas.md) | ☆☆ low: create a dataset, paste the template |
| **Unraid** | [Compose Manager](unraid.md) | ☆☆ low: install the plugin, paste the template |
| **PC or mini PC** (Intel, AMD) | [Linux with Docker](linux.md) | ☆☆☆ medium: install Linux, a few commands |
| **Raspberry Pi** 4 or 5 | [Step by step for beginners](raspberry-pi.md): Raspberry Pi OS, Docker, Ablago with one command | ☆☆ low to ☆☆☆ medium: every click explained, a few commands to copy |
| **Windows PC or Windows Server** | [Docker Desktop or Hyper-V](windows.md) | ☆☆☆ medium: install Docker Desktop or create a Linux VM |
| **Proxmox**, XCP-ng, ESXi … | [Linux VM with Docker](proxmox.md) | ☆☆☆ medium: create a VM, then as with a PC |
| **Alternative: one container** (trying it out, only one container possible) | [dms-komplett](komplett.md) | ☆☆ low: one image, four folders, no password – see [One or two containers?](#ein-oder-zwei-container) |
| **another server with Docker** | [Docker Compose](docker.md) | ☆☆☆ medium: command line or your own Docker interface |
| **no device of your own** | [at a provider](anbieter.md): ready-made app, Docker platform or your own vServer | ☆ to ☆☆☆ depending on the way – with a checklist of what to look for in a provider |

Every way needs a device with **amd64** (Intel, AMD) or **arm64** (e.g. Raspberry Pi 4/5) and about 1 GB of free memory. On top of that comes space for your documents. Which devices the Ablago project tests itself, and what others have reported, is listed under [Tested platforms](plattformen.md).

!!! tip "You don't have any of these yet?"
    The easiest is a small home server with **umbrelOS** or **ZimaOS**, e.g. a mini PC or a ZimaBoard. There you install Ablago like an app on your phone. A NAS from Synology, UGREEN or QNAP works just as well and also looks after your hard disks. If you don't want to run a device at all, Ablago also runs [at a provider](anbieter.md) – what to look out for is described there.

## One or two containers? {#ein-oder-zwei-container}

Ablago comes in two variants. **We recommend two containers** – that is also how all guides and app stores here work.

| | **Two containers** (recommended): `dms` + `postgres:17` | **One container**: `dms-komplett` |
| --- | --- | --- |
| Setup | Compose project or app store, one password for the database | one image, four folders, no password |
| PostgreSQL updates | immediately, independent of Ablago: pull `postgres:17` again | with the next release (`:stabil` or a fixed version); `:main` is rebuilt weekly for testing |
| Operation | restart, monitor and back up Ablago and the database separately with standard tools | everything together; database not reachable from outside (intended) |
| New major version of PostgreSQL | plannable, at your own pace | only via backup and restore |
| App stores (umbrelOS, ZimaOS, CasaOS) | yes | no |
| Good for | long-term operation | trying out and testing, interfaces that can only "create container from image", providers that allow only one container |

**Why two containers?** One service per container is the usual Docker way. The database comes from the official PostgreSQL image and gets security updates as soon as they exist – regardless of when Ablago has a new release. If one of the two fails, it can be restarted and examined on its own. The price is a password and a Compose project; the templates here keep both as small as possible.

**When one container?** When it needs to be quick (trying out, testing) or the environment allows only one container. You can switch between the two variants at any time via backup and restore, see [Growing and moving](https://help.ablago.app/admin/aktuell/en/wachsen/).

## What you get in every case {#was-du-in-jedem-fall-bekommst}

- Ablago and a PostgreSQL database – in two containers or, with [dms-komplett](komplett.md), in one.
- Four folders on your device: `files` (documents), `geheim` (keys), `sicherung` (backups) and `postgres` (database).
- The interface in your browser, usually at `http://<device>:8080`. With the app stores it is port `8478`.

## After the installation {#nach-der-installation}

Open the address right after starting. If Ablago is still getting ready (on the first start it sets up the database), you briefly see the page **"Ablago is starting …"** with the current step. It reloads by itself and then leads you to the setup wizard. You don't have to do anything. More on this under [What you see after starting](https://help.ablago.app/admin/aktuell/en/aktualisieren/#nach-dem-start).

![The page "Ablago is starting …" with the current step and a progress bar](grafiken/ablago-startet.en.svg){ .grafik }

1. **Set up.** On the first visit, a wizard guides you through the setup: depending on the way, setup code and database, then **Set up new** or **Restore from a backup**, the name of your Library, your account, key and emergency sheet. The [Administrator manual](https://help.ablago.app/admin/aktuell/en/installation/#der-einrichtungsassistent) describes the steps in detail.
2. **Back up.** Under **Workbench → Backup**, switch on the schedule, and under **Workbench → Encryption** print the emergency sheet. Copy the backups to another place now and then, e.g. to a USB stick or to cloud storage. Otherwise, if the device fails, the backups are gone too. The backups are encrypted, so cloud storage only sees unreadable files. Exports are not included: a [full export](https://help.ablago.app/admin/aktuell/en/export/) is unencrypted and is therefore kept in its own [export folder](https://help.ablago.app/admin/aktuell/en/export/#export-ordner), never with the backups. More under [Backup](https://help.ablago.app/admin/aktuell/en/sicherung/).
3. **Get going.** How to work with folders, documents and tasks is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/).

!!! warning "Set up first, then make it reachable from outside"
    Only open Ablago to the outside through port forwarding, a tunnel or a reverse proxy once the setup is complete. How that works with HTTPS is described under [Behind a reverse proxy](https://help.ablago.app/admin/aktuell/en/installation/#hinter-einem-reverse-proxy).

## An example {#ein-beispiel}

How Ablago runs at the developer's home every day – device, access on the go, storage and backup, each with the reason why – is described under [How the developer runs it](beispiel.md).

## Help {#hilfe}

Stuck with the installation? Write an [issue on GitHub](https://github.com/motom001/dms/issues) and name your device, its system and the message you see.
