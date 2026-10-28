# Administratorhandbuch

Dieses Handbuch ist für alle, die das DMS **installieren, einrichten und betreiben**. Wie man im Alltag mit Mappen arbeitet, steht im [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/) – darauf verweist dieses Handbuch, statt es zu wiederholen.

![Werkbank: Mappentyp bearbeiten](bilder/werkbank-mappentyp.png)

## Aufgaben eines Administrators

| Aufgabe | Wo | Kapitel |
| --- | --- | --- |
| DMS auf dem NAS installieren | Docker Compose | [Installation](installation.md) |
| Neue Version einspielen, Daten sichern | NAS | [Aktualisieren und Sichern](aktualisieren.md) |
| Festlegen, welche Mappen es gibt und was darin steht | Werkbank → Mappentypen | [Mappentypen](mappentypen.md) |
| Benutzer einladen, Rollen vergeben, Zugänge sperren | Werkbank → Benutzer | [Benutzer und Rollen](benutzer.md) |
| Farben und Aussehen anpassen | Werkbank → Designs | [Designs](designs.md) |
| Ausprobieren mit Beispieldaten | Werkbank → Demo-Daten | [Demo-Daten](demo.md) |
| Fehler finden, Support anfragen | Werkbank → Protokoll, Datenbank, Technik | [Fehlersuche](fehlersuche.md) |
| Andere Programme anbinden | Profil → API-Schlüssel | [Schnittstelle](api.md) |

Wie das DMS technisch aufgebaut ist und warum, beschreiben [Technik](technik.md) und [Entscheidungen](entscheidungen.md).

## Rollen im DMS

- **Administrator** – sieht zusätzlich die **Werkbank** und darf alles einrichten. Es gibt immer mindestens einen aktiven Administrator.
- **Mitglied** – arbeitet in der Ablage.

Daneben gibt es frei anlegbare, fachliche Rollen (etwa „Steuern und Finanzen“); sie geben derzeit keine zusätzlichen Rechte. Siehe [Benutzer und Rollen](benutzer.md).

!!! info "Wer darf was sehen?"
    Im Moment sehen alle angemeldeten Benutzer alle Mappen. Feinere Rechte folgen mit der Berechtigungsverwaltung.

## Neue Versionen

Was sich in welcher Version geändert hat, steht auf GitHub unter [Releases (Changelog)](https://github.com/motom001/dms/releases). Die installierte Version zeigt die Werkbank unter **Technik**.

Wünsche und Fehler bitte als [Issue](https://github.com/motom001/dms/issues/new?template=wunsch.md) im Format einer User Story mit Abnahmekriterien; umgesetzt wird, was das Label `freigegeben` trägt.

## Projekt unterstützen

Das DMS ist freie Software (AGPL-3.0). Unterstützung ist über GitHub Sponsors möglich:

[![Projekt unterstützen](https://img.shields.io/badge/Projekt_unterst%C3%BCtzen-GitHub_Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/motom001)
