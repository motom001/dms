# Unraid

So richtest du das DMS auf **Unraid 6.12 oder neuer** ein. Weil das DMS zwei Container braucht (DMS und Datenbank), geht es am einfachsten mit dem Plugin **Docker Compose Manager**.

!!! info "Bald in Community Applications?"
    Das DMS soll in *Community Applications* ([#183](https://github.com/motom001/dms/issues/183)). Bis dahin geht es so.

!!! note "Alternative: ein Container"
    Empfohlen ist das Projekt mit zwei Containern unten. Zum schnellen Ausprobieren geht auch **ein Container** aus dem Image `ghcr.io/motom001/dms-komplett:main` – ohne Projekt und Passwort, siehe [Ein Container: dms-komplett](komplett.md#in-der-oberflache-eines-nas) und [Ein oder zwei Container?](index.md#ein-oder-zwei-container).

## 1. Compose Manager installieren

Unter **Apps** (Community Applications) nach *Docker Compose Manager* suchen und installieren.

## 2. Stack anlegen

1. **Docker → Compose → Add New Stack**, Name `dms`.
2. Beim Stack auf **Edit Stack → Compose File** und den Inhalt der Vorlage [`deploy/unraid/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/unraid/docker-compose.yml) einfügen.
3. **Passwort eintragen:** In der Zeile `x-passwort:` ersetzt du `HIER-EIN-LANGES-PASSWORT-EINTRAGEN` durch ein langes Passwort aus Buchstaben und Zahlen.
4. **Save Changes**, dann **Compose Up**. Die Ordner unter `/mnt/user/appdata/dms/` legt Unraid dabei selbst an.

!!! warning "Passwort vor dem ersten Start ändern"
    Die Datenbank übernimmt das Passwort nur beim allerersten Start.

!!! tip "Optional: Eingangsordner für den Scanner"
    Die Vorlage bindet `/mnt/user/appdata/dms/eingang` als [Eingangsordner](https://motom001.github.io/dms/admin/aktuell/eingangsordner/) ein: Jede Datei, die dein Scanner dort ablegt, wird neue Post. Gib den Ordner als SMB-Freigabe für den Scanner frei. Ohne ihn läuft alles wie gewohnt.

## 3. Einrichten

1. Im Browser `http://<Unraid>:8080` öffnen.
2. Den **Einrichtungscode** zeigt das Protokoll des Containers `dms-app-1` (**Docker** → Symbol des Containers → **Logs**). Er steht auch in `appdata/dms/geheim/EINRICHTUNGSCODE`.
3. Die Datenbank fragt der Assistent nicht ab, sie ist schon angebunden.

--8<-- "assistent-weiter.md"

## Updates und Sicherung

- **Updates:** beim Stack **Update Stack** (bzw. *Compose Pull* und *Compose Up*).
- **Sicherung außer Haus:** Die Sicherungen des DMS landen in `appdata/dms/sicherung`. Das Plugin *Appdata Backup* sichert `appdata` zusätzlich, aber erst eine Kopie an einem anderen Ort schützt vor dem Ausfall des Servers.

!!! info "Bilder folgen"
    Diese Anleitung ist noch ohne Bildschirmfotos. Weicht bei dir ein Menüpunkt ab, schreib es gern in ein [Issue](https://github.com/motom001/dms/issues).
