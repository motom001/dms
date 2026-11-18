# Submitting a contribution {#beitrag-einreichen}

## Before the pull request {#vor-dem-pull-request}

- The issue carries the label **`freigegeben`**.
- **Guard rails kept** ([What every contribution keeps to](index.md#was-jeder-beitrag-einhalt)): no new way outside without explicit consent and without a line in [Ways outside](nach-draussen.md#wege-nach-draussen), no telemetry, nothing from outside servers, open formats in the export, no secret change on updates.
- A branch of its own, e.g. `abwesenheit-vertreter`, from current `main`.
- **Tests** for what is new, in memory and, where data is stored, also against PostgreSQL.
- `npm test` and `npm run typecheck` pass locally, `npm run lint` and `npm run lint:abh` report no errors. Existing violations are on a list that must not grow – move yes, add no ([Style and dependencies](stil.md#bestand)).
- **No new dependency without justification:** whoever adds an npm package under `dependencies` or an Alpine package in the `Dockerfile` answers the questions under [Dependencies](abhaengigkeiten.md) in the PR description. The check in the PR points this out.
- **Manual** updated wherever something visible changes: User, Administrator or Installation manual. New ? symbols need an entry in `shared/src/hilfe.ts`.
- **English manual** maintained too (#730): next to `docs/`, every manual has the folder `docs-en/` with the same structure. Whoever changes a German page changes the English one too – or notes in the pull request that the translation is still missing. `python3 docs/handbuch/werkzeuge/anker.py en` enters the German anchors into new English headings, `--pruefen` reports pages whose structure differs.
- **Release notes:** whoever changes the program adds a snippet `docs/releases/neu/<branch>.md` – first line `art: minor`, `art: patch` or `art: keine`, below it the notes from the users' point of view. The version number is only assigned on merge; nobody touches the numbers in the `package.json` files by hand ([Release](release.md)).
- **New page, new route:** what belongs to it is under [Adding something new](checklisten.md).

## The pull request { #der-pull-request }

- Short German title, e.g. *"0.15.0: Abwesenheit mit Vertreter (#78)"*.
- Description following the template, with `Closes #…`.
- Keep it small: rather two PRs than one that changes a lot at once.
- The checks must be green. If CI fails, the reason is an annotation in the run.

## Style {#stil}

- **Language:** interface, manual, release notes and commit messages in German; the English manual in `docs-en/` in British English. Identifiers in the code are German too (`mappe`, `schreibe`, `laden`). Technical terms without a good German word stay as they are.
- **Terms:** use the words from the [glossary](https://help.ablago.app/benutzer/aktuell/en/begriffe/) and not those listed there under "don't use". A new term goes into `docs/glossar.yml` with the same pull request, with a description and the rating for beginners (see [Who we build for](personas.md)), and its English word into `docs/glossar.en.yml`. `python3 docs/handbuch/werkzeuge/glossar.py` creates the page "Terms" from it in both languages; it is checked in and goes into the pull request too – CI checks that it matches the glossary.
- **The name (#687):** the program is called **Ablago** – one word, only the A in capitals, not "Ablago DMS" and not "ABLAGO". Where the context is missing (page title, store entry, search), the description goes next to it: "Ablago – document filing for home and small businesses", in German "Ablago – Dokumentenablage für zu Hause und kleine Betriebe". If a text means the program itself, it says "Ablago" ("in Ablago"); if the kind of program is meant ("How do I get a DMS?"), "DMS" stays. **These stay**, so that nobody has to change anything: repository names (`dms`, `dms-registry` …), API paths, environment variables `DMS_…`, image names (`ghcr.io/motom001/dms`, `dms-komplett`), package identifiers, permissions (`dms:…`), identifiers in files and barcodes (`DMS-ASN:`, `DMS-TRENNEN`, `DMS-SICHERUNG`). Since the switch (#692), the default target folder for mailboxes, the drive's (WebDAV) sign-in realm and the Unraid templates are also called "Ablago"; the key's check word is "Ablago", old backups with "DMS" stay readable. Logo and colours only come from the folder `marke/` in the repository dms-website.
- **Texts for users:** short, friendly, without jargon, from the reader's point of view ("Save your work").
- **Texts belong in the language file:** whoever writes or changes a text puts it into `shared/src/sprachen/de/<area>.json` and retrieves it with `t('<area>.<key>')` – see [Texts and language files](texte.md#texte-und-sprachdateien). CI checks missing and unused keys.
- **Icons:** single-coloured and from one collection – `<Symbol name="…" />` from `web/src/Symbol.tsx` (shapes from Lucide, colour = text colour, `aria-hidden`; the label carries the meaning). No emoji in the interface; CI checks this (`web/test/symbole.test.ts`). Colour only with meaning, e.g. warning or success.
- **Code:** strict TypeScript, small functions, identifiers that say what they are.
- <span id="kommentare"></span>**Comments explain the why** – what the code does not say itself: a reason, a limit, a trap, a deliberately different solution. The issue number is there **in addition**, so the discussion can be found, never instead of the explanation:

    ```ts
    // Abwesenheit (#78): Die Aufgabe geht an den Vertreter, nicht an die abwesende Person – sonst bliebe sie liegen.
    ```

    Not: `// #78` on its own, and not a retelling of what the line below does. The rule applies to new and changed code; existing comments are not rewritten afterwards. Comments in the code are German, like the identifiers.
- **Commits:** one summary line, below it bullet points if needed.

## Afterwards {#danach}

The maintainer looks at the PR, asks questions or changes small things themselves and merges. From then on everything else runs automatically.
