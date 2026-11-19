art: patch

## Verbessert

- **Lasttest-Seite: jede Angabe einmal** (#1452): Die Reihenfolge bleibt vom Anfang bis zum Ende gleich – Kopf mit Version, Stand, Gerät und Speicher, Ergebnis, Ablauf, Jetzt gemessen –, beim Ende springt nichts mehr. Stufe und laufender Durchgang stehen nur noch im Ablauf; beginnt eine neue Stufe, klappt die fertige zu und die neue auf.
- **Ein Ergebnis** (#1452): oben der kurze Block für die Gerätemeldung, darunter der ganze Bericht. Zuerst sind nur die Zeilen bis „RAM …“ zu sehen, „Ganzes Ergebnis zeigen“ klappt den Rest auf. „Kopieren“ und „Als Datei herunterladen“ nehmen immer alles, auch die Datei unter `/data/ergebnis` enthält dasselbe. Steht noch „bitte ergänzen“ bei Gerät oder Speicher, weist ein Satz am Knopf darauf hin und springt zum Feld.
- **Datenbank als Kurve** (#1452): „Jetzt gemessen“ zeigt neben CPU und Arbeitsspeicher die belegten Datenbank-Verbindungen in Prozent, darunter die wartenden Abfragen – aus derselben 2-Sekunden-Messung, ohne zusätzliche Abfragen.
