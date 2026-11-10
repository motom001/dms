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
| `@eslint-community/eslint-comments/require-description` | on | – |

Lengths are counted without blank lines and comments – explanations in the code should cost nothing.

- **Two thresholds for complexity:** in ESLint, a rule has only one level. `ablago/komplexitaet-hinweis` is the same `complexity` rule again, with 15 as a warning; CI shows the warnings only for the files a pull request changes, as an annotation on the line. The custom rules are in `.github/werkzeuge/eslint-ablago.mjs`.
- **Route files (`*.routen.ts`, #960):** each handler is measured on its own. Only the outer registration function is exempt – an exported top-level function that registers the handlers. If the routes are a list at module level, each handler counts on its own anyway.
- **Tests (`server/test/`):** without `max-lines` and `max-lines-per-function`, otherwise the same rules. `test()`, `describe()` and `it()` from `node:test` do not count as "not awaited".
- **Tool scripts** (`.github/werkzeuge/*.mjs`, `server/test/*.mjs`, `web/rauchtest/*.mjs`): only ESLint's basic rules, without type information.
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
- **Fewer is welcome.** Whoever simplifies a function can shrink the list right away with `npx eslint --prune-suppressions .` – otherwise the workflow below does it.

### Cleaning up on main { #aufraeumen }

The workflow **Bestandslisten aufräumen** (`.github/workflows/ausnahmen-aufraeumen.yml`) runs after every push to `main`: `eslint --prune-suppressions` drops entries that no longer occur in the code, and dependency-cruiser rewrites its list. If anything changes, it creates the branch `ausnahmen-aufraeumen` and opens a pull request – or updates the open one.

By a GitHub rule, pull requests created with the `GITHUB_TOKEN` do not start any workflows; the required checks are then missing. So: **close this pull request once and reopen it** – then all checks run as usual. It needs no release note, as it only changes the two lists.

## Dependencies between the parts { #abhaengigkeiten-pruefen }

`.dependency-cruiser.cjs` defines who may import whom (`npm run lint:abh`):

- **No cycles** between files (type-only imports do not count).
- **`shared/`** imports neither `server/` nor `web/` – the code runs in both.
- **`web/`** never imports `server/`, **`server/`** never `web/`. Exception: tests under `server/test/`.
- **Only via `index.ts`:** folders with an `index.ts` can only be reached from outside through it – today the [PDF module](aufbau.md#pdf-stelle) `server/src/pdf/` (except for `arbeit/vorgaenge.ts`, which runs the operations in the worker thread) and `server/src/arbeit/`.
- **Prepared:** "downwards only" for the core (#961) and "subject areas only via `index.ts`" are in the file as comments and become active as soon as `server/src/kern/` and the subject folders exist.

### Dependency graph { #abhaengigkeitsbild }

The graph shows the imports at **folder level**; the number on an arrow is the number of imports. Files directly under `src/` appear as "(Wurzel)" (root). `npm run abhaengigkeitsbild` regenerates the source `grafiken/abhaengigkeiten.mmd` and, if the Mermaid CLI (`mmdc`) is installed, the image too.

![Dependencies at folder level: server/src with arbeit, laeufer and pdf; web/src with ablage, assistent, einrichtung, entdecken, profil and werkbank; all use shared/src with the language files](grafiken/abhaengigkeiten.png){ loading=lazy }
