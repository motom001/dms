# Dokumente

Dokumente liegen in den **Dokumentenregistern** einer Mappe – beim Vertrag zum Beispiel unter „Vertragsunterlagen“.

![Dokumente einer Mappe](bilder/dokumente.png)

## Hochladen

1. Öffne die Mappe und das Dokumentenregister.
2. Zieh Dateien in das Feld **Dateien hierher ziehen** oder klicke auf **auswählen**.
3. Die Dateien stehen nun mit dem Hinweis „wird beim Speichern hochgeladen“ in der Liste.
4. Klicke auf **Mappe speichern**.

Erst beim Speichern werden die Dateien hochgeladen – genau wie die übrigen Angaben. Verwirfst du die Änderungen, wird auch nichts hochgeladen.

Eine Datei darf bis zu 100 MB groß sein.

!!! tip "Darf das Papier jetzt weg?"
    Was du nach dem Einscannen vernichten darfst und was du besser im Original behältst: [Original behalten oder vernichten?](original.md)

!!! tip "Gleiche Datei schon abgelegt?"
    Liegt genau diese Datei schon in einer anderen Mappe, die du sehen darfst, steht das **sofort** an der neuen Datei – noch vor dem Speichern: „Diese Datei liegt schon in *Stromvertrag Haus* (Vertrag, Register Dokumente, „Scan.pdf“, hochgeladen am …)“, mit Link dorthin. Du entscheidest: **Mappe speichern** legt sie trotzdem ab, **Nicht hochladen** lässt sie weg, der Link führt zur vorhandenen Mappe. Gespeichert wird der Inhalt in jedem Fall nur einmal.

    Das DMS vergleicht den **Prüfwert** der Datei – nur exakt gleiche Dateien zählen, nicht ein zweiter Scan desselben Briefs. Liegt die Datei nur in Mappen, die du nicht sehen darfst, gibt es keinen Hinweis: Das DMS verrät nichts über Mappen, die dir verborgen sind.

## Ansehen und herunterladen

Neben jedem PDF und Bild (JPEG, PNG) steht ein **kleines Vorschaubild der ersten Seite**. So erkennst du auch bei nichtssagenden Namen wie „Scan_2026-10-12.pdf“ oder „IMG_4711.jpg“ auf einen Blick, welches die Rechnung und welches das Foto des Zählers ist. Das Bild entsteht kurz nach dem Hochladen im Hintergrund; bis dahin – und bei anderen Dateien wie Word oder Excel – steht dort die Dateiendung. Das Vorschaubild sieht nur, wer auch das Dokument sehen darf. Auch beim **Zuordnen einer Post** stehen die Vorschaubilder neben den Dokumenten.

- **PDFs und Bilder:** Ein Klick irgendwo auf die Zeile zeigt das Dokument **direkt darunter** an, ein zweiter Klick schließt es. Es ist immer nur ein Dokument offen. Per Tastatur: mit Tab auf den Namen, dann Enter. Das Symbol **↗** öffnet es in einem neuen Browser-Tab.
- **Alle anderen Dateien** (z. B. Word, Excel) lassen sich nur herunterladen und dann in ihrem Programm öffnen.

**Herunterladen** speichert jede Datei unverändert auf deinem Gerät. Neben jedem Dokument steht, wie groß es ist und wer es wann hochgeladen hat.

![Dokument direkt unter seiner Zeile](bilder/dokumente.png)

## Sortieren

Über der Liste wählst du die Reihenfolge: **Name A–Z** (Standard), **Name Z–A**, **Neueste zuerst**, **Älteste zuerst** (nach dem Hochladen) oder **Größte zuerst**. Namen werden „natürlich“ sortiert – „Rechnung 2“ vor „Rechnung 10“, ohne Rücksicht auf Groß- und Kleinschreibung. Die Wahl gilt für alle Dokumentenregister und für dich auf allen Geräten. Noch nicht gespeicherte Dateien stehen immer oben.

## Mehrere auf einmal

Jede Zeile hat ein Kästchen; **Alle auswählen** über der Liste wählt alle (und wieder ab). Mit **Umschalt + Klick** wählst du einen ganzen Bereich. Für die Auswahl gibt es dann:

- **Herunterladen** – lädt die Dokumente nacheinander unter ihrem Namen herunter. Beim ersten Mal fragt der Browser womöglich, ob die Seite mehrere Dateien herunterladen darf – erlaube es.
- **Löschen** – markiert sie zum Löschen, wie beim einzelnen Dokument (siehe unten).

Die Auswahl gilt nur für das Register, in dem du gerade bist.

## Volltext

Damit die [Volltextsuche](ablage.md#im-text-der-dokumente-suchen) ein Dokument findet, liest das DMS nach dem Hochladen im Hintergrund seinen Text: bei PDFs die Textebene, bei Scans und Fotos per Texterkennung. Neben dem Dokument steht, wie weit es ist:

| Anzeige | Bedeutung |
| --- | --- |
| *Volltext: wartet* / *läuft* | Der Text wird gerade gelesen; meist dauert das Sekunden, bei langen Scans einige Minuten. |
| *Volltext: fertig* | Das Dokument ist durchsuchbar. **Text anzeigen** zeigt, was erkannt wurde. |
| *Volltext: Fehler* | Etwas ging schief, z. B. eine beschädigte Datei. **Erneut versuchen** stellt es noch einmal an. |
| *Volltext: ausgelassen* | Für diesen Dateityp (z. B. Word, Excel) oder diese Größe gibt es keinen Volltext. |

Erkannter Text aus Scans ist nicht immer fehlerfrei – je besser die Vorlage, desto besser das Ergebnis.

## Versionen

Warum du im DMS nichts mehr in `_v2` oder `_final` umbenennen musst, erklärt mit Bildern die Seite [Versionen verstehen](versionen.md). Kurz:

Ist an einem Dokumentenregister die **Versionierung** eingeschaltet (das macht ein Administrator), bleibt beim Ersetzen die alte Fassung erhalten:

- **Ersetzen** neben einem Dokument lädt eine neue Datei als **neue Version** hoch – sofort, ohne „Mappe speichern“. Name und Dateityp dürfen sich ändern, z. B. `Kassenbon.jpg` → `Kassenbon.pdf`. Die Mappe zeigt danach nur die neueste Version.
- Am Dokument steht **Version 3**. Ein Klick darauf zeigt alle Versionen mit Datum, wer sie gespeichert hat, Herkunft, Dateiname und Größe. Jede ältere Version lässt sich ansehen (↗) und herunterladen.
- **Zurückholen** übernimmt eine ältere Version als neue, höchste Version – aus Version 1 wird z. B. Version 4. Die bisherigen Versionen bleiben dabei stehen.
- Die Volltextsuche findet nur die aktuelle Version.
- Hat der Administrator **nur die letzten … Versionen behalten** eingestellt, löscht das DMS ältere Versionen darüber hinaus von selbst – sie lassen sich dann nicht mehr zurückholen.
- In der Historie der Mappe steht jede neue Version, z. B. „Version 3 (ersetzt Kassenbon.jpg)“ oder „Version 1 zurückgeholt“.

**Gleicher Dateiname beim Hochladen:** Gibt es im Register schon ein Dokument mit demselben Namen, fragt das DMS in der Liste nach:

- mit Versionierung: **als neue Version** speichern (vorausgewählt) oder **als eigenes Dokument mit Zähler**, z. B. `Rechnung (2).pdf`
- ohne Versionierung: **als eigenes Dokument mit Zähler** (vorausgewählt) oder **altes Dokument löschen und neues hochladen** – das Löschen ist endgültig

## Entfernen

Ein Klick auf **Löschen** neben einem Dokument markiert es mit „wird beim Speichern gelöscht“. Erst **Mappe speichern** löscht es; **Behalten** oder **Änderungen verwerfen** holt es zurück. Noch nicht gespeicherte Dateien nimmst du mit **Nicht hochladen** wieder aus der Liste.

Ein einzeln gelöschtes Dokument ist sofort endgültig weg – mit allen seinen Versionen; hat es ältere Versionen, fragt das DMS vorher nach und nennt ihre Zahl. Löschst du eine ganze Mappe, kommen ihre Dokumente mit ihr in den [Papierkorb](ablage.md#papierkorb).
