# Mehrfachauswahl

`Mehrfachauswahl` (#1211; vorher in `web/src/ablage/`) wählt mehrere Einträge: oben ein Suchfeld mit Lupe und Vorschlägen, darunter das Gewählte, jeder Eintrag mit **Entfernen**. So wählt man mehrere Mappen in einem Verweisfeld oder die Mappentypen der erweiterten Suche.

| Angabe | Wofür |
| --- | --- |
| `name` | Name der Liste der gewählten Einträge und der Vorschläge (für Bildschirmleser) |
| `platzhalter`, `eingabeLabel`, `id` | Platzhalter und Beschriftung des Suchfelds (oder `id` für ein `<label htmlFor>`) |
| `eingabe`, `setEingabe`, `offen`, `setOffen` | Text und Zustand der Vorschlagsliste – hält der Aufrufer, weil er davon abhängig Vorschläge lädt |
| `vorschlaege` | `{ id, text, gruppe? }[]`; `null` heißt: lädt noch |
| `leerText`, `fuss` | Satz bei keinen Vorschlägen; etwas unter der Liste (z. B. „+ … anlegen“) |
| `waehle`, `gewaehlt`, `entferne` | Wahl übernehmen; die gewählten Einträge (`{ id, inhalt, zusatz?, aktionen?, entfernenText }`); Eintrag entfernen |
| `ohneSuche`, `darunter`, `schliessen` | ohne Suchfeld; etwas unter dem Gewählten; beim Schließen der Vorschläge |

- **Enter** nimmt den ersten Vorschlag, Pfeiltasten wandern durch die Liste, Esc schließt sie.
- **Entfernen** ist ein leiser Knopf (Art Link), nicht rot: Das Feld ändert sich erst beim Speichern (Leitsatz 5).
- **Am Handy** sind Suchfeld, Vorschläge und „Entfernen“ mindestens 44 px hoch.
- Die Musterseite zeigt den Baustein im Bereich **Mehrfachauswahl**.

Code: `web/src/bausteine/mehrfachauswahl/`.
