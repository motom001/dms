<!-- Vorher/nachher zu #1339 (PR #1435): „Neue Post zuordnen“ mit main vor dem PR und mit dem Zweig des PR, beide am 18.11. auf demselben Rechner und mit denselben Daten gemessen. Die Werte stammen aus der Beschreibung von PR #1435; die JSON-Dateien dieser Läufe sind nicht aufgehoben. -->

## Oberfläche messen (#1276) – „Neue Post zuordnen“ vor und nach #1339

Gemessen 2026-11-18 auf: **Container (2 Kerne, Browser und Ablago auf demselben Rechner, ein zweiter Bau parallel) – keine NAS-Werte**. 5 Runden je Ablauf nach einer zum Aufwärmen; Median in ms.
Daten: Beispiel-Ablage, 5.000 Demo-Mappen, lange Post 100 Seiten, Vertrag mit 60 Dokumenten (eins mit 60 Seiten), Vertrag mit 300 Rechnungen in der Tabelle.

*main vorher*: Ablago ohne PR #1435, auf demselben Rechner und denselben Daten wie der Zweig gemessen (fairer Vergleich). *nach #1339*: Zweig `qs-ablage-dokument` (PR #1435): Seitenbilder und Wörter einer Seite entstehen erst, wenn sie bis 1,5 Fensterhöhen heranrückt. *Basis 15.11.*: [`2026-11-15-container.md`](2026-11-15-container.md), zum Einordnen.

### Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen

| Kennzahl | Drossel | Basis 15.11. | main vorher | nach #1339 |
|---|---|---:|---:|---:|
| bis bedienbar | normal | 2.921 | 3.467 | **517** |
| INP | normal | 432 | 504 | **104** |
| Blockierzeit | normal | 1.212 | – | **24** |
| bis bedienbar | CPU 4× | 12.745 | 14.678 | **1.748** |
| INP | CPU 4× | 1.568 | 1.864 | **368** |

„–“: im Vergleichslauf von main nicht festgehalten.

### Langes Dokument ansehen, auf Seite 80 springen (neuer Ablauf `langes-dokument`, 100 Seiten)

| Drossel | bis bedienbar | INP | Anfragen |
|---|---:|---:|---:|
| normal | 940 | 40 | 8 |
| CPU 4× | 1.231 | 96 | – |

Neu mit PR #1435, darum ohne Vergleichswert.

### Daneben (nicht berührt)

| Ablauf | Drossel | Basis 15.11. | main vorher | nach #1339 |
|---|---|---:|---:|---:|
| Mappe öffnen (60 Dokumente), bis bedienbar | normal | 1.220 | 1.438 | 1.310 (im Rauschen) |
| Dokument-Vorschau („Seiten …“, 60 Seiten), bis bedienbar | normal | 432 | 437 | 531 (anderer Dialog, nicht berührt; Rauschen) |

### Ziele und Grenzen

- Ziele aus #1339 erreicht: „Neue Post zuordnen“ ungedrosselt bis bedienbar 517 ms (Ziel unter 1.000 ms), INP 104 ms (Ziel unter 200 ms).
- Gedrosselt (CPU 4×) bleibt „bis bedienbar“ mit 1.748 ms über 1 s; dafür gibt es kein Ziel.
