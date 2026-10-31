# E-Mail, PDF und Link

Rechts über den Registern einer Mappe steht das Menü **Aktionen**.

![Das Menü Aktionen](bilder/aktionen.png)

## Per E-Mail versenden

1. **Aktionen → Per E-Mail versenden**.
2. Trage bei **An** eine oder mehrere Adressen ein (durch Komma getrennt).
3. Prüfe den **Betreff** – vorgeschlagen sind Mappentyp und Titel – und schreibe bei Bedarf eine **Nachricht**.
4. Wähle unter **Anhänge**, welche Dokumente der Mappe mitgehen. Darunter steht, wie groß sie zusammen sind; ab 20 MB warnt das DMS, weil viele Mailserver größere E-Mails nicht annehmen; mehr als 50 MB lassen sich nicht versenden.
5. **Senden**.

![E-Mail aus einer Mappe](bilder/email.png)

Absender ist die Adresse des DMS; **Antworten** des Empfängers gehen an deine E-Mail-Adresse.

Jede verschickte E-Mail legt das DMS als [Post](post.md#versendete-e-mails) ab – mit Empfängern, Betreff, Nachricht, Datum, den Anhängen, zugeordnet zur Mappe, aus der sie kam. Du findest sie unter **Post → Versendet**. In der [Historie](zusammenarbeit.md#historie) der Mappe steht sie mit einem Link. Die Anhänge belegen dabei keinen zusätzlichen Speicherplatz.

Steht dort „Der E-Mail-Versand ist nicht eingerichtet“, muss ein Administrator ihn erst in der Werkbank einrichten.

Versenden gibt Daten aus dem DMS hinaus wie ein Export. Deshalb gibt es **Per E-Mail versenden** und **Als PDF exportieren** nur bei Mappen, die du in mindestens einer Ansicht mit Exportrecht siehst. Fehlt beides im Menü, hat dir der Administrator dieses Recht nicht gegeben.

## Mehrere Mappen per E-Mail

Alle Belege eines Jahres an den Steuerberater, die Unterlagen zum Auto an die Versicherung: Das geht in **einer** E-Mail.

1. Wähle in einer Ansicht die Mappen aus – mit den Kästchen in der Liste oder **Alle … auswählen** (siehe [Mehrere Mappen auswählen](ablage.md#mehrere-mappen-auswahlen)).
2. In der Leiste über der Liste: **Per E-Mail …**.
3. **An**, **Betreff** und **Nachricht** wie bei einer Mappe.
4. Unter **Anhänge** wählst du:
    - **Angaben je Mappe als PDF** – je Mappe eine Datei „Titel.pdf“ mit allen Feldern (Passwörter nie). Vorausgewählt.
    - **Dokumente:** **alle** Dokumente der Mappen, **keine** oder **Auswählen …** – dann stehen die Dokumente je Mappe mit Kästchen da.
5. **Senden**.

Darunter steht wieder, wie groß die Anhänge zusammen sind (Warnung ab 20 MB, höchstens 50 MB). In eine E-Mail passen höchstens 100 Mappen.

Danach gibt es **eine** [Post](post.md#versendete-e-mails) unter **Post → Versendet**. Sie verweist unter „Zugeordnet zu“ auf alle versendeten Mappen und enthält, was verschickt wurde – die Dokumente und die PDFs mit den Angaben. In der [Historie](zusammenarbeit.md#historie) **jeder** versendeten Mappe steht die E-Mail mit Link.

Das Recht ist dasselbe wie bei einer einzelnen Mappe: Du musst **jede** Mappe in einer Ansicht mit Exportrecht sehen. Fehlt es bei einer, verschickt das DMS gar nichts und sagt, bei wie vielen Mappen es fehlt – eine E-Mail mit stillen Lücken gibt es nicht. Den Knopf **Per E-Mail …** gibt es deshalb nur in Ansichten, aus denen du exportieren darfst.

## Als PDF exportieren

**Aktionen → Als PDF exportieren** öffnet den Druckdialog des Browsers mit der **Druckansicht** der Mappe: Titel, alle Angaben, die Liste der Dokumente und die Notizen. Wähle als Drucker **Als PDF speichern** (bzw. „Microsoft Print to PDF“ unter Windows) – oder drucke sie gleich auf Papier.

Passwörter erscheinen auch dort nur als „••••••••“.

## Link kopieren

**Aktionen → Link kopieren** legt einen Link auf die Mappe in die Zwischenablage, den du per Mail oder Chat an jemanden mit eigenem Zugang zum DMS schicken kannst. Der Link nennt die Mappe nicht über eine Nummer, sondern über ihre Angaben, z. B.

```
http://nas:8080/ablage/link?typ=vertrag&vertragsnummer=SV-4711
```

![Link kopiert](bilder/link-kopieren.png)

- Das DMS nimmt dafür eine Angabe, die es nur einmal gibt (z. B. die Vertragsnummer). Gibt es keine, nimmt es die Angaben, aus denen der Titel entsteht. Passen dann mehrere Mappen, zeigt der Link die Liste und öffnet die erste.
- Lässt sich nicht kopieren (manche Browser erlauben das ohne HTTPS nicht), steht der Link zum Markieren da.
- Wer den Link öffnet und nicht angemeldet ist, meldet sich an und landet dann direkt bei der Mappe.
- Fehlt der Menüpunkt, hat die Mappe keine Angabe, über die sich ein Link bilden lässt. Die Adresse im Browser funktioniert immer.

Solche Links kannst du auch selbst schreiben, etwa für „alle offenen Rechnungen“. Wie, steht im [Administratorhandbuch](https://motom001.github.io/dms/admin/aktuell/direktlinks/).
