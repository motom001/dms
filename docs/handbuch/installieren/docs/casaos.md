# CasaOS

So installierst du das DMS auf einem Rechner mit **CasaOS**, z. B. einem Raspberry Pi oder Mini-PC. Du brauchst weder Compose-Datei noch Kommandozeile. Die App bringt ihre eigene Datenbank mit und ist schon angebunden.

!!! tip "ZimaOS statt CasaOS?"
    Die Schritte für ZimaOS stehen auf einer [eigenen Seite](zimaos.md).

## 1. DMS-Store hinzufügen

Das DMS steht (noch) nicht im offiziellen CasaOS App Store. Du fügst einmal den DMS-Store als zusätzliche Quelle hinzu:

1. **App Store** öffnen.
2. Unter der App-Liste auf **Weitere Apps** (*More apps*) gehen und das Feld für eine weitere Quelle öffnen.
3. Diese Adresse eintragen und hinzufügen:
   ```
   https://github.com/motom001/dms-appstore/archive/refs/heads/main.zip
   ```

Danach erscheint **DMS** in der App-Liste.

## 2. Installieren

In der App-Liste **DMS** öffnen und **Installieren** wählen. CasaOS lädt das DMS und seine Datenbank und startet beide.

## 3. Einrichten

1. Öffne die App **direkt nach der Installation**, über ihr Symbol oder unter `http://<Gerät>:8478`.
2. Der Assistent beginnt beim **Mandanten**, also dem Namen deines Haushalts, und legt dann den **Administrator** an. Einen Einrichtungscode gibt es hier nicht, und die Datenbank ist schon eingetragen.
3. Weiter geht es mit erstem Benutzer, Schlüssel und Notfallblatt sowie Optionalem. Die Schritte im Einzelnen beschreibt das [Administratorhandbuch](https://motom001.github.io/dms/admin/aktuell/installation/#der-einrichtungsassistent).

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

## Sichern

- Unter **Werkbank → [Sicherung](https://motom001.github.io/dms/admin/aktuell/sicherung/)** einen Zeitplan einschalten und das Notfallblatt ausdrucken.
- Die Sicherungen liegen auf demselben Gerät. Kopiere den Ordner `sicherung` ab und zu an einen anderen Ort, z. B. auf eine USB-Platte oder in einen Cloudspeicher.

## Aktualisieren

Gibt es eine neue Version, zeigt der App Store bei **DMS** ein Update an. Die Daten bleiben erhalten. Was neu ist, steht unter **Werkbank → Technik**.

## Auf ein neues Gerät umziehen

DMS auf dem neuen Gerät aus dem Store installieren, die Sicherungsdateien in dessen Ordner `sicherung` legen und im Assistenten **Aus Sicherung wiederherstellen** wählen. Ausführlich unter [Wiederherstellen](https://motom001.github.io/dms/admin/aktuell/wiederherstellen/).
