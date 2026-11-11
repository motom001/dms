# Umschalter

`Umschalter` (#1002) ist ein Segmentknopf: zwei bis vier gleichrangige Wahlen nebeneinander, genau eine ist an. Er ändert, **wie** etwas arbeitet – etwa ob das Feld der Startseite fragt oder sucht („Fragen · Suchen“, `web/src/ablage/StartFeld.tsx`). Für Reiter mit eigenem Inhalt darunter (Register einer Mappe) gibt es die Registerkarten.

| Angabe | Wofür |
| --- | --- |
| `wert` | die gewählte Wahl |
| `setze(wert)` | wird mit der neuen Wahl aufgerufen – per Klick, Tipp oder Pfeiltaste |
| `wahlen` | `{ wert, text }` – zwei bis vier, kurz (ein Wort) |
| `beschriftung` | Name der Gruppe für Bildschirmleser, z. B. „Fragen oder suchen“ |
| `anker` | Sprungziel für Rundgänge und Tipps (`data-anker`), optional |

```tsx
import { Umschalter } from '../bausteine';

<Umschalter wert={art} setze={waehle} beschriftung={t('ablage.startfeld.art')}
  wahlen={[{ wert: 'fragen', text: t('ablage.startfeld.fragen') }, { wert: 'suchen', text: t('ablage.startfeld.suchen') }]} />
```

- **Für Bildschirmleser** eine Gruppe von Optionsfeldern (`role="radiogroup"` mit der Beschriftung, je Wahl `role="radio"` mit `aria-checked`) – angesagt wird, was gerade gewählt ist.
- **Tastatur** wie bei Optionsfeldern: Tab erreicht nur die gewählte Wahl; Pfeiltasten (links/rechts und hoch/runter, am Ende wieder vorn) sowie Pos1 und Ende wählen und bleiben in der Gruppe; Tab führt weiter.
- **Gewählt** ist nicht nur an der Farbe zu erkennen: gefüllt, fett und mit Rahmen in der Akzentfarbe.
- **Unauffällig:** kleine Schrift, leise Farbe – er steht neben einem Feld, ohne wie eine Haupthandlung zu wirken.
- **Merken** ist Sache der Seite (z. B. als Einstellung der Person mit `d.setzeEinstellung`).
- **Am Handy** ist jede Wahl mindestens 44 × 44 px groß ([Am Handy](bausteine.md#handy)).
- Die Musterseite zeigt den Baustein im Bereich **Umschalter**: zwei und drei Wahlen.

Ältere Stellen mit der Klasse `segmente` in `styles.css` (Liste · Monat · Jahr in *Zu erledigen*, Schriftgröße in Mein Konto) stellt um, wer sie ohnehin ändert.
