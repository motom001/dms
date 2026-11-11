# Interface (API) {#schnittstelle-api}

Other programs – a scanner, a script, a household app – access Ablago via the interface under `/api/v1`. They can create, read, change and delete folders and upload and download documents.

## API description {#api-beschreibung}

The complete description in **OpenAPI format** (version 3.1):

- **Readable** in every installation under **My account → Security → API keys** (click your name at the top right) via the link **API documentation** – matching the installed version.
- **Machine-readable** under `/api/openapi.json` or `/api/v1/openapi.json` of your own installation, e.g. `http://<NAS>:8080/api/openapi.json`. This can be loaded into tools such as Swagger UI, Postman or a code generator.
- The description of the current version is also here: [openapi.json](api/openapi.json).

![API documentation in Ablago](bilder/api-doku.png)

## API keys {#api-schlussel}

Every user creates their keys themselves under **My account → Security → API keys**, at most 50 per user – **except administrators** (from 0.26): via the interface, it is always a normal user who works. Best create a user of its own for a program (e.g. "Scanner"), sign in as that user and create the key there. Keys that administrators already had before keep working; the Workbench overview reminds you to replace them like this.

- **Name** – what the key is for, e.g. "Scanner study".
- **Permission** (level) – one of three:
    - *read only* – reads everything the user may read (only `GET`).
    - *read and write* – reads and changes everything the user may.
    - *counters only* (from #625) – **only** retrieves the [numbers](#zaehler) (`GET /api/v1/ich/zaehler`): new post, To do and overdue items. Every other call, including the [drive](webdav.md), gets `403`. Intended for home automation, wall tablets and displays: if the key gets lost, someone learns at most how much post and how many tasks the user has – no titles, names or content. "Read passwords" doesn't exist for this level.
- **Expiry date** – optional.
- **Read passwords** – a permission of its own for [password fields](mappentypen.md#passwortfelder): only with it does `GET /api/v1/mappen…?passwoerter=anzeigen` return them in plain text; every retrieval is in the log. Without the parameter, it always only says `{"gesetzt": true, "lesbar": true}` there.

The key is **only visible in full once**, directly after creating it; afterwards Ablago only shows its beginning. Only a checksum is stored. Whoever loses it creates a new one and deletes the old one.

A key has at most the permissions of its user. If the user is deactivated, their key no longer applies either.

The endpoints of the group *Werkbank* (create, change and delete folder types; users and roles) need **administrator permissions**. With a member's key they answer with `403`. Since administrators get no new keys, they only work with a key that already belonged to an administrator before 0.26.

## First call {#erster-aufruf}

```sh
curl -H "Authorization: Bearer dms_…" http://<NAS>:8080/api/v1/ich
```

Answers with the user and the key's permission.

Creating a folder:

```sh
curl -X POST -H "Authorization: Bearer dms_…" -H "Content-Type: application/json" \
  -d '{"typId": "<id of the folder type>", "werte": {"rechnungsnummer": "R-17", "rechnungsdatum": "2026-10-01", "betrag": {"betrag": 49.9, "waehrung": "EUR"}}}' \
  http://<NAS>:8080/api/v1/mappen
```

The ids of the folder types and the identifiers of their fields (`key`) are returned by `GET /api/v1/typen`.

## Counters: numbers only, for home automation and displays { #zaehler }

`GET /api/v1/ich/zaehler` returns **numbers only** for the key's user, within their [permissions](berechtigungen.md) – without titles, names, senders or content. A key of level *counters only* is enough for this; *read only* and *read and write* may use it too. An administrator retrieves it with their sign-in in the browser (administrators get no keys).

```sh
curl -i -H "Authorization: Bearer dms_…" https://dms.example.org/api/v1/ich/zaehler
```

```http
HTTP/1.1 200 OK
ETag: "z42-mJ3x0Qe7Kq9VZ1aB2cD3eF"
Cache-Control: private, no-cache
Content-Type: application/json; charset=utf-8

{"neuePost":2,"zuErledigen":5,"ueberfaellig":1,"stand":42,"geaendert":"2026-11-03T07:15:00.000Z"}
```

| Field | Meaning |
| --- | --- |
| `neuePost` | [post](https://help.ablago.app/benutzer/aktuell/en/post/) in the status *New* whose *For* is the user or empty – only post they may read |
| `zuErledigen` | like **To do** in the Library: folders with open tasks for them |
| `ueberfaellig` | own open deadlines, reminders and tasks with a date before today |
| `stand` | counts up by one as soon as one of the numbers has changed compared with the last retrieval |
| `geaendert` | when Ablago noticed this change (on retrieval) |

**Nothing new costs nothing:** send the `ETag` of the last retrieval as `If-None-Match`. If nothing has changed, Ablago answers with `304 Not Modified` without content:

```sh
curl -i -H "Authorization: Bearer dms_…" -H 'If-None-Match: "z42-mJ3x0Qe7Kq9VZ1aB2cD3eF"' \
  https://dms.example.org/api/v1/ich/zaehler
# HTTP/1.1 304 Not Modified
```

- The numbers come from the same cache as the numbers in the Library: even with 50,000 folders a retrieval is usually answered within a few milliseconds. Asking every few minutes (e.g. every 5 minutes) is harmless.
- The counter state is in the database: it survives a restart. After a [restore](wiederherstellen.md) it can go back to the state of the backup – so only compare it for "different", not for "greater".
- Other calls with a *counters only* key get `403` with the notice that this key only retrieves the numbers.

### Immediately instead of polling: webhooks { #webhooks }

Instead of polling the counter regularly, Ablago can also report by itself: a **webhook** sends the same numbers by `POST` to an address a few seconds after they have changed – signed with HMAC-SHA256, without content, with an event id against duplicates. Users create webhooks under My account, only to targets that an administrator has approved. Setup, delivery and headers: [Webhooks](webhooks.md); checking the signature with sample code in the [Developer manual](https://help.ablago.app/entwickler/aktuell/en/aufbau/#webhooks). The counter endpoint is still needed: for the start, after a longer break and as a fallback in case a message got lost.

### Changing a folder, also at the same time as others { #mappe-aendern }

`PUT /api/v1/mappen/{id}` only changes the fields that are in `werte`; all others stay as they are currently saved. So send **only what you want to change** – not the whole folder you read before. Otherwise you reset fields that someone else has changed in the meantime.

With `stand`, Ablago additionally checks whether someone has changed **the same field** since you read it (#609). `stand` is the folder's value `geaendert` from `GET /api/v1/mappen/{id}`:

```sh
curl -X PUT -H "Authorization: Bearer dms_…" -H "Content-Type: application/json" \
  -d '{"werte": {"betrag": {"betrag": 398, "waehrung": "EUR"}}, "stand": "2026-11-02T16:58:12.345Z"}' \
  http://<NAS>:8080/api/v1/mappen/<id>
```

- If nobody has changed one of the fields passed differently since then, Ablago saves – even if other fields were changed in the meantime; those stay.
- Otherwise **409** comes and nothing is saved. `details` contains `stand` (the current one) and `konflikte`: per field `feld`, `label`, `deins`, `aktuell` (readable), `wert` (the current value as in `werte`; not for passwords), `von`, `name` and `zeit` of the last change.
- To apply your value anyway: the same request with `stand` from the 409 answer. To keep the other value: leave the field out.

Without `stand`, Ablago checks nothing – as up to 0.143.0, what you send applies. Existing scripts keep running unchanged; Ablago never resets fields that weren't passed. "Last changed" (`geaendert`) is accurate to the millisecond and becomes greater with every save – compare it as text, don't calculate with it.

**Folder types** (`PUT /api/v1/typen/{id}`, Workbench) also accept `stand` – the folder type's `geaendert` value as you read it. If someone else has saved it since then, **409** comes and nothing is overwritten; read it again and apply your changes once more. Without `stand`, whatever is saved last applies, as before.

!!! note "Names in the API"
    The interface keeps its names, even where the interface on screen has used other words since 0.73: `sicht` is the **view**, `sicht=eingang` the list **To do**, `key` the **identifier** of a field, tab or folder type, the field kind `referenz` the **link**, the tab of kind `protokoll` the **history** and `mandant` or `haushalt_id` the **household**. The API names stay German in every language.

The folders of a view are returned by `GET /api/v1/mappen?sicht=<id of the view>` – with all the view's conditions. All folders of a folder type, without conditions, are available with `sicht=typ:<id of the folder type>`. With `sicht=link&link=…` it works via a [link by folder type and field values](direktlinks.md). The views themselves (tree, folder types, conditions, chosen result list) are returned by `GET /api/v1/sichten/definitionen`. Your own absence is read and set by `GET`/`PUT /api/v1/konto/abwesenheit`, your own daily summary (time, weekdays, public holidays) by `GET`/`PUT /api/v1/konto/zusammenfassung`. Your own favourites are available with `sicht=favoriten`; mark and remove with `PUT` or `DELETE /api/v1/mappen/{id}/favorit`.

Since 0.14, folder types have **several result lists** (`trefferlisten`, one with `standard: true`). The field `trefferliste` still exists: it contains the columns of the default list, and whoever passes it when changing replaces its columns with it.

With `suche=…&volltext=true`, `GET /api/v1/mappen` also searches the documents' full text; the matches are in `ausschnitte` (hits between the control characters U+0002 and U+0003). The whole text of a document is returned by `GET /api/v1/dokumente/<id>/volltext`.

### Further endpoints {#weitere-endpunkte}

The API documentation describes all endpoints with their parameters. An overview:

| What for | Endpoints |
| --- | --- |
| **Advanced search** | `GET /api/v1/mappen?sicht=suche&link=…` with the parameters of the advanced search as one encoded value, e.g. `typ%3Drechnung%26volltext%3DBackofen` |
| **Tasks** | `GET /api/v1/aufgaben` (own open ones), `POST /api/v1/mappen/{id}/aufgaben` (assign), `POST /api/v1/aufgaben/{id}/erledigt` and `…/delegieren`, several at once with `POST /api/v1/aufgaben/weitergeben` or `…/aufgaben/erledigt` (#415); reminders via `…/erinnerungen` |
| **Notes** | `GET`/`POST /api/v1/mappen/{id}/notizen`, `PUT`/`DELETE /api/v1/notizen/{id}` |
| **Notes from packages** | `PUT`/`DELETE /api/v1/mappen/{id}/hinweise/{schluessel}` with `{ "text": "…" }` – only for packages with the right [Set notes on folders](pakete.md#recht-hinweise); they are read with the folder (`hinweise` in `GET /api/v1/mappen/{id}`, with `paketName`) |
| **History** of a folder | `GET /api/v1/mappen/{id}/historie` |
| **Email** | `POST /api/v1/mappen/{id}/email` sends a folder with documents (together at most 50 MB) out via your mail server. Every key with write permission can do this – so only give "read and write" to programs you trust with that. |
| **Documents and versions** | `POST /api/v1/mappen/{id}/dokumente` (upload), `POST /api/v1/dokumente/{id}/ersetzen` (new version), `GET /api/v1/dokumente/{id}/versionen`, download an older version and `…/zurueckholen` |
| **Text recognition** | `POST /api/v1/dokumente/{id}/texterkennung` starts it (again) for a document; `GET /api/v1/dokumente/{id}/volltext` returns the text |
| **Setting full text** | `PUT /api/v1/dokumente/{id}/volltext` with `{ "text": "…" }` (permission U on the folder) replaces the full text, e.g. from your own text recognition; `GET /api/v1/dokumente/{id}/seiten/{nr}/scan?dpi=300` returns a page as a greyscale image (PGM) |
| **Converted version** | `GET /api/v1/dokumente/{id}/fassung` returns the version (PDF, PNG or JPEG) that a package made from a file Ablago doesn't read itself (e.g. TIFF); only packages with the permission [Convert files](pakete.md#recht-umwandeln) may set it |

### Creating and assigning post {#post-anlegen-und-zuordnen}

A script, a scanner or Home Assistant creates new [post](https://help.ablago.app/benutzer/aktuell/en/post/) and uploads the file for it:

```sh
curl -X POST -H "Authorization: Bearer dms_…" -H "Content-Type: application/json" \
  -d '{"betreff": "Scan from the printer", "fuer": "<id of a user>"}' \
  http://<NAS>:8080/api/v1/post
curl -X POST -H "Authorization: Bearer dms_…" -H "Content-Type: application/octet-stream" \
  --data-binary @scan.pdf "http://<NAS>:8080/api/v1/mappen/<id of the post>/dokumente?register=dokumente&name=scan.pdf"
```

The post is then in **New post** with channel *API* and status *New*. `POST /api/v1/post/<id>/zuordnen` with `{"ziel": "<id of a folder>"}` assigns it; the documents move into the folder's first documents tab (or into `register`; with `kopieren: true` they also stay in the post). For post created as an email before 0.41, the documents tab is called `anhaenge`.

Deleted folders are in the [Bin](papierkorb.md): `GET /api/v1/papierkorb` (own), `POST /api/v1/papierkorb/<id>/wiederherstellen`, `DELETE /api/v1/papierkorb/<id>` and `DELETE /api/v1/papierkorb` (empty).

## Changes to the API { #aenderungen }

Here is what has changed in API v1 in a way that existing programs notice. New fields and new calls are only in the [API description](#api-beschreibung).

| Since | Change | What to do? |
| --- | --- | --- |
| #1050 (combined fields) | **New field kind `zusammengesetzt` (combined), read-only.** The field has `vorlage` (placeholders like `titelVorlage`); `werte` holds a key without language, links in it as folder ids (build the text from `vorlage`, the values and `bezuege`). Ablago ignores values sent for this field and sets it from its parts. If it is unique, a duplicate gets **422**, with the message in `details.felder` on the first field involved. If you change the template through `PUT /api/v1/typen/{id}` and several folders would then have the same combination, you get **409** with `details.zusammengesetzt` – with `doppelteBestaetigt: true` Ablago saves anyway. | Anyone listing field kinds explicitly (e.g. in a JSON schema) adds `zusammengesetzt`; scripts don't send the field. |
| #1034 (calculated fields) | **Calculated fields are written only by their package.** Fields with `berechnetVon` (on the field in `GET /api/v1/typen`) can only be changed through `POST`/`PUT /api/v1/mappen` by the package that calculates them; any other key gets **400** with the name of the package and, in `details.berechnet`, `feld`, `label`, `paket` and `paketName` per field. Values sent back unchanged do no harm. New on the folder: `hinweise` (notes from packages); on the folder type when reading, `berechnung` (per package its name and whether it still calculates). `berechnetVon: null` when changing a folder type releases a field again. | Scripts only send what they want to change (see [Change a folder](#mappe-aendern)) and leave calculated fields out. |
| #1084 (identifiers) | **Folder types from packages are called `package:key`** instead of `<package>_<key>`, e.g. `basis:person` instead of `basis_person` – in `schluessel` of folder types (`GET /api/v1/typen`), in links (`/ablage/link?typ=…`), in the advanced search (`typ=`) and in the full export (file `daten/basis.person.csv`). New on the folder type: `paket` (ID of the package, missing for your own types). Ablago converted existing identifiers during the update; your own folder types keep their identifier. Package IDs may now have up to 40 characters and one dot (`texterkennung.fra`), identifiers up to 60 characters; packages name their `herausgeber` (publisher). | Whoever looks up folder types by identifier uses the new form (or the ID). Re-create saved links and bookmarks with `typ=basis_…` or change them to `basis:…` – otherwise they only find the folder type by its name. |
| #902 (announcement) | **With Ablago 1.0.0, three transitions for old packages are dropped:** `PUT /api/v1/sicherungen/{name}/extern` (deprecated since 0.158.1, #636), the event `texterkennung.fertig` (called `volltext.fertig` since 0.133.0, #724) and the reference `dms:ablageort` (`basis:ablageort` since 0.212, #883). | Packages report the off-site copy as `extern` in the response to `sicherung.fertig`, subscribe to `volltext.fertig` and refer to `basis:ablageort`. |
| #939 (places found) | **Places from packages only from the document.** In `POST /api/v1/typen/{id}/vorschlaege`, the `fundstelle` of a value supplied by a package is now empty if the excerpt isn't word for word in the document. New next to it: `stelle` (document, page, frame). New call `POST /api/v1/klassifizieren` for "Where does this belong?". | Nothing, if an empty `fundstelle` is allowed. Whoever draws frames can use `stelle` instead of searching themselves. |
| #725 (navigation slimmed down) | **"Upcoming" no longer exists.** `GET /api/v1/anstehend` has been dropped; the [counter](#zaehler) and the [webhooks](webhooks.md) no longer return a field `anstehend`. Reminders of deadlines come via automations at the right time as a task – they are then in `zuErledigen` or `GET /api/v1/aufgaben`. | Show `zuErledigen` or `ueberfaellig` instead of `anstehend`. Whoever checks the numbers strictly (e.g. a JSON schema with `required`) removes `anstehend`. |

## Rules {#regeln}

- Keys only apply under `/api/v1`, not at the interface's internal addresses. A *counters only* key only applies to `GET /api/v1/ich/zaehler`.
- The same checks apply as in the interface: required fields, unique values, protected fields of the user folders – and the [permissions](berechtigungen.md) of the user who owns the key. Folders they may not read are not returned by the interface; passwords only with the permission "See passwords".
- Even via the interface, users are only chosen from those whose user folder you may see (responsible, tasks, stand-ins). How to delimit such a program cleanly is shown in the example [A program that only sees invoices](berechtigungen.md#beispiel-ein-programm-das-nur-rechnungen-sieht).
- In active [maintenance mode](wartungsmodus.md) the interface answers with `503` and `Retry-After` (seconds until the expected end).
- Errors come as JSON with a message in `fehler`; for invalid input (422), `details` contains the check result per field.
- Password fields are set with a text or `{"neu": "…"}`, removed with `null` and left unchanged by leaving them out.
- Field identifiers never change (see [Folder types](mappentypen.md#die-kennung)) – scripts that work with them stay valid even when labels are renamed.
