# Clients entwickeln

**Clients** sind Programme, die **außerhalb von Ablago** laufen und mit Ablago sprechen: die App für Homey Pro, später eine Integration für Home Assistant, eine Handy-App, Add-ins fürs Büro. Ablago selbst braucht keinen Client – alles geht im Browser. Ein Client ist ein Zusatz.

## Wo Clients liegen

Alle Clients liegen im Repository [motom001/dms-clients](https://github.com/motom001/dms-clients), jeder in einem **eigenen Ordner direkt unter der Wurzel** (z. B. `homey/`) mit `README.md` und `CHANGELOG.md`. Welche es gibt und welche geplant sind, steht im [README](https://github.com/motom001/dms-clients#readme). Ein neuer Client beginnt wie alles bei Ablago mit einem Issue (Vorlage „Neuer Client“) und dem Label `freigegeben`.

Die Regeln im Einzelnen stehen im [CONTRIBUTING von dms-clients](https://github.com/motom001/dms-clients/blob/main/CONTRIBUTING.md) – dort ist ihr einer Ort. Kurz:

- **Nur die API v1** von Ablago ([Schnittstelle](https://help.ablago.app/admin/aktuell/api/)). Fehlt dort etwas, wünsch es dir im Repository `dms` – ein Client baut keine Umwege, greift nie auf Datenbank oder Dateien zu.
- **Engste Schlüssel-Stufe:** „nur Zähler“, „nur lesen“ oder „lesen und schreiben“. Das README des Clients sagt, welche er braucht und warum.
- **Keine Telemetrie, keine Werbung, keine Verbindungen zu Dritten.** Ein Client spricht nur mit der Ablago-Adresse, die jemand einträgt. Ausnahmen nur, wo die Plattform es zwingend verlangt, und dann im README.
- **Je Client README und CHANGELOG**, Version im Format `X.Y.Z`; das Release entsteht nach dem Merge von selbst. Commits mit `git commit -s`.

## Schnittstellen für Clients

Die meisten Anbindungen brauchen nur **Zahlen**, keine Inhalte:

- **Zähler-Endpunkt** `GET /api/v1/ich/zaehler` mit der Schlüssel-Stufe „nur Zähler“ – liefert die Zahlen, die auch die Oberfläche zeigt, ohne Titel, Absender oder Dokumente. Siehe [Zähler-Endpunkt und Schlüssel-Stufen](aufbau.md#zaehler-endpunkt).
- **Nach außen melden** – Ablago meldet nicht von sich aus; Clients fragen den Zähler ab. Einen eigenen Webhook gibt es seit #991 nicht mehr, künftig meldet eine Automatisierung (siehe [Nach außen melden](aufbau.md#nach-aussen-melden)).

Mehr als Zahlen (Post ablegen, Mappen lesen) geht über die übrigen Endpunkte der API v1 mit einem Schlüssel „nur lesen“ bzw. „lesen und schreiben“.

## Gleich in allen Clients

Ein Client soll aussehen und sich bedienen wie Ablago selbst: Name **Ablago**, Begriffe aus dem [Glossar](https://help.ablago.app/benutzer/aktuell/begriffe/) in Du-Form, Wege so, wie man klickt („Klick oben rechts auf deinen Namen → Mein Konto → Sicherheit → API-Schlüssel“), Symbole aus [Lucide](https://lucide.dev) in denselben Formen wie die Oberfläche, Logo und Farben nur aus dem Ordner `marke/` von [dms-website](https://github.com/motom001/dms-website). Die genauen Namen der Zahlen und Auslöser stehen im CONTRIBUTING von `dms-clients`.

## Heimnetz und Datenschutz

- Ablago läuft meist im Heimnetz. Ein Client muss mit Adressen wie `http://ablago.home.arpa:8080` umgehen können und sagt verständlich, wenn er Ablago nicht erreicht.
- API-Schlüssel gehören in den sicheren Speicher der Plattform (Schlüsselbund, verschlüsselte Einstellungen), nie in Protokolle.
- Ein Client speichert höchstens, was er zur Anzeige braucht, und sagt im README unter „Datenschutz“, was wo liegt.
- Für alle Beiträge gilt, was unter [Was jeder Beitrag einhält](index.md#was-jeder-beitrag-einhalt) steht – vor allem: Nichts verlässt das Gerät ohne ausdrückliche Zustimmung.
