# Werkbank und Übersicht

Die **Werkbank** sehen nur Administratoren. Links stehen ihre Bereiche in vier Gruppen. Welche davon du siehst, hängt von der [Vorlage](#werkbank-anpassen) ab:

<!-- bereiche:gruppen -->
| Gruppe | Bereiche |
| --- | --- |
| **Ablage einrichten** | [Mappentypen](mappentypen.md), [Ansichten](sichten.md), [Nummernkreise](nummernkreise.md), [Pakete](pakete.md), [Darf weg](archiv.md#nach-der-frist-darf-weg) (nur mit Archivmodus) |
| **Benutzer und Zusammenarbeit** | [Benutzer](benutzer.md), [Anmeldeschutz](anmeldeschutz.md), [Aufgaben](aufgaben.md) |
| **Einstellungen** | [E-Mail und Adresse](installation.md#e-mail-und-adresse), [Verschlüsselung](verschluesselung.md), [Designs](designs.md), [Papierkorb](papierkorb.md), [Datenbank-Anbindung](installation.md#datenbank-anbindung), [Speicherplatz](speicherplatz.md), [Postfächer](postfaecher.md), [Eingangsordner](eingangsordner.md) (nur wenn der Ordner eingebunden ist), [Texterkennung](texterkennung.md) |
| **Wartung und Fehlersuche** | [Protokoll](fehlersuche.md#protokoll), [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler), [Sicherung](sicherung.md), [Wiederherstellen](wiederherstellen.md), [Vollexport](export.md), [Wartungsmodus](wartungsmodus.md), [Wartungsoperationen](texterkennung.md#wartungsoperationen), [Datenbank](fehlersuche.md#datenbank), [Technik](fehlersuche.md#technik), [Demo-Daten](demo.md) |
<!-- /bereiche:gruppen -->

Welche Bereiche dort stehen, legst du unter [Werkbank anpassen](#werkbank-anpassen) fest. Am Smartphone wählst du oben erst die Gruppe, darunter den Bereich. Ganz unten in der Leiste stehen *Projekt unterstützen* und der Link zu diesem Handbuch.

Neben den Bereichen steht, wie viel dort eingerichtet ist – etwa die Zahl der Mappentypen, Nummernkreise, installierten Pakete, aktiven Benutzer oder offenen Aufgaben. Die Zahlen stehen sofort da, wenn du die Werkbank öffnest, und ändern sich, sobald du im Bereich etwas anlegst oder löschst. Ist nichts eingerichtet, steht keine Zahl da.

## So arbeitest du in der Werkbank

Wählst du links einen Bereich, steht in der Mitte seine Liste und rechts das Formular des gewählten Eintrags; mit **+ Neu** legst du einen an.

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
- Umgebungsvariablen, die nicht mehr nötig sind,
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
- **Betrieb**: zusätzlich Nummernkreise, Darf weg, Anmeldeschutz, Designs, Postfächer, Eingangsordner, Texterkennung, Protokoll, Gemeldete Fehler, Wartungsmodus.
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
| [Pakete](pakete.md) | Fertige Mappentypen und Ansichten installieren | Haushalt, Betrieb |
| [Darf weg](archiv.md#nach-der-frist-darf-weg) | Mappen mit abgelaufener Aufbewahrungsfrist (nur mit Archivmodus) | Betrieb |
| [Benutzer](benutzer.md) | Benutzer und Rollen anlegen | Haushalt, Betrieb |
| [Anmeldeschutz](anmeldeschutz.md) | Zwei-Faktor vorschreiben, Anmeldung über einen Anbieter, gesperrte Adressen | Betrieb |
| [Aufgaben](aufgaben.md) | Alle offenen Aufgaben im Blick behalten | Haushalt, Betrieb |
| [E-Mail und Adresse](installation.md#e-mail-und-adresse) | E-Mail-Versand und Adresse des DMS | Haushalt, Betrieb |
| [Verschlüsselung](verschluesselung.md) | Den Schlüssel für Passwörter und Sicherungen | Haushalt, Betrieb |
| [Designs](designs.md) | Logo, Farben und eigenes CSS | Betrieb |
| [Papierkorb](papierkorb.md) | Gelöschte Mappen zurückholen | Haushalt, Betrieb |
| [Datenbank-Anbindung](installation.md#datenbank-anbindung) | Die Verbindung zur Datenbank ändern | nur Alles |
| [Speicherplatz](speicherplatz.md) | Sehen, wie voll das Gerät ist | Haushalt, Betrieb |
| [Postfächer](postfaecher.md) | Post aus einem E-Mail-Konto abholen | Betrieb |
| [Eingangsordner](eingangsordner.md) | Scans aus einem Ordner übernehmen | Betrieb |
| [Texterkennung](texterkennung.md) | Text in gescannten Dokumenten finden | Betrieb |
| [Protokoll](fehlersuche.md#protokoll) | Das technische Protokoll lesen | Betrieb |
| [Gemeldete Fehler](fehlersuche.md#gemeldete-fehler) | Fehler, die Benutzer gemeldet haben | Betrieb |
| [Sicherung](sicherung.md) | Sicherungen einrichten und prüfen | Haushalt, Betrieb |
| [Wiederherstellen](wiederherstellen.md) | Eine Sicherung zurückspielen | Haushalt, Betrieb |
| [Vollexport](export.md) | Alle Daten in offenen Formaten mitnehmen | Haushalt, Betrieb |
| [Wartungsmodus](wartungsmodus.md) | Benutzer vorübergehend aussperren | Betrieb |
| [Wartungsoperationen](texterkennung.md#wartungsoperationen) | Einmalige Pflegearbeiten | nur Alles |
| [Datenbank](fehlersuche.md#datenbank) | Tabellen und Größen der Datenbank | nur Alles |
| [Technik](fehlersuche.md#technik) | Version, Updates und die Übersicht für GitHub | Haushalt, Betrieb |
| [Demo-Daten](demo.md) | Beispielmappen zum Ausprobieren | nur Alles |
<!-- /bereiche:wofuer -->
