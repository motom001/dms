# Mappen

Eine Mappe sammelt alles zu einer Sache: die Angaben, die Dokumente und die Verbindungen zu anderen Mappen.

![Geöffnete Mappe mit Registern](bilder/ablage.png)

## Aufbau einer Mappe

Oben steht der **Titel** der Mappe. Ihn musst du nicht selbst schreiben: Das DMS setzt ihn aus den Angaben zusammen, zum Beispiel aus Rechnungsnummer und Datum – „R-2026-117 vom 02.03.2026“. Ändert sich eine Angabe, ändert sich der Titel mit.

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
    Steht an einer Mappe **Archiv · aufbewahren bis 31.12.JJJJ**, muss sie bis dahin aufbewahrt werden: Bis zu diesem Tag lassen sich weder die Mappe noch ihre Dokumente löschen; Dokumente ersetzt du als neue Version. Danach darf sie löschen, wer das Recht dazu hat; Administratoren finden alle abgelaufenen Mappen gesammelt unter **Werkbank → Darf weg**.

!!! info "Nur passende Mappen"
    Manche Verweisfelder bieten nur bestimmte Mappen an, z. B. beim Feld *Arzt* nur Vertragspartner, die Ärzte sind. Steht neben einer gewählten Mappe „passt nicht mehr zum Filter“, bleibt sie gültig; neu wählen kannst du nur, was passt.

!!! info "Fortlaufende Nummern"
    Steht an einem Feld „Wird beim Speichern vergeben“, bekommt die Mappe dort beim Speichern automatisch die nächste Nummer, z. B. eine Rechnungsnummer. Die Nummer lässt sich danach nicht mehr ändern.

![Neue Rechnung anlegen](bilder/mappe-neu.png)

Stimmt etwas nicht – ein Pflichtfeld ist leer, eine Zahl zu groß, eine Nummer schon vergeben –, steht der Grund direkt am Feld, und es wird nichts gespeichert.

### Die Felder

| Feld | So gibst du es ein |
| --- | --- |
| Text, Langtext | frei; manche Texte haben eine Höchstlänge oder müssen eindeutig sein |
| Formatierter Text | mit Werkzeugleiste: fett, kursiv, Überschrift, Liste, nummerierte Liste, Zitat, Link; **@** erwähnt jemanden (siehe unten) |
| Zahl | mit Komma, z. B. `12,5` |
| Betrag | Zahl und Währung, z. B. `98,00 EUR` |
| Datum | über den Kalender oder als Datum |
| Ja/Nein | Haken setzen |
| Auswahlliste | einen Wert (oder mehrere) aus der Liste wählen |
| Verweis | eine andere Mappe suchen und wählen (siehe unten) |
| Passwort | eintippen; gespeichert wird es verschlüsselt (siehe unten) |

### Formatierter Text

Manche längeren Texte lassen sich formatieren. Über dem Feld steht eine kleine **Werkzeugleiste**: Markiere Text und klicke auf **F** (fett), *K* (kursiv), eine Überschrift, eine Liste, eine nummerierte Liste, ein Zitat oder einen Link. Mit **Schreiben** und **Vorschau** wechselst du zwischen Eingabe und fertiger Ansicht. Im Feld steht dann eine einfache Schreibweise, z. B. `**fett**` – das ist richtig so. **Vorschau** zeigt, wie es aussieht.

![Formatierter Text mit Werkzeugleiste](bilder/formatiert.png)

Tippst du **@** und die ersten Buchstaben eines Namens, wählst du einen Benutzer aus. Er bekommt dann eine [Aufgabe](eingang.md) zu dieser Mappe.

In Listen und in der Suche erscheint der Text ohne Formatierung.

### Passwörter

In einem **Passwortfeld** (z. B. das Kennwort eines Kundenportals) steht nach dem Speichern nur „••••••••“. Das **Auge** zeigt das Passwort; jedes Anzeigen hält das DMS in der Historie der Mappe fest (wer, wann, welche Mappe – nicht das Passwort). **Ändern** nimmt ein neues Passwort auf, **Passwort entfernen** löscht es beim Speichern (bis dahin geht **Rückgängig**).

![Passwortfeld](bilder/passwortfeld.png)

Passwörter erscheinen nie im Titel, in Listen oder in der Suche. Steht am Feld „nicht möglich“, hat ein Administrator noch keinen Schlüssel für Passwörter eingerichtet.

### Auf andere Mappen verweisen

Ein **Verweis** verbindet zwei Mappen – die Rechnung mit ihrem Vertrag, den Vertrag mit dem Vertragspartner. Tippe in das Feld ein paar Buchstaben des Titels und wähle die passende Mappe aus den Vorschlägen. Bei Feldern, die mehrere Verweise erlauben, wiederholst du das.

Gibt es die Mappe noch nicht, führt **+ … anlegen** unter dem Feld direkt zum Anlegen.

Ein Klick auf einen gesetzten Verweis öffnet die andere Mappe.

## Ändern

Öffne die Mappe, ändere die Angaben und klicke auf **Mappe speichern**. Solange etwas nicht gespeichert ist, steht unten „Ungespeicherte Änderungen“. **Änderungen verwerfen** stellt den gespeicherten Stand wieder her.

Willst du die Mappe mit ungespeicherten Änderungen verlassen, fragt das DMS nach.

Neben dem Titel stehen der Stern für die [Favoriten](ablage.md#favoriten) und das Menü **Mappe ▾** (Aufgabe vergeben, Erinnern, per E-Mail versenden, als PDF exportieren, Link kopieren). Bei jeder Mappe gibt es außerdem die Register **Notizen** (mit Zahl) und **Historie** – siehe [Notizen, Erwähnungen, Historie](zusammenarbeit.md) und [E-Mail, PDF und Link](versenden.md). Am Handy rollt die Reihe der Register waagerecht; ein Schatten am Rand zeigt, dass weitere folgen. Menüs wie **Mappe ▾**, **+ Neu** und dein Benutzermenü öffnen am Handy als Blatt von unten mit großen Einträgen; tippst du daneben, schließt es. Dort steht am Handy auch **Mappe löschen …**. Die Leiste mit **Verwerfen** und **Speichern** erscheint am Handy erst, wenn du etwas geändert hast.

Manche Angaben sind nur zum Lesen da und haben einen gestrichelten Rahmen – zum Beispiel Name und E-Mail-Adresse in der Mappe eines Benutzers. Daneben steht, wo man sie ändert.

## Verknüpfungen

Das Register **Verknüpfungen** zeigt alle Mappen, die auf diese Mappe verweisen. Beim Vertragspartner siehst du so seine Verträge und Rechnungen, beim Vertrag seine Rechnungen – ohne dass du sie dort eintragen musst.

![Die Verträge eines Vertragspartners](bilder/verknuepfungen.png)

Je nach Einrichtung erscheinen die Mappen einer Gruppe als einfache Liste der Titel oder als **Tabelle** mit Spalten, etwa die Rechnungen mit Betrag, Datum und *bezahlt*. Ein Klick auf eine Zeile öffnet die Mappe.

![Rechnungen eines Vertragspartners als Tabelle](bilder/verknuepfungen-tabelle.png)

Mit **+ … anlegen** in der Überschrift einer Gruppe legst du direkt eine neue Mappe an, die schon auf diese Mappe verweist – zum Beispiel eine neue Rechnung zu diesem Vertrag.

Bei einer neuen Mappe ist das Register noch leer: Verknüpfungen entstehen erst, wenn die Mappe gespeichert ist und andere auf sie verweisen.

!!! info "Zugehörigkeit oder Bezug"
    Neben jedem Verweis steht, welcher Art er ist. **Zugehörigkeit** heißt: gehört dazu (die Rechnung gehört zum Vertrag). **Bezug** heißt: hat nur damit zu tun (die Rechnung kommt von diesem Aussteller). Das hilft bei Auswertungen wie „alles zum Haus“, damit dort nicht jede Rechnung desselben Handwerkers auftaucht – und beim [Löschen mit verknüpften Mappen](#mit-verknupften-mappen-loschen): Mitgelöscht wird nur, was dazugehört.

## Löschen

Unten links in der Mappe steht **Mappe löschen**. Nach einer Rückfrage kommt die Mappe mit ihren Dokumenten in den [Papierkorb](ablage.md#papierkorb); dort lässt sie sich eine Zeit lang wiederherstellen. Ist der Papierkorb ausgeschaltet, ist sie sofort endgültig weg.

In der Rückfrage wählst du den **Grund** – *Nicht mehr nötig*, *Frist abgelaufen*, *Auf Verlangen der betroffenen Person* oder *Sonstiges* – und kannst eine kurze Anmerkung dazuschreiben. Beides steht im Löschprotokoll, mit dem dein Administrator nachweisen kann, dass und warum gelöscht wurde; Titel und Inhalte der Mappe stehen dort nicht. Schreib in die Anmerkung deshalb keine Namen.

Geht Löschen gerade nicht, ist der Knopf ausgegraut, und daneben steht **Warum nicht?**. Ein Klick darauf klappt die Begründung direkt am Knopf auf:

- **Es verweisen noch andere Mappen darauf.** Die Begründung zählt sie auf – mit Links dorthin (bei vielen die ersten acht und „und … weitere“). Entferne zuerst dort den Verweis. So kann kein Vertrag verschwinden, zu dem noch Rechnungen gehören. Verschickte E-Mails und andere [Post](post.md) halten das Löschen nicht auf.
- **Archivmodus:** Die Aufbewahrungsfrist läuft noch; vorher lässt sich die Mappe von niemandem löschen.
- **Berechtigungen:** Du darfst Mappen dieses Mappentyps nicht löschen. Das legt ein Administrator fest.

![Ausgegrauter Knopf „Mappe löschen“ mit aufgeklappter Begründung „Warum nicht?“](bilder/mappe-loeschen-warum.png)

Benutzer und Systemrollen lassen sich in der Ablage gar nicht löschen; dort fehlt der Knopf.

### Mit verknüpften Mappen löschen

Willst du eine Mappe **mit allem, was an ihr hängt**, loswerden – etwa einen Vertragspartner, mit dem es seit Jahren nichts mehr gab, samt Verträgen, Rechnungen und Dokumenten –, nimm **Mappe ▾ → Mit verknüpften Mappen löschen …** (unten im Menü, rot). Lässt sich die Mappe allein nicht löschen, weil noch andere auf sie verweisen, steht derselbe Weg auch unter **Warum nicht?** am Löschknopf. Du brauchst dafür das Recht, die Mappe zu löschen.

![Vorschau als Baum: was mitgeht und was bleibt](bilder/mit-verknuepften-loeschen.png)

1. **Vorschau als Baum:** Das DMS sammelt alle Mappen, die zu dieser Mappe gehören, und die Mappen, die wiederum zu diesen gehören (Vertragspartner → Verträge → Rechnungen → Lieferscheine …), mit der Zahl ihrer Dokumente. Die **Tiefe** stellst du ein (Vorgabe 5 Ebenen); Äste klappst du mit ▸/▾ auf und zu. Jede Mappe steht nur einmal da, auch bei Kreisen.
    - **Nur nach unten:** Mitgelöscht wird nur, was auf die gelöschte Mappe verweist. Mappen, auf die sie selbst verweist (z. B. eine Kategorie, ein Ablageort oder beim Löschen einer Rechnung der Vertragspartner), gehören nie dazu – auch nicht über eine mitgelöschte Mappe: Der Lieferschein einer Rechnung geht mit, sein Verweis auf den Vertragspartner wird aber nicht verfolgt.
    - **Nur über Zugehörigkeit:** Mitgelöscht wird nur über Verweise der [Verweisart](begriffe.md#verweisart) **Zugehörigkeit** (die Rechnung gehört zum Vertrag). Hängt eine Mappe nur über einen **Bezug** dran – z. B. ein Vertrag mit diesem Vertragspartner als *Ansprechpartner*, Post mit *Für* oder *Zugeordnet zu* –, bleibt sie; nur der Verweis wird entfernt. Was an ihr hängt, sammelt das DMS nicht.
2. **Kennzeichnungen** je Mappe:
    - ✅ **wird gelöscht**.
    - 📎 **nur über Bezug verbunden** – bleibt immer, nur der Verweis wird entfernt (dabei steht das Feld, z. B. „über Ansprechpartner (Bezug)“). Nimmst du den Haken weg, bleibt auch der Verweis – und damit die Mappe, auf die er zeigt.
    - 🔗 **hängt auch an anderen Mappen** – z. B. eine Rechnung, die zusätzlich auf einen anderen Vertrag verweist. Vorschlag: **nur den Verweis entfernen, Mappe behalten**; im Auswahlfeld kannst du sie stattdessen **mitlöschen**.
    - 🔒 **Aufbewahrungsfrist läuft noch** ([Archivmodus](begriffe.md#archivmodus)) – wird **nie** gelöscht; dabei steht, ab wann sie weg darf.
    - ⛔ **kein Löschrecht** – wird nie gelöscht.
3. **Auswählen:** Jede Mappe hat ein Kästchen (Vorgabe: an). Nimmst du den Haken weg, bleibt sie. **Was bleibt, hält fest, worauf es verweist:** Bleibt eine Rechnung (abgewählt, gesperrt oder ohne Recht), bleiben auch ihr Vertrag und der Vertragspartner – dabei steht, warum. Dasselbe gilt, wenn eine Mappe außerhalb der Vorschau (zu tief, nicht sichtbar) noch darauf verweist. Verweise werden nur entfernt, wo du „nur Verweis entfernen“ gewählt hast.
4. **Zusammenfassung:** Unten steht, was geschieht, z. B. „37 Mappen und 112 Dokumente werden in den Papierkorb gelegt; 3 bleiben wegen Aufbewahrungsfrist; 2 Verweise werden entfernt.“
5. **Bestätigen:** Zum Bestätigen tippst du den Namen der Mappe ein.

**Erinnerung zum Fristende:** Bleibt die Mappe stehen, weil Mappen darunter noch in der Aufbewahrungsfrist sind, legt das DMS dir an ihr eine [Erinnerung](begriffe.md#erinnerung) zum Tag nach dem spätesten Fristende an – „Müller GmbH kann ab 01.01.2032 gelöscht werden – „Mit verknüpften Mappen löschen“ erneut ausführen“. An dem Tag steht sie unter „Zu erledigen“; ein Klick öffnet die Mappe, und du löschst erneut.

Alles geht als **ein Vorgang** in den [Papierkorb](ablage.md#papierkorb): Dort stellst du mit **Alle wiederherstellen** alle Mappen und Dokumente gemeinsam wieder her – auch die Verweise untereinander und die Verweise, die an bleibenden Mappen entfernt wurden. In der Historie jeder Mappe steht „in den Papierkorb gelegt – mit verknüpften Mappen gelöscht“ mit der Zahl der Mappen und Dokumente. Ist der Papierkorb ausgeschaltet, ist das Löschen sofort endgültig; die Rückfrage sagt das.

Fehlt der Knopf, dürfen Mappen dieses Mappentyps nicht gelöscht werden.

## Was du sehen und ändern darfst

Ein Administrator kann je Mappentyp festlegen, wer Mappen anlegen, lesen, bearbeiten, löschen und Passwörter darin sehen darf – zum Beispiel, dass nur die Buchhaltung Rechnungen bearbeitet oder dass vertrauliche Mappen nur ihre Verantwortlichen sehen. Was für dich gilt, steht in deinem Profil unter [Meine Rechte](profil.md#meine-rechte).

Auch an jeder **Ansicht** kann er Rechte setzen: wer sie **sieht**, wer dort mit **+ Neu** **anlegen** darf und wer aus ihr **exportieren** darf. Eine Ansicht zeigt dir aber nie Mappen, die du am Mappentyp nicht lesen darfst.

Das merkst du so:

- **Mappen, die du nicht lesen darfst**, tauchen in Listen, Suche, Zählern und Favoriten nicht auf. Verweist eine Mappe auf eine solche, steht dort *nicht sichtbare Mappe* ohne Link.
- **Ohne Bearbeiten** zeigt eine Mappe ihre Felder und Dokumente nur an; unten steht „Nur lesen“. Notizen und Aufgaben gehen trotzdem.
- **Ohne Löschen** ist „Mappe löschen“ ausgegraut (mit „Warum nicht?“), **ohne Anlegen** fehlt „+ Neu“, **ohne Passwörter sehen** fehlt das Auge an Passwortfeldern.
- **Ohne Exportieren** fehlen in einer Ansicht die Knöpfe zum Exportieren; Ansichten, die du nicht sehen darfst, fehlen im Baum.
- Hängen deine Rechte von einem Feld ab (etwa „Verantwortlich“) und würdest du dir mit einer Änderung selbst das Lesen oder Bearbeiten nehmen, fragt das DMS vor dem Speichern nach.
- Bei der Auswahl von Benutzern (Verantwortlich, Erwähnungen, Vertretung, Aufgaben) erscheinen nur die, die du sehen darfst.
- Deinen **Papierkorb** siehst du immer; was du daraus wiederherstellst, siehst du danach aber nur, wenn du die Mappe lesen darfst.
