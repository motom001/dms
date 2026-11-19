<!-- Basis nach Phase D der QS-Runde 11/2026: main (0.297.1) mit den Nachträgen aus dem Zweig qs-nachtraege-d (ohne Einfluss auf diese Abläufe), frisch eingerichtet, Produktivbau, DMS_PROZESSE=1. Verglichen mit 2026-11-15-container.json; „anderes Gerät“, weil die Beschreibung des Containers genauer ist – es ist derselbe Container-Typ. -->

## Oberfläche messen (#1276) – Ablago 0.297.1

Gemessen 2026-11-18 23:29 UTC auf: **Container (2 Kerne, Browser und Ablago auf demselben Rechner, ein zweiter Bau parallel) – keine NAS-Werte**. 5 Runden je Ablauf nach einer zum Aufwärmen; Median und p95 in ms.
Daten: Beispiel-Ablage, 5.000 Demo-Mappen, lange Post 100 Seiten, Vertrag mit 60 Dokumenten (eins mit 60 Seiten), Vertrag mit 300 Rechnungen in der Tabelle.

*bis bedienbar*: vom Klick bzw. Aufruf, bis das Ergebnis zu sehen ist und die Seite wieder auf Eingaben reagiert. *INP*: längste Reaktion auf eine Eingabe (Klick, Taste) bis zum nächsten Bild; „–“: keine Eingabe im Schritt oder alle unter 16 ms. *längste Aufgabe*: längster Block des Browsers (Long Task). *Blockierzeit*: Summe der Anteile über 50 ms. *Anfragen/Server*: Median der Anfragen und ihrer Server-Zeit (Server-Timing) im Schritt.

### normal

| Ablauf | bis bedienbar Median | p95 | INP Median | p95 | längste Aufgabe Median | p95 | Blockierzeit Median | p95 | Anfragen | Server ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Startseite öffnen | 507 | 943 | – | – | 91 | 96 | 41 | 46 | 16 | 171 |
| Suche mit Treffern | 146 | 220 | 56 | 64 | 0 | 0 | 0 | 0 | 1 | 4 |
| Mappe öffnen (60 Dokumente) | 1.148 | 1.193 | 88 | 104 | 90 | 110 | 57 | 74 | 65 | 1.295 |
| Neue Post: Datei ablegen | 450 | 495 | 24 | 24 | 0 | 0 | 0 | 0 | 16 | 409 |
| Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen | 384 | 430 | 80 | 88 | 60 | 69 | 10 | 19 | 2 | 24 |
| Mappe ändern und speichern (Tabelle 300 Zeilen) | 241 | 267 | 24 | 32 | 0 | 0 | 0 | 0 | 7 | 59 |
| Zu erledigen: Liste, dann Monat | 498 | 513 | 16 | 16 | 87 | 93 | 37 | 43 | 15 | 109 |
| Ansicht mit vielen Mappen blättern (300 Zeilen) | 277 | 296 | – | – | 0 | 0 | 0 | 0 | 2 | 18 |
| Dokument-Vorschau mehrseitig (60 Seiten) | 349 | 475 | 48 | 64 | 0 | 0 | 0 | 0 | 56 | 1.536 |
| Langes Dokument ansehen, auf Seite 80 springen (100 Seiten) | 942 | 972 | 40 | 48 | 0 | 0 | 0 | 0 | 8 | 987 |
| Werkbank-Übersicht | 505 | 988 | – | – | 90 | 130 | 40 | 80 | 20 | 300 |
| Mappentyp-Editor öffnen (Vertrag) | 555 | 624 | – | – | 94 | 102 | 46 | 64 | 30 | 336 |

### CPU 4× gedrosselt

| Ablauf | bis bedienbar Median | p95 | INP Median | p95 | längste Aufgabe Median | p95 | Blockierzeit Median | p95 | Anfragen | Server ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Startseite öffnen | 1.393 | 1.687 | – | – | 419 | 452 | 443 | 481 | 16 | 177 |
| Suche mit Treffern | 579 | 685 | 104 | 128 | 129 | 156 | 127 | 156 | 2 | 61 |
| Mappe öffnen (60 Dokumente) | 2.382 | 2.475 | 304 | 336 | 404 | 437 | 796 | 892 | 65 | 1.773 |
| Neue Post: Datei ablegen | 724 | 755 | 24 | 32 | 92 | 99 | 42 | 49 | 17 | 297 |
| Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen | 1.484 | 1.585 | 216 | 256 | 192 | 230 | 197 | 219 | 3 | 723 |
| Mappe ändern und speichern (Tabelle 300 Zeilen) | 654 | 746 | 48 | 48 | 0 | 56 | 0 | 6 | 7 | 105 |
| Zu erledigen: Liste, dann Monat | 1.372 | 1.676 | 16 | 16 | 414 | 452 | 457 | 505 | 15 | 134 |
| Ansicht mit vielen Mappen blättern (300 Zeilen) | 720 | 796 | – | – | 87 | 93 | 83 | 144 | 2 | 26 |
| Dokument-Vorschau mehrseitig (60 Seiten) | 1.046 | 1.162 | 176 | 240 | 119 | 152 | 112 | 132 | 56 | 1.807 |
| Langes Dokument ansehen, auf Seite 80 springen (100 Seiten) | 1.195 | 1.376 | 72 | 120 | 128 | 176 | 78 | 126 | 8 | 588 |
| Werkbank-Übersicht | 1.624 | 1.675 | – | – | 462 | 475 | 475 | 483 | 20 | 252 |
| Mappentyp-Editor öffnen (Vertrag) | 1.779 | 1.913 | – | – | 435 | 440 | 665 | 680 | 31 | 445 |

### Vergleich mit dem Vorlauf

Vorlauf: Ablago 0.290.2 vom 2026-11-15 auf Container (2 Kerne, Browser und Ablago auf demselben Rechner, andere Bauten parallel) – keine NAS-Werte – **anderes Gerät, nur bedingt vergleichbar**. Schwelle: mehr als 20 % und mindestens 100 ms (Median); was darüber lag, wurde einmal nachgemessen, es zählt je Kennzahl der bessere Lauf.

- besser: Startseite öffnen, CPU 4× gedrosselt, bis bedienbar 1.748 → 1.393 ms
- besser: Suche mit Treffern, CPU 4× gedrosselt, bis bedienbar 884 → 579 ms
- besser: Mappe öffnen (60 Dokumente), CPU 4× gedrosselt, bis bedienbar 3.190 → 2.382 ms
- besser: Neue Post: Datei ablegen, normal, bis bedienbar 1.082 → 450 ms
- besser: Neue Post: Datei ablegen, CPU 4× gedrosselt, bis bedienbar 1.108 → 724 ms
- besser: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, bis bedienbar 2.921 → 384 ms
- besser: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, INP 432 → 80 ms
- besser: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, Blockierzeit 1.212 → 10 ms
- besser: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, CPU 4× gedrosselt, bis bedienbar 12.745 → 1.484 ms
- besser: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, CPU 4× gedrosselt, INP 1.568 → 216 ms
- besser: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, CPU 4× gedrosselt, Blockierzeit 5.926 → 197 ms
- besser: Mappe ändern und speichern (Tabelle 300 Zeilen), normal, bis bedienbar 358 → 241 ms
- besser: Mappe ändern und speichern (Tabelle 300 Zeilen), CPU 4× gedrosselt, bis bedienbar 1.184 → 654 ms
- besser: Zu erledigen: Liste, dann Monat, normal, bis bedienbar 688 → 498 ms
- besser: Zu erledigen: Liste, dann Monat, CPU 4× gedrosselt, bis bedienbar 1.877 → 1.372 ms
- besser: Zu erledigen: Liste, dann Monat, CPU 4× gedrosselt, Blockierzeit 617 → 457 ms
- besser: Mappentyp-Editor öffnen (Vertrag), normal, bis bedienbar 714 → 555 ms
- besser: Mappentyp-Editor öffnen (Vertrag), CPU 4× gedrosselt, bis bedienbar 2.232 → 1.779 ms
- besser: Mappentyp-Editor öffnen (Vertrag), CPU 4× gedrosselt, Blockierzeit 849 → 665 ms

### Ziele und Grenzen

- Ziel verfehlt: Mappe öffnen (60 Dokumente), normal, bis bedienbar 1.148 ms (Ziel 1.000 ms)
