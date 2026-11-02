# Mitmachen

**Deutsch** · [English](CONTRIBUTING.en.md)

Danke für dein Interesse am DMS! **Issues und Pull Requests sind auf Deutsch oder Englisch willkommen.** Wie Mitarbeit hier läuft, steht ausführlich im **[Entwicklerhandbuch](https://motom001.github.io/dms/entwickler/aktuell/)**. Das Wichtigste in Kürze:

1. **Erst ein Issue**, als User Story („Als … möchte ich …, damit …“) mit Akzeptanzkriterien. Das gilt für Wünsche wie für Fehler.
2. **Diskussion im Issue**, bis klar ist, was gebaut wird.
3. **Umgesetzt wird nur, was das Label `freigegeben` trägt.** Dieses Label vergibt allein der Maintainer ([@motom001](https://github.com/motom001)). Pull Requests zu nicht freigegebenen Issues werden nicht gemergt.
4. **Pull Request** mit `Closes #…`, Tests, angepasstem Handbuch und, für eine neue Version, Release-Notizen. Gemergt wird nur vom Maintainer.

## Neue Abhängigkeiten nur mit Begründung

Das DMS kommt mit sehr wenig fremdem Code aus – das schützt vor Angriffen über die Lieferkette und hält Wartung und Image klein. Eine **neue Laufzeit-Abhängigkeit** (npm-Paket unter `dependencies` oder Alpine-Paket per `apk add` im `Dockerfile`) kommt deshalb nur mit Begründung im Pull Request:

- **Wozu** wird sie gebraucht?
- **Warum nicht** mit Node.js-Bordmitteln oder den schon vorhandenen Abhängigkeiten und Werkzeugen?
- **Lizenz** – verträglich mit Apache-2.0?
- **Pflegezustand** – letzte Version, Zahl der Betreuer?
- **Eigene Abhängigkeiten** – was kommt mit ihr ins Image?

Die Vorlage für Pull Requests fragt danach; die Prüfung „Abhängigkeiten“ weist im PR auf neue Abhängigkeiten hin. Die heutige Liste mit Zweck steht im [Entwicklerhandbuch](https://motom001.github.io/dms/entwickler/aktuell/aufbau/#abhaengigkeiten).

Mit einem Beitrag stellst du ihn unter die [Apache-2.0](LICENSE). Bitte keine echten Dokumente oder persönlichen Daten committen.

Für den Umgang miteinander gilt unser [Verhaltenskodex](CODE_OF_CONDUCT.md).
