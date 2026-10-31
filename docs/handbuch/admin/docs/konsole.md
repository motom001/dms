# Konsole: Befehl `dms`

Im Container des DMS gibt es den Befehl `dms`. Damit erledigst du Notfälle und Routinearbeiten ohne Browser – etwa wenn du dich ausgesperrt hast oder etwas per Skript tun willst.

```sh
docker exec -it <container> dms hilfe
```

`<container>` ist der Name des DMS-Containers (bei dms-komplett meist `dms`, beim Betrieb mit zwei Containern der des DMS, nicht der Datenbank). In der Docker-Oberfläche des NAS (Synology Container Manager, QNAP Container Station, Unraid, TrueNAS …) öffnest du stattdessen das **Terminal** des Containers und gibst `dms hilfe` ein.

## Wer darf das?

Wer Befehle im Container ausführen darf, darf auch `dms` – wie ein Administrator. Der Befehl spricht mit dem **laufenden DMS**, nicht direkt mit der Datenbank; Sperren, Sitzungen und Protokoll bleiben so stimmig. Jede Aktion steht im [Protokoll](fehlersuche.md#protokoll) mit dem Vermerk **(Konsole)**.

`dms` handelt als der älteste aktive Administrator. Mit `--als <email>` wählst du einen anderen.

Technisch legt das DMS beim Start eine Datei `/tmp/dms-konsole.json` mit einem zufälligen Schlüssel an, lesbar nur im Container. Den Schlüssel nimmt das DMS nur über die Adresse `127.0.0.1` an – über den veröffentlichten Port oder einen Reverse-Proxy funktioniert er nicht.

## Notfall

| Befehl | Was er tut |
| --- | --- |
| `dms passwort <email>` | Passwort direkt setzen, ohne Mail und Link. Fragt das neue Passwort zweimal ab; alle Sitzungen des Benutzers enden. Ohne Terminal: `--passwort <neu>`. |
| `dms zweifaktor-zuruecksetzen <email>` | [Zwei-Faktor-Anmeldung](anmeldeschutz.md#zwei-faktor-anmeldung) entfernen (Handy verloren). |
| `dms gesperrt` | gesperrte IP-Adressen ([Anmeldeschutz](anmeldeschutz.md)) |
| `dms entsperren <ip>` | IP-Adresse freigeben |
| `dms wartung` / `dms wartung aus` | Stand des [Wartungsmodus](wartungsmodus.md) / ihn beenden |
| `dms abmelden <email>` | alle Sitzungen eines Benutzers beenden |
| `dms abmelden --alle` | alle Benutzer überall abmelden |

!!! example "Ausgesperrt"
    ```sh
    docker exec -it dms dms passwort ich@example.org
    docker exec -it dms dms entsperren 192.168.1.20
    ```

Gibt es gar keinen aktiven Administrator mehr, setzt `dms passwort` trotzdem ein Passwort; die übrigen Befehle brauchen einen. Dann hilft der [Notfallzugang](notfall.md).

## Betrieb

| Befehl | Was er tut |
| --- | --- |
| `dms status` | Version, Variante, Laufzeit, Datenbank |
| `dms sicherung` | Sicherungen auflisten, laufende Sicherung |
| `dms sicherung jetzt` | [Sicherung](sicherung.md) starten |
| `dms sicherung pruefen <name>` | Sicherung prüfen |

## Verwaltung

| Befehl | Was er tut |
| --- | --- |
| `dms benutzer` | Benutzer mit Rolle, Status und letzter Anmeldung |
| `dms benutzer anlegen <email> <name> [--admin]` | Benutzer anlegen; die Einladung geht per Mail oder der Link steht in der Ausgabe |
| `dms benutzer deaktivieren <email>` / `aktivieren <email>` | Zugang sperren oder wieder freigeben |

## Alles andere: `dms api`

Jede Funktion der Werkbank erreichst du mit `dms api <METHODE> <pfad> [json]`. Die Antwort kommt als JSON.

```sh
dms api GET /api/werkbank/anmeldeschutz
dms api PUT /api/werkbank/zweifaktor '{"admin":true}'
dms api PUT /api/werkbank/sicherung/plan '{"uhrzeit":"02:30"}'
```

Welche Pfade es gibt, zeigt der Netzwerk-Reiter der Entwicklerwerkzeuge im Browser, während du die Einstellung in der Werkbank änderst.

## Für Skripte

- `--json` gibt jede Antwort als JSON aus.
- `--ja` beantwortet Rückfragen (z. B. bei `abmelden --alle`); ohne Terminal (`docker exec` ohne `-it`) ist es Pflicht.
- Rückgabewert: `0` erledigt, `1` Fehler, `2` falscher Aufruf, `3` DMS läuft nicht oder ist im Einrichtungsmodus, `4` Zugang abgelehnt.

## Meldungen

- **„Das DMS läuft nicht“** – der Server startet gerade oder ist abgestürzt; siehe Protokoll des Containers.
- **„Das DMS läuft im Einrichtungsmodus“** – es ist noch keine Datenbank angebunden. Richte das DMS zuerst im Browser ein.
- **„Keine Berechtigung für /tmp/dms-konsole.json“** – `docker exec` mit `--user` aufgerufen; ohne `--user` aufrufen.
