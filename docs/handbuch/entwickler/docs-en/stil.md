# Style and dependencies {#stil-und-abhangigkeiten}

Two tools check the code before it reaches `main` (#899): **ESLint** for typical programming mistakes and functions that are too large, **dependency-cruiser** for the direction of imports between server, interface and shared code. Both run in CI in the job **stil**, in parallel with the tests, and both know the **existing code**: whatever already broke a rule when they were introduced is on a list and is not reported. New code, on the other hand, is fully strict – every violation is an error.

## Commands { #befehle }

| Command | What |
| --- | --- |
| `npm run lint` | ESLint across server, tests, interface and `shared` (with type information, a little over a minute); `npm run lint -- --quiet` shows errors only |
| `npx eslint server/src/dienst.ts` | single files only – quicker while working |
| `npm run lint:abh` | check dependencies (dependency-cruiser, a few seconds) |
| `npm run lint:zaehlen` | count the lists of existing violations against `main` – exactly the CI check |
| `npm run lint:umtragen` | after a move: rewrite the lists, drop orphaned entries, then count |
| `npm run lint:farben` | [no fixed colours](#farben) outside `tokens.css` |
| `node .github/werkzeuge/fachordner-pruefen.mjs` | every subject folder with a `*.dienst.ts` has `index.ts` and `README.md` (#1072) |
| `npm run abhaengigkeitsbild` | regenerate the [dependency graph](#abhaengigkeitsbild) |

The tools are fixed versions (without `^`) under `devDependencies` in the root folder and do not go into the image: there, `npm ci --omit=dev --workspace server` installs only the server's runtime packages.

## Rules and values { #regeln }

The settings are in `eslint.config.js` (flat config, ESLint 10). The basis is the recommended rules of ESLint and `typescript-eslint`; on top of that:

| Rule | Value | Target |
| --- | --- | --- |
| `max-params` | 5 | 4 |
| `complexity` | 20 (error) | 10 |
| `ablago/komplexitaet-hinweis` | 15 (warning only) | – |
| `max-lines-per-function` | 60; in `*.tsx` 150; in `*.routen.ts` 60 per handler | – |
| `max-lines` | 400 per file | – |
| `max-depth` | 4 | – |
| `@typescript-eslint/no-floating-promises` | on | – |
| `@typescript-eslint/no-misused-promises` | on | – |
| `@typescript-eslint/no-explicit-any` | on | – |
| `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` | on (interface) | – |
| `ablago/bausteine` | on (`web/src/**/*.tsx` except `web/src/bausteine/`) | – |
| `@eslint-community/eslint-comments/require-description` | on | – |

Lengths are counted without blank lines and comments – explanations in the code should cost nothing.

- **Two thresholds for complexity:** in ESLint, a rule has only one level. `ablago/komplexitaet-hinweis` is the same `complexity` rule again, with 15 as a warning; CI shows the warnings only for the files a pull request changes, as an annotation on the line. The custom rules are in `.github/werkzeuge/eslint-ablago.mjs`.
- **Route files (`*.routen.ts`, #960):** each handler is measured on its own. Only the outer registration function is exempt – an exported top-level function that registers the handlers. If the routes are a list at module level, each handler counts on its own anyway.
- **Tests (`server/test/`):** without `max-lines` and `max-lines-per-function`, otherwise the same rules. `test()`, `describe()` and `it()` from `node:test` do not count as "not awaited".
- **Tool scripts** (`.github/werkzeuge/*.mjs`, `server/test/*.mjs`, `web/rauchtest/*.mjs`): only ESLint's basic rules, without type information.
- **Building blocks (`ablago/bausteine`, #968):** in the interface a raw `<button>` is an error – use `Knopf`. `<input>`, `<select>` and `<textarea>` are errors when they are not inside `Feld`, `HakenFeld` or `FeldGruppe`. Exempt are invisible inputs (`type="hidden"`, `type="file"`) and the building blocks themselves under `web/src/bausteine/`. For cases the building blocks deliberately do not cover (search field without a visible label, input in a table cell, see [Field](bausteine-feld.md#wann)), an exception with a reason in the code applies. The existing code when the rule was switched on is in `eslint-suppressions.json`.
- **Promises in the interface:** `onClick={async () => …}` reports `no-misused-promises`, because React does not wait for the promise and an error would go unnoticed. Better: `onClick={() => void speichern()}` with its own `try`/`catch` in `speichern`.

### Exceptions in the code { #ausnahmen-im-code }

If a rule really has to give way in one place, do it with a reason after `--`:

```ts
}, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste ändert
```

An exception without a reason, without a rule name (`/* eslint-disable */`) or without effect is itself an error.

## Existing code: move yes, add no { #bestand }

When the tools were introduced, the code had around 700 violations – mostly functions that are too complex, unused variables and `async` in interface events. They are listed in **`eslint-suppressions.json`** (file → rule → count, created with `eslint --suppress-all`). ESLint does not report them as long as a file has no more violations of a rule than listed there. In the same way, the cycles that already existed are listed in **`.dependency-cruiser-known-violations.json`**.

For both lists: **the total must never rise.** In a pull request, CI counts them against the state of the base (`.github/werkzeuge/ausnahmen-zaehlen.mjs`) and fails if a number grows.

- **Moving is allowed.** If a function moves to another file (for example when splitting `routen.ts`), its entry moves with it: `npm run lint:umtragen` rewrites the lists and drops what no longer occurs. The total stays the same – the check is green.
- **Adding is not.** New or changed code that breaks a rule is fixed, not listed. `lint:umtragen` would include it, but then the number grows and CI reports for which rule.
- **Switching on a new rule.** Whoever introduces a rule freezes only its existing violations: `npx eslint --suppress-rule <rule> --pass-on-unpruned-suppressions .` – the other entries stay as they are. The total rises without the code getting worse; `ausnahmen-zaehlen.mjs` therefore leaves the new rule out and shows its entries as “neue Regel … (Ausgangspunkt)”. A rule is new if it has no entry in the base **and** its name (`'rule'`) is newly added to `eslint.config.js` – so it shows up in the pull request, and a rule that has long been on without entries cannot be frozen silently. From the next state on, its entries count like any others.
- **Fewer is welcome.** Whoever simplifies a function can shrink the list right away with `npx eslint --prune-suppressions .` – otherwise the workflow below does it.

### Cleaning up on main { #aufraeumen }

The workflow **Bestandslisten aufräumen** (`.github/workflows/ausnahmen-aufraeumen.yml`) runs after every push to `main`: `eslint --prune-suppressions` drops entries that no longer occur in the code, and dependency-cruiser rewrites its list. If anything changes, it creates the branch `ausnahmen-aufraeumen` and opens a pull request – or updates the open one.

By a GitHub rule, pull requests created with the `GITHUB_TOKEN` do not start any workflows; the required checks are then missing. So: **close this pull request once and reopen it** – then all checks run as usual. It needs no release note, as it only changes the two lists.

## Colours from tokens { #farben }

Colours live only in **`web/src/tokens.css`** (#966) – as variables with meaningful names, light in the `:root` block and dark in the `@media (prefers-color-scheme: dark)` block. Dark mode therefore has exactly one place; the designs (Workbench → Designs, `web/src/design.ts`) also read both blocks from this file and only put their own primary and secondary colours on top. `styles.css`, `basis.css` and the interface code never contain a colour value, always `var(--name)`; semi-transparent shades are made with `color-mix(in srgb, var(--name) 16%, transparent)`.

| Token | For |
| --- | --- |
| `--grund`, `--flaeche`, `--senke`, `--tinte`, `--leise`, `--linie`, `--linie-stark` | page, surfaces, text and lines (`--linie-stark` for dividers and card borders) |
| `--rand-eingabe` | border of inputs, selects and the colour picker – at least 3:1 against `--flaeche` and `--senke` (WCAG 1.4.11, #1026) |
| `--akzent`, `--gruen`, `--schlecht`, `--warn` with `-zart` and `-tinte` | colour, soft background, text on the full colour |
| `--verwaltung`, `--verwaltung-tinte` | red bar in administration mode |
| `--schatten-zart`, `--schatten`, `--schatten-stark`, `--schleier`, `--schleier-stark` | shadows of floating surfaces, veil behind dialogs |
| `--papier`, `--papier-auswahl`, `--papier-wort`, `--schwaerzung`, `--markierung-1` … `-6` | documents and marks on them – they stay as on paper in the dark, too |

A new token always gets a light **and** a dark value (or deliberately the same one, as for paper). Text on its surface must reach at least 4.5:1 in both modes, the border of inputs (`--rand-eingabe`) at least 3:1 against `--flaeche` and `--senke` – in high contrast, too; `server/test/tokens.test.ts` checks this for the pairs.

**Check:** `npm run lint:farben` (`.github/werkzeuge/farben-pruefen.mjs`) looks in `web/src/**/*.css` except `tokens.css` for hex values, `rgb()`/`hsl()` and the like, and named colours such as `white`; in `*.ts(x)` for colour values in strings. CI runs it in the job **stil**; every finding is an error. Exceptions need a reason on the same line – `/* farbe-erlaubt: printing is always black on white */` – or, for whole files, an entry with a reason in `AUSNAHMEN` in the script (today: `design.ts` with the values for high contrast, the sample documents of the stamp preview).

**Building blocks:** How fields, buttons and other parts of the interface look and behave is defined by the building blocks in `web/src/bausteine/` – pages put them together instead of writing spacing, colours or `aria` attributes themselves. More under [Design and building blocks](bausteine.md).

## Dependencies between the parts { #abhaengigkeiten-pruefen }

`.dependency-cruiser.cjs` defines who may import whom (`npm run lint:abh`):

- **No cycles** between files (type-only imports do not count).
- **`shared/`** imports neither `server/` nor `web/` – the code runs in both.
- **`web/`** never imports `server/`, **`server/`** never `web/`. Exception: tests under `server/test/`.
- **Technical folders only via `index.ts`:** the [PDF module](aufbau.md#pdf-stelle) `server/src/pdf/` (except for `arbeit/vorgaenge.ts`, which runs the operations in the worker thread) and `server/src/arbeit/`.
- **Subject folders** (#1072, one rule `fachordner` for all, previously two per folder): from outside only via their `index.ts` – tests included –, and [layers](aufbau.md#schichten) downwards only. The layers are kept in one place in `SCHICHTEN` (core 0, `zugriff` 1, `mappentypen`/`mappen`/`dokumente`/`berechtigungen` 2, all others 3, future ones too), the folders without business logic in `TECHNIK`. The core imports only itself, `shared/` and the base (`BASIS` in the file: repo, database, log, texts, settings, files, counters, errors, limits); higher layers also lower subject folders and the tools (`WERKZEUGE`: `messung.ts`, `vektoren.ts`, since #1075 the file technology – `hochladen.ts`, `verkleinern.ts`, `dateiumwandlung.ts`, `archivfassung.ts`, `entsperren.ts`, `paketvolltext.ts` –, `pdf/`, `arbeit/`) – never `dienst.ts`. Routes (`*.routen.ts`) are exempt: `routen.ts` fetches them directly, and they may import the service and their own subject folder. See [core](aufbau.md#kern), [checking permissions](aufbau.md#zugriff).
- **HTTP layer helpers only in routes** (#961, `routen-hilfen-nur-in-routen`): `http/routen-hilfen.ts` and `http/routen-kontext.ts` are imported only by `*.routen.ts` and `routen.ts`. Business logic gets the user passed in instead of reading it from the request itself (for example with `ich(a)`).
- **Door and description:** every subject folder with a `*.dienst.ts` needs `index.ts` and a hand-written `README.md` (`.github/werkzeuge/fachordner-pruefen.mjs`, **stil** job). Nobody checks what the README says; there is no generated part.

### Dependency graph { #abhaengigkeitsbild }

The graph shows the imports at **folder level**; the number on an arrow is the number of imports. Files directly under `src/` appear as "(Wurzel)" (root). `npm run abhaengigkeitsbild` regenerates the source `grafiken/abhaengigkeiten.mmd` and, if the Mermaid CLI (`mmdc`) is installed, the image too.

![Dependencies at folder level: server/src with arbeit, laeufer and pdf; web/src with ablage, assistent, einrichtung, entdecken, profil and werkbank; all use shared/src with the language files](grafiken/abhaengigkeiten.png){ loading=lazy }
