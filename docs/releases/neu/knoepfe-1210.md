art: minor

## Geändert

- **Knöpfe nachgeschärft** (#1210): Speichern ist überall blau, „Verwerfen“ ein Knopf mit Rand neben dem Hauptknopf, „… löschen“ ist in allen Formularen der Werkbank ein Knopf links in der Speicherleiste, auf einer Linie mit den anderen, und fragt vorher nach. Gefährliche Knöpfe wie „Jetzt sofort sperren“ oder „Passkey entfernen“ sind auf der Seite nicht mehr rot – erst bei Maus und Tastaturfokus –, die roten Ränder sind weg; rot gefüllt ist der Bestätigungsknopf der Rückfrage. Die übrigen Seiten folgen in den nächsten Versionen. Gesperrte Knöpfe mit Grund (etwa „Mappe löschen“ oder „Herunterladen“ ohne Recht) sind gestrichelt mit Schloss, ein kleines ⓘ daneben öffnet die Erklärung über dem Knopf. „Mit verknüpften Mappen löschen …“ fragt jetzt vorher eigens nach. Neu für Entwickler: Baustein `Reiter`, `Speicherleiste` und Rückfrage als Bausteine, Leitsätze im Entwicklerhandbuch.
- **Ein/Aus überall als Schalter** (#1188): WebDAV-Laufwerk, Eingangsordner, E-Mail-Versand, Postfächer, Sicherung, PDFs verkleinern, Übersetzen, „Meine Daten exportieren“, Tippfehler-Suche, Anmeldung über einen Anbieter, Expertenmodus, Automatisierungen und Ablaufvorlagen haben denselben Schiebeschalter mit Beschriftung ohne Verb. Beim WebDAV-Laufwerk steht der Zustand nicht mehr doppelt unter „Stand“.
- **Herkunft aus Paketen überall gleich** (#1192): Mappentypen, Ansichten, Nummernkreise, Gleichbedeutende Wörter, Automatisierungen und Ablaufvorlagen zeigen hinter dem Namen einen Chip mit Paket-Symbol und Paketnamen (Tooltip mit Version), Mitgeliefertes „Ablago“ – kein „aus Paket“ ohne Namen und keine eigene Zeile mehr.

## Behoben

- **Kontrast** (#1210): Chip „gut“ im dunklen Design und die Aufgaben anderer im Hinweis „Zu erledigen“ erreichen jetzt mindestens 4,5:1.
