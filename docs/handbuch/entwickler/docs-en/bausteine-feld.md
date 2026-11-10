# Field { #feld }

`Feld` (field) is the frame around every input (#967). It sets the label, hint, error message and help icon and links them for screen readers – so that every field looks the same and says the same way what is wrong and where to find help.

![“Field” section of the pattern page: empty, filled, with hint and help, optional, error, error with hint, disabled, read only, drop-down list, multi-line, checkbox, group](bilder/muster-feld.png){ loading=lazy }

## Structure { #aufbau }

Every field uses the same rows (basic rule “form rows” in the pattern catalogue, #801):

1. **Label** – short, without a colon; followed if needed by **“(optional)”** and the **help icon** “?”.
2. **Input** – text box, drop-down list, multi-line box …; a checkbox sits in this row together with its label.
3. **Error** – what is wrong and how to put it right, in the error colour with a warning icon. It sits directly below the input, where the eye is: a long hint cannot push it away – on a phone not under the keyboard either – and the visible order is the same as the order read aloud.
4. **Hint** – a permanent explanation in quiet type. For a checkbox, its description goes here.

```tsx
import { Feld, HakenFeld, FeldGruppe } from '../bausteine';

<Feld beschriftung={t('…plz')} hinweis={t('…plz.hinweis')} fehler={plzFehler} hilfe="einrichtung.konto">
  <input type="text" inputMode="numeric" value={plz} onChange={(e) => setPlz(e.target.value)} />
</Feld>
```

| Property | Meaning |
| --- | --- |
| `beschriftung` | visible name of the field (required) |
| `hinweis` | explanation below the input; a list gives several lines |
| `fehler` | error message; empty (`null`, `undefined`, `''`) means no error |
| `hilfe` | place in the manual from `shared/src/hilfe.ts` – the “?” after the label |
| `optional` | marks a voluntary field with “(optional)” |
| `id` | id of the input; if not given, the element's own, otherwise a generated one |

## Variants { #varianten }

| Variant | When | Input |
| --- | --- | --- |
| `Feld` | text, number, date, drop-down list, multi-line, password | exactly one element |
| `HakenFeld` | a single checkbox (yes/no) | `<input type="checkbox">` – sits before the label |
| `FeldGruppe` | several inputs under one label: checkboxes of a multiple choice, radio buttons, a stored secret with buttons | any number, each with its own label |

If the input does not take the links as props (its own component that passes them on to an inner element), pass a function: `<Feld …>{(v) => <ZahlEingabe v={v} … />}</Feld>`. `v` contains `id`, `aria-describedby` and `aria-invalid`.

## States { #zustaende }

| State | How it comes about | How it looks |
| --- | --- | --- |
| empty, filled | value of the input | border in `--rand-eingabe` (at least 3:1, #1026) |
| mouse over | – | border in `--leise` (not when disabled or read only) |
| keyboard focus | – | border and focus ring in `--akzent` |
| error | `fehler` set | border and message in `--schlecht`, warning icon; the focus ring then also in `--schlecht` |
| error with hint | `fehler` and `hinweis` set | message directly below the input, the hint below it |
| disabled | `disabled` on the input | surface `--senke`, text `--leise`, weaker border `--linie-stark`, no hover |
| read only | `readOnly` on the input | surface `--senke`, dashed border, text easy to read and select |
| optional | `optional` | “(optional)” in `--leise` after the label |

![Mouse over the field “Town”, keyboard focus in the field “Street” – light](bilder/muster-feld-fokus.png){ loading=lazy }
![The same in dark](bilder/muster-feld-fokus-dunkel.png){ loading=lazy }

![“Field” section in dark](bilder/muster-feld-dunkel.png){ loading=lazy }

## When to use it, when not { #wann }

**Use it** for every new input in a form – also for a single field in a dialog. Existing forms are converted by whoever changes them anyway (so far: package settings and the settings when installing a package).

**Do not use it**

- for search boxes in a toolbar without a visible label (use `aria-label` on the box there);
- for inputs in table cells (the column header is the label);
- for plain displays without input – use property lists (`<dl class="eigenschaften">`);
- as a frame around several independent fields – each field gets its own frame; inputs that belong together under one label are a `FeldGruppe`.

## Behaviour { #verhalten }

- **Required is the normal case** and is not marked; voluntary fields get `optional`. This also applies to package settings: fields without `pflicht` in the manifest show “(optional)”; there is no asterisk.
- **Only show errors when they are right:** after saving or once the input is definitely wrong – not on the first keystroke in an empty field.
- **The message says how to put it right:** “Please enter exactly five digits.” instead of “Invalid”.
- **The hint stays** when an error is added; the error goes above it, directly below the input (state “Error with hint” on the pattern page).
- **The help icon opens the matching place in the manual** of the installed version in a new tab (component `Hilfe`).

## Accessibility { #barrierefreiheit }

The frame sets automatically:

- `id` on the input and `htmlFor` on the label – a click on the label focuses the input, screen readers read the name;
- `aria-describedby` on the input: first the error message, then the hint (the input's own values stay in front);
- `aria-invalid="true"` while an error is set;
- an error area with `aria-live="polite"` that is always in the document (empty, without height). A new message is announced without interrupting the person. Deliberately **no** `role="alert"`: after saving with several errors, every field would otherwise interrupt separately;
- “(optional)” as part of the name (“Phone (optional)”);
- the help icon **next to**, not inside, `<label>` – otherwise the field would be called “Phone Help on …”;
- for `FeldGruppe`, `role="group"` with `aria-labelledby` pointing to the label, hint and error via `aria-describedby` on the group.

Errors are never shown by colour alone: the message is text with a warning icon in front. Hover and keyboard focus are visible in light and dark. The pattern page checks this in the smoke tests with axe-core.

## Right and wrong { #richtig-falsch }

| Right | Wrong |
| --- | --- |
| `<Feld beschriftung="Name"><input …/></Feld>` | `<label>Name</label><input …/>` without `htmlFor` and `id` |
| `<Feld beschriftung="Phone" optional>` | “Phone*” on all other fields |
| `hilfe="einrichtung.konto"` – the “?” at the label | a “?” below the field or in the message |
| `fehler="Please enter exactly five digits."` | `fehler="Invalid"` or just a red border |
| `<HakenFeld beschriftung="Reminder by email" hinweis="On the day before the appointment.">` | writing the checkbox's description into its label |
| `<FeldGruppe beschriftung="Weekdays">` with one `<label className="haken">` each | one `<label htmlFor>` for several checkboxes |
| a new variant in the building block if something is missing | overriding the frame's spacing or colours on a page |

## Code { #code }

- Building block: `web/src/bausteine/feld/Feld.tsx`, look: `Feld.module.css`
- Pattern page: `web/src/bausteine/feld/muster.tsx`
- Test: `server/test/baustein-feld.test.ts` (renders with react-dom/server and checks `id`, `htmlFor`, `aria-describedby`, `aria-invalid`)
- First users: `Eingabe` in `web/src/werkbank/PaketEinstellungen.tsx` (Workbench → Packages → Settings and when installing)
