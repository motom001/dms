# Sichten und Listen

## Sichten

Links stehen die **Sichten**. Ganz oben der [Eingang](eingang.md) und der [Papierkorb](#papierkorb), darunter die Sichten, die ein Administrator eingerichtet hat – zum Beispiel *Vertrag*, *Rechnung*, *Vertragspartner* oder *Kündigung in den nächsten 12 Monaten*. Die Zahl dahinter sagt, wie viele Mappen die Sicht gerade zeigt.

Ein Klick auf eine Sicht zeigt ihre Mappen in der Liste.

![Sichten als Baum: Finanzen mit Untersichten](bilder/sichten-baum.png)

- **Sichten können Untersichten haben.** Ein Pfeil ▸ davor zeigt das; ein Klick darauf klappt sie auf oder zu. Dein Gerät merkt sich, was zugeklappt ist.
- **Eine Sicht mit Untersichten zeigt alles zusammen:** *Finanzen* zeigt zum Beispiel alle offenen Rechnungen *und* die Zahlungen dieses Jahres.
- **Manche Sichten filtern:** *Offene Rechnungen* zeigt nur Rechnungen, die noch nicht bezahlt sind. Werte wie „heute“ oder „du selbst“ rechnet das DMS bei jedem Öffnen neu – eine Sicht *Kündigung in den nächsten 12 Monaten* ist also immer aktuell.
- **Zeigt eine Sicht mehrere Mappentypen**, sieht die Liste aus wie im Eingang: mit der Spalte *Typ* und ohne **+ Neu**. Neue Mappen legst du dann in der Sicht des einzelnen Typs an.

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

Welche Angaben als Spalten erscheinen, legt der Administrator je Mappentyp fest.

### Sortieren

In der Tabelle sortiert ein Klick auf eine Spaltenüberschrift nach dieser Spalte, ein zweiter Klick dreht die Reihenfolge um (↑ aufsteigend, ↓ absteigend). Leere Werte stehen immer am Ende.

Das DMS merkt sich deine Sortierung je Sicht – auf allen Geräten. Über der Liste steht, wonach gerade sortiert ist; **nach Titel** stellt die Grundeinstellung wieder her.

Nach Verweisen und langen Texten lässt sich nicht sortieren; diese Spalten haben keinen Pfeil.

## Suchen

Sobald eine Sicht mehr als fünf Mappen hat, erscheint über der Liste ein Suchfeld. Die Suche findet Mappen, deren **Titel oder Angaben** den eingegebenen Text enthalten – Groß- und Kleinschreibung spielt keine Rolle.

![Suche in den Verträgen](bilder/suche.png)

Über der Liste steht, wie viele Treffer es gibt. Ist das Suchfeld leer, siehst du wieder alle Mappen.

### Im Text der Dokumente suchen

Setzt du unter dem Suchfeld den Haken **Volltext durchsuchen**, sucht das DMS auch im Text der hochgeladenen Dokumente – in PDFs und, dank Texterkennung, auch in Scans und Fotos. Unter jedem Treffer steht, in welchem Dokument die Stelle steht, mit dem gefundenen Wort hervorgehoben. Das DMS merkt sich den Haken für dich.

![Volltextsuche: Treffer in einem Dokument](bilder/volltext-suche.png)

Die Volltextsuche versteht Deutsch: „Rechnungen“ findet auch „Rechnung“, und mehrere Wörter müssen alle vorkommen. Mit Anführungszeichen suchst du eine genaue Wortfolge, z. B. `"Stadtwerke Musterstadt"`; ein Minus schließt ein Wort aus, z. B. `Strom -Gas`.

!!! note "Was die Suche (noch) nicht kann"
    - Frisch hochgeladene Dokumente findet sie erst, wenn ihr Text erkannt ist – meist nach Sekunden, bei langen Scans nach einigen Minuten (siehe [Dokumente](dokumente.md#volltext)).
    - Verweise werden nicht nach dem Namen der anderen Mappe durchsucht: Die Rechnungen der Stadtwerke findest du nicht, indem du in den Rechnungen „Stadtwerke“ suchst. Öffne stattdessen die Stadtwerke – ihr Register *Rechnungen* zeigt alle.

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
