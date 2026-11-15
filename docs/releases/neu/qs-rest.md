art: minor

## Geändert

- **Tabelle: „Du siehst 3 von 7 …“** (#1208): Gibt es an einer Tabelle (etwa den Positionen einer Rechnung) Zeilen, die du nicht lesen darfst, steht darüber „Du siehst 3 von 7 Positionen. Die übrigen darfst du nicht sehen.“ – so wirkt eine Summe, die nicht zum Gesamtbetrag passt, nicht wie ein Fehler. Die Schnittstelle liefert dazu nur die Zahl (`verborgen` an `GET /api/v1/mappen/{id}/tabelle/{feld}`), keine Inhalte.
- **Handbuch: Wiederherstellen ohne Internet** (#1209): Neuer Abschnitt, was du für eine Wiederherstellung ohne Netz bereithalten musst (Sicherung mit `.json`, Schlüssel, Ablago-Image per `docker save`, Compose-Datei) und was danach von selbst passiert. Pakete müssen nach einer Wiederherstellung nicht neu installiert werden – ihr Code steckt in der Sicherung; der irreführende Hinweis dazu im Handbuch und in der Meldung des Paket-Läufers ist korrigiert.
