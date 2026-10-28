# Installation auf dem NAS

Das DMS läuft als zwei Container: die Anwendung (`ghcr.io/motom001/dms`) und PostgreSQL. Bei jedem Push auf `main` baut GitHub Actions ein neues Image (Tag `main`, zusätzlich je Commit ein Kurz-Hash und je Release die Versionsnummer).

## Voraussetzungen

- Ein NAS oder Server mit Docker und Docker Compose (z. B. UGREEN, Synology, Linux-Server), Architektur amd64 oder arm64.
- Ein Ordner für die Daten, z. B. `/volume1/docker/dms`.
- Optional ein Postfach für den E-Mail-Versand (Einladungen, Passwort-Links).

## Schritt für Schritt

1. **Token anlegen.** Auf GitHub unter *Settings → Developer settings → Personal access tokens → Tokens (classic)* ein Token nur mit dem Recht `read:packages` erzeugen.
2. **NAS bei der Registry anmelden** (einmalig):
   ```sh
   docker login ghcr.io -u motom001
   ```
   Als Passwort das Token eingeben.
3. **Projekt anlegen.** Die Vorlage [`deploy/nas/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/nas/docker-compose.yml) als Compose-Projekt anlegen und die Pfade an den Docker-Ordner des NAS anpassen. Daneben eine Datei `.env`:
   ```sh
   DB_PASSWORD=<langes zufälliges Passwort>
   ```
4. **Starten.** Die Oberfläche läuft unter `http://<NAS>:8080`. Beim ersten Start legt der Server die Tabellen selbst an.
5. **Erster Aufruf.** Wer die Seite als Erstes öffnet, legt das Administrator-Konto an – ohne Einrichtungscode. Rufe sie deshalb direkt nach dem ersten Start selbst auf.

!!! warning "Erst einrichten, dann freigeben"
    Mach das DMS erst über einen Reverse-Proxy oder Port-Freigabe erreichbar, wenn der Administrator angelegt ist.

Danach: unter **Werkbank → Demo-Daten** die Beispiel-Mappentypen laden oder eigene [Mappentypen](mappentypen.md) anlegen und [Benutzer einladen](benutzer.md).

## Einstellungen

Alle Einstellungen sind Umgebungsvariablen im Compose-Projekt:

| Variable | Bedeutung |
| --- | --- |
| `DATABASE_URL` | Verbindung zu PostgreSQL (Pflicht) |
| `APP_URL` | Adresse, unter der Benutzer das DMS öffnen; steht in den Links der E-Mails |
| `FILES_DIR` | Ordner für hochgeladene Dateien im Container (Vorlage: `/data/files`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | E-Mail-Versand (optional). Ohne `SMTP_HOST` zeigt die Benutzerverwaltung Einladungs- und Passwort-Links zum Kopieren an; „Passwort vergessen“ setzt dann der Administrator zurück. |
| `TRUST_PROXY` | `true`, wenn ein Reverse-Proxy davor sitzt (richtige IP-Adressen im Protokoll, sichere Cookies über HTTPS) |
| `LOG_LEVEL` | Grundstufe des Protokolls: `debug`, `info` (Standard), `warn`, `error` |

## Hinter einem Reverse-Proxy

Läuft das DMS hinter nginx (oder einem anderen Proxy), setze `TRUST_PROXY: "true"` und `APP_URL` auf die öffentliche Adresse, z. B. `https://dms.example.org`. Beginnt `APP_URL` mit `https://`, setzt das DMS das Sitzungs-Cookie nur noch über HTTPS.

Ein Beispiel für nginx:

```nginx
server {
    listen 443 ssl;
    server_name dms.example.org;
    # ssl_certificate …; ssl_certificate_key …;

    client_max_body_size 110m;          # Dokumente bis 100 MB

    location / {
        proxy_pass http://<NAS>:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Lange Arbeiten wie das Erzeugen tausender Demo-Mappen laufen im Hintergrund, damit der Proxy nicht wegen einer Zeitüberschreitung abbricht. Die Live-Ansicht des Protokolls fragt alle zwei Sekunden nach und braucht keine besondere Proxy-Einstellung.
