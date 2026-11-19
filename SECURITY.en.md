# Security

[Deutsch](SECURITY.md) · **English**

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities. Report them confidentially via GitHub: **Security → Report a vulnerability** in this repository ([private vulnerability reporting](https://github.com/motom001/dms/security/advisories/new)). Reports in German or English are welcome.

If that does not work for you (e.g. without a GitHub account), write to **[security@ablago.app](mailto:security@ablago.app)**. Our RFC 9116 details are at [ablago.app/.well-known/security.txt](https://ablago.app/.well-known/security.txt).

Helpful details: the affected version (Werkbank → Technik), steps to reproduce, and what an attacker could achieve with it. We get back to you as soon as we have seen the report, and publish a fix as a patch release with a note in the release notes.

## Supported versions

Fixes are provided for the **latest version**. Please update first before reporting – see [Updating](https://help.ablago.app/admin/aktuell/aktualisieren/) (German).

The templates use the image tag **`:stabil`** (“stable”, #714). It only moves to a release – version number, release notes, both images built with provenance, update test from the previous `:stabil` passed – once a week in the workflow *:stabil befördern* (#907). Security fixes don't have to wait for that: with the label `sofort-stabil` on the pull request, `:stabil` moves right after the release, with the same checks. If a stable version has a serious bug, the maintainer sets `:stabil` to another published version with the workflow *:stabil zurücksetzen*; only people with write access to the repository can run it.

## What is checked automatically

| What | With | When |
| --- | --- | --- |
| Our code (TypeScript, workflows) | CodeQL | every pull request, every push to `main` |
| Libraries | Dependabot (alerts and updates), `npm audit` from severity "high" | every pull request, weekly |
| Images `dms` and `dms-komplett` | Trivy: critical vulnerabilities with an available fix block the pull request | every pull request, every release, weekly rebuild |
| Delivered images `:stabil` and `:latest` (both variants) | Grype as a second database independent of Trivy; plus a direct check of the versions of poppler, qpdf, Node.js and PostgreSQL against [NVD](https://nvd.nist.gov/), even if Alpine does not list the case yet | weekly (Wednesdays), workflow *Sicherheitsabgleich* |
| Secrets (tokens, passwords) | Secret scanning with push protection | every push |
| How the project works | [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/motom001/dms) | weekly, every push to `main` |

Findings are listed under **Security** in this repository; only people with write access can see this list. Findings of the image scan that are knowingly accepted are listed with a reason in [`.trivyignore`](.trivyignore); the maintainer closes all others in the Security tab with a reason.

## Responsibility and response times

The **maintainer** (Thomas Meissner) is responsible. He reviews the findings in the Security tab after every weekly check and acknowledges confidential reports within **3 days**.

Every finding is first assessed **for Ablago**: the severity of a component is the starting point, what matters is how Ablago uses it – for example whether a program processes files from outside. Then these deadlines apply (calendar days):

| Severity for Ablago | Assessed within | Fix or mitigation within |
| --- | --- | --- |
| critical | 1 day | 3 days, with `sofort-stabil` |
| high | 3 days | 14 days, with `sofort-stabil` if the vulnerability can be exploited in Ablago |
| medium | 7 days | with the next `:stabil`, at the latest after 30 days |
| low | 14 days | at the latest after 90 days, or knowingly accepted with a reason |

If Alpine or the vendor has no fix yet, Ablago restricts the affected program or builds it itself with the fix. Details of an open vulnerability only become public with the fix; the release notes then name the CVE number.

## Verifying the origin of the images

Every published image carries a signed **provenance attestation** (from which commit, built with which workflow) and a **bill of materials** (SBOM, SPDX). Verify them with the [GitHub CLI](https://cli.github.com/):

```sh
gh attestation verify oci://ghcr.io/motom001/dms:<version> -R motom001/dms
gh attestation verify oci://ghcr.io/motom001/dms-komplett:<version> -R motom001/dms
```

How this is built in detail is described in the [developer manual](https://help.ablago.app/entwickler/aktuell/release/#abhangigkeiten-und-sicherheitsupdates) (German).

## Verifying where packages come from

The Ablago project signs the official package catalog ([dms-registry](https://github.com/motom001/dms-registry)) with Ed25519. Ablago verifies the signature with these two public keys of the maintainer (built into the code, `server/src/pakete/projektschluessel.ts`); a signature made with either of them is valid:

| Key | Key ID | Fingerprint (SHA-256 of the public key) |
| --- | --- | --- |
| Signing key (registry CI) | `6d868387314e64df` | `6d86 8387 314e 64df 715c a3bd 9856 58d5 f888 c0ea 7cab ac91 a43f 9b99 6052 e728` |
| Backup key (kept offline by the maintainer) | `4543c81b5ccf522d` | `4543 c81b 5ccf 522d f5a3 5e76 6660 8774 5f6c ae42 4722 3b6d 91c9 63cc 34b0 3954` |

> **Versions 0.141.0 to 0.144.1** only know test keys whose private counterparts are public in the tests. As soon as the registry signs with the keys above, they report "signature invalid" for the official catalog. Update to a newer version. You can check the fingerprints in the registry with `python3 werkzeuge/signieren.py fingerabdruck signier.pub`; the public keys are posted in [motom001/dms-registry#74](https://github.com/motom001/dms-registry/issues/74).

What "signed" and "not signed" mean in the install preview is explained in the [administration handbook](https://help.ablago.app/admin/aktuell/pakete/#herkunft-signiert-oder-nicht) (German).
