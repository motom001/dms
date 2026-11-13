# Save bar

`Speicherleiste` (save bar) is the bar at the bottom of every form for creating and editing (#370, built from building blocks since #1210). It stays visible while scrolling and shows the same everywhere: **“… delete” on the left**, the state in the middle (“Unsaved changes”), **“Discard” and the blue main button on the right** with the item in its name – all on one line.

![“Save bar” section of the pattern page: nothing changed, changed, delete locked for a reason, new](bilder/muster-speicherleiste.png){ loading=lazy }

## Layout { #aufbau }

| Place | What | Building block |
| --- | --- | --- |
| left | “… delete” (`loeschen`): a [danger button](bausteine-knopf.md#arten) in **normal size** with an icon and a confirmation; locked for a reason dashed with a padlock and ⓘ | `Knopf art="gefahr"` |
| middle | state or message (`meldung`), `role="status"` | – |
| right | further buttons (`weitere`), **“Discard”** (kind secondary, no icon, no confirmation), the **main button** (kind main, blue) | `Knopf`, `Knopf art="haupt"` |

Without changes, “Discard” and the main button are **faded** – nothing to do, no explanation (principle 6). When creating, “Discard” is called “Discard draft” and leads back to the list. While saving, the main button shows “working” with “Saving …” and keeps keyboard focus. Esc in the form discards – with a confirmation if something would be lost; the “Discard” button itself doesn't ask (its label is clear).

On a phone (up to 600 px) everything stands on one line; “… delete” then only shows its icon (the name stays for screen readers), the state is left out.

```tsx
import { Speicherleiste, useEntwurf } from '../bausteine';

const ent = useEntwurf(gespeichert, e, { neu, zuruecksetzen: () => setE(gespeichert), liste: '/werkbank/nummernkreise' });
<form onSubmit={…} onKeyDown={ent.tasten}>
  …
  <Speicherleiste ent={ent} gegenstand={t('…nummernkreis')} sendet={sendet}
    loeschen={!neu ? {
      text: t('…nummernkreis-loeschen'),
      rueckfrage: { titel: t('…nummernkreis-loeschen-frage'), text: t('…folgen'), ja: t('…loeschen') },
      gesperrt: k.verwendet.length > 0 && t('…wird-noch-verwendet'),
      onClick: loeschen,
    } : undefined} />
</form>
```

| Property | Meaning |
| --- | --- |
| `ent` | the draft from `useEntwurf` (new, changed, discard, Esc) |
| `gegenstand` | appears in the main button: “Save number sequence” or “Create …” |
| `loeschen` | `{ text, rueckfrage, onClick, gesperrt?, symbol? }` – the fixed place on the left; `onClick` only runs after “yes” |
| `sendet`, `ungueltig`, `speicherbar` | main button is working, is disabled (invalid), or is active even without changes |
| `speichern` | handler instead of submitting the form |
| `formular` | `id` of the form when the bar is outside it (editors with [areas](bausteine-bereiche.md)) |
| `weitere` | further buttons before “Discard” (e.g. “Set as default”) |
| `meldung`, `haupttext` | message instead of the state; own label for the main button (rare) |
| `links` | free place on the left – existing code only; “… delete” belongs in `loeschen` |

## Existing code { #bestand }

The folder still has its own bar in `MappeFormular.tsx` (green “Save”, small “Delete folder”); it moves to this building block in #1211. In the Workbench, “… delete” buttons are still red links under `links`; the area issues #1213 and #1214 convert them to `loeschen`. `web/src/Speicherleiste.tsx` forwards to the building block so the forms keep their import.

![“Save bar” section, dark](bilder/muster-speicherleiste-dunkel.png){ loading=lazy }

## Code { #code }

- Building block: `web/src/bausteine/speicherleiste/Speicherleiste.tsx`, look: `Speicherleiste.module.css` (basic shape `.speicherleiste` in `web/src/styles.css`), logic of the buttons: `shared/src/entwurf.ts`
- Pattern page: `web/src/bausteine/speicherleiste/muster.tsx`
- Tests: `server/test/baustein-speicherleiste.test.ts`, `server/test/entwurf.test.ts`
