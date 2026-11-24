# Ablago

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/marke/ablago-logo-mit-schriftzug-dunkel.svg">
  <img src="docs/marke/ablago-logo-mit-schriftzug.svg" alt="Ablago" width="240">
</picture>

*Ablago – document filing for home and small businesses*

[Deutsch](README.md) · **English**

<!-- Badges (#252): line 1 status, line 2 security, line 3 openness. -->
[![Release](https://img.shields.io/github/v/release/motom001/dms?label=Release&sort=semver)](https://github.com/motom001/dms/releases/latest)
[![Checks](https://img.shields.io/github/actions/workflow/status/motom001/dms/image.yml?branch=main&label=Checks)](https://github.com/motom001/dms/actions/workflows/image.yml)
[![Manual](https://img.shields.io/github/actions/workflow/status/motom001/dms/handbuch.yml?branch=main&label=Manual)](https://help.ablago.app/)<br>
[![CodeQL](https://github.com/motom001/dms/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/motom001/dms/security/code-scanning?query=tool%3ACodeQL)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/motom001/dms/badge)](https://scorecard.dev/viewer/?uri=github.com/motom001/dms)
[![Security](https://img.shields.io/badge/Security-SECURITY.en.md-2ea44f)](SECURITY.en.md)<br>
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](LICENSE)
[![Support](https://img.shields.io/badge/Support-GitHub_Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/motom001)

**Your paperwork in one place, at home and in a small business – self-hosted, free of charge, your data stays with you.**

Instead of loose files in folders, you create **folders with structure** ("Mappen"): for the contract, the invoice, the heating system, the tradesperson. Mappen link to each other. From the heating system you find the maintenance contract, from there every invoice and the tradesperson who issued it. And Ablago reminds you of the notice period in good time.

> Ablago's user interface and its manuals are available in **German** and **English**; each person picks their language under My account. Issues and pull requests are welcome in German or English – see [CONTRIBUTING.en.md](CONTRIBUTING.en.md).

<!-- Screenshot from the manual workflow (#290): retaken with every release, sample data only. The user interface
     exists in German only, so the screenshot is German and marked as such (#574); readme.en.png follows with #357. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://help.ablago.app/benutzer/aktuell/bilder/readme-dunkel.png">
  <img alt="Ablago filing view with its German user interface: views on the left, the list in the middle, an open Mappe with its details and documents on the right" src="https://help.ablago.app/benutzer/aktuell/bilder/readme.png">
</picture>

*Screenshot of the German user interface (German only) – the interface itself is also available in English.*

## Who is it for?

<img alt="Who we build Ablago for, on a scale from private to business: core focus on beginner families, family members and household admins; focus on looking after parents, landlords, the self-employed and small businesses; supported for mid-sized companies; not in focus for large enterprises" src="docs/handbuch/benutzer/docs/grafiken/personas-skala.en.svg" width="100%">

Ablago is built for **families** and for **self-employed people and small businesses**. It also fits well if you **look after your parents** or **rent out a few flats**. We **support** mid-sized companies; Ablago is not made for **large enterprises**. Why the self-employed and small businesses joined the focus in November 2026: many features already help exactly them (archive mode, procedure documentation, rights per role, mailboxes, deputies, sign-in via a provider, automations), and the load tests show that Ablago copes with much larger installations ([what Ablago can handle](https://help.ablago.app/admin/aktuell/en/verkraftet/)). When in doubt, simplicity for families still wins.

Whether it suits you is shown in [Is Ablago right for me?](https://help.ablago.app/benutzer/aktuell/en/wofuer/#ist-das-dms-etwas-fur-mich) – with the [5-minute test](https://help.ablago.app/benutzer/aktuell/en/wofuer/#der-5-minuten-test).

## What you get

- **Find things fast:** Search finds words even in scanned paper documents.
- **Never miss a deadline:** Notice periods, warranties and your own reminders show up under "To do" in good time.
- **File incoming mail quickly:** Upload, take a photo with your phone, from an e-mail mailbox or from the scanner via an inbox folder.
- **Together with your family:** Everyone has their own account and sees what they are meant to see.
- **Safely kept:** Encrypted backups, an emergency sheet to print and a test restore that shows the backup actually works.
- **Your data belongs to you:** Everything can be exported at any time in open formats and is readable without Ablago.

## Privacy built in

Ablago is designed for data protection (Art. 25 GDPR) – for your family's data just as for tenants and customers:

- **No telemetry:** Ablago sends no usage data, not even anonymous data and not periodically. It never connects to the internet on its own; you start the version check against GitHub yourself at the push of a button.
- **Self-hosted:** Your documents live on your device – no tracking, no advertising, no AI services. Who sees what is controlled by permissions per Mappe type.
- **Access request under Art. 15:** Everything about a tenant, customer or contact as a ZIP with a cover sheet – reviewed, redacted, with a record.
- **Retain, lock, delete:** Archive mode with deletion lock until the retention period ends, the list "May go" and a recycle bin – building blocks for your deletion concept, with a template.
- **Take your data with you:** Every user exports their own data, administrators everything – in open formats.

Software alone does not make data protection – your processes are part of it. What Ablago offers and what you handle yourself: **[Data protection in Ablago](https://help.ablago.app/admin/aktuell/en/datenschutz/)**.

## How to get a DMS

| You have … | This is how |
| --- | --- |
| a home server with **umbrelOS, ZimaOS or CasaOS** | from the [Ablago App Store](https://github.com/motom001/dms-appstore) with one click: [umbrelOS](https://help.ablago.app/installieren/aktuell/en/umbrel/), [ZimaOS](https://help.ablago.app/installieren/aktuell/en/zimaos/), [CasaOS](https://help.ablago.app/installieren/aktuell/en/casaos/) |
| a **NAS** from Synology, UGREEN, QNAP, TrueNAS or Unraid | paste a ready-made template into the Docker interface: [guides](https://help.ablago.app/installieren/aktuell/en/) |
| a **PC, Raspberry Pi or server with Docker** | [Docker Compose](https://help.ablago.app/installieren/aktuell/en/docker/) or, to try it out, [a single container](https://help.ablago.app/installieren/aktuell/en/komplett/) |
| **no server of your own** | [Without your own server: Ablago at a provider](https://help.ablago.app/installieren/aktuell/en/anbieter/) – three ways and a checklist of what to look for in a provider |

All ways at a glance: **[How do I get a DMS?](https://help.ablago.app/installieren/aktuell/en/)**

## What Ablago is not

- **Not a cloud service.** It runs at your home – or, if you like, at a provider you choose yourself. The project runs no service that sees your documents.
- **No licence fees**, no subscription. Anyone who wants to can support it voluntarily.
- **Not a "GoBD-certified" archive.** For self-employed people there is an archive mode and a template for the procedural documentation (German "Verfahrensdokumentation") – tools, not a certificate.
- **Not built for large companies.**

## For tinkerers and administrators

- **Design Mappe types yourself:** fields, links, tabs, title templates and result lists – in the workbench ("Werkbank"), without programming. Ready-made **packages** from the [package catalogue](https://github.com/motom001/dms-registry).
- **Incoming mail** from mailboxes (IMAP) and an inbox folder, **versioning** of documents, **advanced search** across fields and full text.
- **Permissions** per Mappe type and view with rules and a test run; **two-factor sign-in** and **sign-in via a provider** (OpenID Connect).
- **Archive mode** with deletion lock until the retention period ends, **customisable workbench** with the presets Household, Business and Everything.
- **Console** `dms` in the container for emergencies and operations, **API** `/api/v1` with API keys.
- One image for **amd64 and arm64**, public at `ghcr.io/motom001/dms`.

## Manuals

All manuals are available in German and English; the English pages are marked as machine-translated, improvements welcome.

- **[What is a DMS for?](https://help.ablago.app/benutzer/aktuell/en/wofuer/)** – when it helps in everyday life, with a self-check.
- **[How do I get a DMS?](https://help.ablago.app/installieren/aktuell/en/)** – installing on a home server, NAS or any computer with Docker.
- **[User manual](https://help.ablago.app/benutzer/aktuell/en/)** – working in the Library: folders, documents, search, tasks, profile.
- **[Administrator manual](https://help.ablago.app/admin/aktuell/en/)** – setup and operation, updating and backing up, workbench, troubleshooting, API.
- **[Developer manual](https://help.ablago.app/entwickler/aktuell/en/)** – contributing: way of working, architecture, packages and release.

Inside Ablago, **Hilfe** (help) in the menu under your own name leads there. What was added in which version is listed in the **[releases](https://github.com/motom001/dms/releases)**.

## Quick start with Docker Compose

The image `ghcr.io/motom001/dms` is public – you do not need to sign in to the registry.

1. Create the template [`deploy/nas/docker-compose.yml`](deploy/nas/docker-compose.yml) as a Compose project and adjust the paths (folders `postgres`, `files`, `geheim` and `sicherung`).
2. Next to it, put a file `.env` with `DB_PASSWORD=<long random password>`.
3. Start it and open `http://<NAS>:8080`. A wizard guides you through the setup: setup code (shown in the container log and in `geheim/EINRICHTUNGSCODE`), database, then **set up new** or **restore from a backup**, name of your filing system, administrator, first user, key and emergency sheet.

Which image tag (the same applies to `ghcr.io/motom001/dms-komplett`):

| Tag | Points to | For whom |
|---|---|---|
| `:stabil` | the tested version, moves once a week | default in all templates |
| `:latest` | the most recently released version, moves with every release | anyone who always wants the newest |
| `:<version>` | exactly this version, e.g. `:0.290.14` from the [releases](https://github.com/motom001/dms/releases) | anyone who decides when to update |
| `:main` | every state of `main`, even without a release | for testing only |

Without a tag, Docker uses `:latest`. Don't mix them up: the “Latest” marker on the releases on GitHub is on the stable version (`:stabil`), the image tag `:latest` on the newest. Everything else is in the administrator manual under [Setup and operation](https://help.ablago.app/admin/aktuell/en/installation/) and [Updating and backing up](https://help.ablago.app/admin/aktuell/en/aktualisieren/#image-tag).

## Security and openness

Ablago manages personal documents – which is why everything can be checked openly: the source code, how it is built and what is checked along the way. Automatically checked are our code (CodeQL), the libraries (Dependabot, `npm audit`), the finished images (Trivy) and secrets committed by accident (secret scanning with push protection). Every image carries a signed **provenance attestation** and a **bill of materials** (SBOM); how to verify them and how to **report a vulnerability confidentially** is described in [SECURITY.en.md](SECURITY.en.md). The [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/motom001/dms) regularly and publicly rates how the project handles security.

## Requests and bugs

As an [issue](https://github.com/motom001/dms/issues/new/choose) in the form of a user story with acceptance criteria – in German or English. What gets implemented is what the maintainer labels `freigegeben` (approved). What comes next and in which order is in the [roadmap](ROADMAP.md) (German). How contributing works is described in [CONTRIBUTING.en.md](CONTRIBUTING.en.md) and in the [developer manual](https://help.ablago.app/entwickler/aktuell/en/).

## Join in

You use Ablago? **[Tell us how](https://github.com/motom001/dms/issues/new?template=ich-nutze-das-dms.yml)** – voluntarily, with a short form, all fields optional. What others have told is listed under **[Who uses Ablago?](https://github.com/motom001/dms/issues?q=label%3Anutzt-das-dms)**. Ablago itself reports nothing: no telemetry, not even anonymous.

## Development

Requirements: Node.js 26 (LTS), Docker.

```sh
npm install
docker compose up db            # only the database
DATABASE_URL=postgres://dms:dms@localhost:5432/dms npm run dev -w server
npm run dev -w web              # user interface at http://localhost:5173
```

Tests: `npm test`. Architecture, tests against PostgreSQL, packages and the way to a release are described in the [developer manual](https://help.ablago.app/entwickler/aktuell/en/).

**New version:** Increase the version number in the three `package.json` files and write `docs/releases/v<version>.md` – release, image, manual and the screenshot above are created automatically after the merge. While doing so, briefly check whether "What you get", "For tinkerers and administrators" and the quick start are still correct – in both language versions of this README; everything detailed belongs in the manual, not here.

Important: **Do not commit real documents or personal data** – only code and sample data.

## Support

Ablago is and remains free to use. If you would like to support development voluntarily, you can do so via [GitHub Sponsors](https://github.com/sponsors/motom001) – once or monthly, with an amount of your choice. Donations from personal GitHub accounts arrive without deductions. In the application, the note appears only in the workbench, not in the filing view.

### How the project is funded

Development costs time and money – for test devices, servers and tools. Part of that is meant to come back through voluntary support, without the software ever costing anything or setting conditions:

- **Donations** via GitHub Sponsors are the preferred way: voluntary, open and without anything in return.
- **Test devices** I gladly accept, for example from manufacturers of NAS and mini servers. Whoever provides a device gets my honest opinion – including critical opinion – and does not buy a recommendation with it.
- **Recommendations** I only make for devices I use or have tested myself, and I give reasons. Should I ever use affiliate links, they are labelled as such right at the link, do not change the price and have no influence on my assessment. The application itself contains no advertising and no affiliate links.

## License

[Apache License 2.0](LICENSE) (Apache-2.0), notices in [NOTICE](NOTICE). Versions up to and including 0.92.0 are licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

Anyone may use, modify and redistribute Ablago, including in their own products. Whoever redistributes it includes the license and the notices from NOTICE and marks modified files. Publishing the source code of a modified version is not required.
