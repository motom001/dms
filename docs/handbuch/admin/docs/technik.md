# Technik von Ablago

Überblick für Betrieb und Support. Welche Versionen auf einem System tatsächlich laufen, zeigt die Werkbank unter **Technik** – dort lässt sich die Übersicht auch für ein GitHub-Issue kopieren.

## Bausteine

```
Browser ── HTTP ──▶ Ablago-Container (Node.js) ──▶ PostgreSQL-Container
   React-Oberfläche        Fastify-API              Mappen, Typen, Benutzer,
   (im Image enthalten)    Dateien unter /data/…    Sitzungen, Protokolle
```

| Baustein | Technik | Wozu |
| --- | --- | --- |
| Oberfläche | React 19, gebaut mit Vite | Ablage, Werkbank, Mein Konto – alles im Browser |
| Server | Node.js 24, Fastify 5, TypeScript (mit esbuild gebündelt) | Schnittstelle unter `/api`, liefert auch die Oberfläche aus |
| Datenbank | PostgreSQL 17, Zugriff mit postgres.js, SQL-Migrationen in `server/migrations` | Alle Daten außer den Dateien |
| Dateien | Feste Ordner `/data/files`, `/data/geheim`, `/data/sicherung` (Volumes, siehe [Installation](installation.md#ordner-und-volumes)); je Datei ihr SHA-256 als Name; optional der [Eingangsordner](eingangsordner.md) `/eingang` | Hochgeladene Dokumente, gleicher Inhalt nur einmal; Schlüssel; Sicherungen; Scans zum Abholen |
| E-Mail | nodemailer über SMTP zum Versenden; imapflow und mailparser über IMAP zum Abholen (beides optional, eingestellt in der Werkbank) | Einladungen, Passwort-Links, Hinweise, Mappen versenden; Mails aus [Postfächern](postfaecher.md) als Post abholen |
| Volltext und Texterkennung | poppler (pdftotext, pdftoppm) im Image für die Textebene von PDFs; Texterkennung von Scans und Bildern als Paket **Texterkennung** (Tesseract als WebAssembly im Paket-Läufer, #459); Volltextsuche von PostgreSQL | Volltext von PDFs, Scans und Bildern (#45, #458) |
| PDF verkleinern | pdf-lib, pdftoppm (poppler) für die Bilder und qpdf (Apache-2.0) für die Struktur, beides im Image; kein Ghostscript | Große Scans kleiner machen (#393) |
| Schwärzen | pdftoppm und pdftotext (poppler) zum Rendern und für die Wortpositionen (nur Textebene, #459), pdf-lib zum Neuaufbau; kein MuPDF, kein Ghostscript (beide AGPL) | Stellen endgültig entfernen, Original bleibt (#392) |
| PDF bearbeiten | pdf-lib (MIT), nur über eine gemeinsame Stelle im Server gekapselt (#541); Bewertung der Alternativen im [Entwicklerhandbuch](https://help.ablago.app/entwickler/aktuell/aufbau/#pdf-stelle) | Stempel, Export, Seiten bearbeiten, Schwärzen, Verkleinern, Vorschau, Auskunft, Aufkleber |
| Schrift in eigenen PDFs | Noto Sans und Noto Sans Mono (SIL Open Font License 1.1, Lizenz in `server/schriften/OFL.txt` und `NOTICE`), eingebettet als Teilmenge mit `@pdf-lib/fontkit` (MIT); im Image 1,4 MB ([#826](https://help.ablago.app/entwickler/aktuell/aufbau/#pdf-schriften)) | Lateinisch (auch Türkisch, Polnisch, Tschechisch, Vietnamesisch), Griechisch und Kyrillisch richtig in Stempel, Brief, Export, Aufkleber, Textdokumenten und Notfallblatt |
| Arbeiter | `node:worker_threads`, ohne zusätzliche Bibliothek: ein kleiner Pool neben dem Hauptfaden (#542), siehe [Systemzustand](speicherplatz.md#arbeiter-fur-pdf-und-exporte) | PDF-Arbeiten und große Exporte, ohne dass andere Benutzer warten |
| Verschlüsselung | AES-256-GCM (Node.js crypto), Schlüssel als Datei unter `/data/geheim` | Gespeicherte Passwörter (#39, #46) |
| Passkeys | WebAuthn; geprüft mit `@simplewebauthn/server` (MIT), im Browser die eingebaute Schnittstelle; nur öffentliche Schlüssel in der Datenbank | Anmelden ohne Passwort, zweiter Faktor, erneute Anmeldung ([Passkeys](anmeldeschutz.md#passkeys), #811) |
| Image | `node:24-alpine`, mehrstufig gebaut, für amd64 und arm64 – jede Architektur auf einem eigenen, passenden Rechner von GitHub (ohne Emulation), danach zu einem Image zusammengeführt | Läuft auf dem NAS neben dem PostgreSQL-Image |
| dms-komplett | Dasselbe Image mit PostgreSQL 17 (Alpine-Paket) im selben Container; Datenbank im Ordner `/data/postgres` | Ablago und Datenbank in einem Container |
| Prüfungen | GitHub Actions: Typprüfung, Tests gegen PostgreSQL, Image-Bau | Jeder Push auf `main`, jeder Pull Request, jedes Versions-Tag und einmal pro Woche |

## Grenzen { #grenzen }

Wie groß etwas höchstens sein darf. Ablago prüft jede Grenze, bevor es die Daten verarbeitet; was größer ist, lehnt es mit einer Meldung ab (meist „413 – zu groß“). Im Quelltext stehen alle Grenzen an einer Stelle: `server/src/grenzen.ts`.

| Was | Höchstens |
| --- | --- |
| Dokument hochladen, ersetzen oder fotografieren | 100 MB |
| Datei für „Aus Dokument ausfüllen“ ohne Ablage | 30 MB |
| Texterkennung und Vorschau von Office-Dateien | 100 MB je Datei; größere bekommen keinen Volltext bzw. keine Vorschau |
| Anhänge einer E-Mail zusammen | 50 MB |
| Paket (Archiv und alle Dateien unter `code/` zusammen) | 128 MB |
| Sammeldatei | 256 MB, höchstens 50 Pakete |
| Katalog, Signatur und Schlüssel einer Paketquelle | 10 MB |
| Hochgeladene, noch nicht installierte Pakete | 30 Minuten; im Arbeitsspeicher zusammen 512 MB, darüber fallen die ältesten heraus |
| Fassung, Archivfassung und Vorschaubild von Paketen | 50 MB, 100 MB, 5 MB |
| Fehlermeldung (mit Bildschirmfoto und Anhängen) | 30 MB, das Bildschirmfoto 10 MB |
| Logo eines Designs | 1 MB |
| Einrichtungsdatei | 64 KB |
| [Aufruf von außen](automatisierungen.md#aufruf-von-aussen) | Inhalt 16 KB, 10 Parameter zu je 500 Zeichen; 30 Aufrufe je Minute aus einem Netz (IPv4 /24, IPv6 /64), 12 angenommene je Minute und Adresse; Fehlversuche: 12 je Minute und Adresse, 600 je Minute insgesamt |
| [URL aufrufen](automatisierungen.md#url-aufrufen) | 50 Ziele; Inhalt höchstens 256 KB, je Feldwert 8 KB Text, 10 Parameter zu je 500 Zeichen; 10 Sekunden je Aufruf; von der Antwort liest Ablago höchstens 64 KB und verwirft sie |
| [E-Mail senden](automatisierungen.md#e-mail-senden) | 50 Empfänger je Lauf, 50 Mails je Automatisierung und 200 für alle zusammen in 24 Stunden; Betreff 200, Text 4000 Zeichen |
| Passkeys | 20 je Person, Name 60 Zeichen, Antwort des Geräts 16 KB; Anmeldung ohne E-Mail-Adresse: 20 Herausforderungen je IP-Adresse bzw. IPv6-/64 in 5 Minuten, 20 000 offene insgesamt |
| E-Rechnung (XML als Datei oder aus dem PDF-Anhang) | 4 MB, höchstens 64 Ebenen tief, 200 000 Elemente, 500 Positionen werden übernommen; ohne DTD und Entitäten. Was darüber liegt, liest Ablago nicht als E-Rechnung |
| Alle anderen Anfragen (Formulare, Einstellungen) | 2 MB; eine Datei nehmen sie gar nicht an |

Ein Reverse-Proxy davor braucht eine eigene Grenze, die etwas darüber liegt, für nginx `client_max_body_size 260m;` (mit Sammeldateien) bzw. `130m` (ohne), siehe [Installation](installation.md#hinter-einem-reverse-proxy).

## Viele gleichzeitige Anfragen { #last }

Ein Haushalt hat 2–6 Benutzer, ein Kleinbetrieb 10–20. Ein Benutzer löst selbst schon mehrere Anfragen gleichzeitig aus (die Ablage öffnen sind 6–10), dazu kommen WebDAV-Programme, Pakete und Skripte. **100 gleichzeitige Anfragen** – etwa 10–15 Personen, die im selben Moment klicken – sind die realistische Obergrenze; dafür ist Ablago ausgelegt und wird regelmäßig gemessen (Lasttest in drei Stufen, #544, #563). Was welches Gerät verkraftet, steht unter [Was Ablago verkraftet](verkraftet.md); selbst messen kannst du mit dem [Lasttest](lasttest.md). Mehr kommt im Betrieb kaum vor, etwa bei einem falsch eingestellten WebDAV-Programm.

- **Überlastschutz:** Laufen schon **250** Anfragen gleichzeitig (`DMS_MAX_ANFRAGEN`), bekommt jede weitere sofort die Antwort „Ablago ist gerade sehr beschäftigt. Bitte versuche es in ein paar Sekunden noch einmal.“ (HTTP 503 mit `Retry-After: 5`) – statt in einer immer längeren Warteschlange zu hängen, bis Browser und Programme aufgeben. So bleiben Antwortzeiten und Arbeitsspeicher begrenzt, und Ablago erholt sich von selbst, sobald die Last nachlässt. Die Gesundheitsprüfung des Containers wird nie abgewiesen. Greift der Schutz, steht höchstens einmal je Minute „Überlast: …“ im [Protokoll](fehlersuche.md#protokoll) – als Hinweis mit der Zahl der Abweisungen, nicht als Fehler (#920); die einzelnen Anfragen mit 503 erscheinen dort nicht mehr.
- **Verbindungen zur Datenbank:** höchstens **10** gleichzeitig. Im Lasttest mit 100 gleichzeitigen Anfragen lagen 5, 10 und 20 Verbindungen gleichauf: Der Engpass ist die Rechenzeit, die sich Server und PostgreSQL teilen, nicht die Zahl der Verbindungen. Jede Verbindung kostet PostgreSQL etwa 5–10 MB Arbeitsspeicher. Erst mit deutlich mehr Kernen (oder PostgreSQL auf einem eigenen Rechner) können mehr helfen: `DMS_DB_VERBINDUNGEN` (2–100; PostgreSQL erlaubt in der Vorgabe 100 Verbindungen insgesamt). Mit [mehreren Prozessen](#mehrere-prozesse) gilt die Zahl für alle zusammen. Wie lange Abfragen auf eine freie Verbindung warten, zeigt **Werkbank → Datenbank-Anbindung** unter *Auslastung des Servers*. Seit #1198 zählt dazu eine eigene **Verbindung für Sperren** (siehe unten); der Pool für Anfragen und Arbeit hat eine weniger (in der Vorgabe 9).
- **Sperren auf einer eigenen Verbindung (#1198):** Zeitpläne (Papierkorb, Fristen, Notfallkontakte …), das Installieren von Paketen, Eingangsordner, Postfächer und das Lebenszeichen nehmen Sitzungssperren in PostgreSQL. Vorher hielt jede davon eine Verbindung aus dem Pool fest, solange ihre Arbeit lief – trafen viele Zeitpläne zur selben Sekunde zusammen, war der Pool voll, jede Arbeit wartete auf eine Verbindung, und Ablago hing still. Jetzt laufen alle Sperren eines Prozesses über **eine** eigene Verbindung; die Arbeit selbst hält keine fest. Reißt diese Verbindung ab, warnt das Protokoll („Verbindung für Sperren abgebrochen“), laufende Arbeit läuft weiter, und Ablago baut sie neu auf. Die Zeitpläne beginnen außerdem gestreut (fester Versatz je Zeitplan), nicht alle zur selben Sekunde.
- **Warten mit Zeitgrenze (#1198):** Wartet eine Anfrage länger als **10 Sekunden** auf eine freie Verbindung, steht im Protokoll „Anfragen warten lange auf eine freie Verbindung zur Datenbank“ mit der Zahl belegter, reservierter und wartender Verbindungen und den laufenden Sperren. Nach **30 Sekunden** bricht sie ab und bekommt 503 („Ablago ist gerade beschäftigt“) statt endlos zu warten. **Werkbank → Systemzustand** zeigt bei den Verbindungen, wie viele gerade belegt und reserviert sind und welche Sperren laufen.
- **Gesundheitsprüfung mit Datenbank (#1198):** `/api/gesundheit` (und damit der Docker-Healthcheck) prüft die Datenbank mit einer kurzen Abfrage (höchstens 2 Sekunden, Ergebnis 5 Sekunden zwischengespeichert). Ist keine Verbindung frei oder antwortet die Datenbank nicht, meldet sie 503 mit `"zustand": "datenbank"` – der Container gilt dann als *unhealthy*. Was zu tun ist: [Ablago lädt nicht oder bleibt schwarz](was-ist-passiert.md#laedt-nicht).
- **Schwere Arbeit** wie PDF-Bearbeitung und große Exporte läuft in eigenen [Arbeitern](speicherplatz.md#arbeiter-fur-pdf-und-exporte), damit andere Benutzer nicht warten.
- **Menschen haben Vorrang** (#893): Arbeit im Hintergrund – die Arbeiter, der Paket-Läufer (z. B. Texterkennung) und die Programme, die Ablago startet (`pdftoppm`, `qpdf` …) – läuft mit niedrigerer Priorität (nice 10, einstellbar mit `DMS_HINTERGRUND_NICE`, `0` = aus); Anfragen von Menschen und PostgreSQL bekommen die Kerne zuerst. Erlaubt der Container das nicht, läuft alles mit normaler Priorität weiter und das [Protokoll](fehlersuche.md#protokoll) sagt es einmal.
- **Mehrere Prozesse** ([unten](#mehrere-prozesse)): Mit `DMS_PROZESSE` beantworten mehrere Prozesse die Anfragen gemeinsam und nutzen so mehrere Kerne. Vorgabe ist ein Prozess wie bisher.
- Die aktuellen Werte von `DMS_PROZESSE`, `DMS_ARBEITER`, `DMS_DB_VERBINDUNGEN` und `DMS_MAX_ANFRAGEN` und woher sie stammen, zeigt **Werkbank → Systemzustand**; wird etwas knapp, nennt der Hinweis dort die Variable, die helfen kann ([Einstellungen und Engpässe](speicherplatz.md#einstellungen-und-engpasse)).
- Der **Anmeldeschutz** zählt auch unter Last jeden Fehlversuch; eine abgewiesene Anmeldung (503) prüft kein Passwort und zählt darum nicht.

### Mehrere Prozesse { #mehrere-prozesse }

Ablago beantwortet Anfragen mit Node.js in **einem** Faden je Prozess. Mit einem Prozess arbeitet für die Anfragen also ein Kern, auch wenn der Server mehr hat. Mit `DMS_PROZESSE` (#745) beantworten mehrere Prozesse die Anfragen gemeinsam:

| Wert | Bedeutung |
| --- | --- |
| nicht gesetzt oder `1` | ein Prozess – wie bisher (Vorgabe; ein Update ändert daran nichts) |
| `2` bis `16` | so viele Prozesse |
| `auto` | Kerne des Containers − 1, **höchstens 2** (#874; vorher 4) – und nur so viele, wie der Arbeitsspeicher trägt (1 GB Reserve plus rund 1 GB je Prozess, Grenze des Containers, sonst des Rechners: unter 3 GB also 1) |

**Empfehlung:** Ein Prozess, solange es flüssig läuft; mit vielen gleichzeitigen Personen (Kleinbetrieb) und mindestens 4 Kernen **2 Prozesse** – das macht `auto`. Mehr nimmt `auto` vorerst nicht: Auf einem NAS mit 6 Threads wurde mit 4 Prozessen nur der Median schneller, die langsamen Anfragen (p95) beim Speichern nicht – mit PostgreSQL im selben Container wie in einem eigenen; die Belastungsgrenze sank sogar, und der Arbeitsspeicher stieg auf 3,5 GB (mit Speichern 5,8 GB). Bis eine Messung zeigt, dass mehr hilft, bleibt es bei 2 (mit `dms-komplett` auch später höchstens 2, weil sich dort Ablago und PostgreSQL die Kerne teilen). Eine feste Zahl (z. B. `DMS_PROZESSE=4`) gilt weiter, wie sie ist. Für einen Haushalt, einen Raspberry Pi oder ein kleines NAS bleibt es bei einem Prozess – dort bringt ein zweiter nichts, kostet aber Arbeitsspeicher. Messwerte unter [Was Ablago verkraftet](verkraftet.md).

So arbeiten die Prozesse zusammen:

- Ein schlanker **Hauptprozess** startet die Prozesse, verteilt die Verbindungen reihum auf sie und startet einen abgestürzten Prozess nach 1 Sekunde neu (bei wiederholtem Absturz mit wachsender Pause bis 1 Minute). Anmeldungen bleiben dabei erhalten; sie stehen in der Datenbank.
- **Prozess 1 leitet:** Er zeigt beim Start die Seite „Ablago startet …“, bringt die Datenbank auf den neuen Stand und erledigt die gesamte **Arbeit im Hintergrund** – Texterkennung, Vorschaubilder, Zeitpläne, Automatisierungen, den Paket-Läufer (genau einmal), Eingangsordner, Postfächer, Sicherung und Wiederherstellung. Daneben beantwortet er Anfragen wie alle anderen. Die übrigen Prozesse starten erst, wenn er bereit ist.
- **Wartungsmodus, Anmeldeschutz, Werkbank-Aufträge** und Einstellungen gelten in allen Prozessen (spätestens nach wenigen Sekunden). Die Sperre gegen ein Downgrade hält Ablago an wie mit einem Prozess. Die Gesundheitsprüfung des Containers bleibt unverändert, der Befehl `dms` im Container funktioniert wie bisher.
- **Arbeitsspeicher:** Jeder Prozess braucht eigenen Arbeitsspeicher. Im Leerlauf sind es rund 250–300 MB je Prozess, unter Last deutlich mehr: Node.js räumt Speicher erst nach und nach auf. Plane je Prozess rund **1 GB** ein (so rechnet auch `auto`) und passe `mem_limit` an; der Hauptprozess selbst braucht nur rund 40 MB. Damit nicht jeder Prozess so tut, als hätte er den Container allein, begrenzt Ablago die Halde von Node.js in jedem Prozess: in den weiteren Prozessen (Prozess 2 und folgende) auf 60 % ihres Anteils, 1–1,5 GB, in Prozess 1 auf 512 MB mehr, weil er zusätzlich die Arbeit im Hintergrund erledigt (1,5–2 GB). Im Lasttest brauchte ein weiterer Prozess so rund 720 statt 1.050 MB; auf einem NAS wuchs Prozess 1 ohne Grenze bei `groß` mit Speichern auf 2,6 GB (Halde 2,3 GB), Prozess 2 mit Grenze nur auf 1,3 GB. Der Hauptprozess bleibt ohne Grenze, beide Werte stehen beim Start im Protokoll (`haldeLeiterMb`, `haldeMb`). Wer selbst `--max-old-space-size` in `NODE_OPTIONS` setzt, behält seinen Wert. Zwischenspeicher für die PDF-Anzeige, Seitenbilder und gestempelte WebDAV-Fassungen teilen sich die Prozesse: Zusammen belegen sie höchstens so viel wie mit einem Prozess.
- **Abstürze** eines Prozesses zählt der Hauptprozess (mit Nummer und Code bzw. Signal); der [Lasttest](lasttest.md) zeigt sie je Durchgang, zusammen mit den Fehlerarten (z. B. abgebrochene Verbindungen).
- **Wann es sich lohnt:** Erst mit freien Kernen. Auf einem Rechner mit 2 Kernen (Ablago, PostgreSQL und die Last teilen sie) war ein zweiter Prozess in der Stufe mittel langsamer als einer; in der Stufe groß verschob er die Grenze von 100 auf 150 gleichzeitige Anfragen. Darum nimmt `auto` bei 2 Kernen einen Prozess. Einzelheiten: Entwicklerhandbuch → Leistung.

**Verbindungen zur Datenbank – für alle zusammen:** `DMS_DB_VERBINDUNGEN` gilt für **alle Prozesse zusammen** (#874; vorher je Prozess). Prozess 1 bekommt zuerst 4 Verbindungen vorab – seit #1198 eine davon für seine Sperren, die übrigen für seine Arbeit im Hintergrund (vorher hielt er 3 davon dauerhaft für Sperren); den Rest teilen sich alle Prozesse gleich (jeder weitere mindestens 2, Prozess 1 insgesamt mindestens 6). Ohne die Variable sind es 10 wie bisher mit einem Prozess und je weiteren Prozess 4 mehr (2 Prozesse 14: Prozess 1 hat 9, Prozess 2 hat 5; 4 Prozesse 22 statt bisher 40). Ist die Zahl zu klein für die Prozesse, hebt Ablago sie auf das Mindestmaß an; wäre sie mehr, als die Datenbank erlaubt (`max_connections`, abzüglich 10 für andere), kürzt Ablago sie – beides steht im Protokoll.

**Warum zusammen:** Mehr Verbindungen machen eine Datenbank, die sich die Kerne mit Ablago teilt, nicht schneller. Laufen mehr Abfragen gleichzeitig, als PostgreSQL Kerne hat, wartet jede länger auf Rechenzeit und auf Sperren anderer – das trifft gerade das Speichern. Mit 4 Prozessen öffnete Ablago bisher 40 Verbindungen, auf einem NAS mit 6 Threads.

**Beim Aktualisieren:** Mit einem Prozess ändert sich nichts. Wer mehrere Prozesse **und** `DMS_DB_VERBINDUNGEN` gesetzt hat, bekommt jetzt diese Zahl für alle zusammen statt je Prozess. Für das bisherige Verhalten den Wert mit der Zahl der Prozesse malnehmen (z. B. 3 Prozesse mit 20 je Prozess: `DMS_DB_VERBINDUNGEN=60`).

**Was je Prozess gilt:** `DMS_MAX_ANFRAGEN` und `DMS_ARBEITER` gelten **je Prozess**. Die Vorgabe der Arbeiter teilt sich auf die Prozesse auf (mindestens 1 je Prozess), damit zusammen nicht mehr Fäden rechnen als mit einem Prozess. **Werkbank → Systemzustand** zeigt die Werte mit „je Prozess, zusammen …“ bzw. bei den Verbindungen die Aufteilung („zusammen für 2 Prozesse: Leiter 9, jeder weitere 5“) und darunter eine Zeile je Prozess mit Arbeitsspeicher, Rechenzeit, Wartezeit und laufenden Anfragen. Wo es unter Last hakt – Warten auf Verbindungen, Sperren, Rechenzeit von PostgreSQL und Ablago, Neustarts und Arbeitsspeicher je Prozess –, zeigt der [Lasttest](lasttest.md) je Durchgang.

## Schnittstelle

`/api/v1` für andere Programme (API-Schlüssel), Beschreibung unter `/api/openapi.json`. Die Oberfläche selbst nutzt interne Adressen unter `/api/…`, die sich ändern dürfen.

## Hilfe ohne Internet

Das Image bringt die Handbücher seiner Version mit, auf Deutsch und Englisch: Startseite, Wie komme ich an ein DMS?, Benutzer-, Administrator- und Entwicklerhandbuch, erreichbar unter `/hilfe/` der eigenen Installation (z. B. `http://<NAS>:8080/hilfe/`, auf Englisch unter `/hilfe/en/`), ohne Anmeldung und schon im Einrichtungsassistenten. Das Fragezeichen neben einer Überschrift und die Links auf das Handbuch öffnen diese Version, in der Sprache der angemeldeten Person. Sie kommt ohne Internet aus; nur die Bildschirmfotos fehlen – an ihrer Stelle steht ein Link auf dieselbe Seite online. Im Fuß jeder Seite geht es zur Online-Hilfe und zur neuesten Version.

## Module

Jede Zeile im [Protokoll](fehlersuche.md#protokoll) gehört zu einem Modul. Für jede Anfrage an den Server schreibt Ablago eine Zeile mit Methode, Pfad, Status, Dauer und Datenbankzugriffen – im Modul des Bereichs, zu dem die Anfrage gehört (z. B. `ablage` für Mappen). Anfragen, die nur lesen – auch Vorschauen, Zählungen und Testläufe, die die Oberfläche per POST schickt –, stehen nur auf Stufe `debug`, also nur im Debug-Modus.

Im Filter von **Werkbank → Protokoll** stehen alle Module mit ihrem Namen – auch solche, zu denen gerade nichts im Protokoll steht („(keine Einträge)“).

| Name im Filter | Modul | Was |
| --- | --- | --- |
| System | `system` | Start, Einstellungen, Debug-Modus |
| Anfragen (HTTP) | `http` | Anfragen, die zu keinem anderen Modul gehören (z. B. Seiten der Oberfläche) |
| Benutzerkonten und Anmeldung | `konto` | Anmeldung, **Anmeldeschutz** (gesperrte Konten und IP-Adressen), Sitzungen, Benutzer, Rollen, Vertretung |
| Ablage | `ablage` | Mappen anlegen, ändern, löschen; Ansichten, Papierkorb, Notizen, Aufgaben |
| Dokumente | `dokumente` | Hochladen, Anzeigen, Löschen |
| Werkbank | `werkbank` | Mappentypen, Pakete, Demo-Daten, Einstellungen, Versionsabgleich |
| Datenschutz | `datenschutz` | Auskünfte, Abruf-Links, Löschkonzept |
| Texterkennung | `texterkennung` | abgeschlossen, ausgelassen, fehlgeschlagen, neu gestartet, abgebrochen; Einstellungen |
| Dateien umwandeln | `umwandlung` | Fassungen aus Paketen (z. B. TIFF → PDF) |
| Archivfassung | `archivfassung` | PDF/A aus Paketen |
| Vorschaubilder | `vorschau` | Vorschaubilder erzeugen |
| Datenbank | `datenbank` | Migrationen, Verbindung, lange Zugriffe |
| E-Mail | `mail` | Versand und Fehler beim Versand |
| Sicherung | `sicherung` | Sicherung, Notfallblatt, Wiederherstellung und Probe |
| Ereignisse | `ereignisse` | Verteilen von Ereignissen an Pakete und Automatisierungen |
| Automatisierungen | `automatisierung` | Läufe der Automatisierungen |

Anmeldung und Anmeldeschutz bleiben bewusst in einem Modul: Eine Sperre ergibt sich aus Fehlversuchen bei der Anmeldung – wer nach einer Sperre sucht, sieht beides zusammen.

## Wo was steht

| Was | Wo |
| --- | --- |
| Protokoll dauerhaft | Container-Logs: `docker logs <app-container>` |
| Protokoll der letzten 24 Stunden | Werkbank → Protokoll |
| Lange Datenbankzugriffe | Werkbank → Datenbank-Anbindung (Tabelle `langlaeufer`) |
| Datenbank sichern | am besten über **Werkbank → Sicherung**; zusätzlich mit zwei Containern `docker exec <db-container> pg_dump -U dms dms > dms.sql`, bei dms-komplett `docker exec <container> pg_dump -h 127.0.0.1 -U dms dms > dms.sql` |
| Dateien sichern | Ordner `files` aus der Compose-Vorlage |

## Versionen und Aktualisierung

Das Image enthält Node.js, Alpine Linux und alle Bibliotheken; aktualisiert wird durch Neuziehen von `ghcr.io/motom001/dms:stabil` und Neustart (siehe [Welches Image-Tag?](aktualisieren.md#image-tag)). `:stabil` wandert einmal pro Woche (dienstags früh) auf die neueste geprüfte Version, dringende Fehlerbehebungen (Label `sofort-stabil`) gleich nach dem Release; `:main` bekommt jeden Stand sofort.

- **Zwei Container (empfohlen):** PostgreSQL ist ein eigenes Image (`postgres:17`): kleinere Versionen (17.x) durch Neuziehen, unabhängig von Ablago.
- **dms-komplett:** PostgreSQL (Alpine-Paket) steckt im Image `ghcr.io/motom001/dms-komplett` und kommt mit dessen Updates. Beide Images werden bei jeder Änderung und mindestens jede Woche neu gebaut, mit den Alpine-Paketen vom selben Tag (Tag `main`); feste Versionsnummern bekommen neue Alpine-Pakete mit dem nächsten Release, `:stabil` mit der nächsten stabilen Version (einmal pro Woche).
- Ein Wechsel der Hauptversion (z. B. 17 → 18) braucht in beiden Fällen eine Sicherung und Wiederherstellung, siehe [Wachsen und umziehen](wachsen.md#neue-hauptversion-von-postgresql).

Der Versionsabgleich in der Werkbank fragt nur auf Knopfdruck (von selbst einmal am Tag nur mit einer eingeschalteten [Automatisierung „Neue Version verfügbar“](automatisierungen.md#neue-version), und dann nur GitHub nach der stabilen Version): GitHub für den Stand von Ablago, [endoflife.date](https://endoflife.date) für Node.js, PostgreSQL und Alpine, die npm-Registry für die Bibliotheken. Er trennt, was du **selbst aktualisierst** (Ablago-Image, bei zwei Containern PostgreSQL), von dem, was **mit Ablago kommt** (Node.js, Alpine, Bibliotheken – bei dms-komplett auch PostgreSQL). Für Ablago selbst ist die Vergleichsgröße die stabile Version – das Release, das auf GitHub „Latest“ heißt und mit `:stabil` im Wochentakt wandert; die Releases dazwischen sind nicht „Latest“.

Die Entscheidungen hinter dem Aufbau stehen in [entscheidungen.md](entscheidungen.md).
