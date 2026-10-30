# Synology-NAS (Container Manager)

So richtest du das DMS auf einem Synology-NAS mit DSM 7.2 oder neuer ein, ganz ohne Kommandozeile. Du brauchst ein Modell mit **Container Manager**, also die meisten Plus-Modelle mit Intel- oder AMD-Prozessor. Ob dein Modell dazu gehört, zeigt das Paket-Zentrum: Gibt es dort den Container Manager, passt es.

!!! note "Alternative: ein Container"
    Empfohlen ist das Projekt mit zwei Containern unten. Zum schnellen Ausprobieren geht auch **ein Container** aus dem Image `ghcr.io/motom001/dms-komplett:main` – ohne Projekt und Passwort, siehe [Ein Container: dms-komplett](komplett.md#in-der-oberflache-eines-nas) und [Ein oder zwei Container?](index.md#ein-oder-zwei-container).

## 1. Container Manager installieren

**Paket-Zentrum** öffnen, nach *Container Manager* suchen und **Installieren**. Dabei entsteht der freigegebene Ordner `docker`.

## 2. Ordner anlegen

In der **File Station** im Ordner `docker` einen Ordner `dms` anlegen. Darin vier Ordner:

```
docker/dms/postgres
docker/dms/files
docker/dms/geheim
docker/dms/sicherung
```

!!! tip "Sicherungen auf eine andere Platte"
    Hat dein NAS mehrere Speicherpools, lege `sicherung` besser auf einen anderen. Dann ändere in der Vorlage später nur diese eine Zeile, z. B. auf `/volume2/sicherung/dms`.

## 3. Projekt anlegen

1. **Container Manager → Projekt → Erstellen**.
2. **Projektname:** `dms`. **Pfad:** den Ordner `docker/dms` wählen.
3. **Quelle:** *docker-compose.yml erstellen*.
4. Den Inhalt der Vorlage [`deploy/synology/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/synology/docker-compose.yml) einfügen. Auf GitHub kopierst du ihn mit dem Knopf *Copy raw file* oben rechts.
5. **Ganz oben das Passwort eintragen:** In der Zeile `x-passwort:` ersetzt du `HIER-EIN-LANGES-PASSWORT-EINTRAGEN` durch ein langes Passwort aus Buchstaben und Zahlen. Merken musst du es dir nicht, es bleibt in dieser Datei.
6. Steht dein Docker-Ordner nicht auf `volume1`, passe die Pfade `/volume1/docker/dms/…` an.
7. **Weiter** und **Fertig**. Den Hinweis auf *Web Station* kannst du überspringen. Das NAS lädt die Images und startet beide Container.

!!! warning "Passwort vor dem ersten Start ändern"
    Die Datenbank übernimmt das Passwort nur beim allerersten Start. Änderst du es später in der Vorlage, passt es nicht mehr zur Datenbank.

## 4. Einrichten

1. Im Browser `http://<NAS>:8080` öffnen, z. B. `http://192.168.1.20:8080`.
2. Der Assistent fragt nach dem **Einrichtungscode**. Er steht im **Container Manager → Container → `dms-app-1` → Protokoll** (eine auffällige Zeile *Einrichtungscode für das DMS*). Er steht auch in der Datei `docker/dms/geheim/EINRICHTUNGSCODE`, die du in der File Station öffnen kannst.
3. Die Datenbank fragt der Assistent nicht ab, sie ist schon angebunden. Es geht weiter mit Haushalt, Administrator, erstem Benutzer, Schlüssel und Notfallblatt.

## Updates

**Container Manager → Projekt → `dms` → Aktion → Erstellen** (bzw. *Build*). Das lädt das neueste Image und startet das DMS neu. Die Daten bleiben in den Ordnern. Was sich geändert hat, steht unter **Werkbank → Technik**. Vorher kannst du den Wartungsmodus einschalten, siehe [Aktualisieren](https://motom001.github.io/dms/admin/aktuell/aktualisieren/).

## Sicherung außer Haus

Das DMS sichert sich selbst in den Ordner `sicherung` (**Werkbank → Sicherung**). Mit **Hyper Backup** kopierst du diesen Ordner zusätzlich auf eine USB-Platte, ein zweites NAS oder einen Cloudspeicher. Die Sicherungen sind verschlüsselt, ein Cloudspeicher sieht also nur unlesbare Dateien.

## Von unterwegs erreichbar

Erst **nach** der Einrichtung: In DSM unter **Systemsteuerung → Anmeldeportal → Erweitert → Reverse Proxy** einen Eintrag von `https://dms.<deine-domain>` auf `http://localhost:8080` anlegen. Ein Zertifikat gibt es unter **Sicherheit → Zertifikat**. Im DMS dann unter **Werkbank → E-Mail und Adresse** die öffentliche Adresse eintragen und in der Vorlage `TRUST_PROXY: "true"` ergänzen. Hintergrund: [Hinter einem Reverse-Proxy](https://motom001.github.io/dms/admin/aktuell/installation/#hinter-einem-reverse-proxy).

!!! info "Bilder folgen"
    Diese Anleitung ist noch ohne Bildschirmfotos. Die Menüpunkte entsprechen DSM 7.2. Weicht bei dir etwas ab, schreib es gern in ein [Issue](https://github.com/motom001/dms/issues).
