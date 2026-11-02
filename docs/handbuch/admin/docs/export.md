# Daten exportieren

**Deine Daten gehören dir.** Unter **Werkbank → Vollexport** schreibt das DMS alle Daten in offenen Formaten in einen Ordner, den du ohne das DMS lesen und mit anderen Programmen weiterverarbeiten kannst – kein Vendor-Lock-in.

| | Wofür | Format |
| --- | --- | --- |
| [Sicherung](sicherung.md) | wiederherstellen *in ein DMS* | eigenes Format, verschlüsselt |
| Export einer Ansicht ([Ablage](https://motom001.github.io/dms/benutzer/aktuell/ablage/)) | ausgewählte Mappen weitergeben | Excel, CSV, ZIP, PDF |
| **Vollexport** | alles mitnehmen, Ausstieg, Weiterverarbeitung | offene Formate, ohne DMS lesbar |

## Export starten

1. **Werkbank → Vollexport** zeigt, wie viele Mappen und Dateien es gibt, wie viel Platz nötig ist und wie viel frei ist.
2. Wähle, ob **technische Protokolle** und **Passwörter** mit sollen (siehe unten), und bestätige die **Kontakte**.
3. **Export starten** – die Arbeit läuft im Hintergrund, das DMS bleibt benutzbar.

Der Export landet im Ordner `export/` neben den [Sicherungen](sicherung.md), z. B. `/data/sicherung/export/dms-export-2026-10-31-14-05-00/`. Von dort kopierst du ihn – oder lädst ihn mit **Als ZIP herunterladen** (bis 4 GB). **Prüfen** vergleicht jede Datei mit ihrem Prüfwert aus `manifest.json`. **Löschen** entfernt ihn.

!!! warning "Unverschlüsselt"
    Der Vollexport ist absichtlich **nicht verschlüsselt** – das ist sein Zweck. Bewahre ihn so sicher auf wie die Papierakten.

## Aufbau

```
dms-export-2026-10-31-14-05-00/
  LIESMICH.md            Aufbau, Formate, Prüfskript
  manifest.json          Formatversion, Anzahlen, Größe und SHA-256 jeder Datei, wo jede Tabelle steht
  struktur/              Mappentypen, Ansichten, Nummernkreise, Pakete (pakete.json), Designs, Benutzer (ohne Passwörter)
  daten/
    <typ>.csv  .jsonl  .xlsx   je Mappentyp: eine Zeile je Mappe, eine Spalte je Kennung eines Felds
    verweise.csv           Mappe → Feld → Mappe
    dokumente.csv          alle Dokumente und älteren Versionen mit Pfad im Export
    notizen.jsonl, aufgaben.jsonl, erinnerungen.jsonl, historie.jsonl,
    papierkorb.jsonl, papierkorb-dokumente.jsonl, vertretungen.jsonl, favoriten.csv,
    loeschprotokoll.csv  (Löschprotokoll, ohne Inhalte)
  ablage/<Typ>/<Titel> [Id]/
    mappe.json  mappe.pdf  <Register>/<Datei>  <Datei>.txt  <Register>/Versionen/
  uebersicht/<typ>.pdf   alle Mappen eines Typs
  kalender/fristen.ics   offene Fristen, Aufgaben mit Datum, Erinnerungen
  kontakte/<typ>.vcf     Kontakte (vCard 4.0)
  passwoerter.csv        nur mit ausdrücklicher Bestätigung
  protokolle/            nur, wenn gewählt
```

## Formate

- **Text** UTF-8; **CSV** nach RFC 4180 mit Komma und BOM (Excel erkennt UTF-8); Mehrfachwerte mit ` | ` getrennt.
- **Datum** `JJJJ-MM-TT`, Zeitpunkte ISO 8601 in UTC; **Zahlen** mit Punkt; **Beträge** als Spalten `<feld>` und `<feld>_waehrung`.
- **Ids** als UUID; **Verweise** doppelt: als Id (`<feld>`) und als Titel (`<feld>_titel`).
- **JSON Lines**: eine Mappe bzw. ein Eintrag je Zeile, verlustfrei.
- **Dokumente im Original**, nicht umgewandelt; ältere Versionen unter `Versionen/` (`v1 Rechnung.pdf`).
- **Formatversion** steht im Manifest; Änderungen am Format stehen in den Release Notes.

`manifest.json` nennt unter `tabellen` für jede Tabelle der Datenbank, wo sie im Export steht – oder warum nicht (z. B. Sitzungen, API-Schlüssel, Zugangsdaten für Mail und Postfächer). Ein Test sorgt dafür, dass keine neue Tabelle unbemerkt fehlt.

## Passwörter

Passwortfelder stehen nie in den Daten – nur „gesetzt“. Wählst du **Passwortfelder im Klartext** und bestätigst ausdrücklich, kommt `passwoerter.csv` dazu, im CSV-Format von **Bitwarden** (lässt sich auch in KeePassXC importieren). Das steht im Protokoll. Importiere die Datei und lösche sie danach – unter **Vorhandene Exporte** ist ein solcher Export rot markiert („Enthält Passwörter im Klartext“), weil er unverschlüsselt im Sicherungsordner liegt. Schlüssel, Zugangsdaten (Datenbank, Mail, Postfächer), API-Schlüssel und Sitzungen sind nie dabei.

## Kontakte als vCard

Das DMS schlägt Mappentypen vor, die nach Kontakten aussehen (Felder wie Name, E-Mail, Telefon, Adresse), und ordnet die Felder zu. Prüfe die Zuordnung vor dem Export; abgewählte Mappentypen bekommen keine vCard.

## Meine Daten exportieren

Jeder Benutzer kann unter **Profil → Konto → Meine Daten exportieren** einen eigenen Export anstoßen – im selben Aufbau, aber nur mit den Mappen, die er lesen darf, seinen eigenen Aufgaben, Erinnerungen, Favoriten und Papierkorb-Einträgen. Ansichten, Nummernkreise und andere Benutzer fehlen; Passwörter nur aus Mappen, in denen er Passwörter sehen darf, und nur mit Bestätigung. Er liegt unter `export/persoenlich/<Benutzer-Id>/`; ein neuer Export ersetzt den alten. Abschalten lässt sich das unter **Werkbank → Vollexport** im Abschnitt *Meine Daten exportieren* mit dem Haken **Benutzer dürfen ihre eigenen Daten exportieren**. Solange ein Administrator über [Fehler nachstellen](benutzer.md#fehler-nachstellen) als ein Benutzer arbeitet, gibt es für diesen Benutzer keinen eigenen Export.

## Weiterverarbeiten

- **Excel/LibreOffice:** `daten/<typ>.xlsx` öffnen – oder die `.csv`.
- **Python:** `pandas.read_csv("daten/rechnung.csv")`; JSON Lines Zeile für Zeile mit `json.loads`.
- **Kalender:** `kalender/fristen.ics` in Outlook, Google, Apple oder Thunderbird importieren.
- **Anderes DMS:** `ablage/` enthält alle Dateien in lesbaren Ordnern, die Metadaten in `mappe.json`.
- **Vollständig?** Das Skript in `LIESMICH.md` prüft alle Dateien gegen das Manifest – ohne das DMS.
