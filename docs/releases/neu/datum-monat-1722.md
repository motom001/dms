art: minor

## Neu

- **Datumsfelder nur mit Monat** (#1722): Ein Paket kann ein Datumsfeld auf Monat und Jahr stellen (`genauigkeit: monat`) – etwa für die nächste HU, das Ablaufdatum einer Karte oder eine Garantie „bis März 2027“. Eingegeben wird „04/2028“, angezeigt „04/2028“, gespeichert der letzte Tag des Monats; Fristen, Erinnerungen, Kalender, Filter und Sortierung enden so am Monatsende. „Aus Dokument füllen“ liest für solche Felder „April 2028“, „Apr. 2028“, „04/2028“, „04.2028“ und hinter den Erkennungswörtern eines Pakets auch „042028“. Alle anderen Datumsfelder bleiben tagesgenau und nehmen keinen bloßen Monat an.
