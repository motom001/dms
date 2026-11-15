## Oberfläche messen (#1276) – Ablago 0.290.2

Gemessen 2026-11-15 21:07 UTC auf: **Container (2 Kerne, Browser und Ablago auf demselben Rechner, andere Bauten parallel) – keine NAS-Werte**. 5 Runden je Ablauf nach einer zum Aufwärmen; Median und p95 in ms.
Daten: Beispiel-Ablage, 5.000 Demo-Mappen, lange Post 100 Seiten, Vertrag mit 60 Dokumenten (eins mit 60 Seiten), Vertrag mit 300 Rechnungen in der Tabelle.

*bis bedienbar*: vom Klick bzw. Aufruf, bis das Ergebnis zu sehen ist und die Seite wieder auf Eingaben reagiert. *INP*: längste Reaktion auf eine Eingabe (Klick, Taste) bis zum nächsten Bild; „–“: keine Eingabe im Schritt oder alle unter 16 ms. *längste Aufgabe*: längster Block des Browsers (Long Task). *Blockierzeit*: Summe der Anteile über 50 ms. *Anfragen/Server*: Median der Anfragen und ihrer Server-Zeit (Server-Timing) im Schritt.

### normal

| Ablauf | bis bedienbar Median | p95 | INP Median | p95 | längste Aufgabe Median | p95 | Blockierzeit Median | p95 | Anfragen | Server ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Startseite öffnen | 527 | 826 | – | – | 100 | 193 | 50 | 143 | 16 | 211 |
| Suche mit Treffern | 161 | 181 | 56 | 72 | 0 | 0 | 0 | 0 | 1 | 5 |
| Mappe öffnen (60 Dokumente) | 1.220 | 1.324 | 96 | 120 | 108 | 138 | 88 | 93 | 65 | 1.321 |
| Neue Post: Datei ablegen | 1.082 | 2.201 | 24 | 40 | 0 | 0 | 0 | 0 | 15 | 1.479 |
| Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen | 2.921 | 3.204 | 432 | 464 | 384 | 438 | 1.212 | 1.495 | 3 | 1.060 |
| Mappe ändern und speichern (Tabelle 300 Zeilen) | 358 | 366 | 24 | 48 | 0 | 0 | 0 | 0 | 2 | 58 |
| Zu erledigen: Liste, dann Monat | 688 | 1.032 | 16 | 16 | 102 | 115 | 52 | 65 | 15 | 190 |
| Ansicht mit vielen Mappen blättern (300 Zeilen) | 371 | 488 | – | – | 0 | 0 | 0 | 0 | 2 | 35 |
| Dokument-Vorschau mehrseitig (60 Seiten) | 432 | 464 | 64 | 72 | 0 | 0 | 0 | 0 | 42 | 2.160 |
| Werkbank-Übersicht | 599 | 940 | – | – | 104 | 117 | 54 | 67 | 20 | 271 |
| Mappentyp-Editor öffnen (Vertrag) | 714 | 1.430 | – | – | 109 | 245 | 70 | 286 | 28 | 328 |

### CPU 4× gedrosselt

| Ablauf | bis bedienbar Median | p95 | INP Median | p95 | längste Aufgabe Median | p95 | Blockierzeit Median | p95 | Anfragen | Server ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Startseite öffnen | 1.748 | 1.957 | – | – | 470 | 524 | 490 | 562 | 16 | 236 |
| Suche mit Treffern | 884 | 1.107 | 144 | 200 | 204 | 215 | 225 | 259 | 2 | 81 |
| Mappe öffnen (60 Dokumente) | 3.190 | 3.257 | 400 | 552 | 448 | 573 | 973 | 1.309 | 65 | 1.437 |
| Neue Post: Datei ablegen | 1.108 | 1.572 | 48 | 56 | 85 | 129 | 35 | 79 | 17 | 667 |
| Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen | 12.745 | 14.854 | 1.568 | 1.752 | 1.658 | 2.179 | 5.926 | 6.117 | 8 | 1.070 |
| Mappe ändern und speichern (Tabelle 300 Zeilen) | 1.184 | 1.377 | 96 | 120 | 83 | 95 | 76 | 92 | 5 | 74 |
| Zu erledigen: Liste, dann Monat | 1.877 | 2.015 | 24 | 40 | 501 | 527 | 617 | 670 | 15 | 95 |
| Ansicht mit vielen Mappen blättern (300 Zeilen) | 845 | 952 | – | – | 95 | 111 | 135 | 192 | 2 | 29 |
| Dokument-Vorschau mehrseitig (60 Seiten) | 1.184 | 1.797 | 248 | 376 | 172 | 435 | 201 | 736 | 61 | 1.347 |
| Werkbank-Übersicht | 1.621 | 1.937 | – | – | 401 | 523 | 405 | 581 | 20 | 317 |
| Mappentyp-Editor öffnen (Vertrag) | 2.232 | 2.442 | – | – | 469 | 551 | 849 | 967 | 31 | 889 |

### Vergleich mit dem Vorlauf

Kein Vorlauf zum Vergleichen.

### Ziele und Grenzen

- Ziel verfehlt: Mappe öffnen (60 Dokumente), normal, bis bedienbar 1.220 ms (Ziel 1.000 ms)
- Ziel verfehlt: Neue Post: Datei ablegen, normal, bis bedienbar 1.082 ms (Ziel 1.000 ms)
- Ziel verfehlt: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, bis bedienbar 2.921 ms (Ziel 1.000 ms)
- Ziel verfehlt: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, INP 432 ms (Ziel 200 ms)
