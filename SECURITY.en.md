# Security

[Deutsch](SECURITY.md) · **English**

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities. Report them confidentially via GitHub: **Security → Report a vulnerability** in this repository ([private vulnerability reporting](https://github.com/motom001/dms/security/advisories/new)). Reports in German or English are welcome.

Helpful details: the affected version (Werkbank → Technik), steps to reproduce, and what an attacker could achieve with it. We get back to you as soon as we have seen the report, and publish a fix as a patch release with a note in the release notes.

## Supported versions

Fixes are provided for the **latest version**. Please update first before reporting – see [Updating](https://motom001.github.io/dms/admin/aktuell/aktualisieren/) (German).

## What is checked automatically

| What | With | When |
| --- | --- | --- |
| Our code (TypeScript, workflows) | CodeQL | every pull request, every push to `main` |
| Libraries | Dependabot (alerts and updates), `npm audit` from severity "high" | every pull request, weekly |
| Images `dms` and `dms-komplett` | Trivy: critical vulnerabilities with an available fix block the pull request | every pull request, every release, weekly rebuild |
| Secrets (tokens, passwords) | Secret scanning with push protection | every push |
| How the project works | [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/motom001/dms) | weekly, every push to `main` |

Findings are listed under **Security** in this repository. Findings of the image scan that are knowingly accepted are listed with a reason in [`.trivyignore`](.trivyignore).

## Verifying the origin of the images

Every published image carries a signed **provenance attestation** (from which commit, built with which workflow) and a **bill of materials** (SBOM, SPDX). Verify them with the [GitHub CLI](https://cli.github.com/):

```sh
gh attestation verify oci://ghcr.io/motom001/dms:<version> -R motom001/dms
gh attestation verify oci://ghcr.io/motom001/dms-komplett:<version> -R motom001/dms
```

How this is built in detail is described in the [developer manual](https://motom001.github.io/dms/entwickler/aktuell/release/#abhangigkeiten-und-sicherheitsupdates) (German).
