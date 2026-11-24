# Menu

`Menue` (#1211, #1212) is a button that opens a list of actions: **Folder ▾** in the header of a folder and **⋯** on every document row. All menus look and work the same.

![“Menu” section of the pattern page: groups, disabled item, danger](bilder/muster-menue.png){ loading=lazy }

| Prop | Purpose |
| --- | --- |
| `beschriftung` | text of the button (“Folder”); with `nurSymbol` the name for screen readers (“More actions for invoice.pdf”) |
| `nurSymbol` | show only “⋯” |
| `art` | `neben` (default) or `anlegen`: green create button without an arrow for a menu that only starts something new – “+ New” in the header (#1269); the label starts with “+” |
| `punkte` | the actions, see below |
| `groesse` | `klein` (default) or `normal` |
| `links` | list left-aligned below the button instead of right-aligned |
| `titel`, `anker` | tooltip of the button; jump target for tours and tips (`data-anker`) |

An item (`MenuePunkt`) has `key`, `inhalt` and `tu(anlass?)`, plus optionally:

- `symbol` – icon from `Symbol.tsx`; items without an icon keep the space so the texts line up.
- `gruppe` – heading of the group; items of the same group stay together (on documents: view, download, edit, organise).
- `gesperrt` – reason as text; it appears small **below** the item, not only in the tooltip (principle 6).
- `gefahr` – a confirmation as on the [button](bausteine-knopf.md) (`titel`, `text`, `ja`, optionally `mitGrund`). Such items are set apart at the end, not red at rest; `tu` only runs after “Yes” and receives the chosen reason.
- `titel` – short explanation as a tooltip, in addition to the text.

```tsx
import { Menue } from '../bausteine';

<Menue beschriftung={t('ablage.dokumente.mehr', { name: d.name })} nurSymbol punkte={[
  { key: 'tab', gruppe: t('…gruppe.ansehen'), symbol: 'extern', inhalt: t('…in-neuem-tab-oeffnen'), tu: oeffnen },
  { key: 'weg', symbol: 'geloescht', inhalt: t('…mappe-mit-verknuepften'), tu: loeschen,
    gefahr: { titel: t('…frage'), ja: t('…loeschen'), mitGrund: true } },
]} />
```

- **Keyboard** following WAI-ARIA (menu button): Enter, Space or Arrow down open it and focus the first item; arrow keys, Home and End move; Esc closes and returns focus to the button. A click outside closes it.
- **Position (#1488):** the open list is fixed in the window (`position: fixed`), below the button when there is room – the assistant's space at the bottom right (`--platz-begleiter`) does not count as room – otherwise above it. If it fits nowhere completely, it takes the side with more room and scrolls inside. So a menu never lengthens a column and never adds a page scrollbar. It follows when scrolling or resizing. Horizontally (#1556) it is aligned with the preferred edge of the button (right, with `links` left) if it fits into the window there, otherwise with the other edge; if neither fits, 8 px from the window edge. The pattern lives in `web/src/bausteine/menue/lage.ts` (`aufklapplage`, `legeFest`) – for everything that pops open, including the calendar of [Date](bausteine-datum.md).
- **On the phone** the menu opens as a sheet from the bottom; every item is at least 48 px high.
- **Errors** from `tu` (rejected promise) appear in a message window.
- The pattern page shows the building block in the area **Menu**: with groups, a locked item and danger.

![“Menu” section, dark](bilder/muster-menue-dunkel.png){ loading=lazy }

Code: `web/src/bausteine/menue/`.
