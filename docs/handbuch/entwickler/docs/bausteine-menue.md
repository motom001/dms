# Menü

`Menue` (#1211, #1212) ist ein Knopf, der eine Liste von Handlungen öffnet: **Mappe ▾** im Kopf einer Mappe, **⋯** an jeder Dokumentzeile und im Kopf einer Ansicht. Alle Menüs sehen gleich aus und bedienen sich gleich.

| Angabe | Wofür |
| --- | --- |
| `beschriftung` | Text des Knopfs („Mappe“); mit `nurSymbol` der Name für Bildschirmleser („Weitere Handlungen für Rechnung.pdf“) |
| `nurSymbol` | nur „⋯“ zeigen |
| `punkte` | die Handlungen, siehe unten |
| `groesse` | `klein` (Vorgabe) oder `normal` |
| `links` | Liste linksbündig unter dem Knopf statt rechtsbündig |
| `titel`, `anker` | Tooltip des Knopfs; Sprungziel für Rundgänge und Tipps (`data-anker`) |

Ein Punkt (`MenuePunkt`) hat `key`, `inhalt` und `tu(anlass?)`, dazu wahlweise:

- `symbol` – Symbol aus `Symbol.tsx`; Punkte ohne Symbol behalten den Platz, damit die Texte untereinander stehen.
- `gruppe` – Überschrift der Gruppe; Punkte derselben Gruppe stehen beisammen (an Dokumenten: Ansehen, Herunterladen, Bearbeiten, Ordnen).
- `gesperrt` – Grund als Text; er steht klein **unter** dem Punkt, nicht nur im Tooltip (Leitsatz 6).
- `gefahr` – eine Rückfrage wie beim [Knopf](bausteine-knopf.md) (`titel`, `text`, `ja`, wahlweise `mitGrund`). Solche Punkte stehen abgesetzt am Ende, in Ruhe nicht rot; `tu` läuft erst nach „Ja“ und bekommt den gewählten Grund.
- `titel` – kurze Erklärung als Tooltip, zusätzlich zum Text.

```tsx
import { Menue } from '../bausteine';

<Menue beschriftung={t('ablage.dokumente.mehr', { name: d.name })} nurSymbol punkte={[
  { key: 'tab', gruppe: t('…gruppe.ansehen'), symbol: 'extern', inhalt: t('…in-neuem-tab-oeffnen'), tu: oeffnen },
  { key: 'weg', symbol: 'geloescht', inhalt: t('…mappe-mit-verknuepften'), tu: loeschen,
    gefahr: { titel: t('…frage'), ja: t('…loeschen'), mitGrund: true } },
]} />
```

- **Tastatur** nach WAI-ARIA (Menü-Knopf): Enter, Leertaste oder Pfeil runter öffnen und setzen den Fokus auf den ersten Punkt; Pfeiltasten, Pos1 und Ende wandern; Esc schließt und gibt den Fokus an den Knopf zurück. Ein Klick daneben schließt.
- **Am Handy** öffnet das Menü als Blatt von unten; jeder Punkt ist mindestens 48 px hoch.
- **Fehler** aus `tu` (abgelehntes Promise) kommen als Hinweisfenster.
- Die Musterseite zeigt den Baustein im Bereich **Menü**: mit Gruppen, gesperrtem Punkt und Gefahr.

Code: `web/src/bausteine/menue/`.
