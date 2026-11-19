art: patch

## Beim Update beachten

- **Ordner eines NAS-Benutzers, mit 0.299.0 übernommen:** 0.299.0 hat die Ordner ohne `PUID`/`PGID` für `1000:1000` übernommen. Ablago bleibt dabei und ändert nichts. Sollen sie wieder deinem NAS-Benutzer gehören (damit du über die Dateifreigabe an Sicherungen und Exporte kommst), auf dem NAS einmal `sudo chown -R 1026:100 <Ordner>` ausführen (Zahlen und Ordner deines NAS) und den Container neu starten. Ablago läuft danach von selbst als dieser Benutzer. Wer `PUID`/`PGID` gesetzt hat, muss nichts tun.

## Verbessert

- **Ohne Administratorrechte: Benutzer wie der Datenordner** (#1466): Ohne `PUID`/`PGID` läuft Ablago als der Benutzer, dem die eingebundenen Ordner gehören, etwa `1026:100` auf einer Synology. Gehören sie root, gilt wie bisher `1000:1000`. Root und die Kennung der Dokumentwerkzeuge nimmt Ablago dabei nie. `PUID` und `PGID` braucht es nur noch als Ausnahme; gesetzte Werte gehen vor.
- **So wenig wie möglich umschreiben** (#1466): Beim Start übernimmt Ablago nur noch, was root gehört. Was dem Benutzer von Ablago schon gehört, bleibt mit Gruppe und Rechten, wie es ist. Ordner des NAS-Benutzers bekommen kein `o-rwx` mehr. Nur Schlüssel in `geheim`, die die Gruppe oder andere lesen könnten, sind danach nur noch für Ablago lesbar. Jede Änderung steht im Protokoll, auf der Startseite und im Systemzustand.
- **Systemzustand und Startseite nennen den Benutzer** (#1466): Unter *Werkbank → Systemzustand → Laufzeit* stehen Benutzer und Gruppe von Ablago, woher sie kommen und was beim Start geändert wurde, ebenso in `dms status`. Kann Ablago in einen Ordner nicht schreiben, zeigt die Startseite, wem der Ordner gehört, und die Abhilfe als fertige Zeilen zum Einfügen.
