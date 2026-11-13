# Bausteine der Oberfläche

Kleine Teile, aus denen jede Seite besteht – überall gleich im Aussehen, im Verhalten und in der Barrierefreiheit (#967).
Ausführlich im Entwicklerhandbuch unter **Gestaltung und Bausteine**
(`docs/handbuch/entwickler/docs/bausteine.md`).

- **Importieren nur über `index.ts`:** `import { Feld } from '../bausteine'` – nie aus den Unterordnern.
- **Je Baustein ein Ordner:** Komponente (`Feld.tsx`), Aussehen als CSS Module (`Feld.module.css`, Werte nur aus
  `web/src/tokens.css`) und `muster.tsx` mit jedem Zustand für die Musterseite.
- **Benannte Varianten statt Schalter** (`Feld`, `HakenFeld`, `FeldGruppe`), keine Gottkomponente.
- **Neues streng, Bestand beim Anfassen** – kein Großumbau.
- **Leitsätze für Knöpfe (#1210):** Blau ist die Hauptaktion, Grün nur „+ …“, Verwerfen ist ein Knopf mit Rand, auf der
  Seite ist nichts rot (Gefahr wie Neben mit Symbol), rot gefüllt nur in der Rückfrage, gesperrt in zwei Formen (blass ·
  gestrichelt mit Schloss und ⓘ). Keine Farbklassen über `className` am Knopf (ESLint `ablago/knopf-farben`).
- **Am Handy 44 × 44 px:** Jedes Bedienelement hat bei `(pointer: coarse)` eine Tippfläche von mindestens 44 × 44 px,
  ohne Überlappen; mit der Maus bleibt alles gleich (#1027). Die Rauchtests messen das auf der Musterseite.

## Musterseite

`/muster` zeigt jeden Baustein in jedem Zustand, hell und dunkel umschaltbar. Nur im Entwicklungsmodus (`npm run dev`)
und im Testbau (`VITE_MUSTER=1 npm run build`); der Produktivbau enthält sie nicht. Die Rauchtests fotografieren sie
und prüfen sie mit axe-core (`web/rauchtest/muster.mjs`).

Neuer Baustein: Ordner anlegen, in `index.ts` ausgeben, in `BAUSTEINE` in `muster.tsx` eintragen.

| Baustein | Wofür |
| --- | --- |
| `Feld`, `HakenFeld`, `FeldGruppe` | Rahmen für Eingaben: Beschriftung, Eingabe, Fehler, Hinweis, Hilfesymbol, `aria` |
| `Knopf`, `KnopfLink`, `knopfAussehen` | Knöpfe: Arten Haupt (blau), Anlegen (grün, „+ …“), Neben, Gefahr (mit Symbol und Rückfrage), Link; gesperrt in zwei Formen mit Erklärung am Knopf, „läuft“, Ergebnis am Knopf, Fehler aus asynchronen Handlern |
| `Rueckfragen` | Das Fenster zu `rueckfrage()`/`hinweis()` (#355, #1210): „Abbrechen“ als Neben, Bestätigung blau – bei Gefahr rot gefüllt, nur hier |
| `Speicherleiste`, `useEntwurf` | Leiste unten in Formularen (#370, #1210): „… löschen“ links (Gefahr mit Rückfrage), „Verwerfen“ mit Rand, Hauptknopf blau |
| `Reiter`, `ReiterFlaeche` | Register über einem Inhalt (#1210): ein aktives Aussehen, Tastatur und `aria` nach WAI-ARIA |
| `Tabelle` | Zeilen mit Spalten, jede führt zu einer Seite (#1030): breit eine Tabelle, schmal eine Liste mit den ersten zwei Spalten; leer ein ruhiger Satz |
| `ZeitraumEingabe`, `ProzentEingabe` | Eingaben mit Einheit (#1035): Zahl und Einheit („3 Monate“, Einzahl/Mehrzahl), Zahl mit „%“ – im Feldrahmen oder mit eigener Beschriftung |
| `Suchfeld`, `ListenSuche`, `FilterHaken`, `PaketFilter`, `KeineTreffer`, `Fundstellen`, `useListenSuche` | Suche (#978, #994): das Suchfeld aller Listen und das Muster „Liste in der Mitte: Suchfeld oben, Filter darunter“ mit Trefferzahl, Fundstellen und Paketfilter |
| `Umschalter` | Segmentknopf (#1002): zwei bis vier gleichrangige Wahlen, genau eine an – z. B. „Fragen · Suchen“; Optionsfelder für Screenreader, Pfeiltasten |
| `Fassungen`, `GeloeschteEintraege` | Wer hat wann was geändert (#1006): Bereich „Fassungen“ eines Editors der Werkbank – Liste mit lesbaren Änderungen, vergleichen, wiederherstellen mit Vorschau; gelöschte Einträge unter einer Liste |
| `Bereich`, `useBereiche`, `fehlerBereiche` | Editor rechts (#1000): Sprungleiste mit „Alle aufklappen / Alle zuklappen“, Bereiche zum Auf- und Zuklappen (neu offen, sonst wie zuletzt auf diesem Gerät, Anker öffnet), Fehler öffnen ihren Bereich; unter drei Bereichen ohne Leiste |
