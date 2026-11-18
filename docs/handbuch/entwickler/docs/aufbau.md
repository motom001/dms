# Aufbau

Diese Seite ist die **Karte** von Ablago: wo was liegt, welchen Weg eine Anfrage nimmt und wer wen aufrufen darf. Die Einzelheiten stehen auf eigenen Seiten, die unten verlinkt sind. Warum etwas so gebaut ist, steht unter [Entscheidungen](entscheidungen/index.md).

Neu hier? Dann zuerst [Loslegen](loslegen.md) (Projekt starten und prüfen), danach diese Seite. Wer etwas Neues einbaut, findet die Schritte unter [Neues einbauen](checklisten.md).

## Auf einen Blick { #auf-einen-blick }

```
server/           Fastify-API, PostgreSQL (postgres.js), SQL-Migrationen (server/migrations/), Tests (server/test/)
web/              React-Oberfläche (Vite), Tests (web/test/), Rauchtests im Browser (web/rauchtest/)
shared/           Fachmodell, Prüfregeln, Texte (src/sprachen/), Rundgänge und Anker (entdecken/) – von Server und Oberfläche genutzt
deploy/           Compose-Vorlagen für NAS und Server, Start-Skript und Probe für dms-komplett
docs/             Handbücher (MkDocs), Bildskripte, Release-Notizen (releases/, Schnipsel in releases/neu/), Messungen (messungen/)
docs/glossar.yml  Glossar – die eine Quelle für alle Begriffe (daraus entsteht die Seite „Begriffe“)
.github/          Workflows (Prüfen, Images, Release, Handbuch …), Prüfskripte (werkzeuge/), Vorlagen für Issues und PRs
```

Ablago ist ein **modularer Monolith**: ein Programm, eine Datenbank. Server und Oberfläche stecken zusammen in einem Image – als `dms` oder, mit PostgreSQL im selben Container, als `dms-komplett`. Bei Bedarf laufen mehrere Prozesse desselben Programms ([Mehrere Prozesse](server.md#mehrere-prozesse)). Server, Oberfläche und gemeinsamer Code sind TypeScript; Bezeichner sind deutsch ([Stil](beitrag.md#stil)).

## Weg einer Anfrage { #weg-einer-anfrage }

Am Beispiel „Mappe ändern und speichern“ – so sieht fast jede Anfrage aus:

| Schritt | Wo | Was passiert |
| --- | --- | --- |
| 1. Oberfläche | `web/src/ablage/mappe-formular/…` → `mappenApi.mappeAendern` in `web/src/api/mappen.ts` | Das Formular schickt nur die geänderten Felder und den Stand beim Laden. |
| 2. Anfrage | `anfrage()` in `web/src/api/anfrage.ts` | `PUT /api/mappen/:id`, mit Sprache und Fehlerbehandlung (`ApiFehler`). |
| 3. HTTP | `server/src/http/http.ts`, `pruefeZugang` in `http/routen.ts` | Fastify findet die Route, prüft Anmeldung und `zugang` (`offen`, `angemeldet`, `admin`). |
| 4. Route | `server/src/mappen/mappen.routen.ts` | Der Handler holt den Zugriff der Person (`zg(a)`) und ruft den Fachdienst. Fachlogik steht hier nicht. |
| 5. Fachdienst | `dienst.mappen.aendereMappe` in `server/src/mappen/mappen.dienst.ts` | Prüft Rechte (über [Rechte prüfen](fachbereiche.md#zugriff)) und Werte, alles in einer Transaktion des Kerns. |
| 6. Kern | `server/src/kern/` | Transaktion, Historie, Ereignis in den Ausgangskorb (`kern.ereignis`), sofortige Empfänger (`kern.anlaesse.mappeGeaendert`). |
| 7. Repo | `kern.repo.aendereMappe` → `server/src/repo/pg/mappen.ts` | SQL gegen PostgreSQL. In Tests dieselbe Schnittstelle im Arbeitsspeicher (`repo/speicher/`). |
| 8. Danach | Ereignisverteiler, Automatisierungen, Pakete | Was später geschehen darf, läuft aus dem Ausgangskorb ([Ereignisse](ereignisse.md#ereigniskatalog)). |

Texte für Menschen kommen auf jedem Schritt aus den [Sprachdateien](texte.md#texte-und-sprachdateien) (`t('…')`), nie als Wort im Code.

## Server: `server/src` { #server }

Jede Datei liegt in einem Ordner. Direkt in `server/src/` stehen nur die Einstiegspunkte `index.ts`, `ablago.ts`, `vorstart.ts`, `dms.ts` (Konsole) und `pakete-pruefen.ts`.

| Art | Ordner |
| --- | --- |
| Zusammenbau | `dienst/` – setzt die Fachordner zusammen; Routen rufen die Fachdienste an seinen Feldern (`dienst.mappen`, `dienst.ausgang` …) |
| HTTP | `http/` – Fastify, Liste der Routen (`BEREICHE` in `routen.ts`), Hilfen nur für Routen, öffentliche API `/api/v1` (`api-v1/`) |
| Kern und Rechte | `kern/` (Schicht 0), `zugriff/` (Schicht 1) |
| Fachordner | mit `*.dienst.ts`, `index.ts` als Tür und `README.md`: `mappentypen/`, `mappen/`, `dokumente/`, `berechtigungen/`, `ereignisse/` (Schicht 2); `suche/`, `sichten/`, `volltext/`, `post/`, `ausgang/`, `pdf-bearbeiten/`, `aufgaben/`, `loeschen/`, `datenschutz/`, `werkbank/`, `fassungen/`, `organisation/`, `notfallkontakte/`, `paketaktionen/`, `textsatz/` (Schicht 3) |
| Weitere Bereiche mit Routen | `anmeldung/`, `konten/`, `pakete/`, `paketdaten/`, `automatisierung/`, `sicherung/`, `system/`, `wartung/` |
| Daten | `repo/` (Schnittstelle, `pg/`, `speicher/`), `datenbank/` (Verbindung, Migrationen, Anbindung) |
| Technik | `pdf/` ([PDF-Stelle](pdf.md#pdf-stelle)), `arbeit/` ([Arbeiter-Pool](server.md#arbeiter-pool)), `laeufer/` (Paket-Läufer), `dateien/`, `formate/`, `export/`, `mail/`, `erkennung/`, `webdav/` |
| Betrieb | `start/`, `prozesse/`, `zeitplan/`, `zwischenspeicher/`, `protokoll/`, `einstellungen/`, `geheimnisse/`, `sprache/`, `grundlagen/`, `lasttest/` |
| Sonstiges | `einrichtung/`, `notfall/`, `oberflaeche/`, `entdecken/`, `beispiele/`, `demo/`, `systemausstattung/` |

Mehr: [Server: Ordner und Muster](server.md) (Repos doppelt, Routen, Migrationen, Start, Uploads, Kurzzustand, mehrere Prozesse) und [Fachbereiche des Servers](fachbereiche.md) (je Fachordner: Klassen, Tür, was er bekommt).

## Schichten { #schichten }

Fachordner rufen nur nach unten; in derselben Schicht dürfen sie einander nutzen (Kreisläufe verbietet `kein-kreislauf`). Die Liste steht zentral in `.dependency-cruiser.cjs` (`SCHICHTEN`) – ein Ordner, den es noch nicht gibt, ist damit schon eingeordnet:

| Schicht | Fachordner |
|---|---|
| 0 | `kern/` – nur sich selbst, `shared/` und die Basis |
| 1 | `zugriff/` |
| 2 | `mappentypen/`, `mappen/`, `dokumente/`, `berechtigungen/`, `ereignisse/` (#1078) |
| 3 | alle übrigen Fachordner (`suche/`, `sichten/`, `volltext/`, `post/`, `ausgang/`, `pdf-bearbeiten/`, `aufgaben/`, `loeschen/`, `datenschutz/`, `werkbank/` …) |

Ohne Fachlogik und nicht in den Schichten (`TECHNIK`): `http/`, `pdf/`, `arbeit/`, `laeufer/`, `start/` und das Repo `repo/` (#1278) – es gehört zur Basis, die alle Schichten einbinden dürfen (`BASIS_ORDNER`). Fachordner ab Schicht 1 dürfen außer Kern und Basis die Werkzeuge einbinden, die `.dependency-cruiser.cjs` nennt (`WERKZEUGE`: etwa `messung.ts`, die Technik der Dateien, Seitenbilder, Schwärzen, Export, `pdf/` und `arbeit/`), nie `dienst.ts`. Routen (`*.routen.ts`) gehören zur HTTP-Schicht: Sie dürfen den Dienst und ihren eigenen Fachordner einbinden; `routen.ts` holt sie direkt. Alle Regeln mit Beispielen, wie man einen Kreis auflöst: [Abhängigkeiten zwischen den Teilen](stil.md#abhaengigkeiten-pruefen).

## Oberfläche: `web/src` { #oberflaeche }

Die Oberfläche hat keinen fremden Router: `ort.tsx` hält den Pfad als Zustand, `App.tsx` wählt nach dem ersten Teil des Pfads den Bereich.

| Ordner oder Datei | Was |
| --- | --- |
| `main.tsx`, `App.tsx`, `ort.tsx` | Start (Sprache zuerst laden), Kopf und Bereiche, kleiner Router mit Schutz vor ungespeicherten Änderungen |
| `ablage/` | die Ablage: Startseite, Listen, Mappe (`mappe-formular/`), Dokumente und Seitenbetrachter, Post übernehmen, Aufgaben, Suche |
| `werkbank/` | die Werkbank: Rahmen und Leiste (`rahmen/`, Tabelle der Seiten in `rahmen/seiten.ts`), je Bereich eine Seite oder ein Unterordner |
| `profil/` | Mein Konto |
| `einrichtung/` | der Mappentyp-Editor (Werkbank → Mappentypen) |
| `einrichtung.tsx`, `assistent/` | Einrichtungsassistent beim ersten Start |
| `begleiter/` | der Assistent am Rand: Fragen, Tipps, Handbuch |
| `entdecken/` | Rundgänge und „Ablago entdecken“ ([Rundgänge und Tipps](entdecken.md)) |
| `bausteine/` | Bausteine wie `Knopf`, `Feld`, `Etikett`, `Reiter`, `Aufklapper`, `Zahl`, `Kachel` – Import nur über `bausteine/index.ts` ([Gestaltung und Bausteine](bausteine.md)) |
| `api/` | Anfragen an den Server, je Fachbereich ein Modul |
| `stile/`, `tokens.css` | Gestaltung: Einstieg, gemeinsame Klassen, Farben und Ebenen |
| `sprache.ts` | `t()` und `tn()` für Texte aus `shared/src/sprachen/` |

Die Oberfläche ist nach Bereichen in kleine Dateien geteilt – man liest und ändert nur die Stelle, um die es geht, und parallele Arbeiten stoßen seltener zusammen. Eine Datei hat höchstens 700 Zeilen, eine Funktion in `*.tsx` höchstens 260 (ESLint, ohne Leerzeilen und Kommentare), eine CSS-Datei höchstens 400 (`npm run lint:farben`).

| Was | Wo | Hinweis |
|---|---|---|
| Gestaltung | `web/src/stile/`, je Bereich `web/src/<bereich>/<bereich>*.css` | `stile/index.css` ist der Einstieg und die einzige Stildatei, die `main.tsx` einbindet. Sie lädt `tokens.css` (Farben, Ebenen `--ebene-…`), `basis.css` (Elemente ohne Klasse), die gemeinsamen Klassen (`stile/gemeinsam-*.css`, `stile/bausteine.css`, `stile/rahmen.css`), die Dateien der Bereiche (`ablage/ablage-*.css`, `werkbank/werkbank*.css`, `einrichtung/einrichtung.css` …) und zuletzt `startbild.css`. Jede Klasse steht auf oberster Ebene in genau einer Datei, der ihres Besitzers (#1270): Setzt nur ein Bereich sie, in seiner Datei; setzen mehrere sie, in `stile/gemeinsam-*.css`; gehört sie einem Baustein, in seinem Modul. Die Reihenfolge ist fest: Bei gleicher Spezifität gewinnt die spätere Regel. `npm run lint:klassen` prüft doppelte und ungenutzte Klassen und `z-index`, `npm run lint:farben` Farben und Zeilen je CSS-Datei ([Stil](stil.md#klassen)). |
| Web-API | `web/src/api/` | `anfrage.ts` ist der Kern (Anfrage mit Fehlerbehandlung, `ApiFehler`, Einrichtungscode, Bestätigung im Verwaltungsmodus, Dateien laden und senden). Je Fachbereich ein Modul mit einem Objekt und seinen Typen, angelehnt an die Fachordner des Servers: `konto.ts` (`kontoApi`), `einrichtung.ts`, `betrieb.ts`, `mappen.ts`, `dokumente.ts`, `fassungen.ts`, `aufgaben.ts`, `pakete.ts`, `automatisierung.ts`, `rundgaenge.ts`, `suche.ts`, `eingaenge.ts`, `datenschutz.ts`, `werkbank.ts`. Aufrufer importieren direkt aus dem Fachmodul (`import { mappenApi, type Seite } from '../api/mappen'`); eine Sammel-Datei gibt es bewusst nicht. |
| Rauchtests | `web/rauchtest/` | `rauchtest.mjs` startet alles in fester Reihenfolge, `einrichtung.mjs` geht zuerst den Assistenten durch und legt die Daten an, `hilfen.mjs` enthält Rahmen `rauchtest(…)`, Anmelden, Knopf-Wächter und Verwaltungsmodus, `muster.mjs` axe, Tippflächen und das Warten auf eine ruhige Seite, `pdf.mjs` Beispiel-PDFs. Die Tests stehen je Bereich unter `bereiche/` – siehe [Loslegen](loslegen.md#rauchtests-der-oberflache). Unter `messen/` steht die Oberflächen-Messung (#1276, [Leistung](leistung.md#oberflaeche-messen)), ihre Ergebnisse unter `docs/messungen/oberflaeche/`. |

Die Rauchtests laufen in der CI nacheinander in einem Job: Alle Bereiche teilen sich ein Ablago samt Datenbank, und einige starten Ablago neu. Parallel bräuchte jeder Teil ein eigenes Ablago mit eigener Einrichtung.

## Gemeinsam: `shared` { #gemeinsam }

Was Server und Oberfläche gleich rechnen müssen, steht einmal in `shared/src/` – so prüft die Oberfläche vorab mit denselben Regeln, die der Server beim Speichern anwendet. `shared/` bindet weder `server/` noch `web/` ein.

| Ordner oder Datei | Was |
| --- | --- |
| `model/`, `sichten/`, `erkennung/`, `pakete/` | Fachmodell (Feld, Mappentyp, Mappe, Prüfregeln), Bedingungen und Ansichten, Erkennung, Pakete – Import nur über ihre `index.ts` |
| `sprachen/de/`, `sprachen/en/` | alle Texte; große Bereiche (`werkbank/`, `meldungen/`) als Ordner mit `index.ts` ([Texte und Sprachdateien](texte.md#texte-und-sprachdateien)) |
| `sprache.ts`, `texte.ts`, `region.ts` | Übersetzer, Platzhalter, Mehrzahl; gemerkte Formate für Datum und Zahlen |
| `werkbankansicht.ts` | die Liste der Werkbank-Seiten (`EINTRAEGE`), Stufen, Handy-Schwerpunkt (`HANDY_SCHWERPUNKT`, `HANDY_BEQUEMER`) |
| `hilfe.ts` | wohin jedes ?-Symbol im Handbuch zeigt (`HILFE`); die CI prüft, dass jedes Ziel existiert |
| `ereignisse.ts`, `automatisierung*.ts` | Ereigniskatalog und Modell der Automatisierungen |
| `shared/entdecken/` | Rundgänge, Tipps und die festen Ankerpunkte (`anker.yaml`) der Oberfläche |
| übrige Dateien | je ein Thema, meist mit dem Namen der Funktion (`heimnetz.ts`, `fristen.ts`, `loeschkonzept.ts` …) |

Tests stehen in `server/test/`, `web/test/` und `shared/test/` ([Prüfen](loslegen.md#prufen)). Charakter-Tests halten fest, was ein Teil heute ausgibt (`server/test/charakter/*.json`, etwa die Routentabelle, die Paketvorschau `plane.json` und die Anker `anker.json`); ändert sich das bewusst, schreibt `CHARAKTER_SCHREIBEN=1` mit dem jeweiligen Test sie neu – danach den Unterschied prüfen.

## Seiten im Einzelnen { #seiten }

| Seite | Inhalt |
| --- | --- |
| [Server: Ordner und Muster](server.md) | alle Ordner, Muster (Repos, Routen, Migrationen, Start, Uploads, Heimnetz, Verklemmungen), dms-komplett, Arbeiter-Pool, Kurzzustand, mehrere Prozesse |
| [Fachbereiche des Servers](fachbereiche.md) | Kern, Systemausstattung, Anschlusspunkte und jeder Fachordner; Baum über Verweise, Mappen gleichzeitig schreiben, Systemkonten, Passkeys |
| [PDFs](pdf.md) | PDF-Stelle, Schriften, Tests mit kaputten PDFs, Grenzen, geschützte PDFs, Anzeige im Browser |
| [Texte und Sprachen](texte.md) | Sprachdateien, Bereiche, Platzhalter, Mehrzahl, Beschriftungen, Unterlagen für Dritte |
| [Rundgänge und Tipps](entdecken.md) | Rundgänge, Tipps, Ankerpunkte, auch aus Paketen |
| [Ereignisse und Automatisierungen](ereignisse.md) | Ereigniskatalog, Automatisierungen, Automatisierungsvorlagen |
| [Daten nach draußen](nach-draussen.md) | Wege nach draußen, Zähler-Endpunkt, Karten nach außen, Aufruf von außen |
| [Abhängigkeiten](abhaengigkeiten.md) | fremder Code im Image und die Regel für neue Abhängigkeiten |
| [Entscheidungen](entscheidungen/index.md) | eine Seite je Entscheidung, mit Gründen |

## Frühere Abschnitte dieser Seite { #fruehere-abschnitte }

Bis #1273 stand alles auf dieser einen Seite. Alte Links mit Anker landen hier:

| Früher | Jetzt |
| --- | --- |
| <span id="abhaengigkeiten"></span>Abhängigkeiten | [Abhängigkeiten](abhaengigkeiten.md) |
| <span id="pdf-stelle"></span><span id="pdf-schriften"></span><span id="pdf-bibliotheken"></span><span id="pdf-entscheidung"></span>PDF-Stelle, Schriften, Bewertung der PDF-Bibliotheken | [PDFs](pdf.md), [PDF-Bibliothek](entscheidungen/pdf-bibliothek.md) |
| <span id="texte-und-sprachdateien"></span><span id="unterlagen-fur-dritte"></span>Texte und Sprachdateien | [Texte und Sprachen](texte.md) |
| <span id="entdecken"></span><span id="paket-rundgaenge"></span><span id="paket-tipps"></span><span id="anker"></span>Rundgänge, Tipps und Ankerpunkte | [Rundgänge und Tipps](entdecken.md) |
| <span id="kurzzustand"></span><span id="mehrere-prozesse"></span><span id="arbeiter-pool"></span>Kurzzustand, mehrere Prozesse, Arbeiter-Pool | [Server: Ordner und Muster](server.md) |
| <span id="kern"></span><span id="werkbank"></span><span id="zugriff"></span>Kern, Fachbereiche, Werkbank | [Fachbereiche des Servers](fachbereiche.md) |
| <span id="ereigniskatalog"></span><span id="automatisierungen"></span>Ereigniskatalog, Automatisierungen | [Ereignisse und Automatisierungen](ereignisse.md) |
| <span id="wege-nach-draussen"></span><span id="zaehler-endpunkt"></span><span id="nach-aussen-melden"></span>Wege nach draußen, Zähler-Endpunkt | [Daten nach draußen](nach-draussen.md) |
| <span id="oberflaeche-dateien"></span>Oberfläche: Gestaltung, Web-API und Rauchtests | [oben](#oberflaeche) |
