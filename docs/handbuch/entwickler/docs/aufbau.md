# Aufbau

```
shared/           Fachmodell, Prüfregeln, Hilfe-Tabelle – von Server und Oberfläche genutzt
server/           Fastify-API, PostgreSQL (postgres.js), SQL-Migrationen, Tests
web/              React-Oberfläche (Vite)
deploy/           Compose-Vorlagen für NAS und Server, Start-Skript und Probe für dms-komplett
docs/             Handbücher (MkDocs), Screenshot-Skript, Release-Notizen
docs/glossar.yml  Glossar – die eine Quelle für alle Begriffe (daraus entsteht die Seite „Begriffe“)
.github/          Workflows (Prüfen, Images, Release, Handbuch …), Dependabot, Vorlagen für Issues und PRs
```

Das DMS ist ein **modularer Monolith**: ein Prozess, eine Datenbank. Server und Oberfläche stecken zusammen in einem Image – als `dms` oder, mit PostgreSQL im selben Container, als `dms-komplett`. Wichtige Muster:

- **Repos doppelt:** Jede Datenzugriffs-Schnittstelle gibt es für PostgreSQL (`repo-pg.ts`, `pg…`-Funktionen) und für den Arbeitsspeicher (`repo-speicher.ts`, `speicher…`). Die meisten Tests laufen schnell im Arbeitsspeicher, die Tests mit `TEST_DATABASE_URL` decken PostgreSQL ab. Neue Funktionen brauchen beides, und beide müssen sich gleich verhalten.
- **Routen** stehen gesammelt in `server/src/routen.ts`, je mit `zugang: 'offen' | 'angemeldet' | 'admin'`. Zwei Merkmale kommen dazu: `api: true` macht eine Route zum Teil der öffentlichen API (Anmeldung auch mit API-Schlüssel); `konsole: true` erlaubt sie nur über den Befehl `dms` im Container. Die öffentliche API für Programme liegt unter `/api/v1` (`api-v1.ts`, OpenAPI).
- **Öffentliche Links ohne Anmeldung** gibt es bisher nur für die Abrufseite einer Auskunft (#455, `server/src/abruf.ts`, `web/src/abruf.tsx`): Schlüssel nur im Fragment (`/abruf#…`), in der Datenbank nur Hashes (SHA-256 für den Schlüssel, scrypt für den Code), Fehlversuche im Anmeldeschutz je IP und am Link, Download über ein Einmal-Ticket. Weitere Freigabelinks sollten diesem Muster folgen.
- **Migrationen** sind nummerierte SQL-Dateien in `server/migrations/`. Sie laufen beim Start in einer Transaktion und werden nie nachträglich geändert, sondern immer durch eine neue ergänzt.
- **Einstellungen** stehen als JSON je Schlüssel in der Tabelle `einstellungen`. `null` löscht einen Eintrag.
- **Hilfe:** Jedes ?-Symbol in der Oberfläche zeigt auf eine Stelle im Handbuch. Die Tabelle dazu steht in `shared/src/hilfe.ts`, und die CI prüft, dass jeder Anker existiert.
- **Sicherung und Wiederherstellung** sichern alle Tabellen außer dem Inhalt von `sitzungen` und `schema_migrationen` (`OHNE_INHALT` in `server/src/datenbankabzug.ts`). Eine neue Tabelle ist automatisch dabei. Daten außerhalb der Datenbank brauchen einen Gedanken: Wo liegen sie, und kommen sie mit?


## Abhängigkeiten { #abhaengigkeiten }

Das DMS kommt mit **wenig fremdem Code** aus: 8 npm-Pakete im Server, 3 in der Oberfläche, dazu eine Handvoll Alpine-Pakete im Image. Das ist der beste Schutz gegen Angriffe über die Lieferkette und hält Sicherheitsupdates selten und überschaubar – und einer der Hauptgründe, warum Node.js hier gut passt. So soll es bleiben.

**Regel (#543):** Eine neue **Laufzeit-Abhängigkeit** – npm unter `dependencies` oder ein Alpine-Paket per `apk add` im `Dockerfile` – kommt nur mit Begründung im Pull Request (Abschnitt „Neue Abhängigkeiten“ der Vorlage):

- **Wozu** wird sie gebraucht?
- **Warum nicht** mit Node.js-Bordmitteln oder den vorhandenen Abhängigkeiten und Werkzeugen? Oft reicht eine kleine eigene Umsetzung, wie bei den [Sprachdateien](#texte-und-sprachdateien) statt i18next.
- **Lizenz:** verträglich mit Apache-2.0? Bewusst nicht im Image sind z. B. Ghostscript und MuPDF (AGPL).
- **Pflegezustand:** letzte Version, Zahl der Betreuer.
- **Eigene Abhängigkeiten:** was sie mit ins Image bringt.

Die Prüfung **Abhängigkeiten** (`.github/workflows/abhaengigkeiten.yml`) meldet im PR neue Laufzeit-Abhängigkeiten als Warnung, entfernte und neue Werkzeuge für Bau und Tests als Notiz und geänderte Versionen in der Zusammenfassung des Laufs – gesperrt wird nichts. Das erledigt das Skript `.github/werkzeuge/abhaengigkeiten-hinweis.py` (nur Python und git); lokal: `python3 .github/werkzeuge/abhaengigkeiten-hinweis.py main HEAD`. Bekannte Sicherheitslücken und unverträgliche Lizenzen prüft im selben Lauf die Dependency Review von GitHub.

**Heute im Image** (Stand 0.122):

| Paket | Wo | Lizenz | Wozu |
| --- | --- | --- | --- |
| `fastify` | Server | MIT | HTTP-Server, Routen, Prüfung der Anfragen |
| `@fastify/static` | Server | MIT | die Oberfläche als Dateien ausliefern |
| `postgres` (postgres.js) | Server | Unlicense | Zugriff auf PostgreSQL |
| `nodemailer` | Server | MIT-0 | E-Mails über SMTP senden (Einladungen, Hinweise, Mappen versenden) |
| `imapflow` | Server | MIT | Post aus Postfächern über IMAP abholen |
| `mailparser` | Server | MIT | abgeholte E-Mails in Text und Anhänge zerlegen |
| `pdf-lib` | Server | MIT | PDFs zusammenstellen, verkleinern, schwärzen, stempeln |
| `yaml` | Server | ISC | Pakete im YAML-Format lesen und schreiben |
| `react`, `react-dom` | Oberfläche | MIT | Oberfläche |
| `qrcode` | Oberfläche | MIT | QR-Code für die Zwei-Faktor-Anmeldung |
| `tesseract-ocr` mit `-data-deu`, `-data-eng`, `-data-osd` | Image (Alpine) | Apache-2.0 | Texterkennung |
| `poppler-utils` | Image (Alpine) | GPL-2.0-or-later, als eigenes Programm aufgerufen | `pdftotext`, `pdftoppm`: Text und Bilder aus PDFs |
| `qpdf` | Image (Alpine) | Apache-2.0 | Struktur von PDFs beim Verkleinern optimieren |
| `postgresql17`, `postgresql17-contrib` | nur `dms-komplett` | PostgreSQL | Datenbank im selben Container; `contrib` für `pg_trgm` |
| `tini`, `su-exec` | nur `dms-komplett` | MIT | Prozesse starten und sauber beenden, PostgreSQL ohne root |

Nur für Bau und Tests (nicht im Image): `typescript`, `tsx`, `esbuild`, `vite` mit `@vitejs/plugin-react` und die Typen unter `@types/…`. Auch hier gilt: lieber Bordmittel – die Tests laufen mit dem Testläufer von Node.js (`node --test`), ohne eigenes Test-Framework.

## Texte und Sprachdateien { #texte-und-sprachdateien }

Texte für Benutzer stehen nicht im Code, sondern in **Sprachdateien** (#473, Teil von #357). Sichtbar ist bisher nur Deutsch mit **du**; die Technik für weitere Sprachen ist da.

**Regel:** Wer einen Text neu schreibt oder ändert, legt ihn in der Sprachdatei ab – auch wenn der Rest der Datei noch Texte im Code hat. Ganze Bereiche ziehen nach und nach in eigenen Issues um. Umgestellt sind bisher die Anmeldung (Weboberfläche, Fehlermeldungen der API, E-Mails zum Zugang), die Texte für Dritte und die Leiste der Werkbank (Gruppen, Bereiche, Vorlagen; `werkbank.json`, auch für `werkbank_bereiche.py`).

```
shared/src/sprachen/de/<bereich>.json         Ausgangssprache Deutsch (du), immer vollständig
shared/src/sprachen/de-formal/dritte.json     Texte für Dritte mit „Sie“ (siehe unten)
shared/src/sprache.ts                         uebersetzer(), Platzhalter, Mehrzahl
web/src/sprache.ts, server/src/sprache.ts     t() mit den Bereichen, die Oberfläche bzw. Server brauchen
```

**Text anlegen**

1. Passenden Bereich wählen oder einen neuen anlegen (`anmeldung`, `mail`, `werkbank` …; Dateiname = Bereich, klein, ohne Punkt). Ein neuer Bereich wird in `web/src/sprache.ts` bzw. `server/src/sprache.ts` eingetragen.
2. Schlüssel in die JSON-Datei schreiben – flach, Teile mit Punkt, klein beginnend: `"vergessen.knopf": "Link anfordern"`.
3. Im Code abrufen: `t('anmeldung.vergessen.knopf')`. Die Typprüfung kennt alle Schlüssel und meldet Tippfehler.

**Benennung:** vom Allgemeinen zum Besonderen, nach Ort und Zweck statt nach Wortlaut – `vergessen.titel`, `vergessen.knopf`, `fehler.link.abgelaufen`. Fehlermeldungen unter `fehler.*`, Rückfragen als `….frage`, `….frage.text`, `….frage.ja`. Wiederkehrende Wörter („Speichern“, „Abbrechen“) bekommen keinen gemeinsamen Schlüssel, solange der Bereich sie nicht braucht – so bleibt jede Übersetzung im Zusammenhang.

**Platzhalter** stehen in einfachen geschweiften Klammern: `"passwort.zugang": "Für den Zugang {email}"` → `t('anmeldung.passwort.zugang', { email })`. Namen nur aus Buchstaben, Ziffern und `_`. Fehlt ein Wert, bleibt `{email}` stehen und fällt auf.

**Mehrzahl** über zwei Schlüssel mit `_one` und `_other` und den Wert `anzahl`:

```json
"dauer.stunden_one": "{anzahl} Stunde",
"dauer.stunden_other": "{anzahl} Stunden"
```

`t('mail.dauer.stunden', { anzahl: 2 })` ergibt „2 Stunden“. Die Formen richten sich nach `Intl.PluralRules`; fehlt eine, gilt `_other`.

**Zusammengesetzte Schlüssel** (`werkbank.gruppe.${g}`) gehen mit `t.frei(…)` statt `t(…)`. Sie entgehen der Typprüfung; die Prüfung in der CI zählt alle Schlüssel mit dem festen Anfang (`werkbank.gruppe.`) als benutzt. Wo es geht, ganze Schlüssel ausschreiben.

**Prüfung in der CI** (`server/test/sprachdateien.test.ts`, läuft mit `npm test`): Sie schlägt fehl, wenn der Code einen Schlüssel abruft, den es nicht gibt, wenn ein Schlüssel nirgends benutzt wird, wenn eine andere Sprache Schlüssel auslässt oder zusätzliche hat, wenn die Platzhalter zwischen den Sprachen abweichen, bei Mehrzahl ohne `_other` und bei leeren Texten. Die Symbol-Prüfung (keine bunten Emoji, keine Textzeichen als Symbol) gilt auch für die Sprachdateien. Lokal: `node --import tsx --test test/sprachdateien.test.ts` im Ordner `server`.

**Bibliothek:** eine eigene, kleine Umsetzung in `shared/src/sprache.ts` statt i18next – keine neue Abhängigkeit, offline, dieselben Regeln in Oberfläche und Server. Das Format (flaches JSON, `_one`/`_other`) entspricht i18next; ein späterer Wechsel bleibt möglich.

Nicht Teil von Stufe 1: weitere Sprachen, „Sie“ in der Oberfläche, Sprachwahl im Profil (#357, spätere Stufen).

## Unterlagen für Dritte: Anrede du oder Sie { #unterlagen-fur-dritte }

Die Oberfläche duzt immer. Texte, die an Personen **außerhalb** des DMS gehen, folgen dagegen der Einstellung **Anrede in Unterlagen für Dritte** (#474, Werkbank → Datenschutz, `Datenschutz.anrede`, Vorgabe `du`). Alle diese Texte stehen im Bereich `dritte` der [Sprachdateien](#texte-und-sprachdateien): die du-Fassung in `shared/src/sprachen/de/dritte.json`, die Sie-Fassung in `shared/src/sprachen/de-formal/dritte.json`, je mit denselben Schlüsseln und Platzhaltern. Abgerufen werden sie mit `textDritte(anrede, schluessel, werte)` aus `shared/src/anrede.ts`. Die Prüfung der Sprachdateien vergleicht beide Fassungen, ein Test prüft zusätzlich, dass die Sie-Fassung kein „du“ enthält.

Neue Texte für Dritte kommen als Schlüssel in beide `dritte.json` – keine `anrede === 'sie' ? … : …` im Code – und in diese Liste:

| Ausgabe | Code | Schlüssel |
| --- | --- | --- |
| Auskunft: Deckblatt.pdf, Uebersicht.html, LIESMICH.md (#396) | `server/src/auskunft.ts` | `auskunft.*` (Rechte-Vorschlag: `rechteStandard`) |
| E-Mail mit der Auskunft als ZIP, E-Mail mit dem Abruf-Link (#455) | `auskunftMail` in `shared/src/auskunft.ts` | `mail.*` |
| Abrufseite `/abruf` und ihre Meldungen (#455) | `web/src/abruf.tsx`, `GET /api/abruf/anrede`, `/api/abruf` in `routen.ts` | `abruf.*` |
| E-Mails mit Mappen und Dokumenten (#58, #151) | – | keine: Text schreibt der Benutzer, vorgegeben ist nur der Betreff ohne Anrede |

## Baum über Verweise

Alles, was über Verweise an einer Mappe hängt, sammelt **ein** Modul – genutzt von der Auskunft nach Art. 15 DSGVO (#396) und von „Mappe mit allen verknüpften Mappen löschen“ (#424). Neue Funktionen, die „alles zu dieser Mappe“ brauchen, nehmen es statt eigener Schleifen.

- **Typen und Optionen:** `shared/src/baum.ts` – `BaumOptionen` (`richtungen`: `verwiesenVon` = Mappen, die auf den Knoten verweisen, „nach unten“; `verweistAuf` = Mappen, auf die er verweist; `tiefe` 1–10; `max` bis 5000; `seitwaerts`; `ohneTypen`; `nurZugehoerigkeit`), `bereinigeBaumOptionen(eingabe, standard)`, `Baum`, `BaumKnoten`, Hilfen `kinderVon`, `haengtAuchAnderswo`, `wirdAnderswoGebraucht`, `baumZahlen`.
- **Algorithmus:** `server/src/baum.ts` – `sammleBaum(quelle, startId, optionen)`: Breitensuche, je Ebene ein Zugriff auf Verweise (`Repo.kantenVon`), Mappen und Lesbarkeit. Ohne `seitwaerts` geht ein Knoten nur in der Richtung weiter, über die er erreicht wurde (die Start-Mappe in alle gewählten). Kreise und mehrfache Wege landen in `auchUeber` und `kreise`, jeder Knoten steht einmal da. Über `max` hinaus: `abgeschnitten`. Mit `nurZugehoerigkeit` geht es nur über Verweisfelder der Art Zugehörigkeit weiter (`verweisartVon(typ, feldKey)`, Standard Bezug); Knoten, die nur über Bezug dranhängen, sind Blätter mit `nurBezug` – erreicht die Suche sie später über eine Zugehörigkeit, werden sie dort eingehängt und weiterverfolgt (innerhalb einer Ebene haben Zugehörigkeiten Vorrang).
- **Rechte:** Die `BaumQuelle` baut `Dienst.baumQuelle(zugriff)`; nur lesbare Mappen werden aufgenommen **und** weiterverfolgt, nicht lesbare zählen nur in `verborgen`. Zum Aufrufen: `await dienst.baum(startId, eingabe, zugriff)` (Benutzer und Rollen sind ohne `ohneTypen` ausgenommen), über HTTP `GET /api/v1/mappen/{id}/baum`.
- **Je Knoten:** `typ`, `titel`, `ebene`, `ueber` (Elternknoten, Richtung, Feld, `verweisart`), `nurBezug`, `dokumente`, `aussen` (Verweise zu Mappen außerhalb des Baums je Richtung, nicht lesbare ohne Titel), `aufbewahrenBis`/`gesperrt` (Archivmodus #212) und `rechte` (CRUDP des Aufrufers).

Die Auskunft (`Dienst.auskunftVorschau`) und das Löschen sammeln beide mit `nurZugehoerigkeit` (#472, #424): Bezug-Knoten gehen bei der Auskunft nur als Erwähnung hinaus (`AuskunftAuswahl.erwaehnungen`, `erwaehnungText` in `shared/src/auskunft.ts`), beim Löschen wird nur ihr Verweis entfernt. Volltext-Vorschläge gibt es bei der Auskunft nicht (mehr).

Tests: `server/test/auskunft.test.ts` (Kreise, Rechte, Obergrenze, seitwärts, Zugehörigkeit/Bezug).

### Mit verknüpften Mappen löschen (#424)

- **Vorschau und Plan** (reine Funktionen, Server und Oberfläche): `shared/src/loeschbaum.ts`. `Dienst.loeschVorschau(startId, { tiefe, max }, zugriff)` sammelt den Baum nur `verwiesenVon` mit `nurZugehoerigkeit` (Standardtiefe 5) und ergänzt `kanten` (alle Verweise zwischen Knoten, nicht nur die Baumwege), `geteilt` und `nichtLoeschbar`. Kennzeichen (`kennzeichen(v, k)`): 🔒 = `gesperrt`, 📎 = `nurBezug` (wird nie gelöscht, `loeschen` gilt als `entkoppeln`), ⛔ = `!rechte.D` oder `nichtLoeschbar`, 🔗 = `geteilt` – enger als `haengtAuchAnderswo(k)`: zählt nur Verweise der Art Zugehörigkeit nach außen über ein Feld, über das der Knoten im Baum hängt, oder auf eine Mappe desselben Typs wie im Baum; Verweise auf Stammdaten (Ablageort, Kategorie) und Benutzer zählen nicht, sonst wäre fast alles 🔗.
- **Plan:** `planeLoeschung(vorschau, auswahl)` – Auswahl je Id `loeschen | entkoppeln | behalten` (fehlende Ids bleiben). Fixpunkt: Eine Mappe bleibt, wenn `wirdAnderswoGebraucht(k)` oder eine bleibende Mappe im Baum ohne `entkoppeln` auf sie verweist. Gesperrte Mappen werden nie entkoppelt.
- **Ausführen:** `Dienst.loescheMitVerknuepften` sammelt neu, plant, prüft jede Mappe wie beim einzelnen Löschen (`loeschPruefung` mit allen Rückverweisen), kappt die Verweise (`entkoppeln`, Recht U) und legt alles mit `Repo.legeVorgangInPapierkorb` in **einer** Transaktion in den Papierkorb (Verweise untereinander zuerst – so gehen auch Kreise). Spalten `papierkorb.vorgang` und `papierkorb.entkoppelt` (Migration 042). `stelleVorgangWiederHer` bzw. `Repo.stelleMehrereWiederHer` legen erst alle Mappen, dann die Verweise an und setzen die entkoppelten Verweise wieder. Tests: `server/test/loeschbaum.test.ts`.

Mehr Hintergrund im Administratorhandbuch: [Technik](https://motom001.github.io/dms/admin/aktuell/technik/) und [Entscheidungen](https://motom001.github.io/dms/admin/aktuell/entscheidungen/).
