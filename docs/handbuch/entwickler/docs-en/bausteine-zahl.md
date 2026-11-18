# Number

`Zahl` is the number after an entry of the navigation – in the filing area (To do, New post, Favourites, views) and in the workbench (areas). It follows principle 9 (pattern catalogue C14, #1287): **yellow only for warnings, 0 is always shown.**

![“Number” section of the pattern page: waiting, empty new post, amounts and a warning](bilder/muster-zahl.png){ loading=lazy }

```tsx
import { Zahl } from '../bausteine';

<Zahl wert={d.zaehler.eingang} art="wartet" />            // To do: bold in text colour, “2 waiting for you”
<Zahl wert={d.zaehler.favoriten} />                       // plain amount, quiet grey – also 0
<Zahl wert="!" art="warnung" beschriftung="! – automations paused" />
```

| Property | Meaning |
| --- | --- |
| `wert` | number (written in the locale) or a short warning text (“!”, “off”) |
| `art` | `menge` (default, quiet grey), `wartet` (bold in text colour, no background; at 0 like an amount), `warnung` (yellow pill) |
| `beschriftung` | text for screen readers instead of the visible number; for `wartet` it defaults to “{anzahl} waiting for you” |
| `title` | tooltip |

**Rules (principle 9):**

- **Yellow only for real warnings** – “Overview” and “Automations” in the workbench when there are notes.
- **What is waiting for you** (To do, New post): bold in text colour while it is more than 0; for screen readers with text, not only through the font weight.
- **Plain amounts** (Favourites, Bin, views, numbers in the workbench): quiet grey.
- **0 is always shown**, quiet grey. Only while loading does the placeholder `ZahlWarte` stand there; an entry that does not exist right now (bin switched off) is left out.

**Checked** in the smoke test “Navigation: Zahlen ruhig” (`web/rauchtest/bereiche/ruhige-werkbank.mjs`): no warning in the filing navigation, “0” for empty new post, axe light and dark. The former global class `.zaehler` (yellow pill for everything) no longer exists.

![“Number” section, dark](bilder/muster-zahl-dunkel.png){ loading=lazy }

## Code { #code }

- Component: `web/src/bausteine/zahl/Zahl.tsx`, appearance: `Zahl.module.css`
- Pattern page: `web/src/bausteine/zahl/muster.tsx`
- Test: `web/test/baustein-etikett.test.ts`
