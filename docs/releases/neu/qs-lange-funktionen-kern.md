art: keine

Lange Funktionen im Kern des Servers (Aufbau der HTTP-Schnittstelle, Hilfen der Routen, Konten-Ablage, Zusammenbau des Dienstes, Befehl `dms` und Einrichtungsmodus) sind in benannte Schritte zerlegt (#1278) – ohne Änderung am Verhalten, abgesichert durch einen neuen Test, der Hooks und Antworten der HTTP-Schnittstelle festhält.
