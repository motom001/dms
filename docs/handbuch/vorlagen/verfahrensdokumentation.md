# Verfahrensdokumentation: Belegablage mit dem DMS

> **Vorlage.** Alles in [eckigen Klammern] ersetzt du durch deine Angaben oder streichst es. Die übrigen Texte beschreiben, was das DMS tut, und passen, solange du es so einsetzt wie beschrieben. Die Vorlage ist ein Ausgangspunkt, **keine Steuer- oder Rechtsberatung** – stimme sie mit deiner Steuerberatung ab. Bewahre diese Dokumentation selbst auf (z. B. als Mappe im DMS) und halte die Änderungstabelle am Ende aktuell.

## 1. Allgemeines

| | |
| --- | --- |
| Unternehmen / Tätigkeit | [Name, Anschrift, Art der Tätigkeit, z. B. Vermietung einer Wohnung, freiberufliche Tätigkeit als …] |
| Gewinnermittlung | [Einnahmen-Überschuss-Rechnung / Bilanzierung / Überschusseinkünfte] |
| Verantwortlich für die Belegablage | [Name] |
| Vertretung | [Name] |
| Steuerberatung | [Name, Kanzlei – oder „keine“] |
| Eingesetzte Software | DMS (Open Source, https://github.com/motom001/dms), Version [z. B. 0.43.0] (Werkbank → Technik) |
| Betrieb | [Gerät, z. B. Synology DS224+], Variante [zwei Container (dms + postgres:17) / dms-komplett], Standort [z. B. Arbeitszimmer] |
| Geltungsbereich | [Welche Unterlagen: z. B. Eingangs- und Ausgangsrechnungen, Kontoauszüge, Verträge der Tätigkeit …] |
| Gültig ab | [Datum] |

## 2. Belegeingang

Belege kommen auf diesen Wegen ins DMS:

- **Papier:** [Wer] scannt eingehende Belege [täglich / wöchentlich] mit [Scanner, Modell]. Die Datei wird über **„+ Post“** als **Post** im DMS abgelegt. Das DMS hält dabei fest, **wer** sie **wann** angelegt hat (Kanal „Hochgeladen“).
- **Elektronisch erhaltene Belege** (PDF, E-Rechnung): [Wer] legt die Datei **unverändert im empfangenen Format** über „+ Post“ ab. Bei E-Rechnungen (XRechnung, ZUGFeRD) wird die **Originaldatei** (z. B. die XML-Datei) abgelegt, nicht nur ein Ausdruck oder Bild davon.
- **Ausgangsbelege:** [Wie Ausgangsrechnungen entstehen, z. B. Rechnungsprogramm …, und wie sie ins DMS kommen.]
- [Weitere Wege, z. B. Ablage über die Schnittstelle (API) durch …]

Jede Datei bekommt beim Speichern einen **Prüfwert (SHA-256)**. Dateien mit gleichem Inhalt erkennt das DMS und speichert sie nur einmal.

Die Post wird **zeitnah**, spätestens [z. B. innerhalb von 10 Tagen], einer passenden Mappe **zugeordnet** (z. B. einer Rechnung, einem Vertrag). Dabei wandern die Dokumente in ein Register dieser Mappe; das Protokoll beider Mappen hält fest, wer wann zugeordnet hat.

## 3. Ersetzendes Scannen

[Nur ausfüllen, wenn Papierbelege nach dem Scannen vernichtet werden.]

- **Gerät und Einstellungen:** [Scanner], [Auflösung, z. B. 300 dpi], [Farbe / Graustufen], Dateiformat [PDF].
- **Kontrolle:** Nach dem Scannen prüft [Wer], ob die Datei **vollständig** (alle Seiten, Vorder- und Rückseite mit Inhalt) und **lesbar** ist, und vergleicht sie mit dem Papier. Fehlerhafte Scans werden wiederholt.
- **Vernichtung:** Das Papier wird frühestens [z. B. nach der Kontrolle / nach Abschluss des Monats / nach der Umsatzsteuer-Voranmeldung] vernichtet, und zwar [geschreddert / über eine Aktenvernichtung].
- **Ausnahmen – Original bleibt:** Belege, deren Original Beweiskraft hat oder vorgeschrieben ist, z. B. [notarielle Urkunden, Belege mit Siegel …]. Sie liegen [Ablageort].

## 4. Ablage und Ordnung

- Belege liegen in **Mappen** festgelegter **Mappentypen**, z. B. [Rechnung, Kontoauszug, Vertrag]. Jeder Mappentyp hat Pflichtfelder, z. B. [Rechnungsdatum, Rechnungsnummer, Betrag, Vertragspartner].
- **Sichten** fassen Mappen nach Bedingungen zusammen, z. B. [„Rechnungen 2026“].
- Ordnungsmerkmal je Beleg: [z. B. Rechnungsdatum und Rechnungsnummer; ggf. Belegnummer der Buchhaltung].
- Aufbewahrungsfristen: [Buchungsbelege 8 Jahre, Bücher und Aufzeichnungen 10 Jahre, Geschäftsbriefe 6 Jahre – jeweils ab Ende des Kalenderjahres; mit der Steuerberatung abstimmen]. Vor Ablauf der Frist werden Belege nicht gelöscht. [Wie das sichergestellt wird, z. B. Berechtigungen: nur … darf löschen; jährliche Kontrolle durch …]

## 5. Nachvollziehbarkeit und Unveränderbarkeit

- Das DMS führt zu jeder Mappe ein **Protokoll** (Werkbank-Begriff: Historie): Anlage, jede Änderung eines Feldes mit **altem und neuem Wert**, wer, wann; hochgeladene und gelöschte Dokumente; Zuordnungen; versendete E-Mails.
- Dokumente werden **unverändert** gespeichert; der Prüfwert (SHA-256) je Datei macht nachträgliche Veränderungen erkennbar.
- Gelöschte Mappen kommen in den **Papierkorb** (Frist: [z. B. 30 Tage], Werkbank → Papierkorb) und lassen sich bis dahin wiederherstellen; das Löschen steht im Protokoll.
- [Wer Mappen und Dokumente löschen darf, regeln die Berechtigungen, siehe Abschnitt 6.]

## 6. Zugriffsschutz

- Zugang nur mit **persönlichem Konto** (E-Mail-Adresse und Passwort). Konten: [Liste der Benutzer und ihrer Rolle].
- **Rollen und Berechtigungen** je Mappentyp regeln, wer lesen, anlegen, bearbeiten und löschen darf (Werkbank → Berechtigungen). Für Belege gilt: [z. B. nur … darf löschen; … darf nur lesen].
- Für eine Betriebsprüfung kann ein eigenes Konto mit **nur lesendem Zugriff** angelegt werden: [ja / nein, Vorgehen].
- Erreichbarkeit: [nur im Heimnetz / von außen über Reverse-Proxy mit HTTPS unter …].

## 7. Datensicherung und Wiederherstellung

- **Automatische Sicherung** (Werkbank → Sicherung): [Zeitplan, z. B. täglich 02:00], Aufbewahrung [z. B. 7 tägliche, 4 wöchentliche, 12 monatliche]. Eine Sicherung enthält die ganze Datenbank und alle Dateien, **verschlüsselt**.
- **Kopie an einem anderen Ort:** [z. B. wöchentlich auf USB-Festplatte, die außer Haus liegt / Cloudspeicher …], durch [Wer].
- **Notfallblatt** mit dem Schlüssel: liegt [Ort, getrennt von den Sicherungen].
- **Probe-Wiederherstellung:** Das DMS spielt die neueste Sicherung [wöchentlich, sonntags] probeweise ein und prüft sie; Ergebnis unter Werkbank → Sicherung. Fehlschläge gehen per E-Mail an die Administratoren.

## 8. Betrieb

- Updates des DMS: [Wer], [wie oft, z. B. monatlich], vorher Sicherung; Wartungsmodus während des Updates.
- Protokoll und Fehler: Werkbank → Protokoll und Technik.
- [Stromausfall / USV, Festplatten-Überwachung des Geräts …]

## 9. Datenzugriff bei einer Betriebsprüfung

- Belege lassen sich aus jeder Sicht **exportieren**: Tabelle (CSV, XLSX), ZIP mit Dokumenten oder PDF (Sicht → Exportieren).
- Die Schnittstelle (API, `/api/v1`) liefert alle Daten maschinell auswertbar.
- Bei Bedarf Lesezugang für Prüfer, siehe Abschnitt 6.
- Ansprechpartner: [Name].

## 10. Änderungen dieser Dokumentation

| Datum | Was geändert | Wer |
| --- | --- | --- |
| [Datum] | erste Fassung | [Name] |
