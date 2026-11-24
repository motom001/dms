# Date

`DatumEingabe` (#1496) is Ablago's date field: you type as usual in the browser's date field and pick in a calendar of its own that shows the **week number** (ISO 8601) before each week – so "end of week 50" is quick to enter. It sits in a [Field](bausteine-feld.md) and takes its connection (`id`, `aria-describedby`, `aria-invalid` go to the input).

![Section "Date" of the pattern page: empty, filled, calendar open, disabled](bilder/muster-datum.png){ loading=lazy }

```tsx
import { DatumEingabe, Feld } from '../bausteine';

<Feld beschriftung={t('…faellig')}>
  <DatumEingabe wert={datum} setze={setDatum} />
</Feld>

// In the field frame as a function when the connection is passed on:
<Feld beschriftung={feldLabel(f)}>{(v) => <DatumEingabe {...v} wert={roh} setze={setze} min={heute} />}</Feld>
```

| Property | Meaning |
| --- | --- |
| `wert` | `YYYY-MM-DD` or empty – as with the browser's date field |
| `setze` | receives the new value (also empty when the person clears the field) |
| `min`, `max` | limits; days outside are disabled in the calendar (struck through) |
| `disabled` | disabled: field and calendar button |
| `aria-label` | name when no visible label points to the input |

**Decision (#1496): the calendar opens on a click into the field, the keyboard stays direct.**

- **A mouse click** into day, month or year opens the calendar **without taking the focus**: whoever types next types into the field, and the calendar follows the typed date. Tab moves on and closes it.
- **With the keyboard** nothing opens by itself. **Alt + Down arrow** or the **calendar button** at the right of the field open it with the focus on the day: arrow keys move, Home/End jump to the start or end of the week, Page Up/Down turn a month (with Shift a year), Enter picks, Esc closes and returns the focus to the field.
- **On the phone** a tap into the field opens the system's picker as before; the calendar with week numbers opens from the calendar button (44 × 44 px). On narrow screens the calendar is a sheet from the bottom.
- The browser's calendar icon is hidden in Chromium and Safari; the button of its own takes its place.
- At the bottom of the screen the calendar opens upwards.

**Week number:** `kalenderwoche(iso)` in `shared/src/kalender.ts` – weeks start on Monday, week 1 contains the first Thursday of the year (29 Dec 2025 is in week 1, 1 Jan 2027 in week 53). The column is called "Wk" (German "KW"), for screen readers "Week 50".

**Where it is used:** date fields of a folder, package actions (e.g. "Mark as paid") and the dialogs "Assign task" and "Remind". Other date inputs (workbench, profile) still use the browser's field.

![Section "Date" dark](bilder/muster-datum-dunkel.png){ loading=lazy }

## Code { #code }

- Component: `web/src/bausteine/datum/Datum.tsx`, look: `Datum.module.css`
- Pattern page: `web/src/bausteine/datum/muster.tsx`
- Test: `web/test/baustein-datum.test.ts`
