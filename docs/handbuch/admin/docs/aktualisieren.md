# Aktualisieren und Sichern

## Aktualisieren

1. Lies unter [Releases](https://github.com/motom001/dms/releases), was sich geändert hat.
2. Image neu ziehen und das Projekt neu starten – auf der Kommandozeile:
   ```sh
   docker compose pull && docker compose up -d
   ```
   oder in der Container-Verwaltung des NAS „Projekt neu erstellen“.
3. Datenbank-Migrationen laufen beim Start automatisch und in einer Transaktion: Schlägt eine fehl, bleibt die Datenbank unverändert, und der Container startet nicht. Im Container-Log steht dann der Grund.

Welche Version läuft und ob es neuere gibt, zeigt **Werkbank → Technik** (siehe [Fehlersuche](fehlersuche.md#technik)).

!!! tip "Auf einer festen Version bleiben"
    Statt `ghcr.io/motom001/dms:main` kannst du in der Compose-Datei eine Versionsnummer angeben, z. B. `ghcr.io/motom001/dms:0.8.0`. Dann ändert sich nichts, bis du die Nummer selbst erhöhst.

### PostgreSQL

Kleinere Versionen (17.x) bekommst du durch Neuziehen des Images `postgres:17`. Ein Wechsel der Hauptversion (z. B. 17 → 18) braucht eine Sicherung und Wiederherstellung – PostgreSQL kann die Daten einer älteren Hauptversion nicht direkt öffnen.

## Wie neue Versionen entstehen

Jede Version des DMS hat eine Nummer wie `0.8.1`. Sobald auf `main` eine neue Nummer steht und alle Prüfungen bestanden sind, entsteht automatisch:

- ein **Release** auf GitHub mit dem Changelog – [Releases](https://github.com/motom001/dms/releases),
- ein **Image** mit dieser Nummer, z. B. `ghcr.io/motom001/dms:0.8.1`.

Änderungen ohne neue Nummer (kleine Korrekturen, Doku) landen nur im Image `main`. Mehrere Wünsche lassen sich so zu einem Release bündeln: Die Nummer wird erst mit dem letzten erhöht.

## Sichern

Zu sichern sind zwei Ordner aus der Compose-Vorlage:

| Ordner | Inhalt |
| --- | --- |
| `postgres` | die Datenbank: Mappentypen, Mappen, Benutzer, Einstellungen |
| `files` | die hochgeladenen Dateien, je Datei unter ihrem SHA-256-Prüfwert |

Für eine konsistente Datenbanksicherung im laufenden Betrieb vorher einen Abzug erstellen:

```sh
docker exec <db-container> pg_dump -U dms dms > dms.sql
```

und `dms.sql` zusammen mit dem Ordner `files` sichern.

### Wiederherstellen

1. Projekt stoppen, Ordner `files` zurückkopieren.
2. Datenbank leeren und einspielen:
   ```sh
   docker compose up -d db
   docker exec -i <db-container> psql -U dms -d dms < dms.sql
   ```
3. Projekt starten.

!!! warning "Dateien und Datenbank gehören zusammen"
    Die Datenbank kennt jede Datei über ihren Prüfwert. Sichere und stelle beide immer vom selben Zeitpunkt wieder her.
