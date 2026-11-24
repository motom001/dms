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

## Principles for buttons { #leitsaetze }

Buttons mean the same everywhere, and nothing startles without need (#1210). Whoever places a button checks it against these nine sentences; the pattern page shows them at the top, the building blocks implement them.

1. **Blue is the main action.** Save, create after filling in, next and apply are blue (`Knopf art="haupt"`), at most one per area. Blue is also the accent colour (links, focus, selection) – this looks calm and coherent.
2. **Green means “start something new”**, and only that: “+ New”, “+ Post”, “+ Row”, “+ Emergency contact” (`art="anlegen"`). The label begins with “+”. Otherwise green is kept for states (active, done, went well).
3. **Discard is a button with a border** (`art="neben"`) next to the blue main button – it does something, so it is a button (pattern catalogue C8). No icon, not red on hover, no confirmation on click (only Esc with changes asks); faded without changes.
4. **Nothing on the page is red.** Dangerous buttons (delete, lock, sign out, remove a package …) look like a secondary button with an icon (`art="gefahr"`). On hover and keyboard focus text and border turn red.
5. **Solid red only at the moment of decision:** on the confirm button of the confirmation. No danger button without a confirmation – type checking only allows `art="gefahr"` with `rueckfrage` and `symbol`. Whatever can be undone (removing a link from a field, a row from a list before saving) is a normal “Remove” or “×”, not red.
6. **Two kinds of “not possible”.** *Nothing to do* (save or discard without changes, empty selection): `gesperrt` – faded, no explanation. *Locked for a reason* (delete with links, missing permission, archive mode): `gesperrt="<reason>"` or a `KnopfSperre` – dashed border with a padlock and a small ⓘ next to it; a click on the button or the ⓘ opens the explanation at the button (reason, affected entries, “Instead” as buttons). No long sentence in the row; for screen readers the reason is attached to the button (`aria-describedby`). Dashed means “locked for you” everywhere, like “read only” on a field (C4). No “?” – that leads to the manual (C7); ⓘ explains exactly this case.
7. **Links take you somewhere, actions are buttons** (pattern catalogue C8, #1277). Whatever does something – “Clear selection”, “Hide”, “Expand all”, “Remove” – is a `Knopf` (mostly `neben`, small in lists and bars). Only a way looks like a link: a page in Ablago (`KnopfLink to`), a file to download or an address outside (`KnopfLink href`). There is no kind `link` on `Knopf`; special forms such as column headers, disclosure toggles, menu entries, stars, handles and tiles are `art="eigen"` with the class of their owner (#1270); expanders are a component of their own ([expander](bausteine-aufklapper.md)).
8. **A border means “button”** (pattern catalogue C14, #1289). A border means “can be clicked” (secondary, danger), a solid fill means main action or create. Plain labels – kind, link kind, state such as “Warning”, “Note”, “from package” – are **tags** ([tag](bausteine-etikett.md)): small text, at most a light background, **no border**, not clickable. Chosen entries with ✕ (A1) are tags with a ✕ button in them. Whatever is clickable is a button or a link, never a tag.
9. **Numbers in the navigation are quiet** (pattern catalogue C14, #1287). Yellow only for real warnings (Overview, Automations in the workbench); what is waiting for you (To do, New post) bold in text colour without background; plain amounts quiet grey. 0 is always shown – only while loading a placeholder. Component [Number](bausteine-zahl.md).

**Checked** in three places: type checking requires symbol and confirmation for `art="gefahr"` and allows no kind `link` on `Knopf` (`web/src/bausteine/knopf/typpruefung.ts`). ESLint forbids colour classes via `className` on the button (`ablago/knopf-farben`) and elements that look like a button through the class `knopf` or `textknopf` (`ablago/bausteine`, #1269; [Style and dependencies](stil.md#regeln)). The smoke tests report, on every page they visit, create buttons without “+”, danger buttons without a confirmation, solid red outside a confirmation, anything that looks like a link but has no target, and every small element with a border that is neither button nor link nor field (principle 8) ([Smoke test and screenshots](#rauchtest)).

For users, the user manual explains the same rules on one page: [What buttons look like](https://help.ablago.app/benutzer/aktuell/en/knoepfe/) (#1524). Its pictures (`knoepfe-*`, light and dark) are taken by `musterAufnehmen` (`web/rauchtest/muster.mjs`) from single cards of the pattern page – when a building block changes, they stay right by themselves.

![Pattern page, area “Button”: kinds, danger at rest, on hover and focus, the confirmation, disabled in two forms and the opened explanation](bilder/muster-knopf.png){ loading=lazy }

## Pattern: note in the overview { #hinweis-uebersicht }

All notes under "Notes" in the workbench overview follow one pattern (#1511, entry in the pattern catalogue). New notes are created in `web/src/werkbank/uebersicht/hinweise.tsx` or `hinweise-betrieb.tsx` as a `Hinweis` and keep to it:

- **Structure:** title in bold, then one or two sentences. Below, **one** main button with the action (verb and object, e.g. "Set up email", "Install package") and next to it, as a secondary button, **"Acknowledge"** (`Akzeptieren.tsx`), for plain notices (`art: 'info'`) **"Hide"**. The button takes effect immediately, then **"Undo"** is shown at the top for a few seconds; a reason is optional and can be added afterwards (#1587). Acknowledged notes are collapsed at the bottom under "Consciously accepted (n)".
- **"No, thanks"** only where the note asks a real yes/no question (e.g. "second person with administration rights?"); plus the variant **"Read"** for red messages you can only acknowledge. Both via `erledigen`. A note that only comes once (e.g. after an update) closes with `erledigen: "Acknowledge"`, a plain notice with `erledigen: "Hide"`.
- **List in a note:** several identical actions are rows in **one** note, not several notes – per row a name, one sentence and the same secondary button with equal width below each other, then a link to all (`eigeneKnoepfe`, example "Recommended packages"). No tiles, no pictures. If the list is empty, the note disappears completely.
- **Migration notes** ("… is now a package") only for installations that come from an older version (`umstieg` in the overview response), never after a fresh setup.
- After an action, the overview reloads its notes by itself when you come back (#1513); completed notes disappear without "Reload".

## On a phone { #handy }

On a phone the finger hits, not the mouse pointer. So every control of a building block gets a **touch target of at least 44 × 44 px** with **`(pointer: coarse)`** (touch as the primary pointer) (pattern catalogue D6, #1027; WCAG 2.5.8 asks for 24 px). With a mouse (`pointer: fine`) everything stays as it is.

| Building block | On a phone |
| --- | --- |
| `Knopf`, `KnopfLink` (normal, all kinds) | at least 44 px high, icon only also 44 px wide; `KnopfLink art="link"` and special forms (`art="eigen"`) without a visible surface, too |
| `Knopf` small | stays small to the eye; an invisible pseudo-element enlarges the touch target, a margin of the same width keeps neighbours clear |
| `Feld` | inputs and selects at least 44 px high |
| help icon “?” in a field | stays small to the eye; invisible touch target of 44 × 44 px, header row 44 px high, space to the label |
| `HakenFeld`, checkboxes in `FeldGruppe` | the whole row with the label is at least 44 px high; the label toggles the checkbox, too |
| `Suchfeld`, `ListenSuche`, `KopfSuche` | input like a field; “×” as a button with only a symbol; “Package” choice and `FilterHaken` at least 44 px high; `KopfSuche` on the phone as a 44 px magnifier, opened the chip “×” and “Search in” 44 px |
| `Umschalter` | each choice at least 44 × 44 px |
| `Bereich`, jump bar from `useBereiche` | jumps and the head of an area at least 44 px high; “Expand all” as a small button (secondary) |
| ⓘ at a locked `Knopf` | stays small to the eye; touch target 44 × 44 px |
| `Speicherleiste` | all buttons on one line; “… delete” only shows its icon (the name stays for screen readers) |
| `Reiter` | each tab at least 44 px high; the row scrolls sideways, the page does not |
| `Schalter` | at least 44 px high, the label toggles too |
| `PaketChip` as a link | stays small to the eye; invisible touch target 44 px high |
| `Platzhalter` | small buttons with an invisible 44 × 44 px touch target |

**The rule:** touch targets never overlap – not in a row of buttons or a group of checkboxes either. Whoever uses a building block writes nothing for this; one-off solutions with `@media (pointer: coarse)` in the styles of an area (e.g. `web/src/ablage/ablage-liste.css`) are only left for places without a building block. New building blocks set their touch target in their own stylesheet, also only with `(pointer: coarse)`, so the desktop stays unchanged.

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

The smoke test “Musterseite der Bausteine” (`web/rauchtest/bereiche/bausteine-und-knoepfe.mjs`, job **pruefen**) opens `/muster` light and dark, on desktop and at phone width, checks each view with **axe-core** (WCAG 2.2 A and AA plus best practice, including `color-contrast`), checks that the page does not scroll sideways on a phone, and there for touch targets of at least 44 × 44 px ([On a phone](#handy)). Any violation makes the test fail. The screenshots end up in the run's artifact **musterseite**.

**Buttons on every page (#1210):** every smoke test runs a guard (`knopfWaechter` in `web/rauchtest/hilfen.mjs`) that checks the visible buttons after every change of the page: `data-knopf="anlegen"` begins with “+”, `data-knopf="gefahr"` opens a confirmation (`aria-haspopup="dialog"`), solid red only appears inside the window of a confirmation, and a small element with a border all round is a button, a link or a field (`rand-ohne-knopf`, principle 8, #1289). Existing code that does not meet this yet is listed with its issue in `KNOPF_AUSNAHMEN`; whoever converts the place removes the entry.

The workflow **Handbuch** takes the same screenshots in the jobs `bilder (de)` and `bilder (en)` (`docs/handbuch/screenshots/aufnehmen.mjs`, shared code in `web/rauchtest/muster.mjs`); they end up in this manual as `bilder/muster-*.png`. Locally they are missing, like all screenshots ([Getting started](loslegen.md)).

## Building blocks { #liste }

| Building block | Purpose |
| --- | --- |
| [Field](bausteine-feld.md) | Frame for every input: label, input, error, hint, help icon |
| [Button](bausteine-knopf.md) | Every button: kinds main (blue), create (green, “+ …”), secondary, danger (with a confirmation), special form; ways as `KnopfLink` (also downloads and addresses outside); disabled in two forms, “working”, result and error at the button; plus the confirmation |
| [Save bar](bausteine-speicherleiste.md) | At the bottom of every form: “… delete” on the left, state, “Discard” with a border and the blue main button; draft with Esc and a warning when leaving |
| [Tabs](bausteine-reiter.md) | Tabs above some content, one active look, keyboard and `aria` following WAI-ARIA |
| [Switch](bausteine-schalter.md) | Something is on or off (function, service, automation) – sliding switch; choices and options stay checkboxes |
| [Tag](bausteine-etikett.md) | Plain label without border and without click (principle 8): kinds quiet, info, good, warn, bad; chosen entry with ✕ |
| [Number](bausteine-zahl.md) | Number after an entry of the navigation (principle 9): amount quiet grey, “waiting” bold, warning yellow; 0 is always shown |
| [Tile](bausteine-kachel.md) | A way with a number, the same on start page and workbench overview; green with a tick only when empty means “done” |
| [Package chip](bausteine-paketchip.md) | Origin from a package: icon and name after the name, tooltip with version, link to the package page |
| [Inputs with a unit](bausteine-einheit.md) | Period (number and unit, singular/plural) and percentage (number with “%”) for the field kinds period and percentage |
| [Date](bausteine-datum.md) | Date field for typing with a calendar of its own including week numbers (ISO 8601); a click into the field opens it, the keyboard stays direct |
| [Table](bausteine-tabelle.md) | Rows with columns, each leading to a page; wide a table, narrow a list with the first two columns (field kind table) |
| [Search](bausteine-suche.md) | The search field of all lists and the pattern “list in the middle: search field on top, filters below” with number of results, places found and package filter |
| [Toggle](bausteine-umschalter.md) | Segmented button: two to four equal choices, exactly one on – such as “Ask · Tips · Manual” in the assistant |
| [Areas](bausteine-bereiche.md) | The pattern “editor on the right: jump bar + areas”: jump bar with “Expand all”, areas to expand and collapse, memory per device, errors open their area |
| [Versions](bausteine-fassungen.md) | Who changed what and when: list with readable changes, compare two versions, restore with a preview; deleted entries below a list |
| [Menu](bausteine-menue.md) | A button that opens actions – “Folder ▾”, “⋯” on rows and lists: groups, icons, locked items with a reason, danger set apart at the end with a confirmation; a sheet on the phone |
| [Selection checkbox](bausteine-wahlhaken.md) | The checkbox that selects rows of a list: no visible label, Shift for ranges, “partly” in the header |
| [Multiple selection](bausteine-mehrfachauswahl.md) | Choose one or several entries: search field with suggestions and “+ Create …”, chosen entries below with ✕ |
| [Placeholders](bausteine-platzhalter.md) | A text’s placeholders as clickable buttons: understandable name, grouped by “General” and folder type, inserted at the cursor |
| [Expander](bausteine-aufklapper.md) | Heading of a section or row of a list that expands and collapses content – arrow, `aria-expanded` and `aria-controls` built in |
