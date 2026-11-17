# Ablago

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/marke/ablago-logo-mit-schriftzug-dunkel.svg">
  <img src="docs/marke/ablago-logo-mit-schriftzug.svg" alt="Ablago" width="240">
</picture>

*Ablago – Dokumentenablage für zu Hause und kleine Betriebe*

**Deutsch** · [English](README.en.md)

<!-- Abzeichen (#252): Zeile 1 Stand, Zeile 2 Sicherheit, Zeile 3 Offenheit. -->
[![Release](https://img.shields.io/github/v/release/motom001/dms?label=Release&sort=semver)](https://github.com/motom001/dms/releases/latest)
[![Prüfungen](https://img.shields.io/github/actions/workflow/status/motom001/dms/image.yml?branch=main&label=Pr%C3%BCfungen)](https://github.com/motom001/dms/actions/workflows/image.yml)
[![Handbuch](https://img.shields.io/github/actions/workflow/status/motom001/dms/handbuch.yml?branch=main&label=Handbuch)](https://help.ablago.app/)<br>
[![CodeQL](https://github.com/motom001/dms/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/motom001/dms/security/code-scanning?query=tool%3ACodeQL)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/motom001/dms/badge)](https://scorecard.dev/viewer/?uri=github.com/motom001/dms)
[![Sicherheit](https://img.shields.io/badge/Sicherheit-SECURITY.md-2ea44f)](SECURITY.md)<br>
[![Lizenz](https://img.shields.io/badge/Lizenz-Apache--2.0-blue)](LICENSE)
[![Unterstützen](https://img.shields.io/badge/Unterst%C3%BCtzen-GitHub_Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/motom001)

**Deine Unterlagen an einem Ort, zu Hause und im kleinen Betrieb – selbst gehostet, kostenlos, deine Daten bleiben bei dir.**

Statt loser Dateien in Ordnern legst du **Mappen** an: für den Vertrag, die Rechnung, die Heizung, den Handwerker. Mappen verweisen aufeinander. So findest du von der Heizung den Wartungsvertrag, von dort jede Rechnung und den Handwerker, der sie gestellt hat. Und an die Kündigungsfrist erinnert dich Ablago rechtzeitig.

<!-- Bildschirmfoto aus dem Handbuch-Workflow (#290): wird mit jedem Release neu aufgenommen, nur Beispieldaten. -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://help.ablago.app/benutzer/aktuell/bilder/readme-dunkel.png">
  <img alt="Die Ablage von Ablago: links die Ansichten, in der Mitte die Liste, rechts eine geöffnete Mappe mit Angaben und Dokumenten" src="https://help.ablago.app/benutzer/aktuell/bilder/readme.png">
</picture>

## Für wen?

<img alt="Für wen Ablago gebaut ist: Kernfokus Familien, Fokus auch für Eltern-Sorgende, Vermieter, Selbständige und Kleinbetriebe, unterstützt der Mittelstand, nicht im Fokus Großunternehmen" src="docs/handbuch/benutzer/docs/grafiken/personas-skala.svg" width="100%">

Ablago ist für **Familien** gebaut und für **Selbständige und kleine Betriebe**. Es passt auch gut, wenn du dich **um deine Eltern kümmerst** oder **ein paar Wohnungen vermietest**. Den **Mittelstand** unterstützen wir, für **Konzerne** ist Ablago nicht gemacht. Warum Selbständige und kleine Betriebe seit November 2026 zum Fokus gehören: Viele Funktionen helfen genau ihnen schon heute (Archivmodus, Verfahrensdokumentation, Rechte je Rolle, Postfächer, Vertretung, Anmeldung über einen Anbieter, Automatisierungen), und die Lasttests zeigen, dass Ablago deutlich größere Installationen verkraftet ([Was Ablago verkraftet](https://help.ablago.app/admin/aktuell/verkraftet/)). Im Zweifel gewinnt weiter die Einfachheit für Familien.

Ob es zu dir passt, zeigt [Ist Ablago etwas für mich?](https://help.ablago.app/benutzer/aktuell/wofuer/#ist-das-dms-etwas-fur-mich) – mit dem [5-Minuten-Test](https://help.ablago.app/benutzer/aktuell/wofuer/#der-5-minuten-test).

## Was du davon hast

- **Schnell wiederfinden:** Die Suche findet Wörter auch in gescannten Papieren.
- **Keine Frist verpassen:** Kündigungsfristen, Garantien und eigene Erinnerungen landen rechtzeitig unter „Zu erledigen“.
- **Post schnell ablegen:** Hochladen, am Handy fotografieren, aus einem E-Mail-Postfach oder vom Scanner über einen Eingangsordner.
- **Gemeinsam mit der Familie:** Jeder hat ein eigenes Konto und sieht, was er sehen soll.
- **Sicher aufgehoben:** Verschlüsselte Sicherungen, ein Notfallblatt zum Ausdrucken und eine Probe-Wiederherstellung, die zeigt, dass die Sicherung auch funktioniert.
- **Deine Daten gehören dir:** Alles lässt sich jederzeit in offenen Formaten exportieren und ist auch ohne Ablago lesbar.

## Datenschutz eingebaut

Ablago ist auf Datenschutz ausgelegt (Art. 25 DSGVO) – für die Daten deiner Familie genauso wie für Mieter und Kunden:

- **Keine Telemetrie:** Ablago sendet keine Nutzungsdaten, auch keine anonymen und auch nicht regelmäßig. Von sich aus baut es keine Verbindung ins Internet auf; den Versionsabgleich mit GitHub startest du selbst per Knopfdruck.
- **Selbst gehostet:** Deine Unterlagen liegen auf deinem Gerät – kein Tracking, keine Werbung, keine KI im Kern. KI-Funktionen kommen als Pakete und laufen lokal; ein externer KI-Dienst wird nur angebunden, wenn du ihn ausdrücklich als Paket installierst. Wer was sieht, regeln Rechte je Mappentyp.
- **Auskunft nach Art. 15:** Alles zu einem Mieter, Kunden oder Kontakt als ZIP mit Deckblatt – geprüft, geschwärzt, mit Nachweis.
- **Aufbewahren, sperren, löschen:** Archivmodus mit Löschsperre bis Fristende, die Liste „Darf weg“ und ein Papierkorb – Bausteine für dein Löschkonzept, mit Vorlage.
- **Daten mitnehmen:** Jeder Benutzer exportiert seine eigenen Daten, Administratoren alles – in offenen Formaten.

Software allein macht noch keinen Datenschutz – dazu gehören deine Abläufe. Was Ablago dafür bietet und was du selbst regelst: **[Datenschutz in Ablago](https://help.ablago.app/admin/aktuell/datenschutz/)**.

## So kommst du an ein DMS

| Du hast … | So geht es |
| --- | --- |
| einen Heimserver mit **umbrelOS, ZimaOS oder CasaOS** | aus dem [Ablago App Store](https://github.com/motom001/dms-appstore) mit einem Klick: [umbrelOS](https://help.ablago.app/installieren/aktuell/umbrel/), [ZimaOS](https://help.ablago.app/installieren/aktuell/zimaos/), [CasaOS](https://help.ablago.app/installieren/aktuell/casaos/) |
| ein **NAS** von Synology, UGREEN, QNAP, TrueNAS oder Unraid | eine fertige Vorlage in die Docker-Oberfläche einfügen: [Anleitungen](https://help.ablago.app/installieren/aktuell/) |
| einen **PC, Raspberry Pi oder Server mit Docker** | [Docker Compose](https://help.ablago.app/installieren/aktuell/docker/) oder, zum Ausprobieren, [ein einziger Container](https://help.ablago.app/installieren/aktuell/komplett/) |
| **keinen eigenen Server** | [Ohne eigenen Server: Ablago bei einem Anbieter](https://help.ablago.app/installieren/aktuell/anbieter/) – drei Wege und eine Checkliste, worauf du beim Anbieter achtest |

Alle Wege im Überblick: **[Wie komme ich an ein DMS?](https://help.ablago.app/installieren/aktuell/)**

## Was Ablago nicht ist

- **Kein Cloud-Dienst.** Es läuft bei dir zu Hause – oder, wenn du willst, bei einem Anbieter, den du selbst wählst. Das Projekt betreibt keinen Dienst, der deine Unterlagen sieht.
- **Keine Lizenzkosten**, kein Abo. Wer möchte, unterstützt freiwillig.
- **Kein „GoBD-zertifiziertes“ Archiv.** Für Selbständige gibt es einen Archivmodus und eine Vorlage für die Verfahrensdokumentation – Werkzeuge, kein Zertifikat.
- **Nicht für große Unternehmen gebaut.**

## Für Bastler und Administratoren

- **Mappentypen selbst gestalten:** Felder, Verweise, Register, Titel-Vorlagen und Trefferlisten – in der Werkbank, ohne Programmieren. Fertige **Pakete** aus dem [Paketkatalog](https://github.com/motom001/dms-registry).
- **Post** aus Postfächern (IMAP) und einem Eingangsordner, **Versionierung** von Dokumenten, **erweiterte Suche** über Felder und Volltext.
- **Berechtigungen** je Mappentyp und Ansicht mit Regeln und Testlauf; **Zwei-Faktor-Anmeldung** und **Anmeldung über einen Anbieter** (OpenID Connect).
- **Archivmodus** mit Löschsperre bis Fristende, **Werkbank anpassen** mit den Vorlagen Haushalt, Betrieb und Alles.
- **Konsole** `dms` im Container für Notfall und Betrieb, **Schnittstelle** `/api/v1` mit API-Schlüsseln.
- Ein Image für **amd64 und arm64**, öffentlich unter `ghcr.io/motom001/dms`.

## Handbücher

- **[Wofür ein DMS?](https://help.ablago.app/benutzer/aktuell/wofuer/)** – wann es im Alltag hilft, mit Selbstcheck.
- **[Wie komme ich an ein DMS?](https://help.ablago.app/installieren/aktuell/)** – installieren auf Heimserver, NAS oder jedem Rechner mit Docker.
- **[Benutzerhandbuch](https://help.ablago.app/benutzer/aktuell/)** – arbeiten in der Ablage: Mappen, Dokumente, Suche, Aufgaben, Profil.
- **[Administratorhandbuch](https://help.ablago.app/admin/aktuell/)** – Einrichtung und Betrieb, Aktualisieren und Sichern, Werkbank, Fehlersuche, API.
- **[Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/)** – mitmachen: Arbeitsweise, Aufbau, Pakete und Release.

In Ablago führt **Hilfe** im Menü unter dem eigenen Namen dorthin. Was in welcher Version dazukam, steht in den **[Releases](https://github.com/motom001/dms/releases)**.

## Schnellstart mit Docker Compose

Das Image `ghcr.io/motom001/dms` ist öffentlich – eine Anmeldung bei der Registry ist nicht nötig.

1. Die Vorlage [`deploy/nas/docker-compose.yml`](deploy/nas/docker-compose.yml) als Compose-Projekt anlegen und die Pfade anpassen (Ordner `postgres`, `files`, `geheim` und `sicherung`).
2. Daneben eine Datei `.env` mit `DB_PASSWORD=<langes zufälliges Passwort>` ablegen.
3. Starten und `http://<NAS>:8080` aufrufen. Ein Assistent führt durch die Einrichtung: Einrichtungscode (steht im Protokoll des Containers und in `geheim/EINRICHTUNGSCODE`), Datenbank, dann **Neu einrichten** oder **Aus einer Sicherung wiederherstellen**, Name deiner Ablage, Administrator, erster Benutzer, Schlüssel und Notfallblatt.

Welches Image-Tag (gilt ebenso für `ghcr.io/motom001/dms-komplett`):

| Tag | Zeigt auf | Für wen |
|---|---|---|
| `:stabil` | die geprüfte Version, wandert einmal pro Woche | Standard in allen Vorlagen |
| `:latest` | die zuletzt veröffentlichte Version, wandert mit jedem Release | wer immer das Neueste möchte |
| `:<Version>` | genau diese Version, z. B. `:0.290.14` aus den [Releases](https://github.com/motom001/dms/releases) | wer selbst entscheidet, wann aktualisiert wird |
| `:main` | jeden Stand auf `main`, auch ohne Release | nur zum Testen |

Ohne Tag nimmt Docker `:latest`. Nicht verwechseln: Die Markierung „Latest“ bei den Releases auf GitHub trägt die stabile Version (`:stabil`), das Image-Tag `:latest` die neueste. Alles Weitere steht im Administratorhandbuch unter [Einrichtung und Betrieb](https://help.ablago.app/admin/aktuell/installation/) und [Aktualisieren und Sichern](https://help.ablago.app/admin/aktuell/aktualisieren/#image-tag).

## Sicherheit und Offenheit

Ablago verwaltet persönliche Dokumente – deshalb ist alles offen nachprüfbar: der Quellcode, wie gebaut wird und was dabei geprüft wird. Automatisch geprüft werden unser Code (CodeQL), die Bibliotheken (Dependabot, `npm audit`), die fertigen Images (Trivy) und versehentlich eingecheckte Geheimnisse (Secret Scanning mit Push-Schutz). Jedes Image trägt einen signierten **Herkunftsnachweis** und eine **Stückliste** (SBOM); wie man das prüft und wie man eine Lücke **vertraulich meldet**, steht in [SECURITY.md](SECURITY.md). Die [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/motom001/dms) bewertet regelmäßig und öffentlich, wie das Projekt mit Sicherheit umgeht.

## Wünsche und Fehler

Als [Issue](https://github.com/motom001/dms/issues/new/choose) im Format einer User Story mit Akzeptanzkriterien – auf Deutsch oder Englisch. Umgesetzt wird, was der Maintainer mit dem Label `freigegeben` versieht. Was als Nächstes kommt und in welcher Reihenfolge, steht im [Fahrplan](ROADMAP.md). Wie Mitarbeit läuft, steht in [CONTRIBUTING.md](CONTRIBUTING.md) und im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/).

## Mitmachen

Du nutzt Ablago? **[Erzähl uns, wie](https://github.com/motom001/dms/issues/new?template=ich-nutze-das-dms.yml)** – freiwillig, mit einem kurzen Formular, alle Felder optional. Was andere erzählen, steht unter **[Wer nutzt Ablago?](https://github.com/motom001/dms/issues?q=label%3Anutzt-das-dms)**. Ablago selbst meldet nichts: keine Telemetrie, auch nicht anonym.

## Entwicklung

Voraussetzungen: Node.js 24 (LTS), Docker.

```sh
npm install
docker compose up db            # nur die Datenbank
DATABASE_URL=postgres://dms:dms@localhost:5432/dms npm run dev -w server
npm run dev -w web              # Oberfläche auf http://localhost:5173
```

Tests: `npm test`. Aufbau, Tests gegen PostgreSQL, Pakete und der Weg zum Release stehen im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/).

**Neue Version:** Versionsnummer in den drei `package.json` erhöhen und `docs/releases/v<version>.md` schreiben – Release, Image, Handbuch und das Bildschirmfoto oben entstehen nach dem Merge automatisch. Dabei kurz prüfen, ob „Was du davon hast“, „Für Bastler und Administratoren“ und der Schnellstart noch stimmen – in beiden Sprachfassungen dieser README; alles Ausführliche gehört ins Handbuch, nicht hierher.

Wichtig: **Keine echten Dokumente oder persönlichen Daten committen** – nur Code und Beispieldaten.

## Unterstützen

Ablago ist und bleibt frei nutzbar. Wer die Entwicklung freiwillig unterstützen möchte, kann das über [GitHub Sponsors](https://github.com/sponsors/motom001) tun – einmalig oder monatlich, mit frei gewähltem Betrag. Spenden von persönlichen GitHub-Konten kommen ohne Abzüge an. In der Anwendung steht der Hinweis nur in der Werkbank, nicht in der Ablage.

### So finanziert sich das Projekt

Die Entwicklung kostet Zeit und Geld – für Testgeräte, Server und Werkzeuge. Ein Teil davon soll durch freiwillige Unterstützung wieder hereinkommen, ohne dass die Software je etwas kostet oder Bedingungen stellt:

- **Spenden** über GitHub Sponsors sind der bevorzugte Weg: freiwillig, offen und ohne Gegenleistung.
- **Testgeräte** nehme ich gern an, etwa von Herstellern von NAS- und Mini-Servern. Wer mir ein Gerät stellt, bekommt meine ehrliche Meinung – auch die kritische – und kauft damit keine Empfehlung.
- **Empfehlungen** spreche ich nur für Geräte aus, die ich selbst nutze oder getestet habe, und begründe sie. Sollte ich je Partnerlinks verwenden, sind sie direkt am Link als solche gekennzeichnet, ändern nichts am Preis und haben keinen Einfluss auf meine Bewertung. In der Anwendung selbst gibt es keine Werbung und keine Partnerlinks.

## Lizenz

[Apache License 2.0](LICENSE) (Apache-2.0), Hinweise in [NOTICE](NOTICE). Versionen bis einschließlich 0.92.0 stehen unter der GNU Affero General Public License v3.0 (AGPL-3.0-only).

Jeder darf Ablago nutzen, verändern und weitergeben – auch in eigenen Produkten. Wer es weitergibt, legt die Lizenz und die Hinweise aus NOTICE bei und kennzeichnet geänderte Dateien. Den Quellcode einer veränderten Fassung offenzulegen ist nicht Pflicht.
