# QNAP-NAS (Container Station)

So richtest du das DMS auf einem QNAP-NAS mit QTS 5 oder QuTS hero und **Container Station 3** ein, ohne Kommandozeile.

!!! note "Alternative: ein Container"
    Empfohlen ist das Projekt mit zwei Containern unten. Zum schnellen Ausprobieren geht auch **ein Container** aus dem Image `ghcr.io/motom001/dms-komplett:main` – ohne Projekt und Passwort, siehe [Ein Container: dms-komplett](komplett.md#in-der-oberflache-eines-nas) und [Ein oder zwei Container?](index.md#ein-oder-zwei-container).

## 1. Container Station installieren

Im **App Center** die **Container Station** installieren und einmal öffnen. Dabei entsteht der freigegebene Ordner `Container`.

## 2. Ordner anlegen

In der **File Station** im Ordner `Container` einen Ordner `dms` anlegen. Darin vier Ordner: `postgres`, `files`, `geheim` und `sicherung`.


!!! tip "Optional: Eingangsordner für den Scanner"
    Ein fünfter Ordner `eingang` daneben wird zum [Eingangsordner](https://motom001.github.io/dms/admin/aktuell/eingangsordner/): Jede Datei, die dein Scanner oder das NAS dort ablegt, wird neue Post. Gib ihn im NAS für den Scanner frei. Ohne ihn läuft alles wie gewohnt.

## 3. Anwendung erstellen

1. **Container Station → Anwendungen → Erstellen**.
2. **Anwendungsname:** `dms`.
3. Den Inhalt der Vorlage [`deploy/qnap/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/qnap/docker-compose.yml) in das YAML-Feld einfügen.
4. **Ganz oben das Passwort eintragen:** In der Zeile `x-passwort:` ersetzt du `HIER-EIN-LANGES-PASSWORT-EINTRAGEN` durch ein langes Passwort aus Buchstaben und Zahlen.
5. Die Pfade `/share/Container/dms/…` passen zum Ordner aus Schritt 2. Liegt er woanders, passe sie an.
6. **Überprüfen** und **Erstellen**.

!!! warning "Passwort vor dem ersten Start ändern"
    Die Datenbank übernimmt das Passwort nur beim allerersten Start.

## 4. Einrichten

1. Im Browser `http://<NAS>:8080` öffnen.
2. Den **Einrichtungscode** zeigt **Container Station → Container → `dms-app-1` → Protokolle**. Er steht auch in der Datei `Container/dms/geheim/EINRICHTUNGSCODE`.
3. Die Datenbank ist schon angebunden. Weiter geht es mit Haushalt, Administrator, erstem Benutzer, Schlüssel und Notfallblatt.

## Updates

**Container Station → Anwendungen → `dms`** → **Aktion → Neu erstellen**, dabei die Images neu ziehen. Die Daten bleiben in den Ordnern.

## Sicherung außer Haus

Die Sicherungen des DMS (**Werkbank → Sicherung**) landen in `Container/dms/sicherung`. Mit **Hybrid Backup Sync** kopierst du den Ordner auf eine USB-Platte, ein zweites NAS oder in einen Cloudspeicher.

!!! info "Bilder folgen"
    Diese Anleitung ist noch ohne Bildschirmfotos. Weicht bei dir ein Menüpunkt ab, schreib es gern in ein [Issue](https://github.com/motom001/dms/issues).
