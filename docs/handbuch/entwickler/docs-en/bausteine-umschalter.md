# Toggle

`Umschalter` (#1002) is a segmented button: two to four equal choices side by side, exactly one is on. It changes **how** something works – for example “Ask · Tips · Manual” in the assistant at the bottom right (`web/src/begleiter/Begleiter.tsx`, #1219) or “List · Month · Year” in To do. For tabs with their own content below them (the tabs of a folder) there are the tab cards.

| Property | Purpose |
| --- | --- |
| `wert` | the chosen choice |
| `setze(wert)` | is called with the new choice – by click, tap or arrow key |
| `wahlen` | `{ wert, text }` – two to four, short (one word) |
| `beschriftung` | name of the group for screen readers, e.g. “Ask or search” |
| `anker` | jump target for tours and tips (`data-anker`), optional |
| `schmalUntereinander` | long choices (#1217, “New folder · Existing folder · Just mark as done”): stacked on a phone (up to 600 px) instead of cut off, optional |

```tsx
import { Umschalter } from '../bausteine';

<Umschalter wert={art} setze={waehle} beschriftung={t('ablage.startfeld.art')}
  wahlen={[{ wert: 'fragen', text: t('ablage.startfeld.fragen') }, { wert: 'suchen', text: t('ablage.startfeld.suchen') }]} />
```

- **For screen readers** a group of radio buttons (`role="radiogroup"` with the label, each choice `role="radio"` with `aria-checked`) – it announces what is chosen.
- **Keyboard** as with radio buttons: Tab only reaches the chosen choice; the arrow keys (left/right and up/down, wrapping round) as well as Home and End choose and stay in the group; Tab moves on.
- **Chosen** is not shown by colour alone: filled, bold and with a border in the accent colour. The bold type doesn’t change the width (#1175): invisibly, each choice keeps room for its bold text – nothing jumps when switching.
- **Unobtrusive:** small type, quiet colour – it sits next to a box without looking like a main action.
- **Remembering** is up to the page (e.g. as a setting of the person with `d.setzeEinstellung`).
- **On the phone** each choice is at least 44 × 44 px ([On the phone](bausteine.md#handy)).
- **Long choices** don’t fit side by side on a phone; with `schmalUntereinander` they are stacked there, as wide as the column (example: “Where does this belong?” on *Take over document*, `web/src/ablage/WohinGehoert.tsx`).
- The pattern page shows the building block in the section **Toggle**: two and three choices, plus long choices that are stacked on a phone.

Older places with the class `segmente` in `web/src/stile/` (List · Month · Year in *To do*, text size in My account) are converted by whoever changes them anyway.
