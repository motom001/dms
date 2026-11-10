# Wie komme ich an ein DMS?

[Neueste Version und Änderungen](https://github.com/motom001/dms/releases) · Images für amd64 und arm64 · [Lizenz Apache-2.0](https://github.com/motom001/dms/blob/main/LICENSE) · [Quellcode auf GitHub](https://github.com/motom001/dms)

Ablago läuft bei dir zu Hause: auf einem NAS, einem kleinen Heimserver oder jedem Rechner mit Docker. Deine Unterlagen bleiben damit bei dir. Ohne eigenes Gerät geht es auch [bei einem Anbieter](anbieter.md). Welcher Weg der richtige ist, hängt davon ab, was du schon hast.

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
| **Raspberry Pi** 4 oder 5 | [Schritt für Schritt für Einsteiger](raspberry-pi.md): Raspberry Pi OS, Docker, Ablago mit einem Befehl | ☆☆ gering bis ☆☆☆ mittel: jeder Klick erklärt, ein paar Befehle zum Kopieren |
| **Windows-PC oder Windows Server** | [Docker Desktop oder Hyper-V](windows.md) | ☆☆☆ mittel: Docker Desktop installieren oder Linux-VM anlegen |
| **Proxmox**, XCP-ng, ESXi … | [Linux-VM mit Docker](proxmox.md) | ☆☆☆ mittel: VM anlegen, dann wie beim PC |
| **Alternative: ein Container** (Ausprobieren, nur ein Container möglich) | [dms-komplett](komplett.md) | ☆☆ gering: ein Image, vier Ordner, kein Passwort – siehe [Ein oder zwei Container?](#ein-oder-zwei-container) |
| **anderer Server mit Docker** | [Docker Compose](docker.md) | ☆☆☆ mittel: Kommandozeile oder eigene Docker-Oberfläche |
| **kein eigenes Gerät** | [bei einem Anbieter](anbieter.md): fertige App, Docker-Plattform oder eigener vServer | ☆ bis ☆☆☆ je nach Weg – mit Checkliste, worauf du beim Anbieter achtest |

Alle Wege brauchen ein Gerät mit **amd64** (Intel, AMD) oder **arm64** (z. B. Raspberry Pi 4/5) und etwa 1 GB freien Arbeitsspeicher. Dazu kommt Platz für deine Dokumente. Auf welchen Geräten das Projekt Ablago selbst prüft und was andere gemeldet haben, steht unter [Geprüfte Plattformen](plattformen.md).

!!! tip "Du hast noch nichts davon?"
    Am einfachsten ist ein kleiner Heimserver mit **umbrelOS** oder **ZimaOS**, z. B. ein Mini-PC oder ein ZimaBoard. Dort installierst du Ablago wie eine App auf dem Handy. Ein NAS von Synology, UGREEN oder QNAP geht ebenso und kümmert sich zusätzlich um deine Festplatten. Willst du gar kein Gerät betreiben, läuft Ablago auch [bei einem Anbieter](anbieter.md) – worauf du dann achtest, steht dort.

## Ein oder zwei Container?

Ablago gibt es in zwei Varianten. **Wir empfehlen zwei Container** – so laufen auch alle Anleitungen und App-Stores hier.

| | **Zwei Container** (empfohlen): `dms` + `postgres:17` | **Ein Container**: `dms-komplett` |
| --- | --- | --- |
| Einrichten | Compose-Projekt bzw. App-Store, ein Passwort für die Datenbank | ein Image, vier Ordner, kein Passwort |
| Updates von PostgreSQL | sofort, unabhängig von Ablago: `postgres:17` neu ziehen | mit dem nächsten Release (`:stabil` oder feste Version); `:main` wird zum Testen wöchentlich neu gebaut |
| Betrieb | Ablago und Datenbank einzeln neu starten, überwachen, mit Standardwerkzeugen sichern | alles zusammen; Datenbank von außen nicht erreichbar (gewollt) |
| Neue Hauptversion von PostgreSQL | planbar, im eigenen Takt | nur über Sicherung und Wiederherstellung |
| App-Stores (umbrelOS, ZimaOS, CasaOS) | ja | nein |
| Gut für | den Dauerbetrieb | Ausprobieren und Testen, Oberflächen, die nur „Container aus Image erstellen“ können, Anbieter, die nur einen Container erlauben |

**Warum zwei Container?** Ein Dienst je Container ist der übliche Docker-Weg. Die Datenbank kommt aus dem offiziellen PostgreSQL-Image und bekommt Sicherheits-Updates, sobald es sie gibt – unabhängig davon, wann Ablago ein neues Release hat. Fällt einer der beiden aus, lässt er sich allein neu starten und untersuchen. Der Preis ist ein Passwort und ein Compose-Projekt; die Vorlagen hier halten beides so klein wie möglich.

**Wann ein Container?** Wenn es schnell gehen soll (ausprobieren, testen) oder die Umgebung nur einen Container zulässt. Ein Wechsel zwischen beiden Varianten geht jederzeit über Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](https://help.ablago.app/admin/aktuell/wachsen/).

## Was du in jedem Fall bekommst

- Ablago und eine PostgreSQL-Datenbank – in zwei Containern oder mit [dms-komplett](komplett.md) in einem.
- Vier Ordner auf deinem Gerät: `files` (Dokumente), `geheim` (Schlüssel), `sicherung` (Sicherungen) und `postgres` (Datenbank).
- Die Oberfläche im Browser, meist unter `http://<Gerät>:8080`. Bei den App-Stores ist es Port `8478`.

## Nach der Installation

Rufe die Adresse gleich nach dem Start auf. Bereitet sich Ablago noch vor (beim ersten Start legt es die Datenbank an), siehst du für einen Moment die Seite **„Ablago startet …“** mit dem aktuellen Schritt. Sie lädt sich von selbst neu und führt danach zum Einrichtungsassistenten. Du musst nichts tun. Mehr dazu unter [Was du nach dem Start siehst](https://help.ablago.app/admin/aktuell/aktualisieren/#nach-dem-start).

![Die Seite „Ablago startet …“ mit dem aktuellen Schritt und einem Fortschrittsbalken](grafiken/ablago-startet.svg){ .grafik }

1. **Einrichten.** Beim ersten Aufruf führt ein Assistent durch die Einrichtung: je nach Weg Einrichtungscode und Datenbank, dann **Neu einrichten** oder **Aus einer Sicherung wiederherstellen**, Name deiner Ablage, dein Konto, Schlüssel und Notfallblatt. Die Schritte im Einzelnen beschreibt das [Administratorhandbuch](https://help.ablago.app/admin/aktuell/installation/#der-einrichtungsassistent).
2. **Sichern.** Unter **Werkbank → Sicherung** den Zeitplan einschalten und unter **Werkbank → Verschlüsselung** das Notfallblatt ausdrucken. Kopiere die Sicherungen ab und zu an einen anderen Ort, z. B. auf einen USB-Stick oder in einen Cloudspeicher. Fällt das Gerät aus, sind sonst auch die Sicherungen weg. Die Sicherungen sind verschlüsselt, ein Cloudspeicher sieht also nur unlesbare Dateien. Exporte sind nicht darin: Ein [Vollexport](https://help.ablago.app/admin/aktuell/export/) ist unverschlüsselt und liegt deshalb im eigenen [Export-Ordner](https://help.ablago.app/admin/aktuell/export/#export-ordner), nie bei den Sicherungen. Mehr unter [Sicherung](https://help.ablago.app/admin/aktuell/sicherung/).
3. **Loslegen.** Wie man mit Mappen, Dokumenten und Aufgaben arbeitet, steht im [Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/).

!!! warning "Erst einrichten, dann von außen erreichbar machen"
    Gib Ablago erst über eine Portfreigabe, einen Tunnel oder einen Reverse-Proxy nach außen frei, wenn die Einrichtung abgeschlossen ist. Wie das mit HTTPS geht, steht unter [Hinter einem Reverse-Proxy](https://help.ablago.app/admin/aktuell/installation/#hinter-einem-reverse-proxy).

## Ein Beispiel

Wie Ablago beim Entwickler im Alltag läuft – Gerät, Zugriff von unterwegs, Speicher und Sicherung, jeweils mit dem Warum –, steht unter [So läuft es beim Entwickler](beispiel.md).

## Hilfe

Hakt es bei der Installation? Schreib ein [Issue auf GitHub](https://github.com/motom001/dms/issues) und nenne dein Gerät, sein System und die Meldung, die du siehst.
