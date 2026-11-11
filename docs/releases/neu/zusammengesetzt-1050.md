art: minor

## Neu

- **Feldart „Zusammengesetzt“** (#1050): Ein Feld setzt sich aus anderen Feldern der Mappe zusammen – mit einer Vorlage wie die Titel-Vorlage, z. B. `{von} · {rechnungsnummer}`. Ablago setzt den Wert beim Speichern, die Mappe zeigt ihn nur an („setzt sich zusammen aus …“) und ändert ihn sofort mit seinen Teilen. Eindeutig verhindert es Doppelte über eine Kombination, etwa Rechnungsnummer je Absender; die Meldung steht am ersten beteiligten Feld. Verweise zählen über die Mappe selbst, nicht über ihren Namen, und gespeichert wird nie der Titel einer verwiesenen Mappe. Ändert sich die Vorlage, rechnet Ablago alle Mappen neu und fragt vorher, wenn danach Mappen dieselbe Kombination hätten. Nutzbar in Spalten, Bedingungen, Suche, „Zum Wiederfinden nutzen“, Export, Vollexport, Paketen und der Schnittstelle (nur lesen).
