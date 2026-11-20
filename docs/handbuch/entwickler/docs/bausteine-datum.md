# Datum

`DatumEingabe` (#1496) ist das Datumsfeld von Ablago: Getippt wird wie gewohnt im Datumsfeld des Browsers, gewählt in einem eigenen Kalender, der vor jeder Woche die **Kalenderwoche** nach ISO 8601 zeigt – so lässt sich „Ende KW 50“ schnell eintragen. Es steht in einem [Feld](bausteine-feld.md) und nimmt dessen Verknüpfung an (`id`, `aria-describedby`, `aria-invalid` gehen an die Eingabe).

![Bereich „Datum“ der Musterseite: leer, gefüllt, Kalender offen, gesperrt](bilder/muster-datum.png){ loading=lazy }

```tsx
import { DatumEingabe, Feld } from '../bausteine';

<Feld beschriftung={t('…faellig')}>
  <DatumEingabe wert={datum} setze={setDatum} />
</Feld>

// Im Feldrahmen als Funktion, wenn die Verknüpfung weitergereicht wird:
<Feld beschriftung={feldLabel(f)}>{(v) => <DatumEingabe {...v} wert={roh} setze={setze} min={heute} />}</Feld>
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `wert` | `JJJJ-MM-TT` oder leer – wie beim Datumsfeld des Browsers |
| `setze` | bekommt den neuen Wert (auch leer, wenn die Person das Feld leert) |
| `min`, `max` | Grenzen; Tage außerhalb sind im Kalender gesperrt (durchgestrichen) |
| `disabled` | gesperrt: Feld und Kalenderknopf |
| `aria-label` | Name, wenn keine sichtbare Beschriftung auf die Eingabe zeigt |

**Entscheidung (#1496): Der Kalender geht beim Klick ins Feld auf, die Tastatur bleibt direkt.**

- **Ein Klick mit der Maus** in Tag, Monat oder Jahr öffnet den Kalender, **ohne den Fokus zu nehmen**: Wer danach tippt, tippt ins Feld, und der Kalender folgt dem getippten Datum. Tab wandert weiter und schließt ihn.
- **Mit der Tastatur** öffnet sich nichts von selbst. **Alt + Pfeil runter** oder der **Kalenderknopf** rechts im Feld öffnen ihn mit dem Fokus auf dem Tag: Pfeiltasten wandern, Pos1/Ende springen an den Anfang bzw. das Ende der Woche, Bild auf/ab blättern einen Monat (mit Umschalt ein Jahr), Enter wählt, Esc schließt und gibt den Fokus ans Feld zurück.
- **Am Handy** öffnet ein Tippen ins Feld wie bisher die Auswahl des Systems; den Kalender mit Kalenderwochen öffnet der Kalenderknopf (44 × 44 px). Schmal erscheint der Kalender als Blatt von unten.
- Das Kalendersymbol des Browsers ist in Chromium und Safari ausgeblendet; an seiner Stelle steht der eigene Knopf.
- Unten am Bildschirm klappt der Kalender nach oben auf.

**Kalenderwoche:** `kalenderwoche(iso)` in `shared/src/kalender.ts` – Wochen beginnen am Montag, Woche 1 enthält den ersten Donnerstag des Jahres (der 29.12.2025 liegt in KW 1, der 01.01.2027 in KW 53). Die Spalte heißt „KW“ (englisch „Wk“), für Screenreader „Kalenderwoche 50“.

**Wo es steht:** Datumsfelder der Mappe, Paket-Aktionen (z. B. „Als bezahlt markieren“) und die Fenster „Aufgabe vergeben“ und „Erinnern“. Andere Datumseingaben (Werkbank, Profil) nutzen noch das Feld des Browsers.

![Bereich „Datum“ dunkel](bilder/muster-datum-dunkel.png){ loading=lazy }

## Code { #code }

- Baustein: `web/src/bausteine/datum/Datum.tsx`, Aussehen: `Datum.module.css`
- Musterseite: `web/src/bausteine/datum/muster.tsx`
- Test: `web/test/baustein-datum.test.ts`
