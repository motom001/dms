# Tag

`Etikett` is a **plain label**: kind, link kind, state such as “Warning”, “Note”, “from package” (#1289). Small text, at most a light background, **no border**, squarer than a button and **not clickable**. It follows principle 8: **a border means “button”.** Whatever can be clicked is a [button](bausteine-knopf.md) or a `KnopfLink`, never a tag.

![“Tag” section of the pattern page: all kinds, with dot and small, a chosen entry with ✕](bilder/muster-etikett.png){ loading=lazy }

```tsx
import { Etikett, etikettArt } from '../bausteine';

<Etikett>{t('mappentypen.editor.chip.pflicht')}</Etikett>                // quiet (grey)
<Etikett art="warn">{t('werkbank.sicherung.frueherer-schluessel')}</Etikett>
<Etikett art="gut" punkt>{t('werkbank.benutzer.gerade-aktiv')}</Etikett>  // with a coloured dot
<Etikett art={etikettArt(ZUSTAND_ART[z.zustand])}>{name}</Etikett>       // kind from a table, unknown is quiet

// Chosen entry (pattern catalogue A1): a tag with a ✕ button in it.
<Etikett entfernen={() => setze(gewaehlt.filter((y) => y !== x))} entfernenText={t('werkbank.sichten.entfernen-2')}>
  {titel[x]}
</Etikett>
```

| Property | Meaning |
| --- | --- |
| `art` | `leise` (grey, default), `info` (accent), `gut` (green), `warn` (yellow), `schlecht` (red) – text on a light background, at least 4.5:1 in light and dark |
| `punkt` | coloured dot before the text (state of a traffic light, “active now”) |
| `klein` | a little smaller, for dense rows and tables |
| `title` | tooltip (e.g. until when an archive applies) |
| `entfernen`, `entfernenText` | chosen entry: only the ✕ is a button (icon only, `entfernenText` is its name for screen readers) |
| `className` | only for spacing and wrapping in the surroundings, never for colour or border |

**Rules:**

- No border, no click. A label that leads to a page is a `KnopfLink art="link"` (“You are away” in the user menu); one that does something is a `Knopf`.
- The [package chip](bausteine-paketchip.md) shows the origin from a package; it looks like a tag.
- Surroundings adjust a tag via `[data-etikett]` (`.eintrag [data-etikett] { margin-left: 6px; }`), never via a class of the component.
- The former global class `.chip` (border and pill shape like a secondary button, about 167 places) no longer exists.

**Checked** in the smoke test: the button guard (`web/rauchtest/hilfen.mjs`) reports `rand-ohne-knopf` on every visited page – a small element with a border all round and rounded corners that is neither button nor link nor field and contains none. axe checks the contrast of the tags in light and dark on the pattern page.

![“Tag” section dark](bilder/muster-etikett-dunkel.png){ loading=lazy }

## Code { #code }

- Component: `web/src/bausteine/etikett/Etikett.tsx`, look: `Etikett.module.css`
- Pattern page: `web/src/bausteine/etikett/muster.tsx`
- Test: `web/test/baustein-etikett.test.ts`
