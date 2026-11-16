art: patch

## Geändert

- **Paketkatalog:** Der offizielle Katalog gilt nur noch mit gültiger Signatur als offiziell. Fehlt sie oder lässt sie sich nicht abrufen, bestätigst du die Herkunft wie bei anderen Quellen. (#1351)
- **`TRUST_PROXY`:** `0`, `no`, `off` und `nein` bedeuten wie `false` „aus“. Ein ungültiger Wert gilt jetzt als „aus“ statt „auto“, die Meldung im Protokoll bleibt. (#1350)
