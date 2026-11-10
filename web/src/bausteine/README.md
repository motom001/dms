# Bausteine der Oberfläche

Kleine Teile, aus denen jede Seite besteht – überall gleich im Aussehen, im Verhalten und in der Barrierefreiheit (#967).
Ausführlich im Entwicklerhandbuch unter **Gestaltung und Bausteine**
(`docs/handbuch/entwickler/docs/bausteine.md`).

- **Importieren nur über `index.ts`:** `import { Feld } from '../bausteine'` – nie aus den Unterordnern.
- **Je Baustein ein Ordner:** Komponente (`Feld.tsx`), Aussehen als CSS Module (`Feld.module.css`, Werte nur aus
  `web/src/tokens.css`) und `muster.tsx` mit jedem Zustand für die Musterseite.
- **Benannte Varianten statt Schalter** (`Feld`, `HakenFeld`, `FeldGruppe`), keine Gottkomponente.
- **Neues streng, Bestand beim Anfassen** – kein Großumbau.

## Musterseite

`/muster` zeigt jeden Baustein in jedem Zustand, hell und dunkel umschaltbar. Nur im Entwicklungsmodus (`npm run dev`)
und im Testbau (`VITE_MUSTER=1 npm run build`); der Produktivbau enthält sie nicht. Die Rauchtests fotografieren sie
und prüfen sie mit axe-core (`web/rauchtest/muster.mjs`).

Neuer Baustein: Ordner anlegen, in `index.ts` ausgeben, in `BAUSTEINE` in `muster.tsx` eintragen.

| Baustein | Wofür |
| --- | --- |
| `Feld`, `HakenFeld`, `FeldGruppe` | Rahmen für Eingaben: Beschriftung, Eingabe, Hinweis, Fehler, Hilfesymbol, `aria` |
| `Knopf`, `KnopfLink`, `knopfAussehen` | Knöpfe: Arten Anlegen, Haupt, Neben, Gefahr, Link; gesperrt mit Grund, „läuft“, Ergebnis am Knopf, Fehler aus asynchronen Handlern |
