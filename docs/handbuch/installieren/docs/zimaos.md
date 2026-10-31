# ZimaOS

So installierst du das DMS auf einem Gerät mit **ZimaOS**, z. B. einem ZimaCube oder ZimaBoard. Du brauchst weder Compose-Datei noch Kommandozeile. Die App bringt ihre eigene Datenbank mit: Sie läuft im selben Container und ist schon angebunden.

!!! tip "CasaOS statt ZimaOS?"
    Die Schritte für CasaOS stehen auf einer [eigenen Seite](casaos.md).

## 1. DMS-Store hinzufügen

Das DMS steht (noch) nicht im offiziellen ZimaOS App Store. Du fügst einmal den DMS-Store als zusätzliche Quelle hinzu:

1. **App Store** öffnen.
2. **Quellen verwalten** wählen (je nach Version auch *Add source* oder ein **+** neben der Store-Auswahl).
3. Diese Adresse eintragen und hinzufügen:
   ```
   https://cdn.jsdelivr.net/gh/motom001/dms-appstore@gh-pages
   ```

Danach lässt sich in der Store-Auswahl der **DMS App Store** wählen.

## 2. Installieren

Im DMS App Store **DMS** öffnen und **Installieren** wählen. ZimaOS lädt das DMS als **einen** Container (Image `dms-komplett`) und startet ihn. Die Datenbank läuft darin mit – ohne Passwort und ohne Port nach außen. Einen eigenen Container „Datenbank“ gibt es nicht.

## 3. Einrichten

1. Öffne die App **direkt nach der Installation**, über ihr Symbol oder unter `http://<Gerät>:8478`.
2. Einen Einrichtungscode gibt es hier nicht, und die Datenbank ist schon eingetragen.

--8<-- "assistent-weiter.md"

!!! warning "Gleich nach der Installation einrichten"
    Bis der Administrator angelegt ist, könnte jeder in deinem Heimnetz die Einrichtung übernehmen.

## Daten

Die Daten liegen unter `/DATA/AppData/dms/`:

| Ordner | Inhalt |
| --- | --- |
| `files` | hochgeladene Dokumente |
| `geheim` | Schlüssel für Passwörter und Sicherungen |
| `sicherung` | Sicherungen des DMS |
| `postgres` | die Datenbank |

!!! note "Kein Eingangsordner"
    Bei der Installation aus dem App Store gibt es keinen [Eingangsordner](https://motom001.github.io/dms/admin/aktuell/eingangsordner/) für Scanner. Dokumente kommen über das Hochladen in der Ablage, per E-Mail über ein [Postfach](https://motom001.github.io/dms/admin/aktuell/postfaecher/) oder über die Schnittstelle ins DMS.

## Sichern

- Unter **Werkbank → [Sicherung](https://motom001.github.io/dms/admin/aktuell/sicherung/)** einen Zeitplan einschalten und das Notfallblatt ausdrucken.
- Die Sicherungen liegen auf demselben Gerät. Kopiere den Ordner `sicherung` ab und zu an einen anderen Ort, z. B. mit der Sicherungsfunktion von ZimaOS auf eine USB-Platte oder in einen Cloudspeicher.

## Aktualisieren

Gibt es eine neue Version, zeigt der App Store bei **DMS** ein Update an. Die Daten bleiben erhalten. Was neu ist, steht unter **Werkbank → Technik**.

!!! warning "Noch mit zwei Containern installiert?"
    Wer das DMS vor Version 0.73.10 aus dem Store installiert hat, hat zwei Container: DMS und Datenbank. Nach dem Update auf den einen Container startet das DMS mit einer **leeren** Datenbank. So kommst du wieder an deine Daten:

    1. **Vor** dem Update unter **Werkbank → Sicherung** eine Sicherung erstellen (oder die letzte automatische nehmen).
    2. Update im App Store einspielen.
    3. Im Assistenten **Aus einer Sicherung wiederherstellen** wählen und diese Sicherung einspielen.

    Die alten Datenbankdateien bleiben im Ordner `postgres/` liegen, bis du sie selbst löschst.

## Auf ein neues Gerät umziehen

DMS auf dem neuen Gerät aus dem Store installieren, die Sicherungsdateien in dessen Ordner `sicherung` legen und im Assistenten **Aus einer Sicherung wiederherstellen** wählen. Ausführlich unter [Wiederherstellen](https://motom001.github.io/dms/admin/aktuell/wiederherstellen/).
