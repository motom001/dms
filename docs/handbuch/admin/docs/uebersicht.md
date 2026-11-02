# Werkbank und Übersicht

Die **Werkbank** sehen nur Administratoren. Links stehen ihre Bereiche in sechs Gruppen, geordnet nach dem, was du gerade tun willst – die Ablage aufbauen, Benutzer verwalten, Post hereinholen, Daten sichern, Grundeinstellungen ändern oder einem Fehler nachgehen. Welche Bereiche du siehst, hängt von der [Vorlage](#werkbank-anpassen) ab:

<!-- bereiche:gruppen -->
| Gruppe | Bereiche |
| --- | --- |
| **Ablage aufbauen** | [Mappentypen](mappentypen.md), [Ansichten](sichten.md), [Nummernkreise](nummernkreise.md), [Stempel](stempel.md), [Pakete](pakete.md), [Darf weg](archiv.md#nach-der-frist-darf-weg) (nur mit Archivmodus) |
| **Benutzer und Sicherheit** | [Benutzer](benutzer.md), [Verschlüsselung](verschluesselung.md), [Datenschutz](datenschutz.md) |
| **Post und Eingänge** | [Postfächer](postfaecher.md), [Eingangsordner](eingangsordner.md) (nur wenn der Ordner eingebunden ist), [WebDAV-Laufwerk](webdav.md), [Texterkennung](texterkennung.md) |
| **Daten sichern** | [Sicherung](sicherung.md), [Wiederherstellen](wiederherstellen.md), [Vollexport](export.md), [Papierkorb](papierkorb.md) |
| **Einstellungen** | [E-Mail und Adresse](installation.md#e-mail-und-adresse), [Benachrichtigungen und Aufgaben](aufgaben.md), [Anmeldeschutz](anmeldeschutz.md), [Designs](designs.md), [Datenbank-Anbindung](installation.md#datenbank-anbindung), [Technik](fehlersuche.md#technik) |
| **Wartung und Fehlersuche** | [Systemzustand](speicherplatz.md), [Protokoll](fehlersuche.md#protokoll), [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler), [Wartungsmodus](wartungsmodus.md), [Wartungsoperationen](texterkennung.md#wartungsoperationen), [Demo-Daten](demo.md) |
<!-- /bereiche:gruppen -->

Jede Einstellung hat genau einen Ort. Die Adressen der Bereiche (`/werkbank/sicherung` …) sind beim Umsortieren in Version 0.116 gleich geblieben; Lesezeichen und eine gespeicherte Auswahl unter *Werkbank anpassen* gelten weiter.

Welche Bereiche dort stehen, legst du unter [Werkbank anpassen](#werkbank-anpassen) fest. Am Smartphone gehst du in Schritten: oben die Gruppe wählen, darunter den Bereich, bei großen Sammlungen dann den Eintrag – mit **← Bereiche** bzw. **← Zur Liste** kommst du zurück. Ganz unten in der Leiste stehen *Projekt unterstützen* und der Link zu diesem Handbuch.

Neben den Bereichen steht, wie viel dort eingerichtet ist – etwa die Zahl der Mappentypen, Nummernkreise, installierten Pakete, aktiven Benutzer oder offenen Aufgaben. Die Zahlen stehen sofort da, wenn du die Werkbank öffnest, und ändern sich, sobald du im Bereich etwas anlegst oder löschst. Ist nichts eingerichtet, steht keine Zahl da.

## So arbeitest du in der Werkbank

Bereiche mit vielen Einträgen, die du bearbeitest – Mappentypen, Ansichten, Nummernkreise, Pakete, Benutzer, Aufgaben, Designs, Papierkorb, Postfächer, Protokoll und Gemeldete Fehler –, sind **dreiteilig**: Wählst du links einen Bereich, steht in der Mitte seine Liste und rechts das Formular des gewählten Eintrags; mit **+ Neu** legst du einen an.

Alle anderen Bereiche sind **zweiteilig**: links die Bereiche, rechts die ganze Seite. Kleine oder nur lesende Listen – etwa die langen Datenbankzugriffe, die gesperrten Adressen, die vorhandenen Exporte oder die letzten Zugriffe auf das WebDAV-Laufwerk – stehen dort als eigener Abschnitt mit fester Höhe, in dem du scrollst. Am Smartphone führt **← Bereiche** von einer solchen Seite direkt zurück zur Auswahl der Bereiche.

Jedes Formular endet mit derselben Leiste, die beim Scrollen unten sichtbar bleibt: rechts der Hauptknopf mit dem Gegenstand im Namen – etwa **Nummernkreis anlegen** oder **Postfach speichern** –, links daneben **Verwerfen**:

- **Neu anlegen:** **Entwurf verwerfen** schließt das Formular, ohne etwas anzulegen, und du bist zurück in der Liste.
- **Bearbeiten:** **Änderungen verwerfen** setzt alle Felder auf den gespeicherten Stand zurück. Beide Knöpfe gehen erst, wenn du etwas geändert hast; solange steht in der Leiste „Ungespeicherte Änderungen“.
- **Esc** im Formular wirkt wie Verwerfen. Hast du etwas geändert, fragt das DMS vorher nach.
- Klickst du mit ungespeicherten Änderungen einen anderen Eintrag oder Bereich an oder schließt den Tab, fragt das DMS nach, ob du die Änderungen verwerfen willst.

Knöpfe wie **Verbindung testen** oder **Jetzt prüfen** stehen darüber im Formular; links in der Leiste steht, wo es das gibt, **Löschen** bzw. **Entfernen**.

## Übersicht

Die Werkbank beginnt mit der **Übersicht**. Sie zeigt oben, was zu tun ist – jeweils mit einem Knopf in den passenden Bereich. **Das gilt auch für Bereiche, die in deiner Vorlage ausgeblendet sind.** Zum Beispiel:

- Sicherung fehlgeschlagen oder zu alt, Notfallblatt fehlt,
- Speicherplatz knapp oder voll,
- Wartungsmodus angekündigt oder aktiv,
- ein Notfallzugang ist noch aktiv,
- ein [Postfach mit OAuth](postfaecher.md#anmeldung-mit-oauth) ist abgelaufen oder noch nicht angemeldet,
- kein Schlüssel für Passwörter oder Schlüsseldatei nicht auf eigenem Volume,
- Datenbank-Anbindung weicht ab oder braucht einen Neustart,
- im Einrichtungsassistenten übersprungene Schritte,
- Umgebungsvariablen, die nicht mehr nötig sind – je Variable mit Grund (feste Ordner, Datenbank-Anbindung in einer Datei, gespeicherte Kennung des Haushalts),
- E-Mail-Versand nicht eingerichtet,
- offene gemeldete Fehler,
- Dokumente mit Fehler in der Texterkennung,
- Aufgaben für die Administratoren und Mappen, die nicht zur Definition passen.

Darunter stehen Kacheln mit offenen Aufgaben, Warteschlange der Texterkennung, Papierkorb, Gemeldete Fehler, Bestand (Mappen, Dokumente, Speicher, Benutzer) und Version. Ist alles eingerichtet, steht dort „Alles eingerichtet“.

![Werkbank → Übersicht](bilder/werkbank-uebersicht.png)

Die Zahl hinter *Übersicht* in der Leiste nennt die Hinweise, die Aufmerksamkeit brauchen.

## Werkbank anpassen

Nicht jeder braucht jeden Bereich. Ein Haushalt fasst Nummernkreise, Postfächer oder das technische Protokoll vielleicht nie an. Unter **Werkbank anpassen** (ganz unten in der Leiste) legst du fest, welche Bereiche links stehen.

!!! info "Ausblenden schaltet nichts ab"
    Ein ausgeblendeter Bereich läuft weiter. Ein Postfach holt weiter Post ab, die Sicherung läuft weiter. Direkte Links, die Hilfe und die Knöpfe der Übersicht führen weiterhin hin. **Hinweise kommen immer durch:** Hat ein ausgeblendeter Bereich ein Problem, zum Beispiel „Sicherung zu alt“, steht es in der Übersicht, und der Bereich erscheint mit seinem Hinweis in der Leiste.

**Vorlagen** für alle Administratoren:

- **Haushalt**: schlank, nur was ein Haushalt zum Einrichten und Sichern braucht. Neue Installationen beginnen damit.
<!-- bereiche:organisation -->
- **Betrieb**: zusätzlich Nummernkreise, Darf weg, Datenschutz, Postfächer, Eingangsordner, Texterkennung, Anmeldeschutz, Designs, Protokoll, Gemeldete Fehler, Wartungsmodus.
<!-- /bereiche:organisation -->
- **Alles**: jeder Bereich. So bleibt es bei Installationen, die vor Version 0.70 eingerichtet wurden, bis du etwas anderes wählst.

Danach kannst du je Bereich abweichen:

- **für alle**: Der Bereich steht bei jedem Administrator in der Leiste.
- **nur für mich**: Der Bereich steht zusätzlich nur bei dir, zum Beispiel *Protokoll*, wenn du gern nachschaust, die anderen aber nicht.

Ist ein ausgeblendeter Bereich eingerichtet, etwa ein Postfach oder die Anmeldung über einen Anbieter, steht dabei „eingerichtet, aber ausgeblendet“. Unten in der Leiste steht, wie viele Bereiche ausgeblendet sind. Ein Klick darauf zeigt sie vorübergehend alle.

![Werkbank → Werkbank anpassen](bilder/werkbank-anpassen.png)

### Welchen Bereich brauche ich wofür?

<!-- bereiche:wofuer -->
| Bereich | Wofür | In der Vorlage |
| --- | --- | --- |
| [Mappentypen](mappentypen.md) | Eigene Arten von Mappen bauen | Haushalt, Betrieb |
| [Ansichten](sichten.md) | Die Sammlungen links in der Ablage ordnen | Haushalt, Betrieb |
| [Nummernkreise](nummernkreise.md) | Fortlaufende Nummern, z. B. für Rechnungen | Betrieb |
| [Stempel](stempel.md) | Vorlagen für Stempel und Wasserzeichen beim Weitergeben | Haushalt, Betrieb |
| [Pakete](pakete.md) | Fertige Mappentypen und Ansichten installieren | Haushalt, Betrieb |
| [Darf weg](archiv.md#nach-der-frist-darf-weg) | Mappen mit abgelaufener Aufbewahrungsfrist (nur mit Archivmodus) | Betrieb |
| [Benutzer](benutzer.md) | Benutzer und Rollen anlegen | Haushalt, Betrieb |
| [Verschlüsselung](verschluesselung.md) | Den Schlüssel für Passwörter und Sicherungen | Haushalt, Betrieb |
| [Datenschutz](datenschutz.md) | Auskunft nach Art. 15 DSGVO an Kunden, Mieter und Kontakte als ZIP | Betrieb |
| [Postfächer](postfaecher.md) | Post aus einem E-Mail-Konto abholen | Betrieb |
| [Eingangsordner](eingangsordner.md) | Scans aus einem Ordner übernehmen | Betrieb |
| [WebDAV-Laufwerk](webdav.md) | Die Ablage im Explorer, Finder oder in der Dateien-App einbinden und Dateien hineinlegen | Haushalt, Betrieb |
| [Texterkennung](texterkennung.md) | Text in gescannten Dokumenten finden | Betrieb |
| [Sicherung](sicherung.md) | Sicherungen einrichten und prüfen | Haushalt, Betrieb |
| [Wiederherstellen](wiederherstellen.md) | Eine Sicherung zurückspielen | Haushalt, Betrieb |
| [Vollexport](export.md) | Alle Daten in offenen Formaten mitnehmen | Haushalt, Betrieb |
| [Papierkorb](papierkorb.md) | Gelöschte Mappen zurückholen | Haushalt, Betrieb |
| [E-Mail und Adresse](installation.md#e-mail-und-adresse) | E-Mail-Versand und Adresse des DMS | Haushalt, Betrieb |
| [Benachrichtigungen und Aufgaben](aufgaben.md) | Die Tägliche Zusammenfassung und die Benachrichtigung für Favoriten einstellen, alle offenen Aufgaben im Blick behalten | Haushalt, Betrieb |
| [Anmeldeschutz](anmeldeschutz.md) | Zwei-Faktor vorschreiben, Anmeldung über einen Anbieter, gesperrte Adressen | Betrieb |
| [Designs](designs.md) | Logo, Farben und eigenes CSS | Betrieb |
| [Datenbank-Anbindung](installation.md#datenbank-anbindung) | Die Verbindung zur Datenbank, lange Datenbankzugriffe und was gerade läuft | nur Alles |
| [Technik](fehlersuche.md#technik) | Version, Updates und die Übersicht für GitHub | Haushalt, Betrieb |
| [Systemzustand](speicherplatz.md) | Sehen, wie es dem Server geht: Speicherplatz mit Warnschwellen, Auslastung von CPU, Arbeitsspeicher und Netzwerk | Haushalt, Betrieb |
| [Protokoll](fehlersuche.md#protokoll) | Das technische Protokoll lesen | Betrieb |
| [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler) | Fehler, die Benutzer gemeldet haben | Betrieb |
| [Wartungsmodus](wartungsmodus.md) | Benutzer vorübergehend aussperren | Betrieb |
| [Wartungsoperationen](texterkennung.md#wartungsoperationen) | Einmalige Pflegearbeiten | nur Alles |
| [Demo-Daten](demo.md) | Beispielmappen zum Ausprobieren | nur Alles |
<!-- /bereiche:wofuer -->
