# E-Mail, PDF, Link und Stempel

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

## Weitergeben mit Stempel

Eine Ausweiskopie für den Vermieter, Unterlagen für die Hausverwaltung, ein Angebot als „Entwurf“: Beim Weitergeben kann das DMS einen **Stempel** oder ein **Wasserzeichen** auf die Kopie setzen – etwa „Kopie für Hausverwaltung Müller – 01.11.2026“. So ist klar, für wen und wofür die Kopie bestimmt ist, und eine missbräuchliche Weitergabe wird erschwert.

**Das gespeicherte Original bleibt immer unverändert.** Der Stempel entsteht nur in der Kopie, die das DMS hinausgibt.

Den Stempel gibt es an drei Stellen:

- **Herunterladen:** In der Liste der Dokumente neben **Herunterladen** der Knopf **Mit Stempel …**.
- **Per E-Mail versenden** (eine oder mehrere Mappen): unter den Anhängen das Kästchen **Mit Stempel**.
- **Exportieren** als ZIP oder PDF: im Exportdialog das Kästchen **Mit Stempel**.

Überall dort kannst du PDFs zusätzlich [verkleinert weitergeben](#verkleinert-weitergeben).

![Herunterladen mit Stempel](bilder/stempel-herunterladen.png)

So gehst du vor:

1. Wähle eine **Vorlage**, z. B. „Kopie für …“, „Nur zur Vorlage bei …“, „Entwurf“ oder „Vertraulich“. Die Vorlagen legt der Administrator fest.
2. Trage den **Empfänger** ein – er steht dort, wo im Text `{empfänger}` steht. Beim Versenden per E-Mail sind ohne Angabe die Adressen unter **An** der Empfänger.
3. Bei Bedarf änderst du den **Text**, die **Lage** (diagonal über die Seite als Wasserzeichen, Kopfzeile, Fußzeile oder Ecke oben rechts), die **Deckkraft** und ob der Stempel auf **alle Seiten** oder **nur die erste** kommt.
4. Auf Wunsch kommen **Seitenzahlen** („Seite 3 von 12“) und die **Archivnummer** des Dokuments als Fußzeile dazu – auch ohne Stempeltext.
5. **Herunterladen** (bzw. **Senden**, **Exportieren**).

Platzhalter im Text:

| Platzhalter | wird zu |
| --- | --- |
| `{datum}` | heutiges Datum, z. B. 01.11.2026 |
| `{empfänger}` | der Empfänger, den du angibst |
| `{benutzer}` | dein Name |
| `{mappe}` | Titel der Mappe |

Gut zu wissen:

- Stempeln lassen sich **PDFs** und **Bilder** (JPEG, PNG). Ein Bild wird dabei zu einem PDF mit einer Seite („Ausweis.jpg“ → „Ausweis.pdf“). Andere Dateien (z. B. Word) gehen beim Versenden und im Export ungestempelt mit; einzeln herunterladen mit Stempel geht bei ihnen nicht.
- Verschlüsselte PDFs lassen sich nicht stempeln.
- Die [Historie](zusammenarbeit.md#historie) der Mappe vermerkt jede Weitergabe mit Stempel, z. B. „weitergegeben: mit Stempel „Kopie für Hausverwaltung Müller – 01.11.2026“ an Hausverwaltung Müller (heruntergeladen: Ausweis.pdf)“. So lässt sich später nachweisen, wer welche Kopie bekommen hat. Bei E-Mails steht der Stempel im Eintrag der E-Mail; in der [Post](post.md#versendete-e-mails) liegt die gestempelte Kopie.
- **Vorschlag und Pflicht:** Für manche Mappentypen schlägt der Administrator einen Stempel vor – dann ist **Mit Stempel** schon angehakt. Ist der Stempel **Pflicht**, lässt er sich nicht abwählen: Dokumente dieses Mappentyps gibt es dann nur noch über **Herunterladen mit Stempel**; Herunterladen mehrerer Dokumente auf einmal ist dort ausgeschaltet.
- Das **Anzeigen** im DMS zeigt immer das Original.

!!! note "Wie sicher ist der Stempel?"
    Der Stempel wird als Inhalt der Seite gezeichnet, nicht als Kommentar oder Anmerkung, die man mit einem Klick löscht. Er sitzt im selben Inhalt wie der übrige Text der Seite. Wer sich mit PDF-Werkzeugen auskennt, kann ihn trotzdem entfernen – ein Stempel ist ein deutlicher Hinweis und erschwert Missbrauch, aber kein Kopierschutz. Schicke deshalb nur, was der Empfänger wirklich braucht.

## Verkleinert weitergeben

Viele E-Mail-Anbieter nehmen keine Anhänge über 10 bis 25 MB an. Beim Versenden per E-Mail (eine oder mehrere Mappen), beim **Exportieren** als ZIP oder PDF und beim **Herunterladen mit Stempel** gibt es deshalb das Kästchen **PDFs verkleinert senden** (bzw. *exportieren*, *herunterladen*) mit der Stufe **Bildschirm**, **Standard** (Vorgabe) oder **Druck** – dieselben Stufen wie bei [PDF verkleinern](dokumente.md#pdf-verkleinern).

- Verkleinert wird nur die **Kopie**, die hinausgeht. **Das gespeicherte Dokument bleibt unverändert.**
- Nur PDFs werden verkleinert; Bilder und andere Dateien gehen unverändert mit. Bringt es bei einem PDF weniger als 10 %, geht das Original.
- Mit Stempel wird **erst verkleinert, dann gestempelt** – der Stempel bleibt scharf.
- Die angezeigte Größe der Anhänge ist die vor dem Verkleinern; ob die E-Mail danach klein genug ist, prüft das DMS beim Senden. Ist das Kästchen an, darf die Auswahl darum auch größer als 50 MB sein.
- Die [Historie](zusammenarbeit.md#historie) vermerkt es, z. B. „weitergegeben: verkleinert (18,4 MB → 2,1 MB) (heruntergeladen: Scan.pdf)“ bzw. „…, verkleinert (…)“ im Eintrag der E-Mail. In der [Post](post.md#versendete-e-mails) liegt die verkleinerte Kopie.

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
