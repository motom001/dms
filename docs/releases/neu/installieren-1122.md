art: patch

## Behoben

- **Pakete installieren sich unabhängig von der Reihenfolge** (#1122): Rechnungen lässt sich wieder installieren, auch ohne Fahrzeuge oder Vermietung – „zeigt auf eine Mappe vom Typ …“ auf ein optionales Ziel, dessen Paket fehlt, ist kein Fehler mehr und gilt, sobald das Paket kommt. Anzeige-Bedingungen auf Felder, die erst im zweiten Durchgang entstehen, und Register-Quellen über optionale Ziele (etwa *Fahrzeug → Rechnungen*) legt Ablago jetzt in jeder Reihenfolge vollständig an; was sich nicht anlegen lässt, bricht die Installation mit Stelle ab, statt still wegzufallen.

## Geändert

- **Namenskonflikte schon in der Vorschau** (#1123): Die Vorschau nennt jeden Mappentyp und jede Ansicht, deren Name schon vergeben ist, mit Herkunft (Paket, selbst angelegt, Abhängigkeit) – in Werkbank → Pakete als Hinweis vor „Installieren“. Ein Umbau, der den Typ übernimmt, ist kein Konflikt.
