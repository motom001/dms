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

Jedes Feld hat eine **Bezeichnung** (änderbar), einen **Schlüssel** (fest, sobald gespeichert) und einen **Datentyp**. Ein Klick auf ein Feld öffnet es. Die Reihenfolge änderst du mit den Pfeilen oder per **Drag & Drop** am Griff **⠿** (siehe [Ziehen statt klicken](#ziehen-statt-klicken)).

![Ein Feld bearbeiten](bilder/werkbank-feld.png)

| Datentyp | Eigenschaften |
| --- | --- |
| Text | Mindest- und Höchstlänge, Muster (regulärer Ausdruck, muss den ganzen Text treffen), eindeutig |
| Langtext | Mindest- und Höchstlänge |
| Formatierter Text | Mindest- und Höchstlänge (siehe unten) |
| Zahl | Minimum, Maximum, Nachkommastellen, eindeutig |
| Betrag | Minimum, Maximum, Standardwährung |
| Datum | – |
| Ja/Nein | – |
| Auswahlliste | die Auswahlwerte (einer pro Zeile), Mehrfachauswahl |
| Referenz | Ziel-Mappentyp, Art des Verweises, mehrere Mappen erlaubt |
| Passwort | – (wird verschlüsselt gespeichert, siehe unten) |

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

### Passwortfelder

Ein Feld vom Typ **Passwort** nimmt z. B. das Kennwort eines Online-Zugangs auf. Das DMS speichert es verschlüsselt mit dem Schlüssel aus **Werkbank → [Verschlüsselung](verschluesselung.md)**; solange es keinen gibt, lässt sich kein Wert speichern, und das Feld weist darauf hin.

- In der Mappe steht nur „••••••••“. Das Auge zeigt das Passwort – und jedes Anzeigen steht im [Protokoll](fehlersuche.md) mit Benutzer, Mappe und Feld, nie mit dem Wert.
- Passwortfelder erscheinen nie im Titel, in der Trefferliste, in der Suche, in Bedingungen von Sichten oder in Demo-Daten.
- Über die [API](api.md) gibt es Passwörter nur mit einem Schlüssel, der das Recht „Passwörter lesen“ hat.

### Formatierter Text

Ein Feld vom Typ **Formatierter Text** nimmt längere Texte mit einfacher Formatierung auf: fett, kursiv, Überschriften, Listen, Zitate und Links. Benutzer schreiben mit einer kleinen Werkzeugleiste und sehen eine Vorschau; gespeichert wird der Text als Markdown.

- Rohes HTML gibt es nicht, und Links sind nur mit `http(s)` oder `mailto` möglich – ein Text kann so nichts im Browser ausführen.
- In Titel, Trefferliste und Suche erscheint der Text ohne Formatierung, in Listen gekürzt.
- Mit **@** lässt sich ein Benutzer erwähnen; er bekommt dann eine [Aufgabe](aufgaben.md).
- Ein bestehendes Langtextfeld kannst du auf *Formatierter Text* umstellen; die Texte bleiben, wie sie sind.

## Wenn sich ein Mappentyp ändert

Du kannst Mappentypen jederzeit ändern, auch wenn es schon Mappen gibt:

- **Felder entfernen** löscht keine Werte. Sie bleiben an der Mappe und erscheinen dort als „Werte ohne Felddefinition“. Fügst du das Feld mit demselben Schlüssel wieder hinzu, sind sie wieder da.
- **Neue Pflichtfelder, strengere Regeln, entfernte Auswahlwerte:** Mappen, die nicht mehr passen, werden markiert und bekommen eine [Aufgabe](aufgaben.md) „Passt nicht“ für ihren Ersteller; so landen sie in seinem [Eingang](https://motom001.github.io/dms/benutzer/eingang/). Die Aufgabe erledigt sich, sobald die Mappe wieder passt. Nichts wird stillschweigend geändert. Über dem Mappentyp steht, wie viele Mappen betroffen sind.

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
| **Dokumentenregister** | hochgeladene Dateien; PDFs und Bilder sind direkt ansehbar. **Volltext erzeugen** (Standard: an) schickt neue Dokumente durch die [Texterkennung](texterkennung.md) |
| **Verknüpfungsregister** | Mappen, die auf diese Mappe verweisen – alle oder nur bestimmte (z. B. „Rechnungen“ nur über das Feld *Vertrag*). Als Quelle lässt sich auch *E-Mail › Bezug* wählen: Dann stehen hier die aus der Mappe verschickten E-Mails |
| **Protokollregister** | das Protokoll der Mappe: wer wann was geändert hat, mit altem und neuem Wert; dazu Dokumente, Papierkorb, Notizen, Aufgaben, E-Mails und angezeigte Passwörter (ohne Wert). Höchstens eins je Mappentyp |

Register haben feste Schlüssel, damit Dokumente ihr Register behalten, wenn es umbenannt wird. Ein Dokumentenregister, in dem schon Dokumente liegen, lässt sich nicht entfernen.

**Verknüpfungsregister als Tabelle:** Hakst du eine Quelle an, kannst du daneben eine [Trefferliste](#trefferlisten) des Quelltyps wählen. Das Register zeigt die verweisenden Mappen dann als Tabelle mit deren Spalten (z. B. beim Vertragspartner die Rechnungen mit Betrag, Datum und *bezahlt*). Ohne Auswahl – oder wenn es die Liste nicht mehr gibt – bleibt es bei der einfachen Liste der Titel.

## Trefferlisten

Eine **Trefferliste** legt fest, welche Angaben in einer Liste als Spalten erscheinen, und in welcher Reihenfolge – Felder und Systemwerte (Titel, angelegt/geändert am/von).

- Ist die Liste **breit**, wird sie zur sortierbaren Tabelle mit diesen Spalten.
- Ist sie **schmal**, bilden die ersten drei Spalten den kompakten Eintrag: die erste fett, die zweite und dritte darunter.

Hat eine Trefferliste keine Spalten, zeigt die Ablage den Titel und zwei weitere Felder.

Ein Mappentyp kann **mehrere** Trefferlisten haben, z. B. *Standard* mit allen Angaben und *Kurz* mit Titel, Betrag und *bezahlt*. Mit **+ Trefferliste** legst du eine weitere an (sie beginnt mit den Spalten der Standardliste).

- Jede Liste hat einen **Namen** und einen festen **Schlüssel**; über ihn wählen [Sichten](sichten.md#trefferliste) und Verknüpfungsregister die Liste.
- **Genau eine** ist **Standard**: Sie gilt überall, wo keine andere gewählt ist. Mindestens eine Liste bleibt immer.
- Unter jeder Liste steht, **wo sie verwendet** wird (Sichten, Register). Entfernst du eine verwendete Liste, gilt dort die Standardliste.

![Zwei Trefferlisten am Mappentyp Rechnung](bilder/werkbank-trefferlisten.png)

![Die Trefferliste als Tabelle in der Ablage](bilder/tabelle.png)

## Ziehen statt klicken

Felder, Register und die Spalten jeder Trefferliste haben einen **Griff ⠿**. Daran ziehst du einen Eintrag an eine andere Stelle; eine Linie zeigt, wo er landet. Ein **Feld** kannst du außerdem auf ein **Feldregister** ziehen – es liegt dann auf diesem Register.

Das ändert nur den Entwurf; übernommen wird es wie alles andere mit **Mappentyp speichern**. Per Tastatur: Griff ansteuern und **Alt+↑/↓**. Am Smartphone den Griff lange antippen, dann ziehen. Die Pfeil-Knöpfe gibt es weiterhin.

## Systemmappentypen: Benutzer, Rolle und E-Mail

*Benutzer*, *Rolle* und *E-Mail* sind **Systemmappentypen**, erkennbar am Kennzeichen *System*. Sie entstehen von selbst und lassen sich nicht löschen.

![Systemmappentyp Benutzer](bilder/werkbank-systemtyp.png)

- Du kannst sie um eigene Felder und Register erweitern, z. B. eine Telefonnummer.
- Ihre **Systemfelder** (Name, E-Mail-Adresse, Rollen, Aktiv bzw. Name der Rolle) sind fest: Bezeichnung, Hilfetext und Register darfst du ändern, Datentyp und Eigenschaften nicht.
- Beim Typ *Benutzer* sind **Neue Mappen erlauben** und **Löschen erlauben** immer aus – Benutzer entstehen in der Benutzerverwaltung.
- Mappen vom Typ *E-Mail* entstehen, wenn jemand eine Mappe [per E-Mail versendet](https://motom001.github.io/dms/benutzer/versenden/): mit Betreff, Empfängern, Absender, Datum, Nachricht, den Anhängen und dem **Bezug** auf die Mappe, aus der sie kam. **Neue Mappen erlauben** ist immer aus; löschen lassen sie sich wie andere Mappen. Der Bezug darf als einziges Feld auf Mappen *jedes* Typs zeigen. Wird die Ursprungsmappe gelöscht, bleibt die E-Mail erhalten und ihr Bezug wird leer. Später sollen hier auch E-Mails landen, die das DMS aus einem Postfach abholt.

Mehr dazu in [Benutzer und Rollen](benutzer.md).

## Mappentyp löschen

**Mappentyp löschen** geht nur, solange es keine Mappen dieses Typs gibt und kein anderer Typ auf ihn verweist. Sonst nennt das DMS die Gründe.
