# Nummernkreise

Ein Nummernkreis vergibt fortlaufende Nummern, z. B. Rechnungsnummern wie `202610-R0000001`. Du legst ihn unter **Werkbank → Nummernkreise** an und nutzt ihn in einem Textfeld eines Mappentyps.

## Anlegen

| Angabe | Bedeutung |
| --- | --- |
| **Name** | z. B. „Rechnungsnummern“ |
| **Schlüssel** | z. B. `rechnungsnummer`; nach dem Anlegen fest |
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

Beim Nummernkreis stehen die **nächste Nummer**, die zuletzt vergebenen Nummern und die Felder, die ihn verwenden. Mit **Zählerstand setzen** legst du den Zähler der nächsten Nummer im aktuellen Zeitraum fest – etwa beim Umstieg aus einem anderen Programm. Das steht im [Protokoll](fehlersuche.md#protokoll).

Löschen geht nur, wenn kein Feld den Nummernkreis mehr verwendet.

## Nummern nachträglich vergeben

Mappen, die es schon gab, bevor das Feld den Nummernkreis bekam, haben keine Nummer. Unter **Werkbank → Wartungsoperationen → Nummern nachträglich vergeben** wählst du das Feld; das DMS zeigt, wie viele Mappen betroffen sind und welche Nummern entstehen (von … bis …), und vergibt sie dann in der Reihenfolge des Anlegens. Als Datum gilt der heutige Tag. Die Arbeit läuft im Hintergrund und steht im Protokoll.
