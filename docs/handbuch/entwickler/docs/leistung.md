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

Zielwert: Ein Mitglied lädt Startseite und Ablage bei gleichen Daten höchstens 10 % langsamer als der Administrator – erfüllt (sogar schneller, weil für den Administrator auch Fristen ohne Empfänger anstehen). Die Verzögerung der Ereignisschleife blieb bei 99 % unter 16 ms. Größter Posten ist jetzt `/api/sichten` (Zähler je Typ und Ansicht, 150–230 ms bei 50.000 Mappen, für alle Benutzer gleich).

## Regeln

- **Kein `SELECT *` auf Tabellen mit großen Spalten.** Dokumente immer mit `DOKUMENT_SPALTEN`; den Volltext nur über `volltext(id)` oder gebündelt über `volltexte(ids)` lesen. EXPLAIN zeigt das nicht: Der Volltext liegt ausgelagert (TOAST) und wird erst beim Senden an den Server entpackt.
- **Nicht alle Mappen laden, um im Arbeitsspeicher zu filtern.** Was sich in SQL eingrenzen lässt (Datum im Zeitraum, offene Aufgaben), grenzt die Abfrage ein (#477: `mappenMitDatum`, Eingang im Zähler).
- **Keine Zugriffe in Schleifen über Mappen oder Dokumente.** Für Massenarbeit gibt es gebündelte Methoden (`dokumenteVon`, `volltexte`, `versionenVonDokumenten`, `notizenVon`, `aufgabenVonMappen`, `historieVon`). Ein Zugriff kostet auch lokal etwa eine halbe Millisekunde – bei 10.000 Mappen sind das Sekunden.
- **Nach Massenläufen die Statistik auffrischen:** `Dienst.aktualisiereStatistik()` (Demo-Daten erzeugen und entfernen; die Wiederherstellung macht es selbst). Für `dokumente` nur über die Spalten in `STATISTIK_SPALTEN`: Ohne Spaltenliste berechnet PostgreSQL auch die Statistik des Index `to_tsvector('german', volltext)` – über eine Minute bei 20.000 Dokumenten statt 0,1 Sekunden.
- **Lange Rechenarbeit gibt nach.** Server und Oberfläche teilen sich einen Node-Prozess: Was die Ereignisschleife blockiert, verzögert jede Anfrage – und erscheint in der Messung der Datenbankzugriffe als „langer Zugriff“, obwohl die Datenbank schnell war. Schleifen über viele Elemente geben mit `takt()` (`server/src/demo.ts`) oder `setImmediate` nach; große Daten werden mit dem asynchronen `zlib` gepackt statt im Hauptthread.
