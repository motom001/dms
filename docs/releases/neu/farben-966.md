art: patch

## Geändert

- **Farben nur noch aus Tokens** (#966): Alle festen Farben der Oberfläche kommen jetzt aus `web/src/tokens.css`; dort steht auch der Dunkelmodus, an einer Stelle – die Designs lesen ihn mit. Im Dunkeln besser lesbar: „Löschen“-Knöpfe, „Nichts zu erledigen“ auf der Startseite und der Vertretungsbanner; Schatten und Schleier hinter Dialogen sind im Dunkeln kräftiger. Einige Schatten sind hell minimal anders. Neue feste Farben verhindert eine Prüfung in der CI.
- **Markierungen beim Übernehmen besser lesbar** (#1017): Orange, Grün und Türkis sind etwas dunkler, damit die weißen Nummern darauf mindestens 4,5:1 Kontrast haben.
- „Löschen“-Knöpfe bleiben lesbar, wenn man mit der Maus darüberfährt (bisher wurde die Schrift dabei unsichtbar).
