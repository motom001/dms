# Systemzustand

Wie geht es dem Server gerade? Das zeigt **Werkbank → Wartung und Fehlersuche → Systemzustand**: den **Speicherplatz** und die **Auslastung** von CPU, Arbeitsspeicher und Netzwerk. (Früher hieß der Bereich *Speicherplatz* und stand unter *Einstellungen*; alte Links und Lesezeichen führen hierher.)

Auf derselben Seite stehen seit dem Aufräumen der Werkbank auch die **langen Datenbankzugriffe** und was gerade in der Datenbank läuft (früher unter *Datenbank-Anbindung*), die [externen Dienste](#externe-dienste) mit den [KI-Kosten](#ki-kosten) sowie **Version und Updates** (früher eigener Bereich *Technik*, siehe [Fehlersuche](fehlersuche.md#technik)).

Damit beim Speichern und Hochladen nie etwas verloren geht, misst Ablago selbst, wie viel Platz frei ist, warnt rechtzeitig und hält sich an der Grenze selbst an. Oben auf der Seite stehen die **Schwellen**, darunter die [Auslastung](#auslastung), dann die **Ordner** mit ihrer Belegung, ganz unten **Große PDFs verkleinern**.

--8<-- "ausgeblendet-schritt.md"

![Werkbank → Systemzustand](bilder/werkbank-speicherplatz.png)

## Warnschwelle und Grenze

Ganz oben auf der Seite. Beide stellst du in **GB frei** oder **% frei** ein; Prozent beziehen sich auf die Größe des jeweiligen Datenträgers. Sie gelten für jeden Ordner einzeln.

| Stufe | Standard | Was passiert |
| --- | --- | --- |
| **Warnschwelle** | unter 10 % frei | Hinweis in der [Übersicht](uebersicht.md) und auf dieser Seite, **eine Mail** an alle Administratoren (einmal je Unterschreiten – erst wenn wieder genug frei war, gibt es beim nächsten Mal eine neue). Alle arbeiten normal weiter. |
| **Grenze** | unter 2 GB frei | **Hochladen sofort gesperrt** (neue Dokumente, Logos); Werte speichern geht noch. Mail an alle Administratoren, und der [Wartungsmodus](wartungsmodus.md) startet mit **5 Minuten Vorlauf** und dem Text **„Speicherplatzlimit erreicht“**. |

Die Warnschwelle muss mehr freien Platz verlangen als die Grenze – sonst käme die Warnung erst danach.

## Auslastung

Ist Ablago langsam, siehst du hier, woran es liegt – ohne Konsole des NAS. Ablago misst **jede Minute** die Auslastung **seines Containers**; die kleinen Kurven zeigen die letzte Stunde, daneben steht der Wert **jetzt**. Die Werte stehen nur im Arbeitsspeicher, nach einem Neustart beginnen die Kurven neu.

![Werkbank → Systemzustand → Auslastung](bilder/werkbank-auslastung.png)

| Wert | Was er bedeutet |
| --- | --- |
| **CPU** | Anteil der Rechenzeit an den Kernen, die der Container nutzen darf (Grenze aus `cpus:` in der Compose-Datei). Ohne Grenze bezieht sich der Anteil auf alle Kerne. Darunter die **Systemlast** des ganzen Rechners (1, 5, 15 Minuten) – liegt sie dauerhaft über der Zahl der Kerne, ist das NAS insgesamt ausgelastet, nicht nur Ablago. |
| **Arbeitsspeicher** | Belegt von der Grenze des Containers (`mem_limit:`); ohne Grenze verglichen mit dem ganzen Rechner. Darunter die Anteile von **Ablago**, **Paket-Läufer** (läuft nur mit installierten Paketen mit Code) und – bei dms-komplett – **PostgreSQL**. |
| **Netzwerk** | Empfangen und gesendet je Sekunde, über alle Netzwerkschnittstellen des Containers. |
| **Wartezeit des Servers** | Wie lange eine Anfrage warten musste, weil Ablago gerade etwas anderes rechnete (Ereignisschleife). Die Einzelheiten stehen unter **Einstellungen → [Datenbank-Anbindung](installation.md#lange-datenbankzugriffe)**, zusammen mit den langen Datenbankzugriffen. |
| **Arbeiter für PDF und Exporte** | Wie viele [Arbeiter](#arbeiter-fur-pdf-und-exporte) gerade beschäftigt sind, wie viele Aufträge warten, wie lange ein Auftrag im Mittel dauert und wartet, was fehlschlug. |

**Warnung:** Liegt CPU oder Arbeitsspeicher **5 Minuten lang über 90 %**, steht ein Hinweis hier, in der [Übersicht](uebersicht.md) und als **hoch** neben *Systemzustand* in der Leiste – auch wenn der Bereich ausgeblendet ist. Genauso warnt Ablago, wenn die **Wartezeit des Servers** in **5 Minutenfenstern hintereinander** bei 99 % der Messungen (p99) **über 100 ms** liegt; dann steht zusätzlich ein Eintrag im [Protokoll](fehlersuche.md#protokoll) (Modul `datenbank`, „Hohe Wartezeit des Servers“) und einer, sobald es wieder normal ist. 100 ms merkt man beim Klicken gerade eben; liegt fast jede Anfrage so lange in der Warteschlange, ist Ablago spürbar zäh.

**Typische Ursachen und was hilft:**

- **Texterkennung** arbeitet viele neue Scans ab – das geht vorbei; die Warteschlange steht unter [Texterkennung](texterkennung.md).
- **Demo-Daten** werden angelegt oder entfernt – ebenfalls vorübergehend.
- Ein **Paket mit Code** rechnet viel – der Anteil *Paket-Läufer* zeigt das; die Auslastung je Paket folgt in einer späteren Version.
- Der Arbeitsspeicher ist dauerhaft knapp – erhöhe `mem_limit` in der Compose-Datei (zu Hause und in kleinen Betrieben reichen meist 1–2 GB, mit Texterkennung eher 2 GB; Messwerte unter [Was Ablago verkraftet](verkraftet.md)) oder gib dem NAS mehr Speicher.
- Die Systemlast des Rechners ist hoch, die CPU von Ablago aber nicht – dann bremst ein anderer Dienst auf dem NAS.
- Die **Wartezeit des Servers** ist hoch, obwohl CPU und Arbeitsspeicher frei sind – dann rechnet Ablago etwas Großes im Hauptfaden. Melde das bitte als [Issue](https://github.com/motom001/dms/issues) mit dem Eintrag aus dem Protokoll; schwere Arbeit gehört in einen [Arbeiter](#arbeiter-fur-pdf-und-exporte).

### Arbeiter für PDF und Exporte { #arbeiter-fur-pdf-und-exporte }

Ablago beantwortet alle Anfragen in **einem** Faden. Rechnet er an etwas Großem, warten alle anderen. Darum laufen die schweren Arbeiten in eigenen **Arbeitern** neben dem Hauptfaden: Stempeln und Wasserzeichen beim Weitergeben, Seiten bearbeiten und zusammenfügen, Schwärzen, Verkleinern, Vorschaubilder von Fotos, PDF-Exporte, Auskunft, Aufkleber, Löschkonzept und -protokoll als PDF, Demo-Dokumente sowie Excel- und CSV-Tabellen großer Exporte. Texterkennung und Vorschaubilder von PDFs liefen schon immer als eigene Programme; der [Paket-Läufer](pakete.md) ist ein eigener Prozess und hat mit den Arbeitern nichts zu tun.

- **Zahl der Arbeiter:** Vorgabe ist die Hälfte der Kerne, die der Container nutzen darf (Grenze `cpus:` in der Compose-Datei, sonst alle Kerne des Rechners) – mindestens 1, höchstens 4. Der Hauptfaden und PostgreSQL brauchen die übrigen Kerne. Ändern lässt sie sich mit der Umgebungsvariable `DMS_ARBEITER` (1–16, siehe [Installation](installation.md#einstellungen)); `DMS_ARBEITER=0` schaltet die Arbeiter aus – dann läuft alles wie früher im Hauptfaden (nur zur Fehlersuche).
- **Warteschlange:** Sind alle Arbeiter beschäftigt, wartet ein Auftrag. Warten schon 50, antwortet Ablago sofort mit „Gerade laufen sehr viele PDF-Arbeiten und Exporte. Bitte versuche es in einer Minute noch einmal.“ (HTTP 503) statt endlos.
- **Zeitgrenze:** Ein Auftrag darf höchstens **10 Minuten** dauern. Danach wird der Arbeiter beendet, und der Benutzer liest „Die Bearbeitung dauerte länger als 10 Minuten und wurde abgebrochen.“
- **Arbeitsspeicher:** Ein Arbeiter darf höchstens 1,5 GB belegen. Braucht ein riesiges PDF mehr, scheitert nur dieser Auftrag („… mehr Arbeitsspeicher als erlaubt …“), nicht Ablago.
- Ein Arbeiter entsteht bei Bedarf und beendet sich nach zwei Minuten ohne Arbeit wieder; einer läuft ab dem Start bereit.

Mehr Arbeiter helfen nur, wenn genug Kerne frei sind: Bei 2 Kernen bleibt es bei einem Arbeiter, damit Anfragen und Datenbank nicht leer ausgehen.

### Einstellungen und Engpässe { #einstellungen-und-engpasse }

Unter den Werten steht **Einstellungen für viele gleichzeitige Anfragen** – nur zum Ansehen, mit dem aktuellen Wert und woher er stammt (*Vorgabe* oder *aus der Umgebung*):

| Zeile | Variable | erlaubt | Vorgabe |
| --- | --- | --- | --- |
| Prozesse für Anfragen | `DMS_PROZESSE` | 1–16 oder `auto` | 1 |
| Arbeiter für PDF und Exporte | `DMS_ARBEITER` | 0–16 | Hälfte der Kerne, 1 bis 4 |
| Verbindungen zur Datenbank (alle Prozesse zusammen) | `DMS_DB_VERBINDUNGEN` | 2–100 | 10, je weiteren Prozess 4 mehr |
| Gleichzeitige Anfragen höchstens | `DMS_MAX_ANFRAGEN` | 20–10.000 | 250 |

Mit [mehreren Prozessen](technik.md#mehrere-prozesse) gelten Arbeiter und gleichzeitige Anfragen **je Prozess**; hinter dem Wert steht dann „je Prozess, zusammen …“. Die Verbindungen gelten für alle Prozesse zusammen (#874); dahinter steht, wie sie sich aufteilen („Leiter 9, jeder weitere 5“). Darüber zeigt die Tabelle **Prozesse** je Prozess seine Aufgabe (Prozess 1 leitet und erledigt die Arbeit im Hintergrund), Arbeitsspeicher, Rechenzeit, Wartezeit und laufende Anfragen; *Ablago* beim Arbeitsspeicher ist dann die Summe aller Prozesse.

Ändern lassen sie sich nur als Umgebungsvariable in der Compose-Datei (siehe [Installation](installation.md#einstellungen)); sie gelten, sobald der Container neu erstellt ist. Ein ungültiger Wert wird beim Start ignoriert (Hinweis im Protokoll), dann steht hier die Vorgabe. Warum die Vorgaben so sind, steht unter [Technik → Viele gleichzeitige Anfragen](technik.md#last).

Wird etwas knapp, steht über den Werten ein **Engpass**-Hinweis mit der Variable, die helfen kann (auch als Hinweis in der Übersicht):

| Engpass | wann | Variable |
| --- | --- | --- |
| Wartezeit des Servers | seit 5 Minuten oft über 100 ms (siehe oben) | `DMS_ARBEITER` – die Arbeiter nehmen dem Hauptfaden PDF-Arbeiten und Exporte ab. Ist die CPU ohnehin voll, hilft nur mehr Rechenzeit für den Container. |
| Warten auf eine Verbindung zur Datenbank | in der letzten Minute üblich über 50 ms | `DMS_DB_VERBINDUNGEN` – nur sinnvoll, wenn CPU und Datenbank nicht ausgelastet sind |
| Warteschlange der Arbeiter voll | in den letzten 15 Minuten wurde ein Auftrag abgewiesen | `DMS_ARBEITER` – nur sinnvoll mit freien Kernen |
| Überlastschutz | in den letzten 15 Minuten „gerade sehr beschäftigt“ (503) | `DMS_MAX_ANFRAGEN` – prüfe zuerst, ob ein Programm (z. B. über WebDAV) ungewöhnlich viele Anfragen schickt; eine höhere Grenze macht Ablago nicht schneller |

**Nicht verfügbar** steht dort, wo der Container einen Wert nicht lesen kann – Ablago schätzt nichts und braucht keine zusätzlichen Rechte (kein privilegierter Container, kein Docker-Socket). Läuft die Datenbank in einem eigenen Container oder auf einem anderen Server, sieht Ablago **ihre** Auslastung nicht; das steht unter dem Arbeitsspeicher.

## Was gemessen wird

Gemessen werden die drei festen Ordner im Container (siehe [Ordner und Volumes](installation.md#ordner-und-volumes)) – jede Minute und zusätzlich vor jedem Hochladen:

| Ordner | Inhalt |
| --- | --- |
| `/data/files` | Dokumente, Logos, Bilder gemeldeter Fehler |
| `/data/geheim` | Schlüssel und Notfallzugang |
| `/data/sicherung` | Sicherungen |

Je Ordner zeigt die Seite belegt, frei und die Größe des Datenträgers, als Balken mit Marken für Warnschwelle und Grenze. Liegen alle drei auf demselben Datenträger (der übliche Fall auf dem NAS), zeigt die Seite **einen** Balken „Ein Datenträger für Dateien, Schlüssel und Sicherungen“ mit den Ordnern darunter – und den Hinweis, dass die Sicherungen damit auf derselben Platte liegen wie die Dokumente. Liegen nur einige auf demselben Datenträger, steht das beim jeweiligen Ordner. Darunter steht, wie viel davon die **Vorschaubilder** der Dokumente belegen (Ordner `/data/files/vorschau`, meist wenige Kilobyte je Dokument). Sie werden **nicht gesichert** – nach einer Wiederherstellung entstehen sie beim Anzeigen oder über **Wartungsoperationen → Vorschaubilder nachholen** neu. **Werkbank → Systemzustand → Version und Updates** zeigt dieselben Zahlen in der Übersicht für den Support.

!!! note "Die Datenbank wird nicht gemessen"
    Bei zwei Containern läuft PostgreSQL in einem eigenen Container; sein Volume kann Ablago nicht sehen. Bei [dms-komplett](https://help.ablago.app/installieren/aktuell/komplett/) liegt die Datenbank im vierten Ordner `/data/postgres` – auch den misst Ablago nicht. Liegen alle Ordner auf derselben Platte des NAS (der übliche Fall), reicht die Messung trotzdem. Liegt die Datenbank auf einer anderen Platte, behalte deren Platz in der Speicherverwaltung des NAS im Blick.

## Externe Dienste { #externe-dienste }

Manches erledigt Ablago nicht selbst, sondern wartet auf einen anderen Dienst: den **KI-Dienst** eines Pakets (z. B. „Frag deine Ablage“ mit einem Modell auf dem NAS, siehe [KI lokal betreiben](ki-lokal.md)), den Mailserver beim **Postfach-Abruf** (IMAP) und beim **Versand** (SMTP), den Anbieter bei der **Anmeldung über einen Anbieter** (OIDC) und die Netzzugriffe anderer **Pakete**. Der Abschnitt **Externe Dienste** zeigt je Dienst – bei Paketen je Paket – für die **letzte Stunde** oder die **letzten 24 Stunden**:

| Spalte | Was sie bedeutet |
| --- | --- |
| **Aufrufe** | Wie oft Ablago den Dienst aufgerufen hat. Ein Postfach-Abruf ist eine Sitzung (anmelden, Mails holen, abmelden), bei Paketen zählen alle Netzzugriffe eines Aufrufs zusammen. |
| **Mittel, p50, p95** | Gesamtdauer im Mittel, im Median (die Hälfte war schneller) und bei 95 % der Aufrufe. p95 zeigt die langsamen Ausreißer. |
| **Erste Antwort** | Bis der Dienst zu antworten begann (Kopf der Antwort, Anmeldung am Mailserver, Mail angenommen). Ist die erste Antwort schnell, die Gesamtdauer aber lang, rechnet der Dienst – z. B. ein Sprachmodell, das Wort für Wort schreibt. |
| **Fehler, Zeitüberschr.** | Aufrufe ohne brauchbare Antwort (keine Verbindung, Fehler des Dienstes, Antwort 5xx) und Aufrufe, die an einer Zeitgrenze abbrachen. |
| **Daten hin / zurück** | Bytes, die hinausgingen und hereinkamen (soweit bekannt: beim Versand die Größe der Mail, beim Anbieter die angegebene Größe der Antwort). |
| **Token ein / aus** | Nur bei KI-Diensten: die Token, die der Dienst in seiner Antwort meldet (`usage`). |

Darunter stehen die **letzten Aufrufe** mit Zeit, Dienst, Funktion und Dauer. Dieselben Zahlen für ein einzelnes Paket stehen unter **Werkbank → Pakete → Paket** beim Paket-Läufer.

**Woran liegt es?** Ist eine Seite langsam und die Zeit steckt hier, liegt es am Dienst oder am Netz, nicht an Ablago: Bei einem KI-Dienst helfen ein kleineres Modell oder bessere Hardware (siehe [Wie schnell ist das?](ki-lokal.md#geschwindigkeit)), bei einem Mailserver ein Blick auf dessen Erreichbarkeit. Im [Entwicklermodus](fehlersuche.md#zeitmessung-entwicklermodus) zeigt die Zeitmessung dieselben Werte je Anfrage.

**Was gespeichert wird:** nur Dienst, Paket, Funktion (z. B. „Frag deine Ablage“ oder die Art eines Ereignisses), die Person, die den Aufruf auslöste, Dauer, Datenmenge, Ergebnis und Token – **nie** Fragen, Antworten, Mails, Betreffs, Adressen oder Links. Nichts davon verlässt Ablago. Einzelne Aufrufe bleiben **35 Tage**, danach nur noch Summen je Monat, die **24 Monate** bleiben. Wird ein Konto gelöscht, bleiben seine Werte ohne Person stehen. Die Messwerte sind Teil der [Sicherung](sicherung.md), aber nicht des [Vollexports](export.md).

## KI-Kosten und Budget { #ki-kosten }

Ein KI-Paket mit einem Anbieter im Internet kostet je Token Geld. Der Abschnitt **KI-Kosten und Budget** zeigt, wohin das Geld geflossen ist – je **Monat**, je **Paket**, je **Person**, je **Funktion** und die **teuersten Abfragen** (Zeit, Person, Funktion, Token, Dauer, Kosten; ohne Inhalt).

- **Preis je 1 Mio. Token:** Je installiertem KI-Paket trägst du den Preis für Eingabe- und Ausgabe-Token ein, wie er in der Preisliste des Anbieters steht, dazu die **Währung**. Ablago rechnet damit jede Antwort aus; die Rechnung des Anbieters kann abweichen (Rundung, Rabatte, Steuern). Ein neuer Preis gilt für Aufrufe ab jetzt.
- **Lokaler Dienst:** Ohne Preis kostet ein Paket nichts – die Token zählen trotzdem und zeigen, wie viel das Gerät leistet (z. B. Ollama auf dem NAS).
- **Monatsbudget:** Ab **80 %** steht ein Hinweis hier und unter *Externe Dienste*, und im [Protokoll](fehlersuche.md#protokoll) steht einmal im Monat eine Warnung (Modul `system`), ebenso beim Erreichen.
- **Harte Grenze:** Ist sie an und das Budget erreicht, **pausieren die kostenpflichtigen KI-Funktionen** (Pakete mit Preis) bis zum nächsten Monatsanfang. Wer sie nutzt, liest „KI-Funktionen pausiert bis 1. Dezember 2026 …“; *Aus Dokument ausfüllen* und *Wohin gehört das?* nehmen dann die eingebaute Erkennung, die Suche sucht ohne ähnliche Dokumente, Paket-Aktionen im Menü *Mappe* melden die Pause, Ereignisse an das Paket warten und kommen danach an. Ein höheres Budget hebt die Pause sofort auf. Ein lokaler Dienst ohne Preis läuft weiter.

Die Zahlen beruhen auf den Token, die der Dienst selbst meldet (OpenAI, Anthropic, Ollama, Gemini und kompatible Dienste). Meldet ein Dienst keine, zählt Ablago Dauer und Bytes, aber keine Token und keine Kosten. Die teuersten Abfragen stehen nur für die letzten 35 Tage zur Verfügung, ältere Monate nur als Summen.

## Große PDFs verkleinern {#grosse-pdfs-verkleinern}

Gescannte und fotografierte PDFs sind oft viel größer als nötig: Ein Scanner mit 600 dpi oder ein Foto-PDF vom Handy legt Bilder ab, von denen 150 dpi zum Lesen und Drucken reichen. Unter den Ordnern listet **Große PDFs verkleinern** die PDF-Dokumente ab einer Größe (1 bis 20 MB, Standard 2 MB), **größte zuerst**, mit der geschätzten Größe danach. Die Liste hat eine feste Höhe und zeigt höchstens die 200 größten; geschätzt werden die ersten 60.

1. **Stufe** wählen: **Bildschirm** (≈ 100 dpi), **Standard** (≈ 150 dpi, Vorgabe) oder **Druck** (≈ 300 dpi).
2. Dokumente ankreuzen – vorgewählt sind alle, bei denen es sich lohnt (mindestens 10 % kleiner). Unten steht, wie viel Platz geschätzt frei wird.
3. Auf Wunsch **Originale nicht als ältere Version behalten** anhaken (siehe unten).
4. **… PDFs verkleinern** – nach einer Rückfrage läuft die Arbeit im Hintergrund; die Seite zeigt den Fortschritt („PDFs verkleinern: 12 von 40“) und am Ende das Ergebnis, z. B. „38 PDFs verkleinert von 812,4 MB auf 141,0 MB (−83 %)“.

Jedes Dokument wird so verkleinert wie mit [PDF verkleinern](https://help.ablago.app/benutzer/aktuell/dokumente/#pdf-verkleinern) am Dokument:

- **Mit Versionierung** wird das Ergebnis die neue Version, das Original bleibt als ältere Version. **Platz wird dann erst frei, wenn die ältere Version wegfällt** – deshalb das Kästchen **Originale nicht als ältere Version behalten**: Es entfernt genau diese eine Version gleich wieder (ältere Versionen davor bleiben). In Mappentypen mit [Archivmodus](archiv.md) bleibt das Original während der Aufbewahrungsfrist trotzdem erhalten.
- **Ohne Versionierung** ersetzt das verkleinerte PDF das bisherige; das bisherige kommt in den [Papierkorb](papierkorb.md) und gibt seinen Platz frei, wenn der Papierkorb geleert wird.
- Textebene und Volltext bleiben, die Texterkennung läuft nicht neu. Bringt es bei einem Dokument weniger als 10 %, bleibt es unverändert. PDFs, die sich nicht lesen lassen (z. B. verschlüsselt), stehen mit Grund im Ergebnis.

Jedes verkleinerte Dokument hat in der Historie seiner Mappe den Eintrag „PDF bearbeitet: verkleinert von … auf …“, das [Protokoll](fehlersuche.md#protokoll) (Modul *werkbank*) die Zusammenfassung.

### Neue PDFs automatisch verkleinern

Darunter: der Schalter **Neue PDFs automatisch verkleinern** ab einer Größe (Standard 5 MB) in einer Stufe. **Standard ist aus.** Eingeschaltet gilt es für neue PDFs von außen – Hochladen, [Eingangsordner](eingangsordner.md), [Postfächer](postfaecher.md), Schnittstelle und [WebDAV](webdav.md) –, nicht für PDFs, die in Ablago bearbeitet wurden. Gespeichert wird dann **nur das verkleinerte PDF**; das Original kommt nicht in Ablago. Bringt es weniger als 10 % oder lässt sich die Datei nicht lesen, wird sie abgelegt, wie sie kam. Der Eintrag „Dokument hochgeladen“ in der Historie nennt dann „Verkleinert: automatisch von … auf …“.

!!! note "Technik: kein Ghostscript"
    Ablago verkleinert ohne Ghostscript (dessen Lizenz AGPL ist). Die Bilder rechnet **pdftoppm** aus poppler neu (ohnehin für Texterkennung und Vorschaubilder im Image), die Struktur des PDFs optimiert **qpdf** (Apache-2.0, seit Version 0.93.0 im Image). Wer ein eigenes Image baut, nimmt `apk add qpdf` mit auf – ohne qpdf funktioniert das Verkleinern auch, die Dateien werden nur etwas weniger klein.

## Im Ernstfall

1. Die Mail „Speicherplatzlimit erreicht“ kommt; nach 5 Minuten sind alle außer den Administratoren abgemeldet.
2. Als Administrator bleibst du in der Werkbank handlungsfähig und schaffst Platz:
    - alte Sicherungen unter **Werkbank → [Sicherung](sicherung.md)** löschen oder die Aufbewahrung verringern,
    - den **[Papierkorb](papierkorb.md)** leeren bzw. die Aufbewahrung verkürzen,
    - [große PDFs verkleinern](#grosse-pdfs-verkleinern) (mit „Originale nicht als ältere Version behalten“),
    - auf dem NAS andere Daten aufräumen oder das Volume vergrößern.
3. **Neu messen** (im Abschnitt *Ordner*, neben der Uhrzeit der letzten Messung). Reicht der Platz wieder, zeigen diese Seite und die Übersicht: „Wieder … frei – Wartung beenden?“
4. **Wartung beenden** – der Modus endet **nicht von selbst**, damit Ablago an der Grenze nicht hin- und herspringt.

Beendest du die Wartung, obwohl die Grenze noch unterschritten ist, startet sie nicht erneut von selbst; das Hochladen bleibt aber gesperrt, bis wieder genug Platz frei ist. Läuft gerade eine Wartung, die du selbst eingeschaltet hast, lässt Ablago sie unverändert.

Alle Übergänge – Warnschwelle unterschritten, Grenze erreicht, wieder genug Platz – stehen im [Protokoll](fehlersuche.md#protokoll) (Modul *system*).
