<!-- Probe (#1276): Oberfläche im Stand vor PR #1257 (shared/src/schwaerzen.ts und web/src/ablage/Uebernehmen.tsx zurückgesetzt), Ablago neu gebaut und gestartet, verglichen mit 2026-11-15-container.json; Exit-Code mit --grenzen: 1 (rot). -->

## Oberfläche messen (#1276) – Ablago 0.290.2

Gemessen 2026-11-15 21:05 UTC auf: **Container (2 Kerne, Browser und Ablago auf demselben Rechner, andere Bauten parallel) – keine NAS-Werte**. 3 Runden je Ablauf nach einer zum Aufwärmen; Median und p95 in ms.
Daten: Beispiel-Ablage, 5.000 Demo-Mappen, lange Post 100 Seiten, Vertrag mit 60 Dokumenten (eins mit 60 Seiten), Vertrag mit 300 Rechnungen in der Tabelle.

*bis bedienbar*: vom Klick bzw. Aufruf, bis das Ergebnis zu sehen ist und die Seite wieder auf Eingaben reagiert. *INP*: längste Reaktion auf eine Eingabe (Klick, Taste) bis zum nächsten Bild; „–“: keine Eingabe im Schritt oder alle unter 16 ms. *längste Aufgabe*: längster Block des Browsers (Long Task). *Blockierzeit*: Summe der Anteile über 50 ms. *Anfragen/Server*: Median der Anfragen und ihrer Server-Zeit (Server-Timing) im Schritt.

### normal

| Ablauf | bis bedienbar Median | p95 | INP Median | p95 | längste Aufgabe Median | p95 | Blockierzeit Median | p95 | Anfragen | Server ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen | 16.373 | 16.429 | 3.408 | 3.464 | 3.384 | 3.439 | 14.168 | 14.345 | 7 | 1.401 |

### Vergleich mit dem Vorlauf

Vorlauf: Ablago 0.290.2 vom 2026-11-15 auf Container (2 Kerne, Browser und Ablago auf demselben Rechner, andere Bauten parallel) – keine NAS-Werte. Schwelle: mehr als 20 % und mindestens 100 ms (Median).

- **schlechter**: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, bis bedienbar 2.921 → 16.373 ms
- **schlechter**: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, INP 432 → 3.408 ms
- **schlechter**: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, Blockierzeit 1.212 → 14.168 ms

### Ziele und Grenzen

- Ziel verfehlt: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, bis bedienbar 16.373 ms (Ziel 1.000 ms)
- Ziel verfehlt: Neue Post zuordnen: 100 Seiten, Vertrag wählen, sofort tippen, normal, INP 3.408 ms (Ziel 200 ms)
