# Pakete entwickeln

Pakete erweitern das DMS um fertige Mappentypen, Sichten und Beispiel-Mappen. Administratoren installieren sie unter **Werkbank → Pakete** aus dem offiziellen Katalog (siehe [Administratorhandbuch → Pakete](https://motom001.github.io/dms/admin/aktuell/pakete/)).

## Wo Pakete liegen

Alle offiziellen Pakete liegen im Repository **[motom001/dms-registry](https://github.com/motom001/dms-registry)**, ein Ordner je Paket unter `pakete/<id>/`. Dort gelten dieselben Regeln wie im DMS: erst ein Issue als User Story, umgesetzt wird nach dem Label `freigegeben`. Die Regeln für Pakete (Lizenzen, Verbotenes, Namen) stehen in [REGELN.md](https://github.com/motom001/dms-registry/blob/main/REGELN.md).

## Ein Paket anlegen

```sh
git clone https://github.com/<du>/dms-registry && cd dms-registry
werkzeuge/neues-paket.sh mein_paket "Mein Paket"   # kopiert vorlage/ nach pakete/mein_paket/
```

Dann ausfüllen:

| Datei | Inhalt |
| --- | --- |
| `manifest.yaml` | Id, Name, Version (SemVer), Beschreibung, Autor, Lizenz, nötige DMS-Version (z. B. `">=0.63.0"`), Abhängigkeiten, Inhalt |
| `inhalt/mappentypen.yaml` | Mappentypen mit Feldern, Registern, Titel und Trefferliste |
| `inhalt/sichten.yaml` | Sichten mit Elternsicht, Typen und Bedingungen |
| `inhalt/beispiele.yaml` | optional: Beispiel-Mappen mit erfundenen Daten |
| `README.md`, `LICENSE`, `CHANGELOG.md` | Beschreibung, Lizenztext, Änderungen je Version |
| `tests/erwartung.yaml` | was nach der Installation da sein muss |

## Paketformat (verbindlich)

Das Format beschreiben die JSON-Schemas in der Registry: [`schema/manifest.schema.json`](https://github.com/motom001/dms-registry/blob/main/schema/manifest.schema.json) und [`schema/inhalt.schema.json`](https://github.com/motom001/dms-registry/blob/main/schema/inhalt.schema.json). Die Vorlage zeigt jede Angabe mit Kommentar. Das DMS liest genau dieses Format:

- **Schlüssel** von Typen, Feldern, Registern und Sichten sind im Paket lokal. Das DMS legt Mappentypen als `<paket>_<schluessel>` an.
- **Felder** wie in der Werkbank: `key`, `label`, `typ` (text, langtext, formatiert, zahl, betrag, datum, janein, auswahl, referenz, passwort) und die üblichen Eigenschaften (`pflicht`, `eindeutig`, `hilfe`, `standard`, `minLen`, `maxLen`, `muster`, `min`, `max`, `nachkomma`, `waehrung`, `optionen`, `mehrfach`, `verweisart`, `frist`).
- **Verweise** (`ziel` bei Referenzfeldern, `quellen[].typ` bei Verknüpfungsregistern): `schluessel` für einen Typ dieses Pakets, `<paket>:<schluessel>` für den Typ eines anderen Pakets. Das andere Paket steht dann unter `abhaengigkeiten`. Typen eines Pakets dürfen auch im Kreis aufeinander verweisen.
- **Sichten:** `eltern` ist der lokale Schlüssel einer anderen Sicht des Pakets. `bedingungen` sind `{ feld, operator, wert }` mit den Operatoren der Werkbank (`gleich`, `enthaelt`, `kleiner`, `groesser`, `zwischen`, `ausserhalb`, `imZeitraum`, `einerVon`, `zeigtAuf`, `leer`, `nichtLeer`, `ja`, `nein`); bei `zwischen` ist `wert` eine Liste mit zwei Werten.
- **Beispiele:** `{ typ, werte }`; Beträge dürfen als Zahl stehen.
- **Versionen:** `dms` und `abhaengigkeiten` nehmen Bereiche: `>=1.2.0`, `>1.2.0`, `1.2.0` bzw. `=1.2.0`, `^1.2.0` (gleiche Hauptversion), `~1.2.0` (gleiche Nebenversion), optional mit Obergrenze ` <2.0.0`.

Bei einem **Update** ergänzt das DMS nur: neue Typen, Felder, Register und Sichten. Felder, Register oder Sichten zu entfernen oder umzubenennen hat auf installierte DMS keine Wirkung – plane das Format deshalb vorher.

## Prüfen

```sh
pip install pyyaml jsonschema
python3 werkzeuge/pruefen.py pakete/mein_paket      # Schema, Pflichtdateien, Verweise, Lizenz, Changelog
python3 werkzeuge/katalog.py --probe /tmp/katalog    # lässt sich der Katalog bauen?
```

Dieselben Prüfungen laufen im Pull Request. Ein veröffentlichtes Paket ändert sich nie: Jede Änderung braucht eine höhere Version und einen Eintrag im `CHANGELOG.md`.

## Pull Request und Katalog

1. Pull Request mit `Closes #…`; jeder Commit trägt ein `Signed-off-by:` (`git commit -s`).
2. Nach dem Merge baut die CI je Paketversion ein Archiv `<id>-<version>.zip` und den Katalog `katalog.json` mit SHA-256 und legt beides auf den Branch `gh-pages`. Das DMS findet das Paket beim nächsten **Katalog abrufen**.

## Ausblick

- **Eigenes Paket im eigenen DMS testen**, bevor es in den Katalog kommt: eine erweiterte Ansicht mit eigener Katalogadresse und Hochladen als Datei ([#189](https://github.com/motom001/dms/issues/189)).
- **Pakete mit Code**, die auf Ereignisse reagieren und mit eigenen, bei der Installation bestätigten Rechten über die API arbeiten – abgeschottet als WebAssembly.
