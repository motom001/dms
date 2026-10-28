# Mappentypen

Ein **Mappentyp** legt fest, welche Art von Mappe es gibt – *Vertrag*, *Rechnung*, *Versicherung*, *Gerät* … – und was darin steht. Jeder Mappentyp erscheint in der Ablage als eigene Sicht.

Mappentypen pflegst du unter **Werkbank → Mappentypen**. Mit **+ Neu** legst du einen an; ein Klick auf einen bestehenden öffnet ihn zum Bearbeiten.

![Mappentyp Vertrag in der Werkbank](bilder/werkbank-mappentyp.png)

Wie Benutzer mit den Mappen arbeiten, beschreibt das [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/mappen/).

## Grunddaten

- **Name** – so heißt die Sicht in der Ablage, z. B. „Vertrag“.
- **Beschreibung** – steht über der Liste und hilft beim Einordnen.
- **Neue Mappen erlauben** – ob Benutzer in der Ablage Mappen dieses Typs anlegen dürfen.
- **Löschen erlauben** – ob Benutzer Mappen dieses Typs löschen dürfen.

Beim **Anlegen** gibt es zusätzlich **Eigene Sicht in der Ablage anlegen** (standardmäßig an): Dann erscheint der neue Typ in der Ablage als eigene Sicht. Abwählen, wenn seine Mappen nur in einer bestehenden [Sicht](sichten.md) erscheinen sollen.

Neue Mappen und Löschen sind standardmäßig erlaubt. Ist es aus, fehlen die Knöpfe in der Ablage, und auch der Server lehnt Anlegen bzw. Löschen ab – auch über die [Schnittstelle](api.md). Bearbeiten bleibt immer möglich.

## Felder

Jedes Feld hat eine **Bezeichnung** (änderbar), einen **Schlüssel** (fest, sobald gespeichert) und einen **Datentyp**. Ein Klick auf ein Feld öffnet es; mit den Pfeilen änderst du die Reihenfolge.

![Ein Feld bearbeiten](bilder/werkbank-feld.png)

| Datentyp | Eigenschaften |
| --- | --- |
| Text | Mindest- und Höchstlänge, Muster (regulärer Ausdruck, muss den ganzen Text treffen), eindeutig |
| Langtext | Mindest- und Höchstlänge |
| Zahl | Minimum, Maximum, Nachkommastellen, eindeutig |
| Betrag | Minimum, Maximum, Standardwährung |
| Datum | – |
| Ja/Nein | – |
| Auswahlliste | die Auswahlwerte (einer pro Zeile), Mehrfachauswahl |
| Referenz | Ziel-Mappentyp, Art des Verweises, mehrere Mappen erlaubt |

Für alle gilt: **Pflichtfeld** und ein **Hilfetext**, der beim Ausfüllen unter dem Feld steht; die meisten Typen haben außerdem einen **Standardwert** für neue Mappen. **Eindeutig** heißt: Den Wert darf es in diesem Mappentyp nur einmal geben – Groß- und Kleinschreibung zählen dabei nicht.

### Der Schlüssel

Unter dem Schlüssel speichert das DMS die Werte, und die [Schnittstelle](api.md) verwendet ihn. Deshalb ist er nach dem ersten Speichern fest. Die Bezeichnung kannst du jederzeit ändern.

### Referenzen: Mappen verbinden

Ein Feld vom Typ **Referenz** verweist auf Mappen eines anderen Typs (oder desselben – so entstehen Hierarchien wie Haus → Heizung → Wärmepumpe). Wähle dazu:

- **Ziel-Mappentyp** – worauf verwiesen wird, z. B. *Vertragspartner*. Auch *Benutzer* und *Rolle* sind möglich, z. B. für ein Feld „Verantwortlich“.
- **Mehrfach** – ob mehrere Mappen gewählt werden können.
- **Verweisart:**
    - **Zugehörigkeit** – „gehört zu“: Die Rechnung gehört zum Vertrag. Zählt später bei Auswertungen wie „alles zum Haus“ mit.
    - **Bezug** – „hat zu tun mit“: Die Rechnung kommt von diesem Aussteller. Nur eine Verknüpfung.

Auf eine Mappe, auf die noch verwiesen wird, kann niemand sie löschen.

## Wenn sich ein Mappentyp ändert

Du kannst Mappentypen jederzeit ändern, auch wenn es schon Mappen gibt:

- **Felder entfernen** löscht keine Werte. Sie bleiben an der Mappe und erscheinen dort als „Werte ohne Felddefinition“. Fügst du das Feld mit demselben Schlüssel wieder hinzu, sind sie wieder da.
- **Neue Pflichtfelder, strengere Regeln, entfernte Auswahlwerte:** Mappen, die nicht mehr passen, werden markiert und landen im [Eingang](https://motom001.github.io/dms/benutzer/eingang/) ihres Erstellers. Nichts wird stillschweigend geändert. Über dem Mappentyp steht, wie viele Mappen betroffen sind.

![Eingang in der Ablage](bilder/eingang.png)

## Titel einer Mappe

Die **Vorlage** bestimmt, wie eine Mappe in Listen und Verweisen heißt, z. B. `{rechnungsnummer} vom {rechnungsdatum}`. Felder in geschweiften Klammern werden eingesetzt, alles andere bleibt stehen. Daneben gibt es `{angelegt}` und `{geaendert}` (jeweils das Datum). Die Vorschau zeigt das Ergebnis mit Beispielwerten oder mit den Werten einer echten Mappe.

Verweist der Titel auf eine andere Mappe (`{vertragspartner}`), wird der Titel nachgezogen, wenn sich der Vertragspartner ändert.

Ohne Vorlage verwendet das DMS das erste Textfeld.

## Register

Register sind die Trennblätter einer Mappe, in der angegebenen Reihenfolge:

| Art | Inhalt |
| --- | --- |
| **Feldregister** | eine Gruppe von Feldern; welches Feld auf welchem Register liegt, stellst du am Feld ein |
| **Dokumentenregister** | hochgeladene Dateien; PDFs und Bilder sind direkt ansehbar |
| **Verknüpfungsregister** | Mappen, die auf diese Mappe verweisen – alle oder nur bestimmte (z. B. „Rechnungen“ nur über das Feld *Vertrag*) |

Register haben feste Schlüssel, damit Dokumente ihr Register behalten, wenn es umbenannt wird. Ein Dokumentenregister, in dem schon Dokumente liegen, lässt sich nicht entfernen.

## Trefferliste

Die **Trefferliste** legt fest, welche Angaben in der Liste der Ablage als Spalten erscheinen, und in welcher Reihenfolge – Felder und Systemwerte (Titel, angelegt/geändert am/von).

- Ist die Liste **breit**, wird sie zur sortierbaren Tabelle mit diesen Spalten.
- Ist sie **schmal**, bilden die ersten drei Spalten den kompakten Eintrag: die erste fett, die zweite und dritte darunter.

Bleibt die Trefferliste leer, zeigt die Ablage den Titel und zwei weitere Felder.

![Die Trefferliste als Tabelle in der Ablage](bilder/tabelle.png)

## Systemmappentypen: Benutzer und Rolle

*Benutzer* und *Rolle* sind **Systemmappentypen**, erkennbar am Kennzeichen *System*. Sie entstehen von selbst und lassen sich nicht löschen.

![Systemmappentyp Benutzer](bilder/werkbank-systemtyp.png)

- Du kannst sie um eigene Felder und Register erweitern, z. B. eine Telefonnummer.
- Ihre **Systemfelder** (Name, E-Mail-Adresse, Rollen, Aktiv bzw. Name der Rolle) sind fest: Bezeichnung, Hilfetext und Register darfst du ändern, Datentyp und Eigenschaften nicht.
- Beim Typ *Benutzer* sind **Neue Mappen erlauben** und **Löschen erlauben** immer aus – Benutzer entstehen in der Benutzerverwaltung.

Mehr dazu in [Benutzer und Rollen](benutzer.md).

## Mappentyp löschen

**Mappentyp löschen** geht nur, solange es keine Mappen dieses Typs gibt und kein anderer Typ auf ihn verweist. Sonst nennt das DMS die Gründe.
