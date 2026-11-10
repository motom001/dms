art: minor

## Neu

- **Berechnete Felder und Hinweise von Paketen** (#1034): Pakete können Felder ihres Mappentyps selbst ausrechnen – etwa *Kündigen bis* oder den *Status* eines Vertrags. Solche Felder sind in der Mappe nur lesbar, darunter steht „berechnet von …“ mit dem Namen des Pakets; nur das Paket schreibt den Wert, mit denselben Prüfungen wie jede Änderung. Oberfläche, Schnittstelle, andere Pakete und Automatisierungen bekommen eine Meldung mit dem Paketnamen, „Aus Dokument ausfüllen“ und die Erkennung lassen die Felder aus. Ist das Paket entfernt oder rechnet nicht mehr, bleibt der letzte Wert stehen („nicht mehr berechnet“), bis du das Feld unter Werkbank → Mappentypen wieder freigibst. Änderungen des Pakets an berechneten Feldern stehen je Mappe und Tag in einem Eintrag der Historie. Außerdem kann ein Paket kurze Hinweise an eine Mappe setzen („Die Positionen ergeben 118,40 €, die Rechnung sagt 120,80 €“) – gelb in der Hinweiszeile über den Registern, immer mit dem Paketnamen, Speichern hindern sie nie. Die Rechte-Vorschau bei der Installation nennt beides.

## Geändert

- **Schnittstelle** (#1034): Berechnete Felder (`berechnetVon` am Feld) ändert über `POST`/`PUT /api/v1/mappen` nur das Paket, das sie berechnet – sonst 400 mit dem Paketnamen. Neu sind `hinweise` an der Mappe und `PUT`/`DELETE /api/v1/mappen/{id}/hinweise/{schluessel}` für Pakete mit `dms:hinweise`.
