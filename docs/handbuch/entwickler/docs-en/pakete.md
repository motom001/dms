# Developing packages {#pakete-entwickeln}

Packages extend Ablago with ready-made folder types, views and sample folders. Administrators install them under **Workbench → Packages** from the official catalogue (see [Administrator manual → Packages](https://help.ablago.app/admin/aktuell/en/pakete/)).

## Where packages live { #wo-pakete-liegen }

All official packages are in the repository **[motom001/dms-registry](https://github.com/motom001/dms-registry)**, one folder per package under `pakete/<id>/`. The same rules apply there as in Ablago: first an issue as a user story; implementation follows the label `freigegeben`. The rules for packages (licences, what is forbidden, names) are in [REGELN.md](https://github.com/motom001/dms-registry/blob/main/REGELN.md).

## Package kinds and same keys { #paketarten }

Before you create a package, decide its **kind** – the rules are in [REGELN.en.md, "Package kinds"](https://github.com/motom001/dms-registry/blob/main/REGELN.en.md#package-kinds) (dms-registry #157):

- **Foundation package** Basis (organisation, person, storage location) – always installed; every template package depends on it.
- **Template packages** bring folder types, views and automations for one area (Haushalt, Fahrzeuge, Verträge, Rechnungen). They may bring code that **only maintains their own folder types**, e.g. calculating status and deadlines.
- **Function packages** bring code for all folders but no folder types (Texterkennung, PDF/A, AI).
- **Add-ons** extend exactly one other package (`ergaenzt`) and change neither its types nor its permissions.
- **Languages** and **automation packages** bring only texts or only automations.

Two rules keep packages together:

- **A folder type lives in exactly one package.** Other packages refer to it (`vertraege:vertrag`) and list it under `abhaengigkeiten`.
- **Same keys for the same meaning** – `von`, `an`, `betrag`, `datum`, `betrifft`, `steuerjahr`, `zustaendig`, `verbleib_original` … (list in [REGELN.en.md, "Same keys"](https://github.com/motom001/dms-registry/blob/main/REGELN.en.md#same-keys)). Then hit lists and views across several folder types show the same columns. The label may speak per type ("Anbieter", "Rechnungssteller"), the key may not. `pruefen.py` points out deviations in new fields. Post in Ablago follows this (since 0.242, #1042): `von` (text) and `an` (link to a user).
  - **How Ablago merges columns:** A view with several folder types shows the columns of a hit list that **every** type has under the same key (packages: `standard`), and of those only fields that exist in every type with the **same key and the same field type** (for links the field type counts, not the target); otherwise only the system columns. Conditions and the advanced search across several types also require the **same target types** for links. The label never counts – only the key. A `von` as text (post) and a `von` as link (contract) are therefore not a shared column.

**Text templates** (e.g. a cancellation letter) are brought only as Markdown under `inhalt/vorlagen/`: no HTML, no images, links only `https:`, no password fields as placeholders. `pruefen.py` rejects anything else, and Ablago checks the same when installing (#1038, #1040).

## Creating a package { #ein-paket-anlegen }

```sh
git clone https://github.com/<you>/dms-registry && cd dms-registry
werkzeuge/neues-paket.sh mein_paket "My package"   # copies vorlage/ to pakete/mein_paket/
```

Then fill in:

| File | Content |
| --- | --- |
| `manifest.yaml` | `schema: 1` (required), id, name, version (SemVer), description, author, licence, required Ablago version (e.g. `">=0.63.0"`), dependencies, `inhalt` with the paths of the content files (e.g. `mappentypen: inhalt/mappentypen.yaml`), optionally `code` |
| `inhalt/mappentypen.yaml` | folder types with fields, tabs, title and result list |
| `inhalt/sichten.yaml` | views with parent view, folder types and conditions |
| `inhalt/beispiele.yaml` | optional: sample folders with invented data |
| `inhalt/beispiele/…` | optional (from Ablago 0.223.0): example documents for the sample folders (PDF, PNG, JPEG), invented content only |
| `inhalt/vorgaben.yaml` | optional (dms #1038): presets – folders to keep with a fixed key, e.g. contract types |
| `inhalt/vorlagen/…` | optional (dms #1038): text templates of the presets, plain Markdown (`.md`) |
| `inhalt/wortlisten.yaml` | optional (from Ablago 0.127.0): groups of synonyms for the search |
| `inhalt/automatisierungen.yaml` | optional (from Ablago 0.177.0): ready-made automations, off after installation – except the ticked ones (since 0.233.0 preselected with `eingeschaltet: true`) |
| `README.md`, `LICENSE`, `CHANGELOG.md` | description, licence text, changes per version |
| `tests/erwartung.yaml` | what must be there after installation |

The keys in these files are German (as in the registry's schemas), in every language.

### Creating a package from your Ablago { #paket-aus-deinem-dms-erstellen }

Instead of starting with the template, you can export folder types and views you have built in a DMS under **Workbench → Packages → Create package** (from Ablago 0.86.0, see [Administrator manual → Creating a package from your Ablago](https://help.ablago.app/admin/aktuell/en/pakete/#paket-aus-deinem-dms-erstellen)). The result is a ZIP with a folder `<id>/` in the registry's format – `manifest.yaml`, `inhalt/mappentypen.yaml`, `inhalt/sichten.yaml`, if applicable `inhalt/beispiele.yaml`, `README.md` from the description, `CHANGELOG.md`, `LICENSE` with the full licence text and `tests/erwartung.yaml`. It passes `werkzeuge/pruefen.py`; unpacked under `pakete/` it is a finished package folder for a pull request (README and description are still worth expanding).

**Minimum version when creating (dms #651):** "Create package" determines the required Ablago version itself – `mindestversion()` in `server/src/paketerstellung.ts`. The basis is 0.86.0 (since then "Create package" has existed); every function used from `MINDEST_FUNKTIONEN` can raise it: links to Ablago's folder types (0.75.0), links between examples (0.79.0), `erkennung` on fields (0.113.0), `format`, `landFeld` and date limits `min`/`max` (0.121.0), example documents (0.223.0), the field kinds `zeitraum` and `prozent` and `negativ` on amounts (`FELDARTEN_AB`, #1035), the field kind `tabelle` (`DMS_TABELLE_AB`, #1030), `vorbelegen` on link fields (`DMS_VORBELEGEN_AB`, #1037), `gehoertZu` (`DMS_TEILE_AB`, #1031), "refers to the preset" in display conditions (`DMS_VORGABEN_AB`, #1038), field kind `zusammengesetzt` (`DMS_ZUSAMMENGESETZT_AB`, #1050), `archiv` on the folder type (`DMS_ARCHIV_PAKET_AB`, #1051), `merkmal`, `schreibschutz` and "refers to an own organisation" (`DMS_ORGANISATION_AB`, #995). You can then choose `>=X.Y.0` from the minimum version up to your own version (`dmsOptionen()`; minor versions that never existed are missing). **If the package format brings something new that "Create package" takes along, it belongs in `MINDEST_FUNKTIONEN`** – with a test in `server/test/paketerstellung.test.ts`. The licence is a free one from the positive list, a custom one (`LicenseRef-<name>`, text as `LICENSE`) or none (`NONE`); Ablago installs all three, `pruefen.py` only lets the positive list into the catalogue.

This is how the export maps Ablago to the package format:

| In Ablago | In the package |
| --- | --- |
| folder type of your own | entry in `mappentypen.yaml`; key from the type's key, stays the same across versions (remembered) |
| type or view from an installed package | not copied but `abhaengigkeiten: { <package>: ">=<installed version>" }`, links as `<package>:<key>` |
| link to user, role | `dms:benutzer`, `dms:rolle` (then `dms` at least `>=0.75.0`) |
| link to the storage location | `basis:ablageort` with `abhaengigkeiten: { basis: ">=1.6.0" }` (since 0.212; `dms:ablageort` is a deprecated alias) |
| view on a type of your own that wasn't chosen (#656) | `fremde_typen: [{ kennung, name }]` on the view – the type's key (or `<package>:<key>` if it is in a package exported earlier); then `dms` at least `>=0.178.0` |
| default result list | `trefferliste`; further result lists are missing |
| the view's icon (#428) | `symbol` on the view |
| condition on a field | `{ feld, operator, wert }`, dynamic values (today, me …) as an object; conditions on counts, favourites, deadlines and on fixed folders are missing |
| chosen sample folders | `beispiele.yaml` with `schluessel` and `{ beispiel: … }` for links among each other; without passwords and links to folders not chosen |
| their documents (only with "Include their documents", #878) | PDF, PNG and JPEG under `inhalt/beispiele/beispiel_<n>/`, in the example under `dokumente` with `titel` (name in Ablago), `datum` and `register`; other file types stay out with a notice; then `dms` at least `>=0.223.0` |
| archive mode (dms #1051) | `archiv: { jahre, stichtag, leererStichtag }` on the folder type – the reference date only if its field comes along; then `dms` at least `>=0.237.0` |
| number sequence on the field, permissions | missing (the format doesn't know them); the check names them |

## Package format (binding) { #paketformat-verbindlich }

The format is described by the JSON schemas in the registry: [`schema/manifest.schema.json`](https://github.com/motom001/dms-registry/blob/main/schema/manifest.schema.json) and [`schema/inhalt.schema.json`](https://github.com/motom001/dms-registry/blob/main/schema/inhalt.schema.json). The template shows every entry with a comment. Ablago reads exactly this format:

- **Manifest:** `schema: 1` is required; another value is rejected. `inhalt` names the files with `mappentypen`, `sichten`, `beispiele`, `wortlisten` and `automatisierungen` (paths relative to the package folder). The schema also knows `inhalt.rollen`; Ablago doesn't read it.
- **A view's icon** (dms #428): `symbol: <name>` on a view in `sichten.yaml`, a Lucide name from the fixed list in [`shared/src/ansichtsymbole.ts`](https://github.com/motom001/dms/blob/main/shared/src/ansichtsymbole.ts) (e.g. `house`, `car`, `euro`, `heart-pulse`, `mail`). The list belongs to the Ablago version; names are never renamed or removed, only added. Ablago reads an unknown name (package for a newer version) as "without icon", without an error.
- **Unknown fields** (dms #635): fields that Ablago doesn't know it ignores – in the manifest (at the top and in sub-sections such as `autor`, `inhalt`, on folder types, views and examples), in `katalog.json` and in a bundle file's directory. That way new optional fields (e.g. `symbol`, `kuerzel`, `kategorien`) don't break older Ablago; new fields are therefore always optional. Only another format is rejected: `schema` or `format` not equal to 1. The signature still covers the raw bytes of `katalog.json`, unknown fields included. The test `server/test/unbekannte-felder.test.ts` records this.
- **Package ID** (`id`, dms #1084): lower-case letters, digits and `_`, starting with a letter, 2 to 40 characters – e.g. `haus_und_garten`. **One** dot with an addition (up to 20 characters) may follow: `<main package>.<addition>`, e.g. `texterkennung.fra`. The dot means "extends the main package" – such a package must state `ergaenzt: <main package>` (see *Add-ons*), otherwise Ablago rejects it. `dms` is taken. Ablago knows IDs with a dot from 0.229.0; such packages state `dms: ">=0.229.0"`.
- **Keys** (`schluessel` for folder types, views, automations and examples, `key` for fields and tabs) are local in the package, up to 60 characters. Ablago stores package and key separately; to the outside a folder type from a package is called **`package:key`** everywhere – as in references, e.g. `basis:person` (up to 0.228 `basis_person`; that was ambiguous, because package `haus` + type `garten_pflanze` and package `haus_garten` + type `pflanze` gave the same identifier). The limits aren't technical ones – identifiers are text, folder types are linked by uuid –, they keep links, file names and displays readable. `shared/src/kennungen.ts` holds all patterns in one place.
- **Publisher** (`herausgeber`, dms #1084): who publishes the package, as a reversed domain – lower-case letters, digits and hyphens, at least two parts, e.g. `org.example`; the official packages have `app.ablago`. Ablago shows it next to the name ("Contracts · app.ablago") and refuses installation and update if the same ID is already installed from a **different** publisher. Ablago only accepts `app.ablago` (also `app.ablago.*`) from the official catalogue, from a bundle file with its signature or as a file whose checksum is listed there. At most 64 characters, ASCII only, no punycode (`xn--`). Ablago shows other publishers as "not verified", except from a further signed catalogue – then it binds them to that catalogue's key. Add-ons with a dot must have the same publisher as their main package; dependencies only count from the same publisher or from the project. Packages without `herausgeber` count as coming from the publisher of their catalogue: from the official one `app.ablago`, otherwise unknown – then, as before, updates only come from the same source; the first publisher stated applies from then on. Older Ablago ignore the field.
- **Replaced IDs** (`ersetzt`, dms #1084): if a package renames its ID, it names the old one(s) under `ersetzt` (text or list, at most 5). Only an update from the same, at least equally trustworthy source and the same, known publisher moves the installation – the same entry with folder types, folders, settings, code, events and automations, only under the new ID; no second package is created. In the catalogue, `ersetzt` is on the package. This is how the additional languages move from `texterkennung_fra` to `texterkennung.fra`.
- **Conversion** (`umbau`, dms #1041): an update can **convert** existing folder types – for instance when Household hands over contract and insurance to the Contracts package (dms-registry #163). `umbau` in the manifest is a list of steps:

    ```yaml
    umbau:
      - von: haushalt:vertrag            # type whose folders move (package:key; without prefix a former own type)
        nach: vertrag                    # target type: own key or package:key of a dependency
        felder: { vertragspartner: von, kuendigungsfrist: kuendigungsfrist }   # old → new
      - von: haushalt:versicherung
        nach: vertrag
        felder: { versicherer: von, versicherungsnummer: vertragsnummer, beitrag: betrag }
        setzen: { art: { vorgabe: versicherung } }                             # fixed value into empty fields
        register: { unterlagen: dokumente }                                    # documents: tab old → new
    ```

    - **Take over or merge:** if the target type does not exist yet, the first step to it **takes over** the old type with its ID – views, permission rules, AI approval, automations and direct links hang on the ID and stay. Otherwise the types are **merged**: the folders move into the target type with their IDs, reference fields, link tabs, tables, views and automations point to it afterwards, and the empty old type disappears (if folders are still in the bin, it stays as your own type).
    - **Values:** `felder` maps old field identifiers to new ones; several old ones onto one new one merge (the first filled value wins). If a value does not fit the new field type, Ablago tries: text → period ("3 months"; "3 months to the end of the term" as a suggestion), text → number, amount, date or choice, number ↔ amount, anything → text. References only to folders the new field allows. Whatever does not fit, has no mapping or only roughly fits is kept in a **note** on the folder – nothing is lost (passwords never go into a note). Each folder gets a history entry ("Converted by package Contracts 1.0.0").
    - **`setzen`** writes fixed values into empty fields of the target type – text, number, yes/no, list or `{ vorgabe: … }` (a preset (dms #1038), e.g. the contract type "Insurance").
    - **The administrator's changes** are recognised from the package state of the old type: fields they created or whose type they changed become questions in the preview (keep as own field, into the note, into a field of the target type). No conversion without an answer to every question.
    - **Permissions:** when merging, the permission rules of the old type still apply to the moved folders – Ablago puts them in front of the target type's rules, for folders with the read-only field `umbau_aus` (the old type). If the old type was blocked for AI services or denied to a package, that applies to the target type afterwards too. If a rule checks a field that does not come along, or if archive mode would become less strict, the preview refuses the conversion.
    - **Limits (security):** a step only touches types of the same, known publisher; the target is a type of this package or of a dependency, never `dms:`. The package no longer brings the old type. A step whose old type is missing is skipped – a second update never converts anything twice.
    - **Running it:** only on its own (not in a flow with several packages), only with "Full administration", a fresh sign-in and `umbauBestaetigt`; "Back up first" is preselected. Everything runs in **one transaction** – if something stops, nothing has changed.
    - Packages that hand over types get a **major version** (breaking change in the CHANGELOG). Older Ablago versions skip `umbau`; packages using it require `dms: ">=0.243.0"` (`DMS_UMBAU_AB`, final version set when merged).
- **Views with `fremde_typen`** (from Ablago 0.178.0, #656): folder types that the package doesn't bring, a view names with their key (`kennung`, like the `schluessel` of a folder type in Ablago, i.e. `package:key` for types from packages) and a name for messages. Older packages with the form `<package>_<key>` are assigned via the installed packages (not by splitting at the underscore). In a bundle file, a type that is found neither installed nor in the file is an error naming view and type – the bundle file is then not installed (#1084). Ablago assigns them to the type with this key when installing. If it doesn't exist, the view comes without it – if all its types are missing, it is skipped (with its subviews) and the preview says so beforehand; the rest of the package is installed. A later version of the package creates skipped views as soon as the type is there.
- **Fields** as in the Workbench: `key`, `label`, `typ` (text, langtext, formatiert, zahl, betrag, datum, janein, auswahl, referenz, passwort, since dms #1035 zeitraum and prozent, since dms #1030 tabelle, since dms #1050 zusammengesetzt) and the usual properties (`pflicht`, `eindeutig`, `hilfe`, `standard`, `minLen`, `maxLen`, `muster`, `min`, `max`, `nachkomma`, `waehrung`, `negativ`, `optionen`, `mehrfach`, `verweisart`, `frist`, `erkennung`, `wiederfinden`, `format`, `landFeld`, `beschriftungen`).
- **Taking over documents** (dms #937) on the folder type: `ausPost: true|false` ("Can be created from post"; missing = on for types with a documents tab) and `erkennbarAn` ("How to recognise it", a short sentence, at most 300 characters, e.g. "Contains invoice number, amount and payment deadline; the sender is a contract partner"; translations under `beschriftungen.<language>.erkennbarAn`). On an update, Ablago only takes over both if the administrator hasn't set them yet. Older Ablago ignore the entries; "Create package" includes them.
- **Labels per language** (dms #728): `beschriftungen` may be on the folder type, on fields, tabs and views – language → texts. The source text (`name`, `label`, `hilfe`, `beschreibung`) is German. With choice fields, the entries in `optionen` are the **fixed values** stored in the folders; their label per language is under `beschriftungen.<language>.optionen` (fixed value → text). Without a label Ablago shows the fixed value – that's why older packages with pure text options (`optionen: [Strom, Gas]`) work unchanged: every option is its own fixed value. For a language-neutral value, `beschriftungen.de.optionen` gives the German text. If a package states `beschriftungen.de.label` (or `name`, `hilfe`, `beschreibung`), that counts as the source text. Language codes such as `en`, `tr`, `pt-BR`; what doesn't fit Ablago leaves out. On an update, Ablago only adds labels to existing types, fields and tabs where the administrator hasn't labelled anything yet; the preview names the number. Older Ablago ignore the entry; a higher `dms` isn't needed. Example:

    ```yaml
    - key: art
      label: Art
      typ: auswahl
      optionen: [strom, gas, wasser]
      beschriftungen:
        de: { optionen: { strom: Strom, gas: Gas, wasser: Wasser } }
        en: { label: Kind, optionen: { strom: Electricity, gas: Gas, wasser: Water } }
    ```

    Conditions of views and automations as well as the values of the examples always name the fixed value (`wert: [strom]`). "Create package" takes the labels along.
- **Formats and date limits** (dms #535): with `format`, text fields get a check – `email`, `telefon`, `internetseite`, `iban` or `plz`. With `plz`, `landFeld` names the key of the field with the country (text or choice in the same folder type); if it says Germany or nothing, exactly 5 digits are required, otherwise the postcode is free. With `min` and `max`, date fields get limits: a date (`2000-01-01`) or `heute`, e.g. `max: heute` for a birthday. Example: `- { key: plz, label: PLZ, typ: text, maxLen: 10, format: plz, landFeld: land }`. New and changed values must fit – also the package's examples –, stored ones stay valid. On an update, Ablago takes over format or limits on existing fields on which the administrator has set neither format nor limits; the preview names them. Older Ablago ignore the entries.
- **Period, percentage, negative amounts** (dms #1035): `typ: zeitraum` (number and unit) and `typ: prozent` (number, `min`/`max`/`nachkomma` as for `zahl`); `negativ: true`, only on `betrag`, allows negative amounts (missing = ≥ 0). In `beispiele.yaml` a period is written as `{ anzahl: 3, einheit: monate }` (units `tage`, `wochen`, `monate`, `jahre`) or short as `P3M`, a percentage as a number (`19`), a default value as `P3M` or `19`. Example: `- { key: kuendigungsfrist, label: Kündigungsfrist, typ: zeitraum, standard: P3M }`. Ablago before 0.227 turned unknown field kinds into text – so the package needs `dms: ">=0.227.0"`; from now on Ablago rejects unknown field kinds with a message when reading the package. An update can switch `negativ` on for an existing amount (the preview lists it under "Format or limits"), never off.
- **Table** (dms #1030): `typ: tabelle` shows, between the fields, the folders of another type that link here through a link field – for example the items of an invoice. `quelle: { typ, feld }` is required: `typ` is a type reference as for `ziel` (own type or from a dependency, never `dms:`), `feld` the key of the link field there that points to this type (`ziel` or `zielOptional`); optionally `trefferliste: standard` (packages bring only one results list per type; the table shows its columns, never password fields) and `neu` (label of "+ New", at most 40 characters, e.g. "+ Position"; other languages under `beschriftungen.<language>.neu`). A table has no value of its own: not in `beispiele.yaml`, not in `trefferliste` or `titelVorlage`, never `pflicht` or `berechnet`. Example from the Invoices package: `- { key: positionen, label: Positionen, typ: tabelle, quelle: { typ: rechnungsposition, feld: rechnung, trefferliste: standard, neu: "+ Position" } }`. When reading, Ablago checks `quelle`; if it points to a type of this package, the field must exist there and link here. When installing, Ablago adds the table after its source (like links to types that are only being created); when removing, table and link go together. The package needs `dms: ">=0.232.0"` (older versions reject the field kind). The table never adds up totals – that is done by a package with code (calculated fields, notes).
- **Combined** (dms #1050): `typ: zusammengesetzt` with `vorlage` (required, at most 300 characters) – placeholders and filters like `titelVorlage`, from fields of the same type of the kinds text, zahl, betrag, prozent, datum, zeitraum, janein, auswahl and referenz; preferably with `eindeutig: true` for a combination. Example from the Compliance draft: `- { key: kennung, label: Kennung, typ: zusammengesetzt, vorlage: "{bereich} · {zeitraum}", eindeutig: true }`, from Invoices "invoice number per sender": `vorlage: "{von} · {rechnungsnummer}"`. Never `pflicht`, never `berechnet`, no `standard`; Ablago rejects `vorlage` on another field kind, as well as unknown or unsuitable placeholders. **The package doesn't set the identifier:** Ablago calculates the value from its parts on every save (also through the API) and ignores what a package sends for it; not in `beispiele.yaml`. What is stored is a key without language (date `YYYY-MM-DD`, choices as their fixed value, links as folder id, never a title); on a duplicate `POST`/`PUT /api/v1/mappen` answers **422**, with the message in `details.felder` on the first field involved. Readers get the key in `werte` and build the text from `vorlage`, the values and `bezuege`. The package requires `dms: ">=0.239.0"` (`DMS_ZUSAMMENGESETZT_AB`; older versions reject the field kind). An update that changes the template recalculates the folders; identical combinations then don't match (without asking, as when switching on `eindeutig`).
- **Is part of another folder** (dms #1031): `gehoertZu: <field>` on the folder type – the key of this type's link field through which every folder belongs to its parent (notation as in the draft of the Invoices package, there `gehoertZu: rechnung` on the invoice item). The field is a link with exactly one target (`ziel` without a list, without `zielOptional`), without `mehrfach`, with `pflicht: true` and without `anzeigen`; if it points to a type of this package, that type may not have `gehoertZu` itself (no chains). Such folders (parts) only appear at the parent folder – usually through a table – and through direct links, not in views, search, "+ New" and *Where does this belong?*; hits in them count as hits of the parent folder. Hiding is no protection: parts remain reachable through the API, the export and direct links – permissions are set by the administrator. Ablago checks `gehoertZu` when reading and when installing (like the setting in the Workbench); on the first install it sets it as soon as the field exists, on an update only if the type is still independent (only the administrator can switch it off). Older Ablago versions ignore `gehoertZu` – there the parts appear in the views. "Create package" takes the setting along and raises the minimum version (`DMS_TEILE_AB`).
- **Archive mode** (dms #1051): `archiv: { jahre, jahreBeruflich?, stichtag?, leererStichtag? }` on the folder type, spelt as in the draft of the Compliance package (`archiv: { jahre: 2, jahreBeruflich: 10, stichtag: abgeloest_am, leererStichtag: laeuftNicht }`). `jahre` and `jahreBeruflich` are whole numbers from 1 to 30; `jahreBeruflich` applies with the attribute "used for work" (dms #1032) and is not shorter than `jahre`; `stichtag` names a date field of this type (without: creation date); `leererStichtag` is `anlage` (default) or `laeuftNicht` – then the period only starts once the reference date is filled in, and the folder stays locked until then; only with `stichtag`. It is a **default for types the package newly creates:** the preview when installing shows it, afterwards the administrator changes it on the folder type. **A package never changes existing types** – neither installing nor an update sets, shortens, relaxes or switches off the archive mode of an existing type, not even a type of the same package; what the administrator has set stays. Ablago checks `archiv` when reading, like `pruefen.py` (unknown entries, numbers, reference date, `leererStichtag` only with `stichtag`); an error prevents the installation. Older Ablago versions ignore `archiv`. "Create package" takes over the archive mode (without `jahreBeruflich`, which doesn't exist on the type) and raises the minimum version (`DMS_ARCHIV_PAKET_AB`).
- **Fill from document** (`erkennung`, dms #336/#391; up to 0.216 "Use for recognition"): `erkennung: {}` marks a field that "Fill in from document" may fill; optionally `art` (`name`, `vorname`, `nachname`, `funktion`, `nummer`, `iban`, `ustid`, `email`, `internet`, `telefon`, `mobil`, `fax`, `strasse`, `hausnummer`, `plz`, `ort`, `datum`, `betrag`, `zeitraum`, `prozent`, `verweis`, `auswahl` – matching the field kind) and `hinweis` (at most 300 characters, e.g. "Muster 100-####"). Only for text, langtext, zahl, betrag, datum, auswahl, referenz, zeitraum and prozent; older Ablago ignore the entry. On an update, Ablago takes over the marking on existing fields on which the administrator hasn't set anything.
- **Use to find existing folders** (`wiederfinden`, dms #938): `wiederfinden: true` on text, number and link fields – Ablago uses these values to find existing folders again in documents (customer number on the contract partner, contract number and contract partner on the contract, invoice number on the invoice, registration number on the vehicle); independent of `eindeutig`. **If the entry is missing**, Ablago derives it as before: on for fields with `erkennung` whose kind is a feature (number, IBAN, VAT id, email, internet, phone, mobile, fax, name). If you don't want that, write `wiederfinden: false`. On an update, Ablago sets the tick on existing fields only for an explicit `true` and only where it is still missing. Older Ablago ignore the entry.
- **Sections in a field tab** (`abschnitte`, dms #890): on a tab with `art: felder`, a list `[{ vor: <field>, titel?, eingeklappt?, beschriftungen? }]`. A new row starts at field `vor` (a field of this tab, at most one section per field); with `titel` (at most 80 characters, translations under `beschriftungen.<language>.titel`) the folder shows a heading, with `eingeklappt: true` the section is closed when opening (only with `titel`). Without `titel` it is just a line break. Example: `abschnitte: [{ vor: geburtstag }, { vor: iban, titel: Bankverbindung, eingeklappt: true, beschriftungen: { en: { titel: Bank details } } }]`. Display only – the list of fields stays. Ablago leaves out invalid entries (field missing, duplicate). On an update Ablago only adds sections to tabs that have none yet; the preview lists them. Older Ablago versions ignore the entry; “Create package” includes it.
- **Hiding** (`ausgeblendet`, dms #655): `ausgeblendet: true` on a field or tab (not with `art: dokumente`, not on tabs with system fields) – the folder doesn’t show it, values stay, a hidden field is never required. Only applies on the **first installation**: an update doesn’t change whether existing fields and tabs are hidden, and whatever an update brings new is visible. “Create package” includes it. Older Ablago versions ignore the entry.
- **Links** (`ziel` for link fields, `quellen[].typ` for links tabs): `schluessel` for a folder type of this package, `<package>:<schluessel>` for another package's folder type. The other package is then under `abhaengigkeiten`. A package's folder types may also link to each other in a circle.
- **Several target types** (dms #1036): `ziel` may be a **list** – `ziel: [vertrag, fahrzeuge:fahrzeug]`; a single type stays a text as before. With `mehrfach: true`, `gleicherTyp: true` keeps all chosen folders of the same type. `aus_text` only works with exactly one target type. Older Ablago versions reject a list as an invalid link; set `dms:` to the version that brought several target types (see what's new) so they reject it understandably.
- **Optional target types** (`zielOptional`, dms #1036): types of another package this package does **not** depend on, as `<package>:<schluessel>` – for instance the invoice that also *concerns* a vehicle when the package Vehicles is there (Vehicles itself depends on invoices). Ablago adds each of them to the target types as soon as it exists – when installing and later, when the other package is installed; if it is missing, the field stays without it (never an error, no dependency). A link field may have **only** `zielOptional` (e.g. *Tax year* in Household); the form then says the types come with another package. Own types and `dms:` belong under `ziel`. An update adds `zielOptional` to existing fields (never shortened); it doesn't take over new fixed `ziel` entries on existing fields. "Create package" writes optional targets back as `zielOptional`. Example:

    ```yaml
    - { key: betrifft, label: concerns, typ: referenz, mehrfach: true, ziel: [vertrag], zielOptional: [fahrzeuge:fahrzeug, wohnen:wohnung] }
    ```
- **Copy when selected** (`vorbelegen`, dms #1037): on a link field a list of pairs `[{ von, nach }]` – `von` a field of the target type, `nach` a field of this type. When a folder is chosen, Ablago suggests its values in **empty** fields (marked "suggested from …", editable, never overwritten; also with "Fill in from document" and "Take over document"). Example from the Contracts draft:

    ```yaml
    - key: art
      typ: referenz
      ziel: vertragsart
      vorbelegen:
        - { von: kuendigungsfrist, nach: kuendigungsfrist }
        - { von: kuendigung_zum, nach: kuendigung_zum }
    ```

    When reading, Ablago checks: only on `typ: referenz`; only the keys `von` and `nach`; each `nach` once, a field of this type, not the link field itself, no password, no table, not `berechnet`; for target types of this package `von` exists there, is no password and fits (same field kind, text also into long text, multiple values only into `mehrfach` fields, for choices every option also in the target, for links every target). Target types from dependencies are checked the same way when the folder type is created; with several target types a pair applies to every type that has the field. An update brings the pairs to existing link fields on which the administrator has set none (shown in the preview as "Copy when selected: …"). "Create package" takes them along. Needs `dms: ">=0.234.0"` – older Ablago versions skip the setting (the link works, just without suggestions). Ablago always fetches the values with the person's rights, never with a package's account, and never passes them to an AI package.
- **Calculated** (`berechnet: true`, dms #1034): only this package's code writes the value – in Ablago the field is read-only ("calculated by …"), any other writer gets 400 with the package's name. Only on fields of a type the package brings; needs code with `code.rechte.schreiben` on that type, never together with `pflicht`, never on `passwort` – otherwise Ablago refuses the package when installing. An update can make an existing field calculated or release it again with `berechnet: false` (or without the setting); the last value stays. How the package writes (already when creating, notes, history): [Calculated fields and notes](pakete-code.md#berechnet-und-hinweise). Needs `dms: ">=0.231.0"`. Example:

    ```yaml
    - { key: kuendigen_bis, label: Cancel by, typ: datum, berechnet: true }
    ```
- **Own organisation** (`merkmal: eigeneOrganisation`, `schreibschutz: verwaltung`, dms #995): a yes/no field with `merkmal: eigeneOrganisation` tells Ablago which folders are the **own organisation** (package Basis from 1.7.0, field "Own organisation") – at most one such field per folder type, only `typ: janein`. `schreibschutz: verwaltung` (on any field except password and table) means: changeable only in administration mode with the area "Own organisation" or with a role released there; any other writer gets 403 – also through the interface, packages and automations. Only the package brings both; the Workbench can neither set nor remove them. Ablago reads the details of the own organisation **by the meaning of the fields**, not by their key: per meaning (name, street, house number, postcode, town, email, phone; for persons first and last name) the **first** text field with `erkennung` and this kind in tab order – that is why `name` comes before `kuerzel` (the short name also carries `art: name`). In addition the link fields with the keys `verantwortlicher` and `datenschutzbeauftragter` (one folder, person or organisation). Ablago reads nothing more with system rights. For display conditions there is `{ art: eigeneOrganisation, feld }` – a link field points to an own organisation (e.g. section "Outgoing invoice" if "From" is us). Needs `dms: ">=0.238.0"` (`DMS_ORGANISATION_AB`). Example from Basis 1.7.0:

    ```yaml
    - { key: eigene_organisation, label: Eigene Organisation, typ: janein, standard: false, merkmal: eigeneOrganisation, schreibschutz: verwaltung }
    ```
- **Links to Ablago's folder types** (since 0.75.0): `dms:benutzer` and `dms:rolle` (e.g. for "Responsible"). Allowed in `ziel`, `quellen[].typ` and `typen` of a view. Other Ablago types (e.g. post) don't work; the id `dms` is blocked for packages. A package with such links states `dms: ">=0.75.0"` in the manifest; an older Ablago rejects it with an understandable message. The preview shows the types as "User (from Ablago)".
- **Storage location** (since 0.212, issue #883): the folder type comes with the Basis package from 1.6.0 – links are written `basis:ablageort`, and the package names `basis: ">=1.6.0"` under `abhaengigkeiten` (e.g. for the field `verbleib_original` "Whereabouts of original documents"). The former `dms:ablageort` still works as an **alias** and points to the same folder type (Basis's, or the earlier storage location of an older Library); the preview and `pruefen.py` give a "deprecated" notice. The alias is dropped with Ablago 1.0. If there is no storage location, the preview rejects the package with a hint to Basis.
- **Views:** `eltern` is the local key of another view of the package. `bedingungen` are `{ feld, operator, wert }` with the Workbench's operators (`gleich`, `enthaelt`, `kleiner`, `groesser`, `zwischen`, `ausserhalb`, `imZeitraum`, `einerVon`, `zeigtAuf`, `zeigtAufTyp`, `leer`, `nichtLeer`, `ja`, `nein`); with `zwischen` and `ausserhalb`, `wert` is a list with two values. `zeigtAufTyp` (dms #1036) takes a list of type references (`wert: [fahrzeuge:fahrzeug]`) and only works on link fields with several target types; types of a package that isn't installed are dropped.
- **Examples:** `{ typ, werte }`; amounts may be numbers. From Ablago 0.79.0 (#347) additionally:
    - `schluessel` (optional, lower-case letters, digits, `_`; unique in the package) – so that other examples can point to this folder.
    - A link field may be `{ beispiel: strom }` (with `mehrfach` also a list of them), to an example of a **dependency** with a prefix: `{ beispiel: "basis:stadtwerke" }`.
    - Ablago creates the examples so that targets exist beforehand; the order in the file doesn't matter. Circles (A → B → A), unknown keys and prefixes that aren't under `abhaengigkeiten` it rejects when reading.
    - If the examples are installed, those of the dependencies newly installed at the same time come along too. If a dependency is already installed **without** examples, links to it stay empty; the preview says so. Ablago remembers the examples' folders with keys on the installed package (`beispiele`).
    - On an update no examples arise – as before.
- **Example documents** (dms #878, dms-registry #137, from 0.223.0): an example may name files under `dokumente` that are in the package under `inhalt/beispiele/`:

    ```yaml
    - typ: vertrag
      schluessel: heizung_wartung
      werte: { bezeichnung: Wartungsvertrag Heizung, partner: { beispiel: heizungsbau } }
      dokumente:
        - { datei: beispiele/heizung/wartungsvertrag.pdf, titel: Wartungsvertrag, datum: "2023-04-01" }
        - { datei: beispiele/heizung/rechnung-2026.png, register: rechnungen }
    ```

    - `datei` (required) is relative to `inhalt/` and starts with `beispiele/`; folders and names only of letters, digits, `.`, `-` and `_`. Allowed are **PDF, PNG and JPEG** – recognised by their content, the extension must match (`.pdf`, `.png`, `.jpg`, `.jpeg`). Each file at most as large as an uploaded document (100 MB); all files under `inhalt/beispiele/` together at most `PAKET_MAX` (128 MB). They don't count towards the 20 MB limit for the other contents.
    - `titel` (optional, up to 200 characters) is the document's name in Ablago; if the extension is missing, Ablago appends the file's. Without `titel` the file name applies.
    - `datum` (optional, `YYYY-MM-DD`) becomes "uploaded on". Without a date the time of installation applies.
    - `register` (optional) is the key of a document tab of the folder type; without it, the first one. For the package's own folder types Ablago checks this when reading, for types of other packages when creating.
    - Ablago creates the documents **as if uploaded** (`Dienst.ladeHoch`, origin `paket`): preview, full text and archive version according to the Library's settings; only the worker reads PDFs, via `ladePdf()`. Folder events and automations stay quiet (`ohneEreignisse`, question 71); packages that process files (`dokument.hochgeladen`, `volltext.fertig`) get them. If a document fails, the whole package is rolled back – files included.
    - The installed package has `beispielMappen`: per example the id, a checksum of the field values and the documents (`id:sha256`). An example is **unchanged** with the same field values, the same documents, no notes and no link from a folder that isn't an example. Only those are permanently deleted, files included, by "Remove examples" (`POST /api/werkbank/pakete/{id}/beispiele/entfernen`) and by removing the package; changed ones stay and are listed in the response or in the reasons.
    - Older Ablago versions skip `dokumente`; packages using it require `dms: ">=0.223.0"`. Invented content only – persona names, example domains (`example.org`), invalid sample values for IBAN, tax and insurance numbers; `pruefen.py` checks paths, file types and sizes (dms-registry #137).
    - Packages that use this require `dms: ">=0.79.0"` in the manifest.
- **Presets** (dms #1038): `inhalt.vorgaben` names a file with folders the package brings **to keep** – unlike examples always, without a tick, and they stay. Notation as in the Contracts package:

    ```yaml
    # inhalt/vorgaben.yaml
    - kennung: miete                 # fixed, unique within the package
      typ: vertragsart               # own type or paket:schluessel of a dependency
      werte: { name: Miete, kuendigungsfrist: { anzahl: 3, einheit: monate }, kuendigung_zum: Monatsende }
      beschriftungen: { en: { name: Rent } }
      vorlagen:
        - { datei: vorlagen/kuendigung-miete.md, titel: Kündigung Mietvertrag, register: vorlagen }
    # add to another package's preset: attach templates only
    - ergaenzt: vertraege:miete
      vorlagen: [{ datei: vorlagen/garage.md, titel: Stellplatz kündigen }]
    ```

    - **Fixed key:** in Ablago the preset is called `paket:<id>:<kennung>` (column `vorgabe` of the folder). The package ID is part of it: a package only finds its own presets again, never a folder of the administrator or another package's preset – even with the same key. Key like a `schluessel` (lower-case letters, digits, `_`, up to 60 characters); once given, never rename it: a new key is a new preset. At most 200 entries.
    - **`typ`:** an own folder type or `paket:schluessel` of a package **under `abhaengigkeiten`** (Vehicles → contract type "car purchase contract" in Contracts); never `dms:`. The preset gets the permissions of the target type like every folder.
    - **`werte`:** as for examples (amounts as numbers, periods as `{ anzahl, einheit }`); no password fields, no links to examples. Links to presets use `{ vorgabe: miete }` or `{ vorgabe: "vertraege:miete" }` – also in `beispiele.yaml` (instead of a fixed ID there).
    - **`beschriftungen`:** language → field → text. Ablago creates the preset in the **installation's language** (fields without a translation stay German); values are data and don't change with the person's language.
    - **`vorlagen`:** text templates under `inhalt/vorlagen/` (lower-case letters, digits, `-`, `_`, at most two folders, extension `.md`), each entry with `datei` (required), `titel` (document name) and `register` (documents tab; without: `vorlagen`, otherwise the first). At most 20 per preset. Placeholders as in automations (`{vertragsnummer}`, `{von.name}`); they are filled in with "Set text" (dms #1040, see [Writing text templates](#text-vorlagen-schreiben)).
    - **What a template may be** (`server/src/pakete/vorlagen.ts`, the same rules in `pruefen.py`): UTF-8 text without control characters, at most `VORLAGE_MAX` (256 KB, `server/src/grenzen.ts`); **no HTML** – no comments `<!-- -->` either –, **no images** (`![…]`), links only `https://` (in `[text](…)`, `[x]: …` and `<https://…>`; `http:`, `mailto:`, `javascript:`, `data:` appear nowhere in the text); no placeholder names a **password field**. Ablago checks this when reading and again when installing (then against the password fields of all folder types).
    - **`ergaenzt: paket:kennung`:** a package may **only attach templates** to the preset of a package under `abhaengigkeiten` – Ablago rejects any other entry (`werte`, `beschriftungen`, permissions …). If the preset doesn't exist (deleted), the templates are left out; the preview says so.
    - **Installing:** without events (question 71); the creator is the package's service account (history: "Package …"). The preview (`vorgaben`, `ergaenzungen`) shows each preset's state; presets in other packages' types and additions also appear in the box "Adds to folders of other packages".
    - **Update:** the installed package keeps per key (`vorgaben`) the folder, the checksum of the values after the last write (`stand`) and that of the values in the package (`fassung`). If the folder matches `stand`, it gets the new version; otherwise the administrator changed it and it stays (preview: new version in the package). If the folder is missing, it was deleted and stays deleted (`geloescht`). An update replaces templates only while preset and document are unchanged; new ones are added.
    - **Removing:** presets in use (links, notes, other documents) stay; unused ones in own types go with the package, in other packages' types Ablago asks (`409` with `vorgaben`, then `DELETE …?vorgaben=entfernen|behalten`). Templates on other packages' presets (`ergaenzungen`) go with it – only those. Whatever stays keeps its key; a new installation takes it back in.
    - **At runtime** a package (service account) doesn't change or delete another package's preset and doesn't delete documents on it (403) – not even with write permission on the folder type.
    - **Show if … refers to the preset** (dms #1033): on fields and sections, `{ art: vorgabe, feld: art, vorgabe: [miete], nicht?: true }` names a particular supplied folder by its key (own or `paket:kennung` of a dependency); `feld` is a link field. On installation Ablago turns this into "refers to" with the preset's ID; deleted ones don't count. "Create package" writes such a condition back with the key and enters the preset's package as a dependency.
    - Older Ablago skip `inhalt.vorgaben`; packages using it require `dms: ">=0.236.0"` (`DMS_VORGABEN_AB`).
- **Word lists** (dms #356, from 0.127.0): `inhalt.wortlisten` names a file with groups of synonyms for the search – whoever searches for one also finds the others. Every group is `{ woerter: [Kfz, Auto, PKW] }` with 2 to 20 different words (each 2 to 60 characters; upper/lower case and umlauts don't count in the comparison); at most 1000 groups per package. Ablago creates them on installation, replaces them with the package's on an update and removes them with the package; in the Workbench under **Search** they can be viewed. Packages with word lists require `dms: ">=0.127.0"` – older Ablago silently skip the section. Example:

    ```yaml
    # inhalt/wortlisten.yaml
    - woerter: [Kfz, Auto, PKW, Fahrzeug]
    - woerter: [Nebenkosten, Betriebskosten]
    ```

- **Automations** (dms #712, dms-registry #108, from 0.177.0): `inhalt.automatisierungen` names a file with ready-made [automations](https://help.ablago.app/admin/aktuell/en/automatisierungen/) – per entry `schluessel` (fixed, as for types), `name`, optionally `beschreibung`, exactly one If card `wenn`, optionally `und`, at least one card in `dann`. Cards and values as in the editor; folder types as their own key or `package:type` of a dependency. **There are no fixed people** – recipients are a field (`{ art: feld, feld: verantwortlich, sonst: ersteller }`) or the folder's creator. After installation they are **off**; when installing, Ablago asks which should be switched on straight away. Since 0.233.0 (#1082) `eingeschaltet: true` marks the ones offered ticked (can be unticked); if a package sets `eingeschaltet` on none, all are preselected as before. Without a choice when installing (API, dependencies) the ones with `eingeschaltet: true` apply. No update changes on/off of an automation that is already installed. The Then card `{ art: paket, aufgabe: … }` (*Run package on schedule*) calls the package itself – see [Calculating on schedule](pakete-code.md#nach-zeitplan). An update only replaces unchanged automations; when the package is removed, unchanged, switched-off ones go with it. Older Ablago skip the section; packages with it require `dms: ">=0.177.0"`. Example:

    ```yaml
    # inhalt/automatisierungen.yaml
    - schluessel: hu_bald
      name: HU wird bald fällig
      beschreibung: Einen Monat vor der Hauptuntersuchung bekommt der Verantwortliche eine Frist.
      wenn: { art: datum, typ: fahrzeug, feld: hu_faellig, vorlauf: 1, einheit: monate, uhrzeit: "07:00" }
      dann:
        - { art: aufgabe, als: aufgabe, empfaenger: [{ art: feld, feld: verantwortlich, sonst: ersteller }], text: "Für {kennzeichen} wird bald die HU fällig: {datum}." }
    ```

    On the date field only `frist` remains ("is a deadline": appears under *To do*, in the calendar and triggers *Date reached*). Since 0.177.0 the field **no longer creates tasks itself**; `frist.vorlauf`, `einheit`, `wiederholung` and `text` only serve as defaults – a supplied automation with the same advance notice is meant to remind.
- **Dependencies** (`abhaengigkeiten: { <package>: "<range>" }`): packages that must be installed beforehand. When installing, missing dependencies come along in the same process – since Ablago 0.151.0 (#405) also those **with code**: the administrator sees the permissions of all packages on one page and confirms them once; every package keeps its own service account and its own permissions. An update that changes the permissions needs a new confirmation as before.
- **Add-ons** (`ergaenzt`, dms #405, from 0.151.0): a package that extends another – for instance an additional language for text recognition – says so with `ergaenzt`. The extended package must also be under `abhaengigkeiten`. The installation shows add-ons as **ticks below the extended package** (on first installation, in the setup assistant, from a bundle file and later on the installed package), grouped by `gruppe` – without a group under "Add-ons". The group is a short question without a question mark (at most 40 characters); Ablago adds "?". Every add-on stays a package of its own with its own version and its own update. Older Ablago ignore the field; a package doesn't need a higher `dms` for it. Without `ergaenzt` a dependent package only appears as a normal package in the list.

    ```yaml
    # manifest.yaml of an additional language
    abhaengigkeiten:
      texterkennung: ">=2.0.0"
    ergaenzt: { paket: texterkennung, gruppe: Weitere Sprachen }   # or short: ergaenzt: texterkennung
    # Since #1084 with a dot in the ID (id: texterkennung.fra) and – when moving – the former ID:
    ersetzt: texterkennung_fra
    ```

    In the catalogue the entry is per version (`versionen[].ergaenzt`, always as `{ paket, gruppe }`). A collective package "all languages" without content of its own isn't needed for this.
- **Versions:** `dms` and `abhaengigkeiten` take ranges: `>=1.2.0`, `>1.2.0`, `1.2.0` or `=1.2.0`, `^1.2.0` (same major version), `~1.2.0` (same minor version), optionally with an upper limit ` <2.0.0`. With `0.x`, `^` means the same minor version: `^0.63.0` only fits 0.63.x. For the Ablago version therefore write `>=0.63.0` (or your own minimum version).

On an **update**, Ablago only adds: new folder types, fields, tabs and views. Removing or renaming fields, tabs or views has no effect on installed Ablago – so plan the format beforehand. Folder types and views that an administrator has deleted are not created again by an update.

The texts in a package (names, labels, examples) are German as the source text; English and other languages come via `beschriftungen`.

## Describing settings { #einstellungen-beschreiben }

If your package (with code) needs settings, you describe them in the manifest under `code.einstellungen` – a package brings no interface of its own. Ablago shows the form, checks and stores the values (part of the backup) and gives them to the package.

```yaml
code:
  einstellungen:
    - abschnitt: Allgemein
      felder:
        - { schluessel: aktiv, name: Regeln automatisch anwenden, typ: janein, standard: true }
        - { schluessel: token, name: API-Schlüssel, typ: geheim, pflicht: true }
    - liste: regeln
      name: Regeln
      eintrag: Regel
      sortierbar: true
      felder:
        - { schluessel: absender, name: Absender enthält, typ: text }
        - { schluessel: ziel, name: Mappentyp, typ: mappentyp, pflicht: true }
  aktionen:
    - { schluessel: anwenden, name: Regeln jetzt auf neue Post anwenden, bestaetigen: true }
```

- At most **two levels**: sections (`abschnitt`, `hilfe`, `felder`) and lists (`liste`, `name`, `eintrag`, `hilfe`, `sortierbar`, `felder`).
- **Types:** `text`, `mehrzeilig`, `zahl` (`min`/`max`, optionally `schritt` and `vorschlaege`, see below), `janein`, `datum`, `auswahl` and `mehrfachauswahl` (`optionen`), `geheim`, links `mappentyp`, `feld` (with `mappentyp:`), `benutzer`, `rolle`, `sicht`, and since Ablago 0.124.0 `adresse` – the service address, the only one to which the package may go on the network (without `standard`, at most with `beispiel`; see [Packages with code](pakete-code.md#im-manifest)).
- **Numbers with suggestions** (#657): a `zahl` only accepts digits (if applicable with a comma) within `min`/`max` – checked in the form and on saving ("Please a number between 150 and 400."). `schritt: 1` only allows whole numbers. With `vorschlaege`, Ablago shows a selection with labels instead of a number field; "Own value …" opens the number field. Every suggestion lies within `min`/`max`, `standard` must be one of them. Older Ablago versions ignore `schritt` and `vorschlaege` and show a text field.
  ```yaml
  - schluessel: dpi
    name: Auflösung (dpi)
    typ: zahl
    min: 150
    max: 400
    standard: 300
    vorschlaege:
      - { wert: 150, name: "gering – schneller, für klare Ausdrucke" }
      - { wert: 300, name: "normal – empfohlen" }
      - { wert: 400, name: "hoch – kleine Schrift, dauert länger" }
  ```
- **Multiple choice for links** (from Ablago 0.179.0, #658): `mehrfach: true` on `mappentyp`, `benutzer`, `rolle` or `sicht` shows the field like a link field with multiple choice (search, selection below the field, "Remove"); the value is a list of ids. `schliesst_aus: <key>` names a second field of the same link type in the section: what is chosen in one, Ablago doesn't offer in the other, and the server rejects the same id in both (e.g. "Only these folder types" ↔ "Exclude these folder types"). Ablago also shows a **list with exactly one link field** (e.g. `liste: typen` with `eintrag: Mappentyp`) like this, without the package having to change – the list is still what is stored. If an update turns such a list into a field with `mehrfach: true` under the same key, Ablago takes over the chosen ids.
- **Required:** `pflicht: true` requires a value – in the form and when saving. It is the opposite that is marked: fields without `pflicht` are shown with “(optional)” after the name (not for `janein` – a checkbox is always on or off); required fields get no asterisk.
- **Values** as the package gets them: section fields under their key, lists as a list of objects (with `_id` per entry). Links are ids (with `feld`: `{ typ, feld }`), secrets in plain text – only for the package itself.
- `code` also includes `sprache`, `quelle`, `ereignisse`, `rechte` and `netz` (see [Packages with code](pakete-code.md#im-manifest)); the example above only shows settings and actions.
- **Credentials only as `geheim`**, never as `text` and never with `standard`.
- On an **update**, new fields get their default, existing values stay, dropped ones are removed.

`werkzeuge/pruefen.py` checks keys, defaults, options, secrets and links. Expert mode with **Upload package** is suitable for trying things out.

What the package does with the settings and which permissions it needs is described in [Packages with code](pakete-code.md).

## Writing text templates { #text-vorlagen-schreiben }

With **Set text** (dms #1040), Ablago turns a text template into a letter as a PDF – in the interface via **Folder ▾ → Letter from template …**, for packages and scripts via the API. How templates get into a package is described above under *Presets* (`vorlagen` on a preset or supplement); what a template may contain, likewise.

```markdown
# Cancellation of contract {vertragsnummer}

Dear Sir or Madam,

I hereby cancel the contract **{bezeichnung}** at the earliest possible date, which is {kuendigen_bis}.
Customer number: {von.kundennummer}

Please confirm the cancellation in writing.

Yours faithfully



Sample without guarantee, not legal advice – have it checked by an expert if in doubt.
```

- **Layout of the letter:** Ablago sets letterhead, address, place and date – the template only contains subject and text. The **first heading** (`# …`) becomes the **subject** (bold, and the PDF title); without one the PDF is named after the template. The **letterhead** comes from the folder in the reference field `an` (customer; person or organisation), otherwise from the own organisation (#995, only name, address, phone, email); the **address** from the folder in the reference field `von` (the other party). So use the [same keys](#paketarten) `von` and `an`.
- **Markdown:** headings (`#`, `##`, `###`), paragraphs, lists (`-`, `1.`), quotes (`>`), **bold**, *italic*, `code`. A single line break stays a line break (closing, address in the text); **two or more blank lines** leave space, e.g. for the signature. Links appear as text with the address in brackets – nothing in the PDF is clickable.
- **Placeholders** as in automations: `{feld}` for a field of the folder, `{verweis.feld}` for a field of the folder behind it (up to three levels, e.g. `{von.kundennummer}`), plus `{heute}`, `{titel}` and `{mappentyp}`. Values use the format of their field type in the **language of the template** (date `31.12.2026`, amount `650,00 €`, period `3 Monate` for German, choices with their label); references as the folder's title. **There are no free formats or expressions** (such as `{datum:TT.MM.JJJJ}`) – only the fixed list of field types.
- **Values are text:** Ablago first parses the template and then inserts the values – in one pass. A field value such as `**bold**`, `[link](…)` or `{other_field}` appears as it is. In the filled-in text (`.md` next to the PDF) such characters are escaped with `\`.
- **Gaps:** If a value is missing, the person may not read it (folder or referenced folder; when downloading also without export right E) or the placeholder names a field that does not exist, the letter shows **[Label]**, e.g. "[Contract number]". Password fields are forbidden as placeholders – checked when installing and before every typesetting.
- **Language:** that of the template's full text if Ablago knows it, otherwise that of the installation – never that of the interface. It is written as `/Lang` into the PDF.
- **Limits** (`server/src/grenzen.ts`): filled-in text at most 512 KB (`TEXTSATZ_TEXT_MAX`), PDF at most 30 pages and 4 MB (`TEXTSATZ_SEITEN`, `TEXTSATZ_PDF_MAX`), typesetting at most 30 seconds in the worker (`TEXTSATZ_ZEIT_MS`). Beyond that: 413.

**For packages (API):** `GET /api/v1/mappen/{id}/vorlagen` lists a folder's templates (on the folder itself and on folders it refers to) with the state of their placeholders; `POST /api/v1/mappen/{id}/vorlagen/{dokument}/setzen` with `{ "ziel": "ablegen", "register": "dokumente" }` files the PDF and the filled-in text as new documents (response: both documents and the gaps); with `{ "ziel": "herunterladen" }` the PDF is the response. The service account needs read access to the folder, `dokumente: lesen` for the list, `dokumente: schreiben` and edit rights on the folder for setting. The PDF names package and template in its metadata (subject). Minimum version: `dms: ">=0.242.0"` (`DMS_TEXTSATZ_AB` in `shared/src/textsatz.ts`).

## Checking { #prufen }

```sh
pip install pyyaml jsonschema
python3 werkzeuge/pruefen.py pakete/mein_paket      # schema, required files, links, licence, changelog
python3 werkzeuge/katalog.py --probe /tmp/katalog    # can the catalogue be built?
```

The same checks run in the pull request. A published package never changes: every change needs a higher version and an entry in `CHANGELOG.md`.

## Pull request and catalogue { #pull-request-und-katalog }

1. Pull request with `Closes #…`; every commit carries a `Signed-off-by:` (`git commit -s`).
2. After the merge, CI builds an archive `<id>-<version>.zip` per package version and the catalogue `katalog.json` with SHA-256, signs the catalogue (`katalog.sig`, see below) and puts everything on the branch `gh-pages`. Ablago finds the package on the next **Fetch catalogue**.

## Signed catalogue { #signierter-katalog }

From Ablago 0.141.0, Ablago checks **where** a catalogue comes from (#594, registry: motom001/dms-registry#74). The checksum per archive only proves that a package didn't break on the way; the signature over `katalog.json` proves that the whole catalogue – and with it every checksum in it – comes from the Ablago project.

- **Method:** Ed25519 over the **exact bytes** of `katalog.json`. Ablago checks with `crypto.verify` from Node, without a further dependency (`server/src/katalogsignatur.ts`).
- **`katalog.sig`** is next to `katalog.json`, separately, so that older Ablago versions read the catalogue unchanged:

    ```json
    { "format": 1, "verfahren": "ed25519", "schluessel": "6d868387314e64df", "signatur": "<64 bytes, Base64>", "erstellt": "2026-11-02T10:00:00Z" }
    ```

- **Identifier and fingerprint** of a key: SHA-256 over the 32 bytes of the public key, hexadecimal. The identifier is the first 16 characters, the fingerprint all 64 in groups of four. `werkzeuge/signieren.py fingerabdruck <file.pub>` in the registry calculates the same way.
- **Two project keys:** signing key (secret in the registry's CI) and reserve key (offline with the maintainer). Both public keys are fixed in Ablago; a signature with either of them is valid.
- **`erstellt`:** Ablago remembers per catalogue the newest validly signed state (setting `paket_katalog_staende`, part of the backup) and rejects an older one online – that way no old catalogue with a package version that has since been fixed can be slipped in. A bundle file (without internet) only shows "state of …" and warns from 90 days.
- **Transition:** in 0.141.0 there is only a warning for the official catalogue without a signature. One minor version later it **must** be signed (separate issue). An **invalid** signature already counts like an outside source now: the origin must be confirmed, and the log records it.
- **Redirects:** when fetching catalogue, signature, key and archives, Ablago only follows redirects to `https://` addresses (at most five).

### Replacing the project keys { #projektschluessel-austauschen }

The public keys are in **one** place: `server/src/projektschluessel.ts`. There are the maintainer's real keys (`signier.pub` and `reserve.pub` from motom001/dms-registry#74, `test: false`); their fingerprints are in `SECURITY.md`. Ablago 0.141.0 to 0.144.1 still had test keys in this place.

| Key | Identifier | Fingerprint |
| --- | --- | --- |
| Signing key | `6d868387314e64df` | `6d86 8387 314e 64df 715c a3bd 9856 58d5 f888 c0ea 7cab ac91 a43f 9b99 6052 e728` |
| Reserve key | `4543c81b5ccf522d` | `4543 c81b 5ccf 522d f5a3 5e76 6660 8774 5f6c ae42 4722 3b6d 91c9 63cc 34b0 3954` |

The fingerprint is SHA-256 over the **32 bytes** of the key, not over the whole DER file (the 44 bytes that `openssl pkey -pubin -outform der` outputs). Whoever runs `sha256sum` over the DER file gets a different value.

**Tests** never sign with the built-in keys. They pass their own test keys: `TEST_PROJEKT` from `server/test/katalogschluessel.ts` as the option `projektSchluessel` to the `Paketverwaltung` or to `projektSchluessel(TEST_PROJEKT)`. Only code sets this option; in operation there is **no** environment variable and no setting for it – otherwise an outside key could be smuggled in as "Ablago project". With test keys the preview shows "still checks with test keys" (`test: true`). The test "Projektschlüssel" checks that the built-in keys aren't test keys, that their fingerprints are exactly like this in `SECURITY.md` and `SECURITY.en.md` and that a catalogue signed with test keys counts as invalid in operation.

This is how the keys are replaced (new pair, e.g. after losing the signing key):

1. The maintainer creates the key pair on their own computer (instructions in the registry's README, section "Katalog signieren") and publishes the public key.
2. Replace the PEM text in `server/src/projektschluessel.ts` (`test` stays `false`).
3. Calculate the fingerprints (`python3 werkzeuge/signieren.py fingerabdruck signier.pub` in the registry) and enter them in `SECURITY.md`, `SECURITY.en.md`, in the test "Projektschlüssel" and in the table above; in the registry put the public key under `schluessel/` and enter the fingerprints in `README.md` and `README.en.md`.

If the signing key fails (lost or compromised), the registry continues to sign with the reserve key; Ablago accepts that without an update. Afterwards a new pair (new reserve key) comes with a DMS release.

## Your own catalogue with your own key { #eigener-katalog-mit-eigenem-schluessel }

Whoever runs a catalogue themselves (see below, "Testing your own package") can sign it too. Ablago handles the key like SSH on first contact:

1. **Create the key pair** – on your computer, not on the web server:

    ```sh
    openssl genpkey -algorithm ed25519 -out katalog.pem
    openssl pkey -in katalog.pem -pubout -out katalog.schluessel
    ```

2. **Sign** after every build of the catalogue, with the registry's tool:

    ```sh
    python3 werkzeuge/katalog.py <folder>
    python3 werkzeuge/signieren.py signieren <folder> --schluessel katalog.pem --oeffentlich katalog.schluessel
    ```

    It writes `<folder>/katalog.sig` and checks it straight away with the public key.
3. **Publish:** `katalog.json`, `katalog.sig` and `katalog.schluessel` are in the same folder on an HTTPS server. `katalog.pem` stays with you.
4. **Name the fingerprint:** `python3 werkzeuge/signieren.py fingerabdruck katalog.schluessel` – put it on your website. Whoever adds your catalogue in Ablago sees the fingerprint and is meant to compare it with this. Ablago only takes over the key after this confirmation.

Afterwards Ablago requires a **valid signature** for this catalogue: if it is missing or doesn't fit, it doesn't accept the catalogue (and records this in the log). In return nobody has to confirm the origin when installing any more. Here too: an `erstellt` older than last seen is rejected.

**Changing the key:**

- **Orderly:** sign the new public key with the previous one and put the signature next to it as `katalog.schluessel.sig` (format like `katalog.sig`):

    ```sh
    openssl genpkey -algorithm ed25519 -out neu.pem
    openssl pkey -in neu.pem -pubout -out neu.schluessel
    python3 werkzeuge/signieren.py signieren-datei neu.schluessel --schluessel katalog.pem --ziel katalog.schluessel.sig
    mv neu.schluessel katalog.schluessel   # then sign the catalogue with neu.pem
    ```

    Ablago takes over the new key without asking, shows a notice and records the change in the log. Leave `katalog.schluessel.sig` there for a while (about half a year): an Ablago that only fetches the catalogue again later still needs the proof.
- **Without the old key** (lost): Ablago **locks** the catalogue with a clear warning until an admin confirms the new fingerprint. Let your users know and name the new fingerprint on your website.

A catalogue **without** `katalog.schluessel` stays as before: it works, but every installation from it requires confirming the origin.

## Testing your own package { #eigenes-paket-testen }

Before your package goes into the catalogue, you try it out in your own Ablago – best in a test DMS (e.g. with [demo data](https://help.ablago.app/admin/aktuell/en/demo/)):

1. Expand **Workbench → Packages → ▸ Expert mode**.
2. Zip the package folder, e.g. `cd pakete/mein_paket && zip -r ../../mein_paket.zip .`, and choose it under **Upload package**. A folder before `manifest.yaml` (e.g. `mein_paket/manifest.yaml`) doesn't matter. Ablago checks the package like a catalogue package and shows the preview; format errors are collected there.
    - **Limits:** at most **128 MB** as a ZIP (the same limit in the catalogue, when uploading, in the bundle file and when creating a package; the registry's `pruefen.py` and `katalog.py` reject larger packages), unpacked at most 20 MB without `code/` (128 MB also apply to `code/`) and 500 files. An uploaded package stays ready for installation for 30 minutes; afterwards upload it again.
3. Install (confirm the origin), look at it, change it. For an update, **raise the version** and upload again – Ablago updates as with an update from the catalogue (only adding). To start afresh, remove the package (works as long as there are no folders of its folder types).

You can also test several packages as your own catalogue: `python3 werkzeuge/katalog.py <folder>` builds `katalog.json` and the archives; put the folder on an HTTPS server and enter the address of `katalog.json` in expert mode under **Further sources**.

## Outlook { #ausblick }

- **Tours and tips from packages** (#831, #832): `inhalt.rundgaenge` and `inhalt.tipps` in the manifest, in the same format as Ablago's own – see [Tours, tips and anchor points](aufbau.md#entdecken). Ablago reads them from a later version; the check comes with [dms-registry #132](https://github.com/motom001/dms-registry/issues/132).
- **Packages with code** have existed since 0.88.0: WebAssembly modules that react to events and work via the API with confirmed permissions – see [Packages with code](pakete-code.md), with the overview of the [core's interfaces](pakete-code.md#schnittstellen) (vectors, answers, recognition, text recognition, [converting files](pakete-code.md#dateien-umwandeln), [supplying full text](pakete-code.md#volltext-liefern)).
