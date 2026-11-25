# Multiple selection

`Mehrfachauswahl` (#1211; previously in `web/src/ablage/`) chooses one or several entries: a search field with a magnifier and suggestions on top, the chosen entries below, each with a small ✕ button. That is how you choose folders in a link field or the folder types of the advanced search.

![“Multiple selection” section of the pattern page: empty, open with results, no results, set, multiple](bilder/muster-mehrfachauswahl.png){ loading=lazy }

| Prop | Purpose |
| --- | --- |
| `name` | name of the list of chosen entries and of the suggestions (for screen readers) |
| `platzhalter`, `eingabeLabel`, `id` | placeholder and label of the search field (or `id` for a `<label htmlFor>`) |
| `eingabe`, `setEingabe`, `offen`, `setOffen` | text and state of the suggestion list – held by the caller, because it loads suggestions depending on them |
| `vorschlaege` | `{ id, text, gruppe? }[]`; `null` means: still loading |
| `leerText`, `fuss` | quiet sentence without suggestions (e.g. “Contract “xyz” not found”); something below the suggestions (e.g. “… in total”) |
| `anlegen`, `legeAn` | entries for creating (#1288, `{ id, text }[]`), always last in the list – also with results; `legeAn` gets their id |
| `waehle`, `gewaehlt`, `entferne` | take a choice; the chosen entries (`{ id, inhalt, zusatz?, aktionen?, entfernenText }`); remove an entry |
| `ohneSuche`, `darunter`, `schliessen` | without a search field (single choice with a value); something below the chosen entries; when the suggestions close |
| `imFluss` | suggestions in the flow instead of fixed in the window – only for the pattern page and pictures |

- **Keyboard:** arrow keys move through suggestions and create entries (focus stays in the search field, `aria-activedescendant`), **Enter** takes the highlighted one – without a highlight the first suggestion.
- **Esc** with the list open only closes the list (#1311): focus stays in the field, the input stays, and the key press goes no further – it discards no changes of the save bar and closes no window. Only another Esc with the list closed acts as everywhere else (save bar: discard, window: close).
- **Creating** is in the list, not a green button below the field: green is reserved for creating on the page (principle 2).
- **✕** is a small symbol-only button (kind secondary), not red: the field only changes on saving (principle 5). Its screen reader name is `entfernenText`, e.g. “Remove holder”. Afterwards focus is in the search field.
- **Position** (#1670): the suggestions open like the menus (`menue/lage.ts`): downwards if there is room, otherwise upwards – e.g. for a reference field at the bottom of a folder. They are at most 280 px high and stay inside the window; the rest scrolls in the list, not on the page. They are placed again on scrolling and resizing. Unlike the menu they stay at the field on the phone too (no sheet from below), so the search field stays visible.
- **On the phone** the search field, suggestions, create entries and ✕ are at least 44 px high.
- The pattern page shows the building block in the area **Multiple selection**: empty, open with results, no results, set and multiple.

![“Multiple selection” section, dark](bilder/muster-mehrfachauswahl-dunkel.png){ loading=lazy }

Code: `web/src/bausteine/mehrfachauswahl/`.
