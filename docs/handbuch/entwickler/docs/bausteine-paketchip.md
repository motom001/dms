# PaketChip

`PaketChip` zeigt, **woher ein Eintrag stammt** – überall gleich (#1192): Paket-Symbol und Paketname als kleiner Chip direkt hinter dem Namen, Tooltip „aus dem Paket Basis, Version 1.4.0“, Klick führt zur Paketseite. Selbst angelegte Einträge haben **keinen** Chip; was Ablago selbst mitbringt, trägt **„Ablago“**. Für die Herkunft gibt es **keine eigene Zeile**.

![Bereich „PaketChip“ der Musterseite: mit Link, in einer Listenzeile, von Ablago, selbst angelegt](bilder/muster-paketchip.png){ loading=lazy }

```tsx
import { PaketChip } from '../bausteine';
import { paketHerkunft, paketVonTyp } from './listensuche';

// In einer Listenzeile (die ganze Zeile ist ein Link): ohne eigenen Link.
<span className="titel">{typ.name}<PaketChip paket={paketHerkunft(paketVonTyp(typ, pakete), pakete)} inLink /></span>

// Auf einer Seite: als Link zur Paketseite.
<h1>{v.name}<PaketChip paket={{ id: 'basis', name: 'Basis', version: '1.4.0' }} /></h1>

// Mitgeliefert von Ablago:
<PaketChip paket="ablago" inLink />
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `paket` | `{ id, name?, version? }`, `'ablago'` oder nichts (eigen: kein Chip) |
| `inLink` | steht in einem Link (Listenzeile): ohne eigenen Link – ein Link im Link ist für Tastatur und Screenreader kaputt; Name und Tooltip bleiben |
| `titel` | eigener Tooltip (z. B. „ersetzt die Vorlage von Ablago“) |

`paketHerkunft(id, pakete)` in `web/src/werkbank/listensuche.ts` holt Name und Version aus den installierten Paketen.

**Regel:** Herkunft immer per `PaketChip` – nie „aus Paket“ ohne Namen, nie eine eigene Zeile.

**Umgestellt (#1192):** Mappentypen, Ansichten, Nummernkreise, Gleichbedeutende Wörter (vorher eigene zweite Zeile), Automatisierungen und Ablaufvorlagen (vorher „aus Paket“ ohne Namen), Paket erstellen (Mappentypen, Ansichten, Wortlisten).

![Bereich „PaketChip“ dunkel](bilder/muster-paketchip-dunkel.png){ loading=lazy }

## Code { #code }

- Baustein: `web/src/bausteine/paketchip/PaketChip.tsx`, Aussehen: `PaketChip.module.css`
- Musterseite: `web/src/bausteine/paketchip/muster.tsx`
- Test: `server/test/baustein-paketchip.test.ts`
