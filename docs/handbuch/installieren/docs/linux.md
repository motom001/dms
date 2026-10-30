# PC oder Mini-PC mit Linux

Ein alter Bürorechner, ein ausgedienter Laptop oder ein kleiner Mini-PC mit Intel- oder AMD-Prozessor reicht für das DMS gut aus. Diese Seite ist auch die Grundlage für den [Raspberry Pi](raspberry-pi.md) und für [virtuelle Maschinen](proxmox.md).

**Du brauchst:** 2 GB Arbeitsspeicher oder mehr, etwa 20 GB für System und Programme, dazu Platz für deine Dokumente und Sicherungen. Eine SSD macht das DMS spürbar schneller.

## 1. Linux installieren

Ein schlankes Server-System ohne Desktop genügt, z. B. **[Debian](https://www.debian.org/distrib/)** oder **[Ubuntu Server](https://ubuntu.com/download/server)** (LTS). Beim Installieren den **SSH-Server** mit auswählen, dann kannst du den Rechner später ohne Bildschirm vom eigenen PC aus bedienen.

## 2. Docker installieren

Am verlässlichsten ist Docker aus dem offiziellen Paketarchiv von Docker. Die Befehle stehen in der Docker-Dokumentation für [Debian](https://docs.docker.com/engine/install/debian/) bzw. [Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Kurzform mit dem Installationsskript von Docker:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # danach einmal ab- und wieder anmelden
docker compose version          # prüft, ob Compose dabei ist
```

## 3. DMS starten

```sh
mkdir -p ~/dms && cd ~/dms
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/motom001/dms/main/deploy/nas/docker-compose.yml
sed -i 's#/volume1/docker/dms#./daten#' docker-compose.yml
echo "DB_PASSWORD=$(openssl rand -hex 24)" > .env
docker compose up -d
docker compose logs app | grep -A1 Einrichtungscode
```

!!! tip "Noch einfacher: ein Container"
    Mit [dms-komplett](komplett.md) ist es ein einziger Container mit eingebauter Datenbank, ohne `.env` und Passwort:
    `curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/motom001/dms/main/deploy/komplett/docker-compose.yml && docker compose up -d`.

Die Daten liegen damit in `~/dms/daten`. Hast du für Dokumente oder Sicherungen eine eigene Platte, trägst du deren Pfade in der `docker-compose.yml` ein. Weiter geht es im Browser unter `http://<Rechner>:8080`, wie unter [Jeder Server mit Docker](docker.md) beschrieben.

## 4. Den Rechner zum Server machen

- **Nicht schlafen gehen:** Ein Server-System ohne Desktop schläft normalerweise nicht. Auf einem Laptop oder mit Desktop schaltest du den Ruhezustand ab:
  ```sh
  sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
  ```
  Beim Laptop zusätzlich in `/etc/systemd/logind.conf` `HandleLidSwitch=ignore` setzen, damit er bei geschlossenem Deckel weiterläuft.
- **Nach Stromausfall wieder an:** Im BIOS/UEFI die Einstellung *Restore on AC Power Loss* (o. ä.) auf *Power On* stellen. Die Container starten danach von selbst wieder.
- **Feste Adresse:** Im Router dem Rechner immer dieselbe IP-Adresse geben (DHCP-Reservierung). Dann bleibt die Adresse des DMS gleich.
- **Updates des Systems:** Unter Debian und Ubuntu übernimmt das Paket `unattended-upgrades` die Sicherheitsupdates.

## Sicherung

Die Sicherungen des DMS landen im Ordner `sicherung` auf demselben Rechner. Fällt die Platte aus, sind sie mit weg. Kopiere den Ordner deshalb regelmäßig woandershin, z. B. auf eine USB-Platte, ein NAS oder in einen Cloudspeicher (etwa mit `rclone`). Mehr dazu unter [Sicherung](https://motom001.github.io/dms/admin/aktuell/sicherung/).
