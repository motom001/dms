# Wie komme ich an ein DMS?

[![Neueste Version](https://img.shields.io/github/v/release/motom001/dms?label=Version)](https://github.com/motom001/dms/releases)
[![Sterne auf GitHub](https://img.shields.io/github/stars/motom001/dms?label=Sterne&logo=github)](https://github.com/motom001/dms/stargazers)
[![Letzte Änderung](https://img.shields.io/github/last-commit/motom001/dms?label=letzte%20%C3%84nderung)](https://github.com/motom001/dms/commits/main)
![Images für amd64 und arm64](https://img.shields.io/badge/Image-amd64%20%7C%20arm64-2b7656?logo=docker&logoColor=white)
[![Lizenz AGPL-3.0](https://img.shields.io/github/license/motom001/dms?label=Lizenz)](https://github.com/motom001/dms/blob/main/LICENSE)

Das DMS läuft bei dir zu Hause: auf einem NAS, einem kleinen Heimserver oder jedem Rechner mit Docker. Deine Unterlagen bleiben damit bei dir. Welcher Weg der richtige ist, hängt davon ab, was du schon hast.

## Was hast du?

| Gerät oder System | Weg | Aufwand |
| --- | --- | --- |
| **umbrelOS** | [App Store mit einem Klick](umbrel.md) | ☆ sehr gering: Store hinzufügen, installieren, fertig |
| **ZimaOS** | [App Store mit einem Klick](zimaos.md) | ☆ sehr gering: wie bei umbrelOS |
| **CasaOS** | [App Store mit einem Klick](casaos.md) | ☆ sehr gering: wie bei umbrelOS |
| **Synology-NAS** | [Container Manager](synology.md) | ☆☆ gering: Ordner anlegen, Vorlage einfügen, Passwort eintragen |
| **UGREEN-NAS** (UGOS Pro) | [Docker → Projekt](ugreen.md) | ☆☆ gering: wie bei Synology |
| **QNAP-NAS** | [Container Station](qnap.md) | ☆☆ gering: wie bei Synology |
| **TrueNAS** | [Apps → Custom App](truenas.md) | ☆☆ gering: Datensatz anlegen, Vorlage einfügen |
| **Unraid** | [Compose Manager](unraid.md) | ☆☆ gering: Plugin installieren, Vorlage einfügen |
| **jedes Gerät mit Docker**, am einfachsten | [Ein Container: dms-komplett](komplett.md) | ☆☆ gering: ein Image, vier Ordner, kein Passwort |
| **anderer Server mit Docker** | [Docker Compose](docker.md) | ☆☆☆ mittel: Kommandozeile oder eigene Docker-Oberfläche |

Alle Wege brauchen ein Gerät mit **amd64** (Intel, AMD) oder **arm64** (z. B. Raspberry Pi 4/5) und etwa 1 GB freien Arbeitsspeicher. Dazu kommt Platz für deine Dokumente.

!!! tip "Du hast noch nichts davon?"
    Am einfachsten ist ein kleiner Heimserver mit **umbrelOS** oder **ZimaOS**, z. B. ein Mini-PC oder ein ZimaBoard. Dort installierst du das DMS wie eine App auf dem Handy. Ein NAS von Synology, UGREEN oder QNAP geht ebenso und kümmert sich zusätzlich um deine Festplatten.

## Was du in jedem Fall bekommst

- Zwei Container: das DMS selbst und eine PostgreSQL-Datenbank. Mit [dms-komplett](komplett.md) ist es ein Container, in dem beides läuft.
- Vier Ordner auf deinem Gerät: `files` (Dokumente), `geheim` (Schlüssel), `sicherung` (Sicherungen) und `postgres` (Datenbank).
- Die Oberfläche im Browser, meist unter `http://<Gerät>:8080`. Bei den App-Stores ist es Port `8478`.

## Nach der Installation

1. **Einrichten.** Beim ersten Aufruf führt ein Assistent durch die Einrichtung: Haushalt, Administrator, erster Benutzer, Schlüssel und Notfallblatt. Die Schritte im Einzelnen beschreibt das [Administratorhandbuch](https://motom001.github.io/dms/admin/aktuell/installation/#der-einrichtungsassistent).
2. **Sichern.** Unter **Werkbank → Sicherung** den Zeitplan einschalten und das Notfallblatt ausdrucken. Kopiere die Sicherungen ab und zu an einen anderen Ort, z. B. auf einen USB-Stick oder in einen Cloudspeicher. Fällt das Gerät aus, sind sonst auch die Sicherungen weg. Mehr unter [Sicherung](https://motom001.github.io/dms/admin/aktuell/sicherung/).
3. **Loslegen.** Wie man mit Mappen, Dokumenten und Aufgaben arbeitet, steht im [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/aktuell/).

!!! warning "Erst einrichten, dann von außen erreichbar machen"
    Gib das DMS erst über eine Portfreigabe, einen Tunnel oder einen Reverse-Proxy nach außen frei, wenn die Einrichtung abgeschlossen ist. Wie das mit HTTPS geht, steht unter [Hinter einem Reverse-Proxy](https://motom001.github.io/dms/admin/aktuell/installation/#hinter-einem-reverse-proxy).

## Ein Beispiel

Wie das DMS beim Entwickler im Alltag läuft – Gerät, Zugriff von unterwegs, Speicher und Sicherung, jeweils mit dem Warum –, steht unter [So läuft es beim Entwickler](beispiel.md).

## Hilfe

Hakt es bei der Installation? Schreib ein [Issue auf GitHub](https://github.com/motom001/dms/issues) und nenne dein Gerät, sein System und die Meldung, die du siehst.
