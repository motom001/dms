# Vorlagen zum Installieren

Welche Datei wofür – Anleitungen unter **[Wie komme ich an ein DMS?](https://help.ablago.app/installieren/aktuell/)**.

**Empfohlen sind zwei Container** (Ablago `ghcr.io/motom001/dms` + PostgreSQL `postgres:18`): PostgreSQL bekommt Sicherheits-Updates unabhängig von Ablago, beide lassen sich einzeln betreiben. `dms-komplett` ist die Alternative zum Ausprobieren und für Umgebungen, die nur einen Container zulassen ([Ein oder zwei Container?](https://help.ablago.app/installieren/aktuell/#ein-oder-zwei-container)).

| Ordner | Variante | Für | Was du einträgst |
| --- | --- | --- | --- |
| [`nas/`](nas/docker-compose.yml) | zwei Container | jeden Server mit Docker Compose | Pfade; Passwort in einer `.env` (`DB_PASSWORD=…`) |
| [`synology/`](synology/docker-compose.yml) | zwei Container | Synology Container Manager | Passwort oben in der Datei, ggf. `volume1` |
| [`ugreen/`](ugreen/docker-compose.yml) | zwei Container | UGREEN Docker → Projekt | Passwort oben, ggf. Pfade |
| [`qnap/`](qnap/docker-compose.yml) | zwei Container | QNAP Container Station | Passwort oben, ggf. Pfade |
| [`truenas/`](truenas/docker-compose.yml) | zwei Container | TrueNAS Apps → Custom App | Passwort oben, Datensatz-Pfade |
| [`unraid/`](unraid/docker-compose.yml) | zwei Container | Unraid Compose Manager | Passwort oben, ggf. Pfade |
| [`raspberry-pi/`](raspberry-pi/docker-compose.yml) | zwei Container | Raspberry Pi 4/5 und jeder Linux-Rechner; dazu das Einrichtungsskript [`einrichten.sh`](raspberry-pi/einrichten.sh) (prüft, legt an, startet) | nichts – das Skript schreibt das Passwort in eine `.env` ([Anleitung](https://help.ablago.app/installieren/aktuell/raspberry-pi/)) |
| [`komplett/`](komplett/docker-compose.yml) | **ein Container** (`dms-komplett`) | Ausprobieren, nur ein Container möglich | nichts – höchstens die Pfade |

Die App-Stores (umbrelOS, ZimaOS, CasaOS, TrueNAS-Katalog, Unraid Community Applications) liegen im Repository [motom001/dms-appstore](https://github.com/motom001/dms-appstore).

Die CI installiert jede Vorlage bei jedem Pull Request probehalber (`vorlagen-probe.sh`, `komplett-probe.sh`) und prüft das Einrichtungsskript mit shellcheck.

## Beispiele für Dienste neben Ablago

| Ordner | Was | Anleitung |
| --- | --- | --- |
| [`beispiele/ki-ollama/`](beispiele/ki-ollama/) | lokaler KI-Dienst (Ollama) für das Paket „KI-Assistent“ – nur Prozessor, mit Ergänzungen für Grafik; kein Port nach außen | [KI lokal betreiben](https://help.ablago.app/admin/aktuell/ki-lokal/) |

Die CI startet das KI-Beispiel probehalber, wenn es sich ändert, und jede Woche (`beispiele/ki-ollama/probe.sh`).
