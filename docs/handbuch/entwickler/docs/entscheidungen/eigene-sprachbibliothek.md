# Eigene kleine Umsetzung für Texte statt i18next (#473, #727) { #eigene-sprachbibliothek }

**Frage:** Nehmen wir für die Sprachdateien eine verbreitete Bibliothek wie i18next oder eine eigene kleine Umsetzung?

**Entscheidung:** eine eigene, kleine Umsetzung in `shared/src/sprache.ts`.

**Gründe:** keine neue Abhängigkeit, offline, dieselben Regeln in Oberfläche und Server.

**Folgen:** Das Format (flaches JSON, `_one`/`_other`) entspricht i18next; ein späterer Wechsel bleibt möglich. Wie man Texte anlegt, steht unter [Texte und Sprachdateien](../texte.md#texte-und-sprachdateien).

**Stand:** gilt seit #473; alle Bereiche seit #727.
