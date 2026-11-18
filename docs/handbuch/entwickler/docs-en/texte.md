# Texts and languages { #texte }

## Texts and language files { #texte-und-sprachdateien }

Texts for users are not in the code but in **language files** (#473, #727, part of #357). Built in are German (source language) and English (since #729); Ablago addresses everyone informally ("du" in German), and every language takes the familiar form of address (in English simply "you"). Since #727 all areas have been converted: interface, the server's error messages and notices, emails, history and emergency sheet.

**Rule:** a text that people read belongs in the language file – never as words in the code. CI doesn't let new fixed texts in the interface through (see below).

**The other way round (#1264):** technical values – Content-Security-Policy, Permissions-Policy, Cache-Control, Content-Disposition, SQL, the header of the backup file – are constants in the code, never in a language file. `t()` follows the language of the request; a translation would otherwise silently change them for that language only. `server/test/sprachdateien-technik.test.ts` checks this.

```
shared/src/sprachen/de/<area>.json            source language German (du), always complete
shared/src/sprachen/de/<area>/*.json          large areas split (werkbank, meldungen; #1279), index.ts merges them
shared/src/sprachen/de-formal/dritte.json     texts for third parties with "Sie" (see below)
shared/src/sprachen/en/<area>.json            English, British spelling, complete
shared/src/englisch.ts                        loads all English files (a chunk of its own in the interface)
shared/src/sprachwahl.ts                      setting "sprachen", effective language, header X-Sprache
shared/src/sprache.ts                         uebersetzer(), placeholders, plurals, gebietsschema()
web/src/sprache.ts                            t() and tn() with the interface's areas
server/src/sprache/sprache.ts                         t() with the server's areas
shared/src/texte.ts                           t() for shared code (area gemeinsam)
```

**Areas** follow the folders:

| Code | Area |
|---|---|
| `web/src/ablage/*` | `ablage` |
| `web/src/werkbank/*` | `werkbank` (plus older Workbench keys) |
| `web/src/profil/*` (My account) | `profil` |
| `web/src/einrichtung/*` (folder type editor) | `mappentypen` |
| `web/src/einrichtung.tsx`, `web/src/assistent/*` | `einrichtung` |
| other files in `web/src` | `oberflaeche` |
| `server/src/**` (errors, notices, history) | `meldungen` |
| emails | `mail` |
| emergency sheet and emergency access | `notfall` |
| `shared/src/*` | `gemeinsam` |

In addition there are domain areas from earlier issues (`anmeldung`, `automatisierung`, `pakete`, `suche` …); their texts stay there.

**Split areas** (#1279): `werkbank` and `meldungen` are too large for one file. Per language they live in a folder with part files; `index.ts` in the folder merges them into the area. The keys in the code stay the same: `t('werkbank.pakete.dazu.titel')`.

| Part file | contains |
|---|---|
| `werkbank/rahmen.json`, `uebersicht.json` | sidebar, names of areas and groups, templates, header, list search; the overview |
| `werkbank/pakete.json`, `paketerstellen.json`, `sichten.json`, `ablage.json` | sidebar group "Build the Library" |
| `werkbank/benutzer.json`, `verschluesselung.json`, `stempel.json` | group "Users and security" (with emergency sheet and emergency contacts, retention) |
| `werkbank/datenschutz.json`, `postfaecher.json`, `post.json`, `sicherung.json`, `einstellungen.json`, `wartung.json` | the sidebar groups of the same name (`postfaecher.json` with the mail providers) |
| `meldungen/<file>.json` | per domain folder of the server: `dienst`, `pakete`, `paketerstellung`, `sicherung`, `datenschutz`, `anmeldung`, `post`, `dateien` (with `pdf/`), `http`, `start` (start-up, runner, processes), `system` (with database and setup), `einstellungen`, `erkennung`, `ablage` (folders, WebDAV, automation) |

**Where a new key goes:**

- If its **group** already exists – the first part of the key, `pakete` in `pakete.dazu.titel` – it goes into the file that holds the group. Each group is entirely in one file.
- A **new group** goes into the file of its part of the Workbench (a new page under "Post and intake" into `werkbank/post.json`) or of its domain folder in the server (`server/src/post/` into `meldungen/post.json`).
- A **new part file** is only worth it from about 50 keys. It gets the same name in every language and a line in every `index.ts`.
- The same file in every language: if a key is in `de/werkbank/post.json`, it is also in `en/werkbank/post.json`.

**Creating a text**

1. Choose the matching area (table above). A new area is entered in `web/src/sprache.ts` or `server/src/sprache/sprache.ts`; file name = area, lower case, without a dot.
2. Write the key into the JSON file (for split areas into the part file of its group, see above) – flat, parts with a dot or hyphen, starting in lower case: `"vergessen.knopf": "Link anfordern"`.
3. Retrieve it in the code: `t('anmeldung.vergessen.knopf')`. The type check knows all keys and reports typos.

**Naming:** first the component or file, then place and purpose – `vergessen.titel`, `vergessen.knopf`, `fehler.link.abgelaufen`. During the move in #727 the keys arose from file and beginning of the text (`wartungsmodus.alle-jetzt-abmelden`); whoever changes a text may rename the key accordingly. Recurring words ("Save", "Cancel") don't get a shared key – that way every translation stays in context.

**Placeholders** are in single curly brackets: `"passwort.zugang": "Für den Zugang {email}"` → `t('anmeldung.passwort.zugang', { email })`. Names only of letters, digits and `_`. Always store the **whole sentence** with placeholders, never string together parts of sentences – otherwise a translation can't change the order. If a value is missing, `{email}` remains and stands out.

**Building blocks in the sentence** (link, bold, help button) go with `tn()` from `web/src/sprache.ts`: the placeholder gets an element as its value.

```tsx
// "hinweis": "Mehr dazu im {link}.", "hinweis.link": "Administratorhandbuch"
<p>{tn('werkbank.uebersicht.hinweis', { link: <a href={url}>{t('werkbank.uebersicht.hinweis.link')}</a> })}</p>
```

**Plurals** via keys with `_one` and `_other` and the value `anzahl` – instead of `n === 1 ? … : …` in the code:

```json
"dauer.stunden_one": "{anzahl} Stunde",
"dauer.stunden_other": "{anzahl} Stunden"
```

`t('mail.dauer.stunden', { anzahl: 2 })` gives "2 Stunden". The forms follow the language's `Intl.PluralRules` (English needs `one`/`other`, other languages also `few`, `many` …); if one is missing, `_other` applies. A text for exactly one may do without a number ("One folder").

**Dates, numbers, amounts** never format with a fixed `'de-DE'`, but with `gebietsschema()` from `shared/src/sprache.ts` (`de-DE` or `en-GB`, depending on the request's language), e.g. `n.toLocaleString(gebietsschema())`. Fixed formats only remain where a file requires a format (ISO date, CSV for tables).

**Composite keys** (`werkbank.gruppe.${g}`) go through `t.frei(…)` instead of `t(…)`. They escape the type check; the check in CI counts every key with the fixed prefix (`werkbank.gruppe.`) as used. Where you can, write keys out in full.

**Checks in CI** (run with `npm test`, one by one with `npm run test:datei --prefix shared -- test/<file>` or `-w web`, see [Getting started](loslegen.md)):

- `shared/test/sprachdateien.test.ts`: keys the code asks for but that don't exist; keys nobody uses; languages that leave out keys or have extra ones; placeholders that differ between languages; **placeholders a call doesn't supply** (`t('…', { nam })` for `{name}`); plurals without `_other`; empty texts.
- `shared/test/sprachdateien-fest.test.ts`: **fixed texts in the interface** – text between tags, in visible attributes (`title`, `aria-label`, `placeholder`, `titel` …) and as a value in curly braces. What stays the same in every language (product names, commands in `<code>`, example addresses) is allowed; further exceptions are listed with a reason in `AUSNAHMEN` in the test file.
- `shared/test/sprachdateien-teile.test.ts` (#1279): split areas – no key in two part files, each group in one file, every language splits like German, and the code gets exactly the texts of the files (a part file missing from `index.ts` is noticed). For split areas the messages of `sprachdateien.test.ts` name the area (`de/werkbank.json`); you find the part file via the group.
- `web/test/symbole.test.ts`: no coloured emoji and no text characters used as symbols – in the language files too.

**Deliberately still in the code** (#727): log lines (`log.*`, Workbench → Log) stay German so that error messages remain comparable and searchable; the description of the interface (OpenAPI in `server/src/http/api-v1/`) is developer documentation like this handbook; licence texts (since #1278 as files in `server/lizenzen/`); sample data and demo content; the titles of the handbook sections in `shared/src/hilfe.ts` (they follow the headings in the handbook and come with its translation, #730); the fixed values of the post choice fields (`POST_STAND`, `POST_KANAL`, `POST_RICHTUNG` in `shared/src/model/systemtypen.ts`) – they are stored like that in every folder; what is shown is their label (see below). Names, fields and help texts of the system folder types have come from `gemeinsam.json` since #728 (`model.systemtyp.*`, `model.systemfeld.*`, `model.systemhilfe.*`).

**Labels per language** (#728, `shared/src/beschriftung.ts`): what administrators create themselves – names of folder types, fields, tabs, result lists and views, help texts and the options of a choice field – is not in language files but on the entry under `beschriftungen`: language → texts, e.g. `{ en: { label: 'Kind', optionen: { Strom: 'Electricity' } } }`. The source text (`label`, `name` …) is German; if a label is missing, it applies. An option is its **fixed value** (`optionen`), and exactly that is stored in the folder; its label comes from `beschriftungen.<language>.optionen`, otherwise from `beschriftungen.de.optionen`, otherwise it is the value itself. It follows that:

- **Always compare with the fixed value** – conditions, automations, API, full export (CSV, JSON), checking the folder. Inputs that may be a label (direct link, advanced search, the answer of a recognition engine) go through `wertZuOption()`. The simple search also finds a value by its label (`optionsGruppen()`, like synonyms).
- **Always show the label:** `formatiere()` returns the label for choice fields (result list, title, export to Excel and PDF, history); names via `feldLabel()`, `feldHilfe()`, `typName()`, `registerName()`, `listenName()`, `sichtName()`, options via `optionText()`.
- **Saving:** the server cleans up `beschriftungen` (valid language codes, only known parts, options only for existing values). If the field is missing entirely when saving, the existing labels stay – an older program using the API deletes nothing that way; `null` or `{}` removes them. Folder types and views store name and description per language in the `beschriftungen` column (migration 080), fields, tabs and result lists in the folder type's JSON.
- **Allowed languages** come from `erlaubteSprachen()`, based on the `sprachen` setting (Workbench → Languages, #729); the server sets them with `setzeErlaubteSprachen()` at start-up and again every minute. Labels in other languages (from a package, say) stay stored.

**Translating:** a new language gets a folder `shared/src/sprachen/<language>/` with the same files and keys as `de`, e.g. `en/ablage.json`. Placeholders stay the same (CI compares them), plural forms follow the language. If you change or add a German text, you maintain the English one too – CI reports missing keys in `en`. Language packs (#731) register their texts via `registriereSprache()`.

**Choosing the language** (#729):

- **Fallback:** `t()` looks in the chosen language, then in English, then in German; an empty text counts as missing. So no place is ever left blank.
- **Which language applies:** that of the signed-in person (`benutzer.sprache`, migration 081), if allowed; otherwise the one the interface sends in the `X-Sprache` header (the one last used, or the browser's); otherwise the installation's (`sprachen.standard`). `GET /api/sprache` names it, the interface loads it before all other modules (`web/src/main.tsx`) and reloads after a change.
- **Server:** every request runs in `mitSprache()` (AsyncLocalStorage in `server/src/sprache/sprache.ts`); error messages thus come in the person's language. Emails to one person are built by `mitSpracheVon(person, …)` in their language; emails to all administrators (`anVerwaltende`) pass subject and text as a function (`MailText`) so that every recipient gets their own language.
- **Log lines** go through `tDe()` – always German, regardless of the request.
- **Texts for third parties** (`textDritte`, data protection request, retrieval link) and values the server builds once for everyone (module-level constants, titles and names of the system folder types, texts of the administration items) are in the installation's language – computed at start-up or on creation. System folder types and system fields also carry `beschriftungen` from the language files (`systemBeschriftung()`) so that the interface shows them in every language.
- **Machine-translated languages** (later from packages) show the note "Machine-translated – improvements welcome" in My account; the link leads here.

**Library:** a small implementation of its own in `shared/src/sprache.ts` instead of i18next – why is explained under [decisions](entscheidungen/eigene-sprachbibliothek.md).

## Documents for third parties: informal or formal address { #unterlagen-fur-dritte }

The interface always uses the informal German "du". Texts that go to people **outside** Ablago, on the other hand, follow the setting **Form of address in documents for third parties** (#474, Workbench → Data protection requests → Settings, `Datenschutz.anrede`, default `du`). All these texts are in the `dritte` area of the [language files](#texte-und-sprachdateien): the du version in `shared/src/sprachen/de/dritte.json`, the Sie version in `shared/src/sprachen/de-formal/dritte.json`, each with the same keys and placeholders. They are fetched with `textDritte(anrede, schluessel, werte)` from `shared/src/anrede.ts`. The language file check compares both versions; a test additionally checks that the Sie version contains no "du".

New texts for third parties go as keys into both `dritte.json` files – no `anrede === 'sie' ? … : …` in the code – and into this list:

| Output | Code | Keys |
| --- | --- | --- |
| Data protection request: Deckblatt.pdf, Uebersicht.html, LIESMICH.md (#396) | `server/src/datenschutz/auskunft.ts` | `auskunft.*` (suggested rights: `rechteStandard`) |
| Email with the request as a ZIP, email with the retrieval link (#455) | `auskunftMail` in `shared/src/auskunft.ts` | `mail.*` |
| Retrieval page `/abruf` and its messages (#455) | `web/src/abruf.tsx`, `GET /api/abruf/anrede`, `/api/abruf` in `datenschutz/datenschutz.routen.ts` | `abruf.*` |
| Emergency access `/notfall` (#815) | `web/src/notfall.tsx`, `/api/notfall*` in `anmeldung/anmeldung.routen.ts`, `server/src/notfall/notfallcode.ts` | `konten.notfall.*` |
| Emails with folders and documents (#58, #151) | – | none: the user writes the text, only the subject without a form of address is preset |
