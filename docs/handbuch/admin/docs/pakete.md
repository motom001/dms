# Pakete

Ein **Paket** bringt fertige Mappentypen, Ansichten und auf Wunsch Beispiel-Mappen mit – etwa das Basis-Paket mit dem Mappentyp „Organisation“ für Firmen, Behörden, Ärzte und Versicherungen. Statt Feld für Feld in der Werkbank zu bauen, installierst du es mit wenigen Klicks unter **Werkbank → Pakete**.

Pakete kommen aus dem **offiziellen Katalog** des DMS-Projekts ([dms-registry](https://github.com/motom001/dms-registry)). Jedes Paket dort ist Open Source und wurde vom Maintainer freigegeben. Meist sind es **Konfigurationspakete** (Mappentypen, Ansichten, Beispiele). Pakete mit Code lassen sich installieren und einstellen, ihr Code läuft aber erst mit dem Paket-Läufer.

## Katalog abrufen

Das DMS fragt den Katalog **nur auf Knopfdruck** ab, nie im Hintergrund: Klicke **Katalog abrufen**. Die Seite zeigt dann zwei Listen:

- **Installiert** – Pakete in diesem DMS, mit Version und Herkunft
- **Verfügbar** – Pakete aus dem Katalog, die noch nicht installiert sind

Ein Klick auf ein Paket zeigt Name, Beschreibung, Version, Lizenz, Autor, die nötige DMS-Version, Abhängigkeiten, die enthaltenen Mappentypen und Ansichten sowie Links zum README und zu den Änderungen.

Das DMS lädt den Katalog von `https://raw.githubusercontent.com/motom001/dms-registry/gh-pages/katalog.json`. Dafür muss das DMS selbst ins Internet kommen. Einen Proxy für ausgehende Abrufe kann das DMS nicht einstellen. Ohne Internetzugang lädst du ein Paket als Datei hoch (siehe [Expertenmodus](#expertenmodus-weitere-kataloge-und-hochladen)).

## Installieren

1. Wähle ein Paket unter **Verfügbar** und ggf. eine ältere Version.
2. Klicke **Installieren …**. Die **Vorschau** zeigt, was angelegt wird:
    - je Mappentyp die Zahl der Felder und die Kennung, z. B. `basis_organisation`
    - die Ansichten, mit Elternansicht
    - die Abhängigkeiten und ob sie installiert sind
    - wie viele Beispiel-Mappen es gibt
    - bei Paketen mit Code: **was der Code darf** – als Liste, Ereignisse als Unterliste, mit **?** zur Erklärung (siehe [Rechte eines Pakets](#rechte-eines-pakets)). Darunter bestätigst du es mit einem Haken, sonst bleibt **Installieren** grau
3. **Namen:** Gibt es einen Mappentyp oder eine Ansicht (auf oberster Ebene) mit gleichem Namen schon, sagt die Vorschau das und schlägt einen anderen vor, z. B. „Organisation (Basis)“. Du kannst jeden Namen ändern.
4. **Beispiel-Mappen** legt das DMS nur an, wenn du den Haken setzt.
5. **Fehlende Pakete mitinstallieren:** Braucht das Paket ein anderes, das noch fehlt, installiert das DMS es auf Wunsch vorher mit (die neueste passende Version aus dem Katalog).
6. Klicke **Installieren**.

Vor dem Anlegen prüft das DMS:

- ob die **eigene Version** passt (sonst erst das DMS [aktualisieren](aktualisieren.md)),
- ob alle **Abhängigkeiten** installiert sind und in einer passenden Version,
- ob das heruntergeladene Archiv zur **Prüfsumme (SHA-256)** im Katalog passt. Passt sie nicht, installiert das DMS nichts.

Angelegt wird über dieselben Funktionen wie in der Werkbank, mit allen Prüfregeln. Die Kennungen bekommen das Paket-Präfix (`<paket>_<schluessel>`), damit sich Pakete nicht in die Quere kommen; Verweise auf Mappentypen anderer Pakete löst das DMS auf. **Scheitert etwas, nimmt das DMS alles zurück** – es bleibt nichts halb angelegt.

Mappentypen aus Paketen tragen in **Werkbank → Mappentypen** den Hinweis **Paket …**. Du kannst sie danach wie jeden anderen Mappentyp anpassen.

### Über die Katalog-Webseite

Den Katalog gibt es auch als Webseite: [Paketkatalog](https://motom001.github.io/dms-registry/) (auch auf der Startseite der Handbücher). Dort siehst du je Paket die Beschreibung, was angelegt wird, Rechte, Änderungen und ältere Versionen.

1. Klicke beim Paket **In meinem DMS installieren**.
2. Beim ersten Mal fragt die Seite nach der **Adresse deines DMS**, z. B. `https://dms.example.de`. Sie merkt sie sich nur in deinem Browser; über **DMS-Adresse** oben änderst du sie. Die Webseite sendet nichts an dein DMS und speichert keine Zugangsdaten.
3. Dein DMS öffnet **Werkbank → Pakete** mit der **Vorschau** genau dieses Pakets (Adresse `…/werkbank/pakete?installieren=<paket>@<version>`). Bist du nicht angemeldet, meldest du dich zuerst an und landest danach wieder dort. Andere Benutzer sehen einen Hinweis, dass nur Administratoren Pakete installieren.
4. Das DMS holt Paket und Prüfsumme **selbst aus dem offiziellen Katalog** – Angaben im Link, die auf andere Quellen zeigen, zählen nicht. Gibt es das Paket oder die Version dort nicht, sagt das DMS es.
5. Installiert wird **erst, wenn du auf „Installieren“ klickst**. Der Link allein ändert nichts. Ist das Paket schon installiert, zeigt die Vorschau das; ein Update bietet sie an, wenn der Link eine neuere Version nennt.

## Installierte Pakete

Je Paket merkt sich das DMS Version, **Herkunft** (der Katalog), wann und von wem es installiert bzw. aktualisiert wurde und welche Mappentypen und Ansichten dazugehören. Diese Angaben sind Teil der [Sicherung](sicherung.md) und des [Vollexports](export.md) (`struktur/pakete.json`). Installieren, Aktualisieren und Entfernen stehen im Protokoll.

## Aktualisieren

**Auf neue Versionen prüfen** fragt den Katalog ab (auf Knopfdruck) und markiert Pakete, für die es Neueres gibt. Im Paket zeigt **Auf … aktualisieren …** eine Vorschau mit dem, was dazukommt, und einem Link zu den Änderungen.

Ein Update **ergänzt nur**:

- neue Mappentypen und Ansichten,
- neue Felder und Register bei vorhandenen Mappentypen.

Es **löscht nichts** und **überschreibt nichts**, was du selbst geändert hast: Hast du einen Mappentyp umbenannt, Felder ergänzt oder eine Ansicht gelöscht, bleibt das so.

## Text in Verweise umwandeln { #text-in-verweise-umwandeln }

Manche Pakete hatten früher ein **Textfeld**, wo eigentlich ein **Verweis** hingehört – zum Beispiel „Halter: Lena Muster“ am Fahrzeug statt eines Verweises auf die **Person** Lena Muster. Eine neuere Version des Pakets bringt dafür ein Verweisfeld mit und sagt, aus welchem Textfeld es sich füllen lässt. **Updates ändern nichts heimlich:**

- Das Update legt das Verweisfeld **zusätzlich** an. Das alte Textfeld bleibt mit allen Werten, nichts wird umgeschrieben. Die Vorschau des Updates sagt schon, wie viele Angaben sich danach umwandeln lassen.
- Danach steht im Paket unter **Text in Verweise umwandeln**, was offen ist, etwa „Fahrzeug – Halter: 3 Angaben in „Halter“ (Text) können Verweise auf Person werden“.

**Vorschau …** zeigt je Name einen Vorschlag, den du in jeder Zeile ändern kannst:

- **vorhandene Person:** gleicher Name, ohne Groß- und Kleinschreibung und Leerzeichen („lena muster“ = „Lena Muster“, auch „Muster Lena“). Passen mehrere, steht das dabei – wähle dann die richtige.
- **Neu anlegen:** legt eine Person mit Vor- und Nachname an. Vorgeschlagen, wenn der Text wie ein Name aussieht.
- **Überspringen:** Der Text bleibt, z. B. bei „Familie“ oder „Auto MU-ST 123“.

Darf ein Feld mehrere Verweise haben (Inhaber eines Kontos, Versicherte), teilt das DMS den Text an „und“, Komma, Schrägstrich oder „&“: „Lena und Tom Muster“ wird zu „Lena Muster“ und „Tom Muster“. Umgewandelt wird eine Mappe nur, wenn **jeder** ihrer Namen eine Person bekommt.

**Ausgelassen** werden Mappen, die du nicht bearbeiten darfst, Mappen im [Archivmodus](archiv.md) innerhalb der Aufbewahrungsfrist und Mappen, deren Verweis schon gesetzt ist. Die Vorschau nennt jede mit Grund.

**Umwandeln** setzt den Verweis und leert das Textfeld. Jede Änderung steht in der **Historie** der Mappe („Paket-Update: Text in Verweis umgewandelt“). Außerdem:

- Das alte Textfeld ist keine Pflicht mehr. Ist es leer, zeigt die Ablage es in der Mappe nicht mehr.
- Titel-Vorlage und Trefferlisten zeigen den Verweis statt des Texts, das Verweisfeld rückt an die Stelle des Textfelds. Mappen, die du übersprungen hast, zeigen dort weiter ihren Text.

**Rückgängig …** unter „Bisherige Umwandlungen“ nimmt einen ganzen Vorgang zurück: Text zurück, Verweis leer, neu angelegte Personen in den Papierkorb, sofern nichts anderes mehr auf sie verweist, Mappentyp wie vorher. Was seit der Umwandlung jemand geändert hat, bleibt und wird genannt. Die Vorgänge sind Teil der [Sicherung](sicherung.md).

Für Paket-Autoren steht das Format (`aus_text`) in den [Regeln der Registry](https://github.com/motom001/dms-registry/blob/main/REGELN.md#text-in-verweis-umwandeln).

## Entfernen

**Entfernen** löscht die Mappentypen und Ansichten des Pakets und seinen Eintrag. Das geht nur,

- solange es **keine Mappen** dieser Mappentypen gibt (auch nicht im Papierkorb) und
- **kein anderes Paket** davon abhängt.

Sonst nennt das DMS die Gründe. Beispiel-Mappen löschst du vorher wie andere Mappen.

## Einstellungen

Manche Pakete brauchen Einstellungen – etwa Regeln, nach denen sie Post zuordnen, oder ein Zugangsschlüssel für einen Dienst. Das Paket **beschreibt** sie nur; das DMS baut daraus ein Formular, prüft die Werte und speichert sie. Du findest es unter **Werkbank → Pakete → *Paket* → Reiter „Einstellungen“** – den Reiter gibt es nur bei Paketen, die Einstellungen haben.

- **Abschnitte** mit Feldern und **Listen** gleich aufgebauter Einträge (z. B. eine Regel je Eintrag) mit **+ Eintrag**, Löschen und – wenn das Paket es erlaubt – Sortieren mit ↑/↓.
- **Felder** wie bei den Mappentypen: Text, mehrzeiliger Text, Zahl, Ja/Nein, Datum, Auswahl, Mehrfachauswahl und **Verweise** auf einen Mappentyp, ein Feld eines Mappentyps, einen Benutzer, eine Rolle oder eine Ansicht. Verweise wählst du aus Listen; gespeichert wird die feste Id, nicht der Name – Umbenennen schadet also nicht.
- **Dienst-Adresse** (z. B. eines KI-Dienstes): Die einzige Adresse, zu der das Paket außer den festen Adressen aus seinem Manifest ins Netz darf – siehe [Dienst-Adresse](#dienst-adresse). Sie ist nie voreingestellt; im leeren Feld steht höchstens ein Beispiel. Beim Speichern einer neuen oder geänderten Adresse fragt das DMS nach und zeigt, wohin Daten gehen.
- **Geheimnisse** (z. B. Zugangsdaten) verschlüsselt das DMS mit seinem Schlüssel (siehe [Verschlüsselung](verschluesselung.md)). Nach dem Speichern zeigt es sie nie wieder an, nur **gesetzt** mit **Ändern** und **Löschen**.
- Beim **Speichern** prüft das DMS Mappentyp, Pflichtfelder, Auswahlwerte und ob Verweise existieren, und zeigt Fehler am Feld.
- **Aktionen** des Pakets erscheinen als Knöpfe (z. B. „Regeln jetzt anwenden“), die Antwort des Pakets steht darüber. Eine Zeitgrenze verhindert, dass ein Knopf hängt.
- Der **Status** (letzter Lauf, Meldungen) kommt vom Paket selbst und ist schreibgeschützt.

**Lebenszyklus:**

- **Installieren** setzt die Vorgaben. Fehlen Pflichtfelder, steht das Paket auf **Einstellungen nötig** und läuft erst danach.
- **Aktualisieren:** Neue Felder bekommen ihre Vorgabe, vorhandene Werte bleiben. Felder, die die neue Version nicht mehr kennt, werden entfernt – die Vorschau vor dem Update nennt sie.
- **Entfernen** fragt, ob die Einstellungen für eine spätere Neuinstallation **bleiben** sollen (Standard: nein).

Die Einstellungen sind **Teil der Sicherung**; Geheimnisse bleiben dabei verschlüsselt und werden beim Schlüsselwechsel mit umgeschlüsselt. Über die API v1 sind sie nicht lesbar; das Paket selbst bekommt sie über den Paket-Läufer. Das Protokoll vermerkt „Einstellungen von Paket … geändert (Felder …)“ – nie die Werte von Geheimnissen. Nur Administratoren sehen und ändern Einstellungen.

## Pakete mit Code

Manche Pakete bringen **Code** mit – etwa eine eigene Texterkennung oder Regeln, die neue Post zuordnen. Der Code reagiert auf Ereignisse (neue Post, hochgeladenes Dokument, fertige Texterkennung, fertiger Volltext, geänderte Einstellungen) und auf die **Aktionen** im Reiter „Einstellungen“. Das DMS führt ihn im **Paket-Läufer** aus:

- **Abgeschottet:** Der Code ist WebAssembly und läuft in einem eigenen Prozess des DMS, ohne Zugriff auf Dateien, Schlüssel oder Datenbank. Netzwerk und Internet erreicht er nur unter den Adressen, die das Paket angibt, und unter der [Dienst-Adresse](#dienst-adresse), die du in seinen Einstellungen einträgst – meist gar nicht.
- **Nur bestätigte Rechte:** Vor der Installation zeigt die Vorschau, was der Code darf – welche Mappentypen er lesen bzw. anlegen und ändern darf, ob er Dokumente lesen oder schreiben darf, ob er aufs Netzwerk oder Internet zugreifen darf und auf welche Ereignisse er reagiert (siehe [Rechte eines Pakets](#rechte-eines-pakets) und [Ereignisse](#ereignisse)). Erst wenn du das bestätigst, installiert das DMS. Will ein **Update** mehr Rechte oder andere Adressen, fragt das DMS erneut.
- **Dienstkonto:** Für jedes Paket mit Code legt das DMS ein Dienstkonto „Paket *Name*“ an. Mit ihm arbeitet der Code über die API; die Historie zeigt deshalb, was ein Paket geändert hat. Dienstkonten erscheinen nicht unter **Benutzer**, melden sich nie an und können **nie löschen** – auch nicht mit Rechten auf alle Mappentypen. Benutzer und Passwörter sehen sie nicht.
- **Grenzen:** Jeder Aufruf hat höchstens 256 MB Speicher und 2 Minuten Zeit; es laufen höchstens zwei Aufrufe gleichzeitig. Was die Grenzen reißt, bricht ab, ohne das DMS zu stören.
- **Wiederholen:** Ereignisse merkt sich das DMS. Scheitert ein Aufruf, versucht es der Läufer nach 1, 5, 30, 120 und 360 Minuten erneut und gibt dann auf. Während einer Wartung (z. B. beim Wiederherstellen) ruht der Läufer.

**Werkbank → Pakete → *Paket*** zeigt im Abschnitt **Paket-Läufer** den Stand, die letzten Aufrufe mit Dauer und Speicher, offene und aufgegebene Ereignisse und das Protokoll des Pakets. Meldungen stehen zusätzlich im [Protokoll](fehlersuche.md#protokoll) des DMS. Der **Stand** ist einer von diesen:

| Stand | Bedeutung |
|---|---|
| **startet …** | Der Läufer startet oder lädt das Modul des Pakets – etwa direkt nach der Installation. Die Seite fragt von selbst nach. |
| **bereit – wartet auf das erste Ereignis** | Das Modul ist geladen; das Paket wurde aber noch nie aufgerufen. Es läuft, sobald ein Ereignis kommt, auf das es reagiert, oder du eine Aktion auslöst. |
| **bereit** | Das Modul ist geladen und wurde schon aufgerufen. |
| **abgestürzt um … – startet neu …** | Der Läufer-Prozess ist abgestürzt. Das DMS startet ihn nach einer kurzen Pause selbst neu (bei wiederholten Abstürzen wartet es länger, höchstens eine Minute). Ereignisse gehen dabei nicht verloren. |
| **neu gestartet nach Absturz um …** | Der Läufer läuft wieder; die Zeit nennt den letzten Absturz. Die Ursache steht im Protokoll des DMS. |
| **pausiert (Wartungsmodus)** | Während einer Wartung ruht der Läufer. |
| *Fehlermeldung in Rot* | Das Modul ließ sich nicht laden (z. B. fehlt der Code nach einer Wiederherstellung) – das Paket neu installieren. |

Schlägt ein **Update** fehl, bleibt die alte Version mit ihrem alten Code installiert. Den Code aller Dateien unter `code/` begrenzt das DMS auf **32 MB je Paket**.

**Entfernen** beendet den Code, löscht seine offenen Ereignisse und seinen Speicher und schaltet das Dienstkonto ab.

!!! note "Volltext aus einem Paket"
    Setzt ein Paket den Volltext eines Dokuments (z. B. das Paket **Texterkennung**), vermerkt die Historie „Volltext gesetzt“ mit dem Namen des Pakets, und die Texterkennung des DMS überschreibt diesen Text nicht.

### Rechte eines Pakets { #rechte-eines-pakets }

Vor der Installation zeigt die Vorschau unter **„Das Paket enthält Code.“** eine Liste der Rechte. Hinter jedem Punkt führt ein **?** zur passenden Stelle hier. **Unter der Liste** steht links der Haken **„Ich erlaube dem Paket diese Rechte.“** – lies erst die Liste, dann setze den Haken. Ohne ihn bleibt **Installieren** gesperrt. Bei einem **Update** mit geänderten Rechten heißt der Haken **„Die Rechte haben sich geändert. Ich erlaube sie.“**; sind die Rechte gleich geblieben, steht dort nur „Die Rechte sind dieselben wie bisher.“

Was nicht in der Liste steht, darf der Code nicht. Benutzer und Passwörter sieht ein Paket nie, und löschen darf es nichts.

#### Mappen lesen { #recht-mappen-lesen }

**„Mappen lesen: *Mappentypen*“** – Der Code darf Mappen dieser Mappentypen lesen, mit allen Feldern und Verweisen. **„alle Mappentypen“** heißt jede Mappe (außer Benutzern). Stammt ein Mappentyp aus einem anderen Paket, steht dessen Kennung in Klammern dahinter, z. B. „Organisation (basis)“; **Post**, **Ablageort** und **Rolle** bringt das DMS selbst mit.

#### Mappen anlegen und ändern { #recht-mappen-anlegen-und-andern }

**„Mappen anlegen und ändern: *Mappentypen*“** – Der Code darf Mappen dieser Mappentypen anlegen und ihre Felder ändern; lesen darf er sie damit auch. Löschen darf ein Paket nie. Jede Änderung steht in der Historie der Mappe mit dem Dienstkonto „Paket *Name*“.

#### Dokumente lesen oder Volltext schreiben { #recht-dokumente }

- **„Dokumente lesen“** – Der Code darf die Dokumente in den Mappen lesen, die er lesen darf: die Datei, den Volltext und die Seiten als Bild.
- **„Dokumente lesen und Volltext schreiben“** – zusätzlich darf er dort Dokumente hochladen und ersetzen und den Volltext setzen, etwa für eine eigene Texterkennung.

Steht keins von beiden in der Liste, sieht der Code keine Dokumente.

#### Vektoren zu Dokumenten { #recht-vektoren }

**„Vektoren zu Dokumenten speichern und ähnliche Dokumente finden (dms:vektoren)“** – Der Code darf zu Dokumenten, die er lesen darf, einen **Vektor** ablegen: eine Liste von Zahlen, die den Inhalt des Volltexts beschreibt. Das DMS vergleicht diese Vektoren und zeigt damit [ähnliche Dokumente](#aehnlichkeit) an der Mappe und in der Suche. Außerdem fragt die Suche das Paket nach dem Vektor des Suchbegriffs. Das DMS selbst rechnet dabei nichts – es speichert und vergleicht nur, was das Paket liefert. Dokumente, Mappen und Volltext ändern darf der Code mit diesem Recht nicht; ähnliche Dokumente sieht jeder nur aus Mappen, die er lesen darf.

#### Zugriff auf Netzwerk und Internet { #recht-netzwerk-und-internet }

- **„kein Zugriff auf Netzwerk und Internet“** – Der Code erreicht weder Geräte in deinem Heimnetz noch das Internet. Das ist der Normalfall: Die Daten bleiben im DMS.
- **„Zugriff auf Netzwerk/Internet nur zu: *Adressen*“** – Der Code darf nur diese Adressen erreichen (immer `https://`, auch Pfade darunter), z. B. einen Dienst im Internet oder ein Gerät in deinem Netzwerk. Alles andere sperrt der Paket-Läufer, auch Weiterleitungen. Wozu das Paket die Adressen braucht, erklärt sein README – was du dorthin schickst, verlässt dein DMS.

Will ein Update andere Adressen, fragt das DMS erneut.

- **„… zu: der Adresse aus der Einstellung „*Name*“ (trägst du ein und bestätigst sie)“** – Das Paket bringt keine feste Adresse mit, sondern fragt nach einer [Dienst-Adresse](#dienst-adresse), etwa der deines KI-Dienstes. Erst wenn du sie in den Einstellungen einträgst und bestätigst, erreicht der Code genau diese Adresse.

#### Fragen an die Ablage beantworten { #recht-antworten }

**„Fragen an die Ablage beantworten („Frag deine Ablage“) – nur aus Ausschnitten, die das DMS mitgibt (dms:antworten)“** – Mit diesem Recht erscheint in der Ablage das Feld [Frag deine Ablage](#frag-deine-ablage). Das Paket bekommt je Frage nur die Frage, den bisherigen Chat und wenige Ausschnitte, die das DMS selbst herausgesucht hat – **mit den Rechten des Fragenden**. Es liest dabei nichts selbst aus der Ablage (dafür bräuchte es die Rechte oben) und kann nichts ändern: Das DMS zeigt nur seinen Text und prüft die Quellen.

### Dienst-Adresse { #dienst-adresse }

Ein Paket wie **KI-Assistent** rechnet nicht selbst, sondern fragt einen Dienst, den du betreibst oder wählst – z. B. **Ollama** auf deinem Heimserver. Die Adresse dieses Dienstes trägst du in den **Einstellungen** des Pakets ein (Werkbank → Pakete → *Paket* → Reiter „Einstellungen“):

- **Nie voreingestellt.** Im leeren Feld steht höchstens ein Beispiel wie `http://ollama:11434/v1` – gespeichert ist nichts, bis du eine Adresse einträgst.
- **Bestätigen.** Beim Speichern einer neuen oder geänderten Adresse fragt das DMS **„Daten an diese Adresse schicken?“** und nennt sie. Erst mit **Adresse bestätigen und speichern** gilt sie; das Protokoll vermerkt „Dienst-Adresse von Paket … bestätigt“ mit der Adresse.
- **Nur dorthin.** Der Paket-Läufer erlaubt Netz nur zu dieser Adresse und Pfaden darunter (gleicher Rechner, gleicher Port), ohne Weiterleitungen. Weil Dienste im Heimnetz selten HTTPS sprechen, ist hier auch `http://` erlaubt. Zugangsdaten gehören nicht in die Adresse, sondern in ein eigenes Feld (Geheimnis).
- **Betrieb und Hosting dieses Dienstes liegen außerhalb des DMS.** Läuft er bei dir im eigenen Netz, verlassen die Daten das Haus nicht. Gehört er einem anderen Anbieter, ist das eine **Vertrauensbeziehung zu diesem Dienstleister** – wie beim Hosten des DMS selbst: Standort, Auftragsverarbeitung, Speicherung, Nutzung zum Training. Diese Entscheidung triffst du mit dem Eintragen und Bestätigen; das DMS hat dafür keinen weiteren Schalter. Den Hinweis zeigt es auch schon in der Vorschau vor der Installation.

### Frag deine Ablage { #frag-deine-ablage }

Ist ein Paket mit dem Recht [Fragen an die Ablage beantworten](#recht-antworten) installiert und geladen, steht auf der Startseite der Ablage das Feld **„Frag deine Ablage“** (siehe [Benutzerhandbuch](https://motom001.github.io/dms/benutzer/aktuell/startseite/#frag-deine-ablage)). So läuft eine Frage ab:

1. Der Browser schickt die Frage und den bisherigen Chat an das DMS.
2. Das DMS sucht **selbst** passende Stellen – im Volltext der Dokumente, in Titel und Feldern der Mappen und, wenn ein Paket mit [Vektoren](#recht-vektoren) da ist, nach Ähnlichkeit –, **nur in Mappen, die der Fragende lesen darf**. Passwortfelder und Benutzer sind nie dabei.
3. Es schneidet höchstens so viele **Ausschnitte** heraus, wie unten eingestellt, und gibt sie mit der Frage dem Paket – als **Daten gekennzeichnet**, mit dem Hinweis an den KI-Dienst, darin stehende Anweisungen nicht zu befolgen.
4. Das Paket fragt den Dienst unter der [Dienst-Adresse](#dienst-adresse) und gibt die Antwort Stück für Stück zurück.
5. Das DMS zeigt die Antwort als **Text** (nichts davon wird ausgeführt oder gespeichert) und darunter die genannten **Quellen** – nur Mappen aus den mitgegebenen Ausschnitten, noch einmal auf Lesbarkeit geprüft. Unter jeder Antwort steht aufklappbar **„An die KI geschickt: n Ausschnitte aus m Mappen“** mit genau diesen Stellen.

**Werkbank → Pakete → *Paket*** zeigt im Abschnitt **Frag deine Ablage** die **Höchstmenge je Frage**:

| Einstellung | Bereich | Standard |
|---|---|---|
| **Höchstens Ausschnitte je Frage** | 1 bis 20 | 8 |
| **Höchstens Zeichen je Frage** (alle Ausschnitte zusammen) | 500 bis 30 000 | 6 000 |

Ein einzelner Ausschnitt ist höchstens 1 500 Zeichen lang. Weniger heißt: weniger Daten an den Dienst und schnellere Antworten, aber eher „steht nicht in den Ausschnitten“.

**Kein Protokoll der Inhalte:** Den Chat hält nur der Browser (bis zum Neuladen); der Server speichert weder Fragen noch Ausschnitte noch Antworten. Das Protokoll des DMS vermerkt nur „Frage an die Ablage gestellt“ mit Anzahl der Ausschnitte und Dauer, die Werkbank beim Paket nur „Frage beantwortet“ mit der Länge der Antwort. Je Benutzer läuft eine Frage zur Zeit, im ganzen DMS höchstens vier.

### Ereignisse { #ereignisse }

Unter **„Reagiert auf diese Ereignisse:“** nennt die Vorschau, wann der Code von selbst läuft – je Ereignis eine Zeile mit **?**. Ohne Ereignisse läuft er nur, wenn du im Reiter **Einstellungen** eine Aktion auslöst. Ein Ereignis gibt dem Paket keine weiteren Rechte: Es erfährt nur, *dass* etwas passiert ist (z. B. die Kennung der neuen Post), und arbeitet dann mit den Rechten oben. Kommen in einem Update nur Ereignisse dazu, fragt das DMS deshalb nicht erneut. Was ein Paket selbst ändert, wird ihm nicht zurückgemeldet.

#### Neue Post ist angelegt { #ereignis-post-angelegt }

**Wann:** Sobald eine neue Post entsteht – mit **+ Post** in der Ablage, über die API, aus einem Eingangsordner oder Postfach und beim **Post teilen** für jede neue Post.

**Typisch:** Post prüfen, zuordnen oder zählen – das Beispielpaket **Hallo Post** etwa zählt neue Post.

#### Ein Dokument wurde hochgeladen { #ereignis-dokument-hochgeladen }

**Wann:** Bei jedem neuen Dokument – Hochladen in der Oberfläche oder über die API, aus Eingangsordner und Postfach, und für die neuen Dokumente beim **PDF teilen**, **Zusammenfügen**, **Post teilen** und **Schwärzen** (als Kopie). Eine neue Version eines vorhandenen Dokuments ist kein neues Dokument.

**Typisch:** Das Dokument ansehen und etwas daraus machen – das Paket **Trennblatt** teilt Post an Trennblättern, **Texterkennung** erkennt Text in Scans.

#### Die Texterkennung eines Dokuments ist fertig { #ereignis-texterkennung-fertig }

**Wann:** Wenn die eingebaute [Texterkennung](texterkennung.md) des DMS mit einem Dokument fertig ist – also der Volltext feststeht.

**Typisch:** Mit dem Volltext arbeiten, z. B. Felder vorschlagen oder Post anhand von Wörtern zuordnen.

#### Der Volltext eines Dokuments ist da { #ereignis-volltext-fertig }

**Wann:** Sobald der Volltext eines Dokuments feststeht – egal, woher er kommt: von der eingebauten Texterkennung, aus der Textebene eines PDFs, von einem Paket wie **Texterkennung** oder über die API. Für ein Paket mit dem Recht [Vektoren zu Dokumenten](#recht-vektoren) schickt das DMS dieses Ereignis außerdem für den **Bestand** nach (siehe [Ähnlichkeit](#aehnlichkeit)).

**Typisch:** Aus dem Volltext etwas berechnen – das Paket **KI lokal – Ähnlichkeit** rechnet daraus den Vektor des Dokuments.

#### Die Einstellungen des Pakets wurden geändert { #ereignis-einstellungen-geandert }

**Wann:** Wenn ein Administrator die [Einstellungen des Pakets](#einstellungen) speichert. Nur das Paket selbst bekommt dieses Ereignis.

**Typisch:** Die neuen Werte übernehmen, z. B. eine Verbindung neu prüfen oder den Status aktualisieren.

### Ähnlichkeit { #aehnlichkeit }

Ein Paket mit dem Recht [Vektoren zu Dokumenten](#recht-vektoren) – etwa **KI lokal – Ähnlichkeit** – rechnet zu jedem Dokument mit Volltext einen Vektor. Damit zeigt das DMS:

- an der Mappe unter den Dokumenten **„Ähnliche Dokumente“** aus anderen Mappen,
- in der Suche der [Startseite](https://motom001.github.io/dms/benutzer/aktuell/startseite/#schnell-finden) mit **„auch in Dokumenten“** zusätzlich **ähnliche Treffer** – Mappen ohne passendes Wort, deren Dokument dem Suchbegriff ähnlich ist, gekennzeichnet mit **„ähnlich“**.

Jeder sieht dabei nur Mappen, die er lesen darf. Den Vektor des Suchbegriffs liefert das Paket; antwortet es nicht innerhalb von 1,5 Sekunden, sucht das DMS wie bisher ohne Ähnlichkeit.

**Werkbank → Pakete → *Paket*** zeigt im Abschnitt **Ähnlichkeit**:

| Angabe | Bedeutung |
|---|---|
| **Modell** | womit das Paket rechnet (meldet das Paket selbst) |
| **Stand** | für wie viele Dokumente mit Volltext es schon einen Vektor gibt |
| **Zwischenspeicher** | wie viel Arbeitsspeicher die Vektoren im DMS belegen |
| **Ähnliche Treffer in der Suche zeigen** | Einstellung, Standard: an. Aus: Die Suche fragt das Paket nicht mehr; „Ähnliche Dokumente“ an der Mappe bleiben. |
| **Neu berechnen** | löscht alle Vektoren; das Paket rechnet sie im Hintergrund neu |

**Bestand und Modellwechsel:** Nach der Installation rechnet das Paket zuerst nur neue Dokumente. Den Bestand holt das DMS gedrosselt nach: Hat das Paket nichts mehr offen, bekommt es alle 30 Sekunden bis zu 50 Dokumente ohne Vektor (Ereignis [Volltext ist da](#ereignis-volltext-fertig)). Meldet das Paket nach einem Update ein **anderes Modell**, sind die alten Vektoren ungültig: Das DMS löscht sie und lässt sie auf dieselbe Weise neu berechnen. Bis dahin fehlen ähnliche Dokumente für die noch offenen Dokumente.

**Daten:** Vektoren sind abgeleitet. Sie stehen in der Datenbank (Tabelle `vektoren`), nicht im [Vollexport](export.md), und verschwinden mit ihrem Dokument. Nach einer Wiederherstellung rechnet das Paket sie neu.

**Speicher und Antwortzeit** (256 Zahlen je Vektor, gemessen auf einem Rechner mit 2 Kernen, PostgreSQL 16):

| Dokumente | Datenbank | Zwischenspeicher | erstes Laden | Ähnliche Dokumente | zum Vergleich: Kosinus in SQL |
|---|---|---|---|---|---|
| 10 000 | 12 MB | 4 MB | 0,4 s | 4 ms | 0,3 s |
| 100 000 | 118 MB | 33 MB | 3,2 s | 37 ms | 3,0 s |

Das DMS braucht dafür keine Datenbank-Erweiterung (wie pgvector, die im Image `postgres:17` fehlt). Es vergleicht im eigenen Arbeitsspeicher mit 8 Bit je Zahl; den Zwischenspeicher lädt es nach dem Start im Hintergrund – bis er da ist, sucht die Suche ohne Ähnlichkeit. Gemessen mit `server/test/vektoren-messen.ts`.

## Expertenmodus: weitere Kataloge und Hochladen

Für Paketentwickler und für ein DMS ohne Internetzugang gibt es unter **Werkbank → Pakete** direkt unter den Knöpfen den Abschnitt **Expertenmodus**. Er ist zugeklappt; ein Klick auf **▸ Expertenmodus** (oder Enter bzw. Leertaste) klappt ihn an Ort und Stelle auf. Ob er auf- oder zugeklappt ist, merkt sich dein Browser für dich – das ist nur Bequemlichkeit, kein Recht: Was dort steht, dürfen alle Administratoren.

![Werkbank → Pakete mit aufgeklapptem Expertenmodus](bilder/werkbank-pakete.png)

Im Expertenmodus kannst du:

- **Weitere Quellen** – Katalogadressen hinzufügen, abschalten und entfernen, höchstens 20. Erlaubt ist nur HTTPS, das Format ist dasselbe wie beim offiziellen Katalog (`katalog.json` der Registry). **Katalog abrufen** fragt neben dem offiziellen Katalog alle **eingeschalteten** weiteren Kataloge ab – egal, ob der Abschnitt gerade auf- oder zugeklappt ist; ihre Pakete tragen die Adresse als Kennzeichen. Willst du eine Quelle nicht mehr nutzen, schalte sie ab oder entferne sie. Ohne weitere Quellen gibt es nur den offiziellen Katalog.
- Ein **Paket als Datei hochladen** (`.zip` im Format der Registry, z. B. der Paketordner gepackt, höchstens 10 MB). Das DMS prüft es genauso wie ein Katalogpaket, nur ohne Prüfsumme aus dem Katalog, und zeigt die Vorschau. Eine [Sammeldatei](#pakete-ohne-internet-installieren) erkennt es selbst.

!!! warning "Nicht vom DMS-Projekt geprüft"
    Pakete aus einer anderen Quelle als dem offiziellen Katalog hat niemand vom DMS-Projekt angesehen. Vor der Installation zeigt das DMS deshalb deutlich die Herkunft, und du musst ausdrücklich bestätigen, dass du weißt, woher das Paket stammt.

Die Liste der installierten Pakete zeigt bei jedem die **Herkunft**: „offizieller Katalog“, die Katalogadresse oder „hochgeladen von … am …“. **Updates sucht das DMS nur in der Quelle, aus der das Paket stammt.** Ein hochgeladenes Paket aktualisierst du, indem du eine höhere Version hochlädst; dann gelten dieselben Regeln wie bei jedem Update (nur ergänzen). Ist die Quelle eines Pakets abgeschaltet oder entfernt, gibt es dafür keine Updates.

Das Protokoll vermerkt, wer welche Quelle hinzugefügt, abgeschaltet oder entfernt und wer welches Paket hochgeladen hat.

## Pakete ohne Internet installieren

Kommt dein DMS nicht ins Internet, holst du mehrere Pakete auf einmal als **Sammeldatei**:

1. Öffne an einem Gerät mit Internet die Seite **[Pakete ohne Internet](https://motom001.github.io/dms-registry/sammeldatei.html)** des Katalogs. Am schnellsten über **Werkbank → Pakete → Ohne Internet …** und den Link dort – dann ist die Version deines DMS schon eingetragen.
2. Kreuze die Pakete an. Die **DMS-Version** bestimmt, welche Paketversionen passen (Vorgabe: die neueste). **Abhängigkeiten** wie „Basis“ kommen automatisch mit und sind mit „kommt mit – gebraucht von …“ markiert. Die Texterkennung ist vorausgewählt.
3. **Sammeldatei herunterladen.** Die Seite holt die Pakete aus dem Katalog, prüft jedes gegen seine Prüfsumme und packt sie zusammen. Sie zeigt den **SHA-256** der fertigen Datei.
4. Bring die Datei zum DMS (USB-Stick, Netzlaufwerk) und lade sie unter **Werkbank → Pakete → Ohne Internet …** hoch – oder im [Einrichtungsassistenten](installation.md#pakete-dazuholen), wenn der Katalog dort nicht erreichbar ist. Ein einzelnes Paket oder eine Sammeldatei nimmt auch **Paket hochladen** im Expertenmodus an.
5. Das DMS zeigt den Inhalt: je Paket die Version und ob es **neu**, ein **Update**, **schon installiert** oder **älter als installiert** ist und ob es zur DMS-Version passt. Bestätige einmal, dass du weißt, woher die Datei stammt, dann installierst du **Paket für Paket**, Abhängigkeiten zuerst. Jedes zeigt seine Vorschau; Pakete mit Code installierst du erst, wenn du **ihre** Rechte bestätigt hast. Mit **Auslassen** überspringst du ein Paket.

### Wie das DMS einer Sammeldatei traut

Die Sammeldatei ist ein ZIP mit dem Verzeichnis `sammeldatei.json` (je Paket Id, Version, Größe und SHA-256), einer kurzen `LIESMICH.txt` und den Paket-Archiven aus dem Katalog, Byte für Byte unverändert. Das DMS nimmt sie **nur ganz oder gar nicht** an:

- Jedes Archiv muss genau die **Größe und Prüfsumme (SHA-256)** aus dem Verzeichnis haben. Hat das DMS den offiziellen Katalog in dieser Sitzung schon abgerufen, muss die Prüfsumme **auch zum Katalog** passen – sonst lehnt es die Datei ab.
- Es dürfen **keine anderen Dateien** darin liegen; Dateinamen mit `..` oder `/` am Anfang, verschlüsselte Einträge und doppelte Namen lehnt es ab.
- **Grenzen gegen ZIP-Bomben:** höchstens 64 MB je Datei, 50 Pakete, 10 MB je Paket-Archiv, entpackt 20 MB je Paket (plus 32 MB für Code) und 256 MB für alle Pakete zusammen. Das DMS entpackt nie mehr, als im Archiv angegeben ist.
- Jedes Paket durchläuft **dieselben Prüfungen wie ein einzeln hochgeladenes**; Id und Version im Paket müssen zum Verzeichnis passen. Ist eins ungültig, wird nichts übernommen.

Die Prüfsummen beweisen, dass die Datei vollständig und seit dem Zusammenstellen **unverändert** ist – nicht, **wer** sie zusammengestellt hat. Deshalb gilt sie wie ein hochgeladenes Paket als „nicht vom DMS-Projekt geprüft“: Du bestätigst die Herkunft, und die installierten Pakete tragen als Herkunft „hochgeladen von … am …“. Vergleiche bei Zweifel den SHA-256, den das DMS nach dem Hochladen zeigt, mit dem auf der Katalog-Seite. Updates dieser Pakete holst du mit einer neuen Sammeldatei; Pakete, die aus dem Katalog installiert sind, aktualisiert eine Sammeldatei nicht.

## Paket aus deinem DMS erstellen

Hast du dir eigene Mappentypen und Ansichten gebaut – etwa für Verträge mit Zahlungen –, nimmst du sie als Paket zu einer anderen Familie mit, ohne YAML von Hand zu schreiben. Unter **Werkbank → Pakete → Paket erstellen** führt dich ein Assistent in vier Schritten; unten stehen **Zurück**, **Weiter** und am Ende **Als .zip exportieren**.

1. **Auswählen** – Mappentypen und Ansichten mit Haken, oben eine Suche. Optional **Beispiel-Mappen**: Ohne Auswahl enthält das Paket keine einzige Mappe. Wählst du Mappen der gewählten Typen aus, kommen ihre Feldwerte als Beispiele mit – nimm nur Mappen mit erfundenen Daten, z. B. Demo-Mappen.
2. **Prüfen** – das DMS prüft automatisch und sagt, was es daraus macht:
    - **Aus einem Paket:** Ein Mappentyp oder eine Ansicht, die ein installiertes Paket mitgebracht hat (etwa „Organisation“ aus *Basis*), wird **nicht kopiert**, sondern als **Abhängigkeit** eingetragen, z. B. `basis: ">=1.1.0"` mit der hier installierten Version. Hast du so einen Typ hier nachträglich geändert, weist das DMS darauf hin: Deine Änderungen gehören nicht zu deinem Paket – lege dafür einen eigenen Typ an.
    - **Benutzer, Rolle, Ablageort:** Verweise darauf werden zu `dms:benutzer`, `dms:rolle`, `dms:ablageort` – die bringt jedes DMS mit.
    - **Nicht gewählt:** Verweist ein gewählter Typ (Feld, Verknüpfungsregister) oder eine Ansicht auf einen **eigenen** Typ, den du nicht gewählt hast, steht er unter „Nicht gewählt, aber gebraucht“ mit **Mit aufnehmen**. So lange geht der Export nicht. Eine Ansicht, deren Elternansicht fehlt, kommt auf die oberste Ebene.
    - **Was nicht ins Paket passt**, nennt die Prüfung als Hinweis: weitere Trefferlisten (nur die Standard-Trefferliste kommt mit), Berechtigungen, Archivmodus, Nummernkreise an Feldern, Bedingungen auf Anzahlen, Favoriten oder Fristen und alles, was auf bestimmte Mappen oder Benutzer dieses DMS zeigt.
3. **Angaben** – Name, Id (Kleinbuchstaben, Ziffern und `_`, wird aus dem Namen vorgeschlagen), Version (Vorschlag `1.0.0`), Beschreibung (ein, zwei Sätze, daraus wird auch die README), Autor und optional dein GitHub-Name, **Lizenz** aus der Liste der Registry (im Zweifel MIT; der volle Lizenztext kommt mit) und die nötige DMS-Version (Vorschlag: dieses DMS). Unter „Was ist neu“ steht, was ins CHANGELOG kommt.
4. **Exportieren** – vor dem Download prüft das DMS das fertige Archiv genauso wie beim Hochladen; erst dann gibt es die Datei `<id>-<version>.zip` (Format der Registry mit `manifest.yaml`, `inhalt/…`, README, CHANGELOG, LICENSE).

Im anderen DMS installierst du zuerst die Abhängigkeiten (z. B. *Basis* aus dem Katalog) und lädst die Datei dann unter **Expertenmodus → Paket hochladen** hoch.

**Nächste Version:** Das DMS merkt sich Id, Version, Autor, Lizenz und Auswahl jedes Exports. Beim nächsten Mal schlägt der Assistent dieselbe Id mit höherer Version vor (1.0.0 → 1.1.0); frühere Pakete holst du unter „Früher exportiert“ zurück. Lädt die andere Familie die höhere Version hoch, **aktualisiert** ihr DMS das Paket wie jedes Update: Es ergänzt neue Felder, Register und Ansichten und löscht nichts.

!!! note "Keine Daten im Paket"
    Ein Paket enthält nur den Aufbau – Mappentypen und Ansichten. Mappen, Dokumente, Notizen, Benutzer und Passwörter kommen nie mit; aus ausdrücklich gewählten Beispiel-Mappen nur Feldwerte ohne Passwörter. Paket erstellen dürfen nur Administratoren; das Protokoll vermerkt jeden Export.

## Eigene Pakete

Ein selbst erstelltes Paket kannst du auch in die Registry einreichen. Wie ein Paket aufgebaut ist und wie es in den Katalog kommt, steht im [Entwicklerhandbuch](https://motom001.github.io/dms/entwickler/aktuell/pakete/).
