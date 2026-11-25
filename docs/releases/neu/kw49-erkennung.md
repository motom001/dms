art: minor

## Neu

- **Zeitraum aus zwei Daten** (#1646): Steht im Dokument „vom 01.07.2012 – 31.07.2012“ (auch mit Zeilenumbruch), „01.01.2025 bis 31.12.2025“ oder „Zeitraum 01.07. - 31.07.2012“, bekommt *Von* das erste und *Bis* das zweite Datum – vorher bekamen beide dasselbe. Welche Datumsfelder zusammengehören, erkennt Ablago an den Namen (Beginn/Ende, Von/Bis, Mietbeginn/Mietende …); am Feld für das Ende lässt es sich unter „Ende des Zeitraums ab“ einstellen.
- **Verweis aus einem Datum ableiten** (#1648): Am Verweisfeld unter „Aus Datum ableiten“, z. B. Steuerjahr aus *Bis*. Gibt es genau ein passendes Steuerjahr, steht es als Vorschlag im Feld (mit „Zurücknehmen“); gibt es keins, bietet Ablago an, es anzulegen – nichts geschieht ohne Klick. Wirkt beim Anlegen aus Post und beim Ändern des Datums, solange das Feld nicht von Hand gesetzt ist. In Paketen: `ausDatum: { datumFeld, zielFeld }`.
- **Wie sicher ist Ablago?** (#1645): Unter den Vorschlägen bei „Wohin gehört das?“ aufklappbar – die besten Mappentypen mit „sicher“, „wahrscheinlich“ oder „unsicher“, auf Wunsch in Prozent mit der Schwelle, und je Typ, was dafür sprach und was fehlte (keine Überschrift, kein bekanntes Konto im Dokument, „Woran man ihn erkennt“ passt kaum). Die Schwelle ist im Expertenmodus unter Werkbank → Pakete → Text aus PDF und Texterkennung einstellbar (Vorgabe wie bisher 30 %).

## Geändert

- **„Woran man ihn erkennt“** steht im Mappentyp jetzt im Bereich *Erkennung* statt in den *Grunddaten* (#1645).

## Behoben

- **Rechnungsnummer direkt hinter „Rechnung“** (#1657): „Rechnung R-2026-1120“, „Rechnung Nr. 4711“ oder „Invoice INV-123“ füllen jetzt das Feld Rechnungsnummer – auch mit gleichbedeutenden Wörtern aus der Werkbank („Beleg-Nr.“). Datum, IBAN und Betrag gelten nie als Nummer. Fehlt die Nummer, beginnt der Titel nicht mehr mit „:“ und hat kein Leerzeichen mehr vor dem Doppelpunkt.
