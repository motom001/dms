art: minor

## Geändert
- **„Ablago antwortet gerade nicht“ hilft jetzt weiter** (#1199): Die Meldung sagt, was los ist – Ablago hängt („bekommt seit 3 Minuten keine Antwort von seiner Datenbank“), die Datenbank ist vermutlich aus, oder Ablago meldet sich gar nicht –, nennt die passenden Schritte (warten, Ablago- bzw. Datenbank-Container neu starten, Bescheid sagen), verlinkt die Notfall-Hilfe im Handbuch und zeigt Uhrzeit und zuletzt gesehene Version. Bewusst ohne Knopf zum Neustarten und ohne Protokoll, denn die Seite sieht jeder, der die Adresse kennt. Die Gesundheitsprüfung (`/api/gesundheit`) unterscheidet dafür `antwortet-nicht` und `abgewiesen` und sagt, seit wann.
