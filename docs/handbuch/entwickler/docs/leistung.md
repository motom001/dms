# Leistung

Das DMS soll auch nach Jahren mit vielen Mappen flüssig bleiben. Dafür gibt es eine Messlatte, einen Test, der sie in der CI prüft, und ein Mess-Skript für genauere Messungen (#367).

## Messlatte

Bei **10.000 Mappen und 20.000–30.000 Dokumenten** (Volltext je Dokument 5–50 KB) gilt im Median:

| Vorgang | Grenze |
|---|---:|
| Mappe öffnen (`Dienst.holeMappe`) | 200 ms |
| Dokumentliste einer Mappe (`listeDokumente`) | 200 ms |

Das gilt auch, **während** im selben Prozess Demo-Daten mit Dokumenten entstehen und die Texterkennung läuft. Gemessen auf einem gewöhnlichen Rechner liegen die Werte heute im einstelligen Millisekundenbereich; die Grenze lässt Platz für ein langsames NAS.

Die Werte stehen als `MESSLATTE_MS` in `server/test/leistung-messen.ts`.

## Test in der CI

`server/test/leistung.test.ts` läuft mit `TEST_DATABASE_URL` (in GitHub Actions automatisch, sonst übersprungen). Er legt eine eigene Datenbank mit 1.200 Demo-Mappen und ihren Dokumenten an und

- misst „Mappe öffnen“ und die Dokumentliste – eine Überschreitung der Messlatte ist nur eine **Warnung** (`t.diagnostic` und `console.warn`), weil Laufzeiten je Rechner schwanken;
- prüft **fest**, dass Dokument-Listen keinen Volltext lesen (`DOKUMENT_SPALTEN` in `repo-pg.ts` ohne `volltext`, aber mit jeder anderen Spalte der Tabelle – eine neue Spalte muss dort ergänzt werden);
- prüft **fest**, dass der Export gebündelt liest: keine Zugriffe je Mappe oder Dokument (keine N+1-Abfragen).

Der Test dauert etwa 20 Sekunden.

## Mess-Skript

Für Messungen mit dem vollen Datenbestand und vorher/nachher-Vergleiche (aus `server/`):

```bash
MESS_DATABASE_URL=postgres://postgres:dms@127.0.0.1:5432/dmsmessung \
  node --import tsx test/leistungsmessung.ts --neu --mappen 10000 --export 2000 --explain --last
```

- `--neu` legt die Datenbank **neu** an (eine vorhandene gleichen Namens wird gelöscht) und erzeugt die Daten mit festem Startwert – gleiche Daten bei jedem Lauf. Das dauert einige Minuten (die Indizes der Volltextsuche).
- Ohne `--neu` wird der vorhandene Bestand gemessen, z. B. vor und nach einer Änderung.
- `--export N` misst den Export (wie „Meine Daten exportieren“) über die ersten N Mappen: Gesamtzeit, Zeit in der Datenbank und Zugriffe je Methode.
- `--explain` gibt die Pläne (`EXPLAIN (ANALYZE, BUFFERS)`) der wichtigsten Abfragen aus.
- `--last` misst dieselben Zugriffe noch einmal, **während** im selben Prozess Demo-Daten mit Dokumenten entstehen und die Texterkennung läuft (auf einer Kopie der Datenbank), dazu die Verzögerung der Ereignisschleife.

## Zeitmessung einer Anfrage

Jede Antwort einer Route trägt den Header `Server-Timing` (#11, #477):

```
vor;dur=0.1, app;dur=211.5, db;dur=154.7;desc="8", rechte;dur=2.6, json;dur=0.7, gesamt;dur=212.4
```

| Teil | Gemessen |
|---|---|
| `vor` | Eingang der Anfrage (Hook `onRequest`) bis Beginn des Handlers |
| `app` | Handler, enthält `db` und `rechte` |
| `db` | Summe der Datenbankzugriffe (`Messung.umhuelle`), in `desc` ihre Anzahl |
| `rechte` | Rechte auswerten (`Dienst.zugriff`, `rechteAn`, `rechteAnVielen`, `lesbare`), überlappende Aufrufe einmal, ohne die Datenbankzugriffe darin (`rechteMessen` in `messung.ts`) |
| `json` | `reply.send` bis zum Hook `onSend` – die Antwort in Text umwandeln |
| `gesamt` | Eingang bis `onSend` |
| `zs` | Nur bei Anfragen, die die Zahlen der Ansichten brauchen (#512): Dauer und in `desc` `treffer` (Zwischenspeicher) oder `neu` (gezählt) |

Wartet eine Anfrage, weil der eine Faden von Node.js gerade für eine andere rechnet, nimmt der Server sie erst danach an – das steckt dann nicht in `vor`, sondern in der „Leitung“ der Zeitmessung im Browser. Dafür misst `Auslastung` (`perf_hooks.monitorEventLoopDelay`) die Verzögerung der Ereignisschleife; Werkbank → Datenbank zeigt sie. Ganze Anfragen über der Schwelle für lange Zugriffe landen mit ihrer Aufteilung bei den Langläufern (`zugriff` beginnt mit `Anfrage:`).

Im Browser teilt `shared/src/zeitmessung.ts` die Zeit mit Resource Timing weiter auf: „Warten (Browser)“ (`startTime` bis `requestStart` ohne Verbindungsaufbau – der Browser schickt höchstens etwa 6 Anfragen gleichzeitig) und „Leitung“ (Hin- und Rückweg minus `gesamt`).

## Ladezeiten der Oberfläche

`server/test/ladezeiten.mjs` lädt Startseite, eine Liste und eine Mappe in Chromium als Administrator, als Mitglied mit Rolle und als Mitglied ohne Rolle (mit Regeln, die einen Lesefilter in SQL ergeben) und fasst Server-Timing je Seite zusammen. Gegen ein laufendes DMS mit frischer Datenbank:

```bash
DMS_URL=http://localhost:3100 CODE=<Einrichtungscode> node server/test/ladezeiten.mjs --einrichten --mappen 50000
DMS_URL=http://localhost:3100 N=5 node server/test/ladezeiten.mjs
```

**Messung zu #477** (50.000 Demo-Mappen ohne Dokumente, lokaler Rechner, Median aus 5 Ladevorgängen, Mittel aus zwei abwechselnden Durchgängen; Server = Summe aller Anfragen der Seite, sie laufen teils gleichzeitig):

| Seite | Wer | Laden vorher ms | Laden nachher ms | Server vorher ms | Server nachher ms | davon Rechte ms |
|---|---|---:|---:|---:|---:|---:|
| Startseite | Administrator | 562 | 360 | 659 | 464 | 2 |
| Startseite | Mitglied mit Rolle | 452 | 306 | 585 | 393 | 4 |
| Startseite | Mitglied ohne Rolle | 492 | 288 | 583 | 339 | 4 |
| Liste (4.120 Rechnungen) | Administrator | 636 | 401 | 770 | 520 | 2 |
| Liste (4.120 Rechnungen) | Mitglied mit Rolle | 504 | 328 | 687 | 385 | 4 |
| Liste (4.120 Rechnungen) | Mitglied ohne Rolle | 450 | 332 | 617 | 379 | 3 |
| Mappe öffnen | Administrator | 570 | 414 | 717 | 527 | 6 |
| Mappe öffnen | Mitglied mit Rolle | 584 | 362 | 890 | 470 | 5 |
| Mappe öffnen | Mitglied ohne Rolle | 441 | 325 | 650 | 443 | 4 |

Befund: Die Rechte-Auswertung im Arbeitsspeicher kostet je Seite nur wenige Millisekunden (unter 1 %); der Verdacht aus dem Issue hat sich nicht bestätigt. Die Zeit lag in der Datenbank, bei zwei Anfragen, die jede Seite der Ablage stellt:

- `/api/anstehend` lud **alle** Mappen jedes Typs mit Fristfeldern und filterte das Datum im Arbeitsspeicher. Jetzt holt `mappenMitDatum` nur Mappen mit einem Datum im Zeitraum (einzeln gemessen etwa 250 → 30 ms).
- `/api/sichten` zählte den Eingang mit einem `EXISTS` je Mappe; für Mitglieder mit Lesefilter lief der ganze Zähler dafür **ein zweites Mal** ohne Filter. Jetzt zählt eine Abfrage über die offenen Aufgaben den Eingang, einmal für alle.

Zielwert: Ein Mitglied lädt Startseite und Ablage bei gleichen Daten höchstens 10 % langsamer als der Administrator – erfüllt (sogar schneller, weil für den Administrator auch Fristen ohne Empfänger anstehen). Die Verzögerung der Ereignisschleife blieb bei 99 % unter 16 ms. Größter Posten ist jetzt `/api/sichten` (Zähler je Typ und Ansicht, 150–230 ms bei 50.000 Mappen, für alle Benutzer gleich). Das behebt #512 (nächster Abschnitt).

## Zahlen der Ansichten (#512)

Die Zahlen neben den Ansichten (`GET /api/sichten` → `Dienst.zaehler`) zählen mit **einer** Abfrage alle sichtbaren Ansichten per `count(*) FILTER (WHERE …)` über alle Mappen des Haushalts, dazu Typen, Eingang, Favoriten und Papierkorb – bei 50.000 Mappen 120–150 ms allein, unter Last der Seite 150–260 ms. Zwei Mittel:

1. **Nicht blockieren.** Die Oberfläche (`web/src/daten.tsx`) lädt Typen, Personen, Ansichten und den Rahmen (`GET /api/sichten/rahmen`: Papierkorb-Tage, Ansicht „Neue Post“ – ohne Zählen) und zeigt die Ablage; die Zahlen kommen danach (`zahlenDa`). Bis dahin steht an ihrer Stelle „…“ (`ZahlWarte`, Kacheln der Startseite ebenso), es springt nichts. Beim Neuladen bleiben die alten Zahlen stehen, bis die neuen da sind. Was aus den Zahlen etwas ableitet (Suchfeld der Liste, Belegung beim Entfernen eines Feldes), wartet nicht auf sie.
2. **Zwischenspeichern** (`server/src/zaehlerspeicher.ts`). Der **Stand des Haushalts** (`Haushaltsstand`) zählt hoch, sobald eine ändernde Methode des Repos fertig ist – der `Dienst` umhüllt sein Repo damit (`transaktion` zählt als Ganzes). Lesende und folgenlose Methoden (Historie, Ereignisse, Texterkennung, „gesehen“ …) stehen in `OHNE_FOLGEN`; eine neue Methode zählt, bis sie dort steht. Der Schlüssel je Eintrag: Benutzer, Rolle und ein Fingerabdruck von Lesefilter, verborgenen Ansichten und eigenen Rollen; gültig bei gleichem Stand und gleichem `heute`, also höchstens bis Mitternacht. Ansichten mit Datumsbezug (`heute`, Monat, Jahr, Frist) gelten höchstens 5 Minuten (`ZEITABHAENGIG_MS`), alle anderen höchstens 30 Minuten (`HOECHSTENS_MS`, Sicherheitsnetz für Änderungen an der Datenbank vorbei, etwa von Hand). Gleichzeitige Anfragen mit gleichem Schlüssel warten auf dieselbe Zählung. Ein Treffer kostet etwa 7 ms (Sitzung, Rechte, Ansichten laden), neu zählen 110–150 ms.

**Messung zu #512** (dieselben Daten wie #477, `server/test/ladezeiten.mjs`, Median aus 5 Ladevorgängen, davon der Median aus drei abwechselnden Durchgängen; im Lauf trifft der Zwischenspeicher bei allen Ladevorgängen nach dem ersten):

| Seite | Wer | Sichtbar vorher | Sichtbar nachher | Zahlen da vorher | Zahlen da nachher | `/api/sichten` vorher | `/api/sichten` nachher | Laden vorher | Laden nachher |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Startseite | Administrator | 388 | 273 | 337 | 176 | 213 | 56 | 460 | 312 |
| Startseite | Mitglied mit Rolle | 381 | 269 | 310 | 182 | 185 | 60 | 388 | 255 |
| Startseite | Mitglied ohne Rolle | 344 | 247 | 263 | 165 | 144 | 54 | 335 | 219 |
| Liste Rechnungen | Administrator | 392 | 277 | 303 | 237 | 201 | 80 | 427 | 396 |
| Liste Rechnungen | Mitglied mit Rolle | 385 | 263 | 302 | 141 | 189 | 36 | 405 | 226 |
| Liste Rechnungen | Mitglied ohne Rolle | 312 | 271 | 264 | 155 | 146 | 36 | 374 | 261 |
| Mappe öffnen | Administrator | 875 | 284 | 305 | 134 | 201 | 30 | 445 | 282 |
| Mappe öffnen | Mitglied mit Rolle | 882 | 324 | 302 | 165 | 179 | 43 | 409 | 282 |
| Mappe öffnen | Mitglied ohne Rolle | 487 | 283 | 293 | 153 | 173 | 33 | 439 | 268 |

*Sichtbar* = bis Kacheln, erste Zeile der Liste bzw. Kopf der Mappe zu sehen sind; *Zahlen da* = bis die Antwort von `/api/sichten` im Browser ist; `/api/sichten` = Server-Zeit dieser Anfrage (unter Last der Seite; allein 6–9 ms bei einem Treffer); *Laden* = bis keine Anfrage mehr läuft. Alle Werte in ms, lokaler Rechner. „Sichtbar“ schwankt bei „Mappe öffnen“ stark (einzelne Läufe um 870 ms in beiden Fassungen).

Nicht umgesetzt: **nur zählen, was zu sehen ist** (eingeklappte Gruppen, geschlossene Ansicht-Auswahl am Handy) – mit 1 und 2 wartet die Ablage nicht mehr auf die Zahlen, und ein Treffer kostet einstellige Millisekunden; ein Teilzählen würde den Zwischenspeicher nur aufsplitten. Auch ein **Index** für einzelne Bedingungen lohnt nicht: Die eine Abfrage liest ohnehin alle Mappen des Haushalts einmal (Seq Scan), und sie läuft nur noch nach Änderungen.

## Regeln

- **Kein `SELECT *` auf Tabellen mit großen Spalten.** Dokumente immer mit `DOKUMENT_SPALTEN`; den Volltext nur über `volltext(id)` oder gebündelt über `volltexte(ids)` lesen. EXPLAIN zeigt das nicht: Der Volltext liegt ausgelagert (TOAST) und wird erst beim Senden an den Server entpackt.
- **Nicht alle Mappen laden, um im Arbeitsspeicher zu filtern.** Was sich in SQL eingrenzen lässt (Datum im Zeitraum, offene Aufgaben), grenzt die Abfrage ein (#477: `mappenMitDatum`, Eingang im Zähler).
- **Keine Zugriffe in Schleifen über Mappen oder Dokumente.** Für Massenarbeit gibt es gebündelte Methoden (`dokumenteVon`, `volltexte`, `versionenVonDokumenten`, `notizenVon`, `aufgabenVonMappen`, `historieVon`). Ein Zugriff kostet auch lokal etwa eine halbe Millisekunde – bei 10.000 Mappen sind das Sekunden.
- **Nach Massenläufen die Statistik auffrischen:** `Dienst.aktualisiereStatistik()` (Demo-Daten erzeugen und entfernen; die Wiederherstellung macht es selbst). Für `dokumente` nur über die Spalten in `STATISTIK_SPALTEN`: Ohne Spaltenliste berechnet PostgreSQL auch die Statistik des Index `to_tsvector('german', volltext)` – über eine Minute bei 20.000 Dokumenten statt 0,1 Sekunden.
- **Lange Rechenarbeit gibt nach.** Server und Oberfläche teilen sich einen Node-Prozess: Was die Ereignisschleife blockiert, verzögert jede Anfrage – und erscheint in der Messung der Datenbankzugriffe als „langer Zugriff“, obwohl die Datenbank schnell war. Schleifen über viele Elemente geben mit `takt()` (`server/src/demo.ts`) oder `setImmediate` nach; große Daten werden mit dem asynchronen `zlib` gepackt statt im Hauptthread.
