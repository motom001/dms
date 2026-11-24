# TrueNAS

!!! info "Geprüft: Vorlage automatisch, Gerät noch nicht"
    Die Vorlage für die *Custom App* startet bei jeder Änderung probehalber auf den Rechnern von GitHub (Linux mit Docker, amd64). Die App im Katalog pflegt TrueNAS; sie nutzt dieselben Images. Von einem echten Gerät gibt es noch keine Meldung. Was das heißt, steht unter [Geprüfte Plattformen](plattformen.md).

So richtest du Ablago auf **TrueNAS Community Edition 24.10 oder neuer** ein. Diese Versionen führen Apps mit Docker aus. Es gibt zwei Wege:

- **[Aus dem App-Katalog](#aus-dem-app-katalog)** (empfohlen): Ablago steht im Community-Katalog von TrueNAS. Installieren und Updates gehen über die Oberfläche von TrueNAS.
- **[Als Custom App mit der Vorlage](#als-custom-app)**: wenn du Einstellungen selbst festlegen willst, z. B. [dms-komplett](komplett.md) oder eigene Pfade.

Die beiden Wege unterscheiden sich in einigen Punkten:

| | App-Katalog | Custom App (Vorlage) |
| --- | --- | --- |
| Adresse | `http://<TrueNAS>:30607` (Port änderbar) | `http://<TrueNAS>:8080` |
| Ordner bzw. Datensätze | `files`, `keys`, `backups`, `postgres_data` | `files`, `geheim`, `sicherung`, `postgres` |
| Datenbank | PostgreSQL 18 | PostgreSQL 18 (bis Ablago 0.305: 17) |
| Einrichtungscode | keiner – die Einrichtung geht nur aus dem Heimnetz | ja, im Protokoll und in `geheim/EINRICHTUNGSCODE` |
| Benutzer der Dateien | 568:568 (*apps*) | der Besitzer der Ordner |
| Updates | **Apps → Ablago → Update** | *Pull Images* und neu starten |

Wo das Handbuch sonst `geheim` und `sicherung` nennt, heißen die Ordner bei der Katalog-App `keys` und `backups`.

## Aus dem App-Katalog { #aus-dem-app-katalog }

1. **Apps → Discover Apps**, nach **Ablago** suchen und **Install** wählen. Die App steht im Zug *Community*; ihre Seite im Katalog: [apps.truenas.com/catalog/ablago_community](https://apps.truenas.com/catalog/ablago_community/).
2. **Datenbank-Passwort:** ein langes Passwort aus Buchstaben und Zahlen eintragen. Die Datenbank übernimmt es nur beim allerersten Start.
3. **Port:** Vorgabe ist `30607`. Ändere ihn nur, wenn er bei dir schon belegt ist.
4. **Speicher:** Für `files`, `keys`, `backups` und `postgres_data` wählst du je ein *ixVolume* (TrueNAS legt den Datensatz selbst an) oder einen eigenen Pfad (*Host Path*) in einem Datensatz, den du vorher angelegt hast. Mit eigenen Pfaden findest du die Ordner später leichter, etwa für die Sicherung außer Haus.
    - `files`: deine Dokumente,
    - `keys`: der Schlüssel – getrennt von den Sicherungen aufbewahren,
    - `backups`: die Sicherungen von Ablago,
    - `postgres_data`: die Datenbank.
5. **Benutzer:** Die App legt die Dateien als Benutzer und Gruppe **568** (*apps*) ab. Nimmst du eigene Pfade, müssen die Datensätze diesem Benutzer gehören (beim Anlegen die Vorlage *Apps* wählen). Ablago startet als root, übernimmt die Ordner und läuft dann ohne Administratorrechte weiter.
6. **Install.** Nach ein bis zwei Minuten steht die App unter **Apps → Installed** auf *Running*.

!!! warning "Einrichtung sofort abschließen"
    Die App aus dem Katalog hat **keinen Einrichtungscode**. Bis das erste Administratorkonto angelegt ist, könnte deshalb jedes Gerät in deinem Heimnetz die Einrichtung übernehmen (aus dem Internet geht das nicht). Öffne gleich nach der Installation `http://<TrueNAS>:30607` und schließe die Einrichtung ab, bevor du die App länger unbeaufsichtigt laufen lässt.

Dann im Browser `http://<TrueNAS>:30607` öffnen. Die Datenbank fragt der Assistent nicht ab, sie ist schon angebunden; einen Einrichtungscode gibt es nicht.

--8<-- "assistent-weiter.md"

### Updates (App-Katalog) { #katalog-updates-und-sicherung }

- **Updates:** **Apps → Ablago → Update**, sobald TrueNAS die neue Version im Katalog hat. Das ist meist einige Tage nach dem stabilen Release von Ablago so weit, weil TrueNAS die Versionen im Katalog selbst nachzieht. Die Daten bleiben in den Datensätzen.
- **Sicherung außer Haus:** Den Datensatz bzw. Ordner `backups` per **Cloud Sync Task** oder **Replication** an einen anderen Ort kopieren. Den Inhalt von `keys` hebst du getrennt davon auf (z. B. mit dem [Notfallblatt](https://help.ablago.app/admin/aktuell/notfall/)). Mehr dazu unter [Sicherung außer Haus](#sicherung-ausser-haus).

## Als Custom App mit der Vorlage { #als-custom-app }

### 1. Datensatz und Ordner anlegen

1. **Datasets:** im Pool, in dem deine Apps liegen (in der Vorlage `tank`), einen Datensatz `apps/dms` anlegen, Vorlage *Apps*.
2. In diesem Datensatz vier Ordner anlegen: `postgres`, `files`, `geheim`, `sicherung`. Das geht z. B. über eine SMB-Freigabe oder die Shell unter **System → Shell**:
   ```sh
   mkdir -p /mnt/tank/apps/dms/{postgres,files,geheim,sicherung}
   ```

!!! tip "Eingangsordner für den Scanner"
    Leg auch einen fünften Ordner `eingang` daneben an. Die Vorlage bindet ihn ein, und manche NAS brechen beim Start ab, wenn ein eingebundener Ordner fehlt. Er wird zum [Eingangsordner](https://help.ablago.app/admin/aktuell/eingangsordner/): Jede Datei, die dein Scanner oder das NAS dort ablegt, wird neue Post. Gib ihn im NAS für den Scanner frei. Brauchst du keinen Scanner, bleibt er einfach leer.

### 2. App anlegen

1. **Apps → Discover Apps → ⋮ → Install via YAML**.
2. **Name:** `dms`.
3. Den Inhalt der Vorlage [`deploy/truenas/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/truenas/docker-compose.yml) einfügen.
4. **Passwort eintragen:** In der Zeile `x-passwort:` ersetzt du `HIER-EIN-LANGES-PASSWORT-EINTRAGEN` durch ein langes Passwort aus Buchstaben und Zahlen. Heißt dein Pool nicht `tank`, ersetze `/mnt/tank/` in den Pfaden.
5. **Save**.

!!! warning "Passwort vor dem ersten Start ändern"
    Die Datenbank übernimmt das Passwort nur beim allerersten Start.

### 3. Einrichten

1. Im Browser `http://<TrueNAS>:8080` öffnen.
2. Den **Einrichtungscode** zeigt **Apps → `dms` → Workloads → `app` → Logs**. Er steht auch in `/mnt/tank/apps/dms/geheim/EINRICHTUNGSCODE`.
3. Die Datenbank fragt der Assistent nicht ab, sie ist schon angebunden.

--8<-- "assistent-weiter.md"

### Updates (Custom App) { #updates-und-sicherung }

- **Updates:** **Apps → `dms` → Update** (bzw. *Pull Images* und neu starten). Die Daten bleiben im Datensatz.
- **Sicherung außer Haus:** Den Ordner `sicherung` an einen anderen Ort kopieren, wie unten beschrieben.

!!! note "Von PostgreSQL 17 auf 18"
    Bis Ablago 0.305 hatte die Vorlage `postgres:17`. Eine bestehende Installation läuft damit weiter. Der Umzug auf 18 geht über eine Sicherung: [Aktualisieren → PostgreSQL 18](https://help.ablago.app/admin/aktuell/aktualisieren/#postgresql-18).

## Sicherung außer Haus { #sicherung-ausser-haus }

Den Ordner mit den Sicherungen (`backups` bei der Katalog-App, `sicherung` bei der Custom App) per **Cloud Sync Task** oder **Replication** an einen anderen Ort kopieren. Die Sicherungen sind verschlüsselt, ein Cloudspeicher sieht also nur unlesbare Dateien. Exporte sind nicht darin: Ein [Vollexport](https://help.ablago.app/admin/aktuell/export/) ist unverschlüsselt und liegt deshalb im eigenen [Export-Ordner](https://help.ablago.app/admin/aktuell/export/#export-ordner), nie bei den Sicherungen. Snapshots des Datensatzes sind ein zusätzlicher Schutz, ersetzen aber keine Kopie außer Haus.

!!! info "Bilder folgen"
    Diese Anleitung ist noch ohne Bildschirmfotos. Weicht bei dir ein Menüpunkt ab, schreib es gern in ein [Issue](https://github.com/motom001/dms/issues).
