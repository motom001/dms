art: minor

## Neu

- **Automatisierungen: Aufruf von außen** (#679): Die neue Wenn-Karte löst eine Automatisierung über eine eigene Adresse aus – etwa aus dem Monitoring oder der Hausautomatisierung, ohne Paket. Adresse und Geheimnis legst du an der Karte ausdrücklich an (frische Anmeldung); das Geheimnis steht nur einmal da und lässt sich erneuern. Aufrufe nur per POST mit HMAC-SHA256-Signatur über Zeitstempel und Inhalt, jede Signatur nur einmal, gebremst je Adresse und je Netz; die Antwort lautet nur „angenommen“. Mitgeschickte Parameter stehen als Platzhalter bereit, nur als Text. Übersicht (mit „Alle abschalten“) und Notfallblatt nennen alle Adressen, die Aufrufe annehmen; Pakete bringen die Karte nicht mit. Beispiel mit curl im Administratorhandbuch.
