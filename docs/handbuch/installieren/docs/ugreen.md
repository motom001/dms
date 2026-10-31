# UGREEN-NAS (UGOS Pro)

So richtest du das DMS auf einem UGREEN-NAS mit UGOS Pro ein. Die App **Docker** von UGREEN legt das DMS als *Projekt* aus einer Vorlage an.

!!! info "Bald im App Center?"
    Eine App für das UGREEN App Center ist in Arbeit ([#181](https://github.com/motom001/dms/issues/181)). Bis dahin geht es so, und das ist kaum aufwendiger.

Wie das DMS beim Entwickler auf einem UGREEN-NAS läuft – mit Zugriff von unterwegs und Sicherung außer Haus –, zeigt das Beispiel [So läuft es beim Entwickler](beispiel.md).

!!! note "Alternative: ein Container"
    Empfohlen ist das Projekt mit zwei Containern unten. Zum schnellen Ausprobieren geht auch **ein Container** aus dem Image `ghcr.io/motom001/dms-komplett:main` – ohne Projekt und Passwort, siehe [Ein Container: dms-komplett](komplett.md#in-der-oberflache-eines-nas) und [Ein oder zwei Container?](index.md#ein-oder-zwei-container).

## 1. Docker installieren

Im **App Center** die App **Docker** installieren und öffnen.

## 2. Ordner anlegen

In der App **Dateien** im Ordner `docker` (legt die Docker-App an) einen Ordner `dms` anlegen. Darin vier Ordner: `postgres`, `files`, `geheim` und `sicherung`.

!!! tip "Eingangsordner für den Scanner"
    Leg auch einen fünften Ordner `eingang` daneben an. Die Vorlage bindet ihn ein, und manche NAS brechen beim Start ab, wenn ein eingebundener Ordner fehlt. Er wird zum [Eingangsordner](https://motom001.github.io/dms/admin/aktuell/eingangsordner/): Jede Datei, die dein Scanner oder das NAS dort ablegt, wird neue Post. Gib ihn im NAS für den Scanner frei. Brauchst du keinen Scanner, bleibt er einfach leer.

## 3. Projekt anlegen

1. **Docker → Projekt → Erstellen**.
2. **Projektname:** `dms`. **Speicherpfad:** den Ordner `docker/dms`.
3. Den Inhalt der Vorlage [`deploy/ugreen/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/ugreen/docker-compose.yml) in das Feld für die Compose-Konfiguration einfügen.
4. **Ganz oben das Passwort eintragen:** In der Zeile `x-passwort:` ersetzt du `HIER-EIN-LANGES-PASSWORT-EINTRAGEN` durch ein langes Passwort aus Buchstaben und Zahlen.
5. Liegt dein Docker-Ordner nicht unter `/volume1/docker`, passe die Pfade an. Den Pfad zeigt die App **Dateien** in den Eigenschaften des Ordners.
6. **Bereitstellen** bzw. **Sofort bereitstellen**.

!!! warning "Passwort vor dem ersten Start ändern"
    Die Datenbank übernimmt das Passwort nur beim allerersten Start.

## 4. Einrichten

1. Im Browser `http://<NAS>:8080` öffnen.
2. Den **Einrichtungscode** zeigt **Docker → Container → `dms-app-1` → Protokoll**, oder du öffnest die Datei `docker/dms/geheim/EINRICHTUNGSCODE` in der App **Dateien**.
3. Die Datenbank fragt der Assistent nicht ab, sie ist schon angebunden.

--8<-- "assistent-weiter.md"

## Updates

**Docker → Projekt → `dms`** öffnen, das Projekt stoppen und mit der Option zum Neu-Ziehen der Images wieder **bereitstellen**. Je nach UGOS-Version heißt der Punkt *Aktualisieren* oder *Neu erstellen*. Die Daten bleiben in den Ordnern.

## Sicherung außer Haus

Die Sicherungen des DMS (**Werkbank → Sicherung**) landen in `docker/dms/sicherung`. Mit der UGREEN-App **Sicherung & Synchronisierung** kopierst du diesen Ordner auf eine USB-Platte oder in einen Cloudspeicher.

!!! info "Bilder folgen"
    Diese Anleitung ist noch ohne Bildschirmfotos. Weicht bei dir ein Menüpunkt ab, schreib es gern in ein [Issue](https://github.com/motom001/dms/issues).
