art: minor

## Neu

- **Paket nach Zeitplan ausführen** (#1082): Neue Dann-Karte für Automatisierungen mit dem Auslöser *Zeitplan*. Sie sagt einem Paket, dass sein Zeitpunkt erreicht ist – etwa *Verträge täglich prüfen* um 05:00 –, damit es etwas neu rechnet, das nur am Datum hängt. Uhrzeit und Tage änderst du an der Automatisierung, ausschalten geht am Schalter. Das Paket arbeitet dabei mit seinen eigenen Rechten; eine mitgelieferte Automatisierung ruft nur ihr eigenes Paket, in eigenen stehen nur Pakete zur Wahl, die Zeitpläne annehmen. Ist das Paket entfernt, läuft die Karte ins Leere („Paket … ist nicht installiert“), ohne Fehlermeldungen. Die Rechte-Vorschau beim Installieren nennt den Zeitplan. Für Paketentwickler: Ereignis `zeitplan.ausgefuehrt` mit Datum, Zeitpunkt und Aufgabe.

## Geändert

- **Mitgelieferte Automatisierungen** (#1082): Ein Paket kann Automatisierungen als *gleich eingeschaltet* kennzeichnen – sie stehen beim Installieren mit gesetztem Haken und Uhrzeit da, die übrigen ohne; abwählen kannst du jede. Pakete ohne diese Angabe bieten wie bisher alle angehakt an. Ein Update ändert an oder aus einer installierten Automatisierung nie.
