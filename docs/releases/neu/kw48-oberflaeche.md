art: minor

## Neu

- **Datumsfeld mit Kalenderwoche überall** (#1532): Auch Werkbank (u. a. Löschprotokoll, Auskunft, Feldeinstellungen, Bedingungen einer Ansicht, Paket-Einstellungen) und Profil (API-Schlüssel, Abwesenheit) nutzen das Datumsfeld mit Kalender und Kalenderwochen. Der Kalender öffnet nach derselben Regel wie die Menüs: unten, wenn Platz ist, sonst oben, nie über dem Assistenten.
- **Symbolauswahl findet auch gleichbedeutende Wörter** (#1548): Steht in der Werkbank „Kfz, Auto“, findet „Kfz“ in der Symbolauswahl einer Ansicht das Auto.
- **Hinweis bei Anmeldung mit MD5** (#1612): Meldet sich Ablago noch mit MD5 an PostgreSQL an, weisen Übersicht und Systemzustand darauf hin und verlinken die Anleitung zur Umstellung auf SCRAM.
- **Neues im Hintergrund-Tab** (#922): Gibt es etwas zu erledigen oder neue Post, steht die Zahl vorn im Titel des Tabs, z. B. „(3) Ablago – Ablage“, und das Symbol trägt einen Punkt – nur Zahlen, keine Inhalte.
- **Zahlen der Werkbank sofort** (#1585): Tipps, Automatisierungen, Vorlagen, Stempel, Auskünfte, gleichbedeutende Wörter und Anmeldeschutz zeigen ihre Zahl links, ohne dass man den Bereich vorher öffnet.

## Behoben

- **Assistent verdeckt keine Spalte mehr** (#1590, #1602): In Ablage und Werkbank reichen die Spalten bis unten; der Freiraum für den Assistenten liegt am Ende jeder Spalte, die Speicherleiste lässt rechts Platz. Der leere Bereich unter dem Systemzustand ist weg.
- **Knöpfe einer Zeile gleich hoch** (#1589): Hauptknopf, ⋯-Knopf und Auswahl stehen gleich hoch.
- **Werkbank → Aufgaben** (#1605): Die Auswahl „Benutzer wählen“ ist wieder einzeilig; die Auswahl je Zeile der Liste entfällt – einzeln rechts weitergeben, mehrere über Ankreuzen.
- **Sprungleiste im Editor** (#1604): Sie klebt bündig oben, ein Sprung setzt die Überschrift direkt darunter.
- **Kalender am rechten Rand** (#1556): Er öffnet rechtsbündig mit dem Feld statt über den Bildschirmrand.
- **Betrag mit zwei Nachkommastellen** (#1608): Im Formular steht „12,50“ statt „12,5“, auch nach dem Verlassen des Felds.
