# E-Mail, PDF, Link und Stempel

Rechts neben dem Titel einer Mappe, neben dem Stern, steht das Menü **Mappe ▾** (früher „Aktionen“).

![Das Menü Mappe](bilder/aktionen.png)

## Per E-Mail versenden

1. **Mappe ▾ → Per E-Mail versenden**.
2. Trage bei **An** eine oder mehrere Adressen ein (durch Komma getrennt).
3. Prüfe den **Betreff** – vorgeschlagen sind Mappentyp und Titel – und schreibe bei Bedarf eine **Nachricht**.
4. Wähle unter **Anhänge**, welche Dokumente der Mappe mitgehen. Darunter steht, wie groß sie zusammen sind; ab 20 MB warnt Ablago, weil viele Mailserver größere E-Mails nicht annehmen; mehr als 50 MB lassen sich nicht versenden.
5. **Senden**.

Hängt an einem Dokument die [Original-E-Mail](post.md#original-e-mail), steht sie mit ihrem Kennzeichen in der Liste und geht mit – ein Klick auf ihr Kästchen wählt sie ab. **Die Original-E-Mail enthält alle Anhänge der Mail. Gehören nicht alle in diese Mappe, lös sie vorher oder lösch sie.**

![E-Mail aus einer Mappe](bilder/email.png)

Absender ist die Adresse von Ablago; **Antworten** des Empfängers gehen an deine E-Mail-Adresse.

Jede verschickte E-Mail legt Ablago als [Post](post.md#versendete-e-mails) ab – mit Empfängern, Betreff, Nachricht, Datum, den Anhängen, zugeordnet zur Mappe, aus der sie kam. Du findest sie unter **Post → Versendet**. In der [Historie](zusammenarbeit.md#historie) der Mappe steht sie mit einem Link. Die Anhänge belegen dabei keinen zusätzlichen Speicherplatz.

Steht dort „Der E-Mail-Versand ist nicht eingerichtet“, muss ein Administrator ihn erst in der Werkbank einrichten.

Versenden gibt Daten aus Ablago hinaus wie ein Export oder das Herunterladen. Deshalb gibt es **Per E-Mail versenden** und **Als PDF exportieren** nur bei Mappen, die du in mindestens einer Ansicht mit Exportrecht siehst. Fehlt beides im Menü, hat dir der Administrator dieses Recht nicht gegeben – dann kannst du die Dokumente auch nicht herunterladen (siehe [Ohne Exportrecht](dokumente.md#ohne-exportrecht)).

## Mehrere Mappen per E-Mail

Alle Belege eines Jahres an den Steuerberater, die Unterlagen zum Auto an die Versicherung: Das geht in **einer** E-Mail.

1. Wähle in einer Ansicht die Mappen aus – mit den Kästchen in der Liste oder **Alle … auswählen** (siehe [Mehrere Mappen auswählen](ablage.md#mehrere-mappen-auswahlen)).
2. In der Leiste über der Liste: **Per E-Mail …**.
3. **An**, **Betreff** und **Nachricht** wie bei einer Mappe.
4. Unter **Anhänge** wählst du:
    - **Angaben je Mappe als PDF** – je Mappe eine Datei „Titel.pdf“ mit allen Feldern (Passwörter nie). Vorausgewählt. Verlangt der Mappentyp einen Stempel, ist auch dieses PDF gestempelt.
    - **Dokumente:** **alle** Dokumente der Mappen, **keine** oder **Auswählen …** – dann stehen die Dokumente je Mappe mit Kästchen da. Bei **alle** steht eine [Original-E-Mail](post.md#original-e-mail) darunter mit eigenem Haken **Original-E-Mail mitnehmen**.
5. **Senden**.

Darunter steht wieder, wie groß die Anhänge zusammen sind (Warnung ab 20 MB, höchstens 50 MB – die PDFs mit den Angaben zählen mit). Für Stempel, Archivfassung und Verkleinern gelten dieselben Regeln wie bei einer Mappe. In eine E-Mail passen höchstens 100 Mappen.

Danach gibt es **eine** [Post](post.md#versendete-e-mails) unter **Post → Versendet**. Sie verweist unter „Zugeordnet zu“ auf alle versendeten Mappen und enthält, was verschickt wurde – die Dokumente und die PDFs mit den Angaben. In der [Historie](zusammenarbeit.md#historie) **jeder** versendeten Mappe steht die E-Mail mit Link.

Das Recht ist dasselbe wie bei einer einzelnen Mappe: Du musst **jede** Mappe in einer Ansicht mit Exportrecht sehen. Fehlt es bei einer, verschickt Ablago gar nichts und sagt, bei wie vielen Mappen es fehlt – eine E-Mail mit stillen Lücken gibt es nicht. Den Knopf **Per E-Mail …** gibt es deshalb nur in Ansichten, aus denen du exportieren darfst.

## Weitergeben mit Stempel

Eine Ausweiskopie für den Vermieter, Unterlagen für die Hausverwaltung, ein Angebot als „Entwurf“: Beim Weitergeben kann Ablago einen **Stempel** oder ein **Wasserzeichen** auf die Kopie setzen – etwa „Kopie für Hausverwaltung Müller – 01.11.2026“. So ist klar, für wen und wofür die Kopie bestimmt ist, und eine missbräuchliche Weitergabe wird erschwert.

**Das gespeicherte Original bleibt immer unverändert.** Der Stempel entsteht nur in der Kopie, die Ablago hinausgibt.

Den Stempel gibt es an drei Stellen:

- **Herunterladen:** In der Liste der Dokumente neben **Herunterladen** der Knopf **Mit Stempel …**.
- **Per E-Mail versenden** (eine oder mehrere Mappen): unter den Anhängen das Kästchen **Mit Stempel**.
- **Exportieren** als ZIP oder PDF: im Exportdialog das Kästchen **Mit Stempel**.

Überall dort kannst du PDFs zusätzlich [verkleinert weitergeben](#verkleinert-weitergeben).

![Herunterladen mit Stempel](bilder/stempel-herunterladen.png)

So gehst du vor:

1. Wähle eine **Vorlage**, z. B. „Kopie für …“, „Nur zur Vorlage bei …“, „Entwurf“ oder „Vertraulich“. Die Vorlagen legt der Administrator fest.
2. Trage den **Empfänger** ein – er steht dort, wo im Text `{empfänger}` steht. Beim Versenden per E-Mail sind ohne Angabe die Adressen unter **An** der Empfänger.
3. Bei Bedarf änderst du den **Text** (auch mehrzeilig), die **Lage** (diagonal über die Seite als Wasserzeichen, Kopfzeile, Fußzeile, Ecke oben rechts oder ein kleiner **Stempel** mit Rahmen), die **Deckkraft** und ob der Stempel auf **alle Seiten** oder **nur die erste** kommt. Ab 80 % Deckkraft weist Ablago darauf hin, dass der Stempel Inhalt verdecken kann.
4. **Wie Tinte – Schrift darunter bleibt lesbar** (meist schon eingeschaltet): Der Stempel färbt nur ein, Schwarzes bleibt schwarz – so bleiben Beträge und Daten darunter lesbar. Seitenzahlen und Archivnummer fügst du als Platzhalter in den Text ein, z. B. „Seite {seite} von {seiten}“ oder „{archivnummer}“.
5. **Herunterladen** (bzw. **Senden**, **Exportieren**).

Platzhalter im Text:

| Platzhalter | wird zu |
| --- | --- |
| `{datum}` | heutiges Datum, z. B. 01.11.2026 |
| `{empfänger}` | der Empfänger, den du angibst |
| `{benutzer}` | dein Name |
| `{mappe}` | Titel der Mappe |
| `{seite}` | Nummer der Seite, auf der der Stempel steht |
| `{seiten}` | Anzahl der Seiten des Dokuments |
| `{archivnummer}` | Archivnummer des Dokuments (leer, wenn es keine hat) |

Gut zu wissen:

- Stempeln lassen sich **PDFs** und **Bilder** (JPEG, PNG). Ein Bild wird dabei zu einem PDF mit einer Seite („Ausweis.jpg“ → „Ausweis.pdf“). Andere Dateien (z. B. Word) gehen beim Versenden und im Export ungestempelt mit; einzeln herunterladen mit Stempel geht bei ihnen nicht.
- Verschlüsselte PDFs lassen sich nicht stempeln.
- Die [Historie](zusammenarbeit.md#historie) der Mappe vermerkt jede Weitergabe mit Stempel, z. B. „weitergegeben: mit Stempel „Kopie für Hausverwaltung Müller – 01.11.2026“ an Hausverwaltung Müller (heruntergeladen: Ausweis.pdf)“. So lässt sich später nachweisen, wer welche Kopie bekommen hat. Bei E-Mails steht der Stempel im Eintrag der E-Mail; in der [Post](post.md#versendete-e-mails) liegt die gestempelte Kopie.
- **Vorschlag und Pflicht:** Für manche Mappentypen schlägt der Administrator einen Stempel vor – dann ist **Mit Stempel** schon angehakt. Ist der Stempel **Pflicht**, lässt er sich nicht abwählen: Dokumente dieses Mappentyps gibt es dann nur noch über **Herunterladen mit Stempel**; Herunterladen mehrerer Dokumente auf einmal ist dort ausgeschaltet.
- Das **Anzeigen** in Ablago zeigt immer das Original.

!!! note "Wie sicher ist der Stempel?"
    Der Stempel wird als Inhalt der Seite gezeichnet, nicht als Kommentar oder Anmerkung, die man mit einem Klick löscht. Er sitzt im selben Inhalt wie der übrige Text der Seite. Wer sich mit PDF-Werkzeugen auskennt, kann ihn trotzdem entfernen – ein Stempel ist ein deutlicher Hinweis und erschwert Missbrauch, aber kein Kopierschutz. Schicke deshalb nur, was der Empfänger wirklich braucht.

## Verkleinert weitergeben

Viele E-Mail-Anbieter nehmen keine Anhänge über 10 bis 25 MB an. Beim Versenden per E-Mail (eine oder mehrere Mappen), beim **Exportieren** als ZIP oder PDF und beim **Herunterladen mit Stempel** gibt es deshalb das Kästchen **PDFs verkleinert senden** (bzw. *exportieren*, *herunterladen*) mit der Stufe **Bildschirm**, **Standard** (Vorgabe) oder **Druck** – dieselben Stufen wie bei [PDF verkleinern](dokumente.md#pdf-verkleinern).

- Verkleinert wird nur die **Kopie**, die hinausgeht. **Das gespeicherte Dokument bleibt unverändert.**
- Nur PDFs werden verkleinert; Bilder und andere Dateien gehen unverändert mit. Bringt es bei einem PDF weniger als 10 %, geht das Original.
- Mit Stempel wird **erst verkleinert, dann gestempelt** – der Stempel bleibt scharf.
- Die angezeigte Größe der Anhänge ist die vor dem Verkleinern; ob die E-Mail danach klein genug ist, prüft Ablago beim Senden. Ist das Kästchen an, darf die Auswahl darum auch größer als 50 MB sein.
- Die [Historie](zusammenarbeit.md#historie) vermerkt es, z. B. „weitergegeben: verkleinert (18,4 MB → 2,1 MB) (heruntergeladen: Scan.pdf)“ bzw. „…, verkleinert (…)“ im Eintrag der E-Mail. In der [Post](post.md#versendete-e-mails) liegt die verkleinerte Kopie.

## Als PDF exportieren

**Mappe ▾ → Als PDF exportieren** öffnet den Druckdialog des Browsers mit der **Druckansicht** der Mappe: Titel, alle Angaben, die Liste der Dokumente und die Notizen. Wähle als Drucker **Als PDF speichern** (bzw. „Microsoft Print to PDF“ unter Windows) – oder drucke sie gleich auf Papier.

Passwörter erscheinen auch dort nur als „••••••••“.

## Brief aus Vorlage { #brief-aus-vorlage }

Für Briefe, die immer gleich aussehen – etwa eine **Kündigung** –, bringen Pakete **Text-Vorlagen** mit, z. B. das Paket Verträge an jeder Vertragsart. **Mappe ▾ → Brief aus Vorlage …** zeigt die Vorlagen, die zu dieser Mappe passen: an der Mappe selbst und an Mappen, auf die sie verweist (beim Vertrag also an seiner Vertragsart).

- **Vorher sehen, was fehlt:** Der Dialog nennt Briefkopf und Empfänger und die Angaben, die noch fehlen, z. B. „2 Angaben fehlen: Vertragsnummer, Kundennummer“. Ein Klick auf eine Angabe springt zum Feld der Mappe. Du kannst den Brief auch trotzdem erstellen – dann steht im Brief eine sichtbare Lücke wie **[Vertragsnummer]**.
- **Als Dokument ablegen** legt den Brief als PDF in das gewählte Register der Mappe (ohne Wahl ins Register „Dokumente“), daneben den ausgefüllten Text als `.md`. Dafür brauchst du das Recht Bearbeiten an der Mappe. Die Vorlage selbst bleibt, wie sie ist.
- **PDF herunterladen** gibt dir nur das PDF. Das ist [Weitergeben](#weitergeben-mit-stempel) wie beim Herunterladen eines Dokuments und braucht das Exportrecht (E) in einer Ansicht, die die Mappe zeigt.

**Wie der Brief aussieht:** A4 im Aufbau ähnlich DIN 5008 – oben rechts der **Briefkopf**, darunter die kleine Absenderzeile und die **Anschrift** (passend für Fensterumschläge), rechts **Ort und Datum**, dann der **Betreff** fett und der Text. Der Briefkopf kommt von der Person bzw. Organisation im Feld *Kunde* (Kennung `an`) – ist es leer, von der [eigenen Organisation](https://help.ablago.app/admin/aktuell/organisation/) (nur Name, Anschrift, Telefon und E-Mail). Die Anschrift kommt von der Mappe im Feld *Anbieter* bzw. *Rechnungssteller* (Kennung `von`). Datum und Beträge stehen im Format der Sprache der Vorlage, z. B. 31.12.2026 und 650,00 €. Das PDF ist getaggt (Überschriften, Absätze, Listen in Lesereihenfolge, Sprache und Titel), damit Vorleseprogramme es gut lesen können. Die Schrift ist Noto Sans: Namen wie „Şahin“, „Łódź“ oder „Nguyễn“ und griechische oder kyrillische Buchstaben stehen richtig im Brief – genauso im Stempel, im Export und auf Aufklebern. Zeichen, die die Schrift nicht kennt (z. B. Arabisch, Chinesisch, Emoji), erscheinen als „�“.

**Nur, was du sehen darfst:** Eingesetzt werden nur Angaben, die du lesen darfst. Darfst du z. B. die Organisation des Anbieters nicht sehen, bleiben ihre Anschrift und ihre Kundennummer Lücken. **Passwörter** kommen nie in einen Brief. Werte erscheinen genau so, wie sie in der Mappe stehen – Sternchen oder geschweifte Klammern in einem Feld werden nicht zu Formatierung.

Eigene Vorlagen kannst du auch selbst schreiben: als Markdown-Datei (`.md`) im Register **Vorlagen** einer Mappe, auf die deine Mappen verweisen (z. B. einer Vertragsart). Wie Platzhalter aussehen, steht im [Entwicklerhandbuch unter Text-Vorlagen](https://help.ablago.app/entwickler/aktuell/pakete/#text-vorlagen-schreiben).

## Aktionen von Paketen { #aktionen-von-paketen }

Pakete können eigene Einträge ins Menü **Mappe ▾** bringen, z. B. **Vorlage hinzufügen** am Vertrag (Paket Verträge) oder **Als bezahlt markieren** an einer Rechnung. Du erkennst sie am Paketsymbol und am Namen des Pakets dahinter; sie stehen unter den eingebauten Einträgen.

- **Nur, was du darfst:** Eine Aktion steht nur im Menü, wenn du an dieser Mappe genau die Rechte hast, die sie braucht – „Als XML exportieren“ geht also auch ohne Bearbeiten, „Als bezahlt markieren“ nicht.
- **Gesperrt mit Grund:** Fehlt der Mappe noch etwas, steht die Aktion grau da, mit dem Grund darunter, z. B. „Erst eine Vertragsart wählen“.
- **Dialog des Pakets:** Fragt das Paket etwas nach (höchstens zweimal), erscheint ein Blatt mit gestricheltem Rand und **„Aktion von …“** im Kopf – so siehst du immer, welches Paket fragt. Ein Paket fragt dort **nie nach deinem Passwort**; tut es scheinbar doch, ist etwas faul.
- **Ergebnis:** Danach steht, was geschehen ist, z. B. „Kündigung als Dokument hinzugefügt“, mit **Dokument öffnen** bzw. **Herunterladen**. Herunterladen ist [Weitergeben](#weitergeben-mit-stempel) und braucht das Exportrecht (E); ein Pflicht-Stempel des Mappentyps gilt auch hier.
- **Nachvollziehbar:** Jede Ausführung steht in der **Historie** der Mappe – mit dir und dem Paket.

Das Paket handelt in deinem Auftrag: Es kann nie mehr, als du selbst an der Mappe kannst, und nie mehr, als es bei der Installation angekündigt hat. Antwortet ein Paket gerade nicht, steht „Das Paket … antwortet gerade nicht“ – dann später noch einmal.

**Vorlage hinzufügen** (Paket Verträge) öffnet [Brief aus Vorlage](#brief-aus-vorlage) mit den Vorlagen des Pakets – im Aussehen einer Paket-Aktion.

## Link kopieren

**Mappe ▾ → Link kopieren** legt einen Link auf die Mappe in die Zwischenablage, den du per Mail oder Chat an jemanden mit eigenem Zugang zu Ablago schicken kannst. Der Link nennt die Mappe nicht über eine Nummer, sondern über ihre Angaben, z. B.

```
http://nas.home.arpa:8080/ablage/link?typ=vertrag&vertragsnummer=SV-4711
```

![Link kopiert](bilder/link-kopieren.png)

- Ablago nimmt dafür eine Angabe, die es nur einmal gibt (z. B. die Vertragsnummer). Gibt es keine, nimmt es die Angaben, aus denen der Titel entsteht. Passen dann mehrere Mappen, zeigt der Link die Liste und öffnet die erste.
- Lässt sich nicht kopieren (manche Browser erlauben das ohne HTTPS nicht), steht der Link zum Markieren da.
- Wer den Link öffnet und nicht angemeldet ist, meldet sich an und landet dann direkt bei der Mappe.
- Fehlt der Menüpunkt, hat die Mappe keine Angabe, über die sich ein Link bilden lässt. Die Adresse im Browser funktioniert immer.

Solche Links kannst du auch selbst schreiben, etwa für „alle offenen Rechnungen“. Wie, steht im [Administratorhandbuch](https://help.ablago.app/admin/aktuell/direktlinks/).
