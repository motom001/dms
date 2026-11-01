# Datenschutz im DMS

Wer Daten von Kunden, Mietern oder Kontakten verwaltet, muss auf Anfrage sagen können, was er über sie gespeichert hat – und das in einer Form, die die Person mitnehmen kann. Unter **Werkbank → Datenschutz** erledigt das DMS das in wenigen Minuten.

--8<-- "ausgeblendet-organisation.md"

!!! note "Unterstützt – ersetzt nichts"
    Das DMS stellt die Daten zusammen und hält fest, dass du Auskunft erteilt hast. Ob und was du herausgeben musst, entscheidest du – im Zweifel mit deinem Datenschutzbeauftragten oder einer Rechtsberatung. Weitere Themen (Sperr- und Löschkonzept, Verzeichnis der Verarbeitungstätigkeiten) folgen auf dieser Seite.

![Werkbank → Datenschutz](bilder/werkbank-datenschutz.png)

## Einstellungen

Einmal einrichten, unten auf der Seite unter **Einstellungen**:

- **Verantwortlicher:** Name und Anschrift – steht als Absender auf dem Deckblatt.
- **Empfänger:** an wen du Daten weitergibst (z. B. Steuerberatung, Hausmeisterdienst). Das ist der Vorschlag für jede Auskunft; du kannst ihn je Auskunft ändern.
- **Rechte der Person:** der Text auf dem Deckblatt (Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Beschwerde). Ein Vorschlag steht schon drin. Wie überall im DMS spricht auch das Deckblatt die Person mit „du“ an – du kannst den Text hier anpassen.
- **Mappentypen:** Hake an, welche Mappentypen **eine Person betreffen** – z. B. Mieter, Kunde, Vertragspartner, Kontakt. Nur Mappen dieser Typen lassen sich als Betroffene wählen. Je Mappentyp trägst du den **Zweck** ein (z. B. „Durchführung des Mietverhältnisses“); er steht auf dem Deckblatt bei jeder Art von Daten, die herausgeht.

Die **Speicherdauer** auf dem Deckblatt kommt aus dem [Archivmodus](archiv.md): Hat ein Mappentyp eine Aufbewahrungsfrist, steht sie dort mit dem spätesten „aufbewahren bis“; sonst „solange für den Zweck nötig“.

## Auskunft nach Art. 15 DSGVO

1. **Person wählen:** Art (einer der markierten Mappentypen) und Name suchen – oder direkt an der Mappe unter **Aktionen → Auskunft erstellen …** (nur für Administratoren und nur bei Mappentypen, die eine Person betreffen).
2. **Frist:** Trage ein, wann die Anfrage eingegangen ist, und lege mit **Frist als Aufgabe anlegen** eine Aufgabe für dich an – „Auskunft nach Art. 15 DSGVO an … bis …“, fällig einen Monat nach Eingang (Art. 12 Abs. 3 DSGVO). Sie steht wie jede Aufgabe unter „Zu erledigen“.
3. **Sammeln:** Das DMS folgt den Verweisen von der Mappe der Person aus – **Mappen, die darauf verweisen** (Mietvertrag → Nebenkostenabrechnungen, Post) und **Mappen, auf die sie verweist** (Wohnung). Die **Tiefe** stellst du ein (Vorgabe 2: Vertrag und dessen Rechnungen). Jede Mappe geht nur in der Richtung weiter, über die sie erreicht wurde: Von der Wohnung aus sammelt das DMS also nicht die anderen Mieter. Kreise (zwei Verträge, die aufeinander verweisen) werden erkannt; jede Mappe steht nur einmal da. Benutzer und Rollen sind nie dabei.
4. **Prüfen:** Die Liste zeigt den Baum mit Häkchen je **Mappe**, **Dokument**, **Notiz** und **Historie**. Nur Angehaktes geht hinaus, und erst wenn du **„Ich habe die Auswahl geprüft“** bestätigst, lässt sich die Auskunft erzeugen.
    - **Daten Dritter?** Ist eine Mappe noch mit anderen Personen verbunden (Mappen eines Typs, der eine Person betrifft – z. B. eine Wohnung, in der auch andere Mieter wohnen), steht das dabei. Enthält ein Dokument Angaben zu anderen Personen, öffne es über **schwärzen …** in einem neuen Tab, schwärze die Stellen ([Schwärzen](https://motom001.github.io/dms/benutzer/aktuell/dokumente/)) und sammle neu: Die **geschwärzte Fassung** ist dann angehakt, das Original nicht.
    - **Notizen** sind vorgewählt. Hältst du eine zurück (z. B. eine interne Bewertung), ist eine **Begründung Pflicht**; sie steht im Nachweis, nicht in der Auskunft.
    - **Vorschläge aus der Suche:** Mappen, die nicht über Verweise an der Person hängen, aber ihren Namen, ihre E-Mail-Adresse, Kundennummer oder IBAN enthalten (auch in Dokumenten und Notizen). Sie sind nicht angehakt – nimm sie nur auf, wenn sie wirklich zur Person gehören.
5. **Erzeugen:** Empfänger und eine Anmerkung fürs Deckblatt, optional ein **Passwort** (mindestens 10 Zeichen, „Vorschlagen“ erzeugt eines). Die Auskunft entsteht im Hintergrund; danach erscheint **Herunterladen**.

### Was die ZIP-Datei enthält

| Datei/Ordner | Inhalt |
| --- | --- |
| `Deckblatt.pdf` | „Auskunft nach Art. 15 DSGVO“ mit Absender: welche Daten (Arten und Felder), Zwecke, Herkunft (Kanäle der Post: E-Mail, Scan …), Empfänger, Speicherdauer, Rechte der Person |
| `Uebersicht.html` | alle Mappen mit ihren Angaben und Links zu den Dokumenten – im Browser zu öffnen |
| `Uebersicht.csv` | dasselbe als Tabelle |
| `ablage/<Art>/<Titel>/` | je Mappe die Dokumente im Original (bzw. geschwärzt), dazu `mappe.pdf` und `mappe.json` |
| `daten/`, `struktur/`, `manifest.json` | maschinenlesbar im Format des [Vollexports](export.md) (CSV, JSON Lines, Excel) – deckt auch die Datenübertragbarkeit (Art. 20) ab |

**Nie enthalten** sind Passwortfelder (weder Wert noch Feld) und andere verschlüsselte Werte, ältere Versionen von Dokumenten (sie könnten ungeschwärzt sein), Aufgaben, Benutzerkonten und Berechtigungen. Hältst du eine Notiz zurück, fehlen in der Historie dieser Mappe auch die Einträge zu Notizen (sie nennen deren Text).

**Mit Passwort** liegt die Auskunft als `Auskunft.zip` in einer mit AES-256 verschlüsselten ZIP-Datei – so sind auch die Dateinamen (z. B. der Name der Person) nicht zu sehen. Öffnen lässt sie sich z. B. mit 7-Zip, WinZip oder Keka (macOS), **nicht** mit dem eingebauten Entpacken von Windows. Teile das Passwort getrennt von der Datei mit, z. B. per Telefon oder SMS.

### Nachweis und Aufbewahrung

- In der **Historie der Person** steht „Auskunft erteilt“ mit Zeit, wer sie erstellt hat, Anzahl Mappen, Dokumente und Notizen, ob mit Passwort und die Begründungen zurückgehaltener Notizen – **ohne Inhalte**. Dasselbe steht ohne Begründungen im [Protokoll](fehlersuche.md#protokoll) (Modul „datenschutz“).
- Die ZIP-Datei liegt unter **Bereitliegende Auskünfte**, bis du sie **herunterlädst** – danach wird sie gelöscht –, höchstens **7 Tage**. Gespeichert wird sie neben den Exporten (`export/auskunft/` im Sicherungsordner, ohne Sicherungsordner im temporären Ordner des Containers); sie ist nicht Teil der Sicherung.
- Brauchst du sie noch einmal, erzeuge sie neu.

### Wer darf das?

Nur **Administratoren**. Ein eigenes Recht „Auskunft erteilen“ gibt es (noch) nicht: Die [Berechtigungen](berechtigungen.md) regeln je Mappentyp Anlegen, Lesen, Bearbeiten, Löschen und Passwörter – eine Auskunft greift über alle Mappentypen. Abgestufte Rechte für Administratoren kommen später.

## Schnittstelle

Alles geht auch über die [API](api.md): `POST /api/v1/werkbank/auskunft/vorschau` (Prüfliste), `POST /api/v1/werkbank/auskunft` (erzeugen, Hintergrundauftrag), `GET /api/v1/werkbank/auskunft/{id}/zip`, `POST /api/v1/werkbank/auskunft/frist` und `GET`/`PUT /api/v1/werkbank/datenschutz`. Die Sammlung über Verweise selbst steht jedem Benutzer mit seinen Rechten unter `GET /api/v1/mappen/{id}/baum` zur Verfügung.
