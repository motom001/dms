art: patch

## Behoben

- **Weniger Arbeitsspeicher beim großen Export** (#970): Ein Export über viele Mappen (ZIP, Excel, CSV) belegte beim Aufbereiten der Zeilen je Zelle Speicher außerhalb von Node.js, den Ablago danach nicht mehr hergab – mit einem Prozess bis über die zugesagten 1,5 GB. Jetzt bleibt ein Export klein, und der Lasttest prüft die Grenze von 1,5 GB je Prozess in jeder Stufe.
- **Tabellen öffnen schneller** (#1265): Eine Tabelle an einer Mappe holt ihre Zeilen jetzt über die Verweise auf diese Mappe und zählt die Zeilen, die du nicht sehen darfst, in derselben Abfrage – statt über alle Mappen. Beim Blättern gilt dasselbe. Du siehst weiter nur die Zahl dieser Zeilen, nie ihren Inhalt.
