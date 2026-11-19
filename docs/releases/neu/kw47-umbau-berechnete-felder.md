art: patch

## Korrigiert

- **Umbau mit Übernahme eines Typs** (#1476): Berechnete Felder des übernommenen Typs gehören danach dem aufnehmenden Paket, wenn es sie selbst als berechnet mitbringt – auch in weiteren Schritten desselben Umbaus. Vorher bekam das neue Paket beim Schreiben (etwa des Status einer Rechnung) „HTTP 400“. Ein Dokumentregister, das der Umbau einem anderen zugeordnet hat, verschwindet danach, wenn es leer ist und das Paket es nicht mitbringt.
