art: minor

## Geändert

- **Tabelle: „Du siehst 3 von 7 …“** (#1208): Gibt es an einer Tabelle (etwa den Positionen einer Rechnung) Zeilen, die du nicht lesen darfst, steht darüber „Du siehst 3 von 7 Positionen. Die übrigen darfst du nicht sehen.“ – so wirkt eine Summe, die nicht zum Gesamtbetrag passt, nicht wie ein Fehler. Die Schnittstelle liefert dazu nur die Zahl (`verborgen` an `GET /api/v1/mappen/{id}/tabelle/{feld}`), keine Inhalte.
