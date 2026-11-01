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

## Regeln

- **Kein `SELECT *` auf Tabellen mit großen Spalten.** Dokumente immer mit `DOKUMENT_SPALTEN`; den Volltext nur über `volltext(id)` oder gebündelt über `volltexte(ids)` lesen. EXPLAIN zeigt das nicht: Der Volltext liegt ausgelagert (TOAST) und wird erst beim Senden an den Server entpackt.
- **Keine Zugriffe in Schleifen über Mappen oder Dokumente.** Für Massenarbeit gibt es gebündelte Methoden (`dokumenteVon`, `volltexte`, `versionenVonDokumenten`, `notizenVon`, `aufgabenVonMappen`, `historieVon`). Ein Zugriff kostet auch lokal etwa eine halbe Millisekunde – bei 10.000 Mappen sind das Sekunden.
- **Nach Massenläufen die Statistik auffrischen:** `Dienst.aktualisiereStatistik()` (Demo-Daten erzeugen und entfernen; die Wiederherstellung macht es selbst). Für `dokumente` nur über die Spalten in `STATISTIK_SPALTEN`: Ohne Spaltenliste berechnet PostgreSQL auch die Statistik des Index `to_tsvector('german', volltext)` – über eine Minute bei 20.000 Dokumenten statt 0,1 Sekunden.
- **Lange Rechenarbeit gibt nach.** Server und Oberfläche teilen sich einen Node-Prozess: Was die Ereignisschleife blockiert, verzögert jede Anfrage – und erscheint in der Messung der Datenbankzugriffe als „langer Zugriff“, obwohl die Datenbank schnell war. Schleifen über viele Elemente geben mit `takt()` (`server/src/demo.ts`) oder `setImmediate` nach; große Daten werden mit dem asynchronen `zlib` gepackt statt im Hauptthread.
