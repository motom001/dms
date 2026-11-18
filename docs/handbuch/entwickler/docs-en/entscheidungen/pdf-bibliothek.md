# PDF library: pdf-lib stays (#822, #823) { #pdf-bibliothek }

**Decided on 11.11.2026 by the maintainer.** pdf-lib 1.17.1 stays and is only extended with embedded fonts (`@pdf-lib/fontkit`). `@cantoo/pdf-lib` is reassessed as soon as Chinese, Japanese or Korean are needed in our own PDFs. How the PDF place works today is under [PDFs](../pdf.md).

## Assessment of the PDF libraries (#822) { #pdf-bibliotheken }

**pdf-lib (MIT) is the only widespread library in pure JavaScript that can edit existing PDFs and create new ones.** pdfkit, pdfmake and jsPDF only create new PDFs; PDF.js only reads and displays. The last version 1.17.1 dates from the end of 2021; there has been no further development since. We already work around one bug in it (#456). Replacing it is **not** part of #541 – but the encapsulation makes it manageable.

**What Ablago needs and what the tools can do** (as of 04/11/2026):

| Tool | A | B | C | D | E | F | G | H | I |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **pdf-lib 1.17.1** (today) | yes | yes | yes | yes | yes (workaround #456) | partly | yes | yes (MIT) | **no** (2021) |
| **@cantoo/pdf-lib** 2.11.1 | yes | yes | yes | yes | yes | partly | yes | yes (MIT) | yes (15/09/2026) |
| **@pdfme/pdf-lib** 6.2.8 | yes | yes | yes | yes | yes | partly | yes | yes (MIT) | yes (23/10/2026) |
| pdfkit | no | no | only in new PDFs | yes | yes | no | yes | yes (MIT) | yes |
| pdfmake (on pdfkit) | no | no | partly, only new | yes (from a description) | yes | no | yes | yes (MIT) | yes |
| jsPDF | no | no | only in new PDFs | yes | yes | no | yes | yes (MIT) | yes |
| PDF.js | no | no | no | no | no | partly (reading, text) | yes | yes (Apache-2.0) | yes |
| qpdf (in the image) | partly (structure, objects, decrypting) | yes | partly (overlaying, rotating; no text) | no | no | yes (`--check`, JSON) | **no** (separate program) | yes (Apache-2.0) | yes |
| PDFium as WebAssembly (e.g. `@embedpdf/pdfium`) | yes | yes | yes (via the C interface) | yes | yes | partly | yes (WebAssembly) | yes (Apache-2.0/BSD) | engine yes, wrapper young |
| MuPDF.js | yes | yes | yes | yes | yes | yes | yes (WebAssembly) | **no** (AGPL-3.0) | yes |

The columns – what Ablago needs them for and where they come from:

- **A – editing existing PDFs internally:** repacking images and tidying up structures ([#393](https://github.com/motom001/dms/issues/393)), the cleaned copy for display without scripts and actions ([#639](https://github.com/motom001/dms/issues/639)), stamps into existing pages ([#394](https://github.com/motom001/dms/issues/394)).
- **B – pages:** rotating, deleting, reordering, splitting ([#335](https://github.com/motom001/dms/issues/335)), photos as pages ([#490](https://github.com/motom001/dms/issues/490)), merging pages of several folders ([#152](https://github.com/motom001/dms/issues/152)).
- **C – drawing on pages, also opacity, rotation and blend mode:** stamps and watermarks ([#394](https://github.com/motom001/dms/issues/394)), colours and blend mode ([#799](https://github.com/motom001/dms/issues/799)).
- **D – creating new PDFs:** text documents by plan ([#541](https://github.com/motom001/dms/issues/541)), export of several folders ([#152](https://github.com/motom001/dms/issues/152)), label sheet ([#345](https://github.com/motom001/dms/issues/345)), demo documents ([#248](https://github.com/motom001/dms/issues/248)).
- **E – embedding images:** photos as PDF ([#490](https://github.com/motom001/dms/issues/490)), rebuilding when redacting ([#392](https://github.com/motom001/dms/issues/392)), JPEG from shared memory ([#456](https://github.com/motom001/dms/issues/456)).
- **F – checking:** PDF/A identifier, encryption, signature and text layer for the archive version ([#631](https://github.com/motom001/dms/issues/631)).
- **G – without native parts:** the operations run in the worker pool ([#542](https://github.com/motom001/dms/issues/542)); native modules contradict the slim dependency list. qpdf and poppler are separate programs in the image, not modules.
- **H – licence fits Apache-2.0:** MIT, BSD and Apache-2.0 yes; AGPL no (that's why MuPDF and Ghostscript are deliberately not in the image).
- **I – maintained:** new versions in the last twelve months and answers to reports.

**Several small packages don't replace pdf-lib.** For A, B and C – editing existing PDFs – in pure JavaScript there is only the pdf-lib family (the original and its forks). A generator such as pdfkit would only come in addition.

**Ways** (the decision is prepared by [#823](https://github.com/motom001/dms/issues/823), see [below](#pdf-entscheidung)):

| Way | For it | Against it |
| --- | --- | --- |
| **a) pdf-lib stays** (today) | runs stably, all functions and tests build on it; MIT; four small dependencies of its own (`pako`, `tslib`, standard fonts, `upng`) | no more bug fixes and no security updates; workarounds such as #456 stay our business |
| **b) `@cantoo/pdf-lib`** (maintained fork) | same interface, regular versions (21 versions in 2026), MIT; fixes in parsing; `crypto-js` removed since 2.9.0 | almost all changes since 2025 by one person; since 2.11 only minified builds; packaging regressions (ESM build, `prepare: husky`); HTML parser and colours as dependencies |
| **c) A copy of our own** in `server/src/pdf/` | no new dependency; only the fixes that concern us | we become maintainers ourselves; Dependabot and OSV no longer cover the copy |
| `@pdfme/pdf-lib` (fork by the pdfme project) | same interface, maintained (6.2.8 of 23/10/2026), MIT | a single maintainer; also additional dependencies (HTML parser, colours) |
| More via qpdf (already in the image, Apache-2.0) | robust and maintained (C++); can rotate, select, reorder, split, merge, overlay, decrypt pages (#827) and optimise structures – without a new dependency; a process of its own | draws no texts and embeds no images: stamps, export pages, labels, text documents and the rebuild when redacting would need a writer of their own (approach in the test helper `server/test/hilfen-einfach-pdf.ts`); every call writes files |
| PDFium as WebAssembly (Apache-2.0, Chrome's engine) | very capable: reads, edits, draws and renders; no native modules | the JavaScript wrapper is young and aimed at the browser; large (several MB of WebAssembly); interface close to C, so a lot of code of our own |
| MuPDF, Ghostscript | very capable | AGPL – deliberately not in the image |

**State and sources** (04/11/2026): versions, dates, dependencies and sizes from the npm registry (`npm view <package> time dependencies dist.unpackedSize`); functionality from the projects' documentation (pdf-lib.js.org, github.com/cantoo-scribe/pdf-lib, github.com/pdfme/pdfme, pdfkit.org, pdfmake.org, github.com/parallax/jsPDF, mozilla.github.io/pdf.js, qpdf.readthedocs.io, pdfium.googlesource.com, github.com/embedpdf, mupdf.readthedocs.io); preliminary review of the fork in the comment on #823. Whoever renews the assessment changes the date and above all checks column I.

## Basis for the decision: stay, cantoo, own copy (#823) { #pdf-entscheidung }

**Decided (11/11/2026, maintainer): way a – pdf-lib 1.17.1 stays** and is only extended by the functions needed: `@pdf-lib/fontkit` 1.1.1 for embedded fonts, with three mandatory precautions (prepare the font, `ccmp: false`, NFC; see [Fonts of our own PDFs](../pdf.md#pdf-schriften)). `@cantoo/pdf-lib` will be reassessed as soon as Chinese, Japanese or Korean is needed in PDFs of our own. The basis for this:

**Trial run (11/11/2026, comment in #826)** – test text in six languages, Noto Sans as a subset in letter and stamp:

| | before | a: + `@pdf-lib/fontkit` 1.1.1 | b: cantoo + `@cantoo/fontkit` |
| --- | --- | --- | --- |
| runtime modules in the image | 21.8 MB | 26.1 MB | 42.8 MB |
| “?” in the result | 229 | 0 | 0 |
| Chinese, Japanese, Korean | – | doesn't work (subset of the CFF font invalid) | works |
| Arabic mixed with digits | – | digits reversed (no bidi ordering) | likewise |
| `npm audit` | 0 | 0 | 0 |

With cantoo, 473 of 474 PDF tests ran green (the difference: #456 is fixed there), the bombs still fail at `ladePdf()`, but every import loads `culori`, an HTML parser and `html-entities`, and `@pdf-lib/fontkit` crashes with cantoo.

What had been checked before the decision (as of 04/11/2026):

**Signs of life** (npm registry): `pdf-lib` last 1.17.1, package last changed on 12/05/2022. `@cantoo/pdf-lib`: versions per year 2021: 20, 2022: 9, 2023: 39, 2024: 20, 2025: 13, 2026: 21; last 2.11.1 of 15/09/2026; six people may publish on npm; according to the preliminary review, the commits since 2025 almost all come from one person. `@pdfme/pdf-lib` last 6.2.8 of 23/10/2026. A revival of the original isn't known.

**Dependencies of cantoo 2.11.1:** `tslib`, `culori`, `fflate`, `node-html-better-parser`, plus `html-entities` as a peer. According to the CHANGELOG, `crypto-js`, `pako`, `color`, `@pdf-lib/upng` and `@pdf-lib/standard-fonts` have been removed or embedded. HTML parser and `culori` serve drawing SVG and HTML; whether they are loaded with our calls only the trial run will show. Package size unpacked: 26.3 MB (pdf-lib 1.17.1: 19.5 MB) – most of it is several builds.

**Scope of a copy of our own (way c):** pdf-lib 1.17.1 has 139 source files with 22,740 lines of TypeScript. Of these we don't use the forms (`api/form`, `core/acroform`, annotations: together about 6,900 lines); what remains is about 15,800 lines for parser, objects, streams, writer, embedding and the page API. Plus standard fonts, `upng` and `pako` (or `node:zlib`). Operation would need a fixed routine: compare cantoo's and the original's releases and security advisories monthly, a note in `SECURITY.md` that we maintain the code ourselves, and the [fuzz tests](../pdf.md#pdf-fuzz) as a requirement. Estimated effort: a few hours a month, more with a report.

**What the tests show today (independent of the way):**

- All load points of the PDF place run in the worker pool and load via `ladePdf()` – the check `pdf-stelle.test.ts` records this ([limits of the read points](../pdf.md#pdf-grenzen)).
- The [fuzz tests](../pdf.md#pdf-fuzz) found two kinds of errors, both fixed:
    - **Hangs and memory:** cross-reference streams with impossible widths (`/W [1 2 2147483647]`) or ranges (`/Index [0 2147483647]`) made pdf-lib 1.17.1 run billions of steps when loading – a PDF of a good 1 KB held a worker until the time limit of 10 minutes or filled its memory. `ladePdf()` now checks these entries against the stream's unpacked length (also `/N` and `/First` for object streams, at most 10 million entries) and rejects the impossible with 422. The examples are in the corpus (`querverweis-*.pdf`). Whether cantoo is more robust here belongs to the trial run.
    - **Messages:** broken structures (circular page tree, wrong object kinds) ended with errors from pdf-lib when stamping, with the pages and when shrinking. Now "can't be read as a PDF" or "couldn't be read and therefore not stamped" comes.

**Open at the time, since answered by the trial run above:** the trial run with `@cantoo/pdf-lib` – do all PDF tests stay green unchanged, is #456 fixed there, how big does the image get, how much memory does it need, does the bomb PDF also fail at `ladePdf()` there (it should: the check runs before the library) and which dependencies does it load with our calls. This is how it can be caught up without a change to the repository: install cantoo into an empty directory and start the tests with a load hook that redirects `pdf-lib` to this directory (`node --import <hook> --import tsx --test test/pdf*.test.ts test/stempel.test.ts …`). The list of changes compared with 1.17.1 (parsing, new functions, other) is in the preliminary review in #823 and is not re-checked here.

**Criteria of the security review** (comment on #823): a) only with the protective measures around pdf-lib; b) the main objection `crypto-js` is gone; minified builds, packaging and a single maintainer remain open – with a fixed version and checked lockfile; c) fixed comparison, note in `SECURITY.md`, fuzzing required. Workers, time limit, `ladePdf()` and the fuzz tests stay with every way.
