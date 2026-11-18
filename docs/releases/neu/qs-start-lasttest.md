art: minor

Neues sichtbares Verhalten beim Start und auf der Lasttest-Seite, ohne Bruch.

## Verbessert

- **Seite schon beim Containerstart** (#1250): dms-komplett zeigt „Ablago startet …“ schon in der ersten Sekunde, noch während die Datenbank angelegt wird – mit dem Schritt in Alltagssprache („Datenbank wird angelegt (nur beim ersten Start)“, „Datenbank startet“, „Ablago startet“, „Datenbank wird aktualisiert – Migration 3 von 5“). Danach geht es wie bisher von selbst weiter zur Anmeldung, zur Einrichtung oder zur Lasttest-Seite.
- **Datenbank nicht erreichbar oder blockiert** (#1250): Statt einer toten Adresse nennt die Startseite ruhig die Ursache – Verbindung abgelehnt, Sperre, Speicher voll, zu viele Verbindungen, bei dms-komplett auch Rechte des Ordners oder eine andere PostgreSQL-Version – und was du tun kannst. Auch das Image dms wartet mit dieser Seite etwa eine Minute auf eine Datenbank, die noch startet. Die Seite erscheint auf Deutsch oder Englisch, je nach Browser.
