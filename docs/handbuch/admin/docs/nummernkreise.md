# Nummernkreise

Ein Nummernkreis vergibt fortlaufende Nummern, z. B. Rechnungsnummern wie `202610-R0000001`. Du legst ihn unter **Werkbank → Nummernkreise** an und nutzt ihn in einem Textfeld eines Mappentyps.

Das Suchfeld über der Liste sucht in Name, Kennung und Muster, im Mappentyp und Feld, die den Kreis nutzen, und im Namen des Pakets ([Suchen und filtern](uebersicht.md#suchen-und-filtern)). Nummernkreise selbst gehören nicht zu einem Paket: Der Filter **Paket** ordnet einen Kreis dem Paket des Mappentyps zu, dessen Feld ihn nutzt; ohne solches Feld zählt er zu den eigenen.

--8<-- "ausgeblendet-organisation.md"

## Aufbau des Editors { #aufbau-des-editors }

Ein gespeicherter Nummernkreis ist rechts wie ein [Mappentyp](mappentypen.md#aufbau-des-editors) gegliedert: oben die **Sprungleiste** mit **Alle aufklappen / Alle zuklappen**, darunter die Bereiche **Grunddaten → Stand → Aufkleber drucken** (nur bei der Archivnummer) **→ Verwendet in**. Eingeklappt zeigt jeder Bereich eine Kurzinfo, etwa das Muster oder die nächste Nummer; was du aufklappst, merkt sich dein Gerät. Ein neuer Nummernkreis hat nur die Grunddaten – ohne Sprungleiste.

Gespeichert wird nur, was in den Grunddaten steht (**Nummernkreis speichern** unten); ein Fehler im Muster markiert die Grunddaten rot. **Zählerstand setzen** und **Aufkleber als PDF** wirken sofort.

![Der Nummernkreis „Archivnummer“ am Handy](bilder/werkbank-nummernkreis-handy.png){ width="320" }

## Anlegen

| Angabe | Bedeutung |
| --- | --- |
| **Name** | z. B. „Rechnungsnummern“ |
| **Kennung** | z. B. `rechnungsnummer`; nach dem Anlegen fest |
| **Muster** | Text mit Platzhaltern, z. B. `{jjjj}{mm}-R{zaehler:7}` |
| **Startwert** | erster Zähler eines Zeitraums, meist 1 oder 0 |

Platzhalter im Muster:

| Platzhalter | wird zu |
| --- | --- |
| `{jjjj}` / `{jj}` | Jahr, vierstellig / zweistellig |
| `{mm}` | Monat, zweistellig |
| `{tt}` | Tag, zweistellig |
| `{zaehler}` | Zähler, so lang wie nötig |
| `{zaehler:7}` | Zähler mit führenden Nullen auf 7 Stellen |

Alles andere bleibt stehen. Das Datum ist der Tag, an dem die Nummer vergeben wird (Zeitzone Europe/Berlin).

**Wann der Zähler neu beginnt**, ergibt sich aus dem Muster: mit `{tt}` täglich, mit `{mm}` monatlich, mit `{jjjj}` oder `{jj}` jährlich, ohne Datum nie. Jeder Zeitraum hat seinen eigenen Zählerstand.

Ein geändertes Muster gilt nur für neue Nummern. Die Zählerstände gehören zur [Sicherung](sicherung.md).

## Im Mappentyp verwenden

Trage im **Standardwert** eines Textfelds `{nummernkreis:rechnungsnummer}` ein. Dann:

- bekommt jede neue Mappe beim **ersten Speichern** die nächste Nummer – auch über die [Schnittstelle](api.md). Beim Anlegen zeigt das Formular „Wird beim Speichern vergeben“.
- ist das Feld **schreibgeschützt**: Niemand kann die Nummer ändern, auch nicht über die Schnittstelle.
- verbraucht ein Speichern, das scheitert (z. B. weil ein Pflichtfeld fehlt), keine Nummer. Gleichzeitiges Speichern ergibt nie dieselbe Nummer.
- behält eine gelöschte Mappe ihre Nummer, auch im Papierkorb; sie wird nicht neu vergeben.

**Eindeutig** am Feld schadet nicht und ist eine zusätzliche Absicherung.

## Stand und Zählerstand

Im Bereich *Stand* stehen die **nächste Nummer** und die zuletzt vergebenen Nummern, unter *Verwendet in* die Felder, die ihn verwenden. Mit **Zählerstand setzen** legst du den Zähler der nächsten Nummer im aktuellen Zeitraum fest – etwa beim Umstieg aus einem anderen Programm. Das steht im [Protokoll](fehlersuche.md#protokoll).

Löschen geht nur, wenn kein Feld den Nummernkreis mehr verwendet.

## Nummern nachträglich vergeben

Mappen, die es schon gab, bevor das Feld den Nummernkreis bekam, haben keine Nummer. Unter **Werkbank → Wartung → Wartungsoperationen → Nummern nachträglich vergeben** wählst du das Feld; Ablago zeigt, wie viele Mappen betroffen sind und welche Nummern entstehen (von … bis …), und vergibt sie dann in der Reihenfolge des Anlegens. Als Datum gilt der heutige Tag. Die Arbeit läuft im Hintergrund und steht im Protokoll.

## Archivnummern und Aufkleber

Den Nummernkreis **Archivnummer** gibt es in jeder Ablago-Installation. Er vergibt die Nummern für Aufkleber auf Papieroriginalen (Muster am Anfang `A-{zaehler:6}`, also `A-000001`). Wie Benutzer die Nummer am Dokument eintragen und wiederfinden, steht im Benutzerhandbuch unter *Dokumente → Archivnummer*.

Unter **Werkbank → Nummernkreise → Archivnummer → Aufkleber drucken**:

1. **Anzahl** (bis 500).
2. **Etikettenformat** (A4): 48,5 × 25,4 mm (40 je Bogen), 38,1 × 21,2 mm (65 je Bogen) oder 70 × 37 mm (24 je Bogen).
3. **Beginnen bei Feld** – für einen angebrochenen Bogen: 1 ist oben links, gezählt wird zeilenweise.
4. **Aufkleber als PDF** lädt die Datei herunter.

![Aufkleber drucken](bilder/werkbank-aufkleber.png)

Jeder Aufkleber trägt einen **Barcode (Code 128)** mit `DMS-ASN:` vor der Nummer und darunter die Nummer zum Lesen. Drucke mit **100 %**, nicht „an Seite anpassen“, sonst passen die Aufkleber nicht auf die Felder.

**Gedruckte Nummern gelten als vergeben** – auch wenn du den Bogen nicht benutzt. Der Kreis zählt einfach weiter; Lücken sind kein Problem. Muster und Startwert darfst du ändern (z. B. `ASN-{jjjj}-{zaehler:4}`); löschen lässt sich dieser Nummernkreis nicht.

Im Protokoll steht, wer wann welche Nummern erzeugt hat.
