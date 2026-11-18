# Style and dependencies {#stil-und-abhangigkeiten}

Two tools check the code before it reaches `main` (#899): **ESLint** for typical programming mistakes and functions that are too large, **dependency-cruiser** for the direction of imports between server, interface and shared code. Both run in CI in the job **stil**, in parallel with the tests, and both know the **existing code**: whatever already broke a rule when they were introduced is on a list and is not reported. New code, on the other hand, is fully strict – every violation is an error.

## Commands { #befehle }

| Command | What |
| --- | --- |
| `npm run format` | [format](#formatierung) all files (Prettier; two passes, because Prettier sometimes only finishes breaking long method chains in the second; a little over two minutes in total) |
| `npm run format:pruefen` | only check whether everything is formatted – exactly the CI check |
| `npm run lint` | ESLint across server, tests, interface and `shared` (with type information, a little over a minute); `npm run lint -- --quiet` shows errors only |
| `npx eslint server/src/dienst/dienst.ts` | single files only – quicker while working |
| `npm run lint:abh` | check dependencies (dependency-cruiser, a few seconds) |
| `npm run lint:zaehlen` | count the lists of existing violations against `main` – exactly the CI check |
| `npm run lint:umtragen` | after a move: rewrite the lists, drop orphaned entries, then count |
| `npm run lint:farben` | [no fixed colours](#farben) outside `tokens.css` |
| `npm run lint:klassen` | [every class once and with its owner](#klassen), no unused classes, `z-index` only as a layer |
| `npm run lint:tot` | [dead code](#toter-code): unused files, exports and dependencies (knip, a few seconds) |
| `node .github/werkzeuge/fachordner-pruefen.mjs` | every subject folder with a `*.dienst.ts` has `index.ts` and `README.md` (#1072) |
| `npm run abhaengigkeitsbild` | regenerate the [dependency graph](#abhaengigkeitsbild) |

The tools are fixed versions (without `^`) under `devDependencies` in the root folder and do not go into the image: there, `npm ci --omit=dev --workspace server` installs only the server's runtime packages.

## Formatting { #formatierung }

What the code looks like – indentation, line breaks, quotes, commas – is decided by **Prettier** (#1280), not by the author. That keeps reviews about content. Prettier is a fixed version under `devDependencies`; in the job **stil**, CI checks with `npm run format:pruefen` that every file looks the way Prettier writes it.

- **Settings** in `.prettierrc.json`: line length 140, indentation 2 spaces, single quotes (double in JSX), semicolons, a comma after the last entry of multi-line lists. Template literals (`` `…` ``) are left untouched, including embedded CSS or HTML.
- **Exceptions** in `.prettierignore`: Markdown, YAML, HTML and CSS (CSS stays at “one rule per line” because the [colour check](#farben) works line by line), `package-lock.json`, generated files such as the lists of existing violations, and test fixtures whose bytes matter (signatures, checksums, raw PDF bodies). Add new fixtures of this kind there.
- **Language files** are formatted by Prettier too; `shared/test/sprachdateien-format.test.ts` makes sure every value stays the same.
- **Editor**: in VS Code, the extension *Prettier – Code formatter* (`esbenp.prettier-vscode`) with `"editor.formatOnSave": true` and `"prettier.requireConfig": true`; it uses the Prettier from `node_modules`. In JetBrains IDEs, under *Languages & Frameworks → Prettier*, “Automatic Prettier configuration” and “Run on save”. Without an editor integration, run `npm run format` before committing.
- **`git blame`**: the one commit that formatted everything is listed in `.git-blame-ignore-revs` (section “Formatierer”). GitHub skips it by itself; locally, run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once.
- **Verifiable**: a formatting commit contains nothing but Prettier's output. `bash .github/werkzeuge/formatierung-nachpruefen.sh <commit>` runs Prettier on the state before it and compares – the difference must be empty. CI does this for every new entry in the section “Formatierer” (a condition from security). A later formatting commit (for example after a Prettier update) goes into the same section.

## Rules and values { #regeln }

The settings are in `eslint.config.js` (flat config, ESLint 10). The basis is the recommended rules of ESLint and `typescript-eslint`; on top of that:

| Rule | Value | Target |
| --- | --- | --- |
| `max-params` | 5 | 4 |
| `complexity` | 20 (error) | 10 |
| `ablago/komplexitaet-hinweis` | 15 (warning only) | – |
| `max-lines-per-function` | 105; in `*.tsx` 260; in `*.routen.ts` 105 per handler | – |
| `max-lines` | 700 per file | – |
| `max-depth` | 4 | – |
| `@typescript-eslint/no-floating-promises` | on | – |
| `@typescript-eslint/no-misused-promises` | on | – |
| `@typescript-eslint/no-explicit-any` | on | – |
| `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` | on (interface) | – |
| `ablago/bausteine` | on (`web/src/**/*.tsx` except `web/src/bausteine/`) | – |
| `ablago/knopf-farben` | on (`web/src/**/*.tsx`) | – |
| `ablago/gemerkte-formate` | on (`server/src/`, `shared/src/` except `shared/src/region.ts`) | – |
| `@eslint-community/eslint-comments/require-description` | on | – |

Lengths are counted without blank lines and comments – explanations in the code should cost nothing.

- **Two thresholds for complexity:** in ESLint, a rule has only one level. `ablago/komplexitaet-hinweis` is the same `complexity` rule again, with 15 as a warning; CI shows the warnings only for the files a pull request changes, as an annotation on the line. The custom rules are in `.github/werkzeuge/eslint-ablago.mjs`.
- **Route files (`*.routen.ts`, #960):** each handler is measured on its own. Only the outer registration function is exempt – an exported top-level function that registers the handlers. If the routes are a list at module level, each handler counts on its own anyway.
- **Tests (`server/test/`, `web/test/`, `shared/test/`):** without `max-lines` and `max-lines-per-function`, otherwise the same rules. `test()`, `describe()` and `it()` from `node:test` do not count as "not awaited".
- **Tool scripts** (`.github/werkzeuge/*.mjs`, `server/test/*.mjs`, `web/test/*.mjs`, `web/rauchtest/**/*.mjs`): only ESLint's basic rules, without type information; the smoke tests additionally with `max-lines` 700 per file (#1234). For the styles, `npm run lint:farben` limits every CSS file under `web/src/` to 400 lines, also without blank lines and comments.
- **Building blocks (`ablago/bausteine`, #968):** in the interface a raw `<button>` is an error – use `Knopf`. `<input>`, `<select>` and `<textarea>` are errors when they are not inside `Feld`, `HakenFeld` or `FeldGruppe`. Exempt are invisible inputs (`type="hidden"`, `type="file"`) and the building blocks themselves under `web/src/bausteine/`. For cases the building blocks deliberately do not cover (search field without a visible label, input in a table cell, see [Field](bausteine-feld.md#wann)), an exception with a reason in the code applies. The existing code when the rule was switched on is in `eslint-suppressions.json`.
- **Colour on the button (`ablago/knopf-farben`, #1210):** colour classes via `className` on `Knopf`, `KnopfLink` and `knopfAussehen()` – `gefahr`, `gefahr-rand`, `gruen`, `primaer` – are an error; the colour comes from the kind ([principles](bausteine.md#leitsaetze)). All fixed texts in the value are checked, including in conditions and template strings. The existing code when the rule was switched on (11 places) is in `eslint-suppressions.json` and is reduced in #1211–#1215. Test: `.github/werkzeuge/eslint-ablago.test.mjs`.
- **Remembered formats (`ablago/gemerkte-formate`, #1335):** on the server and in shared code, `toLocaleString(…, {…})` with options is an error (as are `toLocaleDateString` and `toLocaleTimeString`), and so are `new Intl.DateTimeFormat` and `new Intl.NumberFormat`. Each such call builds a new format outside the heap; in a loop (export, titles, information requests) memory grows ([Performance](leistung.md), #970). Use the remembered formats from `shared/src/region.ts` instead: `datumsformat`, `zahlformat`, `zeitText` (like `Date.toLocaleString`, in the region's time zone) and `tagIn`. Without options (`n.toLocaleString(gebietsschema())`) V8 remembers the format itself; that stays allowed. The existing code when the rule was switched on (19 places, mostly once per request or message) is in `eslint-suppressions.json`; whoever touches one of them converts it.
- **Promises in the interface:** `onClick={async () => …}` reports `no-misused-promises`, because React does not wait for the promise and an error would go unnoticed. Better: `onClick={() => void speichern()}` with its own `try`/`catch` in `speichern`.

### Exceptions in the code { #ausnahmen-im-code }

If a rule really has to give way in one place, do it with a reason after `--`:

```ts
}, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste ändert
```

An exception without a reason, without a rule name (`/* eslint-disable */`) or without effect is itself an error. If [Prettier](#formatierung) may break the spot across several lines, prefer a pair `/* eslint-disable rule -- reason */` … `/* eslint-enable rule */` around the statement – a `-line` exception only applies to its one line.

## Existing code: move yes, add no { #bestand }

When the tools were introduced, the code had around 700 violations – mostly functions that are too complex, unused variables and `async` in interface events. They are listed in **`eslint-suppressions.json`** (file → rule → count, created with `eslint --suppress-all`). ESLint does not report them as long as a file has no more violations of a rule than listed there. In the same way, the cycles that already existed were listed in **`.dependency-cruiser-known-violations.json`** – since #1278 (step 5) none is left there; the list stays for other violations of the dependency rules.

For both lists – and for `knip-bestand.json` ([dead code](#toter-code)) – **the total must never rise.** In a pull request, CI counts them against the state of the base (`.github/werkzeuge/ausnahmen-zaehlen.mjs`) and fails if a number grows.

- **Moving is allowed.** If a function moves to another file (for example when splitting `routen.ts`), its entry moves with it: `npm run lint:umtragen` rewrites the lists and drops what no longer occurs. The total stays the same – the check is green.
- **Adding is not.** New or changed code that breaks a rule is fixed, not listed. `lint:umtragen` would include it, but then the number grows and CI reports for which rule.
- **Switching on a new rule.** Whoever introduces a rule freezes only its existing violations: `npx eslint --suppress-rule <rule> --pass-on-unpruned-suppressions .` – the other entries stay as they are. The total rises without the code getting worse; `ausnahmen-zaehlen.mjs` therefore leaves the new rule out and shows its entries as “neue Regel … (Ausgangspunkt)”. A rule is new if it has no entry in the base **and** its name (`'rule'`) is newly added to `eslint.config.js` – so it shows up in the pull request, and a rule that has long been on without entries cannot be frozen silently. From the next state on, its entries count like any others.
- **Changing a limit.** If the value of a rule changes in `eslint.config.js` (as with the [formatter](#formatierung): the lengths ×1.75, #1280), its entries also start afresh: `ausnahmen-zaehlen.mjs` leaves the rule out and shows “Grenze von … geändert (neuer Ausgangspunkt)”. Changed means: the lines naming the rule differ from the base, ignoring comments and whitespace.
- **Fewer is welcome.** Whoever simplifies a function can shrink the list right away with `npx eslint --prune-suppressions .` – otherwise the workflow below does it.

### Cleaning up on main { #aufraeumen }

The workflow **Bestandslisten aufräumen** (`.github/workflows/ausnahmen-aufraeumen.yml`) runs after every push to `main`: `eslint --prune-suppressions` drops entries that no longer occur in the code, and dependency-cruiser rewrites its list. If anything changes, it creates the branch `ausnahmen-aufraeumen` and opens a pull request – or updates the open one.

By a GitHub rule, pull requests created with the `GITHUB_TOKEN` do not start any workflows; the required checks are then missing. So: **close this pull request once and reopen it** – then all checks run as usual. It needs no release note, as it only changes the two lists.

## Colours from tokens { #farben }

Colours live only in **`web/src/tokens.css`** (#966) – as variables with meaningful names, light in the `:root` block and dark in the `@media (prefers-color-scheme: dark)` block. Dark mode therefore has exactly one place; the designs (Workbench → Designs, `web/src/design.ts`) also read both blocks from this file and only put their own primary and secondary colours on top. `web/src/stile/*.css`, `basis.css` and the interface code never contain a colour value, always `var(--name)`; semi-transparent shades are made with `color-mix(in srgb, var(--name) 16%, transparent)`.

| Token | For |
| --- | --- |
| `--grund`, `--flaeche`, `--senke`, `--tinte`, `--leise`, `--linie`, `--linie-stark` | page, surfaces, text and lines (`--linie-stark` for dividers and card borders) |
| `--rand-eingabe` | border of inputs, selects and the colour picker – at least 3:1 against `--flaeche` and `--senke` (WCAG 1.4.11, #1026) |
| `--akzent`, `--gruen`, `--schlecht`, `--warn` with `-zart` and `-tinte` | colour, soft background, text on the full colour |
| `--verwaltung`, `--verwaltung-tinte` | red bar in administration mode |
| `--schatten-zart`, `--schatten`, `--schatten-stark`, `--schleier`, `--schleier-stark` | shadows of floating surfaces, veil behind dialogs |
| `--papier`, `--papier-auswahl`, `--papier-wort`, `--schwaerzung`, `--markierung-1` … `-6` | documents and marks on them – they stay as on paper in the dark, too |

A new token always gets a light **and** a dark value (or deliberately the same one, as for paper). Text on its surface must reach at least 4.5:1 in both modes, the border of inputs (`--rand-eingabe`) at least 3:1 against `--flaeche` and `--senke` – in high contrast, too; `web/test/tokens.test.ts` checks this for the pairs.

**Check:** `npm run lint:farben` (`.github/werkzeuge/farben-pruefen.mjs`) looks in `web/src/**/*.css` except `tokens.css` for hex values, `rgb()`/`hsl()` and the like, and named colours such as `white`; in `*.ts(x)` for colour values in strings. CI runs it in the job **stil**; every finding is an error. Exceptions need a reason on the same line – `/* farbe-erlaubt: printing is always black on white */` – or, for whole files, an entry with a reason in `AUSNAHMEN` in the script (today: `design.ts` with the values for high contrast, the sample documents of the stamp preview).

**Building blocks:** How fields, buttons and other parts of the interface look and behave is defined by the building blocks in `web/src/bausteine/` – pages put them together instead of writing spacing, colours or `aria` attributes themselves. More under [Design and building blocks](bausteine.md).

## Every class once and with its owner { #klassen }

Every class of the styles stands **at top level in exactly one file**, that of its owner (#1270): a class that only one area sets is in that area’s file (`web/src/ablage/ablage-*.css`, `web/src/werkbank/werkbank*.css`, `web/src/einrichtung/einrichtung.css` …), together with its mobile rules; a class that several areas set is in `web/src/stile/gemeinsam-*.css`; a class of a component is in its module. “At top level” means: it is the first class of a selector – `.kachel:hover` belongs to `.kachel`, `.blatt .kachel` belongs to `.blatt`. That way nobody overrides a rule elsewhere without noticing. Global button classes no longer exist: surroundings adjust a button via `[data-knopf="…"]`, a tag via `[data-etikett]`.

`z-index` has **layers** in `tokens.css` (`--ebene-innen`, `--ebene-leiste`, `--ebene-kopf`, `--ebene-menue`, `--ebene-blatt`, `--ebene-panel` …); a part that must lie above its own layer writes `calc(var(--ebene-blatt) + 1)`.

**Check:** `npm run lint:klassen` (`.github/werkzeuge/klassen-pruefen.mjs`) reports a class in more than one file, a class the interface never sets (no word in a string under `web/src`, for modules no `s.name`), and every `z-index` except a layer, `0`, `-1` and `auto`. CI runs it in the **stil** job.

## Dead code (knip) { #toter-code }

**knip** (#1286) looks for files that are never included, exports and types nobody imports, and packages that are used but not listed in the `package.json` of their part (or the other way round). `npm run lint:tot` runs it via `.github/werkzeuge/knip-pruefen.mjs`; CI does the same in the **stil** job.

- **Configuration** in `knip.jsonc`: the parts (root with tools, manual scripts and `shared/`, `server`, `web`, `web/rauchtest`) with their entry points. Whatever knip does not find by itself – a script loaded by an HTML page, a file only `tsc` checks – is listed there as an entry point **with a reason**. The same goes for every exception (`ignoreDependencies`, `ignoreBinaries`, such as the poppler and qpdf programs).
- **Files and dependencies** have no list of existing findings: every finding is an error. A package a part uses belongs in its own `package.json` with an exact version – not “by chance” through another package.
- **Exports and types** found when knip was introduced are listed in **`knip-bestand.json`** (names per file) and stay quiet. A new unused export is an error. The same rule as above applies: the count must not grow (`lint:zaehlen`); `npm run lint:tot -- --umtragen` rewrites the list after a move. Entries without a finding are reported as a notice.
- Before deleting an export knip reports, check briefly whether the manual, a template or an anchor (`shared/entdecken/anker.yaml`) mentions it. The `DMS_…_AB` markers (from which version a manifest field applies) stay even if the code does not read them.

## Dependencies between the parts { #abhaengigkeiten-pruefen }

`.dependency-cruiser.cjs` defines who may import whom (`npm run lint:abh`):

- **No cycles** between files (`kein-kreislauf`) – a cycle is an error, it is not in the baseline. Type-only imports (`import type`, `import('…').Type`) count as well – in `shared/src/` and `web/src/` since #1278 (step 5a), in `server/src/` since step 5b: a cycle through types alone also glues files together – neither can be read or moved without the other. Tests are exempt. How to resolve a cycle:
    - **Shape downwards:** types that several files share go into a file that imports nothing back – the file that evaluates them takes them from there and re-exports them where others used to take them from it. Examples: the settings on a field and a folder type (reminder, "follows from", recognition, format, retention …) live in `shared/src/model/angaben.ts`, the rule set in `model/regelwerk.ts`, the labels in `model/beschriftungen.ts`; the shape of automations in `shared/src/automatisierung-typen.ts`; the rights on a view next to the view (`sichten/baum.ts`). In the server, the shape of routes in `http/routen-typen.ts` (see below), the IMAP connection in `post/postfach-typen.ts`, the plan of the emergency sheet in `pdf/notfallblatt.ts`, file name and text recognition of documents in `dokumente/gemeinsam.ts`, and a subject folder's connection in its `anschluss.ts` (`aufgaben/`, `loeschen/`, `datenschutz/`).
    - **Second door:** parts that the domain model itself imports (validation rules, values and system folder types use e.g. `beschriftung.ts`, `folgtaus.ts`, `tabelle.ts`, `verweisziele.ts`) take the model from `model/basis.ts` – the shape of field, folder type and folder without validation rules – not from `model/index.ts`. Everything in `basis.ts` is also available through `index.ts`.
    - **Narrow connection instead of the whole class:** if a part receives its owner (`new Historie(this)` in the core), it describes with a small interface what it needs from it (`HistorieAnschluss` in `server/src/kern/historie.ts`) instead of importing the class. Likewise, recognition, translation, questions to the archive and the mailboxes do not take the whole `Dienst` but an interface with the parts they call (`ErkennungDienst` in `erkennung/erkennung-basis.ts`, `PostfachDienst` …; `Pick<Class, 'method'>`).
    - **Describe parts instead of importing them:** if the classes of a subject folder call each other through `teile`, each names only the parts it calls (`Pick<Class, …>` for classes further down). If one class calls almost all others and they call it, a file of its own describes what the others need from it, and the class fulfils that (`aufgaben/vertretung-teil.ts`, `class AufgabenVertretung implements VertretungTeil`). The full list that the service assembles sits at the top (`aufgaben/aufgaben-teile.ts`); the folder keeps its connection in `anschluss.ts`.
    - **State next to the interface:** hooks and state that parts of a page share go into a file of their own (`web/src/werkbank/paketeZustand.ts`, `betriebZustand.ts`, `web/src/erreichbarkeit.ts`); a child describes itself what it receives from its parent (`PostfachStand.tsx`).
    - Counter-check: `npm run lint:abh` names the cycle with all files on it.
- **`shared/`** imports neither `server/` nor `web/` – the code runs in both.
- **`web/`** never imports `server/`, **`server/`** never `web/` – not even the tests under `server/test/`; interface tests live under `web/test/` (#1282). Exception: `shared/test/` checks language files and shared code across all parts.
- **Technical folders only via `index.ts`:** the [PDF module](aufbau.md#pdf-stelle) `server/src/pdf/` (except for `arbeit/vorgaenge.ts`, which runs the operations in the worker thread) and `server/src/arbeit/`; the repo `server/src/repo/` only via its three `index.ts` (interface, `pg/`, `speicher/`; `repo-nur-ueber-index`, #1278). Likewise the folders in `shared/src/` that used to be one file – the domain model `model/`, `erkennung/`, `pakete/` and `sichten/` – only via their `index.ts` (`shared-ordner-nur-ueber-index`, #1278, list `SHARED_ORDNER`); imports read `…/shared/src/model` etc. as before. The domain model has a second door, `model/basis.ts` (see above, #1278, step 5). Three exceptions, so that no cycle arises through the door: `feldformate.ts` takes the IBAN check from `erkennung/angaben.ts`, the domain model the type `Feldbedingung` from `sichten/bedingungen.ts`, and the conditions the field type from `model/feldtypen.ts`.
- **Subject folders** (#1072, one rule `fachordner` for all, previously two per folder): from outside only via their `index.ts` – tests included –, and [layers](aufbau.md#schichten) downwards only. The layers are kept in one place in `SCHICHTEN` (core 0, `zugriff` 1, `mappentypen`/`mappen`/`dokumente`/`berechtigungen`/`ereignisse` 2, all others 3, future ones too), the folders without business logic in `TECHNIK`. The core imports only itself, `shared/` and the base (`BASIS` in the file: repo, database, log, texts, settings, files, counters, errors, limits); higher layers also lower subject folders and the tools (`WERKZEUGE`: `messung.ts`, `vektoren.ts`, since #1075 the file technology – `hochladen.ts`, `verkleinern.ts`, `dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`, `paketvolltext.ts` –, since #1077 the technology for post, outgoing and editing PDFs – `pdfseiten.ts`, `graubild.ts`, `schwaerzen.ts`, `ausgabe.ts`, `export.ts`, `xlsx.ts`, `zip.ts`, `mail.ts` –, since #1078 the technology for deleting and data protection – `baum.ts`, `schriftstueck.ts`, `auskunft.ts`, `vollexport.ts`, `abruf.ts`, `passwort.ts`, `tresor.ts` –, `pdf/`, `arbeit/`) – never `dienst.ts`. Routes (`*.routen.ts`) are exempt: `routen.ts` fetches them directly, and they may import the service and their own subject folder. See [core](aufbau.md#kern), [checking permissions](aufbau.md#zugriff).
- **Above the service** (#1278): package management and package creation (`pakete/verwaltung/`, `pakete/erstellung/`) and the automation engine (`automatisierung/motor/`) receive the whole service, and the service imports `pakete/index.ts`. So that no cycle runs through `dienst.ts`, each of these subfolders has its own `index.ts` as a door (`UEBER_DEM_DIENST`). They import `dienst.ts` as a type only (`ueber-dem-dienst-typ`) and, until those move themselves, may import `katalogsignatur.ts`, `projektschluessel.ts`, `entdecken.ts`, `entdecken-werkbank.ts` and `lizenztexte.ts` directly, the engine also `zeitplan.ts`, `system.ts`, `aufgabenmail.ts` and `automatisierung-werkbank.ts`.
- **Without door** (#1278, `OHNE_TUER`): the files that sat directly in `server/src/` until step 4a now live in their folders, but not yet behind their `index.ts`. The rules treat them as before: anyone may import them directly, the layers do not check them, and subject folders may only import those that a list names (base, tools, neighbours, parts above the service). The lists name paths from `server/src/` (e.g. `datenbank/db`). Whoever moves a file behind the door removes it from `OHNE_TUER`. Parts that step 4b split such a file into (`dienst/bauteile.ts`, `webdav/webdav-*.ts`, `post/postfach-typen.ts` from step 5b, `sicherung/sicherung-*.ts`, `sicherung/wiederherstellung-*.ts`, `erkennung/erkennung-*.ts`, `export/vollexport-*.ts`) are listed there with it.
- **Neighbours** (#1278, `NACHBARN`): files without a door that a subject folder may also import – `konten/` may import `anmeldung/anmeldesperre.ts`, `konten/konto-repo.ts`, `anmeldung/zweifaktor.ts`, `anmeldung/passkeys.ts` and `anmeldung/oidc.ts`.
- **Start-up only from `ablago.ts`** (#1278, `start-nur-aus-ablago`): only `ablago.ts` imports the start-up sections in `server/src/start/` (a technical folder like `http/`).
- **Registering new routes** (#960, #1278 step 5b): the routes of a subject area live in `<folder>/<folder>.routen.ts` as a function `(k: RoutenKontext) => Route[]`. The shape (`Route`, `Anfrage`, `Antwort`, `Datei`, `Zugang`) comes from `http/routen-typen.ts`, the context from `http/routen-kontext.ts`, helpers from `http/routen-hilfen.ts` – never from `http/routen.ts`. The function is registered in the list `BEREICHE` in `http/routen.ts`; the order of the list is the registration order (route list, Fastify, OpenAPI), a new function goes at the end unless something else is needed. `http/routen.ts` is the only file that imports subject routes, and no subject file imports `http/routen.ts` – so no cycle arises. What start-up passes to routes and context is described by `RoutenExtras` in `http/routen-extras.ts`; `http/datei-koepfe.ts` builds the headers of delivered files. For tests, `Anfrage`, `Antwort`, `Datei`, `Route` and `dateiKoepfe` remain available through `http/routen.ts` as well.
- **HTTP layer helpers only in routes** (#961, `routen-hilfen-nur-in-routen`): `http/routen-hilfen.ts` and `http/routen-kontext.ts` are imported only by `*.routen.ts` and `routen.ts`. Business logic gets the user passed in instead of reading it from the request itself (for example with `ich(a)`).
- **Door and description:** every subject folder with a `*.dienst.ts` needs `index.ts` and a hand-written `README.md` (`.github/werkzeuge/fachordner-pruefen.mjs`, **stil** job). Nobody checks what the README says; there is no generated part.

### Dependency graph { #abhaengigkeitsbild }

The graph shows the imports at **folder level**; the number on an arrow is the number of imports. Files directly under `src/` appear as "(Wurzel)" (root). `npm run abhaengigkeitsbild` regenerates the source `grafiken/abhaengigkeiten.mmd` and, if the Mermaid CLI (`mmdc`) is installed, the image too.

![Dependencies at folder level: server/src with arbeit, laeufer and pdf; web/src with ablage, assistent, einrichtung, entdecken, profil and werkbank; all use shared/src with the language files](grafiken/abhaengigkeiten.png){ loading=lazy }
