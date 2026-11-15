art: patch

## Behoben

- **Text fehlte in Archivfassung und Seitenbildern mancher PDFs** (#1329): PDFs, die ihre Schriften nicht mitbringen (oft Helvetica oder Arial in Rechnungen), erschienen in der Archivfassung (PDF/A), in den Seiten- und Vorschaubildern ohne Text – dem Image fehlten Schriften als Ersatz. Jetzt bringt es freie, gleich breite Ersatzschriften mit (Liberation, DejaVu; das Image wird dadurch etwa 14 MB größer). Betroffene Archivfassungen und Vorschaubilder entstehen nach dem Update einmalig neu, im Hintergrund und gedrosselt; die bisherige Archivfassung bleibt, bis die neue die Prüfung besteht, und die Historie der Mappe nennt den Grund. Das Original und die Suche waren nie betroffen. Fehlen die Schriften einmal (eigenes Image), sagt das die Werkbank, statt still leere Seiten zu erzeugen.
