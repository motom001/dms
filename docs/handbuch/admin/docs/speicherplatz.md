# Systemzustand

Wie geht es dem Server gerade? Das zeigt **Werkbank → Wartung und Fehlersuche → Systemzustand** – bisher vor allem den **Speicherplatz**. (Früher hieß der Bereich *Speicherplatz* und stand unter *Einstellungen*; alte Links und Lesezeichen führen hierher.)

Läuft die Platte voll, können beim Speichern oder Hochladen Daten verloren gehen. Das DMS misst deshalb selbst, wie viel Platz frei ist, warnt rechtzeitig und hält sich an der Grenze selbst an. Oben auf der Seite stehen die **Schwellen**, darunter die **Ordner** mit ihrer Belegung, ganz unten **Große PDFs verkleinern**.

--8<-- "ausgeblendet-schritt.md"

![Werkbank → Systemzustand](bilder/werkbank-speicherplatz.png)

## Warnschwelle und Grenze

Ganz oben auf der Seite. Beide stellst du in **GB frei** oder **% frei** ein; Prozent beziehen sich auf die Größe des jeweiligen Datenträgers. Sie gelten für jeden Ordner einzeln.

| Stufe | Standard | Was passiert |
| --- | --- | --- |
| **Warnschwelle** | unter 10 % frei | Hinweis in der [Übersicht](uebersicht.md) und auf dieser Seite, **eine Mail** an alle Administratoren (einmal je Unterschreiten – erst wenn wieder genug frei war, gibt es beim nächsten Mal eine neue). Alle arbeiten normal weiter. |
| **Grenze** | unter 2 GB frei | **Hochladen sofort gesperrt** (neue Dokumente, Logos); Werte speichern geht noch. Mail an alle Administratoren, und der [Wartungsmodus](wartungsmodus.md) startet mit **5 Minuten Vorlauf** und dem Text **„Speicherplatzlimit erreicht“**. |

Die Warnschwelle muss mehr freien Platz verlangen als die Grenze – sonst käme die Warnung erst danach.

## Was gemessen wird

Gemessen werden die drei festen Ordner im Container (siehe [Ordner und Volumes](installation.md#ordner-und-volumes)) – jede Minute und zusätzlich vor jedem Hochladen:

| Ordner | Inhalt |
| --- | --- |
| `/data/files` | Dokumente, Logos, Bilder gemeldeter Fehler |
| `/data/geheim` | Schlüssel und Notfallzugang |
| `/data/sicherung` | Sicherungen |

Je Ordner zeigt die Seite belegt, frei und die Größe des Datenträgers, als Balken mit Marken für Warnschwelle und Grenze. Liegen alle drei auf demselben Datenträger (der übliche Fall auf dem NAS), zeigt die Seite **einen** Balken „Ein Datenträger für Dateien, Schlüssel und Sicherungen“ mit den Ordnern darunter – und den Hinweis, dass die Sicherungen damit auf derselben Platte liegen wie die Dokumente. Liegen nur einige auf demselben Datenträger, steht das beim jeweiligen Ordner. Darunter steht, wie viel davon die **Vorschaubilder** der Dokumente belegen (Ordner `/data/files/vorschau`, meist wenige Kilobyte je Dokument). Sie werden **nicht gesichert** – nach einer Wiederherstellung entstehen sie beim Anzeigen oder über **Wartungsoperationen → Vorschaubilder nachholen** neu. **Werkbank → Technik** zeigt dieselben Zahlen in der Übersicht für den Support.

!!! note "Die Datenbank wird nicht gemessen"
    Bei zwei Containern läuft PostgreSQL in einem eigenen Container; sein Volume kann das DMS nicht sehen. Bei [dms-komplett](https://motom001.github.io/dms/installieren/aktuell/komplett/) liegt die Datenbank im vierten Ordner `/data/postgres` – auch den misst das DMS nicht. Liegen alle Ordner auf derselben Platte des NAS (der übliche Fall), reicht die Messung trotzdem. Liegt die Datenbank auf einer anderen Platte, behalte deren Platz in der Speicherverwaltung des NAS im Blick.

## Große PDFs verkleinern {#grosse-pdfs-verkleinern}

Gescannte und fotografierte PDFs sind oft viel größer als nötig: Ein Scanner mit 600 dpi oder ein Foto-PDF vom Handy legt Bilder ab, von denen 150 dpi zum Lesen und Drucken reichen. Unter den Ordnern listet **Große PDFs verkleinern** die PDF-Dokumente ab einer Größe (1 bis 20 MB, Standard 2 MB), **größte zuerst**, mit der geschätzten Größe danach. Die Liste hat eine feste Höhe und zeigt höchstens die 200 größten; geschätzt werden die ersten 60.

1. **Stufe** wählen: **Bildschirm** (≈ 100 dpi), **Standard** (≈ 150 dpi, Vorgabe) oder **Druck** (≈ 300 dpi).
2. Dokumente ankreuzen – vorgewählt sind alle, bei denen es sich lohnt (mindestens 10 % kleiner). Unten steht, wie viel Platz geschätzt frei wird.
3. Auf Wunsch **Originale nicht als ältere Version behalten** anhaken (siehe unten).
4. **… PDFs verkleinern** – nach einer Rückfrage läuft die Arbeit im Hintergrund; die Seite zeigt den Fortschritt („PDFs verkleinern: 12 von 40“) und am Ende das Ergebnis, z. B. „38 PDFs verkleinert von 812,4 MB auf 141,0 MB (−83 %)“.

Jedes Dokument wird so verkleinert wie mit [PDF verkleinern](https://motom001.github.io/dms/benutzer/aktuell/dokumente/#pdf-verkleinern) am Dokument:

- **Mit Versionierung** wird das Ergebnis die neue Version, das Original bleibt als ältere Version. **Platz wird dann erst frei, wenn die ältere Version wegfällt** – deshalb das Kästchen **Originale nicht als ältere Version behalten**: Es entfernt genau diese eine Version gleich wieder (ältere Versionen davor bleiben). In Mappentypen mit [Archivmodus](archiv.md) bleibt das Original während der Aufbewahrungsfrist trotzdem erhalten.
- **Ohne Versionierung** ersetzt das verkleinerte PDF das bisherige; das bisherige kommt in den [Papierkorb](papierkorb.md) und gibt seinen Platz frei, wenn der Papierkorb geleert wird.
- Textebene und Volltext bleiben, die Texterkennung läuft nicht neu. Bringt es bei einem Dokument weniger als 10 %, bleibt es unverändert. PDFs, die sich nicht lesen lassen (z. B. verschlüsselt), stehen mit Grund im Ergebnis.

Jedes verkleinerte Dokument hat in der Historie seiner Mappe den Eintrag „PDF bearbeitet: verkleinert von … auf …“, das [Protokoll](fehlersuche.md#protokoll) (Modul *werkbank*) die Zusammenfassung.

### Neue PDFs automatisch verkleinern

Darunter: **Neue PDFs beim Ablegen verkleinern** ab einer Größe (Standard 5 MB) in einer Stufe. **Standard ist aus.** Eingeschaltet gilt es für neue PDFs von außen – Hochladen, [Eingangsordner](eingangsordner.md), [Postfächer](postfaecher.md), Schnittstelle und [WebDAV](webdav.md) –, nicht für PDFs, die im DMS bearbeitet wurden. Gespeichert wird dann **nur das verkleinerte PDF**; das Original kommt nicht ins DMS. Bringt es weniger als 10 % oder lässt sich die Datei nicht lesen, wird sie abgelegt, wie sie kam. Der Eintrag „Dokument hochgeladen“ in der Historie nennt dann „Verkleinert: automatisch von … auf …“.

!!! note "Technik: kein Ghostscript"
    Das DMS verkleinert ohne Ghostscript (dessen Lizenz AGPL ist). Die Bilder rechnet **pdftoppm** aus poppler neu (ohnehin für Texterkennung und Vorschaubilder im Image), die Struktur des PDFs optimiert **qpdf** (Apache-2.0, seit Version 0.93.0 im Image). Wer ein eigenes Image baut, nimmt `apk add qpdf` mit auf – ohne qpdf funktioniert das Verkleinern auch, die Dateien werden nur etwas weniger klein.

## Im Ernstfall

1. Die Mail „Speicherplatzlimit erreicht“ kommt; nach 5 Minuten sind alle außer den Administratoren abgemeldet.
2. Als Administrator bleibst du in der Werkbank handlungsfähig und schaffst Platz:
    - alte Sicherungen unter **Werkbank → [Sicherung](sicherung.md)** löschen oder die Aufbewahrung verringern,
    - den **[Papierkorb](papierkorb.md)** leeren bzw. die Aufbewahrung verkürzen,
    - [große PDFs verkleinern](#grosse-pdfs-verkleinern) (mit „Originale nicht als ältere Version behalten“),
    - auf dem NAS andere Daten aufräumen oder das Volume vergrößern.
3. **Neu messen** (im Abschnitt *Ordner*, neben der Uhrzeit der letzten Messung). Reicht der Platz wieder, zeigen diese Seite und die Übersicht: „Wieder … frei – Wartung beenden?“
4. **Wartung beenden** – der Modus endet **nicht von selbst**, damit das DMS an der Grenze nicht hin- und herspringt.

Beendest du die Wartung, obwohl die Grenze noch unterschritten ist, startet sie nicht erneut von selbst; das Hochladen bleibt aber gesperrt, bis wieder genug Platz frei ist. Läuft gerade eine Wartung, die du selbst eingeschaltet hast, lässt das DMS sie unverändert.

Alle Übergänge – Warnschwelle unterschritten, Grenze erreicht, wieder genug Platz – stehen im [Protokoll](fehlersuche.md#protokoll) (Modul *system*).
