# E-Mail, PDF und Link

Rechts über den Registern einer Mappe steht das Menü **Aktionen**.

![Das Menü Aktionen](bilder/aktionen.png)

## Per E-Mail versenden

1. **Aktionen → Per E-Mail versenden**.
2. Trage bei **An** eine oder mehrere Adressen ein (durch Komma getrennt).
3. Prüfe den **Betreff** – vorgeschlagen sind Mappentyp und Titel – und schreibe bei Bedarf eine **Nachricht**.
4. Wähle unter **Anhänge**, welche Dokumente der Mappe mitgehen. Darunter steht, wie groß sie zusammen sind; ab 20 MB warnt das DMS, weil viele Mailserver größere E-Mails nicht annehmen.
5. **Senden**.

![E-Mail aus einer Mappe](bilder/email.png)

Absender ist die Adresse des DMS; **Antworten** des Empfängers gehen an deine E-Mail-Adresse.

Jede verschickte E-Mail legt das DMS als [Post](post.md#versendete-e-mails) ab – mit Empfängern, Betreff, Nachricht, Datum, den Anhängen, zugeordnet zur Mappe, aus der sie kam. Du findest sie unter **Post → Versendet**. In der [Historie](zusammenarbeit.md#historie) der Mappe steht sie mit einem Link. Die Anhänge belegen dabei keinen zusätzlichen Speicherplatz.

Steht dort „Der E-Mail-Versand ist nicht eingerichtet“, muss ein Administrator ihn erst in der Werkbank einrichten.

## Als PDF exportieren

**Aktionen → Als PDF exportieren** öffnet den Druckdialog des Browsers mit einer aufgeräumten Fassung der Mappe: Titel, alle Angaben, die Liste der Dokumente und die Notizen. Wähle als Drucker **Als PDF speichern** (bzw. „Microsoft Print to PDF“ unter Windows) – oder drucke sie gleich auf Papier.

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

Solche Links kannst du auch selbst schreiben, etwa für „alle offenen Rechnungen“. Wie, steht im [Administratorhandbuch](https://motom001.github.io/dms/admin/direktlinks/).
