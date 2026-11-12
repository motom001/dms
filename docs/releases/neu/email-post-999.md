art: minor

## Neu

- **E-Mail-Postfach: eine E-Mail, eine Post, jeder Anhang ein Dokument** (#999): Drei Anhänge ergeben drei Dokumente in derselben Post – mit ihrem Dateinamen und **in der Reihenfolge, in der sie in der E-Mail stehen**. Ganz hinten steht die E-Mail selbst (`.eml`) mit dem Kennzeichen **„Original-E-Mail“**: als letzte Anlage am letzten Anhang, ohne Anhänge als Dokument der Post. Sie wandert beim Zuordnen mit; Erkennung, Klassifizieren und KI lesen sie nie. Kleine eingebettete Bilder (Logos, Signaturen) werden wie bisher kein Dokument.
- **Original-E-Mail sichtbar und abwählbar** (#999): Beim Übernehmen, beim Herunterladen und Stempeln „mit Anlagen“ und beim Versand per E-Mail steht die Original-E-Mail mit ihrem Kennzeichen in der Liste dessen, was mitgeht – ein Haken wählt sie ab. Sie enthält alle Anhänge der Mail; beim Übernehmen bleibt sie abgewählt in der Post. API v1: `originalEmail: false` bei Zuordnen, E-Mail-Versand und Herunterladen.
- **Post ab hier teilen** (#999): An jedem weiteren Dokument einer Post – dieses und alle danach kommen samt Anlagen als neue Post nach „Neue Post“.

## Geändert

- **Dokumente einer Post stehen wie eingegangen** (#999): bei einer E-Mail in der Reihenfolge ihrer Anhänge, sonst nach dem Hochladen; die Sortierung nach Namen gilt nur noch in Mappen.
- **Trennblätter gelten im E-Mail-Postfach nicht** (#999): Kein Paket teilt Post aus dem Postfach (409); aufteilen tust du selbst. API v1 und Vollexport nennen am Dokument `eingangNr` und `originalEmail` (`eingang_nr`, `original_email`).
