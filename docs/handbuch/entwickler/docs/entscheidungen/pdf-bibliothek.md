# PDF-Bibliothek: pdf-lib bleibt (#822, #823) { #pdf-bibliothek }

**Entschieden am 11.11.2026 vom Maintainer.** pdf-lib 1.17.1 bleibt und wird nur um eingebettete Schriften erweitert (`@pdf-lib/fontkit`). `@cantoo/pdf-lib` wird neu bewertet, sobald Chinesisch, Japanisch oder Koreanisch in eigenen PDFs nötig wird. Wie die PDF-Stelle heute arbeitet, steht unter [PDFs](../pdf.md).

## Bewertung der PDF-Bibliotheken (#822) { #pdf-bibliotheken }

**pdf-lib (MIT) ist die einzige verbreitete Bibliothek in reinem JavaScript, die bestehende PDFs bearbeiten und neue erzeugen kann.** pdfkit, pdfmake und jsPDF erzeugen nur neue PDFs, PDF.js liest und zeigt nur an. Die letzte Version 1.17.1 stammt von Ende 2021; seitdem gibt es keine Weiterentwicklung. Einen Fehler darin umgehen wir schon (#456). Ein Austausch ist **nicht** Teil von #541 – die Kapselung macht ihn aber überschaubar.

**Was Ablago braucht und was die Werkzeuge können** (Stand 04.11.2026):

| Werkzeug | A | B | C | D | E | F | G | H | I |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **pdf-lib 1.17.1** (heute) | ja | ja | ja | ja | ja (Umgehung #456) | teilweise | ja | ja (MIT) | **nein** (2021) |
| **@cantoo/pdf-lib** 2.11.1 | ja | ja | ja | ja | ja | teilweise | ja | ja (MIT) | ja (15.09.2026) |
| **@pdfme/pdf-lib** 6.2.8 | ja | ja | ja | ja | ja | teilweise | ja | ja (MIT) | ja (23.10.2026) |
| pdfkit | nein | nein | nur in neuen PDFs | ja | ja | nein | ja | ja (MIT) | ja |
| pdfmake (auf pdfkit) | nein | nein | teilweise, nur neue | ja (aus Beschreibung) | ja | nein | ja | ja (MIT) | ja |
| jsPDF | nein | nein | nur in neuen PDFs | ja | ja | nein | ja | ja (MIT) | ja |
| PDF.js | nein | nein | nein | nein | nein | teilweise (lesen, Text) | ja | ja (Apache-2.0) | ja |
| qpdf (im Image) | teilweise (Struktur, Objekte, Entschlüsseln) | ja | teilweise (Überlagern, Drehen; kein Text) | nein | nein | ja (`--check`, JSON) | **nein** (eigenes Programm) | ja (Apache-2.0) | ja |
| PDFium als WebAssembly (z. B. `@embedpdf/pdfium`) | ja | ja | ja (über die C-Schnittstelle) | ja | ja | teilweise | ja (WebAssembly) | ja (Apache-2.0/BSD) | Engine ja, Aufsatz jung |
| MuPDF.js | ja | ja | ja | ja | ja | ja | ja (WebAssembly) | **nein** (AGPL-3.0) | ja |

Die Spalten – wofür Ablago sie braucht und woher sie kommen:

- **A – bestehende PDFs im Inneren bearbeiten:** Bilder neu packen und Strukturen aufräumen ([#393](https://github.com/motom001/dms/issues/393)), die bereinigte Kopie für die Anzeige ohne Skripte und Aktionen ([#639](https://github.com/motom001/dms/issues/639)), Stempel in vorhandene Seiten ([#394](https://github.com/motom001/dms/issues/394)).
- **B – Seiten:** drehen, löschen, umsortieren, teilen ([#335](https://github.com/motom001/dms/issues/335)), Fotos als Seiten ([#490](https://github.com/motom001/dms/issues/490)), Seiten mehrerer Mappen zusammenfügen ([#152](https://github.com/motom001/dms/issues/152)).
- **C – auf Seiten zeichnen, auch Deckkraft, Drehen und Mischmodus:** Stempel und Wasserzeichen ([#394](https://github.com/motom001/dms/issues/394)), Farben und Mischmodus ([#799](https://github.com/motom001/dms/issues/799)).
- **D – neue PDFs erzeugen:** Textdokumente nach Plan ([#541](https://github.com/motom001/dms/issues/541)), Export mehrerer Mappen ([#152](https://github.com/motom001/dms/issues/152)), Aufkleberbogen ([#345](https://github.com/motom001/dms/issues/345)), Demo-Dokumente ([#248](https://github.com/motom001/dms/issues/248)).
- **E – Bilder einbetten:** Fotos als PDF ([#490](https://github.com/motom001/dms/issues/490)), Neuaufbau beim Schwärzen ([#392](https://github.com/motom001/dms/issues/392)), JPEG aus einem geteilten Speicher ([#456](https://github.com/motom001/dms/issues/456)).
- **F – prüfen:** PDF/A-Kennung, Verschlüsselung, Signatur und Textebene für die Archivfassung ([#631](https://github.com/motom001/dms/issues/631)).
- **G – ohne native Teile:** Die Vorgänge laufen im Arbeiter-Pool ([#542](https://github.com/motom001/dms/issues/542)); native Module widersprechen der schlanken Abhängigkeitsliste. qpdf und poppler sind eigene Programme im Image, keine Module.
- **H – Lizenz passt zu Apache-2.0:** MIT, BSD und Apache-2.0 ja; AGPL nein (deshalb sind MuPDF und Ghostscript bewusst nicht im Image).
- **I – gepflegt:** neue Versionen in den letzten zwölf Monaten und Antworten auf Meldungen.

**Mehrere kleine Pakete ersetzen pdf-lib nicht.** Für A, B und C – bestehende PDFs bearbeiten – gibt es in reinem JavaScript nur die pdf-lib-Familie (das Original und seine Abspaltungen). Ein Erzeuger wie pdfkit käme nur zusätzlich dazu.

**Wege** (die Entscheidung bereitet [#823](https://github.com/motom001/dms/issues/823) vor, siehe [unten](#pdf-entscheidung)):

| Weg | Was dafür spricht | Was dagegen spricht |
| --- | --- | --- |
| **a) pdf-lib bleibt** (heute) | Läuft stabil, alle Funktionen und Tests bauen darauf; MIT; vier kleine eigene Abhängigkeiten (`pako`, `tslib`, Standardschriften, `upng`) | Keine Fehlerbehebungen und keine Sicherheitsupdates mehr; Umgehungen wie #456 bleiben unsere Sache |
| **b) `@cantoo/pdf-lib`** (gepflegte Abspaltung) | Gleiche Schnittstelle, regelmäßige Versionen (21 Versionen 2026), MIT; Korrekturen beim Lesen; `crypto-js` seit 2.9.0 entfernt | Fast alle Änderungen seit 2025 von einer Person; seit 2.11 nur minifizierte Builds; Packaging-Regressionen (ESM-Build, `prepare: husky`); HTML-Parser und Farben als Abhängigkeiten |
| **c) Eigene Kopie** in `server/src/pdf/` | Keine neue Abhängigkeit; nur die Korrekturen, die uns betreffen | Wir werden selbst Betreuer; Dependabot und OSV erfassen die Kopie nicht mehr |
| `@pdfme/pdf-lib` (Abspaltung des Projekts pdfme) | Gleiche Schnittstelle, gepflegt (6.2.8 vom 23.10.2026), MIT | Ein einzelner Betreuer; ebenfalls zusätzliche Abhängigkeiten (HTML-Parser, Farben) |
| Mehr über qpdf (schon im Image, Apache-2.0) | Robust und gepflegt (C++); kann Seiten drehen, auswählen, umsortieren, teilen, zusammenfügen, überlagern, entschlüsseln (#827) und Strukturen optimieren – ohne neue Abhängigkeit; eigener Prozess | Zeichnet keine Texte und bettet keine Bilder ein: Stempel, Export-Seiten, Aufkleber, Textdokumente und der Neuaufbau beim Schwärzen bräuchten einen eigenen Schreiber (Ansatz im Test-Helfer `server/test/hilfen-einfach-pdf.ts`); jeder Aufruf schreibt Dateien |
| PDFium als WebAssembly (Apache-2.0, Engine von Chrome) | Sehr leistungsfähig: liest, bearbeitet, zeichnet und rendert; keine nativen Module | Der Aufsatz für JavaScript ist jung und auf den Browser ausgerichtet; groß (mehrere MB WebAssembly); Schnittstelle nah an C, also viel eigener Code |
| MuPDF, Ghostscript | Sehr leistungsfähig | AGPL – bewusst nicht im Image |

**Stand und Quellen** (04.11.2026): Versionen, Daten, Abhängigkeiten und Größen aus der npm-Registry (`npm view <paket> time dependencies dist.unpackedSize`); Funktionsumfang aus der Dokumentation der Projekte (pdf-lib.js.org, github.com/cantoo-scribe/pdf-lib, github.com/pdfme/pdfme, pdfkit.org, pdfmake.org, github.com/parallax/jsPDF, mozilla.github.io/pdf.js, qpdf.readthedocs.io, pdfium.googlesource.com, github.com/embedpdf, mupdf.readthedocs.io); Vorab-Sichtung des Forks im Kommentar zu #823. Wer die Bewertung erneuert, ändert das Datum und prüft vor allem die Spalte I.

## Entscheidungsgrundlage: bleiben, cantoo, eigene Kopie (#823) { #pdf-entscheidung }

**Entschieden (11.11.2026, Maintainer): Weg a – pdf-lib 1.17.1 bleibt** und wird nur um die nötigen Funktionen erweitert: `@pdf-lib/fontkit` 1.1.1 für eingebettete Schriften, mit drei Pflicht-Vorkehrungen (Schrift aufbereiten, `ccmp: false`, NFC; siehe [Schriften der eigenen PDFs](../pdf.md#pdf-schriften)). `@cantoo/pdf-lib` wird neu bewertet, sobald Chinesisch, Japanisch oder Koreanisch in eigenen PDFs nötig wird. Die Grundlage dafür:

**Probelauf (11.11.2026, Kommentar in #826)** – Testtext in sechs Sprachen, Noto Sans als Teilmenge in Brief und Stempel:

| | vorher | a: + `@pdf-lib/fontkit` 1.1.1 | b: cantoo + `@cantoo/fontkit` |
| --- | --- | --- | --- |
| Laufzeit-Module im Image | 21,8 MB | 26,1 MB | 42,8 MB |
| „?“ im Ergebnis | 229 | 0 | 0 |
| Chinesisch, Japanisch, Koreanisch | – | geht nicht (Teilmenge der CFF-Schrift ungültig) | geht |
| Arabisch gemischt mit Ziffern | – | Ziffern verdreht (keine Bidi-Ordnung) | ebenso |
| `npm audit` | 0 | 0 | 0 |

Mit cantoo liefen 473 von 474 PDF-Tests grün (die Abweichung: #456 ist dort behoben), die Bomben scheitern weiter an `ladePdf()`, aber jeder Import lädt `culori`, einen HTML-Parser und `html-entities`, und `@pdf-lib/fontkit` stürzt mit cantoo ab.

Was vor der Entscheidung geprüft war (Stand 04.11.2026):

**Lebenszeichen** (npm-Registry): `pdf-lib` zuletzt 1.17.1, Paket zuletzt geändert am 12.05.2022. `@cantoo/pdf-lib`: Versionen je Jahr 2021: 20, 2022: 9, 2023: 39, 2024: 20, 2025: 13, 2026: 21; zuletzt 2.11.1 vom 15.09.2026; sechs Personen dürfen auf npm veröffentlichen, die Commits seit 2025 stammen laut Vorab-Sichtung fast alle von einer Person. `@pdfme/pdf-lib` zuletzt 6.2.8 vom 23.10.2026. Eine Wiederbelebung des Originals ist nicht bekannt.

**Abhängigkeiten von cantoo 2.11.1:** `tslib`, `culori`, `fflate`, `node-html-better-parser`, dazu `html-entities` als Peer. `crypto-js`, `pako`, `color`, `@pdf-lib/upng` und `@pdf-lib/standard-fonts` sind laut CHANGELOG entfernt bzw. eingebettet. HTML-Parser und `culori` dienen dem Zeichnen von SVG und HTML; ob sie bei unseren Aufrufen geladen werden, zeigt erst der Probelauf. Paketgröße entpackt: 26,3 MB (pdf-lib 1.17.1: 19,5 MB) – der größte Teil sind mehrere Builds.

**Umfang einer eigenen Kopie (Weg c):** pdf-lib 1.17.1 hat 139 Quelldateien mit 22.740 Zeilen TypeScript. Davon nutzen wir die Formulare nicht (`api/form`, `core/acroform`, Anmerkungen: zusammen etwa 6.900 Zeilen); übrig bleiben etwa 15.800 Zeilen für Parser, Objekte, Ströme, Schreiber, Einbetten und die Seiten-API. Dazu kämen Standardschriften, `upng` und `pako` (oder `node:zlib`). Für den Betrieb bräuchte es einen festen Ablauf: monatlich die Releases und Security-Advisories von cantoo und dem Original abgleichen, eine Notiz in `SECURITY.md`, dass wir den Code selbst betreuen, und die [Fuzz-Tests](../pdf.md#pdf-fuzz) als Pflicht. Geschätzter Aufwand: einige Stunden im Monat, mehr bei einer Meldung.

**Was die Tests heute zeigen (unabhängig vom Weg):**

- Alle Ladestellen der PDF-Stelle laufen im Arbeiter-Pool und laden über `ladePdf()` – die Prüfung `pdf-stelle.test.ts` hält das fest ([Grenzen der Lesestellen](../pdf.md#pdf-grenzen)).
- Die [Fuzz-Tests](../pdf.md#pdf-fuzz) fanden zwei Arten von Fehlern, beide behoben:
    - **Hänger und Speicher:** Querverweis-Ströme mit unmöglichen Breiten (`/W [1 2 2147483647]`) oder Bereichen (`/Index [0 2147483647]`) ließen pdf-lib 1.17.1 beim Laden Milliarden Schritte laufen – ein PDF von gut 1 KB hielt einen Arbeiter bis zur Zeitgrenze von 10 Minuten fest oder füllte seinen Speicher. `ladePdf()` prüft diese Angaben jetzt gegen die entpackte Länge des Stroms (auch `/N` und `/First` bei Objektströmen, höchstens 10 Millionen Einträge) und lehnt Unmögliches mit 422 ab. Die Beispiele liegen im Korpus (`querverweis-*.pdf`). Ob cantoo hier robuster ist, gehört zum Probelauf.
    - **Meldungen:** Kaputte Strukturen (kreisförmiger Seitenbaum, falsche Objektarten) endeten beim Stempeln, bei den Seiten und beim Verkleinern mit Fehlern aus pdf-lib. Jetzt kommt „lässt sich nicht als PDF lesen“ bzw. „ließ sich nicht lesen und darum nicht stempeln“.

**Damals offen, inzwischen mit dem Probelauf oben beantwortet:** der Probelauf mit `@cantoo/pdf-lib` – laufen alle PDF-Tests unverändert grün, ist #456 dort behoben, wie groß wird das Image, wie viel Speicher braucht es, scheitert das Bomben-PDF auch dort an `ladePdf()` (sollte es: die Prüfung läuft vor der Bibliothek) und welche Abhängigkeiten lädt es bei unseren Aufrufen. So lässt er sich ohne Änderung am Repository nachholen: cantoo in ein leeres Verzeichnis installieren und die Tests mit einem Lade-Hook starten, der `pdf-lib` auf dieses Verzeichnis umlenkt (`node --import <hook> --import tsx --test test/pdf*.test.ts test/stempel.test.ts …`). Die Liste der Änderungen gegenüber 1.17.1 (Lesen, neue Funktionen, Sonstiges) steht in der Vorab-Sichtung in #823 und ist hier nicht erneut geprüft.

**Kriterien der Sicherheitsdurchsicht** (Kommentar zu #823): a) nur mit den Schutzmaßnahmen um pdf-lib herum; b) Haupteinwand `crypto-js` entfällt, offen bleiben minifizierte Builds, Packaging und ein einzelner Betreuer – mit fester Version und geprüftem Lockfile; c) fester Abgleich, Notiz in `SECURITY.md`, Fuzzing Pflicht. Arbeiter, Zeitgrenze, `ladePdf()` und die Fuzz-Tests bleiben bei jedem Weg.
