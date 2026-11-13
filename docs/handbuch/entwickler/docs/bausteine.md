# Gestaltung und Bausteine

Bausteine sind die kleinen Teile, aus denen jede Seite der Oberfläche besteht: ein Feld, ein Knopf, eine Meldung. Jeder Baustein sieht überall gleich aus, verhält sich überall gleich und bringt die Barrierefreiheit gleich mit. Wer eine Seite baut, setzt Bausteine zusammen, statt Beschriftung, Fehleranzeige oder `aria`-Attribute jedes Mal neu zu schreiben (#967).

## Wo sie liegen { #ort }

Alle Bausteine stehen unter `web/src/bausteine/`:

| Datei | Wofür |
| --- | --- |
| `index.ts` | Die Tür nach außen: Seiten importieren Bausteine nur von hier (`import { Feld } from '../bausteine'`), nie aus den Unterordnern. |
| `README.md` | Kurzüberblick für alle, die im Code lesen. |
| `<baustein>/<Baustein>.tsx` | Der Baustein selbst, z. B. `feld/Feld.tsx`. |
| `<baustein>/<Baustein>.module.css` | Sein Aussehen als CSS Module – Klassen gelten nur für diesen Baustein, Werte nur aus [Tokens](stil.md#farben). |
| `<baustein>/muster.tsx` | Der Bereich des Bausteins auf der Musterseite: jeder Zustand einmal. |
| `muster.tsx` | Die Musterseite selbst und die Liste ihrer Bereiche. |

## Regeln { #regeln }

- **Benannte Varianten statt Schalter.** Ein Haken ist `HakenFeld`, nicht `Feld art="haken"`. Jede Variante bleibt klein und verständlich; es gibt keine Gottkomponente mit zwanzig Schaltern.
- **Neues streng, Bestand beim Anfassen.** Neue Seiten nehmen die Bausteine. Bestehende Seiten stellt um, wer sie ohnehin ändert – kein Großumbau. ESLint wacht darüber: `ablago/bausteine` meldet jedes rohe `<button>` und jede Eingabe ohne Feldrahmen außerhalb von `web/src/bausteine/`; der Bestand ist eingefroren ([Stil und Abhängigkeiten](stil.md#regeln)).
- **Gleiches Aussehen, gleiche Bedeutung.** Ein Baustein entscheidet Abstände, Schrift, Farben und Zustände. Eine Seite überschreibt sie nicht; fehlt etwas, bekommt der Baustein eine neue Variante.
- **Barrierefreiheit gehört in den Baustein.** `id`, `htmlFor`, `aria-describedby` und Co. setzt der Baustein; wer ihn benutzt, muss daran nicht denken.
- **Hell und dunkel, Desktop und Handy.** Jeder Zustand ist in beiden Darstellungen und in Handybreite lesbar; Hover und Tastaturfokus sind sichtbar.

## Leitsätze für Knöpfe { #leitsaetze }

Knöpfe bedeuten überall dasselbe, und nichts erschreckt unnötig (#1210). Wer einen Knopf setzt, prüft ihn gegen diese sechs Sätze; die Musterseite zeigt sie oben, die Bausteine setzen sie um.

1. **Blau ist die Hauptaktion.** Speichern, Anlegen nach dem Ausfüllen, Weiter und Übernehmen sind blau (`Knopf art="haupt"`), höchstens einer je Bereich. Blau ist auch die Akzentfarbe (Links, Fokus, Auswahl) – das wirkt ruhig und zusammengehörig.
2. **Grün heißt „etwas Neues anfangen“**, und nur das: „+ Neu“, „+ Post“, „+ Zeile“, „+ Notfallkontakt“ (`art="anlegen"`). Die Beschriftung beginnt mit „+“. Sonst ist Grün für Zustände reserviert (aktiv, erledigt, gut gegangen).
3. **Verwerfen ist ein Knopf mit Rand** (`art="neben"`) neben dem blauen Hauptknopf – es tut etwas, also ist es ein Knopf (Musterkatalog C8). Kein Symbol, beim Darüberfahren nicht rot, beim Klick keine Rückfrage (nur Esc mit Änderungen fragt nach); ohne Änderung blass.
4. **Auf der Seite ist nichts rot.** Gefährliche Knöpfe (Löschen, Sperren, Abmelden, Entfernen eines Pakets …) sehen aus wie ein Nebenknopf mit Symbol (`art="gefahr"`). Beim Darüberfahren und beim Tastaturfokus werden Schrift und Rand rot.
5. **Rot gefüllt nur im Moment der Entscheidung:** am Bestätigungsknopf der Rückfrage. Ohne Rückfrage kein Gefahr-Knopf – die Typprüfung lässt `art="gefahr"` nur mit `rueckfrage` und `symbol` zu. Was sich rückgängig machen lässt (Verweis aus einem Feld entfernen, Zeile aus einer Liste vor dem Speichern), ist ein normales „Entfernen“ bzw. „×“, nicht rot.
6. **Zwei Arten von „geht nicht“.** *Nichts zu tun* (Speichern oder Verwerfen ohne Änderung, leere Auswahl): `gesperrt` – blass, ohne Erklärung. *Gesperrt aus einem Grund* (Löschen mit Verweisen, fehlendes Recht, Archivmodus): `gesperrt="<Grund>"` oder eine `KnopfSperre` – gestrichelter Rand mit Schloss, daneben ein kleines ⓘ; ein Klick auf Knopf oder ⓘ öffnet die Erklärung am Knopf (Grund, betroffene Einträge, „Stattdessen“ als Knöpfe). Kein langer Satz in der Zeile; für Screenreader hängt der Grund am Knopf (`aria-describedby`). Gestrichelt heißt überall „für dich gesperrt“, wie „nur lesen“ am Feld (C4). Kein „?“ – das führt ins Handbuch (C7); ⓘ erklärt genau diesen Fall.

**Geprüft wird das** an drei Stellen: Die Typprüfung verlangt bei `art="gefahr"` Rückfrage und Symbol (`web/src/bausteine/knopf/typpruefung.ts`). ESLint verbietet Farbklassen über `className` am Knopf (`ablago/knopf-farben`, [Stil und Abhängigkeiten](stil.md#regeln)). Die Rauchtests melden auf jeder besuchten Seite Anlege-Knöpfe ohne „+“, Gefahr-Knöpfe ohne Rückfrage und rot Gefülltes außerhalb einer Rückfrage ([Rauchtest und Bilder](#rauchtest)).

![Musterseite, Bereich „Knopf“: Arten, Gefahr in Ruhe, mit Maus und Fokus, die Rückfrage, gesperrt in zwei Formen und die geöffnete Erklärung](bilder/muster-knopf.png){ loading=lazy }

## Am Handy { #handy }

Am Handy trifft der Finger, nicht der Mauszeiger. Darum hat jedes Bedienelement eines Bausteins bei **`(pointer: coarse)`** (Touch als Hauptzeiger) eine **Tippfläche von mindestens 44 × 44 px** (Musterkatalog D6, #1027; WCAG 2.5.8 verlangt 24 px). Mit der Maus (`pointer: fine`) bleibt alles, wie es ist.

| Baustein | Am Handy |
| --- | --- |
| `Knopf`, `KnopfLink` (normal, alle Arten) | mindestens 44 px hoch, nur Symbol auch 44 px breit; die Art Link ohne sichtbare Fläche ebenso |
| `Knopf` klein | bleibt optisch klein; ein unsichtbares Pseudo-Element vergrößert die Tippfläche, ein Außenabstand derselben Breite hält Nachbarn frei |
| `Feld` | Eingaben und Auswahllisten mindestens 44 px hoch |
| Hilfesymbol „?“ im Feld | bleibt optisch klein; unsichtbare Tippfläche 44 × 44 px, Kopfzeile 44 px hoch, Abstand zur Beschriftung |
| `HakenFeld`, Haken in `FeldGruppe` | die ganze Zeile mit Beschriftung ist mindestens 44 px hoch; die Beschriftung schaltet den Haken mit |
| `Suchfeld`, `ListenSuche` | Eingabe wie ein Feld; „×“ als Knopf nur mit Symbol; Auswahl „Paket“ und `FilterHaken` mindestens 44 px hoch |
| `Umschalter` | jede Wahl mindestens 44 × 44 px |
| `Bereich`, Sprungleiste aus `useBereiche` | Sprünge und Kopf eines Bereichs mindestens 44 px hoch; „Alle aufklappen“ als Knopf der Art Link |
| ⓘ am gesperrten `Knopf` | bleibt optisch klein; Tippfläche 44 × 44 px |
| `Speicherleiste` | alle Knöpfe in einer Zeile; „… löschen“ zeigt nur sein Symbol (der Name bleibt für Screenreader) |
| `Reiter` | jeder Reiter mindestens 44 px hoch; die Reihe rollt waagerecht, die Seite nicht |
| `Schalter` | mindestens 44 px hoch, die Beschriftung schaltet mit |
| `PaketChip` als Link | bleibt optisch klein; unsichtbare Tippfläche 44 px hoch |

**Die Regel:** Tippflächen überlappen sich nie – auch nicht in einer Knopfreihe oder einer Gruppe von Haken. Wer einen Baustein benutzt, schreibt dafür nichts selbst; Einzellösungen mit `@media (pointer: coarse)` in `styles.css` gibt es nur noch für Stellen ohne Baustein. Neue Bausteine legen ihre Tippfläche in ihrem eigenen Stylesheet fest, ebenfalls nur bei `(pointer: coarse)`, damit der Desktop unverändert bleibt.

**Geprüft** wird das im Rauchtest der Musterseite: In der Handyansicht (390 px, Touch) misst `tippflaechenPruefen` in `web/rauchtest/muster.mjs` jedes Bedienelement der Seite so, wie der Browser einen Fingertipp zuordnet (`elementFromPoint` – unsichtbare Tippflächen und Beschriftungen zählen mit). Jedes braucht ein eigenes Quadrat von 44 × 44 px; sonst scheitert der Test. Ausnahmen stehen mit Grund in `TIPP_AUSNAHMEN` (heute keine).

## Musterseite { #musterseite }

Die Musterseite unter **`/muster`** zeigt jeden Baustein in jedem Zustand – zum Ansehen, Ausprobieren und Vergleichen. Oben rechts lässt sich die Darstellung umschalten (automatisch, hell, dunkel, hoher Kontrast); die Wahl steht in der Adresse (`/muster?darstellung=dunkel`).

![Musterseite mit den Bereichen „Feld“ und „Knopf“: jeder Zustand in einer eigenen Karte](bilder/muster-hell.png){ loading=lazy }

Es gibt sie nur

- im **Entwicklungsmodus** (`npm run dev`, dann `http://localhost:5173/muster`) und
- im **Testbau**: `VITE_MUSTER=1 npm run build`. So bauen die CI-Jobs für die Rauchtests und die Bilder der Handbücher.

Im **Produktivbau** (`npm run build` ohne `VITE_MUSTER`, auch im Image) fehlt sie ganz: `web/src/start.tsx` lädt sie nur, wenn `import.meta.env.DEV` oder `import.meta.env.VITE_MUSTER === '1'`. Vite setzt beide Werte beim Bauen fest ein, die Bedingung ist dann immer falsch, und der Code fällt heraus. Der Job **pruefen** baut die Oberfläche einmal ohne `VITE_MUSTER` und bricht ab, wenn darin noch etwas von der Musterseite steckt.

**Neuer Baustein:** Ordner unter `web/src/bausteine/` mit Baustein, Stylesheet und `muster.tsx` anlegen, in `index.ts` ausgeben und in `BAUSTEINE` in `web/src/bausteine/muster.tsx` eintragen. Texte der Musterseite stehen wie alle Texte in den Sprachdateien (`oberflaeche.muster.*`, Deutsch und Englisch).

## Rauchtest und Bilder { #rauchtest }

Der Rauchtest „Musterseite der Bausteine“ (`web/rauchtest/rauchtest.mjs`, Job **pruefen**) öffnet `/muster` hell und dunkel, am Desktop und in Handybreite, prüft jede Ansicht mit **axe-core** (WCAG 2.2 A und AA samt bewährter Praxis, darunter `color-contrast`) darauf, dass die Seite am Handy nicht waagerecht rollt, und dort auf Tippflächen von mindestens 44 × 44 px ([Am Handy](#handy)). Jeder Verstoß lässt den Test scheitern. Die Bilder liegen danach im Artefakt **musterseite** des Laufs.

**Knöpfe auf jeder Seite (#1210):** In jedem Rauchtest läuft ein Wächter (`knopfWaechter` in `rauchtest.mjs`), der nach jeder Änderung der Seite die sichtbaren Knöpfe prüft: `data-knopf="anlegen"` beginnt mit „+“, `data-knopf="gefahr"` öffnet eine Rückfrage (`aria-haspopup="dialog"`), rot Gefülltes steht nur im Fenster einer Rückfrage. Bestand, der das noch nicht erfüllt, steht mit seinem Issue in `KNOPF_AUSNAHMEN`; wer die Stelle umstellt, nimmt den Eintrag heraus.

Dieselben Bilder nimmt der Workflow **Handbuch** in den Jobs `bilder (de)` und `bilder (en)` auf (`docs/handbuch/screenshots/aufnehmen.mjs`, gemeinsamer Code in `web/rauchtest/muster.mjs`); sie landen in diesem Handbuch unter `bilder/muster-*.png`. Lokal fehlen sie wie alle Bildschirmfotos ([Loslegen](loslegen.md)).

## Bausteine { #liste }

| Baustein | Wofür |
| --- | --- |
| [Feld](bausteine-feld.md) | Rahmen für jedes Eingabeelement: Beschriftung, Eingabe, Fehler, Hinweis, Hilfesymbol |
| [Knopf](bausteine-knopf.md) | Jeder Knopf: Arten Haupt (blau), Anlegen (grün, „+ …“), Neben, Gefahr (mit Rückfrage), Link; gesperrt in zwei Formen, „läuft“, Ergebnis und Fehler am Knopf; dazu die Rückfrage |
| [Speicherleiste](bausteine-speicherleiste.md) | Unten in jedem Formular: „… löschen“ links, Status, „Verwerfen“ mit Rand und der blaue Hauptknopf; Entwurf mit Esc und Warnung beim Verlassen |
| [Reiter](bausteine-reiter.md) | Register über einem Inhalt, ein aktives Aussehen, Tastatur und `aria` nach WAI-ARIA |
| [Schalter](bausteine-schalter.md) | Etwas ist an oder aus (Funktion, Dienst, Automatisierung) – Schiebeschalter; für Auswahl und Optionen bleibt der Haken |
| [PaketChip](bausteine-paketchip.md) | Herkunft aus einem Paket: Symbol und Name hinter dem Namen, Tooltip mit Version, Link zur Paketseite |
| [Eingaben mit Einheit](bausteine-einheit.md) | Zeitraum (Zahl und Einheit, Einzahl/Mehrzahl) und Prozent (Zahl mit „%“) für die Feldarten Zeitraum und Prozent |
| [Tabelle](bausteine-tabelle.md) | Zeilen mit Spalten, jede führt zu einer Seite; breit eine Tabelle, schmal eine Liste mit den ersten zwei Spalten (Feldart Tabelle) |
| [Suche](bausteine-suche.md) | Das Suchfeld aller Listen und das Muster „Liste in der Mitte: Suchfeld oben, Filter darunter“ mit Trefferzahl, Fundstellen und Paketfilter |
| [Umschalter](bausteine-umschalter.md) | Segmentknopf: zwei bis vier gleichrangige Wahlen, genau eine an – etwa „Fragen · Suchen“ auf der Startseite |
| [Bereiche](bausteine-bereiche.md) | Das Muster „Editor rechts: Sprungleiste + Bereiche“: Sprungleiste mit „Alle aufklappen“, Bereiche zum Auf- und Zuklappen, Gedächtnis je Gerät, Fehler öffnen ihren Bereich |
| [Fassungen](bausteine-fassungen.md) | Wer hat wann was geändert: Liste mit lesbaren Änderungen, zwei Fassungen vergleichen, wiederherstellen mit Vorschau; gelöschte Einträge unter einer Liste |
