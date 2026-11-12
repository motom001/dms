art: keine

## Intern

- **CI vergleicht Pull Requests gegen das aktuelle main** (#952, Fund Entwicklung 08.11.2026): Die Prüfungen „Release-Notiz“, „Bestandslisten wachsen nicht“ und „Hinweise zu geänderten Dateien“ nehmen als Basis den ersten Elternteil des Merge-Refs statt `pull_request.base.sha`. Vorher zählten Schnipsel und Dateien mit, die seit dem letzten Push auf main gekommen waren, z. B. „genau einen Schnipsel, hier 2“.
