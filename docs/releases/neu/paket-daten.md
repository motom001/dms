art: minor

## Neu

- **Einrichtung und Nachweise als Daten für Pakete** (#1053): Ein Paket wie „Compliance“ kann den Stand der Einrichtung je Bereich (Allgemeines, Belegeingang, Ablage, Zugang, Betrieb, Sicherung, Unveränderbarkeit, Datenschutz, Betriebsprüfung) und die Nachweise eines Monats als JSON lesen und zwei Stände vergleichen lassen – nie mit Passwörtern oder anderen Geheimnissen. Fehlanmeldungen, Rechteänderungen, Updates, Paket-Verlauf, Wartungszeiten und Prüfläufe merkt sich Ablago dafür ab jetzt je Monat.
- **Einrichtung und Nachweise bewusst freigeben** (#1054): Pakete fragen „Einrichtung lesen“ und „Nachweise lesen“ je Bereich an; die Vorschau bei Installation und Update nennt die Bereiche. Auf der Seite des Pakets hakst du an, was es lesen darf – Vorgabe: nichts. Anhaken darf nur, wer den Bereich selbst verwaltet, Zugang und Nachweise nur mit Gesamter Verwaltung. Das Paket liest in deinem Namen; verlierst du das Verwaltungsrecht, liefert der Bereich nichts mehr. Pakete mit Netz bekommen diese Rechte nie.
