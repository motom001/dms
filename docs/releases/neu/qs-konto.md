art: minor

## Neu

- **Erneute Bestätigung am eigenen Konto** (#1352, #1356): Passkey hinzufügen, Zwei-Faktor-Anmeldung einrichten oder durch eine neue App ersetzen, API-Schlüssel „nur lesen“ oder „lesen und schreiben“ anlegen oder erweitern sowie *Meine Daten exportieren* mit Passwörtern fragen nach Passwort (und Code) oder Passkey, wenn die Anmeldung länger als zehn Minuten zurückliegt. Neue Passkeys, eine neue Code-App und neue API-Schlüssel melden eine Mail an die Person.
- **API-Schlüssel nach neuem Passwort** (#1352): Nach einem Passwortwechsel und nach „Alle anderen abmelden“ zeigt Ablago die eigenen API-Schlüssel und bietet an, sie zu löschen.
- **Vertretung** (#1356): Anmeldung, API-Schlüssel, E-Mail-Adresse, Passwort und der Export mit Passwörtern der vertretenen Person lassen sich nicht ändern.

## Verbessert

- **Passwort-Hashes** (#1358): scrypt mit N = 2^14, r = 8, p = 5 (OWASP-gleichwertig); bestehende Hashes stellt Ablago beim nächsten Anmelden von selbst um. Höchstens zwei Passwortprüfungen gleichzeitig je Prozess, weitere warten kurz.
- **Übersicht der Werkbank:** Zahlen nur für die eigenen Bereiche.
