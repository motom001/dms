art: patch

## Geändert

- **Gesundheitsprüfung wartet bis 5 Sekunden auf die Datenbank** (#1198): Erst danach gilt Ablago als „unhealthy“. Der Docker-Healthcheck hat dafür eine Zeitgrenze von 8 Sekunden.
