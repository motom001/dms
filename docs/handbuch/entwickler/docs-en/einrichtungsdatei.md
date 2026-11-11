# Setup file {#einrichtungsdatei}

The setup assistant's configuration file (#806) describes a setup in a machine-readable way: YAML, checked against a published JSON Schema (2020-12). JSON is accepted too. How administrators use it is in the Administrator manual under [Setup as a file](https://help.ablago.app/admin/aktuell/en/einrichtungsdatei/).

## Format and versions { #format-und-versionen }

- Header line `ablago-einrichtung: 1` – the format version. A new version gets a schema of its own (`ablago-einrichtung-<n>.schema.json`); Ablago rejects unknown versions.
- Schema: [ablago-einrichtung-1.schema.json](einrichtungsdatei/ablago-einrichtung-1.schema.json) (the same file as in the Administrator manual; `$id` points there).
- Unknown fields are errors (`additionalProperties: false`) so that typos don't get lost silently.
- **Your account (#821):** section `konto` – the person setting up, with "Full administration". Older files (0.191, 0.192) with `administrator` Ablago reads as `konto`; `erster-benutzer` is dropped with a notice (`hinweise`). Neither is in the schema – the conversion happens before the check; line and field of an error still name the name from the file.
- **Use (#1045):** `nutzung` (`privat`, `beruflich`, `beides`) determines the attribute “used for work” (#1032) in the plan (`optional.beruflich`); `organisation` (name required; address, email, phone) only exists for work use. Older files without `nutzung` set the attribute directly with `optionales.beruflich`; if both are present they must match. `server/src/einrichtungsdatei.ts` checks these contradictions after the schema, with line and field.
- **No secrets:** fields `passwort` only accept a reference to an environment variable (`${NAME}`, capital letters, digits, underscore). The format knows no key – Ablago always creates it anew.

The keys are German in every language, like the API's names.

## In the code { #im-code }

| Where | What |
| --- | --- |
| `shared/src/einrichtungsplan.ts` | The plan as interface and server exchange it (`Einrichtungsplan`), reference pattern, steps |
| `server/src/einrichtungsdatei.ts` | Schema (`SCHEMA`), check with line and field, reading and writing (YAML with comments, library `yaml`) |
| `server/src/einrichtung.ts` | Checking a plan per step, reading and writing the file – only with the setup code or with "Full administration" while the assistant is open |
| `web/src/assistent/` | Collecting, summary, "Set up now" with progress (#804), loading and saving the file |

Interfaces (all `POST`, header `x-einrichtungscode`, only as long as Ablago isn't set up): `/api/einrichtung/datei/lesen` (`{ text }` → `{ plan, fehler: [{ zeile, feld, text }], hinweise }`), `/api/einrichtung/datei/schreiben` (`{ plan }` → `{ text, name }`), `/api/einrichtung/pruefen` (`{ plan, passwort? }` → `{ probleme }` per step). Without a database (setup mode) there is only `datei/lesen`. Nothing is created via these interfaces.

The code generates schema and example in both manuals; `server/test/einrichtungsdatei.test.ts` fails if they are outdated. To regenerate: `schemaText()` and `schreibeEinrichtungsdatei()` from `server/src/einrichtungsdatei.ts` with the example from the test.

## Example { #beispiel }

The comments are the ones Ablago writes into the file (German):

```yaml
# Einrichtung von Ablago – zum Laden im Einrichtungsassistenten („Aus Konfigurationsdatei laden“).
# Ohne Passwörter und ohne Schlüssel: Passwörter fragt der Assistent ab, den Schlüssel erzeugt Ablago immer neu.
# Aufbau: https://help.ablago.app/admin/aktuell/einrichtungsdatei/ablago-einrichtung-1.schema.json

ablago-einrichtung: 1
# Verbindung zu PostgreSQL (gilt nur, solange Ablago noch keine Datenbank hat).
datenbank:
  rechner: db
  port: 5432
  name: dms
  benutzer: dms
  passwort: ${DMS_DB_PASSWORT}
# Name der Ablage – Schriftzug in Kopfzeile und Browser-Tab.
ablage: Familie Beispiel
# Dein Konto: richtet Ablago ein, darf es verwalten und arbeitet auch in der Ablage.
konto:
  name: Lena Beispiel
  email: lena@example.org
  passwort: ${DMS_KONTO_PASSWORT}
# Wofür Ablago genutzt wird: privat, beruflich oder beides.
nutzung: privat
# Aus dem offiziellen Katalog, je die neueste passende Version; Automatisierungen: true = eingeschaltet.
pakete:
  - id: texterkennung
  - id: benachrichtigungen
# Adresse für Links, Bundesland für Feiertage, Beispiele, E-Mail-Versand (ohne Passwort).
optionales:
  adresse: https://ablago.example.org
  bundesland: SN
  beispiele: false
  e-mail:
    aktiv: true
    server: smtp.example.org
    port: 587
    verbindung: starttls
    benutzer: ablago@example.org
    absender: Ablago <ablago@example.org>
    selbstsigniert: false
    passwort: ${DMS_MAIL_PASSWORT}
```

## Later: setup without the interface { #spater-einrichtung-ohne-oberflache }

Prepared but not built yet: a file in the data folder or a variable at the first start, for instance for providers. Then the references (`${DMS_KONTO_PASSWORT}` etc.) are resolved from the environment; until then the assistant in the browser always asks for passwords.
