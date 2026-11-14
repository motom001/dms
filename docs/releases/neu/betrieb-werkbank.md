art: minor

## Neu

- **Oberfläche lädt schneller** (#1236): Ablago liefert Skripte, Stile und Startseite fertig komprimiert aus (Brotli oder gzip). Beim ersten Aufruf über Mobilfunk sind das gut 800 KB statt knapp 4 MB. Hinter einem Reverse-Proxy ist nichts einzustellen.
- **Mehrere Sicherungen auf einmal löschen** (#1169): In Werkbank → Sicherung wählst du Sicherungen mit Haken oder „Alle auswählen“ und löschst sie mit einer Rückfrage, die Anzahl, Zeitraum und frei werdenden Platz nennt. Die neueste geprüfte Sicherung ist geschützt. Über der Liste steht, was die Aufbewahrung von selbst wegräumt.

## Geändert

- **Sicherung ruhiger** (#1193): Die Statuszeile nennt nicht mehr, wann das Notfallblatt heruntergeladen wurde – das steht unter Verschlüsselung. Fehlt das Notfallblatt oder gilt es nicht mehr, warnt die Sicherung weiter. Neben dem Hilfesymbol steht kein zweiter Link ins Handbuch.
