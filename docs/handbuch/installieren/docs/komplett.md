# Ein Container: dms-komplett

!!! info "Geprüft: automatisch auf amd64 und arm64"
    `dms-komplett` startet bei jeder Änderung probehalber auf den Rechnern von GitHub, auf amd64 und arm64. Von einem bestimmten Gerät gibt es noch keine Meldung. Was das heißt, steht unter [Geprüfte Plattformen](plattformen.md).

Die Alternative zu zwei Containern: **ein Container**, in dem Ablago und seine Datenbank (PostgreSQL 17) zusammen laufen. Es gibt kein Passwort einzutragen, keinen Datenbank-Container und kein Compose-Projekt, wenn du keines willst. Das Image heißt `ghcr.io/motom001/dms-komplett` und läuft auf amd64 und arm64.

!!! info "Empfohlen sind zwei Container"
    Für den Dauerbetrieb empfehlen wir zwei Container (`dms` und `postgres:17`): PostgreSQL bekommt Sicherheits-Updates dann unabhängig von Ablago, und beide lassen sich einzeln betreiben. `dms-komplett` passt gut zum **Ausprobieren und Testen**, für Oberflächen, die nur **„Container aus Image erstellen“** können, und für **Anbieter, die nur einen Container erlauben**. Die Gegenüberstellung steht unter [Ein oder zwei Container?](index.md#ein-oder-zwei-container). Ein Umzug zwischen beiden geht jederzeit über Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](https://help.ablago.app/admin/aktuell/wachsen/).

## Mit Docker Compose

```sh
mkdir -p ~/dms && cd ~/dms
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/motom001/dms/main/deploy/komplett/docker-compose.yml
docker compose up -d
docker compose logs dms | grep -A1 Einrichtungscode
```

Die Ordner `files`, `geheim`, `sicherung`, `postgres` und – optional für den Scanner – `eingang` ([Eingangsordner](https://help.ablago.app/admin/aktuell/eingangsordner/)) legt Docker neben der Datei an. Auf einem NAS ersetzt du `./` durch den Pfad deines Ordners, z. B. `/volume1/docker/dms/`.

## Mit `docker run`

```sh
docker run -d --name dms --restart unless-stopped --stop-timeout 60 -p 8080:3000 \
  -v /pfad/zu/dms/files:/data/files \
  -v /pfad/zu/dms/geheim:/data/geheim \
  -v /pfad/zu/dms/sicherung:/data/sicherung \
  -v /pfad/zu/dms/postgres:/data/postgres \
  ghcr.io/motom001/dms-komplett:stabil
```

## In der Oberfläche eines NAS

Synology (Container Manager), UGREEN (Docker), QNAP (Container Station) und Unraid können einen Container direkt aus einem Image erstellen:

1. Image **`ghcr.io/motom001/dms-komplett:stabil`** herunterladen bzw. als Container anlegen.
2. **Port:** lokal `8080` → Container `3000`.
3. **Ordner:** vier Ordner auf dem NAS anlegen und zuordnen – `files` → `/data/files`, `geheim` → `/data/geheim`, `sicherung` → `/data/sicherung`, `postgres` → `/data/postgres`. Optional für den Scanner einen fünften: `eingang` → `/eingang` ([Eingangsordner](https://help.ablago.app/admin/aktuell/eingangsordner/)).
4. **Neustart-Richtlinie:** „immer“ bzw. „unless-stopped“.
5. Starten.

## Einrichten

`http://<Gerät>:8080` öffnen. Der Assistent fragt nach dem **Einrichtungscode**. Er steht im Protokoll des Containers und in der Datei `geheim/EINRICHTUNGSCODE`. Die Datenbank fragt er **nicht** ab, sie ist schon angebunden.

--8<-- "assistent-weiter.md"

Läuft Ablago bei dir schon mit zwei Containern, wähle im Assistenten **Aus einer Sicherung wiederherstellen** und spiel eine Sicherung von dort ein. So ziehst du um, ohne etwas zu verlieren.

## Datenbank auf der SSD { #datenbank-auf-der-ssd }

Die Datenbank liegt im Ordner, den du für `/data/postgres` einträgst. Er braucht keinen festen Ort neben den anderen Ordnern: Hat dein NAS eine SSD, leg ihn dorthin – PostgreSQL profitiert davon spürbar, die Dateien (`files`) dürfen auf den Festplatten bleiben.

```yaml
    volumes:
      - /volume1/docker/dms/files:/data/files
      # Datenbank auf der SSD
      - /volume2/ssd/dms/postgres:/data/postgres
```

- **Rechte:** Der Container gibt den Ordner beim Start dem Benutzer `postgres` (Nummer 70) und setzt die Rechte auf `700` – auch dann, wenn der Ordner auf dem NAS mit `000` (`d---------`) angelegt wurde. Du musst nichts von Hand einstellen.
- **Benanntes Volume als Alternative:** Macht das NAS mit den Rechten Ärger (Netzwerkfreigaben, ACLs), nimm ein benanntes Docker-Volume. Docker legt es auf der Platte an, auf der Docker selbst liegt:

    ```yaml
    services:
      dms:
        volumes:
          - dms-postgres:/data/postgres
    volumes:
      dms-postgres:
    ```

    Ein benanntes Volume bleibt bei `docker compose down` und bei Updates erhalten. Gelöscht wird es nur mit `docker compose down -v` oder `docker volume rm`.
- **Nicht vergessen:** Fehlt die Zeile für `/data/postgres`, liegt die Datenbank nur im Container. Ablago zeigt das rot in **Werkbank → Übersicht** und unter **Datenbank-Anbindung** und schreibt es beim Start ins Protokoll. Wie du die Daten dann rettest, steht [unten](#datenbank-retten).

## Was du beim Start siehst { #beim-start }

Schon in der ersten Sekunde nach dem Start antwortet die Adresse mit der Seite **„Ablago startet …“**, auch wenn PostgreSQL noch gar nicht läuft. Sie zeigt den Schritt: **Datenbank wird angelegt (nur beim ersten Start)**, **Datenbank startet**, **Ablago startet**, nach einem Update **Datenbank wird aktualisiert – Migration n von m**. Beim ersten Start kann das auf einem NAS einige Minuten dauern. Die Seite lädt sich selbst neu und geht von allein weiter zum Einrichtungsassistenten, zur Anmeldung oder zur Lasttest-Seite. Alle Schritte stehen im [Administratorhandbuch](https://help.ablago.app/admin/aktuell/aktualisieren/#nach-dem-start).

## Der Container startet nicht { #container-startet-nicht }

Scheitert der Start, nennt die Seite unter der Adresse den Grund und den Ausweg (ohne Pfade und Versionen) und bleibt etwa 5 Minuten stehen. Danach endet der Container, und Docker startet ihn neu. Die Einzelheiten stehen im Protokoll des Containers (`docker compose logs dms` bzw. „Protokoll“ in der Oberfläche des NAS). Die Zeilen beginnen mit `[dms-komplett]`.

| Meldung | Was zu tun ist |
| --- | --- |
| `FEHLER: PostgreSQL (Benutzer 70) kann nicht in /data/postgres/daten schreiben. Bitte die Rechte des Ordners auf dem NAS prüfen (ls -la, ACLs mit getfacl) oder ein benanntes Docker-Volume nutzen.` | Der Container konnte die Rechte nicht selbst richten, meist wegen einer Netzwerkfreigabe (NFS mit `root_squash`, SMB) oder ACLs, die stärker sind als die normalen Rechte. Prüfe den Ordner auf dem NAS mit `ls -la` und `getfacl`. Benutzer 70 braucht Lesen, Schreiben und Betreten (`rwx`) für den Ordner und für `daten`. Einfacher: einen lokalen Ordner auf dem NAS oder ein [benanntes Volume](#datenbank-auf-der-ssd) nehmen. |
| `FEHLER: Die Datenbank in /data/postgres stammt von PostgreSQL …` | Die Datenbank stammt von einer anderen Hauptversion. Umstieg über Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](https://help.ablago.app/admin/aktuell/wachsen/#neue-hauptversion-von-postgresql). |
| `FEHLER: /data/postgres/daten ist nicht leer, enthält aber keine Datenbank.` | Im Ordner `daten` liegt etwas anderes als eine Datenbank, z. B. Reste eines abgebrochenen ersten Starts. Ist noch nichts eingerichtet, leere den Ordner und starte neu. |
| `FEHLER: Die Datenbank ließ sich nicht anlegen (siehe oben).` | `initdb` ist gescheitert. Die Zeilen darüber nennen den Grund, meist ist der Speicher voll oder der Ordner nicht beschreibbar. |
| `FEHLER: PostgreSQL ist beim Start beendet worden (siehe oben).` bzw. `FEHLER: PostgreSQL wurde beendet` | Die Zeilen darüber nennen den Grund. Wurde der Container zuvor hart beendet, räumt PostgreSQL beim nächsten Start meist selbst auf – siehe `stop_grace_period` unten. |

**`stop_grace_period: 60s` nicht weglassen.** Beim Stoppen fährt der Container erst Ablago und dann PostgreSQL sauber herunter. Docker wartet ohne diese Zeile nur 10 Sekunden und beendet den Container danach hart. PostgreSQL muss dann beim nächsten Start erst aufräumen, im schlimmsten Fall startet es nicht. Die Vorlage enthält die Zeile, mit `docker run` heißt sie `--stop-timeout 60`. In der Oberfläche eines NAS ohne diese Einstellung stoppe den Container über die Oberfläche (nicht „Erzwingen“) und warte, bis er aus ist.

## Datenbank aus dem Container retten { #datenbank-retten }

Fehlt die Zeile `/data/postgres`, liegt die Datenbank nur im Container. Ein Neustart schadet nicht. Wird der Container aber neu angelegt – `docker compose down`, ein Update oder „Neu erstellen“ in der Oberfläche des NAS –, ist sie weg. So rettest du sie vorher:

1. **Stoppen, nicht entfernen:** `docker compose stop` (nicht `down`). Der Container bleibt mit seinen Daten erhalten.
2. **Herauskopieren:** `docker cp <container>:/data/postgres ./postgres` – den Namen des Containers zeigt `docker ps -a`, mit der Vorlage meist `dms-dms-1`.
3. **Eintragen:** In der Compose-Datei unter `volumes:` die Zeile `- ./postgres:/data/postgres` ergänzen.
4. **Neu starten:** `docker compose up -d`. Der Container übernimmt den kopierten Ordner und richtet die Rechte selbst. Die rote Meldung in der Werkbank verschwindet.

Sicherer zusätzlich: vorher in **Werkbank → Sicherung** eine Sicherung anlegen und herunterladen.

## Gut zu wissen

- **Kein Passwort:** Die Datenbank ist nur innerhalb des Containers erreichbar. Von außen gibt es keinen Datenbank-Port.
- **Ordner:** Alle vier müssen auf dem Gerät liegen (Volumes), sonst sind sie beim nächsten Update weg. Der Container richtet die Rechte von `postgres` beim Start selbst, siehe [Datenbank auf der SSD](#datenbank-auf-der-ssd).
- **Stoppen:** Beim Stoppen fährt der Container erst Ablago und dann die Datenbank sauber herunter. Gib ihm dafür bis zu einer Minute Zeit (`stop_grace_period: 60s` bzw. `--stop-timeout 60`) – die Zeile darf nicht fehlen, sonst beendet Docker PostgreSQL nach 10 Sekunden hart (siehe [Der Container startet nicht](#container-startet-nicht)). Endet einer der beiden Teile unerwartet, endet der ganze Container, und Docker startet ihn neu.
- **Updates:** `docker compose pull && docker compose up -d` bzw. das Image neu ziehen und den Container neu erstellen. Updates von PostgreSQL kommen mit Ablago-Image; **Werkbank → Systemzustand → Version und Updates** zeigt, ob es eines gibt. Mit einer Versionsnummer statt `main`, also `ghcr.io/motom001/dms-komplett:<Version>` mit einer Nummer aus den [Releases](https://github.com/motom001/dms/releases), bleibt die Installation auf diesem Release. Mit `main` wird PostgreSQL wöchentlich neu gebaut, mit einer festen Version erst mit dem nächsten Release.
- **Neue PostgreSQL-Hauptversion:** Bringt ein künftiges Image eine neue Hauptversion mit (z. B. 18), startet der Container mit der alten Datenbank bewusst nicht und sagt das im Protokoll. Der Umstieg geht dann über Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](https://help.ablago.app/admin/aktuell/wachsen/#neue-hauptversion-von-postgresql).
- **Werkbank → Systemzustand → Version und Updates** zeigt beim Image „dms-komplett (mit PostgreSQL im Container)“ und bei der Datenbank als Ort „im Container (dms-komplett)“.
- **Konsole:** Für Notfall und Betrieb gibt es im Container den Befehl `dms`, z. B. `docker compose exec dms dms hilfe`. Siehe [Konsole](https://help.ablago.app/admin/aktuell/konsole/).
