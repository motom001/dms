# Sichten und Listen

## Sichten

Links stehen die **Sichten**. Ganz oben der [Eingang](eingang.md), deine [Favoriten](#favoriten) und der [Papierkorb](#papierkorb), darunter die Sichten, die ein Administrator eingerichtet hat – zum Beispiel *Vertrag*, *Rechnung*, *Vertragspartner* oder *Kündigung in den nächsten 12 Monaten*. Die Zahl dahinter sagt, wie viele Mappen die Sicht gerade zeigt.

Ein Klick auf eine Sicht zeigt ihre Mappen in der Liste. Welche Sichten du siehst, kann ein Administrator festlegen; eine Sicht, die für dich verborgen ist, fehlt samt ihrer Mappen auch in der Elternsicht. Mappen findest du trotzdem über die Suche, wenn du sie lesen darfst.

![Sichten als Baum: Finanzen mit Untersichten](bilder/sichten-baum.png)

- **Sichten können Untersichten haben.** Ein Pfeil ▸ davor zeigt das; ein Klick darauf klappt sie auf oder zu. Dein Gerät merkt sich, was zugeklappt ist.
- **Eine Sicht mit Untersichten zeigt alles zusammen:** *Finanzen* zeigt zum Beispiel alle offenen Rechnungen *und* die Zahlungen dieses Jahres.
- **Manche Sichten filtern:** *Offene Rechnungen* zeigt nur Rechnungen, die noch nicht bezahlt sind. Werte wie „heute“ oder „du selbst“ rechnet das DMS bei jedem Öffnen neu – eine Sicht *Kündigung in den nächsten 12 Monaten* ist also immer aktuell.
- **Zeigt eine Sicht mehrere Mappentypen**, stehen *Titel* und *Typ* vorn, und es gibt kein **+ Neu**. Neue Mappen legst du dann in der Sicht des einzelnen Typs an.

Welche Sichten es gibt, legt ein Administrator fest. Wünschst du dir eine, sag ihm Bescheid.

## Die Liste

Die Liste zeigt die Mappen der Sicht, nach Titel sortiert. Sie lädt zunächst 100 Mappen und beim Herunterscrollen automatisch die nächsten.

Mit **+ Neu** oben rechts legst du eine neue Mappe dieses Typs an (siehe [Mappen](mappen.md)). Fehlt der Knopf, dürfen von diesem Typ in der Ablage keine Mappen angelegt werden – bei *Benutzer* zum Beispiel ist das so.

### Kompakt oder als Tabelle

Wie die Liste aussieht, hängt von ihrer Breite ab:

- **Schmal:** Jede Mappe ist ein kompakter Eintrag – die erste Angabe fett, zwei weitere darunter.
- **Breit:** Die Liste wird zur **Tabelle** mit einer Spalte je Angabe.

Zieh die Liste einfach am Griff zwischen Liste und Mappe breiter, oder klapp die Mappe mit einem kurzen Klick auf den Griff ein.

![Breite Liste als Tabelle](bilder/tabelle.png)

Welche Angaben als Spalten erscheinen, legt der Administrator fest – je Mappentyp, und eine Sicht kann eine eigene Auswahl zeigen (z. B. eine kurze Liste).

### Sortieren

In der Tabelle sortiert ein Klick auf eine Spaltenüberschrift nach dieser Spalte, ein zweiter Klick dreht die Reihenfolge um (↑ aufsteigend, ↓ absteigend). Leere Werte stehen immer am Ende.

Das DMS merkt sich deine Sortierung je Sicht – auf allen Geräten. Über der Liste steht, wonach gerade sortiert ist; **nach Titel** stellt die Grundeinstellung wieder her.

Nach Verweisen und langen Texten lässt sich nicht sortieren; diese Spalten haben keinen Pfeil.

## Suchen

Über der Liste jeder Sicht mit Mappen steht ein Suchfeld. Die Suche findet Mappen, deren **Titel oder Angaben** den eingegebenen Text enthalten – Groß- und Kleinschreibung spielt keine Rolle.

![Suche in den Verträgen](bilder/suche.png)

Über der Liste steht, wie viele Treffer es gibt. Ist das Suchfeld leer, siehst du wieder alle Mappen.

### Im Text der Dokumente suchen

Setzt du neben dem Suchfeld den Haken **Volltext durchsuchen**, sucht das DMS auch im Text der hochgeladenen Dokumente – in PDFs und, dank Texterkennung, auch in Scans und Fotos. Unter jedem Treffer steht, in welchem Dokument die Stelle steht, mit dem gefundenen Wort hervorgehoben. Das DMS merkt sich den Haken für dich.

![Volltextsuche: Treffer in einem Dokument](bilder/volltext-suche.png)

Die Volltextsuche versteht Deutsch: „Rechnungen“ findet auch „Rechnung“, und mehrere Wörter müssen alle vorkommen. Sie findet einen Begriff auch **als Teil eines Wortes**: „Ofen“ findet „Backofen“, „Ofenrohr“ und „Kachelofen“ – ohne dass du ein Sternchen o. Ä. eingeben musst. Das gilt für Begriffe ab drei Buchstaben.

Mit Anführungszeichen suchst du nur **ganze Wörter** bzw. eine genaue Wortfolge, z. B. `"Ofen"` oder `"Stadtwerke Musterstadt"`; ein Minus schließt ein Wort aus, z. B. `Strom -Gas`.

### In Notizen suchen

Mit dem Haken **Notizen** sucht das DMS auch in den [Notizen](zusammenarbeit.md#notizen) der Mappen. Unter einem Treffer steht dann die Stelle aus der Notiz.

!!! note "Was die Suche (noch) nicht kann"
    - Frisch hochgeladene Dokumente findet sie erst, wenn ihr Text erkannt ist – meist nach Sekunden, bei langen Scans nach einigen Minuten (siehe [Dokumente](dokumente.md#volltext)).
    - Verweise werden nicht nach dem Namen der anderen Mappe durchsucht: Die Rechnungen der Stadtwerke findest du nicht, indem du in den Rechnungen „Stadtwerke“ suchst. Öffne stattdessen die Stadtwerke – ihr Register *Rechnungen* zeigt alle – oder nimm die [erweiterte Suche](#erweiterte-suche).

## Erweiterte Suche

Wenn du eine Mappe nur ungefähr beschreiben kannst, hilft die **erweiterte Suche**. Du findest sie ganz oben bei den Sichten und als Link **Erweiterte Suche** neben dem Suchfeld einer Liste (dann ist der Mappentyp der Liste schon gewählt).

Links steht dann statt der Sichten das Suchformular, in der Mitte stehen die Treffer, rechts die geöffnete Mappe. Mit **← zurück zu den Sichten** kommst du wieder zu den Sichten.

![Erweiterte Suche: Formular, Chips und Treffer](bilder/erweiterte-suche.png)

**Ein Beispiel:** Du suchst eine Rechnung über einen Backofen. Sie ist zwischen März und November letzten Jahres gekommen, wahrscheinlich von MediaMarkt, Saturn oder Otto.

1. Wähle unter **Mappentypen** „Rechnung“.
2. Trage beim **Rechnungsdatum** 01.03. bis 30.11. des letzten Jahres ein.
3. Wähle beim **Vertragspartner** (bzw. Aussteller) MediaMarkt, Saturn und Otto.
4. Gib unter **Volltext** „Backofen“ ein.
5. Klicke **Suchen**.

So funktioniert das Formular:

- **Mappentypen**: Du kannst mehrere wählen; angeboten werden nur Typen, die du lesen darfst. Wählst du keinen, sucht das DMS in allen – dann gibt es nur die allgemeinen Felder (angelegt am/von, geändert am/von).
- **Felder**: Angeboten werden die Felder, die **alle gewählten Typen gemeinsam** haben. Jedes Feld bekommt die passende Eingabe:
    - **Datum**: von–bis; eins von beiden darf leer bleiben. Unter **Zeitraum …** gibt es „dieses Jahr“, „letztes Jahr“, „letzte 12 Monate“, „dieser Monat“ und „letzter Monat“.
    - **Zahl, Betrag**: von–bis.
    - **Verweis** (z. B. Vertragspartner): mehrere Mappen – die Mappe muss auf **eine davon** zeigen.
    - **Auswahlliste**: mehrere Werte – einer davon muss passen.
    - **Ja/Nein**: ja, nein oder egal.
    - **Text**: der Wert enthält den eingegebenen Text.
    - Rechts neben dem Feldnamen kannst du statt eines Werts **ist leer** oder **ist nicht leer** wählen.
- Felder ohne Eingabe gelten nicht. **Zwischen den Feldern gilt UND, innerhalb eines Feldes ODER.**
- Änderst du die Typen, bleiben Werte in Feldern erhalten, die es weiter gibt. Bei den anderen steht ein Hinweis, dass sie entfallen.

### Volltext in Dokumenten und Notizen

Unter **Volltext** gibst du einen Begriff ein, der in den Dokumenten oder Notizen der Mappe stehen soll. Mit den Haken **in Dokumenten** und **in Notizen** (beide vorausgewählt) legst du fest, wo: Steht der Begriff an einem der beiden Orte, zählt die Mappe als Treffer. Die Suche im Text versteht Deutsch und findet Teilwörter wie die [Volltextsuche](#im-text-der-dokumente-suchen). Unter jedem Treffer steht die Fundstelle.

### Das Ergebnis

Über den Treffern stehen die Bedingungen als **Chips**, z. B. „Rechnungsdatum 01.03.2025–30.11.2025“, dazu die Zahl der Treffer. Ein Klick auf **×** entfernt eine Bedingung und sucht sofort neu – praktisch, wenn es keinen Treffer gibt. Sortieren, mehrere Mappen auswählen und [Exportieren](#exportieren) gehen wie in einer Sicht.

Die Suche steht in der **Adresse** des Browsers: Zurück und Vor funktionieren, du kannst sie als Lesezeichen speichern oder den Link weitergeben. Wer den Link öffnet, sieht nur die Mappen, die er lesen darf.

Am Handy kommt erst das Formular, nach **Suchen** die Trefferliste; mit **← Suche ändern** kommst du mit deinen Eingaben zurück zum Formular.

## Mehrere Mappen auswählen

In der Liste einer Sicht wählst du mehrere Mappen aus, um sie in einem Schritt zu bearbeiten.

- **Haken** vor einer Mappe setzen; mit gedrückter **Shift**-Taste wählt der nächste Haken alles dazwischen mit. In der Tabelle wählt der Haken im Kopf alle geladenen Mappen.
- Sobald etwas gewählt ist, steht über der Liste eine **Aktionsleiste**: „3 von 120 ausgewählt“, die Aktionen und **Auswahl aufheben**.
- **Alle 120 auswählen** nimmt alle Treffer der Sicht – auch die, die noch nicht geladen sind, und mit deiner Suche.
- Die Auswahl bleibt, während du Mappen öffnest; wechselst du die Sicht oder die Suche, ist sie weg.
- **Am Handy** hält man eine Mappe kurz gedrückt, um die Auswahl zu beginnen; danach schaltet Tippen den Haken um.

### Mehrere Mappen löschen

**Löschen** in der Aktionsleiste fragt erst nach, z. B. „12 Mappen mit 30 Dokumenten in den Papierkorb legen?“, und legt sie dann in den [Papierkorb](#papierkorb) – mit je einem Eintrag im Protokoll der Mappe. Mappen, die du nicht löschen darfst oder auf die noch eine andere Mappe verweist, werden ausgelassen und danach mit Grund aufgelistet. Verweisen ausgewählte Mappen nur aufeinander, hält das nicht auf.

### Exportieren

**Exportieren …** gibt Mappen aus der Sicht heraus – die Auswahl oder, ohne Auswahl bzw. auf Wunsch, alle Treffer (mit deiner Suche und Sortierung):

- **Excel (.xlsx)** – eine Tabelle, in der Datum und Beträge echte Werte sind: Excel kann danach sortieren und rechnen.
- **CSV** – dieselbe Tabelle für jede Tabellenkalkulation, im deutschen Format (Semikolon, Datum TT.MM.JJJJ, Beträge mit Komma).
- **ZIP mit Dokumenten** – die Tabelle als Excel und CSV und je Mappe ein Ordner mit ihren Dokumenten.
- **PDF** – je Mappe eine Seite mit ihren Feldern und der Liste der Dokumente, wahlweise vorne eine Übersicht als Tabelle. PDF-Dokumente werden danach eingebunden, Bilder (JPEG, PNG) als eigene Seite; andere Dateien werden nur genannt.

Als Spalten nimmst du die der Liste oder alle Felder. Verweise erscheinen mit dem Titel der Mappe. **Passwörter werden nie exportiert.** Jeder Export steht im Protokoll. Ob du aus einer Sicht exportieren darfst, legt der Administrator fest; fehlt das Recht, gibt es den Knopf nicht.

## Favoriten

Mappen, die du oft brauchst, markierst du mit dem **Stern ☆** – oben rechts in der Mappe oder direkt in der Liste (rechts im Eintrag bzw. vorn in der Tabellenzeile). Der Stern wird gelb ★, und die Mappe steht in der Sicht **★ Favoriten** unter dem Eingang; die Zahl dahinter zeigt, wie viele es sind. Ein zweiter Klick entfernt sie wieder.

![Die Sicht Favoriten mit geöffneter Mappe](bilder/favoriten.png)

- Favoriten sind **persönlich**: Jeder Benutzer hat seine eigenen. Das Markieren ändert weder „zuletzt geändert“ noch das Protokoll der Mappe.
- Die Sicht *Favoriten* zeigt Mappen aller Typen, mit Titel, Typ und Datum – wie der Eingang.
- Löschst du eine Mappe, verschwindet sie aus den Favoriten; stellst du sie aus dem Papierkorb wieder her, ist sie wieder Favorit.
- Ein Administrator kann Sichten mit der Bedingung **ist mein Favorit** einrichten, etwa *Meine wichtigen Verträge*. Jeder sieht darin seine eigenen Favoriten.

## Eine Mappe öffnen

Ein Klick auf einen Eintrag öffnet die Mappe rechts. Jede Mappe hat eine eigene Adresse – du kannst sie als Lesezeichen speichern oder einem anderen Benutzer schicken.

## Papierkorb

Gelöschte Mappen kommen in den **Papierkorb** unter dem Eingang. Du siehst dort nur, was **du** gelöscht hast – mit Dokumenten und Verweisen.

![Papierkorb](bilder/papierkorb.png)

- **Wiederherstellen** holt eine Mappe zurück in ihre Sicht. Hat inzwischen eine andere Mappe denselben eindeutigen Wert (z. B. dieselbe Rechnungsnummer), landet sie im [Eingang](eingang.md); dort siehst du, was zu ändern ist.
- **Endgültig löschen** entfernt sie für immer, **Papierkorb leeren** alle auf einmal.
- Nach einer Frist, die der Administrator festlegt (meist 30 Tage), löscht das DMS gelöschte Mappen von selbst endgültig. Wie lange, steht über der Liste.
- Im Profil kannst du einstellen, dass dein Papierkorb **beim Abmelden geleert** wird.

Ist der Papierkorb ausgeschaltet, fehlt er links, und Löschen ist sofort endgültig.
