# CasaOS

!!! info "Geprüft: noch keine Meldung"
    Für diesen Weg gibt es noch keine Meldung von einem Gerät. Das Image selbst prüfen die Rechner von GitHub bei jeder Änderung auf amd64 und arm64. Was das heißt, steht unter [Geprüfte Plattformen](plattformen.md).

So installierst du Ablago auf einem Rechner mit **CasaOS**, z. B. einem Raspberry Pi oder Mini-PC. Du brauchst weder Compose-Datei noch Kommandozeile. Die App bringt ihre eigene Datenbank mit: Sie läuft im selben Container und ist schon angebunden.

!!! tip "ZimaOS statt CasaOS?"
    Die Schritte für ZimaOS stehen auf einer [eigenen Seite](zimaos.md).

## 1. DMS-Store hinzufügen

Ablago steht (noch) nicht im offiziellen CasaOS App Store. Du fügst einmal den DMS-Store als zusätzliche Quelle hinzu:

1. **App Store** öffnen.
2. Unter der App-Liste auf **Weitere Apps** (*More apps*) gehen und das Feld für eine weitere Quelle öffnen.
3. Diese Adresse eintragen und hinzufügen:
   ```
   https://github.com/motom001/dms-appstore/archive/refs/heads/main.zip
   ```

Danach erscheint **Ablago** in der App-Liste.

## 2. Installieren

In der App-Liste **Ablago** öffnen und **Installieren** wählen. CasaOS lädt Ablago als **einen** Container (Image `dms-komplett`) und startet ihn. Die Datenbank läuft darin mit – ohne Passwort und ohne Port nach außen. Einen eigenen Container „Datenbank“ gibt es nicht.

## 3. Einrichten

1. Öffne die App **direkt nach der Installation**, über ihr Symbol oder unter `http://<Gerät>:8478`.
2. Einen Einrichtungscode gibt es hier nicht, und die Datenbank ist schon eingetragen.

--8<-- "assistent-weiter.md"

!!! warning "Gleich nach der Installation einrichten"
    Richte Ablago gleich ein – dann legst du als Erste oder Erster den Administrator an.

## Daten

Die Daten liegen unter `/DATA/AppData/dms/`:

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
- Die Sicherungen liegen auf demselben Gerät. Kopiere den Ordner `sicherung` ab und zu an einen anderen Ort, z. B. auf eine USB-Platte oder in einen Cloudspeicher. Die Sicherungen sind verschlüsselt, ein Cloudspeicher sieht also nur unlesbare Dateien. Exporte sind nicht darin: Ein [Vollexport](https://help.ablago.app/admin/aktuell/export/) ist unverschlüsselt und liegt deshalb im eigenen [Export-Ordner](https://help.ablago.app/admin/aktuell/export/#export-ordner), nie bei den Sicherungen.

## Aktualisieren

Gibt es eine neue Version, zeigt der App Store bei **Ablago** ein Update an. Die Daten bleiben erhalten. Was neu ist, steht unter **Werkbank → Systemzustand → Version und Updates**.

!!! warning "Noch mit zwei Containern installiert?"
    Wer Ablago vor Version 0.73.10 aus dem Store installiert hat, hat zwei Container: Ablago und Datenbank. Deine Daten sind noch da. Nach dem Update auf den einen Container startet Ablago zunächst mit einer leeren Datenbank – so holst du sie zurück:

    1. **Vor** dem Update unter **Werkbank → Sicherung** eine Sicherung erstellen (oder die letzte automatische nehmen).
    2. Update im App Store einspielen.
    3. Im Assistenten **Aus einer Sicherung wiederherstellen** wählen und diese Sicherung einspielen.

    Die alten Datenbankdateien bleiben im Ordner `postgres/` liegen, bis du sie selbst löschst.

## Auf ein neues Gerät umziehen

Ablago auf dem neuen Gerät aus dem Store installieren, die Sicherungsdateien in dessen Ordner `sicherung` legen und im Assistenten **Aus einer Sicherung wiederherstellen** wählen. Ausführlich unter [Wiederherstellen](https://help.ablago.app/admin/aktuell/wiederherstellen/).
