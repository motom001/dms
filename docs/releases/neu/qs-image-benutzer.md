art: minor

## Sicherheit

- **Ablago ohne Administratorrechte** (#1354): Im Container läuft Ablago nicht mehr als root, sondern als eigener Benutzer `ablago` (1000:1000) – in beiden Images, auch die Startseite beim Containerstart und der Befehl `dms` in der Konsole. Das Start-Skript wechselt den Benutzer und setzt dabei „no new privileges“: Kein Prozess kann danach wieder Rechte gewinnen. Zusätzliche Rechte von Docker braucht das Image dafür nicht.
- **Dokumentwerkzeuge getrennt und begrenzt** (#1354): Die Programme, mit denen Ablago PDFs liest, rastert und entsperrt (poppler, qpdf), laufen unter einem eigenen Benutzer, getrennt von Ablago, und dürfen nur in ihren eigenen Arbeitsordner schreiben. Jeder Aufruf hat Grenzen für Arbeitsspeicher (Vorgabe 1024 MB, `DMS_WERKZEUG_SPEICHER_MB`), Rechenzeit und Dateigröße. Braucht ein PDF mehr, scheitert nur dieser Schritt mit einer Meldung; Ablago und der Rechner laufen weiter.
- **dms-komplett: Datenbank nur für Ablago** (#1354): Die Rolle `dms` ist kein Superuser mehr, sondern nur Eigentümerin ihrer Datenbank. Andere Benutzer im Container erreichen die Datenbank nicht mehr; einzutragen ist weiterhin nichts.

## Für Administratoren

- **Beim ersten Start nach dem Update** übernimmt der Container einmal die Ordner unter `/data` (Dateien, Schlüssel, Sicherungen, Exporte) für den neuen Benutzer. Die Startseite zeigt dabei „Ordner werden für Ablago eingerichtet (einmalig)“, das Protokoll je Ordner eine Zeile. Bei vielen Dateien dauert das einige Minuten. Mit Docker-Volumes und den Ordnern der Vorlagen ist nichts zu tun.
- **Ordner auf dem NAS einem eigenen Benutzer geben:** `PUID` und `PGID` in der Compose-Datei setzen (z. B. `1026` und `100` auf einer Synology). Kann Ablago einen Ordner nicht übernehmen, etwa auf einer Netzwerkfreigabe, nennt die Startseite den Grund und das Protokoll den Befehl, der hilft. Siehe *Aktualisieren → Ohne Administratorrechte* im Administratorhandbuch.
- Der Eingangsordner bleibt, wie er ist; fehlt Ablago dort das Schreibrecht, steht eine Warnung im Protokoll.
- Die Vorlagen enthalten zusätzlich `security_opt: [no-new-privileges:true]`; für bestehende Compose-Dateien ist das freiwillig.
- Zurück auf die vorige Version geht ohne Zutun.
