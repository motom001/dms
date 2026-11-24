art: minor

## Beim Update beachten

- **dms-komplett: PostgreSQL 18 – Umzug über eine Sicherung** (#1464): Das Image bringt jetzt PostgreSQL 18 statt 17 mit. Mit dem bisherigen Datenbank-Ordner startet es nicht; die Seite unter der gewohnten Adresse nennt Grund und Weg, gelöscht wird nichts. Schritt für Schritt:
    1. Image auf `ghcr.io/motom001/dms-komplett:0.305.0` stellen (letzte Version mit PostgreSQL 17) und starten – oder gleich die Sicherung von vor dem Update nehmen.
    2. **Werkbank → Sicherung → Jetzt sichern.**
    3. Container stoppen, den Ordner für `/data/postgres` umbenennen (z. B. `postgres-17`) und einen leeren mit dem alten Namen anlegen.
    4. Image wieder auf `:stabil` stellen, starten und im Assistenten **Aus einer Sicherung wiederherstellen** wählen.
    5. Prüfen; den alten Ordner erst löschen, wenn alles läuft.

    Anleitung: [Aktualisieren → PostgreSQL 18](https://help.ablago.app/admin/aktuell/aktualisieren/#postgresql-18).
- **Zwei Container mit `postgres:17`:** nichts zu tun – Ablago läuft weiter und schreibt einen Hinweis ins Protokoll. Der Umzug auf `postgres:18` geht über eine Sicherung und einen neuen, leeren Datenbank-Ordner; die Vorlagen brauchen dafür die neue Zeile `PGDATA: /var/lib/postgresql/data` (gleiche Anleitung).
- **Eigene Datenbank:** Ablago braucht mindestens PostgreSQL 16 und lehnt ältere beim Start mit klarer Meldung ab. Getestet wird nur noch mit 18.

## Geändert

- **PostgreSQL 18 ist Standard** (#1464, #1544): `dms-komplett`, alle Vorlagen (`docker-compose.yml`, `deploy/*`) und die CI nutzen PostgreSQL 18; 17 wird nicht mehr getestet. Auf einem NAS brachte 18 unter hoher Last gut ein Drittel mehr Durchsatz (#1456). Neue Datenbanken in `dms-komplett` entstehen ausdrücklich mit Datenprüfsummen. „Geprüfte Plattformen“ nennt die Versionen; ein neuer CI-Test zieht eine Sicherung auf 17, spielt sie auf 18 ein und vergleicht alle Tabellen und Dateien.
- **Handbuch TrueNAS** (#1543): zuerst die App aus dem TrueNAS-Katalog (Port 30607, Ordner `keys`/`backups`, PostgreSQL 18, ohne Einrichtungscode – Einrichtung sofort abschließen), danach die Custom App mit Vorlage. Die Fehlervorlage fragt nach der Installationsart.
- **Handbuch: Gebrauchte Hardware** (#610): Mini-PC, Thin Client oder altes Notebook als Server – Mindestangaben, Checkliste für den Kauf, Notebook im Dauerbetrieb, alte Daten löschen und Datenträger prüfen.
