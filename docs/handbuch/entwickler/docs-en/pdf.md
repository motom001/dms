# PDFs { #pdf }

How Ablago reads, edits, creates and displays PDFs in the browser. Why pdf-lib stays is under [decisions](entscheidungen/pdf-bibliothek.md).

## PDF place { #pdf-stelle }

All work on PDFs with **pdf-lib** is in one folder: `server/src/pdf/` (#541). Only there is pdf-lib included; the check `server/test/pdf-stelle.test.ts` (runs with `npm test` in CI) fails as soon as server, interface or `shared` import pdf-lib elsewhere – also via `import()` or `require()`. Tests may still use pdf-lib to examine generated PDFs.

```
server/src/pdf/index.ts          public interface – all modules import from './pdf'
server/src/pdf/seiten.ts         counting, rotating, deleting, reordering, splitting, merging pages, photos as pages
server/src/pdf/stempel.ts        stamp and footer when passing on, image as an A4 page
server/src/pdf/verkleinern.ts    downscaling images (via pdftoppm), tidying up the structure (qpdf)
server/src/pdf/schwaerzen.ts     rebuilding pages, redacting, text layer without redacted words
server/src/pdf/schreiber.ts      text documents by plan (access copy, deletion concept, deletion log)
server/src/pdf/export.ts         PDF of several folders
server/src/pdf/aufkleber.ts      label sheet with barcode
server/src/pdf/anzeige.ts        cleaned copy for display in the browser (#639)
server/src/pdf/demo-dokumente.ts demo documents
server/src/pdf/schrift.ts        Noto Sans as an embedded subset for all PDFs of our own, replacement character (#826)
server/src/pdf/bild.ts, puffer.ts, text.ts   image kind, JPEG dimensions, EXIF; workaround #456; file size
```

**Rules for new code**

- Domain matters stay outside: what goes on a PDF (texts, fields without passwords, permissions, placeholders) is decided by the respective module (`export.ts`, `auskunft.ts`, `ausgabe.ts` …). Only **how** something is drawn or rebuilt goes into the PDF place.
- The operations take and return **simple data** – bytes (`Buffer`/`Uint8Array`), numbers, texts, lists –, never pdf-lib objects. The caller describes text documents as a plan (`Anweisung[]`: text, line, spacing, table, new page) and has them drawn with `textdokumentPdf()`. That way all operations run in the [worker pool](server.md#arbeiter-pool) (#542): `pdf/index.ts` passes them there; a new operation additionally goes into `arbeit/vorgaenge.ts`.
- The PDF place only loads PDFs via `ladePdf()` (`pdf/laden.ts`, #823), never directly with `PDFDocument.load`: it first checks how large the object and cross-reference streams unpack (at most 64 MB per stream, 256 MB together) – otherwise a crafted PDF of a few MB occupies several GB when loading, bypassing the workers' memory limit. In addition, their entries (`/W`, `/Index`, `/Size`, `/N`, `/First`) must match the stream's length; otherwise pdf-lib would run almost endlessly when loading.
- Images only go to pdf-lib via `eigenerPuffer()` (#456: pdf-lib overlooks a Buffer's offset in shared memory and reports "SOI not found" for JPEGs).
- Text only goes onto a PDF via `schriften()` and `pdfText()` from `pdf/schrift.ts` (#826): Noto Sans as a subset, text in NFC, missing characters as “�”. No standard fonts (`StandardFonts`) for new text; the only exception is the codes on the emergency sheet (Courier, plain ASCII). More under [Fonts of our own PDFs](#pdf-schriften).
- The PDF place writes nothing into the log and reads no settings. What the caller is to know is in the result (e.g. `hinweise` when shrinking). The only exception is the note on missing characters: the worker returns it next to the result (`zeichen` in the answer), and the pool writes it into the log.
- Domain errors with an understandable message (`Fachfehler(422, …)`) may come from the PDF place, for instance for encrypted or broken PDFs.

### Fonts of our own PDFs (#826) { #pdf-schriften }

All PDFs Ablago creates itself – stamp, letter, folder export, labels, text documents (access request, deletion concept, deletion log), emergency sheet, demo documents and the invisible text layer when redacting – embed **Noto Sans** (SIL Open Font License 1.1) as a **subset**: only the characters that occur. Before, these were the standard fonts Helvetica and Courier with WinAnsi; everything outside Western Europe silently became “?”.

- **Styles:** regular, bold, italic, bold italic and Noto Sans Mono for `code` in the letter. The emergency sheet keeps Courier bold for key, codes and library ID – they consist of ASCII only.
- **Character range:** Latin with extensions (Turkish, Polish, Czech, Romanian …) and Vietnamese, Greek, Cyrillic, plus punctuation, currency and some special characters. The list is in `BEREICHE` of the script below.
- **Files:** `server/schriften/` (five styles, 1.4 MB together, with `OFL.txt`) in the repository and in the image. That way the Docker build doesn't need Python.
- **Once per worker:** `pdf/schrift.ts` reads the files once, fontkit parses each once and remembers shaped texts. After that, each PDF only embeds its subset. When saving, the name of the subset gets the usual tag of six capital letters (`ABCDEF+NotoSans-Regular`, from the characters used). The same characters give the same files, so the demo documents stay the same for the same seed.

**Three mandatory precautions** – without them the result is wrong, although at first glance it looks right:

1. **Prepare the font:** `server/werkzeuge/schriften/aufbereiten.py` (fontTools) cuts the font down to the ranges above, removes the hinting and writes it anew with `glyf.padding = 4`. With the original files, `@pdf-lib/fontkit` 1.1.1 damages the subset: in the trial run about 60 % of the characters were invisible, while `pdftotext` still reported everything correctly. New version of Noto Sans: `python3 server/werkzeuge/schriften/aufbereiten.py <source folder> server/schriften`, then `schriften.test.ts`.
2. **`features: { ccmp: false }` when embedding:** otherwise fontkit combines characters, and copying or searching gives wrong text (“Thị Liste office” becomes “Thị Lịste offịce”). The features for spacing (`kern`, `mark`, `mkmk`) are off as well. pdf-lib doesn't use them, switching them off only saves time.
3. **Text in NFC:** pdf-lib places combining characters without their offset. `pdfText()` converts every text first, so “ễ” is one character in the PDF.

Plus a workaround in `schrift.ts`: fontkit remembers each glyph with the characters of its first use. Because the font is parsed only once per worker, `schrift.ts` adds the characters as soon as they are known. Otherwise, in the second PDF, the “u” (part of “ü”), for example, would lack its mapping, and copying would give “�”.

**If a character is missing** from the font (Arabic, Hebrew, Chinese, emoji …), the PDF shows the replacement character “�”. Invisible characters such as variation selectors are dropped. The worker returns the missing characters next to the result, and the pool writes a warning into the log **once per job** (module “Documents”, with operation and Unicode numbers).

**Measurement** (11/11/2026, letter with sample texts in six languages and all five styles from `server/test/hilfen-schriften.ts`, average over ten letters with changed text):

| | before (Helvetica, WinAnsi) | Noto Sans as a subset |
| --- | --- | --- |
| size | 13.6 KB, 217 “?” | 41.9 KB, no “?” |
| time per letter | 14 ms | 36–41 ms (first letter in the worker: 170 ms, reads and parses the fonts) |
| stamp on an empty page (PDF 0.6 KB before) | 1.7 KB, 5 ms | 4.8 KB, 20 ms |

**Standard fonts do not stay for plain WinAnsi text**, although they would be smaller and faster – why is explained under [decisions](entscheidungen/eingebettete-schriften.md).

**Limits:** right-to-left scripts (Arabic, Hebrew) and Chinese, Japanese, Korean are **not** included:

- The CJK fonts are CFF fonts. fontkit 1.1.1 builds their subset invalid.
- Arabic and Hebrew lack the bidi ordering, digits would be reversed.
- A CJK font alone has a good 16 MB (Noto Sans CJK SC, one style). That doesn't fit the limit for the image size and mission 2 (“fast even on small hardware”).

If such languages are added, the fonts belong in **language packs** ([#731](https://github.com/motom001/dms/issues/731)), and `@cantoo/pdf-lib` will be reassessed ([decision](entscheidungen/pdf-bibliothek.md#pdf-entscheidung)). Until then, “�” appears with a note in the log.

**Tests:** `server/test/schriften.test.ts`. It reads the sample texts back out of the letter, checks `ccmp` and NFC, embeds the subset with ToUnicode and tag and covers all generators. Above all it checks the **display**: each character of the samples is rendered individually per style with `pdftoppm` and must show ink, in the second PDF of the same worker. With an unprepared font, exactly this test fails.

### Tests with broken PDFs (#823) { #pdf-fuzz }

`server/test/pdf-fuzz.test.ts` feeds deliberately damaged and randomly altered PDFs into all read points – via the worker pool as in operation: pages, shrinking (estimate), stamp, display, archive check and text layer. Expected: no crash of the worker (500), no memory abort (507), no hang (504, and every case under 30 seconds) and, with pages, shrinking and stamp, an understandable message (422). Display and archive check catch errors themselves (download only or "not readable").

- **Corpus:** `server/test/pdf-korpus/*.pdf` – small, broken examples (circular page tree, deep nesting, wrong cross-references and lengths, truncated, references into nothing, broken encryption, no header). The test generates the object stream bomb itself.
- **Randomness:** a small mutator of our own (flipping bytes, truncating, deleting or duplicating ranges, falsifying numbers, swapping streams, sprinkling in syntax, bending `startxref`) with a fixed seed – without a new dependency.
- **Running it:** `cd server && node --import tsx --test test/pdf-fuzz.test.ts`. In the normal CI 120 cases (default). More: `DMS_FUZZ_FAELLE=5000`, another seed: `DMS_FUZZ_SEED=7`. On a schedule, `.github/workflows/fuzz.yml` (weekly and by hand) runs with 5,000 cases and a changing seed.
- **Reproducing a finding:** the message names seed, case and starting PDF. With `DMS_FUZZ_AUSGABE=/tmp/funde` the triggering PDF is there afterwards.
- **Adding a new broken example:** put the file (keep it small, a few KB) under a telling name into `server/test/pdf-korpus/` – it is then automatically part of the corpus and goes into all read points. Only examples without real data, with persona names.
- **Errors found:** vulnerabilities with a security aspect (crash, memory, hang) only get a public issue with details once the fix is merged; before that, report to security (`SECURITY.md`).

**Scorecard "Fuzzing":** the check recognises OSS-Fuzz, ClusterFuzzLite and fuzz functions of some languages, for JavaScript and TypeScript property-based tests with `fast-check`. It doesn't recognise our own mutator; so the check stays unmet as long as `fast-check` (only `devDependencies`) isn't added. The maintainer decides that, as well as the details at Scorecard and for the OpenSSF Best Practices badge.

### Limits of the read points (#542, #823) { #pdf-grenzen }

- Every place that opens an outside PDF with pdf-lib is in `server/src/pdf/` and runs via `arbeite()` in the worker pool. `pdf-stelle.test.ts` checks: `PDFDocument.load` is only in `pdf/laden.ts`; outside the PDF place there are only types from its modules; `pdf/index.ts` only passes on directly helpers that load no PDF; the worker knows every module with `ladePdf()` (`arbeit/vorgaenge.ts`). With `DMS_ARBEITER=0` the operations deliberately run in the main thread.
- poppler (`pdftotext`, `pdftoppm`, `pdfinfo`) and qpdf run as processes of their own with a time limit.
- **Memory:** the limit of 1.5 GB applies **per worker** and only covers the JS heap; the unpacking limit in `ladePdf()` protects against large `ArrayBuffer`s. With N workers, the requirement can in the extreme case be N × 1.5 GB. On small devices (Raspberry Pi with 2–4 GB) therefore set `DMS_ARBEITER=1`.

### Protected PDFs (#827) { #pdf-geschuetzt }

`server/src/dateien/entsperren.ts` recognises protected PDFs (`qpdf --requires-password`, only if `/Encrypt` is in the content) and creates an **unlocked version** with `qpdf --decrypt`. Like the converted versions (#577) it is under `<household>/fassungen/` at the original's checksum, with `entsperrt` in the details (`FassungInfo`). Preview (`vorschau.ts`), full text (`texterkennung.ts`), stamp and shrinking (`ausgabe.ts`, via `Ausgabekontext.entsperrt`), archive version (`archivfassung.ts`, source `lesefassung`) and the display (`GET /dokumente/{id}/inhalt` without `herunterladen`) take it; downloading returns the original.

- **Password:** only via standard input (`--password-file=-`), never on the command line; never in database, log or history. A test checks qpdf's arguments.
- **Limits:** five wrong passwords per person and document in 15 minutes, then 429; qpdf with a time limit (60 s, remembered passwords 20 s per attempt, 2 minutes per document).
- **Remembered passwords:** setting `dokpasswoerter_<account>`, every password individually encrypted with the vault (kind "Remembered passwords for documents" in Workbench → Encryption, re-encrypted on a key change). Routes `/api/konto/dokument-passwoerter…` only in one's own session (no API key, no impersonation); displaying and changing the password only after `…/bestaetigen` (5 minutes per session). New post with "For" tries this person's passwords (`DokumenteDienst.neueDateien` → `PdfEntsperren.neu`).

### Displaying PDFs in the browser (#639) { #pdf-anzeige }

The server delivers files with `dateiKoepfe` (`routen.ts`): everything except PDF with a strict Content-Security-Policy including `sandbox`. PDFs need the browser's built-in viewer and don't get this policy – that's why the browser **never sees the original** when it displays a PDF:

- `fuerAnzeige()` in `http/routen-kontext.ts` takes effect for every answer with `anzeigen: true` and `application/pdf` without an API key – i.e. when viewing in the interface: `GET /api/dokumente/:id/inhalt`, `…/versionen/:nummer/inhalt`, `…/fassung` and `…/archivfassung` (each without `herunterladen`).
- `pdfanzeige.ts` fetches the cleaned copy from the PDF place (`pdf/anzeige.ts`, in the worker pool) and keeps it in memory per SHA-256 of the content (at most 256 MB, oldest out first; failures aren't remembered).
- Removed are JavaScript (`/JS`, name tree `JavaScript`), automatic actions (`/OpenAction`, `/AA`), the actions `SubmitForm`, `Launch`, `ImportData`, `GoToR`, `GoToE`, media actions, XFA forms, embedded files (`/EF`, `EmbeddedFiles`, streams `/EmbeddedFile`) and annotations for file attachments and media. Links (`URI`) and jumps within the document stay.
- If the PDF can't be cleaned (encrypted, damaged), a short text comes (`text/plain`, with sandbox) with `X-DMS-Anzeige: nur-herunterladen`; otherwise `X-DMS-Anzeige: bereinigt` is in the header.
- **Downloading, passing on, export, email and API keys** (also packages) still get the original or the stamped output.
