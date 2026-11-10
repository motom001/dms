art: patch

## Sicherheit

- **Notfallblatt nur mit dem Bereich „Verschlüsselung“** (#993, Nachtrag zu #1023): Das Notfallblatt trägt den Schlüssel aller Sicherungen. Herunterladen (`GET /api/werkbank/notfallblatt`) geht im Verwaltungsmodus jetzt nur noch mit „Verschlüsselung“ (oder der Gesamten Verwaltung), nicht mehr mit „Sicherung“ allein. Unter Sicherung und in der Übersicht erscheint der Hinweis zum Notfallblatt nur für alle, die die Verschlüsselung verwalten. Wer nur die Sicherung verwaltet, liest beim Zeitplan: „Erst möglich, wenn die Verschlüsselung fertig eingerichtet ist – das erledigt, wer die Verschlüsselung verwaltet.“ und „Du hast keine Berechtigung, die Verschlüsselung zu verwalten.“
