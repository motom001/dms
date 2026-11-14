# Reiter

`Reiter` ist der Baustein für Register über einem Inhalt (#1210): genau ein Reiter ist aktiv, darunter steht sein Inhalt (`ReiterFlaeche`). Es gibt **ein aktives Aussehen** für alle Stellen – Fläche wie der Inhalt, Rand, oben eine Linie in der Akzentfarbe (Blau ist auch Auswahl, [Leitsatz 1](bausteine.md#leitsaetze)). Vorher sah der aktive Reiter in der Mappe (farbige Linie je Art) anders aus als bei der Texterkennung (grau).

![Bereich „Reiter“ der Musterseite: Register einer Mappe mit Fehlern und Anzahl](bilder/muster-reiter.png){ loading=lazy }

```tsx
import { Reiter, ReiterFlaeche } from '../bausteine';

const [reiter, setReiter] = useState<'felder' | 'dokumente'>('felder');
<Reiter id="mappe" wert={reiter} setze={setReiter} beschriftung={t('…register-der-mappe')}
  wahlen={[{ wert: 'felder', text: t('…felder'), fehler: 2 }, { wert: 'dokumente', text: t('…dokumente'), anzahl: 3 }]} />
<ReiterFlaeche id="mappe" wert={reiter}>{inhalt}</ReiterFlaeche>
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `id` | Kennung der Reihe; daraus entstehen die `id` der Reiter (`reiterId`) und der Fläche (`flaecheId`) |
| `wert`, `setze` | der aktive Reiter und das Umschalten |
| `wahlen` | je Reiter `{ wert, text, anzahl?, fehler?, anker? }` – `fehler` zeigt eine rote Zahl (mit Text für Screenreader), `anzahl` eine ruhige |
| `beschriftung` | Name der Reihe für Screenreader |

## Verhalten { #verhalten }

- **Tastatur** nach WAI-ARIA: Tab erreicht nur den aktiven Reiter, Pfeiltasten (auch Pos1/Ende) wählen den nächsten; Tab führt weiter zum ersten Bedienelement der Fläche.
- **Screenreader:** `role="tablist"` mit Namen, je Reiter `role="tab"` mit `aria-selected` und `aria-controls`; die Fläche ist `role="tabpanel"` und nach dem aktiven Reiter benannt (ohne eigenes `tabindex`: Ihr Inhalt hat Bedienelemente).
- **Breiter als der Platz:** Die Reihe rollt waagerecht, die Seite nicht. Am Handy ist jeder Reiter mindestens 44 px hoch.

**Abgrenzung:** Der [Umschalter](bausteine-umschalter.md) ändert, *wie* etwas Gleiches arbeitet (z. B. „Liste · Monat · Jahr“); Reiter zeigen verschiedene Inhalte.

**Bestand:** Die Register der Mappe (`.registertab`) und der Texterkennung ziehen in #1211 bzw. #1213 auf diesen Baustein um.

![Bereich „Reiter“ dunkel](bilder/muster-reiter-dunkel.png){ loading=lazy }

## Code { #code }

- Baustein: `web/src/bausteine/reiter/Reiter.tsx`, Aussehen: `Reiter.module.css`
- Musterseite: `web/src/bausteine/reiter/muster.tsx`
- Test: `server/test/baustein-reiter.test.ts`
