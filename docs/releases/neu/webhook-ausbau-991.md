art: minor

## Geändert

- **Zähler-Webhook entfallen** (#991): Nach außen meldet Ablago künftig nur noch über Automatisierungen (Dann-Karte „URL aufrufen“, #671). Der Webhook unter Mein Konto und der Bereich Werkbank → Webhooks mit der Liste der freigegebenen Ziele sind entfallen; vorhandene Einträge hat das Update still entfernt. Die Hausautomatisierung fragt die Zahlen weiter über `GET /api/v1/ich/zaehler` ab – unverändert, auch mit ETag und 304; die Homey-App braucht nichts.
