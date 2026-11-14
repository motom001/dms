# Multiple selection

`Mehrfachauswahl` (#1211; previously in `web/src/ablage/`) chooses several entries: a search field with a magnifier and suggestions on top, the chosen entries below, each with **Remove**. That is how you choose several folders in a link field or the folder types of the advanced search.

| Prop | Purpose |
| --- | --- |
| `name` | name of the list of chosen entries and of the suggestions (for screen readers) |
| `platzhalter`, `eingabeLabel`, `id` | placeholder and label of the search field (or `id` for a `<label htmlFor>`) |
| `eingabe`, `setEingabe`, `offen`, `setOffen` | text and state of the suggestion list – held by the caller, because it loads suggestions depending on them |
| `vorschlaege` | `{ id, text, gruppe? }[]`; `null` means: still loading |
| `leerText`, `fuss` | sentence when there are no suggestions; something below the list (e.g. “+ Create …”) |
| `waehle`, `gewaehlt`, `entferne` | take a choice; the chosen entries (`{ id, inhalt, zusatz?, aktionen?, entfernenText }`); remove an entry |
| `ohneSuche`, `darunter`, `schliessen` | without a search field; something below the chosen entries; when the suggestions close |

- **Enter** takes the first suggestion, arrow keys move through the list, Esc closes it.
- **Remove** is a quiet button (kind link), not red: the field only changes on saving (principle 5).
- **On the phone** the search field, suggestions and “Remove” are at least 44 px high.
- The pattern page shows the building block in the area **Multiple selection**.

Code: `web/src/bausteine/mehrfachauswahl/`.
