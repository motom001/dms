# Search {#suche}

The Library's search forgives typos and other spellings. What it does in the process you set under **Workbench → Search and full text → Search**, the synonyms under **Workbench → Synonyms** (both in the group *Post and intake*; in the template *Household* only in [expert mode](uebersicht.md#werkbank-anpassen), in *Business* and *Everything* always). How users search is described in the [User manual](https://help.ablago.app/benutzer/aktuell/en/ablage/#suchen).

## What always applies {#was-immer-gilt}

Without any setting, the search evens out:

- **Umlauts, accents and ß:** "Gebuhr" finds "Gebühr", "Strasse" finds "Straße", "Ozdemir" finds "Özdemir" – in titles, details, notes and the full text.
- **Hyphens:** "Kfzversicherung" finds "Kfz-Versicherung" and vice versa.
- **Word forms** in the full text: "invoices" finds "invoice" – in the document's language (German if none is recognised). For documents in several languages (since 0.139.0) per page in its language; the search covers all of the document's languages (see [Text recognition → Documents in several languages](texterkennung.md#mehrere-sprachen)).

## Typos and "Did you mean …?" { #tippfehler-und-meintest-du }

If the search finds **nothing**, it continues with similar words from your Library (similarity via letter groups, pg_trgm) and says so above the hits: "No exact hits for 'washing machien'. Similar spellings are shown." It also suggests **"Did you mean 'washing machine'?"**; a click searches for exactly this word. If there are exact hits, it stays with them – exact hits always come first.

The similar words come from the **word index**: all words of four letters or more from titles, details and full texts. It grows by itself – new words are added in the background every few seconds, so that simultaneous saving doesn't block each other; words of deleted folders remain until you count afresh with **Rebuild** (that takes a few seconds for large libraries). With the tick **If there are no hits, show similar spellings …** you switch the typo search off.

Similar-sounding names (Meier, Mayer, Maier) are only found if they are also spelled similarly.

## Synonyms { #gleichbedeutende-worter }

A **group** of synonyms, e.g. *car, auto, vehicle* or *service charges, operating costs*, makes sure that searching for one of the words also finds the others. The groups have an area of their own: **Workbench → Post and intake → Synonyms**, directly below *Search and full text* (since #992; before, they were at the bottom of the page *Search and full text*, which now has a link). It is laid out like the other collections in the Workbench:

![Workbench → Synonyms](bilder/werkbank-woerter.png)

- **In the middle** each group has a line: the first word in bold, the others quieter behind it (**Invoice** · Receipt · Bill), below it the source – *Your own* or the package's name. The **search field** above finds every word of a group, not just the first, and highlights it; with **Source** you show only your own groups or those of one package. **+ New** adds a group.
- **On the right** the words of the chosen group are listed one below the other. You can change words, add one with **+ Word**, remove one with **×** and change the order with **↑**/**↓** – the group is listed under its first word. If a word is already in another group, you see that below it with a link there; that is allowed, the search then takes the words of both groups.
- **Saving** checks: at least two and at most 20 words, each 2 to 60 characters, no word twice (upper/lower case and umlauts don't count: *car* and *CAR* are the same word).
- **Remove** asks first.
- **Edited at the same time:** if someone else has saved the group in the meantime, Ablago doesn't silently overwrite it but says so – as with [folder types](mappentypen.md). **Discard changes** shows the new state; then apply your change again.

On a phone the list and the group come one after the other; **← To the list** returns.

Groups apply to simple searches. Whoever uses quotation marks or a minus (see [search syntax](https://help.ablago.app/benutzer/aktuell/en/ablage/#im-text-der-dokumente-suchen)) searches for exactly what was entered.

**Groups from packages:** [packages](pakete.md) can bring ready-made groups (word lists), e.g. for vehicles or letting. They are in the same list with the package's name but can only be viewed: they change with an update of the package and disappear when you remove the package. **Copy as your own group** creates a copy you can change; the package's group stays alongside.

**Who may:** like any other area, this one can be granted on its own as a [management right](benutzer.md). Whoever was allowed to manage *Search and full text* before the update may also manage *Synonyms*; if you had shown or hidden *Search and full text* in the bar, the same applies to the new area.

## Technology { #technik }

- **PostgreSQL:** the extension `unaccent` folds umlauts, `pg_trgm` finds typos and parts of words – more under [Database extensions](#erweiterungen-der-datenbank).
- **Search index:** the update to 0.127.0 rebuilds the documents' search index once (document language, umlauts, hyphens) and fills the word index. Depending on the Library this takes a few seconds to minutes; during that time Ablago doesn't start yet. Measurements are in the release notes.
- **Backup:** the word index doesn't belong in the backup; on restoring it is recreated from folders and documents. The synonyms are in the backup and the [full export](export.md) (`struktur/synonyme.json`).

## Database extensions { #erweiterungen-der-datenbank }

The search uses two PostgreSQL extensions:

| Extension | what for | if it is missing |
| --- | --- | --- |
| `pg_trgm` | typos and "Did you mean …?", fast search for parts of words ("oven" finds "microwave oven") | no similar spellings, parts of words without an index (slower) |
| `unaccent` | umlauts, accents and ß ("Muller" finds "Müller") | Ablago folds itself, only the common letters |

Both are "trusted" from PostgreSQL 13: the owner of the database creates them without superuser rights – also with [your own database](installation.md#datenbank-anbindung). `postgres:17` and `dms-komplett` include them. Ablago creates them in its own schema **`erweiterungen_dms`**. That matters for [restoring](wiederherstellen.md): it swaps the schema `public` and deletes the old one including its content – an extension there would disappear with it. Up to 0.131.0, `pg_trgm` was still in `public`; after a restore the typo search was then silently off. The update to 0.131.1 moves it and creates it anew if it is already missing.

**Check:** on every start, Ablago creates a missing `pg_trgm` anew and moves extensions from `public` to `erweiterungen_dms` (the indexes for them are then created in the background). If that doesn't work, there is a notice with a remedy under **Workbench → system health**, plus a notice in the overview and in the [log](fehlersuche.md#protokoll) (module *datenbank*). The [test restore](wiederherstellen.md#probe-wiederherstellung) also reports missing extensions.

**Remedy**, if the notice stays:

- **Permission missing:** Ablago's database user needs the permission `CREATE` on its database (as the owner of the database it has it). Then restart Ablago.
- **Extension not installed:** with your own PostgreSQL installation, both belong to the package `postgresql-contrib` (included in the server package on Debian/Ubuntu).
- **Owned by another user:** if the database administration created the extension itself in `public`, Ablago can't move it. Then the administration moves it: `ALTER EXTENSION pg_trgm SET SCHEMA erweiterungen_dms;` – for `unaccent`, restart Ablago afterwards; it adapts its search function on start.
- If `unaccent` is missing from the beginning, the search works anyway; Ablago doesn't add the extension retrospectively.
