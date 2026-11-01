# Pakete entwickeln

Pakete erweitern das DMS um fertige Mappentypen, Ansichten und Beispiel-Mappen. Administratoren installieren sie unter **Werkbank → Pakete** aus dem offiziellen Katalog (siehe [Administratorhandbuch → Pakete](https://motom001.github.io/dms/admin/aktuell/pakete/)).

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
| `manifest.yaml` | `schema: 1` (Pflicht), Id, Name, Version (SemVer), Beschreibung, Autor, Lizenz, nötige DMS-Version (z. B. `">=0.63.0"`), Abhängigkeiten, `inhalt` mit den Pfaden der Inhaltsdateien (z. B. `mappentypen: inhalt/mappentypen.yaml`), optional `code` |
| `inhalt/mappentypen.yaml` | Mappentypen mit Feldern, Registern, Titel und Trefferliste |
| `inhalt/sichten.yaml` | Ansichten mit Elternansicht, Mappentypen und Bedingungen |
| `inhalt/beispiele.yaml` | optional: Beispiel-Mappen mit erfundenen Daten |
| `README.md`, `LICENSE`, `CHANGELOG.md` | Beschreibung, Lizenztext, Änderungen je Version |
| `tests/erwartung.yaml` | was nach der Installation da sein muss |

### Paket aus deinem DMS erstellen

Statt mit der Vorlage zu beginnen, kannst du Mappentypen und Ansichten, die du in einem DMS gebaut hast, unter **Werkbank → Pakete → Paket erstellen** exportieren (ab DMS 0.86.0, siehe [Administratorhandbuch → Paket aus deinem DMS erstellen](https://motom001.github.io/dms/admin/aktuell/pakete/#paket-aus-deinem-dms-erstellen)). Das Ergebnis ist ein ZIP mit einem Ordner `<id>/` im Format der Registry – `manifest.yaml`, `inhalt/mappentypen.yaml`, `inhalt/sichten.yaml`, ggf. `inhalt/beispiele.yaml`, `README.md` aus der Beschreibung, `CHANGELOG.md`, `LICENSE` mit dem vollen Lizenztext und `tests/erwartung.yaml`. Es besteht `werkzeuge/pruefen.py`; entpackt unter `pakete/` ist es ein fertiger Paketordner für einen Pull Request (README und Beschreibung lohnt es sich noch auszubauen).

So bildet der Export das DMS auf das Paketformat ab:

| Im DMS | Im Paket |
| --- | --- |
| eigener Mappentyp | Eintrag in `mappentypen.yaml`; Kennung aus der Kennung des Typs, bleibt über Versionen gleich (gemerkt) |
| Typ oder Ansicht aus einem installierten Paket | nicht kopiert, sondern `abhaengigkeiten: { <paket>: ">=<installierte Version>" }`, Verweise als `<paket>:<kennung>` |
| Verweis auf Benutzer, Rolle, Ablageort | `dms:benutzer`, `dms:rolle`, `dms:ablageort` (dann `dms` mindestens `>=0.75.0`) |
| Standard-Trefferliste | `trefferliste`; weitere Trefferlisten fehlen |
| Bedingung auf ein Feld | `{ feld, operator, wert }`, dynamische Werte (heute, ich …) als Objekt; Bedingungen auf Anzahlen, Favoriten, Fristen und auf feste Mappen fehlen |
| gewählte Beispiel-Mappen | `beispiele.yaml` mit `schluessel` und `{ beispiel: … }` für Verweise untereinander; ohne Passwörter, Dokumente und Verweise auf nicht gewählte Mappen |
| Nummernkreis am Feld, Berechtigungen, Archivmodus | fehlen (das Format kennt sie nicht); die Prüfung nennt sie |

## Paketformat (verbindlich)

Das Format beschreiben die JSON-Schemas in der Registry: [`schema/manifest.schema.json`](https://github.com/motom001/dms-registry/blob/main/schema/manifest.schema.json) und [`schema/inhalt.schema.json`](https://github.com/motom001/dms-registry/blob/main/schema/inhalt.schema.json). Die Vorlage zeigt jede Angabe mit Kommentar. Das DMS liest genau dieses Format:

- **Manifest:** `schema: 1` ist Pflicht; ein anderer Wert wird abgelehnt. `inhalt` nennt die Dateien mit `mappentypen`, `sichten` und `beispiele` (Pfade relativ zum Paketordner). Das Schema kennt außerdem `inhalt.rollen`; das DMS liest es nicht.
- **Kennungen** (`schluessel` bei Mappentypen und Ansichten, `key` bei Feldern und Registern) sind im Paket lokal. Das DMS legt Mappentypen als `<paket>_<schluessel>` an.
- **Felder** wie in der Werkbank: `key`, `label`, `typ` (text, langtext, formatiert, zahl, betrag, datum, janein, auswahl, referenz, passwort) und die üblichen Eigenschaften (`pflicht`, `eindeutig`, `hilfe`, `standard`, `minLen`, `maxLen`, `muster`, `min`, `max`, `nachkomma`, `waehrung`, `optionen`, `mehrfach`, `verweisart`, `frist`).
- **Verweise** (`ziel` bei Verweisfeldern, `quellen[].typ` bei Verknüpfungsregistern): `schluessel` für einen Mappentyp dieses Pakets, `<paket>:<schluessel>` für den Mappentyp eines anderen Pakets. Das andere Paket steht dann unter `abhaengigkeiten`. Mappentypen eines Pakets dürfen auch im Kreis aufeinander verweisen.
- **Verweise auf Mappentypen des DMS** (seit 0.75.0): `dms:ablageort` (Ablageort, z. B. für das Feld `verbleib_original` „Verbleib Originaldokumente“), `dms:benutzer` und `dms:rolle` (z. B. für „Verantwortlich“). Erlaubt in `ziel`, `quellen[].typ` und `typen` einer Ansicht. Andere Typen des DMS (z. B. Post) gehen nicht; die Id `dms` ist für Pakete gesperrt. Ein Paket mit solchen Verweisen gibt im Manifest `dms: ">=0.75.0"` an; ein älteres DMS lehnt es mit einer verständlichen Meldung ab. Die Vorschau zeigt die Typen als „Ablageort (aus dem DMS)“.
- **Ansichten:** `eltern` ist die lokale Kennung einer anderen Ansicht des Pakets. `bedingungen` sind `{ feld, operator, wert }` mit den Operatoren der Werkbank (`gleich`, `enthaelt`, `kleiner`, `groesser`, `zwischen`, `ausserhalb`, `imZeitraum`, `einerVon`, `zeigtAuf`, `leer`, `nichtLeer`, `ja`, `nein`); bei `zwischen` und `ausserhalb` ist `wert` eine Liste mit zwei Werten.
- **Beispiele:** `{ typ, werte }`; Beträge dürfen als Zahl stehen. Ab DMS 0.79.0 (#347) zusätzlich:
    - `schluessel` (optional, Kleinbuchstaben, Ziffern, `_`; eindeutig im Paket) – damit andere Beispiele auf diese Mappe zeigen können.
    - Ein Verweisfeld darf `{ beispiel: strom }` sein (bei `mehrfach` auch eine Liste davon), auf ein Beispiel einer **Abhängigkeit** mit Präfix: `{ beispiel: "basis:stadtwerke" }`.
    - Das DMS legt die Beispiele so an, dass Ziele vorher da sind; die Reihenfolge in der Datei ist egal. Kreise (A → B → A), unbekannte Schlüssel und Präfixe, die nicht unter `abhaengigkeiten` stehen, lehnt es beim Lesen ab.
    - Werden die Beispiele installiert, kommen auch die der Abhängigkeiten mit, die dabei neu installiert werden. Ist eine Abhängigkeit schon **ohne** Beispiele installiert, bleiben Verweise darauf leer; die Vorschau sagt das. Das DMS merkt sich die Mappen der Beispiele mit Schlüssel am installierten Paket (`beispiele`).
    - Beim Update entstehen keine Beispiele – wie bisher.
    - Pakete, die das nutzen, verlangen im Manifest `dms: ">=0.79.0"`.
- **Versionen:** `dms` und `abhaengigkeiten` nehmen Bereiche: `>=1.2.0`, `>1.2.0`, `1.2.0` bzw. `=1.2.0`, `^1.2.0` (gleiche Hauptversion), `~1.2.0` (gleiche Nebenversion), optional mit Obergrenze ` <2.0.0`. Bei `0.x` heißt `^` gleiche Nebenversion: `^0.63.0` passt nur zu 0.63.x. Für die DMS-Version deshalb `>=0.63.0` (bzw. die eigene Mindestversion) schreiben.

Bei einem **Update** ergänzt das DMS nur: neue Mappentypen, Felder, Register und Ansichten. Felder, Register oder Ansichten zu entfernen oder umzubenennen hat auf installierte DMS keine Wirkung – plane das Format deshalb vorher. Mappentypen und Ansichten, die ein Administrator gelöscht hat, legt ein Update nicht neu an.

## Einstellungen beschreiben

Braucht dein Paket (mit Code) Einstellungen, beschreibst du sie im Manifest unter `code.einstellungen` – eine eigene Oberfläche bringt ein Paket nicht mit. Das DMS zeigt das Formular, prüft und speichert die Werte (Teil der Sicherung) und gibt sie dem Paket.

```yaml
code:
  einstellungen:
    - abschnitt: Allgemein
      felder:
        - { schluessel: aktiv, name: Regeln automatisch anwenden, typ: janein, standard: true }
        - { schluessel: token, name: API-Schlüssel, typ: geheim, pflicht: true }
    - liste: regeln
      name: Regeln
      eintrag: Regel
      sortierbar: true
      felder:
        - { schluessel: absender, name: Absender enthält, typ: text }
        - { schluessel: ziel, name: Mappentyp, typ: mappentyp, pflicht: true }
  aktionen:
    - { schluessel: anwenden, name: Regeln jetzt auf neue Post anwenden, bestaetigen: true }
```

- Höchstens **zwei Ebenen**: Abschnitte (`abschnitt`, `hilfe`, `felder`) und Listen (`liste`, `name`, `eintrag`, `hilfe`, `sortierbar`, `felder`).
- **Typen:** `text`, `mehrzeilig`, `zahl` (`min`/`max`), `janein`, `datum`, `auswahl` und `mehrfachauswahl` (`optionen`), `geheim`, Verweise `mappentyp`, `feld` (mit `mappentyp:`), `benutzer`, `rolle`, `sicht`.
- **Werte**, wie das Paket sie bekommt: Abschnittsfelder unter ihrer Kennung, Listen als Liste von Objekten (mit `_id` je Eintrag). Verweise sind Ids (bei `feld`: `{ typ, feld }`), Geheimnisse im Klartext – nur für das eigene Paket.
- Zu `code` gehören außerdem `sprache`, `quelle`, `ereignisse`, `rechte` und `netz` (siehe [Pakete mit Code](pakete-code.md#im-manifest)); das Beispiel oben zeigt nur Einstellungen und Aktionen.
- **Zugangsdaten nur als `geheim`**, nie als `text` und nie mit `standard`.
- Bei einem **Update** bekommen neue Felder ihre Vorgabe, vorhandene Werte bleiben, wegfallende werden entfernt.

`werkzeuge/pruefen.py` prüft Kennungen, Vorgaben, Optionen, Geheimnisse und Verweise. Zum Ausprobieren eignet sich der Expertenmodus mit **Paket hochladen**.

Was das Paket mit den Einstellungen macht und welche Rechte es braucht, beschreibt [Pakete mit Code](pakete-code.md).

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

## Eigenes Paket testen

Bevor dein Paket in den Katalog kommt, probierst du es im eigenen DMS aus – am besten in einem Test-DMS (z. B. mit [Demo-Daten](https://motom001.github.io/dms/admin/aktuell/demo/)):

1. **Werkbank → Pakete → ▸ Expertenmodus** aufklappen.
2. Den Paketordner als ZIP packen, z. B. `cd pakete/mein_paket && zip -r ../../mein_paket.zip .`, und unter **Paket hochladen** wählen. Ein Ordner vor `manifest.yaml` (z. B. `mein_paket/manifest.yaml`) stört nicht. Das DMS prüft das Paket wie ein Katalogpaket und zeigt die Vorschau; Fehler im Format stehen dort gesammelt.
    - **Grenzen:** höchstens 10 MB als ZIP, entpackt höchstens 20 MB (ohne `code/`; dafür gelten 32 MB) und 500 Dateien. Ein hochgeladenes Paket bleibt 30 Minuten zum Installieren bereit; danach erneut hochladen.
3. Installieren (Herkunft bestätigen), ansehen, ändern. Für ein Update die **Version erhöhen** und erneut hochladen – das DMS aktualisiert wie bei einem Update aus dem Katalog (nur ergänzen). Zum Neuanfang das Paket entfernen (geht, solange es keine Mappen seiner Mappentypen gibt).

Mehrere Pakete testest du auch als eigenen Katalog: `python3 werkzeuge/katalog.py <ordner>` baut `katalog.json` und die Archive; leg den Ordner auf einen HTTPS-Server und trage die Adresse von `katalog.json` im Expertenmodus unter **Weitere Quellen** ein.

## Ausblick

- **Pakete mit Code** gibt es seit 0.88.0: WebAssembly-Module, die auf Ereignisse reagieren und mit bestätigten Rechten über die API arbeiten – siehe [Pakete mit Code](pakete-code.md).
