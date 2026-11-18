# Entscheidungen { #entscheidungen }

Hier steht, **warum** etwas so gebaut ist – eine Seite je Entscheidung, mit Frage, Entscheidung, Gründen und Folgen. Wie es heute funktioniert, steht auf den Seiten des Kerns ([Karte](../aufbau.md)); dort verweist ein Satz auf die Entscheidung.

| Entscheidung | Seit |
| --- | --- |
| [PDF-Bibliothek: pdf-lib bleibt](pdf-bibliothek.md) | #822, #823 |
| [Eingebettete Schriften auch für Text, der in WinAnsi passt](eingebettete-schriften.md) | #826 |
| [Eigene kleine Umsetzung für Texte statt i18next](eigene-sprachbibliothek.md) | #473, #727 |
| [Kein VOLUME für die Datenbank in dms-komplett](kein-volume.md) | #943 |

## Eine neue Entscheidung festhalten { #neue-entscheidung }

Wird in einem Issue zwischen Wegen entschieden, die später jemand in Frage stellen könnte (eine Bibliothek, ein Format, ein bewusst weggelassener Weg), bekommt die Entscheidung eine eigene Datei in `entscheidungen/`, in beiden Sprachen und im Menü beider Handbücher:

- **Titel** mit der Entscheidung selbst und den Issues, z. B. „Kein VOLUME für die Datenbank in dms-komplett (#943)“;
- **Frage**, **Entscheidung** (wer, wann), **Gründe**, **Folgen** (was daraus im Code und im Handbuch folgt, mit Link), **Stand**;
- längere Bewertungen von Alternativen gehören mit auf die Seite, nicht in die Beschreibung des Kerns.

Ändert sich eine Entscheidung, bleibt die Seite stehen: oben ein Satz, was jetzt gilt und warum, mit Link auf die neue Entscheidung.
