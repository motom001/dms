# Rundgänge und Tipps { #rundgaenge-und-tipps }

## Rundgänge, Tipps und Ankerpunkte (#831, #832) { #entdecken }

Rundgänge und Tipps sind **Daten, kein Code**. Ablagos eigene liegen in `shared/entdecken/` – im selben Format, das Pakete später als `inhalt/rundgaenge.yaml` und `inhalt/tipps.yaml` mitbringen (Stufe 2, Prüfung in [dms-registry #132](https://github.com/motom001/dms-registry/issues/132)). Es gibt einen Mechanismus für alle: Eine Quelle liefert rohe Einträge, `pruefeRundgaenge` und `pruefeTipps` (`shared/src/entdecken.ts`) prüfen sie, der Server filtert sie je Person (`server/src/entdecken/entdecken.ts`). Ein Paket fügt später nur eine weitere Quelle hinzu.

| Datei | Inhalt |
| --- | --- |
| `shared/entdecken/anker.yaml` | feste Ankerpunkte der Oberfläche (maschinenlesbar, auch für die Registry) |
| `shared/entdecken/rundgaenge.yaml` | Ablagos Rundgänge (Ablage, Werkbank, Mappe, Mein Konto) |
| `shared/entdecken/tipps.yaml` | Ablagos Tipps (Reihenfolge = Reihenfolge des Tipps des Tages) |
| `shared/src/sprachen/<sprache>/entdecken.json` | die Texte dazu |

Der Server liest die YAML-Dateien zur Laufzeit (im Image unter `/app/shared/entdecken`, siehe Dockerfile). Fehlerhafte Einträge fallen weg und stehen einmal im Protokoll; für die Person ändert sich nichts.

### Rundgang

```yaml
- schluessel: ablago            # klein, Ziffern, _
  start: erster_besuch          # manuell | erste_anmeldung | erster_besuch (die beiden letzten nur Ablago selbst)
  seite: ablage                 # bei erster_besuch: ablage | mappe | werkbank | konto
  # leise: true                 # bei erster_besuch: nicht starten, nur ein stiller Satz auf der Seite (Mein Konto)
  fuer: lesen                   # lesen (alle) | verwalten (nur mit Verwaltungsrecht)
  oeffne: { seite: start }      # diese Seite vor dem ersten Schritt öffnen: start | werkbank | konto | mappe
  schritte:                     # höchstens 8, in Leserichtung: links oben → rechts oben, dann nach unten
    - schluessel: logo
      ziel: kopf.logo
    - schluessel: ansichten
      ziel: [navigation.ansichten, startseite.zu-erledigen]   # der erste sichtbare Anker gilt
      fuer: lesen               # verwalten: Schritt nur für Verwaltende (z. B. Werkbank)
    # bild: dreiteilung         # eingebaute Grafik statt eines Ziels (heute ungenutzt, #1522)
```

**Beim ersten Besuch** (#1512, #1522, #1523): `GET /api/entdecken` liefert in `beimBesuch` die Rundgänge mit `start: erster_besuch`, die noch ausstehen (nie gesehen bzw. „Später“ und seitdem neu angemeldet; in Vertretung keine). Die Oberfläche (`web/src/entdecken/besuch.tsx`) ordnet den Pfad einer Seite zu – `/ablage/…` ist `ablage`, mit einer Mappen-Id dahinter zusätzlich `mappe` (die Ablage hat Vorrang), `/werkbank…` und `/profil…` – und startet höchstens einen: je Rundgang einmal je Laden der Seite, nie während ein anderer läuft und nach dem Ende eines Rundgangs erst auf einem anderen Pfad (Usability-Grundsatz 2.11). `leise: true` startet nichts; die Seite zeigt `StillerRundgangHinweis` (ein Satz wie ein Tipp, × merkt „gesehen“). `oeffne: { seite: mappe }` öffnet beim Start von Hand die offene bzw. zuletzt geöffnete Mappe, sonst steht `ersatz`. `erste_anmeldung` gibt es weiter (Feld `starten`), Ablago selbst nutzt es nicht mehr.

**Die Karte steht fest** (#1301, #1522): am Rechner unten in der Mitte, am Handy unten über dem Assistenten. Ist ein Ziel höher als der Platz über der Karte (eine ganze Spalte), bleibt sie stehen; verdeckt sie ein kleineres Ziel, rückt sie direkt darüber (`lageDerKarte` in `web/src/entdecken/Rundgang.tsx`).

Texte: Titel, Beschreibung und Schlusssatz unter `rundgang.<rundgang>.titel | .beschreibung | .ende`, je Schritt `rundgang.<rundgang>.<schritt>.titel | .text | .text-handy | .text-verwalten | .ort` (Unterstriche im Schlüssel werden in der Sprachdatei zu Bindestrichen). `text-handy` gilt in der Handyfassung, `text-verwalten` für Personen mit Verwaltungsrecht, `ort` sagt Screenreadern, wo das hervorgehobene Element steht – zu jedem `ziel` ist es Pflicht. Pakete bringen dieselben Schlüssel in ihren eigenen Sprachdateien mit ([Sprachen](#paket-rundgaenge-sprachen)); ältere schreiben die Texte direkt in die Datei (`titel`, `text`, `text_handy`, `text_verwalten`, `ort`). Grenzen: Titel 60, Texte 200 Zeichen.

Zur Laufzeit fällt ein Schritt still weg, wenn keiner seiner Anker sichtbar ist (z. B. am Handy) – mit einem Vermerk in der Konsole (`console.debug`), ohne Meldung für die Person.

#### Rundgänge aus Paketen { #paket-rundgaenge }

Ein Paket nennt im Manifest `inhalt.rundgaenge: inhalt/rundgaenge.yaml`. Die Texte stehen in den [Sprachdateien des Pakets](#paket-rundgaenge-sprachen) oder (nur Deutsch) direkt in der Datei; Rundgänge heißen in Ablago `<paket>:<schluessel>`. Rundgänge sollen durch eine Aufgabe führen und tragen einen aufgabenbezogenen Titel („Eingangsrechnung anlegen“) – er steht in „Was mitkommt“.

```yaml
# inhalt/rundgaenge.yaml
- schluessel: vertraege_kennenlernen
  titel: Verträge im Überblick
  beschreibung: Wo Fristen und Unterlagen eines Vertrags stehen.
  start: nach_installation          # manuell | nach_installation | nach_update – startet nie von selbst
  fuer: lesen                       # lesen = wer den Mappentyp lesen darf · verwalten = mit Verwaltungsrecht
  oeffne:
    mappe: { typ: vertrag }         # erste Mappe des Typs, die die Person lesen darf; neu: { typ } = leeres Formular
  ersatz: Sobald du einen Vertrag angelegt hast, zeigt dir Ablago hier, wie es geht.
  schritte:
    - schluessel: frist
      ziel: mappe.feld:kuendigen_bis
      ort: Rechts in der Mappe
      titel: Kündigen bis
      text: Hier steht, bis wann du kündigen musst. Ablago erinnert dich rechtzeitig.
      handbuch: admin/pakete/#so-nutzt-du-es               # Seite im mitgelieferten Handbuch (benutzer/ oder admin/)
      sonst_verwalten: Frag die Person, die Ablago bei euch verwaltet.   # nur für Personen ohne Verwaltungsrecht
```

- **Prüfung beim Installieren** (wie die Paketprüfung, dms-registry #132): unbekannte Felder und Anker, Felder und Register, die es im eigenen Mappentyp nicht gibt (`mappe.feld:<key>`, `mappe.register:<key>` gegen `oeffne`), Mappentypen, die weder zum Paket noch zu einer Abhängigkeit gehören, mehr als 8 Schritte, Texte über 200 (Titel 60) Zeichen, `nach_installation` mehr als einmal je Paket, `erste_anmeldung`, `erster_besuch`. Ein Fehler macht das Paket ungültig.
- **Zur Laufzeit** prüft Ablago noch einmal gegen die eigenen Anker und die installierten Mappentypen (ein Paket für eine neuere Version kann Anker nennen, die es hier noch nicht gibt): Fehlerhafte Rundgänge fallen weg, einmal im Protokoll; fehlt ein Ziel, fällt der Schritt still weg.
- **`oeffne`:** `mappe` öffnet die zuletzt geänderte Mappe des Typs, die die Person lesen darf; `neu` ein leeres Formular, nur wenn sie den Typ anlegen darf – gespeichert wird nichts, am Ende geht es zurück. Sonst steht `ersatz` (bzw. ein allgemeiner Satz) statt der Schritte. Den Pfad liefert `GET /api/entdecken/rundgaenge/:schluessel/oeffnen`.
- **Ruhig:** Rundgänge aus Paketen starten nie von selbst. Mit `nach_installation` bzw. `nach_update` bietet Ablago sie 30 Tage nach Installation bzw. Update als Tipp an (`ANGEBOT_TAGE` in `shared/src/entdecken.ts`) („Verträge im Überblick – kurzer Rundgang“, `angebot:<rundgang>`, „neu“); es gilt die Regel des Tipps des Tages (höchstens einer am Tag). Alle stehen unter „Ablago entdecken“.
- **Eigene Rundgänge** (#941) schreibt die Verwaltung unter Werkbank → Rundgänge im selben Format (ein Rundgang je Datei, `start` immer `manuell`, Schlüssel `eigen:<schluessel>`); sie stehen mit dem An/aus aller Rundgänge in der Einstellung `entdecken_werkbank` (`server/src/entdecken/entdecken-werkbank.ts`) und kommen mit „Paket erstellen“ als `inhalt/rundgaenge.yaml` ins Paket. Die Prüfung meldet je Fehler den Ort (`orte` von `pruefeRundgaenge`), die Werkbank macht daraus die Zeile.

#### Sprachen { #paket-rundgaenge-sprachen }

Texte von Rundgängen und Tipps eines Pakets (#1307) stehen wie Ablagos eigene in Sprachdateien: `texte/<sprache>/entdecken.json` im Paket, flach, mit denselben Schlüsseln wie `shared/src/sprachen/<sprache>/entdecken.json` – ohne den Bereich davor, Unterstriche werden zu Bindestrichen. Die YAML-Datei enthält dann nur den Aufbau. Regeln in `shared/src/entdecken-paket.ts`.

```text
inhalt/rundgaenge.yaml       Aufbau: schluessel, start, oeffne, schritte mit ziel …
inhalt/tipps.yaml            Aufbau: schluessel, typ, ziel bzw. rundgang …
texte/de/entdecken.json      Deutsch – die Grundsprache des Pakets
texte/en/entdecken.json      weitere Sprachen, z. B. Englisch, pt-BR …
```

```json
{
  "rundgang.vertraege-kennenlernen.titel": "Verträge im Überblick",
  "rundgang.vertraege-kennenlernen.beschreibung": "Wo Fristen und Unterlagen eines Vertrags stehen.",
  "rundgang.vertraege-kennenlernen.ersatz": "Sobald du einen Vertrag angelegt hast, zeigt dir Ablago hier, wie es geht.",
  "rundgang.vertraege-kennenlernen.frist.titel": "Kündigen bis",
  "rundgang.vertraege-kennenlernen.frist.text": "Hier steht, bis wann du kündigen musst. Ablago erinnert dich rechtzeitig.",
  "rundgang.vertraege-kennenlernen.frist.ort": "Rechts in der Mappe",
  "tipp.kuendigen": "Wusstest du schon? Ablago erinnert dich an jede Kündigungsfrist."
}
```

- **Angezeigt** wird die Sprache der Person (`pt-BR` nimmt sonst `pt`). Fehlt dort ein Text, gilt der Text direkt in der YAML-Datei und danach Deutsch (`texte/de/entdecken.json`) – wie bei den Beschriftungen ist Deutsch die Grundsprache. Deutsch darf also auch direkt in der YAML-Datei stehen und nur die Übersetzungen in `texte/`.
- **Prüfung beim Installieren:** jede Sprache wie Deutsch (Längen, keine spitzen Klammern, zwei Sätze je Tipp). Schlüssel, die zu keinem Rundgang, Schritt oder Tipp gehören, sind ein Fehler (Tippfehler fallen so auf); fehlende Übersetzungen nennt die Vorschau als Hinweis („auf en: 2 Texte fehlen, dort erscheinen die deutschen“). Höchstens 30 Sprachen, je Datei 64 KB, nur Texte.
- **Abwärtskompatibel:** Pakete mit Texten nur direkt in der YAML-Datei laufen weiter; die Vorschau weist darauf hin, dass es sie nur in einer Sprache gibt. Ältere Ablago-Versionen lesen `texte/<sprache>/` nicht – ein Paket, das die Texte nur dort hat, verlangt darum die Version mit #1307 (`dms: ">=…"`).
- Gespeichert werden die Texte am installierten Paket (`entdecken.texte`); „Was mitkommt“ nennt Rundgänge in der Sprache der Person.

### Tipp

```yaml
- schluessel: suche_in_dokumenten
  bereich: suche                # suche | post | fristen | mappen | konto | verwalten
  ziel: startseite.suche        # Anker mit fester Seite …
  # rundgang: ablago            # … oder ein Rundgang …
  # handbuch: benutzer/knoepfe/ # … oder eine Seite im mitgelieferten Handbuch (benutzer/ oder admin/, #1524) – genau eines der drei
  fuer: lesen                   # lesen | verwalten
  funktion: fragen              # optional: fragen | laufwerk | mail – nur, wenn eingeschaltet
  ab_version: 0.216.0           # optional: „Neu seit deinem letzten Besuch“
```

Text unter `tipp.<schluessel>`: höchstens 160 Zeichen und zwei Sätze, Du-Form, nur Begriffe aus dem [Glossar](https://github.com/motom001/dms/blob/main/docs/glossar.yml). **Jede sichtbare neue Funktion bringt ihren Tipp im selben PR mit** (mit `ab_version` der Version, in der sie erscheint); den Wortlaut prüft die laufende Qualitätskontrolle. Höchstens 20 Tipps je Paket.

#### Tipps aus Paketen { #paket-tipps }

Ein Paket nennt `inhalt.tipps: inhalt/tipps.yaml`; der Text steht unter `tipp.<schluessel>` in den [Sprachdateien des Pakets](#paket-rundgaenge-sprachen) oder (nur Deutsch) direkt in der Datei, Tipps heißen in Ablago `<paket>:<schluessel>`.

```yaml
# inhalt/tipps.yaml
- schluessel: ausfuellen_neu
  text: Neu in Verträge 2.1 – Ablago liest Anbieter, Nummer und Laufzeit direkt aus dem Vertrag.
  ab_version: 2.1.0                   # „Neu“ für alle, die das Paket auf diese Version aktualisiert haben
  fuer: lesen                         # lesen | verwalten
  typ: vertrag                        # optional: nur, wer diesen Mappentyp lesen darf
  rundgang: vertraege_kennenlernen    # der Satz startet diesen Rundgang des Pakets …
- schluessel: kuendigen
  text: Wusstest du schon? Ablago erinnert dich an jede Kündigungsfrist.
  typ: vertrag
  ziel: mappe.feld:kuendigen_bis      # … oder führt an diese Stelle (in der ersten lesbaren Mappe des Typs) …
- schluessel: knoepfe
  text: Blau, grün, mit Rand oder gestrichelt? So erkennst du, was ein Knopf tut.
  handbuch: benutzer/knoepfe/         # … oder öffnet diese Seite im mitgelieferten Handbuch (neues Fenster, #1524)
```

**Werkbank → Tipps** (#942): Eigene Tipps (`eigen:tipp_<n>`) und Anpassungen an Tipps von Ablago und aus Paketen stehen in der Einstellung `entdecken_werkbank` – Anpassungen je vollem Schlüssel mit den neuen Angaben und dem Original von damals (so erkennt die Werkbank, dass sich das Original seit der Anpassung geändert hat). Eine Anpassung, die nicht mehr besteht (z. B. Rundgang gelöscht), gilt nicht; dann wieder das Original. „Paket erstellen“ schreibt eigene Tipps nach `inhalt/tipps.yaml`; Anpassungen fremder Tipps gehen erst mit #654 als Nachtrag mit.

`bereich` ist in Paketen freiwillig (Vorgabe `mappen`). Ein Ziel in einer Mappe (`mappe.feld:`, `mappe.register:`) geht nur mit `typ`; die Oberfläche öffnet dann die erste Mappe dieses Typs, die die Person lesen darf (`GET /api/entdecken/tipps/:schluessel/oeffnen`). Anker an jeder Mappe wie `mappe.aktionen` („Mappe ▾“, #1307) gehen auch ohne `typ` – auch in Ablagos eigenen Tipps (`erinnern`): Dann öffnet sie die zuletzt geänderte Mappe irgendeines Typs, die die Person lesen darf; gibt es keine, zeigt sie einen Ersatztext im Fenster des Rundgangs statt eines Sprungs ins Leere. „Neu seit deinem letzten Besuch“ gilt 30 Tage nach dem Update des Pakets auf eine Version ab `ab_version` (Ablago merkt sich die Version davor am installierten Paket). Geprüft wird beim Installieren wie bei Rundgängen: Schema, bekannte Anker, Felder und Register, Rundgänge des Pakets, höchstens 20 Tipps und 160 Zeichen, zwei Sätze.

### Ankerpunkte { #anker }

Ziele sind feste Ankerpunkte, keine HTML-Ids: Das Element trägt `data-anker="<anker>"` (bei `Link` die Eigenschaft `anker`). Die Liste steht in `shared/entdecken/anker.yaml` mit Seite, Beschreibung, `handy` (auch in der Handyfassung sichtbar) und `clients` (gibt es so auch in Clients). Muster wie `mappe.register:<key>`, `mappe.feld:<key>` und `werkbank.bereich:<route>` passen auf jeden Schlüssel. Heute gibt es unter anderem:

`neu`, `benutzermenue`, `navigation.ansichten`, `navigation.ansicht-waehlen`, `navigation.erweiterte-suche`, `navigation.zu-erledigen`, `navigation.neue-post`, `navigation.favoriten`, `kopf.logo`, `kopf.bereiche`, `liste`, `mappe`, `startseite.suche`, `startseite.fragen`, `startseite.feld-art`, `startseite.tipp`, `assistent`, `startseite.zu-erledigen`, `startseite.neue-post`, `startseite.termin`, `startseite.zuletzt`, `zu-erledigen.ansicht`, `mappe.kopf`, `mappe.aktionen`, `mappe.stern`, `mappe.reiter`, `mappe.register:<key>`, `mappe.feld:<key>`, `mappe.speicherleiste`, `konto.zurueck`, `konto.bereich:<seite>`, `konto.abwesenheit`, `konto.schrift`, `konto.startseite`, `konto.tipps`, `konto.zusammenfassung`, `entdecken.rundgaenge`, `werkbank.navigation`, `werkbank.bereich:<route>`, `werkbank.mitte`, `werkbank.anpassen`, `werkbank.typen.suche`, `werkbank.sichten.suche`, `werkbank.nummernkreise.suche`, `werkbank.auskuenfte.suche`, `werkbank.auskuenfte.nur-offene`, `werkbank.fehlermeldungen.suche`.

`server/test/entdecken.test.ts` prüft beim Bauen: jeder Anker kommt im Quelltext der Oberfläche vor, Format, Ziele und Rundgänge existieren, Längen stimmen, und jeder Text steht in Deutsch und Englisch. Wer ein Element umbaut, behält das Attribut; neue Anker kommen dazu, vorhandene werden **nie umbenannt oder entfernt** (#1307) – Rundgänge aus Paketen und eigene verlassen sich darauf, die Registry vergleicht ihre Kopie der Liste. `server/test/entdecken-anker.test.ts` prüft gegen die gespeicherte Liste `server/test/charakter/anker.json`: Ein neuer Anker kommt im selben PR ans Ende dieser Liste.

**Hinter einem Umschalter (#1002):** Ist ein Anker noch nicht sichtbar, meldet `warteAufAnker` (`web/src/entdecken/stand.ts`) ihn mit `ankerGesucht`. Eine Seite, die die Stelle erst nach dem Umschalten zeigt, hört mit `beiAnkerGesucht` darauf und schaltet um – nur für den Moment, gemerkt wird nichts. So öffnet sich der Assistent unten rechts (#1219) für `startseite.fragen` bei „Fragen“, für `startseite.tipp` bei „Tipps“ und für `startseite.feld-art` mit seinem Umschalter – nur, weil die Person einen Tipp oder Rundgang angeklickt hat. Die Namen `startseite.*` stammen aus der Zeit vor #1218/#1219; Anker werden nicht umbenannt, `startseite.suche` ist seither das Suchfeld oben in der Kopfzeile.

### Schnittstelle und Merker

- `GET /api/entdecken` – Rundgänge und Tipps für die angemeldete Person in ihrer Sprache (gefiltert nach Verwaltungsrecht und eingeschalteten Funktionen), dazu der Tipp des Tages (`tipp`), ob die Tipp-Zeile an ist (`tippsAn`) und welcher Rundgang jetzt von selbst startet (`starten`). Je Tipp: Anker und Seite bzw. Rundgang, Herkunft (`ablago`, später `paket:<id>`), `neu`, `ausgeblendet` und `clients` (für Clients geeignet: kein Rundgang, Anker gibt es auch dort).
- `POST /api/entdecken/tipps/:schluessel` mit `aktion`: `gezeigt`, `erledigt`, `ausblenden`, `einblenden`.
- `POST /api/entdecken/rundgaenge/:schluessel` mit `stand`: `gesehen` oder `spaeter`.
- In `/api/v1` (für Clients, #831/#832): `GET /entdecken` mit Schlüssel der Stufe „lesen“, `POST /entdecken/tipps/{schluessel}` und `POST /entdecken/rundgaenge/{schluessel}` ebenfalls mit „lesen“ (#1307, `lesenGenuegt` in der Tabelle von `/api/v1`: setzt nur Merker der eigenen Person; „nur Zähler“ nicht) – so melden sich Oberfläche und App nicht doppelt. Clients zeigen nur Tipps mit `clients: true`. Eigene Tipps eines Clients schreiben dasselbe Format; `pruefeTipps` in `shared/src/entdecken.ts` braucht dafür kein Paket.

Gemerkt wird je Person in ihren Einstellungen (`entdecken_rundgaenge`, `entdecken_tipps`, `entdecken_version`; Tipp des Tages aus: `tipps` = false) – keine Telemetrie. In einer Vertretung startet nichts von selbst, und nichts wird gemerkt. Migration 088 setzt für Konten, die sich vor dem Update schon angemeldet hatten, Ablagos Rundgang auf „gesehen“. Die Handbuch-Aufnahmen und Messskripte markieren ihre Konten ebenso (`aufnehmen.mjs`, `ladezeiten.mjs`).

Rundgänge und Tipps aus Paketen: siehe [Rundgänge aus Paketen](#paket-rundgaenge) und [Tipps aus Paketen](#paket-tipps).
