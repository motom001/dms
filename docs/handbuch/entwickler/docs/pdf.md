# PDFs { #pdf }

Wie Ablago PDFs liest, bearbeitet, erzeugt und im Browser zeigt. Warum pdf-lib bleibt, steht unter [Entscheidungen](entscheidungen/pdf-bibliothek.md).

## PDF-Stelle { #pdf-stelle }

Alle Arbeiten an PDFs mit **pdf-lib** liegen in einem Ordner: `server/src/pdf/` (#541). Nur dort wird pdf-lib eingebunden; die Prüfung `server/test/pdf-stelle.test.ts` (läuft mit `npm test` in der CI) schlägt fehl, sobald Server, Oberfläche oder `shared` pdf-lib anderswo importieren – auch per `import()` oder `require()`. Tests dürfen pdf-lib weiter nutzen, um erzeugte PDFs zu untersuchen.

```
server/src/pdf/index.ts          öffentliche Schnittstelle – alle Module importieren von './pdf'
server/src/pdf/seiten.ts         Seiten zählen, drehen, löschen, umsortieren, teilen, zusammenfügen, Fotos als Seiten
server/src/pdf/stempel.ts        Stempel und Fußzeile beim Weitergeben, Bild als A4-Seite
server/src/pdf/verkleinern.ts    Bilder herunterrechnen (über pdftoppm), Struktur aufräumen (qpdf)
server/src/pdf/schwaerzen.ts     Seiten neu aufbauen, schwärzen, Textebene ohne geschwärzte Wörter
server/src/pdf/schreiber.ts      Textdokumente nach Plan (Auskunft, Löschkonzept, Löschprotokoll)
server/src/pdf/export.ts         PDF mehrerer Mappen
server/src/pdf/aufkleber.ts      Aufkleberbogen mit Barcode
server/src/pdf/anzeige.ts        bereinigte Kopie für die Anzeige im Browser (#639)
server/src/pdf/demo-dokumente.ts Demo-Dokumente
server/src/pdf/schrift.ts        Noto Sans als eingebettete Teilmenge für alle eigenen PDFs, Ersatzzeichen (#826)
server/src/pdf/bild.ts, puffer.ts, text.ts   Bildart, JPEG-Maße, EXIF; Umgehung #456; Dateigröße
```

**Regeln für neuen Code**

- Fachliches bleibt draußen: Was auf ein PDF kommt (Texte, Felder ohne Passwörter, Rechte, Platzhalter), entscheidet das jeweilige Modul (`export.ts`, `auskunft.ts`, `ausgabe.ts` …). In die PDF-Stelle geht nur, **wie** gezeichnet oder umgebaut wird.
- Die Vorgänge nehmen und liefern **einfache Daten** – Bytes (`Buffer`/`Uint8Array`), Zahlen, Texte, Listen –, nie Objekte von pdf-lib. Textdokumente beschreibt der Aufrufer als Plan (`Anweisung[]`: Text, Linie, Abstand, Tabelle, neue Seite) und lässt ihn mit `textdokumentPdf()` zeichnen. So laufen alle Vorgänge im [Arbeiter-Pool](server.md#arbeiter-pool) (#542): `pdf/index.ts` gibt sie dorthin; ein neuer Vorgang kommt zusätzlich in `arbeit/vorgaenge.ts`.
- PDFs lädt die PDF-Stelle nur über `ladePdf()` (`pdf/laden.ts`, #823), nie direkt mit `PDFDocument.load`: Es prüft vorher, wie groß sich die Objekt- und Querverweis-Ströme entpacken (höchstens 64 MB je Strom, 256 MB zusammen) – sonst belegt ein präpariertes PDF von wenigen MB beim Laden mehrere GB, an der Speichergrenze der Arbeiter vorbei. Außerdem müssen ihre Angaben (`/W`, `/Index`, `/Size`, `/N`, `/First`) zur Länge des Stroms passen; sonst liefe pdf-lib beim Laden fast endlos.
- Bilder gehen nur über `eigenerPuffer()` an pdf-lib (#456: pdf-lib übersieht den Versatz eines Buffers im gemeinsamen Speicher und meldet bei JPEGs „SOI not found“).
- Text kommt nur über `schriften()` und `pdfText()` aus `pdf/schrift.ts` aufs PDF (#826): Noto Sans als Teilmenge, Text nach NFC, fehlende Zeichen als „�“. Keine Standardschriften (`StandardFonts`) für neuen Text; Ausnahme sind nur die Codes im Notfallblatt (Courier, reines ASCII). Mehr unter [Schriften der eigenen PDFs](#pdf-schriften).
- Die PDF-Stelle schreibt nichts ins Protokoll und liest keine Einstellungen. Was der Aufrufer wissen soll, steht im Ergebnis (z. B. `hinweise` beim Verkleinern). Einzige Ausnahme ist der Hinweis auf fehlende Zeichen: Ihn gibt der Arbeiter neben dem Ergebnis zurück (`zeichen` in der Antwort), und der Pool schreibt ihn ins Protokoll.
- Fachfehler mit verständlicher Meldung (`Fachfehler(422, …)`) dürfen aus der PDF-Stelle kommen, etwa für verschlüsselte oder kaputte PDFs.

### Schriften der eigenen PDFs (#826) { #pdf-schriften }

Alle PDFs, die Ablago selbst erzeugt – Stempel, Brief, Mappen-Export, Aufkleber, Textdokumente (Auskunft, Löschkonzept, Löschprotokoll), Notfallblatt, Demo-Dokumente und die unsichtbare Textebene beim Schwärzen –, betten **Noto Sans** (SIL Open Font License 1.1) als **Teilmenge** ein: nur die Zeichen, die vorkommen. Vorher waren es die Standardschriften Helvetica und Courier mit WinAnsi; alles außerhalb von Westeuropa wurde still zu „?“.

- **Schnitte:** Normal, Fett, Kursiv, FettKursiv und Noto Sans Mono für `Code` im Brief. Das Notfallblatt behält Courier fett für Schlüssel, Codes und Ablage-Id – sie bestehen nur aus ASCII.
- **Zeichenumfang:** Lateinisch mit Erweiterungen (Türkisch, Polnisch, Tschechisch, Rumänisch …) und Vietnamesisch, Griechisch, Kyrillisch, dazu Satz-, Währungs- und einige Sonderzeichen. Die Liste steht in `BEREICHE` des Skripts unten.
- **Dateien:** `server/schriften/` (fünf Schnitte, zusammen 1,4 MB, mit `OFL.txt`) im Repository und im Image. Der Docker-Bau braucht so kein Python.
- **Einmal je Arbeiter:** `pdf/schrift.ts` liest die Dateien einmal, fontkit wertet jede einmal aus und merkt sich gesetzte Texte. Jedes PDF bettet danach nur seine Teilmenge ein. Der Name der Teilmenge bekommt beim Speichern das übliche Kürzel aus sechs Großbuchstaben (`ABCDEF+NotoSans-Regular`, aus den verwendeten Zeichen). Gleiche Zeichen ergeben gleiche Dateien, die Demo-Dokumente bleiben bei gleichem Startwert gleich.

**Drei Pflicht-Vorkehrungen** – ohne sie ist das Ergebnis falsch, obwohl es auf den ersten Blick stimmt:

1. **Schrift aufbereiten:** `server/werkzeuge/schriften/aufbereiten.py` (fontTools) kürzt die Schrift auf die Bereiche oben, entfernt das Hinting und schreibt sie mit `glyf.padding = 4` neu. Mit den Originaldateien beschädigt `@pdf-lib/fontkit` 1.1.1 die Teilmenge: Im Probelauf waren etwa 60 % der Zeichen unsichtbar, `pdftotext` meldete trotzdem alles richtig. Neue Fassung von Noto Sans: `python3 server/werkzeuge/schriften/aufbereiten.py <quellordner> server/schriften`, danach `schriften.test.ts`.
2. **`features: { ccmp: false }` beim Einbetten:** Sonst fasst fontkit Zeichen zusammen, und Kopieren oder Suchen liefert falschen Text (aus „Thị Liste office“ wird „Thị Lịste offịce“). Die Merkmale für Abstände (`kern`, `mark`, `mkmk`) sind ebenfalls aus. pdf-lib wertet sie nicht aus, aus spart nur Zeit.
3. **Text nach NFC:** pdf-lib setzt kombinierende Zeichen ohne ihren Versatz. `pdfText()` wandelt jeden Text vorher um, so steht „ễ“ als ein Zeichen im PDF.

Dazu eine Umgehung in `schrift.ts`: fontkit merkt sich jede Glyphe mit den Zeichen ihres ersten Gebrauchs. Weil die Schrift je Arbeiter nur einmal ausgewertet wird, trägt `schrift.ts` die Zeichen nach, sobald sie bekannt sind. Sonst fehlte im zweiten PDF z. B. dem „u“ (Bestandteil von „ü“) die Zuordnung, und Kopieren lieferte „�“.

**Fehlt ein Zeichen** in der Schrift (Arabisch, Hebräisch, Chinesisch, Emoji …), steht im PDF das Ersatzzeichen „�“. Unsichtbare Zeichen wie Variantenwähler fallen weg. Der Arbeiter gibt die fehlenden Zeichen neben dem Ergebnis zurück, und der Pool schreibt **einmal je Auftrag** eine Warnung ins Protokoll (Modul „Dokumente“, mit Vorgang und Unicode-Nummern).

**Messung** (11.11.2026, Brief mit Beispieltexten in sechs Sprachen und allen fünf Schnitten aus `server/test/hilfen-schriften.ts`, Mittel über zehn Briefe mit geändertem Text):

| | vorher (Helvetica, WinAnsi) | Noto Sans als Teilmenge |
| --- | --- | --- |
| Größe | 13,6 KB, 217 „?“ | 41,9 KB, kein „?“ |
| Zeit je Brief | 14 ms | 36–41 ms (erster Brief im Arbeiter: 170 ms, liest und wertet die Schriften aus) |
| Stempel auf eine leere Seite (PDF vorher 0,6 KB) | 1,7 KB, 5 ms | 4,8 KB, 20 ms |

**Standardschriften bleiben nicht für reinen WinAnsi-Text**, obwohl sie kleiner und schneller wären – warum, steht unter [Entscheidungen](entscheidungen/eingebettete-schriften.md).

**Grenzen:** Schriften von rechts nach links (Arabisch, Hebräisch) und Chinesisch, Japanisch, Koreanisch kommen **nicht** mit:

- Die CJK-Schriften sind CFF-Schriften. Deren Teilmenge bildet fontkit 1.1.1 ungültig.
- Für Arabisch und Hebräisch fehlt die Bidi-Ordnung, Ziffern stünden verdreht.
- Eine CJK-Schrift allein hat gut 16 MB (Noto Sans CJK SC, ein Schnitt). Das passt nicht zur Grenze für die Größe des Images und zu Mission 2 („flott auch auf kleiner Hardware“).

Kommen solche Sprachen dazu, gehören die Schriften in **Sprachpakete** ([#731](https://github.com/motom001/dms/issues/731)), und `@cantoo/pdf-lib` wird neu bewertet ([Entscheidung](entscheidungen/pdf-bibliothek.md#pdf-entscheidung)). Bis dahin erscheint „�“ mit Hinweis im Protokoll.

**Tests:** `server/test/schriften.test.ts`. Er liest die Beispieltexte aus dem Brief wieder aus, prüft `ccmp` und NFC, bettet die Teilmenge mit ToUnicode und Kürzel ein und deckt alle Erzeuger ab. Vor allem prüft er die **Anzeige**: Jedes Zeichen der Beispiele wird je Schnitt einzeln mit `pdftoppm` gerendert und muss Tinte zeigen, im zweiten PDF desselben Arbeiters. Mit einer unaufbereiteten Schrift schlägt genau dieser Test fehl.

### Tests mit kaputten PDFs (#823) { #pdf-fuzz }

`server/test/pdf-fuzz.test.ts` füttert absichtlich beschädigte und zufällig veränderte PDFs in alle Lesestellen – über den Arbeiter-Pool wie im Betrieb: Seiten, Verkleinern (Schätzung), Stempel, Anzeige, Archivprüfung und Textebene. Erwartet wird: kein Absturz des Arbeiters (500), kein Speicherabbruch (507), kein Hänger (504, und jeder Fall unter 30 Sekunden) und bei Seiten, Verkleinern und Stempel eine verständliche Meldung (422). Anzeige und Archivprüfung fangen Fehler selbst ab (nur Herunterladen bzw. „nicht lesbar“).

- **Korpus:** `server/test/pdf-korpus/*.pdf` – kleine, kaputte Beispiele (kreisförmiger Seitenbaum, tiefe Verschachtelung, falsche Querverweise und Längen, abgeschnitten, Verweise ins Leere, kaputte Verschlüsselung, kein Kopf). Die Objektstrom-Bombe erzeugt der Test selbst.
- **Zufall:** Ein eigener kleiner Mutator (Bytes kippen, abschneiden, Bereiche löschen oder doppeln, Zahlen verfälschen, Ströme tauschen, Syntax einstreuen, `startxref` verbiegen) mit festem Startwert – ohne neue Abhängigkeit.
- **Laufen lassen:** `cd server && node --import tsx --test test/pdf-fuzz.test.ts`. In der normalen CI 120 Fälle (Vorgabe). Mehr: `DMS_FUZZ_FAELLE=5000`, anderer Startwert: `DMS_FUZZ_SEED=7`. Nach Zeitplan läuft `.github/workflows/fuzz.yml` (wöchentlich und von Hand) mit 5.000 Fällen und wechselndem Startwert.
- **Fund nachstellen:** Die Meldung nennt Startwert, Fall und Ausgangs-PDF. Mit `DMS_FUZZ_AUSGABE=/tmp/funde` liegt das auslösende PDF danach dort.
- **Neues kaputtes Beispiel hinzufügen:** Die Datei (klein halten, ein paar KB) unter einem sprechenden Namen nach `server/test/pdf-korpus/` legen – sie ist dann automatisch Teil des Korpus und geht in alle Lesestellen. Nur Beispiele ohne echte Daten, mit Persona-Namen.
- **Gefundene Fehler:** Lücken mit Sicherheitsbezug (Absturz, Speicher, Hänger) bekommen erst ein öffentliches Issue mit Einzelheiten, wenn der Fix gemergt ist; vorher vertraulich melden, wie in `SECURITY.md` beschrieben.

**Scorecard „Fuzzing“:** Die Prüfung erkennt OSS-Fuzz, ClusterFuzzLite und Fuzz-Funktionen einiger Sprachen, bei JavaScript und TypeScript Property-Based-Tests mit `fast-check`. Den eigenen Mutator erkennt sie nicht; die Prüfung bleibt also unerfüllt, solange `fast-check` (nur `devDependencies`) nicht dazukommt. Das entscheidet der Maintainer, ebenso die Angaben bei Scorecard und beim OpenSSF Best-Practices-Badge.

### Grenzen der Lesestellen (#542, #823) { #pdf-grenzen }

- Jede Stelle, die mit pdf-lib ein fremdes PDF öffnet, liegt in `server/src/pdf/` und läuft über `arbeite()` im Arbeiter-Pool. `pdf-stelle.test.ts` prüft: `PDFDocument.load` steht nur in `pdf/laden.ts`; außerhalb der PDF-Stelle gibt es nur Typen aus ihren Modulen; `pdf/index.ts` gibt direkt nur Helfer weiter, die kein PDF laden; jedes Modul mit `ladePdf()` kennt der Arbeiter (`arbeit/vorgaenge.ts`). Mit `DMS_ARBEITER=0` laufen die Vorgänge bewusst im Hauptfaden.
- poppler (`pdftotext`, `pdftoppm`, `pdfinfo`) und qpdf laufen als eigene Prozesse mit Zeitgrenze.
- **Speicher:** Die Grenze von 1,5 GB gilt **je Arbeiter** und erfasst nur den JS-Heap; die Entpack-Grenze in `ladePdf()` schützt vor großen `ArrayBuffer`. Bei N Arbeitern kann der Bedarf im Grenzfall N × 1,5 GB betragen. Auf kleinen Geräten (Raspberry Pi mit 2–4 GB) deshalb `DMS_ARBEITER=1` setzen.

### Geschützte PDFs (#827) { #pdf-geschuetzt }

`server/src/dateien/entsperren.ts` erkennt geschützte PDFs (`qpdf --requires-password`, nur wenn `/Encrypt` im Inhalt steht) und legt mit `qpdf --decrypt` eine **entsperrte Fassung** an. Sie liegt wie die umgewandelten Fassungen (#577) unter `<haushalt>/fassungen/` am Prüfwert des Originals, mit `entsperrt` in den Angaben (`FassungInfo`). Vorschau (`vorschau.ts`), Volltext (`texterkennung.ts`), Stempel und Verkleinern (`ausgabe.ts`, über `Ausgabekontext.entsperrt`), Archivfassung (`archivfassung.ts`, Quelle `lesefassung`) und die Anzeige (`GET /dokumente/{id}/inhalt` ohne `herunterladen`) nehmen sie; Herunterladen liefert das Original.

- **Passwort:** nur über die Standardeingabe (`--password-file=-`), nie in der Befehlszeile; nie in Datenbank, Protokoll oder Historie. Ein Test prüft die Argumente von qpdf.
- **Grenzen:** fünf falsche Passwörter je Person und Dokument in 15 Minuten, danach 429; qpdf mit Zeitgrenze (60 s, gemerkte Passwörter 20 s je Versuch, 2 Minuten je Dokument).
- **Gemerkte Passwörter:** Einstellung `dokpasswoerter_<konto>`, jedes Passwort einzeln mit dem Tresor verschlüsselt (Art „Gemerkte Passwörter für Dokumente“ in Werkbank → Verschlüsselung, beim Schlüsselwechsel umgeschlüsselt). Routen `/api/konto/dokument-passwoerter…` nur in der eigenen Sitzung (kein API-Schlüssel, keine Vertretung); Anzeigen und Ändern des Passworts nur nach `…/bestaetigen` (5 Minuten je Sitzung). Neue Post mit „Für“ probiert die Passwörter dieser Person (`DokumenteDienst.neueDateien` → `PdfEntsperren.neu`).

### Anzeige von PDFs im Browser (#639) { #pdf-anzeige }

Dateien liefert der Server mit `dateiKoepfe` (`routen.ts`) aus: alles außer PDF mit einer strengen Content-Security-Policy samt `sandbox`. PDFs brauchen den eingebauten Betrachter des Browsers und bekommen diese Policy nicht – deshalb sieht der Browser **nie das Original**, wenn er ein PDF anzeigt:

- `fuerAnzeige()` in `http/routen-kontext.ts` greift bei jeder Antwort mit `anzeigen: true` und `application/pdf` ohne API-Schlüssel – also beim Ansehen in der Oberfläche: `GET /api/dokumente/:id/inhalt`, `…/versionen/:nummer/inhalt`, `…/fassung` und `…/archivfassung` (jeweils ohne `herunterladen`).
- `pdfanzeige.ts` holt die bereinigte Kopie aus der PDF-Stelle (`pdf/anzeige.ts`, im Arbeiter-Pool) und hält sie je SHA-256 des Inhalts im Speicher (höchstens 256 MB, älteste zuerst hinaus; Fehlschläge werden nicht gemerkt).
- Entfernt werden JavaScript (`/JS`, Namensbaum `JavaScript`), automatische Aktionen (`/OpenAction`, `/AA`), die Aktionen `SubmitForm`, `Launch`, `ImportData`, `GoToR`, `GoToE`, Medien-Aktionen, XFA-Formulare, eingebettete Dateien (`/EF`, `EmbeddedFiles`, Ströme `/EmbeddedFile`) und Anmerkungen für Dateianhänge und Medien. Links (`URI`) und Sprünge im Dokument bleiben.
- Lässt sich das PDF nicht bereinigen (verschlüsselt, beschädigt), kommt ein kurzer Text (`text/plain`, mit Sandbox) mit `X-DMS-Anzeige: nur-herunterladen`; sonst steht `X-DMS-Anzeige: bereinigt` im Kopf.
- **Herunterladen, Weitergeben, Export, E-Mail und API-Schlüssel** (auch Pakete) bekommen weiter das Original bzw. die gestempelte Ausgabe.
