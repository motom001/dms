# Eingaben mit Einheit

`ZeitraumEingabe` und `ProzentEingabe` (#1035) sind Eingaben für die Feldarten **Zeitraum** und **Prozent**: eine Zahl und ihre Einheit in einer Zeile. Sie stehen in einem [Feld](bausteine-feld.md) (oder in einem Rahmen, dessen Beschriftung mit `htmlFor` auf ihre `id` zeigt) und nehmen die Verknüpfung des Rahmens an – `id`, `aria-describedby` und `aria-invalid` gehen an die Zahl, denn dort tippt man.

| Baustein | Zeigt | Wert |
| --- | --- | --- |
| `ZeitraumEingabe` | Zahl (Zifferntastatur) und Auswahl Tage, Wochen, Monate, Jahre – in der Einzahl, solange die Zahl 1 ist („1 Monat“), sonst in der Mehrzahl | `{ anzahl: string, einheit }` wie getippt |
| `ProzentEingabe` | Zahl (Dezimaltastatur), dahinter fest „%“ (nur zum Ansehen) | Text wie getippt; „19“, „19 %“ und „19,0“ liest `leseProzent` gleich |

```tsx
import { Feld, ProzentEingabe, ZeitraumEingabe, type ZeitraumRoh } from '../bausteine';

<Feld beschriftung={t('…kuendigungsfrist')}><ZeitraumEingabe wert={frist} setze={setFrist} /></Feld>
<Feld beschriftung={t('…steuersatz')} hinweis={t('…steuersatz-hinweis')}><ProzentEingabe wert={satz} setze={setSatz} /></Feld>

// Ohne sichtbare Beschriftung (z. B. als Vergleichswert einer Bedingung): aria-label nennen.
<ZeitraumEingabe aria-label={t('werkbank.sichten.wert')} wert={roh} setze={…} />
```

- **Lesen und Zeigen** liegt nicht im Baustein, sondern in `shared/src/feldarten.ts`: `leseZeitraum` („3 Monate“, `P3M`, `{ anzahl, einheit }`), `zeitraumText` (Einzahl und Mehrzahl aus den Sprachdateien, `gemeinsam.feldarten.zeitraum.*`), `leseProzent`, `prozentText` („19 %“ mit schmalem geschütztem Leerzeichen U+202F, wenn die Sprache einen Abstand setzt).
- **Gespeichert** wird ein Zeitraum als `{ anzahl, einheit }`, Prozent als Zahl (19, nicht 0,19). Verglichen wird ein Zeitraum in Tagen (`zeitraumTage`: Monat 30,4375, Jahr 365,25).
- **Am Handy** sind Zahl und Auswahl mindestens 44 px hoch ([Am Handy](bausteine.md#handy)).
- Die Musterseite zeigt beide im Bereich **Eingaben mit Einheit**: gefüllt, Einzahl, Fehler, optional und gesperrt.
