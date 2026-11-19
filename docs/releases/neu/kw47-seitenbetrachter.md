art: patch

## Korrigiert

- **Seitenbetrachter in breiter Spalte** (#1486): Eine A4-Seite füllt in der Mappe wieder ihre Fläche, statt schmal oben in der Mitte zu stehen („wie auf A3“). Vorschau, Graubild, Seitenbilder, Ersatzschriften-Prüfung und Verkleinern rastern die Seite jetzt wie Anzeige und Schwärzen im sichtbaren Bereich der Seite (`-cropbox`).
- **Mappe mit langem Dokument öffnet schneller** (#1445): Der Seitenbetrachter der Mappe lädt nur Seitenzahl und Seitengrößen statt der Wortpositionen des ganzen Dokuments (bei 120 Seiten 22 ms statt rund 0,5 s auf dem Server, 3 KB statt 3,7 MB). „Übernehmen“ lädt die Wörter weiter.
