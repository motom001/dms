# Dependencies { #abhaengigkeiten }

Ablago gets by with **little outside code**: 9 npm packages in the server, 3 in the interface, plus a handful of Alpine packages in the image. That is the best protection against supply-chain attacks and keeps security updates rare and manageable – and one of the main reasons why Node.js fits well here. It should stay like this.

**Rule (#543):** a new **runtime dependency** – npm under `dependencies` or an Alpine package via `apk add` in the `Dockerfile` – only comes with a justification in the pull request (section "Neue Abhängigkeiten" of the template):

- **What** is it needed for?
- **Why not** with Node.js's built-in means or the existing dependencies and tools? Often a small implementation of our own is enough, as with the [language files](texte.md#texte-und-sprachdateien) instead of i18next.
- **Licence:** compatible with Apache-2.0? Deliberately not in the image are, for example, Ghostscript and MuPDF (AGPL).
- **Maintenance:** latest version, number of maintainers.
- **Its own dependencies:** what it brings into the image.

The check **Abhängigkeiten** (`.github/workflows/abhaengigkeiten.yml`) reports new runtime dependencies in the PR as a warning, removed and new build and test tools as a note and changed versions in the run's summary – nothing is blocked. The script `.github/werkzeuge/abhaengigkeiten-hinweis.py` (only Python and git) does this; locally: `python3 .github/werkzeuge/abhaengigkeiten-hinweis.py main HEAD`. GitHub's Dependency Review checks known vulnerabilities and incompatible licences in the same run.

**What is in it today** – every directly included package with its purpose, licence and what it brings along, plus the tools for development and test – is on the generated page [Composition from components](bestandteile-aufbau.md) (#1412). You enter the purpose of a new package in `.github/werkzeuge/bestandteile-wozu.json` (section `npm`, or `pakete` for `apk add`) and regenerate the page; without a purpose, CI fails. Special points not listed there:

- `@pdf-lib/fontkit` (only dependency `pako`, which pdf-lib already brings) and `@simplewebauthn/server` are pinned to a fixed version.
- `poppler-utils` and `setpriv` (both GPL-2.0-or-later) are called by Ablago as separate programs; they are not linked in. `tini`, `su-exec` and `setpriv` make Ablago, the pre-start and the tool service run [without root](server.md#ohne-root).
- The substitute fonts `font-liberation` and `font-dejavu` (with `fontconfig`, about 14 MB) are checked by `.github/werkzeuge/schriften-pruefen.mjs` in the image workflow ([#1329](https://github.com/motom001/dms/issues/1329)); without them, `pdftoppm` renders PDFs with non-embedded fonts without text.
- **Where we build it ourselves and where not:** since [#1468](https://github.com/motom001/dms/issues/1468) the interface is served by a small delivery module of our own (`server/src/oberflaeche/auslieferer.ts`, about 200 lines) instead of `@fastify/static`, which brought along 25 packages, changed major versions often and had several security advisories. It pays off there because the input is our own file list created at build time: no path from the URL reaches the file system. We do **not** build cryptography, protocols or parsers for outside input (e-mails, PDFs, sign-in) ourselves – maintained libraries stay there.
- For tools too: rather built-in means – the tests run with Node.js's test runner (`node --test`), without a test framework of their own.

**Updates:** Dependabot (`.github/dependabot.yml`) opens pull requests weekly, security updates immediately. The mail packages `nodemailer`, `imapflow` and `mailparser` process outside e-mails and therefore come as a pull request of their own (group `mail`, major versions included) that is merged promptly ([#1413](https://github.com/motom001/dms/issues/1413)); the group `klein` collects the remaining small updates.
