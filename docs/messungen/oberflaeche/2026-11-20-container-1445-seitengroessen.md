<!-- Vorher/nachher zu #1445: Seitenbetrachter der Mappe mit Seitengrößen statt Wortpositionen. Werte aus scratch-Skripten (Messung der Serverfunktionen), ohne JSON. -->

## Seitenbetrachter der Mappe – Seitengrößen statt Wortpositionen (#1445)

Gemessen 2026-11-20 auf: **Container (Ablago-Entwicklungsumgebung, poppler 24.02, zwei weitere Bauten liefen parallel) – keine NAS-Werte**. Ein PDF mit 120 Seiten (A4, je Seite 50 Zeilen Text, eine Seite quer, eine mit `/Rotate 90`), 7 Läufe nach einem zum Aufwärmen, Median.

Gemessen ist die Arbeit des Servers für eine Mappe, die das Dokument öffnet: *vorher* `textebeneWoerter` (pdftotext `-bbox -cropbox`, die Grundlage von `GET /api/dokumente/:id/wortpositionen`), *nachher* `seitenGroessen` (`pdfinfo -box`, Grundlage von `GET /api/dokumente/:id/seitenmasse`).

| | vorher (Wortpositionen) | nachher (Seitengrößen) |
|---|---:|---:|
| Server, Median | 451–537 ms | **22 ms** |
| Streuung (7 Läufe) | 417–1.218 ms | 15–31 ms |
| Antwort (JSON) | 3,7 MB (89.790 Wörter) | **3,2 KB** |
| Maße je Seite | 120 | 120, gleich (auch quer und gedreht) |

Zwei Läufe „vorher“ (451 und 537 ms) zeigen, wie stark die Last des Rechners die Werte verschiebt. Die Antwort mit Wörtern muss der Browser zusätzlich laden und lesen; mit Seitengrößen entfällt das. „Übernehmen“ lädt weiter die Wortpositionen (Wörter zum Markieren).

Auf dem NAS ist noch nicht gemessen (siehe PR).
