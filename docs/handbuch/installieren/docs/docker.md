# Jeder Server mit Docker

Diese Seite gilt für jedes Gerät ohne eigene Anleitung; eigene Seiten gibt es für einen [PC mit Linux](linux.md), den [Raspberry Pi](raspberry-pi.md), [Windows](windows.md) und [Proxmox und Co.](proxmox.md). Das DMS braucht **Docker mit Docker Compose**. Die Images sind öffentlich (amd64 und arm64), eine Anmeldung bei der Registry ist nicht nötig.

Empfohlen sind **zwei Container** (DMS und PostgreSQL); die Gegenüberstellung steht unter [Ein oder zwei Container?](index.md#ein-oder-zwei-container). Wer nur ausprobieren will oder nur einen Container betreiben kann, nimmt [dms-komplett](komplett.md).

## Mit der Kommandozeile

```sh
mkdir -p ~/dms && cd ~/dms
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/motom001/dms/main/deploy/nas/docker-compose.yml
echo "DB_PASSWORD=$(openssl rand -hex 24)" > .env
# Pfade unter /volume1/docker/dms in docker-compose.yml an deinen Server anpassen, z. B. ./daten
docker compose up -d
docker compose logs app | grep -A1 Einrichtungscode
```

Dann `http://<Server>:8080` öffnen. Der Assistent fragt nach dem Einrichtungscode aus dem Protokoll und nach der Datenbank: Server `db`, Port `5432`, Datenbank und Benutzer `dms`, Passwort aus der `.env`.

--8<-- "assistent-weiter.md"

## Mit einer Docker-Oberfläche (Portainer, Dockge, Komodo …)

Nimm die Vorlage [`deploy/synology/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/synology/docker-compose.yml) als neuen Stack, trage oben das Passwort ein und passe die Pfade an. Diese Vorlage braucht keine `.env`, und der Assistent fragt die Datenbank nicht ab.

## Gut zu wissen

- **Ordner:** `files`, `geheim`, `sicherung` und `postgres` müssen auf dem Server liegen (Volumes). Sonst sind sie beim nächsten Update weg. Mehr unter [Ordner und Volumes](https://motom001.github.io/dms/admin/aktuell/installation/#ordner-und-volumes).
- **Updates:** `docker compose pull && docker compose up -d` – das holt das DMS und PostgreSQL (`postgres:17`) neu. Mit einer Versionsnummer statt `main`, also `ghcr.io/motom001/dms:<Version>` mit einer Nummer aus den [Releases](https://github.com/motom001/dms/releases), bleibt die Installation auf diesem Release. Siehe [Aktualisieren](https://motom001.github.io/dms/admin/aktuell/aktualisieren/).
- **Datenbankdienst mit anderem Namen:** Die Vorlagen ohne `DATABASE_URL` erwarten die Datenbank unter `db:5432`. Heißt dein Dienst anders oder läuft sie auf einem anderen Port, setze `DMS_DB_HOST` und `DMS_DB_PORT`.
- **Konsole:** Für Notfall und Betrieb gibt es im Container den Befehl `dms`, z. B. `docker compose exec app dms hilfe`. Siehe [Konsole](https://motom001.github.io/dms/admin/aktuell/konsole/).
- **Von außen erreichbar** erst nach der Einrichtung, am besten mit HTTPS über einen Reverse-Proxy: [Hinter einem Reverse-Proxy](https://motom001.github.io/dms/admin/aktuell/installation/#hinter-einem-reverse-proxy).
