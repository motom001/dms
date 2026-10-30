# Post

Alles, was ins DMS kommt oder hinausgeht, ist **Post**: ein eingescannter Brief, ein hochgeladenes PDF, eine verschickte E-Mail. Später kommen Scans aus einem Eingangsordner und abgeholte E-Mails dazu. Du musst also nicht erst die passende Mappe suchen und das richtige Register wählen: Leg das Dokument als Post ab und **ordne es zu**, wenn du Zeit hast.

![Neue Post mit Zuordnen](bilder/post-zuordnen.png)

## Neue Post

Ganz oben in der Ablage steht die Sicht **Neue Post**. Sie zeigt alle Post, die noch niemand zugeordnet oder erledigt hat. Gibt es welche, ist die Zahl daneben farbig hervorgehoben, wie beim [Eingang](eingang.md).

Mit **+ Post** oben in der Liste wählst du eine oder mehrere Dateien aus. Sie kommen **zusammen in eine neue Post**, und die öffnet sich gleich. Am Handy bietet die Auswahl auch die Kamera an. Den Betreff nimmt das DMS aus dem ersten Dateinamen; ändern kannst du ihn jederzeit.

Unter der Sicht **Post** findest du alle Post, auch die zugeordnete und erledigte, mit den Untersichten **Eingegangen** und **Versendet**.

## Was an einer Post steht

| Feld | Bedeutung |
| --- | --- |
| **Betreff** | Titel der Post |
| **Stand** | *Neu* – noch nicht bearbeitet · *Zugeordnet* – gehört zu einer Mappe · *Erledigt* – nichts mehr zu tun |
| **Kanal** | wie sie ins DMS kam: *Hochgeladen*, *E-Mail*, *Scan*, *Ordner*, *Import*, *API*, *WebDAV* |
| **Richtung** | *Eingehend* oder *Ausgehend* |
| **Datum, Absender, Empfänger, Nachricht** | soweit bekannt |
| **Für** | wer sich darum kümmern soll |
| **Zugeordnet zu** | die Mappen, zu denen die Post gehört |

Kanal und *Zugeordnet zu* setzt das DMS selbst. Alles andere kannst du ändern wie bei jeder Mappe.

## Für jemanden

Trägst du bei **Für** einen Benutzer ein, steht die Post in seinem [Eingang](eingang.md) mit der Aufgabe **Neue Post**. Wird sie zugeordnet, erledigt oder an jemand anderen gegeben, erledigt sich die Aufgabe von selbst. Ist der Benutzer abwesend, bekommt sie sein Vertreter.

## Zuordnen

Oben in einer Post steht eine Leiste mit dem **Stand** und dem Knopf **Zuordnen …**:

1. Wähle den **Mappentyp**, z. B. *Rechnung*.
2. Wähle **vorhandene** und suche die Mappe, oder wähle **neue anlegen**.
3. Wähle die **Dokumente**, die mitgehen. Vorausgewählt sind alle. Hat der Mappentyp mehrere Dokumentenregister, wählst du das Register.
4. **Zuordnen**.

Danach liegen die Dokumente in der Mappe, und die Post verweist auf sie. Ihr Stand ist *Zugeordnet*. Im [Protokoll](zusammenarbeit.md#protokoll) beider Mappen steht, was passiert ist. Der Volltext der Dokumente zieht mit um.

Bei **neue anlegen** öffnet sich das Formular des Mappentyps. Betreff und Datum der Post sind als Vorschlag schon eingetragen. Nach **Mappe speichern** wird die Post der neuen Mappe zugeordnet.

**Kopie in der Post behalten** lässt die Dokumente zusätzlich in der Post liegen. Das kostet keinen Platz, denn das DMS speichert jede Datei nur einmal. Das ist praktisch, wenn ein Brief zu **mehreren** Mappen gehört, z. B. zur Rechnung und zum Vertrag. Du kannst eine Post beliebig oft zuordnen.

Ohne Zuordnung geht es auch: **Erledigt** für Werbung oder Dinge, die schon erledigt sind; **Wieder neu**, wenn doch noch etwas zu tun ist. Unnötige Post löschst du wie jede Mappe.

## Versendete E-Mails

Verschickst du eine Mappe [per E-Mail](versenden.md), legt das DMS die E-Mail als Post ab: Kanal *E-Mail*, Richtung *Ausgehend*, Stand *Erledigt*, zugeordnet zur Mappe. Betreff, Empfänger, Absender, Datum und Nachricht bleiben, wie sie verschickt wurden. Stand und *Für* kannst du ändern.

Wird eine Mappe gelöscht, bleibt die Post erhalten. Nur der Verweis auf diese Mappe entfällt.

## Wer darf was?

Wer Post sieht, anlegt, bearbeitet und löscht, regeln die [Berechtigungen](mappen.md#was-du-sehen-und-andern-darfst) des Typs *Post*. Zum Zuordnen brauchst du das Recht, die Post **und** die Zielmappe zu bearbeiten.
