# Ein Container: dms-komplett

Der einfachste Weg mit Docker: **ein Container**, in dem das DMS und seine Datenbank (PostgreSQL 17) zusammen laufen. Es gibt kein Passwort einzutragen, keinen Datenbank-Container und kein Compose-Projekt, wenn du keines willst. Das Image heißt `ghcr.io/motom001/dms-komplett` und läuft auf amd64 und arm64.

!!! info "Wann lieber zwei Container?"
    Willst du die Datenbank selbst verwalten, mehrere Programme an einen PostgreSQL-Server hängen oder ihn auf einem anderen Gerät betreiben, nimm das schlanke Image `dms` mit eigener Datenbank, wie in den anderen Anleitungen. Ein Umzug zwischen beiden geht jederzeit über Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](https://motom001.github.io/dms/admin/aktuell/wachsen/).

## Mit Docker Compose

```sh
mkdir -p ~/dms && cd ~/dms
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/motom001/dms/main/deploy/komplett/docker-compose.yml
docker compose up -d
docker compose logs dms | grep -A1 Einrichtungscode
```

Die Ordner `files`, `geheim`, `sicherung` und `postgres` legt Docker neben der Datei an. Auf einem NAS ersetzt du `./` durch den Pfad deines Ordners, z. B. `/volume1/docker/dms/`.

## Mit `docker run`

```sh
docker run -d --name dms --restart unless-stopped --stop-timeout 60 -p 8080:3000 \
  -v /pfad/zu/dms/files:/data/files \
  -v /pfad/zu/dms/geheim:/data/geheim \
  -v /pfad/zu/dms/sicherung:/data/sicherung \
  -v /pfad/zu/dms/postgres:/data/postgres \
  ghcr.io/motom001/dms-komplett:main
```

## In der Oberfläche eines NAS

Synology (Container Manager), UGREEN (Docker), QNAP (Container Station) und Unraid können einen Container direkt aus einem Image erstellen:

1. Image **`ghcr.io/motom001/dms-komplett:main`** herunterladen bzw. als Container anlegen.
2. **Port:** lokal `8080` → Container `3000`.
3. **Ordner:** vier Ordner auf dem NAS anlegen und zuordnen – `files` → `/data/files`, `geheim` → `/data/geheim`, `sicherung` → `/data/sicherung`, `postgres` → `/data/postgres`.
4. **Neustart-Richtlinie:** „immer“ bzw. „unless-stopped“.
5. Starten.

## Einrichten

`http://<Gerät>:8080` öffnen. Der Assistent fragt nach dem **Einrichtungscode**. Er steht im Protokoll des Containers und in der Datei `geheim/EINRICHTUNGSCODE`. Die Datenbank fragt er **nicht** ab, sie ist schon angebunden. Danach folgen Haushalt, Administrator und der Rest. Die Schritte im Einzelnen stehen im [Administratorhandbuch](https://motom001.github.io/dms/admin/aktuell/installation/#der-einrichtungsassistent).

Hast du schon ein DMS mit zwei Containern, wähle im Assistenten **Aus einer Sicherung wiederherstellen** und spiel eine Sicherung von dort ein. So ziehst du um, ohne etwas zu verlieren.

## Gut zu wissen

- **Kein Passwort:** Die Datenbank ist nur innerhalb des Containers erreichbar. Von außen gibt es keinen Datenbank-Port.
- **Ordner:** Alle vier müssen auf dem Gerät liegen (Volumes), sonst sind sie beim nächsten Update weg. Der Container richtet die Rechte von `postgres` beim Start selbst.
- **Stoppen:** Beim Stoppen fährt der Container erst das DMS und dann die Datenbank sauber herunter. Gib ihm dafür bis zu einer Minute Zeit (`stop_grace_period` bzw. `--stop-timeout`). Endet einer der beiden Teile unerwartet, endet der ganze Container, und Docker startet ihn neu.
- **Updates:** `docker compose pull && docker compose up -d` bzw. das Image neu ziehen und den Container neu erstellen. Mit einer Versionsnummer statt `main`, z. B. `ghcr.io/motom001/dms-komplett:0.42.0`, bleibt die Installation auf diesem Release.
- **Neue PostgreSQL-Hauptversion:** Bringt ein künftiges Image eine neue Hauptversion mit (z. B. 18), startet der Container mit der alten Datenbank bewusst nicht und sagt das im Protokoll. Der Umstieg geht dann über Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](https://motom001.github.io/dms/admin/aktuell/wachsen/#neue-hauptversion-von-postgresql).
- **Werkbank → Technik** zeigt „Image: dms-komplett“ und „Datenbank: im Container“.
