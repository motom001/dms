# Without your own server: Ablago at a provider {#ohne-eigenen-server-ablago-bei-einem-anbieter}

!!! info "Tested: image automatically, device not yet"
    GitHub's machines test the image with every change on amd64 and arm64. There is no report from a particular provider yet. What that means is described under [Tested platforms](plattformen.md).

You have no NAS and no home server and don't want to run one either? Then you can run Ablago at a **provider**: you rent computing power and storage in a data centre, Ablago runs there, and you reach it in your browser from anywhere. Your paperwork is then no longer at your home but at this provider – which is why it pays to choose them carefully.

This page names **no providers**, but **criteria you check**. Providers and prices change quickly; a list would soon be out of date and look like advertising. With the checklist below you can assess any offer yourself.

!!! info "Ablago stays the same"
    Ablago at a provider is the same Ablago as on a NAS: the same image, the same backups, the same full export. Moving home – or to another provider – works at any time via **backup and restore**, see [Growing and moving](https://help.ablago.app/admin/aktuell/en/wachsen/).

## Three ways {#drei-wege}

| | **Ready-made app** | **Docker platform** | **Your own vServer** |
| --- | --- | --- | --- |
| **What you rent** | an app from the provider's catalogue, started with one click | container hosting: you name the image, the provider runs the server | a small virtual server on which you install Docker yourself |
| **Effort** | ☆ very low | ☆☆ low | ☆☆☆ medium: you handle Linux, updates and firewall yourself |
| **Cost** (order of magnitude) | a few euros a month | about €5 to €20 a month | about €4 to €15 a month |
| **For whom** | everyone who doesn't want to set anything up | those who know containers but don't want to maintain a server | those who want to decide for themselves and are comfortable with the command line |
| **Guide** | the provider's | [dms-komplett](komplett.md) or [Docker Compose](docker.md) | [Docker Compose](docker.md) |

Costs roughly, as of November 2026, each with about 2 GB of memory and 20–40 GB of storage; more storage for many documents usually costs a few euros a month extra.

### Ready-made app {#fertige-app}

Some providers have a catalogue of ready-made open-source apps: pick one, choose a plan, start – the provider takes care of updates, backups and HTTPS.

- **Whether Ablago is there** you can see in the provider's app catalogue. So far, the Ablago project does not offer Ablago to any provider itself; if there is no ready-made app, take one of the other two ways.
- **Make sure** that you can get to the folders `sicherung` and `geheim` (file access, SFTP or similar). Without that, all you have is the [full export](https://help.ablago.app/admin/aktuell/en/export/), which Ablago offers as a ZIP to download – good for taking your data with you, but not for restoring into another Ablago.

### Docker platform {#docker-plattform}

Container platforms run the server for you; you only specify which image should run and get an address with HTTPS.

- **Simplest way:** one container with [`ghcr.io/motom001/dms-komplett`](komplett.md) – Ablago and the database together, without a password. Many platforms allow only one container or make a second one awkward; `dms-komplett` is meant for exactly that.
- **With two containers** (`dms` and `postgres:17`) if the platform supports Compose projects or several services: as under [Docker Compose](docker.md).
- **Persistent storage is a must:** the folders `/data/files`, `/data/geheim`, `/data/sicherung` and `/data/postgres` must be on volumes that survive a restart and an update. Otherwise your data is gone with the next update.
- **Port:** Ablago listens on `3000` in the container.

### Your own vServer {#eigener-vserver}

A small virtual server with Linux is like a PC in a data centre: you install Docker and set up Ablago with Docker Compose – exactly as under [Any server with Docker](docker.md) or [PC or mini PC with Linux](linux.md).

- **Size:** 2 GB of memory (Ablago needs about 1 GB) and as much storage as your documents and backups need. amd64 and arm64 both work.
- **You are responsible** for operating system updates, a firewall (only ports 80 and 443 open, plus SSH, ideally with a key only) and HTTPS via a [reverse proxy](https://help.ablago.app/admin/aktuell/en/installation/#hinter-einem-reverse-proxy).
- **Never expose the database port:** the templates give PostgreSQL no port to the outside – leave it that way.

## Criteria to check {#merkmale-zum-prufen}

Tick these off before you decide:

**Location and law**

- [ ] **Data centre in Germany or the EU** – you can choose the location when ordering, or it is fixed.
- [ ] **Registered office in the EU** – then the GDPR applies directly, and access by authorities outside the EU is less of an issue.
- [ ] **Data processing agreement (DPA)** under Art. 28 GDPR is offered, ideally to conclude in your customer account. Not needed for a purely private household – **mandatory** for **landlords, the self-employed and businesses** that file data of tenants or customers.

**Trust**

- [ ] **On the market for years**, with a complete **legal notice** and reachable **support** (email or phone, answers in reasonable time – try it with a question before ordering).
- [ ] **Reviews** on portals (e.g. hosttest, Trustpilot) are mostly good and describe how the provider deals with problems. **Few reviews say little**, as do nothing but gushing ones.

**Technology**

- [ ] **Docker possible** – a matter of course with a vServer; ask with platforms and ready-made apps.
- [ ] **Persistent storage** for data and database (volumes), large enough for your documents plus backups, and expandable later.
- [ ] **Backups at the provider** (snapshots or backups), in addition to Ablago's backups.
- [ ] **HTTPS** with its own certificate, built in with platforms and apps.

**Leaving**

- [ ] **Cancellable monthly**, without a long minimum term.
- [ ] **Data exportable at any time:** you can get to Ablago's folders – above all the [backups](https://help.ablago.app/admin/aktuell/en/sicherung/) in the `sicherung` folder –, and the [full export](https://help.ablago.app/admin/aktuell/en/export/) can be downloaded as a ZIP.

## You entrust your data to the provider {#du-vertraust-dem-anbieter-deine-daten-an}

Hosting at a provider means putting your paperwork in their hands – as with a tax adviser or cloud storage. That is a **relationship of trust**, not a technical guarantee:

- **Documents and the database are stored on the provider's storage** – just as on your NAS, not additionally encrypted. Anyone with access to the server can technically read them. That's why the provider's location, legal framework and reputation matter.
- **Encrypted** are the [secrets in Ablago](https://help.ablago.app/admin/aktuell/en/verschluesselung/) – password fields, credentials for the mail server and mailboxes – and the backups. The key, however, is in the `geheim` folder on the same server. That doesn't protect you against a provider who is determined to read your data; it protects backups and database copies that end up elsewhere.
- **Your own off-site backups:** copy the `sicherung` folder to another place regularly – with a vServer e.g. using `rsync` or `scp`, with platforms and apps via their file access –, and keep the [emergency sheet](https://help.ablago.app/admin/aktuell/en/verschluesselung/#notfallblatt) separately. A **full export** now and then gives you everything in open formats – also in case the provider ever disappears.
- **Two-factor sign-in:** your Ablago can be reached from the internet. Require [two-factor sign-in](https://help.ablago.app/admin/aktuell/en/anmeldeschutz/#zwei-faktor-anmeldung) at least for administrators; [sign-in protection](https://help.ablago.app/admin/aktuell/en/anmeldeschutz/) blocks guessing attempts.
- **HTTPS only:** never open Ablago via `http://` from the internet. Enter the `https://` address under [Email and address](https://help.ablago.app/admin/aktuell/en/installation/#e-mail-und-adresse).
- **Set up right away:** at a provider, Ablago can usually be reached from the internet immediately. The [setup code](https://help.ablago.app/admin/aktuell/en/installation/#einrichtungscode) prevents a stranger from setting it up before you – still, set it up directly after starting.
- **Keep it up to date:** install Ablago updates promptly ([Updating](https://help.ablago.app/admin/aktuell/en/aktualisieren/)); with a vServer, those of the operating system too.

What else Ablago brings for data protection and what you as the controller handle yourself is described under [Data protection in Ablago](https://help.ablago.app/admin/aktuell/en/datenschutz/).

## After the installation {#nach-der-installation}

As with any other way: set up, switch on backup, get going – see [After the installation](index.md#nach-der-installation).
