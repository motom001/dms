# Components and licences {#bestandteile-und-lizenzen}

Ablago isn't only its own code: the image contains Alpine Linux with a few system programs, Node.js, libraries from npm, fonts and the offline manual. Exactly which ones a version contains, with version, licence and source, is listed with every [release](https://github.com/motom001/dms/releases) – to look up, for your own documentation or for a review in your organisation.

!!! note "No legal assessment"
    The list is a technical listing, generated automatically. It says what is in the image and which licence the packages declare – not what that means for your use. Ablago itself is under the Apache License 2.0 ([`LICENSE`](https://github.com/motom001/dms/blob/main/LICENSE), [`NOTICE`](https://github.com/motom001/dms/blob/main/NOTICE)).

## Where to find the list {#wo-du-die-liste-findest}

**In the text of every release** there is the section *Bestandteile und Lizenzen* (components and licences) – an overview:

- **Stand (state):** version, date, commit and the digests of both images (`dms` and `dms-komplett`), per architecture (amd64, arm64) and for the shared index.
- **Changed compared with the previous version:** first components with a **changed licence**, then new ones, removed ones and those with a new version.
- **Licences:** how many components carry which licence. Listed individually are those with **special obligations** (copyleft, e.g. GPL, LGPL, MPL) – with a link to the source code – and those **without a recognised licence**.
- **System programs:** the packages Ablago adds to the image itself, and what they are for.

**As attachments** to the release you get the complete list, every component with its source:

| File | Format | For |
| --- | --- | --- |
| [`ablago-bestandteile.csv`](https://github.com/motom001/dms/releases/latest/download/ablago-bestandteile.csv) | CSV (comma, UTF-8) | Spreadsheets, your own documentation |
| [`ablago-bestandteile.spdx.json`](https://github.com/motom001/dms/releases/latest/download/ablago-bestandteile.spdx.json) | SPDX 2.3 | Tools for licences and bills of materials |
| [`ablago-bestandteile.cdx.json`](https://github.com/motom001/dms/releases/latest/download/ablago-bestandteile.cdx.json) | CycloneDX 1.5 | Tools for bills of materials and vulnerabilities (e.g. Dependency-Track) |

The links in the table always lead to the **stable version** (`:stabil`) – on GitHub that is the release marked *Latest*. For a specific version, replace `latest/download` with `download/v<version>`, e.g. `…/releases/download/v0.291.0/ablago-bestandteile.csv`. Releases from before this feature have no attachments; until the first version with a list is stable, the links lead nowhere.

The CSV columns (German headings): *Art* (kind), *Name*, *Version*, *Lizenz* (licence), *Varianten* (`dms`, `dms-komplett`), *Architekturen*, *Herkunftspaket* (for Alpine the source package it was built from) and *Quelle* (source).

## What it contains {#was-drinsteht}

| Kind | From | Examples |
| --- | --- | --- |
| Alpine-Paket, Schrift (Alpine) | Bill of materials of the finished image (Trivy) | busybox, poppler-utils, qpdf, font-liberation, PostgreSQL in `dms-komplett` |
| npm (Server) | Bill of materials of the finished image (Trivy) | Fastify, nodemailer, pdf-lib |
| Ablago selbst (Ablago itself) | Bill of materials and repository | Server, web interface, the release's commit |
| Laufzeit (runtime) | Node version from the image | Node.js |
| npm (Oberfläche) (web interface) | `package-lock.json` | React, qrcode – bundled into one file in the image, so invisible to Trivy |
| Schrift, Oberfläche (fonts, interface) | Repository | Noto Sans and Noto Sans Mono (Ablago's own PDFs), Lucide (icons) |
| Handbuch (manual) | Repository | Texts and images of the offline manual, Material for MkDocs |

Two limits:

- **Web interface libraries** come from `package-lock.json`, not from the finished bundle. The list may therefore contain a little too much (e.g. parts of a library only needed on the command line), but leaves out nothing that is included.
- **Licences** are taken as the packages declare them. Where a package declares none, it says *ohne erkannte Lizenz* (without a recognised licence). You find the source of an Alpine package via the link to pkgs.alpinelinux.org (source package and Alpine branch); from there a link leads to the build script in aports.

## How the list is made {#wie-die-liste-entsteht}

With every new version, after both images have been built and merged:

1. **Bill of materials per image and architecture:** Trivy reads the finished images from the registry (`dms` and `dms-komplett`, each amd64 and arm64); the digests and the Node version come from the image as well.
2. **Additions:** what Trivy can't see – the web interface libraries, fonts, the offline manual and Ablago itself.
3. **Merge and compare:** identical components from all variants and architectures become one row; the comparison is with the CSV attached to the previous release.
4. **Release:** the overview goes into the release text, the three files become attachments.

The tool for this is in the repository at [`.github/werkzeuge/bestandteile.mjs`](https://github.com/motom001/dms/blob/main/.github/werkzeuge/bestandteile.mjs), what the system programs are for at [`bestandteile-wozu.json`](https://github.com/motom001/dms/blob/main/.github/werkzeuge/bestandteile-wozu.json). If the list can't be generated once, the release still appears – with a note in place of the overview.

## Verifying {#nachprufen}

Overview and attachments are a **readable view**. The proof is the **signed attestation** on the image: the provenance (which commit and which workflow the image comes from) and a bill of materials in SPDX format. Both are next to the image in the registry, see also [Where does the image come from?](aktualisieren.md).

**Provenance and signed bill of materials**, using the digest of the **index** (row *alle (Index)* in the section *Stand*). The attestation is attached to the index, not to the per-architecture digests; with the digest for amd64 or arm64, `gh` reports "no attestations found". Each image has its own attestation:

```sh
gh attestation verify oci://ghcr.io/motom001/dms@sha256:<index digest> -R motom001/dms
gh attestation verify oci://ghcr.io/motom001/dms@sha256:<index digest> -R motom001/dms \
  --predicate-type https://spdx.dev/Document/v2.3
gh attestation verify oci://ghcr.io/motom001/dms-komplett@sha256:<index digest> -R motom001/dms
```

The signed bill of materials covers the system packages and the server's npm packages as Trivy recognises them for amd64. The additions (web interface, fonts, manual) and the list for arm64 are only in the attachments; they are made in the same run from the same commit.

**Independently:** load the image by its digest in an isolated test environment, generate a bill of materials yourself and compare it with the attachment – with Trivy or another tool such as Syft:

```sh
trivy image --platform linux/arm64 --format spdx-json ghcr.io/motom001/dms@sha256:<digest>
syft ghcr.io/motom001/dms@sha256:<digest> --platform linux/arm64 -o spdx-json
```

Other tools recognise licences and packages slightly differently; small differences in how licences are written are normal.

## Source code {#quelltext}

- **Ablago:** the repository [motom001/dms](https://github.com/motom001/dms); the exact state of a release via the commit in the section *Stand*.
- **Alpine packages:** via the link *Quelltext* in the overview or the column *Quelle* (pkgs.alpinelinux.org, from there to the sources in aports).
- **Node.js:** source archive of the version at [nodejs.org](https://nodejs.org/dist/).
- **npm packages:** the package's page on npmjs.com, from there to the package's repository.
