art: keine

## Intern

- **Übergangsausnahmen mit Ablaufdatum** (#902): `server/src/uebergaenge.ts` listet die Sonderwege für alte Pakete und Dateien, je mit der Version, mit der sie entfallen (alle 1.0.0). Ein Test schlägt fehl, sobald Ablago diese Version erreicht. Das Änderungsprotokoll der API kündigt den Wegfall von `PUT /api/v1/sicherungen/{name}/extern`, `texterkennung.fertig` und `dms:ablageort` mit 1.0.0 an.
