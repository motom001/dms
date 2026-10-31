# Demo-Daten

Unter **Werkbank → Demo-Daten** füllst du ein DMS zum Ausprobieren oder Testen mit Inhalt.

--8<-- "ausgeblendet-alles.md"

![Demo-Daten](bilder/werkbank-demo.png)

## Beispiel-Mappentypen

**Beispiele laden** legt die Mappentypen *Vertragspartner*, *Vertrag*, *Rechnung* und *Zahlung* mit Feldern, Registern, Titel-Vorlagen und Trefferlisten an – dazu ein paar Mappen. Das ist ein guter Startpunkt, um eigene Mappentypen daran anzulehnen.

Das geht nur, solange es außer den Systemmappentypen *Benutzer*, *Rolle* und *Post* noch keine Mappentypen gibt.

## Demo-Mappen erzeugen

Erzeugt bis zu **50.000 Mappen je Durchlauf** für die vorhandenen Mappentypen – mit passenden Werten je Feld und Verweisen auf vorhandene Mappen. So lässt sich prüfen, wie sich Listen, Suche, Sortierung, Texterkennung, Speicherplatz und Sicherung mit vielen Mappen und Dokumenten verhalten. Mehrere Durchläufe hintereinander sind möglich; neue Mappen verweisen auch auf die schon vorhandenen.

Das läuft im Hintergrund; du kannst die Seite verlassen. Der Fortschritt steht auf dieser Seite.

Demo-Mappen sind gekennzeichnet. Die Systemmappentypen *Benutzer*, *Rolle* und *Post* bekommen keine Demo-Mappen.

### Startwert

Ein **Startwert** (z. B. `messung-1`) macht einen Lauf wiederholbar: Gleicher Startwert, gleiche Mappentypen und gleicher Ausgangsstand ergeben dieselben Werte und dieselben Dokumente. So lassen sich Messungen vor und nach einem Update vergleichen. Ohne Startwert wählt das DMS einen und nennt ihn im Ergebnis.

### Dokumente erzeugen

Mit **Dokumente erzeugen** bekommen die neuen Mappen auch Dokumente – nur Mappentypen mit Dokumentenregister. Einstellbar sind der Anteil der Mappen mit Dokumenten, wie viele Dokumente je Mappe (z. B. 1 bis 3) und die **Mischung** der Arten:

| Art | Was | Wofür |
| --- | --- | --- |
| Brief/Rechnung | einseitiges PDF mit Briefkopf, Anschrift, Betreff, Positionen und Summe; die **Werte der Mappe** (z. B. Rechnungsnummer, Betrag, Vertragspartner) stehen im Text | Volltextsuche findet das Dokument über die Werte der Mappe |
| Mehrseitiges PDF | 2–50 Seiten (selten bis 300) mit Überschriften, Absätzen, Aufzählungen und Tabellen | Vorschau, Volltext langer Dokumente |
| „Gescanntes“ PDF | Seiten nur als Bild, leicht schief, ohne Textebene | Texterkennung unter Last |
| Bild | JPEG oder PNG, vom Bildschirmfoto bis zum Handyfoto (12 MP), teils Foto eines Belegs mit lesbarem Text | Vorschau, Texterkennung, Speicherplatz |
| Große Datei | PDF mit 20–100 MB | Hochladen, Vorschau, Export, Sicherung |

Die drei Stufen **leicht**, **realistisch** und **schwer** sind fertige Mischungen; jede Art lässt sich auch einzeln einstellen. Jede Datei ist einzigartig. Ein Anteil **gewollter Duplikate** legt dieselbe Datei in mehrere Mappen – sie liegt dann nur einmal auf der Platte.

Vor dem Start steht eine **Abschätzung** auf der Seite: Mappen, Dokumente, Seiten, Größe, Seiten für die Texterkennung und der freie Platz. Reicht der Platz nicht – frei bleiben müssen der *Mindest-Speicherplatz* der [Sicherung](sicherung.md) und die Grenze unter [Speicherplatz](speicherplatz.md) –, lässt sich der Lauf nicht starten. Wird der Platz während des Laufs knapp, hört er sauber auf und sagt das im Ergebnis.

!!! warning "Texterkennung braucht Zeit"
    Die Texterkennung vieler „gescannter“ PDFs und Bilder dauert auf einem NAS eher Tage als Stunden; sie läuft nach dem Erzeugen im Hintergrund weiter. Sicherungen werden entsprechend größer.

### Beobachten

Das Ergebnis jedes Laufs nennt Dauer, Anzahl, Größe, Seiten und Startwert (auch im [Protokoll](fehlersuche.md#protokoll)), damit Läufe vergleichbar sind. Wie sich das DMS dabei verhält, zeigen die vorhandenen Werkzeuge: **Werkbank → Datenbank** (lange Zugriffe), **Texterkennung** (Warteschlange), **Speicherplatz** und die Zeiten im Browser unter *Server-Timing*.

## Entfernen

**Alle Demo-Mappen entfernen** löscht alle Demo-Mappen samt ihrer Dokumente – in Paketen zu je 1.000 mit Fortschritt, auch bei vielen Dateien. Echte Mappen bleiben unberührt. Verweist eine echte Mappe auf eine Demo-Mappe, wird nichts gelöscht – entferne dann zuerst diesen Verweis.

!!! tip "Ausprobieren ohne Risiko"
    Für Versuche mit größeren Änderungen an Mappentypen eignet sich eine zweite Installation mit eigener Datenbank besser als die echte.
