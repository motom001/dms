# Design and building blocks { #gestaltung-und-bausteine }

Building blocks are the small parts every page of the interface is made of: a field, a button, a message. Each building block looks the same everywhere, behaves the same everywhere and brings accessibility along with it. When you build a page, you put building blocks together instead of writing the label, error display or `aria` attributes from scratch each time (#967).

## Where they live { #ort }

All building blocks are in `web/src/bausteine/`:

| File | Purpose |
| --- | --- |
| `index.ts` | The front door: pages import building blocks only from here (`import { Feld } from '../bausteine'`), never from the subfolders. |
| `README.md` | Short overview for anyone reading the code. |
| `<block>/<Block>.tsx` | The building block itself, e.g. `feld/Feld.tsx`. |
| `<block>/<Block>.module.css` | Its look as a CSS module – classes apply only to this building block, values only from [tokens](stil.md#farben). |
| `<block>/muster.tsx` | The building block's section on the pattern page: every state once. |
| `muster.tsx` | The pattern page itself and the list of its sections. |

## Rules { #regeln }

- **Named variants instead of switches.** A checkbox is `HakenFeld`, not `Feld art="haken"`. Each variant stays small and understandable; there is no god component with twenty switches.
- **New code strict, existing code when touched.** New pages use the building blocks. Existing pages are converted by whoever changes them anyway – no big rewrite. ESLint watches this: `ablago/bausteine` reports every raw `<button>` and every input without a field frame outside `web/src/bausteine/`; the existing code is frozen ([Style and dependencies](stil.md#regeln)).
- **Same look, same meaning.** A building block decides spacing, type, colours and states. A page does not override them; if something is missing, the building block gets a new variant.
- **Accessibility belongs in the building block.** `id`, `htmlFor`, `aria-describedby` and the like are set by the building block; whoever uses it does not have to think about them.
- **Light and dark, desktop and phone.** Every state is readable in both appearances and at phone width; hover and keyboard focus are visible.

## On a phone { #handy }

On a phone the finger hits, not the mouse pointer. So every control of a building block gets a **touch target of at least 44 × 44 px** with **`(pointer: coarse)`** (touch as the primary pointer) (pattern catalogue D6, #1027; WCAG 2.5.8 asks for 24 px). With a mouse (`pointer: fine`) everything stays as it is.

| Building block | On a phone |
| --- | --- |
| `Knopf`, `KnopfLink` (normal, all kinds) | at least 44 px high, icon only also 44 px wide; the kind link without a visible surface, too |
| `Knopf` small | stays small to the eye; an invisible pseudo-element enlarges the touch target, a margin of the same width keeps neighbours clear |
| `Feld` | inputs and selects at least 44 px high |
| help icon “?” in a field | stays small to the eye; invisible touch target of 44 × 44 px, header row 44 px high, space to the label |
| `HakenFeld`, checkboxes in `FeldGruppe` | the whole row with the label is at least 44 px high; the label toggles the checkbox, too |
| `Suchfeld`, `ListenSuche` | input like a field; “×” as a button with only a symbol; “Package” choice and `FilterHaken` at least 44 px high |
| `Umschalter` | each choice at least 44 × 44 px |
| `Bereich`, jump bar from `useBereiche` | jumps and the head of an area at least 44 px high; “Expand all” as a button of type link |

**The rule:** touch targets never overlap – not in a row of buttons or a group of checkboxes either. Whoever uses a building block writes nothing for this; one-off solutions with `@media (pointer: coarse)` in `styles.css` are only left for places without a building block. New building blocks set their touch target in their own stylesheet, also only with `(pointer: coarse)`, so the desktop stays unchanged.

**Checked** in the smoke test of the pattern page: in the phone view (390 px, touch) `tippflaechenPruefen` in `web/rauchtest/muster.mjs` measures every control on the page the way the browser assigns a tap (`elementFromPoint` – invisible touch targets and labels count). Each needs a square of 44 × 44 px of its own; otherwise the test fails. Exceptions are listed with a reason in `TIPP_AUSNAHMEN` (none today).

## Pattern page { #musterseite }

The pattern page at **`/muster`** shows every building block in every state – to look at, try out and compare. At the top right you can switch the appearance (automatic, light, dark, high contrast); the choice is kept in the address (`/muster?darstellung=dunkel`).

![Pattern page with the “Field” and “Button” sections: every state in its own card](bilder/muster-hell.png){ loading=lazy }

It only exists

- in **development mode** (`npm run dev`, then `http://localhost:5173/muster`) and
- in the **test build**: `VITE_MUSTER=1 npm run build`. The CI jobs for the smoke tests and the manual screenshots build this way.

The **production build** (`npm run build` without `VITE_MUSTER`, also in the image) does not contain it at all: `web/src/start.tsx` only loads it if `import.meta.env.DEV` or `import.meta.env.VITE_MUSTER === '1'`. Vite fixes both values at build time, the condition is then always false and the code drops out. The job **pruefen** builds the interface once without `VITE_MUSTER` and fails if anything of the pattern page is still in it.

**New building block:** create a folder under `web/src/bausteine/` with the building block, its stylesheet and `muster.tsx`, export it from `index.ts` and add it to `BAUSTEINE` in `web/src/bausteine/muster.tsx`. Texts of the pattern page live in the language files like all texts (`oberflaeche.muster.*`, German and English).

## Smoke test and screenshots { #rauchtest }

The smoke test “Musterseite der Bausteine” (`web/rauchtest/rauchtest.mjs`, job **pruefen**) opens `/muster` light and dark, on desktop and at phone width, checks each view with **axe-core** (WCAG 2.2 A and AA plus best practice) checks that the page does not scroll sideways on a phone, and there for touch targets of at least 44 × 44 px ([On a phone](#handy)). Any violation makes the test fail. The screenshots end up in the run's artifact **musterseite**.

The workflow **Handbuch** takes the same screenshots in the jobs `bilder (de)` and `bilder (en)` (`docs/handbuch/screenshots/aufnehmen.mjs`, shared code in `web/rauchtest/muster.mjs`); they end up in this manual as `bilder/muster-*.png`. Locally they are missing, like all screenshots ([Getting started](loslegen.md)).

## Building blocks { #liste }

| Building block | Purpose |
| --- | --- |
| [Field](bausteine-feld.md) | Frame for every input: label, input, error, hint, help icon |
| [Button](bausteine-knopf.md) | Every button: kinds create, main, secondary, danger, link; disabled with a reason, “working”, result and error at the button |
| [Inputs with a unit](bausteine-einheit.md) | Period (number and unit, singular/plural) and percentage (number with “%”) for the field kinds period and percentage |
| [Table](bausteine-tabelle.md) | Rows with columns, each leading to a page; wide a table, narrow a list with the first two columns (field kind table) |
| [Search](bausteine-suche.md) | The search field of all lists and the pattern “list in the middle: search field on top, filters below” with number of results, places found and package filter |
| [Toggle](bausteine-umschalter.md) | Segmented button: two to four equal choices, exactly one on – such as “Ask · Search” on the start page |
| [Areas](bausteine-bereiche.md) | The pattern “editor on the right: jump bar + areas”: jump bar with “Expand all”, areas to expand and collapse, memory per device, errors open their area |
| [Versions](bausteine-fassungen.md) | Who changed what and when: list with readable changes, compare two versions, restore with a preview; deleted entries below a list |
