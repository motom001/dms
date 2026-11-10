# Table

`Tabelle` (#1030) shows rows with columns; each row leads to a page – usually a folder. When wide it is a table, when narrow (on a phone or in a narrow column) a list with the first two columns, like the result lists in the Library. Without rows it shows a quiet sentence instead of an empty table. Used by the field kind **Table** in the folder (`web/src/ablage/Tabellenfeld.tsx`).

| Prop | Purpose |
| --- | --- |
| `beschriftung` | name for screen readers, e.g. "Items" (`aria-label` on the table or list) |
| `spalten` | `{ key, titel, rechts? }` – `rechts` for numbers and amounts |
| `zeilen` | `{ key, ziel, zellen, ersatz }` – `ziel` is a path in Ablago; `ersatz` is shown in the first column when it is empty |
| `leer` | sentence without rows, e.g. "No items yet" |
| `fuss` | below the rows, e.g. "+ Item" and "Show more" |
| `breitAb` | from this width on a table; default 480 px or 110 px per column |

```tsx
import { Knopf, Tabelle } from '../bausteine';

<Tabelle beschriftung={t('…positionen')} spalten={spalten} zeilen={zeilen} leer={t('…noch-keine')}
  fuss={<Knopf art="anlegen" groesse="klein" onClick={neu}>{t('…neu')}</Knopf>} />
```

- The **first column** is the link (keyboard, screen readers); a click anywhere in the row leads there as well.
- The component measures **narrow or wide** itself (`ResizeObserver` on its own frame) – not the width of the window.
- No sorting, no totals and no editing in the row: that is left to the page behind it.
- **On a phone** the links are at least 44 px high ([On a phone](bausteine.md#handy)).
- The pattern page shows the component in the **Table** section: wide, narrow and empty.
