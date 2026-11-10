art: patch

## Intern

- **Fehler aus asynchronen Abläufen im Server** (#1011): Die letzten nicht abgewarteten Promises im Server und in den Tests sind bewusst markiert; keine Ausnahme mehr in `eslint-suppressions.json`.

## Behoben

- **Seite rollt nicht mehr von selbst** (#1027): Steht beim Öffnen einer Seite schon ein Ergebnis an einem Knopf (z. B. ein fertiger Auftrag), rollt die Seite nicht mehr von selbst dorthin – nur ein neues Ergebnis holt sie ins Bild.
