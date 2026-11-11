# Mappentypen

Ein **Mappentyp** legt fest, welche Art von Mappe es gibt – *Vertrag*, *Rechnung*, *Versicherung*, *Gerät* … – und was darin steht. Ein neuer Mappentyp bekommt in der Ablage eine eigene Ansicht; das lässt sich beim Anlegen abwählen (siehe [Grunddaten](#grunddaten)).

Mappentypen pflegst du unter **Werkbank → Mappentypen**. Mit **+ Neu** legst du einen an; ein Klick auf einen bestehenden öffnet ihn zum Bearbeiten.

![Mappentyp Vertrag in der Werkbank](bilder/werkbank-mappentyp.png)

Wie Benutzer mit den Mappen arbeiten, beschreibt das [Benutzerhandbuch](https://help.ablago.app/benutzer/mappen/).

## Aufbau des Editors

Der Editor ist in der Reihenfolge aufgebaut, in der du einen Mappentyp anlegst: **Grunddaten → Felder → Titel → Trefferlisten → Register → Archivmodus → Stempel beim Weitergeben → Erkennung → Berechtigungen → Testlauf → Pakete → KI-Dienste**.

- Jeder Bereich lässt sich mit einem Klick auf seine Überschrift **ein- und ausklappen**. Eingeklappt zeigt er das Wichtigste in einer Zeile, z. B. „8 Felder, 2 Pflicht, 1 Frist“, die Titel-Vorlage mit einem Beispiel oder „Standard: R · 3 Regeln“.
- Ein **neuer** Mappentyp ist ganz aufgeklappt, ein **bestehender** startet eingeklappt. Was du auf- oder zuklappst, merkt sich dein Gerät je Mappentyp.
- Die **Sprungleiste** oben führt zu jedem Bereich und klappt ihn auf; **Alle aufklappen** bzw. **Alle zuklappen** schaltet alle auf einmal.
- Bereiche mit einem **Fehler** sind in der Sprungleiste und am Rand rot markiert. Ein unbekannter Platzhalter im Titel oder eine unvollständige Regel fällt schon beim Tippen auf; was erst beim Speichern auffällt, klappt seinen Bereich von selbst auf.
- **Zu zweit bearbeiten:** Hat jemand anderes den Mappentyp gespeichert, während du ihn bearbeitest, überschreibt Ablago nichts. Es meldet „Jemand hat diesen Mappentyp inzwischen geändert …“; **Verwerfen** lädt den neuen Stand, dann übernimmst du deine Änderungen noch einmal. Ohne eigene Änderungen zeigt der Editor den neuen Stand von selbst.

## Grunddaten

- **Name** – so heißt die Ansicht in der Ablage, z. B. „Vertrag“. Er lässt sich jederzeit ändern.
- **Kennung** – fester, technischer Name, z. B. `vertrag`. Sie wird aus dem Namen vorgeschlagen, lässt sich beim Anlegen ändern und ist nach dem ersten Speichern **fest**. [Links über Mappentyp und Feldwerte](direktlinks.md) und Skripte über die [Schnittstelle](api.md) können sie nutzen – so bleiben sie gültig, auch wenn der Mappentyp umbenannt wird. Die Systemtypen heißen `benutzer`, `rolle` und `post` (bis 0.40 hieß *Post* noch *E-Mail* mit der Kennung `email`). Mappentypen aus [Paketen](pakete.md) haben die Kennung `paket:schluessel`, z. B. `basis:person` (bis 0.228 `basis_person`, #1084); eigene Mappentypen eine ohne Doppelpunkt, höchstens 60 Zeichen.
- **Beschreibung** – steht über der Liste und hilft beim Einordnen.
- **Kann aus Post angelegt werden** – dann steht der Mappentyp zur Wahl, wenn jemand ein Dokument aus der Post übernimmt und gefragt wird: *Wohin gehört das?* Mehr unter [Dokument übernehmen](#dokument-ubernehmen).
- **Woran man ihn erkennt** – ein kurzer Satz, höchstens 300 Zeichen. Mehr unter [Dokument übernehmen](#dokument-ubernehmen).
- **Ist Teil einer anderen Mappe** – Mappen dieses Typs gehören immer zu einer anderen Mappe, z. B. Rechnungspositionen zu ihrer Rechnung, und erscheinen nur dort. Mehr unter [Ist Teil einer anderen Mappe](#ist-teil-einer-anderen-mappe).

Beim **Anlegen** gibt es zusätzlich **Eigene Ansicht in der Ablage anlegen** (standardmäßig an): Dann erscheint der neue Mappentyp in der Ablage als eigene Ansicht. Abwählen, wenn seine Mappen nur in einer bestehenden [Ansicht](sichten.md) erscheinen sollen.

Wer Mappen anlegen oder löschen darf, regeln die [Berechtigungen](berechtigungen.md) (Rechte C und D). Die früheren Haken *Neue Mappen erlauben* und *Löschen erlauben* gibt es seit Version 0.32 nicht mehr; sie wurden beim Update in die Berechtigungen übernommen.

### Dokument übernehmen

Post landet zuerst unter *Post*. Von dort übernimmt man ein Dokument in eine Mappe. Zwei Angaben in den Grunddaten sagen Ablago, welche Mappentypen dafür in Frage kommen:

- **Kann aus Post angelegt werden** – Nur Mappentypen mit diesem Haken stehen unter *Wohin gehört das?* zur Wahl, und nur für Personen, die dort Mappen anlegen dürfen ([Berechtigungen](berechtigungen.md), Recht C). Vorgabe: an bei Mappentypen mit Dokumentenregister, sonst aus. Nimm den Haken weg, wenn Post nie zu diesem Typ gehört, z. B. bei *Ablageort*.
- **Woran man ihn erkennt** – ein kurzer Satz, der hilft, ein Dokument dem richtigen Mappentyp zuzuordnen, z. B. bei *Rechnung*: „Enthält Rechnungsnummer, Betrag und Zahlungsziel; Absender ist ein Vertragspartner“. Die Beschreibung ist für Menschen gedacht; dieser Satz ist für die Erkennung und darf knapp sein. Ein Paket, das den Mappentyp vorschlägt (etwa der *KI-Assistent*), bekommt ihn zusammen mit Name und Kurzbeschreibung – nur bei Mappentypen, die für [KI-Dienste](pakete.md#ki-dienste) zugelassen sind (siehe [Wohin gehört das? durch Pakete](pakete.md#wohin-gehoert-das)). Wie Name und Beschreibung lässt er sich in [weiteren Sprachen](#beschriftungen-je-sprache) angeben.

Die **Systemmappentypen** Benutzer, Rolle und Post sind nie wählbar; bei ihnen gibt es beide Angaben nicht. Die Pakete können beides vorgeben. Bei einem Update übernimmt Ablago die Angaben nur, wenn du sie noch nicht eingestellt hast.

**Verwendet in** (bei gespeicherten Mappentypen) zeigt, wo der Mappentyp genutzt wird, jeweils mit Link: Ansichten, die ihn zeigen, Verweisfelder anderer Mappentypen, die auf ihn verweisen, und Verknüpfungsregister anderer Mappentypen, die seine Felder als Quelle nutzen. So siehst du vor einer Änderung, was davon betroffen ist. Steht dort „Nirgends verwendet“, hängt nichts an ihm.

### Ist Teil einer anderen Mappe { #ist-teil-einer-anderen-mappe }

Manche Mappen ergeben nur als Teil einer anderen Sinn – eine **Rechnungsposition** gehört zu ihrer **Rechnung**. Damit nicht hunderte Positionen in Ansichten und Suche stehen, hakst du in den Grunddaten der *Rechnungsposition* **Ist Teil einer anderen Mappe** an und wählst unter **Gehört dazu über** das Verweisfeld, über das sie dazugehört (hier *Rechnung*). Die Mappen dieses Typs heißen dann **Teile**, die andere die **übergeordnete Mappe**.

- **Das Feld** ist ein Verweis auf genau einen anderen Mappentyp, in dem eine Mappe steht. Es wird **Pflicht** und bleibt immer zu sehen (nicht ausgeblendet, ohne *Anzeigen, wenn …*). Systemmappentypen gehören nie zu einer anderen Mappe. **Keine Ketten:** Der übergeordnete Typ ist selbst kein Teil, und ein Typ, der selbst Teile hat, wird keiner.
- **Wo sie erscheinen:** nur an der übergeordneten Mappe – in einer [Tabelle](#tabelle) (etwa *Positionen* mit „+ Position“) oder einem [Verknüpfungsregister](#register) – und über einen direkten Link. Nicht in [Ansichten](sichten.md) (auch nicht in solchen mit „alle Mappentypen“), Trefferlisten über mehrere Typen, auf der Startseite unter *Zuletzt geöffnet*, in der Suche und der erweiterten Suche, nicht unter **+ Neu** und nicht bei *Wohin gehört das?*. Der Typ bekommt **keine eigene Ansicht**; schaltest du die Einstellung bei einem bestehenden Typ ein, verschwindet er aus den Ansichten (eine Ansicht, die nur ihn zeigte, mit ihm). Schaltest du sie wieder aus, bekommt er seine eigene Ansicht zurück.
- **Suche:** Was in einem Teil steht, findet die übergeordnete Mappe – in der Trefferliste steht dann „gefunden in Rechnungsposition „3. Bohrmaschine““. Das gilt nur, wenn die Person **beide** lesen darf, den Teil und die übergeordnete Mappe; sonst gibt die Suche keinen Hinweis auf den Inhalt des Teils.
- **Leserechte:** Hat der Typ noch keine eigenen [Berechtigungen](berechtigungen.md), übernimmt er beim Einschalten **einmal** die Leserechte des übergeordneten Typs (Grundeinstellung „Lesen“ und die Regeln zum Lesen; eine Regel, deren Feld es beim Teil nicht gibt, kommt nicht mit – der Editor sagt das). Danach sind es seine eigenen: Änderst du später die Berechtigungen der Rechnung, gilt das für die Positionen **nicht von selbst** – passe sie dann auch dort an, sonst sind Positionen breiter lesbar als ihre Rechnung.
- **Löschen und Papierkorb:** Wird die übergeordnete Mappe gelöscht, gehen ihre Teile mit – als ein Vorgang im [Papierkorb](papierkorb.md), im Löschprotokoll mit dem Weg „mit ihren Teilen“; wiederhergestellt ebenso, und endgültig gelöscht ebenso. Darf die Person nicht jeden Teil lesen und löschen, lehnt Ablago ab und nennt nur die Anzahl – mit Systemrechten wird nie still mitgelöscht. Ein einzelner Teil lässt sich wie jede Mappe löschen; liegt seine übergeordnete Mappe im Papierkorb, kommt er nur mit ihr zurück.

**Kein Schutz.** Ausblenden ist Ordnung, kein Zugriffsschutz: Über die [Schnittstelle](api.md), den [Export](export.md), die [Sicherung](sicherung.md) und direkte Links bleiben Teile erreichbar und gehen nicht verloren; ein direkter Link prüft die normalen Rechte. Wer was sehen darf, regeln die [Berechtigungen](berechtigungen.md). Pakete können die Einstellung mitbringen (`gehoertZu` im Paketformat, siehe Entwicklerhandbuch).

## Felder

Jedes Feld hat eine **Bezeichnung** (änderbar), eine **Kennung** (fest, sobald gespeichert) und eine **Feldart**. Ein Klick auf ein Feld öffnet es. Die Reihenfolge änderst du mit den Pfeilen oder per **Drag & Drop** am Griff **⠿** (siehe [Ziehen statt klicken](#ziehen-statt-klicken)).

![Ein Feld bearbeiten](bilder/werkbank-feld.png)

| Feldart | Eigenschaften |
| --- | --- |
| Text | Mindest- und Höchstlänge, Muster (regulärer Ausdruck, muss den ganzen Text treffen), eindeutig, [Format](#formate-und-datumsgrenzen) |
| Langtext | Mindest- und Höchstlänge |
| Formatierter Text | Mindest- und Höchstlänge (siehe unten) |
| Zahl | Minimum, Maximum, Nachkommastellen, eindeutig |
| Betrag | Minimum, Maximum, Standardwährung, [Negative Beträge erlauben](#zeitraum-prozent-negativ) |
| Zeitraum | – (Zahl und Einheit, siehe [unten](#zeitraum-prozent-negativ)) |
| Prozent | Minimum, Maximum, Nachkommastellen |
| Datum | [Frühestens, Spätestens](#formate-und-datumsgrenzen) (fest oder „heute“), Ist eine Frist |
| Ja/Nein | – |
| Auswahlliste | die Auswahlwerte (einer pro Zeile), Mehrfachauswahl, [Beschriftung der Werte](#beschriftungen-je-sprache) |
| Verweis | Ziel-Mappentypen (einer oder mehrere), Art des Verweises, mehrere Mappen erlaubt, alle vom selben Typ |
| Passwort | – (wird verschlüsselt gespeichert, siehe unten) |
| Tabelle | zeigt Mappen vom Typ …, die über Feld … hierher verweisen; Spalten aus Trefferliste …; Beschriftung von „+ Neu“ (siehe [unten](#tabelle)) |
| Zusammengesetzt | Vorlage aus Platzhaltern, eindeutig als Kombination (siehe [unten](#zusammengesetzt)) |

Für alle gilt: **Pflichtfeld** und ein **Hilfetext**, der beim Ausfüllen unter dem Feld steht (im Feld-Editor gleich neben der Bezeichnung); die meisten Mappentypen haben außerdem einen **Standardwert** für neue Mappen. **Eindeutig** heißt: Den Wert darf es in diesem Mappentyp nur einmal geben – Groß- und Kleinschreibung zählen dabei nicht. Sind zwei Felder eindeutig, gilt das für jedes einzeln; soll eine **Kombination** nur einmal vorkommen (Rechnungsnummer je Absender), nimm ein [zusammengesetztes Feld](#zusammengesetzt).

Steht im Standardwert eines Textfelds `{nummernkreis:<kennung>}`, bekommt jede neue Mappe eine fortlaufende Nummer aus diesem [Nummernkreis](nummernkreise.md); das Feld ist dann schreibgeschützt.

### Zeitraum, Prozent und negative Beträge { #zeitraum-prozent-negativ }

Für Verträge und Rechnungen gibt es drei Dinge, die so eingetragen werden, wie sie auf dem Papier stehen:

- **Zeitraum** – eine ganze Zahl (0 bis 9999) und eine Einheit: Tage, Wochen, Monate oder Jahre. Gut für *Kündigungsfrist* „3 Monate“ oder *Laufzeit* „24 Monate“. Ablago zeigt Einzahl und Mehrzahl richtig („1 Monat“, „3 Monate“) – auch in der [Titel-Vorlage](#titel-einer-mappe) und auf Englisch. Die Einheit bleibt, wie eingetragen; sortiert und verglichen wird nach der Länge (ein Monat zählt dabei 30,4375 Tage, ein Jahr 365,25 – so sind 12 Monate gleich 1 Jahr). Der Standardwert lässt sich als „3 Monate“ eintragen.
- **Prozent** – eine Zahl mit Nachkommastellen, frei wählbar (auch ausländische Steuersätze). „19“, „19 %“ und „19,0“ ergeben dasselbe; angezeigt wird „19 %“. Minimum, Maximum und Nachkommastellen wie bei einer Zahl.
- **Negative Beträge** – am Betragsfeld **Negative Beträge erlauben** anhaken, z. B. für *Gutschrift* oder *Erstattung*. Vorgabe ist aus: Dann darf der Betrag nicht unter 0 liegen. Ist der Haken an, steht beim Ausfüllen unter dem Feld „Gutschrift oder Erstattung? Mit Minus eintragen.“, und in Trefferlisten steht ein deutliches Minuszeichen (−25,00 €). Betragsfelder, in denen beim Update schon ein negativer Betrag stand, haben den Haken von selbst.

Alle drei kennen [Bedingungen](sichten.md), die erweiterte Suche, Direktlinks, Export und Pakete. Im [Vollexport](export.md) steht ein Zeitraum als `P3M` (ISO 8601), Prozent als Zahl.

### Tabelle: verweisende Mappen zwischen den Feldern { #tabelle }

Eine **Tabelle** zeigt mitten im Feldregister die Mappen eines anderen Typs, die auf diese Mappe verweisen – etwa an der *Rechnung* ihre *Positionen*, am *Projekt* seine *Aufgaben*. Sie hat dieselbe Quelle wie ein [Verknüpfungsregister](#register), steht aber zwischen den Feldern statt auf einem eigenen Register.

![Rechnung mit der Tabelle Positionen](bilder/mappe-tabelle.png)

Am Feld stellst du ein:

- **Zeigt Mappen vom Typ** und **die über dieses Feld hierher verweisen** – zur Wahl stehen nur Verweisfelder, die auf diesen Mappentyp zeigen (bei der *Rechnungsposition* etwa *Rechnung*). Gibt es noch keines, legst du es zuerst beim anderen Typ an.
- **Spalten aus Trefferliste** – die Spalten und ihre Reihenfolge kommen aus einer [Trefferliste](#trefferlisten) des anderen Typs; ohne Auswahl aus seiner Standard-Trefferliste. Passwortfelder sind nie eine Spalte.
- **Beschriftung von „+ Neu“** – z. B. „+ Position“, je Sprache übersetzbar; leer heißt es „+ Rechnungsposition“.
- Bezeichnung (z. B. *Positionen*), Hilfetext, Register, **Ausblenden** und **Anzeigen, wenn …** wie bei jedem Feld; mit einem [Abschnitt](#abschnitte) davor bekommt die Tabelle eine eigene Zeile mit Überschrift.

In der Mappe stehen die Zeilen sortiert wie in der Trefferliste des anderen Typs, je 50 mit **weitere anzeigen**; ein Klick öffnet die Mappe. Ohne Zeilen steht ein ruhiger Satz („Noch keine Positionen“). Am Handy ist die Tabelle eine Liste mit den ersten zwei Spalten. **+ Position** unter der Tabelle öffnet die neue Mappe im Fenster, der Verweis auf diese Mappe ist schon gesetzt; nach dem Speichern steht sie in der Tabelle.

**Rechte.** Die Zeilen sind Mappen: Jede Person sieht nur die Zeilen, die sie lesen darf – auch die Zahl („weitere anzeigen“) zählt keine anderen mit. Verweise in den Spalten auf Mappen, die sie nicht lesen darf, stehen als „nicht sichtbare Mappe“ da. **+ Neu** sieht nur, wer den anderen Typ anlegen darf; beim Speichern prüft Ablago das Anlegerecht und dass die Person diese Mappe lesen darf, auch über die [Schnittstelle](api.md).

**Kein eigener Wert.** Eine Tabelle ist reine Darstellung wie ein Abschnitt: Sie steht nicht in den Werten der Mappe, nicht im [Export](export.md) und [Vollexport](export.md), nicht in Bedingungen, Spalten oder der Titel-Vorlage und ist nie Pflicht. Summen rechnet sie nicht – das ist Sache von Paketen, etwa *Rechnungen*, das prüft, ob die Positionen zum Betrag passen. Werte direkt in der Tabelle ändern geht nicht; dafür die Mappe öffnen.

Solange eine Tabelle Mappen eines Typs zeigt, lässt sich dieser Typ nicht löschen und sein Verweisfeld nicht entfernen; Ablago nennt dann die Tabelle. Pakete bringen Tabellen mit (`typ: tabelle` mit `quelle`, siehe Entwicklerhandbuch).

### Zusammengesetzt: eindeutig als Kombination { #zusammengesetzt }

Ein **zusammengesetztes Feld** setzt sich aus anderen Feldern derselben Mappe zusammen – nach einer **Vorlage** mit Platzhaltern und Filtern wie die [Titel-Vorlage](#titel-einer-mappe). Niemand pflegt den Wert von Hand: Ablago setzt ihn beim Speichern, die Mappe zeigt ihn nur an. Meist ist es **eindeutig** – so verhindert Ablago Doppelte über eine Kombination von Werten.

**Beispiel: Rechnungsnummer je Absender.** Verschiedene Firmen vergeben dieselben Rechnungsnummern; *Rechnungsnummer* allein kann also nicht eindeutig sein. Lege an der *Rechnung* ein Feld *Kennung* an:

1. Feldart **Zusammengesetzt**, Vorlage `{von} · {rechnungsnummer}` – die Knöpfe unter der Vorlage fügen die Platzhalter der Felder ein.
2. Haken **Eindeutig**.
3. Speichern.

Legt jemand dieselbe Rechnung ein zweites Mal an, steht am Feld *Absender*: „Diese Kombination aus Absender und Rechnungsnummer gibt es schon in „RE-2026-17 von Stadtwerke Musterstadt“.“ – den Titel der vorhandenen Mappe nennt Ablago nur, wenn die Person sie lesen darf. Die Meldung steht am ersten beteiligten Feld, weil man dort etwas ändert, nicht am zusammengesetzten Feld.

- **Verweise zählen über die Mappe selbst**, nicht über ihren Titel: Zwei Organisationen mit gleichem Namen sind zwei Kombinationen. Angezeigt wird der Titel – für jede Person nur, wenn sie die verwiesene Mappe lesen darf, sonst „nicht sichtbare Mappe“.
- **Platzhalter:** Text, Zahl, Betrag, Prozent, Datum, Zeitraum, Ja/Nein, Auswahlliste und Verweis. Nicht: Passwörter (wie in der Titel-Vorlage), Langtext und formatierter Text, Tabellen, andere zusammengesetzte Felder und Felder mit Nummernkreis (die sind ohnehin eindeutig). Filter wie `{rechnungsdatum|jahr}` wirken wie im Titel – `{bereich} · {datum|jahr}` heißt „je Bereich und Jahr“.
- **Verglichen** wird ohne Sprache: Datum als `2026-11-30`, Auswahl als fester Wert, Groß- und Kleinschreibung zählen nicht. Leere Teile fallen samt Trenner weg; sind alle leer, hat das Feld keinen Wert und zählt nicht.
- **In der Mappe** steht das Feld nur lesbar mit dem Hinweis „setzt sich zusammen aus Absender und Rechnungsnummer“ – im selben Rahmen wie ein [berechnetes Feld](#berechnete-felder). Es ändert sich sofort, wenn man einen Teil ändert. Nie Pflicht.
- **Vorlage ändern:** Ablago rechnet danach alle Mappen des Typs neu. Hätten dann mehrere Mappen dieselbe Kombination, fragt der Editor vorher mit der Anzahl nach („2 Mappen in „Kennung““) und speichert nicht still. Speicherst du trotzdem, passen diese Mappen nicht zur Definition, bis jemand sie ändert – wie beim Einschalten von *eindeutig*.
- **Überall nutzbar:** als Spalte, in [Bedingungen](sichten.md) und der erweiterten Suche (wie Text), in der Suche, in der Titel-Vorlage, mit [Zum Wiederfinden nutzen](#zum-wiederfinden-nutzen), im [Export](export.md) und [Vollexport](export.md), in [Paketen](pakete.md) und über die [Schnittstelle](api.md) – dort nur zum Lesen. Bedingungen und die Suche vergleichen den gespeicherten Wert; Verweise stehen darin als Kennung der Mappe, ein Name findet sie dort nicht – dafür gibt es die Bedingung am Verweisfeld.
- **Nicht in der Historie:** Dort stehen die Änderungen der Teile.

### Felder ausblenden statt löschen { #felder-ausblenden }

Brauchst du ein Feld nicht – etwa *Handelsregister* an der *Organisation* aus dem Paket *Basis* –, hakst du am Feld **Ausblenden** an, statt es zu entfernen. Ein ausgeblendetes Feld

- steht nicht im Formular und nicht in der Mappe, auch nicht im Druck der Mappe;
- steht nicht zur Auswahl, wenn du eine neue Spalte, eine neue Bedingung einer [Ansicht](sichten.md) oder ein Feld der erweiterten Suche wählst – was es schon nutzt, bleibt, wie es ist;
- behält alle **Werte**: Sie stehen weiter in der [Sicherung](sicherung.md), im [Vollexport](export.md), in exportierten PDFs mit den Angaben und in der Schnittstelle (dort ist das Feld mit `ausgeblendet: true` gekennzeichnet);
- ist **nie Pflicht** – sonst ließe sich keine Mappe mehr speichern. Beim Ausblenden hebt Ablago „Pflicht“ auf und sagt es dir; beim Einblenden kommt „Pflicht“ nicht von selbst zurück.

Wird das Feld noch genutzt – im **Titel**, in einer **Trefferliste** oder **Ansicht**, bei **Aus Dokument füllen** oder **Zum Wiederfinden**, für eine **Frist**, als Stichtag im **Archivmodus** oder in einer **Berechtigung** –, nennt Ablago das vor dem Ausblenden und fragt nach. Ausgeblendet bleibt es dort wirksam; nur in der Mappe sieht man es nicht mehr. Einblenden geht jederzeit: Haken wieder weg und speichern. Die Kurzinfo über den Feldern zählt die ausgeblendeten mit („11 Felder, 2 ausgeblendet“), in der Liste tragen sie die Markierung *ausgeblendet*.

Bei Mappentypen aus einem **Paket** ändert ein Update das Ausblenden nicht – „Updates ändern nichts heimlich“. Bringt ein Update ein neues Feld mit, ist es sichtbar. Systemfelder (etwa an *Benutzer* oder *Post*) lassen sich nicht ausblenden.

Steht in einem ausgeblendeten Feld ein Wert, der nach einer späteren Änderung am Feld nicht mehr passt, hält er das Speichern der Mappe nicht auf – ändern lässt er sich in der Mappe ja nicht. Wer ihn über die Schnittstelle ändert, muss die Regeln des Felds einhalten.

### Anzeigen, wenn … { #anzeigen-wenn }

Ein Mappentyp soll für Lena einfach bleiben und im Betrieb trotzdem alles können – ohne zweiten Mappentyp für dieselbe Sache. Dafür legst du an einem **Feld** oder an einem **Abschnitt** (unter dem Feldregister, **Anzeigen, wenn …**) fest, wann es zu sehen ist. Beispiele: Abschnitt *Miete* nur bei Vertragsart *Miete*, Abschnitt *Abschluss* nur, wenn die Ablage [beruflich genutzt](nutzung.md) wird.

Bedingungen kommen aus demselben Baukasten wie bei [Ansichten](sichten.md#bedingungen):

- **Ablage wird beruflich genutzt** – das [Merkmal der Ablage](nutzung.md);
- **Feldwert der Mappe** – gleich, ist einer von, leer, nicht leer und die übrigen Vergleiche der Feldart, mit festen Werten (bei Datum auch „heute“);
- **Verweis zeigt auf eine bestimmte Mappe** – ein Verweisfeld mit „zeigt auf“, z. B. Vertragsart *Miete*;
- **Verweis zeigt auf eine Mappe vom Typ …** – z. B. „*betrifft* ist ein Fahrzeug“; sinnvoll bei Verweisen auf Mappen verschiedener Typen.
- **Verweis zeigt auf eine eigene Organisation** – z. B. Abschnitt *Ausgangsrechnung*, wenn *Von* die [eigene Organisation](organisation.md) ist.

Jede Bedingung lässt sich umkehren (**trifft nicht zu**); bei mehreren wählst du **alle zutreffen** oder **eine davon zutrifft**. Ohne Bedingung ist alles zu sehen. Eine Bedingung schaut nie auf das eigene Feld bzw. auf Felder des eigenen Abschnitts – es ließe sich sonst nicht mehr einblenden. Bedingungen auf den angemeldeten Benutzer gibt es hier nicht: Was zu sehen ist, hängt nicht davon ab, wer die Mappe ansieht.

- **Abschnitt ausgeblendet** → alle Felder bis zum nächsten Abschnitt sind ausgeblendet; der nächste Abschnitt erscheint wieder normal.
- Die Mappe reagiert **sofort beim Ausfüllen**: Wählt jemand Vertragsart *Miete*, erscheint der Abschnitt *Miete*. Das gilt in der Mappe, beim Anlegen und bei **Dokument übernehmen**.
- **Werte bleiben gespeichert.** Wechselt die Vertragsart von *Miete* auf *Strom*, verschwindet der Abschnitt, seine Werte nicht. An seiner Stelle steht eine ruhige Zeile: „Abschnitt Miete ist ausgeblendet – 3 Werte bleiben gespeichert · anzeigen“. **anzeigen** holt ihn für diese Mappe zurück (mit dem Hinweis „gerade ausgeblendet“).
- **Pflicht** ist ein Feld nur, solange es zu sehen ist. Der Server prüft das beim Speichern selbst, mit derselben Auswertung wie die Oberfläche – auch über die [Schnittstelle](api.md).

**Ausblenden ist Ordnung, kein Schutz.** Bedingungen gelten nur für die Anzeige im Formular. Schnittstelle, [Vollexport](export.md), [Sicherung](sicherung.md) und [Auskunft](datenschutz.md) zeigen alle Werte, ebenso Spalten in Ansichten und Trefferlisten und der Titel der Mappe. [Berechtigungen](berechtigungen.md), die Freigabe für [KI-Dienste](#ki-dienste), die [Erkennung](#erkennung) und [Automatisierungen](automatisierungen.md) hängen nie davon ab, ob ein Feld gerade zu sehen ist. Was geheim bleiben soll, regeln die Berechtigungen.

Im Editor trägt ein Feld bzw. Abschnitt mit Bedingung ein Auge und den Satz „nur bei …“ – so wunderst du dich nicht, warum ein Feld in einer Mappe fehlt. Bedingungen, die nicht (mehr) passen – etwa weil ihr Feld entfernt wurde –, zeigt der Editor rot; gespeichert wird erst, wenn sie stimmen. Pakete bringen die Einstellung mit (`anzeigen` am Feld und am Abschnitt); „zeigt auf eine bestimmte Mappe“ geht in Paketen erst, wenn sie mitgelieferte Mappen fest benennen können – bis dahin lässt **Paket erstellen** solche Bedingungen mit Hinweis weg.

### Berechnete Felder { #berechnete-felder }

Manche Pakete rechnen selbst aus, was sich aus den Angaben ergibt – das Paket *Verträge* etwa *Kündigen bis*, *Status* oder *Pro Monat*. Solche Felder bringt das Paket in seinem Mappentyp als **berechnet** mit (im Paketformat `berechnet: true`).

- **In der Mappe nur lesbar:** Der Wert steht im Rahmen eines Felds, das sich nicht ändern lässt, darunter „berechnet von Verträge“. So überschreibt niemand einen ausgerechneten Wert aus Versehen.
- **Nur das Paket schreibt:** Ablago lässt den Wert nur vom Paket ändern, das ihn berechnet – über die Schnittstelle, mit den Rechten, die du ihm bei der Installation bestätigt hast, und mit denselben Prüfungen wie jede andere Änderung. Wer sonst schreibt – die Oberfläche, ein Skript über die [Schnittstelle](api.md), ein anderes Paket, eine [Automatisierung](automatisierungen.md) „Feld ändern“ –, bekommt eine Fehlermeldung mit dem Namen des Pakets. **Aus Dokument ausfüllen**, die [Erkennung](#erkennung), „folgt aus“ und der Demo-Generator lassen berechnete Felder aus.
- **Nie Pflicht:** Den Wert schreibt das Paket, nicht wer die Mappe anlegt.
- **Rechte-Vorschau:** Bei der Installation nennt die Rückfrage, welche Felder das Paket berechnet und dass alle die Werte sehen, die die Mappe lesen dürfen (siehe [Berechnete Felder](pakete.md#recht-berechnet)).
- **Historie ohne Rauschen:** Änderungen des Pakets an berechneten Feldern stehen je Mappe und Tag in **einem** Eintrag („Berechnet vom Paket Verträge – alle Änderungen eines Tages in einem Eintrag“). Ein Status, der sich nur durch das Datum ändert, erscheint so höchstens einmal am Tag; was am Abend wieder wie am Morgen ist, fällt aus dem Eintrag heraus. Was Menschen ändern, steht wie bisher einzeln da.

**Nicht mehr berechnet.** Entfernst du das Paket oder rechnet es nicht mehr (ein Update ohne Code, ohne Schreibrecht auf den Mappentyp), bleibt der letzte Wert stehen. Das Feld zeigt „nicht mehr berechnet“ und bleibt nur lesbar, damit niemand glaubt, der Wert werde noch nachgeführt. Im Editor steht am Feld dann **Feld wieder freigeben**: Nach dem Speichern lässt sich der Wert in der Mappe wieder von Hand ändern. Freigeben kann nur, wer Mappentypen ändern darf. Bringt ein späteres Update des Pakets das Feld wieder als berechnet mit, rechnet es wieder; nimmt ein Update die Angabe zurück, ist das Feld frei.

Selbst machen kannst du ein Feld nicht zum berechneten – das geht nur mit einem Paket, das Code mitbringt. Ein mit **Paket erstellen** erzeugtes Paket nimmt berechnete Felder als gewöhnliche Felder mit.

### Beschriftungen je Sprache { #beschriftungen-je-sprache }

Name und Beschreibung des Mappentyps, Bezeichnung und Hilfetext jedes Felds sowie die Namen von Registern und Trefferlisten kannst du in mehreren Sprachen pflegen. Neben jedem dieser Texte steht ein kleiner Sprachumschalter (**DE · EN**). Unter **DE** bearbeitest du den Ausgangstext, unter einer anderen Sprache die Beschriftung dafür. Bleibt sie leer, sieht man dort den deutschen Text. Ein Punkt am Umschalter zeigt, dass eine Beschriftung noch fehlt. Unter dem Namen steht zum Beispiel „12 von 14 Beschriftungen auf Englisch“ – das ist nur ein Hinweis, gespeichert wird trotzdem.

Bei einer **Auswahlliste** sind die Auswahlwerte die **festen Werte**: Genau sie stehen in jeder Mappe. Unter **Beschriftung der Werte** gibst du je Sprache an, wie ein Wert angezeigt wird, zum Beispiel „Electricity“ für „Strom“. Ändern der Beschriftung lässt alle gespeicherten Mappen, Ansichten und Automatisierungen unverändert – sie arbeiten mit dem festen Wert. Ändern oder entfernen des Werts selbst wirkt dagegen wie bisher: Mappen mit dem alten Wert passen dann nicht mehr. Die Suche findet einen Wert auch über seine Beschriftung. Auch die Werte von Systemfeldern wie **Stand** oder **Kanal** der Post lassen sich so beschriften.

Ansichten haben dasselbe für Name und Beschreibung. Welche Sprachen es gibt, legt später die Werkbank fest; bis dahin sind es Deutsch und Englisch.

### Formate und Datumsgrenzen

Ein **Textfeld** kann ein **Format** haben. Dann prüft Ablago die Angabe, und am Handy erscheint die passende Tastatur:

| Format | Was passt | Anzeige |
| --- | --- | --- |
| E-Mail | `name@example.org` – mit @ und einer Endung wie .de oder .org | daneben ein Knopf zum Schreiben (`mailto:`) |
| Telefon | Ziffern, + am Anfang, Leerzeichen, `/`, `-` und Klammern – keine Buchstaben, z. B. `+49 30 123456` | daneben ein Knopf zum Anrufen (`tel:`) |
| Internetseite | `www.example.org` oder `https://www.example.org`; ohne `https://` ergänzt Ablago es | daneben ein Knopf, der die Seite in einem neuen Tab öffnet |
| IBAN | Länge des Landes und Prüfziffer stimmen, z. B. `DE89 3704 0044 0532 0130 00` | in Vierergruppen |
| PLZ | in Deutschland genau 5 Ziffern, sonst frei (bis zur Höchstlänge) | – |

Bei **PLZ** wählst du das **Feld mit dem Land** (ein Text- oder Auswahlfeld desselben Mappentyps). Steht dort Deutschland (auch „DE“) oder nichts und ist die Vorgabe des Felds Deutschland, gilt die deutsche Regel. Bei jedem anderen Land ist die PLZ frei. Ohne Land-Feld gilt immer Deutschland.

Ein **Datumsfeld** kann **Frühestens** und **Spätestens** haben – ein festes Datum oder **heute**. Typisch ist *Spätestens: heute* für einen Geburtstag oder eine Erstzulassung.

Die Fehlermeldungen sagen, was zu tun ist, z. B. „Eine Telefonnummer enthält nur Ziffern, + am Anfang, Leerzeichen, /, - und Klammern.“ Dieselben Prüfungen gelten für die [Schnittstelle](api.md), für Pakete und ihre Beispiele; die Meldung nennt die Felder.

**Gespeicherte Angaben bleiben gültig.** Bekommt ein Feld nachträglich ein Format oder Grenzen, ändert Ablago keine Werte, und die Mappen landen nicht unter *Zu erledigen*. Erst wer das Feld ändert, muss eine passende Angabe eintragen; andere Felder der Mappe lassen sich wie bisher speichern. Welche Angaben nicht passen, zeigt [Werkbank → Wartung → Wartungsoperationen](texterkennung.md#angaben-die-nicht-zum-format-passen).

Die Erkennung nutzt das Format: Ein Feld mit Format Telefon gilt als Telefon, auch wenn es anders heißt, und sie schlägt nur Werte vor, die passen.

### Aus Dokument füllen

Mit dem Haken **Aus Dokument füllen** an einem Feld darf der Knopf [Aus Dokument ausfüllen](#erkennung) in einer Mappe dieses Feld aus einem Foto oder Dokument als Vorschlag füllen. Bis Version 0.216 hieß der Haken **Für die Erkennung nutzen**; die Einstellungen sind dieselben geblieben. Die Erkennung läuft in Ablago selbst, ohne KI und ohne Internet.

Hat ein Mappentyp gar kein Feld mit diesem Haken, füllt sie alle Felder, deren Art sie aus der Bezeichnung erkennt. Verweisfelder schlagen eine vorhandene Mappe des Zieltyps vor, die im Text steht – an ihren Feldern mit [Zum Wiederfinden nutzen](#zum-wiederfinden-nutzen), sonst am Titel.

Geeignet sind Text, Langtext, Zahl, Betrag, Datum, Auswahlliste, Verweis, Zeitraum und Prozent – Passwortfelder nie. Einen Zeitraum sucht die Erkennung zuerst neben der Bezeichnung des Felds („Kündigungsfrist: 3 Monate“), sonst nimmt sie den ersten im Text (mit geringer Sicherheit); ebenso den Prozentsatz („19 % MwSt.“). Ist der Haken an, wählst du optional **Was steht im Feld?** (Name oder Firma, Nummer, IBAN, E-Mail-Adresse, Telefon, Straße, PLZ, Ort …). Ohne Angabe schließt Ablago es aus Feldart, Kennung und Bezeichnung („Kundennummer“ → Nummer, „E-Mail“ → E-Mail-Adresse); was es erkannt hat, steht in der Auswahl hinter *automatisch*. Der **Erkennungshinweis** ist ein freier Text, z. B. „Kundennummer oben rechts, Muster 100-####“ – ein Muster nach dem Wort *Muster* (`#` = Ziffer, `A` = Großbuchstabe) sucht die Erkennung gezielt.

Die Pakete der Registry (z. B. *Basis*) setzen den Haken selbst. Bei einem Update übernimmt Ablago ihn nur an Feldern, an denen du noch nichts eingestellt hast; die Vorschau nennt sie unter „Aus Dokument füllen“.

### Zum Wiederfinden nutzen

Mit dem Haken **Zum Wiederfinden nutzen** sagst du Ablago, über welche Werte es **vorhandene Mappen** in einem Dokument wiederfindet. Typische Felder:

| Mappentyp | Feld |
| --- | --- |
| Vertragspartner | Kundennummer, IBAN, E-Mail, Name |
| Vertrag | Vertragsnummer, Vertragspartner (Verweis) |
| Rechnung | Rechnungsnummer |
| Fahrzeug | Kennzeichen |

Geeignet sind Text (auch mit Format IBAN, E-Mail oder Telefon), Zahl, Verweis und [Zusammengesetzt](#zusammengesetzt). Bei einem zusammengesetzten Feld zählt nur die ganze Kombination: Jede Nummer und jeder Text daraus steht im Dokument, und jede verwiesene Mappe hat sich selbst wiedergefunden – *Rechnungsnummer je Absender* findet so nur die Rechnung des Absenders, der im Brief steht. Der Haken ist unabhängig von **Eindeutig**: Eine Kundennummer muss nicht eindeutig sein, um beim Wiederfinden zu helfen.

So arbeitet Ablago damit, ohne KI und nur mit den Mappen, die die Person lesen darf:

- **Woran Ablago das erkennt:** Steht der Wert eines solchen Felds im Dokument, ist das ein **Beleg** – mit Feld und Fundstelle, z. B. „Vertragsnummer WV-1043, gefunden: … Vertrag WV-1043 vom …“. Leerzeichen, Punkte und Bindestriche in Nummern zählen nicht, `100-4711` findet also auch `100 4711`.
- **Über Verweise:** Hat ein **Verweisfeld** den Haken, zählen die Belege der Mappe, auf die es zeigt, auch für diese Mappe. So findet Ablago den Vertrag auch über seinen Vertragspartner, wenn dessen Kundennummer im Brief steht.
- **Mehrere Belege** machen einen Vorschlag sicher. Ein einzelner schwacher Beleg – etwa nur der Name – gilt als **unsicher**.
- **Schon vorhanden:** Stehen alle Werte zum Wiederfinden einer vorhandenen Mappe im Dokument, etwa dieselbe Rechnungsnummer, warnt Ablago, bevor eine zweite Mappe entsteht.
- **Vorschläge beim Zuordnen von Post:** Ein Typ, der den Haken an Namen oder Kontaktangaben hat, gilt als möglicher **Absender** (Organisation, Niederlassung, Person); ein Typ, der ihn nur an Nummern hat (z. B. Vertragsnummer), als mögliche **Zielmappe**.

Mit dem Update, das den Haken brachte, hat Ablago ihn an die Felder gesetzt, über die es bisher Mappen wiedergefunden hat: Felder mit *Für die Erkennung nutzen*, die Nummern, IBAN, Umsatzsteuer-Id, E-Mail, Internetseite, Telefon oder einen Namen enthalten. Pakete ohne diese Angabe behandelt Ablago genauso.

### Die Kennung

Unter der Kennung speichert Ablago die Werte, und die [Schnittstelle](api.md) verwendet sie. Deshalb ist sie nach dem ersten Speichern fest. Die Bezeichnung kannst du jederzeit ändern.

### Verweise: Mappen verbinden

Ein Feld der Feldart **Verweis** zeigt auf Mappen eines anderen Mappentyps (oder desselben – so entstehen Hierarchien wie Haus → Heizung → Wärmepumpe). Wähle dazu:

- **Ziel-Mappentypen** – worauf verwiesen wird, z. B. *Vertragspartner*. Auch *Benutzer* und *Rolle* sind möglich, z. B. für ein Feld „Verantwortlich“. Du kannst **mehrere** Mappentypen wählen: Eine Rechnung *betrifft* dann in **einem** Feld das Auto, die Heizung, die Wohnung oder einen Vertrag, statt für jede Art ein eigenes Feld zu haben. Wähle die Typen im Feld nacheinander aus; **Entfernen** nimmt einen wieder heraus.
- **Mehrfach** – ob mehrere Mappen gewählt werden können.
- **Alle vom selben Typ** – nur mit *Mehrere Mappen erlaubt* und mehreren Zieltypen: Ist die erste gewählte Mappe ein Fahrzeug, dürfen die weiteren nur Fahrzeuge sein. Ablago prüft das beim Speichern, auch über die [Schnittstelle](api.md).
- **Verweisart:**
    - **Zugehörigkeit** – „gehört zu“: Die Rechnung gehört zum Vertrag. Zählt später bei Auswertungen wie „alles zum Haus“ mit.
    - **Bezug** – „hat zu tun mit“: Die Rechnung kommt von diesem Aussteller. Nur eine Verknüpfung.

    Die Verweisart entscheidet auch beim **Löschen mit verknüpften Mappen** und bei der **Auskunft** ([Datenschutz in Ablago](datenschutz.md#mit-verknupften-mappen-loschen)): Mitgelöscht und vollständig herausgegeben wird nur, was über **Zugehörigkeit** dranhängt. Soll z. B. ein Vertrag mit seinem Vertragspartner gehen, stell das Feld *Vertragspartner* im Vertrag auf Zugehörigkeit (bei den Beispiel-Mappentypen ist das so).

#### Mehrere Zieltypen { #mehrere-zieltypen }

- **Beim Ausfüllen** stehen die Mappen nach Typ gruppiert zur Auswahl, die Suche geht über alle Zieltypen, und in jeder Gruppe stehen die Mappen zuerst, die die Person zuletzt geöffnet hat. Gewählte Mappen zeigen ihren Typ mit Symbol (das der Ansicht des Typs), damit „Golf“ (Fahrzeug) und „Golf“ (Vertrag) unterscheidbar sind. **+ … anlegen** gibt es je Typ, in dem die Person anlegen darf.
- **Nicht sichtbare Mappen** stehen wie bei einem Zieltyp als „(nicht sichtbar)“ da – ohne Titel und ohne Typ; die Gruppen nennen keine Anzahl.
- **Beim Speichern** prüft Ablago, dass jede verwiesene Mappe einen der Zieltypen hat (und *Alle vom selben Typ* gilt). Bestehende Felder mit einem Zieltyp bleiben, wie sie sind.
- **In Ansichten, Rechten, der erweiterten Suche und „Anzeigen, wenn …“** gibt es für solche Felder die Bedingung **zeigt auf Mappe vom Typ …**, z. B. „*betrifft* zeigt auf Mappe vom Typ Fahrzeug“ ([Ansichten](sichten.md), [Berechtigungen](berechtigungen.md#zeigt-auf-mappe-vom-typ)).
- **Auswahlfilter** (nächster Abschnitt) gehen über die Felder, die alle Zieltypen gemeinsam haben (gleiche Kennung und Feldart). **Folgt aus** und das Umwandeln aus einem Textfeld ([Pakete](pakete.md)) gehen nur mit genau einem Zieltyp. **Beim Auswählen übernehmen** gilt je Zieltyp, der das Feld hat ([unten](#vorbelegen)).
- **Löschen eines Zieltyps:** Ist er einer von mehreren, nimmt Ablago ihn beim Löschen aus dem Feld heraus. Ist er der einzige, verhindert das Feld das Löschen wie bisher.
- **Aus Paketen** können Zieltypen kommen, von denen das Paket nicht abhängt (*optional*, z. B. *Rechnung › betrifft* → Fahrzeug, wenn das Paket Fahrzeuge installiert ist). Ablago nimmt so einen Typ auf, sobald es ihn gibt – auch, wenn das andere Paket erst später kommt. Im Editor steht darunter „Kommt dazu, sobald installiert: …“. Fehlt der Typ, bleibt das Feld trotzdem; hat es noch gar keinen Zieltyp, sagt das Formular, dass die Typen mit einem anderen Paket kommen.

#### Auswahl einschränken

In der Zeile unter Ziel-Mappentyp, Art des Verweises und *Mehrere Mappen erlaubt* legst du mit **Nur Mappen, die …** fest, welche Mappen das Feld anbietet – etwa beim Feld *Arzt* im Arztbericht nur Vertragspartner mit *Art = Arzt*. Die Bedingungen funktionieren wie bei [Ansichten](sichten.md): Felder des Zieltyps und Systemwerte (angelegt, geändert, von wem), feste und dynamische Werte (heute ± n, aktueller Benutzer, seine Rollen). Mehrere Bedingungen gelten zusammen. Darunter steht, wie viele Mappen passen, z. B. „12 von 85 Vertragspartner passen“.

- In der Mappe bietet die Suche im Feld nur passende Mappen an – und nur solche, die der Benutzer lesen darf. **+ … anlegen** öffnet ein Fenster für die neue Mappe und belegt sie mit dem vor, was sich eindeutig aus dem Filter ergibt (z. B. *Art = Arzt*).
- **Streng:** Ein neuer oder geänderter Wert muss passen, sonst lehnt Ablago das Speichern ab – auch über die [Schnittstelle](api.md).
- **Bestehende Werte bleiben gültig**, auch wenn die Ziel-Mappe später nicht mehr passt oder du den Filter änderst. Am Feld steht dann gelb, womit sie nicht passt: „passt nicht zu „Organisation““, wenn der Filter einen Wert dieser Mappe nimmt (siehe unten), sonst „passt nicht zur Auswahlregel dieses Felds“. Wer die Mappe bearbeiten darf, sieht über den Registern außerdem die Zeile „Achtung: Niederlassung passt nicht zu „Organisation“.“ – ein Klick springt zum Feld; sie verschwindet, sobald es passt. Speichern bleibt möglich. Über die [Schnittstelle](api.md) liefert die Mappe dasselbe unter `konflikte`.
- Beim Speichern des Mappentyps meldet Ablago Bedingungen auf Felder, die es im Zieltyp nicht (mehr) gibt.
- Nicht bei Feldern, die auf jede Mappe zeigen.

**Werte aus dieser Mappe:** Statt eines festen Werts kann eine Bedingung einen Wert der eigenen Mappe nehmen – Haken **Wert aus dieser Mappe** und das Feld wählen. Beispiele: *Fachgebiet* (am Arzt) *ist einer von* **Fachgebiet dieser Mappe**; *Vertragspartner* (am Vertrag) *zeigt auf* **Vertragspartner dieser Mappe**.

- Angeboten werden nur Felder mit passender Feldart: Text zu Text, Zahl zu Zahl, Datum zu Datum, ein Auswahlfeld, dessen Werte es auch am Ziel gibt, ein Verweisfeld auf denselben Mappentyp. Das Verweisfeld selbst geht nicht.
- Ändert man in der Mappe das eigene Feld, filtert die Auswahl sofort neu. Passt eine schon gewählte Mappe nicht mehr, steht der Hinweis mit dem Namen des eigenen Felds schon vor dem Speichern am Feld.
- **Ist das eigene Feld leer**, gilt die Bedingung nicht – dann werden alle angeboten, die die übrigen Bedingungen erfüllen.
- Ablago prüft beim Speichern mit den Werten, die gespeichert werden sollen – auch wenn beide Felder im selben Zug geändert werden.
- Werte aus Mappen, auf die diese Mappe verweist (eine Ebene weiter), gibt es nicht – dafür gibt es **Folgt aus** (nächster Abschnitt).

#### Folgt aus

Manche Verweise ergeben sich aus einem anderen: Eine Niederlassung gehört zu genau einer Organisation, eine Wohnung zu einem Objekt, ein Vertrag zu seinem Vertragspartner. Unter **Folgt aus** wählst du ein anderes Verweisfeld dieser Mappe und darunter, welche **Angabe** der Mappe dort übernommen wird – etwa bei der Person: *Organisation* folgt aus *Niederlassung*, Angabe *Organisation*. Zusammen mit einem Auswahlfilter (Niederlassung *Organisation* zeigt auf **Organisation dieser Mappe**) geht es in beide Richtungen: Niederlassung gewählt → die Organisation füllt sich; Organisation gewählt → nur ihre Niederlassungen.

- **Nur ein leeres Feld** füllt sich, markiert mit „aus Niederlassung“. Steht schon etwas anderes darin, fragt Ablago: „Organisation ändern?“ – still überschrieben wird nie.
- **Eine Vorbelegung, keine Sperre:** Von Hand lässt sich jederzeit etwas anderes eintragen. Passt die Quelle dann nicht mehr, fragt Ablago, ob sie geleert werden soll („Niederlassung leeren?“) – mit **Behalten** bleibt alles, wie es ist, und am Feld steht der gelbe Hinweis. Ein Auswahlfilter auf dem anderen Feld bleibt streng: Eine **neu** gewählte Mappe, die nicht dazu passt, nimmt Ablago weiterhin nicht an.
- **Hat das Ziel keinen Wert** (eine Niederlassung ohne Organisation), passiert nichts.
- **Nur, was man lesen darf:** Darf die Person die Organisation nicht lesen, füllt sich nichts.
- **Bestehende Mappen** schreibt Ablago nicht um. Passen ihre Angaben nicht zusammen, zeigt die Mappe die gelbe Zeile über den Registern.
- **Überall gleich:** in der Oberfläche, über die [Schnittstelle](api.md) (Ablago füllt beim Speichern, wenn die Anfrage das Feld nicht selbst nennt) und bei **Aus Dokument ausfüllen** – erkennt Ablago die Niederlassung, kommt die Organisation als Vorschlag dazu.
- Beim Speichern des Mappentyps prüft Ablago: Beide Felder gibt es, die Quelle ist ein Verweisfeld mit **einer** Mappe, die Angabe zeigt auf denselben Mappentyp wie dieses Feld, und kein Feld folgt im Kreis aus einem anderen. Ketten gehen (Ansprechpartner → Organisation, Vertrag → Ansprechpartner).
- In [Paketen](pakete.md) heißt die Eigenschaft `folgtAus: { feld: niederlassung, zielFeld: organisation }` (ab Ablago 0.225).

#### Beim Auswählen übernehmen { #vorbelegen }

Manche Mappen bringen typische Angaben mit: Eine *Vertragsart* „Mobilfunk“ kennt die übliche Kündigungsfrist, eine *Versicherungsart* die Zahlweise. Unter **Beim Auswählen übernehmen** legst du am Verweisfeld Paare fest – *Feld der verwiesenen Mappe* → *in dieses Feld*, etwa *Kündigungsfrist* → *Kündigungsfrist*. **+ Feld übernehmen** schlägt zuerst gleichnamige Felder vor. Am Feld steht dann der Chip „übernimmt 3 Felder“.

- **Nur leere Felder:** Wählt jemand eine Vertragsart, schlägt Ablago deren Werte in den leeren Feldern vor, markiert mit „vorgeschlagen aus Vertragsart Mobilfunk“ (wie im Einrichtungsassistenten). Was schon drinsteht, bleibt – still überschrieben wird nie. Jeder Vorschlag lässt sich ändern oder mit **Zurücknehmen** wieder leeren.
- **Andere Mappe gewählt, noch nicht gespeichert:** Vorschläge der vorher gewählten Mappe, die noch unverändert dastehen, ersetzt Ablago durch die der neuen – so bleibt keine Mobilfunk-Frist an einem Stromvertrag hängen. Was die Person selbst eingetragen oder geändert hat, bleibt.
- **Überall, wo man auswählt:** beim Anlegen und Bearbeiten, mit „+ Neu“ aus der verwiesenen Mappe heraus, bei **Aus Dokument ausfüllen** und auf der Seite **Dokument übernehmen**. Erkennt Ablago die Vertragsart im Dokument, kommen ihre Werte als Vorschlag dazu; steht ein Wert im Dokument selbst (etwa die Frist), gilt der aus dem Dokument.
- **Nur, was die Person lesen darf:** Die Werte holt Ablago mit den Rechten der Person – darf sie die Vertragsart nicht lesen, kommt nichts; zeigt ein übernommener Verweis auf eine Mappe, die sie nicht lesen darf, fällt er weg. **Passwortfelder** stehen weder als Quelle noch als Ziel zur Wahl, **berechnete Felder** ([oben](#berechnete-felder)) bekommen nie einen Vorschlag. Werte aus der Vertragsart gehen nie an ein [KI-Paket](pakete.md#ki-dienste), auch nicht bei der Erkennung.
- **Passende Felder:** Beide Felder haben dieselbe Feldart (Text auch in Langtext); Mehrfachwerte nur in Felder mit mehreren Werten; bei Auswahl muss es jede Option der Quelle auch im Ziel geben, bei Verweisen jeden Zieltyp. Ein Wert, der im Ziel nicht gültig wäre (zu lang, unbekannte Option), wird nicht vorgeschlagen. „Anzeigen, wenn …“ gilt: Ein Feld, das mit den neuen Werten nicht zu sehen ist, bekommt nichts.
- **Mehrere Zieltypen:** Ein Paar gilt für jeden Zieltyp, der das Feld hat (gleiche Kennung); Typen ohne das Feld übergehen es. Zur Wahl stehen die Felder aller Zieltypen.
- **Speichern füllt nichts von selbst:** Es sind Vorschläge in der Oberfläche. Über die [Schnittstelle](api.md) gespeicherte Mappen bleiben, wie die Anfrage sie schickt.
- Beim Speichern des Mappentyps prüft Ablago: Die Felder gibt es, sie passen zusammen, keines ist ein Passwortfeld, jedes Zielfeld kommt nur einmal vor.
- In [Paketen](pakete.md) heißt die Eigenschaft `vorbelegen: [{ von: kuendigungsfrist, nach: kuendigungsfrist }]` (ab Ablago 0.234).

Auf eine Mappe, auf die noch verwiesen wird, kann niemand sie löschen.

### Passwortfelder

Ein Feld der Feldart **Passwort** nimmt z. B. das Kennwort eines Online-Zugangs auf. Ablago speichert es verschlüsselt mit dem Schlüssel aus **Werkbank → [Verschlüsselung](verschluesselung.md)**; solange es keinen gibt, lässt sich kein Wert speichern, und das Feld weist darauf hin.

- In der Mappe steht nur „••••••••“. Das Auge zeigt das Passwort – und jedes Anzeigen steht im [Protokoll](fehlersuche.md) mit Benutzer, Mappe und Feld, nie mit dem Wert.
- Passwortfelder erscheinen nie im Titel, in der Trefferliste, in der Suche, in Bedingungen von Ansichten oder in Demo-Daten.
- Über die [API](api.md) gibt es Passwörter nur mit einem Schlüssel, der das Recht „Passwörter lesen“ hat.

### Formatierter Text

Ein Feld der Feldart **Formatierter Text** nimmt längere Texte mit einfacher Formatierung auf: fett, kursiv, Überschriften, Listen, Zitate und Links. Benutzer schreiben mit einer kleinen Werkzeugleiste und sehen eine Vorschau; gespeichert wird der Text als Markdown.

- Rohes HTML gibt es nicht, und Links sind nur mit `http(s)` oder `mailto` möglich – ein Text kann so nichts im Browser ausführen.
- In Titel, Trefferliste und Suche erscheint der Text ohne Formatierung, in Listen gekürzt.
- Mit **@** lässt sich ein Benutzer erwähnen; er bekommt dann eine [Aufgabe](aufgaben.md).
- Ein bestehendes Langtextfeld kannst du auf *Formatierter Text* umstellen; die Texte bleiben, wie sie sind.

### Fristen an Datumsfeldern { #fristen-erinnerungen-an-datumsfeldern }

An einem **Datumsfeld** wie „Kündigung bis“ oder „HU fällig“ kannst du **Ist eine Frist** einschalten. Dann steht das Datum unter „Zu erledigen“ und im Kalender, und es löst das Ereignis *Datum erreicht* aus.

**Wann und an wen Ablago erinnert, stellst du in einer [Automatisierung](automatisierungen.md) ein** – Wenn-Karte *Datum erreicht*:

- **Vorlaufzeit** – wie lange vorher, in Tagen, Wochen oder Monaten. Bei 4 Wochen und dem 30.09. erscheint die Frist am 02.09.
- **Empfänger** – zum Beispiel der Benutzer in einem Feld, das auf Benutzer verweist (z. B. „Verantwortlich“), sonst wer die Mappe angelegt hat. Abwesenheit und Vertretung gelten wie bei allen [Aufgaben](aufgaben.md).
- **Text** mit Platzhaltern wie dem Datum und dem Titel der Mappe.
- **Wiederkehrend** – monatlich, vierteljährlich, halbjährlich, jährlich oder alle paar Jahre. Wer die Frist erledigt, bekommt den Vorschlag „Datum auf 30.09.2028 setzen“; das Datum ändert sich **nie von selbst**, und die Änderung steht wie jede andere in der Historie der Mappe.

Pakete bringen passende Automatisierungen mit, zum Beispiel „Kündigung bald fällig“. Beim Installieren fragt Ablago, welche gleich eingeschaltet werden sollen (Vorgabe: alle). Für einen eigenen Mappentyp legst du die Automatisierung selbst an.

**Seit Version 0.177 erinnert nur noch die Automatisierung.** Früher stellte man Vorlauf, Empfänger und Text direkt am Feld ein. Beim Update hat Ablago jede dieser Erinnerungen **einmal** als eingeschaltete Automatisierung *Erinnerung: Feld (Mappentyp)* übernommen – mit derselben Vorlaufzeit, demselben Empfänger (ist das Feld leer: der Ersteller), demselben Text und derselben Wiederholung. Es erinnert also alles wie bisher; die Werkbank-Übersicht sagt einmal, was umgezogen ist. Eine übernommene Automatisierung, die du löschst, kommt nicht wieder. Bringt ein Paket-Update später eine eigene Automatisierung für dasselbe Feld mit, ersetzt sie die übernommene, solange du diese nicht geändert hast – doppelt erinnert wird nie.

So verhalten sich Fristen:

- Die Automatisierung prüft jeden Tag zur eingestellten Uhrzeit (Vorgabe 07:00) und beim Speichern einer Mappe: Liegt das Datum schon im Vorlauf, kommt die Frist sofort. Je Person, Mappe, Feld und Datum entsteht **höchstens eine** Frist – auch nach dem Erledigen nicht noch einmal.
- Wird das Datum **geändert oder geleert**, erledigt sich eine offene Frist von selbst (mit Eintrag in der Historie der Mappe); für das neue Datum entsteht zur rechten Zeit eine neue.
- Daten, die schon vorbei sind, erzeugen keine Frist mehr.
- Darf der Empfänger die Mappe nach den [Berechtigungen](berechtigungen.md) nicht lesen, bekommt er die Frist trotzdem; unter *Werkbank → Benachrichtigungen und Aufgaben* steht dann ein Hinweis.
- Eine zusätzliche E-Mail am Stichtag gibt es nicht – die Fristen stehen in der täglichen Zusammenfassung.

## Wenn sich ein Mappentyp ändert

Du kannst Mappentypen jederzeit ändern, auch wenn es schon Mappen gibt:

- **Felder ausblenden** statt entfernen: Das Feld verschwindet aus der Mappe, alles andere bleibt (siehe [Felder ausblenden](#felder-ausblenden)).
- **Felder entfernen** löscht keine Werte. Sie bleiben an der Mappe und erscheinen dort als „Werte ohne Felddefinition“. Fügst du das Feld mit derselben Kennung wieder hinzu, sind sie wieder da.
- **Formate und Datumsgrenzen** machen gespeicherte Angaben nicht ungültig (siehe [oben](#formate-und-datumsgrenzen)).
- **Neue Pflichtfelder, strengere Regeln, entfernte Auswahlwerte:** Mappen, die nicht mehr passen, werden markiert und bekommen eine [Aufgabe](aufgaben.md) „Passt nicht“ für ihren Ersteller; so landen sie bei ihm unter [Zu erledigen](https://help.ablago.app/benutzer/eingang/). Die Aufgabe erledigt sich, sobald die Mappe wieder passt. Nichts wird stillschweigend geändert. Über dem Mappentyp steht, wie viele Mappen betroffen sind.

![Zu erledigen in der Ablage](bilder/eingang.png)

## Titel einer Mappe

Die **Vorlage** bestimmt, wie eine Mappe in Listen und Verweisen heißt, z. B. `{rechnungsnummer} vom {rechnungsdatum}`. Felder in geschweiften Klammern werden eingesetzt, alles andere bleibt stehen. Daneben gibt es `{angelegt}` und `{geaendert}` (jeweils das Datum). Die Vorschau zeigt das Ergebnis mit Beispielwerten oder mit den Werten einer echten Mappe.

Verweist der Titel auf eine andere Mappe (`{vertragspartner}`), wird der Titel nachgezogen, wenn sich der Vertragspartner ändert.

Ohne Vorlage verwendet Ablago das erste Textfeld.

### Platzhalter formatieren

Hinter einem senkrechten Strich `|` kannst du einen Platzhalter **formatieren**, ohne ein zusätzliches Feld anzulegen. Mehrere Filter lassen sich hintereinander schreiben, zum Beispiel `{partner|kurz:20|gross}`.

| Filter | Wirkung | Beispiel | Ergebnis |
| --- | --- | --- | --- |
| `jahr`, `monat` | Teil eines Datums | `{rechnungsdatum|jahr}` | 2026 |
| `datum:"…"` | Datum im eigenen Format mit `TT`, `MM`, `JJJJ`, `JJ` | `{rechnungsdatum|datum:"MM/JJJJ"}` | 10/2026 |
| `ohne_waehrung` | Betrag ohne Währungszeichen | `{betrag|ohne_waehrung}` | 1.234,50 |
| `gross`, `klein` | Groß- bzw. Kleinschreibung | `{kennzeichen|gross}` | DD-AB 123 |
| `kurz:n` | auf n Zeichen kürzen, mit „…“ | `{betreff|kurz:30}` | Ihre Rechnung zum Vertrag 12… |
| `sonst:"…"` | Ersatz, wenn das Feld leer ist | `{nummer|sonst:"ohne Nr."}` | ohne Nr. |

`jahr`, `monat` und `datum` gehen bei Datumsfeldern und bei `{angelegt}` und `{geaendert}`, `ohne_waehrung` nur bei Beträgen.

**Leere Teile fallen weg.** Ist ein Feld leer, verschwindet es samt seinem Trenner (` – `, ` · `, ` | `, ` / `, `, `, ` › `). Aus `{bezeichnung} – {vertragsnummer} – {beginn|jahr}` wird bei fehlender Vertragsnummer „Strom – 2026“ statt „Strom –  – 2026“.

Bewusst gibt es **keine** Bedingungen, Schleifen oder Rechnungen im Titel. Unbekannte Filter oder ein Filter am falschen Feld meldet der Editor sofort, die Vorschau zeigt das Ergebnis.

!!! note "Bestehende Titel"
    Alte Vorlagen ohne Filter gelten unverändert. Neu ist nur, dass leere Teile samt Trenner wegfallen. Das wirkt, sobald ein Titel neu gebildet wird, also beim nächsten Speichern der Mappe oder des Mappentyps.

## Trefferlisten

Eine **Trefferliste** legt fest, welche Angaben in einer Liste als Spalten erscheinen, und in welcher Reihenfolge – Felder und Systemwerte (Titel, angelegt/geändert am/von).

- Ist die Liste **breit**, wird sie zur sortierbaren Tabelle mit diesen Spalten.
- Ist sie **schmal**, bilden die ersten drei Spalten den kompakten Eintrag: die erste fett, die zweite und dritte darunter.

Hat eine Trefferliste keine Spalten, zeigt die Ablage den Titel und zwei weitere Felder.

Ein Mappentyp kann **mehrere** Trefferlisten haben, z. B. *Standard* mit allen Angaben und *Kurz* mit Titel, Betrag und *bezahlt*. Mit **+ Trefferliste** legst du eine weitere an (sie beginnt mit den Spalten der Standardliste).

- Jede Liste hat einen **Namen** und eine feste **Kennung**; über sie wählen [Ansichten](sichten.md#trefferliste) und Verknüpfungsregister die Liste.
- **Genau eine** ist **Standard**: Sie gilt überall, wo keine andere gewählt ist. Mindestens eine Liste bleibt immer.
- Unter jeder Liste steht, **wo sie verwendet** wird (Ansichten, Register). Entfernst du eine verwendete Liste, gilt dort die Standardliste.

![Zwei Trefferlisten am Mappentyp Rechnung](bilder/werkbank-trefferlisten.png)

![Die Trefferliste als Tabelle in der Ablage](bilder/tabelle.png)

## Register

Register sind die Trennblätter einer Mappe, in der angegebenen Reihenfolge:

| Art | Inhalt |
| --- | --- |
| **Feldregister** | eine Gruppe von Feldern; welches Feld auf welchem Register liegt, stellst du am Feld ein |
| **Dokumentenregister** | hochgeladene Dateien; PDFs und Bilder sind direkt ansehbar. **Volltext erzeugen** (Standard: an) schickt neue Dokumente durch die [Texterkennung](texterkennung.md) |
| **Verknüpfungsregister** | Mappen, die auf diese Mappe verweisen – alle oder nur bestimmte (z. B. „Rechnungen“ nur über das Feld *Vertrag*). Als Quelle lässt sich auch *Post › Zugeordnet zu* wählen: Dann steht hier die Post, die dieser Mappe zugeordnet ist, z. B. verschickte E-Mails und eingegangene Briefe |
| **Historienregister** | die Historie der Mappe: wer wann was geändert hat, mit altem und neuem Wert; dazu Dokumente, Papierkorb, Notizen, Aufgaben, E-Mails, angezeigte Passwörter (ohne Wert) und Abrufe. Unter **Zeigt** hakst du an, welche Arten von Einträgen es zeigt (siehe unten). Mehrere je Mappentyp möglich |

**Versionierung einschalten** (Standard: aus) an einem Dokumentenregister: Beim Ersetzen bleibt die alte Version erhalten und lässt sich wieder hervorholen. Mit **Nur die letzten … Versionen behalten** räumt Ablago ältere Versionen samt ihren Dateien auf (leer = alle behalten). Schaltest du die Versionierung ein, gilt jedes vorhandene Dokument als Version 1; schaltest du sie aus, bleiben vorhandene ältere Versionen sichtbar, neue entstehen keine mehr. Ohne Versionierung gibt es kein Ersetzen – über die Schnittstelle kommt dann eine verständliche Fehlermeldung. Das Ein- und Ausschalten steht im [Protokoll](fehlersuche.md#protokoll) beim Speichern des Mappentyps. Wie es für Benutzer aussieht, steht im Benutzerhandbuch unter [Versionen verstehen](https://help.ablago.app/benutzer/aktuell/versionen/).

!!! tip "Warum die Versionierung einschalten?"
    Wer bisher im Dateimanager ablegt, erwartet, dass eine neue Datei die alte überschreibt – und hängt deshalb `_v2` oder `_final` an den Namen. Mit Versionierung legt man einfach die neue Fassung ab, die alte bleibt darunter und lässt sich zurückholen. Für Register wie *Vertragsunterlagen* oder *Belege* lohnt sich das fast immer. **Nur die letzten … Versionen behalten** brauchst du nur, wenn Speicherplatz knapp ist: Ältere Versionen löscht Ablago dann von selbst, sie lassen sich nicht mehr zurückholen.

**Was ein Historienregister zeigt** (*Vorschlag umgesetzt*, Issue #800): Ablago schreibt **immer alles** in die Historie – kein Haken schaltet das Mitschreiben ab, auch im [Archivmodus](archiv.md) nicht. Am Register stellst du nur ein, was es **anzeigt**: *Anlegen, Papierkorb und Post*, *Felder geändert*, *Dokumente*, *Notizen*, *Aufgaben*, *E-Mail, Weitergeben und Auskunft*, *Rechte auf Zeit*, *Herunterladen*, *Abrufe über die API* und *Abrufe über das Laufwerk (WebDAV)*. Die **Vorauswahl von Ablago** ist alles außer den drei Arten von Abrufen – so sieht die Historie im Alltag aus wie bisher. Einträge **im Verwaltungsmodus** zeigt jedes Historienregister, gleich wie es eingestellt ist. Mit mehreren Registern trennst du, was zusammengehört, zum Beispiel *Verlauf* (Vorauswahl) und *Abrufe* (nur Herunterladen, API und Laufwerk). Wer die Mappe lesen darf, kann am Register vorerst **Alles anzeigen** wählen.

Ein **Abruf** ist ein echter Inhaltsabruf einer Datei: Herunterladen in der Oberfläche (auch mit Stempel, als ältere Version, Archiv- oder umgewandelte Fassung, als Export mit Dokumenten), jeder Abruf mit dem API-Schlüssel einer Person (auch Seitenbilder) und jedes Lesen über das [Laufwerk](webdav.md). Ansehen im Browser, Ordnerabfragen des Laufwerks und Pakete, die Dateien in Ablago verarbeiten (etwa die Texterkennung), zählen nicht. Damit Explorer, Finder und Office die Historie nicht füllen, steht derselbe Abruf – dieselbe Person, Datei und Fassung auf demselben Weg – **einmal je Kalendertag** da (Zeitzone der [Region](region.md)); ein Abruf an einem späteren Tag bekommt einen eigenen Eintrag. Die Historie bleibt vollständig, solange die Mappe besteht, für alle Arten von Einträgen; sie geht mit [Sicherung](sicherung.md), [Vollexport](export.md) und [Auskunft](datenschutz.md).

Register haben feste Kennungen, damit Dokumente ihr Register behalten, wenn es umbenannt wird. Ein Dokumentenregister, in dem schon Dokumente liegen, lässt sich nicht entfernen.

**Register ausblenden** (#655): Mit dem Haken **Ausblenden** am Register zeigt die Mappe es nicht mehr. Die Felder darauf gelten als ausgeblendet – mit allem, was unter [Felder ausblenden](#felder-ausblenden) steht: Werte bleiben, nie Pflicht, Nachfrage, wenn sie noch genutzt werden. Dokumentenregister lassen sich nicht ausblenden (dorthin gehen hochgeladene Dateien und zugeordnete Post), ebenso wenig Register mit Systemfeldern; ein Register muss sichtbar bleiben. Ein Paket-Update blendet nichts wieder ein.

### Abschnitte im Feldregister { #abschnitte }

Ohne Abschnitte legt die Mappe die Felder eines Registers in ein Raster – so viele nebeneinander, wie passen. Mit **+ Abschnitt** am Feldregister bestimmst du, wo eine neue Zeile beginnt und welche Felder zusammengehören. Unter dem Register stehen dazu seine Felder in ihrer Reihenfolge, die Abschnitte dazwischen:

- **Mit Überschrift**: Die Mappe zeigt eine dünne Linie und die Überschrift, das nächste Feld beginnt in einer neuen Zeile. So stehen etwa bei einer Person *Anrede, Titel, Vorname, Nachname* in einer Zeile, darunter *Kontakt* und *Anschrift* – in **einem** Register statt in mehreren. Wer die Register lieber behält, behält sie.
- **Ohne Überschrift**: nur der Zeilenumbruch, keine Linie – zum Beispiel, damit der *Geburtstag* unter dem Namen beginnt.
- **eingeklappt** (nur mit Überschrift): Der Abschnitt ist beim Öffnen einer Mappe zu – gut für Seltenes wie eine *Bankverbindung*. Die Kopfzeile zeigt, was drinsteckt („Bankverbindung · 2 von 3 ausgefüllt“), ein Klick oder **Enter** klappt auf. Was jemand auf- oder zuklappt, merkt sich Ablago **je Person** in den persönlichen Einstellungen, auf jedem Gerät; die Einstellung am Mappentyp ist nur die Vorgabe. Von selbst auf klappt ein Abschnitt, wenn darin ein **Pflichtfeld leer** ist oder die **Suche** bzw. ein **Link auf ein Feld** darin zeigt (beides beim Öffnen), wenn beim Speichern ein **Fehler** darin steckt oder **Aus Dokument ausfüllen** dort Vorschläge macht.

Einen Abschnitt verschiebst du mit den Pfeilen, per **Alt+↑/↓** am Griff **⠿** oder durch Ziehen auf ein Feld – er beginnt dann vor diesem Feld. Ein Abschnitt hängt an seinem ersten Feld: Verschiebst du das Feld unter **Felder**, wandert er mit; ziehst du das Feld auf ein anderes Register, beginnt der Abschnitt beim nächsten Feld. Die Überschrift lässt sich wie Namen übersetzen ([Beschriftungen je Sprache](#beschriftungen-je-sprache)).

Abschnitte sind **nur Darstellung**: Die Feldliste bleibt; Export, PDF der Angaben, Druck und Schnittstelle zeigen immer alles, auch was in eingeklappten Abschnitten steht. In schmaler Ansicht (Handy) steht ein Feld je Zeile; Abschnitte zeigen dort nur ihre Überschrift, ein Umbruch ohne Überschrift wirkt nicht. Die Schnittstelle liefert die Abschnitte am Register (`abschnitte: [{ vor, titel, eingeklappt }]`), damit Apps sie als gruppierte Liste zeigen können. Pakete bringen sie mit; ein Update ergänzt Abschnitte nur an Registern, die noch keine haben. Ob ein Abschnitt zu sehen ist, kann von einer Bedingung abhängen: [Anzeigen, wenn …](#anzeigen-wenn).

**Verknüpfungsregister als Tabelle:** Hakst du eine Quelle an, kannst du daneben eine [Trefferliste](#trefferlisten) des Quelltyps wählen. Das Register zeigt die verweisenden Mappen dann als Tabelle mit deren Spalten (z. B. beim Vertragspartner die Rechnungen mit Betrag, Datum und *bezahlt*). Ohne Auswahl – oder wenn es die Liste nicht mehr gibt – bleibt es bei der einfachen Liste der Titel.

## Ziehen statt klicken

Felder, Register, [Abschnitte](#abschnitte) und die Spalten jeder Trefferliste haben einen **Griff ⠿**. Daran ziehst du einen Eintrag an eine andere Stelle; eine Linie zeigt, wo er landet. Ein **Feld** kannst du außerdem auf ein **Feldregister** ziehen – es liegt dann auf diesem Register.

Das ändert nur den Entwurf; übernommen wird es wie alles andere mit **Mappentyp speichern**. Per Tastatur: Griff ansteuern und **Alt+↑/↓**. Am Smartphone den Griff lange antippen, dann ziehen. Die Pfeil-Knöpfe gibt es weiterhin.

## Systemmappentypen: Benutzer, Rolle und Post

*Benutzer*, *Rolle* und *Post* sind **Systemmappentypen**, erkennbar am Kennzeichen *System*. Sie entstehen von selbst und lassen sich nicht löschen.

![Systemmappentyp Benutzer](bilder/werkbank-systemtyp.png)

- Du kannst sie um eigene Felder und Register erweitern, z. B. eine Telefonnummer.
- Ihre **Systemfelder** (Name, E-Mail-Adresse, Rollen, Aktiv bzw. Name der Rolle) sind fest: Bezeichnung, Hilfetext und Register darfst du ändern, Feldart und Eigenschaften nicht.
- Mappen vom Mappentyp *Benutzer* lassen sich in der Ablage weder anlegen noch löschen (Systemregel) – Benutzer entstehen in der Benutzerverwaltung.
- **Post** ist alles, was in Ablago kommt oder hinausgeht ([Benutzerhandbuch: Post](https://help.ablago.app/benutzer/post/)). Systemfelder: *Betreff*, *Stand* (Neu, Zugeordnet, Erledigt), *Kanal* (Hochgeladen, E-Mail, Scan, Ordner, Import, API, WebDAV), *Richtung*, *Datum*, *Von*, *An*, *An (Adresse)*, *Zugeordnet zu* und *Nachricht*.
    - Post entsteht über **+ Post** in den Ansichten mit Post, über die [Schnittstelle](api.md) (`POST /api/v1/post`) und beim [Versenden per E-Mail](https://help.ablago.app/benutzer/versenden/). Über das allgemeine Formular „+ Neu“ legt man keine Post an. Wer Post anlegen darf, regeln die [Berechtigungen](berechtigungen.md) (C) wie bei jedem Mappentyp.
    - *Kanal* hält Ablago fest, *Zugeordnet zu* setzt **Zuordnen**. Bei versendeten E-Mails sind auch Betreff, *An (Adresse)*, *Von*, Datum, Nachricht und Richtung fest.
    - *Zugeordnet zu* darf als einziges Feld auf Mappen *jedes* Mappentyps zeigen, auch auf mehrere. Wird eine dieser Mappen gelöscht, bleibt die Post erhalten; nur der Verweis entfällt.
    - *An* verweist auf einen Benutzer: Solange die Post neu ist, hat er die Aufgabe *Post für dich* unter „Zu erledigen“ – nur ein Benutzer bekommt sie. *An (Adresse)* hält bei versendeten E-Mails die Adressen fest.
    - **Von und An (0.242, #1042):** Die Felder hießen bis 0.241 *Absender* (Kennung `absender`), *Für* (`fuer`) und *Empfänger* (`an`, jetzt `an_adresse`). Jetzt heißen sie wie bei Verträgen und Rechnungen `von` und `an`. Das Update zieht alles um, was die alten Kennungen nennt: Werte, Ansichten und ihre Bedingungen, Trefferlisten, Titel-Vorlage, [Berechtigungen](berechtigungen.md), [Automatisierungen](automatisierungen.md) samt Platzhaltern (`{absender}` → `{von}`, `{fuer}` → `{an}`) und Verknüpfungsregister anderer Typen. Rechte-Regeln wirken danach genau wie vorher. Eigene Bezeichnungen bleiben; die alten Standardbezeichnungen werden zu *Von*, *An* und *An (Adresse)*. Hattest du am Typ Post selbst ein Feld `von` angelegt, heißt es danach `von_alt`. Die [Schnittstelle](api.md#post-von-und-an) versteht die alten Namen bis 1.0.0.
    - Beim ersten Start legt Ablago die Ansichten **Neue Post** (ganz oben, Stand *Neu*) und unter **Post** die Ansichten **Eingegangen** und **Versendet** an. Du kannst sie ändern, verschieben oder löschen; gelöschte kommen nicht wieder.
    - **Aus E-Mail wird Post (0.41):** Der frühere Systemtyp *E-Mail* wird beim Update zu *Post*. Vorhandene E-Mails bekommen Kanal *E-Mail*, Richtung *Ausgehend* und Stand *Erledigt*. Felder, Dokumente und Verweise bleiben erhalten; eigene Felder und Bezeichnungen auch. Links mit `typ=email` funktionieren weiter.

Mehr dazu in [Benutzer und Rollen](benutzer.md).

## Ablageort: wo die Originale liegen

Den Mappentyp **Ablageort** bringt das Paket **Basis** mit (ab Basis 1.6.0, neben Organisation, Niederlassung und Person). Damit hält man fest, wo das Papier zu einem eingescannten Dokument liegt – oder dass es vernichtet ist. Er ist ein normaler Mappentyp aus einem Paket: Du kannst ihn umbenennen, um Felder und Register erweitern und seine Berechtigungen ändern wie bei jedem Mappentyp.

- **Ohne Basis gibt es keinen Ablageort** – das ist gewollt. Eine neue Ablage bringt nur die [Systemmappentypen](#systemmappentypen-benutzer-rolle-und-post) mit; Fachliches wählst du über [Pakete](pakete.md). Pakete wie Haushalt, Haus, Vermietung und Fahrzeuge brauchen Basis ohnehin und verweisen im Feld *Verbleib Originaldokumente* auf den Ablageort von Basis.
- **Ältere Ablagen** (vor 0.212) haben noch den Ablageort, den Ablago früher selbst angelegt hat (Kennung `ablageort`). Beim Installieren bzw. Aktualisieren von Basis auf 1.6.0 **übernimmt** Basis ihn: gleiche Mappentyp-Id, alle Ablageorte, Verweise und die Ansicht bleiben, nur die Herkunft heißt danach „Basis“. Es entsteht kein zweiter Ablageort; die Vorschau nennt die Übernahme. Bis dahin lässt er sich wie jeder eigene Mappentyp bearbeiten und – ohne Mappen und Verweise – auch löschen.
- **Für Paket-Autoren:** Verweise heißen `basis:ablageort` (Abhängigkeit `basis: ">=1.6.0"`). Das frühere `dms:ablageort` gilt bis Ablago 1.0 weiter und zeigt auf denselben Mappentyp; die Paketprüfung gibt dazu einen Hinweis.

- **Felder:** *Name*, *Liegt in* (ein Verweis auf einen anderen Ablageort) und *Beschreibung*.
- **Register:** *Allgemein*, *Enthält* (die Ablageorte, die hier liegen), *Liegt hier* (alle Mappen, die auf diesen Ort verweisen) und *Fotos*.
- **Titel:** `{liegt_in} › {name}`. So heißt der rote Ordner z. B. „zu Hause › Arbeitszimmer Schrank › roter Ordner“. Ganz oben (ohne *Liegt in*) bleibt nur der Name.
- **Umzug in einem Schritt:** Kommt der Schrank ins Wohnzimmer, änderst du nur *Liegt in* am Schrank. Die Titel der Orte darunter und aller Mappen, die den Ort im Titel zeigen, zieht Ablago nach – über höchstens sechs Ebenen.

**Verbleib in deinen Mappentypen:** Gib Mappentypen mit Papier (Vertrag, Rechnung, Versicherung, Urkunde …) ein Verweisfeld auf *Ablageort* mit der Kennung **`verbleib_original`** und der Bezeichnung *Verbleib Originaldokumente*. Die gleiche Kennung in allen Mappentypen ist wichtig: Nur dann gibt es die Spalte in gemeinsamen Trefferlisten und die Bedingung in Ansichten über mehrere Mappentypen. Gibt es einen Ablageort, bringen die [Beispiele](demo.md) das Feld bei *Vertrag* und *Rechnung* mit, dazu ein paar Ablageorte und die Ansicht *Originale nach Ort*.

!!! note "Bewusst einfach"
    Der Verbleib gilt für die ganze Mappe, nicht für jeden einzelnen Scan. *Liegt hier* zeigt nur, was direkt an diesem Ort liegt; was in Orten darunter liegt, siehst du über *Enthält* Ebene für Ebene. Wann man das Papier überhaupt aufheben sollte, steht im Benutzerhandbuch unter [Original behalten oder vernichten?](https://help.ablago.app/benutzer/aktuell/original/).

## Erkennung

Unter **Erkennung** (nicht bei Systemmappentypen) stellst du den Knopf **Aus Dokument ausfüllen** ein, den Benutzer oben in jeder Mappe dieses Typs sehen:

- **Knopf zeigen** (Standard: an) – abwählen blendet ihn aus, z. B. bei Mappentypen ohne Papier.
- **Beschriftung** – z. B. „Visitenkarte scannen“ beim Mappentyp *Person* oder „Kassenbon fotografieren“; leer heißt er „Aus Dokument ausfüllen“.
- **Erkennung** – nur, wenn ein Paket mit dem Recht [Felder aus Dokumenten vorschlagen](pakete.md#recht-erkennen) installiert ist: **Standard aus der Werkbank** (Vorgabe), **eingebaut (ohne KI)** oder ein **Paket**, etwa ein KI-Assistent. Ein Paket, das ins Netz darf, steht mit „schickt Text über das Netz“ in der Liste; wählst du es, fragt Ablago nach und du bestätigst den Datenabfluss. Mehr unter [Erkennung durch ein Paket](pakete.md#erkennung-durch-ein-paket).
- **Post automatisch zuordnen, wenn die Erkennung sicher ist** (Standard: aus) – für Mappentypen, zu denen Post gehört, z. B. *Vertrag*. Sicher heißt: Absender eindeutig an einem starken Merkmal erkannt (Kundennummer, IBAN, Umsatzsteuer-Id, E-Mail, Internetseite, Telefon) **und** genau eine passende Mappe dieses Typs (sie verweist auf den Absender, frühere Post ging dorthin oder ihre Nummer steht im Brief; steht genau eine Nummer im Brief, gewinnt diese Mappe). Ablago legt dabei nie neue Mappen an, ordnet nie zu, wenn der Empfänger die Mappe nicht lesen darf, und nie bei Mappentypen im [Archivmodus](archiv.md) (dort ist der Haken gesperrt). Der Empfänger (*Für*, sonst wer die Post gebracht hat) bekommt die Aufgabe **Automatisch zugeordnet – bitte prüfen** mit **Passt** und **Rückgängig**; die Begründung steht in der Historie von Post und Mappe. Je Post höchstens einmal, und nur nach neuem Volltext – vorhandene Post bleibt, wie sie ist.

Darunter steht, welche Felder *Aus Dokument ausfüllen* füllt und über welche Felder Ablago vorhandene Mappen dieses Typs wiederfindet; einstellen lässt sich das an jedem Feld unter [Aus Dokument füllen](#aus-dokument-fullen) und [Zum Wiederfinden nutzen](#zum-wiederfinden-nutzen). Die Erkennung ist eingebaut und arbeitet ohne KI: Muster für E-Mail, Telefon, Internetseite, IBAN, Datum, Betrag, PLZ/Ort, Briefkopf und Visitenkarte sowie vCards (`.vcf`); Fotos und PDFs liest die [Texterkennung](texterkennung.md) sofort (höchstens 5 Seiten, mit den Sprachen ihrer Einstellungen). Jeder Wert wird gegen die Feldart geprüft, bevor er erscheint; gespeichert wird erst mit *Mappe speichern*. QR-Codes (z. B. vCard-QR auf Visitenkarten) liest sie noch nicht. Statt der eingebauten Erkennung kann ein Paket erkennen, etwa mit KI auf dem eigenen Rechner – siehe [Erkennung durch ein Paket](pakete.md#erkennung-durch-ein-paket).

## Archivmodus

Zwischen Registern und Berechtigungen schaltest du den **Archivmodus** ein: Mappen und Dokumente dieses Mappentyps lassen sich dann bis zum Ende einer Aufbewahrungsfrist nicht löschen, und Dokumente ändern sich nur noch als neue Version. Frist, Stichtag und was währenddessen gilt, stehen unter [Archivmodus und Aufbewahrung](archiv.md).

## Stempel beim Weitergeben

Nach dem Archivmodus stellst du ein, ob beim Herunterladen, Exportieren und Versenden von Dokumenten dieses Mappentyps ein Stempel **vorgeschlagen** wird oder **Pflicht** ist, und mit welcher Vorlage – z. B. für Ausweise „Kopie für {empfänger} – {datum}“. Alles Weitere steht unter [Stempel beim Weitergeben](stempel.md#stempel-je-mappentyp).

## Berechtigungen

Unter Registern und Archivmodus legst du fest, wer Mappen dieses Mappentyps anlegen, lesen, bearbeiten, löschen und Passwörter darin sehen darf – mit der Zeile **Standard** und Regeln. Gespeichert wird mit **Mappentyp speichern**; darunter probierst du die Regeln im **Testlauf** aus – auch ungespeicherte. Alles Weitere steht unter [Berechtigungen](berechtigungen.md).

## KI-Dienste { #ki-dienste }

Ganz unten legst du fest, ob der Mappentyp **an KI-Dienste gehen darf** – an Pakete, die Inhalte ins Netz schicken können (etwa für *Frag deine Ablage* oder *Aus Dokument ausfüllen*). Ohne Haken bekommt kein solches Paket etwas aus diesem Mappentyp. Der Haken gilt sofort, unabhängig von **Mappentyp speichern**. **Neue Mappentypen – auch Kopien – sind gesperrt, bis du sie zulässt.** Alles Weitere unter [Pakete → KI-Dienste und Mappentypen](pakete.md#ki-dienste).

## Mappentyp kopieren

**Mappentyp kopieren** oben rechts legt einen neuen Mappentyp als **Entwurf** an – mit denselben Feldern, Titel, Trefferlisten, Registern und Berechtigungen. Er heißt „Kopie von …“ und bekommt eine eigene Kennung; beides kannst du vor dem Speichern ändern. Angelegt wird er erst mit **Mappentyp anlegen**; **Entwurf verwerfen** bricht ab. Mappen werden nicht kopiert. Felder, die auf den Mappentyp selbst verweisen, zeigen in der Kopie auf die Kopie. Systemtypen lassen sich nicht kopieren.

## Mappentyp löschen

**Mappentyp löschen** geht nur, solange es keine Mappen dieses Mappentyps gibt – auch keine im [Papierkorb](papierkorb.md) – und kein anderer Mappentyp allein auf ihn verweist (ist er einer von [mehreren Zieltypen](#mehrere-zieltypen), nimmt Ablago ihn dort heraus). Sonst nennt Ablago die Gründe. [Systemmappentypen](#systemmappentypen-benutzer-rolle-und-post) lassen sich nie löschen.
