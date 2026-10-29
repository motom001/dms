# Mappentypen

Ein **Mappentyp** legt fest, welche Art von Mappe es gibt – *Vertrag*, *Rechnung*, *Versicherung*, *Gerät* … – und was darin steht. Jeder Mappentyp erscheint in der Ablage als eigene Sicht.

Mappentypen pflegst du unter **Werkbank → Mappentypen**. Mit **+ Neu** legst du einen an; ein Klick auf einen bestehenden öffnet ihn zum Bearbeiten.

![Mappentyp Vertrag in der Werkbank](bilder/werkbank-mappentyp.png)

Wie Benutzer mit den Mappen arbeiten, beschreibt das [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/mappen/).

## Aufbau des Editors

Der Editor ist in der Reihenfolge aufgebaut, in der du einen Mappentyp anlegst: **Grunddaten → Felder → Titel → Trefferlisten → Register → Berechtigungen → Testlauf**.

- Jeder Bereich lässt sich mit einem Klick auf seine Überschrift **ein- und ausklappen**. Eingeklappt zeigt er das Wichtigste in einer Zeile, z. B. „8 Felder, 2 Pflicht, 1 mit Erinnerung“, die Titel-Vorlage mit einem Beispiel oder „Standard: R · 3 Regeln“.
- Ein **neuer** Mappentyp ist ganz aufgeklappt, ein **bestehender** startet eingeklappt. Was du auf- oder zuklappst, merkt sich dein Gerät je Mappentyp.
- Die **Sprungleiste** oben führt zu jedem Bereich und klappt ihn auf; **Alle aufklappen** bzw. **Alle zuklappen** schaltet alle auf einmal.
- Bereiche mit einem **Fehler** sind in der Sprungleiste und am Rand rot markiert. Ein unbekannter Platzhalter im Titel oder eine unvollständige Regel fällt schon beim Tippen auf; was erst beim Speichern auffällt, klappt seinen Bereich von selbst auf.

## Grunddaten

- **Name** – so heißt die Sicht in der Ablage, z. B. „Vertrag“. Er lässt sich jederzeit ändern.
- **Schlüssel** – fester, technischer Name, z. B. `vertrag`. Er wird aus dem Namen vorgeschlagen, lässt sich beim Anlegen ändern und ist nach dem ersten Speichern **fest**. [Sprechende Links](direktlinks.md) und Skripte über die [Schnittstelle](api.md) können ihn nutzen – so bleiben sie gültig, auch wenn der Mappentyp umbenannt wird. Die Systemtypen heißen `benutzer`, `rolle` und `email`.
- **Beschreibung** – steht über der Liste und hilft beim Einordnen.

Beim **Anlegen** gibt es zusätzlich **Eigene Sicht in der Ablage anlegen** (standardmäßig an): Dann erscheint der neue Typ in der Ablage als eigene Sicht. Abwählen, wenn seine Mappen nur in einer bestehenden [Sicht](sichten.md) erscheinen sollen.

Wer Mappen anlegen oder löschen darf, regeln die [Berechtigungen](berechtigungen.md) (Rechte C und D). Die früheren Haken *Neue Mappen erlauben* und *Löschen erlauben* gibt es seit Version 0.32 nicht mehr; sie wurden beim Update in die Berechtigungen übernommen.

**Verwendet in** (bei gespeicherten Typen) zeigt, wo der Mappentyp genutzt wird, jeweils mit Link: Sichten, die ihn zeigen, Referenzfelder anderer Mappentypen, die auf ihn verweisen, und Verknüpfungsregister anderer Typen, die seine Felder als Quelle nutzen. So siehst du vor einer Änderung, was davon betroffen ist. Steht dort „Nirgends verwendet“, hängt nichts an ihm.

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

### Fristen: Erinnerungen an Datumsfeldern

An einem **Datumsfeld** wie „Kündigung bis“ oder „TÜV fällig“ kannst du **Erinnern** einschalten. Dann steht die Mappe rechtzeitig vor dem Datum als **Frist** im Eingang – und damit auch in der täglichen Zusammenfassung.

![Erinnerung an einem Datumsfeld](bilder/werkbank-frist.png)

- **Vorlauf** – wie lange vorher, in Tagen, Wochen oder Monaten. Bei 4 Wochen und dem 30.09. erscheint die Frist am 02.09.
- **Für** – der **Ersteller der Mappe** oder der Benutzer in einem Feld, das auf Benutzer verweist (z. B. „Verantwortlich“). Ist dieses Feld leer, bekommt der Ersteller die Erinnerung. Abwesenheit und Vertretung gelten wie bei allen [Aufgaben](aufgaben.md).
- **Text** – mit den Platzhaltern `{feld}`, `{datum}` und `{titel}`; Standard ist „{feld} {datum}“, also z. B. „Kündigung bis 30.09.2027“.
- **Wiederkehrend** – monatlich, vierteljährlich, halbjährlich, jährlich oder alle paar Jahre. Wer die Frist erledigt, bekommt den Vorschlag „Datum auf 30.09.2028 setzen“; das Datum ändert sich **nie von selbst**, und die Änderung steht wie jede andere im Protokoll der Mappe.

So verhalten sich Fristen:

- Das DMS prüft die Fristen beim Speichern einer Mappe, nach Änderungen am Mappentyp und jeden Tag kurz nach Mitternacht. Je Mappe, Feld und Datum entsteht **höchstens eine** Frist – auch nach dem Erledigen nicht noch einmal.
- Wird das Datum **geändert oder geleert**, erledigt sich eine offene Frist von selbst (mit Eintrag im Protokoll der Mappe); für das neue Datum entsteht zur rechten Zeit eine neue.
- Daten, die schon vorbei sind, erzeugen keine Frist mehr.
- Darf der Empfänger die Mappe nach den [Berechtigungen](berechtigungen.md) nicht lesen, bekommt er die Frist trotzdem; unter *Werkbank → Aufgaben* steht dann ein Hinweis.
- Eine zusätzliche E-Mail am Stichtag gibt es nicht – die Fristen stehen in der täglichen Zusammenfassung.

## Wenn sich ein Mappentyp ändert

Du kannst Mappentypen jederzeit ändern, auch wenn es schon Mappen gibt:

- **Felder entfernen** löscht keine Werte. Sie bleiben an der Mappe und erscheinen dort als „Werte ohne Felddefinition“. Fügst du das Feld mit demselben Schlüssel wieder hinzu, sind sie wieder da.
- **Neue Pflichtfelder, strengere Regeln, entfernte Auswahlwerte:** Mappen, die nicht mehr passen, werden markiert und bekommen eine [Aufgabe](aufgaben.md) „Passt nicht“ für ihren Ersteller; so landen sie in seinem [Eingang](https://motom001.github.io/dms/benutzer/eingang/). Die Aufgabe erledigt sich, sobald die Mappe wieder passt. Nichts wird stillschweigend geändert. Über dem Mappentyp steht, wie viele Mappen betroffen sind.

![Eingang in der Ablage](bilder/eingang.png)

## Titel einer Mappe

Die **Vorlage** bestimmt, wie eine Mappe in Listen und Verweisen heißt, z. B. `{rechnungsnummer} vom {rechnungsdatum}`. Felder in geschweiften Klammern werden eingesetzt, alles andere bleibt stehen. Daneben gibt es `{angelegt}` und `{geaendert}` (jeweils das Datum). Die Vorschau zeigt das Ergebnis mit Beispielwerten oder mit den Werten einer echten Mappe.

Verweist der Titel auf eine andere Mappe (`{vertragspartner}`), wird der Titel nachgezogen, wenn sich der Vertragspartner ändert.

Ohne Vorlage verwendet das DMS das erste Textfeld.

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

## Ziehen statt klicken

Felder, Register und die Spalten jeder Trefferliste haben einen **Griff ⠿**. Daran ziehst du einen Eintrag an eine andere Stelle; eine Linie zeigt, wo er landet. Ein **Feld** kannst du außerdem auf ein **Feldregister** ziehen – es liegt dann auf diesem Register.

Das ändert nur den Entwurf; übernommen wird es wie alles andere mit **Mappentyp speichern**. Per Tastatur: Griff ansteuern und **Alt+↑/↓**. Am Smartphone den Griff lange antippen, dann ziehen. Die Pfeil-Knöpfe gibt es weiterhin.

## Systemmappentypen: Benutzer, Rolle und E-Mail

*Benutzer*, *Rolle* und *E-Mail* sind **Systemmappentypen**, erkennbar am Kennzeichen *System*. Sie entstehen von selbst und lassen sich nicht löschen.

![Systemmappentyp Benutzer](bilder/werkbank-systemtyp.png)

- Du kannst sie um eigene Felder und Register erweitern, z. B. eine Telefonnummer.
- Ihre **Systemfelder** (Name, E-Mail-Adresse, Rollen, Aktiv bzw. Name der Rolle) sind fest: Bezeichnung, Hilfetext und Register darfst du ändern, Datentyp und Eigenschaften nicht.
- Mappen vom Typ *Benutzer* lassen sich in der Ablage weder anlegen noch löschen (Systemregel) – Benutzer entstehen in der Benutzerverwaltung.
- Mappen vom Typ *E-Mail* entstehen, wenn jemand eine Mappe [per E-Mail versendet](https://motom001.github.io/dms/benutzer/versenden/): mit Betreff, Empfängern, Absender, Datum, Nachricht, den Anhängen und dem **Bezug** auf die Mappe, aus der sie kam. Anlegen lassen sie sich in der Ablage nicht (Systemregel); löschen lassen sie sich wie andere Mappen. Der Bezug darf als einziges Feld auf Mappen *jedes* Typs zeigen. Wird die Ursprungsmappe gelöscht, bleibt die E-Mail erhalten und ihr Bezug wird leer. Später sollen hier auch E-Mails landen, die das DMS aus einem Postfach abholt.

Mehr dazu in [Benutzer und Rollen](benutzer.md).

## Berechtigungen

Unter den Registern legst du fest, wer Mappen dieses Typs anlegen, lesen, bearbeiten, löschen und Passwörter darin sehen darf – mit der Zeile **Standard** und Regeln. Gespeichert wird mit **Mappentyp speichern**; darunter probierst du die Regeln im **Testlauf** aus – auch ungespeicherte. Alles Weitere steht unter [Berechtigungen](berechtigungen.md).

## Mappentyp kopieren

**Mappentyp kopieren** oben rechts legt einen neuen Mappentyp als **Entwurf** an – mit denselben Feldern, Titel, Trefferlisten, Registern und Berechtigungen. Er heißt „Kopie von …“ und bekommt einen eigenen Schlüssel; beides kannst du vor dem Speichern ändern. Angelegt wird er erst mit **Mappentyp speichern**. Mappen werden nicht kopiert. Felder, die auf den Typ selbst verweisen, zeigen in der Kopie auf die Kopie. Systemtypen lassen sich nicht kopieren.

## Mappentyp löschen

**Mappentyp löschen** geht nur, solange es keine Mappen dieses Typs gibt und kein anderer Typ auf ihn verweist. Sonst nennt das DMS die Gründe.
