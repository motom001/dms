art: patch

## Behoben
- Mehrere Prozesse: Der Fortschritt von Sicherung, Prüfsumme, Probe-Wiederherstellung und Wiederherstellung springt nicht mehr zwischen Fortschritt und „kein Lauf“ – jeder Prozess fragt den Stand beim Prozess ab, der den Lauf hält. Ebenso zeigen Eingangsordner (letzte Prüfung, wartende Dateien, Pause) und Texterkennung überall denselben Stand (#1341).
- Beenden (z. B. `docker stop`) dauert auch mit einem Prozess höchstens 7 Sekunden: Hängt ein Schritt, beendet sich Ablago selbst und schreibt ins Protokoll, wo es hing – statt nach 10 Sekunden hart abgebrochen zu werden (#1340).
