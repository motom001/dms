# Feld

`Feld` ist der Rahmen um jedes Eingabeelement (#967). Er setzt Beschriftung, Hinweis, Fehlermeldung und Hilfesymbol und verknüpft sie für Screenreader – damit jedes Feld gleich aussieht und gleich sagt, was falsch ist und wo es Hilfe gibt.

![Bereich „Feld“ der Musterseite: leer, gefüllt, mit Hinweis und Hilfe, optional, Fehler, Fehler mit Hinweis, gesperrt, nur lesen, Auswahlliste, mehrzeilig, Haken, Gruppe](bilder/muster-feld.png){ loading=lazy }

## Aufbau { #aufbau }

Jedes Feld belegt dieselben Reihen (Grundregel „Formularzeilen“ im Musterkatalog, #801):

1. **Beschriftung** – kurz, ohne Doppelpunkt; dahinter bei Bedarf **„(optional)“** und das **Hilfesymbol** „?“.
2. **Eingabe** – Textfeld, Auswahlliste, mehrzeiliges Feld …; ein Haken steht mit seiner Beschriftung in dieser Reihe.
3. **Fehler** – was falsch ist und wie es richtig wird, in der Fehlerfarbe mit Warnsymbol. Er steht direkt unter der Eingabe, wo der Blick ist: Ein langer Hinweis schiebt ihn so nicht weg – am Handy nicht unter die Tastatur –, und die sichtbare Reihenfolge ist dieselbe wie die vorgelesene.
4. **Hinweis** – ständige Erklärung, leise gesetzt. Bei einem Haken steht seine Beschreibung hier.

```tsx
import { Feld, HakenFeld, FeldGruppe } from '../bausteine';

<Feld beschriftung={t('…plz')} hinweis={t('…plz.hinweis')} fehler={plzFehler} hilfe="einrichtung.konto">
  <input type="text" inputMode="numeric" value={plz} onChange={(e) => setPlz(e.target.value)} />
</Feld>
```

| Eigenschaft | Bedeutung |
| --- | --- |
| `beschriftung` | sichtbarer Name des Felds (Pflicht) |
| `hinweis` | Erklärung unter der Eingabe; eine Liste ergibt mehrere Zeilen |
| `fehler` | Fehlermeldung; leer (`null`, `undefined`, `''`) heißt: kein Fehler |
| `hilfe` | Stelle im Handbuch aus `shared/src/hilfe.ts` – das „?“ hinter der Beschriftung |
| `optional` | kennzeichnet ein freiwilliges Feld mit „(optional)“ |
| `id` | Id der Eingabe; ohne Angabe die des Elements, sonst eine erzeugte |

## Varianten { #varianten }

| Variante | Wann | Eingabe |
| --- | --- | --- |
| `Feld` | Text, Zahl, Datum, Auswahlliste, mehrzeilig, Passwort | genau ein Element |
| `HakenFeld` | ein einzelner Haken (Ja/Nein) | `<input type="checkbox">` – steht vor der Beschriftung |
| `FeldGruppe` | mehrere Eingaben unter einer Beschriftung: Haken einer Mehrfachauswahl, Optionsknöpfe, gesetztes Geheimnis mit Knöpfen | beliebig viele, jede mit eigener Beschriftung |

Braucht die Eingabe die Verknüpfung nicht als Props (eine eigene Komponente, die sie an ein inneres Element weitergibt), übergibt man eine Funktion: `<Feld …>{(v) => <ZahlEingabe v={v} … />}</Feld>`. `v` enthält `id`, `aria-describedby` und `aria-invalid`.

## Zustände { #zustaende }

| Zustand | So entsteht er | So sieht er aus |
| --- | --- | --- |
| leer, gefüllt | Wert der Eingabe | Rahmen in `--linie-stark` |
| Maus darüber | – | Rahmen in `--leise` (nicht bei gesperrt und nur lesen) |
| Tastaturfokus | – | Rahmen und Fokusring in `--akzent` |
| Fehler | `fehler` gesetzt | Rahmen und Meldung in `--schlecht`, Warnsymbol; Fokusring dann ebenfalls in `--schlecht` |
| Fehler mit Hinweis | `fehler` und `hinweis` gesetzt | Meldung direkt unter der Eingabe, der Hinweis darunter |
| gesperrt | `disabled` an der Eingabe | Fläche `--senke`, Schrift `--leise`, kein Hover |
| nur lesen | `readOnly` an der Eingabe | Fläche `--senke`, gestrichelter Rahmen, Schrift gut lesbar und markierbar |
| optional | `optional` | „(optional)“ in `--leise` hinter der Beschriftung |

![Maus über dem Feld „Ort“, Tastaturfokus im Feld „Straße“ – hell](bilder/muster-feld-fokus.png){ loading=lazy }
![Dasselbe dunkel](bilder/muster-feld-fokus-dunkel.png){ loading=lazy }

![Bereich „Feld“ dunkel](bilder/muster-feld-dunkel.png){ loading=lazy }

## Wann verwenden, wann nicht { #wann }

**Verwenden** für jedes neue Eingabeelement in einem Formular – auch für ein einzelnes Feld in einem Dialog. Bestehende Formulare stellt um, wer sie ohnehin ändert (bisher: Paket-Einstellungen und die Einstellungen beim Installieren eines Pakets).

**Nicht verwenden**

- für Suchfelder in einer Werkzeugleiste ohne sichtbare Beschriftung (dort `aria-label` am Feld);
- für Eingaben in Tabellenzellen (Spaltenkopf ist die Beschriftung);
- für reine Anzeigen ohne Eingabe – dafür gibt es Eigenschaftslisten (`<dl class="eigenschaften">`);
- als Rahmen um mehrere unabhängige Felder – jedes Feld bekommt seinen eigenen Rahmen; zusammengehörige Eingaben unter einer Beschriftung sind eine `FeldGruppe`.

## Verhalten { #verhalten }

- **Pflicht ist der Normalfall** und wird nicht markiert; freiwillige Felder bekommen `optional`. Das gilt auch für die Paket-Einstellungen: Felder ohne `pflicht` im Manifest zeigen „(optional)“, ein Sternchen gibt es nicht.
- **Fehler erst zeigen, wenn sie stimmen:** nach dem Speichern oder sobald die Eingabe sicher falsch ist – nicht schon beim ersten Tastendruck in ein leeres Feld.
- **Die Meldung sagt, wie es richtig wird:** „Bitte genau fünf Ziffern eingeben.“ statt „Ungültig“.
- **Der Hinweis bleibt stehen,** auch wenn ein Fehler dazukommt; der Fehler steht darüber, direkt unter der Eingabe (Zustand „Fehler mit Hinweis“ auf der Musterseite).
- **Das Hilfesymbol öffnet die passende Stelle im Handbuch** der installierten Version in einem neuen Tab (Komponente `Hilfe`).

## Barrierefreiheit { #barrierefreiheit }

Der Rahmen setzt automatisch:

- `id` an der Eingabe und `htmlFor` an der Beschriftung – ein Klick auf die Beschriftung setzt den Fokus, Screenreader lesen den Namen;
- `aria-describedby` an der Eingabe: erst die Fehlermeldung, dann der Hinweis (eigene Werte der Eingabe bleiben davor erhalten);
- `aria-invalid="true"`, solange ein Fehler gesetzt ist;
- einen Fehlerbereich mit `aria-live="polite"`, der immer im Dokument steht (leer, ohne Höhe). Eine neue Meldung wird so angesagt, ohne die Person zu unterbrechen. Bewusst **kein** `role="alert"`: Nach dem Speichern mit mehreren Fehlern würde sonst jedes Feld einzeln dazwischenrufen;
- „(optional)“ als Teil des Namens („Telefon (optional)“);
- das Hilfesymbol **neben**, nicht in `<label>` – sonst hieße das Feld „Telefon Hilfe zu …“;
- bei `FeldGruppe` `role="group"` mit `aria-labelledby` auf die Beschriftung, Hinweis und Fehler über `aria-describedby` an der Gruppe.

Fehler stehen nie nur in Farbe: Die Meldung ist Text, davor ein Warnsymbol. Hover und Tastaturfokus sind hell und dunkel sichtbar. Die Musterseite prüft das in den Rauchtests mit axe-core.

## Richtig und falsch { #richtig-falsch }

| Richtig | Falsch |
| --- | --- |
| `<Feld beschriftung="Name"><input …/></Feld>` | `<label>Name</label><input …/>` ohne `htmlFor` und `id` |
| `<Feld beschriftung="Telefon" optional>` | „Telefon*“ an allen anderen Feldern |
| `hilfe="einrichtung.konto"` – das „?“ an der Beschriftung | ein „?“ unter dem Feld oder in der Meldung |
| `fehler="Bitte genau fünf Ziffern eingeben."` | `fehler="Ungültig"` oder nur ein roter Rahmen |
| `<HakenFeld beschriftung="Erinnerung per E-Mail" hinweis="Am Tag vor dem Termin.">` | Beschreibung des Hakens in die Beschriftung schreiben |
| `<FeldGruppe beschriftung="Wochentage">` mit je einem `<label className="haken">` | eine `<label htmlFor>` für mehrere Haken |
| neue Variante im Baustein, wenn etwas fehlt | Abstände oder Farben des Rahmens auf einer Seite überschreiben |

## Code { #code }

- Baustein: `web/src/bausteine/feld/Feld.tsx`, Aussehen: `Feld.module.css`
- Musterseite: `web/src/bausteine/feld/muster.tsx`
- Test: `server/test/baustein-feld.test.ts` (zeichnet mit react-dom/server und prüft `id`, `htmlFor`, `aria-describedby`, `aria-invalid`)
- Erste Nutzer: `Eingabe` in `web/src/werkbank/PaketEinstellungen.tsx` (Werkbank → Pakete → Einstellungen und beim Installieren)
