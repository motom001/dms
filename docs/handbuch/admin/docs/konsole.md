# Konsole: Befehl `dms`

Im Container des DMS gibt es den Befehl `dms`. Damit erledigst du Notfälle und Routinearbeiten ohne Browser – etwa wenn du dich ausgesperrt hast oder etwas per Skript tun willst.

Am einfachsten rufst du ihn im Ordner der Compose-Datei über den Namen des Dienstes auf:

```sh
docker compose exec app dms hilfe     # zwei Container (Dienst „app“)
docker compose exec dms dms hilfe     # dms-komplett (Dienst „dms“)
```

Mit `docker exec` brauchst du den Namen des Containers. Docker setzt ihn aus dem Namen des Projekts und des Dienstes zusammen, z. B. `dms-app-1` (zwei Container) oder `dms-dms-1` (dms-komplett). Welche Namen es gibt, zeigt `docker ps`. Nimm den Container des DMS, nicht den der Datenbank:

```sh
docker exec -it dms-app-1 dms hilfe
```

In der Docker-Oberfläche des NAS (Synology Container Manager, QNAP Container Station, Unraid, TrueNAS …) öffnest du stattdessen das **Terminal** des Containers und gibst `dms hilfe` ein.

## Wer darf das?

Wer Befehle im Container ausführen darf, darf auch `dms` – wie ein Administrator. Der Befehl spricht mit dem **laufenden DMS**, nicht direkt mit der Datenbank; Sperren, Sitzungen und Protokoll bleiben so stimmig. Jede Aktion steht im [Protokoll](fehlersuche.md#protokoll) mit dem Vermerk **(Konsole)**.

`dms` handelt als der älteste aktive Administrator. Mit `--als <email>` wählst du einen anderen.

Technisch legt das DMS beim Start eine Datei `/tmp/dms-konsole.json` mit einem zufälligen Schlüssel an, lesbar nur im Container. Einen anderen Ort legt die Umgebungsvariable `DMS_KONSOLE_DATEI` fest; sie muss dann für das DMS und den Befehl `dms` gleich sein. Den Schlüssel nimmt das DMS nur über die Adresse `127.0.0.1` an – über den veröffentlichten Port oder einen Reverse-Proxy funktioniert er nicht.

Der Befehl `dms` funktioniert auch im [Wartungsmodus](wartungsmodus.md). So beendest du ihn mit `dms wartung aus`, auch wenn die Oberfläche gesperrt ist.

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
    docker compose exec app dms passwort ich@example.org
    docker compose exec app dms entsperren 192.168.1.20
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
- Rückgabewert: `0` erledigt, `1` Fehler, `2` falscher Aufruf, `3` DMS läuft nicht oder ist im Einrichtungsmodus, `4` Zugang abgelehnt, `130` Eingabe abgebrochen (z. B. mit Strg+C bei der Abfrage des Passworts).

## Meldungen

- **„Das DMS läuft nicht“** – der Server startet gerade oder ist abgestürzt; siehe Protokoll des Containers.
- **„Das DMS läuft im Einrichtungsmodus“** – es ist noch keine Datenbank angebunden. Richte das DMS zuerst im Browser ein.
- **„Keine Berechtigung für /tmp/dms-konsole.json“** – `docker exec` mit `--user` aufgerufen; ohne `--user` aufrufen.
