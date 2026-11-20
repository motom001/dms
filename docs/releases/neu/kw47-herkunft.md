art: patch

## Behoben

- **Erkennung: Rechnungssteller nie auch Rechnungsempfänger** (#1485): Eine Zeile wie „Lieferadresse: Lena Muster · Lindenweg 4 · …“ gilt nicht mehr als Absenderzeile; „an“ bekommt nie dieselbe Mappe wie „von“. Beim Übernehmen einer Post füllt Ablago „an“ nicht mehr aus dem Abgleich, und eine eben angelegte Organisation landet nur in dem Feld, aus dem heraus du sie angelegt hast.
- **Herkunft von Dokumenten aus Eingangskanälen** (#1489): Dokumente aus dem E-Mail-Abruf zeigen „per E-Mail · für Lena“ (Einstellung „für“ des Postfachs), aus dem Eingangsordner „aus dem Eingangsordner · für Jonas“ (Ordner der Person) statt „hochgeladen · unbekannt“. Ist niemand eingetragen, fällt der Teil weg. Gilt für neu eingehende Dokumente; bisherige bleiben „hochgeladen“. Neue Datenbank-Migration (eine Spalte).
- **Verlauf eines Pakets** (#1491): Einträge lassen sich aufklappen und zeigen den Ergebnistext des Laufs und die Mappe. Lehnt Ablago einen Schreibversuch des Pakets ab (z. B. 409, 404, 400), steht der Lauf als *Warnung* im Verlauf statt als *ok*.
