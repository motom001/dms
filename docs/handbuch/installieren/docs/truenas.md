# TrueNAS

So richtest du das DMS auf **TrueNAS Community Edition 24.10 oder neuer** ein. Diese Versionen führen Apps mit Docker aus.

!!! info "Bald im App-Katalog?"
    Das DMS soll in den App-Katalog von TrueNAS ([#182](https://github.com/motom001/dms/issues/182)). Bis dahin geht es als *Custom App* mit der Vorlage.

## 1. Datensatz und Ordner anlegen

1. **Datasets:** im Pool, in dem deine Apps liegen (in der Vorlage `tank`), einen Datensatz `apps/dms` anlegen, Vorlage *Apps*.
2. In diesem Datensatz vier Ordner anlegen: `postgres`, `files`, `geheim`, `sicherung`. Das geht z. B. über eine SMB-Freigabe oder die Shell unter **System → Shell**:
   ```sh
   mkdir -p /mnt/tank/apps/dms/{postgres,files,geheim,sicherung}
   ```

## 2. App anlegen

1. **Apps → Discover Apps → ⋮ → Install via YAML**.
2. **Name:** `dms`.
3. Den Inhalt der Vorlage [`deploy/truenas/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/truenas/docker-compose.yml) einfügen.
4. **Passwort eintragen:** In der Zeile `x-passwort:` ersetzt du `HIER-EIN-LANGES-PASSWORT-EINTRAGEN` durch ein langes Passwort aus Buchstaben und Zahlen. Heißt dein Pool nicht `tank`, ersetze `/mnt/tank/` in den Pfaden.
5. **Save**.

!!! warning "Passwort vor dem ersten Start ändern"
    Die Datenbank übernimmt das Passwort nur beim allerersten Start.

## 3. Einrichten

1. Im Browser `http://<TrueNAS>:8080` öffnen.
2. Den **Einrichtungscode** zeigt **Apps → `dms` → Workloads → `app` → Logs**. Er steht auch in `/mnt/tank/apps/dms/geheim/EINRICHTUNGSCODE`.
3. Die Datenbank ist schon angebunden. Weiter geht es mit Haushalt, Administrator, erstem Benutzer, Schlüssel und Notfallblatt.

## Updates und Sicherung

- **Updates:** **Apps → `dms` → Update** (bzw. *Pull Images* und neu starten). Die Daten bleiben im Datensatz.
- **Sicherung außer Haus:** Den Ordner `sicherung` per **Cloud Sync Task** oder **Replication** an einen anderen Ort kopieren. Snapshots des Datensatzes sind ein zusätzlicher Schutz, ersetzen aber keine Kopie außer Haus.

!!! info "Bilder folgen"
    Diese Anleitung ist noch ohne Bildschirmfotos. Weicht bei dir ein Menüpunkt ab, schreib es gern in ein [Issue](https://github.com/motom001/dms/issues).
