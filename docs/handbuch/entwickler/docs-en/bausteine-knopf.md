# Button { #knopf }

`Knopf` (button) is the building block for every button (#968, sharpened in #1210). It fixes the kind (main, create, secondary, danger, link), shows disabled, “working” and the result the same way everywhere and sets `aria` itself – so that every button shows the same way what it does, whether it is working or why it can't be used. The [principles](bausteine.md#leitsaetze) apply to every button.

![“Button” section of the pattern page: kinds, small, mouse over, keyboard focus, danger at rest, on hover and focus, the confirmation, disabled in two forms, the opened explanation, working, icon only, result, error, row of buttons](bilder/muster-knopf.png){ loading=lazy }

## Kinds { #arten }

| Kind | Looks | What for | Example |
| --- | --- | --- | --- |
| `haupt` | solid blue (accent colour) | the main action of a form or step – at most one per area | “Save number sequence”, “Next”, “Apply”, “Back up now” |
| `anlegen` | solid green | **only** starting something new; the label begins with **“+”** | “+ New”, “+ Post”, “+ Row”, “+ Emergency contact” |
| `neben` | surface with a border | everything else (default), also “Discard” and “Cancel” | “Test connection”, “Discard changes” |
| `gefahr` | **like secondary, with an icon**; text and border turn red only on hover and keyboard focus | something where saved data is lost or someone is locked out – **always with a confirmation**, which the button asks itself | “Delete”, “Lock immediately”, “Sign everyone out” |
| `link` | like a link | **for ways only**: back, to the list – never for an action that changes something | “Back to the list”, “Back” |

The colours come from the tokens (`--akzent`, `--gruen`, `--schlecht`) and apply in every design. **Colour classes via `className`** (`gefahr`, `gefahr-rand`, `gruen`, `primaer`) do not exist on the button – the colour comes from the kind; ESLint reports it (`ablago/knopf-farben`). Size: `groesse="klein"` in list headers, table rows and bars, otherwise normal. On a phone every button has a touch target of at least 44 × 44 px, the small one, too ([On a phone](bausteine.md#handy)).

**Solid red** is only the confirm button of a confirmation – the moment of decision (principle 5). The building block `Rueckfragen` (`web/src/bausteine/rueckfrage/`) sets it; it does not exist on a page.

**Whatever can be undone** – taking a link out of a field, removing a row from a list before saving – is not a danger button but a normal “Remove” (kind secondary or link) or an “×”.

**“+ New” (#989):** If a page has only one thing to create, the button is called exactly “+ New”. If several things can be created on one page, it is “+ New …” with the item, e.g. “+ New key”.

```tsx
import { Knopf, KnopfLink, type KnopfErgebnis } from '../bausteine';

<KnopfLink to="/werkbank/benutzer/neu" art="anlegen" groesse="klein">{t('werkbank.benutzer.neu')}</KnopfLink>

<Knopf onClick={jetztPruefen} laeuftText={t('…prueft')}>{t('…jetzt-pruefen')}</Knopf>

// Danger: icon and confirmation are required; onClick only runs after “Delete”.
<Knopf art="gefahr" symbol="geloescht" onClick={() => api.notizLoeschen(n.id)}
  rueckfrage={{ titel: t('…notiz-loeschen'), text: t('…laesst-sich-nicht-rueckgaengig'), ja: t('…loeschen') }}>
  {t('…loeschen')}
</Knopf>
```

## Variants { #varianten }

| Variant | When |
| --- | --- |
| `Knopf` | a `<button>`: every action |
| `KnopfLink` | a way within Ablago that looks like a button – e.g. “+ New”, which opens the page for creating (never danger) |
| `knopfAussehen({ art, groesse })` | only classes and `data-knopf` for elements that cannot be a `<button>`, such as the `<summary>` of a disclosure (never danger – that needs the confirmation on the button) |
| `ErgebnisBlock` | detailed result below a button (e.g. a checklist): `aria-live`, scrolls gently into view |
| `rueckfrage()`, `hinweis()` | a confirmation without a danger button (e.g. “Create a new address?”) and a notice window, from `web/src/rueckfrage.tsx`; shown by the building block `Rueckfragen` |

| Property (`Knopf`) | Meaning |
| --- | --- |
| `art` | `haupt`, `anlegen`, `neben` (default), `gefahr`, `link` |
| `groesse` | `normal` (default) or `klein` |
| `symbol` | icon before the label (name from `Symbol.tsx`, Lucide); **required for danger** |
| `rueckfrage` | **only and required for danger:** `{ titel, text?, ja, nein?, bestaetigeMit? }` – title as a question, consequences, verb on the confirm button |
| `onClick` | may return a promise – see [Asynchronous handlers](#asynchron); for danger only after “yes” |
| `gesperrt` | `true` = nothing to do (faded); a **reason as text** or a `KnopfSperre` = locked for a reason (dashed, padlock, ⓘ) – see [Disabled](#gesperrt) |
| `laeuft`, `laeuftText` | “working” from outside (form is sending, job in the background) and its text (default “Working …”) |
| `ergebnis` | result from outside, e.g. when a background job has finished |
| `nurSymbol` | icon-only button: the name for screen readers (required) and the tooltip at the same time |
| `ref`, `type`, others | as with `<button>`; default `type` is `button` (danger and locked for a reason are always `button`) |

Type checking does not allow `art="gefahr"` without `rueckfrage` or without `symbol`, nor `rueckfrage` on another kind (`web/src/bausteine/knopf/typpruefung.ts` pins this down).

## Disabled { #gesperrt }

There are exactly two forms (principle 6):

| Form | How it comes about | How it looks | When |
| --- | --- | --- | --- |
| **Nothing to do** | `gesperrt` (or `gesperrt={!geaendert}`) | faded (`disabled`), no explanation | save or discard without changes, empty selection |
| **Locked for a reason** | `gesperrt="<reason>"` or `gesperrt={{ grund, titel?, eintraege?, weitere?, stattdessen? }}` (`KnopfSperre`) | dashed border with a padlock (instead of its own icon), a small ⓘ next to it; reachable (`aria-disabled`) | delete with links, missing permission, archive mode, “save first” |

A click on the locked button or the ⓘ opens the **explanation at the button**: in bold the title (default “Not possible right now:”) and the reason, below it the affected entries (`eintraege`, optionally “and *n* more”) and under **“Instead”** the ways that still work – as **buttons**, never as links; a major step like “Delete with linked folders …” as a danger button with its own confirmation. Esc closes it and returns focus to the button, a click elsewhere closes it, too. It opens **above the button** – so at the end of a page it doesn't make the page longer; only when there is no room above in the visible area, below. Horizontally it stays on screen.

**No long sentence in the row** and **no reason only in a tooltip** (`title` is invisible on a phone and for screen readers). Dashed means “locked for you” everywhere, like “read only” on a field (pattern catalogue C4). No “?”: that leads to the manual (C7); ⓘ explains exactly this case.

```tsx
<Knopf gesperrt={{
  grund: sperre.grund,
  titel: t('…loeschen-nicht-moeglich'),
  eintraege: verweise.slice(0, 8).map((r) => <Link to={…}>{r.titel}</Link>),
  weitere: verweise.length - 8,
  stattdessen: <Knopf groesse="klein" onClick={mitVerknuepften}>{t('…mit-verknuepften-loeschen')}</Knopf>,
}}>{t('mappen.loeschen.knopf')}</Knopf>
```

![Disabled in two forms and the opened explanation, dark](bilder/muster-knopf-dunkel.png){ loading=lazy }

## States { #zustaende }

| State | How it comes about | How it looks |
| --- | --- | --- |
| mouse over | – | secondary: surface `--senke`, border `--leise`; danger: the same plus text and border `--schlecht`; main and create: surface with `--knopf-hover` (slightly darker in light mode, slightly lighter in dark mode); link: underlined |
| keyboard focus | – | 2 px ring with offset in `--akzent`; for danger ring, text and border in `--schlecht` |
| nothing to do | `gesperrt` | faded, no hover, `disabled` |
| locked for a reason | `gesperrt="…"` or `KnopfSperre` | dashed with a padlock, text `--leise`, ⓘ next to it, explanation on click |
| working | `onClick` returns a promise, or `laeuft` | label invisible in its place, spinner and “Working …” on top – the button keeps its width and place |
| result | return value `KnopfErgebnis` or `ergebnis` | below the button in the style of notices: `gut`, `info`, `warn`, `schlecht`, with an icon |
| error | the promise fails | like a result `schlecht`, with the error's message |

## Confirmation { #rueckfrage }

A danger button asks its confirmation itself: title as a question (“Delete note?”), one or two sentences on the consequences, the verb on the confirm button (“Delete”). Focus starts on **“Cancel”** (kind secondary) so that Enter destroys nothing; Esc cancels. Only the confirm button is **solid red**. For very dangerous actions `bestaetigeMit` asks for a word to be typed. Only after “yes” does `onClick` run – with “working”, result and error like any button.

Confirmations without danger (such as “Create a new address?”) are asked as before with `rueckfrage()` from `web/src/rueckfrage.tsx`; their confirm button is blue. All of them are shown by the building block `Rueckfragen`, which `start.tsx` includes once.

## Asynchronous handlers { #asynchron }

`onClick` may be `async`. The button

1. shows “working” at once (`aria-busy="true"`) and accepts no second click – not even via Enter in a form field;
2. then shows what the promise returns if it is a `KnopfErgebnis` (`{ art, text }`); anything else (e.g. `true`) it doesn't show;
3. **catches an error** and shows it right at the button instead of letting it vanish in the console. This is the shared way for asynchronous handlers in the interface (#1011).

The error text is the interface's message; without one it says “That didn't work. Please try again.”

**Without a button** – `onSubmit` of a form, `onChange` of a checkbox, an event on the window – use `abfangen` from `../bausteine`. It returns no promise to React and passes an error to the message the place already has; if it has none, it appears as a notice window. The handler starts right away, so `e.preventDefault()` at the beginning works as usual.

```tsx
<form onSubmit={abfangen(speichern, (text) => setMeldung({ art: 'schlecht', text }))}>
<input type="checkbox" onChange={abfangen(async (e: ChangeEvent<HTMLInputElement>) => { … })} />
```

ESLint checks this strictly (`@typescript-eslint/no-misused-promises`, `no-floating-promises`); since #1011 there is no exception for the interface in `eslint-suppressions.json` any more. A loading function that shows its errors itself is attached to an event or timer with `() => void laden()`.

## Result at the button { #ergebnis }

A result appears **where the click happened** (pattern B2 in the pattern catalogue, #986): right below the button; in a row of buttons (`<div className="knoepfe">`) below all buttons of the row, so the buttons stay side by side. Nothing above it moves. If the place is not fully visible, the page scrolls there gently for a new result (without animation with “reduce motion”); a result that is already there when the page opens doesn't make the page scroll (#1027). The result area is always in the document (`role="status"`, empty without taking space), so screen readers announce a new result.

For more than one sentence – a checklist, a text with details – the result goes into an `ErgebnisBlock` right below the row of buttons:

```tsx
<div className="knoepfe"><Knopf type="submit" laeuft={laeuft}>{t('…verbindung-pruefen')}</Knopf></div>
<ErgebnisBlock anlass={pruefung}>{pruefung && <PruefungAnzeige p={pruefung} />}</ErgebnisBlock>
```

Messages about **saving** stay with the [save bar](bausteine-speicherleiste.md); at the top of the page there are only notices about the state of the whole page.

## When to use it, when not { #wann }

**Use it** for every new button – above all for actions that do something on the server (“Check”, “Test”, “… now”). Existing buttons are converted by whoever changes the place anyway; converting all existing code to the principles follows in #1211–#1215. Converted so far: the create buttons of the lists in the Workbench, Library and My account (#989), the buttons “Check”, “Test” and “… now” of the Workbench (#986), the locked buttons “Delete folder” and “Download” (#1210).

**Don't use it**

- for menu entries (`role="menuitem"`), disclosure headers and tiles – they have their own patterns; for tabs use the building block [Tabs](bausteine-reiter.md);
- for links to other sites or into the manual (`<a className="verweis">`);
- for buttons whose look is fully defined by a design (substitution and administration bars).

## Accessibility { #barrierefreiheit }

The building block sets itself:

- `aria-busy="true"` and `aria-disabled="true"` while it is working – the button keeps keyboard focus (no `disabled`, which would lose focus); the label stays its name, “Working …” is only visible;
- for danger `aria-haspopup="dialog"` – the button opens the confirmation (`role="alertdialog"`, focus on “Cancel”);
- for locked for a reason `aria-disabled="true"`, `aria-describedby` pointing to the reason (also while the explanation is closed), `aria-expanded` and `aria-controls` for the explanation; the ⓘ is called “Why is this locked? <button>” and is 44 × 44 px on a phone; the button stays reachable with Tab so the reason can be heard;
- `aria-describedby` pointing to a shown result and a result area with `role="status"`;
- for `nurSymbol` `aria-label` and `title`; icons themselves are `aria-hidden`;
- `data-knopf` with the kind – the smoke tests use it on every page they visit: create begins with “+”, danger opens a confirmation, solid red (`data-knopf="entscheidung"`) only in a confirmation ([Smoke test and screenshots](bausteine.md#rauchtest)).

Hover and focus are visible for all kinds in light and dark mode; the pattern page shows them statically, the smoke tests check them with axe-core (including `color-contrast`).

## Right and wrong { #richtig-falsch }

| Right | Wrong |
| --- | --- |
| `<KnopfLink to="…/neu" art="anlegen" groesse="klein">+ New</KnopfLink>` | “+ New” in blue or as “New user” |
| `<Knopf art="haupt" type="submit">Save</Knopf>` – one main button per form | a green “Save”, three blue buttons side by side |
| `<Knopf art="gefahr" symbol="geloescht" rueckfrage={…}>Delete</Knopf>` | `<Knopf className="gefahr-rand">`, a red text link “Delete”, danger without a confirmation |
| “Discard” as a button with a border next to the main button | “Discard” as a red link or with a confirmation on click |
| `gesperrt={!geaendert}` – nothing to do | `gesperrt={!geaendert && 'Nothing changed'}` – that needs no explanation |
| `gesperrt={verwendet && t('…wird-noch-verwendet')}` | `disabled title="Still in use"` or a sentence next to the button |
| result at the button (return value or `ErgebnisBlock`) | result at the top of the page while the button is at the bottom |
| `<Knopf nurSymbol={t('…neu-laden')}><Symbol name="neu-laden" /></Knopf>` | an icon button without a name |
| `art="link"` for “Back to the list” | `art="link"` for “Delete” or “Send” |

## Code { #code }

- Building block: `web/src/bausteine/knopf/Knopf.tsx`, explanation when locked: `Erklaerung.tsx`, look: `Knopf.module.css` (basic shape and colours per kind from `.knopf` in `web/src/styles.css`)
- Confirmation: `web/src/bausteine/rueckfrage/Rueckfrage.tsx` (window, preview for the pattern page), queue `web/src/rueckfrage.tsx`
- Pattern page: `web/src/bausteine/knopf/muster.tsx`; type check: `web/src/bausteine/knopf/typpruefung.ts`
- Lint: `ablago/knopf-farben` in `.github/werkzeuge/eslint-ablago.mjs` (test `eslint-ablago.test.mjs`)
- Tests: `server/test/baustein-knopf.test.ts` (renders with react-dom/server and checks kinds, danger, disabled in two forms, `aria-*` and `data-knopf`); smoke tests in `web/rauchtest/rauchtest.mjs`: button on the pattern page (working, result, error; danger with a confirmation; locked with an explanation), the guard on every page, “+ New” in lists (#989), inbox folder “Check now” (#986)
