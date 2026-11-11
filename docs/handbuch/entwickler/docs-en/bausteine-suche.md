# Search

The building block **Search** (#978, #994) is the one search field of all lists – in the Library's result lists as in the middle of the Workbench. It comes with the pattern **“list in the middle: search field on top, filters below”**: search field, below it the list's filters, below them the number of results; every result shows where it was found.

| Part | What for |
| --- | --- |
| `Suchfeld` | The field itself: magnifier, placeholder, “×” to clear (only with content), **Esc** clears too, `onEnter` for your own ways (archive number in the Library). `beschriftung` is the name for screen readers; the `platzhalter` is what you see. No browser suggestions and no spell check, the on-screen keyboard shows “Search”; `feldRef` gives access to the input (e.g. focus after switching on the start page, #1002). |
| `ListenSuche` | The pattern: search region (`role="search"`) with `Suchfeld`, the `filter` below (group “Filters”) and the number of results (`aria-live`): “12 results” while the search or a filter is active (`aktiv`), otherwise `anzahl` (“30 folder types”). On a phone the region stays at the top while scrolling. |
| `FilterHaken` | A tick box below the search field, e.g. “Only show open ones”, “Show completed”. |
| `PaketFilter` | Choice “Package”: *All*, *Own (no package)*, the packages in the list. Without packages in the list it isn't shown; `beschriftung` e.g. “Origin”. |
| `KeineTreffer` | Empty state when search or filters hide everything: a sentence and the button “Reset search and filters” (both adjustable, e.g. “No open access requests. Show all”). |
| `Hervorgehoben`, `Fundstellen` | Name with the search word highlighted; below it the first two places found (“Field “Cancel by” · help text: … **cancel** …”), then “+ 3 more”. |
| `useListenSuche(eintraege, { quellen, herkunft?, varianten? })` | State of input and package filter, the matching entries with places found, `paketeDa`/`eigeneDa` for the filter, `zuruecksetzen()`. |

The search runs as you type, in the browser, over what the page has loaded anyway – without a request to the server. The logic lives without any interface in `shared/src/listensuche.ts` (`durchsuche`, `ausschnitt`, `herkunftPasst`): ignoring upper and lower case and accents, with umlaut variants (ü = u = ue, ß = ss); several words must all occur, each in any source of the entry.

```tsx
import { Fundstellen, Hervorgehoben, KeineTreffer, ListenSuche, PaketFilter, useListenSuche } from '../bausteine';

const z = useListenSuche(liste, {
  // Where to search: the name (titel) and the sources with an already translated area.
  quellen: (k) => [{ wo: '', text: k.name, titel: true }, { wo: t('…muster'), text: k.muster }],
  herkunft: (k) => paketVon(k), // package id or null; without it there is no package filter
});

<ListenSuche wert={z.eingabe} setze={z.setEingabe} beschriftung={t('…durchsuchen')} platzhalter={t('…suchen-in')}
  treffer={z.treffer.length} aktiv={z.aktiv} anzahl={t('…anzahl', { anzahl: liste.length })}
  filter={<PaketFilter wert={z.paket} setze={z.setPaket} pakete={paketWahl(z.paketeDa, pakete)} eigene={z.eigeneDa} />} />
{!z.treffer.length ? <KeineTreffer zuruecksetzen={z.zuruecksetzen} /> : z.treffer.map(({ eintrag, titel, funde }) => (
  <Link …><span className="titel"><Hervorgehoben teile={titel} text={eintrag.name} /></span><Fundstellen funde={funde} /></Link>
))}
```

- **A list's own filters** (e.g. “Only show open ones”) are applied by the page before `useListenSuche` and counted into `aktiv`.
- **Where the Workbench lists search** (folder types, views, number sequences) is in `web/src/werkbank/listensuche.ts`, as is which package an entry comes from.
- **Variants** (`varianten: (wort) => string[]`) add further words per search word – meant for the words with the same meaning (#992); every form found is highlighted.
- **On a phone** the “Package” choice and every tick box are at least 44 px high ([On a phone](bausteine.md#handy)); the “×” is a `Knopf` with only a symbol.
- The sample page shows the building block in the section **Search**: empty, filled, as a list with filters to try out and without results.
