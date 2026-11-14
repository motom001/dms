# Wahlhaken

`Wahlhaken` (#1211, #1212) ist der Haken, mit dem man Zeilen einer Liste auswählt – Mappen einer Ansicht, Dokumente einer Mappe, Einträge im Papierkorb. Er steht ohne sichtbare Beschriftung in der Zeile; die Zeile zeigt, worum es geht. Für einen Haken mit sichtbarer Beschriftung gibt es `HakenFeld` ([Feld](bausteine-feld.md)).

| Angabe | Wofür |
| --- | --- |
| `an` | gewählt oder nicht |
| `setze(an, bereich)` | neuer Zustand; `bereich` ist `true` bei gedrückter Umschalttaste (von der letzten Wahl bis hier) |
| `beschriftung` | Name für Bildschirmleser, der den Eintrag nennt („Mietvertrag auswählen“) |
| `teilweise` | „einige gewählt“ – für den Haken im Kopf einer Liste (`indeterminate`) |
| `gesperrt` | nicht wählbar (z. B. ein Dokument, das beim Speichern wegkommt) |

```tsx
<Wahlhaken an={gewaehlt.has(x.id)} beschriftung={t('…auswaehlen', { name: x.name })}
  setze={(an, bereich) => waehle(x, an, bereich)} />
```

- **Tippfläche:** am Rechner mindestens 24 px, am Handy (`pointer: coarse`) 44 × 44 px um das Kästchen.
- Ein Klick auf den Haken öffnet die Zeile nicht – auch wenn die ganze Zeile klickbar ist.
- Die Musterseite zeigt den Baustein im Bereich **Wahlhaken**: an, aus, teilweise und gesperrt.

Code: `web/src/bausteine/wahlhaken/`.
