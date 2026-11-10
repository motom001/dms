art: patch

## Behoben

- **Gelöschte Mappen nur an Pakete mit Leserecht** (#958): Das Ereignis „Mappe gelöscht“ bekommen nur noch Pakete, die die Mappe vor dem Löschen lesen durften. Geprüft wird mit der Mappe im Papierkorb; ist der Papierkorb schon geleert, geht das Ereignis an kein Paket.
- **Fristen ohne Leserecht ohne Datum** (#958): Fristen und Aufgaben zu einem Datumsfeld an einer Mappe, die man nicht lesen darf, zeigen unter „Zu erledigen“, im Eingang und an der Mappe weder das Datum noch das Feld. Andere automatische Aufgaben behalten ihre Fälligkeit.
- **Handbuch-Veröffentlichung ohne rote Läufe** (#898): Lehnt GitHub das Veröffentlichen des Handbuchs ab, weil gerade ein anderes Deployment läuft, versucht es der Workflow nach einer Pause ein zweites Mal. Es veröffentlicht weiterhin immer nur der neueste Stand.

## Geändert

- **nginx-Beispiel im Admin-Handbuch** (#958): `client_max_body_size` steht jetzt auf `130m`, damit auch Pakete bis 128 MB durch den Proxy passen (Dokumente bis 100 MB).
