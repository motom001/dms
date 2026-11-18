# A small implementation of our own for texts instead of i18next (#473, #727) { #eigene-sprachbibliothek }

**Question:** do we use a common library such as i18next for the language files, or a small implementation of our own?

**Decision:** a small implementation of our own in `shared/src/sprache.ts`.

**Reasons:** no new dependency, offline, the same rules in interface and server.

**Consequences:** The format (flat JSON, `_one`/`_other`) matches i18next; a later switch remains possible. How to add texts is under [Texts and language files](../texte.md#texte-und-sprachdateien).

**Status:** applies since #473; all areas since #727.
