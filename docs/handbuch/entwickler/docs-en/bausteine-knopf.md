# Button { #knopf }

`Knopf` (button) is the building block for every button (#968). It fixes the kind (create, main, secondary, danger, link), shows disabled, “working” and the result the same way everywhere and sets `aria` itself – so that every button shows the same way whether it is working or why it can't be used.

![“Button” section of the pattern page: kinds, small, mouse over, keyboard focus, disabled, disabled with a reason, working, icon only, result, error, row of buttons](bilder/muster-knopf.png){ loading=lazy }

## Kinds { #arten }

| Kind | Looks | What for | Example |
| --- | --- | --- | --- |
| `anlegen` | green | create something new in a list – top right in the list header, label **“+ New”** | “+ New” for folder types, views, users, in the Library |
| `haupt` | accent colour (blue) | the main action of a form or step – at most one main button per area | “Save”, “Create”, “Back up now” |
| `neben` | surface with a border | everything else (default) | “Test connection”, “Check now”, “Cancel” |
| `gefahr` | error colour | something that can't easily be undone; almost always with a confirmation | “Delete”, “Lock immediately” |
| `link` | like a link | **for ways only**: back, to the list, cancel without consequences – never for an action that changes something | “Back to the list”, “Back” |

The colours come from the tokens (`--gruen`, `--akzent`, `--schlecht`) and apply in every design. Size: `groesse="klein"` in list headers, table rows and bars, otherwise normal.

**“+ New” (#989):** If a page has only one thing to create, the button is called exactly “+ New”. If several things can be created on one page (e.g. My account with API keys and webhooks), it is “+ New …” with the item: “+ New key”, “+ New webhook”.

```tsx
import { Knopf, KnopfLink, knopfAussehen, type KnopfErgebnis } from '../bausteine';

<KnopfLink to="/werkbank/benutzer/neu" art="anlegen" groesse="klein">{t('werkbank.benutzer.neu')}</KnopfLink>

<Knopf onClick={jetztPruefen} laeuftText={t('…prueft')}>{t('…jetzt-pruefen')}</Knopf>

async function jetztPruefen(): Promise<KnopfErgebnis> {
  const r = await api.eingangsordnerPruefen();
  return { art: 'gut', text: r.uebernommen ? t('…uebernommen', { anzahl: r.uebernommen }) : t('…nichts-gefunden') };
}
```

## Variants { #varianten }

| Variant | When |
| --- | --- |
| `Knopf` | a `<button>`: any action |
| `KnopfLink` | a way within Ablago that looks like a button – e.g. “+ New”, which opens the page for creating |
| `knopfAussehen({ art, groesse })` | only the classes and `data-knopf` for elements that can't be a `<button>`, such as the `<summary>` of a fold-out form |
| `ErgebnisBlock` | a detailed result below a button (e.g. a check list): `aria-live`, scrolls gently into view |

| Property (`Knopf`) | Meaning |
| --- | --- |
| `art` | `anlegen`, `haupt`, `neben` (default), `gefahr`, `link` |
| `groesse` | `normal` (default) or `klein` |
| `onClick` | may return a promise – see [Asynchronous handlers](#asynchron) |
| `gesperrt` | `true` (disabled, the reason is next to it anyway) or the **reason as text** |
| `laeuft`, `laeuftText` | “working” from outside (form is sending, job in the background) and its text (default “Working …”) |
| `ergebnis` | result from outside, e.g. when a background job has finished |
| `nurSymbol` | icon-only button: the name for screen readers (required), also used as the tooltip |
| `type`, `className`, others | as for `<button>`; `type` defaults to `button` |

## States { #zustaende }

| State | How it comes about | How it looks |
| --- | --- | --- |
| mouse over | – | Secondary: surface `--senke`, border `--leise`; main, create, danger: surface with `--knopf-hover` (a little darker in light, a little lighter in dark); link: underlined |
| keyboard focus | – | 2 px ring with a gap in `--akzent`, for danger in `--schlecht` |
| disabled | `gesperrt` | faded, no hover; without a reason `disabled`, with a reason it stays reachable (`aria-disabled`) and the reason is shown below |
| working | `onClick` returns a promise, or `laeuft` | the label stays invisible in its place, a spinner and “Working …” on top – the button keeps its width and place |
| result | return value `KnopfErgebnis` or `ergebnis` | below the button in the style of notices: `gut`, `info`, `warn`, `schlecht`, with an icon |
| error | the promise fails | like a `schlecht` result, with the error's message |

![“Button” section, dark](bilder/muster-knopf-dunkel.png){ loading=lazy }

## Asynchronous handlers { #asynchron }

`onClick` may be `async`. The button

1. shows “working” at once (`aria-busy="true"`) and doesn't accept a second click – not even via Enter in a form field;
2. then shows what the promise returns if it is a `KnopfErgebnis` (`{ art, text }`); anything else (e.g. `true`) is not shown;
3. **catches an error** and shows it right at the button instead of letting it disappear in the console. This is the shared way for asynchronous handlers in the interface (#1011).

The error text is the API's message; without one it says “That didn't work. Please try again.”

**Without a button** – a form's `onSubmit`, a checkbox's `onChange`, an event on the window – use `abfangen` from `../bausteine`. It returns no promise to React and passes an error to the message the place already has; if it has none, the error appears in a notice dialog. The handler starts straight away, so `e.preventDefault()` at the start works as usual.

```tsx
<form onSubmit={abfangen(speichern, (text) => setMeldung({ art: 'schlecht', text }))}>
<input type="checkbox" onChange={abfangen(async (e: ChangeEvent<HTMLInputElement>) => { … })} />
```

ESLint checks this strictly (`@typescript-eslint/no-misused-promises`, `no-floating-promises`); since #1011 there are no exceptions for it in `eslint-suppressions.json` for the interface any more. A loading function that shows its own errors is attached to an event or a timer with `() => void laden()`.

## Result at the button { #ergebnis }

A result appears **where the click happened** (pattern B2 in the pattern catalogue, #986): right below the button; in a row of buttons (`<div className="knoepfe">`) below all buttons of the row, so the buttons stay side by side. Nothing above it moves. If the place isn't fully in view, the page scrolls gently there (without animation with “reduce motion”). The result area is always in the document (`role="status"`, empty without taking space), so screen readers announce a new result.

For more than one sentence – a check list, a text with details – the result goes into an `ErgebnisBlock` right below the row of buttons:

```tsx
<div className="knoepfe"><Knopf type="submit" laeuft={laeuft}>{t('…verbindung-pruefen')}</Knopf></div>
<ErgebnisBlock anlass={pruefung}>{pruefung && <PruefungAnzeige p={pruefung} />}</ErgebnisBlock>
```

Messages about **saving** stay with the save bar; the top of the page only has notices about the state of the whole page.

## When to use it, when not { #wann }

**Use it** for every new button – above all for actions that do something on the server (“Check”, “Test”, “… now”). Existing buttons are switched over by whoever changes that place anyway. Switched so far: the create buttons of the lists in the Workbench, Library and My account (#989) and the Workbench buttons “Check”, “Test” and “… now” (#986).

**Don't use it**

- for menu entries (`role="menuitem"`), tabs, fold-out headers and tiles – they have their own patterns;
- for links to other sites or into the manual (`<a className="verweis">`);
- for buttons whose look is fully set by a design (stand-in and administration bars).

## Accessibility { #barrierefreiheit }

The building block sets itself:

- `aria-busy="true"` and `aria-disabled="true"` while working – the button keeps the keyboard focus (no `disabled`, which would lose it); the label stays its name, “Working …” is only visible;
- for `gesperrt` with a reason, `aria-disabled="true"` and `aria-describedby` pointing to the visible reason; the button stays reachable with Tab so the reason can be heard – a `title` alone isn't enough (invisible on phones and for screen readers);
- `aria-describedby` pointing to a shown result, and a result area with `role="status"`;
- for `nurSymbol`, `aria-label` and `title`; the icon itself is `aria-hidden`;
- `data-knopf` with the kind – the smoke tests use it to count create buttons without the kind “create” (must be 0).

Hover and focus are visible for all kinds, light and dark; the pattern page shows them standing still, the smoke tests check them with axe-core.

## Right and wrong { #richtig-falsch }

| Right | Wrong |
| --- | --- |
| `<KnopfLink to="…/neu" art="anlegen" groesse="klein">+ New</KnopfLink>` | “+ New” in blue or as “New user” |
| `<Knopf art="haupt" type="submit">Save</Knopf>` – one main button per form | three blue buttons side by side |
| `onClick={async () => { await api.x(); return { art: 'gut', text: … }; }}` | `onClick={() => void api.x().then(…)}` without `catch` |
| `gesperrt={geaendert && t('…erst-speichern')}` | `disabled title="Save first"` |
| result at the button (return value or `ErgebnisBlock`) | result at the top of the page while the button is at the bottom |
| `<Knopf nurSymbol={t('…neu-laden')}><Symbol name="neu-laden" /></Knopf>` | an icon button without a name |
| `art="link"` for “Back to the list” | `art="link"` for “Delete” or “Send” |

## Code { #code }

- Building block: `web/src/bausteine/knopf/Knopf.tsx`, look: `Knopf.module.css` (basic shape and colours per kind from `.knopf` in `web/src/styles.css`)
- Pattern page: `web/src/bausteine/knopf/muster.tsx`
- Test: `server/test/baustein-knopf.test.ts` (renders with react-dom/server and checks kinds, `aria-*` and `data-knopf`); smoke tests in `web/rauchtest/rauchtest.mjs`: button on the pattern page (working, result, error), “+ New” in lists (#989), intake folder “Check now” (#986)
