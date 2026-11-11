# Einrichtungsdatei

Die Konfigurationsdatei des Einrichtungsassistenten (#806) beschreibt eine Einrichtung maschinenlesbar: YAML, geprüft gegen ein veröffentlichtes JSON Schema (2020-12). JSON wird ebenfalls angenommen. Wie Administratoren sie nutzen, steht im Administratorhandbuch unter [Einrichtung als Datei](https://help.ablago.app/admin/aktuell/einrichtungsdatei/).

## Format und Versionen

- Kopfzeile `ablago-einrichtung: 1` – die Formatversion. Eine neue Version bekommt ein eigenes Schema (`ablago-einrichtung-<n>.schema.json`); Ablago lehnt unbekannte Versionen ab.
- Schema: [ablago-einrichtung-1.schema.json](einrichtungsdatei/ablago-einrichtung-1.schema.json) (dieselbe Datei wie im Administratorhandbuch, `$id` zeigt dorthin).
- Unbekannte Felder sind Fehler (`additionalProperties: false`), damit Tippfehler nicht still verloren gehen.
- **Dein Konto (#821):** Abschnitt `konto` – die Person, die einrichtet, mit „Gesamte Verwaltung“. Ältere Dateien (0.191, 0.192) mit `administrator` liest Ablago als `konto`; `erster-benutzer` fällt mit einem Hinweis weg (`hinweise`). Beides steht nicht im Schema – die Umstellung geschieht vor der Prüfung, Zeile und Feld eines Fehlers nennen trotzdem den Namen aus der Datei.
- **Nutzung (#1045):** `nutzung` (`privat`, `beruflich`, `beides`) bestimmt das Merkmal „beruflich genutzt“ (#1032) im Plan (`optional.beruflich`); `organisation` (Name Pflicht, Anschrift, E-Mail, Telefon) gibt es nur bei beruflicher Nutzung. Ältere Dateien ohne `nutzung` setzen das Merkmal mit `optionales.beruflich` direkt; steht beides da, muss es zusammenpassen. Diese Widersprüche prüft `server/src/einrichtungsdatei.ts` nach dem Schema, mit Zeile und Feld.
- **Keine Geheimnisse:** Felder `passwort` nehmen nur einen Verweis auf eine Umgebungsvariable an (`${NAME}`, Großbuchstaben, Ziffern, Unterstrich). Einen Schlüssel kennt das Format nicht – Ablago erzeugt ihn immer neu.

## Im Code

| Wo | Was |
| --- | --- |
| `shared/src/einrichtungsplan.ts` | Der Plan, wie Oberfläche und Server ihn austauschen (`Einrichtungsplan`), Verweis-Muster, Schritte |
| `server/src/einrichtungsdatei.ts` | Schema (`SCHEMA`), Prüfung mit Zeile und Feld, Lesen und Schreiben (YAML mit Kommentaren, Bibliothek `yaml`) |
| `server/src/einrichtung.ts` | Prüfen eines Plans je Schritt, Datei lesen und schreiben – nur mit Einrichtungscode bzw. mit „Gesamte Verwaltung“ bei offenem Assistenten |
| `web/src/assistent/` | Sammeln, Zusammenfassung, „Jetzt einrichten“ mit Fortschritt (#804), Laden und Speichern der Datei |

Schnittstellen (alle `POST`, Kopf `x-einrichtungscode`, nur solange Ablago nicht eingerichtet ist): `/api/einrichtung/datei/lesen` (`{ text }` → `{ plan, fehler: [{ zeile, feld, text }], hinweise }`), `/api/einrichtung/datei/schreiben` (`{ plan }` → `{ text, name }`), `/api/einrichtung/pruefen` (`{ plan, passwort? }` → `{ probleme }` je Schritt). Ohne Datenbank (Einrichtungsmodus) gibt es nur `datei/lesen`. Angelegt wird über diese Schnittstellen nichts.

Schema und Beispiel in beiden Handbüchern erzeugt der Code; `server/test/einrichtungsdatei.test.ts` schlägt fehl, wenn sie veraltet sind. Neu erzeugen: `schemaText()` und `schreibeEinrichtungsdatei()` aus `server/src/einrichtungsdatei.ts` mit dem Beispiel aus dem Test.

## Beispiel

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

## Später: Einrichtung ohne Oberfläche

Vorbereitet, aber noch nicht gebaut: eine Datei im Datenordner oder eine Variable beim ersten Start, etwa für Anbieter. Dann werden die Verweise (`${DMS_KONTO_PASSWORT}` usw.) aus der Umgebung aufgelöst; der Assistent im Browser fragt Passwörter bis dahin immer ab.
