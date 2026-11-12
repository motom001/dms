# Daten exportieren

**Deine Daten gehören dir.** Unter **Werkbank → Vollexport** schreibt Ablago alle Daten in offenen Formaten in einen Ordner, den du ohne Ablago lesen und mit anderen Programmen weiterverarbeiten kannst – du bist nie an Ablago gebunden.

| | Wofür | Format |
| --- | --- | --- |
| [Sicherung](sicherung.md) | wiederherstellen *in ein DMS* | eigenes Format, verschlüsselt |
| Export einer Ansicht ([Ablage](https://help.ablago.app/benutzer/aktuell/ablage/)) | ausgewählte Mappen weitergeben | Excel, CSV, ZIP, PDF |
| **Vollexport** | alles mitnehmen, Ausstieg, Weiterverarbeitung | offene Formate, ohne Ablago lesbar |

## Export starten

1. **Werkbank → Vollexport** zeigt, wie viele Mappen und Dateien es gibt, wie viel Platz nötig ist und wie viel frei ist.
2. Wähle, ob **technische Protokolle** und **Passwörter** mit sollen (siehe unten), und bestätige die **Kontakte**.
3. **Export starten** – die Arbeit läuft im Hintergrund, Ablago bleibt benutzbar.

Der Export landet im [Export-Ordner](#export-ordner), z. B. `/data/export/dms-export-2026-10-31-14-05-00/`. Lade ihn mit **Als ZIP herunterladen** (bis 4 GB) – oder kopiere ihn direkt aus dem Ordner. **Prüfen** vergleicht jede Datei mit ihrem Prüfwert aus `manifest.json`. **Löschen** entfernt ihn.

**Nach dem Herunterladen löscht Ablago den Export**, spätestens nach **7 Tagen** – wie bei der [Auskunft](datenschutz.md). Unter **Vorhandene Exporte** steht je Export, bis wann er bereitliegt. Brauchst du ihn länger, bewahre die heruntergeladene ZIP-Datei auf.

!!! warning "Unverschlüsselt"
    Der Vollexport ist absichtlich **nicht verschlüsselt** – das ist sein Zweck. Bewahre ihn so sicher auf wie die Papierakten.

## Export-Ordner { #export-ordner }

Vollexporte, [Meine Daten exportieren](#meine-daten-exportieren) und die [Auskünfte nach Art. 15](datenschutz.md) liegen **unverschlüsselt** in einem eigenen Ordner: im Container `/data/export`, neben `files/`. Er liegt **nie im Sicherungsordner** – den kopierst du in die Cloud, und die Exporte sollen dabei nicht mitwandern (früher lagen sie unter `sicherung/export/`; beim Update verschiebt Ablago sie, zeigt einen Hinweis in der Werkbank, und die 7 Tage beginnen für sie erst mit dem Update).

```
/data/export/
  dms-export-…/                 Vollexporte
  persoenlich/<Benutzer-Id>/…   Meine Daten exportieren
  auskunft/<Id>.zip             Auskünfte nach Art. 15 DSGVO
```

- **Ohne eigene Zeile in der Compose-Datei** (Vorgabe) liegt der Ordner im Container. Das reicht zum Herunterladen als ZIP. Nach einem Update des Containers sind dort liegende Exporte weg – sie werden ohnehin nach dem Herunterladen bzw. nach 7 Tagen gelöscht.
- **Eigener Ort:** Willst du große Exporte (über 4 GB) direkt aus dem Ordner kopieren oder den Ort selbst bestimmen, nimm die vorbereitete, auskommentierte Zeile aus den [Compose-Vorlagen](https://github.com/motom001/dms/tree/main/deploy) und lege den Ordner **außerhalb des Sicherungsordners** an:

    ```yaml
    volumes:
      - /volume1/docker/dms/export:/data/export
    ```

    Eine Umgebungsvariable dafür gibt es nicht – wie bei den anderen Ordnern bestimmt nur das Volume, wo er liegt.

- **Liegt der Export-Ordner doch im Sicherungsordner** (auch über ein Volume auf einen Unterordner davon), warnen die Übersicht der Werkbank und **Werkbank → Vollexport**, und die Administratoren bekommen ihn mit der täglichen E-Mail zum [Technischen beim Admin-Konto](benutzer.md#aufgaben-ohne-empfanger). Lege das Volume dann an einen anderen Ort.

## Aufbau

```
dms-export-2026-10-31-14-05-00/
  LIESMICH.md            Aufbau, Formate, Prüfskript
  manifest.json          Formatversion, Anzahlen, Größe und SHA-256 jeder Datei, wo jede Tabelle steht
  struktur/              Mappentypen, Ansichten, Nummernkreise, Pakete (pakete.json), Designs, Automatisierungen und -vorlagen, Benutzer (ohne Passwörter)
  daten/
    <typ>.csv  .jsonl  .xlsx   je Mappentyp (Kennung, aus Paketen paket.schluessel): eine Zeile je Mappe, eine Spalte je Kennung eines Felds
    verweise.csv           Mappe → Feld → Mappe
    dokumente.csv          alle Dokumente und älteren Versionen mit Pfad im Export
    notizen.jsonl, aufgaben.jsonl, ablaeufe.jsonl (geplante Erinnerungen und andere Abläufe), historie.jsonl,
    papierkorb.jsonl, papierkorb-dokumente.jsonl, vertretungen.jsonl, favoriten.csv,
    loeschprotokoll.csv  (Löschprotokoll, ohne Inhalte)
  ablage/<Typ>/<Titel> [Id]/
    mappe.json  mappe.pdf  <Register>/<Datei>  <Datei>.txt  <Datei>.fassung.pdf  <Datei>.pdfa.pdf  <Register>/Versionen/
  uebersicht/<typ>.pdf   alle Mappen eines Typs
  kalender/fristen.ics   offene Fristen, Aufgaben mit Datum, Erinnerungen
  kontakte/<typ>.vcf     Kontakte (vCard 4.0)
  passwoerter.csv        nur mit ausdrücklicher Bestätigung
  protokolle/            nur, wenn gewählt
```

## Formate

- **Text** UTF-8; **CSV** nach RFC 4180 mit Komma und BOM (Excel erkennt UTF-8); Mehrfachwerte mit ` | ` getrennt.
- **Datum** `JJJJ-MM-TT`, Zeitpunkte ISO 8601 in UTC; **Zahlen** mit Punkt; **Beträge** als Spalten `<feld>` und `<feld>_waehrung`; **Zeiträume** nach ISO 8601 (`P3M` = 3 Monate; in JSON `{ "anzahl": 3, "einheit": "monate" }`); **Prozent** als Zahl (`19` für 19 %).
- **Ids** als UUID; **Verweise** doppelt: als Id (`<feld>`) und als Titel (`<feld>_titel`).
- **JSON Lines**: eine Mappe bzw. ein Eintrag je Zeile, verlustfrei.
- **Dokumente im Original**, nicht umgewandelt; ältere Versionen unter `Versionen/` (`v1 Rechnung.pdf`). Hat ein Paket eine Datei [umgewandelt](texterkennung.md#andere-dateitypen) (z. B. einen TIFF-Scan in ein PDF), liegt die Fassung daneben als `<Datei>.fassung.pdf` (bzw. `.png`, `.jpg`); `dokumente.csv` nennt sie in der Spalte `fassung` (seit 0.140.1).
- **Archivfassung (PDF/A)** (seit 0.149): Hat ein Paket zu einem Dokument eine [Archivfassung](texterkennung.md#archivfassung-pdfa) abgelegt, liegt sie als `<Datei>.pdfa.pdf` daneben; in `daten/dokumente.csv` steht ihr Pfad in der letzten Spalte `archivfassung` (`original`, wenn das Original schon PDF/A ist). Die Auskunft nach Art. 15 enthält keine Archivfassungen.
- **Formatversion** steht im Manifest; Änderungen am Format stehen in den Release Notes.

`manifest.json` nennt unter `tabellen` für jede Tabelle der Datenbank, wo sie im Export steht – oder warum nicht (z. B. Sitzungen, API-Schlüssel, Zugangsdaten für Mail und Postfächer). Ein Test sorgt dafür, dass keine neue Tabelle unbemerkt fehlt.

## Passwörter

Passwortfelder stehen nie in den Daten – nur „gesetzt“. Wählst du **Passwortfelder im Klartext** und bestätigst ausdrücklich, kommt `passwoerter.csv` dazu, im CSV-Format von **Bitwarden** (lässt sich auch in KeePassXC importieren). Das steht im Protokoll. Importiere die Datei und lösche sie danach – unter **Vorhandene Exporte** ist ein solcher Export rot markiert („Enthält Passwörter im Klartext“), weil er unverschlüsselt im Export-Ordner liegt (bis er heruntergeladen oder nach 7 Tagen gelöscht ist). Schlüssel, Zugangsdaten (Datenbank, Mail, Postfächer), API-Schlüssel und Sitzungen sind nie dabei.

## Kontakte als vCard

Ablago schlägt Mappentypen vor, die nach Kontakten aussehen (Felder wie Name, E-Mail, Telefon, Adresse), und ordnet die Felder zu. Prüfe die Zuordnung vor dem Export; abgewählte Mappentypen bekommen keine vCard.

## Meine Daten exportieren

Jeder Benutzer kann unter **Mein Konto → Konto → Meine Daten exportieren** (oben rechts auf deinen Namen klicken) einen eigenen Export anstoßen – im selben Aufbau, aber nur mit den Mappen, die er lesen darf, seinen eigenen Aufgaben, Erinnerungen, Favoriten und Papierkorb-Einträgen. Ansichten, Nummernkreise und andere Benutzer fehlen; Passwörter nur aus Mappen, in denen er Passwörter sehen darf, und nur mit Bestätigung. Er liegt im [Export-Ordner](#export-ordner) unter `persoenlich/<Benutzer-Id>/`; ein neuer Export ersetzt den alten. Nach dem Herunterladen wird er gelöscht, spätestens nach 7 Tagen. **Ab Werk ist das aus.** Einschalten kannst du es unter **Werkbank → Vollexport** im Abschnitt *Meine Daten exportieren* mit dem Haken **Benutzer dürfen ihre eigenen Daten exportieren**; nimmst du den Haken wieder weg, ist es wieder aus. Solange es aus ist, sehen Benutzer unter *Meine Daten exportieren* nur den Hinweis, dass sie eine Auskunft über ihre Daten bei dir bekommen – die erteilst du wie unter [Auskunft an einen Benutzer](datenschutz.md#auskunft-an-einen-benutzer) beschrieben. Solange ein Administrator über [Fehler nachstellen](benutzer.md#fehler-nachstellen) als ein Benutzer arbeitet, gibt es für diesen Benutzer keinen eigenen Export.

## Weiterverarbeiten

- **Excel/LibreOffice:** `daten/<typ>.xlsx` öffnen – oder die `.csv`.
- **Python:** `pandas.read_csv("daten/rechnung.csv")`; JSON Lines Zeile für Zeile mit `json.loads`.
- **Kalender:** `kalender/fristen.ics` in Outlook, Google, Apple oder Thunderbird importieren.
- **Anderes DMS:** `ablage/` enthält alle Dateien in lesbaren Ordnern, die Metadaten in `mappe.json`.
- **Vollständig?** Das Skript in `LIESMICH.md` prüft alle Dateien gegen das Manifest – ohne Ablago.
