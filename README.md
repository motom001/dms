# DMS

<!-- Abzeichen (#252): Zeile 1 Stand, Zeile 2 Sicherheit, Zeile 3 Offenheit. -->
[![Release](https://img.shields.io/github/v/release/motom001/dms?label=Release&sort=semver)](https://github.com/motom001/dms/releases/latest)
[![Prüfungen](https://img.shields.io/github/actions/workflow/status/motom001/dms/image.yml?branch=main&label=Pr%C3%BCfungen)](https://github.com/motom001/dms/actions/workflows/image.yml)
[![Handbuch](https://img.shields.io/github/actions/workflow/status/motom001/dms/handbuch.yml?branch=main&label=Handbuch)](https://motom001.github.io/dms/)<br>
[![CodeQL](https://github.com/motom001/dms/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/motom001/dms/security/code-scanning?query=tool%3ACodeQL)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/motom001/dms/badge)](https://scorecard.dev/viewer/?uri=github.com/motom001/dms)
[![Sicherheit](https://img.shields.io/badge/Sicherheit-SECURITY.md-2ea44f)](SECURITY.md)<br>
[![Lizenz](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)](LICENSE)
[![Unterstützen](https://img.shields.io/badge/Unterst%C3%BCtzen-GitHub_Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/motom001)

**Die Unterlagen deines Haushalts an einem Ort – selbst gehostet, kostenlos, deine Daten bleiben bei dir.**

Statt loser Dateien in Ordnern legst du **Mappen** an: für den Vertrag, die Rechnung, die Heizung, den Handwerker. Mappen verweisen aufeinander. So findest du von der Heizung den Wartungsvertrag, von dort jede Rechnung und den Handwerker, der sie gestellt hat. Und an die Kündigungsfrist erinnert dich das DMS rechtzeitig.

<!-- Bildschirmfoto aus dem Handbuch-Workflow (#290): wird mit jedem Release neu aufgenommen, nur Beispieldaten. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://motom001.github.io/dms/benutzer/aktuell/bilder/readme-dunkel.png">
  <img alt="Die Ablage des DMS: links die Ansichten, in der Mitte die Liste, rechts eine geöffnete Mappe mit Angaben und Dokumenten" src="https://motom001.github.io/dms/benutzer/aktuell/bilder/readme.png">
</picture>

## Für wen?

<img alt="Für wen das DMS gebaut ist: vom Haushalt bis zum Unternehmen" src="docs/handbuch/benutzer/docs/grafiken/personas-skala.svg" width="100%">

Das DMS ist für **Familien und Haushalte** gebaut. Es passt besonders gut, wenn du dich **um deine Eltern kümmerst** oder **ein paar Wohnungen vermietest**. **Selbständige und kleine Betriebe** können es ebenfalls gut nutzen; für größere Unternehmen ist es bewusst nicht gemacht.

Ob es zu dir passt, zeigt [Ist das DMS etwas für mich?](https://motom001.github.io/dms/benutzer/aktuell/wofuer/#ist-das-dms-etwas-fur-mich) – mit dem [5-Minuten-Test](https://motom001.github.io/dms/benutzer/aktuell/wofuer/#der-5-minuten-test).

## Was du davon hast

- **Schnell wiederfinden:** Die Suche findet Wörter auch in gescannten Papieren.
- **Keine Frist verpassen:** Kündigungsfristen, Garantien und eigene Erinnerungen landen rechtzeitig unter „Zu erledigen“.
- **Post schnell ablegen:** Hochladen, am Handy fotografieren, aus einem E-Mail-Postfach oder vom Scanner über einen Eingangsordner.
- **Gemeinsam mit der Familie:** Jeder hat ein eigenes Konto und sieht, was er sehen soll.
- **Sicher aufgehoben:** Verschlüsselte Sicherungen, ein Notfallblatt zum Ausdrucken und eine Probe-Wiederherstellung, die zeigt, dass die Sicherung auch funktioniert.
- **Deine Daten gehören dir:** Alles lässt sich jederzeit in offenen Formaten exportieren und ist auch ohne das DMS lesbar.

## So kommst du an ein DMS

| Du hast … | So geht es |
| --- | --- |
| einen Heimserver mit **umbrelOS, ZimaOS oder CasaOS** | aus dem [DMS App Store](https://github.com/motom001/dms-appstore) mit einem Klick: [umbrelOS](https://motom001.github.io/dms/installieren/aktuell/umbrel/), [ZimaOS](https://motom001.github.io/dms/installieren/aktuell/zimaos/), [CasaOS](https://motom001.github.io/dms/installieren/aktuell/casaos/) |
| ein **NAS** von Synology, UGREEN, QNAP, TrueNAS oder Unraid | eine fertige Vorlage in die Docker-Oberfläche einfügen: [Anleitungen](https://motom001.github.io/dms/installieren/aktuell/) |
| einen **PC, Raspberry Pi oder Server mit Docker** | [Docker Compose](https://motom001.github.io/dms/installieren/aktuell/docker/) oder, zum Ausprobieren, [ein einziger Container](https://motom001.github.io/dms/installieren/aktuell/komplett/) |

Alle Wege im Überblick: **[Wie komme ich an ein DMS?](https://motom001.github.io/dms/installieren/aktuell/)**

## Was das DMS nicht ist

- **Kein Cloud-Dienst.** Es läuft bei dir zu Hause; es gibt keinen Anbieter, der deine Unterlagen sieht.
- **Keine Lizenzkosten**, kein Abo. Wer möchte, unterstützt freiwillig.
- **Kein „GoBD-zertifiziertes“ Archiv.** Für Selbständige gibt es einen Archivmodus und eine Vorlage für die Verfahrensdokumentation – Werkzeuge, kein Zertifikat.
- **Nicht für große Unternehmen gebaut.**

## Für Bastler und Administratoren

- **Mappentypen selbst gestalten:** Felder, Verweise, Register, Titel-Vorlagen und Trefferlisten – in der Werkbank, ohne Programmieren. Fertige **Pakete** aus dem [Paketkatalog](https://github.com/motom001/dms-registry).
- **Post** aus Postfächern (IMAP) und einem Eingangsordner, **Versionierung** von Dokumenten, **erweiterte Suche** über Felder und Volltext.
- **Berechtigungen** je Mappentyp und Ansicht mit Regeln und Testlauf; **Zwei-Faktor-Anmeldung** und **Anmeldung über einen Anbieter** (OpenID Connect).
- **Archivmodus** mit Löschsperre bis Fristende, **Werkbank anpassen** mit den Vorlagen Haushalt, Organisation und Alles.
- **Konsole** `dms` im Container für Notfall und Betrieb, **Schnittstelle** `/api/v1` mit API-Schlüsseln.
- Ein Image für **amd64 und arm64**, öffentlich unter `ghcr.io/motom001/dms`.

## Handbücher

- **[Wofür ein DMS?](https://motom001.github.io/dms/benutzer/aktuell/wofuer/)** – wann es im Alltag hilft, mit Selbstcheck.
- **[Wie komme ich an ein DMS?](https://motom001.github.io/dms/installieren/aktuell/)** – installieren auf Heimserver, NAS oder jedem Rechner mit Docker.
- **[Benutzerhandbuch](https://motom001.github.io/dms/benutzer/aktuell/)** – arbeiten in der Ablage: Mappen, Dokumente, Suche, Aufgaben, Profil.
- **[Administratorhandbuch](https://motom001.github.io/dms/admin/aktuell/)** – Einrichtung und Betrieb, Aktualisieren und Sichern, Werkbank, Fehlersuche, API.
- **[Entwicklerhandbuch](https://motom001.github.io/dms/entwickler/aktuell/)** – mitmachen: Arbeitsweise, Aufbau, Pakete und Release.

Im DMS führt **Hilfe** im Menü unter dem eigenen Namen dorthin. Was in welcher Version dazukam, steht in den **[Releases](https://github.com/motom001/dms/releases)**.

## Schnellstart mit Docker Compose

Das Image `ghcr.io/motom001/dms` ist öffentlich – eine Anmeldung bei der Registry ist nicht nötig.

1. Die Vorlage [`deploy/nas/docker-compose.yml`](deploy/nas/docker-compose.yml) als Compose-Projekt anlegen und die Pfade anpassen (Ordner `postgres`, `files`, `geheim` und `sicherung`).
2. Daneben eine Datei `.env` mit `DB_PASSWORD=<langes zufälliges Passwort>` ablegen.
3. Starten und `http://<NAS>:8080` aufrufen. Ein Assistent führt durch die Einrichtung: Einrichtungscode (steht im Protokoll des Containers und in `geheim/EINRICHTUNGSCODE`), Datenbank, dann **Neu einrichten** oder **Aus einer Sicherung wiederherstellen**, Name des Haushalts, Administrator, erster Benutzer, Schlüssel und Notfallblatt.

`ghcr.io/motom001/dms:main` folgt jedem Stand auf `main`; mit einer Versionsnummer, also `ghcr.io/motom001/dms:<Version>` mit einer Nummer aus den [Releases](https://github.com/motom001/dms/releases), bleibt die Installation auf einem Release. Alles Weitere steht im Administratorhandbuch unter [Einrichtung und Betrieb](https://motom001.github.io/dms/admin/aktuell/installation/) und [Aktualisieren und Sichern](https://motom001.github.io/dms/admin/aktuell/aktualisieren/).

## Sicherheit und Offenheit

Das DMS verwaltet persönliche Dokumente – deshalb ist alles offen nachprüfbar: der Quellcode, wie gebaut wird und was dabei geprüft wird. Automatisch geprüft werden unser Code (CodeQL), die Bibliotheken (Dependabot, `npm audit`), die fertigen Images (Trivy) und versehentlich eingecheckte Geheimnisse (Secret Scanning mit Push-Schutz). Jedes Image trägt einen signierten **Herkunftsnachweis** und eine **Stückliste** (SBOM); wie man das prüft und wie man eine Lücke **vertraulich meldet**, steht in [SECURITY.md](SECURITY.md). Die [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/motom001/dms) bewertet regelmäßig und öffentlich, wie das Projekt mit Sicherheit umgeht.

## Wünsche und Fehler

Als [Issue](https://github.com/motom001/dms/issues/new/choose) im Format einer User Story mit Akzeptanzkriterien. Umgesetzt wird, was der Maintainer mit dem Label `freigegeben` versieht. Wie Mitarbeit läuft, steht in [CONTRIBUTING.md](CONTRIBUTING.md) und im [Entwicklerhandbuch](https://motom001.github.io/dms/entwickler/aktuell/).

## Entwicklung

Voraussetzungen: Node.js 24 (LTS), Docker.

```sh
npm install
docker compose up db            # nur die Datenbank
DATABASE_URL=postgres://dms:dms@localhost:5432/dms npm run dev -w server
npm run dev -w web              # Oberfläche auf http://localhost:5173
```

Tests: `npm test`. Aufbau, Tests gegen PostgreSQL, Pakete und der Weg zum Release stehen im [Entwicklerhandbuch](https://motom001.github.io/dms/entwickler/aktuell/).

**Neue Version:** Versionsnummer in den drei `package.json` erhöhen und `docs/releases/v<version>.md` schreiben – Release, Image, Handbuch und das Bildschirmfoto oben entstehen nach dem Merge automatisch. Dabei kurz prüfen, ob „Was du davon hast“, „Für Bastler und Administratoren“ und der Schnellstart noch stimmen; alles Ausführliche gehört ins Handbuch, nicht hierher.

Wichtig: **Keine echten Dokumente oder persönlichen Daten committen** – nur Code und Beispieldaten.

## Unterstützen

Das DMS ist und bleibt frei nutzbar. Wer die Entwicklung freiwillig unterstützen möchte, kann das über [GitHub Sponsors](https://github.com/sponsors/motom001) tun – einmalig oder monatlich, mit frei gewähltem Betrag. Spenden von persönlichen GitHub-Konten kommen ohne Abzüge an. In der Anwendung steht der Hinweis nur in der Werkbank, nicht in der Ablage.

### So finanziert sich das Projekt

Die Entwicklung kostet Zeit und Geld – für Testgeräte, Server und Werkzeuge. Ein Teil davon soll durch freiwillige Unterstützung wieder hereinkommen, ohne dass die Software je etwas kostet oder Bedingungen stellt:

- **Spenden** über GitHub Sponsors sind der bevorzugte Weg: freiwillig, offen und ohne Gegenleistung.
- **Testgeräte** nehme ich gern an, etwa von Herstellern von NAS- und Mini-Servern. Wer mir ein Gerät stellt, bekommt meine ehrliche Meinung – auch die kritische – und kauft damit keine Empfehlung.
- **Empfehlungen** spreche ich nur für Geräte aus, die ich selbst nutze oder getestet habe, und begründe sie. Sollte ich je Partnerlinks verwenden, sind sie direkt am Link als solche gekennzeichnet, ändern nichts am Preis und haben keinen Einfluss auf meine Bewertung. In der Anwendung selbst gibt es keine Werbung und keine Partnerlinks.

## Lizenz

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only).

Jeder darf das DMS nutzen, verändern und weitergeben. Wer eine veränderte Fassung weitergibt oder anderen über ein Netzwerk zur Nutzung anbietet, muss deren Quellcode unter derselben Lizenz zugänglich machen.
