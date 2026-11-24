art: minor

## Neu

- **Mappentypen als Datei** (#1315): Unter Werkbank → Mappentypen → „Als Datei“ lassen sich eigene Mappentypen ohne Paket exportieren und in einer anderen Installation einspielen – mit Vorschau der Inhalte beim Export und Vorschau „neu / gibt es schon / was sich ändert“ beim Einspielen. Die Datei bringt keine Mappen, Dokumente, Personen oder Rechte mit; vorhandene Typen werden nie abgeschwächt, Typen aus Paketen nie geändert.

## Verbessert

- **Sicherung als eine Datei** (#1611): Eine heruntergeladene Sicherung lässt sich auf einem neuen Gerät ohne die Metadaten-Datei (.json) daneben einspielen. Getrennt aufbewahren muss man nur den Schlüssel vom Notfallblatt. Das bisherige Paar aus Sicherung und .json lässt sich weiter einspielen.
- **Vollexport öffnet unter Windows** (#1506): Jeder Pfad in der ZIP ist höchstens 200 Bytes lang; gekürzt werden zuerst Dokumentnamen, dann Mappentitel, die Kennung bleibt. Gilt auch für „Meine Daten exportieren“ und die Auskunft nach Art. 15.
- **Hinweis bei „ungültig“ unter Windows** (#1505): LIESMICH.md im Export, das Handbuch und die Werkbank erklären, was zu tun ist, wenn Windows eine ZIP als ungültig meldet.
- **Prüfmuster ohne Rechenfalle**: Muster an Textfeldern dürfen höchstens 200 Zeichen lang sein und keine verschachtelten Wiederholungen wie `(a+)+` enthalten – im Editor, aus Paketen und aus Mappentypen-Dateien.
