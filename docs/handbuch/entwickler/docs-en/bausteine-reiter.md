# Tabs

`Reiter` (tabs) is the building block for tabs above some content (#1210): exactly one tab is active, its content stands below it (`ReiterFlaeche`). There is **one active look** for all places – surface like the content, border, a line in the accent colour on top (blue also means selection, [principle 1](bausteine.md#leitsaetze)). Before, the active tab in a folder (coloured line per kind) looked different from the one in text recognition (grey).

![“Tabs” section of the pattern page: tabs of a folder with errors and a count](bilder/muster-reiter.png){ loading=lazy }

```tsx
import { Reiter, ReiterFlaeche } from '../bausteine';

const [reiter, setReiter] = useState<'felder' | 'dokumente'>('felder');
<Reiter id="mappe" wert={reiter} setze={setReiter} beschriftung={t('…register-der-mappe')}
  wahlen={[{ wert: 'felder', text: t('…felder'), fehler: 2 }, { wert: 'dokumente', text: t('…dokumente'), anzahl: 3 }]} />
<ReiterFlaeche id="mappe" wert={reiter}>{inhalt}</ReiterFlaeche>
```

| Property | Meaning |
| --- | --- |
| `id` | identifier of the row; the `id` of the tabs (`reiterId`) and of the panel (`flaecheId`) derive from it |
| `wert`, `setze` | the active tab and switching |
| `wahlen` | per tab `{ wert, text, anzahl?, fehler?, anker? }` – `fehler` shows a red number (with text for screen readers), `anzahl` a quiet one |
| `beschriftung` | name of the row for screen readers |

## Behaviour { #verhalten }

- **Keyboard** following WAI-ARIA: Tab only reaches the active tab, the arrow keys (also Home/End) choose the next one; Tab moves on to the first control in the panel.
- **Screen readers:** `role="tablist"` with a name, per tab `role="tab"` with `aria-selected` and `aria-controls`; the panel is `role="tabpanel"` and named after the active tab (no `tabindex` of its own: its content has controls).
- **Wider than the space:** the row scrolls sideways, the page does not. On a phone every tab is at least 44 px high.

**Distinction:** the [toggle](bausteine-umschalter.md) changes *how* the same thing works (e.g. “Ask · Search”); tabs show different content.

**Existing code:** the tabs of a folder (`.registertab`) and of text recognition move to this building block in #1211 and #1213.

![“Tabs” section, dark](bilder/muster-reiter-dunkel.png){ loading=lazy }

## Code { #code }

- Building block: `web/src/bausteine/reiter/Reiter.tsx`, look: `Reiter.module.css`
- Pattern page: `web/src/bausteine/reiter/muster.tsx`
- Test: `server/test/baustein-reiter.test.ts`
