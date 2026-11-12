# Areas

`useBereiche` and `Bereich` (#1000) build the pattern **"editor on the right: jump bar + areas"**: the jump bar with all areas and **Expand all / Collapse all** at the top, the areas to expand and collapse below it. It started with the folder type (#144) and the views (#148); since #1000, number sequences, automations, users, stamps, mailboxes and data protection requests have it too.

![“Areas” section of the pattern page: with jump bar and one area with an error, collapsed with a summary, fewer than three areas without a bar](bilder/muster-bereiche.png){ loading=lazy }

## Behaviour { #verhalten }

- **New** (`id` is `null`): everything open, nothing is remembered.
- **Existing:** as last time on this device (`localStorage`, per editor the 200 entries edited last); without memory collapsed. **Editors without saving** (viewing and immediate actions only, e.g. the data protection request) pass `{ offen: true }` and start expanded as long as the device has remembered nothing. Folder types and views keep their previous storage keys (`dms.typeditor.offen`, `dms.sichteditor.offen`), all others are called `dms.<editor>editor.offen`.
- **Anchor in the address** (`…/werkbank/postfaecher/<id>#verbindung`) opens its area and jumps there.
- **Jump bar:** every jump opens its area, scrolls there and moves the focus to the head of the area (`focus({ preventScroll: true })`) – with the keyboard, Tab then continues inside the area; an area with an error is red and carries "!". On the desktop the bar stays below the page header, on the phone (up to 700 px) it scrolls along.
- **Fewer than three areas** (`SPRUNGLEISTE_AB`): neither bar nor collapsing. The areas are always open, only with their title.
- **Collapsed**, the content stays in the document (only hidden) – inputs, results and running requests are not lost. The summary (`kurz`) is then shown below the title.

## Using it { #benutzen }

```tsx
import { Bereich, fehlerBereiche, useBereiche, type BereichListe } from '../bausteine';

type PfBereich = 'grunddaten' | 'verbindung' | 'abholen' | 'stand';
const liste: BereichListe<PfBereich> = [['grunddaten', t('…grunddaten')], ['verbindung', t('…verbindung')], …];

const b = useBereiche(liste, 'postfach', neu ? null : id);
const hatFehler = (k: PfBereich) => fehlerOrte.has(k);

<div className="editorform">
  <Kopf … />
  {b.leiste(hatFehler, t('…bereiche-des-postfachs'))}
  <form id="pf-formular" className="editorform" onSubmit={…} onKeyDown={ent.tasten}>
    <Bereich id="grunddaten" titel={t('…grunddaten')} klappe={b.klappe('grunddaten', hatFehler('grunddaten'))} kurz={e.name}>
      …
    </Bereich>
    …
  </form>
  <Bereich id="stand" titel={t('…stand')} klappe={b.klappe('stand')}>…immediate actions…</Bereich>
  <Speicherleiste ent={ent} gegenstand={t('…postfach')} formular="pf-formular" />
</div>
```

| Part | What for |
| --- | --- |
| `useBereiche(liste, editor, id, optionen?)` | state: `auf`, `klappe(k, fehler?)`, `oeffne(ks, springen?, fokus?)`, `leiste(fehler?, beschriftung?)`, `merke(neueId)`, `mitLeiste`; `optionen.offen` for editors without saving |
| `Bereich` | `id` (also the anchor), `titel`, `klappe`; plus `hilfe` (help symbol after the title), `kurz` (summary when collapsed), `beschreibung` (sentence above the content), `className` |
| `fehlerBereiche(fehler, liste, ersatz)` | areas of an error on saving: `details.orte` of the server's response, known ones only; otherwise `ersatz` |
| `liesOffen`, `merkeOffen` | the memory directly, e.g. for tests |

## Rules { #regeln }

- **One save for the whole editor.** At the bottom there is one `Speicherleiste` (`web/src/Speicherleiste.tsx`) for everything that is saved. If areas with immediate actions of their own sit between or after them (small forms of their own, e.g. "Set counter"), they stand **outside** the form – forms must not be nested – and the bar connects to it with `formular="<id>"`.
- **Immediate actions stay immediate:** test, fetch, reset, sign out, lock – everything that is an action of its own and not part of the draft.
- **Errors open their area.** If the interface checks something itself (e.g. an unknown placeholder), `klappe(k, true)` marks the area while typing. What only the server finds it names as `details.orte` (`Fachfehler(422, text, { orte: ['verbindung'] })`); `fehlerBereiche` reads it, `oeffne(orte)` expands and jumps there.
- **Short, consistent area names:** *Basic details* first, then in the order in which the entry is set up; try out, status and history at the end.
- **Headings:** the area carries the `h2`; sections inside it use `h3` (`className="h4"`), not another `blatt` or a box with the same heading.
- **Red means error.** Areas are not coloured as a danger zone – in the editor, red means “something went wrong here when saving”. Dangerous actions are shown by the red button (`art="gefahr"`) and the confirmation.
- **References to another area** (“choose one in the area *Stand-in*”) are a jump: a `Knopf` of type link that calls `oeffne([k], true, true)`.

## On the phone { #handy }

Jumps and the head of an area are at least 44 px high with `(pointer: coarse)` ([On the phone](bausteine.md#handy)); "Expand all" is a `Knopf` of type link. The bar wraps and scrolls along.

The pattern page shows the component in the section **Areas**: with jump bar (one area with an error), collapsed with a summary and with fewer than three areas.

![“Areas” section in dark](bilder/muster-bereiche-dunkel.png){ loading=lazy }
