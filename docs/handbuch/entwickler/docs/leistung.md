# Leistung

Ablago soll auch nach Jahren mit vielen Mappen flüssig bleiben. Dafür gibt es eine Messlatte, einen Test, der sie in der CI prüft, und ein Mess-Skript für genauere Messungen (#367).

## Messlatte

Bei **10.000 Mappen und 20.000–30.000 Dokumenten** (Volltext je Dokument 5–50 KB) gilt im Median:

| Vorgang | Grenze |
|---|---:|
| Mappe öffnen (`MappenDienst.holeMappe`) | 200 ms |
| Dokumentliste einer Mappe (`listeDokumente`) | 200 ms |

Das gilt auch, **während** im selben Prozess Demo-Daten mit Dokumenten entstehen und die Texterkennung läuft. Gemessen auf einem gewöhnlichen Rechner liegen die Werte heute im einstelligen Millisekundenbereich; die Grenze lässt Platz für ein langsames NAS.

**Kleine Hardware:** Ablago verspricht, auch auf kleiner Hardware flott zu sein. Maßstab dafür sind die Geräte unter [Geprüfte Plattformen](https://help.ablago.app/installieren/aktuell/plattformen/) und die Werte unter [Was Ablago verkraftet](https://help.ablago.app/admin/aktuell/verkraftet/): Ziel ist p95 unter 0,3 s bei der Lasttest-Stufe „klein“ und unter 1 s bei „mittel“ – auch auf einem NAS wie dem vom Projekt geprüften UGREEN DXP4800 Plus. Messungen auf einem Raspberry Pi 5 folgen ([#578](https://github.com/motom001/dms/issues/578)).

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
| `rechte` | Rechte auswerten (`ZugriffDienst.zugriff`, `rechteAn`, `rechteAnVielen`, `lesbare`), überlappende Aufrufe einmal, ohne die Datenbankzugriffe darin (`rechteMessen` in `messung.ts`) |
| `json` | `reply.send` bis zum Hook `onSend` – die Antwort in Text umwandeln |
| `gesamt` | Eingang bis `onSend` |
| `zs` | Nur bei Anfragen, die die Zahlen der Ansichten brauchen (#512): Dauer und in `desc` `treffer` (Zwischenspeicher) oder `neu` (gezählt) |

Wartet eine Anfrage, weil der eine Faden von Node.js gerade für eine andere rechnet, nimmt der Server sie erst danach an – das steckt dann nicht in `vor`, sondern in der „Leitung“ der Zeitmessung im Browser. Dafür misst `Auslastung` (`perf_hooks.monitorEventLoopDelay`) die Verzögerung der Ereignisschleife; Werkbank → Datenbank zeigt sie. Ganze Anfragen über der Schwelle für lange Zugriffe landen mit ihrer Aufteilung bei den Langläufern (`zugriff` beginnt mit `Anfrage:`).

Im Browser teilt `shared/src/zeitmessung.ts` die Zeit mit Resource Timing weiter auf: „Warten (Browser)“ (`startTime` bis `requestStart` ohne Verbindungsaufbau – der Browser schickt höchstens etwa 6 Anfragen gleichzeitig) und „Leitung“ (Hin- und Rückweg minus `gesamt`).

## Ladezeiten der Oberfläche

`server/test/ladezeiten.mjs` lädt Startseite, eine Liste und eine Mappe in Chromium als Administrator, als Mitglied mit Rolle und als Mitglied ohne Rolle (mit Regeln, die einen Lesefilter in SQL ergeben) und fasst Server-Timing je Seite zusammen. Gegen ein laufendes Ablago mit frischer Datenbank:

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

- `/api/anstehend` (heute `/api/termine`) lud **alle** Mappen jedes Typs mit Fristfeldern und filterte das Datum im Arbeitsspeicher. Jetzt holt `mappenMitDatum` nur Mappen mit einem Datum im Zeitraum (einzeln gemessen etwa 250 → 30 ms).
- `/api/sichten` zählte den Eingang mit einem `EXISTS` je Mappe; für Mitglieder mit Lesefilter lief der ganze Zähler dafür **ein zweites Mal** ohne Filter. Jetzt zählt eine Abfrage über die offenen Aufgaben den Eingang, einmal für alle.

Zielwert: Ein Mitglied lädt Startseite und Ablage bei gleichen Daten höchstens 10 % langsamer als der Administrator – erfüllt (sogar schneller, weil für den Administrator auch Fristen ohne Empfänger anstehen). Die Verzögerung der Ereignisschleife blieb bei 99 % unter 16 ms. Größter Posten ist jetzt `/api/sichten` (Zähler je Typ und Ansicht, 150–230 ms bei 50.000 Mappen, für alle Benutzer gleich). Das behebt #512 (nächster Abschnitt).

## Zahlen der Ansichten (#512)

Die Zahlen neben den Ansichten (`GET /api/sichten` → `SichtenDienst.zaehler`) zählen mit **einer** Abfrage alle sichtbaren Ansichten per `count(*) FILTER (WHERE …)` über alle Mappen des Haushalts, dazu Typen, Eingang, Favoriten und Papierkorb – bei 50.000 Mappen 120–150 ms allein, unter Last der Seite 150–260 ms. Zwei Mittel:

1. **Nicht blockieren.** Die Oberfläche (`web/src/daten.tsx`) lädt Typen, Personen, Ansichten und den Rahmen (`GET /api/sichten/rahmen`: Papierkorb-Tage, Ansicht „Neue Post“ – ohne Zählen) und zeigt die Ablage; die Zahlen kommen danach (`zahlenDa`). Bis dahin steht an ihrer Stelle „…“ (`ZahlWarte`, Kacheln der Startseite ebenso), es springt nichts. Beim Neuladen bleiben die alten Zahlen stehen, bis die neuen da sind. Was aus den Zahlen etwas ableitet (Suchfeld der Liste, Belegung beim Entfernen eines Feldes), wartet nicht auf sie.
2. **Zwischenspeichern** (`server/src/zaehlerspeicher.ts`). Der **Stand des Haushalts** (`Haushaltsstand`) zählt hoch, sobald eine ändernde Methode des Repos fertig ist – der `Dienst` umhüllt sein Repo damit (`transaktion` zählt als Ganzes). Lesende und folgenlose Methoden (Historie, Ereignisse, Texterkennung, „gesehen“ …) stehen in `OHNE_FOLGEN`; eine neue Methode zählt, bis sie dort steht. Der Schlüssel je Eintrag: Benutzer, Rolle und ein Fingerabdruck von Lesefilter, verborgenen Ansichten und eigenen Rollen (seit #742 ein Fingerabdruck der Rechte ohne die Person, siehe [unten](#sparsam-gemerkt)); gültig bei gleichem Stand und gleichem `heute`, also höchstens bis Mitternacht. Ansichten mit Datumsbezug (`heute`, Monat, Jahr, Frist) gelten höchstens 5 Minuten (`ZEITABHAENGIG_MS`), alle anderen höchstens 30 Minuten (`HOECHSTENS_MS`, Sicherheitsnetz für Änderungen an der Datenbank vorbei, etwa von Hand). Gleichzeitige Anfragen mit gleichem Schlüssel warten auf dieselbe Zählung. Ein Treffer kostet etwa 7 ms (Sitzung, Rechte, Ansichten laden), neu zählen 110–150 ms.

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

## Weniger Abfragen je Anfrage, sparsam gemerkt (#741, #742) { #sparsam-gemerkt }

Bei vielen gleichzeitigen Nutzern sind die Hin- und Rückwege zur Datenbank die eigentliche Warteschlange (10 Verbindungen). Darum zuerst **weniger fragen**, dann nur **Seltenes und für alle Gleiches merken** – Vorgabe: „nicht übertreiben und nicht zu viel in den Zwischenspeicher schreiben“.

**Haushaltsstand in der Datenbank** (Migration 077, Teil von #744): zwei Zahlen.

- `lesen` (Tabelle `haushaltsstand`, je Haushalt) zählt per Trigger bei jeder Änderung an `mappentypen`, `sichten`, `pakete` und `einstellungen` hoch – in derselben Transaktion, beim Abschluss (`DEFERRABLE INITIALLY DEFERRED`). Wer den neuen Stand sieht, sieht auch die neuen Daten; das gilt auch für Änderungen an Ablago vorbei. Ein neuer Eintrag beginnt bei der Uhrzeit in Mikrosekunden, damit nach einem neuen Schema kein gemerkter alter Stand trifft. Die Sicherung nimmt die Tabelle ohne Inhalt mit (`OHNE_INHALT`).
- `zahlen` (Sequenz `haushaltsstand_zahlen`) zählt der Server nach jeder ändernden Methode des Repos hoch (`Haushaltsstand` in `zaehlerspeicher.ts`, `OHNE_FOLGEN` wie bisher) – nach dem Abschluss der Änderung, gleichzeitige Änderungen zusammen, ohne dass die Anfrage darauf wartet. Eine Sequenz statt einer Zeile: Mit einer Zeile warteten im Lasttest „mit Speichern“ die gleichzeitigen Änderungen auf ihre Sperre.
- Die Anmeldung liest **Sitzung, Person und beide Stände in einer Abfrage** (`KontoRepo.holeAnmeldung`): Gültigkeit der Sitzung, Haushalt, „aktiv“ und Art der Person stehen im selben `WHERE`. Ein zweiter Prozess oder Server ist so höchstens langsamer, nie falsch.

**Was gemerkt wird** (`server/src/lesespeicher.ts`):

| Was | Wo | Warum | Verfall |
|---|---|---|---|
| Mappentypen (`listeTypen`) | `pgRepo`, `Lesespeicher` | jede Anfrage braucht sie für den Zugriff; große JSONB-Felder; ändern sich selten | Stand `lesen` anders |
| Ansichten (`listeSichten`) | ebenso | mehrfach je Anfrage (Zahlen, Liste, Rechte) | Stand `lesen` anders |
| Pakete (`listePakete`) | ebenso | bei jeder Meldung und jedem Ereignis | Stand `lesen` anders |
| Einstellungen aus `GEMERKTE_EINSTELLUNGEN` (u. a. Zwei-Faktor-Pflicht, Post, Papierkorb, Favoriten, Stempel, Ablageort, Datenschutz) | `pgEinstellungen` | für alle gleich, ohne Geheimnisse; die Zwei-Faktor-Pflicht bei jeder Anfrage | Stand `lesen` anders |
| Zahlen der Ablage je Typ und Ansicht | `Dienst.bestand` (`Zaehlerspeicher`) | eine Zählung über alle Mappen, 100–200 ms bei 50.000 | Stand `zahlen` anders, nach der Mindestgültigkeit; zeitabhängige nach 5 Minuten, sonst 30 Minuten, um Mitternacht |
| Zahlen der Person (Eingang, Favoriten, Papierkorb, Ansichten mit „ich“) | `Dienst.persoenlich` | kleine Zählungen, aber bei jedem Laden der Ablage | wie oben |

Jeder Abruf aus dem `Lesespeicher` bekommt eine eigene Kopie (`structuredClone`); in einer Transaktion liest das Repo nie daraus (`imTx`). Die Schlüssel sind fest – der Speicher wächst nicht mit der Zahl der Personen (höchstens 64 Einträge je Verbindung; die Zahlen höchstens 500 je Speicher). **Nie über die Anfrage hinaus gemerkt:** Sitzungen, Personen, Rollen, Zugriff und Lesefilter. Zugriff, Rollen und den Alltags-Empfänger für Aufgaben (#719) bildet `jeAnfrage` einmal je Anfrage (vorher in 16 Handlern zweimal); nach einer Änderung in derselben Anfrage, in einer Transaktion und nach 10 Sekunden (Hintergrundarbeit aus einer Anfrage) neu. Den Stand aus der Anmeldung nutzt eine Anfrage ebenso nur bis zu ihrer ersten eigenen Änderung.

**Zahlen nach Rechte-Fingerabdruck** (#742): Der Schlüssel der gemeinsamen Zahlen ist ein Hash genau der Eingaben der Zählung – Lesefilter (Rechte samt Rollen und Leserecht auf Zeit), Klauseln der sichtbaren Ansichten und der Verwaltungsmodus. Gleiche Eingaben ergeben dieselbe Abfrage und dieselbe Zahl; wer etwas anderes lesen darf, hat einen anderen Schlüssel – auch im und nach dem Verwaltungsmodus. Ansichten, deren Bedingungen die Person selbst meinen („ist mein Favorit“, „Für mich“), zählen bei den Zahlen der Person. Typen und Ansichten zählt **ein** Lauf (`zaehleBestand`, vorher zwei). **Mindestgültigkeit** `MINDESTENS_MS` (3 s): Nach Änderungen anderer bleibt bei Anfragen der bisherige Wert kurz stehen; eigene Änderungen (`Kontext.benutzerId`) zeigen sofort, Hintergrundarbeit (Zusammenfassung) zählt immer frisch. Eigene Änderungen kennt nur der Prozess, der sie gespeichert hat. In Server-Timing steht bei `zs` die gemeinsame Zählung.

**„Mappe öffnen“** liest Unabhängiges gleichzeitig (Mappe und Aufgaben; nach der Prüfung des Leserechts Rückverweise, Bezüge, Dokumente, Notizen, Erinnerungen, unpassende Verweise) und schreibt „zuletzt geöffnet“ und „gesehen“ erst nach der Antwort (`Antwort.danach`, `Nachlauf` in `http.ts`). Niemand wartet darauf: Ein Warten je Person reihte im Lasttest (drei Sitzungen, 100 Anfragen gleichzeitig) die Anfragen derselben Sitzung hintereinander. `danach` ist darum nur für Merkposten, die einen Augenblick später ankommen dürfen.

**Messung zu #741 und #742** (lokal, 2 Kerne, PostgreSQL 16, Lasttest-Daten mittel: 50.000 Mappen; vorher = `main` mit #740, #743 und #746, nachher = dieser Stand). *Abfragen je Anfrage* = SQL-Anweisungen einer Anfrage nach dem ersten Laden (gezählt über `debug` von postgres.js, nur für die Messung); die Zahl `db` in Server-Timing zählt Zugriffe auf das Repo und damit auch Treffer im Lesespeicher.

| Anfrage | Administrator im Modus | Mitglied mit Rolle | Mitglied ohne Rolle |
|---|---:|---:|---:|
| Startseite (`/api/startseite`) | 10 → 5 | 10 → 5 | 12 → 7 |
| Zahlen (`/api/sichten`) | 12 → 2 | 15 → 4 | 16 → 5 |
| Nächster Termin (`/api/termine/naechster`) | 5 → 2 | 8 → 4 | 9 → 5 |
| Mappentypen (`/api/typen`) | 7 → 2 | 7 → 2 | 8 → 3 |
| Liste einer Ansicht | 9 → 5 | 9 → 5 | 10 → 6 |
| Mappe öffnen | 20 → 12 | 17 → 11 | 20 → 14 |
| Zahlen nach einer Änderung des Administrators | 16 Abfragen, 421 ms → 4, 128 ms (eigene Änderung: neu gezählt) | 21, 364 ms → 4, 3 ms | 22, 126 ms → 5, 4 ms |

Lasttest mittel (`server/test/lasttest.mjs mittel --dauer 30`, je drei Läufe abwechselnd vorher und nachher):

| Durchgang | p50 vorher | p50 nachher | p95 vorher | p95 nachher | Anfragen/s vorher | Anfragen/s nachher | Arbeitsspeicher höchstens vorher | nachher |
|---|---|---|---|---|---|---|---|---|
| mittel (nur lesen) | 510 / 462 / 508 | 469 / 463 / 485 | 1.002 / 889 / 995 | 790 / 812 / 819 | 167 / 178 / 169 | 195 / 197 / 189 | 629 / 692 / 646 MB | 789 / 832 / 838 MB |
| mittel + Speichern | 1.540 / 1.276 / 1.445 | 1.239 / 1.059 / 1.254 | 3.258 / 3.062 / 3.051 | 2.679 / 2.270 / 2.598 | 55 / 63 / 61 | 71 / 79 / 72 | 1.136 / 1.228 / 1.224 MB | 1.138 / 1.264 / 1.236 MB |
| davon schreibend | 1.957 / 2.061 / 1.787 | 2.065 / 1.696 / 1.867 | 4.399 / 4.766 / 4.316 | 4.662 / 4.319 / 5.117 | | | | |

Zeiten in ms. Lesen wird schneller (p95 −18 %, 15 % mehr Anfragen je Sekunde), mit Speichern ebenso; das Speichern selbst bleibt gleich. Der Arbeitsspeicher steigt im ersten Durchgang höher (mehr Anfragen, Kopien aus dem Lesespeicher), am Ende beider Durchgänge liegt er gleich – die Zwischenspeicher wachsen nicht mit der Last (feste Schlüssel, höchstens 64 bzw. 500 Einträge). Das Warten auf eine freie Verbindung steigt (p95 50–110 ms → 75–255 ms, mit Speichern bis 590 ms): „Mappe öffnen“ fragt jetzt gleichzeitig, und es kommen mehr Anfragen durch.

## Kalender in „Zu erledigen“ (#528, #725)

Monat und Jahr in „Zu erledigen“ laden ihren Zeitraum mit **einer** Anfrage: `GET /api/termine?von=…&bis=…` (wahlweise `&favoriten=1`) (höchstens 400 Tage, `zeitraumProblem` in `shared/src/kalender.ts`). Der Server holt nur Mappen mit einem Datum im Zeitraum (`mappenMitDatum`, #477); für Felder mit **wiederkehrender** Frist zusätzlich alle Mappen mit einem Datum bis zum Ende des Zeitraums, denn deren künftige Termine (`folgetermine` in `shared/src/fristen.ts`, Datum + k · Abstand) können hineinfallen – seit #918 nur noch die, bei denen das möglich ist ([Vorfilter](#vorfilter-918)). Gespeichert werden diese Termine nie. Die Antwort liegt wie die Zahlen der Ansichten im Zwischenspeicher (`Zaehlerspeicher`), je Benutzer, Rechte und Zeitraum; der `Haushaltsstand` zählt auch bei geänderten Erinnerungen (`ZAEHLT_FUER_TERMINE`), weil die sonst in `OHNE_FOLGEN` stehen (seit #742 ein gemeinsamer Stand in der Datenbank statt eines eigenen `fristenstand`).

**Messung zu #528** (dieselben Daten wie #477: 50.000 Demo-Mappen, lokaler Rechner; Median aus 5 Anfragen; *kalt* = je Anfrage ein neuer Zeitraum, *Treffer* = derselbe Zeitraum aus dem Zwischenspeicher; Zeit bis zur vollständigen Antwort):

| Abfrage | Wer | Einträge | davon Folgetermine | kalt ms | Treffer ms |
|---|---|---:|---:|---:|---:|
| Liste 30 Tage | Administrator | 545 | – | 32 | 9 |
| Monat | Administrator | 934 | 377 | 160 | 9 |
| Jahr | Administrator | 11.863 | 11.863 | 381 | 81 |
| Monat | Mitglied mit Rolle | 0 | 0 | 74 | 6 |
| Jahr | Mitglied mit Rolle | 0 | 0 | 141 | 6 |
| Monat | Mitglied ohne Rolle | 0 | 0 | 81 | 6 |
| Jahr | Mitglied ohne Rolle | 0 | 0 | 120 | 7 |

Der Administrator ist der ungünstigste Fall: Ihm gehören alle Fristen ohne Empfänger, bei den Demo-Daten fast alle Verträge mit jährlicher Kündigungsfrist. Das Jahr ist dann 3,2 MB JSON (ohne Kompression); im Browser steht die Jahresansicht trotzdem nach etwa 0,1–0,2 s, der Monat nach 0,1–0,3 s. Die Mitglieder haben in den Demo-Daten keine eigenen Fristen; ihre Zeit ist das Suchen der Kandidaten. In einem Haushalt mit einigen Dutzend Fristen liegt alles im Bereich der Liste.

### Vorfilter, Mappenstand und Trefferzahl (#918) { #vorfilter-918 }

Grundsatz: **Nachhinken ja, falsch nie** – Angezeigtes darf ein paar Sekunden alt sein, ist aber nie falsch; die eigene Änderung sieht man sofort. Jede Abkürzung liefert dasselbe wie frisch gerechnet (`server/test/zwischenspeicher-termine.test.ts` vergleicht es).

- **Vorfilter `fristtermine`** (Migration 086): je Mappe und Feld jeder Wert, der wie ein Datum aussieht (Text `JJJJ-MM-TT`), dazu sein Monat als Zahl (Jahr · 12 + Monat − 1). Gepflegt per Trigger in derselben Transaktion wie die Mappe – damit stimmt er bei jedem Weg: Oberfläche, API, Import, Demo-Daten, Papierkorb, Wiederherstellen einer Sicherung (COPY löst die Trigger aus; die Tabelle selbst steht in `OHNE_INHALT`), Änderungen von Hand. Er hängt **nicht** an den Feldern des Typs: Welche Felder Fristen sind und ihr Rhythmus kommen bei jeder Abfrage aus dem Typ, eine Typänderung braucht darum keine Pflege. Die Migration füllt den Bestand.
- **Wiederkehrende Fristen** (`fristKandidaten`, `kannTerminHaben` in `shared/src/fristen.ts`): Ein Folgetermin Datum + k · n Monate liegt immer im Monat (Monat des Datums + k · n); nur der Tag wird am Monatsende gekappt. Kandidat ist eine Mappe also, wenn ein Monat des Zeitraums um ein Vielfaches von n (k ≥ 1) nach dem Monat des Datums liegt – eine Rechnung mit ganzen Zahlen in SQL. Jährliche Fristen in einem Monat: etwa ein Zwölftel der Mappen; monatliche: fast alle, dann aber nur Id, Typ, Titel und die Datumswerte statt der ganzen Mappe. Werte, bei denen das Rechnen mit Monaten nicht sicher ist (Tag 00, Monat 13, Jahr vor 0100), sind immer Kandidaten. Den Termin selbst rechnet danach wie bisher `folgetermine` – kein nächtlicher Lauf.
- **Startseite** (`naechsterTermin`): erst die nächsten 31 Tage, nur ohne Termin darin das ganze Jahr (dasselbe Ergebnis; die Reihenfolge bei gleichem Datum ist eindeutig).
- **Mappenstand** (Sequenz `haushaltsstand_mappen`): zählt wie der Haushaltsstand, aber nicht bei `NUR_FAVORITEN` (Stern). Daran hängen die Zahlen je Typ und Ansicht, die Zahl der Treffer und die Termine ohne „nur Favoriten“; was Favoriten meint (`mitFavoriten`), bleibt am Haushaltsstand. Notiz, Historie und „gesehen“ stehen ohnehin in `OHNE_FOLGEN`. Eigene Änderungen gelten sofort, auch über Prozesse (eigene Art im Kurzzustand), und im selben Prozess auch, bevor die Datenbank hochgezählt hat (`lokal`).
- **Zahl der Treffer** (`seiteMitZahl`): je Anfrage ohne Blatt und Reihenfolge, nur bei gleichem Stand und ohne Mindestgültigkeit – sie bleibt genau. Mit bekannter Zahl holt `seite` nur das Blatt (`zahl`), auch ohne `count(*) OVER ()` bei einer Suche. Suchen in Dokumenten und Notizen zählen immer: Deren Texte ändern keinen Stand.
- **Schalter** `DMS_ZWISCHENSPEICHER=aus`: Jeder `Zaehlerspeicher` rechnet bei jedem Abruf frisch (Zahlen, Trefferzahl, Termine, neue Post). Der Lesespeicher für Mappentypen, Ansichten und Einstellungen (#741) bleibt – er hängt am Stand `lesen`, den ein Trigger in derselben Transaktion zählt. Hinweis im Systemzustand (`/api/werkbank/systemlast`, `zwischenspeicher`) und im Lasttest-Bericht.

### Aufgabe und Notiz speichern (#928) { #speichern-928 }

Im Lasttest „+ Speichern“ waren Aufgabe und Notiz anlegen die langsamsten Vorgänge. **Befund** (lokal, 2 Kerne, 50.000 Mappen, 40.000 Aufgaben, 25 gleichzeitig + Speichern; je Anfrage die Repo-Zugriffe aus der Messung summiert): Keine einzelne Abfrage war teuer – unter Last kostet **jeder** Hin- und Rückweg zur Datenbank 10–12 ms (Warten auf Verbindung und Rechenzeit), und `POST /api/mappen/:id/aufgaben` machte 31 davon vor der Antwort, die Notiz 12. Davon gehörten nicht zur Antwort: der Abgleich der Fälle ohne Leserecht (#798, 6 Zugriffe), der Verteiler des Ausgangskorbs (Automatisierungen, Pakete, Webhooks – er lief im Kontext der Anfrage gleich los und teilte sich Verbindungen und Rechenzeit mit ihr), dazu doppelt gelesene Typen der Mappe, Systemtypen (drei `holeTyp`) und Namen. Transaktion und Haushaltsstand spielen beim Anlegen keine Rolle: Aufgabe und Notiz laufen ohne `mappen.transaktion`; Haushalts- und Mappenstand zählen nach der Antwort hoch (Sequenz, 1 ms). Die `mappen.transaktion` im Protokoll gehört zu „Mappe ändern“ (Mittel 190 ms). Deren `SELECT … FOR UPDATE` auf die Mappe hielt aber jede neue Aufgabe, Notiz, Historie und jeden Stern **derselben** Mappe bis zum Ende ihrer Transaktion auf: Der Fremdschlüssel prüft mit `FOR KEY SHARE`, und das wartet auf `FOR UPDATE`.

**Geändert:**

- **Nach der Antwort** (`Dienst.nachDerAntwort`, `Kontext.nachAntwort`, über den `Nachlauf` von #741): der Abgleich der Fälle (`faelleNach`), solange an den Mappen kein Leserecht auf Zeit hängt – hängt eines daran, sofort, denn es endet mit der Aufgabe („falsch nie“); die Übersicht in der Werkbank gleicht vor dem Anzeigen ohnehin selbst ab. Ebenso das Wecken des Verteilers; das Ereignis steht schon im Ausgangskorb. Ohne Anfrage (Tests, Hintergrund, Automatisierungen) läuft beides wie bisher sofort. Was der Nachlauf selbst anstößt, läuft gleich mit.
- **Weniger lesen:** Typ der Mappe aus der Prüfung am Anfang, Name des Empfängers einmal, `holeTyp` aus den gemerkten Mappentypen (`Lesespeicher`, Stand `lesen`; in einer Transaktion weiter aus der Tabelle).
- **`FOR NO KEY UPDATE`** statt `FOR UPDATE` beim feldweisen Ändern und beim Vergeben einer Nummer: Zwei Änderungen derselben Mappe warten weiter aufeinander, neue Aufgaben, Notizen, Historie und Favoriten nicht mehr.
- **Zahl „Zu erledigen“** (`eingangSql`): `empfaenger_id = $ich OR ($admin AND empfaenger_id IS NULL)` machte den allgemeinen Plan der vorbereiteten Abfrage zu einem Hash-Join über alle Mappen des Haushalts (50.000 Mappen: 16 ms, wächst mit dem Bestand). Jetzt zwei Zweige (`UNION`) über den Teilindex `aufgaben_offen_empfaenger_idx (empfaenger_id, mappe_id) WHERE erledigt IS NULL` (Migration 087), die Mappe je Treffer über ihren Schlüssel: 3 ms, unabhängig von der Zahl der Mappen. Gezählt wird genau wie vorher.
- **Ansichten nur mit Favoriten** („ist mein Favorit“) in den Zahlen der Person gehen von den Favoriten aus (`nurFavoritenVon`): Verlangt jede Klausel einer Ansicht den Favoriten derselben Person, zählt ein eigener Lauf nur über deren Favoriten statt über alle Mappen der Typen (50.000 Mappen: 34 ms → 0,2 ms). Zusammen kostet die Zählung der Person (`zaehlePersoenlich`) 1,5–2 ms statt 34 ms.
- Nicht nötig war eine Neuberechnung nur bei Aufgaben: Eine Notiz zählt keinen Stand hoch (`legeNotizAn`, `historieSchreibe`, `legeKatalogEreignisAn` stehen in `OHNE_FOLGEN`), ein Stern nur den Haushaltsstand (#918). Danach rechnet zwar jede Person ihre eigenen Zahlen neu – mit 2 ms statt 34 ms lohnt ein dritter Stand nicht.

**Messung** (`server/test/lasttest.mjs --gleichzeitig 25 --mit-speichern --ohne-export --dauer 60 --mappen 50000`, eigene Konten, 2 Kerne, PostgreSQL 16; p50 / p95 in ms):

| Vorgang | vorher | nachher |
|---|---:|---:|
| Aufgabe (anlegen oder erledigen) | 233 / 439 | 164 / 301 |
| Notiz | 156 / 255 | 139 / 210 |
| Stern | 84 / 168 | 72 / 155 |
| Startseite | 76 / 200 | 74 / 156 |
| Mappe ändern | 304 / 452 | 307 / 453 |
| alle Anfragen | 99 / 252 | 99 / 228 |

Auf dem Server (Handler, Median): Aufgabe anlegen 304 → 204 ms bei 31 → 22 Zugriffen vor der Antwort, Notiz 142 → 118 ms bei 12 → 11. „Mappe ändern“ bleibt der langsamste schreibende Vorgang (Transaktion); das ist ein eigenes Thema. `server/test/aufgaben-zaehler.test.ts` hält fest: gleiche Zahlen wie die bisherige Abfrage, mit und ohne Zwischenspeicher, mit Vertretung, Leserecht auf Zeit, Aufgaben ohne Empfänger und aus Automatisierungen; die eigene Aufgabe und Notiz sind in der nächsten Anfrage zu sehen; Leserecht auf Zeit endet mit dem Erledigen sofort.

## Lasttest { #lasttest }

`server/test/lasttest.mjs` (#544, #563) schickt viele **gleichzeitige HTTP-Anfragen** an ein laufendes Ablago – das Gegenstück zum Mess-Skript, das einzelne Datenbankzugriffe misst. Ohne Abhängigkeiten, nur mit `fetch` von Node.js. Im Image steckt es als Befehl `dms-lasttest` (Betreiber: Administratorhandbuch → [Lasttest selbst durchführen](https://help.ablago.app/admin/aktuell/lasttest/)).

**Lasttest-Modus** (#612): Mit `DMS_LASTTEST=klein|mittel|gross|extrem|alle` lauscht Ablago nur auf 127.0.0.1 (freier Port) und startet das Skript als Kindprozess (`fork`, IPC) gegen diese Adresse; unter dem eigentlichen Port gibt es nur die Seite mit Fortschritt und Ergebnis (`server/src/lasttestmodus.ts`, `web/src/lasttest.tsx`, gemeinsame Typen in `shared/src/lasttest.ts`). Das Skript meldet seine Schritte mit `process.send` (nur mit IPC-Kanal, auf der Konsole ändert sich nichts) und schickt am Ende Bericht und Ergebnisblock mit den Platzhaltern `{{geraet}}` und `{{speicher}}`, die die Seite füllt. Vorher prüft `lasttest.mjs --pruefen` die Sperre der echten Ablage, ohne etwas anzulegen; schlägt sie an, startet Ablago normal und meldet den Grund in der Werkbank-Übersicht (`lasttestAbbruch`). `DMS_LASTTEST_DAUER` entspricht `--dauer`, `DMS_LASTTEST_MAPPEN` (nur extrem, 500000 oder 1000000) `--mappen`, `DMS_LASTTEST_SPEICHERN=nein` `--ohne-speichern` (#739). Tests: `lasttestmodus.test.ts`, mit PostgreSQL `lasttestmodus-e2e.test.ts` (Stufe klein mit 3 s Messdauer, etwa eine Minute).

```bash
# DMS frisch starten (eigene, leere Datenbank), dann eine Stufe oder alle – das Skript richtet selbst ein
# und legt die Demo-Mappen je Stufe dazu (5.000, 50.000, 200.000; 2 % mit einem Brief als PDF) und 30 Konten für die Personen (#920)
node server/test/lasttest.mjs klein --ziel http://127.0.0.1:3100 --grenzen
node server/test/lasttest.mjs alle --ziel http://127.0.0.1:3100 --dauer 120 --bericht bericht.md --json lasttest.json --grenzen
# extrem (#739) nur von Hand; lokal zum Ausprobieren mit weniger Mappen (der Bericht nennt den Bestand)
node server/test/lasttest.mjs extrem --mappen 1000000 --ziel http://127.0.0.1:3100 --bericht bericht.md
node server/test/lasttest.mjs extrem --mappen 60000 --ziel http://127.0.0.1:3100 --dauer 10 --schritt-dauer 10 --bis 50
```

Ein passendes Ablago startet man aus `server/` mit eigener, leerer Datenbank (z. B. `dmslast`): `NODE_ENV=production DMS_DATENWURZEL=/tmp/dmslast DMS_EINRICHTUNGSCODE=aus DATABASE_URL=postgres://…/dmslast PORT=3100 node dist/index.js` nach `npm run build -w server`. Die Datenbank danach wieder löschen.

**Schutz der echten Ablage:** Ist Ablago frisch, richtet der Test es ein (Haushalt „Lasttest“, Konten mit Persona-Namen unter `example.org`, Beispiele, eine Rolle, Regeln wie in einem Haushalt). Ist es schon eingerichtet, misst er nur, wenn er sich mit seinem Administrator-Konto anmelden kann und höchstens 200 Mappen keine Demo-Mappen sind – sonst Abbruch mit Exit-Code 2, ohne etwas anzulegen. Nach neuen Demo-Mappen wartet er, bis die Arbeit im Hintergrund (Texterkennung, Vorschaubilder) vorbei ist.

**Profil:** Jede „Person“ schickt eine Anfrage nach der anderen, gemischt wie im Alltag – Startseite (`/api/startseite`, `/api/sichten`, `/api/termine/naechster`, `/api/typen`) 15 %, Liste einer Ansicht 25 %, Mappe öffnen 25 %, Suche 15 %, Vorschaubild 10 %, Dokument herunterladen 10 %. „100 gleichzeitig“ heißt: 100 Anfragen sind ständig unterwegs. Bekommt eine Person 503, wartet sie, wie `Retry-After` sagt.

**Eigene Konten** (#920): Person *i* schickt ihre Anfragen mit dem Konto *i mod `PERSONEN_MAX`* (30, `personKonto`): `lasttest-person-NN@example.org`, „Person NN (Lasttest)“; jedes dritte ohne Rolle wie Petra, die übrigen mit der Rolle „Steuern und Finanzen“ wie Jonas. Der Test legt fehlende Konten beim Vorbereiten als Administrator an (`POST /api/benutzer`, Rollen von Jonas; ein Konto ohne Passwort bekommt einen neuen Link), meldet alle ohne Verwaltungsmodus an (je fünf gleichzeitig) und am Ende der Stufe bzw. des Laufs wieder ab. Vorschaubild, Herunterladen und Historie gingen bis dahin als Administrator; jetzt mit dem eigenen Konto – Personen ohne Rolle nur in Mappentypen, die sie ganz sehen (`gesamt` gleich dem des Administrators), damit es dafür kein 404 gibt. Werkbank-Abfragen (`/api/werkbank/last`, `/system`, `/systemlast`), Export nebenher und Aufräumen bleiben bei der Mess-Sitzung des Administrators im Verwaltungsmodus (#873). Anmeldungen kommen alle vor dem Messen und nur mit richtigem Passwort – der Anmeldeschutz zählt nur Fehlversuche, die Probe des Anmeldeschutzes (eigenes Konto, eigene Adresse über `X-Forwarded-For`) bleibt unberührt. Grund: Mit drei geteilten Konten warteten gleichzeitige Änderungen auf dieselbe Zeile in `kurzzustand` (Merker „eigene Änderung“, `zaehlerspeicher.ts`) und auf `UPDATE sitzungen SET zuletzt_aktiv` – das tun echte Nutzer nicht. Bericht (`personenText`) und Ergebnisblock (`Personen: …`) kennzeichnen Messungen mit eigenen Konten; frühere sind vor allem bei „+ Speichern“ nicht direkt vergleichbar.

**Mit Speichern** (#739): Nach dem bisherigen Durchgang jeder Stufe folgt ein zweiter mit derselben Gleichzeitigkeit (und bei mittel mit Export nebenher) nach `PROFIL_SPEICHERN`: die Leseanteile × 0,85, dazu 5 % Historie (`HISTORIE_LESEN`, #800: erste Seite mit 100 Einträgen, `GET /api/mappen/:id/historie?max=100`, seit #920 mit dem eigenen Konto; im Bericht mit eigener p50/p95) und 10 % schreibend (`SCHREIBEN`) – Mappe ändern 4 % (`PUT /api/mappen/:id` auf ein Text- oder Langtextfeld, nicht eindeutig, ohne Muster), Stern 2 % (`PUT`/`DELETE …/favorit`), Notiz 2 % (anlegen oder eine eigene löschen), Aufgabe 2 % (an sich selbst anlegen, beim nächsten Mal erledigen). Ziele sind je Ansicht bis zu 50 der ersten 200 Mappen, die das Mitglied ohne Rolle sieht – alle Konten dürfen sie lesen und ändern; die Ziele holt der Durchgang selbst, der bisherige startet also unverändert. Bei groß und extrem läuft er nach der Erholung mit so vielen gleichzeitig wie die Grenze (sonst wie der erste Schritt). Danach `aufraeumen`: Sterne und Notizen weg, Werte zurück, offene Aufgaben aus dem Durchgang erledigt (eigene und „Geändert“ zu Favoriten, #422); übrig bleiben Einträge in der Historie und erledigte Aufgaben. Messung ohne Ziel und ohne CI-Grenze; schreibende Anfragen mit 4xx stehen im Bericht („Abgelehnt“) – dann stimmt der Test nicht. Die alten Zeilen des Ergebnisblocks (auch Arbeitsspeicher und Ereignisschleife) zählen nur die bisherigen Durchgänge; neu sind `… + Speichern` je Stufe und `Mit Speichern: Arbeitsspeicher …`.

**Stufen** (#563; die Stufen „normal“ und „Überlast“ aus #544 gehen darin auf, `--stufe normal` bzw. `ueberlast` laufen als `mittel` bzw. `gross`)

| Stufe | Was | Daten | Geprüft (`--grenzen`) |
| --- | --- | --- | --- |
| klein | 25 gleichzeitig, `--dauer` Sekunden | 5.000 Mappen | **Ziel:** p95 < 300 ms. **CI-Grenze:** p95 300 ms, keine Fehler (kein 5xx, keine Anfrage ohne Antwort), keine 503 |
| mittel | 100 gleichzeitig, nebenher ein großer Export nach dem anderen: PDF von bis zu 1000 Mappen mit Übersicht, PDF der Mappen mit Dokumenten, ZIP der größten Ansicht | 50.000 Mappen | **Ziel:** p95 < 1 s. **CI-Grenze:** p95 1.000 ms (gleich dem Ziel), Fehlerquote < 0,1 %, keine 503, jeder Export gelingt |
| klein/mittel/groß + Speichern (#739) | wie die Stufe (groß: Grenze), 10 % schreibend, danach Aufräumen | wie die Stufe | **Messung**, kein Ziel, keine CI-Grenze, kein Einfluss auf den Exit-Code |
| groß | 5, 10, dann ab 25 gleichzeitig alle `--schritt-dauer` (120) Sekunden 25 mehr (`--start` beginnt genau dort), bis p95 > 3 s, Fehlerquote > 1 % oder der Überlastschutz greift (503); danach 1000 gleichzeitig (höchstens 60 s) mit Anmeldeschutz-Probe, dann Erholung | 200.000 Mappen | **Messung:** Grenze = höchste Stufe ohne Abbruch; mit `--vorher` Warnung, wenn sie mehr als 20 % unter der des letzten Laufs liegt. **Pflicht:** keine Anfrage ohne Antwort nach 60 s, Arbeitsspeicher von Ablago ≤ 1,5 GB **je Prozess** (#920, `speicherVerfehlt`: höchster Prozess aus `engpass.speicherJeProzess`, ohne Angabe je Prozess die Summe gegen 1,5 GB × 1), Server bleibt erreichbar, Erholung (20 Anfragen in Folge mit p95 ≤ 1 s) innerhalb von 30 s, Anmeldeschutz sperrt nach falschen Passwörtern auch das richtige (429) |
| extrem (#739) | wie groß; nur von Hand, nicht in `alle` und nicht im Zeitplan | 500.000 (Vorgabe) oder 1.000.000 Mappen (`--mappen`) | **Messung** wie groß; im Workflow ohne `--grenzen`. Im Bericht und im Ergebnisblock zusätzlich: Dauer des Anlegens der Demo-Daten (Läufe zu je 50.000 über die Werkbank, danach Arbeit im Hintergrund) und Größe von Datenbank und Dokumenten (`GET /api/werkbank/system`) |

Ausgabe je Durchgang: Anfragen, je Sekunde, Median, p95, p99, Fehlerquote (5xx und ohne Antwort), abgewiesen (503, mit `Retry-After`), Verzögerung der Ereignisschleife (p99 und höchstens), Warten auf eine Verbindung zur Datenbank, Arbeitsspeicher von Ablago (Start, höchstens, Ende), dazu Dauer und Größe jedes Exports und Median/p95 je Art und der **Engpass** über alle Prozesse (#874: Warten auf Verbindungen, belegte Verbindungen, Sperren, CPU von PostgreSQL und Ablago, Arbeitsspeicher je Prozess; [Mehrere Prozesse](#mehrere-prozesse)). Die Werte des Servers liest der Test alle 2 Sekunden über `GET /api/werkbank/last`. Am Ende steht der **Ergebnisblock** zum Kopieren – ohne Adresse des Ziels, ohne Namen; das CPU-Modell nur, wenn der Test auf demselben Rechner läuft. Mit `--json` alles als Datei (auch Eingabe für `--vorher`), mit `--gleichzeitig <n>` (und `--ohne-export`) ein einzelner Durchgang.

**Warum diese Grenzen:** klein und mittel sind eine **Qualitätszusage** (Thomas, #563): Ein Haushalt soll Ablago flüssig erleben, ein Kleinbetrieb auch mit Export nebenher. Die **Ziele** (p95 < 0,3 s bzw. < 1 s) sind deutlich strenger als die großzügigen Grenzen aus #544 (p95 ≤ 5 s bzw. 6 s, Fehlerquote ≤ 1 %). Weil schon der erste Lauf auf den Rechnern von GitHub das Ziel von mittel verfehlte, gilt für den Exit-Code eine eigene **CI-Grenze** (Entscheidung Thomas, #563): erster GitHub-Lauf + 20 % (Run 41448183378, Ablago 0.139.0: klein p95 95 ms → bleibt beim Ziel 300 ms; mittel p95 2384 ms → 2860 ms). Sie wird nur strenger, nie lockerer, bis sie das Ziel erreicht – nach dem Beschleunigen (#615; Run 41549943703, Ablago 0.146.0: mittel p95 586 ms) ist das geschehen: CI-Grenze = Ziel für klein und mittel. Ein verfehltes Ziel steht im Bericht (Abschnitt „Ziel verfehlt“, im Workflow als Hinweis) und führt zu einem Folge-Issue „Beschleunigen“; rot wird der Lauf nur über der CI-Grenze. Beides steht in `STUFEN` (`ziel`, `ciGrenze`) in `server/test/lasttest.mjs`, geprüft von `server/test/lasttest-grenzen.test.ts`. Groß ist dagegen eine **Messung**: Wo die Grenze liegt, hängt an der Hardware; der Lauf meldet sie und warnt bei deutlicher Verschlechterung, statt rot zu werden. Lokal, auf einem belasteten Rechner mit 2 Kernen, lagen klein bei p95 525 ms und mittel bei p95 4,7 s – nicht aussagekräftig, aber ein Hinweis, dass ein Rechner mit 2 Kernen die Zusage für mittel nicht schafft.

**Überlastschutz** (`server/src/ueberlast.ts`): Mehr als `DMS_MAX_ANFRAGEN` (250) gleichzeitige Anfragen an `/api/` und `/webdav` beantwortet ein Hook vor allem anderen sofort mit 503 und `Retry-After: 5`. Gezählt wird vom Eingang bis die Antwort fertig oder die Verbindung zu ist (`close`). Ausgenommen: `/api/gesundheit` und `/api/werkbank/last`. Dazu nimmt der Server neue Verbindungen mit einer längeren Warteschlange an (`backlog: 2048` statt 511). Programme, die `Retry-After` nicht beachten und sofort wieder fragen, bekommen ebenfalls sofort ihre 503; auf dem Testrechner mit 2 Kernen blieben dann bei 1000 gleichzeitig rund 1–2 % der Anfragen nach 60 s ohne Antwort, obwohl der Server keine Anfrage länger als 15 s bearbeitete – der Lasttest selbst (im selben Rechner) kam mit dem Verbindungsaufbau nicht mehr hinterher.

**Verbindungen zur Datenbank** (`server/src/db.ts`): Vorgabe 10, einstellbar mit `DMS_DB_VERBINDUNGEN` (2–100; seit #874 für alle Prozesse zusammen, Vorgabe dann 10 + 4 je weiteren Prozess). Gemessen bei 100 gleichzeitig ohne Export, je zwei Runden: 5 Verbindungen 3.894–4.117 Anfragen je Minute (p95 2,7–2,9 s), 10 Verbindungen 3.516–3.726 (p95 2,9–3,1 s), 20 Verbindungen 3.512–3.517 (p95 2,9 s) – gleichauf im Rahmen der Schwankung. `Verbindungswarten` misst alle 5 Sekunden mit `SELECT 1`, wie lange eine Abfrage auf eine freie Verbindung wartet (einschließlich Hin- und Rückweg und Wartezeit der Ereignisschleife); Werkbank → Datenbank-Anbindung zeigt Median und Höchstwert der letzten Minute. Seit #1198 läuft höchstens eine Messung zugleich; wartet sie länger als `VERBINDUNG_WARNUNG_MS` (10 s), warnt das Protokoll mit `belegung()` (belegt, reserviert, wartend aus `sql.stats` von postgres.js 4, gehaltene Sperren). Der Pool hat `queue_timeout` = `VERBINDUNG_WARTEN_S` (30 s): danach `QUEUE_TIMEOUT`, das `http.ts` als 503 mit `datenbank: true` beantwortet. `Datenbankpruefung` (für `/api/gesundheit`): `SELECT 1` mit 5 s Grenze, 5 s zwischengespeichert, nie zwei wartende Prüfungen zugleich. Seit #1199 liefert `befund()` den Zustand: Zeitgrenze, wartende Prüfung oder `QUEUE_TIMEOUT`/`CONNECT_TIMEOUT` → `antwortet-nicht`, jeder andere Fehler (z. B. `ECONNREFUSED`, SQLSTATE 57P03) → `abgewiesen`; dazu `seit` (erste fehlgeschlagene Prüfung in Folge) und `dauerS`. Die Oberfläche (`web/src/startbild.ts`) wählt daraus Lage und Schritt 2 der Meldung „Ablago antwortet gerade nicht“; die Version kennt sie nur aus dem Browser (`localStorage`, zuletzt angemeldet), weil der Server sie ohne Anmeldung nicht nennt.

**Workflow** `.github/workflows/lasttest.yml`: wöchentlich (mittwochs nachts) und von Hand („Run workflow“, wahlweise Stufe, Dauer und für extrem die Zahl der Mappen) – nicht bei jedem Pull Request, weil die Rechner von GitHub schwanken und ein Lauf gut eine Stunde dauert. Er startet PostgreSQL 17 als Dienst, baut den Server, misst alle drei Stufen mit `--grenzen` (CI-Grenze von klein oder mittel oder eine Pflicht verfehlt → Lauf rot; Ziel verfehlt → Hinweis) und hängt den Bericht an den Lauf (Zusammenfassung; Bericht, JSON und Protokoll von Ablago als Artefakt). Die Grenze von groß merkt er sich im Cache (`lasttest-gross-…`) für die Warnung beim nächsten Lauf. Nach groß (also auch bei `alle`) und extrem startet er Ablago mit dem ganzen Bestand neu: `server/test/startzeit.mjs` misst die Zeit bis **erreichbar** (Startseite „Ablago startet …“) und bis **bereit** (`/api/gesundheit` 200) und hängt sie an den Bericht (#802; `startzeit.json` im Artefakt). Vor einem größeren Release von Hand starten.

**extrem in der CI** (#739): Stufe `extrem` nur über „Run workflow“, Zeitgrenze des Jobs dann 350 statt 180 Minuten (GitHub erlaubt 6 Stunden). Die Demo-Daten entstehen wie bei groß über die Werkbank (`POST /api/werkbank/demo`, je Lauf 50.000) – kein eigener Weg direkt in SQL, damit dieselben Prüfungen gelten und der Lasttest-Modus im Browser dasselbe misst. Auf den Rechnern von GitHub dauerten 50.000 Mappen bei 50.000–200.000 vorhandenen 54–72 s; für 1 Mio. sind also etwa 20 Läufe mit 1–3 Minuten zu erwarten (rund 30–60 Minuten), dazu die Arbeit im Hintergrund (höchstens 15 Minuten abgewartet) und die Schritte der Grenze. Platz: lokal belegten 60.000 Mappen 125 MB in der Datenbank und 3 MB Dokumente (etwa 2 KB je Mappe); 1 Mio. Mappen brauchen damit rund 2–3 GB zuzüglich WAL – weit unter den 14 GB der Rechner. Die Zusammenfassung des Laufs nennt den freien Platz danach.

**Beschleunigt in #615** (Suche und „Mappe öffnen“ unter Last): Gemessen mit Stichproben aus `pg_stat_activity` während des Laufs, `EXPLAIN ANALYZE`, Server-Timing und einem CPU-Profil des Servers (`--cpu-prof`). Die Ursachen, in der Reihenfolge ihres Gewichts:

1. **Suche faltete jede Mappe neu.** Titel und jeder Wert gingen bei jeder Suche durch `dms_falte` (unaccent) und `jsonb_each_text` – rund 200 ms Rechenzeit der Datenbank je Abfrage bei 20.000 Mappen, und eine Suche braucht zwei bis fünf Abfragen (Zählen, Seite, ohne Treffer noch einmal mit ähnlichen Wörtern). Jetzt steht der gefaltete Text in `mappen.suchtext` (Migration 055, Trigger); die Suche filtert damit vor und vergleicht danach wie bisher genau je Titel und Wert – dieselben Treffer, 10–15 ms je Abfrage. Mit Suche sortiert PostgreSQL erst nach dem Filtern (Teilabfrage mit `OFFSET 0`): Der allgemeine Plan einer vorbereiteten Abfrage ging sonst bei seltenen Begriffen den Titel-Index ganz durch (über 100 ms).
2. **Schreiben unter Last.** Jeder Langläufer war ein eigenes INSERT mit eigenem Commit – unter Last fast jede zweite Anfrage, das bremste die Datenbank gerade dann (Warten auf `WALWrite`/`WALSync`). Jetzt gesammelt. „Mappe öffnen“ schreibt „Zuletzt geöffnet“ und „gesehen“: Beides ist jetzt je eine Anweisung ohne Warten auf die Platte (`ohneWarten` in `repo-pg.ts`); vorher hielten die Commits die Zeile des Benutzers so lange gesperrt, dass gleichzeitige Anfragen desselben Benutzers aufeinander warteten (`Lock:transactionid`).
3. **Listen sortierten alle Mappen einer Ansicht.** Mit `typ_id = ANY(…)` nutzt PostgreSQL 16 den Index `(haushalt_id, typ_id, lower(titel))` nicht für die Reihenfolge; ein einzelner Typ steht deshalb als Gleichheit in der Abfrage (`typIn`): eine Seite der größten Ansicht 1 ms statt 45 ms.
4. **Doppelte Zugriffe je Anfrage.** Mappentypen und Rollen des Benutzers liest der Zugriff schon (`z.typen`, `z.a`); Liste und „Mappe öffnen“ lesen sie nicht noch einmal. „Mappe öffnen“ liest die Aufgaben der Mappe einmal (für die Regel „mit Aufgabe“, die Antwort und „gesehen“) und prüft Rückverweise und Bezüge in einem Zugriff: 15 statt 19 Zugriffe (Mitglied 18 statt 24), die Liste 10 statt 12. Die Startseite fragt nur noch, ob es eine eigene Mappe gibt, statt alle Mappen je Typ zu zählen; `heuteIn` legt sein `Intl.DateTimeFormat` nur einmal an (vorher gut 3 % der Rechenzeit des Servers).

Lasttest mittel auf dem Testrechner (2 Kerne, Lasttest auf demselben Rechner, PostgreSQL 16): p95 vorher 3,9 s, nachher 0,75 s (120 s je Lauf); Zahlen je Aktion in den Release-Notes von #615. Danach ist der eine Faden von Node.js der Engpass (Antworten in JSON wandeln, Masken für Passwörter, Socket-Schreiben von postgres.js), nicht mehr die Datenbank.

**Beschleunigt in #740 und #743** (Suche, Listen, Speichern; Migration 075):

1. **Suche über Indizes.** `mappen.suchtext` ist nie leer (NOT NULL) und hat einen Trigramm-Index. Die Treffer kommen als eine Id-Menge (`UNION` aus Mappe, Notizen und Dokumenten, je über ihren Index), erst danach prüft die Abfrage Typ, Bedingungen und Lesefilter; Gesamtzahl und Seite in einer Abfrage (`count(*) OVER ()`). Ob „Meintest du …?“ etwas findet, fragt `gibtTreffer` (`EXISTS … LIMIT 1`).
2. **Sortieren über Indizes.** `(haushalt_id, lower(titel), id)` für Ansichten über mehrere Typen, `(haushalt_id, typ_id, erstellt|geaendert)` und `(haushalt_id, erstellt|geaendert)`. Absteigend liest PostgreSQL denselben Index rückwärts; dafür steht bei Titel, Erstellt und Geändert kein `NULLS LAST` in der Abfrage (die Spalten sind NOT NULL, ein Titel fehlt nur kurz vor dem ersten Berechnen). Ohne Suche zählt nur das erste Blatt; beim Blättern schickt die Oberfläche die Zahl mit (`gesamt`).
3. **Dublettenprüfung über einen Index.** `dms_gleichwerte(werte)` liefert je Text- und Zahlwert einen Fingerabdruck aus Feldschlüssel und `lower(trim(wert))` (md5 als uuid); der GIN-Index darüber findet gleiche Werte, danach wird genau verglichen. `findeDoppelte` prüft viele Mappen in einer Abfrage (Passung nach dem Speichern).
4. **Speichern in einem Zug.** Anlegen und Ändern laufen in einer Transaktion (bei Verklemmung von vorn), der Titel steht im selben UPDATE wie die Werte. Der Ereignisverteiler setzt „verteilt“ je Abholung in einer Anweisung.

Gemessen mit 50.000 Demo-Mappen und 25.000 Dokumenten (Mess-Skript, Median aus 7 Läufen, `SichtenDienst.seite` bzw. `aendereMappe`, 2 Kerne, PostgreSQL 16):

| Fall | vorher | nachher |
|---|---:|---:|
| Alle Typen, Titel ↑ | 98 ms | 14 ms |
| Alle Typen, erstellt ↓ | 141 ms | 9 ms |
| Rechnung, Titel ↓ | 61 ms | 8 ms |
| Rechnung, erstellt ↓ | 50 ms | 7 ms |
| Suche „Strom“ über alle Typen | 88 ms | 14 ms |
| Suche „Strom“ mit Notizen und Volltext | 381 ms | 164 ms |
| Suche ohne Treffer | 56 ms | 2 ms |
| Vertrag speichern (eindeutiges Feld) | 33 ms | 12 ms |

Einzelne Abfragen (`EXPLAIN ANALYZE`): Seite über alle Typen nach Titel 49 → 0,6 ms, nach Erstellt absteigend 54 → 0,5 ms, Rechnung nach Erstellt absteigend 33 → 0,3 ms, Dublette Vertragsnummer 17 → 0,2 ms. Lasttest mittel (30 s je Durchgang, Lasttest auf demselben Rechner): p95 1274 → 693 ms; mit Speichern p95 3,8 → 3,2 s, schreibende Anfragen p50 2,3 → 1,7 s. Die Tabelle `mappen` wächst mit den Indizes von 46 auf 76 MB; die Migration dauerte 4 s.

**Messung zu #542** (Arbeiter-Pool, vorher/nachher abwechselnd gemessen): Bei 10 gleichzeitigen Anfragen mit Export sank p95 von 2.172 auf 786 ms und die Verzögerung der Ereignisschleife (p99) von 1.373 auf 135 ms; Einzelheiten in den Release-Notes von #542.

## Historie bei großen Mengen (#800) { #historie }

Seit #800 kommen auch Abrufe in die Historie (Herunterladen, API, WebDAV). Damit sie bei vielen Mappen und Jahren schnell bleibt:

- **Erst beim Öffnen des Registers** und **seitenweise**: Die Oberfläche lädt 100 Einträge (`?max=100`), „Weitere laden“ die nächsten ab dem letzten (`?vor=<id>`, Keyset über `(zeit, id)`, kein `OFFSET`). Mappe öffnen liest die Historie nicht. Ohne `max` liefert die Schnittstelle wie bisher alles.
- **Index** `historie_mappe_idx (mappe_id, zeit DESC, id DESC)` (seit #57) trägt beides: die Seiten und den Blick „gleicher Abruf heute schon?“ (nur die Einträge der Mappe seit 26 Stunden). Ein eigener Index für die Arten lohnt nicht (siehe Messung); eine Migration braucht #800 nicht.
- **Rauschen unterdrücken:** derselbe Abruf (Person, Datei, Fassung, Weg) einmal je Kalendertag in der Zeitzone der Ablage; gleichzeitige Abrufe derselben Datei prüft und schreibt ein Prozess nacheinander. Ein Tag statt einer „WebDAV-Sitzung“, weil Explorer, Finder und Office keine erkennbare Sitzung haben (sie halten Verbindungen offen und lesen im Hintergrund nach) und weil ein Tag für alle Wege gleich verständlich ist – „am Dienstag hat Jonas den Vertrag abgerufen“.
- **Keine Partitionen je Jahr:** Gelesen wird immer je Mappe über den Index – Partitionen nach Zeit helfen dabei nicht (jede Abfrage müsste in jede Partition schauen), und gelöscht wird nie nach Alter, sondern nur mit der Mappe nach dem Löschkonzept. Erst wenn eine Aufbewahrung nach Zeit käme, wäre das neu zu prüfen.

**Messung** (Entwicklungsrechner, PostgreSQL 16, warm, 2,1 Mio. Einträge über 200.000 Mappen, dazu eine Mappe mit 100.000 Einträgen – fünf Jahre lang Abrufe alle 26 Minuten):

| Abfrage | Zeit |
| --- | --- |
| Erste Seite (100) einer gewöhnlichen Mappe | 0,4 ms |
| Erste Seite der Mappe mit 100.000 Einträgen | 2,6 ms |
| … nur WebDAV, zweite Seite | 2,5 ms |
| … Vorauswahl, wenn nur 200 der 100.000 Einträge passen (ungünstigster Fall: der Index liest alle) | 54 ms |
| „Gleicher Abruf heute schon?“ in dieser Mappe | 0,3 ms |
| Ganze Historie dieser Mappe ohne Seiten (Schnittstelle ohne `max`) | 964 ms |

**Speicher:** rund 320 Byte je Eintrag einschließlich der Indizes (Tabelle 230 Byte, `historie_mappe_idx` 65 Byte, Primärschlüssel 22 Byte). Zum Abschätzen: 1 Mio. Mappen mit je 20 Einträgen sind etwa 6 GB; 50 Personen, die an 250 Tagen im Jahr je 200 verschiedene Dateien abrufen, kommen in fünf Jahren auf 12,5 Mio. Abrufe, also etwa 4 GB. Ohne das Zusammenfassen gleicher Abrufe am selben Tag wäre es bei Explorer und Office leicht das Hundertfache. Gemessen unter Last wird die erste Seite im Durchgang „mit Speichern“ jeder Stufe des [Lasttests](#lasttest), auch in *extrem*.

## Mehrere Prozesse (#745) { #mehrere-prozesse }

`DMS_PROZESSE` (Vorgabe 1, `auto` = Kerne − 1, höchstens 2, rund 1 GB je Prozess plus 1 GB Reserve; #874) verteilt die Anfragen mit `node:cluster` reihum auf mehrere Prozesse; Prozess 1 leitet und erledigt die Arbeit im Hintergrund (Aufbau: [Mehrere Prozesse](aufbau.md#mehrere-prozesse)). `GET /api/werkbank/last` meldet dann den Arbeitsspeicher **aller** Prozesse zusammen (Pss, damit geteilter Code nicht mehrfach zählt; die Summe der RSS steht unter `rssMb`), die Wartezeit der Ereignisschleife des langsamsten Prozesses und je Prozess eine Zeile unter `prozesse`; die Verbindungen zur Datenbank zusammen. Die Pflicht „Arbeitsspeicher von Ablago ≤ 1,5 GB“ gilt seit #920 **je Prozess**: Der Lasttest prüft den höchsten Prozess aus `engpass.speicherJeProzess` und nennt daneben die Summe mit der Grenze × Prozesse (bis dahin verglich er die Summe mit 1,5 GB und meldete mit zwei Prozessen ab „groß 350“ zu Unrecht „verfehlt“). Der Ergebnisblock nennt `DMS_PROZESSE` bei den Einstellungen.

**Messung zu #745** (lokal, 2 Kerne, PostgreSQL 16, Lasttest auf demselben Rechner, Server aus `dist/`; je Durchgang 30 s bzw. 20 s je Schritt von groß; abwechselnd 1 und 2 Prozesse):

| Durchgang | 1 Prozess | 2 Prozesse |
|---|---|---|
| mittel (50.000 Mappen), p95 | 963 / 1.049 ms | 1.338 / 1.320 ms |
| mittel, Anfragen je s | 178 / 160 | 152 / 150 |
| mittel + Speichern, p95 | 3.568 / 3.237 ms | 4.592 / 5.502 ms |
| mittel + Speichern, Anfragen je s | 56 / 55 | 50 / 39 |
| mittel, Ereignisschleife p99 höchstens | 156 / 161 ms | 303 / 274 ms |
| mittel, Arbeitsspeicher höchstens (2 Prozesse: Summe RSS) | 944 / 953 MB | 1.217 / 1.229 MB |
| mittel + Speichern, Arbeitsspeicher höchstens | 1.219 / 1.156 MB | 1.819 / 1.874 MB |
| mittel auf 200.000 Mappen, p95 (Speichern) | 4.741 ms (11.208 ms) | 6.023 ms (19.362 ms) |
| mittel auf 200.000 Mappen, Arbeitsspeicher Pss (Speichern) | 908 MB (1.573 MB) | 1.324 MB (2.300 MB) |
| groß (200.000 Mappen): Grenze | 100 gleichzeitig, 67/s, p95 2.476 ms | 150 gleichzeitig, 88/s, p95 2.564 ms |
| groß: Arbeitsspeicher höchstens (2 Prozesse: Pss) | 1.010 MB | 1.134 MB |
| groß: Erholung nach 1000 gleichzeitig | 0,3 s | 0,3 s |

**Ergebnis:** Mit 2 Kernen, auf denen auch PostgreSQL und der Lasttest rechnen, gibt es keinen freien Kern für einen zweiten Prozess: In der Stufe mittel wird es langsamer (mehr Wechsel zwischen Prozessen, zwei Ereignisschleifen kämpfen um denselben Kern), nur die Grenze der Stufe groß steigt (100 → 150 gleichzeitig). Der Arbeitsspeicher steigt um 30–50 %: Jeder Prozess hat eigene Zwischenspeicher, Puffer und Halde. Daher die Empfehlung Kerne − 1 und `auto` = 1 bei 2 Kernen; eine aussagekräftige Messung mit 3 und 4 Prozessen braucht einen Rechner mit mindestens 4–6 Kernen (für #576 vom NAS des Maintainers bzw. vom Workflow nachzutragen). Die Überlast-Probe mit 1000 gleichzeitig ließ lokal Anfragen ohne Antwort (1 Prozess 211, 2 Prozesse 551) – wie unter „Überlastschutz“ beschrieben kommt der Lasttest auf demselben Rechner mit dem Verbindungsaufbau nicht nach.

**Messung zu #874** (Engpass mit mehreren Prozessen): Auf dem NAS des Maintainers (Pentium Gold 8505, 6 Threads, `dms-komplett`, #576) halbierte sich mit 4 Prozessen der Median beim Speichern, p95 wurde aber schlechter (groß + Speichern 7,2 → 8,1 s), der Arbeitsspeicher stieg von 1,3 auf 3,3 GB. Vermutung: der gemeinsame Engpass PostgreSQL im selben Container, mit 4 × 10 Verbindungen. Eine zweite Messung dort (0.204.0, `dms` mit PostgreSQL im **eigenen** Container, 4 Prozesse, 200.013 Mappen): mittel p95 378 ms, mit Speichern 1.658 ms; groß: Grenze nur 25 gleichzeitig (Abbruch: Fehlerquote 1,10 %, mit einem Prozess früher 225), mit Speichern p95 3.226 ms; Arbeitsspeicher 3,5 GB, mit Speichern 5,8 GB; Ereignisschleife p99 bis 1,5 s. Der Engpass ist also nicht nur die Datenbank im selben Container.

Damit sich das belegen lässt, meldet `GET /api/werkbank/last` unter `engpass` über **alle** Prozesse:

- `pool`: Wartezeit auf eine freie Verbindung (`server/src/poolmessung.ts`). postgres.js 4 meldet über `node:diagnostics_channel` je Abfrage, wann sie in die Warteschlange kam und wann sie an eine Verbindung ging (`postgres:query`, `queued` → `sent`), und beim Ausleihen für eine Transaktion die Wartezeit (`postgres:pool`, `lease`, `waited`). Gezählt wird in festen Klassen (`KLASSEN_MS`, fortlaufend), dazu der Höchstwert der letzten 10 s, belegte Verbindungen (`sql.stats`, alle 250 ms) und wartende Abfragen. Die Messung schaltet sich erst mit der ersten Frage ein (`prozess.last`) und nach 3 Minuten ohne Frage wieder ab – im Alltag kostet sie nichts.
- `sitzungen`: aus `pg_stat_activity` (diese Datenbank, ohne die eigene Abfrage) wartend auf eine Sperre (`wait_event_type = 'Lock'`), aktiv, offen; die längste Sperre aus `pg_locks.waitstart` (ab PostgreSQL 14).
- `cpu`: Rechenzeit fortlaufend in Sekunden aus `/proc/<pid>/stat` – PostgreSQL (alle Prozesse `postgres`, nur mit `DMS_VARIANTE=komplett`), Ablago (Hauptprozess und alle Prozesse) und der Container (cgroup).
- `speicher`: je Prozess Pss und die Halde von V8 (`heapUsed`).
- `neustarts`: abgestürzte und neu gestartete Prozesse seit dem Start, mit Nummer und Code bzw. Signal (vom Hauptprozess).

Dazu stehen im Bericht und im Ergebnisblock die **Fehlerarten** je Durchgang (`fehlerText`: Status 5xx außer 503, Codes abgebrochener Verbindungen aus `fehlerJe`, ohne Antwort je Art), bei groß auch Engpass und Fehler des Schritts, an dem es abbrach.

Der Lasttest bildet daraus je Durchgang p95 der Wartezeit (Unterschied der Klassen zwischen erstem und letztem Stand, als Obergrenze der Klasse), Höchstwerte und die CPU in Prozent eines Kerns über den Durchgang (`engpassAus`) und schreibt sie als eingerückte Zeile „Engpass …“ unter die Stufe in den Ergebnisblock (bei groß für den Schritt an der Grenze) und als Liste in den Bericht.

**Teuerste Abfragen (#894)** (`server/src/abfragestatistik.ts`): Vor jedem Durchgang ruft der Test `POST /api/werkbank/last/abfragen-zuruecksetzen` (`pg_stat_statements_reset` nur für die eigene Datenbank; legt die Erweiterung im Schema `erweiterungen_dms` an, wenn das Modul geladen ist und die Rolle es darf), danach einmal `GET /api/werkbank/last?abfragen=10`. Ohne den Parameter liest die Route `pg_stat_statements` nicht – die Abfrage alle 2 Sekunden bleibt so billig wie bisher. Beides braucht das Recht *systemzustand*. Ausgegeben werden nur normalisierte Abfragen (ohne die an `pg_stat_statements` selbst), Leerraum zusammengezogen, Kommentare und Zeichenketten entfernt, auf 120 Zeichen gekürzt; Anteil an der Rechenzeit aller Abfragen der Datenbank. Ohne Modul (`55000`) bzw. ohne Recht (`42501`) kommt `verfuegbar: false` mit Grund und Abhilfe, der Durchgang läuft weiter. `dms-komplett` startet PostgreSQL mit `-c shared_preload_libraries=pg_stat_statements` (Befehlszeile, damit es auch für bestehende Datenbanken gilt) und legt die Erweiterung in `deploy/komplett/start.sh` an; `deploy/komplett-probe.sh` prüft beides. Lokal: eine eigene Instanz mit `-c shared_preload_libraries=pg_stat_statements` und `TEST_DATABASE_URL` darauf, dann prüft `test/abfragestatistik.test.ts` auch den Fall mit Modul (sonst nur den ohne).

**Protokoll und CPU je Gruppe (#895)** (`server/src/protokollsammlung.ts`, `server/src/prozessgruppen.ts`): `engpass.protokoll` – Warnungen und Fehler aller Prozesse, zusammengefasst nach Stufe, Modul, Text und Art der Ausnahme (höchstens 100 Arten). Jeder weitere Prozess schickt sie gebündelt (Warnungen nach 1 s, Fehler sofort) per IPC an den Hauptprozess (`art: 'protokoll'`), der sie für alle hält, auch über einen Absturz hinaus; vor dem Beenden nach einem unerwarteten Fehler meldet ein Prozess die Art der Ausnahme (`absturz`), sie steht dann beim Neustart. Gezählt wird nur der Text ohne Kontextobjekt, Pfade, Adressen, Prüfsummen, Ids, Zahlen und Angaben in Anführungszeichen ersetzt `ohneEinzelheiten`. `engpass.gruppen` – fortlaufende Rechenzeit je Gruppe aus `/proc/<pid>/stat` und RSS aus `/proc/<pid>/status`, gemessen nur im Leiter (`prozessgruppen.stand`) und nur, wenn jemand fragt; die Prozess-Ids von Ablago kennt der Verbund, die des Lastgenerators der Lasttest-Modus, den Rest ordnet der Name des Programms zu. Die Rechenzeit beendeter Kinder (cutime/cstime des Elternprozesses), die noch nicht gezählt war, geht an die Gruppe der beendeten Kinder, sonst an „andere Programme“. Der Test bildet daraus je Durchgang `gruppenAus`/`protokollAus`, für den ganzen Lauf `protokollGesamt` (Anfang nach dem Vorbereiten der ersten Stufe) und schickt bei jeder Abfrage alle 2 s `liveAus` an die Lasttest-Seite – die Seite fragt nichts zusätzlich ab. Seit #1117 misst `vorlaufStarten` schon ab dem Einrichten (Demo-Mappen, Volltext, Vorbereiten) genauso mit der Sitzung des Administrators, nur im Lasttest-Modus und ohne `name`/`n`/p95; der erste Durchgang beendet sie (`vorlaufStoppen`).

Lokal (2 Kerne, PostgreSQL 16 auf demselben Rechner wie Ablago und Lasttest, `mittel` mit 50.000 Mappen, 30 s je Durchgang, Server aus `dist/`; für die CPU von PostgreSQL mit `DMS_VARIANTE=komplett`; einzelne Läufe, die Schwankung liegt bei p95 mit Speichern bei gut ±20 %). „12 zusammen“ war ein Zwischenstand dieses Baus (Leiter 6, davon 4 dauerhaft für Sperren belegt, Prozess 2 6); „14, neu“ ist die Vorgabe (Leiter 9, Prozess 2 5, Halde von Prozess 2 begrenzt auf 1536 MB); „Halde 1024“ mit `NODE_OPTIONS=--max-old-space-size=1024` für beide:

| Durchgang | 1 Prozess (10) | 2 Prozesse, 12 | 2 Prozesse, 20 (wie bisher 2 × 10) | 2 Prozesse, 14, Halde 1024 | 2 Prozesse, 14, neu |
|---|---|---|---|---|---|
| mittel p50 / p95 | 587 / 1.213, 623 / 1.433 ms | 504 / 1.532 ms | 537 / 1.488 ms | 622 / 1.610 ms | 552 / 1.305 ms |
| mittel, Anfragen je s | 149, 134 | 153 | 142 | – | 140 |
| mittel + Speichern p50 / p95 | 1.556 / 3.411, 1.571 / 3.220 ms | 1.192 / 2.956 ms | 1.216 / 4.077 ms | 1.670 / 4.084 ms | 1.456 / 4.256 ms |
| … schreibende Anfragen p95 | 5.389, 7.065 ms | 5.099 ms | 6.505 ms | 7.266 ms | 6.438 ms |
| … Warten auf Verbindung p95 / höchstens | ≤ 200 / 679, ≤ 300 / 1.190 ms | ≤ 150 / 984 ms | ≤ 150 / 1.450 ms | ≤ 300 / 1.809 ms | ≤ 200 / 1.271 ms |
| … Warteschlange höchstens | 58, 108 | 106 | 74 | 113 | 87 |
| … Sperren (Stichproben) | keine | keine | 1 Sitzung, 1,3 s | keine | keine |
| … CPU PostgreSQL / Ablago / Container (% eines Kerns) | – / 91 / 171, 82 / 89 / 178 | 83 / 104 / 194 | 90 / 100 / 197 | 91 / 116 / 214 | 96 / 123 / 227 |
| Arbeitsspeicher je Prozess höchstens, mittel (Halde) | 816, 888 MB (424) | 657 (304), 624 (347) | 718, 723 | 418 (253), 565 (261) | 592 (331), 597 (264) |
| … mittel + Speichern | 1.387, 1.396 MB (808) | 985 (564), 1.056 (689) | 1.103, 1.125 | 647 (327), 766 (306) | 988 (614), 724 (327) |
| Arbeitsspeicher Ablago zusammen (mit Speichern) | 843 (1.410), 915 (1.423) MB | 1.314 (2.075) MB | 1.473 (2.261) MB | 1.017 (1.446) MB | 1.222 (1.746) MB |

Dazu mit der Vorgabe und `NODE_OPTIONS=--max-old-space-size=1024` ein Durchgang mit 250 gleichzeitig mit Speichern (40 s, ohne Export): keine Fehler, kein Neustart, Warten auf Verbindung p95 ≤ 700 ms (Warteschlange bis 305), je Prozess höchstens 709 bzw. 783 MB.

**Ergebnis:**

- Ohne Speichern warten Abfragen kaum auf eine Verbindung (p95 ≤ 1–3 ms); mit Speichern stauen sie sich (bis über 100 wartende, p95 bis 300 ms) – Transaktionen leihen eine Verbindung für ihre ganze Dauer. Der Container ist dabei voll ausgelastet (rund 200 % bei 2 Kernen); PostgreSQL braucht fast einen Kern, Ablago gut einen. Auf 2 Kernen ist also die Rechenzeit der Engpass; zwischen 12, 14 und 20 Verbindungen zeigt sich kein Unterschied, der über die Schwankung hinausgeht (p95 mit Speichern 3,0 / 4,3 / 4,1 s). Sperren tauchten nur einmal auf, mit 20 Verbindungen. Ob weniger Verbindungen auf dem NAS helfen, muss die Messung dort zeigen; die Gesamtzahl verhindert jedenfalls, dass mehr Prozesse automatisch mehr Verbindungen auf dieselbe Datenbank bringen (4 Prozesse: 22 statt 40).
- **Der Leiter braucht dauerhaft 4 Verbindungen** für Sitzungssperren (Lebenszeichen, Eingangsordner, Postfächer; die vierte hielten bis #991 die Webhooks, sie bleibt als Reserve). Mit nur 6 Verbindungen für ihn blieben in einer frischen Installation alle Anfragen hängen, die er beantworten sollte (Zeitpläne belegten den Rest) – darum bekommt er sie vorab (`VERBINDUNGEN_LEITER_RESERVIERT`).
- **Arbeitsspeicher:** Im Leerlauf braucht ein Prozess rund 250–290 MB (Halde gut 120 MB), der Hauptprozess 38 MB. Unter Last wächst vor allem die **Halde** (bis 690 MB je Prozess); nach einer vollen Speicherbereinigung (über den Inspector erzwungen) lag sie wieder bei 187 MB, die RSS bei 472 MB. Es ist also kein doppelt gehaltener Bestand, sondern Abfall, den V8 spät einsammelt – je Prozess für sich, und jeder Prozess richtet seine Halde nach dem Speicher des ganzen Containers aus. Mit einer Grenze der Halde sank der Speicher je Prozess um rund ein Drittel (1.024 MB: 650–770 statt 990–1.060 MB, Halde höchstens 330 statt 690 MB), ohne Fehler oder Neustart, auch mit 250 gleichzeitig. Darum begrenzt der Hauptprozess die Halde der weiteren Prozesse (`haldeJeProzess`: 60 % ihres Anteils, 1024–1536 MB). Den Leiter ließ #874 zunächst ohne Grenze, weil er Sicherung, Texterkennung und Pakete erledigt; auf dem NAS des Maintainers (0.206.0, `DMS_PROZESSE=2`, `DMS_DB_VERBINDUNGEN=24`) wuchs er bei `groß` mit Speichern aber auf 2,6 GB (Halde 2,3 GB), Prozess 2 mit Grenze nur auf 1,3 GB – er beantwortet ja genauso Anfragen. Seit #891 bekommt er darum 512 MB mehr als die anderen (`haldeLeiter`, 1536–2048 MB); nur der Hauptprozess bleibt ohne Grenze. Das Startprotokoll nennt beide Werte (`haldeLeiterMb`, `haldeMb`). Die doppelt gehaltenen Zwischenspeicher kommen im Lasttest kaum vor (PDF-Anzeige bis 256 MB, gestempelte WebDAV-Fassungen bis 64 MB, Seitenbilder von 4 Dokumenten – je Prozess); seit #874 teilen sich die Prozesse ihre Grenzen (`server/src/zwischenspeicher.ts`). Je Prozess bleiben, weil sie klein sind oder jeder sie ganz braucht: der Lesespeicher für Mappentypen, Ansichten, Pakete und häufig gelesene Einstellungen (#741, höchstens 64 Einträge, gültig nur beim gleichen Haushaltsstand), die Zahlen der Ansichten (höchstens 500 Einträge) und der Index der Vektoren.
- **Abstürze:** Mit 2 Prozessen stürzte lokal kein Prozess ab (auch nicht mit 250 gleichzeitig). Auf dem NAS mit 4 Prozessen (#874, PostgreSQL im eigenen Container) brach groß schon nach 25 gleichzeitig mit 1,1 % Fehlern ab, bei 3,5 GB (mit Speichern 5,8 GB) Arbeitsspeicher – ob dort ein Prozess abstürzte, zeigen jetzt die Zeilen „Neustarts“ und „Fehler“.
- **`auto`** nimmt darum höchstens 2 Prozesse (Kerne − 1, rund 1 GB je Prozess plus 1 GB Reserve, nicht mehr, als `DMS_DB_VERBINDUNGEN` trägt; `empfohleneProzesse` in `server/src/prozesse.ts`) – mit PostgreSQL im selben Container auch dann, wenn eine Messung später mehr erlaubt.

**Auf dem NAS nachmessen** (≥ 4 Kerne, für #576): Lasttest-Modus mit `DMS_LASTTEST=alle` je einmal mit `DMS_PROZESSE=1`, `2` und `4` (feste Zahl, nicht `auto`), ohne `DMS_DB_VERBINDUNGEN` – einmal mit `dms-komplett`, einmal `dms` mit PostgreSQL in einem eigenen Container; dazu einmal 4 Prozesse mit `DMS_DB_VERBINDUNGEN=40` (wie vor #874). Wichtig sind die Zeilen „Engpass …“ und „Fehler …“: Gibt es Neustarts (SIGKILL: zu wenig Arbeitsspeicher für den Container), hilft weniger Speicher je Prozess bzw. ein größeres `mem_limit`; ist die CPU von PostgreSQL nahe der Zahl der Kerne, ist die Datenbank der Engpass; wartet man lange auf Verbindungen, obwohl PostgreSQL Luft hat, fehlen Verbindungen; tauchen Sperren auf, warten Speichervorgänge aufeinander.

## Arbeit im Hintergrund mit niedrigerer Priorität (#893) { #hintergrund }

Im Alltag bremsen selten viele Menschen gleichzeitig, sondern große Stapel Scans: Texterkennung und Seitenbilder belegen die Kerne. Darum rechnet die Arbeit im Hintergrund mit einem höheren nice-Wert (`server/src/hintergrund.ts`, `DMS_HINTERGRUND_NICE`, Vorgabe 10, `0` = aus; zusätzlich zur Priorität des Hauptfadens, höchstens 19):

- **Arbeiter-Fäden** (`arbeit/arbeitsfaden.ts`): Jeder Faden senkt beim Start mit `os.setPriority(0, n)` sich selbst – unter Linux gilt die Priorität je Faden (TID), der Hauptfaden bleibt auf seiner.
- **Paket-Läufer** (`laeufer/verwaltung.ts`, dort läuft z. B. die Texterkennung): gleich nach `fork` der Hauptfaden, bei „bereit“ alle Fäden aus `/proc/<pid>/task` (der Läufer selbst darf `/proc` wegen des Berechtigungsmodells nicht lesen). Die Fäden der Aufrufe erben die Priorität.
- **Programme** (`pdftoppm`, `pdftotext`, `pdfinfo`, `qpdf`, Ghostscript …): `execFile` und `spawn` kommen aus `hintergrund.ts` statt aus `node:child_process` und senken die Priorität gleich nach dem Start. Ein Kindprozess erbt sonst die Priorität des Fadens, der ihn startet – bei Ablago meist der Hauptfaden.
- Höher als jetzt setzt Ablago nie (braucht keine Rechte). Scheitert es (EACCES, ENOSYS, z. B. mit Seccomp), steht es einmal im Protokoll (`meldungen.hintergrund.ohne-nice`) und alles läuft normal weiter. `nice` als Programm vor dem Befehl ließe keine Lücke, bräuchte aber `nice` im Image; die Lücke zwischen Start und Senken ist kürzer, als ein Programm bis zu seinem ersten eigenen Kind braucht.

**Messung zu #893** (lokal, 2 Kerne, PostgreSQL 16 und Lasttest auf demselben Rechner, Server aus `dist/`, Stufe klein mit 5.013 Mappen, `--dauer 30 --ohne-speichern`, je drei Läufe abwechselnd): Als Texterkennung nebenher liefen zwei Schleifen „Seitenbilder mit `pdftoppm -r 300`, dann `tesseract` je Seite“ – gestartet über `hintergrund.ts` in **derselben Sitzung** wie der Server, wie die Kindprozesse von Ablago.

| Durchgang | p50 | p95 | p99 | CPU Ablago | Container |
|---|---|---|---|---|---|
| ohne Texterkennung | 107 / 102 / 81 ms | 206 / 211 / 145 ms | 270 / 300 / 176 ms | 69–84 % | 167–193 % |
| Texterkennung mit nice 0 (wie bisher) | 229 / 163 / 135 ms | **441 / 371 / 232 ms** | 557 / 509 / 276 ms | 37–50 % | 199 % |
| Texterkennung mit nice 10 (neu) | 102 / 105 / 89 ms | **196 / 202 / 156 ms** | 260 / 262 / 189 ms | 63–74 % | 198 % |

**Ergebnis:** Mit nice 0 nahm die Texterkennung dem Server die Hälfte der Rechenzeit; p95 verdoppelte sich und riss zweimal die CI-Grenze von 300 ms. Mit nice 10 ist p95 so gut wie ohne Texterkennung, und die Texterkennung bekommt trotzdem alles, was übrig ist (Container weiter voll ausgelastet). Ein eigener Durchgang „mit Texterkennung nebenher“ im Lasttest fehlt noch: Er bräuchte ein Paket für die Texterkennung in der Test-Ablage; die Messung oben deckt das Kriterium ab.

**Zu beachten – Autogroup:** Linux mit `kernel.sched_autogroup_enabled=1` (viele Desktop-Systeme, auch dieser Rechner) teilt die Rechenzeit zuerst zwischen Sitzungen (`setsid`) und erst darin nach nice. Lief die Last in einer eigenen Sitzung, gab es keinen Unterschied zwischen nice 0 und 10 (p95 204 / 167 bzw. 204 / 170 ms, ohne Last 243 / 127 ms) – die Sitzung bekam ohnehin nur ihren Anteil. Für Ablago ist das gleich: Kindprozesse und Fäden liegen in der Sitzung des Servers, genau dort wirkt nice. PostgreSQL in einem eigenen Container (bzw. eigener Sitzung) teilt sich die Kerne dagegen nach den Regeln des Hosts.

## Regeln

- **Kein `SELECT *` auf Tabellen mit großen Spalten.** Dokumente immer mit `DOKUMENT_SPALTEN`, Mappen mit `MAPPEN_SPALTEN` (ohne `suchtext`, #615); den Volltext nur über `volltext(id)` oder gebündelt über `volltexte(ids)` lesen. EXPLAIN zeigt das nicht: Der Volltext liegt ausgelagert (TOAST) und wird erst beim Senden an den Server entpackt.
- **Nicht alle Mappen laden, um im Arbeitsspeicher zu filtern.** Was sich in SQL eingrenzen lässt (Datum im Zeitraum, offene Aufgaben), grenzt die Abfrage ein (#477: `mappenMitDatum`, Eingang im Zähler).
- **Keine Zugriffe in Schleifen über Mappen oder Dokumente.** Für Massenarbeit gibt es gebündelte Methoden (`dokumenteVon`, `volltexte`, `versionenVonDokumenten`, `notizenVon`, `aufgabenVonMappen`, `historieVon`). Ein Zugriff kostet auch lokal etwa eine halbe Millisekunde – bei 10.000 Mappen sind das Sekunden.
- **Nach Massenläufen die Statistik auffrischen:** `SichtenDienst.aktualisiereStatistik()` (Demo-Daten erzeugen und entfernen; die Wiederherstellung macht es selbst). Für `dokumente` nur über die Spalten in `STATISTIK_SPALTEN`: Ohne Spaltenliste berechnet PostgreSQL auch die Statistik des Index `to_tsvector('german', volltext)` – über eine Minute bei 20.000 Dokumenten statt 0,1 Sekunden.
- **Lange Rechenarbeit gibt nach.** Server und Oberfläche teilen sich einen Node-Prozess: Was die Ereignisschleife blockiert, verzögert jede Anfrage – und erscheint in der Messung der Datenbankzugriffe als „langer Zugriff“, obwohl die Datenbank schnell war. Schleifen über viele Elemente geben mit `takt()` (`server/src/demo.ts`) oder `setImmediate` nach; große Daten werden mit dem asynchronen `zlib` gepackt statt im Hauptthread.
- **Große Dateien als Strom** (#746): Uploads bis 100 MB gehen in eine temporäre Datei, die Prüfsumme entsteht beim Lesen (`strom: true` an der Route, `nimmAuf`). Lange Listen (CSV, JSON Lines) schreibt der Vollexport Zeile für Zeile mit Gegendruck und Pausen nach Rechenzeit (`Zeilen` in `vollexport.ts`), statt sie als einen Text zu bauen. Große Tabellen gehen nicht als Nachricht an den Arbeiter (die Kopie hält den Hauptfaden fest), sondern als Datei, die der Arbeiter selbst liest (`exportTabelleAusDatei`).
- **Schwere Arbeit in den Arbeiter.** Was Sekunden rechnet (PDF, große Tabellen), gehört in den [Arbeiter-Pool](aufbau.md#arbeiter-pool) (#542), nicht in den Hauptfaden – auch nicht mit Pausen.
- **Was der Zugriff schon weiß, nicht noch einmal lesen** (#615): Mappentypen (`z.typen`, außer für Dienstkonten – die sehen nur ihre) und die Auflösung mit Rollen und Datum (`z.a`).
- **Merken nur mit Stand aus der Datenbank** (#741): Ein neuer Zwischenspeicher über die Anfrage hinaus hängt am Haushaltsstand (`lesespeicher.ts`), gilt für alle gleich und kommt in die Tabelle oben. Nie für Sitzungen, Personen, Rollen oder Rechte – die gibt es höchstens einmal je Anfrage (`jeAnfrage`).
- **Merkposten ohne Warten auf die Platte** (#615): Was bei einem Absturz verloren gehen darf („Zuletzt geöffnet“, „gesehen“), schreibt eine einzige Anweisung mit `ohneWarten(sql)` in `FROM`. Nie für Daten, die der Benutzer eingegeben hat, und nicht in einer Transaktion (dort wirkt es nicht).
- **Kein `indexOf` in Sortierungen über viele Elemente.** `liste.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))` ist quadratisch: Bei 20.000 Mappen sind das Sekunden bis über eine halbe Minute im Hauptfaden (#542). Erst einen Index bauen (`inReihenfolge` in `dienst.ts`).
