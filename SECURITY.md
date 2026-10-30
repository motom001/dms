# Sicherheit

## Eine Sicherheitslücke melden

Bitte **kein öffentliches Issue** für Sicherheitslücken. Melde sie vertraulich über GitHub: **Security → Report a vulnerability** in diesem Repository ([Private Vulnerability Reporting](https://github.com/motom001/dms/security/advisories/new)).

Hilfreich sind: betroffene Version (Werkbank → Technik), Schritte zum Nachstellen, was jemand damit erreichen kann. Wir melden uns, sobald wir die Meldung gesehen haben, und veröffentlichen eine Korrektur als Patch-Release mit Hinweis in den Release-Notes.

## Unterstützte Versionen

Korrekturen gibt es für die **neueste Version**. Aktualisiere bitte zuerst, bevor du meldest – siehe [Aktualisieren](https://motom001.github.io/dms/admin/aktuell/aktualisieren/).

## Abhängigkeiten

Dependabot schlägt Updates der Bibliotheken, GitHub Actions und Basis-Images wöchentlich als Pull Request vor. Die CI prüft mit `npm audit`, dass keine bekannte Lücke der Stufe „hoch“ oder „kritisch“ im Image landet.
