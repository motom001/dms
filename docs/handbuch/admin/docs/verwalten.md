# Wer darf Ablago verwalten?

Ablago hat **kein eigenes Konto „Administrator“**. Verwalten ist ein Recht an einer **Person**: Lena arbeitet mit *einem* Konto, *einer* E-Mail-Adresse und *einem* Passwort – im Alltag in der Ablage, und wenn etwas einzurichten ist, bewusst im **Verwaltungsmodus**. So steht hinter jeder Verwaltungshandlung eine Person; ein gemeinsam genutztes Konto „admin“ gibt es nicht.

## Das Verwaltungsrecht { #das-verwaltungsrecht }

Unter **Werkbank → Benutzer → Person** steht im Bereich *Rollen und Rechte* der Abschnitt **Verwaltung**; gespeichert wird er mit **Benutzer speichern**:

- **Darf Ablago verwalten** – ohne diesen Haken gibt es für die Person weder die Werkbank noch den Eintrag „Ablago verwalten“.
- Darunter ein Baum mit den Bereichen der Werkbank, gegliedert nach den Gruppen der Leiste. Ganz oben steht **Gesamte Verwaltung**: alle Bereiche, auch solche, die in späteren Versionen dazukommen. [Nutzung](nutzung.md) steht nicht im Baum – das gehört immer zur Gesamten Verwaltung.
- Wer einen Bereich darf, darf alles darin. Die **Übersicht** der Werkbank sieht jede Person, die verwaltet – mit den Meldungen ihrer eigenen Bereiche.
- Der Server prüft dasselbe wie die Oberfläche: Einen Bereich ohne Recht erreicht man auch nicht über einen Link oder die Schnittstelle.

**Verwaltungsrechte vergeben oder entziehen** darf nur, wer selbst **Gesamte Verwaltung** hat – und jedes Mal mit einer frischen Anmeldung. Jede Änderung steht im [Protokoll](fehlersuche.md) mit Person, vorher und nachher; alle mit „Gesamte Verwaltung“ bekommen dazu eine E-Mail.

Wer nur den Bereich **Benutzer** hat, legt Personen an, setzt Passwörter zurück und pflegt Rollen und Abwesenheiten – aber nicht an Konten von Personen, die selbst verwalten, und Verwaltungsrechte vergibt er nicht.

!!! warning "Die Aufteilung schafft Ordnung – sie schützt nicht vor Absicht"
    Bereiche mit dem Zeichen **„Gibt Zugriff auf alle Daten“** führen auf Umwegen an alle Mappen: Mappentypen (Berechtigungen), Pakete, Automatisierungen, E-Mail und Adresse, Anmeldeschutz (Anmeldung über Anbieter), Sicherung (mit Wiederherstellen), Vollexport, Verschlüsselung und Datenbank-Anbindung. Außerdem sieht im Verwaltungsmodus jede Person alle Mappen. Teilrechte verhindern also Versehen („wer sich um die Postfächer kümmert, ändert nicht aus Versehen die Mappentypen“), aber nicht Missbrauch. Gib Verwaltungsrechte nur Personen, denen du vertraust.

### Mindestens eine Person behält „Gesamte Verwaltung“

Mindestens eine aktive Person, die sich anmelden kann (Passwort gesetzt oder schon einmal angemeldet), behält immer **Gesamte Verwaltung**. Die letzte kann sich das Recht nicht selbst nehmen, und sie lässt sich weder deaktivieren noch löschen. Gib es zuerst einer zweiten Person – am besten hat ohnehin immer eine zweite Person „Gesamte Verwaltung“, etwa für Urlaub oder Krankheit.

Darum empfiehlt Ablago nach der Einrichtung in der [Übersicht](uebersicht.md#bewusst-akzeptieren) eine **zweite Person mit Verwaltungsrecht**, solange nur eine Person verwalten darf: „Gut, wenn noch jemand verwalten kann, falls du mal nicht da bist.“ Die zweite Person lädst du unter *Benutzer* ein – sie bekommt einen Einladungslink –, danach setzt du bei ihr **Darf Ablago verwalten**. Mit **Nein, danke** ist die Empfehlung dauerhaft weg.

Kommt trotzdem niemand mehr hinein, führen der [Notfallcode vom Notfallblatt](was-ist-passiert.md#notfallcode) und die [RESCUE-Datei](notfall.md) zu einer Person mit Verwaltungsrecht. Der Notfallcode setzt nur das Passwort einer vorhandenen Person neu; niemandem wird dabei ein Recht entzogen.

### Was nie ein Verwaltungsrecht bekommt

- **API-Schlüssel** – auch nicht die von Personen mit „Gesamte Verwaltung“. Über die Schnittstelle und das [WebDAV-Laufwerk](webdav.md) arbeitet jede Person mit ihren Alltagsrechten. Verwaltet wird nur in der Oberfläche oder mit dem Befehl [`dms`](konsole.md) im Container.
- **Systemkonten** („Automatisierung“) und die **Dienstkonten der Pakete**.

## Der Verwaltungsmodus { #der-verwaltungsmodus }

Im Alltag arbeitet auch eine Person mit Verwaltungsrecht ohne diese Rechte – sie sieht nur, was die [Berechtigungen](berechtigungen.md) ihr erlauben. In die Verwaltung wechselt sie bewusst:

1. Benutzermenü (oben rechts) → direkt unter **Mein Konto**: **Ablago verwalten**.
2. **Erneut anmelden** – mit Passwort und, falls eingerichtet, dem Code der Zwei-Faktor-Anmeldung – oder mit einem [Passkey](anmeldeschutz.md#passkeys) (**Mit Passkey bestätigen**). Liegt die Anmeldung höchstens 10 Minuten zurück, entfällt die Abfrage. Wer sich nur über einen Anbieter anmeldet, meldet sich dort erneut an.
3. Ablago öffnet die Werkbank. Oben steht ein **roter Balken**: „Du verwaltest gerade Ablago. So solltest du nicht täglich arbeiten. Du siehst alle Mappen, auch gesperrte.“ mit dem Knopf **Verwaltung beenden**.

Der Modus **endet** mit **Verwaltung beenden** (Balken oder Benutzermenü) oder nach **15 Minuten ohne Aktivität**. Danach zeigt die Ablage sofort wieder, was du im Alltag siehst – Ansichten, Mappen und Benutzer –, ohne dass du die Seite neu laden musst. Läuft er während einer Bearbeitung ab, geht nichts verloren: Ablago fragt nur erneut nach der Anmeldung und speichert dann. Am selben Tag im selben Browser geht der **Wiedereinstieg mit einem Klick** („Wieder verwalten“) – gewählt werden muss er trotzdem.

Dieser Tagesmerker hängt an der Sitzung auf dem Server, nicht an einem Cookie. Er endet um Mitternacht, beim Abmelden, wenn die Sitzung von einem anderen Gerät beendet wird, beim Passwortwechsel, wenn sich die Zwei-Faktor-Anmeldung ändert und wenn das Verwaltungsrecht entzogen wird. In einer Vertretung („Als … anmelden“) gibt es keinen Verwaltungsmodus.

**Wer verwaltet gerade auch?** Sind weitere Personen zur selben Zeit im Verwaltungsmodus, steht in der Werkbank unter dem roten Balken zum Beispiel „Gerade auch im Verwaltungsmodus: Markus (seit 10:42)“ – bei mehreren alle, die eigene Person nie. So könnt ihr euch absprechen, bevor zwei dieselbe Konfiguration ändern. Der Hinweis ist **kein Schutz**: Davor bewahrt, dass Ablago beim Speichern eine zwischenzeitliche Änderung erkennt und nichts still überschreibt. Er erscheint nur in der Werkbank und nur im Modus, aktualisiert sich alle 10–15 Sekunden von selbst (das verlängert den eigenen Modus nicht) und verschwindet spätestens nach einer Minute, wenn der andere den Modus beendet oder er abläuft. Dienst- und Systemkonten erscheinen nie. Gemerkt wird dabei nichts – Beginn und Ende des Modus stehen wie bisher im [Protokoll](#protokoll).

Im Modus ist die **Ablage** wie sonst zu bedienen – zum Nachsehen und für die Fehlersuche –, mit allen Mappen. Die Startseite ist dann die Werkbank, ohne Modus die Ablage.

### Frische Anmeldung für heikle Handlungen { #frische-anmeldung }

Für die heikelsten Handlungen fragt Ablago **immer** das Passwort (und den Code) oder einen Passkey ab, auch mitten im Verwaltungsmodus. Danach gilt die Bestätigung 10 Minuten:

- Verwaltungsrechte vergeben oder entziehen
- Schlüssel erzeugen oder wechseln, Notfallblatt herunterladen
- Vollexport mit Passwörtern im Klartext
- Wiederherstellen einer Sicherung, eine Sicherung [herunterladen](sicherung.md#sicherung-herunterladen)
- Datenbank-Anbindung ändern
- Anmeldung über einen Anbieter ändern
- E-Mail-Versand ändern
- Notfallzugang aus dem Internet erlauben ([Anmeldeschutz](anmeldeschutz.md#notfallzugang))
- Zwei-Faktor-Anmeldung oder Passkeys einer Person zurücksetzen ([Benutzer](benutzer.md))

Fehlversuche zählen in den [Anmeldeschutz](anmeldeschutz.md) wie bei der Anmeldung selbst. Die Zwei-Faktor-Anmeldung bleibt freiwillig; vorschreiben lässt sie sich unter *Anmeldeschutz* weiter „für alle, die verwalten dürfen“.

## Spur im Verwaltungsmodus { #spur }

Öffnet jemand im Verwaltungsmodus eine Mappe, die er ohne Modus nicht lesen dürfte, steht in der **Historie der Mappe** „im Verwaltungsmodus: angesehen“ mit seinem Namen – ebenso beim Herunterladen, Ändern, Exportieren und Versenden per E-Mail. Beim ersten Öffnen weist Ablago darauf hin. Wiederholtes Öffnen kurz hintereinander steht nur einmal da.

Diese Einträge lassen sich **nicht löschen** und nicht ausblenden; sie bleiben auch stehen, wenn die Mappe endgültig gelöscht ist. Alle zusammen stehen unter **Werkbank → Protokoll → Im Verwaltungsmodus angesehen** (Zeit, Person, Mappe) – sichtbar für Personen mit „Gesamte Verwaltung“. Für IT-Dienstleister und Helfer ist das eine bewusste Schwelle: Sie wissen, dass es dokumentiert wird.

## Protokoll

Beginn, Ende, Ablauf und Wiedereinstieg des Modus stehen im Protokoll, ebenso fehlgeschlagene erneute Anmeldungen. Jede Anfrage im Verwaltungsmodus trägt im Protokoll die Person mit dem Zusatz **„(im Verwaltungsmodus)“**.

## Hinweise an die Verwaltung

Technische Hinweise – Sicherung, Speicherplatz, Postfächer, Anmeldeschutz, Pakete, Automatisierungen … – gehen per E-Mail an die Personen, die den passenden Bereich verwalten, und an alle mit „Gesamte Verwaltung“. Im Haushalt sind das meist alle, die verwalten. Außerhalb des Verwaltungsmodus sieht die Person oben nur den Hinweis „Für die Verwaltung liegt etwas an.“ mit dem Knopf **Ablago verwalten**.

## Nach dem Update auf diese Version { #umstellung }

Bisherige Konten mit der Rolle **Administrator** sind jetzt normale Benutzer mit **Gesamte Verwaltung**. Sie melden sich wie bisher an, landen aber in der **Ablage** und sehen dort nur, was die Berechtigungen ihnen erlauben – in die Werkbank geht es über **Ablago verwalten**. Die Systemrolle „Administrator“ ist entfallen; ihre Rollen-Mappe bleibt als gewöhnliche Rolle ohne Mitglieder stehen. Hattest du ein eigenes Admin-Konto *und* ein Alltagskonto, gib dem Alltagskonto „Gesamte Verwaltung“ und deaktiviere danach das Admin-Konto.
