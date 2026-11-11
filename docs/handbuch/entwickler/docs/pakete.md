# Pakete entwickeln

Pakete erweitern Ablago um fertige Mappentypen, Ansichten und Beispiel-Mappen. Administratoren installieren sie unter **Werkbank → Pakete** aus dem offiziellen Katalog (siehe [Administratorhandbuch → Pakete](https://help.ablago.app/admin/aktuell/pakete/)).

## Wo Pakete liegen

Alle offiziellen Pakete liegen im Repository **[motom001/dms-registry](https://github.com/motom001/dms-registry)**, ein Ordner je Paket unter `pakete/<id>/`. Dort gelten dieselben Regeln wie in Ablago: erst ein Issue als User Story, umgesetzt wird nach dem Label `freigegeben`. Die Regeln für Pakete (Lizenzen, Verbotenes, Namen) stehen in [REGELN.md](https://github.com/motom001/dms-registry/blob/main/REGELN.md).

## Paketarten und gleiche Kennungen { #paketarten }

Bevor du ein Paket anlegst, klär seine **Art** – die Regeln dazu stehen in [REGELN.md, „Paketarten“](https://github.com/motom001/dms-registry/blob/main/REGELN.md#paketarten) (dms-registry #157):

- **Grundlagen-Paket** Basis (Organisation, Person, Ablageort) – immer dabei, alle Vorlagen-Pakete hängen davon ab.
- **Vorlagen-Pakete** bringen Mappentypen, Ansichten und Automatisierungen für einen Bereich (Haushalt, Fahrzeuge, Verträge, Rechnungen). Sie dürfen Code mitbringen, der **nur ihre eigenen Mappentypen** pflegt, z. B. Status und Fristen berechnen.
- **Funktions-Pakete** bringen Code für alle Mappen, aber keine Mappentypen (Texterkennung, PDF/A, KI).
- **Ergänzungen** erweitern genau ein anderes Paket (`ergaenzt`) und ändern weder dessen Typen noch Rechte.
- **Sprachen** und **Automatisierungs-Pakete** bringen nur Texte bzw. nur Automatisierungen.

Zwei Regeln halten die Pakete zusammen:

- **Ein Mappentyp lebt in genau einem Paket.** Andere Pakete verweisen darauf (`vertraege:vertrag`) und nennen es unter `abhaengigkeiten`.
- **Gleiche Kennungen für gleiche Bedeutung** – `von`, `an`, `betrag`, `datum`, `betrifft`, `steuerjahr`, `zustaendig`, `verbleib_original` … (Liste in [REGELN.md, „Gleiche Kennungen“](https://github.com/motom001/dms-registry/blob/main/REGELN.md#gleiche-kennungen)). Dann zeigen Trefferlisten und Ansichten über mehrere Mappentypen dieselben Spalten. Die Beschriftung darf je Typ sprechen („Anbieter“, „Rechnungssteller“), die Kennung nicht. `pruefen.py` weist bei neuen Feldern auf Abweichungen hin. Die Post in Ablago hält sich daran (seit 0.242, #1042): `von` (Text) und `an` (Verweis auf einen Benutzer). Die Erkennung nutzt beide in Mappentypen (#1043): Ein Verweisfeld `von` (Aussteller) bekommt nie eine eigene Organisation oder Person des Haushalts – nur bei einem ausgehenden Beleg als Vorschlag mit Hinweis –, `an` (Empfänger) bleibt bei eingehenden Belegen leer.
  - **Wie Ablago Spalten zusammenführt:** Eine Ansicht mit mehreren Mappentypen zeigt die Spalten einer Trefferliste, die **jeder** Typ unter derselben Kennung hat (Pakete: `standard`), und davon nur Felder, die es in jedem Typ mit **gleicher Kennung und gleicher Feldart** gibt (bei Verweisen zählt die Feldart, nicht das Ziel); sonst nur die Systemspalten. Bedingungen und die erweiterte Suche über mehrere Typen verlangen bei Verweisen zusätzlich **dieselben Zieltypen**. Die Beschriftung zählt nie – nur die Kennung. Ein `von` als Text (Post) und ein `von` als Verweis (Vertrag) sind deshalb keine gemeinsame Spalte.

**Text-Vorlagen** (z. B. ein Kündigungsschreiben) bringt ein Paket nur als Markdown unter `inhalt/vorlagen/` mit: kein HTML, keine Bilder, Links nur `https:`, keine Passwortfelder als Platzhalter. `pruefen.py` lehnt anderes ab, und Ablago prüft beim Installieren dasselbe (#1038, #1040).

## Ein Paket anlegen

```sh
git clone https://github.com/<du>/dms-registry && cd dms-registry
werkzeuge/neues-paket.sh mein_paket "Mein Paket"   # kopiert vorlage/ nach pakete/mein_paket/
```

Dann ausfüllen:

| Datei | Inhalt |
| --- | --- |
| `manifest.yaml` | `schema: 1` (Pflicht), Id, Name, Version (SemVer), Beschreibung, Autor, Lizenz, nötige Ablago-Version (z. B. `">=0.63.0"`), Abhängigkeiten, `inhalt` mit den Pfaden der Inhaltsdateien (z. B. `mappentypen: inhalt/mappentypen.yaml`), optional `code` |
| `inhalt/mappentypen.yaml` | Mappentypen mit Feldern, Registern, Titel und Trefferliste |
| `inhalt/sichten.yaml` | Ansichten mit Elternansicht, Mappentypen und Bedingungen |
| `inhalt/beispiele.yaml` | optional: Beispiel-Mappen mit erfundenen Daten |
| `inhalt/beispiele/…` | optional (ab Ablago 0.223.0): Beispiel-Dokumente zu den Beispiel-Mappen (PDF, PNG, JPEG), nur erfundene Inhalte |
| `inhalt/vorgaben.yaml` | optional (dms #1038): Vorgaben – Mappen zum Behalten mit fester Kennung, z. B. Vertragsarten |
| `inhalt/vorlagen/…` | optional (dms #1038): Text-Vorlagen der Vorgaben, schlichtes Markdown (`.md`) |
| `inhalt/wortlisten.yaml` | optional (ab Ablago 0.127.0): Gruppen gleichbedeutender Wörter für die Suche |
| `inhalt/automatisierungen.yaml` | optional (ab Ablago 0.177.0): vorgefertigte Automatisierungen, nach der Installation aus – außer den angehakten (seit 0.233.0 mit `eingeschaltet: true` vorausgewählt) |
| `README.md`, `LICENSE`, `CHANGELOG.md` | Beschreibung, Lizenztext, Änderungen je Version |
| `tests/erwartung.yaml` | was nach der Installation da sein muss |

### Paket aus deinem Ablago erstellen { #paket-aus-deinem-dms-erstellen }

Statt mit der Vorlage zu beginnen, kannst du Mappentypen und Ansichten, die du in einem DMS gebaut hast, unter **Werkbank → Pakete → Paket erstellen** exportieren (ab Ablago 0.86.0, siehe [Administratorhandbuch → Paket aus deinem Ablago erstellen](https://help.ablago.app/admin/aktuell/pakete/#paket-aus-deinem-dms-erstellen)). Das Ergebnis ist ein ZIP mit einem Ordner `<id>/` im Format der Registry – `manifest.yaml`, `inhalt/mappentypen.yaml`, `inhalt/sichten.yaml`, ggf. `inhalt/beispiele.yaml`, `README.md` aus der Beschreibung, `CHANGELOG.md`, `LICENSE` mit dem vollen Lizenztext und `tests/erwartung.yaml`. Es besteht `werkzeuge/pruefen.py`; entpackt unter `pakete/` ist es ein fertiger Paketordner für einen Pull Request (README und Beschreibung lohnt es sich noch auszubauen).

**Mindestversion beim Erstellen (dms #651):** „Paket erstellen“ ermittelt die nötige Ablago-Version selbst – `mindestversion()` in `server/src/paketerstellung.ts`. Grundlage ist 0.86.0 (seit dem gibt es „Paket erstellen“); jede benutzte Funktion aus `MINDEST_FUNKTIONEN` kann sie anheben: Verweise auf Mappentypen von Ablago (0.75.0), Verweise zwischen Beispielen (0.79.0), `erkennung` an Feldern (0.113.0), `format`, `landFeld` und Datumsgrenzen `min`/`max` (0.121.0), Beispiel-Dokumente (0.223.0), Feldarten `zeitraum` und `prozent` und `negativ` an Beträgen (`FELDARTEN_AB`, #1035), Feldart `tabelle` (`DMS_TABELLE_AB`, #1030), `vorbelegen` an Verweisfeldern (`DMS_VORBELEGEN_AB`, #1037), `gehoertZu` (`DMS_TEILE_AB`, #1031), „zeigt auf die Vorgabe“ in Anzeige-Bedingungen (`DMS_VORGABEN_AB`, #1038), Feldart `zusammengesetzt` (`DMS_ZUSAMMENGESETZT_AB`, #1050), `archiv` am Mappentyp (`DMS_ARCHIV_PAKET_AB`, #1051), `merkmal`, `schreibschutz` und „zeigt auf eine eigene Organisation“ (`DMS_ORGANISATION_AB`, #995). Zur Auswahl stehen dann `>=X.Y.0` von der Mindestversion bis zur eigenen Version (`dmsOptionen()`; Minor-Versionen, die es nie gab, fehlen). **Bringt das Paketformat etwas Neues, das „Paket erstellen“ mitnimmt, gehört es in `MINDEST_FUNKTIONEN`** – mit Test in `server/test/paketerstellung.test.ts`. Die Lizenz ist eine freie aus der Positivliste, eine eigene (`LicenseRef-<Name>`, Text als `LICENSE`) oder keine (`NONE`); Ablago installiert alle drei, `pruefen.py` lässt in den Katalog nur die Positivliste.

So bildet der Export Ablago auf das Paketformat ab:

| In Ablago | Im Paket |
| --- | --- |
| eigener Mappentyp | Eintrag in `mappentypen.yaml`; Kennung aus der Kennung des Typs, bleibt über Versionen gleich (gemerkt) |
| Typ oder Ansicht aus einem installierten Paket | nicht kopiert, sondern `abhaengigkeiten: { <paket>: ">=<installierte Version>" }`, Verweise als `<paket>:<kennung>` |
| Verweis auf Benutzer, Rolle | `dms:benutzer`, `dms:rolle` (dann `dms` mindestens `>=0.75.0`) |
| Verweis auf den Ablageort | `basis:ablageort` mit `abhaengigkeiten: { basis: ">=1.6.0" }` (seit 0.212; `dms:ablageort` ist ein veralteter Alias) |
| Ansicht auf einen eigenen, nicht gewählten Typ (#656) | `fremde_typen: [{ kennung, name }]` an der Ansicht – Kennung des Typs (bzw. `<paket>:<kennung>`, wenn er in einem früher exportierten Paket steckt); dann `dms` mindestens `>=0.178.0` |
| Standard-Trefferliste | `trefferliste`; weitere Trefferlisten fehlen |
| Symbol der Ansicht (#428) | `symbol` an der Ansicht |
| Bedingung auf ein Feld | `{ feld, operator, wert }`, dynamische Werte (heute, ich …) als Objekt; Bedingungen auf Anzahlen, Favoriten, Fristen und auf feste Mappen fehlen |
| gewählte Beispiel-Mappen | `beispiele.yaml` mit `schluessel` und `{ beispiel: … }` für Verweise untereinander; ohne Passwörter und Verweise auf nicht gewählte Mappen |
| ihre Dokumente (nur mit „Mit ihren Dokumenten“, #878) | PDF, PNG und JPEG unter `inhalt/beispiele/beispiel_<n>/`, im Beispiel unter `dokumente` mit `titel` (Name in Ablago), `datum` und `register`; andere Dateiarten bleiben mit Hinweis draußen; dann `dms` mindestens `>=0.223.0` |
| Archivmodus (dms #1051) | `archiv: { jahre, stichtag, leererStichtag }` am Mappentyp – Stichtag nur, wenn sein Feld mitkommt; dann `dms` mindestens `>=0.237.0` |
| Nummernkreis am Feld, Berechtigungen | fehlen (das Format kennt sie nicht); die Prüfung nennt sie |

## Paketformat (verbindlich)

Das Format beschreiben die JSON-Schemas in der Registry: [`schema/manifest.schema.json`](https://github.com/motom001/dms-registry/blob/main/schema/manifest.schema.json) und [`schema/inhalt.schema.json`](https://github.com/motom001/dms-registry/blob/main/schema/inhalt.schema.json). Die Vorlage zeigt jede Angabe mit Kommentar. Ablago liest genau dieses Format:

- **Manifest:** `schema: 1` ist Pflicht; ein anderer Wert wird abgelehnt. `inhalt` nennt die Dateien mit `mappentypen`, `sichten`, `beispiele`, `wortlisten` und `automatisierungen` (Pfade relativ zum Paketordner). Das Schema kennt außerdem `inhalt.rollen`; Ablago liest es nicht.
- **Symbol einer Ansicht** (dms #428): `symbol: <name>` an einer Ansicht in `sichten.yaml`, ein Lucide-Name aus der festen Liste in [`shared/src/ansichtsymbole.ts`](https://github.com/motom001/dms/blob/main/shared/src/ansichtsymbole.ts) (z. B. `house`, `car`, `euro`, `heart-pulse`, `mail`). Die Liste gehört zur Ablago-Version; Namen werden nie umbenannt oder entfernt, nur ergänzt. Einen unbekannten Namen (Paket für eine neuere Version) liest Ablago als „ohne Symbol“, ohne Fehler.
- **Unbekannte Felder** (dms #635): Felder, die Ablago nicht kennt, ignoriert es – im Manifest (oben und in Unterabschnitten wie `autor`, `inhalt`, an Mappentypen, Ansichten und Beispielen), in `katalog.json` und im Verzeichnis einer Sammeldatei. So brechen neue optionale Felder (z. B. `symbol`, `kuerzel`, `kategorien`) ältere Ablago nicht; neue Felder sind deshalb immer optional. Abgelehnt wird nur ein anderes Format: `schema` bzw. `format` ungleich 1. Die Signatur gilt weiter über die rohen Bytes von `katalog.json`, unbekannte Felder eingeschlossen. Der Test `server/test/unbekannte-felder.test.ts` hält das fest.
- **Paket-Id** (`id`, dms #1084): Kleinbuchstaben, Ziffern und `_`, beginnt mit einem Buchstaben, 2 bis 40 Zeichen – z. B. `haus_und_garten`. Dazu darf **ein** Punkt mit einem Zusatz (bis 20 Zeichen) stehen: `<hauptpaket>.<zusatz>`, z. B. `texterkennung.fra`. Der Punkt heißt „ergänzt das Hauptpaket“ – ein solches Paket muss `ergaenzt: <hauptpaket>` angeben (siehe *Ergänzungen*), sonst lehnt Ablago es ab. `dms` ist vergeben. Ids mit Punkt kennt Ablago ab 0.229.0; solche Pakete geben `dms: ">=0.229.0"` an.
- **Kennungen** (`schluessel` bei Mappentypen, Ansichten, Automatisierungen und Beispielen, `key` bei Feldern und Registern) sind im Paket lokal, bis 60 Zeichen. Ablago speichert Paket und Schlüssel getrennt; nach außen heißt ein Mappentyp aus einem Paket überall **`paket:schluessel`** – wie in Verweisen, z. B. `basis:person` (bis 0.228 `basis_person`; das war doppeldeutig, weil Paket `haus` + Typ `garten_pflanze` und Paket `haus_garten` + Typ `pflanze` dieselbe Kennung ergaben). Die Grenzen sind keine technischen – Kennungen sind Text, Mappentypen hängen per uuid zusammen –, sie halten Links, Dateinamen und Anzeigen lesbar. `shared/src/kennungen.ts` hält alle Muster an einer Stelle.
- **Herausgeber** (`herausgeber`, dms #1084): wer das Paket herausgibt, als umgedrehte Domain – Kleinbuchstaben, Ziffern und Bindestriche, mindestens zwei Teile, z. B. `org.example`; die offiziellen Pakete haben `app.ablago`. Ablago zeigt ihn neben dem Namen („Verträge · app.ablago“) und lehnt Installation und Update ab, wenn dieselbe Id schon von einem **anderen** Herausgeber installiert ist. `app.ablago` (auch `app.ablago.*`) nimmt Ablago nur aus dem offiziellen Katalog, aus einer Sammeldatei mit dessen Signatur oder als Datei, deren Prüfsumme dort steht. Höchstens 64 Zeichen, nur ASCII, kein Punycode (`xn--`). Andere Herausgeber zeigt Ablago als „nicht geprüft“, außer aus einem weiteren signierten Katalog – dann bindet es sie an dessen Schlüssel. Ergänzungen mit Punkt müssen denselben Herausgeber haben wie ihr Hauptpaket; Abhängigkeiten zählen nur vom selben Herausgeber oder vom Projekt. Pakete ohne `herausgeber` gelten als vom Herausgeber ihres Katalogs: aus dem offiziellen `app.ablago`, sonst unbekannt – dann gilt wie bisher, dass Updates nur aus derselben Quelle kommen; der erste angegebene Herausgeber gilt von da an. Ältere Ablago ignorieren das Feld.
- **Ersetzte Ids** (`ersetzt`, dms #1084): Benennt ein Paket seine Id um, nennt es die alte(n) unter `ersetzt` (Text oder Liste, höchstens 5). Nur ein Update aus derselben, mindestens gleich vertrauenswürdigen Quelle und vom selben, bekannten Herausgeber zieht die Installation dann um – derselbe Eintrag mit Mappentypen, Mappen, Einstellungen, Code, Ereignissen und Automatisierungen, nur unter neuer Id; ein zweites Paket entsteht nicht. Im Katalog steht `ersetzt` am Paket. So ziehen die Zusatzsprachen von `texterkennung_fra` auf `texterkennung.fra` um.
- **Umbau** (`umbau`, dms #1041): Ein Update kann vorhandene Mappentypen **umbauen** – etwa wenn Haushalt Vertrag und Versicherung an das Paket Verträge abgibt (dms-registry #163). `umbau` im Manifest ist eine Liste von Schritten:

    ```yaml
    umbau:
      - von: haushalt:vertrag            # Typ, dessen Mappen umziehen (paket:schluessel; ohne Präfix ein früherer eigener Typ)
        nach: vertrag                    # Zieltyp: eigener Schlüssel oder paket:schluessel einer Abhängigkeit
        felder: { vertragspartner: von, kuendigungsfrist: kuendigungsfrist }   # alt → neu
      - von: haushalt:versicherung
        nach: vertrag
        felder: { versicherer: von, versicherungsnummer: vertragsnummer, beitrag: betrag }
        setzen: { art: { vorgabe: versicherung } }                             # fester Wert in leere Felder
        register: { unterlagen: dokumente }                                    # Dokumente: Register alt → neu
      - von: vermietung:mietvertrag
        nach: vertrag
        felder: { mietart: art }                                               # Auswahl → Verweis über den Titel (#1125)
        setzen: { kuendigungsfrist: { anzahl: 3, einheit: monate } }          # Zeitraum (#1125), auch P3M
    ```

    - **Übernehmen oder zusammenlegen:** Gibt es den Zieltyp noch nicht, **übernimmt** der erste Schritt dorthin den alten Typ mit seiner Id – Ansichten, Rechte-Regeln, KI-Zulassung, Automatisierungen und Direktlinks hängen an der Id und bleiben. Sonst werden die Typen **zusammengelegt**: Die Mappen wechseln mit ihrer Id in den Zieltyp, Verweisfelder, Verknüpfungsregister, Tabellen, Ansichten und Automatisierungen zeigen danach auf ihn, der leere alte Typ verschwindet (liegen noch Mappen im Papierkorb, bleibt er als eigener Typ).
    - **Werte:** `felder` ordnet alte Feldkennungen neuen zu; mehrere alte auf ein neues führen zusammen (der erste gefüllte Wert gilt). Passt ein Wert nicht zur neuen Feldart, versucht Ablago es: Text → Zeitraum („3 Monate“; „3 Monate zum Ende der Laufzeit“ als Vorschlag), Text → Zahl, Betrag, Datum oder Auswahl, Zahl ↔ Betrag, alles → Text. Verweise nur auf Mappen, die das neue Feld erlaubt. Was nicht passt, keine Zuordnung hat oder nur ungefähr passt, steht danach in einer **Notiz** an der Mappe – nichts geht verloren (Passwörter nie in einer Notiz). Jede Mappe bekommt einen Eintrag in der Historie („Umgebaut durch Paket Verträge 1.0.0“).
    - **`setzen`** schreibt feste Werte in leere Felder des Zieltyps – Text, Zahl, Ja/Nein, Liste oder `{ vorgabe: … }` (eine Vorgabe (dms #1038), z. B. die Vertragsart „Versicherung“). Seit dms #1125 auch einen **Zeitraum** `{ anzahl, einheit }` (Einheit `tage`, `wochen`, `monate`, `jahre`); in ein Feld der Art Zeitraum geht er auch als Text (`P3M`, „3 Monate“). Ein Zeitraum in ein anderes Feld oder ein Text, der kein Zeitraum ist, ist ein Fehler mit Stelle (beim Lesen bzw., für Zieltypen einer Abhängigkeit, in der Vorschau).
    - **Auswahl → Verweis** (dms #1125): Ordnet `felder` eine Auswahl (oder einen Text) einem Verweisfeld zu, sucht Ablago unter den Zieltypen des Verweises die Mappe mit **diesem Titel** – Haushalt-„Art“ = „Strom“ → Vertragsart „Strom“ (ohne Groß- und Kleinschreibung, auch über die Beschriftung der Option, also „Electricity“ in einer englischen Ablago). Dazu zählen Vorgaben, die dasselbe Update anlegt. Gibt es keine oder mehrere Mappen mit dem Titel, **bleibt das Feld leer** und der Wert steht in der Notiz; Ablago legt **nie** Mappen dafür an. Die Vorschau nennt die Werte ohne passende Mappe. Bringe für die üblichen Werte also Vorgaben mit (oder lege sie mit einem früheren Update an).
    - **Ansichten** (dms #1125): Ansichten über den alten Typ zeigen danach auf den Zieltyp. Beim Zusammenlegen zeigt so eine Ansicht dann **alle** Mappen des Zieltyps („Versicherungen“ zeigt alle Verträge), und Bedingungen auf Felder, die nicht mitkommen, bleiben stehen und treffen nicht mehr zu – die Vorschau sagt beides je Ansicht. Bring deshalb im Paket, dem die Ansicht gehört, eine neue Fassung mit (z. B. Haushalt 2.0.0: `typen: ["vertraege:vertrag"]` mit Bedingung). Ansichten aus Paketen haben einen **Prüfwert** (wie Vorgaben): Ein Update ersetzt eine Ansicht durch die Fassung im Paket, solange der Administrator sie nicht geändert hat (siehe [Paketformat](#paketformat-verbindlich), Update). Was der Umbau an einer Ansicht ändert, gilt dabei nicht als Änderung.
    - **Änderungen des Administrators** erkennt Ablago am Paketstand des alten Typs: Felder, die er angelegt oder deren Art er geändert hat, sind Rückfragen in der Vorschau (als eigenes Feld behalten, in die Notiz, in ein Feld des Zieltyps). Ohne Antwort auf jede Rückfrage kein Umbau.
    - **Rechte:** Beim Zusammenlegen gelten für die umgezogenen Mappen die Rechte-Regeln des alten Typs weiter – Ablago stellt sie den Regeln des Zieltyps voran, für Mappen mit dem nur lesbaren Feld `umbau_aus` (dem alten Typ). War der alte Typ für KI-Dienste gesperrt bzw. einem Paket verwehrt, gilt das danach auch für den Zieltyp. Fragt eine Regel ein Feld ab, das nicht mitkommt, oder würde der Archivmodus lockerer, lehnt die Vorschau den Umbau ab.
    - **Grenzen (Sicherheit):** Ein Schritt fasst nur Typen desselben, bekannten Herausgebers an; Ziel ist ein Typ dieses Pakets oder einer Abhängigkeit, nie `dms:`. Den alten Typ bringt das Paket nicht mehr mit. Ein Schritt, dessen alter Typ fehlt, entfällt – ein zweites Update baut nichts zweimal um.
    - **Ausführen:** nur einzeln (nicht im Ablauf mehrerer Pakete), nur „Gesamte Verwaltung“ mit frischer Anmeldung und `umbauBestaetigt`; „Vorher sichern“ ist vorausgewählt. Alles läuft in **einer Transaktion** – bricht etwas ab, ist nichts verändert.
    - Pakete, die Typen abgeben, bekommen eine **Major-Version** (Breaking Change im CHANGELOG). Ältere Ablago übergehen `umbau`; Pakete damit verlangen `dms: ">=0.243.0"` (`DMS_UMBAU_AB`, endgültige Version beim Einreihen). `setzen` mit Zeitraum und Auswahl → Verweis kennt Ablago ab `DMS_UMBAU_ZUORDNUNG_AB` (`>=0.248.0`, endgültige Version beim Einreihen) – davor bleibt ein solches Feld leer und der Wert steht in der Notiz; das Ersetzen unveränderter Ansichten gilt ab derselben Version für jedes Update.
- **Ansichten mit `fremde_typen`** (ab Ablago 0.178.0, #656): Mappentypen, die das Paket nicht mitbringt, nennt eine Ansicht mit ihrer Kennung (`kennung`, wie `schluessel` eines Mappentyps in Ablago, also `paket:schluessel` für Typen aus Paketen) und einem Namen für Meldungen. Ältere Pakete mit der Form `<paket>_<schluessel>` ordnet Ablago über die installierten Pakete zu (nicht am Unterstrich). In einer Sammeldatei ist ein Typ, der sich weder installiert noch in der Datei findet, ein Fehler mit Ansicht und Typ – die Sammeldatei wird dann nicht installiert (#1084). Ablago ordnet sie beim Installieren dem Typ mit dieser Kennung zu. Gibt es ihn nicht, kommt die Ansicht ohne ihn – fehlen alle ihre Typen, wird sie (mit ihren Unteransichten) übersprungen und die Vorschau sagt es vorher; das übrige Paket wird installiert. Eine spätere Version des Pakets legt übersprungene Ansichten an, sobald der Typ da ist.
- **Felder** wie in der Werkbank: `key`, `label`, `typ` (text, langtext, formatiert, zahl, betrag, datum, janein, auswahl, referenz, passwort, seit dms #1035 zeitraum und prozent, seit dms #1030 tabelle, seit dms #1050 zusammengesetzt) und die üblichen Eigenschaften (`pflicht`, `eindeutig`, `hilfe`, `standard`, `minLen`, `maxLen`, `muster`, `min`, `max`, `nachkomma`, `waehrung`, `negativ`, `optionen`, `mehrfach`, `verweisart`, `frist`, `erkennung`, `wiederfinden`, `format`, `landFeld`, `beschriftungen`).
- **Dokument übernehmen** (dms #937) am Mappentyp: `ausPost: true|false` („Kann aus Post angelegt werden“; fehlt = an bei Typen mit Dokumentenregister) und `erkennbarAn` („Woran man ihn erkennt“, ein kurzer Satz, höchstens 300 Zeichen, z. B. „Enthält Rechnungsnummer, Betrag und Zahlungsziel; Absender ist ein Vertragspartner“; Übersetzungen unter `beschriftungen.<sprache>.erkennbarAn`). Bei einem Update übernimmt Ablago beides nur, wenn der Administrator es noch nicht eingestellt hat. Ältere Ablago ignorieren die Angaben; „Paket erstellen“ übernimmt sie.
- **Beschriftungen je Sprache** (dms #728): Am Mappentyp, an Feldern, Registern und Ansichten darf `beschriftungen` stehen – Sprache → Texte. Der Ausgangstext (`name`, `label`, `hilfe`, `beschreibung`) ist Deutsch. Bei Auswahlfeldern sind die Einträge in `optionen` die **festen Werte**, die in den Mappen stehen; ihre Beschriftung je Sprache steht unter `beschriftungen.<sprache>.optionen` (fester Wert → Text). Ohne Beschriftung zeigt Ablago den festen Wert – deshalb funktionieren ältere Pakete mit reinen Textoptionen (`optionen: [Strom, Gas]`) unverändert: Jede Option ist ihr eigener fester Wert. Für einen sprachneutralen Wert gibt `beschriftungen.de.optionen` den deutschen Text. Gibt ein Paket `beschriftungen.de.label` (bzw. `name`, `hilfe`, `beschreibung`) an, gilt das als Ausgangstext. Sprachkennungen wie `en`, `tr`, `pt-BR`; was nicht passt, lässt Ablago weg. Bei einem Update ergänzt Ablago Beschriftungen an vorhandenen Typen, Feldern und Registern nur dort, wo der Administrator noch nichts beschriftet hat; die Vorschau nennt die Anzahl. Ältere Ablago ignorieren die Angabe, ein höheres `dms` ist nicht nötig. Beispiel:

    ```yaml
    - key: art
      label: Art
      typ: auswahl
      optionen: [strom, gas, wasser]
      beschriftungen:
        de: { optionen: { strom: Strom, gas: Gas, wasser: Wasser } }
        en: { label: Kind, optionen: { strom: Electricity, gas: Gas, wasser: Water } }
    ```

    Bedingungen von Ansichten und Automatisierungen sowie die Werte der Beispiele nennen immer den festen Wert (`wert: [strom]`). „Paket erstellen“ übernimmt die Beschriftungen mit.
- **Formate und Datumsgrenzen** (dms #535): Textfelder bekommen mit `format` eine Prüfung – `email`, `telefon`, `internetseite`, `iban` oder `plz`. Bei `plz` nennt `landFeld` die Kennung des Felds mit dem Land (Text oder Auswahl im selben Mappentyp); steht dort Deutschland oder nichts, sind genau 5 Ziffern Pflicht, sonst ist die PLZ frei. Datumsfelder bekommen mit `min` und `max` Grenzen: ein Datum (`2000-01-01`) oder `heute`, z. B. `max: heute` für einen Geburtstag. Beispiel: `- { key: plz, label: PLZ, typ: text, maxLen: 10, format: plz, landFeld: land }`. Neue und geänderte Werte müssen passen – auch die Beispiele des Pakets –, gespeicherte bleiben gültig. Bei einem Update übernimmt Ablago Format bzw. Grenzen an vorhandenen Feldern, an denen der Administrator weder Format noch Grenzen eingestellt hat; die Vorschau nennt sie. Ältere Ablago ignorieren die Angaben.
- **Zeitraum, Prozent, negative Beträge** (dms #1035): `typ: zeitraum` (Zahl und Einheit) und `typ: prozent` (Zahl, `min`/`max`/`nachkomma` wie bei `zahl`); `negativ: true` nur an `betrag` erlaubt negative Beträge (fehlt = ≥ 0). In `beispiele.yaml` steht ein Zeitraum als `{ anzahl: 3, einheit: monate }` (Einheiten `tage`, `wochen`, `monate`, `jahre`) oder kurz als `P3M`, Prozent als Zahl (`19`), ein Standardwert als `P3M` bzw. `19`. Beispiel: `- { key: kuendigungsfrist, label: Kündigungsfrist, typ: zeitraum, standard: P3M }`. Ablago vor 0.227 machten aus unbekannten Feldarten Text – das Paket braucht deshalb `dms: ">=0.227.0"`; ab jetzt lehnt Ablago unbekannte Feldarten beim Lesen des Pakets mit einer Meldung ab. Ein Update kann `negativ` an einem vorhandenen Betrag einschalten (die Vorschau nennt es unter „Format bzw. Grenzen“), nie aus.
- **Tabelle** (dms #1030): `typ: tabelle` zeigt zwischen den Feldern die Mappen eines anderen Typs, die über ein Verweisfeld hierher verweisen – etwa die Positionen einer Rechnung. Pflicht ist `quelle: { typ, feld }`: `typ` ein Typverweis wie bei `ziel` (eigener Typ oder aus einer Abhängigkeit, nie `dms:`), `feld` die Kennung des Verweisfelds dort, das auf diesen Typ zeigt (`ziel` oder `zielOptional`); dazu optional `trefferliste: standard` (Pakete bringen je Typ nur eine Trefferliste mit; ihre Spalten zeigt die Tabelle, Passwortfelder nie) und `neu` (Beschriftung von „+ Neu“, höchstens 40 Zeichen, z. B. „+ Position“; andere Sprachen unter `beschriftungen.<sprache>.neu`). Eine Tabelle hat keinen eigenen Wert: nicht in `beispiele.yaml`, nicht in `trefferliste` oder `titelVorlage`, nie `pflicht` oder `berechnet`. Beispiel aus dem Paket Rechnungen: `- { key: positionen, label: Positionen, typ: tabelle, quelle: { typ: rechnungsposition, feld: rechnung, trefferliste: standard, neu: "+ Position" } }`. Beim Lesen prüft Ablago `quelle`; zeigt sie auf einen Typ dieses Pakets, muss es das Feld dort geben und es muss hierher verweisen. Beim Installieren legt Ablago die Tabelle nach ihrer Quelle an (wie Verweise auf Typen, die erst entstehen); beim Entfernen gehen Tabelle und Verweis zusammen. Paket braucht `dms: ">=0.232.0"` (ältere lehnen die Feldart ab). Summen rechnet die Tabelle nie – das macht ein Paket mit Code (berechnete Felder, Hinweise).
- **Zusammengesetzt** (dms #1050): `typ: zusammengesetzt` mit `vorlage` (Pflicht, höchstens 300 Zeichen) – Platzhalter und Filter wie `titelVorlage`, aus Feldern desselben Typs der Arten text, zahl, betrag, prozent, datum, zeitraum, janein, auswahl und referenz; gern mit `eindeutig: true` für eine Kombination. Beispiel aus dem Entwurf Compliance: `- { key: kennung, label: Kennung, typ: zusammengesetzt, vorlage: "{bereich} · {zeitraum}", eindeutig: true }`, aus Rechnungen „Rechnungsnummer je Absender“: `vorlage: "{von} · {rechnungsnummer}"`. Nie `pflicht`, nie `berechnet`, kein `standard`; `vorlage` an einer anderen Feldart lehnt Ablago ab, ebenso unbekannte oder ungeeignete Platzhalter. **Die Kennung setzt das Paket nicht:** Ablago berechnet den Wert bei jedem Speichern (auch über die Schnittstelle) aus den Teilen und übergeht, was ein Paket dafür schickt; nicht in `beispiele.yaml`. Gespeichert wird ein Schlüssel ohne Sprache (Datum `JJJJ-MM-TT`, Auswahl als fester Wert, Verweise als Mappen-Id, nie ein Titel); bei Doppelung antwortet `POST`/`PUT /api/v1/mappen` mit **422**, die Meldung steht in `details.felder` am ersten beteiligten Feld. Wer liest, bekommt den Schlüssel in `werte` und baut den Text aus `vorlage`, den Werten und `bezuege`. Paket braucht `dms: ">=0.239.0"` (`DMS_ZUSAMMENGESETZT_AB`; ältere lehnen die Feldart ab). Ein Update, das die Vorlage ändert, rechnet die Mappen neu; gleiche Kombinationen passen danach nicht (ohne Rückfrage, wie beim Einschalten von `eindeutig`).
- **Ist Teil einer anderen Mappe** (dms #1031): `gehoertZu: <feld>` am Mappentyp – die Kennung des Verweisfelds dieses Typs, über das jede Mappe zu ihrer übergeordneten gehört (Schreibweise wie im Entwurf des Pakets Rechnungen, dort `gehoertZu: rechnung` an der Rechnungsposition). Das Feld ist ein Verweis mit genau einem Ziel (`ziel` ohne Liste, ohne `zielOptional`), ohne `mehrfach`, mit `pflicht: true` und ohne `anzeigen`; zeigt es auf einen Typ dieses Pakets, darf der nicht selbst `gehoertZu` haben (keine Ketten). Solche Mappen (Teile) erscheinen nur an der übergeordneten Mappe – meist über eine Tabelle – und über direkte Links, nicht in Ansichten, Suche, „+ Neu“ und *Wohin gehört das?*; Funde in ihnen zählen als Treffer der übergeordneten Mappe. Ausblenden ist kein Schutz: Über die Schnittstelle, den Export und direkte Links bleiben Teile erreichbar – Rechte setzt der Administrator. Ablago prüft `gehoertZu` beim Lesen und beim Installieren (wie die Einstellung in der Werkbank); beim ersten Installieren setzt es sie, sobald das Feld angelegt ist, bei einem Update nur, wenn der Typ noch eigenständig ist (ausschalten kann nur der Administrator). Ältere Ablago ignorieren `gehoertZu` – dort stehen die Teile in den Ansichten. „Paket erstellen“ übernimmt die Einstellung und hebt die Mindestversion (`DMS_TEILE_AB`).
- **Archivmodus** (dms #1051): `archiv: { jahre, jahreBeruflich?, stichtag?, leererStichtag? }` am Mappentyp, Schreibweise wie im Entwurf des Pakets Compliance (`archiv: { jahre: 2, jahreBeruflich: 10, stichtag: abgeloest_am, leererStichtag: laeuftNicht }`). `jahre` und `jahreBeruflich` sind ganze Zahlen von 1 bis 30, `jahreBeruflich` gilt mit dem Merkmal „beruflich genutzt“ (dms #1032) und ist nicht kürzer als `jahre`; `stichtag` nennt ein Datumsfeld dieses Typs (ohne: Anlagedatum); `leererStichtag` ist `anlage` (Vorgabe) oder `laeuftNicht` – dann läuft die Frist erst, wenn der Stichtag gefüllt ist, und die Mappe bleibt bis dahin gesperrt; nur mit `stichtag`. Es ist eine **Vorgabe für Typen, die das Paket neu anlegt:** Die Vorschau beim Installieren zeigt sie, danach ändert sie der Administrator am Mappentyp. **Vorhandene Typen ändert ein Paket nie** – weder die Installation noch ein Update setzt, verkürzt, lockert oder schaltet den Archivmodus eines vorhandenen Typs aus, auch nicht eines Typs desselben Pakets; was der Administrator eingestellt hat, bleibt. Ablago prüft `archiv` beim Lesen wie `pruefen.py` (unbekannte Angaben, Zahlen, Stichtag, `leererStichtag` nur mit `stichtag`); ein Fehler verhindert die Installation. Ältere Ablago ignorieren `archiv`. „Paket erstellen“ übernimmt den Archivmodus (ohne `jahreBeruflich`, das gibt es am Typ nicht) und hebt die Mindestversion (`DMS_ARCHIV_PAKET_AB`).
- **Aus Dokument füllen** (`erkennung`, dms #336/#391; bis 0.216 „Für die Erkennung nutzen“): `erkennung: {}` markiert ein Feld, das „Aus Dokument ausfüllen“ füllen darf; optional `art` (`name`, `vorname`, `nachname`, `funktion`, `nummer`, `iban`, `ustid`, `email`, `internet`, `telefon`, `mobil`, `fax`, `strasse`, `hausnummer`, `plz`, `ort`, `datum`, `betrag`, `zeitraum`, `prozent`, `verweis`, `auswahl` – passend zur Feldart) und `hinweis` (höchstens 300 Zeichen, z. B. „Muster 100-####“). Nur bei text, langtext, zahl, betrag, datum, auswahl, referenz, zeitraum und prozent; ältere Ablago ignorieren die Angabe. Bei einem Update übernimmt Ablago die Markierung an vorhandenen Feldern, an denen der Administrator nichts eingestellt hat.
- **Zum Wiederfinden nutzen** (`wiederfinden`, dms #938): `wiederfinden: true` an Text-, Zahl- und Verweisfeldern – über diese Werte findet Ablago vorhandene Mappen in Dokumenten wieder (Kundennummer am Vertragspartner, Vertragsnummer und Vertragspartner am Vertrag, Rechnungsnummer an der Rechnung, Kennzeichen am Fahrzeug); unabhängig von `eindeutig`. **Fehlt die Angabe**, leitet Ablago sie wie bisher ab: an bei Feldern mit `erkennung`, deren Art ein Merkmal ist (Nummer, IBAN, USt-IdNr., E-Mail, Internet, Telefon, Mobil, Fax, Name). Wer das nicht will, schreibt `wiederfinden: false`. Bei einem Update setzt Ablago den Haken an vorhandenen Feldern nur bei ausdrücklichem `true` und nur, wo er noch fehlt. Ältere Ablago ignorieren die Angabe.
- **Abschnitte im Feldregister** (`abschnitte`, dms #890): an einem Register mit `art: felder` eine Liste `[{ vor: <feld>, titel?, eingeklappt?, beschriftungen? }]`. Ab dem Feld `vor` (ein Feld dieses Registers, je Feld höchstens ein Abschnitt) beginnt eine neue Zeile; mit `titel` (höchstens 80 Zeichen, Übersetzungen unter `beschriftungen.<sprache>.titel`) zeigt die Mappe eine Überschrift, mit `eingeklappt: true` ist der Abschnitt beim Öffnen zu (nur mit `titel`). Ohne `titel` nur ein Zeilenumbruch. Beispiel: `abschnitte: [{ vor: geburtstag }, { vor: iban, titel: Bankverbindung, eingeklappt: true, beschriftungen: { en: { titel: Bank details } } }]`. Nur Darstellung – die Feldliste bleibt. Ungültige Einträge (Feld fehlt, doppelt) lässt Ablago weg. Bei einem Update übernimmt Ablago Abschnitte nur an Registern, die noch keine haben; die Vorschau nennt sie. Ältere Ablago ignorieren die Angabe; „Paket erstellen“ übernimmt sie.
- **Ausblenden** (`ausgeblendet`, dms #655): `ausgeblendet: true` an einem Feld oder Register (nicht bei `art: dokumente`, nicht bei Registern mit Systemfeldern) – die Mappe zeigt es nicht, Werte bleiben, ein ausgeblendetes Feld ist nie Pflicht. Gilt nur beim **ersten Installieren**: Ein Update ändert das Ausblenden vorhandener Felder und Register nicht, und was ein Update neu bringt, ist sichtbar. „Paket erstellen“ übernimmt es. Ältere Ablago ignorieren die Angabe.
- **Verweise** (`ziel` bei Verweisfeldern, `quellen[].typ` bei Verknüpfungsregistern): `schluessel` für einen Mappentyp dieses Pakets, `<paket>:<schluessel>` für den Mappentyp eines anderen Pakets. Das andere Paket steht dann unter `abhaengigkeiten`. Mappentypen eines Pakets dürfen auch im Kreis aufeinander verweisen.
- **Mehrere Zieltypen** (dms #1036): `ziel` darf eine **Liste** sein – `ziel: [vertrag, fahrzeuge:fahrzeug]`; ein einzelner Typ bleibt ein Text wie bisher. Mit `mehrfach: true` hält `gleicherTyp: true` alle gewählten Mappen beim selben Typ. `aus_text` geht nur mit genau einem Zieltyp. Ältere Ablago lehnen eine Liste als ungültigen Verweis ab; setze `dms:` auf die Version, mit der mehrere Zieltypen kamen (siehe Neuigkeiten), damit sie es verständlich ablehnen.
- **Optionale Zieltypen** (`zielOptional`, dms #1036): Typen eines anderen Pakets, von denen dieses Paket **nicht** abhängt, als `<paket>:<schluessel>` – etwa die Rechnung, die auch ein Fahrzeug *betrifft*, wenn das Paket Fahrzeuge da ist (Fahrzeuge hängt selbst von Rechnungen ab). Ablago nimmt jeden davon in die Zieltypen auf, sobald es ihn gibt – beim Installieren und später, wenn das andere Paket installiert wird; fehlt er, bleibt das Feld ohne ihn (nie ein Fehler, keine Abhängigkeit). Ein Verweisfeld darf **nur** `zielOptional` haben (z. B. *Steuerjahr* im Haushalt); dann sagt das Formular, dass die Typen mit einem anderen Paket kommen. Eigene Typen und `dms:` gehören unter `ziel`. Ein Update ergänzt `zielOptional` an vorhandenen Feldern (nie gekürzt); neue feste `ziel` an vorhandenen Feldern übernimmt es nicht. „Paket erstellen“ schreibt optionale Ziele wieder als `zielOptional`. Beispiel:

    ```yaml
    - { key: betrifft, label: betrifft, typ: referenz, mehrfach: true, ziel: [vertrag], zielOptional: [fahrzeuge:fahrzeug, wohnen:wohnung] }
    ```

    In Anzeige-Bedingungen („zeigt auf eine Mappe vom Typ …“, `art: verweistyp` und `op: zeigtAufTyp`) darf ein Ziel aus `zielOptional` stehen, auch wenn sein Paket fehlt (dms #1122): Das ist kein Fehler, die Bedingung trifft dann nie zu (mit `nicht: true` immer). Kommt das Paket später, gilt sie ab dann. `zeigtAufTyp` geht mit `zielOptional` auch, solange erst ein Zieltyp da ist. Ein Typ, der weder unter `ziel` noch unter `zielOptional` des Felds steht, bleibt ein Fehler.

    Die Reihenfolge der Mappentypen im Paket und der Pakete untereinander spielt beim Installieren keine Rolle (dms #1122): Verweise, Tabellen, Anzeige-Bedingungen und Quellen von Verknüpfungsregistern, die auf etwas zeigen, das erst später entsteht, legt Ablago im zweiten Durchgang an – Quellen über `zielOptional` (etwa *Fahrzeug → Rechnungen* über *Betrifft* der Rechnung) erst, wenn das Feld des anderen Pakets auf den neuen Typ zeigt. Was sich am Ende nicht anlegen lässt, etwa eine Quelle über ein Feld, das nicht auf diesen Typ zeigt, bricht die Installation mit Mappentyp, Register und Quelle ab – nichts fällt still weg.
- **Beim Auswählen übernehmen** (`vorbelegen`, dms #1037): an einem Verweisfeld eine Liste von Paaren `[{ von, nach }]` – `von` ein Feld des Zieltyps, `nach` ein Feld dieses Typs. Wählt man eine Mappe, schlägt Ablago deren Werte in **leeren** Feldern vor (markiert „vorgeschlagen aus …“, änderbar, nie überschrieben; auch bei „Aus Dokument ausfüllen“ und „Dokument übernehmen“). Beispiel aus dem Entwurf Verträge:

    ```yaml
    - key: art
      typ: referenz
      ziel: vertragsart
      vorbelegen:
        - { von: kuendigungsfrist, nach: kuendigungsfrist }
        - { von: kuendigung_zum, nach: kuendigung_zum }
    ```

    Beim Lesen prüft Ablago: nur an `typ: referenz`; nur die Schlüssel `von` und `nach`; jedes `nach` einmal, ein Feld dieses Typs, nicht das Verweisfeld selbst, kein Passwort, keine Tabelle, nicht `berechnet`; für Zieltypen aus diesem Paket gibt es `von` dort, es ist kein Passwort und passt (gleiche Feldart, Text auch in Langtext, Mehrfachwerte nur in `mehrfach`-Felder, bei Auswahl jede Option auch im Ziel, bei Verweisen jedes Ziel). Zieltypen aus Abhängigkeiten prüft Ablago beim Anlegen des Mappentyps genauso; mit mehreren Zieltypen gilt ein Paar für jeden, der das Feld hat. Ein Update bringt die Paare an vorhandene Verweisfelder, an denen der Administrator keine eingestellt hat (in der Vorschau „Beim Auswählen übernehmen: …“). „Paket erstellen“ nimmt sie mit. Paket braucht `dms: ">=0.234.0"` – ältere Ablago übergehen die Angabe (der Verweis funktioniert, nur ohne Vorschläge). Die Werte holt Ablago immer mit den Rechten der Person, nie mit dem Konto eines Pakets, und gibt sie nie an ein KI-Paket.
- **Berechnet** (`berechnet: true`, dms #1034): Den Wert schreibt nur der Code dieses Pakets – in Ablago ist das Feld nur lesbar („berechnet von …“), jeder andere Schreiber bekommt 400 mit dem Paketnamen. Nur an Feldern eines Typs, den das Paket mitbringt; braucht Code mit `code.rechte.schreiben` auf diesen Typ, nie zusammen mit `pflicht`, nie bei `passwort` – sonst lehnt Ablago das Paket beim Installieren ab. Ein Update kann ein vorhandenes Feld neu berechnen oder es mit `berechnet: false` (bzw. ohne Angabe) wieder freigeben; der letzte Wert bleibt. Wie das Paket schreibt (schon beim Anlegen, Hinweise, Historie): [Berechnete Felder und Hinweise](pakete-code.md#berechnet-und-hinweise). Braucht `dms: ">=0.231.0"`. Beispiel:

    ```yaml
    - { key: kuendigen_bis, label: Kündigen bis, typ: datum, berechnet: true }
    ```
- **Eigene Organisation** (`merkmal: eigeneOrganisation`, `schreibschutz: verwaltung`, dms #995): Ein Ja/Nein-Feld mit `merkmal: eigeneOrganisation` sagt Ablago, welche Mappen die **eigene Organisation** sind (Paket Basis ab 1.7.0, Feld „Eigene Organisation“) – höchstens ein solches Feld je Mappentyp, nur `typ: janein`. `schreibschutz: verwaltung` (an jedem Feld außer Passwort und Tabelle) heißt: ändern nur im Verwaltungsmodus mit dem Bereich „Eigene Organisation“ oder mit einer dort freigegebenen Rolle; jeder andere Schreiber bekommt 403 – auch über die Schnittstelle, Pakete und Automatisierungen. Beides bringt nur das Paket mit; über die Werkbank lässt es sich weder setzen noch entfernen. Ablago liest die Angaben der eigenen Organisation **über die Bedeutung der Felder**, nicht über ihre Kennung: je Bedeutung (Name, Straße, Hausnummer, PLZ, Ort, E-Mail, Telefon; bei Personen Vor- und Nachname) das **erste** Textfeld mit `erkennung` und dieser Art in Registerreihenfolge – darum steht `name` vor `kuerzel` (auch Kürzel trägt `art: name`). Dazu die Verweisfelder mit den Kennungen `verantwortlicher` und `datenschutzbeauftragter` (eine Mappe, Person oder Organisation). Mehr liest Ablago mit Systemrechten nicht. Für Anzeige-Bedingungen gibt es `{ art: eigeneOrganisation, feld }` – ein Verweisfeld zeigt auf eine eigene Organisation (z. B. Abschnitt „Ausgangsrechnung“, wenn „Von“ wir sind). Braucht `dms: ">=0.238.0"` (`DMS_ORGANISATION_AB`). Beispiel aus Basis 1.7.0:

    ```yaml
    - { key: eigene_organisation, label: Eigene Organisation, typ: janein, standard: false, merkmal: eigeneOrganisation, schreibschutz: verwaltung }
    ```
- **Verweise auf Mappentypen von Ablago** (seit 0.75.0): `dms:benutzer` und `dms:rolle` (z. B. für „Verantwortlich“). Erlaubt in `ziel`, `quellen[].typ` und `typen` einer Ansicht. Andere Typen von Ablago (z. B. Post) gehen nicht; die Id `dms` ist für Pakete gesperrt. Ein Paket mit solchen Verweisen gibt im Manifest `dms: ">=0.75.0"` an; ein älteres Ablago lehnt es mit einer verständlichen Meldung ab. Die Vorschau zeigt die Typen als „Benutzer (aus Ablago)“.
- **Ablageort** (seit 0.212, Issue #883): Den Mappentyp bringt das Paket Basis ab 1.6.0 mit – Verweise heißen `basis:ablageort`, das Paket nennt `basis: ">=1.6.0"` unter `abhaengigkeiten` (z. B. für das Feld `verbleib_original` „Verbleib Originaldokumente“). Das frühere `dms:ablageort` gilt als **Alias** weiter und zeigt auf denselben Mappentyp (den von Basis bzw. den früheren Ablageort einer älteren Ablage); Vorschau und `pruefen.py` geben einen Hinweis „veraltet“. Der Alias entfällt mit Ablago 1.0. Gibt es keinen Ablageort, lehnt die Vorschau das Paket mit dem Hinweis auf Basis ab.
- **Ansichten:** `eltern` ist die lokale Kennung einer anderen Ansicht des Pakets. `bedingungen` sind `{ feld, operator, wert }` mit den Operatoren der Werkbank (`gleich`, `enthaelt`, `kleiner`, `groesser`, `zwischen`, `ausserhalb`, `imZeitraum`, `einerVon`, `zeigtAuf`, `zeigtAufTyp`, `leer`, `nichtLeer`, `ja`, `nein`); bei `zwischen` und `ausserhalb` ist `wert` eine Liste mit zwei Werten. `zeigtAufTyp` (dms #1036) nimmt eine Liste von Typverweisen (`wert: [fahrzeuge:fahrzeug]`) und geht nur bei Verweisfeldern mit mehreren Zieltypen; Typen eines nicht installierten Pakets fallen weg.
- **Bedingungen werden streng geprüft** (dms #1108): Anzeige-Bedingungen (`anzeigen` an Feldern und Abschnitten), Bedingungen von Ansichten und die Und-Karten von Automatisierungen liest Ablago beim Lesen und Installieren gegen das Format. Ist eine falsch geschrieben – unbekannte `art`, unbekannter Operator, ungültiger Wert, mehr als zehn Bedingungen an einer Stelle –, lehnt Ablago das Paket ab und nennt Typ, Feld bzw. Abschnitt (`register.vor`), die Nummer der Bedingung und den Grund, z. B. `mappentypen[1] „vertrag“: „verlaengerung_um“: anzeigen, Bedingung 1: In bedingung fehlt art: feld.` Bisher fiel so eine Bedingung still weg (das Feld war dann immer zu sehen). Eine Feldbedingung in `anzeigen` braucht das `art: feld` zweimal: `{ art: feld, bedingung: { art: feld, feld: verlaengerung, op: einerVon, wert: { art: fest, wert: [endet] } } }`; Ansichten schreiben `operator`, nicht `op`. Ob das genannte Feld zum Typ passt, prüft wie bisher das Anlegen des Mappentyps. Eingaben in der Werkbank betrifft das nicht – ihr Editor erzeugt nur gültige Bedingungen.
- **Beispiele:** `{ typ, werte }`; Beträge dürfen als Zahl stehen. Ab Ablago 0.79.0 (#347) zusätzlich:
    - `schluessel` (optional, Kleinbuchstaben, Ziffern, `_`; eindeutig im Paket) – damit andere Beispiele auf diese Mappe zeigen können.
    - Ein Verweisfeld darf `{ beispiel: strom }` sein (bei `mehrfach` auch eine Liste davon), auf ein Beispiel einer **Abhängigkeit** mit Präfix: `{ beispiel: "basis:stadtwerke" }`.
    - Ablago legt die Beispiele so an, dass Ziele vorher da sind; die Reihenfolge in der Datei ist egal. Kreise (A → B → A), unbekannte Schlüssel und Präfixe, die nicht unter `abhaengigkeiten` stehen, lehnt es beim Lesen ab.
    - Werden die Beispiele installiert, kommen auch die der Abhängigkeiten mit, die dabei neu installiert werden. Ist eine Abhängigkeit schon **ohne** Beispiele installiert, bleiben Verweise darauf leer; die Vorschau sagt das. Ablago merkt sich die Mappen der Beispiele mit Schlüssel am installierten Paket (`beispiele`).
    - Beim Update entstehen keine Beispiele – wie bisher.
- **Beispiel-Dokumente** (dms #878, dms-registry #137, ab 0.223.0): Ein Beispiel darf unter `dokumente` Dateien nennen, die im Paket unter `inhalt/beispiele/` liegen:

    ```yaml
    - typ: vertrag
      schluessel: heizung_wartung
      werte: { bezeichnung: Wartungsvertrag Heizung, partner: { beispiel: heizungsbau } }
      dokumente:
        - { datei: beispiele/heizung/wartungsvertrag.pdf, titel: Wartungsvertrag, datum: "2023-04-01" }
        - { datei: beispiele/heizung/rechnung-2026.png, register: rechnungen }
    ```

    - `datei` (Pflicht) ist relativ zu `inhalt/` und beginnt mit `beispiele/`; Ordner und Namen nur aus Buchstaben, Ziffern, `.`, `-` und `_`. Erlaubt sind **PDF, PNG und JPEG** – erkannt am Inhalt, die Endung muss passen (`.pdf`, `.png`, `.jpg`, `.jpeg`). Je Datei höchstens so groß wie ein hochgeladenes Dokument (100 MB); alle Dateien unter `inhalt/beispiele/` zusammen höchstens `PAKET_MAX` (128 MB). Sie zählen nicht zur Grenze von 20 MB für die übrigen Inhalte.
    - `titel` (optional, bis 200 Zeichen) ist der Name des Dokuments in Ablago; fehlt die Endung, hängt Ablago die der Datei an. Ohne `titel` gilt der Dateiname.
    - `datum` (optional, `JJJJ-MM-TT`) wird „hochgeladen am“. Ohne Datum gilt der Zeitpunkt der Installation.
    - `register` (optional) ist die Kennung eines Dokumentenregisters des Mappentyps; ohne Angabe das erste. Bei eigenen Mappentypen prüft Ablago das schon beim Lesen, bei Typen anderer Pakete beim Anlegen.
    - Ablago legt die Dokumente **wie beim Hochladen** an (`DokumenteDienst.ladeHoch`, Herkunft `paket`): Vorschau, Volltext und Archivfassung nach den Einstellungen der Ablage; PDFs liest nur der Arbeiter über `ladePdf()`. Mappen-Ereignisse und Automatisierungen bleiben still (`ohneEreignisse`, Frage 71); Pakete, die Dateien verarbeiten (`dokument.hochgeladen`, `volltext.fertig`), bekommen sie. Scheitert ein Dokument, ist das ganze Paket zurückgenommen – samt Dateien.
    - Am installierten Paket steht `beispielMappen`: je Beispiel Id, Prüfwert der Feldwerte und die Dokumente (`Id:sha256`). **Unverändert** ist ein Beispiel mit gleichen Feldwerten, denselben Dokumenten, ohne Notizen und ohne Verweis aus einer Mappe, die kein Beispiel ist. Nur solche entfernen „Beispiele entfernen“ (`POST /api/werkbank/pakete/{id}/beispiele/entfernen`) und das Entfernen des Pakets endgültig samt Dateien; geänderte bleiben und stehen in der Antwort bzw. in den Gründen.
    - Ältere Ablago übergehen `dokumente`; Pakete damit verlangen `dms: ">=0.223.0"`. Nur erfundene Inhalte – Persona-Namen, Beispiel-Domains (`example.org`), ungültige Beispielwerte für IBAN, Steuer- und Versichertennummern; `pruefen.py` prüft Pfade, Dateiarten und Größen (dms-registry #137).
    - Pakete, die das nutzen, verlangen im Manifest `dms: ">=0.79.0"`.
- **Vorgaben** (dms #1038): `inhalt.vorgaben` nennt eine Datei mit Mappen, die das Paket **zum Behalten** mitbringt – anders als Beispiele immer, ohne Haken, und sie bleiben. Schreibweise wie das Paket Verträge:

    ```yaml
    # inhalt/vorgaben.yaml
    - kennung: miete                 # fest, eindeutig im Paket
      typ: vertragsart               # eigener Typ oder paket:schluessel einer Abhängigkeit
      werte: { name: Miete, kuendigungsfrist: { anzahl: 3, einheit: monate }, kuendigung_zum: Monatsende }
      beschriftungen: { en: { name: Rent } }
      vorlagen:
        - { datei: vorlagen/kuendigung-miete.md, titel: Kündigung Mietvertrag, register: vorlagen }
    # Vorgabe eines anderen Pakets ergänzen: nur Vorlagen anhängen
    - ergaenzt: vertraege:miete
      vorlagen: [{ datei: vorlagen/garage.md, titel: Stellplatz kündigen }]
    ```

    - **Feste Kennung:** In Ablago heißt die Vorgabe `paket:<id>:<kennung>` (Spalte `vorgabe` der Mappe). Die Paket-Id gehört dazu: Ein Paket findet nur seine eigenen Vorgaben wieder, nie eine Mappe des Administrators oder die Vorgabe eines anderen Pakets – auch bei gleicher Kennung. Kennung wie ein Schlüssel (Kleinbuchstaben, Ziffern, `_`, bis 60 Zeichen), einmal vergeben nie umbenennen: Eine neue Kennung ist eine neue Vorgabe. Höchstens 200 Einträge.
    - **`typ`:** ein eigener Mappentyp oder `paket:schluessel` eines Pakets **unter `abhaengigkeiten`** (Fahrzeuge → Vertragsart „Pkw-Kaufvertrag“ in Verträge); nie `dms:`. Die Vorgabe bekommt die Rechte des Zieltyps wie jede Mappe.
    - **`werte`:** wie bei Beispielen (Beträge als Zahl, Zeiträume als `{ anzahl, einheit }`); keine Passwortfelder, keine Verweise auf Beispiele. Verweise auf Vorgaben gehen mit `{ vorgabe: miete }` bzw. `{ vorgabe: "vertraege:miete" }` – auch in `beispiele.yaml` (dort statt einer festen Id).
    - **`beschriftungen`:** Sprache → Feld → Text. Ablago legt die Vorgabe in der **Sprache der Installation** an (Felder ohne Übersetzung bleiben Deutsch); Werte sind Daten, sie wechseln nicht mit der Sprache der Person.
    - **`vorlagen`:** Text-Vorlagen unter `inhalt/vorlagen/` (Kleinbuchstaben, Ziffern, `-`, `_`, höchstens zwei Ordner, Endung `.md`), je Eintrag `datei` (Pflicht), `titel` (Name des Dokuments) und `register` (Dokumentenregister; ohne: `vorlagen`, sonst das erste). Höchstens 20 je Vorgabe. Platzhalter wie bei Automatisierungen (`{vertragsnummer}`, `{von.name}`); ausgefüllt werden sie mit „Text setzen“ (dms #1040, siehe [Text-Vorlagen schreiben](#text-vorlagen-schreiben)).
    - **Was eine Vorlage sein darf** (`server/src/pakete/vorlagen.ts`, dieselben Regeln in `pruefen.py`): UTF-8-Text ohne Steuerzeichen, höchstens `VORLAGE_MAX` (256 KB, `server/src/grenzen.ts`); **kein HTML** – auch keine Kommentare `<!-- -->` –, **keine Bilder** (`![…]`), Links nur `https://` (in `[Text](…)`, `[x]: …` und `<https://…>`; `http:`, `mailto:`, `javascript:`, `data:` stehen nirgends im Text); kein Platzhalter nennt ein **Passwortfeld**. Ablago prüft das beim Lesen und beim Installieren noch einmal (dann gegen die Passwortfelder aller Mappentypen).
    - **`ergaenzt: paket:kennung`:** An die Vorgabe eines Pakets unter `abhaengigkeiten` darf ein Paket **nur Vorlagen anhängen** – jede andere Angabe (`werte`, `beschriftungen`, Rechte …) lehnt Ablago ab. Gibt es die Vorgabe nicht (gelöscht), kommen die Vorlagen nicht; die Vorschau sagt es.
    - **Installieren:** ohne Ereignisse (Frage 71), Ersteller ist das Dienstkonto des Pakets (Historie: „Paket …“). Die Vorschau (`vorgaben`, `ergaenzungen`) zeigt je Vorgabe den Zustand; Vorgaben in fremden Typen und Ergänzungen stehen zusätzlich im Kasten „Ergänzt Mappen anderer Pakete“.
    - **Update:** Am installierten Paket steht je Kennung (`vorgaben`) die Mappe, der Prüfwert der Werte nach dem letzten Schreiben (`stand`) und der der Werte im Paket (`fassung`). Gleicht die Mappe `stand`, bekommt sie eine neue Fassung; sonst hat der Administrator sie geändert und sie bleibt (Vorschau: neue Fassung im Paket). Fehlt die Mappe, war sie gelöscht und bleibt es (`geloescht`). Vorlagen ersetzt ein Update nur, solange Vorgabe und Dokument unverändert sind; neue kommen dazu.
    - **Entfernen:** Benutzte Vorgaben (Verweise, Notizen, fremde Dokumente) bleiben; unbenutzte in eigenen Typen gehen mit, in fremden fragt Ablago (`409` mit `vorgaben`, dann `DELETE …?vorgaben=entfernen|behalten`). Vorlagen an Vorgaben anderer Pakete (`ergaenzungen`) gehen mit – nur sie. Was bleibt, behält die Kennung; eine neue Installation nimmt es wieder auf.
    - **Zur Laufzeit** ändert und löscht ein Paket (Dienstkonto) keine Vorgabe eines anderen Pakets und löscht keine Dokumente daran (403) – auch nicht mit Schreibrecht am Mappentyp.
    - **Anzeigen, wenn … zeigt auf die Vorgabe** (dms #1033): An Feldern und Abschnitten nennt `{ art: vorgabe, feld: art, vorgabe: [miete], nicht?: true }` eine bestimmte mitgelieferte Mappe über ihre Kennung (eigene oder `paket:kennung` einer Abhängigkeit); `feld` ist ein Verweisfeld. Beim Installieren macht Ablago daraus „zeigt auf“ mit der Id der Vorgabe; gelöschte zählen nicht. „Paket erstellen“ schreibt eine solche Bedingung wieder mit Kennung und trägt das Paket der Vorgabe als Abhängigkeit ein.
    - Ältere Ablago übergehen `inhalt.vorgaben`; Pakete damit verlangen `dms: ">=0.236.0"` (`DMS_VORGABEN_AB`).
- **Wortlisten** (dms #356, ab 0.127.0): `inhalt.wortlisten` nennt eine Datei mit Gruppen gleichbedeutender Wörter für die Suche – wer eines sucht, findet auch die anderen. Jede Gruppe ist `{ woerter: [Kfz, Auto, PKW] }` mit 2 bis 20 verschiedenen Wörtern (je 2 bis 60 Zeichen; Groß-/Kleinschreibung und Umlaute zählen beim Vergleich nicht); höchstens 1000 Gruppen je Paket. Ablago legt sie beim Installieren an, ersetzt sie beim Update durch die des Pakets und entfernt sie mit dem Paket; in der Werkbank unter **Suche** stehen sie zum Ansehen. Pakete mit Wortlisten verlangen `dms: ">=0.127.0"` – ältere Ablago übergehen den Abschnitt stillschweigend. Beispiel:

    ```yaml
    # inhalt/wortlisten.yaml
    - woerter: [Kfz, Auto, PKW, Fahrzeug]
    - woerter: [Nebenkosten, Betriebskosten]
    ```

- **Automatisierungen** (dms #712, dms-registry #108, ab 0.177.0): `inhalt.automatisierungen` nennt eine Datei mit vorgefertigten [Automatisierungen](https://help.ablago.app/admin/aktuell/automatisierungen/) – je Eintrag `schluessel` (fest, wie bei Typen), `name`, optional `beschreibung`, genau eine Wenn-Karte `wenn`, optional `und`, mindestens eine Karte in `dann`. Karten und Werte wie im Editor; Mappentypen als eigener Schlüssel oder `paket:typ` einer Abhängigkeit. **Feste Personen gibt es nicht** – Empfänger sind ein Feld (`{ art: feld, feld: verantwortlich, sonst: ersteller }`), oder der Ersteller der Mappe. Nach der Installation sind sie **aus**; beim Installieren fragt Ablago, welche gleich eingeschaltet werden. Seit 0.233.0 (#1082) kennzeichnet `eingeschaltet: true` die, die mit gesetztem Haken angeboten werden (abwählbar); nennt ein Paket `eingeschaltet` an keiner, sind wie bisher alle vorausgewählt. Ohne Angabe beim Installieren (API, Abhängigkeiten) gelten die mit `eingeschaltet: true`. An/aus einer schon installierten Automatisierung ändert kein Update. Die Dann-Karte `{ art: paket, aufgabe: … }` (*Paket nach Zeitplan ausführen*) ruft das Paket selbst – siehe [Nach Zeitplan rechnen](pakete-code.md#nach-zeitplan). Ein Update ersetzt nur unveränderte Automatisierungen, beim Entfernen des Pakets gehen unveränderte, ausgeschaltete mit. Ältere Ablago übergehen den Abschnitt; Pakete damit verlangen `dms: ">=0.177.0"`. Beispiel:

    ```yaml
    # inhalt/automatisierungen.yaml
    - schluessel: hu_bald
      name: HU wird bald fällig
      beschreibung: Einen Monat vor der Hauptuntersuchung bekommt der Verantwortliche eine Frist.
      wenn: { art: datum, typ: fahrzeug, feld: hu_faellig, vorlauf: 1, einheit: monate, uhrzeit: "07:00" }
      dann:
        - { art: aufgabe, als: aufgabe, empfaenger: [{ art: feld, feld: verantwortlich, sonst: ersteller }], text: "Für {kennzeichen} wird bald die HU fällig: {datum}." }
    ```

    Am Datumsfeld bleibt nur `frist` („ist eine Frist“: steht unter *Zu erledigen*, im Kalender und löst *Datum erreicht* aus). Seit 0.177.0 legt das Feld **keine Aufgaben mehr selbst an**; `frist.vorlauf`, `einheit`, `wiederholung` und `text` dienen nur noch als Vorgabe – erinnern soll eine mitgelieferte Automatisierung mit derselben Vorlaufzeit.
- **Abhängigkeiten** (`abhaengigkeiten: { <paket>: "<bereich>" }`): Pakete, die vorher installiert sein müssen. Beim Installieren kommen fehlende Abhängigkeiten im selben Ablauf mit – seit Ablago 0.151.0 (#405) auch solche **mit Code**: Der Administrator sieht die Rechte aller Pakete auf einer Seite und bestätigt sie einmal; jedes Paket behält sein eigenes Dienstkonto und seine eigenen Rechte. Ein Update, das die Rechte ändert, braucht wie bisher eine neue Bestätigung.
- **Ergänzungen** (`ergaenzt`, dms #405, ab 0.151.0): Ein Paket, das ein anderes erweitert – etwa eine Zusatzsprache der Texterkennung –, sagt das mit `ergaenzt`. Das ergänzte Paket muss auch unter `abhaengigkeiten` stehen. Die Installation zeigt Ergänzungen als **Häkchen unter dem ergänzten Paket** (beim ersten Installieren, im Einrichtungsassistenten, aus einer Sammeldatei und nachträglich am installierten Paket), gruppiert nach `gruppe` – ohne Gruppe unter „Ergänzungen“. Die Gruppe ist eine kurze Frage ohne Fragezeichen (höchstens 40 Zeichen), Ablago hängt „?“ an. Jede Ergänzung bleibt ein eigenes Paket mit eigener Version und eigenem Update. Ältere Ablago ignorieren das Feld; ein Paket braucht dafür kein höheres `dms`. Ohne `ergaenzt` erscheint ein abhängiges Paket nur als normales Paket in der Liste.

    ```yaml
    # manifest.yaml einer Zusatzsprache
    abhaengigkeiten:
      texterkennung: ">=2.0.0"
    ergaenzt: { paket: texterkennung, gruppe: Weitere Sprachen }   # oder kurz: ergaenzt: texterkennung
    # Seit #1084 mit Punkt in der Id (id: texterkennung.fra) und – beim Umzug – der früheren Id:
    ersetzt: texterkennung_fra
    ```

    Im Katalog steht die Angabe je Version (`versionen[].ergaenzt`, immer als `{ paket, gruppe }`). Ein Sammelpaket „alle Sprachen“ ohne eigenen Inhalt braucht es dafür nicht.
- **Versionen:** `dms` und `abhaengigkeiten` nehmen Bereiche: `>=1.2.0`, `>1.2.0`, `1.2.0` bzw. `=1.2.0`, `^1.2.0` (gleiche Hauptversion), `~1.2.0` (gleiche Nebenversion), optional mit Obergrenze ` <2.0.0`. Bei `0.x` heißt `^` gleiche Nebenversion: `^0.63.0` passt nur zu 0.63.x. Für die Ablago-Version deshalb `>=0.63.0` (bzw. die eigene Mindestversion) schreiben.

Bei einem **Update** ergänzt Ablago nur: neue Mappentypen, Felder, Register und Ansichten. Felder oder Register zu entfernen oder umzubenennen hat auf installierte Ablago keine Wirkung – plane das Format deshalb vorher. Mappentypen und Ansichten, die ein Administrator gelöscht hat, legt ein Update nicht neu an.

**Ansichten mit Prüfwert** (dms #1125, wie Vorgaben #1038): Ablago merkt sich je Ansicht eines Pakets, wie es sie geschrieben hat (Name, Beschreibung, Elternansicht, Mappentypen, Bedingungen, Trefferliste, Symbol – nicht Reihenfolge, Rechte an der Ansicht und Beschriftungen), und die Fassung im Paket. Bringt ein Update eine **neue Fassung** einer Ansicht mit, gilt:

| Ansicht in Ablago | Update |
|---|---|
| unverändert | wird durch die neue Fassung ersetzt – gleiche Ansicht (Id, Links, Rechte, Position), neuer Inhalt; den Namen behält sie, wenn es ihn unter derselben Elternansicht schon gibt |
| vom Administrator geändert | bleibt; die Vorschau sagt es und bietet „Trotzdem durch die Fassung im Paket ersetzen“ an (`sichtenErsetzen` mit den Schlüsseln) |
| vor 0.248 installiert (ohne Prüfwert) | entspricht sie der neuen Fassung, bekommt sie einen Prüfwert; sonst bleibt sie wie „geändert“ (mit derselben Wahl) |
| gelöscht | bleibt gelöscht |

Ändert ein Umbau (dms #1041) eine Ansicht, zieht ihr Prüfwert mit – sie gilt weiter als unverändert. Eine neue Fassung lohnt sich also, wenn sich Mappentypen oder Bedingungen einer Ansicht ändern (etwa nach einem Umbau); Umbenennen einer Ansicht erreicht so ebenfalls installierte Ablago, solange sie niemand geändert hat.

## Einstellungen beschreiben

Braucht dein Paket (mit Code) Einstellungen, beschreibst du sie im Manifest unter `code.einstellungen` – eine eigene Oberfläche bringt ein Paket nicht mit. Ablago zeigt das Formular, prüft und speichert die Werte (Teil der Sicherung) und gibt sie dem Paket.

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
- **Typen:** `text`, `mehrzeilig`, `zahl` (`min`/`max`, optional `schritt` und `vorschlaege`, siehe unten), `janein`, `datum`, `auswahl` und `mehrfachauswahl` (`optionen`), `geheim`, Verweise `mappentyp`, `feld` (mit `mappentyp:`), `benutzer`, `rolle`, `sicht`, und seit Ablago 0.124.0 `adresse` – die Dienst-Adresse, zu der allein das Paket ins Netz darf (ohne `standard`, höchstens mit `beispiel`; siehe [Pakete mit Code](pakete-code.md#im-manifest)).
- **Zahlen mit Vorschlägen** (#657): Eine `zahl` nimmt nur Ziffern (ggf. mit Komma) innerhalb von `min`/`max` an – geprüft im Formular und beim Speichern („Bitte eine Zahl zwischen 150 und 400.“). `schritt: 1` erlaubt nur ganze Zahlen. Mit `vorschlaege` zeigt Ablago eine Auswahl mit Beschriftung statt eines Zahlenfelds; „Eigener Wert …“ öffnet das Zahlenfeld. Jeder Vorschlag liegt in `min`/`max`, `standard` muss einer davon sein. Ältere Ablago-Versionen ignorieren `schritt` und `vorschlaege` und zeigen ein Textfeld.
  ```yaml
  - schluessel: dpi
    name: Auflösung (dpi)
    typ: zahl
    min: 150
    max: 400
    standard: 300
    vorschlaege:
      - { wert: 150, name: "gering – schneller, für klare Ausdrucke" }
      - { wert: 300, name: "normal – empfohlen" }
      - { wert: 400, name: "hoch – kleine Schrift, dauert länger" }
  ```
- **Typen:** `text`, `mehrzeilig`, `zahl` (`min`/`max`), `janein`, `datum`, `auswahl` und `mehrfachauswahl` (`optionen`), `geheim`, Verweise `mappentyp`, `feld` (mit `mappentyp:`), `benutzer`, `rolle`, `sicht`, und seit Ablago 0.124.0 `adresse` – die Dienst-Adresse, zu der allein das Paket ins Netz darf (ohne `standard`, höchstens mit `beispiel`; siehe [Pakete mit Code](pakete-code.md#im-manifest)).
- **Mehrfachauswahl für Verweise** (ab Ablago 0.179.0, #658): `mehrfach: true` an `mappentyp`, `benutzer`, `rolle` oder `sicht` zeigt das Feld wie ein Verweisfeld mit Mehrfachauswahl (suchen, Auswahl unter dem Feld, „Entfernen“); der Wert ist eine Liste von Ids. `schliesst_aus: <schlüssel>` nennt ein zweites Feld desselben Verweistyps im Abschnitt: Was in dem einen gewählt ist, bietet Ablago im anderen nicht an, und der Server lehnt dieselbe Id in beiden ab (z. B. „Nur diese Mappentypen“ ↔ „Diese Mappentypen ausschließen“). Eine **Liste mit genau einem Verweisfeld** (z. B. `liste: typen` mit `eintrag: Mappentyp`) zeigt Ablago ebenfalls so, ohne dass das Paket sich ändern muss – gespeichert bleibt die Liste. Macht ein Update aus so einer Liste ein Feld mit `mehrfach: true` unter demselben Schlüssel, übernimmt Ablago die gewählten Ids.
- **Pflicht:** `pflicht: true` verlangt einen Wert – im Formular und beim Speichern. Markiert wird das Gegenteil: Felder ohne `pflicht` zeigt Ablago mit „(optional)“ hinter dem Namen (nicht bei `janein`, ein Haken ist immer an oder aus); Pflichtfelder bekommen kein Sternchen.
- **Werte**, wie das Paket sie bekommt: Abschnittsfelder unter ihrer Kennung, Listen als Liste von Objekten (mit `_id` je Eintrag). Verweise sind Ids (bei `feld`: `{ typ, feld }`), Geheimnisse im Klartext – nur für das eigene Paket.
- Zu `code` gehören außerdem `sprache`, `quelle`, `ereignisse`, `rechte` und `netz` (siehe [Pakete mit Code](pakete-code.md#im-manifest)); das Beispiel oben zeigt nur Einstellungen und Aktionen.
- `code.aktionen` sind Knöpfe in den Einstellungen des Pakets (für die Verwaltung). Aktionen für das Menü **Mappe ▾** an Mappen stehen getrennt unter `mappenaktionen` (siehe [Aktionen im Menü „Mappe“](pakete-code.md#aktionen-im-menue-mappe)).
- **Zugangsdaten nur als `geheim`**, nie als `text` und nie mit `standard`.
- Bei einem **Update** bekommen neue Felder ihre Vorgabe, vorhandene Werte bleiben, wegfallende werden entfernt.

`werkzeuge/pruefen.py` prüft Kennungen, Vorgaben, Optionen, Geheimnisse und Verweise. Zum Ausprobieren eignet sich der Expertenmodus mit **Paket hochladen**.

Was das Paket mit den Einstellungen macht und welche Rechte es braucht, beschreibt [Pakete mit Code](pakete-code.md).

## Text-Vorlagen schreiben { #text-vorlagen-schreiben }

Aus einer Text-Vorlage macht Ablago mit **Text setzen** (dms #1040) einen Brief als PDF – in der Oberfläche über **Mappe ▾ → Brief aus Vorlage …**, für Pakete und Skripte über die API. Wie Vorlagen ins Paket kommen, steht oben unter *Vorgaben* (`vorlagen` an einer Vorgabe bzw. Ergänzung); was eine Vorlage sein darf, ebenda.

```markdown
# Kündigung Vertrag {vertragsnummer}

Sehr geehrte Damen und Herren,

hiermit kündige ich den Vertrag **{bezeichnung}** zum nächstmöglichen Termin, das ist der {kuendigen_bis}.
Kundennummer: {von.kundennummer}

Bitte bestätigen Sie mir die Kündigung schriftlich.

Mit freundlichen Grüßen



Muster ohne Gewähr, keine Rechtsberatung – im Zweifel fachlich prüfen lassen.
```

- **Aufbau des Briefs:** Briefkopf, Anschrift, Ort und Datum setzt Ablago – die Vorlage enthält nur Betreff und Text. Die **erste Überschrift** (`# …`) wird zum **Betreff** (fett, und der Titel des PDFs); ohne sie heißt das PDF wie die Vorlage. Der **Briefkopf** kommt von der Mappe im Verweisfeld `an` (Kunde; Person oder Organisation), sonst von der eigenen Organisation (#995, nur Name, Anschrift, Telefon, E-Mail); die **Anschrift** von der Mappe im Verweisfeld `von` (Gegenseite). Nimm darum die [gleichen Kennungen](#paketarten) `von` und `an`.
- **Markdown:** Überschriften (`#`, `##`, `###`), Absätze, Listen (`-`, `1.`), Zitate (`>`), **fett**, *kursiv*, `Code`. Ein einfacher Zeilenumbruch bleibt ein Zeilenumbruch (Grußformel, Anschrift im Text); **zwei und mehr Leerzeilen** lassen Platz, z. B. für die Unterschrift. Links erscheinen als Text mit der Adresse in Klammern – im PDF ist nichts anklickbar.
- **Platzhalter** wie bei Automatisierungen: `{feld}` für ein Feld der Mappe, `{verweis.feld}` für ein Feld der Mappe dahinter (bis drei Stufen, z. B. `{von.kundennummer}`), dazu `{heute}`, `{titel}` und `{mappentyp}`. Werte stehen im Format ihrer Feldart in der **Sprache der Vorlage** (Datum `31.12.2026`, Betrag `650,00 €`, Zeitraum `3 Monate`, Auswahl mit ihrer Beschriftung); Verweise als Titel der Mappe. **Freie Formate oder Ausdrücke gibt es nicht** (etwa `{datum:TT.MM.JJJJ}`) – nur die feste Liste der Feldarten.
- **Werte sind Text:** Ablago zerlegt erst die Vorlage und setzt dann die Werte ein – in einem Durchgang. Ein Feldwert wie `**fett**`, `[Link](…)` oder `{anderes_feld}` erscheint so, wie er ist. Im ausgefüllten Text (`.md` neben dem PDF) sind solche Zeichen mit `\` maskiert.
- **Lücken:** Fehlt ein Wert, darf die Person ihn nicht lesen (Mappe oder verwiesene Mappe; beim Herunterladen zusätzlich ohne Exportrecht E) oder nennt der Platzhalter ein Feld, das es nicht gibt, steht **[Beschriftung]** im Brief, z. B. „[Vertragsnummer]“. Passwortfelder sind als Platzhalter verboten – beim Installieren und vor jedem Satz geprüft.
- **Sprache:** die des Volltexts der Vorlage, wenn Ablago sie kennt, sonst die der Installation – nie die der Oberfläche. Sie steht als `/Lang` im PDF.
- **Grenzen** (`server/src/grenzen.ts`): ausgefüllter Text höchstens 512 KB (`TEXTSATZ_TEXT_MAX`), PDF höchstens 30 Seiten und 4 MB (`TEXTSATZ_SEITEN`, `TEXTSATZ_PDF_MAX`), Satz höchstens 30 Sekunden im Arbeiter (`TEXTSATZ_ZEIT_MS`). Darüber: 413.

**Für Pakete (API):** `GET /api/v1/mappen/{id}/vorlagen` nennt die Vorlagen einer Mappe (an ihr selbst und an Mappen, auf die sie verweist) mit dem Stand ihrer Platzhalter; `POST /api/v1/mappen/{id}/vorlagen/{dokument}/setzen` mit `{ "ziel": "ablegen", "register": "dokumente" }` legt PDF und ausgefüllten Text als neue Dokumente ab (Antwort: beide Dokumente und die Lücken), mit `{ "ziel": "herunterladen" }` kommt das PDF als Antwort. Das Dienstkonto braucht Lesen an der Mappe, für die Liste `dokumente: lesen`, zum Setzen `dokumente: schreiben` und Bearbeiten an der Mappe. Das PDF nennt in den Metadaten (Betreff) Paket und Vorlage. Mindestversion: `dms: ">=0.242.0"` (`DMS_TEXTSATZ_AB` in `shared/src/textsatz.ts`).

## Sprachpakete { #sprachpakete }

Weitere Sprachen für Ablago kommen als **Sprachpaket** (#731, ab Ablago 0.203.0): aus dem Katalog, über die Sammeldatei oder hochgeladen – wie jedes andere Paket, mit derselben Signatur und Herkunftsprüfung und derselben Größengrenze (128 MB, #644). Ein Sprachpaket bringt **nur Texte**: kein Code, keine Mappentypen, kein HTML.

```
sprache_fr/
  manifest.yaml
  README.md  LICENSE  CHANGELOG.md  tests/erwartung.yaml
  texte/<bereich>.json          Texte der Oberfläche, Meldungen und E-Mails – wie shared/src/sprachen/<sprache>/
  beschriftungen/<paket>.yaml   Beschriftungen der Standardpakete (optional)
```

```yaml
schema: 1
id: sprache_fr
name: Français
version: 1.0.0
beschreibung: Ablago auf Französisch.
autor: { name: Thomas Meissner, github: motom001 }
lizenz: Apache-2.0
dms: ">=0.203.0"
sprache:
  kennung: fr               # Sprachkennung wie fr oder pt-BR; Deutsch und Englisch sind eingebaut
  gebietsschema: fr-FR      # Datum, Zahlen, Beträge (fehlt: die Kennung)
  ablago: 0.203.0           # Ablago-Version, für die die Texte gemacht sind
  maschinell: true          # maschinell übersetzt → Hinweis in Mein Konto und im Katalog
  # geprueft_von: "@github-name"   # wer die Übersetzung geprüft hat (statt des Hinweises)
inhalt: {}
```

**Texte** (`texte/<bereich>.json`): flach wie die eingebauten Sprachdateien, dieselben Bereiche, Schlüssel und Platzhalter wie `shared/src/sprachen/de/` – am bequemsten übersetzt man die englischen Dateien (`en/`). Mehrzahl nach den Regeln der Sprache (`_one`, `_few`, `_many`, `_other` …); immer die vertraute Anrede (du, tu, je, ty …), eine förmliche Fassung gibt es nicht. Beim Installieren prüft Ablago jeden Text:

- **abgelehnt** wird das Paket bei Texten, die keine Zeichenkette sind, bei Steuerzeichen, bei mehr als 4000 Zeichen je Text oder 4 MB für alle Texte und bei **spitzen Klammern**, wo der deutsche Text keine hat – also bei HTML. Ablago setzt Texte nie als HTML, die Prüfung ist eine zweite Sicherung.
- **übergangen** werden Bereiche und Schlüssel, die es in dieser Version nicht gibt, und Texte mit Platzhaltern, die der deutsche Text nicht hat. An ihrer Stelle erscheint Englisch, die Vorschau nennt die Zahl. So bleibt ein Paket für eine ältere Version installierbar.
- **Dateien:** Nur `manifest.yaml`, README, LICENSE, NOTICE, CHANGELOG, `tests/`, `texte/*.json` und `beschriftungen/*.yaml`. Alles andere (`code/`, Bilder, Skripte) lehnt Ablago ab, ebenso `code`, `inhalt`-Einträge, `abhaengigkeiten` und `ergaenzt` im Manifest.

**Rückfall:** Fehlt ein Text, erscheint er auf Englisch, sonst auf Deutsch. Werkbank → Sprachen zeigt je Sprachpaket „Übersetzung 94 % vollständig“ (Anteil der deutschen Schlüssel dieser Version, Mehrzahlformen zählen einmal), für welche Version es gemacht ist und wie viele Personen es gewählt haben.

**Beschriftungen der Standardpakete** (`beschriftungen/<paket>.yaml`) – in der Sprache des Pakets, mit den Schlüsseln des Pakets (ohne Präfix):

```yaml
mappentypen:
  organisation:
    name: Organisme
    beschreibung: Entreprise, administration, cabinet médical …
    felder:
      name: { label: Nom }
      art: { label: Type, optionen: { Bank: Banque, Versicherung: Assurance } }   # fester Wert → Text
    register:
      stammdaten: { name: Données de base }
sichten:
  organisationen: { name: Organismes }
```

Ablago übernimmt sie beim Installieren des Sprachpakets für alle installierten Pakete und später beim Installieren oder Aktualisieren eines Pakets – nur, was dort in dieser Sprache noch fehlt (wie beim [Update eines Pakets](#paketformat-verbindlich), #728). Was der Administrator selbst beschriftet hat, bleibt. Ein Paket darf seine Beschriftungen auch selbst mitbringen (`beschriftungen` an Typ, Feld, Register und Ansicht); dann ergänzt das Sprachpaket nur, was fehlt.

**Im Kern:** `liesPaket()` liest den Abschnitt `sprache` (`server/src/pakete.ts`), die Regeln stehen in `shared/src/sprachpaket.ts`. Texte und Beschriftungen stehen in der Tabelle `paket_sprachen` (Migration 082, Spalten `texte` und `paketbeschriftungen`), der Paketeintrag in `pakete` mit `daten.sprache`. `server/src/sprachpakete.ts` trägt sie in jedem Prozess ein (beim Start, nach dem Installieren sofort, sonst mit der Einstellung `sprachen` jede Minute); die Oberfläche holt sie mit `GET /api/sprache/texte/<sprache>` (nur erlaubte Sprachen, auch vor der Anmeldung). **Entfernen** fragt nach, wenn jemand die Sprache gewählt hat oder sie die Sprache der Installation ist: Die Betroffenen sehen danach die Sprache der Installation (Deutsch, wenn es deren Sprache war); ihre Wahl bleibt gespeichert, Mein Konto weist sie darauf hin.

### Eine Sprache beitragen { #eine-sprache-beitragen }

Sprachpakete liegen wie alle Pakete in [motom001/dms-registry](https://github.com/motom001/dms-registry) unter `pakete/sprache_<kennung>/`. Die erste Welle ist **maschinell übersetzt** (`maschinell: true`) – jede Verbesserung hilft:

1. Issue „Übersetzung verbessern“ in der Registry öffnen (Vorlage) oder gleich einen Pull Request: Text in `texte/<bereich>.json` ändern, Version erhöhen (Patch), Eintrag im `CHANGELOG.md`.
2. Hast du eine Sprache durchgesehen, trägst du dich unter `sprache.geprueft_von` ein (GitHub-Name). Dann zeigen Ablago und der Katalog „Geprüft von …“ statt des Hinweises auf die maschinelle Übersetzung.
3. Neue Texte einer neuen Ablago-Version: `python3 werkzeuge/sprachen.py` in der Registry nennt je Sprache, was fehlt; `sprache.ablago` auf die neue Version setzen, wenn alles übersetzt ist.

Die CI der Registry prüft Schlüssel, Platzhalter und HTML wie Ablago und meldet je Sprache die Abdeckung gegen die neueste Ablago-Version.

## Prüfen

```sh
pip install pyyaml jsonschema
python3 werkzeuge/pruefen.py pakete/mein_paket      # Schema, Pflichtdateien, Verweise, Lizenz, Changelog
python3 werkzeuge/katalog.py --probe /tmp/katalog    # lässt sich der Katalog bauen?
```

Dieselben Prüfungen laufen im Pull Request. Ein veröffentlichtes Paket ändert sich nie: Jede Änderung braucht eine höhere Version und einen Eintrag im `CHANGELOG.md`.

## Pakete mit Ablago prüfen { #pakete-mit-ablago-pruefen }

`pruefen.py` prüft das Format; ob Ablago ein Paket wirklich installiert, zeigt erst der Installer. Den gibt es als Befehl `pakete-pruefen` im Image jeder Ablago-Version: Er liest die Paketordner (wie `liesPaket` beim Hochladen), packt sie wie die Registry und installiert sie mit dem echten Installer dieser Version in eine leere Ablage im Arbeitsspeicher – ohne Datenbank-Server, ohne Netz, ohne Konto.

```sh
docker run --rm -v "$PWD/pakete:/pakete:ro" ghcr.io/motom001/dms:<version> pakete-pruefen /pakete/basis /pakete/vertraege
docker run --rm -v "$PWD/pakete:/pakete:ro" ghcr.io/motom001/dms:<version> pakete-pruefen /pakete    # alle Pakete
```

- **Reihenfolge:** Die Ordner dürfen in beliebiger Reihenfolge stehen; Ablago installiert erst die Abhängigkeiten. Ein Ordner ohne `manifest.yaml`, aber mit Paketordnern darin (z. B. `pakete/`), steht für alle – im Container löst keine Shell ein `*` auf.
- **Update alt → neu:** Steht dieselbe Id in mehreren Versionen da, installiert Ablago die älteste und aktualisiert danach Version für Version; ein Paket mit `ersetzt` gilt als Update der ersetzten Id (Umzug). Dieselbe Version zweimal mit gleichem Inhalt zählt einmal, mit anderem Inhalt ist sie ein Fehler (Version erhöhen).
- **Ausgabe:** je Paket `OK` oder `FEHLER` mit den Gründen – dieselben Texte, die die Vorschau in Ablago zeigt –, darunter die Hinweise der Vorschau (sie machen nichts rot). Exit-Code 0, wenn alles in Ordnung ist, 1 bei mindestens einem Fehler, 2 bei einem falschen Aufruf.
- **Optionen:** `--ablago <version>` prüft die Angabe `dms` im Manifest gegen eine andere Version, `--ohne-beispiele` lässt die Beispiele weg (sonst installiert Ablago sie mit, wie das Häkchen in der Oberfläche), `--json` bzw. `--ergebnis <datei>` liefern das Ergebnis als JSON, `--sprache en` gibt alles auf Englisch aus.

Was der Befehl **nicht** prüft: die Herkunft (die Pakete stehen in einem Katalog im Arbeitsspeicher, der als offizieller gilt – Signatur und Bestätigungen entfallen), den Code (`code/modul.wasm` wird gespeichert, aber nicht ausgeführt; ohne gebautes Modul gibt es nur einen Hinweis) und Regeln, die nur PostgreSQL kennt. Die Ablage im Arbeitsspeicher ist dieselbe wie in den Server-Tests von Ablago; dort laufen die Installationen dieses Befehls zum Vergleich auch gegen PostgreSQL.

**In der CI von dms-registry** – Pakete einer festen Ablago-Version, im Pull Request auch das Update vom Stand auf `main` (unveränderte Pakete zählen einmal):

```yaml
      - name: Pakete mit Ablago prüfen
        run: |
          git worktree add -q "$RUNNER_TEMP/main" origin/main
          docker run --rm -v "$RUNNER_TEMP/main/pakete:/alt:ro" -v "$PWD/pakete:/neu:ro" \
            ghcr.io/motom001/dms:<version> pakete-pruefen /alt /neu
```

Ohne Docker, im Repo von Ablago: `npm ci && npm run build`, dann `node server/dist/pakete-pruefen.js <ordner…>` (oder während der Entwicklung `node --import tsx server/src/pakete-pruefen.ts <ordner…>`). Ablago selbst prüft so in jedem Pull Request alle Pakete aus `dms-registry` `main` gegen den eigenen Stand (Job `katalog-pakete`, nur Warnungen) – damit eine strengere Prüfung im Kern Katalog-Pakete nicht unbemerkt bricht.

## Pull Request und Katalog

1. Pull Request mit `Closes #…`; jeder Commit trägt ein `Signed-off-by:` (`git commit -s`).
2. Nach dem Merge baut die CI je Paketversion ein Archiv `<id>-<version>.zip` und den Katalog `katalog.json` mit SHA-256, signiert den Katalog (`katalog.sig`, siehe unten) und legt alles auf den Branch `gh-pages`. Ablago findet das Paket beim nächsten **Katalog abrufen**.

## Signierter Katalog { #signierter-katalog }

Ab Ablago 0.141.0 prüft Ablago, **woher** ein Katalog stammt (#594, Registry: motom001/dms-registry#74). Die Prüfsumme je Archiv belegt nur, dass ein Paket unterwegs nicht kaputtging; die Signatur über `katalog.json` belegt, dass der ganze Katalog – und damit jede Prüfsumme darin – vom Ablago-Projekt kommt.

- **Verfahren:** Ed25519 über die **exakten Bytes** von `katalog.json`. Ablago prüft mit `crypto.verify` aus Node, ohne weitere Abhängigkeit (`server/src/katalogsignatur.ts`).
- **`katalog.sig`** liegt neben `katalog.json`, getrennt, damit ältere Ablago-Versionen den Katalog unverändert lesen:

    ```json
    { "format": 1, "verfahren": "ed25519", "schluessel": "6d868387314e64df", "signatur": "<64 Bytes, Base64>", "erstellt": "2026-11-02T10:00:00Z" }
    ```

- **Kennung und Fingerabdruck** eines Schlüssels: SHA-256 über die 32 Bytes des öffentlichen Schlüssels, hexadezimal. Die Kennung sind die ersten 16 Zeichen, der Fingerabdruck alle 64 in Vierergruppen. `werkzeuge/signieren.py fingerabdruck <datei.pub>` in der Registry rechnet genauso.
- **Zwei Projektschlüssel:** Signierschlüssel (Secret in der CI der Registry) und Reserveschlüssel (offline beim Maintainer). Beide öffentlichen Schlüssel stehen fest in Ablago; gültig ist eine Signatur mit einem der beiden.
- **`erstellt`:** Ablago merkt sich je Katalog den neuesten gültig signierten Stand (Einstellung `paket_katalog_staende`, Teil der Sicherung) und lehnt online einen älteren ab – so lässt sich kein alter Katalog mit einer inzwischen behobenen Paketversion unterschieben. Eine Sammeldatei (ohne Internet) zeigt nur „Stand vom …“ und warnt ab 90 Tagen.
- **Übergang:** In 0.141.0 gibt es beim offiziellen Katalog ohne Signatur nur eine Warnung. Eine Minor-Version später **muss** er signiert sein (eigenes Issue). Eine **ungültige** Signatur zählt schon jetzt wie eine fremde Quelle: Die Herkunft muss bestätigt werden, und das Protokoll vermerkt es.
- **Weiterleitungen:** Beim Holen von Katalog, Signatur, Schlüssel und Archiven folgt Ablago Weiterleitungen nur auf `https://`-Adressen (höchstens fünf).

### Projektschlüssel austauschen { #projektschluessel-austauschen }

Die öffentlichen Schlüssel stehen an **einer** Stelle: `server/src/projektschluessel.ts`. Dort stehen die echten Schlüssel des Maintainers (`signier.pub` und `reserve.pub` aus motom001/dms-registry#74, `test: false`); ihre Fingerabdrücke stehen in `SECURITY.md`. Ablago 0.141.0 bis 0.144.1 hatten an dieser Stelle noch Testschlüssel.

| Schlüssel | Kennung | Fingerabdruck |
| --- | --- | --- |
| Signierschlüssel | `6d868387314e64df` | `6d86 8387 314e 64df 715c a3bd 9856 58d5 f888 c0ea 7cab ac91 a43f 9b99 6052 e728` |
| Reserveschlüssel | `4543c81b5ccf522d` | `4543 c81b 5ccf 522d f5a3 5e76 6660 8774 5f6c ae42 4722 3b6d 91c9 63cc 34b0 3954` |

Der Fingerabdruck ist SHA-256 über die **32 Bytes** des Schlüssels, nicht über die ganze DER-Datei (die 44 Bytes, die `openssl pkey -pubin -outform der` ausgibt). Wer `sha256sum` über die DER-Datei rechnet, bekommt einen anderen Wert.

**Tests** signieren nie mit den eingebauten Schlüsseln. Sie geben eigene Testschlüssel mit: `TEST_PROJEKT` aus `server/test/katalogschluessel.ts` als Option `projektSchluessel` an die `Paketverwaltung` bzw. an `projektSchluessel(TEST_PROJEKT)`. Diese Option setzt nur Code; im Betrieb gibt es dafür **keine** Umgebungsvariable und keine Einstellung – sonst ließe sich ein fremder Schlüssel als „Ablago-Projekt“ einschmuggeln. Mit Testschlüsseln zeigt die Vorschau „prüft noch mit Testschlüsseln“ (`test: true`). Der Test „Projektschlüssel“ prüft, dass die eingebauten Schlüssel keine Testschlüssel sind, dass ihre Fingerabdrücke genau so in `SECURITY.md` und `SECURITY.en.md` stehen und dass ein mit Testschlüsseln signierter Katalog im Betrieb als ungültig gilt.

So werden die Schlüssel ausgetauscht (neues Paar, z. B. nach Verlust des Signierschlüssels):

1. Der Maintainer erzeugt das Schlüsselpaar auf seinem eigenen Rechner (Anleitung in der README der Registry, Abschnitt „Katalog signieren“) und veröffentlicht den öffentlichen Schlüssel.
2. In `server/src/projektschluessel.ts` den PEM-Text ersetzen (`test` bleibt `false`).
3. Fingerabdrücke ausrechnen (`python3 werkzeuge/signieren.py fingerabdruck signier.pub` in der Registry) und in `SECURITY.md`, `SECURITY.en.md`, im Test „Projektschlüssel“ und in der Tabelle oben eintragen; in der Registry den öffentlichen Schlüssel unter `schluessel/` ablegen und die Fingerabdrücke in `README.md` und `README.en.md` eintragen.

Fällt der Signierschlüssel aus (verloren oder bekannt geworden), signiert die Registry mit dem Reserveschlüssel weiter; Ablago nimmt das ohne Update an. Danach kommt ein neues Paar (neuer Reserveschlüssel) mit einem DMS-Release.

## Eigener Katalog mit eigenem Schlüssel { #eigener-katalog-mit-eigenem-schluessel }

Wer selbst einen Katalog betreibt (siehe unten, „Eigenes Paket testen“), kann ihn ebenfalls signieren. Ablago behandelt den Schlüssel wie SSH beim ersten Kontakt:

1. **Schlüsselpaar erzeugen** – auf deinem Rechner, nicht auf dem Webserver:

    ```sh
    openssl genpkey -algorithm ed25519 -out katalog.pem
    openssl pkey -in katalog.pem -pubout -out katalog.schluessel
    ```

2. **Signieren** nach jedem Bau des Katalogs, mit dem Werkzeug der Registry:

    ```sh
    python3 werkzeuge/katalog.py <ordner>
    python3 werkzeuge/signieren.py signieren <ordner> --schluessel katalog.pem --oeffentlich katalog.schluessel
    ```

    Es schreibt `<ordner>/katalog.sig` und prüft sie gleich mit dem öffentlichen Schlüssel.
3. **Veröffentlichen:** `katalog.json`, `katalog.sig` und `katalog.schluessel` liegen im selben Ordner auf einem HTTPS-Server. `katalog.pem` bleibt bei dir.
4. **Fingerabdruck nennen:** `python3 werkzeuge/signieren.py fingerabdruck katalog.schluessel` – schreib ihn auf deine Webseite. Wer deinen Katalog in Ablago hinzufügt, sieht den Fingerabdruck und soll ihn damit vergleichen. Ablago übernimmt den Schlüssel erst nach dieser Bestätigung.

Danach verlangt Ablago für diesen Katalog eine **gültige Signatur**: Fehlt sie oder passt sie nicht, nimmt es den Katalog nicht (und vermerkt das im Protokoll). Dafür muss beim Installieren niemand mehr die Herkunft bestätigen. Auch hier gilt: Ein älterer `erstellt` als zuletzt gesehen wird abgelehnt.

**Schlüssel wechseln:**

- **Geordnet:** Signiere den neuen öffentlichen Schlüssel mit dem bisherigen und leg die Signatur als `katalog.schluessel.sig` daneben (Format wie `katalog.sig`):

    ```sh
    openssl genpkey -algorithm ed25519 -out neu.pem
    openssl pkey -in neu.pem -pubout -out neu.schluessel
    python3 werkzeuge/signieren.py signieren-datei neu.schluessel --schluessel katalog.pem --ziel katalog.schluessel.sig
    mv neu.schluessel katalog.schluessel   # danach den Katalog mit neu.pem signieren
    ```

    Ablago übernimmt den neuen Schlüssel ohne Rückfrage, zeigt einen Hinweis und vermerkt den Wechsel im Protokoll. Lass `katalog.schluessel.sig` eine Weile liegen (etwa ein halbes Jahr): Ein Ablago, das den Katalog erst später wieder abruft, braucht den Nachweis auch noch.
- **Ohne den alten Schlüssel** (verloren): Ablago **sperrt** den Katalog mit deutlicher Warnung, bis ein Admin den neuen Fingerabdruck bestätigt. Sag deinen Nutzern Bescheid und nenne den neuen Fingerabdruck auf deiner Webseite.

Ein Katalog **ohne** `katalog.schluessel` bleibt wie bisher: Er geht, aber jede Installation daraus verlangt die Bestätigung der Herkunft.

## Eigenes Paket testen

Bevor dein Paket in den Katalog kommt, probierst du es im eigenen Ablago aus – am besten in einem Test-DMS (z. B. mit [Demo-Daten](https://help.ablago.app/admin/aktuell/demo/)):

1. **Werkbank → Pakete → ▸ Expertenmodus** aufklappen.
2. Den Paketordner als ZIP packen, z. B. `cd pakete/mein_paket && zip -r ../../mein_paket.zip .`, und unter **Paket hochladen** wählen. Ein Ordner vor `manifest.yaml` (z. B. `mein_paket/manifest.yaml`) stört nicht. Ablago prüft das Paket wie ein Katalogpaket und zeigt die Vorschau; Fehler im Format stehen dort gesammelt.
    - **Grenzen:** höchstens **128 MB** als ZIP (dieselbe Grenze im Katalog, beim Hochladen, in der Sammeldatei und beim Paket erstellen; `pruefen.py` und `katalog.py` der Registry lehnen größere Pakete ab), entpackt höchstens 20 MB ohne `code/` (für `code/` gelten ebenfalls 128 MB) und 500 Dateien. Ein hochgeladenes Paket bleibt 30 Minuten zum Installieren bereit; danach erneut hochladen.
3. Installieren (Herkunft bestätigen), ansehen, ändern. Für ein Update die **Version erhöhen** und erneut hochladen – Ablago aktualisiert wie bei einem Update aus dem Katalog (nur ergänzen). Zum Neuanfang das Paket entfernen (geht, solange es keine Mappen seiner Mappentypen gibt).

Ob Ablago dein Paket installiert – auch als Update und zusammen mit seinen Abhängigkeiten –, prüfst du schneller ohne eigenes Ablago mit [`pakete-pruefen`](#pakete-mit-ablago-pruefen).

Mehrere Pakete testest du auch als eigenen Katalog: `python3 werkzeuge/katalog.py <ordner>` baut `katalog.json` und die Archive; leg den Ordner auf einen HTTPS-Server und trage die Adresse von `katalog.json` im Expertenmodus unter **Weitere Quellen** ein.

## Ausblick

- **Rundgänge und Tipps aus Paketen** (#831, #832): `inhalt.rundgaenge` und `inhalt.tipps` im Manifest, im selben Format wie Ablagos eigene – siehe [Rundgänge, Tipps und Ankerpunkte](aufbau.md#entdecken). Ablago liest sie ab einer späteren Version; die Prüfung kommt mit [dms-registry #132](https://github.com/motom001/dms-registry/issues/132).
- **Pakete mit Code** gibt es seit 0.88.0: WebAssembly-Module, die auf Ereignisse reagieren und mit bestätigten Rechten über die API arbeiten – siehe [Pakete mit Code](pakete-code.md), mit der Übersicht der [Schnittstellen des Kerns](pakete-code.md#schnittstellen) (Vektoren, Antworten, Erkennung, Texterkennung, [Dateien umwandeln](pakete-code.md#dateien-umwandeln), [Volltext liefern](pakete-code.md#volltext-liefern)).
