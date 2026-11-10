# Administratorhandbuch

Dieses Handbuch ist für alle, die Ablago **installieren, einrichten und betreiben**. Wie man im Alltag mit Mappen arbeitet, steht im [Benutzerhandbuch](https://help.ablago.app/benutzer/) – darauf verweist dieses Handbuch, statt es zu wiederholen.

!!! tip "Gerade installiert?"
    Was du jetzt noch tun solltest, steht kurz unter [Einrichten in fünf Schritten](fuenf-schritte.md). Die Tabelle unten ist das Nachschlagewerk für später.

![Werkbank: Mappentyp bearbeiten](bilder/werkbank-mappentyp.png)

## Aufgaben eines Administrators

| Aufgabe | Wo | Kapitel |
| --- | --- | --- |
| Ablago installieren | NAS, Heimserver, App-Store | [Wie komme ich an ein DMS?](https://help.ablago.app/installieren/aktuell/) |
| nach der Installation einrichten | Einrichtungsassistent, Datenbank, Reverse-Proxy | [Einrichtung und Betrieb](installation.md) |
| Neue Version einspielen, Daten sichern | NAS | [Aktualisieren und Sichern](aktualisieren.md) |
| Festlegen, welche Mappen es gibt und was darin steht | Werkbank → Mappentypen | [Mappentypen](mappentypen.md) |
| Festlegen, welche Ansichten die Ablage anbietet | Werkbank → Ansichten | [Ansichten](sichten.md) |
| Benutzer einladen, Rollen vergeben, Zugänge sperren | Werkbank → Benutzer | [Benutzer und Rollen](benutzer.md) |
| Farben, Logo und Schriftzug anpassen | Werkbank → Designs | [Designs](designs.md) |
| Ausprobieren mit Beispieldaten | Werkbank → Demo-Daten | [Demo-Daten](demo.md) |
| Überblick, was zu tun ist | Werkbank → Übersicht | [Werkbank und Übersicht](uebersicht.md) |
| Festlegen, welche Bereiche die Werkbank zeigt | Werkbank → Werkbank anpassen (unten in der Leiste) | [Werkbank anpassen](uebersicht.md#werkbank-anpassen) |
| Festlegen, wer was sehen und ändern darf | Werkbank → Mappentypen → Berechtigungen, Werkbank → Ansichten | [Berechtigungen](berechtigungen.md) |
| Auskunft geben, auf Verlangen löschen, Fristen einhalten (DSGVO) | Werkbank → Datenschutz-Auskünfte, Aufbewahrung abgelaufen, Papierkorb | [Datenschutz in Ablago](datenschutz.md) |
| Daten sichern und wiederherstellen | Werkbank → Sicherung, Wiederherstellen | [Sicherung](sicherung.md), [Wiederherstellen](wiederherstellen.md) |
| Alle Daten mitnehmen, lesbar auch ohne Ablago | Werkbank → Vollexport | [Daten exportieren](export.md) |
| Fehler finden, Meldungen der Benutzer bearbeiten | Werkbank → Wartung und Fehlersuche | [Fehlersuche](fehlersuche.md) |
| Andere Programme anbinden | eigenen Benutzer für das Programm anlegen, als dieser anmelden, dann Mein Konto → Sicherheit → API-Schlüssel (Administratoren bekommen keine Schlüssel) | [Schnittstelle](api.md) |

Wie Ablago technisch aufgebaut ist und warum, beschreiben [Technik](technik.md) und [Entscheidungen](entscheidungen.md).

## Rollen in Ablago { #rollen-im-dms }

- **Administrator** – sieht zusätzlich die **Werkbank** und darf alles einrichten. Es gibt immer mindestens einen aktiven Administrator.
- **Mitglied** – arbeitet in der Ablage.

Das ist die **Systemrolle** eines Benutzers. Daneben gibt es frei anlegbare **Rollen** (etwa „Eltern“ oder „Steuern und Finanzen“). Sie geben von sich aus keine Rechte – über Regeln in den [Berechtigungen](berechtigungen.md) aber schon. Siehe [Benutzer und Rollen](benutzer.md).

!!! info "Wer darf was sehen?"
    - **Ohne Regeln dürfen alle alles.** So startet jede Ablago-Installation; für eine Familie reicht das oft.
    - **Je Mappentyp** legst du in den [Berechtigungen](berechtigungen.md) fest, wer Mappen anlegen, lesen, bearbeiten, löschen und Passwörter sehen darf – mit Regeln, z. B. über Rollen, und einem Testlauf.
    - **Je Ansicht** legst du an der Ansicht fest, wer sie sieht, dort anlegen und aus ihr exportieren darf ([Ansichten → Berechtigungen](sichten.md#berechtigungen)).
    - **Für Administratoren gelten die Regeln nicht:** Sie sehen und dürfen in der Ablage immer alles.
    - Was für einen Benutzer am Ende gilt, zeigt ihm „Mein Konto“ unter **Meine Rechte**.

## Neue Versionen

Was sich in welcher Version geändert hat, steht unter [Neu in dieser Version](neu.md) und auf GitHub unter [Releases (Changelog)](https://github.com/motom001/dms/releases). Die installierte Version zeigt die Werkbank unter **Technik**; dort steht auch ein Link auf alle Änderungen seit deiner Version.

### Das Handbuch zu deiner Version

Jede Installation bringt das Handbuch ihrer Version mit – auch ohne Internet. Die Hilfe im Menü, der Link in der Werkbank und jedes **?** öffnen es. Online unter `https://help.ablago.app/admin/aktuell/` steht immer das Handbuch zur neuesten Version. Ältere Adressen mit einer Versionsnummer (z. B. `…/admin/v0.22/sicherung/`) führen dort auf dieselbe Seite.

!!! tip "Das ? neben Überschriften"
    In der Werkbank steht an jedem Bereich und an vielen Zwischenüberschriften ein kleines **?** – immer direkt hinter der Überschrift, nie am Ende des Textes darunter. Es öffnet in einem neuen Tab genau den passenden Abschnitt dieses Handbuchs. Ein **?** an einem einzelnen Feld oder Haken steht an dessen Beschriftung und erklärt nur dieses Feld.

Wünsche und Fehler bitte als [Issue](https://github.com/motom001/dms/issues/new?template=wunsch.md) – beschreib kurz, was du tun willst und woran du merkst, dass es klappt; umgesetzt wird, was das Label `freigegeben` trägt.

## Projekt unterstützen

Ablago ist freie Software (Apache-2.0). Unterstützung ist über GitHub Sponsors möglich:

[Projekt unterstützen (GitHub Sponsors)](https://github.com/sponsors/motom001)
