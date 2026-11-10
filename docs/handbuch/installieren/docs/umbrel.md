# umbrelOS

!!! info "Geprüft: noch keine Meldung"
    Für diesen Weg gibt es noch keine Meldung von einem Gerät. Das Image selbst prüfen die Rechner von GitHub bei jeder Änderung auf amd64 und arm64. Was das heißt, steht unter [Geprüfte Plattformen](plattformen.md).

So installierst du Ablago auf einem Heimserver mit **umbrelOS**, z. B. einem Umbrel Home oder einem Mini-PC mit umbrelOS. Du brauchst weder Compose-Datei noch Kommandozeile. Die App bringt ihre eigene Datenbank mit und ist schon angebunden.

## 1. DMS-Store hinzufügen

Ablago steht (noch) nicht im offiziellen Umbrel App Store. Du fügst einmal den DMS-Store als zusätzliche Quelle hinzu:

1. **App Store** öffnen.
2. Oben rechts auf **⋯** und **Community App Stores** wählen.
3. Diese Adresse eintragen und hinzufügen:
   ```
   https://github.com/motom001/dms-appstore
   ```

Danach gibt es im App Store den Bereich **Ablago App Store**.

## 2. Installieren

Im **Ablago App Store** die App **Ablago** öffnen und **Installieren** wählen. umbrelOS lädt Ablago und seine Datenbank und startet beide.

## 3. Einrichten

1. Öffne die App **direkt nach der Installation**, über das Symbol auf dem Startbildschirm oder unter `http://umbrel.local:8478`.
2. Einen Einrichtungscode gibt es hier nicht, und die Datenbank ist schon eingetragen.

--8<-- "assistent-weiter.md"

!!! warning "Gleich nach der Installation einrichten"
    Richte Ablago gleich ein – dann legst du als Erste oder Erster den Administrator an.

!!! info "Keine Umbrel-Anmeldung vor Ablago"
    umbrelOS schaltet vor Ablago **keine** Umbrel-Anmeldung, denn die hat nur der Besitzer des Geräts. Familienmitglieder melden sich mit ihrem eigenen Ablago-Konto an. Auch Links aus E-Mails und die [Schnittstelle](https://help.ablago.app/admin/aktuell/api/) funktionieren so.

## Daten

Die Daten liegen unter `~/umbrel/app-data/motom001-dms/data/`:

| Ordner | Inhalt |
| --- | --- |
| `files` | hochgeladene Dokumente |
| `geheim` | Schlüssel für Passwörter und Sicherungen |
| `sicherung` | Sicherungen von Ablago |
| `postgres` | die Datenbank |

!!! note "Kein Eingangsordner"
    Bei der Installation aus dem App Store gibt es keinen [Eingangsordner](https://help.ablago.app/admin/aktuell/eingangsordner/) für Scanner. Dokumente kommen über das Hochladen in der Ablage, per E-Mail über ein [Postfach](https://help.ablago.app/admin/aktuell/postfaecher/) oder über die Schnittstelle in Ablago.

## Sichern

- Unter **Werkbank → [Sicherung](https://help.ablago.app/admin/aktuell/sicherung/)** einen Zeitplan einschalten und unter **Werkbank → [Verschlüsselung](https://help.ablago.app/admin/aktuell/verschluesselung/#notfallblatt)** das Notfallblatt ausdrucken.
- Die Sicherungen liegen auf demselben Gerät. Kopiere sie ab und zu an einen anderen Ort, z. B. auf einen USB-Stick oder in einen Cloudspeicher. Die Sicherungen sind verschlüsselt, ein Cloudspeicher sieht also nur unlesbare Dateien. Exporte sind nicht darin: Ein [Vollexport](https://help.ablago.app/admin/aktuell/export/) ist unverschlüsselt und liegt deshalb im eigenen [Export-Ordner](https://help.ablago.app/admin/aktuell/export/#export-ordner), nie bei den Sicherungen.
- Hast du in umbrelOS **Backups** eingeschaltet, sichert umbrelOS die App-Daten zusätzlich mit.

## Aktualisieren

Gibt es eine neue Version, zeigt der App Store bei **Ablago** ein Update an. Ein Klick genügt, die Daten bleiben erhalten. Was neu ist, steht unter **Werkbank → Systemzustand → Version und Updates**.

## Auf ein neues Gerät umziehen

Ablago auf dem neuen Gerät aus dem Store installieren, die Sicherungsdateien in dessen Ordner `sicherung` legen und im Assistenten **Aus einer Sicherung wiederherstellen** wählen. Ausführlich unter [Wiederherstellen](https://help.ablago.app/admin/aktuell/wiederherstellen/).
