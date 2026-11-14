# Placeholders

`Platzhalter` (#1177) shows the placeholders of a text as clickable buttons – the same everywhere: in the title template and with “Composite” in the folder type, in the cards of automations (task, change field, call URL, send e-mail) and in the run templates. Nobody has to copy `{field}` names from a long line.

![“Placeholders” section of the pattern page: a text with placeholders, grouped by “General” and folder type](bilder/muster-platzhalter.png){ loading=lazy }

| Prop | Purpose |
| --- | --- |
| `gruppen` | `{ name?, eintraege }[]` – one line per group with its name in front, e.g. “General” and one per folder type; empty groups are left out |
| `eintraege` | `{ key, text, zusatz?, titel? }[]`: `key` without braces, `text` understandable (field label), `zusatz` briefly after it (e.g. “only for Contract”), `titel` as tooltip (default: the technical placeholder `{key}`) |
| `einsetzen` | called with the `key` – usually `einsetzen` from `usePlatzhalterEinsetzen` |
| `beschriftung` | name of the group for screen readers and shown in front; default “Insert placeholder” |

**Inserting at the cursor:** `usePlatzhalterEinsetzen()` returns `feld(name, wert, setze)` and `einsetzen(key)`. Attach `feld(…)` to every input that accepts placeholders:

```tsx
const ein = usePlatzhalterEinsetzen();
<textarea {...ein.feld('text', karte.text, (x) => setze({ ...karte, text: x }))} value={karte.text} onChange={…} />
<Platzhalter einsetzen={ein.einsetzen} gruppen={…} />
```

- A click inserts the placeholder in the **last used field at the cursor** (replacing a selection) and puts the cursor after it. If no field has been used yet, it goes to the end of the last registered one.
- With `usePlatzhalterEinsetzen({ trenner: ' · ' })` the separator goes in front when inserting at the end of a non-empty text (as with “Composite”).
- The buttons are small `Knopf` (kind Neben); **on phones** they have the invisible 44 × 44 px tap area.
- The pattern page shows the component in the section **Placeholders**.

![“Placeholders” section, dark](bilder/muster-platzhalter-dunkel.png){ loading=lazy }

Code: `web/src/bausteine/platzhalter/`.
