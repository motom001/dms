# Installation auf dem NAS

Das DMS läuft als zwei Container: die Anwendung (`ghcr.io/motom001/dms`) und PostgreSQL. Bei jedem Push auf `main` baut GitHub Actions ein neues Image (Tag `main`, zusätzlich je Commit ein Kurz-Hash und je Release die Versionsnummer).

## Voraussetzungen

- Ein NAS oder Server mit Docker und Docker Compose (z. B. UGREEN, Synology, Linux-Server), Architektur amd64 oder arm64.
- Ein Ordner für die Daten, z. B. `/volume1/docker/dms`, darin `postgres`, `files`, `geheim` (für den Schlüssel der gespeicherten Passwörter) und `sicherung` (für die [Sicherungen](sicherung.md), am besten auf einer anderen Platte).
- Optional ein Postfach für den E-Mail-Versand (Einladungen, Passwort-Links) – eingerichtet wird es später in der Werkbank.

## Schritt für Schritt

Das Image ist öffentlich; eine Anmeldung bei der Registry (`docker login`) ist nicht nötig.

1. **Projekt anlegen.** Die Vorlage [`deploy/nas/docker-compose.yml`](https://github.com/motom001/dms/blob/main/deploy/nas/docker-compose.yml) als Compose-Projekt anlegen und die Pfade an den Docker-Ordner des NAS anpassen. Daneben eine Datei `.env`:
   ```sh
   DB_PASSWORD=<langes zufälliges Passwort>
   ```
2. **Starten.** Die Oberfläche läuft unter `http://<NAS>:8080`. Beim ersten Start legt der Server die Tabellen selbst an.
3. **Erster Aufruf.** Wer die Seite als Erstes öffnet, legt das Administrator-Konto an – ohne Einrichtungscode. Rufe sie deshalb direkt nach dem ersten Start selbst auf.

!!! warning "Erst einrichten, dann freigeben"
    Mach das DMS erst über einen Reverse-Proxy oder Port-Freigabe erreichbar, wenn der Administrator angelegt ist.

Danach: unter **Werkbank → [Verschlüsselung](verschluesselung.md)** den Schlüssel erzeugen und das **Notfallblatt** herunterladen, unter **Werkbank → [Sicherung](sicherung.md)** den Zeitplan einschalten, unter **Werkbank → E-Mail und Adresse** die Adresse des DMS und, falls gewünscht, den E-Mail-Versand einrichten (siehe unten); unter **Werkbank → Demo-Daten** die Beispiel-Mappentypen laden oder eigene [Mappentypen](mappentypen.md) anlegen und [Benutzer einladen](benutzer.md).

## E-Mail und Adresse

Unter **Werkbank → E-Mail und Adresse** stellst du ein, was früher Umgebungsvariablen waren. Änderungen gelten sofort, ohne Neustart.

![E-Mail und Adresse in der Werkbank](bilder/werkbank-betrieb.png)

- **Adresse des DMS** – unter dieser Adresse öffnen die Benutzer das DMS, z. B. `http://nas.local:8080` oder `https://dms.example.org`. Sie steht in den Links der E-Mails. Solange keine gepflegt ist, nimmt das DMS die Adresse, unter der es gerade aufgerufen wird; **Diese Adresse übernehmen** speichert sie. Beginnt sie mit `https://`, gilt die Anmeldung nur noch über HTTPS.
- **E-Mail-Versand** – Server, Verbindungsart (STARTTLS, meist Port 587; SSL/TLS, meist 465; unverschlüsselt nur im Heimnetz), Benutzer, Passwort und Absender. **Verbindung prüfen** meldet sich am Server an, ohne etwas zu senden; **Testmail senden** schickt eine Mail an eine Adresse deiner Wahl – beides mit den Werten im Formular, auch bevor du speicherst. Schlägt etwas fehl, steht die Meldung des Mailservers darunter.
- **Selbstsigniertes Zertifikat erlauben** – nur für einen eigenen Mailserver im Heimnetz.
- Der **Absender** ist auch der Absender, wenn Benutzer eine Mappe [per E-Mail versenden](https://motom001.github.io/dms/benutzer/versenden/). Das DMS trägt dabei die Adresse des Benutzers als **Antworten an** ein – so kommen Antworten bei ihm an, ohne dass das DMS fremde Absender vortäuscht (das würden viele Empfänger als Spam einstufen). Dieselbe Einstellung braucht die [tägliche Zusammenfassung der Aufgaben](aufgaben.md#tagliche-zusammenfassung).
- Ohne E-Mail-Versand (Haken „E-Mails verschicken“ aus) zeigt die Benutzerverwaltung die Einladungs- und Passwort-Links zum Kopieren an; „Passwort vergessen“ setzt dann der Administrator zurück.

!!! note "Passwort verschlüsselt"
    Das SMTP-Passwort speichert das DMS verschlüsselt; den Schlüssel dazu erzeugst du einmal unter **Werkbank → [Verschlüsselung](verschluesselung.md)**. Solange es keinen gibt, lässt sich kein Passwort speichern. Das Passwort wird nie an die Oberfläche zurückgegeben. Nimm trotzdem am besten ein eigenes Passwort nur für den Versand, etwa ein App-Passwort deines Mailanbieters.

!!! note "Von einer älteren Version"
    Bis Version 0.8 waren das die Umgebungsvariablen `APP_URL` und `SMTP_*`. Beim ersten Start von 0.9 übernimmt das DMS ihre Werte einmalig in die Werkbank; danach werden sie ignoriert, und das Protokoll weist darauf hin, dass sie aus der Compose-Datei entfernt werden können.

## Ordner und Volumes

Die Ordner im Container sind fest. Wohin sie auf dem NAS zeigen, bestimmst du allein über die Volumes der Compose-Datei – dafür gibt es keine Umgebungsvariablen.

| Ordner im Container | Inhalt | Volume in der Vorlage |
| --- | --- | --- |
| `/data/files` | hochgeladene Dokumente, Logos, Bilder der Fehlermeldungen | `/volume1/docker/dms/files` |
| `/data/geheim` | Schlüssel für gespeicherte Passwörter (`dms.schluessel`), [RESCUE-Datei](notfall.md) | `/volume1/docker/dms/geheim` |
| `/data/sicherung` | [Sicherungen](sicherung.md), verschlüsselt | `/volume1/docker/dms/sicherung` |

Jeder der drei Ordner muss ein eigenes Volume sein; sonst ist sein Inhalt weg, sobald der Container neu erstellt wird (z. B. beim Update). Die Datenbank liegt im Volume des PostgreSQL-Containers. Wie viel Platz in jedem Ordner frei ist, zeigen **Werkbank → [Speicherplatz](speicherplatz.md)** und **Werkbank → Technik**.

```yaml
    volumes:
      - /volume1/docker/dms/files:/data/files
      - /volume1/docker/dms/geheim:/data/geheim
      - /volume1/docker/dms/sicherung:/data/sicherung
```

!!! note "Von einer älteren Version (bis 0.22)"
    Früher legten `FILES_DIR`, `DMS_SCHLUESSEL_DATEI` und `DMS_SICHERUNG_DIR` die Ordner fest. Steht eine davon noch mit dem festen Wert in der Compose-Datei (z. B. `FILES_DIR: /data/files`), läuft alles weiter; das Protokoll und die Werkbank-Übersicht weisen darauf hin, dass du sie entfernen kannst. Zeigt sie auf einen **anderen** Ordner, startet das DMS nicht – sonst sähe es plötzlich einen leeren Dateiordner. Die Meldung im Protokoll des Containers nennt dann, welches Volume stattdessen auf den festen Ordner zeigen muss. Siehe [Aktualisieren](aktualisieren.md#feste-ordner-ab-023).

## Einstellungen

Diese Einstellungen sind Umgebungsvariablen im Compose-Projekt:

| Variable | Bedeutung |
| --- | --- |
| `DATABASE_URL` | Verbindung zu PostgreSQL (Pflicht) |
| `TRUST_PROXY` | `true`, wenn ein Reverse-Proxy davor sitzt (richtige IP-Adressen im Protokoll, sichere Cookies über HTTPS) |
| `LOG_LEVEL` | Grundstufe des Protokolls: `debug`, `info` (Standard), `warn`, `error` |

## Hinter einem Reverse-Proxy

Läuft das DMS hinter nginx (oder einem anderen Proxy), setze `TRUST_PROXY: "true"` und trage in der Werkbank unter **E-Mail und Adresse** die öffentliche Adresse ein, z. B. `https://dms.example.org`. Beginnt sie mit `https://`, setzt das DMS das Sitzungs-Cookie nur noch über HTTPS.

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
