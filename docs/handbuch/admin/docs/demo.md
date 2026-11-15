# Lasttest-Daten

Unter **Werkbank → Lasttest-Daten** (früher „Demo-Daten“) füllst du Ablago für Lasttests und Messungen mit vielen Mappen. Wer nur sehen will, wie eine gefüllte Ablage aussieht, nimmt die [Beispiel-Ablage](beispielablage.md).

--8<-- "ausgeblendet-alles.md"

![Lasttest-Daten](bilder/werkbank-demo.png)

## Beispiel-Mappentypen

**Beispiele laden** legt die Mappentypen *Vertragspartner*, *Vertrag*, *Rechnung* und *Zahlung* mit Feldern, Registern, Titel-Vorlagen und Trefferlisten an – dazu ein paar Mappen. Das ist ein guter Startpunkt, um eigene Mappentypen daran anzulehnen.

Das geht nur, solange es außer den Systemmappentypen *Benutzer*, *Rolle* und *Post* (und einem früheren [Ablageort](mappentypen.md#ablageort-wo-die-originale-liegen)) noch keine Mappentypen gibt. Gibt es einen Ablageort, bekommen *Vertrag* und *Rechnung* das Feld *Verbleib Originaldokumente*; dazu kommen ein paar Ablageorte (zu Hause › Arbeitszimmer Schrank › roter Ordner, Safe im Flur, beim Notar, vernichtet) und die Ansicht *Originale nach Ort*. In einer neuen Ablage gibt es keinen – die Beispiele kommen dann ohne dieses Feld.

## Lasttest-Mappen erzeugen

Erzeugt bis zu **50.000 Mappen je Durchlauf** für die vorhandenen Mappentypen – mit passenden Werten je Feld und Verweisen auf vorhandene Mappen. So lässt sich prüfen, wie sich Listen, Suche, Sortierung, Texterkennung, Speicherplatz und Sicherung mit vielen Mappen und Dokumenten verhalten. Mehrere Durchläufe hintereinander sind möglich; neue Mappen verweisen auch auf die schon vorhandenen.

Das läuft im Hintergrund; du kannst die Seite verlassen. Der Fortschritt steht auf dieser Seite – je Phase mit dem, was gezählt wird, z. B. „Mappen anlegen: 1.000 von 1.000 ✓ · Dokumente erzeugen: 1.326 von 1.907“. Die Zahl der Mappen entspricht deiner Eingabe. Nur wenn sich für einen Mappentyp keine passenden Werte erzeugen lassen, werden es weniger:

- **Schon vor dem Start** nennt die Abschätzung Mappentypen, die sich nicht erzeugen lassen, mit Anzahl und Grund – z. B. ein Pflicht-Passwort (Passwörter gibt es in Lasttest-Daten nie) oder ein Pflicht-Verweis, für den es keine Mappen des Zieltyps gibt und der Zieltyp im selben Lauf auch keine bekommt. Zieltypen, die selbst Lasttest-Mappen bekommen, legt Ablago zuerst an.
- **Sobald die Mappen angelegt sind**, zeigt der Fortschritt statt des Hakens z. B. „Mappen anlegen: 1.415 von 1.500 – 85 übersprungen“; unter *Warum wurden Mappen übersprungen?* stehen die Gründe je Mappentyp. Das kann auch ein eindeutiges Feld sein, dessen mögliche Werte vergeben sind.
- Das Ergebnis am Ende nennt die Gründe noch einmal.

Lasttest-Mappen sind gekennzeichnet. Die Systemmappentypen *Benutzer*, *Rolle* und *Post* bekommen keine Lasttest-Mappen.

### Startwert

Ein **Startwert** (z. B. `messung-1`) macht einen Lauf wiederholbar: Gleicher Startwert, gleiche Mappentypen und gleicher Ausgangsstand ergeben dieselben Werte und dieselben Dokumente. So lassen sich Messungen vor und nach einem Update vergleichen. Ohne Startwert wählt Ablago einen und nennt ihn im Ergebnis.

### Dokumente erzeugen

Mit **Dokumente erzeugen** bekommen die neuen Mappen auch Dokumente – nur Mappentypen mit Dokumentenregister. Alles stellst du mit **Schiebereglern** ein; die Zahl daneben zeigt den Wert. Die Regler lassen sich auch mit der Tastatur bedienen (Pfeiltasten in kleinen, Bild auf/ab in großen Schritten), unmögliche Werte lassen sich gar nicht erst einstellen:

- **Mappen mit Dokumenten:** 0 bis 100 %.
- **Dokumente je Mappe von … bis:** 1 bis 250. Die Stufen werden nach oben gröber (1, 2, 3, 4, 5, 7, 10, 15, 20, 30, 50, 75, 100, 150, 200, 250), damit kleine Werte gut einstellbar bleiben. Ziehst du „von“ über „bis“, geht „bis“ mit – und umgekehrt.
- **Gewollte Duplikate:** 0 bis 50 %.
- **Mischung** der Arten: fünf Regler, die zusammen **immer 100 %** ergeben. Bewegst du einen, passen sich die anderen im bisherigen Verhältnis an.

Die Arten:

| Art | Was | Wofür |
| --- | --- | --- |
| Brief/Rechnung | einseitiges PDF mit Briefkopf, Anschrift, Betreff, Positionen und Summe; die **Werte der Mappe** (z. B. Rechnungsnummer, Betrag, Vertragspartner) stehen im Text | Volltextsuche findet das Dokument über die Werte der Mappe |
| Mehrseitiges PDF | 2–50 Seiten (selten bis 300) mit Überschriften, Absätzen, Aufzählungen und Tabellen | Vorschau, Volltext langer Dokumente |
| „Gescanntes“ PDF | Seiten nur als Bild, leicht schief, ohne Textebene | Texterkennung unter Last |
| Bild | JPEG oder PNG, vom Bildschirmfoto bis zum Handyfoto (12 MP), teils Foto eines Belegs mit lesbarem Text | Vorschau, Texterkennung, Speicherplatz |
| Große Datei | PDF mit 20–100 MB | Hochladen, Vorschau, Export, Sicherung |

Die Vorlagen **leicht**, **realistisch** und **schwer** sind fertige Mischungen; bewegst du danach einen Regler, steht dort *eigene Mischung*. Jede Datei ist einzigartig. Ein Anteil **gewollter Duplikate** legt dieselbe Datei in mehrere Mappen – sie liegt dann nur einmal auf der Platte.

Vor dem Start steht eine **Abschätzung** auf der Seite und ändert sich beim Schieben sofort: Mappen, Dokumente, Seiten, Größe, Seiten für die Texterkennung und der freie Platz – z. B. „≈ 1.000 Mappen, ≈ 600 Dokumente mit ≈ 4.224 Seiten, zusammen ≈ 559 MB; ≈ 348 Seiten für die Texterkennung“. Bei sehr großen Mengen (ab etwa 20.000 Dokumenten oder 20 GB) warnt sie deutlich, denn das dauert auf einem NAS Stunden. Mehr als 250.000 Dokumente je Lauf sind nicht möglich – dann lieber mehrere Läufe. Reicht der Platz nicht – frei bleiben müssen der *Mindest-Speicherplatz* der [Sicherung](sicherung.md) und die Grenze unter [Systemzustand](speicherplatz.md) –, lässt sich der Lauf nicht starten. Wird der Platz während des Laufs knapp, hört er sauber auf und sagt das im Ergebnis.

!!! warning "Texterkennung braucht Zeit"
    Die Texterkennung vieler „gescannter“ PDFs und Bilder dauert auf einem NAS eher Tage als Stunden; sie läuft nach dem Erzeugen im Hintergrund weiter. Sicherungen werden entsprechend größer. Die Texterkennung übernimmt das Paket **Texterkennung** – ohne das Paket bleiben die „Scans“ ohne Text (siehe [Texterkennung](texterkennung.md)).

### Beobachten

Das Ergebnis jedes Laufs nennt Dauer, Anzahl, Größe, Seiten und Startwert (auch im [Protokoll](fehlersuche.md#protokoll)), damit Läufe vergleichbar sind. Wie sich Ablago dabei verhält, zeigen die vorhandenen Werkzeuge: **Werkbank → [Datenbank-Anbindung](installation.md#lange-datenbankzugriffe)** (lange Zugriffe), **Texterkennung** (Warteschlange), **Systemzustand** (Speicherplatz) und die Zeiten im Browser unter *Server-Timing*.

Damit du nebenher normal weiterarbeiten kannst, legt der Lauf nach jedem Dokument und jedem Paket Mappen eine kurze Pause ein und frischt danach die Statistik der Datenbank auf (`ANALYZE`). Er dauert dadurch etwas länger. Die Texterkennung läuft trotzdem parallel und braucht auf einem NAS viel Rechenzeit – einzelne lange Zugriffe unter **Werkbank → Datenbank-Anbindung** sind in dieser Zeit möglich.

## Entfernen

Unter dem Knopf steht je Mappentyp, wie viele Mappen es gibt und wie viele davon Lasttest-Mappen sind, mit Summe.

**Alle Lasttest-Mappen entfernen** löscht alle Lasttest-Mappen samt ihrer Dokumente – in Paketen zu je 1.000 mit Fortschritt, auch bei vielen Dateien. Echte Mappen bleiben unberührt. Verweist eine echte Mappe auf eine Lasttest-Mappe, wird nichts gelöscht – entferne dann zuerst diesen Verweis.

!!! tip "Ausprobieren ohne Risiko"
    Für Versuche mit größeren Änderungen an Mappentypen eignet sich eine zweite Installation mit eigener Datenbank besser als die echte.
