art: minor

## Neu

- **Dokument umbenennen** (#1594): **⋯ → Umbenennen …** an einem Dokument. Die Endung bleibt und lässt sich nicht versehentlich ändern; der Name vor der ersten Umbenennung steht unter „Über dieses Dokument“ als *Ursprünglicher Name*. Jede Umbenennung steht in der Historie der Mappe; im Archivmodus ist Umbenennen während der Aufbewahrungsfrist gesperrt.
- **Zahl im Tab abschaltbar** (#1625): Unter Mein Konto → Darstellung schaltet „Offene Aufgaben und neue Post im Tab zeigen“ die Zahl im Titel und den Punkt im Symbol des Tabs ab – je Konto, auf allen Geräten. Aus fragt Ablago dafür auch nicht im Hintergrund nach.

## Verbessert

- **Scans mit 600 dpi** (#1600): Bild-Scans über 300 dpi verkleinert Ablago für Texterkennung und Bildanalyse intern auf 300 dpi; das Original bleibt unverändert. „Über dieses Dokument“ sagt, wenn das geschehen ist.
- **Zahlen hinter den Ansichten bleiben schnell** (#1631): Die Zählung hinter allen Ansichten schaltet das Übersetzen der Abfrage in PostgreSQL (JIT) für sich ab. Bei vielen Ansichten und großer Ablage blieb sie sonst nicht mehr unter der Schwelle und brauchte ein Vielfaches.
- **Ein Begriff: „Dienste im Netz“** (#1633): „Was Ablago darf“ und die Einrichtung sagen wie der Mappentyp „Dienste im Netz“ statt „Internet“ – ob der Dienst im Internet oder bei euch zu Hause läuft. Die eingebauten Helfer heißen dort „was Ablago mitbringt“.
