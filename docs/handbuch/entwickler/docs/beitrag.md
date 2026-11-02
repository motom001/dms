# Beitrag einreichen

## Vor dem Pull Request

- Das Issue trägt das Label **`freigegeben`**.
- Ein eigener Branch, z. B. `abwesenheit-vertreter`, von aktuellem `main`.
- **Tests** für das Neue, im Arbeitsspeicher und, wo Daten gespeichert werden, auch gegen PostgreSQL.
- `npm test` und `npm run typecheck` laufen lokal durch.
- **Keine neue Abhängigkeit ohne Begründung:** Wer ein npm-Paket unter `dependencies` oder ein Alpine-Paket im `Dockerfile` ergänzt, beantwortet in der PR-Beschreibung die Fragen unter [Aufbau → Abhängigkeiten](aufbau.md#abhaengigkeiten). Die Prüfung im PR weist darauf hin.
- **Handbuch** angepasst, wo sich etwas Sichtbares ändert: Benutzer-, Administrator- oder Installationshandbuch. Neue ?-Symbole brauchen einen Eintrag in `shared/src/hilfe.ts`.
- **Release-Notizen:** Für eine neue Version die Nummer in den drei `package.json` erhöhen und `docs/releases/v<version>.md` schreiben, aus dem Blick der Nutzer. Kleine Korrekturen ohne neue Nummer landen nur im Image `main`. Mit dem Maintainer im Issue klären, welche Nummer passt.

## Der Pull Request

- Titel kurz und deutsch, z. B. *„0.15.0: Abwesenheit mit Vertreter (#78)“*.
- Beschreibung nach der Vorlage, mit `Closes #…`.
- Klein halten: lieber zwei PRs als einer, der vieles auf einmal ändert.
- Die Prüfungen müssen grün sein. Schlägt die CI fehl, steht der Grund als Anmerkung im Lauf.

## Stil

- **Sprache:** Oberfläche, Handbuch, Release-Notizen und Commit-Nachrichten auf Deutsch. Auch Bezeichner im Code sind deutsch (`mappe`, `schreibe`, `laden`). Fachbegriffe ohne gutes deutsches Wort bleiben, wie sie sind.
- **Begriffe:** Verwende die Wörter aus dem [Glossar](https://motom001.github.io/dms/benutzer/aktuell/begriffe/) und nicht die, die dort unter „nicht verwenden“ stehen. Ein neuer Begriff kommt mit demselben Pull Request in `docs/glossar.yml`, mit Beschreibung und der Einstufung für Einsteiger (siehe [Für wen wir bauen](personas.md)). `python3 docs/handbuch/werkzeuge/glossar.py` erzeugt daraus die Seite „Begriffe“.
- **Texte für Nutzer:** kurz, freundlich, ohne Fachjargon, aus dem Blick des Lesers („Speichere deine Arbeit“).
- **Texte gehören in die Sprachdatei:** Wer einen Text neu schreibt oder ändert, legt ihn in `shared/src/sprachen/de/<bereich>.json` ab und ruft ihn mit `t('<bereich>.<schluessel>')` ab – siehe [Aufbau → Texte und Sprachdateien](aufbau.md#texte-und-sprachdateien). Die CI prüft fehlende und ungenutzte Schlüssel.
- **Symbole:** einfarbig und aus einer Sammlung – `<Symbol name="…" />` aus `web/src/Symbol.tsx` (Formen aus Lucide, Farbe = Textfarbe, `aria-hidden`; die Beschriftung trägt die Bedeutung). Keine Emoji in der Oberfläche, die CI prüft das (`server/test/symbole.test.ts`). Farbe nur mit Bedeutung, z. B. Warnung oder Erfolg.
- **Code:** TypeScript strikt, kleine Funktionen, Kommentare erklären das *Warum* und verweisen auf das Issue (`// Abwesenheit (#78): …`).
- **Commits:** eine Zeile Zusammenfassung, darunter bei Bedarf Stichpunkte.

## Danach

Der Maintainer schaut sich den PR an, fragt nach oder ändert Kleinigkeiten selbst und mergt. Ab da läuft alles Weitere automatisch.
