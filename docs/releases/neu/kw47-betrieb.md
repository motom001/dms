art: patch

## Behoben

- **Werkbank → Protokoll mit mehreren Prozessen** (#1490): Läuft Ablago mit zwei oder mehr Prozessen (`DMS_PROZESSE`, Vorgabe `auto` ab 4 Kernen und 8 GB), zeigt das Protokoll jetzt die Einträge aller Prozesse, nach Zeit gemischt; jeder Eintrag nennt seinen Prozess. Die Zahl der Einträge springt nicht mehr, der Debug-Modus gilt für alle Prozesse. Neues Modul *Pakete* (`pakete`) im Filter: Ausgaben und Fehler des Paket-Läufers und des Codes von Paketen stehen dort statt unter *Werkbank* – auch in der Wenn-Karte „Protokollmeldung“ wählbar.
- **Probe-Wiederherstellung** (#1383): Scheitert nur das Speichern des Ergebnisses, bleibt „Aufräumen“ als erledigt markiert; ein eigener Hinweis nennt das gescheiterte Speichern.
- **Uhrzeiten in der Zone der Region** (#1451): Anmeldesperre („Gesperrt bis“), Postfach („Mail von … vom …“ in der Historie der Post), Meldungen der Paketverwaltung, „KI-Funktionen pausiert bis“ und der Befehl `dms` (gesperrt, wartung, status, benutzer) zeigen Uhrzeiten jetzt in der unter *Werkbank → Einstellungen → Region* eingestellten Zeitzone. **Dort können sich angezeigte Uhrzeiten ändern**, wenn die Zeitzone des Servers (Container, `TZ`) von der Region abweicht – meist um eine oder zwei Stunden. `dms` fragt die Region dafür einmal beim Server nach.
