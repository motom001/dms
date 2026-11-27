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
| `nurMonat` | nur Monat und Jahr (#1722, Datumsfeld mit `genauigkeit: monat`): ein Textfeld „MM/JJJJ“ statt des Datumsfelds des Browsers, gleicher Kalenderknopf; ein Tag im Kalender wählt seinen Monat. `setze` bekommt den Monatsletzten (`2028-04-30`) oder – solange sich der Text nicht lesen lässt – den Text, damit die Prüfung ihn meldet |

**Entscheidung (#1496): Der Kalender geht beim Klick ins Feld auf, die Tastatur bleibt direkt.**

- **Ein Klick mit der Maus** in Tag, Monat oder Jahr öffnet den Kalender, **ohne den Fokus zu nehmen**: Wer danach tippt, tippt ins Feld, und der Kalender folgt dem getippten Datum. Tab wandert weiter und schließt ihn.
- **Mit der Tastatur** öffnet sich nichts von selbst. **Alt + Pfeil runter** oder der **Kalenderknopf** rechts im Feld öffnen ihn mit dem Fokus auf dem Tag: Pfeiltasten wandern, Pos1/Ende springen an den Anfang bzw. das Ende der Woche, Bild auf/ab blättern einen Monat (mit Umschalt ein Jahr), Enter wählt, Esc schließt und gibt den Fokus ans Feld zurück.
- **Am Handy** öffnet ein Tippen ins Feld wie bisher die Auswahl des Systems; den Kalender mit Kalenderwochen öffnet der Kalenderknopf (44 × 44 px). Schmal erscheint der Kalender als Blatt von unten.
- Das Kalendersymbol des Browsers ist in Chromium und Safari ausgeblendet; an seiner Stelle steht der eigene Knopf.
- **Lage wie bei den Menüs** (#1532, #1556, `web/src/bausteine/menue/lage.ts`, siehe [Menü](bausteine-menue.md)): Der Kalender öffnet unter dem Feld, wenn dort Platz ist, sonst darüber – nie über dem Assistenten unten rechts. Waagerecht steht er linksbündig mit dem Feld, wenn er dort ganz ins Fenster passt, sonst rechtsbündig; passt beides nicht, mit 8 px Abstand zum Fensterrand. Er liegt fest im Fenster und verlängert keine Spalte. Am Handy bleibt das Blatt von unten.

**Kalenderwoche:** `kalenderwoche(iso)` in `shared/src/kalender.ts` – Wochen beginnen am Montag, Woche 1 enthält den ersten Donnerstag des Jahres (der 29.12.2025 liegt in KW 1, der 01.01.2027 in KW 53). Die Spalte heißt „KW“ (englisch „Wk“), für Screenreader „Kalenderwoche 50“.

**Wo es steht:** überall, wo ein Datum eingegeben wird (#1532) – Datumsfelder der Mappe, Paket-Aktionen (z. B. „Als bezahlt markieren“), die Fenster „Aufgabe vergeben“ und „Erinnern“, in der Werkbank (u. a. Löschprotokoll, Auskunft, Feldeinstellungen und Standardwert im Mappentyp, Bedingungen einer Ansicht, Einstellungen eines Pakets) und im Profil (API-Schlüssel, Abwesenheit). Ein eigenes `<input type="date">` außerhalb des Bausteins gibt es nicht; ein Test (`baustein-datum.test.ts`) achtet darauf. Datum mit Uhrzeit (Wartungsmodus) bleibt ein Feld des Browsers.

![Bereich „Datum“ dunkel](bilder/muster-datum-dunkel.png){ loading=lazy }

## Code { #code }

- Baustein: `web/src/bausteine/datum/Datum.tsx`, Aussehen: `Datum.module.css`
- Musterseite: `web/src/bausteine/datum/muster.tsx`
- Test: `web/test/baustein-datum.test.ts`
