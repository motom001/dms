art: patch

## Verbessert

- **Lasttest-Seite: Formular mit dem kurzen Block** (#1452): Der Knopf „Formular ‚Messergebnis Lasttest‘“ kopiert vor dem Öffnen nur den Block bis einschließlich der schließenden Zeile ```` ``` ```` und meldet „Block kopiert – im Formular einfügen“. Ein Feld im Formular fasst höchstens 65.536 Zeichen, ein ganzer Lauf mit `alle` hat etwa 121.000. „Kopieren“ nimmt weiter alles mit; über `http://` gilt derselbe Ausweichweg.
- **Löschkonzept**: Es nennt die richtigen Wege – die Frist der Historie endgültig gelöschter Mappen und die Aufbewahrung im Papierkorb stellt man unter „Werkbank → Daten sichern → Einstellungen“ ein, das Löschprotokoll steht unter „Werkbank → Löschprotokoll“.

## Behoben

- **Erwähnung einer gelöschten Person**: In Notizen, der Historie und der Anzeige ohne Bearbeiten stand für eine gelöschte Person in der alten Schreibweise nur „@“, in der Vorschau eines bearbeitbaren Felds „@gelöschte Mappe“. Jetzt steht überall „@gelöschter Benutzer“, wie in der Trefferliste.
- **Auskunft herunterladen**: Eine HEAD-Anfrage auf die ZIP einer Datenschutz-Auskunft las die Datei und löschte sie, als wäre sie heruntergeladen. Jetzt zählt nur ein Download, der ganz beim Empfänger angekommen ist; HEAD liefert nur die Köpfe.
- **Offene Dateien** (#1456): Beim Abruf einer älteren Version zur Weitergabe und beim Versand von Mappen per E-Mail (auch wenn er scheitert) blieben Dateien offen, bis die Speicherbereinigung sie schloss. Unter Node 26 wäre das ein Fehler.
