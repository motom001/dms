# Platzhalter

`Platzhalter` (#1177) zeigt die Platzhalter eines Texts zum Anklicken – überall gleich: in der Titel-Vorlage und bei „Zusammengesetzt“ im Mappentyp, in den Karten der Automatisierungen (Aufgabe, Feld ändern, URL aufrufen, E-Mail senden) und in den Ablaufvorlagen. Niemand muss `{feld}`-Namen aus einer langen Zeile abschreiben.

![Bereich „Platzhalter“ der Musterseite: Text mit Platzhaltern, gruppiert nach „Allgemein“ und Mappentyp](bilder/muster-platzhalter.png){ loading=lazy }

| Angabe | Wofür |
| --- | --- |
| `gruppen` | `{ name?, eintraege }[]` – je Gruppe eine Zeile mit Namen davor, z. B. „Allgemein“ und je Mappentyp eine; leere Gruppen fallen weg |
| `eintraege` | `{ key, text, zusatz?, titel? }[]`: `key` ohne Klammern, `text` verständlich (Feldbeschriftung), `zusatz` kurz dahinter (z. B. „nur bei Vertrag“), `titel` als Tooltip (Vorgabe: der technische Platzhalter `{key}`) |
| `einsetzen` | wird mit dem `key` aufgerufen – meist `einsetzen` aus `usePlatzhalterEinsetzen` |
| `beschriftung` | Name der Gruppe für Bildschirmleser und sichtbar davor; Vorgabe „Platzhalter einsetzen“ |

**Einsetzen an der Schreibmarke:** `usePlatzhalterEinsetzen()` liefert `feld(name, wert, setze)` und `einsetzen(key)`. `feld(…)` hängt man an jede Eingabe, die Platzhalter annimmt:

```tsx
const ein = usePlatzhalterEinsetzen();
<textarea {...ein.feld('text', karte.text, (x) => setze({ ...karte, text: x }))} value={karte.text} onChange={…} />
<Platzhalter einsetzen={ein.einsetzen} gruppen={…} />
```

- Ein Klick setzt den Platzhalter im **zuletzt benutzten Feld an der Schreibmarke** ein (eine Markierung ersetzt er) und setzt die Marke dahinter. War noch kein Feld dran, kommt er ans Ende des zuletzt angemeldeten.
- Mit `usePlatzhalterEinsetzen({ trenner: ' · ' })` steht der Trenner davor, wenn am Ende eines nicht leeren Texts eingesetzt wird (so bei „Zusammengesetzt“).
- Die Knöpfe sind kleine `Knopf` (Art Neben); **am Handy** haben sie die unsichtbare Tippfläche von 44 × 44 px.
- Die Musterseite zeigt den Baustein im Bereich **Platzhalter**.

![Bereich „Platzhalter“ dunkel](bilder/muster-platzhalter-dunkel.png){ loading=lazy }

Code: `web/src/bausteine/platzhalter/`.
