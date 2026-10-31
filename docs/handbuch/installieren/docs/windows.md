# Windows

Läuft bei dir ohnehin ein Windows-Rechner rund um die Uhr, kann er das DMS mit übernehmen. Das DMS ist ein Linux-Container. Unter Windows braucht es deshalb eine kleine Linux-Umgebung, die Windows selbst mitbringt: **WSL 2** oder **Hyper-V**.

| Rechner | Empfohlener Weg |
|---|---|
| Windows 10/11, wird meist benutzt und läuft nicht immer | [Docker Desktop](#docker-desktop-windows-1011) |
| Windows 10/11 Pro, soll dauerhaft als Server laufen | [Linux-VM in Hyper-V](#linux-vm-in-hyper-v) |
| Windows Server | [Linux-VM in Hyper-V](#linux-vm-in-hyper-v) |

## Docker Desktop (Windows 10/11)

1. [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) installieren und beim Einrichten **WSL 2** wählen. Für die private Nutzung ist Docker Desktop kostenlos; für Firmen gelten die [Lizenzbedingungen von Docker](https://docs.docker.com/subscription/desktop-license/).
2. Eine Linux-Umgebung aus dem Microsoft Store installieren, z. B. **Ubuntu**, und in Docker Desktop unter **Settings → Resources → WSL integration** einschalten.
3. Das **Ubuntu-Terminal** öffnen und dort die Befehle aus [PC mit Linux → DMS starten](linux.md#3-dms-starten) ausführen.
4. Im Browser `http://localhost:8080` öffnen.

!!! tip "Daten in Linux ablegen, nicht auf C:"
    Lege das DMS im Ubuntu-Terminal unter `~/dms` an, nicht unter `/mnt/c/…`. Ordner auf dem Windows-Laufwerk sind über WSL deutlich langsamer, und die Datenbank kann dort Probleme mit Dateirechten bekommen. Im Explorer findest du die Ordner unter **Linux → Ubuntu → home**.

!!! warning "Läuft nur, solange jemand angemeldet ist"
    Docker Desktop startet erst nach der Anmeldung an Windows (**Settings → General → Start Docker Desktop when you sign in**). Ist der Rechner aus, im Ruhezustand oder niemand angemeldet, ist das DMS nicht erreichbar. Für einen Rechner, der als Server dienen soll, ist die Hyper-V-VM der bessere Weg.

Damit andere Geräte im Heimnetz das DMS erreichen, muss die **Windows-Firewall** eingehende Verbindungen auf Port 8080 erlauben. Docker Desktop fragt danach beim ersten Start.

## Linux-VM in Hyper-V

Hyper-V ist in **Windows 10/11 Pro, Enterprise** und in **Windows Server** enthalten. Darin läuft ein kleines Linux, unabhängig davon, ob jemand angemeldet ist.

1. Hyper-V einschalten: **Windows-Features aktivieren oder deaktivieren → Hyper-V** (bei Windows Server: **Server-Manager → Rollen hinzufügen → Hyper-V**).
2. Im Hyper-V-Manager einen **virtuellen Switch** vom Typ *Extern* anlegen, damit die VM eine eigene Adresse im Heimnetz bekommt.
3. Eine **VM der Generation 2** anlegen: 2 Prozessoren, 2–4 GB Arbeitsspeicher (fest, nicht dynamisch), Festplatte nach Bedarf, ISO von [Debian](https://www.debian.org/distrib/) oder [Ubuntu Server](https://ubuntu.com/download/server). Bei Debian unter **Sicherheit** die Vorlage *Microsoft UEFI-Zertifizierungsstelle* wählen, sonst startet die Installation nicht.
4. In den VM-Einstellungen unter **Automatische Startaktion** *Immer starten* wählen.
5. In der VM weiter wie auf jedem [PC mit Linux](linux.md#2-docker-installieren).

!!! note "Docker direkt auf Windows Server?"
    Docker Desktop ist für Windows Server nicht vorgesehen, und die eingebauten Windows-Container können keine Linux-Images ausführen. Die Linux-VM ist der einfachste verlässliche Weg.

## Sicherung

Kopiere den Ordner `sicherung` regelmäßig an einen anderen Ort, z. B. mit dem Windows-Dateiversionsverlauf, OneDrive oder einer USB-Platte. In WSL liegt er unter `\\wsl$\Ubuntu\home\<Name>\dms\daten\sicherung` (zwei Container) bzw. `\\wsl$\Ubuntu\home\<Name>\dms\sicherung` (dms-komplett). Bei der VM kopierst du ihn innerhalb von Linux weiter, siehe [PC mit Linux → Sicherung](linux.md#sicherung).
