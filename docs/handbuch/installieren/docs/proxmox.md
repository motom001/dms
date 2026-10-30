# Proxmox und andere Virtualisierung

Hast du zu Hause schon einen Server mit **Proxmox VE** oder einer anderen Virtualisierung, bekommt das DMS am besten eine eigene kleine **Linux-VM** mit Docker.

## Proxmox VE

### Als VM (empfohlen)

1. ISO von [Debian](https://www.debian.org/distrib/) oder [Ubuntu Server](https://ubuntu.com/download/server) unter **local → ISO Images** hochladen oder per URL herunterladen.
2. **Create VM:** 2 Kerne, 2–4 GB Arbeitsspeicher, 32 GB Festplatte plus Platz für Dokumente und Sicherungen. Unter *System* den **QEMU Guest Agent** einschalten.
3. Linux installieren, dann in der VM:
   ```sh
   sudo apt install qemu-guest-agent
   ```
4. In den VM-Optionen **Start at boot** einschalten.
5. Weiter wie auf jedem [PC mit Linux](linux.md#2-docker-installieren).

### Als LXC-Container

Docker läuft auch in einem LXC-Container, wenn dort **nesting** (bei unprivilegierten Containern zusätzlich **keyctl**) eingeschaltet ist. Das spart etwas Arbeitsspeicher. Proxmox selbst empfiehlt für Docker aber eine VM: Im Container teilt sich Docker den Kernel mit dem Host, und Updates von Proxmox können ihn gelegentlich stören. Wer LXC schon gut kennt, kann diesen Weg gehen; allen anderen raten wir zur VM.

### Sicherung

Proxmox kann die ganze VM sichern (**Datacenter → Backup** oder Proxmox Backup Server). Das ist ein guter zusätzlicher Schutz, ersetzt aber nicht die Sicherung des DMS: Sie ist verschlüsselt, lässt sich auf jedem Gerät wiederherstellen und braucht kein Proxmox. Kopiere den Ordner `sicherung` deshalb trotzdem an einen anderen Ort, siehe [PC mit Linux → Sicherung](linux.md#sicherung).

## Andere Virtualisierung

Überall gilt dasselbe Muster: **Linux-VM anlegen** (2 Kerne, 2–4 GB, Netzwerk als Brücke ins Heimnetz), **automatischen Start** einschalten und dann weiter wie auf einem [PC mit Linux](linux.md#2-docker-installieren).

| Plattform | Typisch für | Hinweis |
|---|---|---|
| **Hyper-V** | Windows 10/11 Pro, Windows Server | Siehe [Windows → Linux-VM in Hyper-V](windows.md#linux-vm-in-hyper-v). |
| **XCP-ng** | Heimserver, freie Alternative zu VMware | VM aus der Debian- oder Ubuntu-Vorlage anlegen, *Auto power on* einschalten. |
| **VMware ESXi** | vorhandene Heimlabore | Wie bei Proxmox; VMware Tools in Linux: Paket `open-vm-tools`. |
| **VirtualBox, VMware Workstation** | ein normaler Desktop-PC | Geht zum Ausprobieren. Die VM läuft nur, solange der PC an und das Programm geöffnet ist – für den Dauerbetrieb nicht ideal. |
| **NAS mit eigener Virtualisierung** (Synology VMM, QNAP Virtualization Station, Unraid VMs) | NAS | Nicht nötig: Diese Geräte können Docker direkt, siehe die [NAS-Anleitungen](index.md#was-hast-du). |
