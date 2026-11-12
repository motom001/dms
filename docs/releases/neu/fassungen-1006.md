art: minor

## Neu

- **Fassungen: wer hat was geändert?** (#1006): Jedes Speichern von Mappentypen (samt Rechte-Regeln), Ansichten, Nummernkreisen, Stempel-Vorlagen, Postfächern, Paket-Einstellungen, Automatisierungen und Automatisierungsvorlagen ergibt eine Fassung mit Zeitpunkt, wer (Person, Paket mit Version, Automatisierung, Update von Ablago) und einer lesbaren Liste der Änderungen, z. B. „Feld ‚Kündigungsfrist‘ hinzugefügt · ‚Betrag‘ ist kein Pflichtfeld mehr“. Im neuen Bereich **Fassungen** jedes dieser Editoren lassen sich zwei Fassungen vergleichen und eine frühere **wiederherstellen** – mit Rückfrage, die vorher sagt, was sich ändert (z. B. Felder mit Werten, Mappen, die danach nicht mehr passen); das Wiederherstellen ist selbst eine neue Fassung. Dieselbe Person innerhalb von 10 Minuten bleibt eine Fassung. Gelöschte Einträge behalten ihre letzte Fassung mit Löschvermerk; Vollexport (`struktur/fassungen.json`) und Sicherung nehmen die Fassungen mit.

## Geändert

- **Automatisierungen** (#1006): Der „Änderungsverlauf“ heißt jetzt **Fassungen** und arbeitet wie bei allen anderen Einstellungen; die bisherigen Versionen sind übernommen. Wiederherstellen prüft wie normales Speichern.
- **Automatisierungsvorlagen** (#1006): Ihr „Änderungsverlauf“ ist ebenfalls der Bereich **Fassungen** (vergleichen, wiederherstellen mit Rückfrage); bisherige Versionen sind übernommen, „Auf Auslieferung zurücksetzen“ ist eine Fassung, gelöschte eigene Vorlagen behalten ihre letzte Fassung mit Löschvermerk.
