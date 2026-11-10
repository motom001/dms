art: patch

## Sicherheit

- **Größengrenzen an einer Stelle** (#901): Alle Grenzen in Bytes stehen jetzt mit Namen und Begründung in `server/src/grenzen.ts`, ein Test verhindert neue Zahlen anderswo. Eine Datei als Körper nehmen nur noch Routen an, die eine eigene Grenze nennen; alle anderen antworten mit 415, statt still die Grenze für Formulare (2 MB) zu nutzen.
- **Hochgeladene, nicht installierte Pakete** (#901) fliegen jetzt alle fünf Minuten heraus, sobald sie abgelaufen sind (30 Minuten), nicht erst beim nächsten Hochladen. Im Arbeitsspeicher belegen sie zusammen höchstens 512 MB, darüber fallen die ältesten heraus.

## Geändert

- **Admin-Handbuch:** neue Tabelle *Technik → Grenzen*. Das nginx-Beispiel nennt jetzt `client_max_body_size 260m`, damit auch Sammeldateien bis 256 MB durch den Proxy kommen.
