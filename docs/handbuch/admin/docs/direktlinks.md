# Sprechende Links

Ein sprechender Link findet eine Mappe über ihren **Mappentyp** und ihre **Angaben** statt über ihre technische Id. Den Link kannst du einem Kollegen mit eigenem Konto per Mail oder Chat schicken oder in anderen Programmen hinterlegen, etwa:

```
http://<NAS>:8080/ablage/link?typ=Rechnung&rechnungsnummer=A-2020-11380
```

Eingerichtet wird dafür nichts: Jeder Link, der dem Aufbau unten folgt, funktioniert sofort. In jeder Mappe erzeugt **Aktionen → Link kopieren** einen passenden Link (siehe [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/versenden/#link-kopieren)).

## Was der Link zeigt

- **Ein Treffer:** Die Mappe öffnet sich.
- **Mehrere Treffer:** Die Trefferliste erscheint als vorübergehende Sicht „Link: Rechnung“ – mit den Bedingungen darunter –, und die erste Mappe ist geöffnet. Im Sichtenbaum erscheint diese Sicht nicht.
- **Kein Treffer:** Die leere Liste nennt die gesuchten Bedingungen.
- **Fehler im Link** (unbekannter Mappentyp, Tippfehler im Feldschlüssel, unpassender Operator, ungültiger Wert): Das DMS zeigt, was nicht stimmt – nie stillschweigend alle Mappen.

![Trefferliste eines sprechenden Links](bilder/direktlink.png)

Die Adresse im Browser bleibt der Link, auch wenn eine Mappe geöffnet ist oder die Liste umsortiert wird. Wer nicht angemeldet ist, meldet sich an und landet danach direkt beim Link. Es gelten die Rechte des Empfängers: Er sieht nur, was er auch in der Ablage sieht.

## Aufbau

```
/ablage/link?typ=<Mappentyp>&<feld>=<wert>&<feld>.<operator>=<wert>&sortierung=<feld>
```

| Teil | Bedeutung |
| --- | --- |
| `typ=Rechnung` | **Name** des Mappentyps; Groß- und Kleinschreibung zählen nicht. |
| `rechnungsnummer=A-2020-11380` | **Schlüssel** eines Feldes und der Wert: „ist gleich“. |
| `betrag.groesser=100` | Feld mit **Operator**. |
| `sortierung=-rechnungsdatum` | Reihenfolge der Trefferliste; `-` = absteigend. Ohne: nach Titel. |

Mehrere Bedingungen gelten **zusammen** (UND), wie in einer [Sicht](sichten.md). Sonderzeichen im Wert schreibst du so, wie Browser sie kodieren: Leerzeichen als `+` oder `%20`, `&` als `%26`, `+` als `%2B`.

!!! warning "Mappentyp umbenennen macht Links ungültig"
    Der Link nennt den Mappentyp beim **Namen**. Benennst du „Rechnung“ in „Eingangsrechnung“ um, finden alte Links den Typ nicht mehr und zeigen eine Fehlermeldung. Felder dagegen stehen mit ihrem **Schlüssel** im Link, der sich nie ändert (siehe [Mappentypen](mappentypen.md#der-schlussel)) – Bezeichnungen kannst du gefahrlos umbenennen.

Den Schlüssel eines Feldes siehst du in der Werkbank beim Mappentyp, im Feld unter **Schlüssel**. Auch die Systemwerte gehen: `_erstellt`, `_geaendert` (Datum) sowie `_erstelltVon`, `_geaendertVon` (nur mit `ich`).

### Ohne Operator

| Feldart | `feld=wert` bedeutet | Beispiel |
| --- | --- | --- |
| Text, Zahl, Betrag, Datum | ist gleich (Text ohne Groß-/Kleinschreibung) | `rechnungsnummer=a-2020-11380` |
| Langtext, formatierter Text | enthält | `notiz=Kündigung` |
| Ja/Nein | ja bzw. nein | `bezahlt=nein` |
| Auswahlliste | ist einer von; mehrere Werte mit Komma | `zahlungszyklus=monatlich,jährlich` |

### Operatoren

Es gibt dieselben Operatoren wie bei den Bedingungen einer Sicht – je Feldart dieselbe Auswahl:

| Operator | Bedeutung | Beispiel |
| --- | --- | --- |
| `gleich` | ist gleich | `rechnungsnummer.gleich=R-17` |
| `enthaelt` | enthält (Texte) | `bezeichnung.enthaelt=Strom` |
| `kleiner`, `groesser` | kleiner/größer als | `betrag.groesser=1.000,00` |
| `zwischen`, `ausserhalb` | zwei Werte mit `..` dazwischen | `rechnungsdatum.zwischen=2026-01-01..2026-03-31` |
| `imZeitraum` | Jahr oder Monat | `rechnungsdatum.imZeitraum=jahr-1` |
| `einerVon` | ist einer von (Auswahlliste) | `zahlungszyklus.einerVon=monatlich` |
| `ja`, `nein` | Ja/Nein, ohne Wert | `bezahlt.nein` |
| `leer`, `nichtLeer` | ist (nicht) leer, ohne Wert | `vertragsnummer.nichtLeer` |
| `zeigtAuf` | nur mit `ich` (siehe unten) | `verantwortlich.zeigtAuf=ich` |

Groß- und Kleinschreibung der Operatoren zählt nicht (`nichtleer` geht auch).

### Werte

- **Zahlen und Beträge:** mit Komma oder Punkt, auch `1.234,50`.
- **Datum:** `2026-03-31` oder `31.03.2026`.
- **Heute:** `heute`, `heute-30tage`, `heute+2wochen`, `heute+12monate`, `heute-1jahr`. Das DMS rechnet bei jedem Öffnen neu – ein Link auf „Kündigung in den nächsten 12 Monaten“ ist also immer aktuell.
- **Zeitraum** (mit `imZeitraum`): `jahr` (aktuelles), `jahr-1` (letztes), `monat`, `monat+1` (nächster).
- **Ich:** `ich` ist der angemeldete Benutzer – für Verweise auf Benutzer und für `_erstelltVon`/`_geaendertVon`, z. B. `verantwortlich=ich`.

Verweise auf andere Mappen (etwa „Vertrag = …“), Passwortfelder sowie Bedingungen auf Dokumente und Verknüpfungen gehen im Link nicht. Dafür richtest du eine [Sicht](sichten.md) ein.

### Felder namens „typ“ oder „sortierung“

`typ` und `sortierung` haben im Link eine feste Bedeutung. Ein Feld mit einem dieser Schlüssel erreichst du mit Operator: `typ.gleich=Laptop`.

## Beispiele

| Link | Zeigt |
| --- | --- |
| `/ablage/link?typ=Rechnung&rechnungsnummer=R-2026-117` | genau diese Rechnung |
| `/ablage/link?typ=Rechnung&bezahlt=nein&sortierung=-rechnungsdatum` | offene Rechnungen, neueste zuerst |
| `/ablage/link?typ=Rechnung&rechnungsdatum.groesser=heute-30tage` | Rechnungen der letzten 30 Tage |
| `/ablage/link?typ=Vertrag&kuendigung_bis.zwischen=heute..heute+12monate` | Verträge, die in den nächsten 12 Monaten gekündigt werden müssen |
| `/ablage/link?typ=Vertragspartner&name=Stadtwerke+Musterstadt` | den Vertragspartner „Stadtwerke Musterstadt“ |

Ein Link mit Fehler zeigt, was nicht stimmt:

![Fehlermeldung bei einem Tippfehler im Feldschlüssel](bilder/direktlink-fehler.png)

## Über die Schnittstelle

Dieselben Links versteht `GET /api/v1/mappen?sicht=link&link=<Parameter des Links>`, z. B. `link=typ%3DRechnung%26bezahlt%3Dnein` (die Parameter als ein kodierter Wert). Ein fehlerhafter Link ergibt `422` mit der Meldung in `fehler`. Siehe [Schnittstelle](api.md).
