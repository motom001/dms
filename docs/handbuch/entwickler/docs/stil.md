# Stil und Abhängigkeiten

Zwei Werkzeuge prüfen den Code, bevor er nach `main` kommt (#899): **ESLint** für typische Programmierfehler und zu große Funktionen, **dependency-cruiser** für die Richtung der Importe zwischen Server, Oberfläche und gemeinsamem Code. Beide laufen in der CI im Job **stil**, parallel zu den Tests, und beide kennen den **Bestand**: Was beim Einführen schon gegen eine Regel verstieß, steht in einer Liste und meldet sich nicht. Neuer Code ist dagegen voll streng – jeder Verstoß ist ein Fehler.

## Befehle { #befehle }

| Befehl | Was |
| --- | --- |
| `npm run lint` | ESLint über Server, Tests, Oberfläche und `shared` (mit Typinformation, gut eine Minute); `npm run lint -- --quiet` zeigt nur Fehler |
| `npx eslint server/src/dienst.ts` | nur einzelne Dateien – schneller beim Arbeiten |
| `npm run lint:abh` | Abhängigkeiten prüfen (dependency-cruiser, wenige Sekunden) |
| `npm run lint:zaehlen` | Bestandslisten gegen `main` zählen – genau die Prüfung der CI |
| `npm run lint:umtragen` | nach einem Umzug: Bestand neu schreiben, Verwaistes streichen, dann zählen |
| `npm run abhaengigkeitsbild` | [Abhängigkeitsbild](#abhaengigkeitsbild) neu erzeugen |

Die Werkzeuge sind feste Versionen (ohne `^`) unter `devDependencies` im Wurzelordner und kommen nicht ins Image: Dort installiert `npm ci --omit=dev --workspace server` nur die Laufzeit-Pakete des Servers.

## Regeln und Werte { #regeln }

Die Einstellungen stehen in `eslint.config.js` (flache Konfiguration, ESLint 10). Grundlage sind die empfohlenen Regeln von ESLint und `typescript-eslint`; dazu kommen:

| Regel | Wert | Ziel |
| --- | --- | --- |
| `max-params` | 5 | 4 |
| `complexity` | 20 (Fehler) | 10 |
| `ablago/komplexitaet-hinweis` | 15 (nur Warnung) | – |
| `max-lines-per-function` | 60; in `*.tsx` 150; in `*.routen.ts` je Handler 60 | – |
| `max-lines` | 400 je Datei | – |
| `max-depth` | 4 | – |
| `@typescript-eslint/no-floating-promises` | an | – |
| `@typescript-eslint/no-misused-promises` | an | – |
| `@typescript-eslint/no-explicit-any` | an | – |
| `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` | an (Oberfläche) | – |
| `@eslint-community/eslint-comments/require-description` | an | – |

Längen zählen ohne Leerzeilen und Kommentare – Erklärungen im Code sollen nichts kosten.

- **Zwei Schwellen für die Komplexität:** Eine Regel hat in ESLint nur eine Stufe. `ablago/komplexitaet-hinweis` ist dieselbe Regel `complexity` noch einmal, mit 15 als Warnung; die CI zeigt die Warnungen nur für die Dateien, die ein Pull Request ändert, als Anmerkung an der Zeile. Die eigenen Regeln stehen in `.github/werkzeuge/eslint-ablago.mjs`.
- **Routendateien (`*.routen.ts`, #960):** Gemessen wird jeder Handler für sich. Ausgenommen ist nur die äußere Registrierfunktion – eine exportierte Funktion auf oberster Ebene, die die Handler einträgt. Stehen die Routen als Liste auf Modulebene, zählt ohnehin jeder Handler einzeln.
- **Tests (`server/test/`):** ohne `max-lines` und `max-lines-per-function`, sonst dieselben Regeln. `test()`, `describe()` und `it()` aus `node:test` gelten nicht als „nicht abgewartet“.
- **Werkzeug-Skripte** (`.github/werkzeuge/*.mjs`, `server/test/*.mjs`, `web/rauchtest/*.mjs`): nur die Grundregeln von ESLint, ohne Typinformation.
- **Promises in der Oberfläche:** `onClick={async () => …}` meldet `no-misused-promises`, denn React wartet nicht auf das Promise und ein Fehler bliebe unbemerkt. Besser: `onClick={() => void speichern()}` mit eigenem `try`/`catch` in `speichern`.

### Ausnahmen im Code { #ausnahmen-im-code }

Muss eine Regel an einer Stelle wirklich weichen, dann mit Begründung nach `--`:

```ts
}, [fehlend]); // eslint-disable-line react-hooks/exhaustive-deps -- Namen nur nachladen, wenn sich die Liste ändert
```

Ohne Begründung, ohne Regelname (`/* eslint-disable */`) oder ohne Wirkung ist die Ausnahme selbst ein Fehler.

## Bestand: umtragen ja, hinzufügen nein { #bestand }

Beim Einführen standen rund 700 Verstöße im Code – vor allem zu komplexe Funktionen, unbenutzte Variablen und `async` in Ereignissen der Oberfläche. Sie stehen in **`eslint-suppressions.json`** (Datei → Regel → Anzahl, erzeugt mit `eslint --suppress-all`). ESLint meldet sie nicht, solange eine Datei nicht mehr Verstöße einer Regel hat als dort eingetragen. Ebenso stehen die Kreisläufe, die es schon gab, in **`.dependency-cruiser-known-violations.json`**.

Für beide Listen gilt: **Die Gesamtzahl darf nie steigen.** Die CI zählt sie im Pull Request gegen den Stand der Basis (`.github/werkzeuge/ausnahmen-zaehlen.mjs`) und scheitert, wenn eine Zahl wächst.

- **Umtragen ist erlaubt.** Zieht eine Funktion in eine andere Datei um (etwa beim Teilen von `routen.ts`), wandert ihr Eintrag mit: `npm run lint:umtragen` schreibt die Listen neu und streicht, was nicht mehr vorkommt. Die Summe bleibt gleich – die Prüfung ist grün.
- **Hinzufügen nicht.** Neuer oder geänderter Code, der eine Regel verletzt, wird korrigiert, nicht eingetragen. `lint:umtragen` würde ihn zwar aufnehmen, aber dann wächst die Zahl, und die CI meldet, bei welcher Regel.
- **Weniger ist willkommen.** Wer eine Funktion vereinfacht, kann die Liste mit `npx eslint --prune-suppressions .` gleich mit verkleinern – sonst erledigt das der Workflow unten.

### Aufräumen auf main { #aufraeumen }

Der Workflow **Bestandslisten aufräumen** (`.github/workflows/ausnahmen-aufraeumen.yml`) läuft nach jedem Push auf `main`: `eslint --prune-suppressions` streicht Einträge, die im Code nicht mehr vorkommen, dependency-cruiser schreibt seine Liste neu. Ändert sich etwas, legt er den Branch `ausnahmen-aufraeumen` an und öffnet einen Pull Request – oder aktualisiert den offenen.

Mit dem `GITHUB_TOKEN` angelegte Pull Requests starten nach einer Regel von GitHub keine Workflows; die Pflichtprüfungen fehlen dann. Darum: diesen Pull Request einmal **schließen und wieder öffnen** – dann laufen alle Prüfungen wie sonst. Eine Release-Notiz braucht er nicht, er ändert nur die beiden Listen.

## Abhängigkeiten zwischen den Teilen { #abhaengigkeiten-pruefen }

`.dependency-cruiser.cjs` legt fest, wer wen importieren darf (`npm run lint:abh`):

- **Keine Kreisläufe** zwischen Dateien (reine Typ-Importe zählen nicht).
- **`shared/`** importiert weder `server/` noch `web/` – der Code läuft in beiden.
- **`web/`** importiert nie `server/`, **`server/`** nie `web/`. Ausnahme: Tests unter `server/test/`.
- **Nur über `index.ts`:** Ordner mit einer `index.ts` sind von außen nur über diese erreichbar – heute die [PDF-Stelle](aufbau.md#pdf-stelle) `server/src/pdf/` (außer für `arbeit/vorgaenge.ts`, das die Vorgänge im Arbeiter-Faden ausführt) und `server/src/arbeit/`.
- **Vorbereitet:** „nur abwärts“ für den Kern (#961) und „Fachbereiche nur über `index.ts`“ stehen als Kommentar in der Datei und werden aktiv, sobald es `server/src/kern/` und die Fachordner gibt.

### Abhängigkeitsbild { #abhaengigkeitsbild }

Das Bild zeigt die Importe auf **Ordner-Ebene**; die Zahl an einem Pfeil ist die Zahl der Importe. Dateien direkt unter `src/` stehen als „(Wurzel)“. `npm run abhaengigkeitsbild` erzeugt die Quelle `grafiken/abhaengigkeiten.mmd` neu und, wenn die Mermaid-CLI (`mmdc`) installiert ist, auch das Bild.

![Abhängigkeiten auf Ordner-Ebene: server/src mit arbeit, laeufer und pdf; web/src mit ablage, assistent, einrichtung, entdecken, profil und werkbank; alle nutzen shared/src mit den Sprachdateien](grafiken/abhaengigkeiten.png){ loading=lazy }
