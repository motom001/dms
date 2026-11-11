art: minor

## Neu

- Anmelden mit Passkey: unter Mein Konto → Sicherheit Passkeys hinzufügen, benennen und entfernen (mehrere je Person), auf der Anmeldeseite „Mit Passkey anmelden“ – mit Fingerabdruck, Gesicht oder Geräte-PIN, ohne Passwort und geschützt vor gefälschten Seiten. Auch als zweiter Faktor statt des Codes, für die erneute Anmeldung im Verwaltungsmodus und für „Passwörter für Dokumente“; ein Passkey erfüllt auch die Zwei-Faktor-Pflicht. Unter Werkbank → Anmeldeschutz lassen sich Passkeys je Rolle vorschreiben; unter Werkbank → Benutzer und mit `dms passkeys-zuruecksetzen` zurücksetzen. Passkeys gehen nur über HTTPS; der Einrichtungsassistent bietet sie dann am Ende an, und die Werkbank warnt, wenn eine neue Adresse vorhandene Passkeys ungültig macht. (#811)
