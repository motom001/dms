# Ohne eigenen Server: das DMS bei einem Anbieter

Du hast kein NAS und keinen Heimserver und möchtest auch keinen betreiben? Dann kannst du das DMS bei einem **Anbieter** laufen lassen: Du mietest Rechenleistung und Speicher in einem Rechenzentrum, das DMS läuft dort, und du erreichst es im Browser von überall. Deine Unterlagen liegen dann nicht mehr bei dir zu Hause, sondern bei diesem Anbieter – darum lohnt es sich, ihn sorgfältig auszuwählen.

Diese Seite nennt **keine Anbieter**, sondern **Merkmale, die du prüfst**. Anbieter und Preise ändern sich schnell; eine Liste wäre bald veraltet und sähe nach Werbung aus. Mit der Checkliste unten kannst du jedes Angebot selbst einschätzen.

!!! info "Das DMS bleibt dasselbe"
    Das DMS bei einem Anbieter ist dasselbe DMS wie auf dem NAS: dasselbe Image, dieselben Sicherungen, derselbe Vollexport. Ein Umzug nach Hause – oder zu einem anderen Anbieter – geht jederzeit über **Sicherung und Wiederherstellung**, siehe [Wachsen und umziehen](https://motom001.github.io/dms/admin/aktuell/wachsen/).

## Drei Wege

| | **Fertige App** | **Docker-Plattform** | **Eigener vServer** |
| --- | --- | --- | --- |
| **Was du mietest** | eine App aus dem Katalog des Anbieters, mit einem Klick gestartet | Container-Betrieb: Du gibst das Image an, der Anbieter betreibt den Server | einen kleinen virtuellen Server, auf dem du selbst Docker installierst |
| **Aufwand** | ☆ sehr gering | ☆☆ gering | ☆☆☆ mittel: Linux, Updates und Firewall machst du selbst |
| **Kosten** (Größenordnung) | wenige Euro im Monat | etwa 5 bis 20 € im Monat | etwa 4 bis 15 € im Monat |
| **Für wen** | alle, die nichts einrichten wollen | wer Container kennt, aber keinen Server pflegen will | wer selbst bestimmen will und mit der Kommandozeile zurechtkommt |
| **Anleitung** | die des Anbieters | [dms-komplett](komplett.md) oder [Docker Compose](docker.md) | [Docker Compose](docker.md) |

Kosten grob, Stand November 2026, jeweils mit etwa 2 GB Arbeitsspeicher und 20–40 GB Speicher; mehr Speicher für viele Dokumente kostet meist ein paar Euro im Monat extra.

### Fertige App

Manche Anbieter haben einen Katalog fertiger Open-Source-Apps: aussuchen, Tarif wählen, starten – Updates, Sicherungen und HTTPS übernimmt der Anbieter.

- **Ob es das DMS dort gibt,** siehst du im App-Katalog des Anbieters. Bisher bietet das Projekt das DMS keinem Anbieter selbst an; gibt es keine fertige App, nimm einen der beiden anderen Wege.
- **Achte darauf,** dass du an die Ordner `sicherung` und `geheim` herankommst (Dateizugriff, SFTP oder Ähnliches). Ohne das bleibt dir nur der [Vollexport](https://motom001.github.io/dms/admin/aktuell/export/), den das DMS als ZIP zum Herunterladen anbietet – zum Mitnehmen gut, zum Wiederherstellen in ein anderes DMS nicht.

### Docker-Plattform

Plattformen für Container betreiben den Server für dich; du gibst nur an, welches Image laufen soll, und bekommst eine Adresse mit HTTPS.

- **Einfachster Weg:** ein Container mit [`ghcr.io/motom001/dms-komplett`](komplett.md) – DMS und Datenbank zusammen, ohne Passwort. Viele Plattformen erlauben nur einen Container oder machen einen zweiten umständlich; genau dafür ist `dms-komplett` gedacht.
- **Mit zwei Containern** (`dms` und `postgres:17`), wenn die Plattform Compose-Projekte oder mehrere Dienste kann: wie unter [Docker Compose](docker.md).
- **Dauerhafter Speicher ist Pflicht:** Die Ordner `/data/files`, `/data/geheim`, `/data/sicherung` und `/data/postgres` müssen auf Volumes liegen, die einen Neustart und ein Update überleben. Sonst sind deine Daten beim nächsten Update weg.
- **Port:** Das DMS lauscht im Container auf `3000`.

### Eigener vServer

Ein kleiner virtueller Server mit Linux ist wie ein PC im Rechenzentrum: Du installierst Docker und richtest das DMS mit Docker Compose ein – genau wie unter [Jeder Server mit Docker](docker.md) bzw. [PC oder Mini-PC mit Linux](linux.md).

- **Größe:** 2 GB Arbeitsspeicher (das DMS braucht etwa 1 GB) und so viel Speicher, wie deine Dokumente und Sicherungen brauchen. amd64 oder arm64 gehen beide.
- **Selbst zuständig** bist du für Updates des Betriebssystems, eine Firewall (nur Ports 80 und 443 offen, dazu SSH möglichst nur mit Schlüssel) und HTTPS über einen [Reverse-Proxy](https://motom001.github.io/dms/admin/aktuell/installation/#hinter-einem-reverse-proxy).
- **Datenbank-Port nie nach außen:** Die Vorlagen geben PostgreSQL keinen Port nach außen – lass das so.

## Merkmale zum Prüfen

Hake ab, bevor du dich entscheidest:

**Ort und Recht**

- [ ] **Rechenzentrum in Deutschland oder der EU** – du kannst den Standort beim Bestellen wählen oder er steht fest.
- [ ] **Firmensitz in der EU** – dann gilt die DSGVO unmittelbar, und der Zugriff von Behörden außerhalb der EU ist weniger ein Thema.
- [ ] **Vertrag zur Auftragsverarbeitung (AV-Vertrag)** nach Art. 28 DSGVO wird angeboten, am besten zum Abschließen im Kundenkonto. Für einen reinen Privathaushalt nicht nötig – für **Vermieter, Selbständige und Betriebe**, die Daten von Mietern oder Kunden ablegen, **Pflicht**.

**Vertrauen**

- [ ] **Seit Jahren am Markt**, mit vollständigem **Impressum** und erreichbarem **Support** (E-Mail oder Telefon, Antwort in vertretbarer Zeit – probier es vor dem Bestellen mit einer Frage aus).
- [ ] **Bewertungen** auf Portalen (z. B. hosttest, Trustpilot) sind überwiegend gut und beschreiben, wie der Anbieter mit Problemen umgeht. **Wenige Bewertungen sagen wenig aus**, ebenso lauter überschwängliche.

**Technik**

- [ ] **Docker möglich** – beim vServer selbstverständlich, bei Plattformen und fertigen Apps nachfragen.
- [ ] **Dauerhafter Speicher** für Daten und Datenbank (Volumes), groß genug für deine Dokumente plus Sicherungen, und später erweiterbar.
- [ ] **Sicherungen beim Anbieter** (Snapshots oder Backups), zusätzlich zu den Sicherungen des DMS.
- [ ] **HTTPS** mit eigenem Zertifikat, bei Plattformen und Apps eingebaut.

**Ausstieg**

- [ ] **Monatlich kündbar**, ohne lange Mindestlaufzeit.
- [ ] **Daten jederzeit exportierbar:** Du kommst an die Ordner des DMS heran – vor allem an die [Sicherungen](https://motom001.github.io/dms/admin/aktuell/sicherung/) im Ordner `sicherung` –, und der [Vollexport](https://motom001.github.io/dms/admin/aktuell/export/) lässt sich als ZIP herunterladen.

## Du vertraust dem Anbieter deine Daten an

Wer bei einem Anbieter hostet, gibt ihm seine Unterlagen in die Hand – wie beim Steuerberater oder bei einem Cloudspeicher. Das ist eine **Vertrauensbeziehung**, keine technische Garantie:

- **Dokumente und Datenbank liegen beim Anbieter auf dessen Speicher** – so wie auf deinem NAS, nicht zusätzlich verschlüsselt. Wer Zugriff auf den Server hat, kann sie technisch lesen. Darum zählen Ort, Recht und Ruf des Anbieters.
- **Verschlüsselt** sind die [Geheimnisse im DMS](https://motom001.github.io/dms/admin/aktuell/verschluesselung/) – Passwortfelder, Zugangsdaten zu Mailserver und Postfächern – und die Sicherungen. Der Schlüssel liegt aber im Ordner `geheim` auf demselben Server. Gegen einen Anbieter, der es darauf anlegt, schützt das nicht; es schützt Sicherungen und Datenbankkopien, die woanders landen.
- **Eigene Sicherungen außer Haus:** Kopiere den Ordner `sicherung` regelmäßig an einen anderen Ort – beim vServer z. B. mit `rsync` oder `scp`, bei Plattformen und Apps über deren Dateizugriff –, und bewahre das [Notfallblatt](https://motom001.github.io/dms/admin/aktuell/sicherung/#notfallblatt) getrennt davon auf. Ein **Vollexport** ab und zu gibt dir alles in offenen Formaten – auch, falls der Anbieter einmal verschwindet.
- **Zwei-Faktor-Anmeldung:** Dein DMS ist aus dem Internet erreichbar. Schreib die [Zwei-Faktor-Anmeldung](https://motom001.github.io/dms/admin/aktuell/anmeldeschutz/#zwei-faktor-anmeldung) mindestens für Administratoren vor; der [Anmeldeschutz](https://motom001.github.io/dms/admin/aktuell/anmeldeschutz/) sperrt Rateversuche.
- **Nur mit HTTPS:** Ruf das DMS nie über `http://` aus dem Internet auf. Trage unter [E-Mail und Adresse](https://motom001.github.io/dms/admin/aktuell/installation/#e-mail-und-adresse) die `https://`-Adresse ein.
- **Gleich einrichten:** Bei einem Anbieter ist das DMS meist sofort aus dem Internet erreichbar. Der [Einrichtungscode](https://motom001.github.io/dms/admin/aktuell/installation/#einrichtungscode) verhindert, dass ein Fremder es vor dir einrichtet – richte es trotzdem direkt nach dem Start ein.
- **Aktuell halten:** Spiel Updates des DMS zügig ein ([Aktualisieren](https://motom001.github.io/dms/admin/aktuell/aktualisieren/)); beim vServer auch die des Betriebssystems.

Was das DMS sonst für den Datenschutz mitbringt und was du als Verantwortlicher selbst regelst, steht unter [Datenschutz im DMS](https://motom001.github.io/dms/admin/aktuell/datenschutz/).

## Nach der Installation

Wie bei jedem anderen Weg: einrichten, Sicherung einschalten, loslegen – siehe [Nach der Installation](index.md#nach-der-installation).
