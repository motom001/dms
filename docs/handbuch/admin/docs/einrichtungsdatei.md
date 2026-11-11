# Einrichtung als Datei

Was du im [Einrichtungsassistenten](installation.md#der-einrichtungsassistent) zusammengestellt hast, lässt sich als **Konfigurationsdatei** speichern. Aus so einer Datei richtest du eine neue Ablago in wenigen Sekunden ein, etwa eine zweite für die Eltern oder eine neue nach einem Umzug ohne Sicherung. IT-Dienstleister geben damit eigene Vorgaben mit.

## Speichern

In der [Zusammenfassung](installation.md#zusammenfassung) des Assistenten speichert **Als Datei speichern** die Datei `ablago-einrichtung.yaml` in deinen Download-Ordner. Darin stehen Datenbank (Rechner, Port, Name, Benutzer), Name der Ablage, dein Konto (Name, E-Mail-Adresse), die Nutzung samt deiner Organisation, die Pakete samt ein- und ausgeschalteter Automatisierungen und das Optionale (Adresse, Bundesland, Beispiele, E-Mail-Versand). Kurze Kommentare erklären jeden Abschnitt.

!!! info "Nicht in der Datei: Passwörter und Schlüssel"
    Die Datei enthält **keine Passwörter** und **keinen Schlüssel**. Passwörter fragt der Assistent beim Laden ab. Den Schlüssel erzeugt Ablago bei jeder Einrichtung neu, und das [Notfallblatt](verschluesselung.md#notfallblatt) bleibt Pflicht. Steht in einer Datei trotzdem ein Passwort im Klartext, lehnt Ablago sie ab.

## Laden

Im Assistenten steht oben rechts, klein neben der Hilfe, **Aus Konfigurationsdatei laden**. Das geht nur mit gültigem [Einrichtungscode](installation.md#einrichtungscode) und nur, solange Ablago noch nicht eingerichtet ist. Wählst du die Datei schon auf dem Schritt „Einrichtungscode“, prüft Ablago sie, sobald der Code stimmt. Angelegt wird beim Laden nichts.

Ablago prüft die Datei Schritt für Schritt:

- **Aufbau:** gegen das [Schema](#schema). Fehler stehen mit Zeile und Feld da, zum Beispiel „Zeile 5, konto.passwort: Passwörter gehören nicht in die Datei“. Dann ändert sich nichts.
- **Datenbank:** Ohne Datenbank füllt die Datei den Schritt „Datenbank“ vor; das Passwort gibst du dort ein. Ist Ablago schon verbunden, bleibt es bei dieser Verbindung, und ein Hinweis nennt die Abweichung.
- **Inhalt:** E-Mail-Adresse deines Kontos, Adresse von Ablago.
- **Pakete:** Gibt es sie im Katalog? Rechte, Herkunft, Namenskonflikte und Pflicht-Einstellungen bestätigst du immer selbst, auch mit Datei.

Passt alles, geht es direkt zur **Zusammenfassung**, die du wie gewohnt mit **Jetzt einrichten** bestätigst. Passt ein Schritt nicht, zeigt der Assistent genau diesen Schritt mit dem Grund; der Rest bleibt vorausgefüllt. Weil Passwörter nie in der Datei stehen, landest du in der Regel zuerst beim Schritt „Dein Konto“.

JSON geht auch: Gültiges JSON ist gültiges YAML.

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

[Beispieldatei herunterladen](einrichtungsdatei/beispiel.yaml)

- `konto` ist die Person, die einrichtet: Sie bekommt „Gesamte Verwaltung“ und arbeitet auch in der Ablage. Weitere Personen lädst du nach der Einrichtung unter Werkbank → Benutzer ein.
- Ohne Liste `pakete` wählst du die Pakete im Assistenten; `pakete: []` heißt „keine“.
- **Dateien aus Version 0.191 und 0.192** lädt Ablago weiter: Der Abschnitt `administrator` gilt als `konto`. Einen Abschnitt `erster-benutzer` übergeht Ablago mit einem Hinweis – den ersten Benutzer gibt es im Assistenten nicht mehr. Beim Speichern steht nur noch `konto` in der Datei.
- `nutzung` ist die Antwort auf „Wofür nutzt du Ablago?“: `privat`, `beruflich` oder `beides` ([Nutzung](installation.md#nutzung)). `beruflich` und `beides` setzen das Merkmal [beruflich genutzt](nutzung.md). Fehlt die Angabe, fragt der Assistent.
- `organisation` gibt es nur bei `beruflich` und `beides`: `name` ist Pflicht, dazu freiwillig `strasse`, `hausnummer`, `plz`, `ort`, `email` und `telefon`. „Jetzt einrichten“ legt daraus die [eigene Organisation](organisation.md) an; das Paket `basis` muss dann in der Liste stehen.
- **Dateien bis Version 0.237** kennen `nutzung` noch nicht und setzen das Merkmal mit `optionales: beruflich: true`. Ablago liest das weiter; der Assistent schlägt dann im Schritt „Nutzung“ „Beides“ vor. Steht beides in der Datei, muss es zusammenpassen.
- Automatisierungen eines Pakets stehen als Schlüssel mit `true` (eingeschaltet) oder `false` (aus); fehlt eine, ist sie wie im Assistenten eingeschaltet.

## Verweise statt Passwörter

Statt eines Passworts darf ein **Verweis auf eine Umgebungsvariable** stehen, etwa `passwort: ${DMS_KONTO_PASSWORT}`. Er ist für eine spätere Einrichtung ganz ohne Oberfläche gedacht. Der Assistent im Browser wertet ihn nicht aus und fragt das Passwort trotzdem ab; beim Speichern bleibt der Verweis erhalten.

## Schema { #schema }

Die Datei folgt einem veröffentlichten JSON Schema, versioniert über die Kopfzeile `ablago-einrichtung: 1`:

[ablago-einrichtung-1.schema.json](einrichtungsdatei/ablago-einrichtung-1.schema.json)

Eine neue Formatversion bekommt ein eigenes Schema. Ablago lehnt Dateien mit einer unbekannten Version ab, statt sie halb zu lesen.
