# Selection checkbox

`Wahlhaken` (#1211, #1212) is the checkbox that selects rows of a list – folders of a view, documents of a folder, entries in the bin. It sits in the row without a visible label; the row shows what it is about. For a checkbox with a visible label there is `HakenFeld` ([Field](bausteine-feld.md)).

![“Selection checkbox” section of the pattern page: on, off, partial, disabled](bilder/muster-wahlhaken.png){ loading=lazy }

| Prop | Purpose |
| --- | --- |
| `an` | selected or not |
| `setze(an, bereich)` | new state; `bereich` is `true` with Shift held (from the last choice up to here) |
| `beschriftung` | name for screen readers naming the entry (“Select tenancy agreement”) |
| `teilweise` | “some selected” – for the checkbox in the header of a list (`indeterminate`) |
| `gesperrt` | not selectable (e.g. a document that goes away on saving) |

```tsx
<Wahlhaken an={gewaehlt.has(x.id)} beschriftung={t('…auswaehlen', { name: x.name })}
  setze={(an, bereich) => waehle(x, an, bereich)} />
```

- **Touch target:** at least 24 px on the computer, 44 × 44 px around the box on the phone (`pointer: coarse`).
- A click on the checkbox doesn't open the row – even if the whole row is clickable.
- The pattern page shows the building block in the area **Selection checkbox**: on, off, partly and locked.

![“Selection checkbox” section, dark](bilder/muster-wahlhaken-dunkel.png){ loading=lazy }

Code: `web/src/bausteine/wahlhaken/`.
