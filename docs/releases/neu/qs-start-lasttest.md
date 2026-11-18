art: minor

Neues sichtbares Verhalten beim Start und auf der Lasttest-Seite, ohne Bruch.

## Verbessert

- **Seite schon beim Containerstart** (#1250): dms-komplett zeigt „Ablago startet …“ schon in der ersten Sekunde, noch während die Datenbank angelegt wird – mit dem Schritt in Alltagssprache („Datenbank wird angelegt (nur beim ersten Start)“, „Datenbank startet“, „Ablago startet“, „Datenbank wird aktualisiert – Migration 3 von 5“). Danach geht es wie bisher von selbst weiter zur Anmeldung, zur Einrichtung oder zur Lasttest-Seite.
- **Datenbank nicht erreichbar oder blockiert** (#1250): Statt einer toten Adresse nennt die Startseite ruhig die Ursache – Verbindung abgelehnt, Sperre, Speicher voll, zu viele Verbindungen, bei dms-komplett auch Rechte des Ordners oder eine andere PostgreSQL-Version – und was du tun kannst. Auch das Image dms wartet mit dieser Seite etwa eine Minute auf eine Datenbank, die noch startet. Die Seite erscheint auf Deutsch oder Englisch, je nach Browser.
- **Lasttest-Seite: Ablauf als Tabelle** (#1251): Die Überschrift nennt die Auswahl („Lasttest: alle Stufen (klein → mittel → groß)“), darunter die laufende Stufe eindeutig („Stufe mittel, 2 von 3“). Eine Tabelle zeigt von Anfang an alle geplanten Schritte und Durchgänge je Stufe mit einem Satz, wofür sie sind – erledigt mit Dauer, p50, p95, Anfragen je Sekunde, Fehlern und Ziel, laufend mit Fortschritt, offen grau; bei `alle` je Stufe eine Gruppe mit grober Restdauer, bei groß die nächsten Schritte bis zur Grenze und am Ende „nicht nötig“.
- **Lasttest-Seite: Gerät zuerst, Ergebnis danach oben** (#1251): „Beschreibe dein Gerät“ steht während des Tests gleich unter der Überschrift, danach rückt das Ergebnis nach oben. Auch der ganze Bericht lässt sich mit einem Knopf kopieren (auch über `http://` im Heimnetz) und herunterladen.
- **Keine Schreckmeldung im Lasttest** (#1251): Die Datenbank ohne Volume steht im Lasttest-Modus nur als Hinweis im Protokoll, nicht als Fehler. Die Startzeile im Protokoll nennt dieselbe Version wie die Seite.
