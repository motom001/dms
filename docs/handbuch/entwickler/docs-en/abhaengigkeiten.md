# Dependencies { #abhaengigkeiten }

Ablago gets by with **little outside code**: 10 npm packages in the server, 3 in the interface, plus a handful of Alpine packages in the image. That is the best protection against supply-chain attacks and keeps security updates rare and manageable – and one of the main reasons why Node.js fits well here. It should stay like this.

**Rule (#543):** a new **runtime dependency** – npm under `dependencies` or an Alpine package via `apk add` in the `Dockerfile` – only comes with a justification in the pull request (section "Neue Abhängigkeiten" of the template):

- **What** is it needed for?
- **Why not** with Node.js's built-in means or the existing dependencies and tools? Often a small implementation of our own is enough, as with the [language files](texte.md#texte-und-sprachdateien) instead of i18next.
- **Licence:** compatible with Apache-2.0? Deliberately not in the image are, for example, Ghostscript and MuPDF (AGPL).
- **Maintenance:** latest version, number of maintainers.
- **Its own dependencies:** what it brings into the image.

The check **Abhängigkeiten** (`.github/workflows/abhaengigkeiten.yml`) reports new runtime dependencies in the PR as a warning, removed and new build and test tools as a note and changed versions in the run's summary – nothing is blocked. The script `.github/werkzeuge/abhaengigkeiten-hinweis.py` (only Python and git) does this; locally: `python3 .github/werkzeuge/abhaengigkeiten-hinweis.py main HEAD`. GitHub's Dependency Review checks known vulnerabilities and incompatible licences in the same run.

**In the image today** (as of 0.297):

| Package | Where | Licence | What for |
| --- | --- | --- | --- |
| `fastify` | server | MIT | HTTP server, routes, checking requests |
| `@fastify/static` | server | MIT | delivering the interface as files |
| `postgres` (postgres.js) | server | Unlicense | access to PostgreSQL |
| `nodemailer` | server | MIT-0 | sending emails via SMTP (invitations, notices, sending folders) |
| `imapflow` | server | MIT | collecting post from mailboxes via IMAP |
| `mailparser` | server | MIT | splitting collected emails into text and attachments |
| `pdf-lib` | server | MIT | assembling, shrinking, redacting, stamping PDFs – only via the [PDF place](pdf.md#pdf-stelle) |
| `@pdf-lib/fontkit` (fixed 1.1.1) | server | MIT | embedding fonts of our own in PDFs (Noto Sans as a subset, [#826](pdf.md#pdf-schriften)); its only dependency `pako` already comes with pdf-lib |
| `yaml` | server | ISC | reading and writing packages in YAML format |
| `@simplewebauthn/server` | server | MIT | verifying [passkeys](fachbereiche.md#passkeys) (WebAuthn: CBOR, COSE keys, signatures, counters) – pinned version; brings `@peculiar/*` and `asn1js` (MIT/BSD-3-Clause), `@levischuck/tiny-cbor`, `@hexagon/base64`, `tsyringe` (MIT), `reflect-metadata` (Apache-2.0) and `tslib` (0BSD) |
| `react`, `react-dom` | interface | MIT | interface |
| `qrcode` | interface | MIT | QR code for two-factor sign-in |
| `poppler-utils` | image (Alpine) | GPL-2.0-or-later, called as a separate program | `pdftotext`, `pdftoppm`: text and images from PDFs |
| `qpdf` | image (Alpine) | Apache-2.0 | optimising the structure of PDFs when shrinking |
| `font-liberation`, `font-dejavu` (with `fontconfig`) | image (Alpine) | OFL-1.1 and Bitstream-Vera (free) | substitute fonts for non-embedded fonts in PDFs ([#1329](https://github.com/motom001/dms/issues/1329)); without them `pdftoppm` renders such PDFs without text. About 14 MB; checked in the image workflow with `.github/werkzeuge/schriften-pruefen.mjs` |
| `postgresql17`, `postgresql17-contrib` | only `dms-komplett` | PostgreSQL | database in the same container; `contrib` for `pg_trgm` |
| `tini`, `su-exec` | only `dms-komplett` | MIT | starting and cleanly ending processes, PostgreSQL without root |

Only for build and tests (not in the image): `typescript`, `tsx`, `esbuild`, `vite` with `@vitejs/plugin-react` and the types under `@types/…`; for [style and dependencies](stil.md) (#899) `eslint` with `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@eslint-community/eslint-plugin-eslint-comments` and `globals`, plus `dependency-cruiser`, `prettier` ([formatting](stil.md#formatierung)) and `knip` ([dead code](stil.md#toter-code)); for the smoke tests `axe-core` and – with its own lockfile in `web/rauchtest/` – `playwright`. Here too: rather built-in means – the tests run with Node.js's test runner (`node --test`), without a test framework of their own.
