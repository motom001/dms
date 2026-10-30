# umbrelOS

So installierst du das DMS auf einem Heimserver mit **umbrelOS**, z. B. einem Umbrel Home oder einem Mini-PC mit umbrelOS. Du brauchst weder Compose-Datei noch Kommandozeile. Die App bringt ihre eigene Datenbank mit und ist schon angebunden.

## 1. DMS-Store hinzufügen

Das DMS steht (noch) nicht im offiziellen Umbrel App Store. Du fügst einmal den DMS-Store als zusätzliche Quelle hinzu:

1. **App Store** öffnen.
2. Oben rechts auf **⋯** und **Community App Stores** wählen.
3. Diese Adresse eintragen und hinzufügen:
   ```
   https://github.com/motom001/dms-appstore
   ```

Danach gibt es im App Store den Bereich **DMS App Store**.

## 2. Installieren

Im DMS App Store **DMS** öffnen und **Installieren** wählen. umbrelOS lädt das DMS und seine Datenbank und startet beide.

## 3. Einrichten

1. Öffne die App **direkt nach der Installation**, über das Symbol auf dem Startbildschirm oder unter `http://umbrel.local:8478`.
2. Der Assistent beginnt beim **Mandanten**, also dem Namen deines Haushalts, und legt dann den **Administrator** an. Einen Einrichtungscode gibt es hier nicht, und die Datenbank ist schon eingetragen.
3. Weiter geht es mit erstem Benutzer, Schlüssel und Notfallblatt sowie Optionalem. Die Schritte im Einzelnen beschreibt das [Administratorhandbuch](https://motom001.github.io/dms/admin/aktuell/installation/#der-einrichtungsassistent).

!!! warning "Gleich nach der Installation einrichten"
    Bis der Administrator angelegt ist, könnte jeder in deinem Heimnetz die Einrichtung übernehmen.

!!! info "Keine Umbrel-Anmeldung vor dem DMS"
    umbrelOS schaltet vor das DMS **keine** Umbrel-Anmeldung, denn die hat nur der Besitzer des Geräts. Familienmitglieder melden sich mit ihrem eigenen DMS-Konto an. Auch Links aus E-Mails und die [Schnittstelle](https://motom001.github.io/dms/admin/aktuell/api/) funktionieren so.

## Daten

Die Daten liegen unter `~/umbrel/app-data/motom001-dms/data/`:

| Ordner | Inhalt |
| --- | --- |
| `files` | hochgeladene Dokumente |
| `geheim` | Schlüssel für Passwörter und Sicherungen |
| `sicherung` | Sicherungen des DMS |
| `postgres` | die Datenbank |

## Sichern

- Unter **Werkbank → [Sicherung](https://motom001.github.io/dms/admin/aktuell/sicherung/)** einen Zeitplan einschalten und das Notfallblatt ausdrucken.
- Die Sicherungen liegen auf demselben Gerät. Kopiere sie ab und zu an einen anderen Ort, z. B. auf einen USB-Stick oder in einen Cloudspeicher.
- Hast du in umbrelOS **Backups** eingeschaltet, sichert umbrelOS die App-Daten zusätzlich mit.

## Aktualisieren

Gibt es eine neue Version, zeigt der App Store bei **DMS** ein Update an. Ein Klick genügt, die Daten bleiben erhalten. Was neu ist, steht unter **Werkbank → Technik**.

## Auf ein neues Gerät umziehen

DMS auf dem neuen Gerät aus dem Store installieren, die Sicherungsdateien in dessen Ordner `sicherung` legen und im Assistenten **Aus Sicherung wiederherstellen** wählen. Ausführlich unter [Wiederherstellen](https://motom001.github.io/dms/admin/aktuell/wiederherstellen/).
