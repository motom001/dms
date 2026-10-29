# Aktualisieren und Sichern

## Aktualisieren

1. Lies unter [Releases](https://github.com/motom001/dms/releases), was sich geändert hat.
2. Schalte den [Wartungsmodus](wartungsmodus.md) ein, damit niemand mitten im Update arbeitet.
3. Image neu ziehen und das Projekt neu starten – auf der Kommandozeile:
   ```sh
   docker compose pull && docker compose up -d
   ```
   oder in der Container-Verwaltung des NAS „Projekt neu erstellen“.
4. Datenbank-Migrationen laufen beim Start automatisch und in einer Transaktion: Schlägt eine fehl, bleibt die Datenbank unverändert, und der Container startet nicht. Im Container-Log steht dann der Grund.
5. Kurz prüfen, ob alles läuft, dann den Wartungsmodus beenden.

Welche Version läuft und ob es neuere gibt, zeigt **Werkbank → Technik** (siehe [Fehlersuche](fehlersuche.md#technik)).

!!! tip "Auf einer festen Version bleiben"
    Statt `ghcr.io/motom001/dms:main` kannst du in der Compose-Datei eine Versionsnummer angeben, z. B. `ghcr.io/motom001/dms:0.8.0`. Dann ändert sich nichts, bis du die Nummer selbst erhöhst.

### Datenbank-Anbindung und Mandant (ab 0.24)

Beim ersten Start übernimmt das DMS `DATABASE_URL` und – falls gesetzt – `HAUSHALT_ID` in die Datei `/data/geheim/datenbank.json` (siehe [Datenbank-Anbindung](installation.md#datenbank-anbindung)). Es läuft ohne Zutun weiter. Danach sind beide Variablen überflüssig; die Werkbank-Übersicht weist darauf hin, und du kannst sie beim nächsten Update aus der Compose-Datei entfernen. Ändern lässt sich die Anbindung dann unter **Werkbank → Datenbank-Anbindung**.

### Feste Ordner (ab 0.23)

Die Ordner im Container sind jetzt fest: `/data/files`, `/data/geheim` und `/data/sicherung` (siehe [Ordner und Volumes](installation.md#ordner-und-volumes)). Die Variablen `FILES_DIR`, `DMS_SCHLUESSEL_DATEI` und `DMS_SICHERUNG_DIR` entfallen.

- **Steht `FILES_DIR: /data/files` in deiner Compose-Datei** (so war es in der Vorlage), läuft alles weiter. Entferne die Zeile beim nächsten Update; bis dahin erinnert die Werkbank-Übersicht daran.
- **Zeigte eine der Variablen auf einen anderen Ordner**, startet das DMS nicht und nennt im Protokoll des Containers das Volume, das stattdessen auf den festen Ordner zeigen muss. Beispiel: Stand bisher `FILES_DIR: /dokumente` mit dem Volume `/volume1/dms-daten:/dokumente`, wird daraus `/volume1/dms-daten:/data/files` – und die Variable fällt weg. Die Dateien selbst bleiben, wo sie sind.
- Prüfe nach dem Start unter **Werkbank → Technik**, dass alle drei Ordner auf einem eigenen Volume liegen.

### Auf 0.11 aktualisieren

- In der Compose-Datei ein Volume für den Schlüssel ergänzen (siehe [Vorlage](https://github.com/motom001/dms/blob/main/deploy/nas/docker-compose.yml)):
  ```yaml
  volumes:
    - /volume1/docker/dms/files:/data/files
    - /volume1/docker/dms/geheim:/data/geheim
  ```
  Danach unter **Werkbank → Verschlüsselung** den Schlüssel erzeugen. Ein schon gespeichertes SMTP-Passwort wird dabei verschlüsselt; bis dahin funktioniert der Versand wie bisher.
- Das Image enthält jetzt die Texterkennung und ist dadurch etwa 50 MB größer.
- Vorhandene Dokumente bekommen ihren Volltext erst, wenn du unter **Werkbank → [Wartungsoperationen](texterkennung.md#wartungsoperationen)** „Volltext nachholen“ anstößt.

### PostgreSQL

Kleinere Versionen (17.x) bekommst du durch Neuziehen des Images `postgres:17`. Ein Wechsel der Hauptversion (z. B. 17 → 18) braucht eine Sicherung und Wiederherstellung – PostgreSQL kann die Daten einer älteren Hauptversion nicht direkt öffnen.

## Wie neue Versionen entstehen

Jede Version des DMS hat eine Nummer wie `0.8.1`. Sobald auf `main` eine neue Nummer steht und alle Prüfungen bestanden sind, entsteht automatisch:

- ein **Release** auf GitHub mit dem Changelog – [Releases](https://github.com/motom001/dms/releases),
- ein **Image** mit dieser Nummer, z. B. `ghcr.io/motom001/dms:0.8.1`.

Änderungen ohne neue Nummer (kleine Korrekturen, Doku) landen nur im Image `main`. Mehrere Wünsche lassen sich so zu einem Release bündeln: Die Nummer wird erst mit dem letzten erhöht.

## Sichern

Am einfachsten sichert das DMS sich selbst: **Werkbank → [Sicherung](sicherung.md)** – Datenbank und Dateien zum selben Zeitpunkt, verschlüsselt, auf Wunsch nach Zeitplan. Der Rest dieses Abschnitts beschreibt den Weg von Hand, z. B. für eine zusätzliche Kopie.

Von Hand zu sichern sind diese Ordner aus der Compose-Vorlage:

| Ordner | Inhalt |
| --- | --- |
| `postgres` | die Datenbank: Mappentypen, Mappen, Benutzer, Einstellungen |
| `files` | die hochgeladenen Dateien, je Datei unter ihrem SHA-256-Prüfwert |
| `geheim` | der Schlüssel für gespeicherte Passwörter (SMTP, Passwortfelder) und Sicherungen – **getrennt** von den anderen aufbewahren |
| `sicherung` | die Sicherungen des DMS (verschlüsselt) |

Für eine konsistente Datenbanksicherung im laufenden Betrieb vorher einen Abzug erstellen:

```sh
docker exec <db-container> pg_dump -U dms dms > dms.sql
```

und `dms.sql` zusammen mit dem Ordner `files` sichern.

### Wiederherstellen

Sicherungen des DMS spielst du in der Werkbank ein: [Wiederherstellen](wiederherstellen.md). Für einen Abzug von Hand:

1. Projekt stoppen, Ordner `files` zurückkopieren.
2. Datenbank leeren und einspielen:
   ```sh
   docker compose up -d db
   docker exec -i <db-container> psql -U dms -d dms < dms.sql
   ```
3. Projekt starten.

!!! warning "Dateien und Datenbank gehören zusammen"
    Die Datenbank kennt jede Datei über ihren Prüfwert. Sichere und stelle beide immer vom selben Zeitpunkt wieder her.

!!! warning "Ohne Schlüssel keine Passwörter"
    Gespeicherte Passwörter lassen sich nur mit der Schlüsseldatei aus `geheim` lesen. Fehlt sie nach einer Wiederherstellung, zeigt **Werkbank → [Verschlüsselung](verschluesselung.md)**, welche Passwörter neu einzugeben sind. Bewahre die Schlüsseldatei getrennt von der Datenbanksicherung auf – liegen beide zusammen, schützt die Verschlüsselung die Sicherung nicht.
