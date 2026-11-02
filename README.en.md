# DMS

[Deutsch](README.md) · **English**

<!-- Badges (#252): line 1 status, line 2 security, line 3 openness. -->
[![Release](https://img.shields.io/github/v/release/motom001/dms?label=Release&sort=semver)](https://github.com/motom001/dms/releases/latest)
[![Checks](https://img.shields.io/github/actions/workflow/status/motom001/dms/image.yml?branch=main&label=Checks)](https://github.com/motom001/dms/actions/workflows/image.yml)
[![Manual](https://img.shields.io/github/actions/workflow/status/motom001/dms/handbuch.yml?branch=main&label=Manual)](https://motom001.github.io/dms/)<br>
[![CodeQL](https://github.com/motom001/dms/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/motom001/dms/security/code-scanning?query=tool%3ACodeQL)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/motom001/dms/badge)](https://scorecard.dev/viewer/?uri=github.com/motom001/dms)
[![Security](https://img.shields.io/badge/Security-SECURITY.en.md-2ea44f)](SECURITY.en.md)<br>
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](LICENSE)
[![Support](https://img.shields.io/badge/Support-GitHub_Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/motom001)

**Your household's paperwork in one place – self-hosted, free of charge, your data stays with you.**

Instead of loose files in folders, you create **folders with structure** ("Mappen"): for the contract, the invoice, the heating system, the tradesperson. Mappen link to each other. From the heating system you find the maintenance contract, from there every invoice and the tradesperson who issued it. And the DMS reminds you of the notice period in good time.

> The DMS itself, its user interface and its manuals are in **German**. An English user interface is planned (#357). Issues and pull requests are welcome in German or English – see [CONTRIBUTING.en.md](CONTRIBUTING.en.md).

<!-- Screenshot from the manual workflow (#290): retaken with every release, sample data only. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://motom001.github.io/dms/benutzer/aktuell/bilder/readme-dunkel.png">
  <img alt="The DMS filing view: views on the left, the list in the middle, an open Mappe with its details and documents on the right" src="https://motom001.github.io/dms/benutzer/aktuell/bilder/readme.png">
</picture>

## Who is it for?

<img alt="Who the DMS is built for: from the household to the enterprise" src="docs/handbuch/benutzer/docs/grafiken/personas-skala.svg" width="100%">

The DMS is built for **families and households**. It fits particularly well if you **look after your parents** or **rent out a few flats**. **Self-employed people and small businesses** can use it well too; it is deliberately not made for larger companies.

Whether it suits you is shown in [Is the DMS right for me?](https://motom001.github.io/dms/benutzer/aktuell/wofuer/#ist-das-dms-etwas-fur-mich) – with the [5-minute test](https://motom001.github.io/dms/benutzer/aktuell/wofuer/#der-5-minuten-test) (German).

## What you get

- **Find things fast:** Search finds words even in scanned paper documents.
- **Never miss a deadline:** Notice periods, warranties and your own reminders show up under "To do" in good time.
- **File incoming mail quickly:** Upload, take a photo with your phone, from an e-mail mailbox or from the scanner via an inbox folder.
- **Together with your family:** Everyone has their own account and sees what they are meant to see.
- **Safely kept:** Encrypted backups, an emergency sheet to print and a test restore that shows the backup actually works.
- **Your data belongs to you:** Everything can be exported at any time in open formats and is readable without the DMS.

## Privacy built in

The DMS is designed for data protection (Art. 25 GDPR) – for your family's data just as for tenants and customers:

- **No telemetry:** The DMS sends no usage data, not even anonymous data and not periodically. It never connects to the internet on its own; you start the version check against GitHub yourself at the push of a button.
- **Self-hosted:** Your documents live on your device – no tracking, no advertising, no AI services. Who sees what is controlled by permissions per Mappe type.
- **Access request under Art. 15:** Everything about a tenant, customer or contact as a ZIP with a cover sheet – reviewed, redacted, with a record.
- **Retain, lock, delete:** Archive mode with deletion lock until the retention period ends, the list "May go" and a recycle bin – building blocks for your deletion concept, with a template.
- **Take your data with you:** Every user exports their own data, administrators everything – in open formats.

Software alone does not make data protection – your processes are part of it. What the DMS offers and what you handle yourself: **[Data protection in the DMS](https://motom001.github.io/dms/admin/aktuell/datenschutz/)** (German).

## How to get a DMS

| You have … | This is how |
| --- | --- |
| a home server with **umbrelOS, ZimaOS or CasaOS** | from the [DMS App Store](https://github.com/motom001/dms-appstore) with one click: [umbrelOS](https://motom001.github.io/dms/installieren/aktuell/umbrel/), [ZimaOS](https://motom001.github.io/dms/installieren/aktuell/zimaos/), [CasaOS](https://motom001.github.io/dms/installieren/aktuell/casaos/) |
| a **NAS** from Synology, UGREEN, QNAP, TrueNAS or Unraid | paste a ready-made template into the Docker interface: [guides](https://motom001.github.io/dms/installieren/aktuell/) |
| a **PC, Raspberry Pi or server with Docker** | [Docker Compose](https://motom001.github.io/dms/installieren/aktuell/docker/) or, to try it out, [a single container](https://motom001.github.io/dms/installieren/aktuell/komplett/) |
| **no server of your own** | [Without your own server: the DMS at a provider](https://motom001.github.io/dms/installieren/aktuell/anbieter/) – three ways and a checklist of what to look for in a provider |

All ways at a glance: **[How do I get a DMS?](https://motom001.github.io/dms/installieren/aktuell/)** (German)

## What the DMS is not

- **Not a cloud service.** It runs at your home – or, if you like, at a provider you choose yourself. The project runs no service that sees your documents.
- **No licence fees**, no subscription. Anyone who wants to can support it voluntarily.
- **Not a "GoBD-certified" archive.** For self-employed people there is an archive mode and a template for the procedural documentation (German "Verfahrensdokumentation") – tools, not a certificate.
- **Not built for large companies.**

## For tinkerers and administrators

- **Design Mappe types yourself:** fields, links, tabs, title templates and result lists – in the workbench ("Werkbank"), without programming. Ready-made **packages** from the [package catalogue](https://github.com/motom001/dms-registry).
- **Incoming mail** from mailboxes (IMAP) and an inbox folder, **versioning** of documents, **advanced search** across fields and full text.
- **Permissions** per Mappe type and view with rules and a test run; **two-factor sign-in** and **sign-in via a provider** (OpenID Connect).
- **Archive mode** with deletion lock until the retention period ends, **customisable workbench** with the presets Household, Organisation and Everything.
- **Console** `dms` in the container for emergencies and operations, **API** `/api/v1` with API keys.
- One image for **amd64 and arm64**, public at `ghcr.io/motom001/dms`.

## Manuals

All manuals are in German.

- **[What is a DMS for?](https://motom001.github.io/dms/benutzer/aktuell/wofuer/)** – when it helps in everyday life, with a self-check.
- **[How do I get a DMS?](https://motom001.github.io/dms/installieren/aktuell/)** – installing on a home server, NAS or any computer with Docker.
- **[User manual](https://motom001.github.io/dms/benutzer/aktuell/)** – working in the filing view: Mappen, documents, search, tasks, profile.
- **[Administrator manual](https://motom001.github.io/dms/admin/aktuell/)** – setup and operation, updating and backing up, workbench, troubleshooting, API.
- **[Developer manual](https://motom001.github.io/dms/entwickler/aktuell/)** – contributing: way of working, architecture, packages and release.

Inside the DMS, **Hilfe** (help) in the menu under your own name leads there. What was added in which version is listed in the **[releases](https://github.com/motom001/dms/releases)**.

## Quick start with Docker Compose

The image `ghcr.io/motom001/dms` is public – you do not need to sign in to the registry.

1. Create the template [`deploy/nas/docker-compose.yml`](deploy/nas/docker-compose.yml) as a Compose project and adjust the paths (folders `postgres`, `files`, `geheim` and `sicherung`).
2. Next to it, put a file `.env` with `DB_PASSWORD=<long random password>`.
3. Start it and open `http://<NAS>:8080`. A wizard guides you through the setup: setup code (shown in the container log and in `geheim/EINRICHTUNGSCODE`), database, then **set up new** or **restore from a backup**, name of the household, administrator, first user, key and emergency sheet.

`ghcr.io/motom001/dms:main` follows every state of `main`; with a version number, i.e. `ghcr.io/motom001/dms:<version>` with a number from the [releases](https://github.com/motom001/dms/releases), the installation stays on a release. Everything else is in the administrator manual under [Setup and operation](https://motom001.github.io/dms/admin/aktuell/installation/) and [Updating and backing up](https://motom001.github.io/dms/admin/aktuell/aktualisieren/) (German).

## Security and openness

The DMS manages personal documents – which is why everything can be checked openly: the source code, how it is built and what is checked along the way. Automatically checked are our code (CodeQL), the libraries (Dependabot, `npm audit`), the finished images (Trivy) and secrets committed by accident (secret scanning with push protection). Every image carries a signed **provenance attestation** and a **bill of materials** (SBOM); how to verify them and how to **report a vulnerability confidentially** is described in [SECURITY.en.md](SECURITY.en.md). The [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/motom001/dms) regularly and publicly rates how the project handles security.

## Requests and bugs

As an [issue](https://github.com/motom001/dms/issues/new/choose) in the form of a user story with acceptance criteria – in German or English. What gets implemented is what the maintainer labels `freigegeben` (approved). What comes next and in which order is in the [roadmap](ROADMAP.md) (German). How contributing works is described in [CONTRIBUTING.en.md](CONTRIBUTING.en.md) and in the [developer manual](https://motom001.github.io/dms/entwickler/aktuell/) (German).

## Join in

You use the DMS? **[Tell us how](https://github.com/motom001/dms/issues/new?template=ich-nutze-das-dms.yml)** – voluntarily, with a short form, all fields optional. What others have told is listed under **[Who uses the DMS?](https://github.com/motom001/dms/issues?q=label%3Anutzt-das-dms)**. The DMS itself reports nothing: no telemetry, not even anonymous.

## Development

Requirements: Node.js 24 (LTS), Docker.

```sh
npm install
docker compose up db            # only the database
DATABASE_URL=postgres://dms:dms@localhost:5432/dms npm run dev -w server
npm run dev -w web              # user interface at http://localhost:5173
```

Tests: `npm test`. Architecture, tests against PostgreSQL, packages and the way to a release are described in the [developer manual](https://motom001.github.io/dms/entwickler/aktuell/) (German).

**New version:** Increase the version number in the three `package.json` files and write `docs/releases/v<version>.md` – release, image, manual and the screenshot above are created automatically after the merge. While doing so, briefly check whether "What you get", "For tinkerers and administrators" and the quick start are still correct – in both language versions of this README; everything detailed belongs in the manual, not here.

Important: **Do not commit real documents or personal data** – only code and sample data.

## Support

The DMS is and remains free to use. If you would like to support development voluntarily, you can do so via [GitHub Sponsors](https://github.com/sponsors/motom001) – once or monthly, with an amount of your choice. Donations from personal GitHub accounts arrive without deductions. In the application, the note appears only in the workbench, not in the filing view.

### How the project is funded

Development costs time and money – for test devices, servers and tools. Part of that is meant to come back through voluntary support, without the software ever costing anything or setting conditions:

- **Donations** via GitHub Sponsors are the preferred way: voluntary, open and without anything in return.
- **Test devices** I gladly accept, for example from manufacturers of NAS and mini servers. Whoever provides a device gets my honest opinion – including critical opinion – and does not buy a recommendation with it.
- **Recommendations** I only make for devices I use or have tested myself, and I give reasons. Should I ever use affiliate links, they are labelled as such right at the link, do not change the price and have no influence on my assessment. The application itself contains no advertising and no affiliate links.

## License

[Apache License 2.0](LICENSE) (Apache-2.0), notices in [NOTICE](NOTICE). Versions up to and including 0.92.0 are licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

Anyone may use, modify and redistribute the DMS, including in their own products. Whoever redistributes it includes the license and the notices from NOTICE and marks modified files. Publishing the source code of a modified version is not required.
