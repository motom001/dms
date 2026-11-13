# Package chip

`PaketChip` shows **where an entry comes from** – the same everywhere (#1192): package icon and package name as a small chip right after the name, tooltip “from the package Basis, version 1.4.0”, a click leads to the package page. Entries you created yourself have **no** chip; what Ablago brings itself carries **“Ablago”**. There is **no separate line** for the origin.

![“Package chip” section of the pattern page: with link, in a list row, from Ablago, created yourself](bilder/muster-paketchip.png){ loading=lazy }

```tsx
import { PaketChip } from '../bausteine';
import { paketHerkunft, paketVonTyp } from './listensuche';

// In a list row (the whole row is a link): no link of its own.
<span className="titel">{typ.name}<PaketChip paket={paketHerkunft(paketVonTyp(typ, pakete), pakete)} inLink /></span>

// On a page: as a link to the package page.
<h1>{v.name}<PaketChip paket={{ id: 'basis', name: 'Basis', version: '1.4.0' }} /></h1>

// Included with Ablago:
<PaketChip paket="ablago" inLink />
```

| Property | Meaning |
| --- | --- |
| `paket` | `{ id, name?, version? }`, `'ablago'` or nothing (own: no chip) |
| `inLink` | stands inside a link (list row): no link of its own – a link inside a link is broken for keyboard and screen readers; name and tooltip stay |
| `titel` | own tooltip (e.g. “replaces Ablago's template”) |

`paketHerkunft(id, pakete)` in `web/src/werkbank/listensuche.ts` takes name and version from the installed packages.

**Rule:** origin always via `PaketChip` – never “from package” without a name, never a separate line.

**Converted (#1192):** folder types, views, number sequences, synonyms (before: a second line of their own), automations and workflow templates (before: “from package” without a name), create package (folder types, views, word lists).

![“Package chip” section, dark](bilder/muster-paketchip-dunkel.png){ loading=lazy }

## Code { #code }

- Building block: `web/src/bausteine/paketchip/PaketChip.tsx`, look: `PaketChip.module.css`
- Pattern page: `web/src/bausteine/paketchip/muster.tsx`
- Test: `server/test/baustein-paketchip.test.ts`
