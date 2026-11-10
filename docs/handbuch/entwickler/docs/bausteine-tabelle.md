# Tabelle

`Tabelle` (#1030) zeigt Zeilen mit Spalten, jede Zeile führt zu einer Seite – meist einer Mappe. Breit ist sie eine Tabelle, schmal (am Handy oder in einer schmalen Spalte) eine Liste mit den ersten zwei Spalten, wie die Trefferlisten der Ablage. Ohne Zeilen steht ein ruhiger Satz statt einer leeren Tabelle. Genutzt von der Feldart **Tabelle** in der Mappe (`web/src/ablage/Tabellenfeld.tsx`).

| Angabe | Wofür |
| --- | --- |
| `beschriftung` | Name für Bildschirmleser, z. B. „Positionen“ (`aria-label` an Tabelle bzw. Liste) |
| `spalten` | `{ key, titel, rechts? }` – `rechts` für Zahlen und Beträge |
| `zeilen` | `{ key, ziel, zellen, ersatz }` – `ziel` ist ein Weg in Ablago; `ersatz` steht in der ersten Spalte, wenn sie leer ist |
| `leer` | Satz ohne Zeilen, z. B. „Noch keine Positionen“ |
| `fuss` | unter den Zeilen, z. B. „+ Position“ und „weitere anzeigen“ |
| `breitAb` | ab dieser Breite eine Tabelle; Vorgabe 480 px bzw. 110 px je Spalte |

```tsx
import { Knopf, Tabelle } from '../bausteine';

<Tabelle beschriftung={t('…positionen')} spalten={spalten} zeilen={zeilen} leer={t('…noch-keine')}
  fuss={<Knopf art="anlegen" groesse="klein" onClick={neu}>{t('…neu')}</Knopf>} />
```

- Die **erste Spalte** ist der Verweis (Tastatur, Bildschirmleser); ein Klick irgendwo in der Zeile führt ebenso hin.
- **Schmal oder breit** misst der Baustein selbst (`ResizeObserver` am eigenen Rahmen) – nicht die Breite des Fensters.
- Kein Sortieren, keine Summen und kein Bearbeiten in der Zeile: Das bleibt der Seite dahinter.
- **Am Handy** sind die Verweise mindestens 44 px hoch ([Am Handy](bausteine.md#handy)).
- Die Musterseite zeigt den Baustein im Bereich **Tabelle**: breit, schmal und leer.
