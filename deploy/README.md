# Vorlagen zum Installieren

Welche Datei wofür – Anleitungen unter **[Wie komme ich an ein DMS?](https://motom001.github.io/dms/installieren/aktuell/)**.

**Empfohlen sind zwei Container** (DMS `ghcr.io/motom001/dms` + PostgreSQL `postgres:17`): PostgreSQL bekommt Sicherheits-Updates unabhängig vom DMS, beide lassen sich einzeln betreiben. `dms-komplett` ist die Alternative zum Ausprobieren und für Umgebungen, die nur einen Container zulassen ([Ein oder zwei Container?](https://motom001.github.io/dms/installieren/aktuell/#ein-oder-zwei-container)).

| Ordner | Variante | Für | Was du einträgst |
| --- | --- | --- | --- |
| [`nas/`](nas/docker-compose.yml) | zwei Container | jeden Server mit Docker Compose | Pfade; Passwort in einer `.env` (`DB_PASSWORD=…`) |
| [`synology/`](synology/docker-compose.yml) | zwei Container | Synology Container Manager | Passwort oben in der Datei, ggf. `volume1` |
| [`ugreen/`](ugreen/docker-compose.yml) | zwei Container | UGREEN Docker → Projekt | Passwort oben, ggf. Pfade |
| [`qnap/`](qnap/docker-compose.yml) | zwei Container | QNAP Container Station | Passwort oben, ggf. Pfade |
| [`truenas/`](truenas/docker-compose.yml) | zwei Container | TrueNAS Apps → Custom App | Passwort oben, Datensatz-Pfade |
| [`unraid/`](unraid/docker-compose.yml) | zwei Container | Unraid Compose Manager | Passwort oben, ggf. Pfade |
| [`komplett/`](komplett/docker-compose.yml) | **ein Container** (`dms-komplett`) | Ausprobieren, nur ein Container möglich | nichts – höchstens die Pfade |

Die App-Stores (umbrelOS, ZimaOS, CasaOS, TrueNAS-Katalog, Unraid Community Applications) liegen im Repository [motom001/dms-appstore](https://github.com/motom001/dms-appstore).

Die CI installiert jede Vorlage bei jedem Pull Request probehalber (`vorlagen-probe.sh`, `komplett-probe.sh`).
