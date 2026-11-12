art: patch

## Sicherheit

- **`openapi.json` ohne Anmeldung ohne genaue Version** (#1067): `/api/openapi.json` und `/api/v1/openapi.json` nennen in `info.version` die installierte Version von Ablago nur noch mit Anmeldung (Sitzung oder API-Schlüssel), wie `/api/konto/status`. Ohne Anmeldung steht dort `1`, die Version der API. So lässt sich von außen nicht mehr gezielt ablesen, welche Version läuft.
