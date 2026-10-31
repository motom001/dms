# Werkbank und Übersicht

Die **Werkbank** sehen nur Administratoren. Links stehen ihre Bereiche in vier Gruppen:

| Gruppe | Bereiche |
| --- | --- |
| **Ablage einrichten** | [Mappentypen](mappentypen.md), [Sichten](sichten.md) |
| **Benutzer und Zusammenarbeit** | [Benutzer und Rollen](benutzer.md), [Aufgaben](aufgaben.md) |
| **Einstellungen** | [E-Mail und Adresse](installation.md#e-mail-und-adresse), [Verschlüsselung](verschluesselung.md), [Designs](designs.md), [Papierkorb](papierkorb.md), [Texterkennung](texterkennung.md) |
| **Wartung und Fehlersuche** | [Protokoll, Fehlermeldungen, Datenbank, Technik](fehlersuche.md), [Wartungsoperationen](texterkennung.md), [Demo-Daten](demo.md) |

Welche Bereiche dort stehen, legst du unter [Werkbank anpassen](#werkbank-anpassen) fest. Am Smartphone wählst du oben erst die Gruppe, darunter den Bereich. Ganz unten in der Leiste stehen *Projekt unterstützen* und der Link zu diesem Handbuch.

## Übersicht

Die Werkbank beginnt mit der **Übersicht**. Sie zeigt oben, was zu tun ist – jeweils mit einem Knopf in den passenden Bereich:

- kein Schlüssel für Passwörter oder Schlüsseldatei nicht auf eigenem Volume,
- E-Mail-Versand nicht eingerichtet,
- offene Fehlermeldungen von Benutzern,
- Dokumente mit Fehler in der Texterkennung,
- Aufgaben für die Administratoren und Mappen, die nicht zur Definition passen.

Darunter stehen Kacheln mit offenen Aufgaben, Warteschlange der Texterkennung, Papierkorb, Fehlermeldungen, Bestand (Mappen, Dokumente, Speicher, Benutzer) und Version. Ist alles eingerichtet, steht dort „Alles eingerichtet“.

![Werkbank → Übersicht](bilder/werkbank-uebersicht.png)

Die Zahl hinter *Übersicht* in der Leiste nennt die Hinweise, die Aufmerksamkeit brauchen.

## Werkbank anpassen

Nicht jeder braucht jeden Bereich. Ein Haushalt fasst Nummernkreise, Postfächer oder das technische Protokoll vielleicht nie an. Unter **Werkbank anpassen** (ganz unten in der Leiste) legst du fest, welche Bereiche links stehen.

!!! info "Ausblenden schaltet nichts ab"
    Ein ausgeblendeter Bereich läuft weiter. Ein Postfach holt weiter Post ab, die Sicherung läuft weiter. Direkte Links, die Hilfe und die Knöpfe der Übersicht führen weiterhin hin. **Hinweise kommen immer durch:** Hat ein ausgeblendeter Bereich ein Problem, zum Beispiel „Sicherung zu alt“, steht es in der Übersicht, und der Bereich erscheint mit seinem Hinweis in der Leiste.

**Vorlagen** für alle Administratoren:

- **Haushalt**: schlank, nur was ein Haushalt zum Einrichten und Sichern braucht. Neue Installationen beginnen damit.
- **Organisation**: dazu Nummernkreise, Anmeldeschutz, Postfächer, Eingangsordner, Texterkennung, Protokoll, Fehlermeldungen und Wartungsmodus.
- **Alles**: jeder Bereich. So bleibt es bei Installationen, die vor Version 0.70 eingerichtet wurden, bis du etwas anderes wählst.

Danach kannst du je Bereich abweichen:

- **für alle**: Der Bereich steht bei jedem Administrator in der Leiste.
- **nur für mich**: Der Bereich steht zusätzlich nur bei dir, zum Beispiel *Protokoll*, wenn du gern nachschaust, die anderen aber nicht.

Ist ein ausgeblendeter Bereich eingerichtet, etwa ein Postfach oder die Anmeldung über einen Anbieter, steht dabei „eingerichtet, aber ausgeblendet“. Unten in der Leiste steht, wie viele Bereiche ausgeblendet sind. Ein Klick darauf zeigt sie vorübergehend alle.

![Werkbank → Werkbank anpassen](bilder/werkbank-anpassen.png)

### Welchen Bereich brauche ich wofür?

| Bereich | Wofür | In der Vorlage |
| --- | --- | --- |
| Mappentypen | Eigene Arten von Mappen bauen | Haushalt, Organisation |
| Sichten | Die Sammlungen links in der Ablage ordnen | Haushalt, Organisation |
| Nummernkreise | Fortlaufende Nummern, z. B. für Rechnungen | Organisation |
| Pakete | Fertige Mappentypen und Sichten installieren | Haushalt, Organisation |
| Darf weg | Mappen mit abgelaufener Aufbewahrungsfrist (nur mit Archivmodus) | Organisation |
| Benutzer | Benutzer und Rollen anlegen | Haushalt, Organisation |
| Anmeldeschutz | Zwei-Faktor vorschreiben, Anmeldung über einen Anbieter, gesperrte Adressen | Organisation |
| Aufgaben | Alle offenen Aufgaben im Blick behalten | Haushalt, Organisation |
| E-Mail und Adresse | E-Mail-Versand und Adresse des DMS | Haushalt, Organisation |
| Verschlüsselung | Den Schlüssel für Passwörter und Sicherungen | Haushalt, Organisation |
| Designs | Logo, Farben und eigenes CSS | Organisation |
| Papierkorb | Gelöschte Mappen zurückholen | Haushalt, Organisation |
| Datenbank-Anbindung | Die Verbindung zur Datenbank ändern | nur Alles |
| Speicherplatz | Sehen, wie voll das Gerät ist | Haushalt, Organisation |
| Postfächer | Post aus einem E-Mail-Konto abholen | Organisation |
| Eingangsordner | Scans aus einem Ordner übernehmen | Organisation |
| Texterkennung | Text in gescannten Dokumenten finden | Organisation |
| Protokoll | Das technische Protokoll lesen | Organisation |
| Fehlermeldungen | Fehler, die Benutzer gemeldet haben | Organisation |
| Sicherung | Sicherungen einrichten und prüfen | Haushalt, Organisation |
| Wiederherstellen | Eine Sicherung zurückspielen | Haushalt, Organisation |
| Vollexport | Alle Daten in offenen Formaten mitnehmen | Haushalt, Organisation |
| Wartungsmodus | Benutzer vorübergehend aussperren | Organisation |
| Wartungsoperationen | Einmalige Pflegearbeiten | nur Alles |
| Datenbank | Tabellen und Größen der Datenbank | nur Alles |
| Technik | Version, Updates und die Übersicht für GitHub | Haushalt, Organisation |
| Demo-Daten | Beispielmappen zum Ausprobieren | nur Alles |
