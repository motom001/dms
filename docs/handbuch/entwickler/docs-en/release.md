# Release

A release arises as soon as there is a version number on `main` for which there is no tag yet. Since #952 the merge assigns the number, not the pull request.

1. **Pull request** with a **notes snippet** `docs/releases/neu/<name>.md` instead of a version number: first line `art: minor`, `art: patch` or `art: keine` (no release), below it the release notes as before. CI checks in the job `rauchtests` (part of `pruefen`) that a pull request changing the program brings exactly one snippet. During the transition the old way (number and `docs/releases/v<version>.md` in the pull request) still works, with a warning.
2. After the merge **version.yml** (*Version vergeben*) assigns the next number (highest `art`), sets the three `package.json`, merges the snippets into `docs/releases/v<version>.md` and writes this as its own commit "Version X.Y.Z" with `Pull-Request: #…` to `main` – using the token of the GitHub app *Ablago Version* (contents only, environment `versionieren`, only this app may bypass the `main` ruleset).
3. On that commit, **image.yml** (*Prüfen und Image bauen*) builds **two images** natively for amd64 and arm64 and pushes them: `ghcr.io/motom001/dms:<version>` and `ghcr.io/motom001/dms-komplett:<version>`.
4. Then image.yml calls **release.yml**. The workflow creates the tag `v<version>` and the GitHub release. It takes the text from `docs/releases/v<version>.md`; if the file is missing, it takes the commit subjects since the previous tag.
5. **handbuch.yml** builds all four manuals and publishes them via GitHub Actions (`actions/upload-pages-artifact`, `actions/deploy-pages`) under `https://help.ablago.app/<handbuch>/aktuell/`. Older versions no longer exist online: every installation brings its manual under `/hilfe/`, and it can be rebuilt from every tag. The 404 page redirects old addresses (`v0.xx/…`, `entwicklung/…`) to the same page under `aktuell` (`docs/handbuch/werkzeuge/veroeffentlichen.py`). The English version of every manual (#730) is under `…/<handbuch>/aktuell/en/`; the short address `/emergency` leads to the English emergency page. The page *Neu in dieser Version* (What's new) is made from the release notes. The custom domain is in the Pages settings (source "GitHub Actions"); there is no longer a branch `gh-pages`.
6. `:stabil` does **not** move with every release (#907). The release is created with `--latest=false`; once a week (Tuesdays 04:23 UTC, also by hand under Actions) **stabil.yml** (*:stabil befördern*) picks the newest release that is at least 24 hours old, above the previous “Latest” and meets all rules (#714): number X.Y.Z (no pre-release), release notes present, no label `nicht-stabil` on the pull request (otherwise the next older one; never backwards; if `:stabil` already points to it, nothing happens). It checks both images for amd64 and arm64 with provenance (`gh attestation verify`) and the update test from the previous `:stabil` green (`.github/werkzeuge/update-test.sh`: set up the old state, file a document, back up → new state with the same folders → data there, test restore succeeds). Then `dms:stabil` and `dms-komplett:stabil` point to the new version, the release becomes “Latest” (Ablago's “new version” notice follows it) and gets the section *Seit der letzten stabilen Version* (since the last stable version) with links to all versions since the previous `:stabil`. With the label `sofort-stabil` on the pull request, image.yml calls the same workflow right after the release for exactly this version (without the 24-hour wait). The rules are in `.github/werkzeuge/stabil-pruefen.sh` and `stabil-auswahl.sh` and are tested in every pull request; `image-probe` also does the update test from the last stable state to the pull request's state.
7. **[motom001/dms-appstore](https://github.com/motom001/dms-appstore)** takes over the new version the next morning, with images by digest, for Umbrel, ZimaOS and CasaOS. By hand it works immediately via the workflow *Store aktualisieren*.

## Version numbers { #versionsnummern }

- **Minor version** (`0.40.0`) for new functions.
- **Patch** (`0.39.1`) for fixes.
- Every release replaces the manual online under `aktuell`.
- Without a new number: only the image `main` changes, not the manual online and not `:stabil`.
- **Holding back:** label `nicht-stabil` on the pull request – release and image with a number arise, the weekly run takes the next older version.
- **Stable at once:** label `sofort-stabil` on the pull request (before merging) – for urgent fixes, e.g. security. `nicht-stabil` wins if both are set.
- **Rolling back:** Actions → *:stabil zurücksetzen* → enter version (only published releases, only with write permission on the repository). Works in both directions and marks the release as “Latest”. After rolling back, put `nicht-stabil` on the pull request of the faulty version, otherwise the next weekly run picks it again.

### Starting workflows by hand { #workflows-von-hand-starten }

- *Prüfen und Image bauen* (`image.yml`) and *Scorecard* can be started by hand under **Actions**. A manual start of image.yml builds and publishes the images but creates no release – that only happens after a push to `main` with a new number.
- *Handbuch* (`handbuch.yml`) builds by hand on `main` and republishes under `aktuell` – for instance after a disruption. The version only states which release notes *Neu in dieser Version* shows.
- *Lockfile erzeugen* (`lockfile.yml`) can also be started by hand.
- *Release* (`release.yml`) also starts on a manually pushed tag `v*` (creates the release) and on a manually published release (only sets the text).

## Quality control: vague time statements { #qualitatskontrolle-weiche-zeitangaben }

Announcements such as "at the moment", "to follow", "comes later" or "not yet" tend to stay long after the function has been built. That's why this list belongs to every quality control (e.g. 0.75):

```sh
python3 docs/handbuch/werkzeuge/zeitangaben.py
```

The script searches manuals, glossary, templates, README and the interface's texts (`web/src`, `shared/src/hilfe.ts`; comments don't count) and outputs file, line, word and sentence per hit. The manual workflow writes the same list into the run's summary; it never stops because of it. The word list is German; English pages aren't covered yet.

How to read it: is the sentence still true? If not, correct it. If it is intended (e.g. "not yet paid" or real planning), mark it in the same line or the line before with `<!-- zeitangabe: geprüft 0.75 -->` (in YAML `# zeitangabe: …`, in TypeScript `// zeitangabe: …`). Marked places are listed separately under "Checked" with the version, so that they stand out again in the next round.

## Dependencies and security updates { #abhangigkeiten-und-sicherheitsupdates }

- **Dependabot** (`.github/dependabot.yml`) suggests updates every Monday: small updates (minor, patch) collected in one PR, major versions individually, plus GitHub Actions, the base images and the Ollama version in the example `deploy/beispiele/ki-ollama/` (only `docker-compose.yml`; update `amd.yml` and `intel-grafik.yml` by hand in the same PR – otherwise the test in the workflow *KI-Beispiel* fails with the matching `sed` command). Security updates come immediately. CI checks each of these PRs like any other; major versions please with a look at the library's changelog.
    - **Exceptions** (`ignore` in `dependabot.yml`) that deliberately come by hand: new major versions of `node` (base image, LTS series only), `@types/node` and `typescript`; for `esbuild` (still 0.x) also new minor versions.
- **`npm audit`** runs in CI over everything that ends up in the image (`--omit=dev`). From level "high" the check fails. If a report demonstrably has no effect on Ablago, this is justified in the PR.
- **`package-lock.json`** records the exact versions; CI and image install with `npm ci`. If a `package.json` changes without a matching lockfile, the workflow *Lockfile erzeugen* puts a new one on the branch `werkzeug/lockfile`; from there it is taken over with a normal commit.
- **Security fix = patch release** with the note "Security update – please update" in the release notes. Reports from outside are handled confidentially, see [`SECURITY.md`](https://github.com/motom001/dms/blob/main/SECURITY.md).

### Checking images, provenance and bill of materials { #images-prufen-herkunftsnachweis-und-stuckliste }

- **Trivy** checks both images for known vulnerabilities in the system packages (Alpine, poppler, PostgreSQL in `dms-komplett`) and in the Node libraries in the image.
    - **In the pull request** (job `image-probe`, amd64): vulnerabilities of level *critical* for which there is a fix make the check fail; *high* with a fix appears as a warning. Findings without a fix don't block.
    - **On `main`, for tags and in the weekly rebuild** (job `image-zusammen`): the finished image is checked and the findings land under **Security → Code scanning** (category `image-dms` or `image-dms-komplett`). Here it is only reported – the image has already been published, after all.
    - Deliberately accepted findings are in `.trivyignore` with a reason and check date.
    - Trivy comes as a binary with a fixed version and fixed checksum (`.github/werkzeuge/trivy-installieren.sh`), not via the trivy-action: its tags were compromised in 2026 (CVE-2026-33634). A new version is entered there by hand, with both checksums from the release's `checksums.txt`.
- **Provenance and bill of materials (SBOM):** every published image gets a signed attestation of which commit and which workflow it comes from, and a bill of materials in SPDX format. Both are next to the image in the registry. This can be checked with:

    ```sh
    gh attestation verify oci://ghcr.io/motom001/dms:stabil -R motom001/dms
    gh attestation verify oci://ghcr.io/motom001/dms:stabil -R motom001/dms --predicate-type https://spdx.dev/Document/v2.3
    ```

### OpenSSF Scorecard and rules for workflows { #openssf-scorecard-und-regeln-fur-workflows }

The workflow *Scorecard* rates weekly and with every push to `main` how the project deals with security. The result is public ([scorecard.dev](https://scorecard.dev/viewer/?uri=github.com/motom001/dms)) and is a badge in the README; the individual notes are under **Security → Code scanning**. These rules follow from it:

- **Actions with a fixed commit id**, the version as a comment after it: `uses: actions/checkout@<40 characters> # v7.0.1`. Dependabot updates both.
- **Permissions:** at the top of the workflow only `contents: read` (or no permissions). Only the job that needs write permissions gets them (`packages`, `contents`, `id-token`, `attestations`, `security-events`). The only exception is the workflow *Scorecard* with `permissions: read-all` at the top – those are only read permissions; for publishing the result, this workflow may have no write permissions at the top.
- **No execution of outside code with permissions:** `pull_request_target` only without checkout (as in the workflow *Freigabe schützen*).

Deliberately different from what Scorecard would like:

- **Base images without a fixed digest** (`node:24-alpine`, `python:3.12-alpine` in the `Dockerfile`): the weekly rebuild is meant to fetch exactly the newest security fixes of the series. A fixed digest would need a PR of its own every week without bringing more security; the images themselves are checked and carry provenance. This also applies after the review in #289: with a digest, fixes to Node would only come via a Dependabot PR that someone has to merge.
- **Code review:** with one maintainer there is no second person who approves every PR. Instead all checks must be green, and changes run via PRs with an issue.

### Assessment of the first run { #bewertung-des-ersten-laufs }

First run on 31/10/2026: **6.1 out of 10**. This is how we deal with the individual checks:

| Check | Score | Handling |
| --- | --- | --- |
| Dangerous-Workflow, Token-Permissions, Binary-Artifacts, Dependency-Update-Tool, Security-Policy, Packaging, License, CI-Tests | 10 | met, keep it so |
| Vulnerabilities | 8 | Known vulnerabilities in development tools (not in the image – `npm audit --omit=dev` and Trivy check that). Go away with the updates from #236; list under *Security → Dependabot*. |
| Pinned-Dependencies | 6 | Actions fixed, `npm ci` without falling back to `npm install`. Since #289 also the manuals' tools: mkdocs with all dependencies via `docs/handbuch/requirements.txt` with hashes (image and CI, Dependabot keeps them up to date), Playwright with a fixed version. Deliberately open: base images without a digest (see above), `FROM laufzeit` (internal stage, false alarm), `npm install --package-lock-only` in *Lockfile erzeugen* (creates the lockfile, false alarm) and the runners' apt packages. |
| SAST | 4 | CodeQL has run on every PR since the end of October 2026. The score counts the latest commits and rises by itself. |
| Maintained | 0 | The repository is younger than 90 days; afterwards activity counts and the score rises by itself. |
| Branch-Protection | 0 | Switch on the ruleset following the suggestion below (maintainer). |
| Code-Review | 0 | Can't be met with one maintainer, see above. |
| CII-Best-Practices | 0 | Fill in the self-assessment on [bestpractices.dev](https://www.bestpractices.dev/) (maintainer, a good hour); then a badge in the README. |
| Contributors | 3 | Counts the contributors' companies and organisations – no action needed. |
| Fuzzing | 0 | Deliberately not: schemas and tests check inputs; fuzzing only pays off for parsers of our own. |
| Signed-Releases | ? | GitHub releases have no files – the images are the release and carry provenance and SBOM. |

### Suggestion: rule for the branch `main` { #vorschlag-regel-fur-den-branch-main }

Under **Settings → Rules → Rulesets**, create a ruleset for the default branch (the maintainer switches it on):

- **Require a pull request before merging** (without required review, see above),
- **Require status checks to pass:** `pruefen`, `image-probe (linux/amd64, ubuntu-24.04)`, `image-probe (linux/arm64, ubuntu-24.04-arm)`, `bauen` (manual),
- **Require code scanning results:** CodeQL, threshold as in the settings ("High or higher"),
- **Block force pushes** and **Restrict deletions**,
- **Bypass:** only the maintainer (role *Repository admin*), so that emergency fixes stay possible.
