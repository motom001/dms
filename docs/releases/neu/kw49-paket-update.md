art: minor

## Neu

- **Paket-Update übernimmt Änderungen an Mappentypen** (#1658): Titel-Vorlage, Beschreibung, Mehrzahl und „Woran man ihn erkennt“, an Feldern Beschriftung, Hilfetext, Grenzen, Aus Dokument füllen, Übersetzungen und Auswahlwerte sowie die Reihenfolge der Felder im Register – je Teil, solange ihr ihn nicht selbst geändert habt (Prüfwert wie bei Ansichten). Was ihr geändert habt, bleibt; die Vorschau sagt es, „Trotzdem durch die Fassung im Paket ersetzen“ auf Wunsch.
- **Felder, die ein Paket nicht mehr mitbringt, entfallen** ohne Rückfrage und ohne Verlust: Werte wandern im Hintergrund in die Notiz der Mappe („Aus dem Update von „Finanzen“ 3.1.0: …“), am Mappentyp steht der Fortschritt; nach einem Neustart geht es weiter. Ein Umbau-Schritt in denselben Mappentyp benennt ein Feld um – dann ziehen die Werte ins neue Feld. „Feld behalten“ gibt es aufgeklappt; die Fassung vor dem Update bleibt zum Wiederherstellen.
- Schnittstelle: `typTeileErsetzen` und `felderBehalten` beim Installieren und Aktualisieren; `GET /api/werkbank/pakete/uebernahme`.
