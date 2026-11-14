# Menu

`Menue` (#1211, #1212) is a button that opens a list of actions: **Folder ▾** in the header of a folder, **⋯** on every document row and in the header of a view. All menus look and work the same.

| Prop | Purpose |
| --- | --- |
| `beschriftung` | text of the button (“Folder”); with `nurSymbol` the name for screen readers (“More actions for invoice.pdf”) |
| `nurSymbol` | show only “⋯” |
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
- **On the phone** the menu opens as a sheet from the bottom; every item is at least 48 px high.
- **Errors** from `tu` (rejected promise) appear in a message window.
- The pattern page shows the building block in the area **Menu**: with groups, a locked item and danger.

Code: `web/src/bausteine/menue/`.
