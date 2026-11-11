# Mappen

Eine Mappe sammelt alles zu einer Sache: die Angaben, die Dokumente und die Verbindungen zu anderen Mappen.

![Geöffnete Mappe mit Registern](bilder/ablage.png)

## Aufbau einer Mappe

Oben steht der **Titel** der Mappe. Ihn musst du nicht selbst schreiben: Ablago setzt ihn aus den Angaben zusammen, zum Beispiel aus Rechnungsnummer und Datum – „R-2026-117 vom 02.03.2026“. Ändert sich eine Angabe, ändert sich der Titel mit.

Darunter stehen die **Indexwerte**, die jede Mappe hat: wann und von wem sie angelegt und zuletzt geändert wurde. Als Änderung zählen auch hochgeladene und entfernte Dokumente, nicht aber Notizen oder Aufgaben. Ein Klick auf einen Namen öffnet die Mappe dieses Benutzers. Mit dem **Stern** rechts neben dem Titel merkst du dir die Mappe als [Favorit](ablage.md#favoriten).

Darunter folgen die **Register** – die Trennblätter der Mappe. Es gibt vier Arten:

| Register | Was darin steht |
| --- | --- |
| **Angaben** (z. B. „Vertrag“, „Stammdaten“) | Felder zum Ausfüllen |
| **Dokumente** (z. B. „Vertragsunterlagen“) | Hochgeladene Dateien, siehe [Dokumente](dokumente.md) |
| **Verknüpfungen** (z. B. „Rechnungen“) | Andere Mappen, die auf diese Mappe verweisen |
| **Historie** | Wer wann was an der Mappe geändert hat, siehe [Historie](zusammenarbeit.md#historie) |

Hinter Dokumenten- und Verknüpfungsregistern steht, wie viel darin liegt. Ein roter Punkt zeigt, auf welchem Register ein Feld noch nicht stimmt.

## Eine Mappe anlegen

1. Wähle links die Ansicht des Mappentyps, zum Beispiel *Rechnung*.
2. Klicke auf **+ Neu**.
3. Fülle die Felder aus. Felder mit **\*** sind Pflichtfelder. Unter manchen Feldern steht ein Hinweis, was hineingehört.
4. Klicke auf **Mappe speichern**.

!!! info "Archiv – aufbewahren bis"
    Steht an einer Mappe **Archiv · aufbewahren bis 31.12.JJJJ**, muss sie bis dahin aufbewahrt werden: Bis zu diesem Tag lassen sich weder die Mappe noch ihre Dokumente löschen; Dokumente ersetzt du als neue Version. Danach darf sie löschen, wer das Recht dazu hat; Administratoren finden alle abgelaufenen Mappen gesammelt unter **Werkbank → Aufbewahrung abgelaufen**.

    Steht dort **Archiv · aufbewahren, Frist beginnt mit ‹Feld›** (etwa *Beendet am*), läuft die Frist noch nicht: Die Mappe ist gesperrt, solange das Feld leer ist – etwa bei einem laufenden Vertrag. Trägst du das Datum ein, beginnt die Frist; das steht in der Historie.

!!! info "Nur passende Mappen"
    Manche Verweisfelder bieten nur bestimmte Mappen an, z. B. beim Feld *Arzt* nur Vertragspartner, die Ärzte sind, oder bei einer Person nur die Niederlassungen der gewählten Organisation. Steht neben einer gewählten Mappe gelb, womit sie nicht passt – etwa „passt nicht zu „Organisation““ oder „passt nicht zur Auswahlregel dieses Felds“ –, bleibt sie gültig, und speichern kannst du trotzdem; neu wählen kannst du nur, was passt. Darfst du die Mappe bearbeiten, steht über den Registern außerdem „Achtung: Niederlassung passt nicht zu „Organisation“.“ – ein Klick führt zum Feld.

!!! info "Vorgeschlagen aus …"
    Manche Verweisfelder bringen Angaben mit: Wählst du bei einem Vertrag die *Vertragsart* „Mobilfunk“, stehen in leeren Feldern schon die üblichen Fristen, markiert mit **vorgeschlagen aus Vertragsart Mobilfunk**. Prüfe sie und ändere, was bei dir anders ist; **Zurücknehmen** leert das Feld wieder. Was du schon eingetragen hast, bleibt immer stehen. Wählst du vor dem Speichern eine andere Vertragsart, ersetzt Ablago die Vorschläge, die du noch nicht angefasst hast, durch die der neuen. Das gilt auch bei **Aus Dokument ausfüllen** und auf der Seite **Dokument übernehmen**. Du siehst nur Werte, die du lesen darfst.

!!! info "Fortlaufende Nummern"
    Steht an einem Feld „Wird beim Speichern vergeben“, bekommt die Mappe dort beim Speichern automatisch die nächste Nummer, z. B. eine Rechnungsnummer. Die Nummer lässt sich danach nicht mehr ändern.

![Neue Rechnung anlegen](bilder/mappe-neu.png)

Stimmt etwas nicht – ein Pflichtfeld ist leer, eine Zahl zu groß, eine Nummer schon vergeben –, steht der Grund direkt am Feld, und es wird nichts gespeichert.

### Aus Dokument ausfüllen

Hast du eine **Visitenkarte**, einen Kassenbon oder einen Brief vor dir, musst du nicht abtippen: Oben in der Mappe (neu oder bestehend) steht **Aus Dokument ausfüllen** – bei manchen Mappentypen mit eigenem Namen, z. B. **Visitenkarte scannen**.

**Liegt in der Mappe schon ein Dokument mit Text**, öffnet der Knopf die Seite [Dokument übernehmen](post.md#zuordnen): in der Mitte das Dokument (bei mehreren wählst du oben, welches), rechts diese Mappe, oben **Zurück zur Mappe**. Vorschläge, farbige Rahmen an den Fundstellen, Ziehen, Anklicken und Markieren gehen dort wie bei Post; gespeichert wird mit **Mappe speichern**. Für ein neues Foto oder eine Datei steht daneben **Foto oder Datei …** – dann geht es wie folgt:

1. Tippe auf den Knopf. Am Handy öffnet **Foto aufnehmen** direkt die Kamera; **Weiteres Foto** nimmt z. B. die Rückseite dazu. Am Rechner wählst du eine Datei – ein Foto, ein PDF oder eine vCard (`.vcf`). In einer bestehenden Mappe geht auch ein Dokument, das schon darin liegt.
2. **Angaben erkennen.** Ablago liest den Text (offline, ohne KI) und sucht passende Angaben: Name, Funktion, Telefon, Mobil, E-Mail, Internetseite, Anschrift, Datum, Betrag, Nummern.
3. **Verstanden – bitte prüfen und speichern.** Leere Felder sind jetzt als **Vorschlag** ausgefüllt; darunter steht, wie sicher der Wert ist und an welcher Textstelle er stand. **Zurücknehmen** leert das Feld wieder. Ist ein Feld schon ausgefüllt, bleibt dein Wert stehen – darunter steht **Im Dokument** der andere Wert mit **Übernehmen**; **Alle Alternativen übernehmen** tut das für alle.
4. **Verweise**, z. B. *Organisation* bei einer Person: Gibt es die Firma schon (erkannt an Name, Internetseite oder E-Mail-Domain), ist sie vorgeschlagen. Gibt es sie noch nicht, legt **„Organisation“ mit diesen Angaben anlegen** sie nach einer Rückfrage an.
5. **Mappe speichern.** Erst jetzt ist etwas gespeichert. Das Foto bzw. die Datei liegt dann im Dokumentenregister der Mappe – außer, du hast den Haken „im Register … ablegen“ abgewählt.

Welche Felder die Erkennung füllt, legt der Administrator am Mappentyp fest; Passwortfelder füllt sie nie. Hat er dafür ein Paket gewählt, etwa einen KI-Assistenten, steht unter dem Ergebnis „Erkannt mit „…“.“ – auch dann sind es nur Vorschläge. Der Text des Dokuments geht dabei an den KI-Dienst des Pakets – im Heimnetz bleibt er bei dir; ob es ein Anbieter ist, sieht dein Administrator an der Dienst-Adresse des Pakets. Antwortet das Paket nicht, übernimmt die eingebaute Erkennung, und ein Satz sagt dir das. Geht etwas schief (unscharfes Foto, kein Text), steht der Grund im Kasten – versuch es mit mehr Licht und gerade gehaltener Karte.

**Visitenkarte mit QR-Code:** Viele Karten tragen einen QR-Code mit allen Kontaktdaten (vCard). Hat der Administrator das Paket **QR-Code lesen** gewählt, übernimmt Ablago die Angaben aus diesem Code statt aus dem erkannten Text – Telefonnummern und Namen stimmen dann Zeichen für Zeichen. Unter dem Ergebnis steht „Erkannt mit „QR-Code lesen“.“; die Fundstelle nennt die Zeile aus der vCard. Das Paket liest Dokumente, die schon in der Mappe oder in einer Post liegen: Lege das Foto der Karte also zuerst ab (oder öffne die Post, in der es angekommen ist) und klicke dann **Aus Dokument ausfüllen** mit diesem Dokument. Hat die Karte keinen QR-Code oder steht darin etwas anderes (eine Internetadresse, ein GiroCode), liest Ablago wie gewohnt den Text, und ein Satz sagt dir das.

### Die Felder

| Feld | So gibst du es ein |
| --- | --- |
| Text, Langtext | frei; manche Texte haben eine Höchstlänge oder müssen eindeutig sein |
| Formatierter Text | mit Werkzeugleiste: fett, kursiv, Überschrift, Liste, nummerierte Liste, Zitat, Link; **@** erwähnt jemanden (siehe unten) |
| Zahl | mit Komma, z. B. `12,5` |
| Betrag | Zahl und Währung, z. B. `98,00 EUR`; eine Gutschrift oder Erstattung mit Minus (`-25,00`) – das geht, wo unter dem Feld „Mit Minus eintragen“ steht |
| Zeitraum | Zahl und Einheit, z. B. `3` und *Monate* für eine Kündigungsfrist |
| Prozent | die Zahl, z. B. `19` oder `7,5` – „19 %“ geht auch |
| Datum | über den Kalender oder als Datum |
| Ja/Nein | Haken setzen |
| Auswahlliste | einen Wert (oder mehrere) aus der Liste wählen |
| Verweis | eine andere Mappe suchen und wählen (siehe unten) |
| Passwort | eintippen; gespeichert wird es verschlüsselt (siehe unten) |
| Tabelle | nichts einzugeben – sie zeigt Mappen, die hierher gehören, etwa die Positionen einer Rechnung (siehe unten) |

Manche Textfelder haben ein **Format**: E-Mail, Telefon, Internetseite, IBAN oder PLZ. Am Handy erscheint dann die passende Tastatur, und offensichtlich falsche Angaben – etwa Buchstaben in einer Telefonnummer – lehnt Ablago mit einem Hinweis ab, was zu tun ist. Neben einer E-Mail-Adresse, Telefonnummer oder Internetseite steht ein Knopf, mit dem du gleich schreibst, anrufst oder die Seite öffnest. Eine IBAN steht in Vierergruppen; eine deutsche PLZ hat genau 5 Ziffern, für andere Länder trägst du das Land ein. Manche Datumsfelder haben Grenzen, ein Geburtstag darf zum Beispiel nicht in der Zukunft liegen. Was schon gespeichert ist, bleibt, bis du das Feld änderst.

**Felder, die mitwachsen:** Manche Felder und Abschnitte erscheinen erst, wenn sie passen – wählst du etwa die Vertragsart *Miete*, erscheint gleich der Abschnitt *Miete*. Wählst du später etwas anderes, verschwindet er wieder, die eingetragenen Werte aber nicht: An seiner Stelle steht „Abschnitt Miete ist ausgeblendet – 3 Werte bleiben gespeichert · **anzeigen**“. Ein Klick auf *anzeigen* holt ihn zurück. Ausgeblendete Felder sind nicht Pflicht. Das ist nur Ordnung im Formular: Export und Auskunft enthalten alle Werte. Was wann zu sehen ist, stellt die Verwaltung am Mappentyp ein.

**Ausgerechnete Felder:** Manche Werte rechnet ein Paket selbst aus, etwa *Kündigen bis* oder den *Status* eines Vertrags. Solche Felder kannst du nicht ändern; darunter steht „berechnet von Verträge“. Ändere stattdessen die Angaben, aus denen sie entstehen (Beginn, Laufzeit, Kündigungsfrist …) – das Paket rechnet dann neu. Steht „nicht mehr berechnet“ da, rechnet das Paket nicht mehr; der Wert bleibt, bis die Verwaltung das Feld freigibt.

**Tabellen zwischen den Feldern:** Manche Mappen zeigen mitten in den Feldern eine Tabelle, etwa die *Positionen* einer Rechnung. Jede Zeile ist eine eigene Mappe; ein Klick öffnet sie. Mit **+ Position** unter der Tabelle legst du eine neue an – sie öffnet sich in einem kleinen Fenster und gehört schon zu dieser Rechnung; nach dem Speichern steht sie in der Tabelle. Bei vielen Zeilen holt **weitere anzeigen** die nächsten 50. Am Handy steht statt der Tabelle eine Liste mit den ersten zwei Spalten. Du siehst nur die Zeilen, die du lesen darfst, und **+ Position** nur, wenn du solche Mappen anlegen darfst. Summen rechnet die Tabelle nicht; bei einer neuen Rechnung legst du Positionen nach dem Speichern an.

![Rechnung mit der Tabelle Positionen und „+ Position“](bilder/mappe-tabelle.png)

**Hinweise von Paketen:** Über den Registern kann ein gelber Hinweis eines Pakets stehen, etwa „Rechnungen · Die Positionen ergeben 118,40 €, die Rechnung sagt 120,80 €“. Vorne steht immer der Name des Pakets. Ein solcher Hinweis hält dich nie vom Speichern ab; das Paket nimmt ihn wieder weg, sobald er nicht mehr zutrifft.

### Formatierter Text

Manche längeren Texte lassen sich formatieren. Über dem Feld steht eine kleine **Werkzeugleiste**: Markiere Text und klicke auf **F** (fett), *K* (kursiv), eine Überschrift, eine Liste, eine nummerierte Liste, ein Zitat oder einen Link. Mit **Schreiben** und **Vorschau** wechselst du zwischen Eingabe und fertiger Ansicht. Im Feld steht dann eine einfache Schreibweise, z. B. `**fett**` – das ist richtig so. **Vorschau** zeigt, wie es aussieht.

![Formatierter Text mit Werkzeugleiste](bilder/formatiert.png)

Tippst du **@** und die ersten Buchstaben eines Namens, wählst du einen Benutzer aus. Er bekommt dann eine [Aufgabe](eingang.md) zu dieser Mappe.

In Listen und in der Suche erscheint der Text ohne Formatierung.

### Passwörter

In einem **Passwortfeld** (z. B. das Kennwort eines Kundenportals) steht nach dem Speichern nur „••••••••“. Das **Auge** zeigt das Passwort; jedes Anzeigen hält Ablago in der Historie der Mappe fest (wer, wann, welche Mappe – nicht das Passwort). **Ändern** nimmt ein neues Passwort auf, **Passwort entfernen** löscht es beim Speichern (bis dahin geht **Rückgängig**).

![Passwortfeld](bilder/passwortfeld.png)

Passwörter erscheinen nie im Titel, in Listen oder in der Suche. Steht am Feld „nicht möglich“, hat ein Administrator noch keinen Schlüssel für Passwörter eingerichtet.

### Auf andere Mappen verweisen

Ein **Verweis** verbindet zwei Mappen – die Rechnung mit ihrem Vertrag, den Vertrag mit dem Vertragspartner. Tippe in das Feld ein paar Buchstaben des Titels und wähle die passende Mappe aus den Vorschlägen. Mit der Tastatur übernimmt **Enter** den ersten Vorschlag, **Esc** schließt die Liste.

Bei Feldern, die **mehrere Verweise** erlauben (z. B. *Für Rechnungen* bei einer Zahlung), wiederholst du das. Das Suchfeld bleibt oben direkt unter der Beschriftung; die gewählten Mappen stehen **darunter**, jede mit **Entfernen**. So wählst du überall mehrere Einträge aus einer Liste, auch die Mappentypen in der [Erweiterten Suche](ablage.md#erweiterte-suche).

Gibt es die Mappe noch nicht, öffnet **+ … anlegen** unter dem Feld ein kleines Fenster über der Seite – mit Kopf, Registern, Feldern und Speicherleiste wie jede Mappe. Am Kopf ziehst du es beiseite, damit du siehst, was dahinter steht. **Mappe speichern** legt die neue Mappe an, schließt das Fenster und trägt sie ins Feld ein; die Mappe, an der du gerade arbeitest, bleibt ungespeichert offen. **Abbrechen**, ✕ oder **Esc** schließen das Fenster ohne Änderung, danach steht der Cursor wieder am Feld. Den Eintrag gibt es nur, wenn du Mappen dieses Typs anlegen darfst.

**Felder, die aus einem anderen folgen:** Manche Verweise ergeben sich aus einem anderen – wählst du bei einer Person die Niederlassung, füllt sich die Organisation, zu der sie gehört, und darunter steht „aus Niederlassung“. Das geschieht nur, wenn das Feld leer ist; steht schon eine andere Organisation darin, fragt Ablago „Organisation ändern?“. Trägst du von Hand eine andere Organisation ein, fragt Ablago, ob die Niederlassung geleert werden soll – mit **Behalten** bleibt sie, und am Feld steht der gelbe Hinweis. Welche Felder so zusammenhängen, legt der Administrator fest.

**Felder mit mehreren Mappentypen:** Manche Felder verweisen auf Mappen verschiedener Typen – etwa *betrifft* an einer Rechnung auf das Auto, die Heizung, die Wohnung oder einen Vertrag. Die Vorschläge stehen dann nach Typ gruppiert (z. B. *Fahrzeug*, *Wohnung*), und in jeder Gruppe stehen die Mappen oben, die du zuletzt geöffnet hast. Neben jeder gewählten Mappe steht ihr Typ mit Symbol, damit du „Golf“ (Fahrzeug) und „Golf“ (Vertrag) auseinanderhältst. **+ … anlegen** gibt es für jeden Typ, in dem du anlegen darfst. Steht am Feld *alle vom selben Typ*, bietet Ablago nach der ersten Mappe nur noch Mappen ihres Typs an. Mappen, die du nicht sehen darfst, stehen wie überall nur als „(nicht sichtbar)“ da – ohne Titel und ohne Typ.

Ein Klick auf einen gesetzten Verweis öffnet die andere Mappe.

## Ändern

Öffne die Mappe, ändere die Angaben und klicke auf **Mappe speichern**. Solange etwas nicht gespeichert ist, steht unten „Ungespeicherte Änderungen“. **Änderungen verwerfen** stellt den gespeicherten Stand wieder her.

Willst du die Mappe mit ungespeicherten Änderungen verlassen, fragt Ablago nach.

Neben dem Titel stehen der Stern für die [Favoriten](ablage.md#favoriten) und das Menü **Mappe ▾** (Aufgabe vergeben, Erinnern, per E-Mail versenden, als PDF exportieren, Link kopieren). Bei jeder Mappe gibt es außerdem die Register **Notizen** (mit Zahl) und **Historie** – siehe [Notizen, Erwähnungen, Historie](zusammenarbeit.md) und [E-Mail, PDF und Link](versenden.md). Am Handy rollt die Reihe der Register waagerecht; ein Schatten am Rand zeigt, dass weitere folgen. Menüs wie **Mappe ▾**, **+ Neu** und dein Benutzermenü öffnen am Handy als Blatt von unten mit großen Einträgen; tippst du daneben, schließt es. Dort steht am Handy auch **Mappe löschen …**. Die Leiste mit **Verwerfen** und **Speichern** erscheint am Handy erst, wenn du etwas geändert hast.

Manche Angaben sind nur zum Lesen da und haben einen gestrichelten Rahmen – zum Beispiel Name und E-Mail-Adresse in der Mappe eines Benutzers. Daneben steht, wo man sie ändert.

### Gleichzeitig bearbeiten

Dieselbe Mappe darf an mehreren Stellen gleichzeitig offen sein – am Laptop und am Handy, in zwei Fenstern oder bei zwei Personen im Haushalt. Beim Speichern schickt Ablago nur die Felder, die du **in diesem Fenster geändert** hast. Alles andere bleibt so, wie es gerade gespeichert ist.

**Beispiel:** Lena hat die Mappe „Kfz-Versicherung“ am Laptop offen. Am Handy ändert sie den **Beitrag** und speichert. Danach ändert sie am Laptop nur die **Notiz** und speichert. Beides bleibt erhalten – der Laptop setzt den Beitrag nicht auf den alten Wert zurück, und es kommt keine Frage.

Habt ihr **dasselbe Feld** geändert, fragt Ablago, bevor es etwas überschreibt:

> Jonas hat „Beitrag“ um 17:04 auf „412,00 €“ geändert. Du wolltest „398,00 €“ eintragen.

Wähle je Feld **Meins übernehmen** oder **Wert von Jonas behalten** und klicke auf **So speichern**. Warst du es selbst an einem anderen Gerät, heißt es **Den Wert von hier übernehmen** bzw. **Den anderen Wert behalten**. Deine übrigen Änderungen und die der anderen werden dabei ohne Frage zusammengeführt. **Zurück zum Bearbeiten** speichert noch nichts – deine Eingaben bleiben stehen. Was gegolten hat, steht wie jede Änderung in der [Historie](zusammenarbeit.md#historie).

Das gilt für alle Felder, auch für Verweise und Mehrfachauswahl (dort zählt das ganze Feld) und für die Felder, aus denen der Titel entsteht. Eine Sperre („wird gerade bearbeitet“) gibt es nicht; Ablago fragt nur, wenn zwei Änderungen wirklich dasselbe Feld betreffen. Auch Automatiken wie das automatische Zuordnen von Post oder Pakete setzen keine Felder zurück, die du inzwischen geändert hast.

## Inhalte übersetzen { #inhalte-ubersetzen }

Ist ein Brief, eine Notiz oder ein Feld in einer anderen Sprache, drückst du darunter **Übersetzung anzeigen** – den Knopf gibt es an langen Textfeldern (bei einzeiligen erst ab ein paar Wörtern), an Notizen und am Volltext eines Dokuments, sobald deine Ablage ein Paket zum Übersetzen hat. Übersetzt wird in deine Sprache aus [Mein Konto](profil.md#sprache), nur auf Knopfdruck.

- **Gekennzeichnet:** Über der Übersetzung steht **Maschinell übersetzt – nicht verbindlich** (mit der Sprache des Originals, wenn sie bekannt ist). Bei langen Texten siehst du den Fortschritt Abschnitt für Abschnitt.
- **Original:** Fährst du mit der Maus über die Übersetzung oder tippst du sie am Handy an, erscheint der gespeicherte Originaltext. Mit der Tastatur erreichst du ihn über **Original zeigen**. **Zurück zum Original** blendet die Übersetzung aus.
- **Nur zum Lesen:** Gespeichert und bearbeitet wird immer nur das Original. Die Übersetzung lässt sich nicht als Wert übernehmen; im Feld steht weiter das Original.
- **Wohin der Text geht:** Übersetzt das Paket auf dem Gerät deiner Ablage, verlässt der Text es nicht. Nutzt dein Administrator einen Dienst im Netz, steht an der Übersetzung, wohin der Text gegangen ist.
- Übersetzt wird nur, was du lesen darfst. Brauchst du den Knopf nicht, schaltest du ihn unter [Mein Konto](profil.md#ubersetzung-anzeigen) ab.

## Verknüpfungen

Das Register **Verknüpfungen** zeigt alle Mappen, die auf diese Mappe verweisen. Beim Vertragspartner siehst du so seine Verträge und Rechnungen, beim Vertrag seine Rechnungen – ohne dass du sie dort eintragen musst.

![Die Verträge eines Vertragspartners](bilder/verknuepfungen.png)

Je nach Einrichtung erscheinen die Mappen einer Gruppe als einfache Liste der Titel oder als **Tabelle** mit Spalten, etwa die Rechnungen mit Betrag, Datum und *bezahlt*. Ein Klick auf eine Zeile öffnet die Mappe.

![Rechnungen eines Vertragspartners als Tabelle](bilder/verknuepfungen-tabelle.png)

Mit **+ … anlegen** in der Überschrift einer Gruppe legst du direkt eine neue Mappe an, die schon auf diese Mappe verweist – zum Beispiel eine neue Rechnung zu diesem Vertrag.

Bei einer neuen Mappe ist das Register noch leer: Verknüpfungen entstehen erst, wenn die Mappe gespeichert ist und andere auf sie verweisen.

### Teile einer Mappe { #teile }

Manche Mappen gehören immer zu einer anderen – etwa die **Positionen** einer Rechnung. Solche **Teile** stehen nur an ihrer **übergeordneten Mappe** (meist als Tabelle mit „+ Position“), nicht in den Ansichten, unter *Zuletzt geöffnet* oder in der Suche. Suchst du nach etwas, das in einer Position steht, findest du die Rechnung; in der Trefferliste steht dann „gefunden in Rechnungsposition „3. Bohrmaschine““. Öffnest du einen Teil direkt, steht oben **Teil von …** mit einem Link zurück zur übergeordneten Mappe. Neue Teile legst du an der übergeordneten Mappe an. Löschst du sie, gehen ihre Teile mit – und kommen beim Wiederherstellen aus dem Papierkorb mit ihr zurück. Welche Mappentypen Teile sind, legt dein Administrator fest.

!!! info "Zugehörigkeit oder Bezug"
    Neben jedem Verweis steht, welcher Art er ist. **Zugehörigkeit** heißt: gehört dazu (die Rechnung gehört zum Vertrag). **Bezug** heißt: hat nur damit zu tun (die Rechnung kommt von diesem Aussteller). Das hilft bei Auswertungen wie „alles zum Haus“, damit dort nicht jede Rechnung desselben Handwerkers auftaucht – und beim [Löschen mit verknüpften Mappen](#mit-verknupften-mappen-loschen): Mitgelöscht wird nur, was dazugehört.

## Löschen

Unten links in der Mappe steht **Mappe löschen**. Nach einer Rückfrage kommt die Mappe mit ihren Dokumenten in den [Papierkorb](ablage.md#papierkorb); dort lässt sie sich eine Zeit lang wiederherstellen. Ist der Papierkorb ausgeschaltet, ist sie sofort endgültig weg.

In der Rückfrage wählst du den **Grund** – *Nicht mehr nötig*, *Frist abgelaufen*, *Auf Verlangen der betroffenen Person* oder *Sonstiges* – und kannst eine kurze Anmerkung dazuschreiben. Beides steht im Löschprotokoll, mit dem dein Administrator nachweisen kann, dass und warum gelöscht wurde; Titel und Inhalte der Mappe stehen dort nicht. Schreib in die Anmerkung deshalb keine Namen.

Geht Löschen gerade nicht, ist der Knopf gesperrt (gedämpft, mit Schloss), und der Grund steht in einem Satz daneben. **Warum ist Löschen gesperrt?** klappt die ausführliche Begründung direkt am Knopf auf:

- **Es verweisen noch andere Mappen darauf.** Die Begründung zählt sie auf – mit Links dorthin (bei vielen die ersten acht und „und … weitere“). Entferne zuerst dort den Verweis. So kann kein Vertrag verschwinden, zu dem noch Rechnungen gehören. Verschickte E-Mails und andere [Post](post.md) halten das Löschen nicht auf.
- **Archivmodus:** Die Aufbewahrungsfrist läuft noch; vorher lässt sich die Mappe von niemandem löschen.
- **Berechtigungen:** Du darfst Mappen dieses Mappentyps nicht löschen. Das legt ein Administrator fest.
- **Teile, die du nicht löschen darfst:** Hat die Mappe [Teile](#teile), gehen sie beim Löschen mit. Darfst du einen davon nicht löschen, bleibt alles stehen, und Ablago sagt, wie viele es sind.

![Gesperrter Knopf „Mappe löschen“ mit Schloss und aufgeklappter Begründung](bilder/mappe-loeschen-warum.png)

Benutzer und Systemrollen lassen sich in der Ablage gar nicht löschen; dort fehlt der Knopf.

### Mit verknüpften Mappen löschen

Willst du eine Mappe **mit allem, was an ihr hängt**, loswerden – etwa einen Vertragspartner, mit dem es seit Jahren nichts mehr gab, samt Verträgen, Rechnungen und Dokumenten –, nimm **Mappe ▾ → Mit verknüpften Mappen löschen …** (unten im Menü, rot). Lässt sich die Mappe allein nicht löschen, weil noch andere auf sie verweisen, steht derselbe Weg auch unter **Warum ist Löschen gesperrt?** am Löschknopf. Du brauchst dafür das Recht, die Mappe zu löschen.

![Vorschau als Baum: was mitgeht und was bleibt](bilder/mit-verknuepften-loeschen.png)

1. **Vorschau als Baum:** Ablago sammelt alle Mappen, die zu dieser Mappe gehören, und die Mappen, die wiederum zu diesen gehören (Vertragspartner → Verträge → Rechnungen → Lieferscheine …), mit der Zahl ihrer Dokumente. Die **Tiefe** stellst du ein (Vorgabe 5 Ebenen); Äste klappst du mit ▸/▾ auf und zu. Jede Mappe steht nur einmal da, auch bei Kreisen.
    - **Nur nach unten:** Mitgelöscht wird nur, was auf die gelöschte Mappe verweist. Mappen, auf die sie selbst verweist (z. B. eine Kategorie, ein Ablageort oder beim Löschen einer Rechnung der Vertragspartner), gehören nie dazu – auch nicht über eine mitgelöschte Mappe: Der Lieferschein einer Rechnung geht mit, sein Verweis auf den Vertragspartner wird aber nicht verfolgt.
    - **Nur über Zugehörigkeit:** Mitgelöscht wird nur über Verweise der [Verweisart](begriffe.md#verweisart) **Zugehörigkeit** (die Rechnung gehört zum Vertrag). Hängt eine Mappe nur über einen **Bezug** dran – z. B. ein Vertrag mit diesem Vertragspartner als *Ansprechpartner*, Post mit *Für* oder *Zugeordnet zu* –, bleibt sie; nur der Verweis wird entfernt. Was an ihr hängt, sammelt Ablago nicht.
2. **Kennzeichnungen** je Mappe:
    - ✅ **wird gelöscht**.
    - 📎 **nur über Bezug verbunden** – bleibt immer, nur der Verweis wird entfernt (dabei steht das Feld, z. B. „über Ansprechpartner (Bezug)“). Nimmst du den Haken weg, bleibt auch der Verweis – und damit die Mappe, auf die er zeigt.
    - 🔗 **hängt auch an anderen Mappen** – z. B. eine Rechnung, die zusätzlich auf einen anderen Vertrag verweist. Vorschlag: **nur den Verweis entfernen, Mappe behalten**; im Auswahlfeld kannst du sie stattdessen **mitlöschen**.
    - 🔒 **Aufbewahrungsfrist läuft noch** ([Archivmodus](begriffe.md#archivmodus)) – wird **nie** gelöscht; dabei steht, ab wann sie weg darf.
    - ⛔ **kein Löschrecht** – wird nie gelöscht.
3. **Auswählen:** Jede Mappe hat ein Kästchen (Vorgabe: an). Nimmst du den Haken weg, bleibt sie. **Was bleibt, hält fest, worauf es verweist:** Bleibt eine Rechnung (abgewählt, gesperrt oder ohne Recht), bleiben auch ihr Vertrag und der Vertragspartner – dabei steht, warum. Dasselbe gilt, wenn eine Mappe außerhalb der Vorschau (zu tief, nicht sichtbar) noch darauf verweist. Verweise werden nur entfernt, wo du „nur Verweis entfernen“ gewählt hast.
4. **Zusammenfassung:** Unten steht, was geschieht, z. B. „37 Mappen und 112 Dokumente werden in den Papierkorb gelegt; 3 bleiben wegen Aufbewahrungsfrist; 2 Verweise werden entfernt.“
5. **Bestätigen:** Zum Bestätigen tippst du den Namen der Mappe ein.

**Erinnerung zum Fristende:** Bleibt die Mappe stehen, weil Mappen darunter noch in der Aufbewahrungsfrist sind, legt Ablago dir an ihr eine [Erinnerung](begriffe.md#erinnerung) zum Tag nach dem spätesten Fristende an – „Müller GmbH kann ab 01.01.2032 gelöscht werden – „Mit verknüpften Mappen löschen“ erneut ausführen“. An dem Tag steht sie unter „Zu erledigen“; ein Klick öffnet die Mappe, und du löschst erneut.

Alles geht als **ein Vorgang** in den [Papierkorb](ablage.md#papierkorb): Dort stellst du mit **Alle wiederherstellen** alle Mappen und Dokumente gemeinsam wieder her – auch die Verweise untereinander und die Verweise, die an bleibenden Mappen entfernt wurden. In der Historie jeder Mappe steht „in den Papierkorb gelegt – mit verknüpften Mappen gelöscht“ mit der Zahl der Mappen und Dokumente. Ist der Papierkorb ausgeschaltet, ist das Löschen sofort endgültig; die Rückfrage sagt das.

Fehlt der Knopf, dürfen Mappen dieses Mappentyps nicht gelöscht werden.

## Was du sehen und ändern darfst

Ein Administrator kann je Mappentyp festlegen, wer Mappen anlegen, lesen, bearbeiten, löschen und Passwörter darin sehen darf – zum Beispiel, dass nur die Buchhaltung Rechnungen bearbeitet oder dass vertrauliche Mappen nur ihre Verantwortlichen sehen. Was für dich gilt, steht unter Mein Konto unter [Meine Rechte](profil.md#meine-rechte).

Auch an jeder **Ansicht** kann er Rechte setzen: wer sie **sieht**, wer dort mit **+ Neu** **anlegen** darf und wer aus ihr **exportieren** darf. Eine Ansicht zeigt dir aber nie Mappen, die du am Mappentyp nicht lesen darfst.

Das merkst du so:

- **Mappen, die du nicht lesen darfst**, tauchen in Listen, Suche, Zählern und Favoriten nicht auf. Verweist eine Mappe auf eine solche, steht dort *nicht sichtbare Mappe* ohne Link.
- **Ohne Bearbeiten** zeigt eine Mappe ihre Felder und Dokumente nur an; unten steht „Nur lesen“. Notizen und Aufgaben gehen trotzdem.
- **Ohne Löschen** ist „Mappe löschen“ gesperrt (mit Schloss und „Warum ist Löschen gesperrt?“), **ohne Anlegen** fehlt „+ Neu“, **ohne Passwörter sehen** fehlt das Auge an Passwortfeldern.
- **Ohne Exportieren** fehlen in einer Ansicht die Knöpfe zum Exportieren; Ansichten, die du nicht sehen darfst, fehlen im Baum.
- Hängen deine Rechte von einem Feld ab (etwa „Verantwortlich“) und würdest du dir mit einer Änderung selbst das Lesen oder Bearbeiten nehmen, fragt Ablago vor dem Speichern nach.
- Bei der Auswahl von Benutzern (Verantwortlich, Erwähnungen, Vertretung, Aufgaben) erscheinen nur die, die du sehen darfst.
- Deinen **Papierkorb** siehst du immer; was du daraus wiederherstellst, siehst du danach aber nur, wenn du die Mappe lesen darfst.
