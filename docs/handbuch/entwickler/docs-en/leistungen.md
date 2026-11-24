# Services { #leistungen }

Everything that **processes** documents is a fixed, described **service** in Ablago (#1569). The core stores, shows, finds, backs up, manages permissions – and **brokers**: it accepts a job, checks it, picks exactly one provider and checks what comes back. The provider is Ablago itself (built in, #1570) or a package (#1572). Only the core defines services.

## Name and description { #name }

The name has the form `<object>.<activity>[.<target>]@<major version>`, e.g. `dokument.lesen.text@1`. Groups: `dokument.*` (file), `text.*`, `inhalt.*` (interpretation) and `nachricht.*` (acts outside Ablago). A new major version is a new entry; the old one stays.

Every service in `shared/src/leistungen/katalog.ts` (`LEISTUNGSKATALOG`) has:

- **Input and output schema** with limits – a subset of JSON Schema (`shared/src/leistungen/schema.ts`): text with `maxLength`, lists with `maxItems`, numbers with `minimum`/`maximum`, objects closed (`additionalProperties: false`). `format: 'dokument'` is a document in Ablago – from outside its ID; the core resolves it to the file with the person’s read permission before the provider gets it.
- **Formats:** allowed formats of the result file (empty = no file) and the **file types** the service accepts.
- **`ergebnis`:** `exakt` (computed), `vorschlag` (interpretation, a person accepts it), `intern` (only for Ablago, e.g. vectors – Ablago stores them) or `wirkung` (acts outside, e.g. an email).
- **Time limit** per job and **test cases** – mandatory for every provider, Ablago included. The test files are in `shared/leistungen/testdateien/`; `pruefeTestfaelle(provider, name, read)` runs them.
- **Display name** de/en in the language files under `pakete.leistung.name.<name without version>`, as an activity in verb form (“Read text”). The user interface never says “service” or “provider”, but “Who does this?” and “done by Ablago”; only experts see the technical name in the details.

A test (`shared/test/leistungen-katalog.test.ts`) checks that every entry is complete.

## Catalogue { #katalog }

| Service | Display name | Result | File types | Formats | Time limit |
|---|---|---|---|---|---:|
| `dokument.erstellen.aus-text@1` | Create letter from text | exact | – | `application/pdf` | 30 s |
| `dokument.erstellen.aus-vorlage@1` | Create letter from template | exact | `text/markdown` | `application/pdf` | 30 s |
| `dokument.umwandeln.pdf@1` | Convert to PDF | exact | 11 types | `application/pdf` | 120 s |
| `dokument.umwandeln.pdfa@1` | Convert to PDF/A | exact | 5 types | `application/pdf` | 300 s |
| `dokument.bearbeiten.seiten@1` | Rotate and arrange pages | exact | `application/pdf` | `application/pdf` | 120 s |
| `dokument.bearbeiten.zusammenfuegen@1` | Merge PDFs | exact | `application/pdf` | `application/pdf` | 120 s |
| `dokument.bearbeiten.verkleinern@1` | Shrink PDF | exact | `application/pdf` | `application/pdf` | 300 s |
| `dokument.bearbeiten.schwaerzen@1` | Redact | exact | `application/pdf`, `image/jpeg`, `image/png` | `application/pdf`, `image/jpeg`, `image/png` | 300 s |
| `dokument.lesen.text@1` | Read text | exact | 5 types | – | 600 s |
| `dokument.lesen.erechnung@1` | Read e-invoice | exact | `application/pdf`, `application/xml`, `text/xml` | – | 60 s |
| `dokument.lesen.barcode@1` | Read barcodes | exact | 5 types | – | 120 s |
| `inhalt.erkennen.felder@1` | Recognise fields | suggestion | – | – | 120 s |
| `inhalt.erkennen.mappentyp@1` | Recognise folder type | suggestion | – | – | 120 s |
| `inhalt.beantworten.frage@1` | Answer questions | suggestion | 5 types | – | 300 s |
| `text.uebersetzen@1` | Translate | suggestion | – | – | 300 s |
| `text.vektor@1` | Prepare for search by meaning | internal | – | – | 60 s |
| `nachricht.senden.mail@1` | Send email | effect | all | – | 120 s |
| `nachricht.aufrufen.url@1` | Call address | effect | – | – | 60 s |

Thumbnails and page sizes are not a service; Ablago’s own emails (invitations, notifications) stay in the core.

## What a provider can do: its declaration { #meldung }

A provider declares per service what it can do (#1570) – Ablago itself just like a package:

- **File types:** narrower `dateitypen` than the catalogue (e.g. Ablago’s “Convert” only JPEG and PNG).
- **Input restrictions:** entries from the catalogue (`einschraenkungen` of the service, described in `EINSCHRAENKUNGEN`), e.g. `bereits-pdfa` – “only files that are already PDF/A”. Ablago checks them itself before choosing.

A provider never gets input outside its declaration. If nobody can do it, Ablago answers `leistung.kein-anbieter` with reason `dateityp` or `eingabe` and the catalogue address – visibly, never silently.

**Test cases:** all test cases that match the declaration are mandatory and must pass. The others run along visibly as “not declared” (`pruefeTestfaelle` returns `bestanden`, `gescheitert` or `nicht-gemeldet` per test case) – they are not skipped silently.

**Time limit:** a provider can declare its own (`zeitgrenzeMs`, e.g. by page count); otherwise the catalogue’s applies.

## What Ablago does itself: built-in providers { #eingebaut }

| Provider | Services | Declaration |
|---|---|---|
| Text from PDF and text recognition (`ablago.text`) | `dokument.lesen.text@1` | PDF only (the text layer; scans and images are recognised by a package) |
| Archive version (PDF/A) (`ablago.archiv`) | `dokument.umwandeln.pdfa@1` | PDF only, restriction `bereits-pdfa` – Ablago does not create PDF/A, it takes over originals that already are PDF/A |
| Convert (`ablago.umwandeln`) | `dokument.umwandeln.pdf@1` | JPEG, PNG |
| Edit PDF (`ablago.pdf`) | `dokument.bearbeiten.seiten@1`, `…zusammenfuegen@1`, `…verkleinern@1`, `…schwaerzen@1` | as in the catalogue |
| Letter layout (`ablago.briefsatz`) | `dokument.erstellen.aus-text@1`, `…aus-vorlage@1` | as in the catalogue |
| Read e-invoice (`ablago.erechnung`) | `dokument.lesen.erechnung@1` | as in the catalogue |

The declarations are in `shared/src/leistungen/eingebaut.ts`, the work in `server/src/leistungen/eingebaut.ts` – the same as before (PDF module in the worker, tool service). Each passes the test cases of its declaration (`server/test/leistungen-eingebaut.test.ts`).

**Ablago itself only calls through services:** text recognition (text layer), rotating and splitting pages, merging (also mail), shrinking (by hand, on upload, when passing on), redacting, letter from template, reading e-invoices and “original is already PDF/A” go through `kern.leistung(name, eingabe, { intern?, signal? })`. That is the way for all layers (the core only passes it on). `intern` only goes to built-in providers – what the calling place has already prepared (e.g. the finished letter, the analysis for redacting), so the result stays exactly the same; a package only gets the input. Likewise `intern` only comes back from built-in providers (e.g. page texts of the text layer). Errors of built-in providers stay the previous domain errors; they set no time limit of their own for Ablago because the calling places already have theirs (text recognition by page count, #1550). Ablago’s jobs are in the list – without input and without result.

Not through services: thumbnails and page images, “mail from photos” (several photos as pages of a PDF) and Ablago’s own documents (data access request, deletion log, emergency sheet).

## Jobs { #auftraege }

- **Direct:** `dienst.leistungen.abrufen(wer, name, { eingabe, kontext?, ziel? })` waits for the result.
- **In the background:** `dienst.leistungen.beauftragen(…)` answers at once with the job ID; then the event `leistung.fertig` or `leistung.fehlgeschlagen` (group `auftrag`) follows with job, service and filed document or error code – IDs only. The requester reads result, error text and `kontext` with `auftrag(wer, id)`.
- **`kontext`** (at most 4096 characters as JSON) comes back unchanged.
- **Target:** `{ mappe, register? }`. If the service returns a file, the core files it there as a new document – always with the person’s permissions; it checks the edit permission right at the start and again when filing. Without a target, people get no file back (that would be a way to the outside, see [Data to the outside](nach-draussen.md)); only Ablago itself gets it in the process.
- For people the same ways exist under `GET /api/leistungen` (catalogue), `POST /api/leistungen/<name>/abrufen`, `POST /api/leistungen/<name>/beauftragen` (202) and `GET /api/leistungen/auftraege/<id>`. Packages use services through the package interface (#1571).

**Clear answers** – `details.code` is `leistung.<code>`; until a job is accepted nothing happens:

| Code | Status | When |
|---|---:|---|
| `unbekannt` | 404 | name not in the catalogue |
| `eingabe-ungueltig` | 422 | input does not match the schema (`details.pfad`, `details.grund`), `kontext` too large, wrong target |
| `kein-leserecht` | 404 | a document in the input does not exist or the person may not read it |
| `kein-schreibrecht` | 403 | no “edit” permission on the target folder |
| `ziel-noetig` | 422 | the result is a file, but there is no target |
| `nur-verwaltung` | 403 | service with `wirkung` requested by a person without administration rights |
| `kein-anbieter` | 409 | nobody does it: `details.grund` = `keiner`, `aus`, `dateityp` or `eingabe` (outside the declaration), plus `details.katalog` (address in the catalogue) |
| `ausgabe-ungueltig` | 502 | the result does not match schema or formats – nothing is filed |
| `zeitgrenze` | 504 | time limit exceeded |
| `anbieter-fehler` | 502 | the provider failed |

## Operation { #betrieb }

- Jobs are stored in the table `leistungsauftraege` (migration 125). Each process takes jobs with `FOR UPDATE SKIP LOCKED` and a deadline (`gesperrt_bis`: time limit plus one minute) – like the text recognition queue. If a process dies, its job becomes free again after the deadline; after three attempts Ablago gives up (`abgebrochen`).
- **Restart:** running jobs are repeated – except services with `wirkung`, which become `unterbrochen` (an email may already have gone out).
- **Maintenance mode:** nothing new is taken in the background; afterwards it continues.
- **Retention:** finished jobs keep no input and are deleted after 24, 48 or 96 hours (default 48, `GET`/`PUT /api/werkbank/leistungen/einstellungen`, area “Backup settings”). They are not part of the backup or the full export; **open** jobs go into the backup as a note and continue after a restore.
- Log: module “Jobs”.

## Output per release { #ausgabe }

Every release carries the file `ablago-leistungen.json` (from `shared/leistungen/`): the catalogue with name, version, result type, file types, formats, schemas and display names, the input restrictions, the built-in providers with their declaration, Ablago’s folder types and the test cases including test files (Base64) – machine-readable for dms-registry. A test keeps the file in step with the catalogue; if it changes, rewrite it with `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/leistungen-ausgabe.test.ts`, then Prettier.
