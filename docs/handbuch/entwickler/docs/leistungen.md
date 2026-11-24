# Leistungen { #leistungen }

Alles, was Dokumente **verarbeitet**, ist in Ablago eine fest beschriebene **Leistung** (#1569). Der Kern speichert, zeigt, findet, sichert, verwaltet Rechte – und **vermittelt**: Er nimmt einen Auftrag an, prüft ihn, wählt genau einen Anbieter und prüft, was zurückkommt. Anbieter ist Ablago selbst (eingebaut, #1570) oder ein Paket (#1572). Leistungen definiert nur der Kern.

## Name und Beschreibung { #name }

Der Name hat die Form `<gegenstand>.<tätigkeit>[.<ziel>]@<hauptversion>`, z. B. `dokument.lesen.text@1`. Gruppen: `dokument.*` (Datei), `text.*`, `inhalt.*` (Deutung) und `nachricht.*` (wirkt nach außen). Eine neue Hauptversion ist ein neuer Eintrag, der alte bleibt.

Jede Leistung in `shared/src/leistungen/katalog.ts` (`LEISTUNGSKATALOG`) hat:

- **Ein- und Ausgabeschema** mit Grenzen – eine Teilmenge von JSON Schema (`shared/src/leistungen/schema.ts`): Text mit `maxLength`, Listen mit `maxItems`, Zahlen mit `minimum`/`maximum`, Objekte abschließend (`additionalProperties: false`). `format: 'dokument'` ist ein Dokument in Ablago – von außen seine Id; der Kern löst es mit dem Leserecht der Person zur Datei auf, bevor der Anbieter es bekommt.
- **Formate:** erlaubte Formate der Ergebnisdatei (leer = keine Datei) und **Dateitypen**, die die Leistung annimmt.
- **`ergebnis`:** `exakt` (berechnet), `vorschlag` (Deutung, eine Person übernimmt), `intern` (nur für Ablago, z. B. Vektoren – die speichert Ablago) oder `wirkung` (wirkt nach außen, z. B. eine Mail).
- **Zeitgrenze** je Auftrag und **Testfälle** – Pflicht für jeden Anbieter, auch für Ablago. Die Testdateien liegen in `shared/leistungen/testdateien/`; `pruefeTestfaelle(anbieter, name, lies)` führt sie aus.
- **Anzeigename** de/en in den Sprachdateien unter `pakete.leistung.name.<name ohne Version>`, als Tätigkeit in Verbform („Text lesen“). In der Oberfläche heißt es nie „Leistung“ oder „Anbieter“, sondern „Wer macht das?“ und „macht Ablago“; den technischen Namen sehen nur Fachleute in den Details.

Ein Test (`shared/test/leistungen-katalog.test.ts`) prüft, dass jeder Eintrag vollständig ist.

## Katalog { #katalog }

| Leistung | Anzeigename | Ergebnis | Dateitypen | Formate | Zeitgrenze |
|---|---|---|---|---|---:|
| `dokument.erstellen.aus-text@1` | Brief aus Text erstellen | exakt | – | `application/pdf` | 30 s |
| `dokument.erstellen.aus-vorlage@1` | Brief aus Vorlage erstellen | exakt | `text/markdown` | `application/pdf` | 30 s |
| `dokument.umwandeln.pdf@1` | In PDF umwandeln | exakt | 11 Typen | `application/pdf` | 120 s |
| `dokument.umwandeln.pdfa@1` | In PDF/A umwandeln | exakt | 5 Typen | `application/pdf` | 300 s |
| `dokument.bearbeiten.seiten@1` | Seiten drehen und ordnen | exakt | `application/pdf` | `application/pdf` | 120 s |
| `dokument.bearbeiten.zusammenfuegen@1` | PDFs zusammenfügen | exakt | `application/pdf` | `application/pdf` | 120 s |
| `dokument.bearbeiten.verkleinern@1` | PDF verkleinern | exakt | `application/pdf` | `application/pdf` | 300 s |
| `dokument.bearbeiten.schwaerzen@1` | Schwärzen | exakt | `application/pdf`, `image/jpeg`, `image/png` | `application/pdf` | 300 s |
| `dokument.lesen.text@1` | Text lesen | exakt | 5 Typen | – | 600 s |
| `dokument.lesen.erechnung@1` | E-Rechnung lesen | exakt | `application/pdf`, `application/xml`, `text/xml` | – | 60 s |
| `dokument.lesen.barcode@1` | Barcodes lesen | exakt | 5 Typen | – | 120 s |
| `inhalt.erkennen.felder@1` | Felder erkennen | Vorschlag | – | – | 120 s |
| `inhalt.erkennen.mappentyp@1` | Mappentyp erkennen | Vorschlag | – | – | 120 s |
| `inhalt.beantworten.frage@1` | Fragen beantworten | Vorschlag | 5 Typen | – | 300 s |
| `text.uebersetzen@1` | Übersetzen | Vorschlag | – | – | 300 s |
| `text.vektor@1` | Für die Suche nach Bedeutung aufbereiten | intern | – | – | 60 s |
| `nachricht.senden.mail@1` | E-Mail senden | Wirkung | alle | – | 120 s |
| `nachricht.aufrufen.url@1` | Adresse aufrufen | Wirkung | – | – | 60 s |

Vorschaubilder und Seitengrößen sind keine Leistung; Ablagos eigene Mails (Einladungen, Benachrichtigungen) bleiben im Kern.

## Aufträge { #auftraege }

- **Direkt:** `dienst.leistungen.abrufen(wer, name, { eingabe, kontext?, ziel? })` wartet auf das Ergebnis.
- **Im Hintergrund:** `dienst.leistungen.beauftragen(…)` antwortet sofort mit der Id des Auftrags; danach kommt das Ereignis `leistung.fertig` bzw. `leistung.fehlgeschlagen` (Gruppe `auftrag`) mit Auftrag, Leistung und abgelegtem Dokument bzw. Fehlercode – nur Ids. Ergebnis, Fehlertext und `kontext` liest der Auftraggeber mit `auftrag(wer, id)`.
- **`kontext`** (höchstens 4096 Zeichen als JSON) kommt unverändert zurück.
- **Ziel:** `{ mappe, register? }`. Liefert die Leistung eine Datei, legt der Kern sie dort als neues Dokument ab – immer mit den Rechten der Person; das Schreibrecht prüft er gleich am Anfang und beim Ablegen noch einmal. Ohne Ziel bekommen Personen keine Datei zurück (das wäre ein Weg nach draußen, siehe [Daten nach draußen](nach-draussen.md)); nur Ablago selbst bekommt sie im Prozess.
- Für Personen gibt es dieselben Wege unter `GET /api/leistungen` (Katalog), `POST /api/leistungen/<name>/abrufen`, `POST /api/leistungen/<name>/beauftragen` (202) und `GET /api/leistungen/auftraege/<id>`. Pakete nutzen Leistungen über die Paket-Schnittstelle (#1571).

**Eindeutige Antworten** – `details.code` ist `leistung.<code>`; bis zur Annahme passiert nichts:

| Code | Status | Wann |
|---|---:|---|
| `unbekannt` | 404 | Name nicht im Katalog |
| `eingabe-ungueltig` | 422 | Eingabe passt nicht zum Schema (`details.pfad`, `details.grund`), `kontext` zu groß, Ziel falsch |
| `kein-leserecht` | 404 | ein Dokument der Eingabe gibt es nicht oder die Person darf es nicht lesen |
| `kein-schreibrecht` | 403 | kein Recht „Bearbeiten“ an der Mappe des Ziels |
| `ziel-noetig` | 422 | Ergebnis ist eine Datei, aber kein Ziel |
| `nur-verwaltung` | 403 | Leistung mit `wirkung` von einer Person ohne Verwaltungsrecht |
| `kein-anbieter` | 409 | niemand macht es: `details.grund` = `keiner`, `aus` oder `dateityp`, dazu `details.katalog` (Adresse im Katalog) |
| `ausgabe-ungueltig` | 502 | Ergebnis passt nicht zu Schema oder Formaten – nichts wird abgelegt |
| `zeitgrenze` | 504 | Zeitgrenze überschritten |
| `anbieter-fehler` | 502 | der Anbieter ist gescheitert |

## Betrieb { #betrieb }

- Aufträge liegen in der Tabelle `leistungsauftraege` (Migration 125). Jeder Prozess nimmt sich Aufträge mit `FOR UPDATE SKIP LOCKED` und einer Frist (`gesperrt_bis`: Zeitgrenze plus eine Minute) – wie die Warteschlange der Texterkennung. Stirbt ein Prozess, wird sein Auftrag nach der Frist wieder frei; nach drei Versuchen gibt Ablago auf (`abgebrochen`).
- **Neustart:** Laufendes wird wiederholt – außer Leistungen mit `wirkung`, die werden `unterbrochen` (eine Mail ging vielleicht schon raus).
- **Wartungsmodus:** Im Hintergrund wird nichts Neues genommen; danach geht es weiter.
- **Aufbewahrung:** Abgeschlossene Aufträge behalten keine Eingabe und werden nach 24, 48 oder 96 Stunden gelöscht (Vorgabe 48, `GET`/`PUT /api/werkbank/leistungen/einstellungen`, Bereich „Einstellungen zum Sichern“). Sie gehen nicht in die Sicherung und nicht in den Vollexport; **offene** Aufträge gehen als Merkzettel in die Sicherung und laufen nach dem Wiederherstellen weiter.
- Protokoll: Modul „Aufträge“.

## Ausgabe je Release { #ausgabe }

Jedes Release trägt die Datei `ablago-leistungen.json` (aus `shared/leistungen/`): Katalog mit Name, Version, Ergebnisart, Dateitypen, Formaten, Schemas und Anzeigenamen, die eingebauten Anbieter, die Mappentypen von Ablago und die Testfälle samt Testdateien (Base64) – maschinenlesbar für dms-registry. Ein Test hält die Datei im Gleichschritt mit dem Katalog; ändert er sich, neu schreiben mit `CHARAKTER_SCHREIBEN=1 npm run test:datei -w server -- test/leistungen-ausgabe.test.ts`, danach Prettier.
