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
| **PC oder Mini-PC** (Intel, AMD) | [Linux mit Docker](linux.md) | ☆☆☆ mittel: Linux installieren, ein paar Befehle |
| **Raspberry Pi** 4 oder 5 | [Raspberry Pi OS mit Docker](raspberry-pi.md) | ☆☆☆ mittel: wie beim PC, plus SSD |
| **Windows-PC oder Windows Server** | [Docker Desktop oder Hyper-V](windows.md) | ☆☆☆ mittel: Docker Desktop installieren oder Linux-VM anlegen |
| **Proxmox**, XCP-ng, ESXi … | [Linux-VM mit Docker](proxmox.md) | ☆☆☆ mittel: VM anlegen, dann wie beim PC |
| **Alternative: ein Container** (Ausprobieren, nur ein Container möglich) | [dms-komplett](komplett.md) | ☆☆ gering: ein Image, vier Ordner, kein Passwort – siehe [Ein oder zwei Container?](#ein-oder-zwei-container) |
| **anderer Server mit Docker** | [Docker Compose](docker.md) | ☆☆☆ mittel: Kommandozeile oder eigene Docker-Oberfläche |

Alle Wege brauchen ein Gerät mit **amd64** (Intel, AMD) oder **arm64** (z. B. Raspberry Pi 4/5) und etwa 1 GB freien Arbeitsspeicher. Dazu kommt Platz für deine Dokumente.

!!! tip "Du hast noch nichts davon?"
    Am einfachsten ist ein kleiner Heimserver mit **umbrelOS** oder **ZimaOS**, z. B. ein Mini-PC oder ein ZimaBoard. Dort installierst du das DMS wie eine App auf dem Handy. Ein NAS von Synology, UGREEN oder QNAP geht ebenso und kümmert sich zusätzlich um deine Festplatten.

## Ein oder zwei Container?

Das DMS gibt es in zwei Varianten. **Wir empfehlen zwei Container** – so laufen auch alle Anleitungen und App-Stores hier.

| | **Zwei Container** (empfohlen): `dms` + `postgres:17` | **Ein Container**: `dms-komplett` |
| --- | --- | --- |
| Einrichten | Compose-Projekt bzw. App-Store, ein Passwort für die Datenbank | ein Image, vier Ordner, kein Passwort |
| Updates von PostgreSQL | sofort, unabhängig vom DMS: `postgres:17` neu ziehen | erst mit dem nächsten DMS-Image |
| Betrieb | DMS und Datenbank einzeln neu starten, überwachen, mit Standardwerkzeugen sichern | alles zusammen; Datenbank von außen nicht erreichbar (gewollt) |
| Neue Hauptversion von PostgreSQL | planbar, im eigenen Takt | nur über Sicherung und Wiederherstellung |
| App-Stores (umbrelOS, ZimaOS, CasaOS, TrueNAS) | ja | nein |
| Gut für | den Dauerbetrieb | Ausprobieren und Testen, Oberflächen, die nur „Container aus Image erstellen“ können, Anbieter, die nur einen Container erlauben |

**Warum zwei Container?** Ein Dienst je Container ist der übliche Docker-Weg. Die Datenbank kommt aus dem offiziellen PostgreSQL-Image und bekommt Sicherheits-Updates, sobald es sie gibt – unabhängig davon, wann das DMS ein neues Release hat. Fällt einer der beiden aus, lässt er sich allein neu starten und untersuchen. Der Preis ist ein Passwort und ein Compose-Projekt; die Vorlagen hier halten beides so klein wie möglich.

**Wann ein Container?** Wenn es schnell gehen soll (ausprobieren, testen) oder die Umgebung nur einen Container zulässt. Ein Wechsel zwischen beiden Varianten geht jederzeit über Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](https://motom001.github.io/dms/admin/aktuell/wachsen/).

## Was du in jedem Fall bekommst

- Das DMS und eine PostgreSQL-Datenbank – in zwei Containern oder mit [dms-komplett](komplett.md) in einem.
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
