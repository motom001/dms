# Tile

`Kachel` is a way with a number – the same on the **start page of the filing area** and on the **workbench overview** (#1271, #1284). Background like the content, border, the title at the top, the number large in the accent colour, a quiet line below. The whole tile is a link. Several tiles stand in `Kacheln`, a grid; below about 420 px width each tile becomes a row (title left, number right).

![“Tile” section of the pattern page: with number, empty and done, empty without success, loading, text](bilder/muster-kachel.png){ loading=lazy }

```tsx
import { Kachel, Kacheln } from '../bausteine';

<Kacheln>
  <Kachel name="eingang" to="/ablage/eingang" titel={t('ablage.startseite.zu-erledigen')} wert={zahl}
    leer={t('ablage.startseite.nichts-zu-erledigen')} leerGut />          // 0: green with tick – done
  <Kachel name="wahl" to="/ablage/favoriten" titel={t('ablage.startseite.favoriten')} wert={favoriten}
    leer={t('ablage.startseite.noch-keine-der-stern')} />                // 0: quiet – empty is no success
  <Kachel to="/werkbank/systemzustand#version" titel={t('werkbank.uebersicht.version')} wert={version} unter={…} />
</Kacheln>
```

| Property | Meaning |
| --- | --- |
| `to` | target of the tile |
| `titel` | title at the top (also with a symbol) |
| `wert` | number (written in the locale) or short text (date, version); `null` = still loading, “…” |
| `leer`, `leerGut` | text instead of 0; with `leerGut` green with a tick – only when empty means “done” (To do, New post) |
| `unter`, `zusatz` | quiet lines below; `unter` is left out at 0 with `leer` |
| `name`, `anker` | `data-kachel` (fixed key, #421) and `data-anker` (tours) |
| `vorher` | runs before the way (date tile: choose the “Month” view) |

**Rules:** tiles are neutral; only the number carries colour. Green means “good” – an empty area without a task (no favourites) stays quiet. Notes and warnings do not go into a tile but below it as a note (workbench overview).

![“Tile” section, dark](bilder/muster-kachel-dunkel.png){ loading=lazy }

## Code { #code }

- Component: `web/src/bausteine/kachel/Kachel.tsx`, appearance: `Kachel.module.css`
- Pattern page: `web/src/bausteine/kachel/muster.tsx`
- Test: `web/test/baustein-etikett.test.ts`
