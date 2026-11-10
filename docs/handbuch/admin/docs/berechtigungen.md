# Berechtigungen

Mit Berechtigungen legst du je Mappentyp fest, **wer welche Mappen anlegen, lesen, bearbeiten, löschen und wessen Passwörter sehen** darf. Du pflegst sie am **Mappentyp** selbst, im Abschnitt **Berechtigungen** nach den Registern und dem [Archivmodus](archiv.md), und speicherst sie mit **Mappentyp speichern**. Direkt darunter prüfst du sie im [Testlauf](#testlauf); was ein Benutzer insgesamt sieht, zeigt die [Benutzerverwaltung](benutzer.md#was-sieht-ein-benutzer).

![Berechtigungen am Mappentyp Vertrag](bilder/werkbank-berechtigungen.png)

!!! info "Für Administratoren gelten die Regeln nicht"
    Ein Administrator sieht und darf in der Ablage immer alles. Deshalb steht dort für ihn oben ein roter Hinweis, und er bekommt keine API-Schlüssel: Für die tägliche Arbeit und für Programme legst du normale Benutzer an und gibst ihnen über Rollen und Regeln genau die Rechte, die sie brauchen.

## Die fünf Rechte

| Kürzel | Recht | Was es erlaubt |
|---|---|---|
| **C** | Anlegen | neue Mappen dieses Mappentyps anlegen |
| **R** | Lesen | die Mappe in Listen, Suche, Zählern und Verweisen sehen und öffnen, Dokumente in Ablago ansehen; Notizen schreiben, Aufgaben vergeben |
| **U** | Bearbeiten | Felder ändern, Dokumente hochladen und entfernen |
| **D** | Löschen | die Mappe in den Papierkorb legen |
| **P** | Passwörter sehen | den Klartext von Passwortfeldern anzeigen (das „Auge“) |

- **Mitnehmen braucht E:** Herunterladen, Teilen, Versenden per E-Mail, Exportieren und das [WebDAV-Laufwerk](webdav.md) verlangen außer Lesen das Recht **E** (Exportieren), das du an den [Ansichten](sichten.md#berechtigungen) vergibst. Kurz: **R heißt ansehen, E heißt mitnehmen.** Ganz verhindern lässt sich das Abspeichern beim Ansehen nie (Browser, Bildschirmfoto) – E macht es nur nicht einfach.
- **Ohne Lesen wirkt nichts außer Anlegen.** Wer eine Mappe nicht lesen darf, darf sie auch nicht bearbeiten, löschen oder ihre Passwörter sehen – egal was die Regeln sonst sagen.
- **Systemregeln** gelten für alle, auch für Administratoren, und lassen sich nicht ändern: Benutzer-Mappen entstehen und verschwinden nur über die Benutzerverwaltung (kein C, kein D). In der Standard-Zeile sind diese Rechte deshalb gesperrt. Bei *Post* regelt C, wer über **+ Post** oder die Schnittstelle neue Post anlegen darf; versendete E-Mails legt Ablago immer an.
- **Systemfelder** von Benutzern (Systemrolle, Rollen, Aktiv) ändern sich weiterhin nur in der Benutzerverwaltung und im eigenen Profil.
- **Archivmodus:** Ist er am Mappentyp eingeschaltet, lassen sich Mappen und Dokumente bis zum Ende ihrer Aufbewahrungsfrist nicht löschen – auch nicht mit dem Recht **D** und auch nicht von Administratoren. Siehe [Archivmodus](archiv.md).
- Den **eigenen Papierkorb** sieht jeder Benutzer immer und kann daraus wiederherstellen – auch wenn er die Mappe danach nach den Regeln nicht mehr sehen darf. Er bekommt dann einen Hinweis.

## Standard

Über den Regeln steht die Zeile **Standard** mit den fünf Rechten **C R U D P**. Sie gilt, solange keine Regel etwas anderes sagt; ein Klick schaltet ein Recht zwischen **✓** (erteilt) und **✗** (entzogen).

- **✓ C R U D P** – jeder darf alles; Regeln *schränken ein*. So startet jeder neue Mappentyp.
- **✗ C R U D P** – niemand darf etwas; Regeln *geben frei*. Das passt für vertrauliche Mappentypen wie Gehaltsabrechnungen.
- Auch gemischt, z. B. **✓ R U P, ✗ C D**: Jeder darf lesen und bearbeiten, anlegen und löschen nur, wem eine Regel es erlaubt.

!!! note "Früher: Haken am Mappentyp"
    Bis Version 0.31 gab es am Mappentyp die Haken *Neue Mappen erlauben* und *Löschen erlauben*. Beim Update wurden sie in die Berechtigungen übernommen: War ein Haken aus, steht im Standard **✗ C** bzw. **✗ D**, und Regeln erteilen dieses Recht nicht mehr. Niemand bekommt dadurch mehr Rechte als vorher.

## Regeln

Eine Regel heißt: **Wenn** alle Bedingungen zutreffen, **dann** setze diese Rechte.

- Je Recht gibt es drei Stellungen: **✓** erteilen, **✗** entziehen, **–** unverändert lassen. Ein Klick auf den Knopf schaltet weiter.
- Die Regeln werden **von oben nach unten** geprüft. Jede zutreffende Regel setzt ihre ✓ und ✗ – eine spätere Regel kann also überschreiben, was eine frühere gesetzt hat.
- **Stopp**: Trifft die Regel zu, werden die folgenden Regeln nicht mehr geprüft. So setzt du Ausnahmen an den Anfang, z. B. „Buchhaltung darf alles“ mit Stopp.
- Jede Regel lässt sich **zuklappen**; eingeklappt zeigt sie Name, Rechte und Bedingungen in einer Zeile. Neue Regeln sind offen.
- Die Reihenfolge änderst du durch **Ziehen am Griff** ⠿ oder mit **Alt+↑/↓**.
- Eine Regel braucht einen Namen, mindestens eine Bedingung und muss etwas bewirken (ein Recht oder Stopp).

### Bedingungen

| Bedingung | trifft zu, wenn … |
|---|---|
| **Benutzer hat Rolle** | der angemeldete Benutzer eine der gewählten Rollen hat (auch die Systemrollen *Administrator* und *Mitglied*) |
| **Benutzer ist** | der angemeldete Benutzer einer der gewählten Benutzer ist |
| **Feld der Mappe** | ein Feld der Mappe die Bedingung erfüllt – genau wie in [Ansichten](sichten.md#bedingungen), z. B. „Verantwortlich zeigt auf aktueller Benutzer“, „Verantwortliche Rolle zeigt auf Rollen des aktuellen Benutzers“, „Privat ist ja“ oder „Angelegt von ist aktueller Benutzer“ |
| **Offene Aufgabe für den Benutzer** | die Mappe eine offene Aufgabe für den angemeldeten Benutzer hat |
| **Mappe ist die des Benutzers** | (nur beim Mappentyp *Benutzer*) die Mappe die Benutzer-Mappe des angemeldeten Benutzers ist |

Jede Bedingung lässt sich mit **nicht** umkehren. Mehrere Bedingungen einer Regel müssen **alle** zutreffen; für „oder“ legst du zwei Regeln an.

!!! tip "Rechte, die vom Inhalt abhängen"
    Ändert jemand ein Feld, von dem seine Rechte abhängen (etwa „Verantwortlich“), fragt Ablago vor dem Speichern nach, wenn er sich damit selbst das Lesen oder Bearbeiten entziehen würde.

### Regel in andere Mappentypen kopieren

Mit **In andere Mappentypen kopieren …** an einer gespeicherten Regel übernimmst du sie in weitere Mappentypen (bei ungespeicherten Änderungen erst speichern); sie landet dort am Ende. Bedingungen auf Felder, die es im Zieltyp nicht gibt, fallen weg – Ablago sagt, wie viele.

### Speichern

Die Regeln werden mit **Mappentyp speichern** gespeichert, zusammen mit Feldern, Registern und Trefferlisten. Eine Regel darf deshalb auch ein Feld nutzen, das du im selben Zug neu anlegst. Passt eine Regel nicht (z. B. auf ein Feld, das du gerade entfernst), speichert Ablago nichts und nennt die Regel.

Beim Speichern prüft Ablago außerdem, ob danach Mappen dieses Mappentyps **niemand mehr lesen** könnte (außer Administratoren), und fragt in diesem Fall nach. Jede Änderung steht im [Protokoll](fehlersuche.md) mit der vollständigen Regelliste.

## Systemkonten und Pakete

Automatisierungen laufen unter dem Systemkonto *Automatisierung*, Pakete mit Code unter ihrem Dienstkonto (siehe [Systemkonten](benutzer.md#systemkonten)). Für sie gibt es die Systemrollen **Systemkonto** und **Paket**, die du in der Bedingung *Benutzer hat Rolle* wählst.

- Für diese Konten zählen **nur Regeln, die ihre Rolle nennen**. Der Standard oben gilt für sie nicht – sonst würde ein strenger Standard für Mitglieder auch jede Automatisierung aussperren.
- Ohne solche Regeln darf das Systemkonto alles außer Passwörter sehen; ein Paket darf, was bei seiner Installation bestätigt wurde.
- Eine Regel für *Paket* kann nur einschränken, nie über die bestätigten Rechte hinaus erteilen.

Beispiel: Am Mappentyp *Gesundheit* eine Regel „Wenn Benutzer hat Rolle *Systemkonto* → C R U D P entziehen“. Danach liest und ändert keine Automatisierung mehr Gesundheitsmappen.

Im **Testlauf** stehen die Systemkonten als eingeklappte Gruppe über der Auswahl der Benutzer, mit Anzahl und Zusammensetzung in der Kopfzeile – wie unter [Werkbank → Benutzer](benutzer.md#systemkonten). Aufgeklappt wählst du dort das Systemkonto oder ein Paket aus.

## Pakete am Mappentyp { #pakete-am-mappentyp }

Unter dem Testlauf steht der Abschnitt **Pakete**. Er zeigt jedes installierte Paket mit Code, das Mappen dieses Mappentyps nach seinen bestätigten Rechten lesen darf – mit dem Zusatz, ob es sie nur liest oder auch ändert und ob es [Ereignisse dazu](pakete.md#ereignis-mappe) bekommt. Nimmst du bei einem Paket den Haken **darf diesen Mappentyp sehen** weg, sieht es den Mappentyp gar nicht mehr: Es liest und ändert keine solchen Mappen und bekommt keine Ereignisse dazu. Das wirkt **sofort**, ohne *Mappentyp speichern*, und steht im Protokoll. Setzt du den Haken wieder, gilt wieder, was bei der Installation bestätigt wurde.

Beispiel: Ein Paket zur Vertragsverwaltung möchte erfahren, wenn mit einem Vertragspartner etwas passiert – etwa wenn er gesperrt wird –, und liest dafür auch Organisationen. Ein Paket *Installation Heizung* braucht weder Verträge noch Vertragspartner: Am Mappentyp *Vertrag* und am Mappentyp *Organisation* nimmst du ihm den Haken.

Feiner – nur einzelne Mappen eines Typs – geht es mit einer Regel für die Rolle **Paket** (siehe oben). Ereignisse zu einer Mappe bekommt ein Paket nur, wenn es genau diese Mappe gerade lesen darf.

## Testlauf

Unter den Regeln steht der **Testlauf**: Welche Rechte hätte ein bestimmter Benutzer an einer bestimmten Mappe? **Benutzer** und **Testmappe** wählst du genauso wie in einem Verweisfeld einer Mappe: Tippe einen Teil des Namens bzw. Titels und klicke auf einen Treffer; mit **Ändern** wählst du neu. Ist ein Administrator gewählt, steht das gleich daneben – für ihn gelten die Regeln nicht. Sobald beides gewählt ist, erscheint das Ergebnis von selbst. Die Tabelle zeigt Schritt für Schritt, welche Regel zutraf, was sie gesetzt hat und wie der Stand danach war.

Der Testlauf nutzt die Regeln, **wie sie gerade im Editor stehen** – auch ungespeicherte. So probierst du eine Änderung aus, bevor du *Mappentyp speichern* klickst. Das Ergebnis gehört immer genau zu Benutzer, Testmappe und Regeln, wie sie gerade gewählt sind: Wechselst du Benutzer oder Testmappe, wird sofort neu geprüft; änderst du eine Regel, verschwindet das alte Ergebnis, und du prüfst mit **Prüfen** erneut. Den Testlauf gibt es, sobald der Mappentyp gespeichert ist; prüfen kannst du erst, wenn es Mappen dieses Mappentyps gibt.

**Konten ohne Person prüfen:** Unter dem Feld *Benutzer* wählst du bei **oder ein Konto ohne Person** auch das Systemkonto **Automatisierung** oder den Benutzer eines **Pakets** (angezeigt als „Paket: Name“). So siehst du, ob eine Automatisierung oder ein Paket an einer Mappe überhaupt etwas darf – etwa, wenn eine Regel „System- und Paketrollen verboten“ greift. Für diese Konten gilt die Grundeinstellung des Mappentyps nicht, sondern nur Regeln, die ihre Rolle **Systemkonto** bzw. **Paket** nennen; das Systemkonto sieht nie Passwörter, und ein Paket darf nie mehr als das, was du bei seiner Installation bestätigt hast. Hat ein Paket für diesen Mappentyp gar keinen Zugriff bestätigt, steht das über dem Ergebnis. In allen anderen Auswahlen (Verweisfelder, Empfänger …) tauchen diese Konten nicht auf.

**Leserecht auf Zeit:** Hat die Person an dieser Mappe ein [Leserecht für die Dauer einer Aufgabe](aufgaben.md#aufgaben-bei-personen-ohne-leserecht), steht es unter dem Ergebnis mit seinem Grund (die Aufgabe), seit wann und von wem. Es erlaubt nur das Lesen.

![Testlauf: Jonas an „Stromvertrag Haus“](bilder/werkbank-berechtigungen-testlauf.png)

Was ein Benutzer über alle Mappentypen hinweg lesen darf, zeigt [Was sieht ein Benutzer?](benutzer.md#was-sieht-ein-benutzer) in der Benutzerverwaltung.

## Berechtigungen an Ansichten

Wer eine **Ansicht** im Baum sieht, dort „+ Neu“ bekommt und aus ihr exportieren darf, regelst du an der Ansicht selbst – mit Vererbung an die Unteransichten. Das steht unter [Ansichten → Berechtigungen](sichten.md#berechtigungen). Ob eine Mappe lesbar ist, entscheidet weiter allein der Mappentyp.

## Was Benutzer davon merken

- Mappen ohne Leserecht fehlen in Listen, Suche, Zählern, Favoriten und Trefferlisten. Verweist eine sichtbare Mappe auf eine unsichtbare, steht dort „nicht sichtbare Mappe“ ohne Link.
- Hat jemand eine **Aufgabe** an einer Mappe, die er nicht lesen darf, steht sie trotzdem bei ihm unter „Zu erledigen“ – ohne Titel; bei automatisch entstandenen Aufgaben auch ohne Text, nur mit Hinweis und Fälligkeit (bei Fristen ohne Datum). Er kann sie erledigen oder an jemanden weitergeben, der die Mappe sehen darf. Wer eine Aufgabe vergibt, wird vorher gefragt, wenn der Empfänger die Mappe nicht lesen darf. Wo das vorkommt und wie du ein **Leserecht auf Zeit** gibst, steht unter [Aufgaben bei Personen ohne Leserecht](aufgaben.md#aufgaben-bei-personen-ohne-leserecht).
- Ohne **Bearbeiten** zeigt die Mappe ihre Felder nur an; ohne **Löschen** ist „Mappe löschen“ gesperrt (Schloss), der Grund steht daneben, „Warum ist Löschen gesperrt?“ erklärt mehr; ohne **Anlegen** fehlt „+ Neu“.
- Ohne **Exportieren** (E an einer Ansicht) lassen sich die Dokumente einer Mappe nur ansehen: Statt „Herunterladen“ steht ein gesperrter Knopf mit **Warum nicht?**; Teilen, Kopien mit Stempel, „Per E-Mail versenden“ und „Als PDF exportieren“ fehlen. Über die API antwortet Ablago mit 403.
- Bei der Auswahl von Benutzern (Verantwortlich, Erwähnungen, Vertreter, Aufgaben-Empfänger) erscheinen nur Benutzer, deren Benutzer-Mappe man sehen darf.
- Unter Mein Konto zeigt **Meine Rechte** je Mappentyp, was man darf: ja, nein oder „je nach Mappe“ – die Regeln selbst bleiben verborgen.

## Beispiele

### Vertrauliche Mappen nur für Verantwortliche

Mappentyp *Gehalt*, Standard **✗ C R U D P**:

1. **Verantwortliche** – wenn *Verantwortlich zeigt auf aktueller Benutzer* → ✓ R U D P

### Eine Rolle darf alles, alle anderen nur lesen

Mappentyp *Rechnung*, Standard **✓ C R U D P**:

1. **Buchhaltung darf alles** – wenn *Benutzer hat Rolle Buchhaltung* → ✓ C R U D P, **Stopp**
2. **Alle anderen nur lesen** – wenn *Benutzer hat nicht Rolle Buchhaltung* → ✗ C U D P

### Praktikanten sehen keine Passwörter

An jedem Mappentyp mit Passwortfeldern (einmal anlegen, dann **kopieren**):

1. **Keine Passwörter für Praktikanten** – wenn *Benutzer hat Rolle Praktikant* → ✗ P

### Beispiel: Ein Programm, das nur Rechnungen sieht

Ein Programm (etwa ein ERP-System) soll über die [Schnittstelle](api.md) Rechnungen anlegen und ihren Bearbeiter setzen – aber nichts anderes sehen.

1. Lege eine Rolle **ERP** und einen Benutzer **ERP-Schnittstelle** mit dieser Rolle an; erzeuge für ihn einen [API-Schlüssel](api.md#api-schlussel).
2. Mappentyp *Rechnung*: Regel **ERP legt Rechnungen an** – wenn *Benutzer hat Rolle ERP* → ✓ C R U.
3. Mappentyp *Benutzer*: Regel **ERP sieht nur die Buchhaltung** – wenn *Benutzer hat Rolle ERP* und *nicht: Rollen zeigt auf Buchhaltung* (das Feld der Benutzer-Mappe) → ✗ R. So kann das Programm als „Verantwortlich“ nur Mitglieder der Buchhaltung eintragen.
4. Alle übrigen Mappentypen: Regel **ERP sieht nichts** – wenn *Benutzer hat Rolle ERP* → ✗ C R U D P (einmal anlegen, dann in die anderen Mappentypen kopieren).
5. Mit [Was sieht ein Benutzer?](benutzer.md#was-sieht-ein-benutzer) am Benutzer *ERP-Schnittstelle* kontrollierst du das Ergebnis.
