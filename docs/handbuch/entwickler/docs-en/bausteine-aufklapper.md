# Expander

`Aufklapper` is the **heading of a section** or the **row of a list** that expands and collapses content (#1270): arrow to the right (closed) or down (open), label left-aligned and wrapping, a light background on hover. The component brings the arrow, `aria-expanded` and `aria-controls`; the caller shows the content below. These used to be the special forms `aufklappkopf` and `aufklappzeile` on the button.

![“Expander” section of the pattern page: heading of a section (expanded) and row of a list](bilder/muster-aufklapper.png){ loading=lazy }

```tsx
import { Aufklapper } from '../bausteine';

<section className="aufklappbereich">
  <Aufklapper offen={experte} steuert="pakete-experte" umschalten={() => setExperte(!experte)}>
    <span>{t('werkbank.pakete.expertenmodus')}</span>
    <span className="leise klein">{t('werkbank.pakete.weitere-quellen-paket-oder')}</span>
  </Aufklapper>
  {experte && <div id="pakete-experte" className="aufklappinhalt">…</div>}
</section>

// Row of a list, e.g. a database measurement:
<Aufklapper form="zeile" offen={offenHier} umschalten={() => umschalten(id)}>…</Aufklapper>
```

| Property | Meaning |
| --- | --- |
| `form` | `kopf` (default: bold, full width, arrow in accent colour) or `zeile` (list font, quiet arrow) |
| `offen`, `umschalten` | state and toggle – the state stays with the caller |
| `steuert` | id of the content (`aria-controls`) |
| `title` | tooltip |

**Rule:** a section that expands and collapses uses this component. For several areas of a page with a jump bar there are [areas](bausteine-bereiche.md).

## Code { #code }

- Component: `web/src/bausteine/aufklapper/Aufklapper.tsx`, look: `Aufklapper.module.css`
- Pattern page: `web/src/bausteine/aufklapper/muster.tsx`
- Test: `web/test/baustein-etikett.test.ts` (together with the tag)
