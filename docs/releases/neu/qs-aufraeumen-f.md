art: patch

## Verbessert

- **Lasttest-Seite: Formular mit dem kurzen Block** (#1452): Der Knopf „Formular ‚Messergebnis Lasttest‘“ kopiert vor dem Öffnen nur den Block bis einschließlich der schließenden Zeile ```` ``` ```` und meldet „Block kopiert – im Formular einfügen“. Ein Feld im Formular fasst höchstens 65.536 Zeichen, ein ganzer Lauf mit `alle` hat etwa 121.000. „Kopieren“ nimmt weiter alles mit; über `http://` gilt derselbe Ausweichweg.
- **Löschkonzept**: Für die Frist der Historie endgültig gelöschter Mappen nennt es jetzt den richtigen Weg „Werkbank → Daten sichern → Einstellungen“ statt „Werkbank → Papierkorb“.

## Behoben

- **Erwähnung einer gelöschten Person**: In Notizen, der Historie und der Anzeige ohne Bearbeiten stand für eine gelöschte Person in der alten Schreibweise nur „@“. Jetzt steht dort „@gelöschter Benutzer“, wie in der Trefferliste.
- **Offene Dateien** (#1456): Beim Abruf einer älteren Version zur Weitergabe und beim Versand von Mappen per E-Mail (auch wenn er scheitert) blieben Dateien offen, bis die Speicherbereinigung sie schloss. Unter Node 26 wäre das ein Fehler.
