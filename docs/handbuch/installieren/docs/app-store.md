# App-Store: umbrelOS, ZimaOS, CasaOS

Für einen Heimserver mit eigenem App-Store gibt es das DMS als App, ohne Compose-Datei und Kommandozeile. Die App bringt ihre eigene Datenbank mit und ist schon angebunden. Den Rest erledigt der [Einrichtungsassistent](https://motom001.github.io/dms/admin/aktuell/installation/#der-einrichtungsassistent) im Browser.

Die App-Einträge liegen im Repository [motom001/dms-appstore](https://github.com/motom001/dms-appstore). Sie folgen jedem Release des DMS, spätestens am nächsten Tag.

## Store hinzufügen

Das DMS steht (noch) nicht in den offiziellen Stores. Du fügst einmal den DMS-Store als zusätzliche Quelle hinzu:

| System | Wo | Adresse |
| --- | --- | --- |
| **umbrelOS** | App Store → ⋯ oben rechts → *Community App Stores* | `https://github.com/motom001/dms-appstore` |
| **ZimaOS** | App Store → *Quellen verwalten* (bzw. *Add source*) | `https://cdn.jsdelivr.net/gh/motom001/dms-appstore@gh-pages` |
| **CasaOS** | App Store → *Weitere Apps* (bzw. *More apps*) | `https://github.com/motom001/dms-appstore/archive/refs/heads/main.zip` |

Danach erscheint **DMS** im App Store. Ein Klick auf *Installieren* lädt die beiden Container und startet sie.

## Einrichten

1. Öffne die App direkt nach der Installation. Unter Umbrel ist das `http://umbrel.local:8478`, sonst `http://<Server>:8478`.
2. Der Assistent beginnt beim **Mandanten**, also dem Namen deines Haushalts, und legt dann den **Administrator** an. Es gibt keinen Einrichtungscode, und die Datenbank fragt er nicht ab, beides ist bei der App vorbelegt.
3. Weiter geht es wie bei jeder Installation: erster Benutzer, Schlüssel und Notfallblatt, Optionales.

!!! warning "Gleich nach der Installation einrichten"
    Ohne Einrichtungscode kann bis zum Anlegen des Administrators jeder in deinem Heimnetz die Einrichtung übernehmen. Richte das DMS deshalb sofort ein. Gib es erst danach über eine Portfreigabe oder einen Tunnel nach außen frei.

!!! info "Anmeldung bei Umbrel"
    Vor das DMS schaltet Umbrel **keine** Umbrel-Anmeldung, denn die hat nur der Besitzer des Geräts. Familienmitglieder melden sich mit ihrem eigenen DMS-Konto an. Auch Links aus E-Mails und die [Schnittstelle](https://motom001.github.io/dms/admin/aktuell/api/) funktionieren so.

## Daten, Sicherung, Updates

| | Umbrel | ZimaOS/CasaOS |
| --- | --- | --- |
| Datenordner | `~/umbrel/app-data/motom001-dms/data/` | `/DATA/AppData/dms/` |
| darin | `files`, `geheim`, `sicherung`, `postgres` | dieselben |
| Updates | im App Store, sobald eine neue Version da ist | ebenso |

- **Sicherungen:** Lege unter **Werkbank → [Sicherung](https://motom001.github.io/dms/admin/aktuell/sicherung/)** einen Zeitplan an und drucke das Notfallblatt aus. Die Sicherungen landen im Ordner `sicherung` auf demselben Gerät. Kopiere sie deshalb ab und zu an einen anderen Ort, z. B. auf einen USB-Stick oder in einen Cloudspeicher. Fällt der Heimserver aus, sind sonst auch die Sicherungen weg.
- **Umbrel-Backups** sichern die App-Daten zusätzlich mit, wenn du sie in umbrelOS eingeschaltet hast.
- **Wiederherstellen** auf einem neuen Gerät: DMS aus dem Store installieren, im Assistenten *Aus Sicherung wiederherstellen* wählen. Die Sicherungsdateien legst du vorher in den Ordner `sicherung` der App. Ausführlich unter [Wiederherstellen](https://motom001.github.io/dms/admin/aktuell/wiederherstellen/).

## Technisches

- Die Compose-Dateien setzen `DATABASE_URL` und `DMS_EINRICHTUNGSCODE=aus`. Die Variable `DMS_EINRICHTUNGSCODE=aus` kannst du auch in einer eigenen Installation setzen, wenn der Assistent ohne Code laufen soll.
- Die Images sind mit Digest festgelegt. Es läuft also genau das Image, das der Store zu dieser Version aufgelöst hat.
- Das Datenbank-Passwort erzeugt Umbrel je Gerät. Unter ZimaOS/CasaOS ist es fest, aber die Datenbank ist von außen nicht erreichbar: Sie hat keinen Port und hängt nur am Netz der App.
