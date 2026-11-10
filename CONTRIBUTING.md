# Mitmachen

**Deutsch** · [English](CONTRIBUTING.en.md)

Danke für dein Interesse an Ablago! **Issues und Pull Requests sind auf Deutsch oder Englisch willkommen.** Wie Mitarbeit hier läuft, steht ausführlich im **[Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/)**. Das Wichtigste in Kürze:

1. **Erst ein Issue**, als User Story („Als … möchte ich …, damit …“) mit Akzeptanzkriterien. Das gilt für Wünsche wie für Fehler.
2. **Diskussion im Issue**, bis klar ist, was gebaut wird.
3. **Umgesetzt wird nur, was das Label `freigegeben` trägt.** Dieses Label vergibt allein der Maintainer ([@motom001](https://github.com/motom001)). Pull Requests zu nicht freigegebenen Issues werden nicht gemergt.
4. **Pull Request** mit `Closes #…`, Tests, angepasstem Handbuch und – wenn er das Programm ändert – einem Notizschnipsel `docs/releases/neu/<branch>.md` (erste Zeile `art: patch`, `art: minor` oder `art: keine`, darunter die Release-Notizen). Die Versionsnummer entsteht erst beim Merge (Entwicklerhandbuch → Release). Gemergt wird nur vom Maintainer.

## Neue Abhängigkeiten nur mit Begründung

Ablago kommt mit sehr wenig fremdem Code aus – das schützt vor Angriffen über die Lieferkette und hält Wartung und Image klein. Eine **neue Laufzeit-Abhängigkeit** (npm-Paket unter `dependencies` oder Alpine-Paket per `apk add` im `Dockerfile`) kommt deshalb nur mit Begründung im Pull Request:

- **Wozu** wird sie gebraucht?
- **Warum nicht** mit Node.js-Bordmitteln oder den schon vorhandenen Abhängigkeiten und Werkzeugen?
- **Lizenz** – verträglich mit Apache-2.0?
- **Pflegezustand** – letzte Version, Zahl der Betreuer?
- **Eigene Abhängigkeiten** – was kommt mit ihr ins Image?

Die Vorlage für Pull Requests fragt danach; die Prüfung „Abhängigkeiten“ weist im PR auf neue Abhängigkeiten hin. Die heutige Liste mit Zweck steht im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/aufbau/#abhaengigkeiten).

## Stil und Abhängigkeiten prüfen

Vor dem Pull Request laufen `npm run lint` (ESLint mit Typinformation) und `npm run lint:abh` (dependency-cruiser) ohne Fehler durch. Was es beim Einführen schon gab, steht in `eslint-suppressions.json` bzw. `.dependency-cruiser-known-violations.json` und meldet sich nicht – neuer Code ist voll streng, und die Listen dürfen nicht wachsen: **umtragen ja, hinzufügen nein**. Ausnahmen im Code nur mit Begründung (`// eslint-disable-next-line regel -- Grund`). Einzelheiten im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/stil/).

## Grafiken und Bilder je Sprache

Grafiken mit Text gibt es je Sprache: `name.svg` auf Deutsch, `name.en.svg` auf Englisch (z. B. `personas-skala.svg` und `personas-skala.en.svg`, erzeugt von `docs/handbuch/werkzeuge/personas_grafiken.py`). `README.md` bindet die deutschen ein, `README.en.md` nur die `.en`-Fassungen. Einzige Ausnahme sind Bildschirmfotos der Oberfläche: Solange es sie nur auf Deutsch gibt (#357), zeigt `README.en.md` das deutsche Bild mit dem Hinweis, dass die Oberfläche derzeit nur Deutsch kann. Ein Test (`server/test/readme-sprachen.test.ts`) prüft das.

Mit einem Beitrag stellst du ihn unter die [Apache-2.0](LICENSE). Bitte keine echten Dokumente oder persönlichen Daten committen.

Für den Umgang miteinander gilt unser [Verhaltenskodex](CODE_OF_CONDUCT.md).
